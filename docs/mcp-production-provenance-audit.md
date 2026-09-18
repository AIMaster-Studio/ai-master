# Production provenance audit and remediation — 2026-09-18

Scope: `AIMaster-Studio/ai-master`, production `https://ai-master-backend.vercel.app`.
Executed from the ShunCode workspace clone `ai-master-remediation` (branch `fix/vercel-production-audit`).
Every claim below is paired with the command that produced it and the actual output. Outputs are
trimmed for width only; nothing was reworded. Facts and inferences are separated; inferences are
labelled **(inference)**. Project self-test, not third-party attestation.

Explicitly out of scope by instruction: merging any PR, redeploying production. Neither was done.

## 0. Findings that changed the plan

| Claim in the brief | What the repository actually shows | Effect on the plan |
| --- | --- | --- |
| `a3b3c8c9` is not on GitHub | It **is** on GitHub, but in a different, private repo: `433525/ai-master-backend` (`main` and `preview/persistence-4d0ce59` both at `a3b3c8c9`). It was absent from `AIMaster-Studio/ai-master`. | Step 1 did not need a Vercel export; the commit object existed locally and in the backend repo. |
| Rollback point `49a2301` | A parentless root commit created by Vercel ("Initial commit — Created from https://vercel.com/new"). No common ancestor with `master`; its tree matches no commit in this repo. | Marked "cannot be verified in this repository" in the release doc (step 2). |
| 16 stale branches, "4514 / my-feature-01 duplicate" | Confirmed: 17 candidates, 16 with `ahead_by=0` against `master`; `4514` and `my-feature-01` share tip `a7404df`. `fix/devlog-reminder-disable` was identical to `master`. | 17 deleted; `gh-pages` (Pages source, unrelated history) and PR heads kept. |
| PR #7 fully contained in #8 | Confirmed: `80d0034` is an ancestor of `#8` head; compare `ahead_by=12, behind_by=0` after this work. | #7 closed with reason. |

```
$ gh api repos/433525/ai-master-backend/branches --jq '.[]|.name+" "+.commit.sha[0:8]'
main a3b3c8c9
preview/persistence-4d0ce59 a3b3c8c9
$ gh api repos/AIMaster-Studio/ai-master/commits/a3b3c8c9 --jq .sha        # before step 1
gh: No commit found for SHA: a3b3c8c9 (HTTP 422)
$ gh api repos/AIMaster-Studio/ai-master/branches/main --jq .name
gh: Branch not found (HTTP 404)
$ cat prod-push.log | tail -1
   49a2301..a3b3c8c  a3b3c8c9e5496dacdd7f5aabb3e6f954d743fe9e -> main      (remote: github.com/433525/ai-master-backend.git)
```

## 1. Production tree secured in the repository

Live build SHA and tree identity:

```
$ curl -s https://ai-master-backend.vercel.app/api/status | jq .build
{"sha":"a3b3c8c9e5496dacdd7f5aabb3e6f954d743fe9e"}
$ git rev-parse a3b3c8c9^{tree}   # local object, reachable via grafted preview-target/main
f627665f1afbd938f569c6d73b1f91979c7eb713
$ git rev-parse a212b4f^{tree}    # commit on fix/vercel-production-audit
f627665f1afbd938f569c6d73b1f91979c7eb713
$ git diff-tree -r a3b3c8c9 a212b4f | wc -l
0
```

Blob-level check with `git hash-object` against bytes actually served by production
(static files are served verbatim by Vercel, so they can be compared byte for byte):

```
$ for p in learning-center/index.html assets/frontend.js assets/frontend.css assets/course-navigation.js data/chapter_01.json; do
    live=$(curl -s "https://ai-master-backend.vercel.app/$p" | git hash-object --stdin)
    repo=$(git rev-parse "a3b3c8c9:frontend/$p"); [ "$live" = "$repo" ] && echo SAME $p || echo DIFF $p; done
SAME  learning-center/index.html  live=00ccd91b382c repo=00ccd91b382c
SAME  assets/frontend.js          live=fe7a08b08c6c repo=fe7a08b08c6c
SAME  assets/frontend.css         live=6b34b89e1fad repo=6b34b89e1fad
SAME  assets/course-navigation.js live=5fbd54cac073 repo=5fbd54cac073
SAME  data/chapter_01.json        live=cb8ccd9b4886 repo=cb8ccd9b4886
```

Server-side code cannot be fetched from a serverless function, so the server files are covered
by the tree-identity check above plus `build.sha` reported by the running function
**(inference: the function was built from the commit whose SHA it reports; Vercel sets
`VERCEL_GIT_COMMIT_SHA` from the pushed commit)**.

Push and tag:

