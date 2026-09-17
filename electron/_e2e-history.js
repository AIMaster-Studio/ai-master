// E2E 验证：加载历史页面并调用桥接 API
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const LOG = path.join(app.getPath('userData'), 'history-e2e.log');
const log = (m) => { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); } catch(e){} };

// 直接复制 main.js 的模块（内联验证用）
const { decompress } = require('fzstd');
const os = require('os');
function dshHome() { return process.env.DSH_HOME || path.join(os.homedir(), '.dsh'); }
function listSessionFiles() {
  const root = path.join(dshHome(), 'sessions');
  const out = [];
  try {
    for (const ws of fs.readdirSync(root)) {
      const wsPath = path.join(root, ws);
      if (!fs.statSync(wsPath).isDirectory()) continue;
      for (const s of fs.readdirSync(wsPath)) {
        const f = path.join(wsPath, s, 'session.jsonl.zstd');
        if (fs.existsSync(f)) out.push(f);
      }
    }
  } catch (e) {}
  return out;
}
const decodeCache = new Map();
function decodeSessionFile(file) {
  if (decodeCache.has(file)) return decodeCache.get(file);
  try {
    const buf = fs.readFileSync(file);
    const out = decompress(new Uint8Array(buf));
    const text = Buffer.from(out).toString('utf8');
    const parsed = text.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch(e){ return null; } }).filter(Boolean);
    if (decodeCache.size > 40) decodeCache.clear();
    decodeCache.set(file, parsed);
    return parsed;
  } catch (e) { decodeCache.set(file, null); return null; }
}
function sessionSummary(file) {
  const events = decodeSessionFile(file);
  if (!events || !events.length) return null;
  const head = events[0];
  if (!head || head.type !== 'session') return null;
  const title = (events.find(e => e.type === 'session/title') || {}).data || null;
  const userMsgs = events.filter(e => e.type === 'user/message' && !(e.data && e.data.source && e.data.source.kind === 'system'));
  const last = events[events.length - 1];
  const first = userMsgs[0] ? userMsgs[0].data.content.filter(c => c.type === 'text').map(c => c.text).join(' ').slice(0, 60) : '';
  return { id: head.id, title: typeof title === 'string' ? title : (first || '未命名会话'), lastTime: last ? (last.time || head.createdAt) : head.createdAt, cwd: head.cwd || '', messageCount: userMsgs.length, preview: first.slice(0, 90) };
}
function sessionMessages(file) {
  const events = decodeSessionFile(file);
  if (!events) return { ok: false, error: '无法解压' };
  const titleEv = events.find(e => e.type === 'session/title');
  const messages = [];
  for (const e of events) {
    if (e.type === 'user/message') {
      const isSystem = e.data && e.data.source && (e.data.source.kind === 'system' || e.data.source.kind === 'bootstrap');
      const text = (e.data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
      if (text && !isSystem) messages.push({ role: 'user', text: text.slice(0, 8000), time: e.time });
    } else if (e.type === 'assistant/message') {
      const d = e.data;
      if (d && typeof d === 'object' && d.content) {
        let text = '';
        if (typeof d.content === 'string') text = d.content;
        else if (Array.isArray(d.content)) text = d.content.filter(c => c && c.type === 'text').map(c => c.text).join('\n');
        if (text) messages.push({ role: 'assistant', text: text.slice(0, 12000), time: e.time });
      }
    }
  }
  return { ok: true, title: titleEv && typeof titleEv.data === 'string' ? titleEv.data : '未命名会话', messages };
}

ipcMain.handle('dsh:list-sessions', () => {
  const sessions = listSessionFiles().map(sessionSummary).filter(Boolean).sort((a,b) => (b.lastTime||0)-(a.lastTime||0));
  return { ok: true, sessions };
});
ipcMain.handle('dsh:read-session', (event, id) => {
  for (const [file, events] of decodeCache) {
    if (events && events[0] && events[0].id === id) return sessionMessages(file);
  }
  const file = listSessionFiles().find(f => { const ev = decodeSessionFile(f); return ev && ev[0] && ev[0].id === id; });
  if (!file) return { ok: false, error: '未找到 ' + id };
  return sessionMessages(file);
});

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: 1200, height: 800, show: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
    await win.loadFile(path.join(__dirname, '..', 'frontend', 'history', 'index.html'));
    log('page loaded');
    // 等待页面渲染后调用桥接
    await new Promise(r => setTimeout(r, 1500));
    const bridgeOk = await win.webContents.executeJavaScript('!!window.aimasterDesktop && typeof window.aimasterDesktop.listSessions === "function"').catch(e => 'ERR:' + e.message);
    log('bridge ok: ' + bridgeOk);
    if (bridgeOk === true) {
      const result = await win.webContents.executeJavaScript('window.aimasterDesktop.listSessions()');
      log('listSessions result ok=' + result.ok + ' count=' + (result.sessions ? result.sessions.length : 0));
      if (result.ok && result.sessions.length) {
        const top = result.sessions[0];
        log('top session: ' + top.title + ' msgs=' + top.messageCount);
        const read = await win.webContents.executeJavaScript('window.aimasterDesktop.readSession(' + JSON.stringify(top.id) + ')');
        log('readSession ok=' + read.ok + ' msgs=' + (read.messages ? read.messages.length : 0) + ' title=' + read.title);
      }
    }
    log('E2E COMPLETE');
    setTimeout(() => app.exit(0), 500);
  } catch (e) {
    log('E2E FATAL: ' + e.message + ' ' + (e.stack || '').split('\n')[1]);
    app.exit(1);
  }
});
