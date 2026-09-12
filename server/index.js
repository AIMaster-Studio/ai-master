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
const path = require('node:path');
const { randomUUID, randomInt, timingSafeEqual } = require('node:crypto');
const { openStore } = require('./store');
const { publicConfig, validateConfig, reviewExplanation, probeReachable } = require('./ai-review');

const ROOT = path.resolve(__dirname, '..');
const DAY = 86400000;
const QUIZ_PASS_SCORE = 75;
const DAILY_QUIZ_LIMIT = 3;
const MAX_ATTEMPTS = 2000;
const BODY_LIMIT = 64000;
const AI_REVIEW_IP_LIMIT = 20; // 同一客户端 IP 每分钟可发起的 AI 复评次数
const AI_REVIEW_DAILY_BUDGET = 5000; // 全服务每日 AI 复评总预算，超出后按限流处理，防止公网被刷量
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const stamp = () => new Date().toISOString();
function clientIp(req) {
  // 代理环境下取 X-Forwarded-For 首段作为真实客户端 IP，其次退回 socket 地址。
  const forwarded = req.headers['x-forwarded-for'];
  const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
  return first || req.socket.remoteAddress || '';
}
function isLoopbackPeer(req) {
  // 只看 TCP 连接的对端地址，不读任何请求头：X-Forwarded-For / X-Real-IP / Forwarded / Host 都可被调用方任意伪造，
  // 不能作为鉴权依据；对端地址由内核在三次握手时确定，请求方无法改写。
  // 注意（实测确认）：本机同时跑隧道连接器时，cloudflared 从 127.0.0.1 连本机，公网请求的对端也是 127.0.0.1，
  // 所以"对端是回环"只在服务器未对外暴露时才有鉴别力；暴露模式下必须叠加显式令牌，见 createApp 内的写入判定。
  // 取不到 socket（例如 Netlify Functions 的 mock req）时不算本机，一律走 fail-closed。
  const address = String(req.socket?.remoteAddress || '');
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
function reviewDelayDays(correctStreak) {
  const schedule = [1, 3, 7, 14, 30];
  const index = Math.min(Math.max(Number(correctStreak || 1) - 1, 0), schedule.length - 1);
  return schedule[index];
}
const shuffled = input => {
  const result = [...input];
  for (let i = result.length - 1; i > 0; i--) { const j = randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
};
function shuffleQuestion(q) {
  const order = shuffled(q.options.map((_, i) => i));
  return { ...q, options: order.map(i => q.options[i]), answer: order.indexOf(q.answer) };
}
const publicQuestion = ({ answer, explanation, ...q }) => q;
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
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function createApp(options = {}) {
  // 公网部署：Render 等托管平台通过 PORT 暴露网络时放开本机 Host 限制；本机模式保持白名单，防 DNS rebinding / 跨站调用。测试可通过 allowRemote 覆盖此值。
  const allowRemote = options.allowRemote !== undefined ? options.allowRemote
    : Boolean(process.env.PORT) || process.env.AIMASTER_ALLOW_REMOTE === '1';
  // 显式 Host 允许名单（AIMASTER_ALLOWED_HOSTS，逗号分隔，如隧道入口 host:port）：
  // 仅名单内的 Host 放行，其余仍走本机白名单。未设置该变量时为空数组，行为与原先完全一致（默认安全性不放松）；
  // 也不影响监听绑定（本机模式始终 127.0.0.1，见文件底部 listen 逻辑）。
  const allowedHosts = String(process.env.AIMASTER_ALLOWED_HOSTS || '')
    .split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  // "对外暴露"判定：放开 Host 白名单或显式配置了允许名单，都说明这层保护已经不再限制来源。
  // 本机热切模型的工作流（未暴露，仅 127.0.0.1 可达）不受影响；暴露模式下回环对端不再有鉴别力，写入必须带令牌。
  const exposed = allowRemote || allowedHosts.length > 0;
  function configTokenValid(req) {
    // 暴露模式下写配置所需的显式令牌（AIMASTER_CONFIG_TOKEN）。未配置即视为不可写（fail-closed，默认安全）。
    // 用常量时间比较，且"未配置"与"令牌错误"返回同一句话，避免把服务端配置状态泄露给探测者。
    const expected = String(process.env.AIMASTER_CONFIG_TOKEN || '');
    if (!expected) return false;
    const supplied = Buffer.from(String(req.headers['x-aimaster-config-token'] || ''), 'utf8');
    const wanted = Buffer.from(expected, 'utf8');
    return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
  }
  const core = options.core || require('../frontend/static/js/learning-core');
  const catalog = options.catalog || require('../frontend/data/learning-curriculum.json');
  const store = openStore(options.dbPath || (options.inMemory ? ':memory:' : path.join(ROOT, '.local/learning.sqlite')), options.forceSqlite);
  const modules = new Map(catalog.modules.map(m => [m.id, m]));
  const questions = new Map(catalog.modules.flatMap(m => m.questions.map(q => [q.id, { ...q, moduleId: m.id }])));
  const rate = new Map();
  function limited(key, count, windowMs) {
    const now = Date.now();
    if (rate.size > 2000) for (const [k, v] of rate) if (v.until < now) rate.delete(k);
    const item = rate.get(key);
    if (!item || item.until < now) return rate.set(key, { count: 1, until: now + windowMs });
    if (item.count >= count) fail(429, '操作过于频繁，请稍后再试。');
    item.count++;
  }
  function moduleFor(state, id) {
    const module = modules.get(id);
    if (!module) fail(404, '未找到这个学习任务。');
    if (state.progress[id]?.completedAt) return module;
    if (!state.plan?.modules.includes(id)) fail(409, '请先生成包含这个任务的学习计划。');
    const earlier = state.plan.modules.slice(0, state.plan.modules.indexOf(id));
    if (earlier.some(key => !state.progress[key]?.completedAt)) fail(409, '请先完成路线中前面的任务。');
    return module;
  }
  function progressFor(state, id) {
    return state.progress[id] ||= { explanation: null, quiz: null, completedAt: null, dueAt: null, reviewCount: 0 };
  }
  function quizDay() {
    return new Date().toISOString().slice(0, 10);
  }
  function reserveQuizAttempt(state, moduleId) {
    const day = quizDay();
    state.quizAttempts ||= {};
    state.quizAttempts[day] ||= {};
    const used = Number(state.quizAttempts[day][moduleId] || 0);
    if (used >= DAILY_QUIZ_LIMIT) fail(429, '本模块今日正式测验最多 3 次，请明天再试。');
    state.quizAttempts[day][moduleId] = used + 1;
    for (const key of Object.keys(state.quizAttempts)) if (key !== day) delete state.quizAttempts[key];
    return DAILY_QUIZ_LIMIT - used - 1;
  }
  function addAttempt(state, item) {
    state.attempts.push({ id: randomUUID(), at: stamp(), ...item });
    // Keep only the most recent interactions for each learner.
    state.attempts = state.attempts.slice(-MAX_ATTEMPTS);
  }
  function checkAnswers(list, answers) {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers) || list.some(q => !Number.isInteger(answers[q.id]) || answers[q.id] < 0 || answers[q.id] >= q.options.length)) {
      fail(400, '请完成所有题目后提交。');
    }
  }
  function gradeWithContext(list, answers) {
    const result = core.gradeQuiz(list, answers);
    const presented = new Map(list.map(question => [question.id, question]));
    return { ...result, items: result.items.map(item => {
      const question = presented.get(item.id);
      return { ...item, prompt: question.prompt, options: [...question.options],
        selectedText: item.selected === null ? null : question.options[item.selected],
        answerText: question.options[item.answer], source: question.source };
    }) };
  }
  function recordWrongAnswers(state, result, at) {
    for (const item of result.items) {
      if (item.correct) continue;
      const question = questions.get(item.id);
      const previous = state.wrongAnswers.find(w => w.questionId === item.id);
      if (previous) {
        previous.mistakes++;
        previous.correctStreak = 0;
        previous.resolved = false;
        previous.dueAt = at;
      } else {
        state.wrongAnswers.push({ questionId: item.id, moduleId: question.moduleId, mistakes: 1, reviewCount: 0, resolved: false, dueAt: at });
      }
    }
  }
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
    let token = String(req.headers.cookie || '').match(/(?:^|;\s*)aimaster_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    let user = await store.session(token);
    function setSession(next) {
      user = next.user; token = next.token;
      res.setHeader('Set-Cookie', `aimaster_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
    }
    if (!user) setSession(await store.guest());
    const body = req.method === 'POST' ? await readBody(req) : null;
    let state = await store.state(user.id);
    const send = payload => json(res, 200, { ok: true, ...payload });
    const save = () => store.save(user.id, state);
    if (req.method === 'GET') {
      if (route === 'status') {
        const config = await store.config();
        const payload = { mode: 'server', ai: publicConfig(config), version: 'ican-1.0' };
        // 默认不探活（保持 status 快速、零上游费用）。?probe=1 时实测上游连通性并缓存 1 分钟。
        // 注意：即便 aiReachable=true，验收仍以 POST /api/explanation 返回 mode:"ai" 为准（ACCEPTANCE.md §1.1）。
        if (url.searchParams.get('probe') === '1') payload.aiReachable = await probeReachable(config, options.fetchImpl);
        return send(payload);
      }
      if (route === 'catalog') return send(publicCatalog(catalog));
      if (route === 'state') return send({ state, user });
      if (route === 'quiz') {
        limited('quiz:' + user.id, 60, 60000);
        const diagnostic = url.searchParams.get('mode') === 'diagnostic';
        const module = diagnostic ? null : moduleFor(state, url.searchParams.get('module'));
        const attemptsRemaining = !diagnostic && !state.progress[module.id]?.completedAt ? reserveQuizAttempt(state, module.id) : null;
        const selected = diagnostic ? catalog.modules.map(m => m.questions[0]) : module.questions;
        const list = shuffled(selected).map(shuffleQuestion);
        const quiz = { id: randomUUID(), moduleId: module?.id || null, mode: diagnostic ? 'diagnostic' : 'module', questions: list,
          revision: module ? progressFor(state, module.id).revision || null : null, planRevision: state.planRevision || null };
        await store.putQuiz(quiz.id, user.id, quiz);
        if (attemptsRemaining !== null) await save();
        return send({ quiz: { id: quiz.id, moduleId: quiz.moduleId, mode: quiz.mode, attemptsRemaining, questions: list.map(publicQuestion) } });
      }
      if (route === 'review') {
        const items = state.wrongAnswers.map(item => ({ ...item, question: publicQuestion(questions.get(item.questionId)), due: Date.parse(item.dueAt) <= Date.now() }));
        const dueModules = Object.entries(state.progress).filter(([, p]) => p.completedAt && Date.parse(p.dueAt) <= Date.now()).map(([id, p]) => ({ moduleId: id, title: modules.get(id)?.title, dueAt: p.dueAt }));
        return send({ items, dueModules });
      }
      if (route === 'export') {
        const csv = url.searchParams.get('format') === 'csv';
        const filename = csv ? 'ai-master-learning.csv' : 'ai-master-learning.json';
        res.writeHead(200, { 'Content-Type': csv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' });
        if (csv) {
          const rows = [['time', 'type', 'module', 'mode', 'score', 'passed', 'correct', 'total'], ...state.attempts.map(a => [a.at, a.type, a.moduleId, a.mode, a.score, a.passed ?? a.accepted, a.correct, a.total])];
          return res.end('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'));
        }
        return res.end(JSON.stringify({ schema: 'aimaster-learning/1', exportedAt: stamp(), user, state,
          notice: '本机实际操作记录；包含练习与测试操作，不代表真实用户研究或教育效果证明。', retention: '每个档案保留最近2000次交互。' }, null, 2));
      }
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
      if (route === 'plan') {
        const goal = String(body.goal || '').trim();
        if (goal.length < 2 || goal.length > 500 || !['beginner', 'basic', 'experienced'].includes(body.level) || ![30, 45, 60, 90].includes(body.dailyMinutes)) fail(400, '请填写学习目标、基础和每天可用时间。');
        state.profile = { goal, level: body.level, dailyMinutes: body.dailyMinutes, deadline: String(body.deadline || '').slice(0, 32) };
        state.plan = core.createPlan({ ...state.profile, diagnostic: state.diagnostic }, catalog);
        state.planRevision = randomUUID();
        // A new plan invalidates unfinished evidence; completed tasks remain available.
        for (const p of Object.values(state.progress)) if (!p.completedAt) { p.explanation = null; p.quiz = null; p.revision = null; }
        addAttempt(state, { type: 'plan', goal, level: body.level, dailyMinutes: body.dailyMinutes }); await save();
        return send({ state });
      }
      if (route === 'explanation') {
        limited('expl-ip:' + clientIp(req), AI_REVIEW_IP_LIMIT, 60000);
        limited('expl-budget:' + quizDay(), AI_REVIEW_DAILY_BUDGET, 86400000);
        limited('explanation:' + user.id, 12, 60000);
        const module = moduleFor(state, body.moduleId);
        if (typeof body.text !== 'string' || body.text.length > 6000) fail(400, '讲解内容需为文本，最多 6000 字。');
        const revision = randomUUID();
        const p = progressFor(state, module.id);
        p.revision = revision; p.quiz = null; p.explanation = null;
        const planRevision = state.planRevision; await save();
        const local = core.screenExplanation(body.text, module);
        const result = await reviewExplanation(body.text, module, local, await store.config(), options.fetchImpl);
        state = await store.state(user.id);
        if (state.planRevision !== planRevision || state.progress[module.id]?.revision !== revision) fail(409, '已有更新的讲解或计划，请查看最新结果。');
        state.progress[module.id].explanation = { ...result, text: body.text, at: stamp(), revision };
        addAttempt(state, { type: 'explanation', moduleId: module.id, revision, text: body.text, ...result }); await save();
        return send({ result, state });
      }
      if (route === 'quiz') {
        const quiz = await store.quiz(String(body.attemptId || ''), user.id);
        if (!quiz) fail(404, '测验已过期，请重新开始。');
        if (quiz.result) fail(409, '这次测验已提交，请开始新一轮练习。');
        if (quiz.mode !== 'diagnostic') {
          moduleFor(state, quiz.moduleId);
          if (quiz.planRevision !== state.planRevision || quiz.revision !== (progressFor(state, quiz.moduleId).revision || null)) fail(409, '讲解或计划已更新，请重新开始测验。');
        }
        checkAnswers(quiz.questions, body.answers);
        const graded = gradeWithContext(quiz.questions, body.answers);
        const result = { ...graded, passed: graded.score >= QUIZ_PASS_SCORE };
        const at = stamp();
        if (quiz.mode === 'diagnostic') state.diagnostic = { ...result, at };
        else {
          const progress = progressFor(state, quiz.moduleId);
          progress.quiz = { ...result, at, revision: quiz.revision };
          if (progress.completedAt) {
            progress.reviewCount = (progress.reviewCount || 0) + 1;
            progress.correctStreak = result.passed ? (progress.correctStreak || 0) + 1 : 0;
            const days = reviewDelayDays(progress.correctStreak);
            progress.dueAt = new Date(Date.now() + days * DAY).toISOString();
          }
        }
        recordWrongAnswers(state, result, at);
        addAttempt(state, { type: 'quiz', moduleId: quiz.moduleId, mode: quiz.mode, ...result });
        await store.transaction(async () => { await save(); await store.putQuiz(quiz.id, user.id, { ...quiz, result }); });
        return send({ result, state });
      }
      if (route === 'complete') {
        moduleFor(state, body.moduleId);
        const p = progressFor(state, body.moduleId);
        if (p.completedAt) return send({ state });
        if (!p.explanation?.accepted || !p.quiz?.passed || p.quiz.score < QUIZ_PASS_SCORE || p.quiz.revision !== p.revision || p.explanation.revision !== p.revision) fail(409, '需要当前讲解通过且配套测验达到 75%，才能通关。');
        p.completedAt = stamp(); p.dueAt = new Date(Date.now() + DAY).toISOString();
        addAttempt(state, { type: 'complete', moduleId: body.moduleId, mode: p.explanation.mode, passed: true }); await save();
        return send({ state });
      }
      if (route === 'review') {
        const wrong = state.wrongAnswers.find(w => w.questionId === body.questionId);
        const question = questions.get(body.questionId);
        if (!wrong || !question) fail(404, '错题记录不存在。');
        checkAnswers([question], { [question.id]: body.answer });
        const result = gradeWithContext([question], { [question.id]: body.answer });
        const correct = result.correct === 1;
        wrong.reviewCount++; wrong.resolved = correct;
        wrong.correctStreak = correct ? (wrong.correctStreak || 0) + 1 : 0;
        wrong.dueAt = new Date(Date.now() + reviewDelayDays(wrong.correctStreak) * DAY).toISOString();
        if (!correct) wrong.mistakes++;
        addAttempt(state, { type: 'review', moduleId: question.moduleId, ...result }); await save();
        return send({ result, state });
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
  return { server, store, handleRequest };
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
