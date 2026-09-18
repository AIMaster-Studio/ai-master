'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/index');
const REMOTE = 'remote-admin-token-for-tests';
const CONFIG = 'config-token-for-tests';
const req = (over = {}) => ({ method: 'POST', url: '/api/rag/kb', headers: {}, socket: { remoteAddress: '203.0.113.9' }, ...over });
// Windows keeps the SQLite handle briefly after close, so removal can raise EPERM.
// These gate checks never inspect stored data; leaving the temp dir to the OS keeps the suite deterministic.
const newRoot = t => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-gate-'));
  t.after(() => { try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best-effort cleanup */ } });
  return r;
};
const keys = ['AIMASTER_REMOTE_ADMIN_TOKEN', 'AIMASTER_CONFIG_TOKEN', 'AIMASTER_ALLOWED_HOSTS'];
test('remote admin token unlocks content admin only when explicitly configured', async t => {
  const saved = {}; for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
  t.after(() => { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
  const closed = createApp({ dataRoot: newRoot(t), allowRemote: true, configToken: CONFIG });
  assert.equal(closed.adminGate(req({ headers: { 'x-aimaster-admin-token': REMOTE } })), false, 'unset remote token stays fail-closed');
  assert.equal(closed.adminGate(req({ headers: { 'x-aimaster-admin-token': '' } })), false);
  const open = createApp({ dataRoot: newRoot(t), allowRemote: true, configToken: CONFIG, remoteAdminToken: REMOTE });
  assert.equal(open.adminGate(req({ headers: { 'x-aimaster-admin-token': REMOTE } })), true);
  assert.equal(open.adminGate(req({ headers: { 'x-aimaster-admin-token': 'wrong' } })), false);
  assert.equal(open.adminGate(req()), false, 'exposed non-loopback peer without token is refused');
  assert.equal(open.adminGate(req({ headers: { 'x-forwarded-for': '127.0.0.1' } })), false, 'forgeable headers grant nothing');
  assert.equal(open.adminGate(req({ headers: { 'x-aimaster-config-token': CONFIG } })), false, 'config token alone is not a remote admin credential');
});
test('local behaviour is unchanged by the remote token', async t => {
  const saved = {}; for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
  t.after(() => { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
  const local = createApp({ dataRoot: newRoot(t), remoteAdminToken: REMOTE });
  assert.equal(local.adminGate(req({ socket: { remoteAddress: '127.0.0.1' } })), true);
  const exposed = createApp({ dataRoot: newRoot(t), allowRemote: true, configToken: CONFIG, remoteAdminToken: REMOTE });
  assert.equal(exposed.adminGate(req({ socket: { remoteAddress: '127.0.0.1' } })), false, 'exposed loopback still needs the config token');
  assert.equal(exposed.adminGate(req({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-aimaster-config-token': CONFIG } })), true);
});
