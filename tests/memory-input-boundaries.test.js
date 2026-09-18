'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createClient } = require('@libsql/client');
const { createMemoryStore } = require('../server/memory/store');
const { durableMemory } = require('../server/durable-adapters');
const { createSnapshotRepository } = require('../server/durable-files');
for (const durable of [false, true]) {
 test('memory rejects unregistered and inherited surfaces; durable=' + durable, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-input-'));
  const db = createClient({url:'file::memory:'});
  t.after(() => {db.close();fs.rmSync(root,{recursive:true,force:true});});
  const memory = durable ? durableMemory(createSnapshotRepository(db),'alice') : createMemoryStore({dataRoot:root});
  for (const surface of ['__proto__','constructor','toString','../outside']) {
   for (const method of ['l1','l1Dates','readL2','refreshL2','clear']) {
    await assert.rejects(async () => memory[method](surface), e => e.status === 400);
   }
  }
 });
 test('memory date validation blocks traversal and invalid calendar dates; durable=' + durable, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-date-'));
  const db = createClient({url:'file::memory:'});
  t.after(() => {db.close();fs.rmSync(root,{recursive:true,force:true});});
  const memory = durable ? durableMemory(createSnapshotRepository(db),'alice') : createMemoryStore({dataRoot:root});
  for (const date of ['../../outside','C:stream','2026-02-30','2025-02-29','2026-13-01','2026-1-01',{},'']) {
   await assert.rejects(async () => memory.l1('plan',{date}), e => e.status === 400);
  }
  await memory.record('plan',{goal:'date-boundary-test'},Date.parse('2024-02-29T12:00:00Z'));
  assert.equal((await memory.l1('plan',{date:'2024-02-29'})).length,1);
  assert.deepEqual(await memory.l1('plan',{date:'2024-03-01'}),[]);
 });
}
