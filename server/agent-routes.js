'use strict';

// 能力运行时与技能包的路由。
//
// 会话（agent session）落盘保存，而不是只放内存：ask_user 的整个意义就是「暂停后能从原处继续」，
// 若一重启就丢，这个能力就只剩一个好看的接口。会话按用户归属校验，别人的 sessionId 读不到。

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_MESSAGE_CHARS = 4000;
const MAX_SESSIONS_PER_USER = 50;
const SESSION_ID_PATTERN = /^[0-9a-f-]{36}$/;

function createAgentRoutes(options) {
  const { capabilities, skillRegistry, requireAdmin, getConfig } = options;
  const sessionDir = options.sessionsRoot;
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionFile = id => path.join(sessionDir, id + '.json');

  function loadSession(id, userId) {
    if (!SESSION_ID_PATTERN.test(String(id || ''))) throw Object.assign(new Error('会话 ID 不合法。'), { status: 400 });
    const file = sessionFile(id);
    if (!fs.existsSync(file)) throw Object.assign(new Error('会话不存在或已过期。'), { status: 404 });
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    // 归属校验：不接受「知道 ID 就能续别人的回合」。
    if (data.userId !== userId) throw Object.assign(new Error('会话不属于当前学习者。'), { status: 403 });
    return data;
  }
  function saveSession(data) {
    fs.writeFileSync(sessionFile(data.id), JSON.stringify(data));
    const mine = fs.readdirSync(sessionDir).filter(name => name.endsWith('.json'));
    if (mine.length > MAX_SESSIONS_PER_USER * 20) {
      // 只做粗粒度清理：按 mtime 删最旧的，避免目录无限增长。
      mine.map(name => ({ name, at: fs.statSync(path.join(sessionDir, name)).mtimeMs }))
        .sort((a, b) => a.at - b.at).slice(0, mine.length - MAX_SESSIONS_PER_USER * 10)
        .forEach(item => fs.rmSync(path.join(sessionDir, item.name), { force: true }));
    }
    return data;
  }

  return async function handleAgent({ req, url, route, body, send, fail, user }) {
    const action = route.slice(6); // 去掉 'agent/'
    const isPost = req.method === 'POST';
    const config = await getConfig();
    const modelReady = Boolean(config && config.apiKey && config.model && config.baseUrl);

    if (!isPost) {
      if (action === 'capabilities') return send({ capabilities: capabilities.list(modelReady), modelReady });
      if (action === 'tools') return send({ tools: capabilities.tools.describe() });
      fail(404, '接口不存在。');
    }

    if (action === 'run') {
      const capabilityId = String(body.capability || '');
      const answer = body.answer === undefined ? null : String(body.answer).slice(0, 2000);
      const message = String(body.message || '').slice(0, MAX_MESSAGE_CHARS);

      let session;
      if (body.sessionId) {
        session = loadSession(body.sessionId, user.id);
        if (session.capability !== capabilityId) fail(409, '会话的能力与本次请求不一致。');
        if (!answer) fail(400, '续跑一个已暂停的会话需要提供 answer。');
      } else {
        if (!message.trim()) fail(400, '请提供 message。');
        session = { id: randomUUID(), userId: user.id, capability: capabilityId, createdAt: new Date().toISOString(), messages: [], toolTrace: [] };
      }

      // 首次进入时把用户输入放进消息流；续跑时把追问的回答接回去。
      const messages = answer
        ? capabilities.resumeMessages(session.messages, answer)
        : [...session.messages, { role: 'user', content: message }];

      const result = await capabilities.runAgent(capabilityId, {
        messages, toolTrace: session.toolTrace, userId: user.id, config
      });

      session.messages = result.messages;
      session.toolTrace = result.toolTrace;
      session.status = result.status;
      session.pendingQuestion = result.pendingQuestion || null;
      saveSession(session);

      return send({
        sessionId: session.id, status: result.status, rounds: result.rounds,
        answer: result.answer || '', pendingQuestion: result.pendingQuestion || null,
        toolTrace: result.toolTrace, errorCode: result.errorCode || '', error: result.error || ''
      });
    }

    fail(404, '接口不存在。');
  };
}

function createSkillRoutes(options) {
  const { skillRegistry, requireAdmin } = options;
  return async function handleSkills({ req, url, route, body, send, fail }) {
    const action = route.slice(7); // 去掉 'skills/'
    const isPost = req.method === 'POST';

    if (!isPost) {
      if (action === '' || action === 'list') return send({ skills: skillRegistry.list() });
      if (action === 'rules') {
        const { ALLOWED_SUFFIXES, FORBIDDEN_SUFFIXES, MAX_ENTRIES, MAX_TOTAL_BYTES, MAX_FILE_BYTES } = require('./skills/registry');
        return send({ rules: { allowedSuffixes: ALLOWED_SUFFIXES, forbiddenSuffixes: FORBIDDEN_SUFFIXES, maxEntries: MAX_ENTRIES, maxTotalBytes: MAX_TOTAL_BYTES, maxFileBytes: MAX_FILE_BYTES, executesCode: false } });
      }
      fail(404, '接口不存在。');
    }

    if (action === 'install') {
      requireAdmin(req);
      const report = skillRegistry.validateBundle(body.files || []);
      // 先给一次「只校验不安装」的机会：warn 级别的包必须显式确认才落盘。
      if (body.dryRun === true) return send({ report });
      const result = skillRegistry.install({ name: body.name, files: body.files || [], acceptWarnings: body.acceptWarnings === true });
      if (!result.installed) {
        return send({ installed: false, needsConfirmation: Boolean(result.needsConfirmation), report: result.report });
      }
      return send({ installed: true, skill: result.skill, report: result.report });
    }
    if (action === 'remove') {
      requireAdmin(req);
      return send(skillRegistry.remove(String(body.name || '')));
    }
    fail(404, '接口不存在。');
  };
}

module.exports = { createAgentRoutes, createSkillRoutes, MAX_MESSAGE_CHARS };
