/**
 * scripts/data-repair/repair-holiday-charges.ts
 *
 * Task #1747 — V2 ledger: fix holiday session overcharges
 *
 * Background:
 *   The V2 credit ledger contains `consume` entries for sessions where
 *   `session_players.attendance_status = 'holiday'` AND
 *   `session_players.credit_deducted_at IS NULL`.
 *
 *   These phantom debits inflated player balances (negative drift).
 *   Root cause: when attendance was corrected to 'holiday' after a consume
 *   had already been written, `updateAttendance` only cancelled V1 debt
 *   but never called V2 `refundCredit`. A subsequent `fullCreditRebuildForAcademy`
 *   cleared `credit_deducted_at` but left the orphaned V2 consume entries.
 *
 * This script:
 *   1. Finds all credit_ledger_v2 consume rows where the corresponding
 *      session_player has attendance_status='holiday' AND credit_deducted_at IS NULL,
 *      and no reversal row already exists.
 *   2. For each, calls `refundCredit` with ledgerReason='holiday_charge_reversal'
 *      so the compensating row is clearly identifiable in the audit trail.
 *   3. Prints a per-player summary.
 *
 * The guard in `updateAttendance` (storage.ts) has been fixed so new
 * holiday corrections automatically trigger V2 refunds going forward.
 *
 * Modes:
 *   --dry-run   (default) print the audit, no writes
 *   --apply     actually insert reversal rows and update balances
 *
 * Usage:
 *   npx tsx scripts/data-repair/repair-holiday-charges.ts            # audit
 *   npx tsx scripts/data-repair/repair-holiday-charges.ts --apply    # fix
 *
 * Idempotent: uses stable event key `refund:attendance_changed_to_holiday:<spId>`
 * so re-running after partial failure is safe.
 */

import { sql } from "drizzle-orm";
import { db } from "../../server/db";
import { refundCredit } from "../../server/services/credit-engine";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;
const TAG = `[repair-holiday-charges]${DRY_RUN ? " [dry-run]" : ""}`;

interface WrongChargeRow {
  ledger_id: string;
  session_player_id: string;
  player_id: string;
  player_name: string;
  academy_id: string;
  academy_name: string;
  session_id: string;
  credit_type: string;
  occurred_at: Date;
  current_balance: number | string | null;
}

async function fetchWrongCharges(): Promise<WrongChargeRow[]> {
  const r = await db.execute(sql`
    SELECT
      cl.id              AS ledger_id,
      sp.id              AS session_player_id,
      sp.player_id,
      p.name             AS player_name,
      s.academy_id,
      a.name             AS academy_name,
      cl.session_id,
      cl.type            AS credit_type,
      cl.occurred_at,
      pcb.credits        AS current_balance
    FROM credit_ledger_v2 cl
    JOIN session_players sp
      ON sp.session_id = cl.session_id
     AND sp.player_id  = cl.player_id
    JOIN sessions s ON s.id = sp.session_id
    JOIN players p  ON p.id = sp.player_id
    JOIN academies a ON a.id = s.academy_id
    LEFT JOIN player_credit_balance pcb
      ON pcb.player_id  = sp.player_id
     AND pcb.academy_id = s.academy_id
     AND pcb.type       = cl.type
    WHERE sp.attendance_status = 'holiday'
      AND sp.credit_deducted_at IS NULL
      AND cl.reason = 'consume'
      AND NOT EXISTS (
        SELECT 1
        FROM credit_ledger_v2 rev
        WHERE rev.session_player_id = sp.id
          AND rev.reason IN ('refund', 'manual_adjustment', 'holiday_charge_reversal')
      )
    ORDER BY p.name, cl.occurred_at
  `);
  return r.rows as unknown as WrongChargeRow[];
}

