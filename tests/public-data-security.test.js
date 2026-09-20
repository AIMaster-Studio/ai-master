'use strict';

// P0-SEC —— 评分答案键不得随静态前端发布。
//
// 背景：静态托管（GitHub Pages / Cloudflare Pages / Netlify / Vercel）发布的是
// `frontend/`。原先 `frontend/data/learning-curriculum.json` 既被服务端当作
// 评分题库，又作为静态资产被发布 —— 于是任何人在
// `/data/learning-curriculum.json` 就能下载到 7 个模块全部 28 道题的 `answer`，
// 而服务端 `publicCatalog()`（`/api/catalog`）是刻意剥离这些字段的。
//
// 现在拆成两份：
//   server/data/learning-curriculum.json   —— 私有权威源，含答案键，不随静态前端发布；
//   frontend/data/learning-curriculum.json —— 公开投影，只含学习导航所需元数据。
//
// 本文件把"拆分本身"变成可失败的断言，并对两类误改做 mutation proof。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');

const { createApp } = require('../server');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const PUBLIC_CURRICULUM = path.join(FRONTEND, 'data', 'learning-curriculum.json');
const PRIVATE_CURRICULUM = path.join(ROOT, 'server', 'data', 'learning-curriculum.json');

// 公开投影允许出现的顶层键与模块键。
const ALLOWED_TOP_LEVEL = ['version', 'contentNotice', 'projectionOf', 'modules'];
const ALLOWED_MODULE_FIELDS = [
  'id',
  'title',
  'chapter',
  'nodeIds',
  'objective',
  'bloom',
  'prerequisites',
  'estimatedMinutes',
  'learnUrl',
  'summary',
  'prompt',
  'followUp',
  'concepts',
  'misconceptions',
  'questionCount',
];

// 评分答案键（精确匹配小写键名）。questionCount 不在其中。
const FORBIDDEN_KEYS = [
  'answer',
  'answers',
  'answerindex',
  'answerkey',
  'correct',
  'correctanswer',
  'explanation',
  'gradingkey',
  'options',
  'question',
  'questions',
  'rubrickey',
  'solution',
  'solutions',
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function collectKeys(value, out = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      out.add(key.toLowerCase());
      collectKeys(item, out);
    }
  }
  return out;
}

// 返回公开投影里的违规说明（空数组 = 合规）。
function publicProjectionViolations(value) {
  const problems = [];

  for (const key of collectKeys(value)) {
    if (FORBIDDEN_KEYS.includes(key)) problems.push('公开投影出现评分答案键：' + key);
  }

  if (!value || typeof value !== 'object' || !Array.isArray(value.modules)) {
    problems.push('公开投影缺少 modules 数组');
    return problems;
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_TOP_LEVEL.includes(key)) problems.push('公开投影出现未允许的顶层键：' + key);
  }

  for (const module of value.modules) {
    for (const key of Object.keys(module)) {
      if (!ALLOWED_MODULE_FIELDS.includes(key)) {
        problems.push('模块 ' + module.id + ' 出现未允许的字段：' + key);
      }
    }
    if (!Number.isInteger(module.questionCount) || module.questionCount < 0) {
      problems.push('模块 ' + module.id + ' 缺少整数 questionCount');
    }
    if (!Array.isArray(module.nodeIds) || module.nodeIds.length === 0) {
      problems.push('模块 ' + module.id + ' 缺少 nodeIds（学习导航需要它）');
    }
  }

  return problems;
}

// 返回私有权威源的违规说明（空数组 = 正常）。
function privateSourceViolations(catalog) {
  const problems = [];

  if (!catalog || typeof catalog !== 'object' || !Array.isArray(catalog.modules)) {
    problems.push('私有源缺少 modules 数组');
    return problems;
  }
  if (catalog.modules.length === 0) problems.push('私有源没有任何模块');

  for (const module of catalog.modules) {
    if (!Array.isArray(module.questions) || module.questions.length === 0) {
      problems.push('模块 ' + module.id + ' 丢失了 questions —— 服务端将无法判分');
      continue;
    }
    for (const question of module.questions) {
      if (!Number.isInteger(question.answer)) {
        problems.push('题目 ' + question.id + ' 缺少整数 answer');
      } else if (!Array.isArray(question.options) || question.answer >= question.options.length) {
        problems.push('题目 ' + question.id + ' 的 answer 越界');
      }
    }
  }

  return problems;
}

// —— 1. 公开投影不含答案键 ------------------------------------------------

