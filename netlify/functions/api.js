'use strict';

// Netlify Functions 入口：将 /.netlify/functions/api/* 请求转发到学习服务器。
// 使用 in-memory SQLite（冷启动后数据重置），适合演示部署。
// B 实测平台在 ~30.7–30.9s 处截断函数（HTTP 504），故应用层超时预算留 ~5s 余量提前降级，
// 让慢请求在平台截断前走 fallback-local（HTTP 200），而不是裸 504。本机默认仍 60000。
process.env.AI_REVIEW_TIMEOUT_MS ||= '25000';
// 模型默认值同样焊进函数入口：netlify.toml 的 [build.environment] 变量**不会**下发到 Functions 运行时
// （Netlify 文档：netlify.toml 声明的环境变量 not available to serverless functions；运行时须站点级且 scope 含 Functions），
// 只靠 netlify.toml 会让冷启动回退 store.js 的 deepseek-v4-pro。这里让部署产物自带默认值，
// 与上一行同一手法；站点级变量若已设置仍优先（||= 不覆盖已有值）。
process.env.DEEPSEEK_MODEL ||= 'deepseek-flash';
const { Readable } = require('node:stream');

let app = null;
function getApp() {
  if (!app) {
    const { createApp } = require('../../server/index.js');
    app = createApp({
      inMemory: true,
      skipHostCheck: true,
      onError: error => console.error('[netlify-handler]', error.message)
    });
  }
  return app;
}

function createMockReq(event) {
  const body = event.body || '';
  const isBase64 = event.isBase64Encoded;
  const headers = {};
  for (const [k, v] of Object.entries(event.headers || {})) headers[k.toLowerCase()] = v;
  const query = event.queryStringParameters || {};
  const search = Object.entries(query)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
  const url = event.path + (search ? '?' + search : '');
  const stream = Readable.from(isBase64 ? Buffer.from(body, 'base64') : body);
  stream.method = event.httpMethod || 'GET';
  stream.url = url;
  stream.headers = headers;
  return stream;
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    bodyChunks: [],
    headersSent: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    writeHead(status, headers) {
      this.statusCode = status;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) this.headers[k.toLowerCase()] = v;
      }
      this.headersSent = true;
    },
    end(body) {
      if (body) this.bodyChunks.push(Buffer.from(body));
      this.headersSent = true;
      this._done = true;
    },
    write(body) {
      this.bodyChunks.push(Buffer.from(body));
      return true;
    },
    on() { return this; },
    once() { return this; },
    removeListener() { return this; },
    destroy() { this._done = true; }
  };
  return res;
}

exports.handler = async function (event, context) {
  const { handleRequest } = getApp();
  const req = createMockReq(event);
  const res = createMockRes();
  await handleRequest(req, res);
  const body = Buffer.concat(res.bodyChunks).toString('utf8');
  return {
    statusCode: res.statusCode,
    headers: res.headers,
    body: body,
    isBase64Encoded: false
  };
};
