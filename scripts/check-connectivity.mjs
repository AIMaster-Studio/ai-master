#!/usr/bin/env node
/**
 * AI Master — 连通测试（ACCEPTANCE.md §3.1 四端点 + §3.2 AI 复评链路端到端）
 *
 * 判定口径（唯一真源，见 ACCEPTANCE.md §1.1 第 3 条）：
 *   - `/api/status` 返回 200 **不等于** 后端可用（它只反映配置项存在）；
 *   - 只有 `POST /api/explanation` 返回 `mode:"ai"` 才算 AI 链路通过。
 *
 * 用法：
 *   node scripts/check-connectivity.mjs                 # 默认：四端点 + 隧道 AI 链路（必须过）
 *   node scripts/check-connectivity.mjs --local-chain   # 额外验证本机 8787 的 AI 链路
 *   node scripts/check-connectivity.mjs --netlify-chain # 额外验证 Netlify 备选的 AI 链路（信息项）
 *   node scripts/check-connectivity.mjs --insecure      # 关闭 TLS 校验（自签证书端点，见 R-005）
 *
 * 退出码：0 = 必过项全部通过；1 = 有必过项失败。
 */
import process from 'node:process';

const argv = new Set(process.argv.slice(2));
const INSECURE = argv.has('--insecure');

if (INSECURE) {
  // 樱花隧道端点使用自签证书，curl 需要 -k；Node 侧等价做法是关闭 TLS 校验。
  // 仅用于本机验收探测，不要在生产代码里这么做。
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('⚠  已关闭 TLS 证书校验（--insecure，对应 curl -sk）。仅用于自签证书端点验收。\n');
}

const ENDPOINTS = {
  'GH Pages（前端主端）': 'https://aimaster-studio.github.io/ai-master/',
  'Cloudflare（前端备用·冻结）': 'https://ai-master-aw5.pages.dev/',
  '樱花隧道（后端主端）': 'https://frp-end.com:45695/api/status',
  'Netlify（后端备选）': 'https://effervescent-gingersnap-d27d31.netlify.app/api/status',
  '本机 8787（后端真源）': 'http://127.0.0.1:8787/api/status'
};

const TUNNEL_BASE = 'https://frp-end.com:45695';
const LOCAL_BASE = 'http://127.0.0.1:8787';
const NETLIFY_BASE = 'https://effervescent-gingersnap-d27d31.netlify.app';

// 必须能通过本地完整性预筛（learning-core.screenExplanation）的样例讲解，
// 否则后端会直接返回 mode:"local"，测不到 AI 链路。
const SAMPLE_EXPLANATION = [
  '大语言模型的第一步是把文本切成 token，也就是词元，比如中文里的分词和英文里的子词片段，每个 token 再被映射成一个向量。',
  '模型根据已有的上下文计算下一个 token 的概率分布，再按概率采样输出，所以同样的问题可能得到不同答案，这就是基于上下文预测的机制。',
  '举例来说，输入「今天天气很」时，模型会给「好」「热」这些 token 分配不同概率，采到哪个就输出哪个。',
  '但是模型只是在做模式补全，并不真正理解事实，遇到训练数据没覆盖的内容就可能编造，也就是幻觉；',
  '因此对模型输出的事实性内容需要人工核验，不能直接采信。',
  '另外它没有长期记忆，上下文窗口之外的信息会被遗忘，这也是一处明显的局限。'
].join('');

const results = [];
function record(name, ok, detail, mandatory = true) {
  results.push({ name, ok, detail, mandatory });
  const tag = ok ? '✅' : mandatory ? '❌' : '⚠️';
  console.log(`${tag} ${name} — ${detail}`);
}

async function probe(url, { timeout = 20000 } = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(timeout) });
    return { status: response.status, ms: Date.now() - started };
  } catch (error) {
    return { status: 0, ms: Date.now() - started, error: error.name || 'error' };
  }
}

