const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const embedder = require('../server/rag/embedder');
const { chunkText } = require('../server/rag/chunker');
const { openVectorStore, backendStatus, probeSqliteVec } = require('../server/rag/vector-store');
const { createKbStore } = require('../server/rag/kb-store');
const { parseDocument, supportedFormats } = require('../server/rag/parser');
const { engineStatus, resolveEngine } = require('../server/rag/engines');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const TOKEN_DOC = '自回归语言模型把文本编码成 token，然后根据上下文逐步预测下一个 token。token 是分词器产生的处理单位，不必等于一个汉字或一个完整语义。语言流畅不保证事实正确，涉及最新事实时需要外部证据核验。';
const RAG_DOC = '检索增强生成先从知识库召回相关文档片段，再把片段拼进提示词交给模型作答。向量数据库负责相似度检索，常见做法是把文本嵌入成向量后做最近邻查询。召回质量差会让回答凭空编造。';

test('local embedder is deterministic, normalized and dimensionally stable', async () => {
  const local = embedder.createLocalEmbedder();
  const [a, b] = await local.embed(['大模型根据上下文预测 token', '大模型根据上下文预测 token']);
  assert.equal(a.length, 256);
  assert.deepEqual(Array.from(a), Array.from(b));
  const norm = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 1e-5, '向量应已 L2 归一化');
  assert.equal(local.semantic, false, '本机嵌入必须自述为非语义');
  assert.match(local.describe().note, /不是语义/);
});

test('tokenizer separates latin words and emits CJK unigrams plus bigrams', () => {
  const tokens = embedder.tokenize('RAG 检索知识库');
  assert.ok(tokens.includes('rag'));
  assert.ok(tokens.includes('知'));
  assert.ok(tokens.includes('知识'));
  assert.ok(tokens.includes('识库'));
});

test('chunking keeps chunks within budget, covers the text and returns nothing for blanks', () => {
  assert.deepEqual(chunkText('   \n\n  '), []);
  const long = Array.from({ length: 40 }, (_, i) => `第${i}段说明：检索增强生成会先把文档切块，再逐块建立索引，最后按相似度召回。`).join('\n\n');
  const chunks = chunkText(long, { maxChars: 300, overlapChars: 60 });
  assert.ok(chunks.length > 3);
  for (const chunk of chunks) assert.ok(chunk.text.length <= 300, '块长不得超出上限：' + chunk.text.length);
  assert.ok(chunks.every(chunk => chunk.text.trim().length > 0));
  assert.equal(chunks[0].index, 0);
  assert.ok(chunks.some(chunk => chunk.text.includes('检索增强生成')));
});

test('unknown formats and uninstalled parsers fail loudly instead of producing empty documents', () => {
  assert.throws(() => parseDocument('paper.pdf', 'x'), /暂不支持 \.pdf/);
  assert.throws(() => parseDocument('deck.pptx', 'x'), /Docling|markitdown/);
  assert.throws(() => parseDocument('weird.xyz', 'x'), /未知的文件格式/);
  assert.throws(() => parseDocument('blank.md', '   '), /解析后为空/);
  const formats = supportedFormats();
  assert.ok(formats.supported.some(item => item.extension === '.md'));
  assert.ok(formats.unsupported.some(item => item.extension === '.pdf' && item.status === 'not-installed'));
});

test('markdown, json and csv parse into plain text', () => {
  assert.equal(parseDocument('a.md', '# 标题\n\n正文').text.includes('正文'), true);
  const json = parseDocument('a.json', JSON.stringify({ name: '检索', items: [1, 2] }));
  assert.match(json.text, /name：检索/);
  assert.match(json.text, /items\[1\]：2/);
  const csv = parseDocument('a.csv', 'name,score\n检索,90');
  assert.match(csv.text, /检索 90/);
});

