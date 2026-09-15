'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const { createApp } = require('../server');
const { createMemoryStore, SURFACES, L3_SLOTS } = require('../server/memory/store');

const HERMETIC_SECURITY = { allowRemote: false, allowedHosts: [], configToken: '' };
const explanation = '大模型先把输入文本转成 token，再根据上下文预测后续片段，通过反复预测组成回答。这样的训练让它学习语言模式，但不能保证内容符合真实世界。比如我请它查询学校今年的奖学金截止日期，它可能根据旧资料生成流畅的回答，甚至编造一个日期。因此我会找到学校官方网站的最新通知，核验日期和适用年级；如果没有可靠证据，就说明目前无法确定，避免把幻觉当成已经证实的事实。';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aimaster-mem-'));
}

test('L1 is append-only per surface and per day, and refuses unregistered surfaces', () => {
  const memory = createMemoryStore({ dataRoot: tempRoot() });
  memory.record('quiz', { moduleId: 'llm-basics', score: 100, passed: true }, Date.parse('2026-03-01T10:00:00Z'));
  memory.record('quiz', { moduleId: 'llm-basics', score: 50, passed: false }, Date.parse('2026-03-01T11:00:00Z'));
  memory.record('quiz', { moduleId: 'prompt-design', score: 75, passed: true }, Date.parse('2026-03-02T09:00:00Z'));

  assert.deepEqual(memory.l1Dates('quiz'), ['2026-03-01', '2026-03-02']);
  assert.equal(memory.l1('quiz').length, 3);
  assert.equal(memory.l1('quiz', { date: '2026-03-01' }).length, 2);
  assert.equal(memory.l1('quiz', { limit: 1 }).length, 1);

  const file = path.join(memory.root, 'trace', 'quiz', '2026-03-01.jsonl');
  const raw = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  assert.equal(raw.length, 2, '事件应逐行追加，不重写文件');
  assert.match(raw[0], /"score":100/);

  assert.throws(() => memory.record('nope', {}), /未登记的记忆面/);
  assert.throws(() => memory.record('quiz', null), /必须是对象/);
  assert.throws(() => memory.l1('nope'), /未登记的记忆面/);
});

test('L2 is a deterministic aggregation that states how many L1 events it rests on', () => {
  const memory = createMemoryStore({ dataRoot: tempRoot() });
  memory.record('explain', { moduleId: 'm', accepted: false, mode: 'ai', grounded: true, evidenceIntegrity: 'fabricated-reference', checks: [{ label: '具体应用', pass: false }, { label: '有效内容', pass: true }] });
  memory.record('explain', { moduleId: 'm', accepted: true, mode: 'ai', grounded: true, checks: [{ label: '具体应用', pass: true }] });
  memory.record('explain', { moduleId: 'm', accepted: false, mode: 'local', checks: [{ label: '具体应用', pass: false }] });

  const { facts, markdown } = memory.refreshL2('explain');
  assert.equal(facts.total, 3);
  assert.equal(facts.accepted, 1);
  assert.equal(facts.acceptedRate, 33);
  assert.equal(facts.modes.ai, 2);
  assert.equal(facts.modes.local, 1);
  assert.equal(facts.failedChecks['具体应用'], 2);
  assert.equal(facts.fabricated, 1);

  assert.match(markdown, /依据：3 条 L1 事件/);
  assert.match(markdown, /确定性聚合/);
  assert.match(markdown, /非模型摘要/);
  assert.match(markdown, /具体应用：2 次/);
  assert.match(markdown, /引用编号造假的 1 次/);
  assert.equal(memory.readL2('explain'), markdown, 'L2 应落盘为可读 markdown');
});

test('quiz L2 aggregates per module without inventing a capability verdict', () => {
  const memory = createMemoryStore({ dataRoot: tempRoot() });
  memory.record('quiz', { moduleId: 'a', score: 100, passed: true });
  memory.record('quiz', { moduleId: 'a', score: 50, passed: false });
  memory.record('quiz', { moduleId: 'b', score: 75, passed: true });
  const { facts } = memory.refreshL2('quiz');
  assert.equal(facts.byModule.a.attempts, 2);
  assert.equal(facts.byModule.a.passed, 1);
  assert.equal(facts.byModule.a.average, 75);
  assert.equal(facts.byModule.b.average, 75);
  assert.equal(facts.passRate, 67);
});

