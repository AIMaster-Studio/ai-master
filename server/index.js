'use strict';

// 轻量 .env 加载器：本地开发读 .env，生产环境变量优先（不覆盖已设置的值）
(function loadEnv() {
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const envPath = path.resolve(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (_) { /* .env 加载失败不影响启动 */ }
})();

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, timingSafeEqual } = require('node:crypto');
const { openStore } = require('./store');
const { publicConfig, validateConfig, probeReachable } = require('./ai-review');
const { createRagService } = require('./rag');
const { createRagRoutes } = require('./rag-routes');
const { COURSE_KB_NAME } = require('./rag/course-seed');
const { createMemoryStore } = require('./memory/store');
const { createMemoryRoutes } = require('./memory-routes');
const { createCapabilityRegistry } = require('./capabilities/registry');
const { createSkillRegistry } = require('./skills/registry');
const { createAgentRoutes, createSkillRoutes } = require('./agent-routes');
const { createLearningDomain } = require('./learning/domain');
const { createLearningRoutes, LEARNING_ROUTE_NAMES, shuffleQuestion } = require('./learning-routes');

const ROOT = path.resolve(__dirname, '..');
const BODY_LIMIT = 64000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const stamp = () => new Date().toISOString();
function isLoopbackPeer(req) {
  // 只看 TCP 连接的对端地址，不读任何请求头：X-Forwarded-For / X-Real-IP / Forwarded / Host 都可被调用方任意伪造，
  // 不能作为鉴权依据；对端地址由内核在三次握手时确定，请求方无法改写。
  // 注意（实测确认）：本机同时跑隧道连接器时，cloudflared 从 127.0.0.1 连本机，公网请求的对端也是 127.0.0.1，
  // 所以"对端是回环"只在服务器未对外暴露时才有鉴别力；暴露模式下必须叠加显式令牌，见 createApp 内的写入判定。
  // 取不到 socket（例如 Netlify Functions 的 mock req）时不算本机，一律走 fail-closed。
  const address = String(req.socket?.remoteAddress || '');
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
function publicCatalog(catalog) {
  return { ...catalog, modules: catalog.modules.map(({ questions, ...module }) => ({ ...module, questionCount: questions.length })) };
}
async function readBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) fail(415, '请求需要使用 JSON 格式。');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > BODY_LIMIT) fail(413, '提交内容过长。');
  }
  try {
    const data = JSON.parse(body || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, '请求格式不正确。');
    return data;
  } catch { fail(400, '请求格式不正确。'); }
}
function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function createApp(options = {}) {
  // 安全门的三项输入一律「显式 options 优先，进程环境兜底」：
  // 判定语义（exposed / 回环要求 / 常量时间令牌比较 / fail-closed）一个字不改，只是把「环境」变成可注入的输入。
  // 为什么必须可注入：本模块顶层会加载 .env，而测试是与应用同进程构造的；若这三项只读环境，
  // 运行者本机 .env 里一条 AIMASTER_ALLOWED_HOSTS 就会把 exposed 翻成 true，让 /api/ai/config 写入变 403，
  // 打死与本意无关的用例（2026-09-12 实测：ai-master-demo 树 2 例失败；ai-master-clean 无 .env 则通过）。
  // 反过来，注入也让「已暴露」语义可被显式、确定地测试，而不是靠设置环境变量碰运气。
  const allowRemote = options.allowRemote !== undefined ? options.allowRemote
    : Boolean(process.env.PORT) || process.env.AIMASTER_ALLOW_REMOTE === '1';
  // 显式 Host 允许名单（AIMASTER_ALLOWED_HOSTS，逗号分隔，如隧道入口 host:port）：
  // 仅名单内的 Host 放行，其余仍走本机白名单。未设置该变量时为空数组，行为与原先完全一致（默认安全性不放松）；
  // 也不影响监听绑定（本机模式始终 127.0.0.1，见文件底部 listen 逻辑）。
  const allowedHosts = (options.allowedHosts !== undefined
    ? options.allowedHosts
    : String(process.env.AIMASTER_ALLOWED_HOSTS || '').split(','))
    .map(item => String(item).trim().toLowerCase()).filter(Boolean);
  // "对外暴露"判定：放开 Host 白名单或显式配置了允许名单，都说明这层保护已经不再限制来源。
  // 本机热切模型的工作流（未暴露，仅 127.0.0.1 可达）不受影响；暴露模式下回环对端不再有鉴别力，写入必须带令牌。
  const exposed = allowRemote || allowedHosts.length > 0;
  function configTokenValid(req) {
    // 暴露模式下写配置所需的显式令牌（AIMASTER_CONFIG_TOKEN）。未配置即视为不可写（fail-closed，默认安全）。
    // 用常量时间比较，且"未配置"与"令牌错误"返回同一句话，避免把服务端配置状态泄露给探测者。
    const expected = options.configToken !== undefined ? String(options.configToken) : String(process.env.AIMASTER_CONFIG_TOKEN || '');
    if (!expected) return false;
    const supplied = Buffer.from(String(req.headers['x-aimaster-config-token'] || ''), 'utf8');
    const wanted = Buffer.from(expected, 'utf8');
    return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
  }
  const core = options.core || require('../frontend/static/js/learning-core');
  const catalog = options.catalog || require('../frontend/data/learning-curriculum.json');
  const storage = require('./storage-paths').storagePaths(options, process.env, ROOT);
  const store = openStore(storage.dbPath, options.forceSqlite);
  // 「本机持久化」与「临时实例」两种形态必须一起切换，不能只切数据库。
  //
  // 背景（2026-09-15 实测发现）：inMemory 原先只作用于 SQLite（:memory:），
  // 而 RAG / 记忆 / 技能包 / agent 会话都是**文件存储**的，默认落在仓库根的 .local/ 下。
  // Vercel 与 Netlify 的函数入口都传 inMemory:true，但这两个平台的文件系统除 /tmp 外只读，
  // createApp 会在建目录那一步直接抛错 —— 结果是**所有 /api/* 返回 500**，而不只是新接口。
  // 因此：只要数据库不是持久的（inMemory 或 dbPath=':memory:'），文件类存储一并指向可写的临时目录。
  const persistentDb = !(options.inMemory || options.dbPath === ':memory:');
  const dataRoot = storage.dataRoot;
  const dataRoots = {
    base: dataRoot,
    rag: options.ragDataRoot || path.join(dataRoot, 'rag'),
    memory: options.memoryDataRoot || path.join(dataRoot, 'memory'),
    skills: options.skillsRoot || path.join(dataRoot, 'skills'),
    agent: options.agentSessionsRoot || path.join(dataRoot, 'agent')
  };
  // RAG 服务：数据落在 .local/rag（已 gitignore）。嵌入配置优先取显式注入，其次环境变量，
  // 都没有时用本机哈希嵌入 —— 学习流程不因缺配置而中断，但会用「非语义」的检索结果，并如实标注。
  const envEmbedding = {
    baseUrl: process.env.EMBEDDING_BASE_URL || '',
    model: process.env.EMBEDDING_MODEL || '',
    apiKey: process.env.EMBEDDING_API_KEY || ''
  };
  const readRagConfig = () => {
    const injected = typeof options.ragConfig === 'function' ? options.ragConfig() : (options.ragConfig || {});
    return { ...injected, embedding: { ...envEmbedding, ...(injected.embedding || {}) }, fetchImpl: options.fetchImpl };
  };
  const rag = options.rag || createRagService({ dataRoot: dataRoots.rag, root: ROOT, config: readRagConfig, repository: options.ragRepository });
  const courseKbId = async () => {
    const kb = (await rag.store.list()).find(item => item.name === COURSE_KB_NAME);
    return kb ? kb.id : null;
  };
  // 管理操作统一门禁，与 /api/ai/config 同一条规则：未暴露时要求回环对端；暴露后必须再带
  // AIMASTER_CONFIG_TOKEN。不这样做就会出现「配置写不了、但知识库能被任意访客重建」的缺口。
  const requireAdmin = request => {
    if (!isLoopbackPeer(request) || (exposed && !configTokenValid(request))) fail(403, '此操作仅限在本机执行。');
  };
  const ragRoutes = createRagRoutes({ rag, requireAdmin });
  // 记忆按用户隔离，各自一份文件；同进程内按 userId 缓存实例，避免重复建目录。
  const memoryRoot = dataRoots.memory;
  const memoryStores = new Map();
  const memoryFor = userId => {
    if (!memoryStores.has(userId)) memoryStores.set(userId, options.memoryRepository
      ? require('./durable-adapters').durableMemory(options.memoryRepository, userId)
      : createMemoryStore({ dataRoot: path.join(memoryRoot, userId) }));
    return memoryStores.get(userId);
  };
  const memoryRoutes = createMemoryRoutes({ memoryFor, requireAdmin });
  // 能力运行时：工具在注册表里登记一次，多能力共享；会话落盘以支撑 ask_user 的暂停/续跑。
  const skillRegistry = createSkillRegistry({ root: dataRoots.skills });
  const capabilities = createCapabilityRegistry({ rag, memoryFor, courseKbId, fetchImpl: options.fetchImpl });
  const agentRoutes = createAgentRoutes({
    capabilities, skillRegistry, requireAdmin,
    sessionsRoot: dataRoots.agent,
    getConfig: () => store.config()
  });
  const skillRoutes = createSkillRoutes({ skillRegistry, requireAdmin });
  // 记忆写入失败不得中断学习流程：轨迹是旁路记录，不是通关判定的必要条件。
  const recordMemory = async (userId, surface, event) => {
    try { await memoryFor(userId).record(surface, event); }
    catch (error) { if (options.onError) options.onError(error); }
  };
  // 学习闭环的领域规则（路线校验、测验配额、判分、错题登记、限流）抽到
  // server/learning/domain.js —— 它们与 HTTP 无关，抽出去之后可以脱离服务器直接测。
  // 这些函数会就地修改 state，调用方随后 save() 落盘（既有语义，见该模块注释）。
  const learning = createLearningDomain({ core, catalog, fail, randomUUID, stamp });
  // 限流桶由领域模块统一持有（进程内滑动窗口），主文件剩下的 auth/* 与 ai/config 也复用它，
  // 避免同一份限流状态被两处各建一份。
  const { limited } = learning;
  // 学习闭环的 HTTP 路由（plan / explanation / quiz / complete / review / export）抽到
  // server/learning-routes.js，与 rag-routes / memory-routes / agent-routes 同一形态。
  // 这里只把「规则 + 存储 + 旁路记录」作为依赖注入，模块本身不 require 服务器内部件。
  const learningRoutes = createLearningRoutes({
    store, learning, core, catalog, recordMemory, rag, courseKbId, fetchImpl: options.fetchImpl
  });
  async function api(req, res, url) {
    const route = url.pathname.slice(5);
    if (!['GET', 'POST'].includes(req.method)) fail(405, '不支持此请求方式。');
    if (req.method === 'POST') {
      if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, '不接受其他网站提交的请求。');
      if (req.headers.origin) {
        const allowedOrigins = ['http://' + req.headers.host, 'https://' + req.headers.host];
        if (!allowedOrigins.includes(req.headers.origin)) fail(403, '请求来源不匹配。');
      }
    }
    if (store.ready) await store.ready;
    let token = String(req.headers.cookie || '').match(/(?:^|;\s*)aimaster_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    let user = await store.session(token);
    function setSession(next) {
      user = next.user; token = next.token;
      res.setHeader('Set-Cookie', `aimaster_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${options.secureCookies || req.socket.encrypted ? '; Secure' : ''}`);
    }
    if (!user) setSession(await store.guest());
    const body = req.method === 'POST' ? await readBody(req) : null;
    const state = await store.state(user.id);
    const send = payload => json(res, 200, { ok: true, ...payload });
    if (route.startsWith('rag/')) return ragRoutes({ req, url, route, body, send, fail });
    if (route.startsWith('memory/')) return memoryRoutes({ req, url, route, body, send, fail, user });
    if (route.startsWith('agent/')) return agentRoutes({ req, url, route, body, send, fail, user });
    if (route === 'skills' || route.startsWith('skills/')) return skillRoutes({ req, url, route, body, send, fail });
    // 学习闭环：按接口名派发（不是前缀）。名单由 learning-routes 导出，两边不各写一份，避免漂移。
    // 路由模块自己负责按 GET / POST 分方向，因此这里不区分方法。
    if (LEARNING_ROUTE_NAMES.has(route)) return learningRoutes({ req, url, route, body, send, fail, user, state, res });
    if (req.method === 'GET') {
      if (route === 'status') {
        const config = await store.config();
        const payload = { mode: 'server', ai: publicConfig(config), version: 'ican-1.0',
          build: { sha: /^[a-f0-9]{7,40}$/i.test(process.env.VERCEL_GIT_COMMIT_SHA || '') ? process.env.VERCEL_GIT_COMMIT_SHA : null },
          storage: options.storageStatus || { learning: persistentDb ? 'persistent-configured' : 'ephemeral-memory', learningPersistent: persistentDb, files: persistentDb ? 'local-files' : 'ephemeral-tmp', filesPersistent: persistentDb }
        };
        // 默认不探活（保持 status 快速、零上游费用）。?probe=1 时实测上游连通性并缓存 1 分钟。
        // 注意：即便 aiReachable=true，验收仍以 POST /api/explanation 返回 mode:"ai" 为准（ACCEPTANCE.md §1.1）。
        if (url.searchParams.get('probe') === '1') payload.aiReachable = await probeReachable(config, options.fetchImpl);
        return send(payload);
      }
      if (route === 'catalog') return send(publicCatalog(catalog));
      if (route === 'state') return send({ state, user });
    } else {
      if (route.startsWith('auth/')) {
        limited('auth:' + req.socket.remoteAddress, 30, 60000);
        if (route === 'auth/logout') { await store.endSession(token); setSession(await store.guest()); return send({ user, state: await store.state(user.id) }); }
        const name = String(body.name || '').trim();
        const password = String(body.password || '');
        if (name.length < 2 || name.length > 32 || /[\u0000-\u001f]/.test(name) || password.length < 8 || password.length > 128) fail(400, '昵称需 2–32 字，密码需 8–128 位。');
        if (route === 'auth/register') {
          user = await store.register(user.id, name, password); await store.endSession(token);
          setSession({ user, token: await store.createSession(user.id) });
        } else if (route === 'auth/login') {
          const next = await store.login(name, password); await store.endSession(token); setSession(next);
        } else fail(404, '接口不存在。');
        return send({ user, state: await store.state(user.id) });
      }
      if (route === 'ai/config') {
        // 模型配置属于本机管理接口：读（GET /api/status）对所有来源开放，写只允许本机操作者。
        // 未暴露时对端必须是回环；暴露后（隧道/公网部署）回环对端恒真、不再有鉴别力，必须再带 AIMASTER_CONFIG_TOKEN，
        // 否则一律 403。判定只用 TCP 对端地址 + 环境变量令牌，不接受任何可伪造的请求头。
        if (!isLoopbackPeer(req) || (exposed && !configTokenValid(req))) fail(403, '此操作仅限在本机执行。');
        limited('config:' + user.id, 20, 60000);
        let config;
        try { config = validateConfig(body, await store.config()); } catch (error) { fail(400, error.message); }
        await store.saveConfig(config); return send({ ai: publicConfig(config) });
      }
    }
    fail(404, '接口不存在。');
  }

  function staticFile(req, res, url) {
    if (!['GET', 'HEAD'].includes(req.method)) fail(405, '不支持此请求方式。');
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { fail(400, '地址编码不正确。'); }
    if (pathname === '/') { res.writeHead(302, { Location: '/frontend/learning-center/' }); return res.end(); }
    if (/^\/(learning-center|dashboard|chapter|knowledge-stars|canvas|playground|static|assets|data)(\/|$)/.test(pathname)) pathname = '/frontend' + pathname;
    const allowed = pathname.startsWith('/frontend/') || pathname.startsWith('/third_party/dsh-pet/dsh-pet/assets/') || pathname.startsWith('/docs/ican/');
    if (!allowed || pathname.toLowerCase() === '/frontend/data/learning-curriculum.json' || /[\\:]/.test(pathname) || pathname.split('/').some(part => part.startsWith('.') || /[. ]$/.test(part) || /^(users\.json|.*\.db|.*\.sqlite|.*token.*|.*secret.*)$/i.test(part))) fail(404, '文件不存在。');
    let filename = path.resolve(ROOT, '.' + pathname);
    if (!filename.startsWith(ROOT + path.sep)) fail(404, '文件不存在。');
    let stat;
    try {
      stat = fs.statSync(filename);
      if (stat.isDirectory()) {
        if (!url.pathname.endsWith('/')) { res.writeHead(302, { Location: url.pathname + '/' + url.search }); return res.end(); }
        filename = path.join(filename, 'index.html'); stat = fs.statSync(filename);
      }
      const realFilename = fs.realpathSync(filename);
      const answerFile = path.join(ROOT, 'frontend/data/learning-curriculum.json');
      if (!stat.isFile() || !realFilename.startsWith(ROOT + path.sep) || realFilename.toLowerCase() === answerFile.toLowerCase()) fail(404, '文件不存在。');
    } catch { fail(404, '文件不存在。'); }
    const headers = { 'Content-Type': MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    let start = 0; let end = stat.size - 1; let status = 200;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end(); }
      if (!match[1]) start = Math.max(0, stat.size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      if (start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end(); }
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`; status = 206;
    }
    headers['Content-Length'] = Math.max(0, end - start + 1);
    res.writeHead(status, headers);
    if (req.method === 'HEAD' || stat.size === 0) return res.end();
    const stream = fs.createReadStream(filename, { start, end });
    stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
  }
  const handleRequest = async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    try {
      const host = req.headers.host || '';
      if (!options.skipHostCheck && !allowRemote && !allowedHosts.includes(host.toLowerCase()) && !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) fail(403, '服务仅供本机使用。');
      const url = new URL(req.url, 'http://' + host);
      if (url.pathname.startsWith('/api/')) await api(req, res, url); else staticFile(req, res, url);
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, { ok: false, error: error.status ? error.message : '服务暂时出错，请重试。' });
      else res.end();
      if (!error.status && options.onError) options.onError(error);
    }
  };
  const server = http.createServer(handleRequest);
  server.on('close', () => store.close());
  return { server, store, handleRequest, rag, dataRoots, persistentDb };
}

if (require.main === module) {
  const app = createApp({ onError: error => console.error('[learning-server]', error.message) });
  let port = Number(process.env.PORT) || 8787;
  // 本地开发绑 127.0.0.1；Render 等托管环境通过 PORT 环境变量触发，需绑 0.0.0.0 才能接收外部流量。
  const host = process.env.PORT ? '0.0.0.0' : '127.0.0.1';
  app.server.on('error', error => {
    if (error.code === 'EADDRINUSE' && port < 8810) { port++; app.server.listen(port, host); }
    else { console.error(error.message); process.exitCode = 1; }
  });
  app.server.on('listening', () => console.log(`AI Master learning workspace: http://${host}:${port}/`));
  app.server.listen(port, host);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.server.close());
}

module.exports = { createApp, publicCatalog, shuffleQuestion };
