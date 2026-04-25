/**
 * server/scripts/reconcile-credit-balances.ts — Task #1332.
 *
 * One-shot reconciliation of the V2 credit state on Supabase. After this runs
 * we expect:
 *   - 0 rows in `player_credit_balance` with `credits < 0`.
 *   - `player_credit_balance.credits` always equals SUM(credit_ledger_v2.delta)
 *     for the same (player, academy, type).
 *   - `credit_lots.qty_remaining` re-derived by FIFO replay of every consume
 *     row in the ledger (oldest non-expired lot first, status flipped to
 *     `depleted` when emptied).
 *   - Every `session_players` row with `attendance_status IN ('present','late')`
 *     + `sessions.status = 'completed'` + `credit_deducted_at IS NULL` either
 *     stamped (when a matching V2 consume row exists) or left alone (when no
 *     V2 ledger row exists — coach action required).
 *
 * Audit trail: every wallet write-off creates a `manual` ledger row so the
 * forensic chain is preserved. eventKey is deterministic so re-running the
 * script is a no-op for already-reconciled players.
 *
 * Usage:
 *   tsx server/scripts/reconcile-credit-balances.ts             # dry-run summary
 *   tsx server/scripts/reconcile-credit-balances.ts --apply     # apply for real
 *   tsx server/scripts/reconcile-credit-balances.ts --apply --player <id>
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

type Lot = {
  id: string;
  qty_total: number;
  qty_remaining: number;
  purchased_at: Date;
  expires_at: Date | null;
  status: string;
};

type LedgerRow = {
  id: string;
  delta: number;
  reason: string;
  occurred_at: Date;
  lot_id: string | null;
  session_player_id: string | null;
  metadata: Record<string, unknown> | null;
};

type Key = { player_id: string; academy_id: string; type: string };

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  const playerFilterIdx = process.argv.indexOf("--player");
  const playerFilter =
    playerFilterIdx >= 0 ? process.argv[playerFilterIdx + 1] ?? null : null;

  console.log(
    `\n========================================================================`,
  );
  console.log(
    `  Task #1332 — V2 credit reconcile  ${apply ? "[APPLY]" : "[DRY-RUN]"}${playerFilter ? `  player=${playerFilter}` : ""}`,
  );
  console.log(
    `========================================================================\n`,
  );

  // ----------------------------------------------------------------------
  // 1) PRE-FIX BASELINE
  // ----------------------------------------------------------------------
  await printMetrics("BEFORE");

  // ----------------------------------------------------------------------
  // 2) ENUMERATE every (player, academy, type) key that has either a wallet
  //    row or a credit_lots row (the union — some lots may exist without a
  //    matching wallet row, or vice versa).
  // ----------------------------------------------------------------------
  const keysQuery = playerFilter
    ? sql`
        SELECT DISTINCT player_id, academy_id, type FROM (
          SELECT player_id, academy_id, type FROM player_credit_balance
          UNION ALL
          SELECT player_id, academy_id, type FROM credit_lots
          UNION ALL
          SELECT player_id, academy_id, type FROM credit_ledger_v2
        ) u
        WHERE player_id = ${playerFilter}
        ORDER BY player_id, academy_id, type
      `
    : sql`
        SELECT DISTINCT player_id, academy_id, type FROM (
          SELECT player_id, academy_id, type FROM player_credit_balance
          UNION ALL
          SELECT player_id, academy_id, type FROM credit_lots
          UNION ALL
          SELECT player_id, academy_id, type FROM credit_ledger_v2
        ) u
        ORDER BY player_id, academy_id, type
      `;
  const keysResult = await db.execute(keysQuery);
  const keys = keysResult.rows as unknown as Key[];

  console.log(`\n[Step 1/3] Reconciling ${keys.length} (player,academy,type) keys...`);

  let walletsRewritten = 0;
  let walletWriteoffsCreated = 0;
  let totalCreditsForgiven = 0;
  let lotsRewritten = 0;
  let lotsStatusChanged = 0;

  for (const key of keys) {
    // Re-fetch lots + ledger for this key (ordered).
    const [lotsR, ledgerR] = await Promise.all([
      db.execute(sql`
        SELECT id, qty_total::numeric AS qty_total,
               qty_remaining::numeric AS qty_remaining,
               purchased_at, expires_at, status
        FROM credit_lots
        WHERE player_id = ${key.player_id}
          AND academy_id = ${key.academy_id}
          AND type = ${key.type}
        ORDER BY purchased_at ASC, created_at ASC
      `),
      db.execute(sql`
        SELECT id, delta::numeric AS delta, reason, occurred_at, lot_id,
               session_player_id, metadata
        FROM credit_ledger_v2
        WHERE player_id = ${key.player_id}
          AND academy_id = ${key.academy_id}
          AND type = ${key.type}
        ORDER BY occurred_at ASC, id ASC
      `),
    ]);

    const lots: Lot[] = lotsR.rows.map((r: any) => ({
      id: r.id,
      qty_total: Number(r.qty_total),
      qty_remaining: Number(r.qty_remaining),
      purchased_at: new Date(r.purchased_at),
      expires_at: r.expires_at ? new Date(r.expires_at) : null,
      status: r.status,
    }));

    const ledger: LedgerRow[] = ledgerR.rows.map((r: any) => ({
      id: r.id,
      delta: Number(r.delta),
      reason: r.reason,
      occurred_at: new Date(r.occurred_at),
      lot_id: r.lot_id,
      session_player_id: r.session_player_id,
      metadata: r.metadata ?? null,
    }));

    // ------------------------------------------------------------------
    // FIFO replay: re-derive each lot's qty_remaining + status from scratch.
    // Strategy:
    //   1. Reset every lot.qty_remaining = qty_total.
    //   2. For every CONSUME row in occurred_at order:
    //      - If row.lot_id is non-null AND that lot still has remaining,
    //        decrement that specific lot first (preserves historical
    //        attribution).
    //      - Otherwise FIFO: oldest active non-expired lot whose
    //        purchased_at <= row.occurred_at.
    //      - Any leftover amount is debt (no lot to deduct from).
    //   3. For every REFUND row: try to restock the lot referenced in
    //      metadata.lotConsumptions; otherwise restock the most recent
    //      lot (best-effort, debt-first refund handled by wallet).
    //   4. For EXPIRY rows: zero the matching lot's qty_remaining.
    //   5. Final: status = 'depleted' if qty_remaining <= 0, 'expired' if
    //      expires_at < now, else 'active'.
    // ------------------------------------------------------------------
    const newLots: Lot[] = lots.map((l) => ({ ...l, qty_remaining: l.qty_total }));
    const lotById = new Map(newLots.map((l) => [l.id, l]));

    for (const row of ledger) {
      if (row.reason === "consume" && row.delta < 0) {
        let toConsume = -row.delta;

        // 1. Preferential decrement on the lot recorded at consume-time.
        if (row.lot_id) {
          const target = lotById.get(row.lot_id);
          if (target && target.qty_remaining > 0) {
            const take = Math.min(target.qty_remaining, toConsume);
            target.qty_remaining -= take;
            toConsume -= take;
          }
        }

        // 2. FIFO across remaining lots (oldest first, must pre-date consume,
        //    must not be expired at time of consume).
        if (toConsume > 0) {
          for (const lot of newLots) {
            if (toConsume <= 0) break;
            if (lot.qty_remaining <= 0) continue;
            if (lot.purchased_at > row.occurred_at) continue;
            if (lot.expires_at && lot.expires_at <= row.occurred_at) continue;
            const take = Math.min(lot.qty_remaining, toConsume);
            lot.qty_remaining -= take;
            toConsume -= take;
          }
        }
        // Anything left is debt — wallet handles it.
      } else if (
        (row.reason === "refund" || row.reason === "makeup") &&
        row.delta > 0
      ) {
        // Restock lots ONLY when the refund row carries explicit
        // `metadata.lotConsumptions` (the V2 engine emits this on every
        // refund it generates). For legacy refund rows without the
        // breakdown we deliberately do NOT guess a lot to restock —
        // mis-attributing a refund to the wrong lot would corrupt FIFO
        // ordering and expiry status. The wallet still reconciles
        // correctly because canonical_balance = SUM(ledger.delta),
        // which already includes the refund delta.
        let toRestock = row.delta;
        const lc = (row.metadata?.lotConsumptions as
          | { lotId: string; qty: number }[]
          | undefined) ?? null;
        if (lc && Array.isArray(lc)) {
          for (const r of lc) {
            if (toRestock <= 0) break;
            const target = lotById.get(r.lotId);
            if (!target) continue;
            const headroom = target.qty_total - target.qty_remaining;
            if (headroom <= 0) continue;
            const give = Math.min(headroom, r.qty, toRestock);
            target.qty_remaining += give;
            toRestock -= give;
          }
        }
      } else if (row.reason === "expiry" && row.delta < 0 && row.lot_id) {
        const target = lotById.get(row.lot_id);
        if (target) target.qty_remaining = 0;
      }
      // purchase / manual / money_* / etc. don't touch lots in this replay.
    }

    // Status reclassification.
    const now = new Date();
    for (const lot of newLots) {
      const original = lots.find((l) => l.id === lot.id)!;
      let newStatus = original.status;
      if (lot.qty_remaining <= 0) newStatus = "depleted";
      else if (lot.expires_at && lot.expires_at < now) newStatus = "expired";
      else if (newStatus === "depleted" || newStatus === "expired") {
        newStatus = "active";
      }
      lot.status = newStatus;
    }

    // Apply lot updates.
    for (let i = 0; i < newLots.length; i++) {
      const before = lots[i];
      const after = newLots[i];
      if (
        before.qty_remaining !== after.qty_remaining ||
        before.status !== after.status
      ) {
        if (before.status !== after.status) lotsStatusChanged++;
        lotsRewritten++;
        if (apply) {
          await db.execute(sql`
            UPDATE credit_lots
            SET qty_remaining = ${after.qty_remaining},
                status = ${after.status}
            WHERE id = ${after.id}
          `);
        }
      }
    }

    // ------------------------------------------------------------------
    // Wallet reconciliation. Canonical balance = SUM(ledger.delta).
    // Then forgive any residual debt by writing a `manual` row so the
    // ledger and wallet stay perfectly consistent.
    // ------------------------------------------------------------------
    const canonical = ledger.reduce((acc, r) => acc + r.delta, 0);
    const desiredWallet = Math.max(0, canonical);

    const walletRow = await db.execute(sql`
      SELECT credits::numeric AS credits FROM player_credit_balance
      WHERE player_id = ${key.player_id}
        AND academy_id = ${key.academy_id}
        AND type = ${key.type}
      LIMIT 1
    `);
    const currentWallet = walletRow.rows[0]
      ? Number((walletRow.rows[0] as any).credits)
      : null;

    if (canonical < 0) {
      // Write off the debt with a manual +abs(canonical) ledger row so
      // ledger sum becomes 0. eventKey is deterministic — re-running the
      // script will hit ON CONFLICT DO NOTHING (eventKey unique idx).
      const writeoffAmount = -canonical;
      const eventKey = `task-1332-debt-writeoff:${key.player_id}:${key.academy_id}:${key.type}`;
      walletWriteoffsCreated++;
      totalCreditsForgiven += writeoffAmount;
      if (apply) {
        await db.execute(sql`
          INSERT INTO credit_ledger_v2 (
            player_id, academy_id, type, delta, reason, event_key,
            actor_id, actor_role, balance_after, metadata, occurred_at
          ) VALUES (
            ${key.player_id}, ${key.academy_id}, ${key.type},
            ${writeoffAmount}, 'manual', ${eventKey},
            'system', 'system', 0,
            ${JSON.stringify({
              task: 1332,
              kind: "debt_writeoff",
              prior_canonical: canonical,
              prior_wallet: currentWallet,
              forgiven: writeoffAmount,
              note: "Negative wallet forgiven during Task #1332 reconcile (lot drift cleanup).",
            })}::jsonb,
            NOW()
          )
          ON CONFLICT (event_key) DO NOTHING
        `);
      }
    }

    if (currentWallet === null || Math.abs((currentWallet ?? 0) - desiredWallet) > 1e-9) {
      walletsRewritten++;
      if (apply) {
        if (currentWallet === null) {
          await db.execute(sql`
            INSERT INTO player_credit_balance (player_id, academy_id, type, credits, updated_at)
            VALUES (${key.player_id}, ${key.academy_id}, ${key.type}, ${desiredWallet}, NOW())
            ON CONFLICT (player_id, academy_id, type)
            DO UPDATE SET credits = EXCLUDED.credits, updated_at = NOW()
          `);
        } else {
          await db.execute(sql`
            UPDATE player_credit_balance
            SET credits = ${desiredWallet}, updated_at = NOW()
            WHERE player_id = ${key.player_id}
              AND academy_id = ${key.academy_id}
              AND type = ${key.type}
          `);
        }
      }
    }
  }

  console.log(`  - lots updated:      ${lotsRewritten} (status flips: ${lotsStatusChanged})`);
  console.log(`  - wallets rewritten: ${walletsRewritten}`);
  console.log(
    `  - debt write-offs:   ${walletWriteoffsCreated} ledger rows, ${fmt(totalCreditsForgiven)} credits forgiven`,
  );

  // ----------------------------------------------------------------------
  // 3) STAMP credit_deducted_at on the 55 NULL-flag rows that already have
  //    a V2 consume row in the ledger. This neutralizes the cron
  //    re-discovery loop without touching balances.
  // ----------------------------------------------------------------------
  console.log(`\n[Step 2/3] Stamping credit_deducted_at on legacy NULL rows...`);
  const stampSelect = await db.execute(sql`
    WITH null_flag AS (
      SELECT sp.id
      FROM session_players sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE s.status = 'completed'
        AND sp.attendance_status IN ('present','late')
        AND sp.credit_deducted_at IS NULL
    ),
    v2_consumes AS (
      SELECT session_player_id,
             MIN(occurred_at) AS occurred_at,
             (array_agg(id ORDER BY occurred_at ASC))[1] AS ledger_id
      FROM credit_ledger_v2
      WHERE reason='consume' AND session_player_id IS NOT NULL
      GROUP BY session_player_id
    )
    SELECT nf.id AS sp_id, vc.occurred_at, vc.ledger_id
    FROM null_flag nf
    JOIN v2_consumes vc ON vc.session_player_id = nf.id
  `);
  const stampRows = stampSelect.rows as unknown as {
    sp_id: string;
    occurred_at: string;
    ledger_id: string;
  }[];

  console.log(`  - rows to stamp:     ${stampRows.length}`);

  let stamped = 0;
  if (apply && stampRows.length > 0) {
    // Bulk update via parameterized unnest() — one round-trip, no string
    // interpolation. Postgres builds three parallel arrays and zips them
    // back into a virtual table for the JOIN.
    const spIds = stampRows.map((r) => r.sp_id);
    const occurredAts = stampRows.map((r) => r.occurred_at);
    const ledgerIds = stampRows.map((r) => r.ledger_id);
    const updateRes = await db.execute(sql`
      UPDATE session_players sp
      SET credit_deducted_at = v.occurred_at,
          credit_transaction_id = v.ledger_id
      FROM (
        SELECT * FROM unnest(
          ${spIds}::varchar[],
          ${occurredAts}::timestamp[],
          ${ledgerIds}::varchar[]
        ) AS t(id, occurred_at, ledger_id)
      ) AS v
      WHERE sp.id = v.id AND sp.credit_deducted_at IS NULL
    `);
    stamped = (updateRes as any).rowCount ?? stampRows.length;
    console.log(`  - rows stamped:      ${stamped}`);
  }

  // ----------------------------------------------------------------------
  // 4) POST-FIX METRICS
  // ----------------------------------------------------------------------
  if (apply) await printMetrics("AFTER");
  else console.log(`\n[DRY-RUN] No writes performed. Re-run with --apply.`);

  console.log(`\n[Step 3/3] Done.\n`);
  process.exit(0);
}

async function printMetrics(label: string): Promise<void> {
  const m = await db.execute(sql`
    WITH lot_sums AS (
      SELECT player_id, academy_id, type, SUM(qty_remaining::numeric) AS lot_remaining
      FROM credit_lots
      WHERE status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
      GROUP BY player_id, academy_id, type
    ),
    ledger_sums AS (
      SELECT player_id, academy_id, type, SUM(delta::numeric) AS ledger_total
      FROM credit_ledger_v2
      GROUP BY player_id, academy_id, type
    ),
    wallets AS (
      SELECT pcb.player_id, pcb.academy_id, pcb.type,
             pcb.credits::numeric AS wallet,
             COALESCE(ls.lot_remaining, 0) AS lot_remaining,
             COALESCE(lg.ledger_total, 0) AS ledger_total
      FROM player_credit_balance pcb
      LEFT JOIN lot_sums ls USING (player_id, academy_id, type)
      LEFT JOIN ledger_sums lg USING (player_id, academy_id, type)
    ),
    null_flag AS (
      SELECT COUNT(*)::int AS n
      FROM session_players sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE s.status = 'completed'
        AND sp.attendance_status IN ('present','late')
        AND sp.credit_deducted_at IS NULL
    ),
    dup_consume AS (
      SELECT COUNT(*)::int AS n FROM (
        SELECT session_player_id, COUNT(*)
        FROM credit_ledger_v2
        WHERE reason='consume' AND session_player_id IS NOT NULL
        GROUP BY session_player_id HAVING COUNT(*) > 1
      ) x
    )
    SELECT
      (SELECT COUNT(*) FROM wallets) AS total_v2_balances,
      (SELECT COUNT(*) FROM wallets WHERE wallet < 0) AS negative_wallets,
      (SELECT COUNT(*) FROM wallets WHERE wallet != ledger_total) AS wallet_neq_ledger,
      (SELECT COUNT(*) FROM wallets WHERE wallet < 0 AND lot_remaining > 0) AS impossible_neg,
      (SELECT n FROM null_flag) AS null_flag_rows,
      (SELECT n FROM dup_consume) AS dup_consume_rows
  `);
  const row = m.rows[0] as any;
  console.log(`\n--- METRICS [${label}] ---`);
  console.log(`  total V2 wallets:          ${row.total_v2_balances}`);
  console.log(`  negative wallets:          ${row.negative_wallets}   (target 0)`);
  console.log(`  wallet ≠ ledger sum:       ${row.wallet_neq_ledger}   (target 0)`);
  console.log(`  impossible (neg+lots>0):   ${row.impossible_neg}   (target 0)`);
  console.log(`  NULL credit_deducted_at:   ${row.null_flag_rows}   (target 0)`);
  console.log(`  duplicate consume rows:    ${row.dup_consume_rows}   (target 0)`);
}

main().catch((err) => {
  console.error("[reconcile-credit-balances] FATAL:", err);
  process.exit(1);
});
