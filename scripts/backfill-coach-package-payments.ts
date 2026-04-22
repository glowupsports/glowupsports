/**
 * scripts/backfill-coach-package-payments.ts
 *
 * Task #993 — Heal payment rows that were written by the coach
 * "Purchase credits → Already paid" flow before the route was fixed.
 *
 * The legacy code path inserted payments with:
 *   - player_id IS NULL
 *   - status = 'succeeded'
 *   - source IS NULL
 *   - package_id IS NULL
 *   - recorded_by_user_id IS NULL
 *
 * The player Payments tab queries by player_id and only renders
 * pending|confirmed|rejected, so these rows were invisible to the player
 * even though their wallet was credited and money was logged.
 *
 * For every such orphan payment whose invoice resolves to a player +
 * package, this script copies (player_id, package_id) from the invoice
 * onto the payment, flips status to 'confirmed', and stamps source =
 * 'coach_package_purchase'. recorded_by_user_id is left NULL when not
 * recoverable (the invoice does not carry it); the player UI tolerates a
 * null actor.
 *
 * Modes:
 *   --dry-run     (default) print the audit, no writes
 *   --apply       actually backfill
 *
 * Usage:
 *   npx tsx scripts/backfill-coach-package-payments.ts            # audit only
 *   npx tsx scripts/backfill-coach-package-payments.ts --apply    # apply
 *
 * Idempotent: the WHERE clause excludes rows that already have the
 * target shape, so re-running is a no-op.
 */

import { sql } from "drizzle-orm";
import { db } from "../server/db";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;
const TAG = `[backfill-coach-package-payments]${DRY_RUN ? " [dry-run]" : ""}`;

interface OrphanRow {
  id: string;
  invoice_id: string | null;
  invoice_player_id: string | null;
  invoice_package_id: string | null;
  current_player_id: string | null;
  current_status: string | null;
  current_source: string | null;
  current_package_id: string | null;
  amount: string | number;
  currency: string | null;
  created_at: Date;
}

async function fetchOrphans(): Promise<OrphanRow[]> {
  const r = await db.execute<OrphanRow>(sql`
    SELECT
      pay.id,
      pay.invoice_id,
      inv.player_id    AS invoice_player_id,
      inv.package_id   AS invoice_package_id,
      pay.player_id    AS current_player_id,
      pay.status       AS current_status,
      pay.source       AS current_source,
      pay.package_id   AS current_package_id,
      pay.amount,
      pay.currency,
      pay.created_at
    FROM payments pay
    JOIN invoices inv ON inv.id = pay.invoice_id
    WHERE inv.player_id IS NOT NULL
      AND inv.package_id IS NOT NULL
      AND (
        pay.player_id IS NULL
        OR pay.status = 'succeeded'
        OR pay.source IS NULL
        OR pay.package_id IS NULL
      )
    ORDER BY pay.created_at ASC
  `);
  return r.rows as OrphanRow[];
}

function summarize(rows: OrphanRow[]): void {
  if (rows.length === 0) {
    console.log(`${TAG} no orphan coach-package payments found.`);
    return;
  }
  console.log(`${TAG} found ${rows.length} orphan payment row(s) to heal:`);
  for (const r of rows) {
    console.log(
      `  pay=${r.id} inv=${r.invoice_id} player=${r.invoice_player_id} pkg=${r.invoice_package_id} ` +
        `amount=${r.amount} ${r.currency} status(was)=${r.current_status} source(was)=${r.current_source ?? "NULL"} ` +
        `created=${new Date(r.created_at).toISOString()}`,
    );
  }
}

async function applyBackfill(rows: OrphanRow[]): Promise<void> {
  let updated = 0;
  for (const r of rows) {
    if (!r.invoice_player_id) continue;
    const result = await db.execute(sql`
      UPDATE payments
      SET
        player_id = COALESCE(player_id, ${r.invoice_player_id}),
        package_id = COALESCE(package_id, ${r.invoice_package_id}),
        status = CASE WHEN status = 'succeeded' THEN 'confirmed' ELSE status END,
        source = COALESCE(source, 'coach_package_purchase'),
        updated_at = NOW()
      WHERE id = ${r.id}
        AND (
          player_id IS NULL
          OR status = 'succeeded'
          OR source IS NULL
          OR package_id IS NULL
        )
    `);
    const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
    if (count > 0) {
      updated += 1;
      console.log(
        `${TAG} healed pay=${r.id} → player=${r.invoice_player_id} pkg=${r.invoice_package_id} status=confirmed source=coach_package_purchase`,
      );
    }
  }
  console.log(`${TAG} updated ${updated} row(s).`);
}

async function main(): Promise<void> {
  const rows = await fetchOrphans();
  summarize(rows);
  if (rows.length === 0) {
    process.exit(0);
  }
  if (DRY_RUN) {
    console.log(`${TAG} dry-run complete. Re-run with --apply to write.`);
    process.exit(0);
  }
  await applyBackfill(rows);
  process.exit(0);
}

main().catch((err) => {
  console.error(`${TAG} fatal:`, err);
  process.exit(1);
});
