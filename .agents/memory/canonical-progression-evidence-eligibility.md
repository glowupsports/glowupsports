---
name: Canonical progression evidence eligibility
description: Rules that keep canonical Ability contributions deterministic, replay-safe, and separate from context or gate evidence.
---

Canonical Ability contributions may use only frozen `DELTA_ELIGIBLE` evidence sources in the core. Context-only, gate-only, legacy, and unverified sources never become Ability deltas. Conditional component-scored sources remain non-delta until their dedicated adapter can prove the required component-level evidence.

**Why:** A positive reliability coefficient alone does not mean evidence may alter Ability. Treating context, trials, or incomplete conditional sources as deltas would mix distinct progression concepts and make canonical state depend on unavailable source-specific validation.

**How to apply:** Preserve the two-transaction validation/application split. Validate eligibility, approved source evidence, confidence, and contribution idempotency before acceptance; revalidate them under the player lock before application. Contribution identity must remain independent of configuration version, and an idempotency no-op must not advance state/history or be recorded as applied.