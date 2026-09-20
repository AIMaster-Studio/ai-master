'use strict';

// P0-SEC —— 评分答案键不得随静态前端发布；且发布**边界**本身必须是可断言的契约。
//
// 背景（两层问题，本文件同时守住）：
//
//   ① 内容层：原先 `frontend/data/learning-curriculum.json` 既被服务端当作评分题库，
//      又作为静态资产被发布 —— 任何人在 `/data/learning-curriculum.json` 就能下载到
//      7 个模块全部 28 道题的 `answer`，而服务端 `publicCatalog()`（`/api/catalog`）
//      是刻意剥离这些字段的。现在拆成两份：
//        server/data/learning-curriculum.json   —— 私有权威源，含答案键，不随静态前端发布；
//        frontend/data/learning-curriculum.json —— 公开投影，只含学习导航所需元数据。
//      同批搬走的还有 chapter_NN.json 的 exercises（39 个答案键，全仓零消费者）
//      与 quiz_bank.json（103 个答案键）→ server/data/。
//
//   ② 边界层：`netlify.toml` 原本 `publish = "."`，把**整个仓库**上传为静态文件，
//      仅靠 `/* -> /frontend/:splat` 通配重写遮蔽掉 server/ tests/ scripts/。
//      遮蔽不是边界 —— 重写规则一改就漏。发布根必须就是 frontend/，
//      并让"私有内容不在 artifact 内"成为可失败断言。
//
// 本文件把两件事都变成可失败的断言，并对四类误改做 mutation proof：
//   - 答案键被复制回公开投影；
//   - 回答类数据出现在非 allowlist 文件里；
//   - 私有权威源丢了答案（"服务端仍持有答案"变成空转断言）；
//   - 发布根退回仓库根。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');

const { createApp } = require('../server');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const PUBLIC_CURRICULUM = path.join(FRONTEND, 'data', 'learning-curriculum.json');
const PRIVATE_CURRICULUM = path.join(ROOT, 'server', 'data', 'learning-curriculum.json');
const NETLIFY_TOML = path.join(ROOT, 'netlify.toml');

// 私有答案源：必须留在发布根之外。chapter-exercises.json 与 quiz-bank.json
// 由 P0-SEC 从 frontend/data 搬出；改回 frontend/ 会立刻被下面的边界断言拦下。
const PRIVATE_ANSWER_SOURCES = [
  { rel: 'server/data/learning-curriculum.json', keys: 28, note: '模块测验标答（服务端判分依赖）' },
  { rel: 'server/data/chapter-exercises.json', keys: 39, note: '章节练习标答（全仓无运行时消费者，已私有保留）' },
  { rel: 'server/data/quiz-bank.json', keys: 103, note: '自由练习题库标答' },
];

// 只允许出现在发布根之外，且**不允许出现在 frontend/ 任何一层**的仓库专用目录。
const REPO_ONLY_ENTRIES = ['server', 'tests', 'scripts', '.github', '.git', 'node_modules', 'devlog', 'electron', 'api', 'netlify', '.orchestrator'];

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

// —— 唯一的安全边界：显式 allowlist ----------------------------------------
//
// 判据是"这个文件在不在清单里"（精确路径 + 精确用途 + 精确分类），
// **不是**"单文件答案数低于某个阈值"。阈值会被稀释（把题库拆成 20 个文件就绕过），
// 显式清单不会：没登记的文件只要出现一个答案键就失败。
//
// maxKeys 是**逐文件声明的预算**，用途只有一个 —— 防止已登记文件悄悄长大成题库
// （例如往 learning-core.js 里粘一整份课程答案）。它不是放行条件。
//
// carriesAnswerData=false 表示该文件里的 answer 只是**标识符引用**（读字段、发请求参数），
// 这类文件额外要求"不得出现带引号的 JSON 答案键"。
const PUBLISHED_ANSWER_ALLOWLIST = [
  {
    file: 'static/llm_training_game.html',
    classification: 'teaching-demo-fixture',
    carriesAnswerData: true,
    purpose: 'next-token 采样小游戏的 8 条教学示例数据（ctx/answer/options/probs），课程演示用，不是测验题库',
    maxKeys: 8,
  },
  {
    file: 'static/js/learning-local-fallback.js',
    classification: 'sanctioned-fallback-demo-quiz',
    carriesAnswerData: true,
    purpose: '离线/静态模式内置的演示题库（GET 取题、POST 自判分）—— owner 已批准的静态 fallback',
    maxKeys: 2,
  },
  {
    file: 'static/js/learning-core.js',
    classification: 'code-reference',
    carriesAnswerData: false,
    purpose: '读取本地演示题目对象上的 answer 以计算对错（标识符引用）',
    maxKeys: 1,
  },
  {
    file: 'static/js/learning-workspace.js',
    classification: 'code-reference',
    carriesAnswerData: false,
    purpose: '把学习者自己的作答作为请求参数提交给服务端（标识符引用）',
    maxKeys: 3,
  },
  {
    file: 'static/jj_interview.html',
    classification: 'code-reference',
    carriesAnswerData: false,
    purpose: '面试代理请求体里的 action 取值（标识符引用）',
    maxKeys: 1,
  },
];