test('engine registry reports honest statuses rather than pretending engines exist', () => {
  const statuses = engineStatus({});
  const local = statuses.find(item => item.id === 'local-index');
  assert.equal(local.status, 'ready');
  const remote = statuses.find(item => item.id === 'remote-embedding');
  assert.equal(remote.status, 'needs-config', '未配置嵌入服务时必须显示为待配置');
  assert.match(remote.reason, /缺少配置/);
  const configured = engineStatus({ embedding: { baseUrl: 'https://example.com/v1', model: 'm' } });
  assert.equal(configured.find(item => item.id === 'remote-embedding').status, 'ready');
  for (const id of ['pageindex', 'graphrag']) {
    const engine = statuses.find(item => item.id === id);
    assert.equal(engine.status, 'not-implemented');
    assert.ok(engine.reason.length > 0, '未实现的引擎必须说明原因');
  }
  assert.throws(() => resolveEngine('graphrag', {}), /尚未实现/);
  assert.throws(() => resolveEngine('nope', {}), /未知的检索引擎/);
});

test('vector backends agree on ranking and the fallback is always available', async () => {
  const statuses = backendStatus();
  assert.equal(statuses.find(item => item.id === 'js-cosine').available, true, '兜底后端必须永远可用');

  const dims = 64;
  const vectors = [
    new Float32Array(embedder.hashVector('token 预测 上下文', dims)),
    new Float32Array(embedder.hashVector('向量 数据库 相似度', dims)),
    new Float32Array(embedder.hashVector('无关的天气描述', dims))
  ];
  const query = embedder.hashVector('token 预测', dims);

  const jsDir = tempDir('aimaster-vec-js-');
  const js = openVectorStore(jsDir, dims, 'js-cosine');
  assert.equal(js.id, 'js-cosine');
  js.add(vectors.map((vector, i) => ({ id: 'c' + i, vector, meta: { i } })));
  js.persist();
  const jsHits = js.search(query, 3);
  js.close();
  assert.equal(jsHits[0].id, 'c0', '纯 JS 后端应把最相关的块排在第一');

  if (probeSqliteVec().available) {
    const sqlDir = tempDir('aimaster-vec-sql-');
    const sql = openVectorStore(sqlDir, dims, 'sqlite-vec');
    assert.equal(sql.id, 'sqlite-vec');
    sql.add(vectors.map((vector, i) => ({ id: 'c' + i, vector, meta: { i } })));
    sql.persist();
    const sqlHits = sql.search(query, 3);
    sql.close();
    assert.deepEqual(sqlHits.map(h => h.id), jsHits.map(h => h.id), '换后端不得改变排序语义');
    for (const [i, hit] of sqlHits.entries()) {
      assert.ok(Math.abs(hit.score - jsHits[i].score) < 1e-3, '两个后端的相似度应一致');
    }
  }
});

test('preferred backend degrades visibly when unavailable and says why', () => {
  const dir = tempDir('aimaster-vec-degrade-');
  const store = openVectorStore(dir, 32, 'definitely-not-a-backend');
  assert.ok(['sqlite-vec', 'js-cosine'].includes(store.id), '必须落到一个真实存在的后端');
  assert.equal(store.degraded, true, '首选后端不可用时必须自述已降级');
  assert.ok(store.degradeReason.length > 0, '降级必须给出原因，不能静默兜底');
  assert.equal(store.count(), 0);
  store.close();
});

