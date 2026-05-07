/**
 * scripts/data-repair/repair-ghost-session-charges.ts
 *
 * Task #1755 — Fix ghost credit charges when sessions/series are deleted
 *
 * Background:
 *   When coaching series or sessions are bulk-deleted the V2 credit ledger
 *   `consume` rows were left behind as orphaned charges — the sessions no
 *   longer exist but the debt remains on the players' wallets.
 *
 *   Root cause: `deleteCoachingSeries` and `endCoachingSeries` in storage.ts
 *   never called any credit-refund logic before wiping session_players +
 *   sessions rows. (Fixed going forward in the same task.)
 *
 * This script:
 *   1. Finds all `credit_ledger_v2` consume rows where the `session_id` no
 *      longer exists in the `sessions` table AND no refund row already exists
 *      for the same `session_player_id`.
 *   2. For each orphan, calls `refundCredit` with `policy: 'force'` so the
 *      player is credited back regardless of when the session was held.
 *   3. Prints a per-player summary.
 *
 * Note: Because the sessions and session_players rows are already gone,
 * `refundCreditsForSession` cannot be used here. Instead we call `refundCredit`
 * directly — it looks up the prior consume row in `credit_ledger_v2` by
 * `session_player_id` without needing the session to exist.
 *
 * Modes:
 *   --dry-run   (default) print the audit, no writes
 *   --apply     actually insert reversal rows and update balances
 *
 * Usage:
 *   npx tsx scripts/data-repair/repair-ghost-session-charges.ts            # audit
 *   npx tsx scripts/data-repair/repair-ghost-session-charges.ts --apply    # fix
 *
 * Idempotent: `refundCredit` uses a stable event key `refund:<sessionPlayerId>`
 * so re-running after a partial failure is safe.
 */

import { sql } from "drizzle-orm";
import { db } from "../../server/db";
import { refundCredit } from "../../server/services/credit-engine";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;
const TAG = `[repair-ghost-session-charges]${DRY_RUN ? " [dry-run]" : ""}`;

interface GhostChargeRow {
  ledger_id: string;
  session_player_id: string;
  player_id: string;
  player_name: string;
  academy_id: string;
  academy_name: string;
  deleted_session_id: string;
  credit_type: string;
  delta: string | number;
  occurred_at: Date;
  current_balance: number | string | null;
}

async function fetchGhostCharges(): Promise<GhostChargeRow[]> {
  const r = await db.execute(sql`
    SELECT
      cl.id                AS ledger_id,
      cl.session_player_id,
      cl.player_id,
      p.name               AS player_name,
      cl.academy_id,
      a.name               AS academy_name,
      cl.session_id        AS deleted_session_id,
      cl.type              AS credit_type,
      cl.delta,
      cl.occurred_at,
      pcb.credits          AS current_balance
    FROM credit_ledger_v2 cl
    JOIN players p  ON p.id = cl.player_id
    JOIN academies a ON a.id = cl.academy_id
    LEFT JOIN player_credit_balance pcb
      ON pcb.player_id  = cl.player_id
     AND pcb.academy_id = cl.academy_id
     AND pcb.type       = cl.type
    WHERE cl.reason = 'consume'
      AND cl.session_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM sessions WHERE id = cl.session_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM credit_ledger_v2 rev
        WHERE rev.session_player_id = cl.session_player_id
          AND rev.reason IN ('refund', 'manual_adjustment', 'holiday_charge_reversal', 'session_deleted')
      )
    ORDER BY p.name, cl.occurred_at
  `);
  return r.rows as unknown as GhostChargeRow[];
}

function printSummary(rows: GhostChargeRow[]): void {
  if (rows.length === 0) {
    console.log(`${TAG} No ghost charges found. Nothing to do.`);
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

  console.log(
    `\n${TAG} Found ${rows.length} ghost charge(s) across ${byPlayer.size} player(s):\n`
  );
  for (const [playerId, info] of Array.from(byPlayer.entries())) {
    const balStr =
      info.balance !== null
        ? `current balance = ${info.balance}`
        : "balance unknown";
    console.log(
      `  ${info.name.padEnd(24)} (${playerId})  ` +
        `${info.count} ghost charge(s)  ${balStr}`
    );
  }
  console.log(
    `\n  After reversal each player will receive their credits back.`
  );
  console.log(
    `  Reversals are written with ledger reason='refund' and metadata reason='session_deleted'.`
  );
}

async function main(): Promise<void> {
  console.log(`${TAG} Scanning for ghost session charges in credit_ledger_v2...`);

  const rows = await fetchGhostCharges();
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

    try {
      const result = await refundCredit({
        sessionPlayerId: spId,
        policy: "force",
        actorRole: "system",
        reason: "session_deleted",
      });

      if (result.alreadyApplied) {
        console.log(
          `${TAG}   SKIP (already applied): ${row.player_name} / session ${row.deleted_session_id}`
        );
        alreadyDone++;
      } else if (result.refunded) {
        console.log(
          `${TAG}   REVERSED: ${row.player_name} / session ${row.deleted_session_id}` +
            ` (+${result.amount} ${result.type ?? row.credit_type}) → new balance: ${result.newBalance}`
        );
        reversed++;
        const existing = playerDelta.get(row.player_id);
        if (!existing) {
          playerDelta.set(row.player_id, {
            name: row.player_name,
            delta: result.amount,
          });
        } else {
          existing.delta += result.amount;
        }
      } else {
        console.warn(
          `${TAG}   NO-OP: ${row.player_name} / session ${row.deleted_session_id}` +
            ` — no matching consume row found (may already be reversed elsewhere)`
        );
        alreadyDone++;
      }
    } catch (err) {
      console.error(
        `${TAG}   ERROR: ${row.player_name} / session ${row.deleted_session_id}:`,
        err instanceof Error ? err.message : String(err)
      );
      errors++;
    }
  }

  console.log(`\n${TAG} ─────────────────────────────────────────────`);
  console.log(`${TAG} Summary:`);
  console.log(`${TAG}   Total ghost charges scanned : ${rows.length}`);
  console.log(`${TAG}   Reversals applied           : ${reversed}`);
  console.log(`${TAG}   Already applied / no-op     : ${alreadyDone}`);
  console.log(`${TAG}   Errors                      : ${errors}`);

  if (playerDelta.size > 0) {
    console.log(`\n${TAG} Per-player credit gain from this run:`);
    for (const [, info] of Array.from(playerDelta.entries())) {
      console.log(`${TAG}   ${info.name.padEnd(24)} +${info.delta} credit(s)`);
    }
  }

  if (errors > 0) {
    console.error(
      `\n${TAG} ${errors} error(s) occurred. Re-run to retry (idempotent).`
    );
    process.exit(1);
  }

  console.log(`\n${TAG} Done.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`${TAG} Fatal:`, err);
  process.exit(1);
});