/** 最小 cookie 容器：后端用 aimaster_session 维持访客身份，链路测试必须带会话。 */
function createClient(base) {
  const jar = new Map();
  return async function request(path, init = {}) {
    const headers = { ...(init.headers || {}) };
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const response = await fetch(base + path, { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(90000) });
    const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const pair = String(raw).split(';')[0];
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return response;
  };
}

/**
 * 端到端跑一遍 §3.2：catalog → plan → explanation。
 * 返回后端给出的 result 对象（含 mode 字段）。
 */
async function runAiChain(base) {
  const request = createClient(base);
  const catalog = await request('/api/catalog');
  if (!catalog.ok) throw new Error(`GET /api/catalog → HTTP ${catalog.status}`);
  const plan = await request('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal: '搞懂大模型与RAG的基本原理', level: 'beginner', dailyMinutes: 45 })
  });
  if (!plan.ok) throw new Error(`POST /api/plan → HTTP ${plan.status}`);
  const explanation = await request('/api/explanation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduleId: 'llm-basics', text: SAMPLE_EXPLANATION })
  });
  const payload = await explanation.json().catch(() => ({}));
  if (!explanation.ok) throw new Error(`POST /api/explanation → HTTP ${explanation.status} ${payload.error || ''}`);
  if (!payload.result) throw new Error('POST /api/explanation 未返回 result');
  return payload.result;
}

function describeAiMode(result) {
  const last = (result.checks || []).slice(-1)[0] || {};
  const bits = [`mode="${result.mode}"`];
  if (result.score !== undefined) bits.push(`score=${result.score}`);
  if (result.aiErrorCode) bits.push(`aiErrorCode=${result.aiErrorCode}`);
  if (last.label) bits.push(`last=${last.label}/${last.pass ? 'pass' : 'fail'}`);
  return bits.join(' ');
}

async function checkAiChain(base, label, mandatory) {
  const started = Date.now();
  try {
    const result = await runAiChain(base);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (result.mode === 'ai') {
      record(label, true, `mode:"ai"（${describeAiMode(result)}）| ${seconds}s`, mandatory);
      return true;
    }
    record(label, false, `未通过：${describeAiMode(result)} | ${seconds}s（需 mode:"ai"）`, mandatory);
    return false;
  } catch (error) {
    record(label, false, `调用失败：${error.message}`, mandatory);
    return false;
  }
}

async function main() {
  console.log('AI Master 连通测试 — ' + new Date().toISOString());
  console.log('='.repeat(64));

  for (const [label, url] of Object.entries(ENDPOINTS)) {
    const result = await probe(url);
    record(`${label}`, result.status === 200, `HTTP ${result.status} | ${result.ms}ms${result.error ? ' | ' + result.error : ''}`, false);
  }

  console.log('-'.repeat(64));
  console.log('AI 复评链路（§3.2，唯一有效的后端验收）：');
  const tunnelOk = await checkAiChain(TUNNEL_BASE, '隧道后端 AI 链路', true);
  if (argv.has('--local-chain')) await checkAiChain(LOCAL_BASE, '本机 8787 AI 链路', true);
  if (argv.has('--netlify-chain')) await checkAiChain(NETLIFY_BASE, 'Netlify 备选 AI 链路', false);

  console.log('='.repeat(64));
  const failed = results.filter(item => item.mandatory && !item.ok);
  const warned = results.filter(item => !item.mandatory && !item.ok);
  console.log(`结果：必过项 ${results.filter(i => i.mandatory && i.ok).length}/${results.filter(i => i.mandatory).length} 通过` +
    (warned.length ? `；信息项 ${warned.length} 条未通过` : ''));
  if (failed.length) {
    for (const item of failed) console.log(`  ❌ ${item.name} — ${item.detail}`);
    process.exitCode = 1;
  } else if (!tunnelOk) {
    process.exitCode = 1;
  }
  return results;
}

main().catch(error => {
  console.error('连通测试执行失败：', error.message);
  process.exitCode = 1;
});
