'use strict';
const os = require('node:os');
const path = require('node:path');
function vercelOptions(env = process.env) {
  const { configured: hasUrl } = require('./turso-config').tursoConfig(env);
  const dataRoot = path.join(os.tmpdir(), 'aimaster-vercel-' + process.pid);
  return {
    // Database and file storage have different lifetimes on serverless.
    inMemory: !hasUrl,
    ...(hasUrl ? { dbPath: path.join(dataRoot, 'remote-store.sqlite') } : {}),
    dataRoot,
    skipHostCheck: true,
    allowRemote: true,
    secureCookies: true,
    storageStatus: {
      learning: hasUrl ? 'remote-turso' : 'ephemeral-memory',
      learningPersistent: hasUrl,
      files: 'ephemeral-tmp',
      filesPersistent: false,
      warning: hasUrl
        ? '学习数据库已配置远程存储；RAG、记忆、技能及Agent文件仍为临时数据，不保证跨实例或重新部署保留。'
        : '演示模式：学习记录和文件存储均非持久化，冷启动或实例切换可能丢失数据。'
    }
  };
}
module.exports = { vercelOptions };
