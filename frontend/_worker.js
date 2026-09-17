/**
 * Cloudflare Pages — Advanced Mode worker（`_worker.js`）。
 *
 * 为什么同时存在两种写法：
 *   - `functions/api/[[path]].js` = Pages **Functions**（Git 集成模式用；本地 `wrangler pages dev` 也认它）
 *   - `frontend/_worker.js`（本文件）= Pages **Advanced Mode**，**Direct Upload（`wrangler pages deploy`）唯一支持的机制**
 *     实测依据：`wrangler pages deploy --help` 没有任何 `--functions` 开关，只有 `--no-bundle`
 *     （它只对 `_worker.js` 生效）⇒ 用 `wrangler pages deploy` 推 `functions/` 目录是**推不上去的**。
 *     故部署路径必须走本文件。
 *
 * 作用与 `functions/api/[[path]].js` 完全等价：把 `/api/*` **字节级透传**到隧道 origin。
 *
 * 为什么是「代理」而不是把 Node 后端搬进来：
 *   实测（见 .orchestrator/results/t18-workerd-probe-raw.txt）两条独立证据表明现有 `server/**` 无法运行在 workerd：
 *   ① 构建期：`server/store.js:120` 的顶层 `require('@libsql/client')` 让 esbuild 直接失败；
 *   ② 运行期：ESM 语境下 `require` / `__dirname` 不存在（`server/**` 是整片 CJS 风格代码）。
 *   故后端留在 Node 侧，这里只做**字节级透传**的代理，给隧道一个**不随重启而变的固定门牌**。
 *
 * 重要局限（不得包装成"降级仍可用"，见 R5）：
 *   本 worker **不是独立副本**。隧道断了这里就是 502，不存在"备选端还能用"这回事。
 *
 * 安全：
 *   - origin 只从环境变量 `TUNNEL_ORIGIN` 读，**不硬编码**任何 URL；
 *   - 只转发到该 origin；若解析出的目标与 origin 不同源，直接 400，不带走凭据。
 */

const PROXIED_BY = 'cf-pages-worker';

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);

    // 非 /api/* 一律走静态资源，不碰
    if (!incoming.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const origin = String(env.BACKEND_ORIGIN || env.TUNNEL_ORIGIN || '').trim();
    if (!origin) {
      return json(500, '服务端未配置上游地址（设置 BACKEND_ORIGIN，或兼容变量 TUNNEL_ORIGIN）。这是部署配置问题。');
    }

    let base;
    try {
      base = new URL(origin);
    } catch {
      return json(500, '上游地址不是合法 URL，请检查 BACKEND_ORIGIN / TUNNEL_ORIGIN。');
    }

    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password ||
        base.pathname !== '/' || base.search || base.hash || base.origin === incoming.origin) {
      return json(500, '上游必须为独立的 HTTP(S) origin，不得含凭据、路径、查询串或指向本站。', 'INVALID_BACKEND_ORIGIN');
    }

    // 保留 /api/ 之后的完整路径与查询串
    const suffix = incoming.pathname.slice('/api/'.length);
    const target = new URL('/api/' + suffix + incoming.search, base);

    // 同源校验：目标必须落在 TUNNEL_ORIGIN 之下（防配置被拼出跨站地址）
    if (target.origin !== base.origin) {
      return json(400, '目标地址不在允许的上游范围内，已拒绝。');
    }

    // 只保留必要请求头；不把 Host 带过去（由 fetch 按 target 生成）
    const headers = new Headers();
    for (const name of ['content-type', 'accept', 'accept-language', 'cookie', 'authorization', 'user-agent']) {
      const v = request.headers.get(name);
      if (v !== null) headers.set(name, v);
    }

    const init = { method: request.method, headers, redirect: 'manual', signal: AbortSignal.timeout(35000) };
    if (!['GET', 'HEAD'].includes(request.method)) {
      init.body = await request.arrayBuffer();
    }

    let upstream;
    try {
      upstream = await fetch(target.toString(), init);
    } catch (error) {
      // 上游不可达：返回可读的 502 + 中文说明，而不是空洞的 500
      const timedOut = error && ['TimeoutError', 'AbortError'].includes(error.name);
      return json(timedOut ? 504 : 502, '上游学习服务暂不可用；AI 操作未完成，请稍后重试或联系维护者。', timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE');
    }

    if (upstream.status >= 500) {
      if (upstream.body) await upstream.body.cancel().catch(() => {});
      return json(502, '上游学习服务返回故障，AI 操作未完成；请维护者检查固定后端、DNS 和服务日志。', 'UPSTREAM_HTTP_ERROR', upstream.status);
    }

    // 字节级透传响应体；保留 Set-Cookie（可能有多个）与内容类型
    const respHeaders = new Headers();
    const ct = upstream.headers.get('content-type');
    if (ct !== null) respHeaders.set('content-type', ct);
    const setCookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
    if (setCookies.length > 0) {
      for (const c of setCookies) respHeaders.append('set-cookie', c);
    } else {
      const sc = upstream.headers.get('set-cookie');
      if (sc !== null) respHeaders.append('set-cookie', sc);
    }
    respHeaders.set('x-aimaster-proxied-by', PROXIED_BY);

    respHeaders.set('cache-control', 'no-store');
    const body = request.method === 'HEAD' || [204, 205, 304].includes(upstream.status) ? null : upstream.body;
    return new Response(body, { status: upstream.status, headers: respHeaders });
  },
};

function json(status, message, code = 'BACKEND_CONFIGURATION_ERROR', upstreamStatus) {
  return new Response(JSON.stringify({ ok: false, error: message, code, ...(upstreamStatus ? { upstreamStatus } : {}) }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'x-aimaster-proxied-by': PROXIED_BY },
  });
}
