# Credit V1 Retirement — Inventory & Migration Plan

**Status:** Phase 1 of Task #826. Inventory only — no behaviour changes.
**Companion code:** `server/services/credit-engine-admin.ts` (new V2 writers).

This document maps every V1 (`credit_transactions`) write site and read site
that still exists in `server/`, and pairs each one with its V2
(`credit_ledger_v2` + `credit_lots` + `player_credit_balance`) replacement so
that Phases 2–5 can be implemented call-site by call-site without losing
coverage of any reason.

The ground truth for "which V1 reasons are still in use" comes from
`SELECT reason, COUNT(*) FROM credit_transactions GROUP BY reason` against
Supabase as of Apr 20 2026, plus a static scan of `server/`.

---

## 1. V1 reasons → V2 mapping

For each historical V1 `reason`, the table lists the legacy writer (file:line
of the `INSERT INTO credit_transactions` or the `db.insert(creditTransactions)`
call), the V2 writer that replaces it, and a deterministic `event_key` recipe
to keep Phase 3 backfill idempotent.

| V1 reason | V1 writer (file:line) | V2 writer | `event_key` recipe | Status |
|---|---|---|---|---|
| `package_purchased` | `routes/player-credits.ts:319` (via `storage.createCreditTransaction`, currently a stub no-op); `routes/player-booking.ts:4012`, `:4210` (legacy `package_purchase` invoice events) | `credit-engine.purchasePackage` (already exists) | `purchase:inv:<invoiceId>` or `purchase:pkg:<packageId>` | **Already mirrored** by the V2 short-circuit in `routes/player-credits.ts`; Phase 2 deletes the dead V1 call. |
| `session_consumed` | `storage.ts:13481` (`ensureCreditProcessed` legacy body) | `credit-engine.consumeCredit` | `consume:<sessionPlayerId>` | **Already mirrored** by the V2 short-circuit at the top of `ensureCreditProcessed`. Legacy body is dead code — Phase 2 deletes it. |
| `session_debt` | `storage.ts:3115` (package-deleted debt convert), `storage.ts:13371` (`ensureCreditProcessed` no-package branch) | `credit-engine.consumeCredit` (debt is the natural negative-balance outcome of a consume with no lot coverage; metadata `debt > 0`) | `consume:<sessionPlayerId>` | **Already mirrored** for the `ensureCreditProcessed` path. The `convertPackageConsumptionToDebt` post-commit hook becomes obsolete in Phase 2 (V2 lots track depletion natively). |
| `session_join` | `storage.ts:7599`, `:7791`, `:8606` (`consumeCreditsForClassSession` / `consumeCreditForSession` legacy body) | `credit-engine.consumeCredit` | `consume:<sessionPlayerId>` | **Already mirrored** by the V2 short-circuit (`storage.ts:7487`). Legacy body deletion in Phase 2. |
| `session_join_debt` | `storage.ts:7760`, `:8702`, `:8852` (debt fallback when no package) | `credit-engine.consumeCredit` (negative balance) | `consume:<sessionPlayerId>` | **Already mirrored**. Same Phase-2 deletion. |
| `session_unpaid` | `storage.ts:7760` (legacy debt variant) | `credit-engine.consumeCredit` (negative balance) | `consume:<sessionPlayerId>` | **Already mirrored**. Phase-2 deletion. |
| `session_booking` | `storage.ts:3357` (via `createCreditTransaction` stub — no-op today) | `credit-engine.consumeCredit` | `consume:<sessionPlayerId>` | **Already mirrored**. Phase 2 deletes the stub call site. |
| `retrospective_settlement` | `storage.ts:8203` (the only `db.insert(creditTransactions)` left) | `credit-engine-admin.recordSettlement` (new) — applies a `consume` against an existing debt that was settled by a freshly-purchased package | `settlement:retrospective:<sessionPlayerId>` | **Needs new V2 writer** (added in Phase 1). |
| `debt_settlement` | `storage.ts:3697` (via `createCreditTransaction` stub — no-op today) | `credit-engine-admin.recordSettlement` | `settlement:debt:<debtSourceId>` (debtSourceId = original V1 row id, or the consume ledger id post-cutover) | **Needs new V2 writer** (added in Phase 1). |
| `attendance_correction_deduct` | `routes/player-progress.ts:1525` (path is dual: V2 `consumeCredit` is invoked, but old V1 INSERT is still present in legacy branches) | `credit-engine.consumeCredit` (with `eventKey: consume:attendance-correction:<sessionPlayerId>:<ts>`) | `consume:attendance-correction:<spId>:<isoCorrectionTs>` | **Already mirrored** in routes/player-progress.ts; Phase 2 confirms no V1 fallback remains. |
| `attendance_correction_refund` | `routes/player-progress.ts:1521` | `credit-engine.refundCredit` (with `eventKey: refund:attendance-correction:<spId>:<ts>`) | `refund:attendance-correction:<spId>:<isoCorrectionTs>` | **Already mirrored**. Phase 2 cleanup. |
| `refund` | `pushNotifications.ts` cancellation paths; `storage.ts:3704` (`session_removal_refund`, see below) | `credit-engine.refundCredit` | `refund:<sessionPlayerId>` | **Already mirrored** for cancellation; the explicit `refund` reason itself is now produced by V2 only. |
| `refund_reversal` | (legacy admin path; no current writer in `server/` — historical only) | `credit-engine-admin.recordRefundReversal` (new) | `refund_reversal:<sourceRefundLedgerId>` | **Needs new V2 writer** (added in Phase 1) — purely for backfill of historical rows. |
| `session_removal_refund` | `storage.ts:3704` (via `createCreditTransaction` stub — no-op today) | `credit-engine.refundCredit` (`policy: 'force'`, `reason: 'session_removal'`) | `refund:session-removal:<sessionPlayerId>` | **Already mirrored**; Phase 2 deletes the stub call. |
| `session_type_change` | `storage.ts:12942` (via `createCreditTransaction` stub — no-op today) | `credit-engine-admin.recordSessionTypeChange` (new) — issues a `refund` of the old type and a `consume` of the new type, both atomic | `session_type_change:<sessionId>:<playerId>:<isoChangeTs>` | **Needs new V2 writer** (added in Phase 1). |
| `late_cancellation` | (legacy; no live writer in `server/` — historical only) | `credit-engine-admin.recordLateCancellation` (new — records a no-refund sentinel) | `late_cancellation:<sessionPlayerId>` | **Needs new V2 writer** (added in Phase 1) for backfill. |
| `package_deleted_refund` | `storage.ts:3115` neighbour path | `credit-engine.refundCredit` (`policy: 'force'`) | `refund:package-deleted:<sourcePackageId>:<sessionPlayerId>` | **Already mirrored** via existing refund machinery. |
| `balance_correction` | (admin-only legacy; no live writer in `server/` — historical only) | `credit-engine-admin.recordBalanceCorrection` (new — wraps `manualAdjustment`) | `balance_correction:<academyId>:<playerId>:<isoTs>` | **Needs new V2 writer** (added in Phase 1) for backfill. |
| `ghost_credit_correction` | `pushNotifications.ts:1954` (sentinel) | `credit-engine-admin.recordGhostCreditCorrection` (new) | `ghost_credit_correction:<sessionPlayerId>` | **Needs new V2 writer** (added in Phase 1). |

