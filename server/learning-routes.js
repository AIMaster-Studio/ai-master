'use strict';

// 学习闭环的 HTTP 路由：计划（plan）、讲解（explanation）、测验（quiz）、
// 通关（complete）、复习（review）、导出（export）。
//
// 为什么拆出来：server/index.js 已经陆续把 RAG / 记忆 / 能力与会话路由分了出去
// （rag-routes.js / memory-routes.js / agent-routes.js），只剩学习闭环还挤在主文件里。
// 本模块与它们保持同一形态：**只做 HTTP 接线** —— 读请求、调用领域规则与存储、发响应；
// 不自己建 store、不自己读环境变量、不自己判权限。
//
// 与 server/learning/domain.js 的分工（两者别混）：
//   - domain.js 是「学习规则」：路线校验、测验配额、判分、错题登记、限流。与 HTTP 无关，可脱离服务器单测。
//   - 本模块是「规则接到 HTTP 上」：解析参数、决定状态写入顺序、组装响应字段。
//   规则改动只该动 domain.js；接口形状改动只该动本文件。
//
// 行为约束：本次是**纯搬迁**，判定语义、状态写入顺序、响应字段与错误文案一字未改。
// 唯一的结构性变化是 `state` 成了模块内局部变量 —— 原实现里 POST /api/explanation 会先 save()
// 再重新从 store 读一份 state，`save` 必须跟着新 state 走，所以 save 在模块内按局部变量重建，
// 不能沿用调用方传进来的闭包（否则会把讲解结果写回旧 state，静默丢一次提交）。

const { randomUUID, randomInt } = require('node:crypto');
const { retrieveEvidence } = require('./grounding');
const { reviewExplanation } = require('./ai-review');

const DAY = 86400000;
const QUIZ_PASS_SCORE = 75;
const AI_REVIEW_IP_LIMIT = 20; // 同一客户端 IP 每分钟可发起的 AI 复评次数
const AI_REVIEW_DAILY_BUDGET = 5000; // 全服务每日 AI 复评总预算，超出后按限流处理，防止公网被刷量

// 本模块负责的接口名（与 server/index.js 的派发条件共用一份，避免两边各写一遍导致漂移）。
// 注意 'quiz' 与 'review' 同时有 GET 与 POST 两个方向，不能按请求方法拆成两个名字。
const LEARNING_ROUTE_NAMES = new Set(['plan', 'explanation', 'quiz', 'complete', 'review', 'export']);

const stamp = () => new Date().toISOString();

function clientIp(req) {
  // 代理环境下取 X-Forwarded-For 首段作为真实客户端 IP，其次退回 socket 地址。
  // 这里只用于限流分桶，不作为鉴权依据 —— 请求头可被调用方任意伪造。
  const forwarded = req.headers['x-forwarded-for'];
  const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
  return first || req.socket.remoteAddress || '';
}

