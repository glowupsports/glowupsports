/**
 * scripts/reconcile-double-debits.ts
 *
 * Task #817 — One-shot reconciliation against Supabase to clean up the
 * fallout from double-debits, orphan debits, and the resulting hidden
 * negative wallet balances.
 *
 * Steps:
 *   A. For every (session_id, player_id) with 2+ live `session_debt` /
 *      `session_consumed` rows, mark all-but-earliest as cancelled
 *      (metadata.cancelled=true, cancelledReason='dedupe_double_debit',
 *      cancelledAt=now()). Audit trail preserved — rows are NOT deleted.
 *   B. For every `debt_from_booking:*` row with `session_id IS NULL` and
 *      `metadata.convertedFromBooking` set, look up the original booking →
 *      session and backfill `session_id` (+ `session_player_id` if known).
 *   C. For each affected player, recompute `player_credit_balance.credits`
 *      per type from SUM(amount) FILTER (live rows only).
 *
 * Modes:
 *   --dry-run     (default) print proposed changes, no writes
 *   --apply       actually write changes
 *
 * Usage:
 *   npx tsx scripts/reconcile-double-debits.ts --dry-run
 *   npx tsx scripts/reconcile-double-debits.ts --apply
 */

import { sql } from "drizzle-orm";
import { db } from "../server/db";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

function log(msg: string) {
  console.log(`[reconcile-double-debits]${DRY_RUN ? " [dry-run]" : ""} ${msg}`);
}

async function stepA_cancelDuplicates(): Promise<{ cancelled: number; affectedPlayers: Set<string> }> {
  log("STEP A — finding duplicate (session_id, player_id) charges…");
  const dups = await db.execute<{
    session_id: string;
    player_id: string;
    keep_id: string;
    cancel_ids: string[];
  }>(sql`
    WITH ranked AS (
      SELECT
        id, session_id, player_id, created_at,
        ROW_NUMBER() OVER (
          PARTITION BY session_id, player_id
          ORDER BY created_at ASC, id ASC
        ) AS rn,
        COUNT(*) OVER (PARTITION BY session_id, player_id) AS n
      FROM credit_transactions
      WHERE reason IN ('session_debt', 'session_consumed')
        AND session_id IS NOT NULL
        AND COALESCE(metadata->>'cancelled', 'false') != 'true'
    ),
    grouped AS (
      SELECT
        session_id,
        player_id,
        MIN(id) FILTER (WHERE rn = 1) AS keep_id,
        ARRAY_AGG(id) FILTER (WHERE rn > 1) AS cancel_ids
      FROM ranked
      WHERE n > 1
      GROUP BY session_id, player_id
    )
    SELECT session_id, player_id, keep_id, cancel_ids
    FROM grouped
    WHERE cancel_ids IS NOT NULL AND array_length(cancel_ids, 1) > 0
  `);

  let totalCancelled = 0;
  const affected = new Set<string>();
  for (const row of dups.rows as Array<{
    session_id: string;
    player_id: string;
    keep_id: string;
    cancel_ids: string[];
  }>) {
    affected.add(row.player_id);
    totalCancelled += row.cancel_ids.length;
    log(
      `  session=${row.session_id} player=${row.player_id} keep=${row.keep_id} cancel=${row.cancel_ids.length} ids=[${row.cancel_ids.join(", ")}]`,
    );
    if (APPLY) {
      await db.execute(sql`
        UPDATE credit_transactions
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'cancelled', true,
          'cancelledAt', NOW()::text,
          'cancelledReason', 'dedupe_double_debit',
          'dedupeKeptId', ${row.keep_id}::text
        )
        WHERE id = ANY(${row.cancel_ids})
      `);
    }
  }
  log(`STEP A — duplicate rows to cancel: ${totalCancelled} across ${affected.size} players`);
  return { cancelled: totalCancelled, affectedPlayers: affected };
}