test('the published curriculum projection carries no answer-bearing key', () => {
  const raw = fs.readFileSync(PUBLIC_CURRICULUM, 'utf8');
  const projection = JSON.parse(raw);

  assert.deepEqual(publicProjectionViolations(projection), []);

  // 再对原文做一次字符串级检查，防止以后有人用非 JSON 结构夹带答案。
  for (const needle of ['"answer"', '"answers"', '"correctAnswer"', '"answerIndex"', '"solution"']) {
    assert.ok(!raw.includes(needle), '公开投影原文仍包含 ' + needle);
  }
});

test('the public projection preserves module identity and question counts', () => {
  const projection = readJson(PUBLIC_CURRICULUM);
  const canonical = readJson(PRIVATE_CURRICULUM);

  assert.equal(projection.modules.length, canonical.modules.length, '模块数量必须一致');

  const byId = new Map(canonical.modules.map((module) => [module.id, module]));
  for (const module of projection.modules) {
    const source = byId.get(module.id);
    assert.ok(source, '公开投影出现私有源没有的模块：' + module.id);
    assert.equal(module.title, source.title);
    assert.deepEqual(module.nodeIds, source.nodeIds, 'nodeIds 必须与权威源一致：' + module.id);
    assert.equal(
      module.questionCount,
      (source.questions || []).length,
      'questionCount 必须等于权威源的题目数：' + module.id,
    );
  }
});

// —— 2. 私有源仍然可用且不在发布树内 --------------------------------------

test('the private canonical source keeps the answer key and is outside the published tree', () => {
  assert.ok(fs.existsSync(PRIVATE_CURRICULUM), '私有权威源必须存在（服务端判分依赖它）');
  assert.deepEqual(privateSourceViolations(readJson(PRIVATE_CURRICULUM)), []);

  const relative = path.relative(FRONTEND, PRIVATE_CURRICULUM);
  assert.ok(
    relative.startsWith('..') || path.isAbsolute(relative),
    '私有权威源不能位于 frontend/ 目录内 —— 那正是会被静态发布的目录',
  );

  // 服务端判分入口必须指向私有源，而不是公开投影。
  const serverSource = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
  assert.ok(
    serverSource.includes("require('./data/learning-curriculum.json')"),
    'server/index.js 必须从私有源加载题库',
  );
});

// —— 3. 浏览器侧不引用私有源 ----------------------------------------------

test('no published frontend asset references the private curriculum path', () => {
  const offenders = [];
  const extensions = new Set(['.html', '.js', '.css', '.json', '.mjs', '.cjs']);

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (extensions.has(path.extname(entry.name).toLowerCase())) {
        // 公开投影自身的 projectionOf 字段会提到私有路径 —— 那是溯源信息，不是加载引用。
        if (path.resolve(full) === path.resolve(PUBLIC_CURRICULUM)) continue;
        if (fs.readFileSync(full, 'utf8').includes('server/data/learning-curriculum')) {
          offenders.push(path.relative(ROOT, full));
        }
      }
    }
  };
  walk(FRONTEND);

  assert.deepEqual(offenders, [], '发布树内不得出现对私有题库的引用');
});

// —— 4. 服务端仍然剥离私有题目 --------------------------------------------

test('the server public catalog still strips private quiz content', async (t) => {
  const app = createApp({ dbPath: ':memory:', allowRemote: false, allowedHosts: [], configToken: '' });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(() => new Promise((resolve) => app.server.close(resolve)));

  const base = 'http://127.0.0.1:' + app.server.address().port;
  const response = await fetch(base + '/api/catalog');
  assert.equal(response.status, 200);
  const data = await response.json();

  assert.equal(data.ok, true);
  assert.equal(data.modules.length, 7);
  for (const module of data.modules) {
    assert.ok(!('questions' in module), '公开目录不得下发 questions：' + module.id);
    assert.ok(!('answer' in module), '公开目录不得下发 answer：' + module.id);
    assert.equal(typeof module.questionCount, 'number', '公开目录应下发 questionCount：' + module.id);
  }
  // 公开目录与静态投影必须是同一形状，否则两条公开路径会各自漂移。
  const projection = readJson(PUBLIC_CURRICULUM);
  assert.deepEqual(
    data.modules.map((m) => m.id).sort(),
    projection.modules.map((m) => m.id).sort(),
    '/api/catalog 与静态投影的模块集合必须一致',
  );
});

// —— 5. 静态 fallback 不依赖被移除的公开答案文件 --------------------------