test('L3 synthesis names its contributing surfaces and lists weak modules honestly', () => {
  const memory = createMemoryStore({ dataRoot: tempRoot() });
  memory.record('plan', { goal: 'RAG 知识库', level: 'basic', dailyMinutes: 45 });
  memory.record('quiz', { moduleId: 'rag-retrieval', score: 50, passed: false });
  memory.record('quiz', { moduleId: 'rag-evaluation', score: 100, passed: true });
  memory.record('explain', { moduleId: 'rag-retrieval', accepted: false, mode: 'ai', checks: [{ label: '机制与因果', pass: false }] });

  const result = memory.synthesize();
  assert.equal(result.l3.profile.includes('rag-retrieval'), true);
  assert.equal(result.l3.profile.includes('rag-evaluation'), false, '已通过的模块不应出现在待加强列表');
  assert.match(result.l3.profile, /贡献来源面：L2\/plan、L2\/explain、L2\/quiz/);
  assert.match(result.l3.profile, /机制与因果：1 次/);
  assert.match(result.l3.profile, /不是能力评估结论/);
  assert.match(result.l3.recent, /窗口 7 天/);
  assert.match(result.l3.scope, /\| `quiz` \| 客观测验 \| 2 \| 有 \|/);
  assert.match(result.l3.scope, /不做语义归纳/);
  for (const slot of L3_SLOTS) assert.equal(memory.readL3(slot), result.l3[slot]);
  assert.throws(() => memory.readL3('nope'), /未知的 L3 槽位/);
});

test('absence is reported as "no data", never as a 0% score', () => {
  const memory = createMemoryStore({ dataRoot: tempRoot() });

  // 这条用例钉的是一个**服务端自己产出的错误陈述**（走查待办 3 的根因，见
  // docs/ican/walkthrough-2026-09-15.md）：curate 里 pct(0, 0) 原先返回 0，
  // 于是零事件的 L3 文件写着「讲解提交 0 次，通过率 0%」。
  // 它每个字都「如实」，但会被读成「学得不好」，而真实情况是「还没开始」——
  // 把没有数据表达成 0 分。修法是让比例在无基数时返回 null，渲染成「无数据」。
  for (const surface of Object.keys(SURFACES)) {
    const { facts, markdown } = memory.refreshL2(surface);
    assert.equal(facts.total, 0);
    const rateKeys = Object.keys(facts).filter(key => /Rate$/.test(key));
    for (const key of rateKeys) assert.equal(facts[key], null, surface + ' 的 ' + key + ' 在 0 次事件时应为 null（无数据），不能是 0');
    assert.doesNotMatch(markdown, /0%/, surface + ' 的空面仍把无数据渲染成 0%');
    if (rateKeys.length) assert.match(markdown, /无数据/, surface + ' 的空面未说明比例是「无数据」');
  }

  const empty = memory.synthesize();
  assert.doesNotMatch(empty.l3.profile, /通过率 0%/, '零事件的 L3 仍写着「通过率 0%」');
  assert.match(empty.l3.profile, /通过率 无数据/);
  assert.match(empty.l3.profile, /贡献来源面：无/, '零事件时「贡献来源面」应显式写「无」，不能留下悬空的冒号');

  // 反向断言：有事件但全未通过时，0% 是**真实比例**，必须照常显示。
  // 它与「无数据」不是一回事，这条修法不能把两者压成同一句话。
  memory.record('quiz', { moduleId: 'a', score: 0, passed: false });
  const attempted = memory.refreshL2('quiz');
  assert.equal(attempted.facts.total, 1);
  assert.equal(attempted.facts.passRate, 0, '有事件时 0% 是真实比例，不应被改成 null');
  assert.match(attempted.markdown, /通过率 0%/);
  assert.doesNotMatch(attempted.markdown, /无数据/, '有事件时不应再出现「无数据」');
});

test('preferences are written explicitly only and survive re-synthesis', () => {
  const memory = createMemoryStore({ dataRoot: tempRoot() });
  assert.equal(memory.readL3('preferences'), null);
  memory.writePreference('讲解时希望多给一个反例。');
  const first = memory.readL3('preferences');
  assert.match(first, /只由显式写入产生/);
  assert.match(first, /多给一个反例/);

  memory.record('quiz', { moduleId: 'a', score: 100, passed: true });
  memory.synthesize();
  const after = memory.readL3('preferences');
  assert.equal(after, first, 'synthesize 不得覆盖显式偏好');
  assert.throws(() => memory.writePreference('   '), /不能为空/);
});

test('memory graph links L3 conclusions back to their evidence volume', () => {
  const memory = createMemoryStore({ dataRoot: tempRoot() });
  memory.record('quiz', { moduleId: 'a', score: 100, passed: true });
  memory.record('review', { questionId: 'q1', correct: true });
  const graph = memory.graph();
  const root = graph.nodes.find(node => node.id === 'L3');
  assert.equal(root.events, 2);
  assert.deepEqual(root.slots, L3_SLOTS);
  assert.equal(graph.edges.length, 2, '只有有事件的面才连边');
  assert.ok(graph.edges.every(edge => edge.weight > 0));
  assert.ok(graph.nodes.some(node => node.id === 'L2/explain' && node.events === 0));
});

