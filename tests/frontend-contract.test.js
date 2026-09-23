'use strict';

// 前端契约测试。
//
// 这里只做两件**可确定验证**的事，不做「看起来在测 UI」的假测试：
//   ① 所有前端 JS 都能通过语法解析 —— 前端没有构建步骤，语法错误只会在浏览器里炸，
//      而 CI 跑不到浏览器，所以这一步是唯一能在提交前拦住它的地方；
//   ② 讲解反馈面板发出的类名，样式表里确实有定义 —— 这是跨文件契约。
//      重命名 JS 里的类名却忘了改 CSS，页面不会报错，只会静默失去样式，
//      是最容易长期漏掉的一类退化。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS_DIR = path.resolve(__dirname, '../frontend/static/js');
const WORKSPACE_CSS = path.resolve(__dirname, '../frontend/static/css/learning-workspace.css');
const WORKSPACE_JS = path.join(JS_DIR, 'learning-workspace.js');
const WORKSPACE_HTML = path.resolve(__dirname, '../frontend/learning-center/index.html');

function jsFiles() {
  return fs.readdirSync(JS_DIR).filter(name => name.endsWith('.js')).map(name => path.join(JS_DIR, name));
}

// 产品契约：learning-center/index.html 真正加载的核心脚本。
// 不纳入 Firebase（可降级，待 Wave C）与 vendored / avatar-widget（不在本目录）。
const REQUIRED_JS = [
  'ai-config.js',
  'build-info.js',
  'learning-local-fallback.js',
  'learning-workspace.js',
];

test('core frontend entry scripts exist — the maintained learning workspace must keep loading', () => {
  for (const name of REQUIRED_JS) {
    assert.ok(fs.existsSync(path.join(JS_DIR, name)), '缺少核心前端脚本：' + name);
  }
});

test('every frontend script parses — there is no build step to catch syntax errors', () => {
  const files = jsFiles();
  // 不再用「至少 N 个 .js」魔术数判断目录健康：删除死代码不应让契约变红。
  // 目录误删由下方「核心入口存在」用例守住；此处只把实际存在的脚本逐个解析。
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotThrow(
      () => new vm.Script(source, { filename: file }),
      '语法错误：' + path.relative(path.resolve(__dirname, '..'), file)
    );
  }
});

