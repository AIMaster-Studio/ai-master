'use strict';

// 检索后端降级必须对外可见 —— 在 /api/rag/search 的响应体、响应头，以及 /api/status 三处。
//
// 背景（2026-09-18 线上实测，build a3b3c8c9）：Vercel 函数包里缺 sqlite-vec-linux-x64/vec0.so，
// 检索静默退化为纯 JS 余弦扫描；/api/rag/search 照常 200，/api/status 也看不出任何异常。
// 本文件把「降级可见」钉成两个方向的判据：
//   - 停用首选后端时，三处都必须报告降级（应失败方向 —— 若判据恒真，这里就测不出差别）；
//   - 首选后端可用时，三处都不得误报（应通过方向）。
// 停用手段是运维开关 AIMASTER_DISABLE_SQLITE_VEC=1，而不是删依赖：同一台机器上两个方向都能跑。

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { createApp } = require('../server');
const { probeSqliteVec, explainBackendChoice, DISABLE_SQLITE_VEC_ENV, PREFERRED_BACKEND } = require('../server/rag/vector-store');

const HERMETIC_SECURITY = { allowRemote: false, allowedHosts: [], configToken: '' };

async function start(t) {
  const app = createApp({ dbPath: ':memory:', ...HERMETIC_SECURITY });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = 'http://127.0.0.1:' + app.server.address().port;
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  let cookie = '';
  return async (route, body) => {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json', Origin: base } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
}

function withSqliteVecDisabled(t) {
  const previous = process.env[DISABLE_SQLITE_VEC_ENV];
  process.env[DISABLE_SQLITE_VEC_ENV] = '1';
  t.after(() => {
    if (previous === undefined) delete process.env[DISABLE_SQLITE_VEC_ENV];
    else process.env[DISABLE_SQLITE_VEC_ENV] = previous;
  });
}

test('the disable switch makes the preferred backend report unavailable with a reason', t => {
  withSqliteVecDisabled(t);
  const probe = probeSqliteVec();
  assert.equal(probe.available, false);
  assert.match(probe.reason, new RegExp(DISABLE_SQLITE_VEC_ENV));
  const choice = explainBackendChoice('js-cosine', PREFERRED_BACKEND);
  assert.equal(choice.degraded, true);
  assert.match(choice.reason, /不可用/);
  assert.deepEqual(explainBackendChoice(PREFERRED_BACKEND, PREFERRED_BACKEND), { degraded: false, reason: '' });
});

test('a degraded retrieval backend is visible in the search response, its header and /api/status', async t => {
  withSqliteVecDisabled(t);
  const request = await start(t);

  const status = await request('/api/status');
  assert.equal(status.status, 200);
  assert.equal(status.data.degraded, true, '/api/status 必须把检索降级暴露到顶层');
  assert.equal(status.data.rag.backendDegraded, true);
  assert.equal(status.data.rag.preferredBackend, PREFERRED_BACKEND);
  assert.equal(status.data.rag.activeBackend, 'js-cosine');
  assert.ok(status.data.rag.degradeReason.length > 0, '降级必须带原因');
  assert.ok(status.data.warnings.some(item => /降级/.test(item)), '警告列表必须点名降级');

  const seeded = await request('/api/rag/course/seed', {});
  assert.equal(seeded.status, 200);
  const search = await request('/api/rag/search', { query: 'token 与上下文预测', limit: 3 });
  assert.equal(search.status, 200, '降级仍要能服务，但不得装作正常');
  assert.equal(search.data.degraded, true, '响应顶层必须有 degraded:true');
  assert.equal(search.data.result.degraded, true);
  assert.equal(search.data.result.backend.id, 'js-cosine');
  assert.equal(search.data.result.backend.requestedBackend, PREFERRED_BACKEND);
  assert.ok(search.data.result.backend.degradeReason.length > 0);
  assert.ok(search.data.warnings.some(item => /降级/.test(item)));
  assert.equal(search.headers.get('x-aimaster-degraded'), 'rag-backend', '只看响应头的监控也必须能发现降级');
  assert.ok(search.data.result.hits.length > 0, '降级不等于没结果');
});

test('when the preferred backend works nothing is reported as degraded', { skip: !probeSqliteVec().available && 'sqlite-vec 在本机不可用，无法验证应通过方向' }, async t => {
  const request = await start(t);
  const status = await request('/api/status');
  assert.equal(status.data.degraded, false);
  assert.equal(status.data.rag.backendDegraded, false);
  assert.equal(status.data.rag.activeBackend, PREFERRED_BACKEND);
  assert.equal(status.data.warnings.some(item => /降级/.test(item)), false);

  await request('/api/rag/course/seed', {});
  const search = await request('/api/rag/search', { query: 'token 与上下文预测', limit: 3 });
  assert.equal(search.status, 200);
  assert.equal(search.data.degraded, false);
  assert.equal(search.data.result.backend.id, PREFERRED_BACKEND);
  assert.equal(search.headers.get('x-aimaster-degraded'), null, '正常路径不得带降级头');
  // 非语义嵌入仍然要如实标注，这与后端是否降级是两件事。
  assert.ok(search.data.warnings.some(item => /不是语义检索/.test(item)));
});
