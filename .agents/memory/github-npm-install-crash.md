---
name: GitHub npm install crash
description: GitHub Actions dependency installation can fail inside npm before project validation commands start.
---

GitHub Actions may terminate dependency installation with npm's own `Exit handler never called!` error after roughly a minute of package extraction.

**Why:** The failure reproduced across Node 20 and Node 22, with both clean and ordinary npm installs, and with lifecycle scripts, audit, and funding disabled. All lint, split typechecks, and test suites passed in the Replit environment, while GitHub never reached those commands.

**How to apply:** When this signature appears, treat the run as an install-layer failure rather than a lint/test/typecheck result. Inspect the failed step boundaries first, and prefer investigating the lockfile/package-manager path over repeatedly changing project checks.