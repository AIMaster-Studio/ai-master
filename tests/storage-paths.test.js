'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { storagePaths } = require('../server/storage-paths');
const root = path.join(os.tmpdir(), 'aimaster-path-test');
test('persistent disk hosts both SQLite and file stores', () => {
  const mount = path.join(root, 'disk');
  const p = storagePaths({}, { AIMASTER_DATA_ROOT: mount }, root);
  assert.equal(p.dataRoot, mount);
  assert.equal(p.dbPath, path.join(mount, 'learning.sqlite'));
});
test('default local layout is unchanged', () => {
  assert.deepEqual(storagePaths({}, {}, root), {
    dataRoot: path.join(root, '.local'), dbPath: path.join(root, '.local', 'learning.sqlite')
  });
});
test('ephemeral tests ignore production mount configuration', () => {
  for (const options of [{ inMemory: true }, { dbPath: ':memory:' }]) {
    const p = storagePaths(options, { AIMASTER_DATA_ROOT: 'invalid-relative-path' }, root);
    assert.equal(p.dbPath, ':memory:');
    assert.ok(p.dataRoot.startsWith(os.tmpdir()));
  }
});
test('explicit storage options take priority', () => {
  const p = storagePaths({ dataRoot: root, dbPath: 'custom.sqlite' }, { AIMASTER_DATA_ROOT: 'relative' }, root);
  assert.equal(p.dataRoot, root);
  assert.equal(p.dbPath, 'custom.sqlite');
});
test('relative cloud data root fails loudly', () => {
  assert.throws(() => storagePaths({}, { AIMASTER_DATA_ROOT: 'relative' }, root), /absolute/);
});
