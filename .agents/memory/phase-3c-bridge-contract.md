---
name: Phase 3C bridge contract boundary
description: Why the Phase 3B interpretation cannot yet be losslessly adapted to the frozen Phase 2 canonical executor.
---

Do not adapt a Phase 3B AI interpretation into a Phase 2 `CanonicalDecisionInput` until the server-owned source contract carries every required trusted observation field: source system, event/session identity, observation window, frozen source type, observed and required observation counts, occurred-at, benchmark relevance, and verified observer identities.

**Why:** Phase 3A evidence currently exposes approved-evidence metadata and mappings, but the underlying evidence source does not retain several mandatory Phase 2 quality/aggregation inputs. Filling them from capture type, timestamps, review metadata, or model output would invent scoring inputs and alter frozen Phase 2 semantics.

**How to apply:** Treat this as an integrity boundary. Add a lossless trusted evidence-capture contract before implementing the Phase 3C adapter; then let the existing Phase 2 proposal and executor remain the only canonical decision/scoring writers.