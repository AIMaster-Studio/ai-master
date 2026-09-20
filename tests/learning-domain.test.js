'use strict';

// 学习闭环领域规则的直接测试。
//
// 这些用例的价值在于**不需要起 HTTP 服务**：路线校验、配额、判分、错题登记
// 都是纯 state 变换，抽成模块后可以直接喂 state 进去验。
// 在此之前要验「没通关的模块不能跳着做」，必须走完登录 → 建计划 → 提交讲解 → 测验，
// 成本高到实际上没人会为边界条件单独写一条。

const test = require('node:test');
const assert = require('node:assert/strict');

const { createLearningDomain, reviewDelayDays } = require('../server/learning/domain');
const core = require('../frontend/static/js/learning-core');
const catalog = require('../server/data/learning-curriculum.json');

// 与 server/index.js 的 fail 同构：抛一个带 status 的 Error。
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
let counter = 0;
const randomUUID = () => 'uuid-' + (++counter);
const stamp = () => '2026-09-15T00:00:00.000Z';

function domain(options = {}) {
  return createLearningDomain({ core, catalog, fail, randomUUID, stamp, ...options });
}
function emptyState() {
  return { profile: null, plan: null, progress: {}, attempts: [], wrongAnswers: [], diagnostic: null };
}
function planOf(...ids) {
  return { modules: ids };
}
function completed(state, id) {
  state.progress[id] = { explanation: null, quiz: null, completedAt: '2026-09-01T00:00:00.000Z', dueAt: null, reviewCount: 0 };
}

test('moduleFor enforces route order and refuses unknown or unplanned modules', () => {
  const d = domain();
  const state = emptyState();
  state.plan = planOf('llm-basics', 'transformer', 'rag-retrieval');

  assert.equal(d.moduleFor(state, 'llm-basics').id, 'llm-basics', '路线第一个应可做');
  assert.throws(() => d.moduleFor(state, 'nope'), e => e.status === 404);
  assert.throws(() => d.moduleFor(state, 'rag-evaluation'), e => e.status === 409 && /学习计划/.test(e.message));

  // 前面的没完成，后面的不能跳着做。
  assert.throws(() => d.moduleFor(state, 'transformer'), e => e.status === 409 && /前面的任务/.test(e.message));

  // 完成第一个后，第二个解锁。
  completed(state, 'llm-basics');
  assert.equal(d.moduleFor(state, 'transformer').id, 'transformer');

  // 已通关的模块随时可重做，即使它不在当前路线里。
  const other = emptyState();
  other.plan = planOf('prompt-design');
  completed(other, 'llm-basics');
  assert.equal(d.moduleFor(other, 'llm-basics').id, 'llm-basics');
});

test('reserveQuizAttempt caps the daily quota per module and drops stale days', () => {
  const d = domain({ dailyQuizLimit: 3 });
  const state = emptyState();
  state.quizAttempts = { '2000-01-01': { 'llm-basics': 9 } };

  assert.equal(d.reserveQuizAttempt(state, 'llm-basics'), 2);
  assert.equal(d.reserveQuizAttempt(state, 'llm-basics'), 1);
  assert.equal(d.reserveQuizAttempt(state, 'llm-basics'), 0);
  assert.throws(() => d.reserveQuizAttempt(state, 'llm-basics'), e => e.status === 429 && /最多 3 次/.test(e.message));

  // 配额按模块独立计算。
  assert.equal(d.reserveQuizAttempt(state, 'prompt-design'), 2);

  // 非当天的计数应被清掉，避免 state 里堆积历史日期。
  const day = d.quizDay();
  assert.deepEqual(Object.keys(state.quizAttempts), [day]);
});

test('checkAnswers rejects missing, out-of-range and non-integer answers', () => {
  const d = domain();
  const list = [{ id: 'q1', options: ['a', 'b', 'c'] }, { id: 'q2', options: ['a', 'b'] }];
  assert.doesNotThrow(() => d.checkAnswers(list, { q1: 0, q2: 1 }));
  for (const bad of [{ q1: 0 }, { q1: 0, q2: 5 }, { q1: -1, q2: 0 }, { q1: '0', q2: 0 }, { q1: 1.5, q2: 0 }, [], null, 'x']) {
    assert.throws(() => d.checkAnswers(list, bad), e => e.status === 400, JSON.stringify(bad));
  }
  // 漏答不能被当成答错静默计分。
  assert.throws(() => d.checkAnswers(list, {}), e => e.status === 400);
});

