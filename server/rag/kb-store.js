'use strict';

// 知识库存储：注册表 + 版本化索引目录。
//
// 借鉴 DeepTutor 的版本化语义：**重建索引写新的 `version-N` 目录，并保留旧版本**，
// 所以「重建中永远不会毁掉一个可用的索引」—— 上一版仍在服务检索，直到新版本成功落盘才切换。
//
// 目录结构（全部是可直接打开查看的文件，不是不透明二进制）：
//   <dataRoot>/kbs.json                 注册表
//   <dataRoot>/<kbId>/documents.jsonl   源文档（真源，重建索引不需要重新上传）
//   <dataRoot>/<kbId>/version-1/
//       manifest.json                   本次索引用了哪个引擎/嵌入器/后端，是否降级
//       chunks.jsonl                    切好的可引用块（真源，派生索引可据此重建）
//       vectors.sqlite | vectors.json   派生索引（可删除，会自动重建）

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chunkText } = require('./chunker');
const { openVectorStore } = require('./vector-store');
const { resolveEngine } = require('./engines');
const { badRequest, notFound, conflict } = require('../errors');

const REGISTRY_FILE = 'kbs.json';
const REGISTRY_VERSION = 1;
const DEFAULT_LIMIT = 5;
const EMBED_BATCH = 64;