### Quick legend

- **Already mirrored** — V2 already writes the equivalent row at the same call
  site (typically because the file was wrapped in a V2 short-circuit during
  Tasks #646/#682/#684/#685). Phase 2 just deletes the now-dead V1 leg.
- **Needs new V2 writer** — A typed helper in
  `server/services/credit-engine-admin.ts` covers it; Phase 2 swaps the call
  site, Phase 3 backfill replays historical rows through the same helper.

### Out of scope reasons

`corporate_credit_transactions` is a separate ledger and is **not** part of
this retirement (per task spec).

---

## 2. V1 reader sites → V2 replacement

Every read of `credit_transactions` in `server/`. "Replacement" assumes V1 is
fully retired and lists the equivalent V2 query Phase 4 will swap in.

| File:line | Purpose | V2 replacement |
|---|---|---|
| `storage.ts:3020` | `convertPackageConsumptionToDebt` — find prior consumes for a deleted package | `credit_lots WHERE source_package_id = $pkg AND status IN ('active','depleted')` joined to `credit_ledger_v2 WHERE reason='consume' AND lot_id = lots.id`. Becomes obsolete in Phase 2 once `convertPackageConsumptionToDebt` itself is deleted. |
| `storage.ts:3075` | Same convert path — list session_player rows with prior bookings/consumes | Same `credit_lots` + `credit_ledger_v2` join. Obsolete after Phase 2. |
| `storage.ts:3606` | `cancelSessionDebt` — lookup legacy session-debt row | `credit_ledger_v2 WHERE session_player_id = $sp AND reason='consume' AND (metadata->>'debt')::numeric > 0` |
| `storage.ts:7922` | `getDebtTransactions` — list outstanding debts for a player | `credit_ledger_v2` rows with negative balance not yet covered by a later positive lot allocation; surfaced via the player_credit_balance helper. |
| `storage.ts:8028` | `repairAllPlayerCredits` debt scan | Same as above. |
| `storage.ts:8183` | `settlePlayerDebts` — find debts to settle | `credit_ledger_v2` debt rows + `credit-engine-admin.recordSettlement` per row. |
| `storage.ts:8636`, `:8804` | Idempotency probe before INSERT | Replaced by `credit_ledger_v2_event_key_unique` 23505 detection (already inside `credit-engine.consumeCredit`). |
| `storage.ts:12669`, `:12700`, `:12732` | Player-credit summary queries | `credit_ledger_v2` aggregates by `(player_id, academy_id, type)` — `getBalance` helper covers it. |
| `storage.ts:13160`, `:13330`, `:13422` | `ensureCreditProcessed` legacy probes | Dead code after Phase 2 (V2 short-circuit handles the whole path). |
| `storage.ts:13590`, `:13637`, `:13650`, `:13659`, `:13699`, `:13744`, `:13802` | Idempotency probes inside legacy `ensureCreditProcessed` body | Dead code after Phase 2 — body deleted entirely. |
| `storage.ts:13887` | `repairMissingSessionPlayers` retry probe | `credit_ledger_v2 WHERE session_player_id = $sp AND reason='consume'`. |
| `storage.ts:14080`, `:14091` | `fullCreditRebuildForAcademy` debt-balance recompute | `credit_ledger_v2` per-player aggregates (`getBalance`). |
| `storage.ts:14285` | `DELETE FROM credit_transactions` — academy reset | After Phase 5, replaced by `DELETE FROM credit_ledger_v2 WHERE academy_id = $1; DELETE FROM credit_lots WHERE academy_id = $1; DELETE FROM player_credit_balance WHERE academy_id = $1;`. |
| `pushNotifications.ts:1620` | Removal-refund idempotency probe | `credit_ledger_v2 WHERE session_id = $1 AND player_id = $2 AND reason='refund' AND (metadata->>'reason')='session_removal'` |
| `pushNotifications.ts:1630–2010` (8 reads) | Cancellation / debt-refresh / nudge queries | Equivalent `credit_ledger_v2` queries; the `session_debt`/`session_join_debt`/`session_unpaid` reasons all collapse to "consume rows where `(metadata->>'debt')::numeric > 0`" in V2. |
| `pushNotifications.ts:2733` | Drizzle select — outstanding debts | Same — `credit_ledger_v2` debt aggregate. |
| `index.ts:1051` | `DELETE FROM credit_transactions WHERE …debt reasons` (academy reset variant) | After Phase 5, becomes a `DELETE FROM credit_ledger_v2 WHERE …reason='consume' AND (metadata->>'debt')::numeric > 0`. |
| `index.ts:1328` | `WHERE ct.reason IN (…)` aggregate for player snapshot | V2 aggregate query against `credit_ledger_v2`. |
| `routes/player-progress.ts:1304` | Attendance-history fallback table | V2 `credit_ledger_v2` per-session lookup. |
| `routes/player-social.ts:2389`, `:2497` | Drizzle select for player-side debt views (V3 path) | `credit_ledger_v2` debt aggregate. |
| `routes/player-social.ts:2669`, `:2877`, `:3130` | Player social feed counters | V2 `credit_ledger_v2` aggregates. |
| `routes/routes.ts:881` (already reads V2) | — | already V2 |

After Phase 4, the only remaining `FROM credit_transactions` reads are
expected to be:

- `scripts/backfill-v1-to-v2.ts` (new in Phase 3 — reads V1 to write V2)
- `scripts/credit-replay.ts`, `scripts/repair-merged-player-ledger.ts`,
  `scripts/reconcile-double-debits.ts` (forensic scripts that intentionally
  inspect V1 history)

---

## 3. Watchdog assertions (Phase 4 extension)

The Phase 4 extension to `computeCreditDrift` must, per academy, assert:

1. `SUM(v1.amount WHERE NOT cancelled) == SUM(v2.delta)` per
   `(player_id, credit_type)`.
2. Every V1 row with `amount<0`, non-cancelled, non-null `session_player_id`
   has a matching V2 row with the same `session_player_id` and `reason='consume'`.
3. Every V1 `package_purchased` row has a matching V2 `purchase` row with
   `metadata->>'sourcePackageId' = v1.package_id` (or matching `event_key`
   `purchase:pkg:<id>`).
4. Every V1 `refund*` row has a matching V2 `refund` row (matched by
   `session_player_id`).

The master audit query in the task spec is the human-readable form of (1).

---

## 4. Idempotency contract for the new admin writers

Each helper added in `server/services/credit-engine-admin.ts` follows the
same contract as `credit-engine.purchasePackage`/`consumeCredit`/etc.:

- Accepts an explicit `eventKey` override; otherwise derives a deterministic
  one from the source-event identifiers (see the recipes in §1).
- Inserts exactly one `credit_ledger_v2` row inside a transaction.
- The unique index `credit_ledger_v2_event_key_unique` makes a duplicate
  insert raise Postgres error `23505`; the helper catches it and returns
  `{ alreadyApplied: true }` with no balance mutation.
- Returns `{ ok: true, alreadyApplied: false, newBalance }` on first
  application.
- Re-application with the same `eventKey` is a strict no-op.

This contract lets Phase 3's backfill script replay every historical V1 row
through the appropriate helper without double-counting, and lets the Phase 2
dual-write window run safely while V1 inserts are still active.

---

## 5. Phase-by-phase exit criteria

(Repeated from `.local/tasks/task-826.md` for quick reference.)

- **Phase 1 (this PR):** doc exists, new writers exist with idempotency
  tests, no call sites changed.
- **Phase 2:** `git grep -E 'INSERT INTO credit_transactions|insert\(creditTransactions'`
  returns 0 matches under `server/`.
- **Phase 3:** master audit query returns 0 rows for every academy.
- **Phase 4:** `git grep -E 'FROM credit_transactions|from\(creditTransactions'`
  returns matches only in `scripts/` forensic tools.
- **Phase 5:** table renamed to `credit_transactions_legacy`, freeze trigger
  in place, schema export removed, `replit.md` updated.
