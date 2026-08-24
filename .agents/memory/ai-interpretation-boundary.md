---
name: AI interpretation boundary
description: Safety boundary between the AI coaching interpreter and canonical progression execution.
---

Phase 3B AI coaching produces a versioned, validated interpretation record only. It is not a `DevelopmentDecision`, does not invoke the canonical executor, and must not write canonical current state, history, evidence contributions, or application receipts.

**Why:** Provider output is untrusted and can be malformed, fabricated, stale, or scoped to the wrong player or academy. Separating interpretation from execution preserves auditability without granting a language model progression-write authority.

**How to apply:** Feed the model only a server-assembled Phase 3A context; bind and validate its player, academy, state/config versions, canonical skills, benchmarks, ranges, and evidence IDs against that exact context. Store request idempotency, hashes, model/prompt/context versions, result, and diagnostics in additive evaluation provenance. Any future bridge must consume only separately reviewed/validated records and retain this boundary.