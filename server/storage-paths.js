'use strict';
const path = require('node:path');
const os = require('node:os');

function storagePaths(options = {}, env = process.env, root = path.resolve(__dirname, '..')) {
  const ephemeral = options.inMemory || options.dbPath === ':memory:';
  const configured = String(env.AIMASTER_DATA_ROOT || '').trim();
  if (!ephemeral && !options.dataRoot && configured && !path.isAbsolute(configured)) {
    throw new Error('AIMASTER_DATA_ROOT must be an absolute persistent directory');
  }
  const dataRoot = options.dataRoot || (ephemeral
    ? path.join(os.tmpdir(), 'aimaster-ephemeral-' + process.pid)
    : configured || path.join(root, '.local'));
  return {
    dataRoot,
    dbPath: options.dbPath || (options.inMemory ? ':memory:' : path.join(dataRoot, 'learning.sqlite'))
  };
}
module.exports = { storagePaths };