async function stepB_backfillOrphans(): Promise<{ updated: number; affectedPlayers: Set<string> }> {
  log("STEP B — backfilling session_id on debt_from_booking:* rows…");
  // Pull orphans + the source booking they came from, joined to find session.
  const orphans = await db.execute<{
    id: string;
    player_id: string;
    booking_id: string;
    booking_session_id: string | null;
    booking_session_player_id: string | null;
  }>(sql`
    SELECT
      ct.id,
      ct.player_id,
      (ct.metadata->>'convertedFromBooking') AS booking_id,
      bk.session_id           AS booking_session_id,
      bk.session_player_id    AS booking_session_player_id
    FROM credit_transactions ct
    LEFT JOIN credit_transactions bk
      ON bk.id::text = (ct.metadata->>'convertedFromBooking')::text
    WHERE ct.reason = 'session_debt'
      AND ct.session_id IS NULL
      AND (ct.metadata ? 'convertedFromBooking')
      AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
  `);

  let updated = 0;
  const affected = new Set<string>();
  for (const row of orphans.rows as Array<{
    id: string;
    player_id: string;
    booking_id: string | null;
    booking_session_id: string | null;
    booking_session_player_id: string | null;
  }>) {
    if (!row.booking_session_id) {
      log(`  SKIP id=${row.id} — booking ${row.booking_id} has no session_id either`);
      continue;
    }
    affected.add(row.player_id);
    updated++;
    log(
      `  id=${row.id} ← session=${row.booking_session_id} sp=${row.booking_session_player_id ?? "null"}`,
    );
    if (APPLY) {
      await db.execute(sql`
        UPDATE credit_transactions
        SET session_id = ${row.booking_session_id},
            session_player_id = COALESCE(session_player_id, ${row.booking_session_player_id})
        WHERE id = ${row.id}
      `);
    }
  }
  log(`STEP B — orphan rows backfilled: ${updated}`);
  return { updated, affectedPlayers: affected };
}

async function stepC_recomputeBalances(playerIds: Set<string>): Promise<void> {
  if (playerIds.size === 0) {
    log("STEP C — no affected players, skipping balance recompute");
    return;
  }
  log(`STEP C — recomputing player_credit_balance for ${playerIds.size} players…`);
  const ids = Array.from(playerIds);

  // Compute per-(player, academy, type) sums from the cleaned ledger.
  const sums = await db.execute<{
    player_id: string;
    academy_id: string;
    credit_type: string;
    total: string | number;
  }>(sql`
    SELECT
      ct.player_id,
      ct.academy_id,
      COALESCE(ct.credit_type, 'group') AS credit_type,
      SUM(ct.amount)::numeric AS total
    FROM credit_transactions ct
    WHERE ct.player_id = ANY(${ids})
      AND ct.academy_id IS NOT NULL
      AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
    GROUP BY ct.player_id, ct.academy_id, COALESCE(ct.credit_type, 'group')
  `);

  for (const row of sums.rows as Array<{
    player_id: string;
    academy_id: string;
    credit_type: string;
    total: string | number;
  }>) {
    const total = Number(row.total);
    log(
      `  player=${row.player_id} academy=${row.academy_id} type=${row.credit_type} → ${total}`,
    );
    if (APPLY) {
      await db.execute(sql`
        INSERT INTO player_credit_balance (player_id, academy_id, type, credits, updated_at)
        VALUES (${row.player_id}, ${row.academy_id}, ${row.credit_type}, ${total}, NOW())
        ON CONFLICT (player_id, academy_id, type)
        DO UPDATE SET credits = EXCLUDED.credits, updated_at = NOW()
      `);
    }
  }
  log(`STEP C — recompute done (${sums.rows.length} balance rows)`);
}

async function main() {
  log(`mode = ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);
  const a = await stepA_cancelDuplicates();
  const b = await stepB_backfillOrphans();
  const affected = new Set<string>([...a.affectedPlayers, ...b.affectedPlayers]);
  await stepC_recomputeBalances(affected);
  log("done.");
  log(
    `summary: cancelled=${a.cancelled} backfilled=${b.updated} affected_players=${affected.size}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[reconcile-double-debits] FATAL:", err);
    process.exit(1);
  });
