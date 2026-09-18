# Production release of the persistence work — 2026-09-18

> **Correction, 2026-09-18 (audit).** The original version of this note said the release tree was
> "pushed to refs/heads/main". That statement was not true for this repository and has been
> replaced below. What actually happened: the tree was pushed to `main` of a **separate, private
> Vercel-linked repository** (`433525/ai-master-backend`, created by Vercel from an unrelated root
> commit), not to `AIMaster-Studio/ai-master`. This repository has no `main` branch, and until the
> audit the production commit `a3b3c8c9` did not exist here at all. The release therefore bypassed
> this repository's branches, pull requests and the Verify workflow. Details in
> `docs/mcp-production-provenance-audit.md`.

User authorised a direct production release after the preview acceptance passed.

## Pre-release state

Production ran 49a23015e51d2b5db1d4542471559b45bf1d58a3. Its /api/status exposed no storage section, and the Production environment had only DEEPSEEK_API_KEY, so promoting code alone would not have produced persistence.

**Rollback point 49a2301 — verification status (2026-09-18):**

- `49a2301` is a **root commit with no parents** ("Initial commit — Created from https://vercel.com/new", committer `Vercel Commit`). It exists in `433525/ai-master-backend` as the base of `main`, and locally only as a grafted shallow object (`preview-target/main`).
- It is **not** an ancestor of anything in `AIMaster-Studio/ai-master`: `git merge-base 49a2301 master` reports no common ancestor. The earlier phrase "predates the remediation branch by 71 changed files" was a `git diff --stat` between two unrelated histories, not a commit-count relationship, and is withdrawn.
- Its tree does not match any commit tree in this repository (checked against `git rev-list --all`). Therefore, **as a rollback target inside this repository it cannot be verified**. It remains usable only as a Vercel deployment rollback (previous Production deployment) in the Vercel dashboard, which was not exercised.

## Production storage provisioning

Created a separate Turso database ai-master-production on the Starter plan, confirmed on the confirmation screen as the free plan with 100 databases, 5GB storage, 500M monthly rows read and 10M written, region iad1. The preview database was deliberately not reused because it holds test data. The integration dialog defaulted to Production plus Preview; Preview was unchecked so the connection applies to Production only and cannot disturb the already verified preview configuration. Sensitive stayed enabled.

Added to Production scope only: AIMASTER_DURABLE_SNAPSHOTS=1 and AIMASTER_REMOTE_ADMIN_TOKEN, the latter a fresh 64-character random value distinct from the preview token, stored at github-upload/.local/production-admin-token.txt outside the repository and never printed into the transcript.

## Release

Actual release path (corrected): commit a3b3c8c9e5496dacdd7f5aabb3e6f954d743fe9e was created locally on top of the grafted root 49a2301 (five preview snapshot commits, authored by the agent) and pushed with `git push` to `main` of the private repository `433525/ai-master-backend` (`prod-push.log`: `49a2301..a3b3c8c  -> main`). Vercel built that push; deployment J9vbWTosz17RMJ67EXtBKELoTqdp reported success and `/api/status` now returns `build.sha = a3b3c8c9…`. The content was checked against the preview tree with `git diff --exit-code` before pushing. No pull request, review or Verify run in `AIMaster-Studio/ai-master` was involved.

Provenance repair (2026-09-18): the tree of a3b3c8c9 (`f627665f1afbd938f569c6d73b1f91979c7eb713`) is byte-identical to commit `a212b4f` on `fix/vercel-production-audit` (`git diff-tree -r a3b3c8c9 a212b4f` is empty). The exact production commit has now been pushed to this repository as branch `release/production-a3b3c8c9` and annotated tag `production-2026-09-18-a3b3c8c9`, so every byte running in production is reachable from `AIMaster-Studio/ai-master`. Its history below a212b4f-equivalent content is the unrelated Vercel root, so it is a provenance record, not a branch to merge.

## Post-release verification on https://ai-master-backend.vercel.app

storage.learning=remote-turso with learningPersistent=true; storage.rag and storage.memory=remote-snapshot; memory root reports remote-database; skills and agent remain ephemeral-tmp and filesPersistent stays false, as designed. Model key remains configured (ai.configured=true).

Authorisation: POST /api/rag/course/seed without a token returned 403; with the production admin token it returned 200. Course library "AI Master 课程库" exists in production and a search for RAG 检索增强生成 returned HTTP 200 with three hits, top result 第6章 · RAG 技术详解.

User-facing checks: home page loads with title "AIMaster | AI 闯关学习序章", /api/catalog returns 200 with 7 modules, /api/memory/inspect returns 200.

## Remaining limits

Skills and agent sessions are still ephemeral by design. Snapshot growth is unquantified because the list endpoint does not expose document, chunk or version counts. Retrieval quality in production was checked with a single query after a four-query preview smoke test; the 100-query benchmark, 200 double-annotated explanations and the 57-node factual review are still outstanding and must not be described as complete.

Known production defect found after this release (2026-09-18): `/api/rag/status` reports `sqlite-vec` unavailable (`Cannot find module 'sqlite-vec-linux-x64/vec0.so'`), so production retrieval runs on the pure-JS cosine fallback while `/api/rag/search` returns HTTP 200 and `/api/status` shows nothing. The fix (bundling the extension and surfacing degradation in both endpoints) lives on `fix/vercel-production-audit` and is **not deployed** at the time of writing.
