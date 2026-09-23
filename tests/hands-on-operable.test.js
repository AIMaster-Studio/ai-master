'use strict';
// 动手实践「从哪做」必须指向可操作的页面，而不是只能看的概念动画。
//
// 背景：ch3-t3 等 11 道题曾把 whereToStart 指到 *_cg 动画页（0 个输入框），学习者点进去
// 只能看视频，无法完成题目要求的产物。本合同把两件事钉死：
//   1. 只要 whereToStart 提到 *_cg 动画，就必须同时给出一个可操作入口（labs 工作台 / 交互实验页）；
//   2. 每个 labs/index.html#<id> 都要在 frontend/static/labs/labs.js 里真的有配置，且 id 与题号一致。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const CG_ONLY = /frontend\/static\/(?:prompt_cg\.html|transformer_cg\.html|(?:rag|claude|agentic)_cg\/index\.html)/;
const OPERABLE = /frontend\/static\/(?:labs\/index\.html#ch\d+-t\d+|rag_starlab\/index\.html|prompt_cg_starlab\/index\.html|transformer_lab\.html|bpe_game\.html|llm_training_game\.html)/;
const LAB_LINK = /frontend\/static\/labs\/index\.html#(ch\d+-t\d+)/g;

function loadLabs() {
  const sandbox = { window: {} };
  vm.runInNewContext(read('frontend/static/labs/labs.js'), sandbox);
  assert.ok(Array.isArray(sandbox.window.LABS) && sandbox.window.LABS.length > 0, 'labs.js 必须导出非空 window.LABS');
  return sandbox.window.LABS;
}

test('tasks that reference a *_cg animation also point at an operable page', () => {
  const handsOn = JSON.parse(read('frontend/data/hands-on-tasks.json'));
  const offenders = [];
  for (const chapter of handsOn.chapters) {
    for (const task of chapter.tasks) {
      if (CG_ONLY.test(task.whereToStart) && !OPERABLE.test(task.whereToStart)) offenders.push(task.id);
    }
  }
  assert.deepEqual(offenders, [], `以下题目的「从哪做」只指向概念动画，没有可操作入口：${offenders.join(', ')}`);
});

test('every labs/#id link resolves to a configured workbench with matching id and self-checks', () => {
  const handsOn = JSON.parse(read('frontend/data/hands-on-tasks.json'));
  const labs = loadLabs();
  const byId = new Map(labs.map(lab => [lab.id, lab]));
  const taskIds = new Set(handsOn.chapters.flatMap(c => c.tasks.map(t => t.id)));

  for (const lab of labs) {
    assert.ok(taskIds.has(lab.id), `labs.js 里的 ${lab.id} 在 hands-on-tasks.json 中不存在`);
    assert.ok(Array.isArray(lab.sections) && lab.sections.length >= 2, `${lab.id} 至少需要 2 个分区`);
    assert.ok(Array.isArray(lab.checks) && lab.checks.length >= 3, `${lab.id} 至少需要 3 条形式自检`);
    for (const check of lab.checks) {
      assert.equal(typeof check.test, 'function', `${lab.id} 的自检缺少 test 函数`);
      assert.equal(check.test({}, {}), false, `${lab.id} 的自检「${check.text}」在空表单上不应通过`);
    }
  }

  for (const chapter of handsOn.chapters) {
    for (const task of chapter.tasks) {
      for (const match of task.whereToStart.matchAll(LAB_LINK)) {
        assert.ok(byId.has(match[1]), `${task.id} 的「从哪做」指向不存在的工作台 labs/#${match[1]}`);
        assert.equal(match[1], task.id, `${task.id} 的「从哪做」指向了别的题的工作台 labs/#${match[1]}`);
      }
    }
  }
});

test('labs page is self-contained: no external scripts, no emoji, files under 1000 lines', () => {
  const html = read('frontend/static/labs/index.html');
  assert.ok(!/<script[^>]+src=["'](?:https?:)?\/\//.test(html), 'labs/index.html 不得加载外部脚本');
  assert.ok(!/<link[^>]+href=["'](?:https?:)?\/\//.test(html), 'labs/index.html 不得加载外部样式');
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const file of ['frontend/static/labs/index.html', 'frontend/static/labs/engine.js', 'frontend/static/labs/labs.js']) {
    const text = read(file);
    assert.ok(!emoji.test(text), `${file} 不应包含 emoji`);
    assert.ok(text.split('\n').length < 1000, `${file} 应少于 1000 行`);
  }
});
