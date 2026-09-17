'use strict';

// 「这是谁的错」的对外契约。
//
// 背景（2026-09-15 实测）：HTTP 层只认 error.status，没有 status 的一律兜成
// **500「服务暂时出错，请重试。」**。于是一批**由调用方输入决定、重试永远无效**的错误
// 被伪装成服务端故障 —— 实测 10 个纯调用方错误里 7 个返回 500：
//   用户按提示重试永远好不了，而且不知道要改什么；
//   index.js 的 onError 只记录无 status 的错误，真正的服务端故障反被输入错误淹没。
//
// 本文件把分类判据钉成会失败的测试，而不是留在注释里：
//   调用方改一下请求就能消除 → 4xx，且消息必须说清要改什么；
//   调用方改不了、属服务端自身数据损坏或编程错误 → 500，且必须进 onError 日志。
//
// 为什么值得单独一个文件：这是一条**跨模块**的对外契约（RAG / 记忆 / 能力 / 技能），
// 分散在各模块的测试里看不出「分类是否一致」，也拦不住下一个新接口重犯。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const { createApp } = require('../server');

const HERMETIC_SECURITY = { allowRemote: false, allowedHosts: [], configToken: '' };
// 兜底文案：任何「调用方改一下就能消除」的错误都不允许出现这句话。
const GENERIC_500 = '服务暂时出错，请重试。';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aimaster-errclass-'));
}

async function start(t, options = {}) {
  const app = createApp({ dbPath: ':memory:', ragDataRoot: tempRoot(), ...HERMETIC_SECURITY, ...options });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = 'http://127.0.0.1:' + app.server.address().port;
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  let cookie = '';
  const request = async (route, body) => {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json', Origin: base } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual'
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data };
  };
  return { request, app, base };
}

// 一张表列完：每一行都是「调用方改一下请求就能消除」的错误，状态码与消息片段都可核对。
const CLIENT_ERRORS = [
  ['GET  /api/rag/kb 未知库', '/api/rag/kb?kbId=nope', undefined, 404, /未找到这个知识库/],
  ['POST /api/rag/kb 名称为空', '/api/rag/kb', { name: '' }, 400, /1–60/],
  ['POST /api/rag/kb 未知引擎', '/api/rag/kb', { name: 'x', engine: 'nope' }, 400, /未知的检索引擎/],
  ['POST /api/rag/kb 未实现引擎', '/api/rag/kb', { name: 'x', engine: 'graphrag' }, 400, /尚未实现/],
  ['POST /api/rag/kb/index 未知库', '/api/rag/kb/index', { kbId: 'nope' }, 404, /未找到这个知识库/],
  ['POST /api/rag/kb/activate 不存在的版本', '/api/rag/kb/activate', { kbId: 'nope', version: 9 }, 404, /未找到这个知识库/],
  ['POST /api/rag/kb/documents 空数组', '/api/rag/kb/documents', { kbId: 'nope', documents: [] }, 400, /没有提供文档/],
  ['POST /api/rag/kb/upload 不支持的格式', '/api/rag/kb/upload', { kbId: 'nope', files: [{ filename: 'paper.pdf', text: 'x' }] }, 415, /暂不支持 \.pdf/],
  ['POST /api/rag/search 空 query', '/api/rag/search', {}, 400, /query/],
  ['GET  /api/memory/l2 未知面', '/api/memory/l2?surface=nope', undefined, 400, /未登记的记忆面/],
  ['POST /api/memory/refresh 未知面', '/api/memory/refresh', { surface: 'nope' }, 400, /未登记的记忆面/],
  ['POST /api/memory/preference 空内容', '/api/memory/preference', { text: '   ' }, 400, /不能为空/],
  ['GET  /api/memory/l3 未知槽位', '/api/memory/l3?slot=nope', undefined, 400, /未知的 L3 槽位/],
  ['POST /api/agent/run 未知能力', '/api/agent/run', { capability: 'nope', message: 'hi' }, 400, /未知的能力/],
  ['POST /api/skills/remove 非法技能名', '/api/skills/remove', { name: '../evil' }, 400, /技能名不合法/],
  ['POST /api/skills/remove 未安装的技能', '/api/skills/remove', { name: 'nosuchskill' }, 404, /未安装该技能/]
];

test('caller mistakes come back as 4xx with an actionable message, never as a generic 500', async t => {
  const { request } = await start(t);
  for (const [label, route, body, expectedStatus, messagePattern] of CLIENT_ERRORS) {
    const response = await request(route, body);
    assert.equal(response.status, expectedStatus, label + ' 的状态码：' + JSON.stringify(response.data));
    assert.match(String(response.data.error), messagePattern, label + ' 的消息应说清要改什么');
    assert.notEqual(String(response.data.error), GENERIC_500, label + ' 不得回落成兜底文案');
  }
});

test('caller mistakes stay out of the server-error log, and real server faults still get in', async t => {
  const seen = [];
  const { request, app } = await start(t, { onError: error => seen.push(error.message) });

  // 一串纯调用方错误：一条都不该进服务端错误日志。
  for (const [, route, body] of CLIENT_ERRORS) await request(route, body);
  assert.deepEqual(seen, [], '调用方错误不得进 onError —— 否则真正的故障会被淹没');

  // 反向：服务端自己的数据坏了，必须仍然是 500，并且要进日志。
  // 索引清单缺失属于服务端数据完整性问题：调用方改请求修不好，也不该被当成参数错误。
  const seeded = await request('/api/rag/course/seed', {});
  assert.equal(seeded.status, 200, '前置：课程库应能灌入');
  const manifest = path.join(app.dataRoots.rag, seeded.data.kbId, 'version-1', 'manifest.json');
  assert.ok(fs.existsSync(manifest), '前置：索引清单应存在');
  fs.rmSync(manifest);

  const broken = await request('/api/rag/search', { query: 'token' });
  assert.equal(broken.status, 500, '服务端数据损坏必须仍是 500，不能被这次改动顺手改成 4xx');
  assert.equal(broken.data.error, GENERIC_500);
  assert.equal(seen.length, 1, '真正的服务端故障必须进 onError');
  assert.match(seen[0], /索引清单缺失/);
});
