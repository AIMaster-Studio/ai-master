'use strict';

/**
 * 小白访站走查（启发式走查，10 轮）。
 *
 * ⚠️ 这不是用户研究，也不能当作用户研究。它是**由我扮演的脚本化走查**：
 *    每个「小白」由我设定，路径由我编写，观察由我记录。
 *    真实的用户会做我没预想到的事，而这份走查永远做不到这一点。
 *    它能回答的问题只有一个：**一个没读过 README 的人，按最自然的路径走，会撞到什么。**
 *    它不能回答：真实用户会不会满意、会不会留下、学到了什么。
 *
 * 做法：每轮开一个**全新会话**（无 cookie = 完全遗忘记忆），走一条不同的自然路径，
 * 记录每一步实际拿到什么（HTTP 状态 + 关键响应字段 + 页面文案），
 * 走查结束后再带着原 cookie 回来，验证「记忆恢复」。
 *
 * 运行：node scripts/walkthrough_newbie.js
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = process.env.AIMASTER_BASE || 'http://127.0.0.1:8788';

function makeClient() {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    set cookie(value) { cookie = value; },
    async call(route, body) {
      const response = await fetch(BASE + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json', Origin: BASE } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const text = await response.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: response.status, data };
    }
  };
}

const EXPLANATION_OK = '大模型先把输入文本转成 token，再根据上下文预测后续片段，通过反复预测组成回答。这样的训练让它学习语言模式，但不能保证内容符合真实世界。比如我请它查询学校今年的奖学金截止日期，它可能根据旧资料生成流畅的回答，甚至编造一个日期。因此我会找到学校官方网站的最新通知，核验日期和适用年级；如果没有可靠证据，就说明目前无法确定，避免把幻觉当成已经证实的事实。';

// 10 条「一个没读过文档的人最可能走的路」。每条都要能自然发生，不能是我硬凑的。
const ROUNDS = [
  { id: 1, persona: '直接打开首页，随便点点', steps: ['state', 'status', 'catalog'] },
  { id: 2, persona: '先想知道要学什么，去看课程列表', steps: ['catalog', 'status'] },
  { id: 3, persona: '不想听讲，直接想做题', steps: ['quiz?module=llm-basics'] },
  { id: 4, persona: '想跳到看起来最有趣的一章（最后一章）', steps: ['quiz?module=agent-safety'] },
  { id: 5, persona: '看到侧栏「学习记忆」，点进去看', steps: ['memory/inspect', 'memory/l3?slot=profile'] },
  { id: 6, persona: '看到侧栏「知识库」，点进去看', steps: ['rag/status', 'rag/kbs', 'rag/search'] },
  { id: 7, persona: '看到侧栏「深度研究」，点进去试一下', steps: ['agent/capabilities', 'agent/tools'] },
  { id: 8, persona: '先建计划，再写一段很短的讲解试试', steps: ['plan', 'explanation-short'] },
  { id: 9, persona: '写一段跟课程完全无关的讲解', steps: ['plan', 'explanation-offtopic'] },
  { id: 10, persona: '建了计划、做完一节，然后关掉浏览器明天再来', steps: ['plan', 'explanation-ok', 'quiz', 'quiz-submit'] }
];

async function runRound(round) {
  const client = makeClient();
  const observations = [];

  for (const step of round.steps) {
    if (step === 'plan') {
      const r = await client.call('/api/plan', { goal: 'RAG 知识库', level: 'basic', dailyMinutes: 45 });
      observations.push({ step: '建学习计划', status: r.status, note: r.data && r.data.state ? '已生成航线 ' + (r.data.state.plan.modules || []).length + ' 个模块' : JSON.stringify(r.data).slice(0, 120) });
    } else if (step === 'explanation-short') {
      const r = await client.call('/api/explanation', { moduleId: 'llm-basics', text: 'token 就是最小的语义单位，模型靠它理解语言。' });
      const result = (r.data && r.data.result) || {};
      observations.push({ step: '提交很短的讲解', status: r.status, note: 'mode=' + result.mode + ' accepted=' + result.accepted + ' 反馈=' + String(result.feedback || '').slice(0, 90) });
    } else if (step === 'explanation-offtopic') {
      const r = await client.call('/api/explanation', { moduleId: 'llm-basics', text: '今天学校安排了运动会。每个班级都准备了不同的队服，大家提前来到操场布置场地。因为天气比较炎热，老师为同学准备了饮水休息区。例如参加长跑的同学可以在赛前检查身体状况，但是有伤病时不应勉强参赛。大家互相照顾，按照规则完成比赛，并且在结束后整理好自己的物品。' });
      const result = (r.data && r.data.result) || {};
      observations.push({ step: '提交跑题讲解', status: r.status, note: 'mode=' + result.mode + ' accepted=' + result.accepted + ' 反馈=' + String(result.feedback || '').slice(0, 90) });
    } else if (step === 'explanation-ok') {
      const r = await client.call('/api/explanation', { moduleId: 'llm-basics', text: EXPLANATION_OK });
      const result = (r.data && r.data.result) || {};
      observations.push({ step: '提交完整讲解', status: r.status, note: 'mode=' + result.mode + ' accepted=' + result.accepted + ' 证据=' + ((result.grounding || {}).evidenceCount || 0) + ' 条' });
    } else if (step === 'quiz') {
      const r = await client.call('/api/quiz?module=llm-basics');
      const quiz = (r.data && r.data.quiz) || {};
      observations.push({ step: '开始测验', status: r.status, note: '拿到 ' + ((quiz.questions || []).length) + ' 题，剩余次数=' + quiz.attemptsRemaining });
      client.quiz = quiz;
    } else if (step === 'quiz-submit') {
      const quiz = client.quiz || {};
      if (!quiz.questions) { observations.push({ step: '提交测验', status: 0, note: '前置：没拿到题目' }); continue; }
      const answers = {};
      for (const q of quiz.questions) answers[q.id] = 0;
      const r = await client.call('/api/quiz', { attemptId: quiz.id, answers });
      const result = (r.data && r.data.result) || {};
      observations.push({ step: '提交测验（全选 A）', status: r.status, note: '得分=' + result.score + ' passed=' + result.passed });
    } else {
      const r = await client.call('/api/' + step);
      let note = '';
      if (step === 'state') note = 'plan=' + Boolean((r.data.state || {}).plan) + ' attempts=' + ((r.data.state || {}).attempts || []).length + ' 用户=' + ((r.data.user || {}).name || '');
      else if (step === 'status') note = 'AI 已配置=' + Boolean((r.data.ai || {}).configured);
      else if (step === 'catalog') note = '模块数=' + ((r.data.modules || []).length);
      else if (step.startsWith('quiz')) note = r.data && r.data.error ? r.data.error : '拿到题目';
      else if (step === 'memory/inspect') note = 'L1 事件=' + ((r.data.memory || {}).l1Total) + ' 记忆面=' + (((r.data.memory || {}).surfaces) || []).length;
      else if (step.startsWith('memory/l3')) note = 'profile 内容=' + (r.data.markdown === null ? '（未生成）' : '有');
      else if (step === 'rag/status') note = '引擎=' + (((r.data.rag || {}).engines) || []).map(e => e.id + ':' + e.status).join(' ') + ' | 课程库=' + (r.data.courseKbId ? '有' : '无');
      else if (step === 'rag/kbs') note = '知识库数=' + ((r.data.kbs || []).length);
      else if (step === 'rag/search') note = r.data && r.data.error ? r.data.error : '（应报错：缺 kbId）';
      else if (step === 'agent/capabilities') note = '模型就绪=' + r.data.modelReady + ' 能力=' + ((r.data.capabilities || []).map(c => c.id + ':' + c.status).join(' '));
      else if (step === 'agent/tools') note = '工具=' + ((r.data.tools || []).map(t => t.name).join(', '));
      observations.push({ step, status: r.status, note });
    }
  }

  return { ...round, observations, cookie: client.cookie };
}

async function main() {
  console.log('走查目标：' + BASE + '（每轮全新会话 = 完全遗忘记忆）\n');
  const results = [];
  for (const round of ROUNDS) {
    const result = await runRound(round);
    results.push(result);
    console.log('=== 第 ' + round.id + ' 轮 · ' + round.persona + ' ===');
    for (const o of result.observations) {
      console.log('  [' + o.status + '] ' + o.step + ' → ' + o.note);
    }
    console.log();
  }

  // 「恢复记忆」：带着最后一轮的 cookie 回来，看记录还在不在。
  const returning = makeClient();
  returning.cookie = results[results.length - 1].cookie;
  const back = await returning.call('/api/state');
  console.log('=== 恢复记忆验证（带原 cookie 返回）===');
  console.log('  plan 仍在：' + Boolean((back.data.state || {}).plan));
  console.log('  历史交互数：' + ((back.data.state || {}).attempts || []).length);
  console.log('  用户名：' + ((back.data.user || {}).name || '(空)'));

  const outFile = path.join(__dirname, 'walkthrough_newbie.results.json');
  fs.writeFileSync(outFile, JSON.stringify({ ranAt: new Date().toISOString(), base: BASE, rounds: results,
    memoryRestored: { plan: Boolean((back.data.state || {}).plan), attempts: ((back.data.state || {}).attempts || []).length } }, null, 2));
  console.log('\n原始结果已写入 ' + path.relative(path.resolve(__dirname, '..'), outFile));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
