'use strict';

// 能力（capability）运行时。
//
// 借鉴 DeepTutor 的核心结构决策：**多个能力共享同一套运行时与会话上下文**，
// 而不是每个功能各写一套。这里落实为：
//   - 工具在注册表里登记一次，任何能力都能按需取用；
//   - 会话（messages）由调用方持有并可跨能力延续；
//   - 每个能力声明自己需要哪些工具、是否需要模型，运行时统一装配。
//
// 诚实边界：本仓库没有 sandbox，因此**不提供代码执行类工具**。
// DeepTutor 的 `exec` 依赖 bubblewrap / 容器 / 受限子进程，本机 Node 进程里做不到等价隔离，
// 与其做一个「看起来能跑代码其实没有隔离」的工具，不如不提供 —— 见 tools 列表里没有 exec。

const { createToolRegistry, GROUPS } = require('../agent/tools');
const { runAgentLoop, resumeMessages, ASK_USER_TOOL } = require('../agent/loop');

const MAX_SEARCH_HITS = 8;

// ---------------------------------------------------------------------------
// 内置工具
// ---------------------------------------------------------------------------
function registerBuiltinTools(registry, deps) {
  const { rag, memoryFor, courseKbId } = deps;

  registry.register({
    name: 'rag_search', group: GROUPS.CONTEXT,
    description: '在指定知识库中做相似度检索，返回带来源标注的片段。不传 kbId 时检索课程知识库。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索问题' },
        kbId: { type: 'string', description: '知识库 ID，省略则用课程知识库' },
        limit: { type: 'integer', description: '返回条数，1–8' }
      },
      required: ['query']
    },
    async run(args) {
      const kbId = args.kbId || courseKbId();
      if (!kbId) throw new Error('没有可检索的知识库：课程库尚未建立，也没有指定 kbId。');
      const limit = Math.max(1, Math.min(Number(args.limit) || 4, MAX_SEARCH_HITS));
      const result = await rag.store.search(kbId, args.query, limit);
      return {
        kbId, version: result.version, embedder: result.embedder.id, semantic: result.embedder.semantic,
        notice: result.embedder.semantic ? '' : '本次检索使用词面重合嵌入，不是语义检索。',
        hits: result.hits.map(hit => ({ title: hit.title, source: hit.source, score: hit.score, text: hit.text }))
      };
    }
  });

  registry.register({
    name: 'kb_list', group: GROUPS.CONTEXT,
    description: '列出本机所有知识库及其当前索引版本。',
    parameters: { type: 'object', properties: {} },
    async run() {
      return rag.store.list().map(kb => ({
        id: kb.id, name: kb.name, engine: kb.engine, activeVersion: kb.activeVersion,
        documents: kb.documentCount, chunks: kb.activeManifest ? kb.activeManifest.chunkCount : 0,
        embedder: kb.activeManifest ? kb.activeManifest.embedder.id : null
      }));
    }
  });

  registry.register({
    name: ASK_USER_TOOL, group: GROUPS.CONTEXT,
    description: '当信息不足、且猜测会明显偏离用户意图时，暂停本轮并提一个结构化追问。不要用它确认显而易见的事。',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '要问的问题' },
        options: { type: 'array', items: { type: 'string' }, description: '可选的候选项，最多 6 个' },
        reason: { type: 'string', description: '为什么必须先问清楚' }
      },
      required: ['question']
    },
    async run() { return { note: 'ask_user 由 agent 循环中断处理，不会走到这里。' }; }
  });
  return registry;
}

// ---------------------------------------------------------------------------
// 能力
// ---------------------------------------------------------------------------
const CAPABILITIES = [
  {
    id: 'explain',
    label: '讲解复评',
    summary: '提交一段自己的讲解，先过本地 7 项完整性筛查，再基于课程证据做模型复评。',
    // 关键：讲解复评**未配置模型时也能用**（走本地规则筛查），所以它不是 needs-config。
    // 走查时发现原先标成 needs-config 会让人以为「没配模型就不能用」而直接放弃这个功能。
    needsModel: false,
    modelOptional: true,
    modelNote: '未配置模型时走本地规则筛查（只查表达完整性，不做语义判断）；配置后追加基于课程证据的模型复评。',
    tools: [],
    kind: 'pipeline'
  },
  {
    id: 'quiz',
    label: '客观测验',
    summary: '按模块出题，服务端标答判分，达到 75% 判定通过。',
    needsModel: false,
    tools: [],
    kind: 'pipeline'
  },
  {
    id: 'research',
    label: '深度研究',
    summary: '多轮检索 + 工具调用的研究回合，产出带来源标注的回答；信息不足时会先追问。',
    // 这个能力**必须**有模型：它整个就是模型驱动的多轮工具调用，没有本地降级路径。
    needsModel: true,
    tools: ['rag_search', 'kb_list', 'read_memory', 'write_preference', ASK_USER_TOOL],
    kind: 'agent-loop'
  }
];

