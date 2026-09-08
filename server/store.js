'use strict';

const { randomUUID, randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL,
    login TEXT UNIQUE, password TEXT, state TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL
    REFERENCES users(id), expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS quizzes(id TEXT PRIMARY KEY, user_id TEXT NOT NULL
    REFERENCES users(id), data TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

function emptyState() {
  return { profile: null, plan: null, progress: {}, attempts: [], wrongAnswers: [], diagnostic: null };
}

// 内置默认 LLM 配置：当数据库中尚无 'ai' 设置行时返回此默认值。
// API Key 必须从环境变量 DEEPSEEK_API_KEY 读取，绝不硬编码。
// 未设置环境变量时 apiKey 为空，AI 复评默认不可用，需用户显式配置。
// 用户显式保存（包括 clear）后以此为准，不再回填，保留"关闭 AI 复评"的语义。
const BUILTIN_LLM_CONFIG = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-v4-pro',
  apiKey: process.env.DEEPSEEK_API_KEY || ''
};

function publicUser(row) {
  return { id: row.id, name: row.name, isGuest: !row.login };
}

// ---------------------------------------------------------------------------
// 本地 SQLite 模式（用于桌面端、本地开发、单元测试）
// ---------------------------------------------------------------------------
function createSqliteStore(filename) {
  const { DatabaseSync } = require('node:sqlite');
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; ${SCHEMA_SQL}`);

  const get = id => db.prepare('SELECT * FROM users WHERE id=?').get(id);

  async function createSession(id) {
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, id, Date.now() + 30 * 86400000);
    return token;
  }

  return {
    db,
    async state(id) { return JSON.parse(get(id).state); },
    async save(id, value) { db.prepare('UPDATE users SET state=? WHERE id=?').run(JSON.stringify(value), id); },
    async user(id) { return publicUser(get(id)); },
    async guest() {
      const id = randomUUID();
      db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id, '本机访客', null, null, JSON.stringify(emptyState()), new Date().toISOString());
      return { user: publicUser(get(id)), token: await createSession(id) };
    },
    async register(id, name, password) {
      const row = get(id);
      if (row.login) throw Object.assign(new Error('请先退出当前账号，再创建新账号。'), { status: 409 });
      const login = name.normalize('NFKC').toLocaleLowerCase();
      if (db.prepare('SELECT id FROM users WHERE login=?').get(login)) {
        throw Object.assign(new Error('这个昵称已被使用。'), { status: 409 });
      }
      const salt = randomBytes(16).toString('hex');
      const hash = scryptSync(password, salt, 64).toString('hex');
      db.prepare('UPDATE users SET name=?,login=?,password=? WHERE id=?').run(name, login, salt + ':' + hash, id);
      return publicUser(get(id));
    },
    async login(name, password) {
      const row = db.prepare('SELECT * FROM users WHERE login=?').get(name.normalize('NFKC').toLocaleLowerCase());
      const encoded = typeof row?.password === 'string' ? row.password : '';
      const [salt, hash] = encoded.split(':');
      let valid = false;
      if (row && /^[a-f0-9]{32}$/.test(salt || '') && /^[a-f0-9]{128}$/.test(hash || '')) {
        const actual = scryptSync(password, salt, 64);
        valid = timingSafeEqual(actual, Buffer.from(hash, 'hex'));
      }
      if (!valid) throw Object.assign(new Error('昵称或密码不正确。'), { status: 401 });
      return { user: publicUser(row), token: await createSession(row.id) };
    },
    createSession,
    async session(token) {
      const row = db.prepare('SELECT user_id FROM sessions WHERE token=? AND expires>?').get(token || '', Date.now());
      return row ? publicUser(get(row.user_id)) : null;
    },
    async endSession(token) { db.prepare('DELETE FROM sessions WHERE token=?').run(token || ''); },
    async putQuiz(id, userId, data) {
      db.prepare('DELETE FROM quizzes WHERE created_at < ?').run(Date.now() - 86400000);
      db.prepare('INSERT OR REPLACE INTO quizzes VALUES(?,?,?,?)').run(id, userId, JSON.stringify(data), Date.now());
    },
    async quiz(id, userId) {
      const row = db.prepare('SELECT data FROM quizzes WHERE id=? AND user_id=? AND created_at>?').get(id, userId, Date.now() - 86400000);
      return row ? JSON.parse(row.data) : null;
    },
    async config() {
      const row = db.prepare("SELECT value FROM settings WHERE key='ai'").get();
      if (!row) return { ...BUILTIN_LLM_CONFIG };
      return JSON.parse(row.value || '{}');
    },
    async saveConfig(value) { db.prepare("INSERT OR REPLACE INTO settings VALUES('ai',?)").run(JSON.stringify(value)); },
    async transaction(fn) {
      db.exec('BEGIN');
      try { await fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    close: () => db.close()
  };
}

// ---------------------------------------------------------------------------
// Turso (libSQL) 远程模式（用于公网部署，数据持久化不丢失）
// 环境变量：TURSO_URL, TURSO_AUTH_TOKEN
// ---------------------------------------------------------------------------
function createTursoStore() {
  const { createClient } = require('@libsql/client');
  const db = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });

  async function exec(sql, args = []) {
    return db.execute({ sql, args });
  }
  async function get(sql, args = []) {
    const rs = await db.execute({ sql, args });
    return rs.rows[0] || null;
  }

  // 初始化表结构
  (async () => {
    try {
      await db.execMultiple(SCHEMA_SQL);
    } catch (e) {
      console.error('[turso] schema init failed:', e.message);
    }
  })();

  async function createSession(id) {
    const token = randomBytes(32).toString('hex');
    await exec('DELETE FROM sessions WHERE expires < ?', [Date.now()]);
    await exec('INSERT INTO sessions VALUES(?,?,?)', [token, id, Date.now() + 30 * 86400000]);
    return token;
  }

  return {
    db,
    async state(id) { return JSON.parse((await get('SELECT state FROM users WHERE id=?', [id])).state); },
    async save(id, value) { await exec('UPDATE users SET state=? WHERE id=?', [JSON.stringify(value), id]); },
    async user(id) { return publicUser(await get('SELECT id, name, login FROM users WHERE id=?', [id])); },
    async guest() {
      const id = randomUUID();
      await exec('INSERT INTO users VALUES(?,?,?,?,?,?)', [id, '本机访客', null, null, JSON.stringify(emptyState()), new Date().toISOString()]);
      return { user: await this.user(id), token: await createSession(id) };
    },
    async register(id, name, password) {
      const row = await get('SELECT login FROM users WHERE id=?', [id]);
      if (row.login) throw Object.assign(new Error('请先退出当前账号，再创建新账号。'), { status: 409 });
      const login = name.normalize('NFKC').toLocaleLowerCase();
      const existing = await get('SELECT id FROM users WHERE login=?', [login]);
      if (existing) throw Object.assign(new Error('这个昵称已被使用。'), { status: 409 });
      const salt = randomBytes(16).toString('hex');
      const hash = scryptSync(password, salt, 64).toString('hex');
      await exec('UPDATE users SET name=?,login=?,password=? WHERE id=?', [name, login, salt + ':' + hash, id]);
      return await this.user(id);
    },
    async login(name, password) {
      const row = await get('SELECT * FROM users WHERE login=?', [name.normalize('NFKC').toLocaleLowerCase()]);
      const encoded = typeof row?.password === 'string' ? row.password : '';
      const [salt, hash] = encoded.split(':');
      let valid = false;
      if (row && /^[a-f0-9]{32}$/.test(salt || '') && /^[a-f0-9]{128}$/.test(hash || '')) {
        const actual = scryptSync(password, salt, 64);
        valid = timingSafeEqual(actual, Buffer.from(hash, 'hex'));
      }
      if (!valid) throw Object.assign(new Error('昵称或密码不正确。'), { status: 401 });
      return { user: publicUser(row), token: await createSession(row.id) };
    },
    createSession,
    async session(token) {
      const row = await get('SELECT user_id FROM sessions WHERE token=? AND expires>?', [token || '', Date.now()]);
      return row ? await this.user(row.user_id) : null;
    },
    async endSession(token) { await exec('DELETE FROM sessions WHERE token=?', [token || '']); },
    async putQuiz(id, userId, data) {
      await exec('DELETE FROM quizzes WHERE created_at < ?', [Date.now() - 86400000]);
      await exec('INSERT OR REPLACE INTO quizzes VALUES(?,?,?,?)', [id, userId, JSON.stringify(data), Date.now()]);
    },
    async quiz(id, userId) {
      const row = await get('SELECT data FROM quizzes WHERE id=? AND user_id=? AND created_at>?', [id, userId, Date.now() - 86400000]);
      return row ? JSON.parse(row.data) : null;
    },
    async config() {
      const row = await get("SELECT value FROM settings WHERE key='ai'");
      if (!row) return { ...BUILTIN_LLM_CONFIG };
      return JSON.parse(row.value || '{}');
    },
    async saveConfig(value) { await exec("INSERT OR REPLACE INTO settings VALUES('ai',?)", [JSON.stringify(value)]); },
    async transaction(fn) {
      const tx = await db.transaction('write');
      try { await fn(tx); await tx.commit(); } catch (e) { await tx.rollback(); throw e; }
    },
    close: () => db.close()
  };
}

function openStore(filename) {
  if (process.env.TURSO_URL) {
    return createTursoStore();
  }
  return createSqliteStore(filename);
}

module.exports = { openStore, emptyState, BUILTIN_LLM_CONFIG };
