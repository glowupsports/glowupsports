---
name: Canonical progression audit immutability
description: Database-boundary rules for canonical decisions, frozen configuration, and audit provenance.
---

Canonical progression proposal inputs and provenance must never be rewritten or deleted after creation. The `development_decision` lifecycle may change only through its explicit terminal/status fields; frozen configuration, validations, evidence links, contributions, receipts, attempts, snapshots, histories, and recalibration events are insert-only.

**Why:** Canonical progression must be independently auditable. Mutable historical inputs, receipt records, or contribution records could make a later state look legitimate while changing the evidence or authorization basis that produced it.

**How to apply:** When extending the decision lifecycle, add only narrowly-scoped lifecycle fields to the database guard. Do not grant general updates or deletes to canonical decision/audit records. Keep current player state separately updateable only through the canonical executor.