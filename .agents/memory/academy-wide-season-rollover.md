---
name: Academy-wide season rollover
description: End Season is an academy-level transaction with source-season idempotency and immutable closing receipts.
---

End Season is an academy-wide rollover, not a per-player reset within the active season. A selected-player request is the trigger and reporting scope: eligible selected players must have an open enrollment in the source active season to be counted as processed. The next season enrolls every eligible academy player.

**Why:** A per-player reset skipped players who were already enrolled in the active season and could create ambiguous overlapping windows. A locked transition with one successor season preserves consistent academy-wide statistics and history.

**How to apply:** Keep season transitions serialized on the academy row; create a durable source-season/request idempotency record inside the same transaction. Close only source-season enrollments, capture signed credit and canonical attendance receipts before closing, and never change wallet balances during rollover. Closed enrollment end times and snapshots are immutable.