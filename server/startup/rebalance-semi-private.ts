/**
 * Task #1510 — Startup watchdog for un-rebalanced semi-private credit charges.
 *
 * Problem: `consumeCredit` calls `rebalanceSemiPrivateCharges` *after* its own
 * transaction commits. If the server crashes between that commit and the
 * rebalance call, the rebalance is silently skipped and the first player keeps
 * an incorrect "private" charge instead of the cheaper "semi_private" one.
 *
 * Fix: On every boot, scan for sessions where:
 *   - The coaching_series is semi_private
 *   - At least 2 players attended (present or late) — the rebalance trigger condition
 *   - At least one attendee has a V2 consume ledger row typed "private"
 *   - No rebalance refund event_key exists for that session_player yet
 *
 * For each affected session, call `rebalanceSemiPrivateCharges`. The function
 * is idempotent via unique event_keys so repeated calls are always safe.
 *
 * Results are logged with session IDs and player IDs for auditability.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { rebalanceSemiPrivateCharges } from "../services/credit-engine";

interface PendingRebalanceSession {
  session_id: string;
  academy_id: string;
  credit_cost: string | number;
}

/**
 * Scan the ledger for sessions that were never rebalanced after a crash,
 * then trigger `rebalanceSemiPrivateCharges` for each one.
 *
 * Never throws — any error is caught and logged so startup is never blocked.
 */
export async function repairUnrebalancedSemiPrivateCharges(): Promise<void> {
  const tag = "[SemiPrivateRebalanceRepair]";
  try {
    // Find every session that:
    //   1. Belongs to a semi_private coaching_series
    //   2. Has ≥2 attendees (the condition that triggers rebalance in consumeCredit)
    //   3. Has at least one session_player charged as "private" in V2
    //   4. Has NOT yet been rebalanced (no refund event_key for that sp)
    const pendingResult = await db.execute(sql`
      SELECT DISTINCT
        s.id         AS session_id,
        s.academy_id AS academy_id,
        COALESCE(s.credit_cost, 1) AS credit_cost
      FROM sessions s
      JOIN coaching_series cs ON cs.id = s.series_id
      JOIN session_players sp ON sp.session_id = s.id
        AND sp.attendance_status IN ('present', 'late')
      JOIN credit_ledger_v2 lv
        ON lv.session_player_id = sp.id
       AND lv.reason = 'consume'
       AND lv.type = 'private'
      WHERE cs.session_type = 'semi_private'
        AND NOT EXISTS (
          SELECT 1 FROM credit_ledger_v2
           WHERE event_key = 'rebalance:private_to_semi:refund:' || sp.id::text
        )
        AND (
          SELECT COUNT(*)
          FROM session_players sp2
          WHERE sp2.session_id = s.id
            AND sp2.attendance_status IN ('present', 'late')
        ) >= 2
    `);

    const sessions = pendingResult.rows as unknown as PendingRebalanceSession[];

    if (sessions.length === 0) {
      console.log(`${tag} No un-rebalanced semi-private sessions found — skipping`);
      return;
    }

    console.log(`${tag} Found ${sessions.length} session(s) needing rebalance`);

    let totalRebalanced = 0;
    const allErrors: string[] = [];

    for (const row of sessions) {
      const sessionId = row.session_id;
      const academyId = row.academy_id;
      const creditCost =
        typeof row.credit_cost === "string"
          ? parseFloat(row.credit_cost)
          : row.credit_cost;

      try {
        const result = await rebalanceSemiPrivateCharges(
          sessionId,
          academyId,
          creditCost > 0 ? creditCost : 1,
        );

        totalRebalanced += result.rebalanced;

        if (result.rebalanced > 0) {
          console.log(
            `${tag} session=${sessionId} academy=${academyId} rebalanced=${result.rebalanced} player(s)`,
          );
        }

        if (result.errors.length > 0) {
          for (const e of result.errors) {
            console.error(`${tag} session=${sessionId} error: ${e}`);
            allErrors.push(`session ${sessionId}: ${e}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `${tag} Failed to rebalance session=${sessionId}:`,
          err,
        );
        allErrors.push(`session ${sessionId}: ${msg}`);
      }
    }

    if (allErrors.length === 0) {
      console.log(
        `${tag} Complete — rebalanced ${totalRebalanced} player charge(s) across ${sessions.length} session(s)`,
      );
    } else {
      console.warn(
        `${tag} Complete with errors — rebalanced ${totalRebalanced} player charge(s), ${allErrors.length} error(s)`,
      );
    }
  } catch (err) {
    // Swallow — this watchdog must never fail boot.
    console.error(
      `${tag} Startup scan failed (non-fatal):`,
      err instanceof Error ? err.message : err,
    );
  }
}
