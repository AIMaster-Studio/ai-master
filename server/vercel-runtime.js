'use strict';
const os = require('node:os');
const path = require('node:path');
function vercelOptions(env = process.env) {
  const { configured: hasUrl } = require('./turso-config').tursoConfig(env);
  const durableSnapshots = env.AIMASTER_DURABLE_SNAPSHOTS === '1';
  if (durableSnapshots && !hasUrl) throw new Error('DURABLE_SNAPSHOTS_REQUIRE_REMOTE_DB');
  const dataRoot = path.join(os.tmpdir(), 'aimaster-vercel-' + process.pid);
  return {
    // Database and file storage have different lifetimes on serverless.
    inMemory: !hasUrl,
    durableSnapshots,
    ...(hasUrl ? { dbPath: path.join(dataRoot, 'remote-store.sqlite') } : {}),
    dataRoot,
    skipHostCheck: true,
    allowRemote: true,
    secureCookies: true,
    storageStatus: {
      learning: hasUrl ? 'remote-turso' : 'ephemeral-memory',
      learningPersistent: hasUrl,
      files: durableSnapshots ? 'mixed-remote-and-ephemeral' : 'ephemeral-tmp',
      rag: durableSnapshots ? 'remote-snapshot' : 'ephemeral-tmp',
      memory: durableSnapshots ? 'remote-snapshot' : 'ephemeral-tmp',
      skills: 'ephemeral-tmp',
      agent: 'ephemeral-tmp',
      filesPersistent: false,
      warning: durableSnapshots
        ? '学习数据库、RAG和记忆已配置远程存储；技能及Agent会话仍为临时数据。快照有容量限制，配置状态不代表远程健康检查已通过。'
        : hasUrl
        ? '学习数据库已配置远程存储；RAG、记忆、技能及Agent文件仍为临时数据，不保证跨实例或重新部署保留。'
        : '演示模式：学习记录和文件存储均非持久化，冷启动或实例切换可能丢失数据。'
    }
  };
}
module.exports = { vercelOptions };
