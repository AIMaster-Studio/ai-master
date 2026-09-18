'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryRoutes } = require('../server/memory-routes');
test('memory route propagates remote commit failure instead of sending success', async () => {
  let sent = false;
  const expected = Object.assign(new Error('concurrent update'), { status: 409 });
  const handle = createMemoryRoutes({ memoryFor: () => ({ writePreference: async () => { throw expected; } }) });
  await assert.rejects(handle({ req: { method: 'POST' }, route: 'memory/preference',
    body: { text: 'example' }, user: { id: 'alice' }, send: () => { sent = true; },
    fail: () => { throw new Error('unexpected validation failure'); } }), error => error === expected);
  assert.equal(sent, false);
});
