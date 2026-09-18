const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const source = readFileSync(resolve(__dirname, '../frontend/_worker.js'), 'utf8');
const load = () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const request = () => new Request('https://site.example/api/status');
test('Pages proxy deployment and failure boundaries', async t => {
  const { default: worker } = await load();
  await t.test('static assets do not require an upstream', async () => {
    const r = await worker.fetch(new Request('https://site.example/'), { ASSETS: { fetch: () => new Response('static') } });
    assert.equal(await r.text(), 'static');
  });
  for (const origin of ['', 'invalid', 'ftp://example.com', 'https://user:pass@example.com', 'https://site.example', 'https://example.com/path']) {
    await t.test('reject invalid deployment origin: ' + origin, async () => {
      const r = await worker.fetch(request(), { TUNNEL_ORIGIN: origin });
      assert.equal(r.status, 500);
      assert.equal((await r.json()).ok, false);
    });
  }
  const original = global.fetch;
  try {
    await t.test('DNS/530 errors are structured and do not expose upstream HTML', async () => {
      global.fetch = async () => new Response('sensitive upstream body', { status: 530 });
      const r = await worker.fetch(request(), { BACKEND_ORIGIN: 'https://backend.example' });
      assert.equal(r.status, 502);
      const body = await r.json();
      assert.equal(body.code, 'UPSTREAM_HTTP_ERROR');
      assert.equal(body.upstreamStatus, 530);
      assert.equal(JSON.stringify(body).includes('sensitive'), false);
      assert.equal(r.headers.get('cache-control'), 'no-store');
    });
    await t.test('network errors do not expose infrastructure details', async () => {
      global.fetch = async () => { throw new Error('secret infrastructure'); };
      const r = await worker.fetch(request(), { BACKEND_ORIGIN: 'https://backend.example' });
      assert.equal(r.status, 502);
      assert.equal((await r.json()).code, 'UPSTREAM_UNREACHABLE');
    });
    await t.test('success preserves session cookie and supplies timeout signal', async () => {
      global.fetch = async (url, init) => {
        assert.equal(url, 'https://backend.example/api/status');
        assert.ok(init.signal instanceof AbortSignal);
        assert.equal(init.redirect, 'manual');
        return new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'set-cookie': 'session=test; HttpOnly' } });
      };
      const r = await worker.fetch(request(), { BACKEND_ORIGIN: 'https://backend.example' });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).ok, true);
      assert.match(r.headers.get('set-cookie'), /session=test/);
    });
    await t.test('upstream timeout remains a failure, never a successful fallback', async () => {
      global.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); };
      const r = await worker.fetch(request(), { BACKEND_ORIGIN: 'https://backend.example' });
      assert.equal(r.status, 504);
      const body = await r.json();
      assert.equal(body.ok, false);
      assert.equal(body.code, 'UPSTREAM_TIMEOUT');
    });
    await t.test('204 responses have no body', async () => {
      global.fetch = async () => new Response(null, { status: 204 });
      const r = await worker.fetch(request(), { BACKEND_ORIGIN: 'https://backend.example' });
      assert.equal(r.status, 204);
    });
  } finally { global.fetch = original; }
});
