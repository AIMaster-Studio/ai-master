const fs = require('node:fs');
const path = require('node:path');
// Builds 200 AI-generated explanation samples scored by two rule-based scorers (no human annotators).
// These are AI//rule-generated artefacts. They are NOT real student submissions and
// the two raters are NOT independent humans. Any report must say so.
const nodes = require('../.local/evaluation/course-nodes.json');
// Deterministic PRNG so the dataset is reproducible.
let seed = 20260918;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const sentences = text => text.split(/[。；\n]/).map(s => s.trim()).filter(s => s.length > 8);
// Defect injectors produce explanations that are genuinely wrong in a detectable way.
const defects = [
  { id: 'wrong-chapter', apply: (n, body) => ({ text: body + ' 本知识点出自第' + (n.chapter % 10 + 1) + '章。', truth: false }) },
  { id: 'absolute-claim', apply: (n, body) => ({ text: body + ' 该方法在所有任务上都能保证100%准确，永远不会出错。', truth: false }) },
  { id: 'fabricated-number', apply: (n, body) => ({ text: body + ' 实验表明其准确率恰好为99.97%，由国际标准委员会认证。', truth: false }) },
  { id: 'contradiction', apply: (n, body) => ({ text: body + ' 与上述相反，该技术其实与本主题完全无关，属于纯硬件加速范畴。', truth: false }) }
];
const samples = [];
for (let i = 0; i < 200; i += 1) {
  const node = nodes[i % nodes.length];
  const body = sentences(node.text).slice(0, 2).join('。') || node.title;
  const faithful = i % 2 === 0;
  let text; let truth; let defect = null;
  if (faithful) {
    text = node.title + '：' + body + '。（出自第' + node.chapter + '章）';
    truth = true;
  } else {
    const d = pick(defects);
    const made = d.apply(node, node.title + '：' + body + '。（出自第' + node.chapter + '章）');
    text = made.text; truth = made.truth; defect = d.id;
  }
  samples.push({ id: 'exp-' + String(i + 1).padStart(3, '0'), nodeId: node.id, chapter: node.chapter, title: node.title, text, groundTruth: truth, defect });
}
// Rater A: checks chapter attribution and overclaiming language.
const raterA = s => {
  const chapterClaim = /出自第(\d+)章/.exec(s.text);
  if (chapterClaim && Number(chapterClaim[1]) !== s.chapter) return false;
  if (/(所有任务|100%|永远不会出错|保证)/.test(s.text)) return false;
  if (/本知识点出自第(\d+)章/.test(s.text)) {
    const m = /本知识点出自第(\d+)章/.exec(s.text);
    if (Number(m[1]) !== s.chapter) return false;
  }
  return true;
};
// Rater B: checks unverifiable precision, authority appeals and topic contradiction.
const raterB = s => {
  if (/\d+\.\d{1,2}%/.test(s.text) && /(认证|委员会|标准)/.test(s.text)) return false;
  if (/(完全无关|与上述相反|纯硬件加速)/.test(s.text)) return false;
  if (/(所有任务|永远不会出错)/.test(s.text)) return false;
  const m = /本知识点出自第(\d+)章/.exec(s.text);
  if (m && Number(m[1]) !== s.chapter) return false;
  return true;
};
// System under test: a grounding gate that only checks overlap with the source node.
const systemAccepts = s => {
  const src = new Set((s.title + s.text).split(/\s+/));
  const flagged = /(100%|永远不会出错|完全无关|认证)/.test(s.text);
  return !flagged && src.size > 0;
};
const rows = samples.map(s => {
  const a = raterA(s);
  const b = raterB(s);
  const row = {
    id: s.id,
    nodeId: s.nodeId,
    defect: s.defect,
    latencyMs: 40 + Math.round(rnd() * 120),
    accepted: systemAccepts(s),
    raterA: a,
    raterB: b
  };
  // Disagreements are adjudicated against the injected ground truth, which is known
  // by construction. This is an advantage synthetic data has over human labelling,
  // and equally a reason these numbers cannot stand in for a human study.
  if (a !== b) row.adjudicated = s.groundTruth;
  return row;
});
const payload = {
  kind: 'review',
  metadata: {
    model: 'rule-based synthetic explanation generator (no LLM call); defects injected deterministically',
    promptVersion: 'synthetic-v1',
    datasetVersion: 'ai-master-explanations-200@seed-20260918',
    commit: 'a3b3c8c9e5496dacdd7f5aabb3e6f954d743fe9e',
    dataProvenance: 'AI/rule-generated explanations over real course nodes. NOT real student submissions.',
    annotators: 'Two rule-based scorers with different heuristics applied to AI-generated test samples. NOT two independent human annotators. Agreement between them is therefore not evidence of human inter-rater reliability.',
    adjudication: 'Disagreements resolved against the injected ground truth.'
  },
  rows
};
const outDir = path.join(__dirname, '..', '.local', 'evaluation');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'review-samples.json'), JSON.stringify(samples, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(outDir, 'review-results.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
const disagreements = rows.filter(r => r.raterA !== r.raterB).length;
console.log(JSON.stringify({ samples: samples.length, faithful: samples.filter(s => s.groundTruth).length, defective: samples.filter(s => !s.groundTruth).length, disagreements }));
