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

test('every frontend script parses — there is no build step to catch syntax errors', () => {
  const files = jsFiles();
  assert.ok(files.length >= 15, '前端脚本数量异常，可能目录被改动：' + files.length);
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
