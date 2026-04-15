/**
 * Comprehensive maintenance script: Fix private session credit type mismatches
 * and backfill ALL missing debt/consumption transactions for unprocessed private sessions.
 *
 * Run with: npx tsx maintenance/backfill-private-debts.ts
 *
 * This script is safe to run multiple times — ensureCreditProcessed is idempotent.
 */
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { ensureCreditProcessed } from "../server/storage";

async function main() {
  console.log("=== Backfill Private Session Debts (comprehensive) ===\n");

  // ─── STEP 1: Fix all mistyped credit transactions ─────────────────────────
  // Finds ALL records where credit_type doesn't match the actual session_type.
  // Root cause: legacy auto-attendance code hardcoded credit_type='group' for
  // every debit regardless of session_type.  ensureCreditProcessed (current
  // code) correctly normalises the type, so this only affects old records.
  console.log("STEP 1: Correcting mistyped credit_type on debit transactions...");

  const fixGroupForPrivate = await db.execute(sql`
    UPDATE credit_transactions ct
    SET credit_type = 'private'
    FROM sessions s
    WHERE ct.session_id = s.id
      AND ct.amount < 0
      AND ct.credit_type = 'group'
      AND s.session_type IN ('private', 'private_adjusted')
      AND ct.reason IN ('session_debt', 'session_join_debt', 'session_unpaid', 'session_booking', 'session_consumed')
      AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
  `);
  const groupFixed = (fixGroupForPrivate as any).rowCount ?? 0;
  console.log(`  Fixed group→private: ${groupFixed} record(s)`);

  const fixGroupForSemi = await db.execute(sql`
    UPDATE credit_transactions ct
    SET credit_type = 'semi_private'
    FROM sessions s
    WHERE ct.session_id = s.id
      AND ct.amount < 0
      AND ct.credit_type = 'group'
      AND s.session_type IN ('semi_private', 'semi_private_adjusted')
      AND ct.reason IN ('session_debt', 'session_join_debt', 'session_unpaid', 'session_booking', 'session_consumed')
      AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
  `);
  const semiFixed = (fixGroupForSemi as any).rowCount ?? 0;
  console.log(`  Fixed group→semi_private: ${semiFixed} record(s)\n`);

  // ─── STEP 2: Backfill ALL unprocessed private sessions ────────────────────
  // Selects all session_players where:
  //   - session_type is private or private_adjusted
  //   - attendance_status is present or late
  //   - credit_deducted_at is NULL  (never processed)
  //   - session is not cancelled
  //   - session is in the past
  console.log("STEP 2: Discovering all unprocessed private sessions...");

  const unprocessed = await db.execute(sql`
    SELECT sp.id
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE s.session_type IN ('private', 'private_adjusted')
      AND sp.attendance_status IN ('present', 'late')
      AND sp.credit_deducted_at IS NULL
      AND s.status != 'cancelled'
      AND s.start_time < NOW()
    ORDER BY s.start_time ASC
  `);

  const ids = unprocessed.rows.map((r) => (r as any).id as string);
  console.log(`  Found ${ids.length} unprocessed session_player row(s)`);

  if (ids.length === 0) {
    console.log("  ✓ Nothing to backfill.\n");
  } else {
    let consumed = 0;
    let debtsCreated = 0;
    let alreadyDone = 0;
    let errors = 0;

    for (const spId of ids) {
      const result = await ensureCreditProcessed(spId);
      if (result.action === "consumed") {
        console.log(`  ✓ [consumed]     ${spId}`);
        consumed++;
      } else if (result.action === "debt_created") {
        console.log(`  ✓ [debt_created] ${spId}`);
        debtsCreated++;
      } else if (result.action === "already_processed") {
        console.log(`  · [done]         ${spId}`);
        alreadyDone++;
      } else {
        console.log(`  ✗ [${result.action}] ${spId} — ${result.error ?? ""}`);
        errors++;
      }
    }

    console.log(`\n  consumed=${consumed}, debt_created=${debtsCreated}, already_done=${alreadyDone}, errors=${errors}\n`);
  }

  // ─── STEP 3: Verification ─────────────────────────────────────────────────
  console.log("STEP 3: Verifying clean state...");

  const remaining = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE s.session_type IN ('private', 'private_adjusted')
      AND sp.attendance_status IN ('present', 'late')
      AND sp.credit_deducted_at IS NULL
      AND s.status != 'cancelled'
      AND s.start_time < NOW()
  `);
  const remainingCount = Number((remaining.rows[0] as any)?.count ?? 0);
  console.log(`  Unprocessed private sessions remaining: ${remainingCount} ${remainingCount === 0 ? "✓" : "⚠"}`);

  const mismatchRemaining = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM credit_transactions ct
    JOIN sessions s ON s.id = ct.session_id
    WHERE ct.amount < 0
      AND ct.reason IN ('session_debt', 'session_join_debt', 'session_unpaid', 'session_booking', 'session_consumed')
      AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
      AND s.session_type IN ('private', 'private_adjusted')
      AND ct.credit_type = 'group'
  `);
  const mismatchCount = Number((mismatchRemaining.rows[0] as any)?.count ?? 0);
  console.log(`  credit_type mismatches remaining: ${mismatchCount} ${mismatchCount === 0 ? "✓" : "⚠"}`);

  console.log("\n=== Done ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