```
$ git push origin a3b3c8c9:refs/heads/release/production-a3b3c8c9
 * [new branch]      a3b3c8c9 -> release/production-a3b3c8c9
$ git tag -a production-2026-09-18-a3b3c8c9 a3b3c8c9 -m "..." && git push origin refs/tags/production-2026-09-18-a3b3c8c9
 * [new tag]         production-2026-09-18-a3b3c8c9 -> production-2026-09-18-a3b3c8c9
$ gh api repos/AIMaster-Studio/ai-master/commits/a3b3c8c9e5496dacdd7f5aabb3e6f954d743fe9e --jq '{sha,tree:.commit.tree.sha}'
{"sha":"a3b3c8c9e5496dacdd7f5aabb3e6f954d743fe9e","tree":"f627665f1afbd938f569c6d73b1f91979c7eb713"}
$ gh api repos/AIMaster-Studio/ai-master/branches/release%2Fproduction-a3b3c8c9 --jq .commit.sha
a3b3c8c9e5496dacdd7f5aabb3e6f954d743fe9e
```

Boundary: `release/production-a3b3c8c9` sits on the unrelated Vercel root `49a2301`; it is a
provenance record and rollback source, not a branch to merge into `master`. No secret files are in
that tree (`git ls-tree -r --name-only a3b3c8c9 | grep -iE '\.env$|\.local/|token|secret'` matches
only `.env.example` and two dsh-pet asset filenames containing "token").

## 2. Release document corrected

`docs/mcp-production-release.md` now carries a correction block at the top, records the real path
(push to `main` of `433525/ai-master-backend`, no PR / Verify in this repo), states the provenance
repair, and marks `49a2301`:

```
$ git cat-file -p 49a2301 | grep -c '^parent'
0
$ git merge-base 49a2301 master || echo "NO COMMON ANCESTOR"
NO COMMON ANCESTOR
$ T=$(git rev-parse 49a2301^{tree}); for c in $(git rev-list --all); do [ "$(git rev-parse $c^{tree})" = "$T" ] && echo MATCH $c; done
MATCH 49a23015e51d2b5db1d4542471559b45bf1d58a3      # only itself
```

The sentence "predates the remediation branch by 71 changed files" was withdrawn (it was a diff
between unrelated histories). The doc also records the production retrieval defect from section 4.

## 3. Pull requests and branches

```
$ gh pr ready 8 -R AIMaster-Studio/ai-master
✓ Pull request AIMaster-Studio/ai-master#8 is marked as "ready for review"
$ git merge-base --is-ancestor origin/fix/ican-review-20260917 origin/fix/vercel-production-audit && echo contained
contained
$ gh api repos/AIMaster-Studio/ai-master/compare/fix%2Fican-review-20260917...fix%2Fvercel-production-audit --jq '{status,ahead_by,behind_by}'
{"status":"ahead","ahead_by":12,"behind_by":0}
$ gh pr close 7 -R AIMaster-Studio/ai-master --comment "Closing as superseded by #8 ..."
✓ Closed pull request AIMaster-Studio/ai-master#7
```

Branch deletion used the GitHub compare API rather than the local clone, because the clone is
shallow (`.git/shallow` lists `5d25ec7` and `49a2301`), which made local `merge-base` say "not
contained" for branches that are in fact ancestors of `master`. Rule applied: delete only when
`ahead_by == 0`.

```
DELETED 4514 (ahead=0 behind=103)                    DELETED fix-r003-doc-rootcause (ahead=0 behind=73)
DELETED an9020-dev (ahead=0 behind=102)              DELETED fix/client-timeout-and-fallback (ahead=0 behind=63)
DELETED codex/beginner-hands-on-v2 (ahead=0 behind=2) DELETED fix/public-entry-to-product (ahead=0 behind=61)
DELETED codex/ican-learning-loop-20260905 (ahead=0 behind=107) DELETED fix/r202-redact-tunnel-host (ahead=0 behind=67)
DELETED codex/submission-materials-20260916 (ahead=0 behind=1) DELETED fix/r202-scripts-tunnel-host (ahead=0 behind=65)
DELETED docs-r101-r107-response (ahead=0 behind=71)  DELETED fix/tunnel-host-allowlist (ahead=0 behind=56)
DELETED feat-r002-r005-backend (ahead=0 behind=75)   DELETED my-feature-01 (ahead=0 behind=103)
DELETED feat/beginner-and-hands-on (ahead=0 behind=14)
DELETED fix/devlog-reminder-disable (identical to master)
DELETED feat/r301-timeout-budget (ahead=0 behind=69)
$ gh api repos/AIMaster-Studio/ai-master/branches --jq '.[]|.name+" "+.commit.sha[0:7]'
fix/ican-review-20260917 80d0034      # kept until #8 merges (closed PR #7 head)
fix/vercel-production-audit a99036f   # PR #8
gh-pages b6c2fad                      # GitHub Pages source; unrelated history, kept
master 5d25ec7
release/production-a3b3c8c9 a3b3c8c
```