function slugify(name) {
  const base = String(name || '').normalize('NFKC').toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (base || 'kb').slice(0, 40);
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function writeJsonl(file, rows) {
  fs.writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
}

function createKbStore(options = {}) {
  if (!options.dataRoot) throw new Error('createKbStore 需要 dataRoot。');
  const root = options.dataRoot;
  const readConfig = typeof options.config === 'function' ? options.config : () => ({});
  fs.mkdirSync(root, { recursive: true });

  const registryPath = path.join(root, REGISTRY_FILE);
  const kbDir = id => path.join(root, id);
  const versionDir = (id, version) => path.join(kbDir(id), 'version-' + version);
  const docFile = id => path.join(kbDir(id), 'documents.jsonl');

  function readRegistry() {
    if (!fs.existsSync(registryPath)) return { version: REGISTRY_VERSION, kbs: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      return { version: parsed.version || REGISTRY_VERSION, kbs: Array.isArray(parsed.kbs) ? parsed.kbs : [] };
    } catch {
      return { version: REGISTRY_VERSION, kbs: [] };
    }
  }
  function writeRegistry(registry) {
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  }
  function findKb(registry, id) {
    const kb = registry.kbs.find(item => item.id === id);
    if (!kb) throw notFound('未找到这个知识库。');
    return kb;
  }
  function readManifest(id, version) {
    const file = path.join(versionDir(id, version), 'manifest.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  function list() {
    const registry = readRegistry();
    return registry.kbs.map(kb => ({
      ...kb,
      documentCount: readJsonl(docFile(kb.id)).length,
      activeManifest: kb.activeVersion ? readManifest(kb.id, kb.activeVersion) : null
    }));
  }

  function info(id) {
    const kb = findKb(readRegistry(), id);
    const versions = (kb.versions || []).map(version => readManifest(id, version)).filter(Boolean);
    return { ...kb, documents: readJsonl(docFile(id)).map(({ text, ...rest }) => ({ ...rest, chars: text.length })), versions };
  }

  function create(input = {}) {
    const name = String(input.name || '').trim();
    if (name.length < 1 || name.length > 60) throw badRequest('知识库名称需为 1–60 个字符。');
    const engine = String(input.engine || 'local-index');
    resolveEngine(engine, readConfig()); // 引擎不存在或未实现时在这里就失败，不留半个知识库
    const registry = readRegistry();
    const id = slugify(name) + '-' + randomUUID().slice(0, 8);
    const kb = { id, name, engine, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), versions: [], activeVersion: null };
    fs.mkdirSync(kbDir(id), { recursive: true });
    registry.kbs.push(kb);
    writeRegistry(registry);
    return kb;
  }

  function normalizeDocument(document) {
    return {
      id: randomUUID(),
      title: String(document.title || 'untitled').slice(0, 200),
      source: String(document.source || document.title || 'untitled').slice(0, 400),
      kind: String(document.kind || 'text'),
      addedAt: new Date().toISOString(),
      text: String(document.text || '')
    };
  }

  function addDocuments(id, documents) {
    if (!Array.isArray(documents) || !documents.length) throw badRequest('没有可入库的文档。');
    const registry = readRegistry();
    const kb = findKb(registry, id);
    const existing = readJsonl(docFile(id));
    const added = documents.map(normalizeDocument);
    writeJsonl(docFile(id), existing.concat(added));
    kb.updatedAt = new Date().toISOString();
    writeRegistry(registry);
    return { added: added.length, total: existing.length + added.length };
  }

  // 整体替换文档：用于「重新灌入课程库」这类幂等操作，避免同一份内容反复累积。
  // 只替换真源；已建立的版本索引原样保留，重建仍会开新版本。
  function replaceDocuments(id, documents) {
    if (!Array.isArray(documents)) throw badRequest('文档必须为数组。');
    const registry = readRegistry();
    const kb = findKb(registry, id);
    const next = documents.map(normalizeDocument);
    writeJsonl(docFile(id), next);
    kb.updatedAt = new Date().toISOString();
    writeRegistry(registry);
    return { replaced: next.length };
  }

  // 重建索引 = 新开一个版本目录。旧版本原样保留，切换只在成功后发生。
  async function buildIndex(id) {
    const registry = readRegistry();
    const kb = findKb(registry, id);
    const documents = readJsonl(docFile(id));
    // 409：请求本身没问题，只是缺一个前置步骤（先入库再建索引）。
    if (!documents.length) throw conflict('知识库还没有文档，无法建立索引。');
    const { embedder, preferredBackend } = resolveEngine(kb.engine, readConfig());

    const chunks = [];
    for (const document of documents) {
      for (const piece of chunkText(document.text)) {
        chunks.push({
          id: document.id + '#' + piece.index, documentId: document.id, title: document.title,
          source: document.source, index: piece.index, paragraph: piece.paragraph,
          start: piece.start, end: piece.end, text: piece.text
        });
      }
    }
    if (!chunks.length) throw badRequest('文档切分后没有可用内容。');

    const vectors = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      vectors.push(...await embedder.embed(batch.map(chunk => chunk.text)));
    }

    const version = Math.max(0, ...(kb.versions || [])) + 1;
    const dir = versionDir(id, version);
    fs.mkdirSync(dir, { recursive: true });
    // 先落真源（可读、可重建），再落派生索引：中途失败留下的是「可重建的中间态」，不是坏索引。
    writeJsonl(path.join(dir, 'chunks.jsonl'), chunks);
    const store = openVectorStore(dir, embedder.dimensions, preferredBackend);
    store.add(chunks.map((chunk, index) => ({
      id: chunk.id, vector: vectors[index],
      meta: { documentId: chunk.documentId, title: chunk.title, source: chunk.source, index: chunk.index, paragraph: chunk.paragraph }
    })));
    const persisted = store.persist();
    const backendInfo = store.describe();
    const backendRecord = { id: backendInfo.id, label: backendInfo.label, file: persisted.file, degraded: Boolean(store.degraded), degradeReason: store.degradeReason || '' };
    store.close();

    const embedderInfo = embedder.describe();
    const manifest = {
      kbId: id, version, createdAt: new Date().toISOString(), engine: kb.engine,
      embedder: embedderInfo, backend: backendRecord,
      documentCount: documents.length, chunkCount: chunks.length,
      notice: embedderInfo.semantic
        ? '本次索引使用语义嵌入。'
        : '本次索引使用本机哈希嵌入：只反映词面重合，不是语义检索，同义改写与跨语言提问会漏召回。'
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    kb.versions = [...(kb.versions || []), version];
    kb.activeVersion = version;
    kb.updatedAt = new Date().toISOString();
    writeRegistry(registry);
    return manifest;
  }

  function activate(id, version) {
    const registry = readRegistry();
    const kb = findKb(registry, id);
    if (!(kb.versions || []).includes(version)) throw notFound('这个版本不存在。');
    kb.activeVersion = version;
    kb.updatedAt = new Date().toISOString();
    writeRegistry(registry);
    return readManifest(id, version);
  }

  async function search(id, query, limit = DEFAULT_LIMIT) {
    const text = String(query || '').trim();
    if (!text) throw badRequest('检索问题不能为空。');
    const kb = findKb(readRegistry(), id);
    if (!kb.activeVersion) throw conflict('该知识库尚未建立索引，请先构建索引。');
    const manifest = readManifest(id, kb.activeVersion);
    // 故意保留 500：清单文件缺失说明服务端自己的数据坏了，调用方改请求也修不好，
    // 这条应该出现在 onError 日志里，而不是被当成一次普通的参数错误。
    if (!manifest) throw new Error('索引清单缺失，请重建索引。');

    const { embedder, preferredBackend } = resolveEngine(manifest.engine, readConfig());
    if (embedder.id !== manifest.embedder.id) {
      // 409：请求合法，但当前索引是用另一个嵌入器建的，向量空间不可混用 —— 需要先重建索引。
      throw conflict('当前嵌入器（' + embedder.id + '）与建立索引时（' + manifest.embedder.id + '）不一致，向量空间不可混用，请重建索引。');
    }

    const dir = versionDir(id, kb.activeVersion);
    const chunks = readJsonl(path.join(dir, 'chunks.jsonl'));
    const byId = new Map(chunks.map(chunk => [chunk.id, chunk]));
    const store = openVectorStore(dir, manifest.embedder.dimensions, manifest.backend.id);
    let rebuilt = false;
    try {
      // 派生索引缺失（例如换了后端、或文件被删）时，从 chunks.jsonl 就地重建 —— 真源还在，不丢数据。
      if (store.count() === 0 && chunks.length) {
        const vectors = [];
        for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
          vectors.push(...await embedder.embed(chunks.slice(i, i + EMBED_BATCH).map(chunk => chunk.text)));
        }
        store.add(chunks.map((chunk, index) => ({
          id: chunk.id, vector: vectors[index],
          meta: { documentId: chunk.documentId, title: chunk.title, source: chunk.source, index: chunk.index, paragraph: chunk.paragraph }
        })));
        store.persist();
        rebuilt = true;
      }
      const vector = (await embedder.embed([text]))[0];
      const hits = store.search(vector, Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, 20)));
      return {
        query: text, kbId: id, version: kb.activeVersion, rebuilt,
        embedder: manifest.embedder, backend: manifest.backend,
        hits: hits.map(hit => {
          const chunk = byId.get(hit.id);
          return {
            chunkId: hit.id, score: Number(hit.score.toFixed(4)),
            documentId: chunk ? chunk.documentId : '', title: chunk ? chunk.title : '',
            source: chunk ? chunk.source : '', index: chunk ? chunk.index : 0,
            paragraph: chunk ? chunk.paragraph : 0, text: chunk ? chunk.text : ''
          };
        }).filter(hit => hit.text)
      };
    } finally {
      store.close();
    }
  }

  function remove(id) {
    const registry = readRegistry();
    const kb = findKb(registry, id);
    registry.kbs = registry.kbs.filter(item => item.id !== kb.id);
    writeRegistry(registry);
    fs.rmSync(kbDir(id), { recursive: true, force: true });
    return { removed: kb.id };
  }

  return { root, list, info, create, addDocuments, replaceDocuments, buildIndex, activate, search, remove, readManifest };
}

module.exports = { createKbStore, slugify, REGISTRY_FILE };