const PUBLISH_EXTENSIONS = new Set(['.json', '.js', '.html', '.css', '.mjs', '.cjs']);

// 答案键识别：带引号的 JSON 键（数据）与裸键（对象字面量/标识符）分开统计。
const QUOTED_ANSWER_KEY = /["']answer["']\s*:/g;
const BARE_ANSWER_KEY = /(^|[\s,{])answer\s*:/gm;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function toPosix(target) {
  return target.split(path.sep).join('/');
}

function countQuotedAnswerKeys(text) {
  return (text.match(QUOTED_ANSWER_KEY) || []).length;
}

function countBareAnswerKeys(text) {
  return (text.match(BARE_ANSWER_KEY) || []).length;
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

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

// 扫描任意"发布根"目录，返回其中携带答案键的文件（rel 相对该根）。
function answerBearingFiles(publishRoot) {
  return walkFiles(publishRoot)
    .filter((file) => PUBLISH_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .map((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return {
        abs: file,
        rel: toPosix(path.relative(publishRoot, file)),
        quoted: countQuotedAnswerKeys(text),
        bare: countBareAnswerKeys(text),
      };
    })
    .filter((entry) => entry.quoted > 0 || entry.bare > 0);
}

function allowlistEntry(file) {
  return PUBLISHED_ANSWER_ALLOWLIST.find((entry) => entry.file === file);
}

// 返回 allowlist 违规说明（空数组 = 合规）。
function allowlistViolations(publishRoot) {
  const problems = [];
  for (const found of answerBearingFiles(publishRoot)) {
    const entry = allowlistEntry(found.rel);
    if (!entry) {
      problems.push(
        '未登记的答案键：' + found.rel + '（引号键 ' + found.quoted + ' / 裸键 ' + found.bare + '）。' +
          '公开树内出现 answer 字段的文件必须逐个登记用途与分类。',
      );
      continue;
    }
    if (entry.carriesAnswerData === false && found.quoted > 0) {
      problems.push(
        '标识符引用型文件出现整块答案数据：' + found.rel + '（引号键 ' + found.quoted + '）—— 该文件应只读字段，不应自带题库。',
      );
    }
    if (found.quoted + found.bare > entry.maxKeys) {
      problems.push(
        '答案键超出登记预算：' + found.rel + '（实际 ' + (found.quoted + found.bare) + ' > 声明 ' + entry.maxKeys + '）。',
      );
    }
  }
  return problems;
}

// 返回发布边界违规说明（空数组 = 合规）。
function artifactViolations(publishRoot) {
  const resolved = path.resolve(publishRoot);
  const problems = [];

  if (resolved === ROOT) {
    problems.push('发布根不得是仓库根目录 —— 那会把 server/ tests/ scripts/ 一并上传为静态文件。');
  }

  for (const name of REPO_ONLY_ENTRIES) {
    if (fs.existsSync(path.join(resolved, name))) {
      problems.push('发布 artifact 含仓库专用内容：' + name + '/');
    }
  }

  for (const source of PRIVATE_ANSWER_SOURCES) {
    if (fs.existsSync(path.join(resolved, source.rel))) {
      problems.push('发布 artifact 含私有答案源：' + source.rel);
    }
  }

  return problems;
}

// 从 netlify.toml 的 [build] 段读取 publish（不依赖行号）。
function readNetlifyPublishRoot() {
  const lines = fs.readFileSync(NETLIFY_TOML, 'utf8').split(/\r?\n/);
  let inBuild = false;
  for (const line of lines) {
    const section = line.match(/^\s*\[([^\]]+)\]/);
    if (section) {
      inBuild = section[1].trim() === 'build';
      continue;
    }
    if (!inBuild) continue;
    const declared = line.match(/^\s*publish\s*=\s*"([^"]*)"/);
    if (declared) return declared[1];
  }
  assert.fail('netlify.toml 的 [build] 段缺少 publish 声明');
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

function withStagedPublishRoot(run) {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'aimaster-artifact-'));
  try {
    fs.cpSync(FRONTEND, staging, { recursive: true });
    return run(staging);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
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

test('every private answer source sits outside the published root and still holds its answers', () => {
  for (const source of PRIVATE_ANSWER_SOURCES) {
    const full = path.join(ROOT, source.rel);
    assert.ok(fs.existsSync(full), '私有答案源缺失：' + source.rel + '（' + source.note + '）');

    const relative = path.relative(FRONTEND, full);
    assert.ok(
      relative.startsWith('..') || path.isAbsolute(relative),
      '私有答案源不得位于发布根内：' + source.rel,
    );

    const found = countQuotedAnswerKeys(fs.readFileSync(full, 'utf8'));
    assert.ok(
      found > 0,
      '私有答案源 ' + source.rel + ' 已不含答案键 —— "答案仍由服务端持有"这条保证会变成空转断言',
    );
  }
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

test('the authoritative quiz route never ships the answer key to the browser', () => {
  // 这是"静态 fallback 自判分 / 服务端权威判分"两条路径的分界证据：
  // 服务端下发题目时会剥掉 answer 与 explanation，静态 fallback 才用自带演示题库自判分。
  const routes = fs.readFileSync(path.join(ROOT, 'server', 'learning-routes.js'), 'utf8');
  assert.match(
    routes,
    /publicQuestion/,
    'server/learning-routes.js 缺少 publicQuestion() —— 服务端模式可能把标答下发到浏览器',
  );
  const strip = routes.match(/const publicQuestion = \(([^)]*)\) => ([^\n;]+);/);
  assert.ok(strip, '未找到 publicQuestion 的定义');
  assert.match(strip[1], /answer/, 'publicQuestion 必须显式剥离 answer 字段');
  assert.match(strip[1], /explanation/, 'publicQuestion 必须显式剥离 explanation 字段');
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

// —— 6. 发布树内的答案键：显式 allowlist 才是边界 -------------------------

test('every file in the published tree that carries an answer-like key is explicitly allowlisted', () => {
  assert.deepEqual(
    allowlistViolations(FRONTEND),
    [],
    '发布树内出现未登记的答案键 —— 要么把数据移出发布根，要么在 PUBLISHED_ANSWER_ALLOWLIST 里登记精确用途与分类',
  );
});

test('the allowlist has no stale entry', () => {
  // 反向守卫：清单只许收窄。某文件不再携带答案键时，对应条目必须删掉，
  // 否则清单会随时间变宽，"显式"就退化成"历史遗留"。
  const bearing = new Set(answerBearingFiles(FRONTEND).map((entry) => entry.rel));
  const stale = PUBLISHED_ANSWER_ALLOWLIST.filter((entry) => !bearing.has(entry.file)).map((entry) => entry.file);
  assert.deepEqual(stale, [], '这些文件已不再携带答案键，应从 allowlist 移除：' + stale.join(', '));
});

test('allowlisted files stay within their declared answer-key budget', () => {
  const found = new Map(answerBearingFiles(FRONTEND).map((entry) => [entry.rel, entry]));
  const overBudget = [];
  for (const entry of PUBLISHED_ANSWER_ALLOWLIST) {
    const actual = found.get(entry.file);
    if (!actual) continue; // 由上一条 stale 守卫负责。
    if (actual.quoted + actual.bare > entry.maxKeys) {
      overBudget.push(entry.file + '（' + (actual.quoted + actual.bare) + ' > ' + entry.maxKeys + '）');
    }
  }
  assert.deepEqual(
    overBudget,
    [],
    '已登记文件长成了成规模题库 —— 演示夹具不得演化为答案库：' + overBudget.join(', '),
  );
});

test('identifier-only files never carry a quoted JSON answer key', () => {
  const found = new Map(answerBearingFiles(FRONTEND).map((entry) => [entry.rel, entry]));
  const offenders = [];
  for (const entry of PUBLISHED_ANSWER_ALLOWLIST) {
    if (entry.carriesAnswerData !== false) continue;
    const actual = found.get(entry.file);
    if (actual && actual.quoted > 0) {
      offenders.push(entry.file + '（引号键 ' + actual.quoted + '）');
    }
  }
  assert.deepEqual(offenders, [], '标识符引用型文件出现了 JSON 形态的答案数据：' + offenders.join(', '));
});

test('no JSON file anywhere in the published tree carries an answer key', () => {
  // JSON 是数据格式，没有任何"标识符引用"的借口 —— 一律零容忍，不可进 allowlist。
  const offenders = [];
  for (const file of walkFiles(FRONTEND)) {
    if (path.extname(file).toLowerCase() !== '.json') continue;
    const text = fs.readFileSync(file, 'utf8');
    const hits = countQuotedAnswerKeys(text) + countBareAnswerKeys(text);
    if (hits > 0) offenders.push(toPosix(path.relative(ROOT, file)) + ' (' + hits + ')');
  }
  assert.deepEqual(offenders, [], 'frontend 下任何 JSON 都不得包含答案键');
});

// 次要防线（**不是**放行判据）：整份题库的体积特征。
// 实测参照：搬走之前 chapter_NN.json 各 4 个、quiz_bank.json 103 个。
const BULK_ANSWER_THRESHOLD = 20;

test('no published asset carries a bulk answer bank (secondary net)', () => {
  const offenders = [];
  for (const found of answerBearingFiles(FRONTEND)) {
    if (found.quoted + found.bare >= BULK_ANSWER_THRESHOLD) {
      offenders.push(found.rel + ' (' + (found.quoted + found.bare) + ' answer keys)');
    }
  }
  assert.deepEqual(
    offenders,
    [],
    '静态发布树内不得存在成规模的答案库（次要防线，阈值 ' + BULK_ANSWER_THRESHOLD + '）',
  );
});

// —— 7. 发布边界：Netlify 静态 artifact -----------------------------------

test('the Netlify publish root is the frontend asset directory, not the repository', () => {
  const publish = readNetlifyPublishRoot();
  assert.equal(
    path.resolve(ROOT, publish),
    FRONTEND,
    'netlify.toml 的 publish 必须指向 frontend/ —— publish = "." 会把整个仓库上传为静态文件',
  );
  assert.ok(
    !/server|tests|scripts/.test(publish),
    'publish 不得指向包含私有内容的目录：' + publish,
  );
});

test('a materialized publish artifact carries no repository-only content', () => {
  const publishRoot = path.resolve(ROOT, readNetlifyPublishRoot());
  assert.ok(fs.existsSync(publishRoot), '发布根不存在：' + publishRoot);

  withStagedPublishRoot((staging) => {
    // 真正把 artifact 落一次盘再检查，而不是只看路径。
    assert.deepEqual(artifactViolations(staging), []);

    for (const source of PRIVATE_ANSWER_SOURCES) {
      assert.equal(
        fs.existsSync(path.join(staging, source.rel)),
        false,
        'artifact 内出现私有答案源：' + source.rel,
      );
    }

    // artifact 里的答案键集合必须与 allowlist 完全一致（不多不少）。
    const bearing = answerBearingFiles(staging).map((entry) => entry.rel).sort();
    const declared = PUBLISHED_ANSWER_ALLOWLIST.map((entry) => entry.file).sort();
    assert.deepEqual(bearing, declared, 'artifact 的答案键文件集合与 allowlist 不一致');
  });
});

// —— 8. mutation proof ----------------------------------------------------

test('mutation proof: publish root regressed to the repository root is rejected', () => {
  const publishRoot = path.resolve(ROOT, readNetlifyPublishRoot());

  // 先证明未变异时判据是"通过"的。
  assert.deepEqual(artifactViolations(publishRoot), []);

  // 模拟 publish = "." 回归。
  const problems = artifactViolations(ROOT);
  assert.ok(
    problems.some((p) => p.includes('仓库根')),
    '发布根退回仓库根必须被判为违规，实际：' + JSON.stringify(problems),
  );
  assert.ok(
    problems.some((p) => p.includes('server')),
    '发布根退回仓库根必须报出 server/ 进入 artifact，实际：' + JSON.stringify(problems),
  );
});

test('mutation proof: an un-registered answer-bearing file is detected', () => {
  withStagedPublishRoot((staging) => {
    assert.deepEqual(allowlistViolations(staging), [], '基线应为合规');

    // 模拟"有人把一整份课程答案粘进一个新 JS 文件"。
    const injected = path.join(staging, 'static', 'js', 'quiz-answers.js');
    const bank = Array.from({ length: 41 }, (_, i) => "  { id: 'q" + i + "', options: ['a','b'], answer: " + (i % 2) + " },").join('\n');
    fs.writeFileSync(injected, "'use strict';\nconst BANK = [\n" + bank + "\n];\n", 'utf8');

    const problems = allowlistViolations(staging);
    assert.ok(
      problems.some((p) => p.includes('static/js/quiz-answers.js')),
      '非 allowlist 文件带答案时必须失败，实际：' + JSON.stringify(problems),
    );
  });
});

test('mutation proof: injecting a real course answer set into an allowlisted file trips the budget', () => {
  withStagedPublishRoot((staging) => {
    const target = path.join(staging, 'static', 'js', 'learning-core.js');
    assert.deepEqual(allowlistViolations(staging), [], '基线应为合规');

    const before = fs.readFileSync(target, 'utf8');
    const bank = Array.from({ length: 41 }, (_, i) => '  { id: "q' + i + '", answer: ' + (i % 2) + ' },').join('\n');
    fs.writeFileSync(target, before + '\nconst SMUGGLED = [\n' + bank + '\n];\n', 'utf8');

    const problems = allowlistViolations(staging);
    assert.ok(
      problems.some((p) => p.includes('static/js/learning-core.js')),
      '已登记文件被灌入题库时必须失败，实际：' + JSON.stringify(problems),
    );
  });
});

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