Not done: the local worktrees under `ai-master-worktrees/` still reference some deleted branch
names; they were left alone (other machines may depend on them).

## 4. Retrieval degradation made visible and the bundle fixed

Before (production, unchanged at time of writing):

```
$ curl -s -X POST https://ai-master-backend.vercel.app/api/rag/search -H 'content-type: application/json' -d '{"query":"RAG 检索增强生成","topK":2}'
HTTP 200
{"ok":true,"result":{... "embedder":{"id":"local-hash-256","semantic":false,...},
 "backend":{"id":"js-cosine","degraded":true,"degradeReason":"sqlite-vec 扩展加载失败：Cannot find module 'sqlite-vec-linux-x64/vec0.so' ..."}, "hits":[...]}}
$ curl -s https://ai-master-backend.vercel.app/api/status | jq 'keys'
["ai","build","mode","ok","storage","version"]            # no rag / degraded field at all
```

Root cause (verified locally with the same tracer Vercel uses):

```
$ npx @vercel/nft print "api/[...slug].js" | grep sqlite-vec          # before the change
node_modules\sqlite-vec\index.cjs
node_modules\sqlite-vec\package.json                                  # no platform package, no vec0.*
```

`sqlite-vec/index.cjs` resolves `<pkg>-<os>-<arch>/vec0.<ext>` from a string built at runtime, so
the static tracer never sees the extension file. The lockfile already lists
`sqlite-vec-linux-x64@0.1.9` as optional, so `npm ci` installs it on Linux; it just is not shipped.

Change (commit `a99036f` on `fix/vercel-production-audit`):

- `server/rag/vector-store.js`: literal `require.resolve('sqlite-vec-linux-x64/vec0.so')` hints
  (try/catch, no behaviour), probe cache, `AIMASTER_DISABLE_SQLITE_VEC=1` operator switch,
  `explainBackendChoice()`.
- `vercel.json`: `"includeFiles": "node_modules/sqlite-vec-linux-x64/**"` for the function.
- `server/rag/kb-store.js`: search result reports the backend **actually opened for this query**
  (`backend.id`, `requestedBackend`, `degraded`, `degradeReason`) plus top-level `degraded` and
  `warnings`.
- `server/rag-routes.js`: `/api/rag/search` responses carry `degraded`, `warnings`, and header
  `X-AIMaster-Degraded: rag-backend` when degraded. Status stays 200 (results are still valid);
  the point is that "200" is no longer the only signal.
- `server/index.js`: `/api/status` gains `rag{preferredBackend,activeBackend,backendDegraded,
  degradeReason,embedder,semantic,warnings}`, top-level `degraded`, `warnings`.
- `server/capabilities/registry.js`: `rag_search` tool result includes `backend` and `degraded`.
- `tests/rag-degradation.test.js`: three tests, both directions.

After (local, tracer + tests):

```
$ npx @vercel/nft print "api/[...slug].js" | grep sqlite-vec
node_modules\sqlite-vec-linux-x64\package.json
node_modules\sqlite-vec-linux-x64\vec0.so                              # now traced
node_modules\sqlite-vec-windows-x64\package.json
node_modules\sqlite-vec-windows-x64\vec0.dll
node_modules\sqlite-vec\index.cjs
node_modules\sqlite-vec\package.json

# should-FAIL direction: new tests against the previous server code
$ git stash push -- server vercel.json && node --test tests/rag-degradation.test.js; git stash pop
✖ the disable switch makes the preferred backend report unavailable with a reason
✖ a degraded retrieval backend is visible in the search response, its header and /api/status
   AssertionError [ERR_ASSERTION]: /api/status 必须把检索降级暴露到顶层
✖ when the preferred backend works nothing is reported as degraded
ℹ tests 3  ℹ pass 0  ℹ fail 3

# should-PASS direction: new code
$ node --test tests/rag-degradation.test.js
✔ the disable switch makes the preferred backend report unavailable with a reason
✔ a degraded retrieval backend is visible in the search response, its header and /api/status
✔ when the preferred backend works nothing is reported as degraded
$ npm run test:learning | grep -E 'ℹ (tests|pass|fail)'
ℹ tests 182   ℹ pass 182   ℹ fail 0            # baseline before the change: 179/179
$ gh run list --branch fix/vercel-production-audit --limit 3
a99036f Verify completed success   https://github.com/AIMaster-Studio/ai-master/actions/runs/35349296312
```

Degraded response shape (from the test run, `AIMASTER_DISABLE_SQLITE_VEC=1`):

