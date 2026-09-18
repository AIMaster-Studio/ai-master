'use strict';

// 向量索引后端。同一份接口两个实现：
//   - `sqlite-vec`：真向量库（vec0 虚拟表 + KNN），有原生扩展依赖，装不上就不可用。
//   - `js-cosine`：纯 JS 余弦扫描，零依赖、永远可用，规模小时延迟可忽略。
//
// 为什么两个都要留：本项目对外承诺「干净克隆后 npm run verify 无需 npm install」。
// 若把原生扩展设成硬依赖，这条承诺当场作废。所以索引后端是**可降级的能力**，
// 而不是必需品 —— 这与项目既有的「未配置时自动降级、且明确标注降级来源」是同一套语义。
//
// 两个后端都返回**余弦相似度**（越大越相近）。sqlite-vec 的 vec0 默认给 L2 距离，
// 因为入库向量已 L2 归一化，用 cos = 1 - d²/2 换算，保证换后端不会改变排序语义。

const fs = require('node:fs');
const path = require('node:path');
const { cosineSimilarity } = require('./embedder');

const VECTORS_FILE = 'vectors.json';
const SQLITE_FILE = 'vectors.sqlite';
const PREFERRED_BACKEND = 'sqlite-vec';
// 运维开关：置 1 时强制视 sqlite-vec 为不可用，走纯 JS 兜底。用途：
//   1) 测试「降级必须可见」这条判据的反方向（不靠删依赖）；2) 线上扩展异常时人工切到兜底。
const DISABLE_SQLITE_VEC_ENV = 'AIMASTER_DISABLE_SQLITE_VEC';

// 打包提示（不是运行逻辑）：sqlite-vec 的 index.cjs 用「拼字符串 + require.resolve」定位平台包里的
// vec0 扩展，Vercel 的静态追踪器（@vercel/nft）看不见动态拼出的路径，于是 vec0.so 不进函数包。
// 线上实测（2026-09-18，build a3b3c8c9）：/api/rag/status 报
//   "Cannot find module 'sqlite-vec-linux-x64/vec0.so'"，检索静默退化为 js-cosine。
// 本机 nft 追踪同样只带上 index.cjs 与 package.json。下面的字面量 require.resolve 只为让追踪器
// 把对应平台的扩展文件带上；当前机器缺该平台包时静默跳过，不影响任何行为。
function declarePlatformExtensionsForBundlers() {
  try { require.resolve('sqlite-vec-linux-x64/vec0.so'); } catch { /* 非 linux-x64 或未安装 */ }
  try { require.resolve('sqlite-vec-linux-arm64/vec0.so'); } catch { /* 非 linux-arm64 或未安装 */ }
  try { require.resolve('sqlite-vec-darwin-x64/vec0.dylib'); } catch { /* 非 darwin-x64 或未安装 */ }
  try { require.resolve('sqlite-vec-darwin-arm64/vec0.dylib'); } catch { /* 非 darwin-arm64 或未安装 */ }
  try { require.resolve('sqlite-vec-windows-x64/vec0.dll'); } catch { /* 非 windows-x64 或未安装 */ }
}

function toBase64(vector) {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength).toString('base64');
}