test('the explanation evidence panel keeps its classes defined in the stylesheet', () => {
  const script = fs.readFileSync(WORKSPACE_JS, 'utf8');
  const css = fs.readFileSync(WORKSPACE_CSS, 'utf8');

  // 面板必须真的接进反馈渲染路径，而不是定义了却没被调用。
  assert.match(script, /function evidencePanel\(/, '证据面板函数缺失');
  assert.match(script, /evidencePanel\(result\)/, '证据面板未被接入 feedbackPanel');
  assert.match(script, /result\.evidenceIntegrity/, '未处理引用复核失败这一状态');

  for (const className of ['evidence', 'evidence-warn', 'evidence-none', 'evidence-list', 'evidence-ref', 'evidence-title', 'evidence-path']) {
    assert.ok(script.includes(className), 'JS 未使用类名：' + className);
    assert.ok(css.includes('.' + className), '样式表缺少类名：' + className);
  }
});

test('the memory view is reachable from the nav and states its generation mode', () => {
  const script = fs.readFileSync(WORKSPACE_JS, 'utf8');
  const css = fs.readFileSync(WORKSPACE_CSS, 'utf8');
  const html = fs.readFileSync(WORKSPACE_HTML, 'utf8');

  assert.ok(html.includes('data-view="memory"'), '导航里没有记忆视图入口');
  assert.match(script, /function renderMemory\(/, '记忆视图函数缺失');
  assert.match(script, /app\.view === 'memory'\) return renderMemory\(\)/, '记忆视图未接入 render 分发');
  assert.match(script, /memory\/inspect/, '未调用记忆接口');

  // 页面必须把「确定性聚合 / 不是模型摘要 / 不跨设备同步」写在正文里。
  // 少了这三句，读者会把计数聚合误当成模型对学习风格的理解，也会误以为记忆有云端副本。
  assert.match(script, /确定性聚合/, '未说明生成方式');
  assert.match(script, /不是模型摘要/, '未否认模型摘要');
  assert.match(script, /不跨设备同步/, '未说明数据范围');
  // L3 是按需生成的，空白必须被解释，否则会被读成「记忆是空的」。
  assert.match(script, /按需生成/, '未说明 L3 需要手动生成');

  for (const className of ['memory-surface', 'memory-md', 'memory-l3']) {
    assert.ok(script.includes(className), 'JS 未使用类名：' + className);
    assert.ok(css.includes('.' + className), '样式表缺少类名：' + className);
  }
});

test('the knowledge base view states whether retrieval is semantic', () => {
  const script = fs.readFileSync(WORKSPACE_JS, 'utf8');
  const css = fs.readFileSync(WORKSPACE_CSS, 'utf8');
  const html = fs.readFileSync(WORKSPACE_HTML, 'utf8');

  assert.ok(html.includes('data-view="rag"'), '导航里没有知识库入口');
  assert.match(script, /function renderRag\(/, '知识库视图函数缺失');
  assert.match(script, /app\.view === 'rag'\) return renderRag\(\)/, '知识库视图未接入 render 分发');
  assert.match(script, /rag\/search/, '未调用检索接口');
  assert.match(script, /rag\/course\/seed/, '未提供课程库建立入口');

  // 默认嵌入只做词面重合。页面必须让「检索不到」不被误读成「课程里没有」。
  assert.match(script, /同义改写/, '未提示词面重合嵌入的召回局限');
  assert.match(script, /不代表课程里没有/, '未把召回局限与内容缺失区分开');
  // 引擎与后端的不可用状态必须显示原因，而不是只显示「不可用」。
  assert.match(script, /degradeReason/, '未展示索引后端降级原因');
  assert.match(script, /engine\.reason/, '未展示引擎不可用原因');

  for (const className of ['rag-results', 'rag-hit', 'rag-hit-head']) {
    assert.ok(script.includes(className), 'JS 未使用类名：' + className);
    assert.ok(css.includes('.' + className), '样式表缺少类名：' + className);
  }
});

test('the research view exposes the tool trace and explains that ask_user pauses rather than fails', () => {
  const script = fs.readFileSync(WORKSPACE_JS, 'utf8');
  const css = fs.readFileSync(WORKSPACE_CSS, 'utf8');
  const html = fs.readFileSync(WORKSPACE_HTML, 'utf8');

  assert.ok(html.includes('data-view="research"'), '导航里没有深度研究入口');
  assert.match(script, /function renderResearch\(/, '研究视图函数缺失');
  assert.match(script, /app\.view === 'research'\) return renderResearch\(\)/, '研究视图未接入 render 分发');
  assert.match(script, /agent\/run/, '未调用 agent 接口');
  // 续跑必须回传 sessionId，否则会开新会话并丢掉已有工具轨迹。
  assert.match(script, /sessionId:String\(values\.get\('sessionId'\)\)/, 'ask_user 续跑未回传 sessionId');

  // 两条必须让用户看见的事实：轨迹可核对；暂停不是失败。
  assert.match(script, /工具调用轨迹/, '未展示工具调用轨迹');
  assert.match(script, /这是暂停，不是失败/, '未说明 ask_user 是暂停');
  assert.match(script, /不会重跑已经完成的调用/, '未说明续跑语义');
  assert.match(script, /不提供代码执行工具/, '未说明没有代码执行工具');

  for (const className of ['tool-list', 'trace-list', 'trace-index', 'research-answer']) {
    assert.ok(script.includes(className), 'JS 未使用类名：' + className);
    assert.ok(css.includes('.' + className), '样式表缺少类名：' + className);
  }
});

test('the memory graph is rendered from the graph endpoint and shows empty surfaces', () => {
  const script = fs.readFileSync(WORKSPACE_JS, 'utf8');
  const css = fs.readFileSync(WORKSPACE_CSS, 'utf8');

  assert.match(script, /function memoryGraphHtml\(/, '记忆图谱渲染函数缺失');
  assert.match(script, /memoryGraphHtml\(app\.memory\.graph\)/, '图谱未接入 inspect 返回的 graph 字段');
  assert.ok(css.includes('.memory-graph'), '样式表缺少 .memory-graph');

  // 三条刻意的设计选择，都不该被顺手改掉：
  //   ① 空数据要有可读文案，而不是渲染一张空图；
  //   ② 没有事件的面要画出来（灰显），不能隐藏 —— 否则「没数据」与「不存在」看起来一样；
  //   ③ 线宽要压缩量级（log），否则 1 条事件的线会细到看不见。
  assert.match(script, /还没有事件轨迹/, '未处理无数据的情况');
  assert.match(script, /暂无数据/, '未标注灰显面的状态');
  assert.match(script, /Math\.log2/, '线宽未做量级压缩');
  assert.match(script, /不是不存在/, '未说明灰显含义');
  // 内联 SVG，不引图表库（前端没有构建步骤）。
  assert.match(script, /<svg class="memory-graph"/, '应生成内联 SVG');
});

test('the memory empty state is reachable and offers a next step, not a no-op', () => {
  const script = fs.readFileSync(WORKSPACE_JS, 'utf8');
  const css = fs.readFileSync(WORKSPACE_CSS, 'utf8');

  // 这条用例钉的是一个**已经发生过一次的具体退化**（docs/ican/walkthrough-2026-09-15.md 待办 3）：
  // 空分支原先写成 `surfaces.length ? 面卡片 : 空文案`，但 surfaces 是**全部已登记的记忆面**
  // （无活动时 events 为 0），长度恒等于面数、永不为 0 —— 所以那句空文案永远不会渲染。
  // 新访客实际看到的是一屏「5 个面全空」，而那一屏没有任何指向「去做什么会产生记录」的入口。
  //
  // 断言的是**结构**（判据字段 / 入口存在 / 生成按钮只在有事件时出现）。
  // 它证明不了「用户因此更满意」——那需要真实点击与满意度测量，本文件不声称覆盖。

  // ① 空判据必须来自事件总数；用 surfaces 长度判空必然写出不可达分支。
  assert.match(script, /const hasEvents = Number\(memory\.l1Total \|\| 0\) > 0/, '记忆空判据未使用 l1Total');
  assert.doesNotMatch(script, /surfaces\.length \?/, '记忆面仍以 surfaces.length 判空，空分支不可达');

  // ② 空状态必须给出可点击的下一步，而不是只有一句解释。
  const noActivity = script.match(/const noActivityHtml =[\s\S]*?data-view="learn"[\s\S]*?<\/div>';/);
  assert.ok(noActivity, '记忆空状态没有指向学习视图的入口');
  assert.ok(css.includes('.empty-state'), '样式表缺少 .empty-state');

  // ③ 零事件时不提供 L3 生成：在零事件上生成的综合是一份「0 次、通过率 0%」的文件，
  //    会被读成「学得不好」，而实际情况是「还没开始」。
  assert.equal((script.match(/data-action="synthesize-memory"/g) || []).length, 1, 'L3 生成入口应只出现一次');
  const synthesizeAt = script.indexOf('data-action="synthesize-memory"');
  const zeroEventNoteAt = script.indexOf('在零事件上生成的综合');
  assert.ok(synthesizeAt > 0 && zeroEventNoteAt > synthesizeAt, 'L3 生成按钮未限定在有事件的分支，或未说明零事件为何不生成');
});

// Knowledge Stars 进度契约（防止 Design System 重新生成时静默丢回归）。
// 钉住的是：规范源模板 -> 生成页 的确定性关系，以及诚实进度语义。
// knowledge_stars.js 依赖 #progressSignal / #panelProgress / knowledge-progress.js，
// 若模板或生成页悄悄丢掉它们，运行时不会报错，只会静默失效——正是本契约要拦住的。
test('knowledge stars keeps its honest progress contract across source and generated page', () => {
  const SRC = path.resolve(__dirname, '../frontend/static/knowledge_stars.html');
  const GEN = path.resolve(__dirname, '../frontend/knowledge-stars/index.html');
  const PROGRESS_JS = path.resolve(__dirname, '../frontend/static/js/knowledge-progress.js');
  const STARS_JS = path.resolve(__dirname, '../frontend/static/js/knowledge_stars.js');

  // 1. 规范源模板存在
  assert.ok(fs.existsSync(SRC), '缺少规范源模板 knowledge_stars.html');
  const src = fs.readFileSync(SRC, 'utf8');

  // 2. 源模板包含进度契约元素与脚本
  assert.match(src, /id="progressSignal"/, '源模板缺少 #progressSignal');
  assert.match(src, /id="panelProgress"/, '源模板缺少 #panelProgress');
  assert.match(src, /src="js\/knowledge-progress\.js/, '源模板未加载 knowledge-progress.js');

  // 3. 生成页存在且包含契约（含 ../static 相对路径）
  assert.ok(fs.existsSync(GEN), '缺少生成页 knowledge-stars/index.html');
  const gen = fs.readFileSync(GEN, 'utf8');
  assert.match(gen, /id="progressSignal"/, '生成页缺少 #progressSignal');
  assert.match(gen, /id="panelProgress"/, '生成页缺少 #panelProgress');
  assert.match(gen, /src="\.\.\/static\/js\/knowledge-progress\.js/, '生成页未加载 ../static/js/knowledge-progress.js');

  // 4. 诚实语义：描述“关联/通过/完成”，不得暗示逐个知识点的独立测评
  for (const doc of [src, gen]) {
    assert.match(doc, /不代表逐个知识点经过独立测验/, '缺少诚实进度说明');
    assert.doesNotMatch(doc, /0% EXPLORED/, '出现夸大测量含义的 “0% EXPLORED”');
  }

  // 5. knowledge-progress.js 仍存在
  assert.ok(fs.existsSync(PROGRESS_JS), 'knowledge-progress.js 已丢失');

  // 6. knowledge_stars.js 的依赖不能再次变成孤儿：它引用的元素/接口必须在页面契约内
  const starsJs = fs.readFileSync(STARS_JS, 'utf8');
  if (starsJs.includes('#panelProgress')) {
    assert.match(gen, /id="panelProgress"/, 'knowledge_stars.js 引用 #panelProgress 但生成页缺失');
  }
  if (starsJs.includes('#progressSignal')) {
    assert.match(gen, /id="progressSignal"/, 'knowledge_stars.js 引用 #progressSignal 但生成页缺失');
  }
  if (starsJs.includes('AIMasterKnowledgeProgress')) {
    assert.match(gen, /src="\.\.\/static\/js\/knowledge-progress\.js/, 'knowledge_stars.js 依赖 AIMasterKnowledgeProgress 但生成页未加载其脚本');
  }
});

// T-1 —— 学习工作台 token 决议契约。
//
// 契约由三件事组成，全部按"机制"判定，不依赖行号、不写死变量个数或声明次数：
//   ① 依赖必须存在：learning-workspace.css 必须有一条生效的 tokens.css 依赖路径；
//   ② 机制必须唯一：该路径只能有一条，否则同一张 token 表被加载两次；
//   ③ 变量必须可解析：工作台用到的每个 var(--x) 都能由 tokens.css
//      或工作台有意保留的局部 :root 定义解析。
//
// 本页面采用的规范机制：learning-center/index.html 用 <link> 加载 tokens.css，
// 且必须先于 learning-workspace.css。
test('learning workspace has exactly one token dependency and resolves every token it uses', () => {
  const TOKENS = path.resolve(__dirname, '../frontend/assets/tokens.css');
  const TOKENS_HREF = '../assets/tokens.css';
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');

  const html = fs.readFileSync(WORKSPACE_HTML, 'utf8');
  const wsSrc = stripComments(fs.readFileSync(WORKSPACE_CSS, 'utf8'));

  // 收集页面上的样式表（不假设属性顺序）。
  const stylesheets = [];
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (tag[0].match(/\brel=["']([^"']*)["']/i) || [])[1] || '';
    const href = (tag[0].match(/\bhref=["']([^"']*)["']/i) || [])[1] || '';
    if (href && rel.split(/\s+/).includes('stylesheet')) stylesheets.push(href.replace(/[?#].*$/, ''));
  }

  // ① 依赖存在：页面必须显式加载 tokens.css。
  const tokenSheets = stylesheets.filter((href) => path.posix.basename(href) === 'tokens.css');
  assert.equal(
    tokenSheets.length,
    1,
    '缺少或重复的 token 依赖：learning-center 应当恰好一条 <link> 加载 tokens.css，实际 ' + tokenSheets.length + ' 条',
  );
  assert.equal(tokenSheets[0], TOKENS_HREF, 'token 依赖路径不是预期值：' + tokenSheets[0]);

  // ② 机制唯一：页面加载的其它样式表都不得再 @import 同一张 token 表。
  const tokenImporters = [];
  const collectImports = (css) => [...stripComments(css).matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/g)].map((m) => m[1]);
  for (const href of stylesheets) {
    if (path.posix.basename(href) === 'tokens.css') continue;
    const file = path.resolve(path.dirname(WORKSPACE_HTML), href);
    if (!fs.existsSync(file)) continue;
    if (collectImports(fs.readFileSync(file, 'utf8')).some((u) => path.posix.basename(u) === 'tokens.css')) {
      tokenImporters.push(href);
    }
  }
  // 工作台样式自身也算一份（它在上面的循环里已被覆盖，这里显式断言以点名失败原因）。
  if (collectImports(wsSrc).some((u) => path.posix.basename(u) === 'tokens.css')) tokenImporters.push('learning-workspace.css');
  const seen = new Set();
  const duplicateImporters = tokenImporters.filter((href) => {
    const key = path.posix.basename(href);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  assert.deepEqual(
    duplicateImporters,
    [],
    '重复加载 token 表：页面已用 <link> 加载 tokens.css，以下样式表又 @import 了它 → ' + duplicateImporters.join(', '),
  );

  // ③ 加载顺序：tokens.css 必须先于工作台样式，变量才能被后者使用。
  const tokensAt = stylesheets.findIndex((href) => path.posix.basename(href) === 'tokens.css');
  const workspaceAt = stylesheets.findIndex((href) => path.posix.basename(href) === 'learning-workspace.css');
  assert.ok(workspaceAt >= 0, 'learning-center 未加载 learning-workspace.css');
  assert.ok(tokensAt < workspaceAt, 'tokens.css 必须先于 learning-workspace.css 加载');

  // ④ 变量可解析：tokens.css 的共享定义 + 工作台有意保留的局部 :root 定义。
  const defined = new Set();
  for (const m of stripComments(fs.readFileSync(TOKENS, 'utf8')).matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
  for (const root of wsSrc.matchAll(/:root\s*\{([\s\S]*?)\}/g)) {
    for (const m of root[1].matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
  }
  const used = [...wsSrc.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
  assert.ok(used.length > 0, '工作台样式未使用任何变量，契约失去意义');
  const missing = [...new Set(used.filter((name) => !defined.has(name)))];
  assert.deepEqual(missing, [], '存在未解析的设计变量：' + missing.join(', '));
});
// T-2 —— Trae 教程构建产物新鲜度契约（仅限 trae_tutorial/ 目录）。
// 钉住的事实：该目录曾同时躺着新旧两套哈希构建（.js/.css/.map 共 4 个过期文件，
// 约 2.6 MB），旧产物无任何引用。允许 bundler 产物内合理分块，只拦"三无"过期文件。
test('trae tutorial keeps no stale hashed bundles beside the active ones', () => {
  const DIR = path.resolve(__dirname, '../frontend/static/trae_tutorial');
  const ASSETS = path.join(DIR, 'assets');
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const files = fs.readdirSync(ASSETS);

  // 页面直接引用的顶层产物。
  const referenced = new Set();
  for (const m of html.matchAll(/["'](?:\.\/)?assets\/([^"'?#]+)/g)) referenced.add(m[1]);
  assert.ok(referenced.size > 0, 'trae 教程页未引用任何产物，契约失去意义');

  // 活跃产物源码：用于识别其内部 import 的合法分块，及 .map 被宣告情况。
  let activeCode = '';
  for (const name of files) {
    if ((name.endsWith('.js') || name.endsWith('.css')) && referenced.has(name)) {
      activeCode += fs.readFileSync(path.join(ASSETS, name), 'utf8');
    }
  }

  const stale = [];
  for (const name of files) {
    if (name.endsWith('.js') || name.endsWith('.css')) {
      if (!referenced.has(name) && !activeCode.includes(name)) stale.push(name);
    } else if (name.endsWith('.map')) {
      const owner = name.slice(0, -4);
      const ownerActive = referenced.has(owner) || activeCode.includes(owner);
      if (!(ownerActive && activeCode.includes(name))) stale.push(name);
    }
  }
  assert.deepEqual(stale, [], '存在过期构建产物：' + stale.join(', '));
});
