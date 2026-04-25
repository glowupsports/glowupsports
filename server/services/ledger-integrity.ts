/**
 * Task #1338 — V2 ledger integrity refund helpers.
 *
 * Both helpers find unrefunded `consume` rows in `credit_ledger_v2` for a
 * given scope (a whole session, or a single session_player) and emit paired
 * `+abs(delta)` refund rows. They share the deterministic eventKey contract
 * documented in the task plan so re-runs (whether from the cron, the
 * backfill script, or the live code path) are always no-ops.
 *
 *   refundV2ConsumesForCancelledSession(sessionId)
 *     → eventKey: `cancelled-session-refund:<sessionPlayerId>`
 *     → ledger.reason: `refund_cancelled_session`
 *     Called from `storage.cancelSession` (fail-closed: errors propagate).
 *
 *   refundV2ConsumesForRemovedSessionPlayer(sessionId, sessionPlayerId, tx?)
 *     → eventKey: `player-removed-refund:<sessionPlayerId>`
 *     → ledger.reason: `refund_player_removed`
 *     Called from `storage.removePlayerFromSession` INSIDE a single
 *     `db.transaction` so the refund + delete are atomic. Pass the outer
 *     `tx` so refund writes ROLLBACK with the delete on any failure.
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
): Promise<RefundResult> {
  const stale = await db.execute(sql`
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
  `);

  return await processStaleRows(
    stale.rows as unknown as StaleConsumeRow[],
    {
      ledgerReason: "refund_cancelled_session",
      eventKeyPrefix: "cancelled-session-refund",
      sessionId,
    },
    null,
  );
}

export async function refundV2ConsumesForRemovedSessionPlayer(
  sessionId: string,
  sessionPlayerId: string,
  tx?: Tx,
): Promise<RefundResult> {
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
  `);

  return await processStaleRows(
    stale.rows as unknown as StaleConsumeRow[],
    {
      ledgerReason: "refund_player_removed",
      eventKeyPrefix: "player-removed-refund",
      sessionId,
    },
    tx ?? null,
  );
}

async function processStaleRows(
  rows: StaleConsumeRow[],
  cfg: {
    ledgerReason: "refund_cancelled_session" | "refund_player_removed";
    eventKeyPrefix: "cancelled-session-refund" | "player-removed-refund";
    sessionId: string | null;
  },
  tx: Tx | null,
): Promise<RefundResult> {
  let refunded = 0;
  let skipped = 0;
  for (const r of rows) {
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
