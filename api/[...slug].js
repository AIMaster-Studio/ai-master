'use strict';

// Vercel Serverless 入口：将 /api/* 请求转发到学习服务器。
// 配置完整 Turso 凭据时使用远程学习数据库；文件类存储仍为 /tmp，状态接口明确报告限制。
// 对齐 vercel.json 的 maxDuration:30——应用层超时预算 25s，让慢请求在平台截断前
// 走 fallback-local（HTTP 200），而不是裸 504/504-like。本机默认仍 60000。
process.env.AI_REVIEW_TIMEOUT_MS ||= '25000';
const path = require('node:path');

let app = null;
function getApp() {
  if (!app) {
    const { createApp } = require(path.join(__dirname, '..', 'server', 'index.js'));
    app = createApp({
      ...require('../server/vercel-runtime').vercelOptions(),
      onError: error => console.error('[vercel-handler]', error.message)
    });
  }
  return app;
}

module.exports = async function handler(req, res) {
  try {
    const { handleRequest } = getApp();
    await handleRequest(req, res);
  } catch {
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ ok:false, code:'BACKEND_INITIALIZATION_FAILED', error:'后端初始化失败，请维护者检查数据库配置及部署日志。' }));
    } else res.end();
  }
};
