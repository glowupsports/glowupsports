/**
 * One-time data fix (Task #1506): Correct Amelia Ava Holdich's two session
 * charges that were stored as "private" but should be "semi_private".
 *
 * Affected sessions: Apr 20 and Apr 27, 2026 (Amelia was the first player
 * marked present each time, so the engine charged private; a second player was
 * marked present after, leaving Amelia's charge uncorrected).
 *
 * Run with: npx tsx maintenance/rebalance-semi-private-amelia.ts
 *
 * Safe to run multiple times — idempotent.
 */
import { pool } from "../server/db";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { rebalanceSemiPrivateCharges } from "../server/services/credit-engine";

async function main() {
  console.log("=== Semi-private rebalance for Amelia Ava Holdich (Task #1506) ===\n");

  const client = await pool.connect();
  try {
    // Find Amelia's player ID.
    const ameliaResult = await client.query(`
      SELECT id, name FROM players
      WHERE name ILIKE '%Amelia%Holdich%'
         OR name ILIKE '%Amelia Ava Holdich%'
      LIMIT 5
    `);

    if (ameliaResult.rows.length === 0) {
      console.error("ERROR: Could not find player matching 'Amelia Ava Holdich'. Aborting.");
      process.exit(1);
    }

    console.log("Matched players:");
    for (const row of ameliaResult.rows as { id: string; name: string }[]) {
      console.log(`  id=${row.id}  name=${row.name}`);
    }
    if (ameliaResult.rows.length > 1) {
      console.warn("WARNING: Multiple players matched. Using first result.");
    }

    const ameliaId = (ameliaResult.rows[0] as { id: string }).id;
    console.log(`\nUsing Amelia's player_id: ${ameliaId}\n`);

    // -----------------------------------------------------------------------
    // Step A: Clean up partial rebalance from previous buggy run.
    // The earlier run created compensating rows (refund + manual) but did NOT
    // update the original consume row's type. We need to:
    //   1. UPDATE the consume rows: type 'private' → 'semi_private'
    //   2. DELETE the compensating refund and manual rows (they are now
    //      redundant and would cause ledger-sum ≠ balance inconsistency).
    // -----------------------------------------------------------------------
    console.log("Step A: Cleaning up any partial rebalance from previous run...");

    const partialCheck = await client.query(`
      SELECT sp.id AS sp_id, lv.id AS consume_row_id, lv.type
      FROM session_players sp
      JOIN sessions s ON s.id = sp.session_id
      JOIN coaching_series cs ON cs.id = s.series_id
      JOIN credit_ledger_v2 lv
        ON lv.session_player_id = sp.id
       AND lv.reason = 'consume'
       AND lv.type = 'private'
      WHERE sp.player_id = $1
        AND cs.session_type = 'semi_private'
        AND s.start_time >= '2026-04-19'::date
        AND s.start_time <  '2026-04-29'::date
        AND EXISTS (
          SELECT 1 FROM credit_ledger_v2
          WHERE event_key = 'rebalance:private_to_semi:refund:' || sp.id::text
        )
    `, [ameliaId]);

    if (partialCheck.rows.length > 0) {
      console.log(`  Found ${partialCheck.rows.length} partially-rebalanced session(s). Cleaning up...`);
      for (const r of partialCheck.rows as { sp_id: string; consume_row_id: string }[]) {
        const { sp_id, consume_row_id } = r;
        console.log(`  sp=${sp_id} consume_row=${consume_row_id}`);

        // 1. UPDATE the original private consume row to semi_private.
        await client.query(`
          UPDATE credit_ledger_v2
          SET type     = 'semi_private',
              metadata = jsonb_set(
                          COALESCE(metadata, '{}'),
                          '{rebalancedFromPrivateAt}',
                          to_jsonb(now()::text)
                        )
          WHERE id = $1
        `, [consume_row_id]);

        // 2. DELETE the compensating refund and manual rows.
        //    These rows were created by the previous buggy run. Now that we have
        //    updated the consume row to type='semi_private', the compensating rows
        //    are redundant. Removing them keeps the ledger sum consistent with
        //    the player_credit_balance (which was already correctly set by
        //    writeBalance calls in the previous run and needs no adjustment here).
        const del = await client.query(`
          DELETE FROM credit_ledger_v2
          WHERE event_key IN (
            'rebalance:private_to_semi:refund:' || $1,
            'rebalance:private_to_semi:consume:' || $1
          )
          RETURNING event_key
        `, [sp_id]);
        const deleted = (del.rows as { event_key: string }[]).map((x) => x.event_key);
        console.log(`    Updated consume row; deleted compensating rows: [${deleted.join(", ")}]`);
      }
      console.log("  Cleanup done.\n");
    } else {
      console.log("  No partial rebalance found. Skipping cleanup.\n");
    }

    // -----------------------------------------------------------------------
    // Step B: Run the canonical rebalance for any sessions that are still
    // incorrectly charged as private (not yet processed at all).
    // -----------------------------------------------------------------------
    console.log("Step B: Running canonical rebalance for any remaining unprocessed sessions...");

    const sessionsResult = await db.execute(sql`
      SELECT DISTINCT
        s.id         AS session_id,
        s.start_time,
        s.academy_id,
        cs.session_type AS series_type,
        lv.type      AS charged_type,
        sp.id        AS sp_id
      FROM session_players sp
      JOIN sessions s ON s.id = sp.session_id
      JOIN coaching_series cs ON cs.id = s.series_id
      JOIN credit_ledger_v2 lv
        ON lv.session_player_id = sp.id
       AND lv.reason = 'consume'
       AND lv.type = 'private'
      WHERE sp.player_id = ${ameliaId}
        AND cs.session_type = 'semi_private'
        AND s.start_time >= '2026-04-19'::date
        AND s.start_time <  '2026-04-29'::date
        AND NOT EXISTS (
          SELECT 1 FROM credit_ledger_v2
          WHERE event_key = 'rebalance:private_to_semi:refund:' || sp.id::text
        )
      ORDER BY s.start_time
    `);

    if (sessionsResult.rows.length === 0) {
      console.log("  No unprocessed sessions found. All done.\n");
    } else {
      console.log(`  Found ${sessionsResult.rows.length} unprocessed session(s):`);
      for (const r of sessionsResult.rows) {
        const row = r as {
          session_id: string;
          start_time: Date | string;
          academy_id: string;
          series_type: string;
          charged_type: string;
          sp_id: string;
        };
        console.log(
          `    session=${row.session_id}  date=${String(row.start_time).slice(0, 10)}` +
          `  series=${row.series_type}  charged=${row.charged_type}  sp=${row.sp_id}`,
        );
      }
      console.log("");

      for (const r of sessionsResult.rows) {
        const row = r as {
          session_id: string;
          start_time: Date | string;
          academy_id: string;
        };
        console.log(`  Processing session ${row.session_id} (${String(row.start_time).slice(0, 10)})...`);
        try {
          const result = await rebalanceSemiPrivateCharges(row.session_id, row.academy_id, 1);
          if (result.errors.length > 0) {
            console.error(`    ERRORS: ${result.errors.join("; ")}`);
          } else {
            console.log(`    Rebalanced ${result.rebalanced} player(s). Done.`);
          }
        } catch (err) {
          console.error(`    FAILED:`, err);
        }
      }
    }

  } finally {
    client.release();
  }

  // -----------------------------------------------------------------------
  // Step C: Verify final state.
  // -----------------------------------------------------------------------
  console.log("Step C: Verification...");
  const verifyClient = await pool.connect();
  try {
    const balances = await verifyClient.query(`
      SELECT type, credits FROM player_credit_balance
      WHERE player_id = (SELECT id FROM players WHERE name ILIKE '%Amelia%Holdich%' LIMIT 1)
      ORDER BY type
    `);
    console.log("  Amelia's balances:", JSON.stringify(balances.rows));

    const ledger = await verifyClient.query(`
      SELECT lv.event_key, lv.type, lv.delta, lv.reason
      FROM credit_ledger_v2 lv
      JOIN session_players sp ON sp.id = lv.session_player_id
      JOIN sessions s ON s.id = sp.session_id
      WHERE sp.player_id = (SELECT id FROM players WHERE name ILIKE '%Amelia%Holdich%' LIMIT 1)
        AND s.start_time >= '2026-04-19'::date
        AND s.start_time <  '2026-04-29'::date
      ORDER BY lv.occurred_at
    `);
    console.log("  Apr 20-27 ledger rows:", JSON.stringify(ledger.rows, null, 2));
  } finally {
    verifyClient.release();
  }

  console.log("\n=== Script complete ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
