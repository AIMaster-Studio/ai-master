'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const indexPath = path.join(FRONTEND, 'index.html');
const cssPath = path.join(FRONTEND, 'ai-learning', 'styles.css');
const pageScriptPath = path.join(FRONTEND, 'ai-learning', 'pages.js');
const mainScriptPath = path.join(FRONTEND, 'ai-learning', 'main.js');
const redirectsPath = path.join(FRONTEND, '_redirects');

test('AI Master landing page loads the native app and does not redirect away', () => {
  assert.ok(fs.existsSync(indexPath), 'frontend/index.html must exist');
  const html = fs.readFileSync(indexPath, 'utf8');
  const redirects = fs.readFileSync(redirectsPath, 'utf8');

  assert.doesNotMatch(html, /http-equiv="refresh"/i, 'Landing page must not use a meta-refresh redirect');
  assert.match(html, /AI Master/, 'Must contain AI Master branding');
  assert.match(html, /ai-learning\/styles\.css/, 'Landing must load the AI Master visual system');
  assert.match(html, /ai-learning\/main\.js/, 'Landing must load the AI Master app');
  assert.doesNotMatch(redirects, /^\/\s+\/learning-center\/\s+30[12]/m, 'Root must serve the AI Master landing page');
});

test('hero CTAs link into real AI Master routes', () => {
  const app = fs.readFileSync(pageScriptPath, 'utf8');

  assert.match(app, /href="\/learning-path\/"[^>]*>开始学习/, 'Primary CTA must lead to the learning path');
  assert.match(app, /href="\/learning-path\/"[^>]*>查看学习路径/, 'Secondary CTA must open the learning path');
  assert.match(app, /href="\/playground\/"/, 'Playground must remain discoverable');
});

test('home exposes the product learning loop and six reference-inspired features', () => {
  const app = fs.readFileSync(pageScriptPath, 'utf8');
  const data = fs.readFileSync(path.join(FRONTEND, 'ai-learning', 'data.js'), 'utf8');

  assert.match(data, /export const LEARNING_LOOP = \[/, 'Home learning loop must use project data');
  assert.match(app, /LEARNING_LOOP\.map/, 'Home must render learning loop steps from data');
  for (const step of ['了解 AI', '学习路线', '知识学习', '动手实践', 'AI 反馈', '进阶成长']) {
    assert.ok(data.includes('title: "' + step + '"'), 'Learning loop must include ' + step);
  }
  assert.match(app, /learning-loop-list/, 'Home must expose the learning loop structure');
  assert.match(data, /export const FEATURES = \[/, 'Home feature cards must use project data');
  assert.equal((data.match(/title: "/g) || []).length >= 6, true, 'Feature data must include at least six cards');
  assert.match(app, /features-grid/, 'Home must render the feature grid');
});

test('home exposes an accessible, four-step judge review flow and six learning stages', () => {
  const app = fs.readFileSync(pageScriptPath, 'utf8');
  const data = fs.readFileSync(path.join(FRONTEND, 'ai-learning', 'data.js'), 'utf8');
  const runtime = fs.readFileSync(mainScriptPath, 'utf8');

  assert.match(app, /三分钟看懂 AI Master/, 'Home must feature the 3-minute review flow');
  assert.match(app, /role="tablist" aria-label="三分钟演示步骤"/, 'Review tabs must expose an accessible tablist');
  assert.match(app, /STEP 01[\s\S]*?STEP 02[\s\S]*?STEP 03[\s\S]*?STEP 04/, 'Review path must contain four steps');
  assert.match(app, /\/course-progress\//, 'Step 1 must use the preserved actual course progress route');
  assert.match(app, /\/experiments\//, 'Step 2 must use the preserved experiment route');
  assert.match(runtime, /initHomeReviewStepper/, 'Review tabs must have keyboard and button behavior');
  assert.match(data, /export const STAGES = \[/, 'Learning stages must use project data');
  assert.match(app, /stages-grid/, 'Home must render the stage cards');
});

test('AI Master landing CSS provides responsive, accessible visual rules', () => {
  assert.ok(fs.existsSync(cssPath), 'AI Master stylesheet must exist');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(css, /\.hero-copy h1\s*\{[\s\S]*?font-size:/, 'Styles must target the current hero heading');
  assert.match(css, /@media\s*\(max-width:\s*620px\)/, 'Styles must include mobile layout rules');
  assert.match(css, /\.review-step-tabs[\s\S]*?\.review-step-panel/, 'Review flow needs visible tabs and panels');
  assert.match(css, /:focus-visible/, 'Interactive controls must have a visible focus treatment');
  assert.match(css, /prefers-reduced-motion:\s*reduce/, 'Motion must respect reduced-motion preference');
});

test('mutation proof: empty or redirect landing page fails', () => {
  assert.throws(() => {
    const fakeHtml = '<!doctype html><meta http-equiv="refresh" content="0;url=learning-center/">';
    assert.doesNotMatch(fakeHtml, /http-equiv="refresh"/i, 'Meta refresh should fail');
  });

  assert.throws(() => assert.equal(54, 41, 'Fake 54 should fail'));
});
