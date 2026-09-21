'use strict';

// 内容审校规则的可执行版本。
//
// 背景：`docs/ican/facts-and-limits.md` 里有一份「课程事实审校队列」，其中一条硬规则是
// **凡未核实的数字，一律不得进入新增客观题的标准答案**。
// 但「队列」和「规则」如果只写在文档里，就只是一句愿望 —— 下一个人加题时不会去看它。
// 这个文件把那条规则变成一条会失败的测试。
//
// 规则：题库（学习闭环的 7 个模块 + 扩展题库）里出现的任何**量级性数字**
// （倍数 / 百分比 / 亿·万 / B·T / ×10 / 存储单位）都必须登记在 VERIFIED_NUMBERS 里，
// 并写明依据与核实日期。没登记就测试失败。
//
// 为什么只盯「量级性数字」而不是所有数字：题面里合法的数字很多（题号、版本号、
// 「以下哪项」的序号），全禁会变成噪音测试，没人会认真对待。
// 而「提升 10 倍」「1750 亿参数」这类才是真正会被当成事实传播、且最容易写错的东西。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const QUESTION_SOURCES = [
  path.resolve(__dirname, '../server/data/learning-curriculum.json'),
  path.resolve(__dirname, '../server/data/quiz-bank.json')
];

// 量级性数字的形态。刻意不含裸数字。
const MAGNITUDE = /(\d+(?:\.\d+)?)\s*(倍|%|亿|万|B\b|T\b|×\s*10|GB|MB|TB)/g;

// 已核实并允许出现在答案键里的量级性数字。
// 每一条都必须能回答：依据是什么、什么时候核实的。
// 目前为空 —— 因为审校实测发现题库里一个都没有（这正是本测试要守住的现状）。
const VERIFIED_NUMBERS = {
  // 示例格式（不要直接抄，抄之前先真的去核实）：
  // '1750 亿': { source: 'GPT-3 论文（arXiv:2005.14165）表 2.1', checkedAt: '2026-09-15', note: 'GPT-3 最大版本参数量' }
};

function questionObjects(value, out = []) {
  if (Array.isArray(value)) { for (const item of value) questionObjects(item, out); return out; }
  if (value && typeof value === 'object') {
    if (Array.isArray(value.options) && (value.answer !== undefined || value.correct !== undefined)) out.push(value);
    for (const item of Object.values(value)) questionObjects(item, out);
  }
  return out;
}

function questionText(question) {
  return [question.prompt, question.question, question.explanation, question.code_prompt, ...(question.options || [])]
    .filter(item => typeof item === 'string').join('\n');
}

function collectQuestions() {
  const questions = [];
  for (const file of QUESTION_SOURCES) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const question of questionObjects(data)) questions.push({ question, file: path.basename(file) });
  }
  return questions;
}

test('the question banks are non-empty and actually scanned', () => {
  const questions = collectQuestions();
  // 这条防的是「扫描器坏了所以永远通过」—— 这是这类守卫测试最常见的失效方式。
  assert.ok(questions.length >= 100, '扫描到的题目数量异常：' + questions.length);
  // 逐个题库都必须有题被扫到。名字从 QUESTION_SOURCES 派生，
  // 这样题库文件改名/搬家时这条守卫不会悄悄变成空转。
  for (const source of QUESTION_SOURCES) {
    const name = path.basename(source);
    assert.ok(questions.some(item => item.file === name), '未扫描到题库：' + name);
  }
  for (const item of questions) {
    assert.equal(typeof item.question.answer, 'number', '题目缺少整数答案：' + JSON.stringify(item.question).slice(0, 80));
    assert.ok(item.question.answer >= 0 && item.question.answer < item.question.options.length);
  }
});

test('no unverified magnitude number appears anywhere in a question or its answer key', () => {
  const offenders = [];
  for (const { question, file } of collectQuestions()) {
    const text = questionText(question);
    for (const match of text.matchAll(MAGNITUDE)) {
      const token = match[0].replace(/\s+/g, ' ').trim();
      if (!VERIFIED_NUMBERS[token]) offenders.push({ token, id: question.id || '(no id)', file });
    }
  }
  assert.deepEqual(offenders, [],
    '题库出现未登记的量级性数字，必须先核实并登记到 VERIFIED_NUMBERS（含依据与核实日期）：\n'
    + offenders.map(item => '  · ' + item.token + '  @ ' + item.id + ' (' + item.file + ')').join('\n'));
});

test('the verified-number allowlist does not rot', () => {
  // 反向检查：登记了却已不在题库里的条目应删除，否则清单会越积越假，
  // 后来者会以为「这些都还在用」，实际上早就没了。
  const seen = new Set();
  for (const { question } of collectQuestions()) {
    for (const match of questionText(question).matchAll(MAGNITUDE)) seen.add(match[0].replace(/\s+/g, ' ').trim());
  }
  for (const [token, meta] of Object.entries(VERIFIED_NUMBERS)) {
    assert.ok(seen.has(token), 'VERIFIED_NUMBERS 中的「' + token + '」已不在题库里，应删除');
    assert.ok(meta.source && meta.checkedAt, '「' + token + '」必须写明依据与核实日期');
    assert.match(meta.checkedAt, /^\d{4}-\d{2}-\d{2}$/, '「' + token + '」的核实日期需为 YYYY-MM-DD');
  }
});

