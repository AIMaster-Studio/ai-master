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

function probeSqliteVec() {
  const loaded = loadSqliteVec();
  if (!loaded) return { available: false, reason: '未安装 sqlite-vec（npm i sqlite-vec），或当前 Node 不支持 node:sqlite。' };
  let db;
  try {
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

module.exports = { openVectorStore, backendStatus, BACKENDS, VECTORS_FILE, SQLITE_FILE, probeSqliteVec };
