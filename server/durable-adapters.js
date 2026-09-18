'use strict';
const { durableStore } = require('./durable-files');
const { createMemoryStore, SURFACES, L3_SLOTS } = require('./memory/store');
const { createKbStore } = require('./rag/kb-store');
function durableMemory(repository, userId) {
  if (typeof userId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(userId)) throw new Error('invalid memory owner');
  const store = durableStore({ repository, scope: 'memory:' + userId,
    factory: root => createMemoryStore({ dataRoot: root }),
    methods: ['record','l1','l1Dates','refreshL2','readL2','synthesize','readL3','writePreference','inspect','graph','clear'],
    // Only record is append-only and safe to reapply against a fresh snapshot. Explicit replacements never retry.
    retrySafe: ['record'], metadata: { SURFACES, L3_SLOTS }
  });
  const inspect = store.inspect;
  store.inspect = async () => ({ ...await inspect(), root: 'remote-database', notice: 'L1/L2/L3及显式偏好保存到远程数据库，临时目录只是工作副本。L2/L3为确定性聚合，非模型摘要。' });
  return store;
}
function durableRag(repository, config) {
  return durableStore({ repository, scope: 'rag:shared-course-library',
    factory: root => {
      const local = createKbStore({ dataRoot: root, config });
      local.seedCourse = async (documents, name) => {
        let kb = local.list().find(k => k.name === name); const created = !kb;
        if (!kb) kb = local.create({ name, engine:'local-index' });
        local.replaceDocuments(kb.id, documents);
        const manifest = await local.buildIndex(kb.id);
        return { created, kbId:kb.id, manifest };
      };
      return local;
    },
    methods: ['list','info','create','addDocuments','replaceDocuments','buildIndex','activate','search','remove','readManifest','seedCourse']
  });
}
module.exports = { durableMemory, durableRag };
