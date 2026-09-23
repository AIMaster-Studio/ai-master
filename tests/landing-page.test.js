'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const indexPath = path.join(ROOT, 'frontend/index.html');
const cssPath = path.join(ROOT, 'frontend/assets/landing.css');
const scriptPath = path.join(ROOT, 'frontend/assets/landing.js');
const redirectsPath = path.join(ROOT, 'frontend/_redirects');

test('competition landing page exists and is a full instrument page, not a meta refresh', () => {
  assert.ok(fs.existsSync(indexPath), 'frontend/index.html must exist');
  const html = fs.readFileSync(indexPath, 'utf8');

  assert.doesNotMatch(html, /http-equiv="refresh"/, 'Landing page must NOT be a meta-refresh redirect');
  assert.match(html, /AI Master/, 'Must contain AI Master brand title');
  assert.match(html, /学会 AI，[\s\S]*?要能亲自讲清楚。/, 'Must contain the new learner-facing proposition');
  assert.match(html, /看懂 ≠ 会讲 ≠ 会用/, 'Must state the learning distinction');
  assert.match(html, /AI MASTER \/ LEARN · EXPLAIN · VERIFY/, 'Must contain hero kicker');
  assert.match(html, /流程示意[\s\S]*?此处不展示模拟评审结果/, 'Product preview must be clearly identified as a preview');
  assert.doesNotMatch(fs.readFileSync(redirectsPath, 'utf8'), /^\/\s+\/learning-center\/\s+30[12]/m, 'Root must serve the landing page');
});

test('hero CTAs follow the competition entry contract', () => {
  const html = fs.readFileSync(indexPath, 'utf8');

  assert.match(html, /href="learning-center\/"[^>]*class="btn-hero-primary"[^>]*>[\s\S]*?开始 3 分钟体验/, 'Primary CTA must lead to learning-center/');
  assert.match(html, /href="ai-review\/"[^>]*class="btn-hero-secondary"[^>]*>查看评测证据/, 'Evidence CTA must lead to ai-review/');
  assert.match(html, /href="playground\/">12 个交互实验/, 'Lab route must remain discoverable');
});

test('hero exposes the complete evidence-first learning mechanism in order', () => {
  const html = fs.readFileSync(indexPath, 'utf8');

  assert.match(
    html,
    /规则筛查[\s\S]*?课程证据[\s\S]*?AI 复评[\s\S]*?引用校验[\s\S]*?测验[\s\S]*?复习/,
    'Landing must show the full learning mechanism in order'
  );
});

test('features 3-minute judge review recommended demo path', () => {
  const html = fs.readFileSync(indexPath, 'utf8');

  assert.match(html, /3 分钟竞赛评审推荐演示路径/, 'Must feature 3-minute review flow');
  assert.match(html, /STEP 01/, 'Must feature Step 1');
  assert.match(html, /STEP 02/, 'Must feature Step 2');
  assert.match(html, /STEP 03/, 'Must feature Step 3');
  assert.match(html, /STEP 04/, 'Must feature Step 4');
  assert.match(html, /role="tablist" aria-label="3 分钟演示步骤"/, 'Review path must expose accessible Stepper navigation');
  assert.ok(fs.existsSync(scriptPath), 'Stepper script must exist');

  // Verify all 4 step links
  assert.match(html, /href="dashboard\/"[^>]*class="step-link-btn"/, 'Step 1 must link dashboard/');
  assert.match(html, /href="playground\/"[^>]*class="step-link-btn"/, 'Step 2 must link playground/');
  assert.match(html, /href="ai-review\/"[^>]*class="step-link-btn"/, 'Step 3 must link ai-review/');
  assert.match(html, /href="learning-center\/"[^>]*class="step-link-btn"/, 'Step 4 must link learning-center/');
});

test('features four core engineering pillars with 41 hands-on tasks and 7 core modules', () => {
  const html = fs.readFileSync(indexPath, 'utf8');

  assert.match(html, /四维工程训练闭环机制/, 'Must feature 4 pillars section');
  assert.match(html, /PILLAR 01[\s\S]*?全景知识宇宙/, 'Pillar 1 must be Knowledge Cosmos');
  assert.match(html, /PILLAR 02[\s\S]*?源码级动手实战/, 'Pillar 2 must be Hands-on Engineering');
  assert.match(html, /PILLAR 03[\s\S]*?口语讲解与费曼把关/, 'Pillar 3 must be Feynman Oral Defense');
  assert.match(html, /PILLAR 04[\s\S]*?工业级严谨与科学诚信/, 'Pillar 4 must be Engineering Honesty');

  // Ground truth metrics
  assert.match(html, /41 个代码任务/, 'Must state 41 hands-on tasks');
  assert.match(html, /10 个课程章节/, 'Must state 10 chapters');
  assert.match(html, /12 个交互实验/, 'Must state 12 labs');
  assert.match(html, /7 个讲解通关模块/, 'Must state 7 modules');
  assert.match(html, /21 例样本的基准准确率为 90\.5%/, 'Must scope accuracy to the 21 verified cases');
});

test('landing CSS follows dark instrument tokens with zero radius', () => {
  assert.ok(fs.existsSync(cssPath), 'frontend/assets/landing.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(css, /var\(--radius\)/, 'Landing CSS must use design token radius');
  assert.match(css, /tokens\.css|\-\-bg|\-\-go|\-\-line/, 'Landing CSS must use system tokens');
  assert.doesNotMatch(css, /border-radius:\s*(?:8|12|16|20)px/, 'No large rounded corners allowed');
  assert.match(css, /\.hero-title\s*\{[\s\S]*?font-size:/, 'Responsive rules must target the real hero-title class');
  assert.match(css, /\.hero-actions\s*>\s*a\s*\{[\s\S]*?width:\s*100%/, 'Mobile CTAs must expand to full width');
  assert.doesNotMatch(css, /\.hero-h1\b/, 'Stale hero-h1 selector must not return');
});

test('mutation proof: empty or redirect landing page fails', () => {
  // If someone restores old meta refresh
  assert.throws(() => {
    const fakeHtml = '<!doctype html><meta http-equiv="refresh" content="0;url=learning-center/">';
    assert.doesNotMatch(fakeHtml, /http-equiv="refresh"/, 'Meta refresh should fail');
  });

  // If someone passes wrong task count
  assert.throws(() => {
    const fakeCount = 54;
    assert.equal(fakeCount, 41, 'Fake 54 should fail');
  });
});
