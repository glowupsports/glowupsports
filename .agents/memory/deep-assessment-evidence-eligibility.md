---
name: Deep Assessment evidence eligibility
description: Fail-closed eligibility and replay rules for Deep Assessment observations entering canonical progression.
---

Deep Assessment evidence may enter canonical progression only when its active source skill has exactly one frozen, Ability-bearing canonical binding. The binding is an exact `source_skill_id` match; similarity, legacy scores, display names, or stored pairs are not substitutes. A capture token belongs to one canonicalized batch only, and historic observations must still prove source activity, binding, and assessment player/academy ownership at read/application time.

**Why:** The frozen production inventory currently has active Deep Assessment keys without proven canonical Ability bindings. Allowing approximate mappings or trusting stored snapshots would turn unverified legacy/corrupt input into canonical Ability changes.

**How to apply:** Keep bulk writes and Phase 3A/Phase 2 fail-closed until an authoritative crosswalk update proves each needed source. Never add mappings speculatively, and never bypass the shared revalidation path for historical observations.