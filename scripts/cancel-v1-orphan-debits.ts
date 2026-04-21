/**
 * scripts/cancel-v1-orphan-debits.ts
 *
 * Task #901 — Silence the `[Reconcile] V1_ORPHAN_DEBITS total=14` watchdog
 * by formally writing off the historical V1 orphan debits in V2 academies.
 *
 * Background:
 *   - Every 5 minutes the credit-reconcile watchdog logs ~14 rows in
 *     legacy `credit_transactions` with reason `session_consumed` /
 *     `session_debt`, on V2-enabled academies, that have no matching
 *     `credit_ledger_v2` consume row by `session_player_id`.
 *   - Investigation (see Task #901 notes in replit.md) confirmed:
 *       * No active leak — every current INSERT into `credit_transactions`
 *         is either commented-out V1 dead code, gated by the permanently-off
 *         `_v1WritesPermitted` flag, or inside the V2-short-circuited
 *         `ensureCreditProcessed` path (which always sets
 *         `session_player_id`, so its rows would never appear here).
 *       * All 14 surfaced rows have `session_player_id IS NULL`. They were
 *         written prior to the V1 retirement work (Task #682 / #685) and
 *         are pure historical residue.
 *       * V2 academies derive every wallet/balance read from
 *         `credit_ledger_v2`; these legacy rows are inert and do NOT
 *         affect any user-visible balance, debt count, or transaction
 *         history surface in V2.
 *
 * Decision (recorded in replit.md): write them off in-place by stamping
 *   `metadata.cancelled = true` (audit trail preserved — rows are NOT
 *   deleted). The watchdog query already filters out cancelled rows, so
 *   this silences the warning without losing forensic data.
 *
 * Modes:
 *   --dry-run     (default) print the audit, no writes
 *   --apply       actually mark the rows cancelled
 *
 * Usage:
 *   npx tsx scripts/cancel-v1-orphan-debits.ts            # audit only
 *   npx tsx scripts/cancel-v1-orphan-debits.ts --apply    # write-off
 *
 * Idempotent: rows already carrying `metadata.cancelled=true` are skipped.
 */

import { sql } from "drizzle-orm";
import { db } from "../server/db";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;
const TAG = `[cancel-v1-orphan-debits]${DRY_RUN ? " [dry-run]" : ""}`;

interface OrphanRow {
  id: string;
  player_id: string;
  player_name: string | null;
  academy_id: string;
  academy_name: string | null;
  session_id: string | null;
  session_player_id: string | null;
  amount: string | number;
  reason: string;
  credit_type: string | null;
  created_at: Date;
}

async function fetchOrphans(): Promise<OrphanRow[]> {
  const r = await db.execute<OrphanRow>(sql`
    SELECT
      ct.id,
      ct.player_id,
      p.name              AS player_name,
      ct.academy_id,
      a.name              AS academy_name,
      ct.session_id,
      ct.session_player_id,
      ct.amount,
      ct.reason,
      ct.credit_type,
      ct.created_at
    FROM credit_transactions ct
    JOIN academies a ON a.id = ct.academy_id
    LEFT JOIN players p ON p.id = ct.player_id
    WHERE ct.amount < 0
      AND COALESCE(a.use_new_credit_system, false) = true
      AND ct.reason IN ('session_consumed', 'session_debt')
      AND COALESCE((ct.metadata->>'cancelled')::text, 'false') <> 'true'
      AND (
        ct.session_player_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM credit_ledger_v2 lv
          WHERE lv.session_player_id = ct.session_player_id
            AND lv.reason = 'consume'
        )
      )
    ORDER BY ct.created_at ASC
  `);
  return r.rows as OrphanRow[];
}

function summarize(rows: OrphanRow[]): void {
  if (rows.length === 0) {
    console.log(`${TAG} no V1 orphan debits found — watchdog should be quiet.`);
    return;
  }
  const byAcademy = new Map<
    string,
    { name: string; count: number; total: number; types: Map<string, number> }
  >();
  const players = new Set<string>();
  let earliest = rows[0].created_at;
  let latest = rows[0].created_at;

  for (const r of rows) {
    players.add(r.player_id);
    const ts = new Date(r.created_at);
    if (ts < new Date(earliest)) earliest = r.created_at;
    if (ts > new Date(latest)) latest = r.created_at;
    const key = r.academy_id;
    let bucket = byAcademy.get(key);
    if (!bucket) {
      bucket = {
        name: r.academy_name ?? "(unknown)",
        count: 0,
        total: 0,
        types: new Map(),
      };
      byAcademy.set(key, bucket);
    }
    bucket.count += 1;
    bucket.total += Number(r.amount);
    const t = r.credit_type ?? "(null)";
    bucket.types.set(t, (bucket.types.get(t) ?? 0) + Number(r.amount));
  }

  console.log(`${TAG} === AUDIT ===`);
  console.log(`${TAG} total orphan rows : ${rows.length}`);
  console.log(`${TAG} distinct players  : ${players.size}`);
  console.log(`${TAG} oldest            : ${new Date(earliest).toISOString()}`);
  console.log(`${TAG} newest            : ${new Date(latest).toISOString()}`);
  for (const [aid, b] of Array.from(byAcademy.entries())) {
    const typeBreakdown = Array.from(b.types.entries())
      .map(([t, v]) => `${t}=${v}`)
      .join(", ");
    console.log(
      `${TAG}   academy=${aid} (${b.name}) rows=${b.count} sum=${b.total} types=[${typeBreakdown}]`,
    );
  }
  console.log(`${TAG} === ROW DETAIL ===`);
  for (const r of rows) {
    console.log(
      `${TAG}   id=${r.id} academy=${r.academy_id} player=${r.player_id} (${r.player_name ?? "?"}) reason=${r.reason} amount=${r.amount} sp=${r.session_player_id ?? "null"} session=${r.session_id ?? "null"} at=${new Date(r.created_at).toISOString()}`,
    );
  }
}

async function applyWriteOff(rows: OrphanRow[]): Promise<void> {
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  await db.execute(sql`
    UPDATE credit_transactions
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'cancelled', true,
      'cancelledAt', NOW()::text,
      'cancelledReason', 'historical_v1_orphan_pre_v2_retirement_task_901',
      'cancelledBy', 'scripts/cancel-v1-orphan-debits.ts'
    )
    WHERE id = ANY(${ids})
      AND COALESCE((metadata->>'cancelled')::text, 'false') <> 'true'
  `);
  console.log(`${TAG} marked ${ids.length} rows cancelled.`);
}

async function main(): Promise<void> {
  console.log(`${TAG} mode = ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);
  const rows = await fetchOrphans();
  summarize(rows);
  if (APPLY) {
    await applyWriteOff(rows);
    const after = await fetchOrphans();
    console.log(`${TAG} post-apply orphan count: ${after.length} (expected 0)`);
  } else if (rows.length > 0) {
    console.log(`${TAG} re-run with --apply to write these off.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`${TAG} FATAL:`, err);
    process.exit(1);
  });