test('the audited claims that were corrected stay corrected', () => {
  // 这四处是 2026-09-15 审校时确认并修正的缺陷。回归测试防止它们被改回去。
  const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

  // ① GPT-3 总计算量：论文附录 D 为 3.14×10^23 FLOPs，原文误写为 10^3
  const ch1 = read('frontend/data/chapter_01.json');
  assert.ok(ch1.includes('3.14×10²³'), 'GPT-3 总计算量应为 3.14×10²³ FLOPs');
  assert.equal(ch1.includes('3.14×10³ FLOPS'), false, '旧的错误数值不应再出现');

  // ② token 不是「最小语义单位」（课程自己的误区表已把它列为错误说法，图谱里却当事实讲）
  for (const file of ['frontend/data/knowledge_graph.json', 'frontend/static/galaxy_data.json', 'frontend/static/knowledge_data.json']) {
    assert.equal(read(file).includes('处理文本的最小语义单位'), false, file + ' 仍在断言 token 是最小语义单位');
  }

  // ③ 角色提示「激活子网络」：认知地图标注为不采用，图谱里也不得再当事实讲
  for (const file of ['frontend/data/knowledge_graph.json', 'frontend/static/galaxy_data.json']) {
    assert.equal(read(file).includes('与角色相关的子网络'), false, file + ' 仍在断言角色提示激活子网络');
  }

  // ④ 提示效果倍数：不可核实，已改为不给数字
  const ch3 = read('frontend/data/chapter_03.json');
  assert.equal(ch3.includes('输出质量差异可达 10 倍以上'), false, '不可核实的提示效果倍数不应保留');
  assert.ok(ch3.includes('没有通用倍数'), '应显式说明不给数字的理由');

  // ⑤ Claude Code 安装：官方已把原生安装器列为推荐，npm 需 Node.js 22+
  const ch5 = read('frontend/data/chapter_05.json');
  assert.ok(ch5.includes('推荐原生安装器'), '应说明官方推荐原生安装器');
  assert.ok(ch5.includes('Node.js 22'), 'npm 路径应标注 Node.js 22+ 的要求');
  assert.equal(ch5.includes('PowerShell 管理员模式'), false, '不应再引导用管理员模式安装');
});

test('the cognitive map keeps flagging the claims that were not adopted', () => {
  // 认知地图里这些 contentCaveat 是审校队列的落地形式，不应被删掉。
  const map = fs.readFileSync(path.resolve(__dirname, '../frontend/data/knowledge-cognitive-map.json'), 'utf8');
  for (const needle of ['纠正最小语义单位的过强定义', '不采用角色会激活特定子网络的未经核实机理解释', '直接 API 并非只能单轮']) {
    assert.ok(map.includes(needle), '认知地图缺少 caveat：' + needle);
  }
});

// ---------------------------------------------------------------------------
// 覆盖缺口复盘（2026-09-15 追加）
//
// 审校报告当时写了「正文与题库：未发现『直接 API 只能单轮』的绝对表述」。
// 用户随后截图指出这句话就在课程页上 —— 核实后确认它存在于三处：
//   frontend/chapter/4/index.html、frontend/data/chapter_04.json、
//   frontend/data/knowledge-universe.json。
// 而当时的扫描清单里**没有 frontend/chapter/**，也没有 knowledge-universe.json。
//
// 也就是说：报告写的是「未发现」，实际情况是「没扫到」。这两件事必须分开说。
// 下面三条测试分别守住「这句话不得回来」「扫描范围不得再有盲区」「渲染页确实被读到」。
// ---------------------------------------------------------------------------

// 内容面清单：课程内容可能出现的每一个根目录都必须登记在这里。
// 新增内容目录时这条测试会失败，强制把它纳入审校范围 —— 而不是等下一次漏掉。
const CONTENT_ROOTS = [
  'frontend/data',     // 章节源数据、知识图谱、题库
  'frontend/static',   // 星海与知识图谱的渲染数据
  'frontend/chapter'   // 课程页面（渲染给学习者的最终形态，此前被整个漏掉）
];

const PROJECT_ROOT = path.resolve(__dirname, '..');

function collectFiles(root, pattern) {
  const found = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (pattern.test(entry.name)) found.push(full);
    }
  };
  walk(path.join(PROJECT_ROOT, root));
  return found;
}

test('every content root is registered and actually covered by the audit', () => {
  for (const root of CONTENT_ROOTS) {
    assert.ok(fs.existsSync(path.join(PROJECT_ROOT, root)), '内容根目录不存在（清单过期？）：' + root);
    assert.ok(collectFiles(root, /\.(json|html)$/).length > 0, '内容根目录下没有可审校文件：' + root);
  }
  // 渲染页必须真的被读到 —— 上一次的缺口正是「只扫了数据、没扫渲染结果」。
  const pages = collectFiles('frontend/chapter', /^index\.html$/);
  assert.ok(pages.length >= 10, '课程渲染页数量异常：' + pages.length);
});

test('the audited single-turn claim stays corrected in data, universe and rendered page', () => {
  const files = [
    'frontend/data/chapter_04.json',
    'frontend/data/knowledge-universe.json',
    'frontend/chapter/4/index.html'
  ];
  for (const file of files) {
    const text = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf8');
    assert.equal(text.includes('只能做单轮问答'), false,
      file + ' 仍在断言「直接调用 LLM API 只能做单轮问答」');
    assert.ok(text.includes('无状态'), file + ' 应改为说明 API 是无状态的，多轮靠应用携带历史');
  }
});

test('rendered chapter pages are readable and non-trivial', () => {
  const pages = collectFiles('frontend/chapter', /^index\.html$/);
  for (const page of pages) {
    const text = fs.readFileSync(page, 'utf8');
    assert.ok(text.length > 500, '课程页内容异常短：' + path.relative(PROJECT_ROOT, page));
  }
});