function printSummary(rows: WrongChargeRow[]): void {
  if (rows.length === 0) {
    console.log(`${TAG} No unresolved holiday overcharges found. Nothing to do.`);
    return;
  }

  const byPlayer = new Map<
    string,
    { name: string; count: number; balance: number | null }
  >();

  for (const r of rows) {
    const existing = byPlayer.get(r.player_id);
    const bal =
      r.current_balance !== null ? Number(r.current_balance) : null;
    if (!existing) {
      byPlayer.set(r.player_id, { name: r.player_name, count: 1, balance: bal });
    } else {
      existing.count++;
    }
  }

  console.log(`\n${TAG} Found ${rows.length} unresolved holiday overcharge(s) across ${byPlayer.size} player(s):\n`);
  for (const [playerId, info] of Array.from(byPlayer.entries())) {
    const balStr =
      info.balance !== null ? `current balance = ${info.balance}` : "balance unknown";
    console.log(
      `  ${info.name.padEnd(20)} (${playerId})  ${info.count} overcharge(s)  ${balStr}`
    );
  }
  console.log(
    `\n  After reversal each player will receive +1 credit per overcharge.`
  );
  console.log(
    `  Reversals are written with reason='holiday_charge_reversal' in the ledger.`
  );
}

async function main(): Promise<void> {
  console.log(`${TAG} Scanning for holiday session overcharges in credit_ledger_v2...`);

  const rows = await fetchWrongCharges();
  printSummary(rows);

  if (DRY_RUN) {
    console.log(`\n${TAG} Dry-run complete. Re-run with --apply to write reversals.\n`);
    process.exit(0);
  }

  console.log(`\n${TAG} Applying reversals...`);

  let reversed = 0;
  let alreadyDone = 0;
  let errors = 0;
  const playerDelta = new Map<string, { name: string; delta: number }>();

  for (const row of rows) {
    const spId = row.session_player_id;
    // Matches the idempotent event key used in updateAttendance (storage.ts).
    const eventKey = `refund:attendance_changed_to_holiday:${spId}`;

    try {
      const result = await refundCredit({
        sessionPlayerId: spId,
        policy: "force",
        actorRole: "system",
        reason: "attendance_changed_to_holiday",
        ledgerReason: "holiday_charge_reversal",
        eventKey,
      });

      if (result.alreadyApplied) {
        console.log(`${TAG}   SKIP (already applied): ${row.player_name} / session ${row.session_id}`);
        alreadyDone++;
      } else if (result.refunded) {
        console.log(
          `${TAG}   REVERSED: ${row.player_name} / session ${row.session_id}` +
          ` (+${result.amount} ${result.type ?? row.credit_type}) → new balance: ${result.newBalance}`
        );
        reversed++;
        const existing = playerDelta.get(row.player_id);
        if (!existing) {
          playerDelta.set(row.player_id, { name: row.player_name, delta: result.amount });
        } else {
          existing.delta += result.amount;
        }
      } else {
        console.warn(
          `${TAG}   NO-OP: ${row.player_name} / session ${row.session_id}` +
          ` — no matching consume row found (may already be reversed elsewhere)`
        );
        alreadyDone++;
      }
    } catch (err) {
      console.error(
        `${TAG}   ERROR: ${row.player_name} / session ${row.session_id}:`,
        err instanceof Error ? err.message : String(err)
      );
      errors++;
    }
  }

  console.log(`\n${TAG} ─────────────────────────────────────────────`);
  console.log(`${TAG} Summary:`);
  console.log(`${TAG}   Total overcharges scanned : ${rows.length}`);
  console.log(`${TAG}   Reversals applied         : ${reversed}`);
  console.log(`${TAG}   Already applied / no-op   : ${alreadyDone}`);
  console.log(`${TAG}   Errors                    : ${errors}`);

  if (playerDelta.size > 0) {
    console.log(`\n${TAG} Per-player credit gain from this run:`);
    for (const [, info] of Array.from(playerDelta.entries())) {
      console.log(`${TAG}   ${info.name.padEnd(20)} +${info.delta} credit(s)`);
    }
  }

  if (errors > 0) {
    console.error(`\n${TAG} ${errors} error(s) occurred. Re-run to retry (idempotent).`);
    process.exit(1);
  }

  console.log(`\n${TAG} Done.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
