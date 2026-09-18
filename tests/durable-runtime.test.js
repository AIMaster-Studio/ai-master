const test = require('node:test');
const assert = require('node:assert/strict');
const { vercelOptions } = require('../server/vercel-runtime');
const { createApp } = require('../server');
test('remote snapshot flag requires credentials and reports partial persistence honestly', () => {
 assert.throws(() => vercelOptions({AIMASTER_DURABLE_SNAPSHOTS:'1'}), /REQUIRE_REMOTE_DB/);
 const options=vercelOptions({AIMASTER_DURABLE_SNAPSHOTS:'1',TURSO_DATABASE_URL:'libsql://example',TURSO_AUTH_TOKEN:'test'});
 assert.equal(options.durableSnapshots,true);
 assert.equal(options.storageStatus.rag,'remote-snapshot');
 assert.equal(options.storageStatus.memory,'remote-snapshot');
 assert.equal(options.storageStatus.skills,'ephemeral-tmp');
 assert.equal(options.storageStatus.filesPersistent,false);
});
test('snapshot mode refuses a local learning database rather than pretending it is remote', () => {
 assert.throws(() => createApp({inMemory:true,durableSnapshots:true}), /REQUIRE_REMOTE_DB/);
});
