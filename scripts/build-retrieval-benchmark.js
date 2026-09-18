const fs = require('node:fs');
const path = require('node:path');
// Builds the retrieval benchmark queries from the real 57 knowledge nodes.
// Queries are AI-generated paraphrases, not collected from real students; the
// gold label is the node the query was derived from, which makes this a
// synthetic benchmark and it must be reported as such.
const universe = require('../frontend/data/knowledge-universe.json');
const nodes = [];
for (const galaxy of universe.galaxies) {
  for (const star of galaxy.stars || []) {
    nodes.push({
      id: 'ch' + star.chapter + '-kp' + (star.index + 1),
      chapter: star.chapter,
      galaxy: galaxy.name,
      title: star.title,
      text: String(star.desc || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    });
  }
}
if (nodes.length !== 57) throw new Error('expected 57 nodes, found ' + nodes.length);
const strip = title => title.replace(/[？?。，,、]/g, ' ').replace(/（[^）]*）/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
// Three paraphrase styles per node keep every query traceable to one gold node.
const styles = [
  { suffix: '', kind: 'verbatim-title' },
  { suffix: '是什么意思', kind: 'definition-style' },
  { suffix: ' 怎么用 有什么注意点', kind: 'application-style' }
];
const queries = [];
for (const node of nodes) {
  for (const style of styles) {
    queries.push({
      queryId: node.id + '-' + style.kind,
      query: (strip(node.title) + ' ' + style.suffix).trim(),
      relevant: [node.id],
      chapter: node.chapter,
      style: style.kind,
      origin: 'ai-generated-paraphrase-of-course-node'
    });
  }
}
// Deterministically take 100 with balanced style coverage and no duplicate text.
const seen = new Set();
const selected = [];
for (let round = 0; round < styles.length && selected.length < 100; round += 1) {
  for (const q of queries.filter(x => x.style === styles[round].kind)) {
    if (selected.length >= 100 || seen.has(q.query)) continue;
    seen.add(q.query);
    selected.push(q);
  }
}
if (selected.length !== 100) throw new Error('expected 100 queries, built ' + selected.length);
const out = {
  kind: 'retrieval',
  dataset: 'ai-master-course-nodes',
  generatedAt: new Date().toISOString(),
  dataProvenance: 'AI-generated queries derived from the project course nodes. Not real user queries and not human-annotated relevance.',
  nodeCount: nodes.length,
  queryCount: selected.length,
  queries: selected
};
const target = path.join(__dirname, '..', '.local', 'evaluation', 'retrieval-queries.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n', 'utf8');
const nodesTarget = path.join(__dirname, '..', '.local', 'evaluation', 'course-nodes.json');
fs.writeFileSync(nodesTarget, JSON.stringify(nodes, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ nodes: nodes.length, queries: selected.length, styles: [...new Set(selected.map(q => q.style))], chapters: [...new Set(selected.map(q => q.chapter))].length }));
