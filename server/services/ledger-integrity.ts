/**
 * Task #1338 — V2 ledger integrity refund helpers.
 *
 * Both helpers find unrefunded `consume` rows in `credit_ledger_v2` for a
 * given scope (a whole session, or a single session_player) and emit paired
 * `+abs(delta)` refund rows. They share the deterministic eventKey contract
 * documented in the task plan so re-runs (whether from the cron, the
 * backfill script, or the live code path) are always no-ops.
 *
 * B3-P0 canonical event key — BOTH refund paths use the same event key
 * format so the credit_ledger_v2_event_key_unique constraint acts as the
 * final guard against double-refunds:
 *
 *   refundV2ConsumesForCancelledSession(sessionId)
 *     → eventKey: `session-player-refund:<sessionPlayerId>`
 *     → ledger.reason: `refund_cancelled_session`   (audit trail only)
 *
 *   refundV2ConsumesForRemovedSessionPlayer(sessionId, sessionPlayerId, tx?)
 *     → eventKey: `session-player-refund:<sessionPlayerId>`
 *     → ledger.reason: `refund_player_removed`      (audit trail only)
 *
 * If both paths race to refund the same session_player consume row, the
 * second INSERT will hit the unique index and raise a DuplicateEventError
 * that processStaleRows already handles as `skipped`. The ledger.reason in
 * the winning row records which path actually applied the refund.
 *
 * Called from `storage.cancelCoachSessionAtomic`, `cancelSession`, and
 * `removePlayerFromSession`. The outer tx is forwarded so writes rollback
 * atomically with the rest of the cancel / remove transaction.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  manualAdjustment,
  manualAdjustmentTx,
  type CreditType,
} from "./credit-engine";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const REFUND_REASONS_SQL = sql`(
  'refund',
  'refund_cancelled_session',
  'refund_attendance_correction',
  'refund_player_removed',
  'refund_orphan_consume'
)`;

interface StaleConsumeRow {
  ledger_id: string;
  player_id: string;
  academy_id: string;
  type: string;
  delta: string | number;
  session_player_id: string;
}

export interface RefundResult {
  refunded: number;
  skipped: number;
}

export async function refundV2ConsumesForCancelledSession(
  sessionId: string,
  tx?: Tx,
): Promise<RefundResult> {
  // Accept an optional transaction so callers inside a db.transaction() can
  // include the V2 refund atomically with the rest of the cancellation work.
  // B3-P0 residual: FOR UPDATE OF l acquires a row-level lock on every
  // unrefunded consume row before processStaleRows writes refunds.
  // Without this, a concurrent removePlayerFromSession can SELECT the same
  // consume rows (unrefunded at that instant) and emit a second refund under
  // a different event key prefix, producing a double-credit despite per-path
  // idempotency.  With FOR UPDATE, the second operation blocks until the first
  // commits; it then re-evaluates NOT EXISTS and finds the refund already
  // applied → skips the row.
  // Important: must be called inside an outer transaction (tx must be set)
  // so the lock is released atomically with the refund insert.
  const exec = tx ?? db;
  const stale = await exec.execute(sql`
    SELECT
      l.id                AS ledger_id,
      l.player_id         AS player_id,
      l.academy_id        AS academy_id,
      l.type              AS type,
      l.delta             AS delta,
      l.session_player_id AS session_player_id
    FROM credit_ledger_v2 l
    JOIN session_players sp ON sp.id = l.session_player_id
    WHERE l.reason = 'consume'
      AND l.delta < 0
      AND sp.session_id = ${sessionId}
      AND NOT EXISTS (
        SELECT 1 FROM credit_ledger_v2 r
        WHERE r.session_player_id = l.session_player_id
          AND r.delta > 0
          AND r.reason IN ${REFUND_REASONS_SQL}
      )
    FOR UPDATE OF l
  `);

  return await processStaleRows(
    stale.rows as unknown as StaleConsumeRow[],
    {
      ledgerReason: "refund_cancelled_session",
      // B3-P0: canonical event key shared with refundV2ConsumesForRemovedSessionPlayer
      // so the unique index acts as the single-refund-per-sp_id guard.
      eventKeyPrefix: "session-player-refund",
      sessionId,
    },
    tx ?? null,
  );
}

export async function refundV2ConsumesForRemovedSessionPlayer(
  sessionId: string,
  sessionPlayerId: string,
  tx?: Tx,
): Promise<RefundResult> {
  // B3-P0 residual: FOR UPDATE OF l — same serialisation rationale as
  // refundV2ConsumesForCancelledSession.  Prevents the cancel-and-remove
  // double-refund race where both paths SELECT the same unrefunded consume
  // row before either has committed a refund row.
  const exec = tx ?? db;
  const stale = await exec.execute(sql`
    SELECT
      l.id                AS ledger_id,
      l.player_id         AS player_id,
      l.academy_id        AS academy_id,
      l.type              AS type,
      l.delta             AS delta,
      l.session_player_id AS session_player_id
    FROM credit_ledger_v2 l
    WHERE l.session_player_id = ${sessionPlayerId}
      AND l.reason = 'consume'
      AND l.delta < 0
      AND NOT EXISTS (
        SELECT 1 FROM credit_ledger_v2 r
        WHERE r.session_player_id = l.session_player_id
          AND r.delta > 0
          AND r.reason IN ${REFUND_REASONS_SQL}
      )
    FOR UPDATE OF l
  `);

  return await processStaleRows(
    stale.rows as unknown as StaleConsumeRow[],
    {
      ledgerReason: "refund_player_removed",
      // B3-P0: canonical event key — same prefix as refundV2ConsumesForCancelledSession
      // so both paths share the unique index guard (see module header).
      eventKeyPrefix: "session-player-refund",
      sessionId,
    },
    tx ?? null,
  );
}

async function processStaleRows(
  rows: StaleConsumeRow[],
  cfg: {
    ledgerReason: "refund_cancelled_session" | "refund_player_removed";
    // B3-P0: canonical event key — both paths now use "session-player-refund"
    eventKeyPrefix: "session-player-refund";
    sessionId: string | null;
  },
  tx: Tx | null,
): Promise<RefundResult> {
  // B3-P1 deadlock prevention: sort by (player_id, type) before acquiring
  // per-player balance locks inside manualAdjustmentTx.  All concurrent
  // multi-player refund loops therefore try to lock balance rows in the same
  // canonical order, eliminating the A→B / B→A lock cycle.
  const sortedRows = [...rows].sort((a, b) => {
    if (a.player_id < b.player_id) return -1;
    if (a.player_id > b.player_id) return 1;
    if (a.type < b.type) return -1;
    if (a.type > b.type) return 1;
    return 0;
  });
  let refunded = 0;
  let skipped = 0;
  for (const r of sortedRows) {
    const eventKey = `${cfg.eventKeyPrefix}:${r.session_player_id}`;
    const input = {
      playerId: r.player_id,
      academyId: r.academy_id,
      type: r.type as CreditType,
      delta: Math.abs(Number(r.delta)),
      reason: cfg.ledgerReason,
      ledgerReason: cfg.ledgerReason,
      actorId: "system",
      actorRole: "system" as const,
      eventKey,
      sessionId: cfg.sessionId,
      sessionPlayerId: r.session_player_id,
    };
    try {
      if (tx) {
        // Inside an outer transaction — DuplicateEventError is intentionally
        // not swallowed by `manualAdjustmentTx`. Re-runs of the same delete
        // (which is rare — the outer caller already locked the row) are
        // treated as "already applied" so the outer caller can still proceed.
        try {
          await manualAdjustmentTx(tx, input);
          refunded++;
        } catch (err) {
          if (err instanceof Error && err.name === "DuplicateEventError") {
            skipped++;
          } else {
            throw err;
          }
        }
      } else {
        const result = await manualAdjustment(input);
        if (result.alreadyApplied) skipped++;
        else refunded++;
      }
    } catch (err) {
      console.error(
        `[ledger-integrity] failed to refund ledger row ${r.ledger_id} (sp=${r.session_player_id}, reason=${cfg.ledgerReason}):`,
        err,
      );
      throw err;
    }
  }
  return { refunded, skipped };
}
