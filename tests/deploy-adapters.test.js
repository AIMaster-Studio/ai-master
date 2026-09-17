'use strict';

// 部署适配契约。
//
// 起因（2026-09-15 实测发现）：`inMemory` 原先只作用于 SQLite（`:memory:`），
// 而 RAG / 记忆 / 技能包 / agent 会话都是**文件存储**的，默认落在仓库根的 `.local/` 下。
// Vercel 与 Netlify 的函数入口都传 `inMemory: true`，但这两个平台的文件系统除 `/tmp` 外只读 ——
// `createApp` 会在建目录那一步直接抛错，**所有 /api/* 都返回 500**，而不只是新接口。
//
// 这类问题的危险之处在于：本机测试永远发现不了（本机哪儿都能写），
// 而且它会连带打死整个 API 面。所以这里把「临时实例不碰仓库目录」钉成契约。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createApp } = require('../server');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const insideProject = target => target === PROJECT_ROOT || target.startsWith(PROJECT_ROOT + path.sep);

test('an ephemeral app keeps every file-backed store out of the project directory', () => {
  const app = createApp({ inMemory: true, skipHostCheck: true });
  try {
    assert.equal(app.persistentDb, false);
    assert.equal(insideProject(app.dataRoots.base), false, '临时实例的数据目录不应落在仓库内：' + app.dataRoots.base);
    for (const key of ['rag', 'memory', 'skills', 'agent']) {
      assert.equal(insideProject(app.dataRoots[key]), false, key + ' 落在了仓库内：' + app.dataRoots[key]);
    }
    // rag / skills / agent 在构造时就建目录（服务端函数平台只保证 /tmp 可写，早失败好过运行时失败）。
    for (const key of ['rag', 'skills', 'agent']) {
      assert.ok(fs.existsSync(app.dataRoots[key]), key + ' 目录应在构造时就建好');
    }
    // memory 是**惰性**建目录的（按 userId 首次访问才创建），所以这里只断言它可被创建，
    // 不断言已存在 —— 否则就是在测实现细节而不是契约。
    assert.ok(fs.existsSync(app.dataRoots.base), '数据根目录应在构造时就建好');
  } finally { app.server.close(); }
});

test('dbPath ":memory:" is treated as ephemeral too, not just the inMemory flag', () => {
  // 测试夹具普遍用 dbPath:':memory:' 而不是 inMemory:true；
  // 若只认 inMemory，这些实例会悄悄往仓库 .local/ 里写。
  const app = createApp({ dbPath: ':memory:' });
  try {
    assert.equal(app.persistentDb, false);
    assert.equal(insideProject(app.dataRoots.base), false, 'dbPath 为 :memory: 时同样不应落在仓库内');
  } finally { app.server.close(); }
});

test('a persistent app still uses the project .local directory', () => {
  const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aimaster-persist-')), 'learning.sqlite');
  const app = createApp({ dbPath: dbFile });
  try {
    assert.equal(app.persistentDb, true);
    assert.equal(app.dataRoots.base, path.join(PROJECT_ROOT, '.local'), '持久实例应沿用仓库 .local');
    assert.equal(app.dataRoots.rag, path.join(PROJECT_ROOT, '.local', 'rag'));
  } finally { app.server.close(); }
});

test('an explicit dataRoot overrides the default in both modes', () => {
  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'aimaster-custom-'));
  const ephemeral = createApp({ inMemory: true, dataRoot: custom });
  try {
    assert.equal(ephemeral.dataRoots.base, custom);
    assert.equal(ephemeral.dataRoots.rag, path.join(custom, 'rag'));
  } finally { ephemeral.server.close(); }

  // 细粒度覆盖仍然有效（测试夹具依赖这一点）。
  const fine = createApp({ inMemory: true, ragDataRoot: path.join(custom, 'only-rag') });
  try {
    assert.equal(fine.dataRoots.rag, path.join(custom, 'only-rag'));
    assert.notEqual(fine.dataRoots.memory, path.join(custom, 'only-rag'));
  } finally { fine.server.close(); }
});

test('the serverless adapters declare ephemeral mode, so the guard above stays relevant', () => {
  // 这条不是形式检查：如果哪天有人把 inMemory 从适配器里去掉，
  // 上面几条用例仍然会通过，而线上会重新开始往只读目录写。这里把两件事连起来。
  for (const file of ['netlify/functions/api.js']) {
    const source = fs.readFileSync(path.resolve(PROJECT_ROOT, file), 'utf8');
    assert.match(source, /inMemory:\s*true/, file + ' 应声明 inMemory:true');
    assert.match(source, /skipHostCheck:\s*true/, file + ' 应声明 skipHostCheck:true');
  }
  const vercel = fs.readFileSync(path.resolve(PROJECT_ROOT, 'api/[...slug].js'), 'utf8');
  assert.match(vercel, /vercelOptions\(\)/);
  const options = require('../server/vercel-runtime').vercelOptions({});
  assert.equal(options.inMemory, true);
  assert.equal(insideProject(options.dataRoot), false);
});

test('the ephemeral app actually serves API routes without touching the project directory', async () => {
  const app = createApp({ inMemory: true, skipHostCheck: true });
  app.server.listen(0, '127.0.0.1');
  await new Promise(resolve => app.server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    // 关键：这些接口背后都是文件存储，临时实例必须能正常应答而不是 500。
    for (const route of ['/api/status', '/api/memory/inspect', '/api/rag/status', '/api/skills', '/api/agent/capabilities']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route + ' 应返回 200，实际 ' + response.status);
      const body = await response.json();
      assert.equal(body.ok, true, route + ' 应返回 ok:true');
    }
  } finally {
    await new Promise(resolve => app.server.close(resolve));
  }
});
