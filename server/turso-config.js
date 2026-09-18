'use strict';
// Vercel Marketplace and legacy deployments use different names for the same URL.
function tursoConfig(env = process.env) {
  const clean = value => String(value || '').trim();
  const normalize = value => value.replace(/^libsql:\/\//, 'https://').replace(/\/$/, '');
  const legacy = clean(env.TURSO_URL);
  const marketplace = clean(env.TURSO_DATABASE_URL);
  if (legacy && marketplace && normalize(legacy) !== normalize(marketplace)) {
    throw new Error('TURSO_CONFIGURATION_CONFLICT');
  }
  const url = normalize(legacy || marketplace);
  const authToken = clean(env.TURSO_AUTH_TOKEN);
  if (Boolean(url) !== Boolean(authToken)) throw new Error('TURSO_CONFIGURATION_INCOMPLETE');
  if (url) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('TURSO_CONFIGURATION_INVALID_URL'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('TURSO_CONFIGURATION_INVALID_URL');
    }
  }
  return { url, authToken, configured: Boolean(url) };
}
module.exports = { tursoConfig };
