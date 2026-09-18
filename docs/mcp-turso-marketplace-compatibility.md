# Vercel Marketplace URL compatibility — 2026-09-18

Implemented shared server/turso-config.js, consumed by vercel-runtime.js and store.js. Supports TURSO_DATABASE_URL injected by Vercel and legacy TURSO_URL. Trims whitespace, normalizes libsql to HTTPS, rejects conflicting aliases, incomplete credentials and unsafe URL forms with fixed redacted error codes. Explicit local SQLite/test mode remains exempt from remote selection. Updated .env.example to describe Vercel Marketplace rather than obsolete Render/quota assumptions.

Added 3 configuration tests. npm run verify passed 168 tests and frontend structural checks. Server diagnostics returned no errors/warnings. Tests do not use actual remote credentials. This is an environment compatibility checkpoint, not proof of remote connectivity.

Preview-only Turso resource ai-master-preview was already provisioned in the preceding browser workflow; production variables remain unchanged. RAG/memory repository injection is opt-in and still needs cloud runtime selection, remote round-trip/cold-start tests and accurate per-store status. Skills/research durability remains incomplete. Do not promote this checkpoint directly to production. Existing production repository mismatch also remains unresolved.
