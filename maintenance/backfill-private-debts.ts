/**
 * One-off maintenance script: Fix private session credit type mismatches
 * and backfill missing debt transactions for unprocessed private sessions.
 *
 * Run with: npx tsx maintenance/backfill-private-debts.ts
 */
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { ensureCreditProcessed } from "../server/storage";

async function main() {
  console.log("=== Backfill Private Session Debts ===\n");

  // ─── STEP 1: Fix mistyped credit_type (group → private) ───────────────────
  // These 6 records were created by old auto-attendance code that hardcoded
  // 'group' as the credit_type for all sessions, regardless of session_type.
  console.log("STEP 1: Correcting credit_type on 6 mistyped transactions...");

  const mismatchedIds = [
    "debt-auto-eae71802-4354-4430-93f0-a869cb5e472b-90e184bf-3d41-478e-8e62-ea58ed4434d7",
    "debt-auto-eae71802-4354-4430-93f0-a869cb5e472b-25ddce95-55a8-445b-a461-b835e14527eb",
    "3efd4357-c0ed-4e76-b33c-5426cdaf7281",
    "debt-auto-eae71802-4354-4430-93f0-a869cb5e472b-c33c80b0-26a5-4e1c-9478-543a7ec4d344",
    "debt-auto-eae71802-4354-4430-93f0-a869cb5e472b-4774cc10-8e54-4944-a885-39711c6a5907",
    "1b5315b2-07de-4624-820e-415995e8d78f",
  ];

  const updateResult = await db.execute(sql`
    UPDATE credit_transactions
    SET credit_type = 'private'
    WHERE id = ANY(ARRAY[
      'debt-auto-eae71802-4354-4430-93f0-a869cb5e472b-90e184bf-3d41-478e-8e62-ea58ed4434d7',
      'debt-auto-eae71802-4354-4430-93f0-a869cb5e472b-25ddce95-55a8-445b-a461-b835e14527eb',
      '3efd4357-c0ed-4e76-b33c-5426cdaf7281',
      'debt-auto-eae71802-4354-4430-93f0-a869cb5e472b-c33c80b0-26a5-4e1c-9478-543a7ec4d344',
      'debt-auto-eae71802-4354-4430-93f0-a869cb5e472b-4774cc10-8e54-4944-a885-39711c6a5907',
      '1b5315b2-07de-4624-820e-415995e8d78f'
    ]::text[])
      AND credit_type = 'group'
  `);
  console.log(`  Updated ${(updateResult as any).rowCount ?? "?"} record(s) → credit_type = 'private'\n`);

  // ─── STEP 2: Backfill missing debt transactions for 10 unprocessed sessions ─
  // These session_players have attendance_status = 'present'/'late' for private
  // sessions but credit_deducted_at is NULL — ensureCreditProcessed was never
  // called on them. Running it now will either consume credits from an active
  // package or create a debt transaction.
  const unprocessedSessionPlayerIds = [
    "5a071fd0-3663-4ef0-97fa-170d0ad74587", // Ekaterina Kovega  2026-03-08
    "d8c2f119-aae1-4df6-a687-04a01b6bdc67", // Ekaterina Kovega  2026-02-22
    "018785d3-45a3-4187-aa9e-d61a8a99532f", // Mingxi Ji         2026-02-14
    "95b2de47-c7ab-4887-919f-96eef3654e30", // Pratik Madhvani   2026-02-07
    "88b6ba69-45b8-4115-959e-cf30d092a59d", // Mingxi Ji         2026-01-31
    "1858c01a-f335-403c-8875-01ed7b876d69", // Vinay Chandran    2026-01-17
    "04aed428-7779-4a47-8895-44ef799046b6", // Vinay Chandran    2026-01-10
    "7f495dd9-59a6-4fa1-a04c-848e122edbf1", // YanYan LI         2025-12-29
    "37aa2df5-fc57-4276-a120-bf8714f1ea7a", // YanYan LI         2025-12-26
    "3fc08919-b509-403c-a99a-90804a1f01fc", // YanYan LI         2025-12-19
  ];

  console.log(`STEP 2: Processing ${unprocessedSessionPlayerIds.length} unprocessed private sessions...`);
  let consumed = 0;
  let debtsCreated = 0;
  let alreadyDone = 0;
  let errors = 0;

  for (const spId of unprocessedSessionPlayerIds) {
    const result = await ensureCreditProcessed(spId);
    if (result.action === "consumed") {
      console.log(`  ✓ [consumed]      ${spId}`);
      consumed++;
    } else if (result.action === "debt_created") {
      console.log(`  ✓ [debt_created]  ${spId}`);
      debtsCreated++;
    } else if (result.action === "already_processed") {
      console.log(`  · [already_done]  ${spId}`);
      alreadyDone++;
    } else {
      console.log(`  ✗ [${result.action}] ${spId} — ${result.error ?? ""}`);
      errors++;
    }
  }

  console.log(`\n  consumed=${consumed}, debt_created=${debtsCreated}, already_done=${alreadyDone}, errors=${errors}\n`);

  // ─── STEP 3: Summary ───────────────────────────────────────────────────────
  console.log("STEP 3: Verifying final state...");
  const remaining = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE s.session_type IN ('private', 'private_adjusted')
      AND sp.attendance_status IN ('present', 'late')
      AND sp.credit_deducted_at IS NULL
      AND s.start_time < NOW()
  `);
  const remainingCount = Number((remaining.rows[0] as any)?.count ?? 0);
  console.log(`  Unprocessed private sessions remaining: ${remainingCount}`);
  if (remainingCount === 0) {
    console.log("  ✓ All private sessions are now processed.\n");
  } else {
    console.log(`  ⚠ ${remainingCount} sessions still need processing.\n`);
  }

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
  console.log(`  Remaining credit_type mismatches (group for private session): ${mismatchCount}`);
  if (mismatchCount === 0) {
    console.log("  ✓ No more credit_type mismatches.\n");
  }

  console.log("=== Done ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
