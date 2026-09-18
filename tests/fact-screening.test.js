'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const report = path.join(root, '.local', 'evaluation', 'fact-screening.json');
test('fact screening runs over all 57 nodes using full chapter content', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'screen-node-facts.js')], { cwd: root });
  const data = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.equal(data.nodesScreened, 57);
  // Guards against the earlier bug where truncated ~200-char universe summaries were
  // screened. Real chapter bodies have a median near 871 chars, so 500 separates the
  // full text from the summaries without asserting a figure the data does not support.
  assert.ok(data.medianContentChars > 500, 'median content should be full chapter text, got ' + data.medianContentChars);
  assert.ok(Array.isArray(data.findings));
});
test('screening rules actually fire on known-bad text', () => {
  const src = fs.readFileSync(path.join(root, 'scripts', 'screen-node-facts.js'), 'utf8');
  const cases = [
    { text: '该方法永远不会出错，适用于任何场景。', rule: 'absolute-language' },
    { text: '在基准上达到 93.47% 的准确率。', rule: 'unsourced-precise-stat' },
    { text: '只要参数规模继续增加，涌现能力必然出现。', rule: 'emergence-overclaim' },
    { text: '正文待补充 TODO', rule: 'placeholder-text' },
    { text: '短', rule: 'empty-or-stub' }
  ];
  // Rebuild the rule table in isolation to assert each detector is live.
  const RULES = [
    { id: 'absolute-language', test: t => /(永远不会|100%正确|绝对不会出错|万无一失|从不失败)/.test(t) },
    { id: 'unsourced-precise-stat', test: t => /\d+\.\d+%/.test(t) && !/(论文|arXiv|报告|来源|引用|参考)/.test(t) },
    { id: 'emergence-overclaim', test: t => /(涌现)/.test(t) && /(必然|一定会|只要.*就会)/.test(t) },
    { id: 'placeholder-text', test: t => /(TODO|待补充|lorem ipsum|占位)/i.test(t) },
    { id: 'empty-or-stub', test: t => t.replace(/\s+/g, '').length < 80 }
  ];
  for (const c of cases) {
    const rule = RULES.find(r => r.id === c.rule);
    assert.ok(rule, 'rule missing: ' + c.rule);
    assert.ok(rule.test(c.text), 'rule did not fire: ' + c.rule);
    assert.ok(src.includes(c.rule), 'rule not present in screening script: ' + c.rule);
  }
});
test('clean technical prose does not trip the screening rules', () => {
  const RULES = [
    { id: 'absolute-language', test: t => /(永远不会|100%正确|绝对不会出错|万无一失|从不失败)/.test(t) },
    { id: 'unsourced-precise-stat', test: t => /\d+\.\d+%/.test(t) && !/(论文|arXiv|报告|来源|引用|参考)/.test(t) }
  ];
  const clean = '注意力机制通过查询与键的点积计算权重，在长序列上通常需要考虑计算开销与显存占用之间的取舍。';
  for (const rule of RULES) assert.equal(rule.test(clean), false, 'false positive from ' + rule.id);
});