```
POST /api/rag/search  →  200, X-AIMaster-Degraded: rag-backend
{"ok":true,"degraded":true,
 "warnings":["检索索引后端已降级为 js-cosine：首选后端 sqlite-vec 不可用：已由环境变量 AIMASTER_DISABLE_SQLITE_VEC=1 显式停用 sqlite-vec。",
             "本次检索使用 local-hash-256（词面重合嵌入），不是语义检索。"],
 "result":{"backend":{"id":"js-cosine","requestedBackend":"sqlite-vec","degraded":true,"degradeReason":"..."}, ...}}
GET /api/status  →  {"degraded":true,"rag":{"preferredBackend":"sqlite-vec","activeBackend":"js-cosine","backendDegraded":true,...}}
```

What is **not** verified: that `includeFiles` actually makes `vec0.so` load inside a Vercel Linux
function. That requires a deployment, which was excluded. Until PR #8 is deployed, production keeps
the old behaviour shown under "Before". After deployment the acceptance check is:
`curl -s https://ai-master-backend.vercel.app/api/status | jq '.degraded, .rag.activeBackend'`
expected `false` / `"sqlite-vec"`; if it prints `true` / `"js-cosine"`, the degradation is at least
now visible and the reason string says why.

Note on the metric in the brief: fixing the backend changes latency and index format, not ranking.
Both backends return cosine similarity over the same `local-hash-256` vectors (`tests/rag.test.js`
asserts identical ordering), so Recall@1 will not move because of this change. Moving it requires a
semantic embedder (`remote-embedding` engine), which needs configuration and is untouched here.

## 5. Evaluation documents re-scoped

`docs/mcp-virtual-user-evaluation.md`: title changed to "Evaluation with AI-generated test
samples", a boxed scope statement at the top naming Recall@1 = 0.52 and FPR = 24 % as produced by a
non-human process and not citable externally as evidence of model effect or learning gains;
"virtual annotators / virtual raters" renamed to "rule-based scorers".
`docs/mcp-full-remediation-execution.md`: same boxed statement (Chinese) at the top.
`scripts/build-review-dataset.js`: comment and the `annotators` label in generated datasets updated.

```
$ grep -rn -i "virtual" docs/*.md scripts tests server | grep -v "VIRTUAL TABLE" | grep -v virtual-time-budget
(no output)
```

The filename `docs/mcp-virtual-user-evaluation.md` was deliberately not renamed: other documents
and PR #8's description link to it.

## 6. Branch protection

```
$ gh api -X POST repos/AIMaster-Studio/ai-master/rulesets --input ruleset.json
{"id":23658504,"name":"protect-master","enforcement":"active","rules":["deletion","non_fast_forward","pull_request","required_status_checks"]}
$ gh api repos/AIMaster-Studio/ai-master/rules/branches/master --jq '.[].type'
deletion  non_fast_forward  pull_request  required_status_checks     # required context: "Node 24 verification" (job name of workflow Verify), strict=true

# should-FAIL direction
$ git push origin _probe-direct-push:master
remote: error: GH013: Repository rule violations found for refs/heads/master.
remote: - Changes must be made through a pull request.
remote: - Required status check "Node 24 verification" is expected.
# should-PASS direction
$ git push origin _probe-direct-push:refs/heads/_probe-ruleset
 * [new branch]      _probe-direct-push -> _probe-ruleset          # then deleted
$ gh api repos/AIMaster-Studio/ai-master/branches/master --jq .commit.sha
5d25ec7bcba95304085fe83df0bbb7e5c71a3d8f                             # master untouched
```

Settings: 0 required approvals (single-maintainer repo; raise when a second reviewer exists), no
bypass actors — this includes the repository admin, so the ruleset applies to everyone.

## Delivered / verified / not done

| Step | Delivered | How verified | Not done |
| --- | --- | --- | --- |
| 1 | `release/production-a3b3c8c9`, tag `production-2026-09-18-a3b3c8c9` | tree hash equality, `diff-tree` empty, 5 live blobs `hash-object` SAME, GitHub API returns commit | server-side blobs cannot be fetched from the function; covered by tree identity + reported SHA (inference) |
| 2 | corrected `docs/mcp-production-release.md` | commands in §2 | Vercel dashboard rollback list not inspected (no Vercel CLI login on this host) |
| 3 | #8 ready, #7 closed, 17 branches deleted | compare API `ahead_by=0` for each; remaining branch list | `fix/ican-review-20260917` kept until #8 merges; local worktrees untouched |
| 4 | commit `a99036f`, tests both directions, CI green | §4 outputs | not deployed; `includeFiles` effect on Vercel unproven until deployment |
| 5 | scope statements, renames | grep in §5 | filename kept |
| 6 | ruleset 23658504 | rejected direct push, accepted branch push | approvals = 0 |

Local artifacts outside `docs/`: `.local/step4-baseline.log`, `.local/nft-trace.txt`,
`.local/pr7.diff`, `.local/ruleset.json` (gitignored).

