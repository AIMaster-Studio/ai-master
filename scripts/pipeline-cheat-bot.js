'use strict';
/**
 * 全流水线作弊 bot（对抗性审计 · 回应评委第三轮 #1）
 *
 * 在完全不知道 AI 知识的前提下，用"讲解模板 + 源码读标答"刷完整个通关流水线：
 *   1) 讲解门：套用能命中 7 项规则的模板（scripts/rule-abuse-bench.js 已验证 140/140）
 *   2) 测验门：作弊者读取题库源码里的 answer 字段，通过题目文本匹配答案
 *   3) 通关：POST /api/complete → 系统落库为"学习记录"
 * 全程记录耗时与落库证据。
 *
 * 说明与边界：
 * - 本机以 createApp(:memory:) 复现服务端协议；作弊者角色等价于静态公网版
 *   访问者（静态版把含标答的题库 JSON 直接下发到浏览器，见 learning-core.js 前端判分）。
 * - 服务端模式（server/index.js）不会把答案下发（publicCatalog 剥离 answer），
 *   因此"读标答"攻击在服务端模式下不成立；讲解语义闸门仍依赖 AI 复评上线。
 * - 本脚本为对抗性审计，定位与 rule-abuse-bench 相同：不是通关方法传播。
 */
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server/index.js');
const catalog = require('../frontend/data/learning-curriculum.json');

// ---- 讲解模板（命中 7 项规则；刻意避开每个模块的 misconceptions 词面） ----
function templateFor(module) {
  const terms = module.concepts.map(c => String(c.terms[0]));
  const conceptSent = terms.map(t => `在这个过程里，${t} 起到关键作用，它和前后步骤互相依赖。`).join('');
  return [
    '整个流程先接收输入，再经过中间处理，然后根据上下文逐步输出，从而形成完整结果。',
    conceptSent,
    '举一个具体任务来说明：在校园里，例如学生报名信息的整理，如果格式不统一，就可能出现漏读。',
    '以上只适用于已经定义清楚的场景，但是这不保证每次结果都正确，仍需对关键结论进行核验。'
  ].join('');
}

// ---- 数据库/答案匹配：作弊者以"已知题库源码"的方式作答（静态模式下题库即源码） ----
function cheatAnswers(quiz, wrong = false) {
  const answers = {};
  for (const served of quiz.questions) {
    const src = catalog.modules.flatMap(m => m.questions).find(q => q.id === served.id);
    if (!src) continue;
    const correctIdx = served.options.indexOf(src.options[src.answer]);
    answers[served.id] = wrong ? (correctIdx + 1) % served.options.length : correctIdx;
  }
  return answers;
}

(async () => {
  const moduleId = 'llm-basics';
  const t0 = Date.now();

  const app = createApp({ dbPath: ':memory:' });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = 'http://127.0.0.1:' + app.server.address().port;
  let cookie = '';
  const api = async (route, body) => {
    const res = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };

  const step = async (name, fn) => { const r = await fn(); if (r.status >= 400) throw new Error(name + ' -> ' + r.status); return r; };

  const stream = [];
  const planc = await api('/api/plan', { goal: 'RAG 知识库', level: 'basic', dailyMinutes: 45 });
  console.log('plan:', planc.status);
  const adv = await api('/api/explanation', { moduleId, text: templateFor(catalog.modules.find(m => m.id === moduleId)) });
  console.log('explanation(模板):', adv.status, 'accepted=', adv.data && adv.data.result.accepted);
  const qz = await api('/api/quiz?module=' + moduleId);
  console.log('quiz start:', qz.status, 'questions=', qz.data && qz.data.quiz.questions.length);
  const answers = cheatAnswers(qz.data.quiz);
  const submit = await api('/api/quiz', { attemptId: qz.data.quiz.id, answers });
  console.log('quiz submit(源码读标答):', submit.status, 'score=', submit.data && submit.data.result.score);
  const done = await api('/api/complete', { moduleId });
  console.log('complete:', done.status, 'completedAt=', done.data && done.data.state.progress[moduleId].completedAt);
  const state = await api('/api/state');
  const exportData = await api('/api/export');

  const elapsedMs = Date.now() - t0;
  const progress = state.data.state.progress[moduleId];
  const result = {
    title: '全流水线作弊 bot 复现',
    generatedAt: new Date().toISOString(),
    moduleId,
    elapsedMs,
    cheatedSteps: {
      explanation: { method: 'grammar 模板', passed: adv.data.result.accepted },
      quiz: { method: '读取题库源码 answer 字段并按文本匹配', score: submit.data.result.score },
      complete: { method: 'POST /api/complete', passed: !!progress.completedAt }
    },
    recordedEvidence: {
      completedAt: progress.completedAt,
      attemptsInExport: exportData.data.state.attempts.map(a => ({ type: a.type, at: a.at })),
      notice: state.data.state.plan ? '通关已写入 state,可被 /api/export 导出' : null
    },
    bounds: '服务端模式不下发答案(publicCatalog 剥离 answer),读标答攻击仅在静态版成立;讲解语义闸门依赖 AI 复评上线。'
  };
  fs.mkdirSync(path.join(__dirname, '..', 'docs', 'ican', 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'ican', 'evidence', 'pipeline-cheat-bot-results.json'), JSON.stringify(result, null, 2), 'utf8');

  console.log('\n== 结果 ==');
  console.log('耗时:', elapsedMs + 'ms');
  console.log('通关:', progress.completedAt);
  console.log('导出的记录:', result.recordedEvidence.attemptsInExport.length, '条');
  app.server.close();
})();