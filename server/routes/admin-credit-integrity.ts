/**
 * Task #1338 — Admin V2 ledger integrity monitor.
 *
 * GET /api/admin/credit-ledger-integrity
 *   Returns the live counts (and a small sample) of stale `consume` ledger
 *   rows that the daily maintenance cron will flag in Sentry. Used to
 *   visually confirm "0 / 0" after the backfill, and to debug if either
 *   counter ever creeps back above zero.
 *
 *   Auth: platform_owner only.
 */

import { Router, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  type AuthenticatedRequest,
} from "../auth";

const REFUND_REASONS_SQL = sql`(
  'refund',
  'refund_cancelled_session',
  'refund_attendance_correction',
  'refund_player_removed',
  'refund_orphan_consume'
)`;

export interface LedgerIntegrityReport {
  stale_cancelled_count: number;
  ghost_orphan_count: number;
  examples: {
    cancelled_session: {
      ledger_id: string;
      player_id: string;
      academy_id: string;
      type: string;
      delta: number;
      session_id: string | null;
      session_player_id: string | null;
      occurred_at: string;
    }[];
    ghost_orphan: {
      ledger_id: string;
      player_id: string;
      academy_id: string;
      type: string;
      delta: number;
      session_id: string | null;
      session_player_id: string | null;
      occurred_at: string;
    }[];
  };
}

interface RawExampleRow {
  ledger_id: string;
  player_id: string;
  academy_id: string;
  type: string;
  delta: string | number;
  session_id: string | null;
  session_player_id: string | null;
  occurred_at: string | Date;
}

function normalizeExample(r: RawExampleRow) {
  return {
    ledger_id: r.ledger_id,
    player_id: r.player_id,
    academy_id: r.academy_id,
    type: r.type,
    delta: Number(r.delta),
    session_id: r.session_id,
    session_player_id: r.session_player_id,
    occurred_at:
      r.occurred_at instanceof Date
        ? r.occurred_at.toISOString()
        : String(r.occurred_at),
  };
}

/**
 * Run the two integrity probes against credit_ledger_v2 and return counts +
 * up to `sampleLimit` example rows for each bug. Exported so the daily
 * maintenance cron can call it without re-implementing the queries.
 */
export async function computeLedgerIntegrityReport(
  sampleLimit = 10,
): Promise<LedgerIntegrityReport> {
  const [staleCancelled, ghostOrphan, sampleA, sampleB] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM credit_ledger_v2 l
      JOIN sessions s         ON s.id = l.session_id
      JOIN session_players sp ON sp.id = l.session_player_id
      WHERE l.reason = 'consume'
        AND l.delta < 0
        AND s.status = 'cancelled'
        AND sp.attendance_status = 'present'
        AND NOT EXISTS (
          SELECT 1 FROM credit_ledger_v2 r
          WHERE r.session_player_id = l.session_player_id
            AND r.delta > 0
            AND r.reason IN ${REFUND_REASONS_SQL}
        )
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM credit_ledger_v2 l
      WHERE l.reason = 'consume'
        AND l.delta < 0
        AND l.session_player_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM session_players sp WHERE sp.id = l.session_player_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM credit_ledger_v2 r
          WHERE r.session_player_id = l.session_player_id
            AND r.delta > 0
            AND r.reason IN ${REFUND_REASONS_SQL}
        )
    `),
    db.execute(sql`
      SELECT
        l.id              AS ledger_id,
        l.player_id       AS player_id,
        l.academy_id      AS academy_id,
        l.type            AS type,
        l.delta::numeric  AS delta,
        l.session_id      AS session_id,
        l.session_player_id AS session_player_id,
        l.occurred_at     AS occurred_at
      FROM credit_ledger_v2 l
      JOIN sessions s         ON s.id = l.session_id
      JOIN session_players sp ON sp.id = l.session_player_id
      WHERE l.reason = 'consume'
        AND l.delta < 0
        AND s.status = 'cancelled'
        AND sp.attendance_status = 'present'
        AND NOT EXISTS (
          SELECT 1 FROM credit_ledger_v2 r
          WHERE r.session_player_id = l.session_player_id
            AND r.delta > 0
            AND r.reason IN ${REFUND_REASONS_SQL}
        )
      ORDER BY l.occurred_at DESC, l.id ASC
      LIMIT ${sampleLimit}
    `),
    db.execute(sql`
      SELECT
        l.id              AS ledger_id,
        l.player_id       AS player_id,
        l.academy_id      AS academy_id,
        l.type            AS type,
        l.delta::numeric  AS delta,
        l.session_id      AS session_id,
        l.session_player_id AS session_player_id,
        l.occurred_at     AS occurred_at
      FROM credit_ledger_v2 l
      WHERE l.reason = 'consume'
        AND l.delta < 0
        AND l.session_player_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM session_players sp WHERE sp.id = l.session_player_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM credit_ledger_v2 r
          WHERE r.session_player_id = l.session_player_id
            AND r.delta > 0
            AND r.reason IN ${REFUND_REASONS_SQL}
        )
      ORDER BY l.occurred_at DESC, l.id ASC
      LIMIT ${sampleLimit}
    `),
  ]);

  return {
    stale_cancelled_count: Number(
      (staleCancelled.rows[0] as { n: string | number }).n,
    ),
    ghost_orphan_count: Number(
      (ghostOrphan.rows[0] as { n: string | number }).n,
    ),
    examples: {
      cancelled_session: (sampleA.rows as unknown as RawExampleRow[]).map(
        normalizeExample,
      ),
      ghost_orphan: (sampleB.rows as unknown as RawExampleRow[]).map(
        normalizeExample,
      ),
    },
  };
}

const router = Router();

router.get(
  "/api/admin/credit-ledger-integrity",
  authMiddleware,
  requireRole("platform_owner"),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const report = await computeLedgerIntegrityReport(10);
      res.json(report);
    } catch (err) {
      console.error("[admin-credit-integrity] failed:", err);
      res.status(500).json({ error: "ledger_integrity_query_failed" });
    }
  },
);

export default router;
