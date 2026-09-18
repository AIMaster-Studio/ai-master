'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('@libsql/client');
const { createSnapshotRepository, MAX_PACKED } = require('../server/durable-files');
const { createRagService } = require('../server/rag');
const { createRagRoutes } = require('../server/rag-routes');
const { buildCourseDocuments } = require('../server/rag/course-seed');
function fixture(t) {
  const db = createClient({ url: 'file::memory:' }); t.after(() => db.close());
  const repository = createSnapshotRepository(db);
  const service = () => createRagService({ repository, config: () => ({}) });
  const request = (rag, action, body) => createRagRoutes({ rag })({
    req: { method: body === undefined ? 'GET' : 'POST' },
    url: new URL('http://localhost/api/rag/' + action), route: 'rag/' + action.split('?')[0],
    body: body || {}, send: value => value, fail: (status, message) => { throw Object.assign(new Error(message), { status }); }
  });
  return { repository, service, request };
}
test('durable RAG routes create, index, reconstruct, search, activate and delete', async t => {
  const f = fixture(t), rag = f.service();
  const { kb } = await f.request(rag, 'kb', { name: 'test', engine: 'local-index' });
  await f.request(rag, 'kb/documents', { kbId: kb.id, documents: [{ title: 'Attention', text: 'Attention assigns weights to tokens based on query and key similarity.' }] });
  const { manifest } = await f.request(rag, 'kb/index', { kbId: kb.id });
  assert.equal(manifest.documentCount, 1);
  const restored = f.service();
  assert.equal((await f.request(restored, 'kbs')).kbs.length, 1);
  assert.equal((await f.request(restored, 'kb?kbId=' + kb.id)).kb.id, kb.id);
  const found = await f.request(restored, 'search', { kbId: kb.id, query: 'Attention query key' });
  assert.ok(found.result.hits.length > 0);
  assert.equal((await f.request(restored, 'kb/activate', { kbId: kb.id, version: 1 })).manifest.version, 1);
  await f.request(restored, 'kb/remove', { kbId: kb.id });
  assert.equal((await f.request(f.service(), 'kbs')).kbs.length, 0);
});
test('full bundled course seeds atomically and fits snapshot capacity', async t => {
  const f = fixture(t);
  const seeded = await f.request(f.service(), 'course/seed', {});
  assert.equal(seeded.manifest.documentCount, buildCourseDocuments().length);
  const saved = await f.repository.read('rag:shared-course-library');
  assert.equal(saved.version, 1);
  assert.ok(saved.snapshot.length <= MAX_PACKED);
  t.diagnostic('course documents=' + seeded.manifest.documentCount + ', chunks=' + seeded.manifest.chunkCount + ', snapshot bytes=' + saved.snapshot.length);
  const restored = f.service();
  assert.equal((await f.request(restored, 'status')).courseKbId, seeded.kbId);
  assert.ok((await f.request(restored, 'search?query=Transformer')).result.hits.length > 0);
});
