const fs = require('node:fs');
const path = require('node:path');
// Automated consistency screening over all 57 knowledge nodes.
// This is a machine screening for internally checkable defects. It is NOT a
// subject-matter factual certification and cannot confirm that a claim is true.
// Use the FULL chapter content, not the truncated universe summaries. Screening the
// short summaries produced zero findings simply because the text was ~200 chars.
const fsMod = require('node:fs');
const dataDir = path.join(__dirname, '..', 'frontend', 'data');
const nodes = [];
for (const file of fsMod.readdirSync(dataDir).filter(f => /^chapter_\d+\.json$/.test(f)).sort()) {
  const chapter = Number(/chapter_(\d+)/.exec(file)[1]);
  const doc = JSON.parse(fsMod.readFileSync(path.join(dataDir, file), 'utf8'));
  (doc.knowledge_points || []).forEach((kp, i) => {
    nodes.push({
      id: 'ch' + chapter + '-kp' + (i + 1),
      chapter,
      title: kp.title,
      text: String(kp.content || '')
    });
  });
}
if (nodes.length !== 57) throw new Error('expected 57 nodes, found ' + nodes.length);
const RULES = [
  { id: 'absolute-language', severity: 'medium', test: t => /(永远不会|100%正确|绝对不会出错|万无一失|从不失败)/.test(t),
    why: '绝对化表述在技术内容中通常不成立，需要限定条件。' },
  { id: 'unsourced-precise-stat', severity: 'high', test: t => /\d+\.\d+%/.test(t) && !/(论文|arXiv|报告|来源|引用|参考)/.test(t),
    why: '出现精确百分比但未给出来源，无法核验。' },
  { id: 'emergence-overclaim', severity: 'high', test: t => /(涌现)/.test(t) && /(必然|一定会|只要.*就会)/.test(t),
    why: '涌现能力存在度量假象争议，不应表述为必然规律。' },
  { id: 'unqualified-scale-claim', severity: 'medium', test: t => /(参数量|规模).{0,12}(越大越好|越多越好)/.test(t),
    why: '规模与效果的关系受数据与训练方式影响，不是单调保证。' },
  { id: 'empty-or-stub', severity: 'high', test: t => t.replace(/\s+/g, '').length < 80,
    why: '正文过短，不足以支撑该知识点的讲解。' },
  { id: 'placeholder-text', severity: 'high', test: t => /(TODO|待补充|lorem ipsum|占位)/i.test(t),
    why: '存在占位或未完成内容。' },
  // HTML is the intended storage format for these fields, so tag presence alone is not a
  // defect. Only flag entity escapes that would render literally to the learner.
  { id: 'broken-formula-markup', severity: 'low', test: t => /&(amp|lt|gt|nbsp|quot);/.test(t.replace(/<[^>]+>/g, '')),
    why: '正文中残留会直接显示给学习者的转义实体。' }
];
const findings = [];
for (const node of nodes) {
  // Evaluate prose with tags stripped so rules match what the learner actually reads.
  const prose = node.text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  for (const rule of RULES) {
    if (rule.test(rule.id === 'broken-formula-markup' ? node.text : prose.replace(/<[^>]+>/g, ' '))) {
      findings.push({ nodeId: node.id, chapter: node.chapter, title: node.title, rule: rule.id, severity: rule.severity, why: rule.why });
    }
  }
}
const byNode = new Map(nodes.map(n => [n.id, []]));
for (const f of findings) byNode.get(f.nodeId).push(f);
const report = {
  generatedAt: new Date().toISOString(),
  scope: 'all 57 knowledge nodes',
  method: 'deterministic rule-based screening for internally checkable defects',
  limitation: 'Machine screening only. A clean result means no rule fired, NOT that the content was verified as factually correct by a subject-matter expert.',
  nodesScreened: nodes.length,
  medianContentChars: (() => { const l = nodes.map(n => n.text.length).sort((a, b) => a - b); return l[Math.floor(l.length / 2)]; })(),
  nodesWithFindings: [...byNode.values()].filter(v => v.length).length,
  findingsBySeverity: findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {}),
  findings
};
const outDir = path.join(__dirname, '..', '.local', 'evaluation');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'fact-screening.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ nodes: nodes.length, nodesWithFindings: report.nodesWithFindings, bySeverity: report.findingsBySeverity, topRules: Object.entries(findings.reduce((a, f) => { a[f.rule] = (a[f.rule] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]) }));
