'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element(tagName) {
  const classes = new Set();
  const node = {
    tagName,
    className: '',
    textContent: '',
    href: '',
    target: '',
    children: [],
    listeners: {},
    attributes: {},
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); },
    addEventListener(type, listener) { this.listeners[type] = listener; },
    setAttribute(name, value) { this.attributes[name] = value; },
    replaceChildren(...items) { this.children = items; },
    querySelector() { return null; }
  };
  Object.defineProperty(node, 'textContent', {
    get() { return node._textContent || ''; },
    set(value) { node._textContent = String(value); }
  });
  return node;
}

test('knowledge stars keeps its text course links available when Three.js is missing', async () => {
  const scriptPath = path.resolve(__dirname, '../frontend/static/js/knowledge_stars.js');
  const script = fs.readFileSync(scriptPath, 'utf8');
  const summary = element('summary');
  const details = element('details');
  details.querySelector = selector => selector === 'summary' ? summary : null;
  const list = element('nav');
  const elements = new Map([
    ['#space', element('canvas')],
    ['#loading', element('div')],
    ['#errorCard', element('div')],
    ['#errorMessage', element('p')],
    ['#retryButton', element('button')],
    ['#knowledgePanel', element('aside')],
    ['#atlasPanel', element('aside')],
    ['#galaxyTitle', element('section')],
    ['#backButton', element('button')],
    ['#orbitHint', element('div')],
    ['#planetPreview', element('div')],
    ['#galaxyCount', element('dd')],
    ['#starCount', element('dd')],
    ['#completedCount', element('dd')],
    ['#progressSignal', element('span')],
    ['#starDirectory', details],
    ['#starDirectoryList', list]
  ]);
  const payload = {
    success: true,
    summary: { galaxies: 1, stars: 1, completed: 0 },
    galaxies: [{
      chapter: 1,
      name: '大模型基础原理',
      stars: [{ index: 0, title: '什么是大语言模型？', url: '../chapter/1/#kp-1' }]
    }]
  };
  let reloads = 0;
  const document = {
    querySelector: selector => elements.get(selector) || null,
    createElement: tagName => element(tagName),
    body: element('body'),
    documentElement: { classList: { contains: () => false } }
  };
  const context = {
    document,
    window: { matchMedia: () => ({ matches: false }), location: { reload() { reloads += 1; } } },
    fetch: async () => ({ ok: true, json: async () => payload }),
    console: { error() {} }
  };

  vm.runInNewContext(script, context, { filename: scriptPath });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(summary.textContent, '文字目录 · 1 个知识点');
  assert.equal(elements.get('#galaxyCount').textContent, '1');
  assert.equal(elements.get('#starCount').textContent, '1');
  assert.equal(elements.get('#completedCount').textContent, '');
  assert.equal(elements.get('#progressSignal').textContent, '静态课程浏览');
  assert.equal(list.children.length, 1);
  const link = list.children[0].children[1].children[0].children[0];
  assert.equal(link.textContent, '1.1 什么是大语言模型？');
  assert.equal(link.href, '../chapter/1/#kp-1');
  assert.equal(elements.get('#errorCard').classList.contains('show'), true);
  assert.equal(elements.get('#errorCard').classList.contains('directory-fallback'), true);
  assert.equal(elements.get('#errorCard').attributes['aria-live'], 'polite');
  assert.equal(elements.get('#loading').classList.contains('hide'), true);
  assert.match(elements.get('#errorMessage').textContent, /下方文字目录/);
  assert.equal(typeof elements.get('#retryButton').listeners.click, 'function');
  elements.get('#retryButton').listeners.click();
  assert.equal(reloads, 1);
});
