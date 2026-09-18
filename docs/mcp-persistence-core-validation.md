# Persistence core validation — 2026-09-18

## Implemented in this continuation

- Hardened server/durable-files.js against colon-bearing Windows drive/alternate-stream paths and noncanonical base64 payloads.
- Added tests/durable-files.test.js: 8 tests covering reconstruction of an adapter over existing snapshots, owner scope separation, SQL insert/update CAS and BLOB round-trip, concurrent replacement conflict, safe append retries, rollback/temporary-directory cleanup, unchanged-read version stability, invalid paths/encoding and compressed-size rejection.
- Tests use the actual @libsql/client local in-memory SQL implementation, NOT a remote database or Vercel instance. Adapter reconstruction is not process-restart or remote cold-start certification.

## Validation

- node --test tests/durable-files.test.js: 8 passed.
- npm run verify: 161 tests passed; frontend verification passed (30 pages, 8 assets, 369 internal links, 10 galaxies, 57 knowledge nodes, 41 practice tasks, structural coverage 57/57). This is not factual review of 57 nodes.
- get_diagnostics on server/durable-files.js: no matching warnings/errors returned.
- Initial file-backed SQL test fixtures hit Windows EPERM during teardown after db.close. Switched core SQL tests to an in-memory database; Windows file-backed teardown is not claimed resolved. Initial fixture leftovers outside the repository were not broadly deleted.

## Remaining limitations

RAG/memory adapters are not wired into production routes. No complete skills/research persistence or cross-store transaction coverage. Snapshot limits remain 1 MiB compressed / 16 MiB raw; course capacity acceptance remains pending. The remote database and actual cold-start/concurrent-instance behavior still require validation. Vercel CLI was rechecked and still reports Logged out. No deployment, alias change, key change, commit or push occurred in this continuation. Real 100-query/200-explanation independent annotations and full factual review remain outstanding.

Preserved unrelated docs/mcp-jury-six-dimension-review.md. Current changes remain in the remediation worktree. Next step is actual adapter/async-route integration and remote-storage selection, not production promotion.
