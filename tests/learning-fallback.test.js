'use strict';

// P0-1 回归测试 —— 静态 fallback 的路由契约。
//
// 这里钉住两类曾经真实存在的退化：
//
//   ① 参数约定错位。LearningLocalAPI.handle(path, body) 实际转发 handler(body, path)，
//      而 quiz 当时按 (query, body) 声明。于是静态模式下「开始测验」：
//        · GET  → query 是 undefined，且 body 是路径字符串（真值）会误入提交分支
//                 → 抛 "Cannot read properties of undefined (reading 'match')"
//        · POST → query 变成提交对象 → 抛 "query.match is not a function"
//      其余 handler 都按 (body[, path]) 声明，所以 quiz 是唯一的异类。
//
//   ② 路由键只取首段。'ai/config'、'auth/login' 这类嵌套路由永远不可达，
//      canHandle() 返回 false，静态模式直接落到网络失败分支。
//
// 全部在 node:vm 沙箱内执行：不联网、不需要浏览器、不读 API key。
// 不使用 Date.now() 精确值断言（quiz id 含时间戳）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE_PATH = path.resolve(__dirname, '../frontend/static/js/learning-local-fallback.js');
const MODULE_SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

const UNSUPPORTED = /本地模式不支持此操作/;

// 沙箱里创建的对象/数组属于另一个 realm，原型与测试进程不同，
// 直接用 deepStrictEqual 会因"结构相同但原型不同"而失败。
// 跨 realm 的比较一律先转成本 realm 的普通值。
// 同理，跨 realm 抛出的错误也不能用 instanceof 判断，只能看 name/message。
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// 每个用例一个干净沙箱：localStorage 互相隔离，fetch 一律失败（模拟静态托管）。
function loadLocalApi(code = MODULE_SOURCE) {
  const store = new Map();
  const localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  const fakeWindow = { localStorage };
  const sandbox = {
    window: fakeWindow,
    localStorage,
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    JSON,
    Date,
    Math,
    Array,
    Object,
    String,
    Number,
    RegExp,
    Error,
    TypeError,
    fetch: () => Promise.reject(new TypeError('offline')),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'learning-local-fallback.js' });
  return fakeWindow.LearningLocalAPI;
}

// 模块目录从模块自身读取，不写死 id。
function catalogIds(api) {
  return api.handle('catalog', undefined).modules.map((module) => module.id);
}

// —— 1. 路由识别 -----------------------------------------------------------

test('canHandle recognises the quiz GET route', () => {
  const api = loadLocalApi();
  assert.equal(api.canHandle('quiz?module=llm-basics'), true);
});

test('canHandle recognises the diagnostic quiz route', () => {
  const api = loadLocalApi();
  assert.equal(api.canHandle('quiz?mode=diagnostic'), true);
});

test('canHandle recognises nested routes (ai/config, auth/*), first-segment lookup must not win', () => {
  const api = loadLocalApi();

  // 该 handler 的键是 'ai/config'，而旧实现只取首段得到 'ai'，永远命中不到。
  assert.equal(api.canHandle('ai/config'), true);
  assert.equal(api.canHandle('ai/config?x=1'), true);

  // 同一类缺陷的其它真实路由。
  assert.equal(api.canHandle('auth/login'), true);
  assert.equal(api.canHandle('auth/register'), true);
  assert.equal(api.canHandle('auth/logout'), true);

  // 未知路由仍然必须被拒绝。
  assert.equal(api.canHandle('nope'), false);
  assert.equal(api.canHandle('ai/unknown'), false);
  assert.equal(api.canHandle('foo/bar'), false);
});

// —— 2. quiz GET -----------------------------------------------------------

test('quiz GET returns usable questions for the requested module', () => {
  const api = loadLocalApi();
  const moduleId = catalogIds(api)[0];

  const data = api.handle('quiz?module=' + encodeURIComponent(moduleId), undefined);

  assert.equal(data.ok, true);
  assert.equal(typeof data.quiz.id, 'string');
  assert.match(data.quiz.id, /^local_/);
  assert.ok(Array.isArray(data.quiz.questions), 'quiz.questions 必须是数组');
  assert.ok(data.quiz.questions.length > 0, 'quiz 必须至少有一题');

  for (const question of data.quiz.questions) {
    assert.equal(typeof question.id, 'string');
    assert.equal(typeof question.prompt, 'string');
    assert.ok(Array.isArray(question.options) && question.options.length > 1, '每题必须有多个选项');
    assert.ok(
      Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length,
      'answer 必须是合法下标：' + question.id,
    );
  }
});

test('quiz GET for an unknown module yields an empty quiz instead of throwing', () => {
  const api = loadLocalApi();
  const data = api.handle('quiz?module=does-not-exist', undefined);
  assert.equal(data.ok, true);
  assert.deepEqual(plain(data.quiz.questions), []);
});

// —— 3. quiz POST ----------------------------------------------------------

test('quiz POST with every answer correct passes and records no wrong answers', () => {
  const api = loadLocalApi();
  const route = 'quiz?module=' + encodeURIComponent(catalogIds(api)[0]);

  const issued = api.handle(route, undefined);
  const answers = {};
  for (const question of issued.quiz.questions) answers[question.id] = question.answer;

  const graded = api.handle(route, { answers });

  assert.equal(graded.ok, true);
  assert.equal(graded.result.correct, issued.quiz.questions.length);
  assert.equal(graded.result.total, issued.quiz.questions.length);
  assert.equal(graded.result.score, 100);
  assert.equal(graded.result.passed, true);
  assert.deepEqual(plain(graded.state.wrongAnswers || []), [], '全对不应产生错题');
});

