# Actual Vercel preview deployment and memory smoke test — 2026-09-18

## Source alignment

Direct cross-repository pushes of 4d0ce59 failed twice (including --no-thin) because the source clone is shallow and target lacks ancestor 18a7198c4db23aa7d9cf472448ee965cbb941a1a. Fetched target main into refs/remotes/preview-target/main without checkout. Created deployment snapshot commit 091a57af8c1ae927819a465343a43fd10ce9f3fa with target-main parent and exactly the tree of tested source 4d0ce59719aab71dcf391a1c687557984e525e30. git diff --exit-code between the two trees passed. Pushed only new branch preview/persistence-4d0ce59 to 433525/ai-master-backend; no main push, force push, merge or domain reassignment.

Source-of-truth remediation remains AIMaster-Studio/ai-master, branch fix/vercel-production-audit. Its Verify succeeded for 4d0ce59 (174 local tests before source commit).

## Preview deployment

Vercel deployment 3zLzyPgfkruusua75QsFzeFXumYr became Ready after 27 seconds, Environment Preview, source 091a57a.

URL: https://ai-master-backend-6wazoo65b-433525.vercel.app
Branch alias: https://ai-master-backend-git-preview-persistence-4d0ce59-433525.vercel.app

AIMASTER_DURABLE_SNAPSHOTS already existed in Preview; add attempt returned duplicate-variable error and did not overwrite it. The subsequent runtime status confirmed it is active. A separate older production redeploy was visible in the dashboard; it was not initiated by this continuation.

## Actual remote verification

Visited /api/status using the authenticated controlled browser, without extracting cookies or credentials. Storage reports learning=remote-turso, rag/memory=remote-snapshot, skills/agent=ephemeral-tmp and filesPersistent=false. AI configured=false in Preview.

Using a guest app session on the new preview host, checked no existing preferences, wrote a unique smoke-test preference, read it back via memory/inspect (root=remote-database), then cleared it in finally. All HTTP operations succeeded. rag/kbs returned an empty list. This verifies actual remote memory write/read/clear through Vercel, not just local SQL.

Not yet verified: forced cold start or redeployment recovery, independent concurrent instances, cloud course seeding/search, model calls, full skills/agent durability, real student samples or independent labels. Course library is empty and RAG admin writes require the configured admin gate. Do not promote to production yet.