test('gradeWithContext delegates scoring to the server-side answer key and adds display context', () => {
  const d = domain();
  const list = catalog.modules[0].questions.map(q => ({ ...q }));
  const answers = Object.fromEntries(list.map(q => [q.id, q.answer]));
  const result = d.gradeWithContext(list, answers);
  assert.equal(result.score, 100);
  assert.equal(result.passed, true);
  assert.equal(result.items.length, list.length);
  for (const item of result.items) {
    assert.ok(item.prompt.length > 0);
    assert.ok(Array.isArray(item.options));
    assert.equal(item.selectedText, item.options[item.answer], '答对时选中文本应等于正确选项文本');
    assert.ok(item.answerText.length > 0);
  }
  // 答错时 selectedText 指向所选、answerText 指向标答。
  const wrong = d.gradeWithContext(list, Object.fromEntries(list.map(q => [q.id, (q.answer + 1) % q.options.length])));
  assert.equal(wrong.score, 0);
  assert.notEqual(wrong.items[0].selectedText, wrong.items[0].answerText);
});

test('recordWrongAnswers creates then accumulates, and a repeat resets the streak', () => {
  const d = domain();
  const state = emptyState();
  const question = catalog.modules[0].questions[0];
  const wrongItem = { id: question.id, correct: false };
  const rightItem = { id: catalog.modules[0].questions[1].id, correct: true };

  d.recordWrongAnswers(state, { items: [wrongItem, rightItem] }, '2026-09-01T00:00:00.000Z');
  assert.equal(state.wrongAnswers.length, 1, '答对的题不应进错题本');
  assert.equal(state.wrongAnswers[0].mistakes, 1);
  assert.equal(state.wrongAnswers[0].moduleId, 'llm-basics');
  assert.equal(state.wrongAnswers[0].resolved, false);

  state.wrongAnswers[0].correctStreak = 3;
  state.wrongAnswers[0].resolved = true;
  d.recordWrongAnswers(state, { items: [wrongItem] }, '2026-09-02T00:00:00.000Z');
  assert.equal(state.wrongAnswers.length, 1, '同一题不应重复入本');
  assert.equal(state.wrongAnswers[0].mistakes, 2);
  assert.equal(state.wrongAnswers[0].correctStreak, 0, '再错一次应把连续答对清零');
  assert.equal(state.wrongAnswers[0].resolved, false);
  assert.equal(state.wrongAnswers[0].dueAt, '2026-09-02T00:00:00.000Z');
});

test('addAttempt records interactions and caps retention', () => {
  const d = domain({ maxAttempts: 3 });
  const state = emptyState();
  for (let i = 0; i < 5; i++) d.addAttempt(state, { type: 'quiz', score: i });
  assert.equal(state.attempts.length, 3, '超出上限时应只保留最近若干次');
  assert.deepEqual(state.attempts.map(a => a.score), [2, 3, 4]);
  assert.equal(state.attempts[0].id, 'uuid-3');
  assert.equal(state.attempts[0].at, stamp());
});

test('reviewDelayDays follows the spaced schedule and clamps at both ends', () => {
  assert.equal(reviewDelayDays(1), 1);
  assert.equal(reviewDelayDays(2), 3);
  assert.equal(reviewDelayDays(3), 7);
  assert.equal(reviewDelayDays(4), 14);
  assert.equal(reviewDelayDays(5), 30);
  assert.equal(reviewDelayDays(99), 30, '超出表长后停在最后一档，不无限延长');
  assert.equal(reviewDelayDays(0), 1);
  assert.equal(reviewDelayDays(undefined), 1);
  assert.equal(reviewDelayDays(-5), 1);
});

test('limited raises 429 once the window budget is exhausted', () => {
  const d = domain();
  d.limited('k', 2, 60000);
  d.limited('k', 2, 60000);
  assert.throws(() => d.limited('k', 2, 60000), e => e.status === 429);
  // 不同 key 互不影响
  assert.doesNotThrow(() => d.limited('other', 1, 60000));
});

test('the domain refuses to be built without its dependencies', () => {
  assert.throws(() => createLearningDomain({}), /需要 core、catalog 与 fail/);
  assert.throws(() => createLearningDomain({ core, catalog }), /需要 core、catalog 与 fail/);
});

test('progressFor initialises a fresh record and returns the existing one', () => {
  const d = domain();
  const state = emptyState();
  const first = d.progressFor(state, 'llm-basics');
  assert.deepEqual(first, { explanation: null, quiz: null, completedAt: null, dueAt: null, reviewCount: 0 });
  first.reviewCount = 7;
  assert.equal(d.progressFor(state, 'llm-basics').reviewCount, 7, '已存在的记录不应被重置');
});