const shuffled = input => {
  const result = [...input];
  for (let i = result.length - 1; i > 0; i--) { const j = randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
};

function shuffleQuestion(q) {
  const order = shuffled(q.options.map((_, i) => i));
  return { ...q, options: order.map(i => q.options[i]), answer: order.indexOf(q.answer) };
}

// 下发题目时剥离 answer 与 explanation —— 服务端模式不把标答交给前端。
const publicQuestion = ({ answer, explanation, ...q }) => q;

function csvCell(value) {
  let text = String(value ?? '');
  // 以 = + @ - 制表符/回车开头的单元格会被 Excel 当公式执行，前置单引号中和。
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function createLearningRoutes(options) {
  const { store, learning, core, catalog, recordMemory, rag, courseKbId, fetchImpl } = options;
  const {
    modules, questions, limited, moduleFor, progressFor, quizDay,
    reserveQuizAttempt, addAttempt, checkAnswers, gradeWithContext, recordWrongAnswers, reviewDelayDays
  } = learning;

  return async function handleLearning(ctx) {
    const { req, url, route, body, send, fail, user, res } = ctx;
    let state = ctx.state;
    const save = () => store.save(user.id, state);
    const isPost = req.method === 'POST';

    if (!isPost) {
      if (route === 'quiz') {
        limited('quiz:' + user.id, 60, 60000);
        const diagnostic = url.searchParams.get('mode') === 'diagnostic';
        const module = diagnostic ? null : moduleFor(state, url.searchParams.get('module'));
        const attemptsRemaining = !diagnostic && !state.progress[module.id]?.completedAt ? reserveQuizAttempt(state, module.id) : null;
        const selected = diagnostic ? catalog.modules.map(m => m.questions[0]) : module.questions;
        const list = shuffled(selected).map(shuffleQuestion);
        const quiz = { id: randomUUID(), moduleId: module?.id || null, mode: diagnostic ? 'diagnostic' : 'module', questions: list,
          revision: module ? progressFor(state, module.id).revision || null : null, planRevision: state.planRevision || null };
        await store.putQuiz(quiz.id, user.id, quiz);
        if (attemptsRemaining !== null) await save();
        return send({ quiz: { id: quiz.id, moduleId: quiz.moduleId, mode: quiz.mode, attemptsRemaining, questions: list.map(publicQuestion) } });
      }
      if (route === 'review') {
        const items = state.wrongAnswers.map(item => ({ ...item, question: publicQuestion(questions.get(item.questionId)), due: Date.parse(item.dueAt) <= Date.now() }));
        const dueModules = Object.entries(state.progress).filter(([, p]) => p.completedAt && Date.parse(p.dueAt) <= Date.now()).map(([id, p]) => ({ moduleId: id, title: modules.get(id)?.title, dueAt: p.dueAt }));
        return send({ items, dueModules });
      }
      if (route === 'export') {
        // 导出直接写原始响应（不是 JSON 信封），因此需要 res 本身，而不是 send。
        const csv = url.searchParams.get('format') === 'csv';
        const filename = csv ? 'ai-master-learning.csv' : 'ai-master-learning.json';
        res.writeHead(200, { 'Content-Type': csv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' });
        if (csv) {
          const rows = [['time', 'type', 'module', 'mode', 'score', 'passed', 'correct', 'total'], ...state.attempts.map(a => [a.at, a.type, a.moduleId, a.mode, a.score, a.passed ?? a.accepted, a.correct, a.total])];
          return res.end('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'));
        }
        return res.end(JSON.stringify({ schema: 'aimaster-learning/1', exportedAt: stamp(), user, state,
          notice: '本机实际操作记录；包含练习与测试操作，不代表真实用户研究或教育效果证明。', retention: '每个档案保留最近2000次交互。' }, null, 2));
      }
      return fail(404, '接口不存在。');
    }

    if (route === 'plan') {
      const goal = String(body.goal || '').trim();
      if (goal.length < 2 || goal.length > 500 || !['beginner', 'basic', 'experienced'].includes(body.level) || ![30, 45, 60, 90].includes(body.dailyMinutes)) fail(400, '请填写学习目标、基础和每天可用时间。');
      state.profile = { goal, level: body.level, dailyMinutes: body.dailyMinutes, deadline: String(body.deadline || '').slice(0, 32) };
      state.plan = core.createPlan({ ...state.profile, diagnostic: state.diagnostic }, catalog);
      state.planRevision = randomUUID();
      // A new plan invalidates unfinished evidence; completed tasks remain available.
      for (const p of Object.values(state.progress)) if (!p.completedAt) { p.explanation = null; p.quiz = null; p.revision = null; }
      addAttempt(state, { type: 'plan', goal, level: body.level, dailyMinutes: body.dailyMinutes }); await save();
      recordMemory(user.id, 'plan', { goal, level: body.level, dailyMinutes: body.dailyMinutes, modules: state.plan.modules });
      return send({ state });
    }
    if (route === 'explanation') {
      limited('expl-ip:' + clientIp(req), AI_REVIEW_IP_LIMIT, 60000);
      limited('expl-budget:' + quizDay(), AI_REVIEW_DAILY_BUDGET, 86400000);
      limited('explanation:' + user.id, 12, 60000);
      const module = moduleFor(state, body.moduleId);
      if (typeof body.text !== 'string' || body.text.length > 6000) fail(400, '讲解内容需为文本，最多 6000 字。');
      const revision = randomUUID();
      const p = progressFor(state, module.id);
      p.revision = revision; p.quiz = null; p.explanation = null;
      const planRevision = state.planRevision; await save();
      const local = core.screenExplanation(body.text, module);
      // 先取课程证据，再让模型基于证据判定 —— 复评从「凭记忆判断」变成「对着课程原文判断」，
      // 且模型必须回报引用了哪几条，引用号会在服务端复核。
      let grounding = { available: false, reason: '未建立课程知识库。', evidence: [], queries: [] };
      try {
        grounding = await retrieveEvidence({ rag, kbId: courseKbId(), module, studentText: body.text });
      } catch (error) {
        grounding = { available: false, reason: '证据检索失败：' + error.message, evidence: [], queries: [] };
      }
      const result = await reviewExplanation(body.text, module, local, await store.config(), { fetchImpl, evidence: grounding.evidence });
      result.grounding = {
        available: grounding.available, reason: grounding.reason || '', kbId: grounding.kbId || null,
        version: grounding.version || null, evidenceCount: grounding.evidence.length, queries: grounding.queries || []
      };
      // 复评期间可能已有新计划/新讲解写入，重新读一份 state 再判定，避免把过期结果覆盖上去。
      state = await store.state(user.id);
      if (state.planRevision !== planRevision || state.progress[module.id]?.revision !== revision) fail(409, '已有更新的讲解或计划，请查看最新结果。');
      state.progress[module.id].explanation = { ...result, text: body.text, at: stamp(), revision };
      addAttempt(state, { type: 'explanation', moduleId: module.id, revision, text: body.text, ...result }); await save();
      recordMemory(user.id, 'explain', {
        moduleId: module.id, revision, mode: result.mode, accepted: result.accepted === true,
        score: typeof result.score === 'number' ? result.score : null,
        grounded: result.grounded === true, evidenceIntegrity: result.evidenceIntegrity || '',
        citations: result.citations || [], evidenceCount: (result.evidence || []).length,
        checks: (result.checks || []).map(check => ({ label: check.label, pass: check.pass }))
      });
      return send({ result, state });
    }
    if (route === 'quiz') {
      const quiz = await store.quiz(String(body.attemptId || ''), user.id);
      if (!quiz) fail(404, '测验已过期，请重新开始。');
      if (quiz.result) fail(409, '这次测验已提交，请开始新一轮练习。');
      if (quiz.mode !== 'diagnostic') {
        moduleFor(state, quiz.moduleId);
        if (quiz.planRevision !== state.planRevision || quiz.revision !== (progressFor(state, quiz.moduleId).revision || null)) fail(409, '讲解或计划已更新，请重新开始测验。');
      }
      checkAnswers(quiz.questions, body.answers);
      const graded = gradeWithContext(quiz.questions, body.answers);
      const result = { ...graded, passed: graded.score >= QUIZ_PASS_SCORE };
      const at = stamp();
      if (quiz.mode === 'diagnostic') state.diagnostic = { ...result, at };
      else {
        const progress = progressFor(state, quiz.moduleId);
        progress.quiz = { ...result, at, revision: quiz.revision };
        if (progress.completedAt) {
          progress.reviewCount = (progress.reviewCount || 0) + 1;
          progress.correctStreak = result.passed ? (progress.correctStreak || 0) + 1 : 0;
          const days = reviewDelayDays(progress.correctStreak);
          progress.dueAt = new Date(Date.now() + days * DAY).toISOString();
        }
      }
      recordWrongAnswers(state, result, at);
      addAttempt(state, { type: 'quiz', moduleId: quiz.moduleId, mode: quiz.mode, ...result });
      await store.transaction(async () => { await save(); await store.putQuiz(quiz.id, user.id, { ...quiz, result }); });
      recordMemory(user.id, 'quiz', {
        moduleId: quiz.moduleId, mode: quiz.mode, score: result.score, passed: result.passed === true,
        correct: result.correct, total: result.total
      });
      return send({ result, state });
    }
    if (route === 'complete') {
      moduleFor(state, body.moduleId);
      const p = progressFor(state, body.moduleId);
      if (p.completedAt) return send({ state });
      if (!p.explanation?.accepted || !p.quiz?.passed || p.quiz.score < QUIZ_PASS_SCORE || p.quiz.revision !== p.revision || p.explanation.revision !== p.revision) fail(409, '需要当前讲解通过且配套测验达到 75%，才能通关。');
      p.completedAt = stamp(); p.dueAt = new Date(Date.now() + DAY).toISOString();
      addAttempt(state, { type: 'complete', moduleId: body.moduleId, mode: p.explanation.mode, passed: true }); await save();
      return send({ state });
    }
    if (route === 'review') {
      const wrong = state.wrongAnswers.find(w => w.questionId === body.questionId);
      const question = questions.get(body.questionId);
      if (!wrong || !question) fail(404, '错题记录不存在。');
      checkAnswers([question], { [question.id]: body.answer });
      const result = gradeWithContext([question], { [question.id]: body.answer });
      const correct = result.correct === 1;
      wrong.reviewCount++; wrong.resolved = correct;
      wrong.correctStreak = correct ? (wrong.correctStreak || 0) + 1 : 0;
      wrong.dueAt = new Date(Date.now() + reviewDelayDays(wrong.correctStreak) * DAY).toISOString();
      if (!correct) wrong.mistakes++;
      addAttempt(state, { type: 'review', moduleId: question.moduleId, ...result }); await save();
      recordMemory(user.id, 'review', { questionId: question.id, moduleId: question.moduleId, correct, reviewCount: wrong.reviewCount });
      return send({ result, state });
    }
    return fail(404, '接口不存在。');
  };
}

module.exports = { createLearningRoutes, LEARNING_ROUTE_NAMES, QUIZ_PASS_SCORE, shuffleQuestion };
