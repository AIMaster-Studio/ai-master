'use strict';

// RAG 服务门面。上层（HTTP 路由、讲解复评）只依赖这里，不直接碰内部模块。

const path = require('node:path');
const { createKbStore } = require('./kb-store');
const { ragCapabilities, engineStatus, getEngine, ENGINES } = require('./engines');
const { parseDocument, supportedFormats } = require('./parser');
const { backendStatus } = require('./vector-store');
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
    getEngine,
    parseDocument,
    supportedFormats
  };
}

module.exports = { createRagService, ENGINES };
