'use strict';

// 检索引擎注册表。
//
// 借鉴 DeepTutor 的做法：把「检索」当成**生态边界**而不是写死一个向量库，每个知识库绑定一个引擎。
// 但有一条本项目自己的底线 —— **状态必须诚实**。DeepTutor 的引擎卡片会显示
// Ready / Needs key / Needs setup / Not installed，让依赖在建模之前就可见；
// 这里沿用同样的语义（ready / needs-config / not-implemented），
// 未实现的引擎**明确列出并说明原因**，绝不假装存在。
//
// 「列出一个没实现的引擎」不是凑数：它让调用方知道抽象边界在哪、
// 以及要接一个新引擎需要提供什么（一个 embedder + 一个索引后端）。

const { createLocalEmbedder, createRemoteEmbedder } = require('./embedder');
const { backendStatus } = require('./vector-store');

const STATUS = { READY: 'ready', NEEDS_CONFIG: 'needs-config', NOT_IMPLEMENTED: 'not-implemented' };

const ENGINES = [
  {
    id: 'local-index',
    label: '本机索引',
    summary: '本机哈希嵌入 + 本机向量索引，零依赖、不联网。',
    status: STATUS.READY,
    requires: [],
    note: '默认引擎。嵌入是词面重合而非语义，跨语言改写会漏召回。',
    resolve() {
      return { embedder: createLocalEmbedder(), preferredBackend: 'sqlite-vec' };
    }
  },
  {
    id: 'remote-embedding',
    label: '远程嵌入索引',
    summary: '调用 OpenAI 兼容的 /embeddings 接口，得到真正的语义向量。',
    status: STATUS.NEEDS_CONFIG,
    requires: ['embedding.baseUrl', 'embedding.model'],
    note: '需要配置嵌入服务地址与模型；换嵌入模型后必须重建索引，不同向量空间不可混用。',
    resolve(config) {
      const embedding = config && config.embedding;
      if (!embedding || !embedding.baseUrl || !embedding.model) throw new Error('远程嵌入引擎需要配置 embedding.baseUrl 与 embedding.model。');
      return { embedder: createRemoteEmbedder(embedding, config.fetchImpl), preferredBackend: 'sqlite-vec' };
    }
  },
  {
    id: 'pageindex',
    label: 'PageIndex 推理检索',
    summary: '无向量的文档树遍历，按页给引用。',
    status: STATUS.NOT_IMPLEMENTED,
    requires: ['PageIndex 服务或本地运行时'],
    note: '未实现：它需要的是一次「阅读循环」而不是向量索引，接入形态与现有 index 契约不同，需单独设计。',
    resolve() { throw new Error('pageindex 引擎尚未实现。'); }
  },
  {
    id: 'graphrag',
    label: 'GraphRAG 知识图谱检索',
    summary: '跨文档关系与语料级问答。',
    status: STATUS.NOT_IMPLEMENTED,
    requires: ['Python 3.11–3.13 与 graphrag 依赖'],
    note: '未实现：引入 Python 运行时会让「克隆即可 verify」的承诺失效，需要单独评估。',
    resolve() { throw new Error('graphrag 引擎尚未实现。'); }
  }
];

function engineStatus(config) {
  return ENGINES.map(engine => {
    let status = engine.status;
    let reason = '';
    if (status === STATUS.NEEDS_CONFIG) {
      const ready = engine.requires.every(key => {
        const [group, field] = key.split('.');
        return Boolean(config && config[group] && config[group][field]);
      });
      if (ready) status = STATUS.READY;
      else reason = '缺少配置：' + engine.requires.join('、');
    } else if (status === STATUS.NOT_IMPLEMENTED) {
      reason = engine.note;
    }
    return {
      id: engine.id, label: engine.label, summary: engine.summary,
      status, requires: engine.requires, reason: reason || engine.note || ''
    };
  });
}

function getEngine(id) {
  const engine = ENGINES.find(item => item.id === id);
  if (!engine) throw new Error('未知的检索引擎：' + id);
  return engine;
}

function resolveEngine(id, config) {
  const engine = getEngine(id);
  if (engine.status === STATUS.NOT_IMPLEMENTED) throw new Error(engine.label + ' 尚未实现：' + engine.note);
  return { engine, ...engine.resolve(config) };
}

// 供 /api/rag/status 展示：引擎状态 + 索引后端可用性。两者都要能回答「为什么现在不能用」。
function ragCapabilities(config) {
  return { engines: engineStatus(config), backends: backendStatus() };
}

module.exports = { ENGINES, STATUS, engineStatus, getEngine, resolveEngine, ragCapabilities };
