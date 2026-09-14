'use strict';

// Agent 循环。
//
// 循环本身刻意简单（与 DeepTutor 的取向一致）：模型思考 → 需要就调工具 → 观察结果 → 以无工具消息收尾。
// 终止条件只有一条：**模型发出一条不含工具调用的消息**，这一回合就结束。
//
// 两个必须由服务端把住的点：
//   ① 工具参数在执行前校验（tools.js），不因为「模型说了」就信任参数；
//   ② ask_user 是**中断**而不是普通工具：命中即暂停回合，把问题交回给人，
//      带上 sessionId 后可以从原处继续，不需要重跑已经完成的工具调用。

const ASK_USER_TOOL = 'ask_user';
const MAX_TOOL_RESULT_CHARS = 8000;
const DEFAULT_MAX_ROUNDS = 6;

function clip(text, max = MAX_TOOL_RESULT_CHARS) {
  const value = typeof text === 'string' ? text : JSON.stringify(text);
  return value.length > max ? value.slice(0, max) + '…（已截断）' : value;
}

function classifyLoopFailure(error) {
  const status = error && error.providerStatus;
  if (Number.isInteger(status)) return 'provider-status-' + status;
  const name = error && error.name;
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
  if (name === 'SyntaxError') return 'invalid-json';
  if (error && error.code === 'invalid-arguments') return 'invalid-arguments';
  return 'network';
}

async function callModel(config, fetchImpl, body, timeoutMs) {
  const response = await fetchImpl(String(config.baseUrl || '').replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw Object.assign(new Error('provider-status'), { providerStatus: response.status });
  const data = await response.json();
  const message = data && data.choices && data.choices[0] && data.choices[0].message;
  if (!message || typeof message !== 'object') throw new Error('invalid-output');
  return message;
}

/**
 * 跑一次（或从暂停处继续）agent 回合。
 *
 * @returns {{status:'answered'|'needs-user'|'max-rounds'|'failed', messages:Array, answer?:string,
 *            pendingQuestion?:object, toolTrace:Array, rounds:number, errorCode?:string}}
 */
async function runAgentLoop(options = {}) {
  const { config, registry } = options;
  const fetchImpl = options.fetchImpl || fetch;
  const maxRounds = Number.isInteger(options.maxRounds) && options.maxRounds > 0 ? options.maxRounds : DEFAULT_MAX_ROUNDS;
  const timeoutMs = Number(options.timeoutMs) || Number(process.env.AGENT_TIMEOUT_MS) || 60000;
  const messages = [...(options.messages || [])];
  const toolTrace = [...(options.toolTrace || [])];
  const definitions = registry.modelDefinitions(options.enabledTools);
  const context = options.context || {};

  for (let round = 1; round <= maxRounds; round++) {
    let message;
    try {
      message = await callModel(config, fetchImpl, {
        model: config.model,
        temperature: options.temperature === undefined ? 0.2 : options.temperature,
        max_tokens: Number(options.maxTokens) || 2048,
        messages,
        ...(definitions.length ? { tools: definitions, tool_choice: 'auto' } : {})
      }, timeoutMs);
    } catch (error) {
      return { status: 'failed', messages, toolTrace, rounds: round, errorCode: classifyLoopFailure(error), error: error.message };
    }

    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!calls.length) {
      // 无工具调用 ⇒ 回合结束。这就是 DeepTutor 的「final tool-free message」。
      messages.push({ role: 'assistant', content: String(message.content || '') });
      return { status: 'answered', answer: String(message.content || ''), messages, toolTrace, rounds: round };
    }

    messages.push({ role: 'assistant', content: String(message.content || ''), tool_calls: calls });

    for (const call of calls) {
      const name = call && call.function ? String(call.function.name || '') : '';
      let args = {};
      let parseError = '';
      try { args = JSON.parse((call.function && call.function.arguments) || '{}'); }
      catch { parseError = '工具参数不是合法 JSON。'; }

      if (name === ASK_USER_TOOL) {
        const question = {
          question: String((args && args.question) || '请补充必要信息。').slice(0, 500),
          options: Array.isArray(args && args.options) ? args.options.map(item => String(item).slice(0, 200)).slice(0, 6) : [],
          reason: String((args && args.reason) || '').slice(0, 300)
        };
        toolTrace.push({ round, name, args, ok: true, pending: true });
        // 暂停：不回 tool 消息，等外部带着答案续跑（见 resumeMessages）。
        return { status: 'needs-user', pendingQuestion: question, messages, toolTrace, rounds: round };
      }

      if (parseError) {
        toolTrace.push({ round, name, ok: false, error: parseError });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: parseError }) });
        continue;
      }

      try {
        const result = await registry.invoke(name, args, { ...context, round });
        toolTrace.push({ round, name, args, ok: true });
        messages.push({ role: 'tool', tool_call_id: call.id, content: clip(result) });
      } catch (error) {
        toolTrace.push({ round, name, args, ok: false, error: error.message });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: error.message }) });
      }
    }
  }
  return { status: 'max-rounds', messages, toolTrace, rounds: maxRounds };
}

// 把用户对 ask_user 的回答接回消息流，使下一轮从暂停处继续。
function resumeMessages(messages, answer) {
  return [...messages, { role: 'user', content: '（回答追问）' + String(answer || '').slice(0, 2000) }];
}

module.exports = { runAgentLoop, resumeMessages, ASK_USER_TOOL, DEFAULT_MAX_ROUNDS, classifyLoopFailure };
