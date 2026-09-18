'use strict';

// 嵌入器（embedder）注册表。
//
// 两条硬约束（沿用项目既有约定）：
//   ① 未配置任何模型时学习流程不能中断 —— 所以必须有一个零依赖、不联网、永远可用的默认嵌入器。
//   ② 默认嵌入器**不是语义嵌入**。它只反映词面重合，跨语言改写、同义替换都检索不到。
//      这个事实必须对外可见，不允许包装成「语义检索」——见 embedder.semantic 与 describe()。
//
// 因此：local-hash 负责「永远能用」，remote 负责「真的语义」，由配置决定用哪个，并在
// 索引清单里记录是谁产的 —— 换嵌入器必须重建索引，不同嵌入器的向量空间不可混用。

const LOCAL_DIMENSIONS = 256;

function fnv1a(text, seed) {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// 分词策略：拉丁按词、CJK 同时产出单字与相邻二元组。
// 二元组是为了让「大模型」「知识库」这类固定搭配获得独立权重；单字是为了保证召回下限。
function tokenize(text) {
  const normalized = String(text == null ? '' : text).normalize('NFKC').toLowerCase();
  const tokens = [];
  const latin = normalized.match(/[a-z0-9]+/g) || [];
  for (const word of latin) tokens.push(word);
  const cjkRuns = normalized.match(/[\u3400-\u9fff]+/g) || [];
  for (const run of cjkRuns) {
    for (let i = 0; i < run.length; i++) {
      tokens.push(run[i]);
      if (i + 1 < run.length) tokens.push(run.slice(i, i + 2));
    }
  }
  return tokens;
}

function l2Normalize(vector) {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i];
  const norm = Math.sqrt(sum);
  if (!norm) return vector;
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}

function hashVector(text, dimensions) {
  const vector = new Float32Array(dimensions);
  for (const token of tokenize(text)) {
    const index = fnv1a(token, 0x811c9dc5) % dimensions;
    // 用第二个种子决定符号，避免所有 token 同向累加导致向量几乎平行。
    vector[index] += fnv1a(token, 0x01000193) % 2 === 0 ? 1 : -1;
  }
  return l2Normalize(vector);
}

function createLocalEmbedder(dimensions = LOCAL_DIMENSIONS) {
  if (!Number.isInteger(dimensions) || dimensions < 16 || dimensions > 4096) {
    throw new Error('本地嵌入维度需为 16–4096 之间的整数。');
  }
  return {
    id: 'local-hash-' + dimensions,
    dimensions,
    semantic: false,
    describe: () => ({
      id: 'local-hash-' + dimensions,
      dimensions,
      semantic: false,
      label: '本机哈希嵌入',
      note: '零依赖、不联网、确定性。只反映词面重合，不是语义嵌入：同义改写与跨语言检索会漏召回。'
    }),
    async embed(texts) {
      if (!Array.isArray(texts)) throw new Error('embed 需要文本数组。');
      return texts.map(text => hashVector(text, dimensions));
    }
  };
}

// OpenAI 兼容的 /embeddings 接口。baseUrl 需形如 https://host/v1。
function createRemoteEmbedder(config, fetchImpl = fetch) {
  const baseUrl = String(config.baseUrl || '').trim().replace(/\/+$/, '');
  const model = String(config.model || '').trim();
  const apiKey = String(config.apiKey || '');
  if (!baseUrl || !model) throw new Error('远程嵌入器需要 baseUrl 与 model。');
  let dimensions = 0;
  return {
    id: 'remote:' + model,
    get dimensions() { return dimensions; },
    semantic: true,
    describe: () => ({
      id: 'remote:' + model,
      dimensions,
      semantic: true,
      label: '远程嵌入模型',
      note: '调用 ' + baseUrl + ' 的 ' + model + '；维度在首次调用后确定。'
    }),
    async embed(texts) {
      if (!Array.isArray(texts) || !texts.length) return [];
      const response = await fetchImpl(baseUrl + '/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        redirect: 'error',
        signal: AbortSignal.timeout(Number(process.env.EMBEDDING_TIMEOUT_MS) || 30000),
        body: JSON.stringify({ model, input: texts })
      });
      if (!response.ok) throw Object.assign(new Error('embedding-provider-status'), { providerStatus: response.status });
      const data = await response.json();
      const rows = Array.isArray(data && data.data) ? data.data : [];
      if (rows.length !== texts.length) throw new Error('embedding-count-mismatch');
      let ordered = rows;
      if (rows.some(row => row && row.index !== undefined)) {
        const indices = rows.map(row => row && row.index);
        if (!indices.every(i => Number.isInteger(i) && i >= 0 && i < texts.length) || new Set(indices).size !== texts.length) throw new Error('embedding-invalid-indices');
        ordered = [...rows].sort((a, b) => a.index - b.index);
      }
      const vectors = ordered.map(row => {
        const raw = row && row.embedding;
        if (!Array.isArray(raw) || !raw.length || raw.length > 65536 || !raw.every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error('embedding-invalid-vector');
        const vector = Float32Array.from(raw);
        if (![...vector].every(Number.isFinite) || !vector.some(v => v !== 0)) throw new Error('embedding-invalid-vector');
        return l2Normalize(vector);
      });
      const expectedDimensions = dimensions || vectors[0].length;
      if (vectors.some(v => v.length !== expectedDimensions)) throw new Error('embedding-dimension-drift');
      dimensions = expectedDimensions;
      return vectors;
    }
  };
}

// 从配置解析出实际使用的嵌入器。配置缺失或非法时回落到本机嵌入器，并说明回落原因。
function createEmbedder(config) {
  const embedding = config && config.embedding;
  if (embedding && embedding.baseUrl && embedding.model) {
    try {
      return createRemoteEmbedder(embedding, config.fetchImpl);
    } catch (error) {
      return { ...createLocalEmbedder(), fallbackReason: error.message };
    }
  }
  return createLocalEmbedder();
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length) throw new Error('向量维度不一致，不能比较。');
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

module.exports = {
  LOCAL_DIMENSIONS,
  createLocalEmbedder,
  createRemoteEmbedder,
  createEmbedder,
  tokenize,
  hashVector,
  l2Normalize,
  cosineSimilarity
};
