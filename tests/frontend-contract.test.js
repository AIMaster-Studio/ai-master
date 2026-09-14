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