test('inspect exposes every registered surface and states the generation mode', () => {
  const memory = createMemoryStore({ dataRoot: tempRoot() });
  memory.record('quiz', { moduleId: 'a', score: 100, passed: true });
  const view = memory.inspect();
  assert.equal(view.mode, 'deterministic');
  assert.match(view.notice, /不含模型语义归纳/);
  assert.match(view.notice, /不跨设备同步/);
  assert.equal(view.surfaces.length, Object.keys(SURFACES).length);
  assert.equal(view.l1Total, 1);
  assert.equal(view.surfaces.find(item => item.surface === 'quiz').l2 !== null, true);
  assert.equal(view.l3.length, L3_SLOTS.length);
});

test('clearing a single surface leaves other surfaces intact', () => {
  const memory = createMemoryStore({ dataRoot: tempRoot() });
  memory.record('quiz', { moduleId: 'a', score: 100, passed: true });
  memory.record('explain', { moduleId: 'a', accepted: true, mode: 'ai' });
  memory.clear('quiz');
  assert.equal(memory.l1('quiz').length, 0);
  assert.equal(memory.readL2('quiz'), null);
  assert.equal(memory.l1('explain').length, 1, '其他面不受影响');
  memory.clear();
  assert.equal(memory.l1('explain').length, 0);
});

async function start(t, options = {}) {
  const app = createApp({ dbPath: ':memory:', ragDataRoot: tempRoot(), memoryDataRoot: tempRoot(), ...HERMETIC_SECURITY, ...options });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = 'http://127.0.0.1:' + app.server.address().port;
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  let cookie = '';
  return async (route, body) => {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json', Origin: base } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual'
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data };
  };
}

test('learning activity flows into memory without the learner asking, and memory never blocks learning', async t => {
  const request = await start(t);
  assert.equal((await request('/api/memory/inspect')).data.memory.l1Total, 0);

  await request('/api/plan', { goal: 'RAG 知识库', level: 'basic', dailyMinutes: 45 });
  await request('/api/explanation', { moduleId: 'llm-basics', text: explanation });
  const quiz = (await request('/api/quiz?module=llm-basics')).data.quiz;
  const answers = Object.fromEntries(quiz.questions.map(q => {
    const source = require('../frontend/data/learning-curriculum.json').modules.flatMap(m => m.questions).find(item => item.id === q.id);
    return [q.id, q.options.indexOf(source.options[source.answer])];
  }));
  await request('/api/quiz', { attemptId: quiz.id, answers });

  const inspect = await request('/api/memory/inspect');
  assert.equal(inspect.status, 200);
  assert.equal(inspect.data.memory.l1Total, 3, '计划、讲解、测验都应留下轨迹');
  const quizSurface = inspect.data.memory.surfaces.find(item => item.surface === 'quiz');
  assert.equal(quizSurface.facts.passed, 1);
  assert.match(quizSurface.l2, /通过 1 次/);

  const l1 = await request('/api/memory/l1?surface=explain');
  assert.equal(l1.data.events.length, 1);
  assert.equal(l1.data.events[0].moduleId, 'llm-basics');
  assert.equal(l1.data.events[0].accepted, true);

  assert.equal((await request('/api/memory/l1')).status, 400, '缺少 surface 应报错');
  // 原先这里钉的是 500。那是错的：surface 名字写错是调用方的事，提示「服务暂时出错，请重试」
  // 会让用户一直重试一个永远好不了的请求。现在返回 400 并列出可用的面。
  const badSurface = await request('/api/memory/l2?surface=nope');
  assert.equal(badSurface.status, 400, '未知的记忆面是调用方参数错误，不是服务端故障');
  assert.match(badSurface.data.error, /未登记的记忆面/);

  const synthesized = await request('/api/memory/synthesize', {});
  assert.equal(synthesized.status, 200);
  assert.match(synthesized.data.l3.profile, /讲解提交 1 次/);

  const pref = await request('/api/memory/preference', { text: '希望先给结论再给推导。' });
  assert.equal(pref.status, 200);
  assert.match(pref.data.preferences, /先给结论/);
});

test('memory is isolated per learner and clearing it is admin-gated', async t => {
  const request = await start(t);
  await request('/api/plan', { goal: 'RAG', level: 'basic', dailyMinutes: 30 });
  assert.equal((await request('/api/memory/inspect')).data.memory.l1Total, 1);

  const other = await start(t);
  assert.equal((await other('/api/memory/inspect')).data.memory.l1Total, 0, '另一位学习者不应看到别人的轨迹');

  const exposed = await start(t, { allowRemote: true, configToken: 'secret' });
  assert.equal((await exposed('/api/memory/clear', {})).status, 403, '暴露模式下清空记忆需要令牌');
});
