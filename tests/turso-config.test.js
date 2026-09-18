'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tursoConfig } = require('../server/turso-config');
const { vercelOptions } = require('../server/vercel-runtime');
test('Vercel Marketplace URL activates remote learning configuration without exposing secrets', () => {
 const env = { TURSO_DATABASE_URL: ' libsql://example.turso.io ', TURSO_AUTH_TOKEN: ' test-secret ' };
 assert.deepEqual(tursoConfig(env), { url: 'https://example.turso.io', authToken: 'test-secret', configured: true });
 const options = vercelOptions(env);
 assert.equal(options.inMemory, false);
 assert.equal(options.storageStatus.learningPersistent, true);
 assert.ok(!JSON.stringify(options).includes('test-secret'));
});
test('URL aliases must agree and whitespace-only legacy value does not shadow Marketplace', () => {
 const token = { TURSO_AUTH_TOKEN: 'secret' };
 assert.equal(tursoConfig({...token, TURSO_URL:' ', TURSO_DATABASE_URL:'libsql://example'}).configured, true);
 assert.equal(tursoConfig({...token, TURSO_URL:'libsql://example/', TURSO_DATABASE_URL:'https://example'}).configured, true);
 assert.throws(() => tursoConfig({...token, TURSO_URL:'libsql://one', TURSO_DATABASE_URL:'libsql://two'}), /CONFLICT/);
});
test('partial or invalid remote configuration fails closed with redacted errors', () => {
 for (const env of [{TURSO_DATABASE_URL:'libsql://example'}, {TURSO_AUTH_TOKEN:'secret'}]) assert.throws(() => tursoConfig(env), /INCOMPLETE/);
 for (const url of ['http://example', 'file:test.db', 'https://user:secret@example', 'https://example?token=secret', 'invalid']) {
  assert.throws(() => tursoConfig({TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:'secret'}), e => e.message === 'TURSO_CONFIGURATION_INVALID_URL');
 }
 assert.equal(tursoConfig({}).configured, false);
});
