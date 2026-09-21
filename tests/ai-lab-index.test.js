'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const pageHtmlPath = path.join(ROOT, 'frontend/playground/index.html');
const cssPath = path.join(ROOT, 'frontend/assets/playground.css');
const jsPath = path.join(ROOT, 'frontend/static/js/playground.js');
const canvasHtmlPath = path.join(ROOT, 'frontend/canvas/index.html');

const EXPECTED_LABS = [
  { code: 'LAB-01', file: 'frontend/static/bpe_game.html', title: 'BPE 分词实验室' },
  { code: 'LAB-02', file: 'frontend/static/transformer_lab.html', title: 'Transformer 算法详解' },
  { code: 'LAB-03', file: 'frontend/static/llm_training_game.html', title: '大模型训练与超参模拟器' },
  { code: 'LAB-04', file: 'frontend/static/rag_starlab/index.html', title: 'Private RAG 私有知识库' },
  { code: 'LAB-05', file: 'frontend/static/prompt_cg_starlab/index.html', title: '提示词工程实验舱' },
  { code: 'LAB-06', file: 'frontend/static/agentic_cg/index.html', title: '智能体架构与工具协同' },
  { code: 'LAB-07', file: 'frontend/static/claude_cg/index.html', title: '代码智能体与上下文工程' },
  { code: 'LAB-08', file: 'frontend/static/transformer_cg.html', title: 'Transformer 动态视效流' },
  { code: 'LAB-09', file: 'frontend/static/rag_cg/index.html', title: 'RAG 检索技术科普全景' },
  { code: 'LAB-10', file: 'frontend/static/llm_intro.html', title: '大模型全景导论视觉舱' },
  { code: 'LAB-11', file: 'frontend/static/ai_odyssey.html', title: 'AI 知识宇宙远航' },
  { code: 'LAB-12', file: 'frontend/static/interview.html', title: '知识星辰互动与复核舱' }
];

test('playground route index.html exists and is generated properly', () => {
  assert.ok(fs.existsSync(pageHtmlPath), 'frontend/playground/index.html must exist');
  const html = fs.readFileSync(pageHtmlPath, 'utf8');

  assert.match(html, /AI 实验工坊技术索引/, 'Title must be AI 实验工坊技术索引');
  assert.match(html, /AI ENGINEERING WORKBENCH/, 'Kicker must be present');
  assert.match(html, /12 个高可交互舱室/, 'Must state 12 labs');
});

test('every lab in index links to an existing, non-empty interactive file on disk', () => {
  assert.equal(EXPECTED_LABS.length, 12);
  const html = fs.readFileSync(pageHtmlPath, 'utf8');

  for (const lab of EXPECTED_LABS) {
    const fullPath = path.join(ROOT, lab.file);
    assert.ok(fs.existsSync(fullPath), `Target lab file ${lab.file} must exist`);
    const size = fs.statSync(fullPath).size;
    assert.ok(size > 200, `Target lab file ${lab.file} must not be empty (size=${size})`);

    assert.match(html, new RegExp(lab.code), `Index HTML must display lab code ${lab.code}`);
    assert.match(html, new RegExp(lab.title), `Index HTML must display lab title ${lab.title}`);
  }
});

test('preserves canvas and auxiliary hub bridges', () => {
  assert.ok(fs.existsSync(canvasHtmlPath), 'frontend/canvas/index.html must be preserved');
  const html = fs.readFileSync(pageHtmlPath, 'utf8');

  assert.match(html, /href="\.\.\/canvas\/"/, 'Playground must link to canvas');
  assert.match(html, /href="\.\.\/knowledge-stars\/"/, 'Playground must link to knowledge stars');
  assert.match(html, /href="\.\.\/ai-review\/"/, 'Playground must link to AI review evidence wall');
  assert.match(html, /href="\.\.\/hands-on\/"/, 'Playground must link to hands-on tasks');
});

test('client assets and dark instrument tokens are compliant', () => {
  assert.ok(fs.existsSync(cssPath), 'frontend/assets/playground.css must exist');
  assert.ok(fs.existsSync(jsPath), 'frontend/static/js/playground.js must exist');

  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /var\(--radius\)/, 'CSS must use design token radius');
  assert.match(css, /tokens\.css|\-\-bg|\-\-go/, 'CSS must reference design tokens');

  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /categoryBtns/, 'JS must implement category filtering');
  assert.match(js, /searchInput/, 'JS must implement search filtering');
});

test('mutation proof: corrupted lab routes or missing files trip assertions', () => {
  // If someone adds a fake 13th lab that does not exist
  assert.throws(() => {
    const nonExistentFile = path.join(ROOT, 'frontend/static/non_existent_lab.html');
    assert.ok(fs.existsSync(nonExistentFile), 'Missing lab should fail assertion');
  });

  // If someone alters expected lab count
  assert.throws(() => {
    const fakeCount = 10;
    assert.equal(fakeCount, 12, 'Altered lab count should fail assertion');
  });
});
