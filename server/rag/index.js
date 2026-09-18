'use strict';

// RAG 服务门面。上层（HTTP 路由、讲解复评）只依赖这里，不直接碰内部模块。

const path = require('node:path');
const { createKbStore } = require('./kb-store');
const { ragCapabilities, engineStatus, getEngine, ENGINES } = require('./engines');
const { parseDocument, supportedFormats } = require('./parser');
const { backendStatus, PREFERRED_BACKEND } = require('./vector-store');
const { createEmbedder } = require('./embedder');

function createRagService(options = {}) {
  const dataRoot = options.dataRoot || path.join(options.root || process.cwd(), '.local', 'rag');
  const readConfig = typeof options.config === 'function' ? options.config : () => ({});
  const store = options.repository
    ? require('../durable-adapters').durableRag(options.repository, readConfig)
    : createKbStore({ dataRoot, config: readConfig });

  return {
    dataRoot: options.repository ? 'remote-database' : dataRoot,
    store,
    // 能力自述：引擎与后端各自的可用状态与不可用原因。UI 用这个回答「为什么现在不能用」。
    capabilities: () => ({
      ...ragCapabilities(readConfig()),
      currentEmbedder: createEmbedder(readConfig()).describe(),
      formats: supportedFormats()
    }),
    engines: () => engineStatus(readConfig()),
    backends: () => backendStatus(),
    // 供 /api/status 用的一眼健康摘要：首选后端是否可用、实际会落到谁、嵌入是否语义。
    // 与 capabilities() 的区别：这里只回答「有没有降级、为什么」，不列全部引擎与格式。
    health: () => {
      const embedderInfo = createEmbedder(readConfig()).describe();
      const backends = backendStatus();
      const preferred = backends.find(item => item.id === PREFERRED_BACKEND) || { available: false, reason: '未注册的后端：' + PREFERRED_BACKEND };
      const fallback = backends.find(item => item.available);
      const activeBackend = preferred.available ? PREFERRED_BACKEND : (fallback ? fallback.id : null);
      const warnings = [];
      if (!preferred.available) warnings.push('检索索引后端已降级：首选 ' + PREFERRED_BACKEND + ' 不可用（' + preferred.reason + '），当前使用 ' + (activeBackend || '无') + '。');
      if (!embedderInfo.semantic) warnings.push('检索嵌入为 ' + embedderInfo.id + '：只反映词面重合，不是语义检索。');
      return {
        preferredBackend: PREFERRED_BACKEND, activeBackend, backendDegraded: !preferred.available,
        degradeReason: preferred.available ? '' : preferred.reason,
        embedder: embedderInfo.id, semantic: embedderInfo.semantic, warnings
      };
    },
    getEngine,
    parseDocument,
    supportedFormats
  };
}

module.exports = { createRagService, ENGINES };
