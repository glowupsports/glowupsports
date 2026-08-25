---
name: Deep Assessment evidence eligibility
description: Fail-closed eligibility and replay rules for Deep Assessment observations entering canonical progression.
---

Legacy Deep Assessment evidence may enter canonical progression only when its active source skill has exactly one frozen, Ability-bearing canonical binding. The binding is an exact `source_skill_id` match; similarity, legacy scores, display names, or stored pairs are not substitutes. A capture token belongs to one canonicalized batch only, and historic observations must still prove source activity, binding, and assessment player/academy ownership at read/application time.

A canonical-native Deep Assessment capture is a separate provenance path, not a legacy mapping escape hatch. It must name one exact frozen Ability benchmark/component/atomic-skill triple and carry a complete, immutable server-validated observation under the active frozen configuration. It can use the established coach observation protocol for frozen quality math, while its source provenance remains canonical-native.

**Why:** The frozen production inventory currently has active Deep Assessment keys without proven canonical Ability bindings. Allowing approximate mappings or trusting stored snapshots would turn unverified legacy/corrupt input into canonical Ability changes.

**How to apply:** Keep legacy bulk writes and Phase 3A/Phase 2 fail-closed until an authoritative crosswalk update proves each needed source. Never add legacy mappings speculatively, never let a native capture derive identifiers from legacy semantics, and never bypass shared read/application-time revalidation or database append-only guards.