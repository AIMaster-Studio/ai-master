# Vercel free preview database provisioned — 2026-09-18

User explicitly consented through the clarification UI to Turso integration terms/account sharing, limited to a free plan. Accepted terms, verified Starter is $0/month, and created ai-master-preview via Vercel Marketplace. Region: default US East (Virginia), iad1. Displayed free quotas: 100 databases, 5GB total storage, 500M monthly rows read, 10M monthly rows written. No paid/overage plan chosen.

Provisioning screen explicitly confirmed the database was ready and successfully created. Connected it to ai-master-backend with ONLY Preview selected, Sensitive enabled, no custom variable prefix and no automatic database branching selected. First attempt to uncheck a hidden custom checkbox timed out; clicking its visible label then asserting Preview-only succeeded. Connected badge was observed.

Read-only follow-up verified variable NAMES only: Preview has TURSO_AUTH_TOKEN and TURSO_DATABASE_URL; Production has DEEPSEEK_API_KEY. No values were revealed or copied. Important next code task: existing runtime expects TURSO_URL, but integration injects TURSO_DATABASE_URL; support/validate the alias before preview deployment. No production database or production variables changed. No deployment triggered. Browser authentication is verified; CLI authentication remains separate/unverified.

Database provisioning is complete, but RAG/memory remote round-trip, actual cold starts and full persistence are not verified. Existing Vercel project repository mismatch remains open. Keep preview database separate from future production data. Use of the free plan does not mean unlimited capacity.