test('the static fallback quiz still completes without the published answer file', () => {
  const fallbackPath = path.join(FRONTEND, 'static', 'js', 'learning-local-fallback.js');
  const fallbackSource = fs.readFileSync(fallbackPath, 'utf8');

  // fallback 自带演示题库，不得反过来去下载课程答案文件。
  assert.ok(
    !fallbackSource.includes('learning-curriculum'),
    '静态 fallback 不得依赖 learning-curriculum.json',
  );

  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const fakeWindow = { localStorage };
  const sandbox = {
    window: fakeWindow,
    localStorage,
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    JSON, Date, Math, Array, Object, String, Number, RegExp, Error, TypeError,
    fetch: () => Promise.reject(new TypeError('offline')),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fallbackSource, sandbox, { filename: 'learning-local-fallback.js' });

  const api = fakeWindow.LearningLocalAPI;
  const route = 'quiz?module=llm-basics';
  const issued = api.handle(route, undefined);
  assert.ok(issued.quiz.questions.length > 0, '静态 fallback 必须仍能出具题目');

  const answers = {};
  for (const q of issued.quiz.questions) answers[q.id] = q.answer;
  const graded = api.handle(route, { answers });
  assert.equal(graded.result.passed, true, '静态 fallback 必须仍能判分');
});

// —— 6. 全局公开资产扫描 --------------------------------------------------

// 单个文件出现这么多答案键，就已经是"题库"而不是少量演示夹具了。
// 实测参照：搬走之前 chapter_NN.json 各 4 个、quiz_bank.json 103 个；
// 保留的演示夹具（static/js/learning-local-fallback.js 的内置示例测验、
// static/llm_training_game.html 的 next-token 教学数据）都远低于阈值。
const BULK_ANSWER_THRESHOLD = 20;

function countAnswerKeys(text) {
  return (text.match(/(^|[\s,{])["']?answer["']?\s*:/gm) || []).length;
}

test('the published data directory is free of answer keys', () => {
  const offenders = [];
  const dataDir = path.join(FRONTEND, 'data');
  for (const entry of fs.readdirSync(dataDir, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue;
    const full = path.join(dataDir, entry.name);
    const hits = countAnswerKeys(fs.readFileSync(full, 'utf8'));
    if (hits > 0) offenders.push(path.relative(ROOT, full) + ' (' + hits + ')');
  }
  assert.deepEqual(offenders, [], 'frontend/data 下任何 JSON 都不得包含答案键');
});

test('no published frontend asset exposes a bulk answer bank', () => {
  const offenders = [];
  const extensions = new Set(['.json', '.js', '.html', '.css', '.mjs', '.cjs']);

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (extensions.has(path.extname(entry.name).toLowerCase())) {
        const hits = countAnswerKeys(fs.readFileSync(full, 'utf8'));
        if (hits >= BULK_ANSWER_THRESHOLD) {
          offenders.push(path.relative(ROOT, full) + ' (' + hits + ' answer keys)');
        }
      }
    }
  };
  walk(FRONTEND);

  assert.deepEqual(
    offenders,
    [],
    '静态发布树内不得存在成规模的答案库（阈值 ' + BULK_ANSWER_THRESHOLD + '）',
  );
});

// —— 7. mutation proof ----------------------------------------------------

test('mutation proof: an answer key injected into the projection is detected', () => {
  const original = fs.readFileSync(PUBLIC_CURRICULUM, 'utf8');

  // 先证明未变异时判据是"通过"的。
  assert.deepEqual(publicProjectionViolations(JSON.parse(original)), []);

  // 注入一个答案键，模拟"有人把答案复制回公开文件"。
  const injected = original.replace('"questionCount":', '"answer": 0, "questionCount":');
  assert.notEqual(injected, original, '变异未生效：投影里已找不到 questionCount 锚点');

  const problems = publicProjectionViolations(JSON.parse(injected));
  assert.ok(
    problems.some((p) => p.includes('answer')),
    '注入 answer 后判据必须报出违规，实际：' + JSON.stringify(problems),
  );

  // 同样地，把私有源里的答案抹掉也必须被发现。
  const canonical = readJson(PRIVATE_CURRICULUM);
  const stripped = JSON.parse(JSON.stringify(canonical));
  for (const module of stripped.modules) delete module.questions;
  assert.notEqual(stripped, canonical, '变异未生效：无法从私有源删除 questions');
  const privateProblems = privateSourceViolations(stripped);
  assert.ok(
    privateProblems.length > 0,
    '私有源丢失答案键时必须报错，否则"服务端仍持有答案"这条断言是空转的',
  );
});
