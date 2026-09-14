'use strict';

// 记忆的 HTTP 路由。记忆按用户隔离：每个访客/账号有自己的 dataRoot 子目录，
// 不共用一份文件，避免把 A 的学习记录读进 B 的画像。

function createMemoryRoutes(options) {
  const memoryFor = options.memoryFor; // (userId) => memoryStore
  const requireAdmin = options.requireAdmin || (() => {});

  return async function handleMemory({ req, url, route, body, send, fail, user }) {
    const action = route.slice(7); // 去掉 'memory/'
    const isPost = req.method === 'POST';
    const memory = memoryFor(user.id);

    if (!isPost) {
      if (action === 'inspect') return send({ memory: memory.inspect(), graph: memory.graph() });
      if (action === 'graph') return send({ graph: memory.graph() });
      if (action === 'l1') {
        const surface = url.searchParams.get('surface');
        if (!surface) fail(400, '缺少 surface。');
        const date = url.searchParams.get('date') || undefined;
        const limit = Number(url.searchParams.get('limit')) || undefined;
        return send({ surface, events: memory.l1(surface, { date, limit }) });
      }
      if (action === 'l2') {
        const surface = url.searchParams.get('surface');
        if (!surface) fail(400, '缺少 surface。');
        return send({ surface, markdown: memory.readL2(surface) });
      }
      if (action === 'l3') {
        const slot = url.searchParams.get('slot');
        if (!slot) fail(400, '缺少 slot。');
        return send({ slot, markdown: memory.readL3(slot) });
      }
      if (action === 'surfaces') {
        return send({ surfaces: Object.entries(memory.SURFACES).map(([id, meta]) => ({ id, ...meta })), l3Slots: memory.L3_SLOTS });
      }
      fail(404, '接口不存在。');
    }

    if (action === 'refresh') {
      const surface = body.surface;
      if (!surface) fail(400, '缺少 surface。');
      return send({ refreshed: memory.refreshL2(surface) });
    }
    if (action === 'synthesize') {
      const result = memory.synthesize();
      return send({ generatedAt: result.generatedAt, l3: result.l3 });
    }
    if (action === 'preference') {
      return send({ preferences: memory.writePreference(body.text) });
    }
    if (action === 'clear') {
      // 清空记忆会丢掉全部学习轨迹，属管理操作：与配置写入同一道门。
      requireAdmin(req);
      return send(memory.clear(body.surface || null));
    }
    fail(404, '接口不存在。');
  };
}

module.exports = { createMemoryRoutes };