function createCapabilityRegistry(deps) {
  const { rag, memoryFor, courseKbId } = deps;
  const tools = registerBuiltinTools(createToolRegistry(), { rag, memoryFor, courseKbId });

  // 这两个工具依赖具体学习者，因此在这里注册（注册表本身不持有用户状态）：
  // 用户身份由 agent 循环通过 context.userId 注入，工具只认 context，不去猜「当前是谁」。
  tools.register({
    name: 'read_memory', group: GROUPS.CONTEXT,
    description: '读取该学习者的记忆：L2 各面事实（plan/explain/quiz/review/rag）或 L3 槽位（profile/recent/scope）。',
    parameters: { type: 'object', properties: { slot: { type: 'string', description: 'L2 面名或 L3 槽位名' } }, required: ['slot'] },
    async run(args, context) {
      const memory = memoryFor(context.userId);
      const slot = String(args.slot || '');
      if (['profile', 'recent', 'scope', 'preferences'].includes(slot)) return { slot, markdown: memory.readL3(slot) };
      const markdown = memory.readL2(slot);
      if (markdown === null) throw new Error('该面还没有 L2 事实（可能尚无对应活动）：' + slot);
      return { slot, markdown };
    }
  });
  tools.register({
    name: 'write_preference', group: GROUPS.GOVERNED,
    description: '把一条学习偏好显式写入 L3。仅在用户明确要求时使用。',
    parameters: { type: 'object', properties: { text: { type: 'string', description: '偏好内容' } }, required: ['text'] },
    async run(args, context) {
      return { written: true, preferences: memoryFor(context.userId).writePreference(args.text) };
    }
  });

  // modelReady 由调用方传入（配置读取是异步的，注册表不缓存配置，避免出现陈旧状态）。
  const list = (modelReady = false) => CAPABILITIES.map(capability => ({
    ...capability,
    status: capability.needsModel && !modelReady ? 'needs-config' : 'ready',
    toolDetails: capability.tools.map(name => {
      const tool = tools.get(name);
      return tool ? { name: tool.name, group: tool.group, description: tool.description } : { name, group: 'missing', description: '' };
    })
  }));

  function get(id) {
    const capability = CAPABILITIES.find(item => item.id === id);
    if (!capability) throw new Error('未知的能力：' + id + '。可用：' + CAPABILITIES.map(c => c.id).join('、'));
    return capability;
  }

  /**
   * 跑一个 agent-loop 类能力。messages 由调用方传入，从而支持跨回合延续（含 ask_user 续跑）。
   */
  async function runAgent(id, options = {}) {
    const capability = get(id);
    if (capability.kind !== 'agent-loop') throw new Error(capability.label + ' 不是 agent 循环能力。');
    const config = options.config;
    if (!config || !config.apiKey || !config.model || !config.baseUrl) {
      return { status: 'failed', errorCode: 'not-configured', error: '模型未配置，无法运行 ' + capability.label + '。', messages: options.messages || [], toolTrace: options.toolTrace || [] };
    }
    return runAgentLoop({
      config, registry: tools, fetchImpl: deps.fetchImpl,
      messages: options.messages || [], toolTrace: options.toolTrace || [],
      enabledTools: capability.tools, maxRounds: options.maxRounds,
      context: { userId: options.userId, capability: id }
    });
  }

  return { list, get, tools, runAgent, resumeMessages, CAPABILITIES };
}

module.exports = { createCapabilityRegistry, registerBuiltinTools, CAPABILITIES, MAX_SEARCH_HITS };
