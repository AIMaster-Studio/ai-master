const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
test('intro completion returns to course overview for each deployment prefix', () => {
  const html = read('frontend/static/llm_intro.html');
  const anchor = html.match(/<a[^>]*id="start-btn"[^>]*>/);
  assert.ok(anchor, 'CTA must remain a native keyboard-accessible link');
  const href = anchor[0].match(/href="([^"]+)"/)[1];
  for (const prefix of ['/', '/frontend/', '/ai-master/']) {
    assert.equal(new URL(href, 'https://example.com' + prefix + 'static/llm_intro.html').pathname, prefix + 'dashboard/');
  }
  assert.ok(!html.includes('window.__AI_APP_URL__'));
  assert.ok(!html.includes("document.body.style.opacity='0'"), 'Back navigation must not restore an invisible page');
});
test('UI refinement survives frontend rebuild and has accessibility fallbacks', () => {
  assert.ok(read('frontend/assets/frontend.css').startsWith('@import url("./ui-refinement.css");'));
  assert.ok(read('scripts/build_frontend_demo.py').includes('@import url("./ui-refinement.css");'));
  const css = read('frontend/assets/ui-refinement.css');
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /focus-visible/);
  assert.match(css, /overflow-x:auto/);
});
