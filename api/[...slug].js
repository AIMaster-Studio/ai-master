'use strict';

// Vercel Serverless 入口：将 /api/* 请求转发到学习服务器。
// 使用 in-memory SQLite（冷启动后数据重置），适合演示部署。
// 对齐 vercel.json 的 maxDuration:30——应用层超时预算 25s，让慢请求在平台截断前
// 走 fallback-local（HTTP 200），而不是裸 504/504-like。本机默认仍 60000。
process.env.AI_REVIEW_TIMEOUT_MS ||= '25000';
const path = require('node:path');

let app = null;
function getApp() {
  if (!app) {
    const { createApp } = require(path.join(__dirname, '..', 'server', 'index.js'));
    app = createApp({
      inMemory: true,
      skipHostCheck: true,
      onError: error => console.error('[vercel-handler]', error.message)
    });
  }
  return app;
}

module.exports = async function handler(req, res) {
  const { handleRequest } = getApp();
  await handleRequest(req, res);
};
