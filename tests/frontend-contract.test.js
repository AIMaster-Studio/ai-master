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
