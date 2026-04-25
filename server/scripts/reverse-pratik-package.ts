/**
 * server/scripts/reverse-pratik-package.ts — Task #1337.
 *
 * Final close-out for Pratik Madhvani's mistakenly-issued 20-credit private
 * package. After Task #1338 ran, his wallet sits at +6 (0 + 5 cancelled-
 * session refunds + 1 ghost-orphan refund). This script:
 *
 *   1. Writes a single -20 `package_reversed_by_coach` ledger row via
 *      `manualAdjustment` (allowOverdraw=true) → wallet ends at -14, which
 *      matches the 14 real attended sessions.
 *   2. Cancels the underlying credit_lots row (qty_remaining → 0).
 *   3. Marks the packages row deleted (remaining_credits → 0).
 *   4. Detaches any invoices still pointing at the package.
 *
 * Idempotent: deterministic eventKey
 * `task-1337-reverse-pkg:587b29c1-03b3-41f2-b737-56a147e67e8b`. Re-running
 * is a no-op for the ledger (DuplicateEventError swallowed by manualAdjustment)
 * and the SQL updates are naturally re-runnable.
 *
 * Usage:
 *   tsx server/scripts/reverse-pratik-package.ts             # dry-run
 *   tsx server/scripts/reverse-pratik-package.ts --apply     # commit
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { manualAdjustment } from "../services/credit-engine";

const PLAYER_ID = "6603e02d-ed3d-40c8-bd90-aaf2a72c2eb3";
const ACADEMY_ID = "default-academy";
const PACKAGE_ID = "587b29c1-03b3-41f2-b737-56a147e67e8b";
const LOT_ID = "5eda58a7-6b0c-455b-a313-9a0e162daad9";
const EVENT_KEY = `task-1337-reverse-pkg:${PACKAGE_ID}`;

interface WalletRow {
  credits: string | number;
}
interface SumRow {
  s: string | number;
}
interface LotRow {
  id: string;
  status: string;
  qty_remaining: string | number;
}
interface PackageRow {
  id: string;
  status: string;
  remaining_credits: string | number;
  total_credits: string | number;
}
interface TaskLedgerRow {
  id: string;
  delta: string | number;
  reason: string;
  event_key: string;
}

function rowsOf<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

async function readWallet(): Promise<number> {
  const result = await db.execute(sql`
    SELECT credits
    FROM player_credit_balance
    WHERE player_id = ${PLAYER_ID}
      AND academy_id = ${ACADEMY_ID}
      AND type = 'private'
  `);
  const row = rowsOf<WalletRow>(result)[0];
  return row ? Number(row.credits) : 0;
}

async function readLedgerSum(): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(delta), 0)::int AS s
    FROM credit_ledger_v2
    WHERE player_id = ${PLAYER_ID}
      AND academy_id = ${ACADEMY_ID}
      AND type = 'private'
  `);
  return Number(rowsOf<SumRow>(result)[0]?.s ?? 0);
}

async function readLot(): Promise<LotRow | null> {
  const result = await db.execute(sql`
    SELECT id, status, qty_remaining
    FROM credit_lots WHERE id = ${LOT_ID}
  `);
  return rowsOf<LotRow>(result)[0] ?? null;
}

async function readPackage(): Promise<PackageRow | null> {
  const result = await db.execute(sql`
    SELECT id, status, remaining_credits, total_credits
    FROM packages WHERE id = ${PACKAGE_ID}
  `);
  return rowsOf<PackageRow>(result)[0] ?? null;
}

async function readTaskLedgerRows(): Promise<TaskLedgerRow[]> {
  const result = await db.execute(sql`
    SELECT id, delta, reason, event_key
    FROM credit_ledger_v2
    WHERE event_key = ${EVENT_KEY}
  `);
  return rowsOf<TaskLedgerRow>(result);
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  console.log(`\n=== Task #1337 — reverse Pratik 20-credit package (${apply ? "APPLY" : "DRY-RUN"}) ===\n`);

  const walletBefore = await readWallet();
  const ledgerBefore = await readLedgerSum();
  const lotBefore = await readLot();
  const pkgBefore = await readPackage();
  const existingBefore = await readTaskLedgerRows();

  console.log("Pre-check:");
  console.log(`  wallet (private)        = ${walletBefore}    (expected +6)`);
  console.log(`  ledger sum (private)    = ${ledgerBefore}    (expected +6)`);
  console.log(`  lot                     = ${JSON.stringify(lotBefore)}`);
  console.log(`  package                 = ${JSON.stringify(pkgBefore)}`);
  console.log(`  existing task-1337 rows = ${existingBefore.length}`);

  if (existingBefore.length > 0) {
    console.log("\n→ Reversal ledger row already present. Re-applying SQL updates is safe & idempotent.");
  } else {
    if (walletBefore !== 6) {
      console.error(`\nABORT: wallet is ${walletBefore}, expected +6. Re-run Task #1338 first or investigate.`);
      process.exit(2);
    }
    if (ledgerBefore !== 6) {
      console.error(`\nABORT: ledger sum is ${ledgerBefore}, expected +6 (must match wallet).`);
      process.exit(2);
    }
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to commit.\n");
    process.exit(0);
  }

  // Step 2 — manual adjustment (-20).
  console.log("\nStep 2: manualAdjustment delta=-20 reason=package_reversed_by_coach allowOverdraw=true …");
  const adj = await manualAdjustment({
    playerId: PLAYER_ID,
    academyId: ACADEMY_ID,
    type: "private",
    delta: -20,
    reason: "package_reversed_by_coach",
    ledgerReason: "package_reversed_by_coach",
    eventKey: EVENT_KEY,
    actorId: "system",
    actorRole: "admin",
    allowOverdraw: true,
  });
  if (adj.alreadyApplied) {
    console.log("  → already applied (DuplicateEventError swallowed).");
  } else {
    console.log(`  → ok. newBalance=${adj.newBalance}`);
  }

  // Step 3 — cancel lot, mark package deleted, detach invoices, in one tx.
  console.log("\nStep 3: cancel lot, mark package deleted, detach invoices (single tx) …");
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE credit_lots
      SET status = 'cancelled', qty_remaining = 0
      WHERE id = ${LOT_ID}
    `);
    await tx.execute(sql`
      UPDATE packages
      SET status = 'deleted', remaining_credits = 0
      WHERE id = ${PACKAGE_ID}
    `);
    await tx.execute(sql`
      UPDATE invoices
      SET package_id = NULL
      WHERE package_id = ${PACKAGE_ID}
    `);
  });
  console.log("  → done.");

  // Step 4 — verify.
  const walletAfter = await readWallet();
  const ledgerAfter = await readLedgerSum();
  const lotAfter = await readLot();
  const pkgAfter = await readPackage();
  const taskRowsAfter = await readTaskLedgerRows();
  const reversalRow = taskRowsAfter[0];

  console.log("\nPost-check:");
  console.log(`  wallet (private)        = ${walletAfter}    (expected -14)`);
  console.log(`  ledger sum (private)    = ${ledgerAfter}    (expected -14)`);
  console.log(`  lot                     = ${JSON.stringify(lotAfter)}`);
  console.log(`  package                 = ${JSON.stringify(pkgAfter)}`);
  console.log(`  task-1337 ledger rows   = ${taskRowsAfter.length} (expected 1)`);
  if (reversalRow) {
    console.log(
      `  reversal row            = delta=${reversalRow.delta}, reason='${reversalRow.reason}'  (expected delta=-20, reason='package_reversed_by_coach')`,
    );
  }

  const reversalRowOk =
    taskRowsAfter.length === 1 &&
    reversalRow !== undefined &&
    Number(reversalRow.delta) === -20 &&
    reversalRow.reason === "package_reversed_by_coach";

  const ok =
    walletAfter === -14 &&
    ledgerAfter === -14 &&
    lotAfter?.status === "cancelled" &&
    Number(lotAfter?.qty_remaining) === 0 &&
    pkgAfter?.status === "deleted" &&
    Number(pkgAfter?.remaining_credits) === 0 &&
    reversalRowOk;

  if (!ok) {
    console.error("\nVERIFICATION FAILED — investigate before declaring done.");
    process.exit(3);
  }
  console.log("\nAll checks passed. Wallet pinned at -14, lot cancelled, package deleted.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
