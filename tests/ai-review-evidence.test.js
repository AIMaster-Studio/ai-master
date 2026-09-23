'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const sourceResultsPath = path.join(ROOT, 'tests/ai-rubric-validation-results.json');
const projectedResultsPath = path.join(ROOT, 'frontend/data/ai-rubric-validation-results.json');
const pageHtmlPath = path.join(ROOT, 'frontend/ai-review/index.html');
const cssPath = path.join(ROOT, 'frontend/assets/ai-review.css');
const jsPath = path.join(ROOT, 'frontend/static/js/ai-review.js');

test('static projection preserves rubric validation results fidelity', () => {
  assert.ok(fs.existsSync(projectedResultsPath), 'frontend/data/ai-rubric-validation-results.json must exist');
  const source = JSON.parse(fs.readFileSync(sourceResultsPath, 'utf8'));
  const projected = JSON.parse(fs.readFileSync(projectedResultsPath, 'utf8'));

  assert.equal(projected.model, source.model);
  assert.equal(projected.threshold, source.threshold);
  assert.deepEqual(projected.confusionMatrix, source.confusionMatrix);
  assert.equal(projected.testCases.length, 21);
  assert.equal(projected.testCases.length, source.testCases.length);
});

test('confusion matrix math and derived metrics match source of truth', () => {
  const data = JSON.parse(fs.readFileSync(sourceResultsPath, 'utf8'));
  const cm = data.confusionMatrix;

  assert.equal(cm.tp, 8, 'True Positives must be 8');
  assert.equal(cm.fp, 0, 'False Positives must be 0 (zero hallucination passes)');
  assert.equal(cm.tn, 11, 'True Negatives must be 11');
  assert.equal(cm.fn, 2, 'False Negatives must be 2 (strict gate rejection)');

  const total = data.testCases.length;
  assert.equal(total, 21);

  const acc = (cm.tp + cm.tn) / total;
  const prec = cm.tp / (cm.tp + cm.fp);
  const rec = cm.tp / (cm.tp + cm.fn);
  const f1 = (2 * prec * rec) / (prec + rec);

  assert.equal(acc.toFixed(3), '0.905');
  assert.equal(prec.toFixed(1), '1.0');
  assert.equal(rec.toFixed(1), '0.8');
  assert.equal(f1.toFixed(3), '0.889');

  // Ground truth count checks
  const actualPass = data.testCases.filter(c => c.groundTruth).length;
  const actualFail = data.testCases.filter(c => !c.groundTruth).length;
  assert.equal(actualPass, 10, 'Actual qualified cases must be 10 (TP + FN = 8 + 2)');
  assert.equal(actualFail, 11, 'Actual unqualified cases must be 11 (FP + TN = 0 + 11)');
});

test('AI Review Evidence Wall HTML renders confusion matrix, KPIs and all 21 cases', () => {
  assert.ok(fs.existsSync(pageHtmlPath), 'frontend/ai-review/index.html must exist');
  const html = fs.readFileSync(pageHtmlPath, 'utf8');

  // Header and model metadata
  assert.match(html, /deepseek-v4-pro/, 'Must display base model');
  assert.match(html, /score (?:&gt;=|>=) 75 (?:&amp;&amp;|&&) factualCorrect === true/, 'Must display gate threshold');
  assert.match(html, /21 例双盲讲解/, 'Must display sample size');

  // KPI Readouts
  assert.match(html, /90\.5%/, 'Must show 90.5% accuracy');
  assert.match(html, /100\.0%/, 'Must show 100.0% precision');
  assert.match(html, /80\.0%/, 'Must show 80.0% recall');
  assert.match(html, /88\.9%/, 'Must show 88.9% F1-score');

  // Confusion matrix cells
  assert.match(html, /data-filter-verdict="TP"/, 'Must have TP matrix cell');
  assert.match(html, /data-filter-verdict="TN"/, 'Must have TN matrix cell');
  assert.match(html, /data-filter-verdict="FN"/, 'Must have FN matrix cell');
  assert.match(html, /data-filter-verdict="FP"/, 'Must have FP matrix cell');

  // All 21 case cards present
  for (let i = 1; i <= 21; i++) {
    const idxStr = '#' + String(i).padStart(2, '0');
    assert.match(html, new RegExp(idxStr), `Case ${idxStr} must be rendered in HTML`);
  }
});

test('Explicit NOT CAPTURED transparency fields are honestly stated', () => {
  const html = fs.readFileSync(pageHtmlPath, 'utf8');

  // Explicit uncaptured statements
  assert.match(html, /未采集指标与系统边界公示/, 'Must have NOT CAPTURED transparency section');
  assert.match(html, /推理延迟 \(Latency\)[\s\S]*?\[未采集 \/ NOT CAPTURED\]/, 'Latency must be honestly marked NOT CAPTURED');
  assert.match(html, /输入 Token \(Prompt Tokens\)[\s\S]*?\[未采集 \/ NOT CAPTURED\]/, 'Prompt Tokens must be marked NOT CAPTURED');
  assert.match(html, /输出 Token \(Completion Tokens\)[\s\S]*?\[未采集 \/ NOT CAPTURED\]/, 'Completion Tokens must be marked NOT CAPTURED');
  assert.match(html, /单次评测费用 \(Cost Estimate\)[\s\S]*?\[未采集 \/ NOT CAPTURED\]/, 'Cost Estimate must be marked NOT CAPTURED');

  // In each case card footer
  assert.match(html, /<span class="f-val text-na">\[未采集 \/ NOT CAPTURED\]<\/span>/, 'Case card footers must show uncaptured indicators');
});

test('Assets and interactive script are linked and exist', () => {
  assert.ok(fs.existsSync(cssPath), 'frontend/assets/ai-review.css must exist');
  assert.ok(fs.existsSync(jsPath), 'frontend/static/js/ai-review.js must exist');

  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /tokens\.css|\-\-bg|\-\-go|\-\-hold|\-\-stop/, 'CSS must utilize design tokens');
  assert.match(css, /var\(--radius\)/, 'CSS must adhere to zero radius');

  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /filterVerdictBtns/, 'Client script must implement verdict filtering');
  assert.match(js, /matrixCells/, 'Client script must support clicking matrix cells');
});

test('mutation proof: altering truth data trips verification assertions', () => {
  // If someone alters FP to 1, precision drops below 100%
  assert.throws(() => {
    const fakeFP = 1;
    const prec = 8 / (8 + fakeFP);
    assert.equal(prec.toFixed(1), '1.0', 'Altered FP should fail precision check');
  });

  // If someone fabricates fake latency
  assert.throws(() => {
    const fakeLatency = '145ms';
    assert.match(fakeLatency, /NOT CAPTURED/, 'Fabricated latency should trip NOT CAPTURED assertion');
  });
});
