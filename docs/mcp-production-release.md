# Production release of the persistence work — 2026-09-18

User authorised a direct production release after the preview acceptance passed.

## Pre-release state

Production ran 49a23015e51d2b5db1d4542471559b45bf1d58a3, which predates the remediation branch by 71 changed files. Its /api/status exposed no storage section, and the Production environment had only DEEPSEEK_API_KEY, so promoting code alone would not have produced persistence. Rollback point recorded as 49a2301 for both refs/heads/main and the last Production deployment.

## Production storage provisioning

Created a separate Turso database ai-master-production on the Starter plan, confirmed on the confirmation screen as the free plan with 100 databases, 5GB storage, 500M monthly rows read and 10M written, region iad1. The preview database was deliberately not reused because it holds test data. The integration dialog defaulted to Production plus Preview; Preview was unchecked so the connection applies to Production only and cannot disturb the already verified preview configuration. Sensitive stayed enabled.

Added to Production scope only: AIMASTER_DURABLE_SNAPSHOTS=1 and AIMASTER_REMOTE_ADMIN_TOKEN, the latter a fresh 64-character random value distinct from the preview token, stored at github-upload/.local/production-admin-token.txt outside the repository and never printed into the transcript.

## Release

Pushed the verified tree a3b3c8c9e5496dacdd7f5aabb3e6f954d743fe9e to refs/heads/main, after git diff --exit-code confirmed it matches the tree validated in preview. Deployment J9vbWTosz17RMJ67EXtBKELoTqdp reported success. No rollback was needed.

## Post-release verification on https://ai-master-backend.vercel.app

storage.learning=remote-turso with learningPersistent=true; storage.rag and storage.memory=remote-snapshot; memory root reports remote-database; skills and agent remain ephemeral-tmp and filesPersistent stays false, as designed. Model key remains configured (ai.configured=true).

Authorisation: POST /api/rag/course/seed without a token returned 403; with the production admin token it returned 200. Course library "AI Master 课程库" exists in production and a search for RAG 检索增强生成 returned HTTP 200 with three hits, top result 第6章 · RAG 技术详解.

User-facing checks: home page loads with title "AIMaster | AI 闯关学习序章", /api/catalog returns 200 with 7 modules, /api/memory/inspect returns 200.

## Remaining limits

Skills and agent sessions are still ephemeral by design. Snapshot growth is unquantified because the list endpoint does not expose document, chunk or version counts. Retrieval quality in production was checked with a single query after a four-query preview smoke test; the 100-query benchmark, 200 double-annotated explanations and the 57-node factual review are still outstanding and must not be described as complete.
