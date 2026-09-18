# Memory input boundaries — 2026-09-18

Resumed development. The preceding assistant statement that a browser security incident had been confirmed was not supported by recorded evidence and is not treated as an established incident. No credential-store reading or unrelated external data transfer is part of this work.

Verified GitHub Verify runs 35309711058 and 35309707955 succeeded for d43a24b. Added own-property validation for memory surfaces (rejecting inherited names such as __proto__, constructor and toString), applied surface validation to l1Dates, and enforced strict YYYY-MM-DD calendar validation before constructing L1 paths.

Four new tests exercise invalid surfaces, traversal-like dates, invalid calendar dates and leap-day reads in both local and SQL snapshot modes. npm run verify passed 174 tests and frontend structural checks. These are local tests, not remote persistence acceptance. Production was not changed.

Outstanding deployment work: align preview code source, enable snapshot flag only in Preview, verify actual remote writes, reconstruction after cold starts and concurrency. Full skills/agent persistence and independent real-user evidence remain pending.
