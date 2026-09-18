# Cloud RAG seeding and search verification — 2026-09-18

## Why a change was needed

Every content-admin route required a loopback TCP peer. Serverless functions never satisfy this, so the cloud course library could not be created at all: remote RAG persistence was configured but unusable. A first attempt made the config token bypass the loopback rule, which broke an existing security test asserting that the token must not bypass loopback. That approach was abandoned rather than weakening the test. The committed design adds a separate, opt-in AIMASTER_REMOTE_ADMIN_TOKEN that unlocks content administration only, never /api/ai/config, and is fail-closed when unset. Local behaviour is unchanged. Verify passed 176 tests.

## Credential handling

A 64-character random token was generated on the Windows host, written only to Preview scope in Vercel as a sensitive variable, and kept at github-upload/.local/remote-admin-token.txt, outside the repository and under an ignored path. The value was never printed into the transcript.

## Deployment chain

Branch preview/persistence-4d0ce59 on 433525/ai-master-backend: 05c85dd carries the admin-gate tree, verified identical to source HEAD a212b4f via git diff --exit-code. a3b3c8c redeploys the same tree to test durability. Both reported deployment success.

## Authorisation results, live

Against the preview alias, POST /api/rag/kb returned 403 with no token, 403 with a wrong token, and 403 with a forged X-Forwarded-For: 127.0.0.1 header. POST /api/rag/course/seed with the correct X-AIMaster-Admin-Token returned 200 with keys ok, created, kbId, manifest.

## Retrieval results, live

Knowledge base "AI Master 课程库" exists in the cloud with storage rag=remote-snapshot. Four Chinese queries each returned HTTP 200 with three hits and a topically correct first result: 提示词工程 to 第3章 · 提示词工程基础; RAG 检索增强生成 to 第6章 · RAG 技术详解; 智能体 Agent 是什么 to 第4章 · 驾驭框架与智能体概念; 模型微调 to 第7章 · 阿里云ACP大模型认证（上）.

After redeploying a3b3c8c the same four queries returned identical knowledge base and identical top results, so the seeded library survives redeployment of the functions.

## Limits

This is a relevance smoke test on four queries, not the 100-query benchmark, and top-1 topical match was judged by the agent, not by independent annotators. Document, chunk and version counts were not exposed by the list endpoint and remain unmeasured, so snapshot growth is still unquantified. Skills and agent sessions remain ephemeral by design. Preview has no model key, so no generation path was exercised. Production still runs 49a2301 and was not modified; the remote admin token exists in Preview only.