function fromBase64(text, dimensions) {
  const buffer = Buffer.from(String(text || ''), 'base64');
  if (buffer.byteLength !== dimensions * 4) throw new Error('向量长度与声明的维度不一致。');
  return new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

function toBlob(vector) {
  return new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
}

// ---------------------------------------------------------------------------
// sqlite-vec 后端
// ---------------------------------------------------------------------------
function loadSqliteVec() {
  try {
    const sqliteVec = require('sqlite-vec');
    const { DatabaseSync } = require('node:sqlite');
    return { sqliteVec, DatabaseSync };
  } catch {
    return null;
  }
}

// 探测结果按进程缓存：扩展能否加载在进程生命周期内不会变，而 /api/status 与每次检索都会问。
// 缓存键带上运维开关的值，使同进程内切换开关（测试会这么做）不会读到旧结论。
const probeCache = new Map();
function probeSqliteVec() {
  const disabled = String(process.env[DISABLE_SQLITE_VEC_ENV] || '');
  if (probeCache.has(disabled)) return probeCache.get(disabled);
  const result = disabled === '1'
    ? { available: false, reason: '已由环境变量 ' + DISABLE_SQLITE_VEC_ENV + '=1 显式停用 sqlite-vec。' }
    : probeSqliteVecUncached();
  probeCache.set(disabled, result);
  return result;
}

function probeSqliteVecUncached() {
  const loaded = loadSqliteVec();
  if (!loaded) return { available: false, reason: '未安装 sqlite-vec（npm i sqlite-vec），或当前 Node 不支持 node:sqlite。' };
  let db;
  try {
    declarePlatformExtensionsForBundlers();
    db = new loaded.DatabaseSync(':memory:', { allowExtension: true });
    db.loadExtension(loaded.sqliteVec.getLoadablePath());
    const row = db.prepare('select vec_version() as version').get();
    return { available: true, version: row.version, reason: '' };
  } catch (error) {
    return { available: false, reason: 'sqlite-vec 扩展加载失败：' + error.message };
  } finally {
    try { if (db) db.close(); } catch { /* 探测失败时的清理失败无需上报 */ }
  }
}

function createSqliteVecBackend(dir, dimensions) {
  const { sqliteVec, DatabaseSync } = loadSqliteVec();
  if (!sqliteVec || !DatabaseSync) throw new Error('sqlite-vec 不可用。');
  const file = path.join(dir, SQLITE_FILE);
  const db = new DatabaseSync(file, { allowExtension: true });
  db.loadExtension(sqliteVec.getLoadablePath());
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING vec0(embedding float[${dimensions}]);
           CREATE TABLE IF NOT EXISTS chunk_meta(rowid INTEGER PRIMARY KEY, id TEXT UNIQUE, meta TEXT);`);
  const insertVec = db.prepare('INSERT INTO chunks(rowid, embedding) VALUES(?,?)');
  const insertMeta = db.prepare('INSERT OR REPLACE INTO chunk_meta(rowid, id, meta) VALUES(?,?,?)');
  const nextRowid = db.prepare('SELECT COALESCE(MAX(rowid), 0) + 1 AS next FROM chunk_meta');
  let pending = 0;

  return {
    id: 'sqlite-vec',
    describe: () => ({ id: 'sqlite-vec', label: 'SQLite 向量索引', file: SQLITE_FILE, note: 'vec0 虚拟表 + KNN 查询。' }),
    add(records) {
      db.exec('BEGIN');
      try {
        for (const record of records) {
          // vec0 的 rowid 必须是 SQLITE_INTEGER 类型：node:sqlite 把 JS number 绑成浮点，
          // 会被 vec0 拒绝（"Only integers are allows for primary key values"）。必须用 BigInt。
          const rowid = BigInt(nextRowid.get().next);
          insertVec.run(rowid, toBlob(record.vector));
          insertMeta.run(rowid, record.id, JSON.stringify(record.meta || {}));
          pending++;
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    search(vector, limit) {
      // vec0 要求 KNN 查询自带 `k = ?`（或直接 LIMIT）；用 JOIN + 外层 LIMIT 会被拒绝：
      // "A LIMIT or 'k = ?' constraint is required on vec0 knn queries."
      // 所以先只对虚拟表做 KNN 取 rowid，再单独取元数据 —— 也不把 JOIN 成本压到向量扫描上。
      const rows = db.prepare('SELECT rowid, distance FROM chunks WHERE embedding MATCH ? AND k = ? ORDER BY distance')
        .all(toBlob(vector), BigInt(limit));
      const metaStmt = db.prepare('SELECT id, meta FROM chunk_meta WHERE rowid = ?');
      return rows.map(row => {
        const meta = metaStmt.get(row.rowid);
        return {
          id: meta ? meta.id : String(row.rowid),
          meta: JSON.parse((meta && meta.meta) || '{}'),
          // L2 距离 → 余弦相似度（向量已归一化）。
          score: 1 - (row.distance * row.distance) / 2
        };
      });
    },
    count() { return Number(db.prepare('SELECT COUNT(*) AS n FROM chunk_meta').get().n); },
    persist() { pending = 0; return { file: SQLITE_FILE, records: db.prepare('SELECT COUNT(*) AS n FROM chunk_meta').get().n }; },
    close() { try { db.close(); } catch { /* 已关闭 */ } }
  };
}

// ---------------------------------------------------------------------------
// 纯 JS 余弦后端（兜底）
// ---------------------------------------------------------------------------
function createJsCosineBackend(dir, dimensions) {
  const file = path.join(dir, VECTORS_FILE);
  let records = [];
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved.dimensions !== dimensions) throw new Error('已存索引的维度与当前嵌入器不一致，需重建索引。');
    records = saved.records.map(item => ({ id: item.id, meta: item.meta || {}, vector: fromBase64(item.vector, dimensions) }));
  }
  return {
    id: 'js-cosine',
    describe: () => ({ id: 'js-cosine', label: '纯 JS 余弦扫描', file: VECTORS_FILE, note: '零依赖兜底；规模大时线性扫描会变慢。' }),
    add(next) {
      for (const record of next) records.push({ id: record.id, meta: record.meta || {}, vector: record.vector });
    },
    search(vector, limit) {
      return records
        .map(record => ({ id: record.id, meta: record.meta, score: cosineSimilarity(vector, record.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
    count() { return records.length; },
    persist() {
      fs.writeFileSync(file, JSON.stringify({
        dimensions,
        records: records.map(record => ({ id: record.id, meta: record.meta, vector: toBase64(record.vector) }))
      }));
      return { file: VECTORS_FILE, records: records.length };
    },
    close() { /* 无句柄需要释放 */ }
  };
}

const BACKENDS = {
  'sqlite-vec': { label: 'SQLite 向量索引', probe: probeSqliteVec, create: createSqliteVecBackend, install: 'npm i sqlite-vec' },
  'js-cosine': { label: '纯 JS 余弦扫描', probe: () => ({ available: true, reason: '' }), create: createJsCosineBackend, install: '' }
};

function backendStatus() {
  return Object.entries(BACKENDS).map(([id, backend]) => {
    const probe = backend.probe();
    return { id, label: backend.label, available: probe.available, version: probe.version || '', reason: probe.reason || '', install: backend.install };
  });
}

/**
 * 回答「当前实际用的后端是不是降级结果」。检索时索引是按清单里记录的后端打开的（保证文件格式一致），
 * 所以 handle.degraded 只能反映「打开清单后端」这一步；真正的判据是 actual 与引擎首选是否一致。
 * 不一致时给出首选后端此刻不可用的原因；若首选此刻其实可用（索引是在降级环境下建的），如实说明需重建。
 */
function explainBackendChoice(actualId, preferredId = PREFERRED_BACKEND) {
  if (actualId === preferredId) return { degraded: false, reason: '' };
  const preferred = BACKENDS[preferredId];
  const probe = preferred ? preferred.probe() : { available: false, reason: '未注册的后端：' + preferredId };
  const reason = probe.available
    ? '索引建立时首选后端 ' + preferredId + ' 不可用，当前索引仍为 ' + actualId + '；重建索引即可切回。'
    : '首选后端 ' + preferredId + ' 不可用：' + probe.reason;
  return { degraded: true, reason };
}

/**
 * 打开索引后端。`preferred` 不可用时自动降级，并把实际使用的后端与降级原因一起返回 ——
 * 调用方必须把这个事实写进索引清单，不能让「用了兜底」看起来像「用了向量库」。
 */
function openVectorStore(dir, dimensions, preferred = 'sqlite-vec') {
  fs.mkdirSync(dir, { recursive: true });
  const order = [preferred, ...Object.keys(BACKENDS).filter(id => id !== preferred)];
  const failures = [];
  for (const id of order) {
    const backend = BACKENDS[id];
    if (!backend) continue;
    const probe = backend.probe();
    if (!probe.available) { failures.push({ id, reason: probe.reason }); continue; }
    try {
      const handle = backend.create(dir, dimensions);
      handle.requestedBackend = preferred;
      handle.degraded = id !== preferred;
      handle.degradeReason = handle.degraded ? (failures[0] ? failures[0].reason : '首选后端不可用') : '';
      return handle;
    } catch (error) {
      failures.push({ id, reason: error.message });
    }
  }
  throw new Error('没有可用的向量索引后端：' + failures.map(f => f.id + '（' + f.reason + '）').join('；'));
}

module.exports = {
  openVectorStore, backendStatus, explainBackendChoice, BACKENDS, VECTORS_FILE, SQLITE_FILE,
  probeSqliteVec, PREFERRED_BACKEND, DISABLE_SQLITE_VEC_ENV
};