test('knowledge base lifecycle versions indexes instead of destroying the working one', async () => {
  const root = tempDir('aimaster-kb-');
  const store = createKbStore({ dataRoot: root, config: () => ({}) });

  const kb = store.create({ name: 'AI 入门资料' });
  assert.equal(store.list().length, 1);
  await assert.rejects(() => store.buildIndex(kb.id), /还没有文档/);

  store.addDocuments(kb.id, [
    { title: 'token 与预测', source: 'chapter-1.md', kind: 'markdown', text: TOKEN_DOC },
    { title: '检索增强生成', source: 'chapter-5.md', kind: 'markdown', text: RAG_DOC }
  ]);

  const first = await store.buildIndex(kb.id);
  assert.equal(first.version, 1);
  assert.equal(first.chunkCount > 0, true);
  assert.equal(first.embedder.semantic, false);
  assert.match(first.notice, /不是语义检索/);

  const hit = await store.search(kb.id, 'token 上下文 预测');
  assert.ok(hit.hits.length > 0);
  assert.equal(hit.hits[0].documentId, hit.hits[0].documentId);
  assert.match(hit.hits[0].text, /token/);
  assert.equal(hit.hits[0].source, 'chapter-1.md');
  assert.ok(hit.hits[0].score > 0);

  // 换内容后重建：新版本产生，旧版本仍在，且可回切。
  store.addDocuments(kb.id, [{ title: '补充', source: 'extra.md', kind: 'markdown', text: '重排模型会按相关性重新排序召回结果，提升上下文质量。' }]);
  const second = await store.buildIndex(kb.id);
  assert.equal(second.version, 2);
  const info = store.info(kb.id);
  assert.deepEqual(info.versions.map(v => v.version), [1, 2], '旧版本必须保留');
  assert.equal(info.activeVersion, 2);

  const rolledBack = store.activate(kb.id, 1);
  assert.equal(rolledBack.version, 1);
  const oldHit = await store.search(kb.id, 'token 上下文 预测');
  assert.ok(oldHit.hits.length > 0, '回切旧版本后仍应可检索');
  assert.equal(oldHit.version, 1);
});

test('search refuses to mix vector spaces when the embedder changed', async () => {
  const root = tempDir('aimaster-kb-embed-');
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ data: body.input.map(() => ({ embedding: [1, 0, 0, 0] })) }) };
  };
  let model = 'embed-a';
  const store = createKbStore({
    dataRoot: root,
    config: () => ({ embedding: { baseUrl: 'https://example.com/v1', model, apiKey: 'k' }, fetchImpl })
  });
  const kb = store.create({ name: '配置切换', engine: 'remote-embedding' });
  store.addDocuments(kb.id, [{ title: 'a', text: TOKEN_DOC }]);
  const manifest = await store.buildIndex(kb.id);
  assert.equal(manifest.embedder.id, 'remote:embed-a');
  assert.equal(manifest.embedder.semantic, true);

  // 换嵌入模型后向量空间不再可比：必须明确报错，而不是给出一份看似正常实则错误的检索结果。
  model = 'embed-b';
  await assert.rejects(() => store.search(kb.id, 'token'), /不一致/);
});

test('deleting a derived index file does not lose data — it rebuilds from the readable source', async () => {
  const root = tempDir('aimaster-kb-rebuild-');
  const store = createKbStore({ dataRoot: root, config: () => ({}) });
  const kb = store.create({ name: '可重建' });
  store.addDocuments(kb.id, [{ title: 'a', source: 'a.md', text: TOKEN_DOC }]);
  await store.buildIndex(kb.id);

  const versionDir = path.join(root, kb.id, 'version-1');
  for (const file of ['vectors.json', 'vectors.sqlite']) {
    const target = path.join(versionDir, file);
    if (fs.existsSync(target)) fs.rmSync(target);
  }
  assert.ok(fs.existsSync(path.join(versionDir, 'chunks.jsonl')), '可读真源必须仍在');

  const result = await store.search(kb.id, 'token 预测');
  assert.equal(result.rebuilt, true, '派生索引缺失时应就地重建而不是报错');
  assert.ok(result.hits.length > 0);
});

test('unknown engine and unknown knowledge base are rejected with actionable messages', () => {
  const store = createKbStore({ dataRoot: tempDir('aimaster-kb-err-'), config: () => ({}) });
  assert.throws(() => store.create({ name: 'x', engine: 'graphrag' }), /尚未实现/);
  assert.throws(() => store.create({ name: '' }), /1–60/);
  assert.throws(() => store.info('missing'), /未找到/);
  assert.throws(() => store.remove('missing'), /未找到/);
});
