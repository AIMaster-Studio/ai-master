const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { vercelOptions } = require('../server/vercel-runtime');
const { createApp } = require('../server');
test('Vercel remote DB configuration does not mislabel temporary file storage', () => {
  const options = vercelOptions({ TURSO_URL:'libsql://example', TURSO_AUTH_TOKEN:'test-token' });
  assert.equal(options.inMemory, false);
  assert.notEqual(options.dbPath, ':memory:');
  assert.equal(options.storageStatus.learningPersistent, true);
  assert.equal(options.storageStatus.filesPersistent, false);
  assert.equal(options.allowRemote, true);
  assert.equal(options.secureCookies, true);
  assert.ok(!JSON.stringify(options.storageStatus).includes('test-token'));
});
test('Vercel missing credentials remains explicitly ephemeral and partial config fails', () => {
  assert.equal(vercelOptions({}).inMemory, true);
  assert.equal(vercelOptions({}).storageStatus.learningPersistent, false);
  assert.throws(() => vercelOptions({ TURSO_URL:'libsql://example' }), /INCOMPLETE/);
  assert.throws(() => vercelOptions({ TURSO_AUTH_TOKEN:'x' }), /INCOMPLETE/);
});
test('Vercel status reports storage limitations and issues Secure session cookie', async t => {
  const app = createApp({ ...vercelOptions({}), configToken:'' });
  app.server.listen(0,'127.0.0.1'); await once(app.server,'listening');
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const response = await fetch(base + '/api/status');
  assert.equal(response.status,200);
  assert.match(response.headers.get('set-cookie'), /; Secure/);
  const status = await response.json();
  assert.equal(status.storage.learningPersistent,false);
  assert.equal(status.storage.filesPersistent,false);
  // Exposure mode must protect admin config even behind a loopback proxy.
  const denied = await fetch(base + '/api/ai/config', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(denied.status,403);
});