test('quiz POST with every answer wrong fails and produces reviewable wrong-answer state', () => {
  const api = loadLocalApi();
  const route = 'quiz?module=' + encodeURIComponent(catalogIds(api)[0]);

  const issued = api.handle(route, undefined);
  const answers = {};
  for (const question of issued.quiz.questions) {
    answers[question.id] = (question.answer + 1) % question.options.length;
  }

  const graded = api.handle(route, { answers });

  assert.equal(graded.result.correct, 0);
  assert.equal(graded.result.score, 0);
  assert.equal(graded.result.passed, false);

  const wrong = graded.state.wrongAnswers || [];
  assert.equal(wrong.length, issued.quiz.questions.length, '每道错题都应进入错题本');
  for (const item of wrong) {
    assert.equal(item.resolved, false, '新错题必须是未复习状态');
    assert.ok(
      issued.quiz.questions.some((q) => q.id === item.questionId),
      '错题必须指向本次测验的题目',
    );
  }

  // 错题本必须可以通过 review 路由读回同样数量的未复习条目。
  const review = api.handle('review', undefined);
  assert.equal(review.ok, true);
  assert.equal(review.items.length, wrong.length);
});

// —— 4. diagnostic ---------------------------------------------------------

test('diagnostic quiz GET does not throw and serves the first catalog module', () => {
  const api = loadLocalApi();
  const ids = catalogIds(api);

  const data = api.handle('quiz?mode=diagnostic', undefined);

  assert.equal(data.ok, true);
  assert.ok(data.quiz.questions.length > 0, '诊断测验必须返回题目');

  // 诊断题固定出自第一个模块 —— 与 generateQuiz(getCatalog()[0].id) 的既有行为一致。
  const expected = api.handle('quiz?module=' + encodeURIComponent(ids[0]), undefined);
  assert.deepEqual(
    plain(data.quiz.questions.map((q) => q.prompt)),
    plain(expected.quiz.questions.map((q) => q.prompt)),
  );
});

// —— 5. unsupported route --------------------------------------------------

test('unsupported routes are rejected explicitly', () => {
  const api = loadLocalApi();
  assert.throws(() => api.handle('nope', undefined), UNSUPPORTED);
  assert.throws(() => api.handle('ai/unknown', undefined), UNSUPPORTED);
  assert.equal(api.canHandle('nope'), false);
});

// —— 6. ai/config ----------------------------------------------------------

test('ai/config is reachable in static mode and reports the local no-key contract', () => {
  const api = loadLocalApi();
  const expected = { ok: true, ai: { configured: false, model: '', baseUrl: '' } };

  assert.deepEqual(plain(api.handle('ai/config', undefined)), expected);
  // 清空密钥的动作在静态模式下也必须是一个成功的 no-op，而不是抛错。
  assert.deepEqual(plain(api.handle('ai/config', { clear: true })), expected);
});

// —— 7. mutation proof -----------------------------------------------------

// 把两处修复逐条回退成旧实现，证明上面的断言确实"会因为旧代码而红"。
function revertToBuggyContracts(code) {
  let out = code;

  // ① 参数约定回退
  out = out.split('quiz: function (body, path) {').join('quiz: function (query, body) {');
  out = out
    .split('const moduleId = path.match(/module=([^&]+)/);')
    .join('const moduleId = query.match(/module=([^&]+)/);');
  out = out
    .split("const isDiagnostic = path.includes('mode=diagnostic');")
    .join("const isDiagnostic = query.includes('mode=diagnostic');");

  // ② 嵌套路由键回退：删掉 routeKey 辅助函数，并把两个调用点换回首段写法
  out = out.replace(/[^\S\r\n]*\/\/ 路由键优先取完整路径[\s\S]*?\r?\n\r?\n/, '');
  out = out
    .split('return !!handlers[routeKey(path)];')
    .join("const key = path.split('?')[0].split('/')[0];\r\n      return !!handlers[key];");
  out = out.split('const key = routeKey(path);').join("const key = path.split('?')[0].split('/')[0];");

  return out;
}

test('mutation proof: restoring the old contracts makes these assertions fail', () => {
  const buggy = revertToBuggyContracts(MODULE_SOURCE);

  // 先证明"变异真的发生了"，否则下面的结论可能是空转。
  assert.notEqual(buggy, MODULE_SOURCE, '变异未生效：源码锚点已改变，请同步更新本测试');
  assert.equal(buggy.split('quiz: function (query, body) {').length - 1, 1, '签名回退未生效');
  assert.equal(buggy.split('query.match(/module=([^&]+)/)').length - 1, 2, 'query.match 回退未生效');
  assert.ok(!buggy.includes('routeKey'), 'routeKey 回退未彻底');
  assert.doesNotThrow(() => new vm.Script(buggy), '变异后的源码必须仍是合法 JS，否则结论不成立');

  const buggyApi = loadLocalApi(buggy);

  // ① GET 取题必须复现线上那种 TypeError（而不是静默返回空测验）。
  //    注意：错误在沙箱 realm 里创建，不能跨 realm 用 instanceof 判断。
  assert.throws(
    () => buggyApi.handle('quiz?module=llm-basics', undefined),
    (error) => error && error.name === 'TypeError' && /match/.test(error.message),
    '旧参数约定下 GET 取题应当抛 TypeError(match)',
  );

  // ② 嵌套路由必须重新变得不可达。
  assert.equal(buggyApi.canHandle('ai/config'), false);

  // 对照组：同一批断言在修复版上必须全部成立。
  const fixedApi = loadLocalApi();
  assert.equal(fixedApi.canHandle('ai/config'), true);
  assert.equal(fixedApi.handle('quiz?module=llm-basics', undefined).ok, true);
});
