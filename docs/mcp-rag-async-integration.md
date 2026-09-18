# RAG async integration — 2026-09-18

## Implemented

- createRagService accepts an optional snapshot repository; createApp passes options.ragRepository. No automatic cloud enablement.
- RAG routes await asynchronous list/info/create/remove/document/activate methods and course lookup. Course seeding uses the durable adapter's single CAS snapshot operation when available.
- Course grounding and capability rag_search/kb_list await repository results.
- Lifecycle tests exposed lost empty-directory assumptions after snapshot restore; addDocuments and replaceDocuments now recreate the registered KB directory before writing. Fixed a missing await in course status lookup.

## Verified locally

- Two new durable RAG route tests: create/import/index/reconstruct/search/activate/delete and bundled-course atomic seed/status/default search.
- Course initial snapshot: 74 documents, 93 chunks, 172484 bytes in the recorded run (UUIDs/timestamps can change compressed size). Initial course fits 1 MiB compressed limit. Repeated builds, semantic embeddings and indefinite growth are NOT validated by this measurement.
- npm run verify: 165 tests passed; frontend structural verification passed including 57/57 knowledge-node coverage. Not factual certification.
- Server diagnostics: no matching errors/warnings. One parallel diagnostics request received HTTP409; serial retry succeeded.

## Outstanding

Local in-memory libsql is used, not Vercel or remote SQL. Object reconstruction is not a process cold-start test. Runtime environment selection, credentials, truthful durable-mode status, remote failure/latency testing, skills/research persistence and cross-store atomicity remain open. Vercel CLI authorization and repository-source alignment remain unresolved. Real 100-query/200-explanation independent annotations and 57-node factual review are still outstanding.

This is an opt-in integration checkpoint, not production readiness. No production deployment or environment-variable mutation was performed.
