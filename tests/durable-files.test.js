'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { createClient } = require('@libsql/client');
const { durableStore, createSnapshotRepository, restore, pack, MAX_PACKED } = require('../server/durable-files');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'durable-test-'));
  const db = createClient({ url: 'file::memory:' });
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const repository = createSnapshotRepository(db);
  const roots = [];
  function store(scope = 'alice', retrySafe = []) {
    return durableStore({ repository, scope, retrySafe, methods: ['get', 'set', 'append', 'fail'], factory: dir => {
      roots.push(dir); const file = path.join(dir, 'value');
      const get = () => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      return { get, set: value => { fs.writeFileSync(file, value); return value; },
        append: value => { const next = get() + value; fs.writeFileSync(file, next); return next; },
        fail: () => { fs.writeFileSync(file, 'bad'); throw new Error('operation failed'); } };
    } });
  }
  return { root, db, repository, store, roots };
}
test('snapshot survives adapter reconstruction and isolates owners', async t => {
  const f = fixture(t); await f.store().set('persistent');
  assert.equal(await f.store().get(), 'persistent');
  assert.equal(await f.store('bob').get(), '');
  assert.ok(f.roots.every(root => !fs.existsSync(root)));
});
test('SQL CAS rejects stale inserts and updates and preserves BLOB', async t => {
  const { repository: r } = fixture(t);
  assert.equal(await r.compareAndSwap('scope', 0, Buffer.from('one')), true);
  assert.equal(await r.compareAndSwap('scope', 0, Buffer.from('lost')), false);
  assert.equal(await r.compareAndSwap('scope', 1, Buffer.from('two')), true);
  assert.equal(await r.compareAndSwap('scope', 1, Buffer.from('lost')), false);
  const saved = await r.read('scope'); assert.equal(saved.version, 2); assert.equal(saved.snapshot.toString(), 'two');
});
test('concurrent explicit replacements reject one writer rather than silently overwrite', async t => {
  const f = fixture(t); await f.store().set('initial');
  const results = await Promise.allSettled([f.store().set('a'), f.store().set('b')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
});
test('safe append retries retain both concurrent writes exactly once', async t => {
  const f = fixture(t); await f.store().set('');
  await Promise.all([f.store('alice', ['append']).append('A'), f.store('alice', ['append']).append('B')]);
  assert.match(await f.store().get(), /^(AB|BA)$/);
});
test('operation failure rolls back and cleans working directories', async t => {
  const f = fixture(t); await f.store().set('good');
  await assert.rejects(f.store().fail(), /operation failed/);
  assert.equal(await f.store().get(), 'good');
  assert.ok(f.roots.every(root => !fs.existsSync(root)));
});
test('unchanged reads do not advance version', async t => {
  const f = fixture(t); await f.store().set('good');
  const before = await f.repository.read('alice'); await f.store().get();
  assert.equal((await f.repository.read('alice')).version, before.version);
});
test('snapshot rejects traversal, Windows paths, duplicate names and malformed base64', t => {
  const { root } = fixture(t);
  for (const name of ['../escape', '/absolute', 'C:drive', 'x:stream', 'a\\b', 'a/../b']) {
    assert.throws(() => restore(root, gzipSync(JSON.stringify([[name, 'YQ==']]))));
  }
  assert.throws(() => restore(root, gzipSync(JSON.stringify([['same','YQ=='],['same','Yg==']]))));
  assert.throws(() => restore(root, gzipSync(JSON.stringify([['bad','%%%']]))));
});
test('oversized compressed snapshot rejected before decompression', t => {
  const { root } = fixture(t); assert.throws(() => restore(root, Buffer.alloc(MAX_PACKED + 1)), /超限/);
});
