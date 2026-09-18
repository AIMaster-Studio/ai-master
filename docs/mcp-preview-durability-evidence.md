# Preview cross-deployment durability evidence — 2026-09-18

Deployment chain on 433525/ai-master-backend branch preview/persistence-4d0ce59, all with the tree of tested source commit 4d0ce59:
091a57a (first, Ready 27s) then ec4947c then 87c15fd, both reported "Deployment has completed" state success via the commit status API.

## Same-deployment concurrency

Eight parallel memory/inspect requests against one deployment all observed the freshly written preference: parallelConsistentReads 8 of 8.

## Cross-deployment durability

First attempt used a new deployment-specific hostname and reported survivedNewDeployment=false. That was NOT data loss: memory is scoped per visitor session, and a different hostname yields a different session cookie, so the read targeted a different scope. Re-ran correctly on the stable branch alias ai-master-backend-git-preview-persistence-4d0ce59-433525.vercel.app: wrote the marker, pushed and deployed 87c15fd, then from the same session read the marker back with survivedRedeploy=true and root=remote-database. Test data was cleared afterwards (cleanedUp=true).

Conclusion supported by evidence: RAG and memory snapshots are actually stored in the remote Turso database in Preview and survive redeployment of the serverless functions, for the same session scope.

Still unproven: multi-session or multi-user concurrent writes to the same scope, snapshot growth under a fully seeded course library, cloud RAG seeding and search quality, skills and agent durability which remain ephemeral by design, and any production behaviour. Preview has no model key configured, so no generation paths were exercised. Production remains untouched on 49a2301.
