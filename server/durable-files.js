'use strict';
// Bounded atomic snapshots for the small-course deployment. Temporary directories are never authoritative.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { gzipSync, gunzipSync } = require('node:zlib');
const MAX_RAW = 16 * 1024 * 1024;
const MAX_PACKED = 1024 * 1024;
const MAX_FILES = 10000;
const error = (status, message) => Object.assign(new Error(message), { status });
function safeFile(root, name) {
  if (typeof name !== 'string' || !name || name.includes(':') || name.includes('\\') || name.includes('\0') || name.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(name)) throw error(500, '持久快照包含非法路径。');
  const file = path.resolve(root, name);
  if (!file.startsWith(path.resolve(root) + path.sep)) throw error(500, '持久快照路径越界。');
  return file;
}
function pack(root) {
  const files = []; let size = 0;
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw error(500, '持久存储不接受符号链接。');
      if (stat.isDirectory()) walk(file);
      else if (stat.isFile()) {
        size += stat.size;
        if (size > MAX_RAW || files.length >= MAX_FILES) throw error(413, '当前知识库或记忆超过快照容量限制，请归档或拆分；未覆盖原数据。');
        files.push([path.relative(root, file).split(path.sep).join('/'), fs.readFileSync(file).toString('base64')]);
      }
    }
  }
  walk(root);
  const data = gzipSync(JSON.stringify(files), { level: 6 });
  if (data.length > MAX_PACKED) throw error(413, '压缩快照超过 1 MiB 限制，请归档或拆分；未覆盖原数据。');
  return data;
}
function restore(root, snapshot) {
  if (!snapshot) return;
  const compressed = Buffer.from(snapshot);
  if (compressed.length > MAX_PACKED) throw error(500, '持久快照超限。');
  const files = JSON.parse(gunzipSync(compressed, { maxOutputLength: MAX_RAW * 2 }).toString('utf8'));
  if (!Array.isArray(files) || files.length > MAX_FILES) throw error(500, '持久快照格式错误。');
  const seen = new Set(); let size = 0;
  for (const row of files) {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[1] !== 'string') throw error(500, '持久快照格式错误。');
    const file = safeFile(root, row[0]);
    if (seen.has(file)) throw error(500, '持久快照包含重复路径。');
    seen.add(file);
    const bytes = Buffer.from(row[1], 'base64');
    if (bytes.toString('base64') !== row[1]) throw error(500, '持久快照包含非法编码。');
    size += bytes.length;
    if (size > MAX_RAW) throw error(500, '持久快照解压后超限。');
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
  }
}
function createSnapshotRepository(db, ready = Promise.resolve()) {
  const initialized = Promise.resolve(ready).then(() => db.execute('CREATE TABLE IF NOT EXISTS durable_files(scope TEXT PRIMARY KEY, version INTEGER NOT NULL, snapshot BLOB NOT NULL)'));
  initialized.catch(() => {});
  return {
    async read(scope) {
      await initialized;
      const result = await db.execute({ sql: 'SELECT version,snapshot FROM durable_files WHERE scope=?', args: [scope] });
      const row = result.rows[0];
      return row ? { version: Number(row.version), snapshot: Buffer.from(row.snapshot) } : { version: 0, snapshot: null };
    },
    async compareAndSwap(scope, version, snapshot) {
      await initialized;
      if (!Number.isSafeInteger(version) || version < 0) throw new Error('invalid snapshot version');
      const result = version === 0
        ? await db.execute({ sql: 'INSERT INTO durable_files(scope,version,snapshot) VALUES(?,1,?) ON CONFLICT(scope) DO NOTHING', args: [scope, new Uint8Array(snapshot)] })
        : await db.execute({ sql: 'UPDATE durable_files SET version=version+1,snapshot=? WHERE scope=? AND version=?', args: [new Uint8Array(snapshot), scope, version] });
      return Number(result.rowsAffected) === 1;
    }
  };
}
function durableStore({ repository, scope, factory, methods, retrySafe = [], metadata = {} }) {
  const store = { ...metadata };
  for (const method of methods) {
    store[method] = async (...args) => {
      const tries = retrySafe.includes(method) ? 4 : 1;
      for (let attempt = 0; attempt < tries; attempt++) {
        const saved = await repository.read(scope);
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aimaster-op-'));
        try {
          restore(root, saved.snapshot);
          const local = factory(root);
          const result = await local[method](...args);
          const snapshot = pack(root);
          if (saved.snapshot && snapshot.equals(Buffer.from(saved.snapshot))) return result;
          if (await repository.compareAndSwap(scope, saved.version, snapshot)) return result;
        } finally { fs.rmSync(root, { recursive: true, force: true }); }
      }
      throw error(409, '数据已被另一个请求更新，本次写入未保存。请重新读取后重试。');
    };
  }
  return store;
}
module.exports = { createSnapshotRepository, durableStore, pack, restore, MAX_RAW, MAX_PACKED };
