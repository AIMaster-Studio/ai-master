'use strict';

// 工具注册表。
//
// 借鉴 DeepTutor 的一个关键设计：工具按「**谁决定它可用**」分组，而不是按功能分类。
// 这个区分很实用 —— 它直接决定了「用户能不能关掉它」：
//
//   user     用户自己开关（例如是否允许联网检索）
//   context  上下文自动挂载，用户不需要也不应该逐个勾选（例如读记忆、读课程）
//   governed 默认关闭，需要显式授权（例如写文件、导出）
//
// 每个工具自带 JSON Schema，既用于约束模型输出，也用于服务端**在调用前校验参数** ——
// 不能因为「模型说了」就信任参数。

const GROUPS = { USER: 'user', CONTEXT: 'context', GOVERNED: 'governed' };
const GROUP_LABELS = { user: '用户可配置', context: '上下文自动挂载', governed: '需显式授权' };

class ToolError extends Error {
  constructor(message, code = 'tool-error') {
    super(message);
    this.code = code;
  }
}

function validateAgainstSchema(schema, value, pathLabel = 'arguments') {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new ToolError(pathLabel + ' 需要是对象。', 'invalid-arguments');
    }
    for (const key of schema.required || []) {
      if (value[key] === undefined || value[key] === null || value[key] === '') {
        throw new ToolError('缺少必填参数：' + key + '。', 'invalid-arguments');
      }
    }
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (value[key] === undefined) continue;
      validateAgainstSchema(sub, value[key], pathLabel + '.' + key);
    }
    return;
  }
  if (schema.type === 'string' && typeof value !== 'string') throw new ToolError(pathLabel + ' 需要是字符串。', 'invalid-arguments');
  if (schema.type === 'integer' && !Number.isInteger(value)) throw new ToolError(pathLabel + ' 需要是整数。', 'invalid-arguments');
  if (schema.type === 'boolean' && typeof value !== 'boolean') throw new ToolError(pathLabel + ' 需要是布尔值。', 'invalid-arguments');
  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new ToolError(pathLabel + ' 需要是数组。', 'invalid-arguments');
    for (const [index, item] of value.entries()) validateAgainstSchema(schema.items, item, pathLabel + '[' + index + ']');
  }
}

function createToolRegistry() {
  const tools = new Map();
  return {
    register(tool) {
      if (!tool || typeof tool.name !== 'string' || !/^[a-z][a-z0-9_]{1,40}$/.test(tool.name)) {
        throw new Error('工具名需为小写字母、数字与下划线组合。');
      }
      if (tools.has(tool.name)) throw new Error('工具名重复：' + tool.name);
      if (!Object.values(GROUPS).includes(tool.group)) throw new Error('未登记的工具分组：' + tool.group);
      if (typeof tool.run !== 'function') throw new Error('工具 ' + tool.name + ' 缺少 run 实现。');
      tools.set(tool.name, { description: '', parameters: { type: 'object', properties: {} }, ...tool });
      return tool.name;
    },
    has: name => tools.has(name),
    get: name => tools.get(name) || null,
    list: () => [...tools.values()],
    describe: () => [...tools.values()].map(tool => ({
      name: tool.name, group: tool.group, groupLabel: GROUP_LABELS[tool.group],
      description: tool.description, parameters: tool.parameters, enabled: tool.enabled !== false
    })),
    // 交给模型的定义：只暴露启用中的工具，且只给模型需要知道的部分。
    modelDefinitions(enabledNames) {
      const allow = enabledNames ? new Set(enabledNames) : null;
      return [...tools.values()]
        .filter(tool => tool.enabled !== false && (!allow || allow.has(tool.name)))
        .map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
    },
    async invoke(name, args, context = {}) {
      const tool = tools.get(name);
      if (!tool) throw new ToolError('未注册的工具：' + name, 'unknown-tool');
      if (tool.enabled === false) throw new ToolError('工具 ' + name + ' 当前已禁用。', 'tool-disabled');
      const parsed = args === undefined || args === null ? {} : args;
      validateAgainstSchema(tool.parameters, parsed);
      return tool.run(parsed, context);
    }
  };
}

module.exports = { createToolRegistry, GROUPS, GROUP_LABELS, ToolError, validateAgainstSchema };
