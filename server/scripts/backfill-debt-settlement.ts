/**
 * server/scripts/backfill-debt-settlement.ts — Task #1443.
 *
 * Retroactively applies the purchase-time debt-settlement fix to every
 * existing `credit_lots` row that the engine bug left over-stated.
 *
 * Bug recap (fixed in `server/services/credit-engine.ts:purchasePackage`):
 * when a player was in debt at the moment of purchase (`wallet < 0`), the
 * engine added `qty` to both the wallet AND `credit_lots.qty_remaining`,
 * leaving the lot as if all newly minted credits were still available.
 * Reality: those credits should have been immediately spent paying down
 * the debt. The fix now writes a `consume_debt_settlement` ledger row
 * (delta=0) and decrements the new lot. Re-running this backfill applies
 * the same correction to historical lots without double-counting.
 *
 * Strategy: per (player_id, academy_id, type) tuple that has at least one
 * purchase whose pre-purchase balance was negative, do a full chronological
 * replay of the ledger with the fix applied:
 *
 *   1. Reset every lot.qty_remaining = qty_total.
 *   2. Walk events in occurred_at order:
 *        - PURCHASE row (delta = +qty):
 *            * pre_balance = running_wallet
 *            * running_wallet += delta
 *            * if pre_balance < 0:
 *                settle = min(qty, -pre_balance)
 *                lot[purchase.lot_id].qty_remaining -= settle
 *                record planned settlement row for this lot
 *        - CONSUME row (delta < 0):
 *            * preferred lot first (row.lot_id) then FIFO over remaining
 *              lots whose purchased_at <= occurred_at AND not expired at
 *              occurred_at; decrement up to abs(delta).
 *            * running_wallet += delta (will go negative when lots run out;
 *              that is still real wallet debt)
 *        - REFUND / MAKEUP / REFUND_DUP_CONSUME (delta > 0):
 *            * running_wallet += delta
 *            * if `metadata.lotConsumptions` present, restock those lots
 *              up to `qty_total` headroom.
 *        - EXPIRY (delta < 0, lot_id set):
 *            * zero that specific lot.
 *            * running_wallet += delta
 *        - PURCHASE'S OWN consume_debt_settlement row from a previous
 *          backfill run (delta = 0):
 *            * already accounted for via the purchase's planned settlement
 *              above — IGNORE during replay so we do not double-decrement.
 *        - other reasons (manual, money_*, undo_debt_writeoff): wallet only.
 *   3. For each lot, compare planned_qty_remaining vs current qty_remaining.
 *      The diff is what this backfill needs to apply. We reach that target
 *      by emitting one settlement row per (lot, planned settle) pair —
 *      deterministic event_key `settle:lot:<lotId>`. Since the engine fix
 *      will only ever produce ONE settlement row per lot, this script will
 *      too. ON CONFLICT DO NOTHING ⇒ rerunning is a no-op.
 *
 * Usage:
 *   tsx server/scripts/backfill-debt-settlement.ts                       # dry-run
 *   tsx server/scripts/backfill-debt-settlement.ts --apply
 *   tsx server/scripts/backfill-debt-settlement.ts --apply --player <id>
 *   tsx server/scripts/backfill-debt-settlement.ts --apply --actor <userId>
 *
 * RUN ORDER: this MUST run AFTER `undo-task-1332-writeoffs.ts` so the
 * pre-purchase balances reflect the restored debt the engine should have
 * settled in the first place.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

interface RawLot {
  id: string;
  player_id: string;
  academy_id: string;
  type: string;
  qty_total: string | number;
  qty_remaining: string | number;
  purchased_at: string | Date;
  expires_at: string | Date | null;
  status: string;
}

interface Lot {
  id: string;
  qty_total: number;
  qty_remaining: number; // current DB value (start point for diff)
  purchased_at: Date;
  expires_at: Date | null;
  status: string;
}

interface RawLedger {
  id: string;
  delta: string | number;
  reason: string;
  occurred_at: string | Date;
  lot_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface Ledger {
  id: string;
  delta: number;
  reason: string;
  occurred_at: Date;
  lot_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface PlannedSettlement {
  lotId: string;
  settleAmount: number;
  preBalance: number;
  qtyTotal: number;
  qtyRemainingAfter: number;
  purchasedAt: Date;
  purchaseEventKey: string;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const actorIdx = args.indexOf("--actor");
  const actor = actorIdx >= 0 ? args[actorIdx + 1] ?? "system" : "system";
  const playerIdx = args.indexOf("--player");
  const playerFilter = playerIdx >= 0 ? args[playerIdx + 1] ?? null : null;

  console.log(
    `\n========================================================================`,
  );
  console.log(
    `  Task #1443 — backfill purchase-time debt settlement  ${apply ? "[APPLY]" : "[DRY-RUN]"}`,
  );
  console.log(
    `  actor=${actor}${playerFilter ? `  player=${playerFilter}` : ""}`,
  );
  console.log(
    `========================================================================\n`,
  );

  // ----------------------------------------------------------------------
  // 0) Precondition guard — refuse to run while Task #1332 write-offs are
  //    unresolved.
  //
  // The replay below treats the ledger as the source of truth for
  // pre-purchase balance. While `task-1332-debt-writeoff:*` rows still
  // sit in the ledger without a matching `task-1332-undo-writeoff:*`
  // counter row, every replayed pre-purchase balance for the affected
  // 67 players is artificially clamped at 0, which means we under-settle
  // by exactly the amount that was forgiven. Because the settlement
  // event_key is one-per-lot (`settle:lot:<lotId>`) with
  // `ON CONFLICT DO NOTHING`, the under-settled value becomes permanent —
  // re-running this script after the undo cannot top it up.
  //
  // So we hard-fail until the undo script has been applied. Override only
  // with `--ignore-pending-writeoffs` if an operator has manually verified
  // they don't care about Task #1332 fidelity (e.g. a fresh DB restore).
  // ----------------------------------------------------------------------
  const ignorePendingWriteoffs = args.includes("--ignore-pending-writeoffs");
  const pendingRow = (await db.execute(sql`
    SELECT COUNT(*)::int AS pending
    FROM credit_ledger_v2 wo
    WHERE wo.event_key LIKE 'task-1332-debt-writeoff:%'
      AND NOT EXISTS (
        SELECT 1 FROM credit_ledger_v2 un
        WHERE un.event_key = REPLACE(wo.event_key, 'debt-writeoff', 'undo-writeoff')
      )
  `)).rows[0] as { pending: number } | undefined;
  const pending = pendingRow ? Number(pendingRow.pending) : 0;
  if (pending > 0) {
    console.error(
      `\n[FATAL] ${pending} unresolved Task #1332 write-off rows still in ledger.`,
    );
    console.error(
      `        Run \`tsx server/scripts/undo-task-1332-writeoffs.ts --apply --actor <userId>\` first.`,
    );
    console.error(
      `        Override with \`--ignore-pending-writeoffs\` only if you have manually`,
    );
    console.error(
      `        verified that Task #1332 fidelity is not required (e.g. fresh DB restore).\n`,
    );
    if (!ignorePendingWriteoffs) {
      process.exit(2);
    }
    console.error(
      `[WARN] --ignore-pending-writeoffs set; proceeding with under-settlement risk.\n`,
    );
  }

  // ----------------------------------------------------------------------
  // 1) Find every (player, academy, type) tuple that has at least one
  //    purchase whose pre-purchase balance was negative. Those are the only
  //    tuples that need replay.
  // ----------------------------------------------------------------------
  const tuplesQuery = playerFilter
    ? sql`
        SELECT DISTINCT player_id, academy_id, type
        FROM credit_ledger_v2
        WHERE reason = 'purchase'
          AND (balance_after::numeric - delta::numeric) < 0
          AND player_id = ${playerFilter}
        ORDER BY player_id, academy_id, type
      `
    : sql`
        SELECT DISTINCT player_id, academy_id, type
        FROM credit_ledger_v2
        WHERE reason = 'purchase'
          AND (balance_after::numeric - delta::numeric) < 0
        ORDER BY player_id, academy_id, type
      `;
  const tuples = (await db.execute(tuplesQuery)).rows as {
    player_id: string;
    academy_id: string;
    type: string;
  }[];
  console.log(`Tuples to replay: ${tuples.length}`);

  let totalLotsTouched = 0;
  let totalSettlementRowsWritten = 0;
  let totalCreditsSettled = 0;

  for (const t of tuples) {
    const [lotsR, ledgerR] = await Promise.all([
      db.execute(sql`
        SELECT id, player_id, academy_id, type,
               qty_total::numeric AS qty_total,
               qty_remaining::numeric AS qty_remaining,
               purchased_at, expires_at, status
        FROM credit_lots
        WHERE player_id = ${t.player_id}
          AND academy_id = ${t.academy_id}
          AND type = ${t.type}
        ORDER BY purchased_at ASC, created_at ASC
      `),
      db.execute(sql`
        SELECT id, delta::numeric AS delta, reason, occurred_at, lot_id,
               metadata, event_key
        FROM credit_ledger_v2
        WHERE player_id = ${t.player_id}
          AND academy_id = ${t.academy_id}
          AND type = ${t.type}
        ORDER BY occurred_at ASC, id ASC
      `),
    ]);

    const rawLots = lotsR.rows as unknown as RawLot[];
    const lots: Lot[] = rawLots.map((r) => ({
      id: r.id,
      qty_total: Number(r.qty_total),
      qty_remaining: Number(r.qty_remaining),
      purchased_at: new Date(r.purchased_at),
      expires_at: r.expires_at ? new Date(r.expires_at) : null,
      status: r.status,
    }));
    const lotById = new Map(lots.map((l) => [l.id, l]));

    const rawLedger = ledgerR.rows as unknown as (RawLedger & { event_key: string })[];
    const ledger: (Ledger & { event_key: string })[] = rawLedger.map((r) => ({
      id: r.id,
      delta: Number(r.delta),
      reason: r.reason,
      occurred_at: new Date(r.occurred_at),
      lot_id: r.lot_id,
      metadata: r.metadata ?? null,
      event_key: r.event_key,
    }));

    // -------------------------------------------------------------------
    // Pre-scan: which lots ALREADY have a `consume_debt_settlement` row
    // in the ledger? Two sources can produce one:
    //   - the engine fix (purchasePackage), with event_key
    //     `${purchaseEventKey}:settle` and lot_id set on the row.
    //   - a prior run of THIS backfill, with event_key
    //     `settle:lot:<lotId>` and lot_id set on the row.
    //
    // For any lot already in this set, we must NOT generate a new planned
    // entry — doing so would (a) write an additional settlement row under
    // a different event_key namespace and (b) decrement
    // `credit_lots.qty_remaining` a second time. The replay loop also
    // skips the per-purchase decrement for these lots; the existing
    // `consume_debt_settlement` row's `metadata.lotConsumptions` will
    // apply the decrement to `replay[]` when we walk it, so FIFO state
    // for downstream consumes stays correct.
    // -------------------------------------------------------------------
    const lotsAlreadySettled = new Set<string>();
    for (const row of ledger) {
      if (row.reason !== "consume_debt_settlement") continue;
      if (row.lot_id) lotsAlreadySettled.add(row.lot_id);
      const lc = (row.metadata?.lotConsumptions as
        | { lotId: string; qty: number }[]
        | undefined) ?? null;
      if (lc && Array.isArray(lc)) {
        for (const r of lc) lotsAlreadySettled.add(r.lotId);
      }
    }

    // -------------------------------------------------------------------
    // FIFO replay with the purchase-time settlement fix applied. We track
    // each lot's `replayed_qty_remaining` separately from its current DB
    // value so we can compare at the end.
    // -------------------------------------------------------------------
    const replay = new Map<string, number>();
    for (const l of lots) replay.set(l.id, l.qty_total);

    let wallet = 0;
    const planned: PlannedSettlement[] = [];

    for (const row of ledger) {
      if (row.reason === "purchase" && row.delta > 0) {
        const preBalance = wallet;
        wallet += row.delta;
        if (!row.lot_id) continue;
        const lot = lotById.get(row.lot_id);
        if (!lot) continue;
        if (preBalance < 0) {
          // If this lot already has a settlement row in the ledger, the
          // engine (or a prior backfill) has already handled it. Leave
          // `replay[lot]` unchanged here — the settlement row, processed
          // below, will apply its own decrement, so the FIFO state stays
          // consistent for downstream consumes. Do NOT add to `planned`.
          if (lotsAlreadySettled.has(lot.id)) continue;
          const settleAmount = Math.min(row.delta, -preBalance);
          const cur = replay.get(lot.id) ?? lot.qty_total;
          const after = Math.max(0, cur - settleAmount);
          replay.set(lot.id, after);
          planned.push({
            lotId: lot.id,
            settleAmount,
            preBalance,
            qtyTotal: lot.qty_total,
            qtyRemainingAfter: after,
            purchasedAt: lot.purchased_at,
            purchaseEventKey: row.event_key,
          });
        }
      } else if (row.reason === "consume_debt_settlement") {
        // Already represents a previous backfill run for this lot. Apply
        // its planned decrement here so subsequent FIFO replay sees the
        // post-settlement lot state, but do NOT add to `planned` (we only
        // emit ONE settlement row per lot).
        const lc = (row.metadata?.lotConsumptions as
          | { lotId: string; qty: number }[]
          | undefined) ?? null;
        if (lc && Array.isArray(lc)) {
          for (const r of lc) {
            const cur = replay.get(r.lotId);
            if (cur === undefined) continue;
            replay.set(r.lotId, Math.max(0, cur - Number(r.qty)));
          }
        }
        // delta=0 ⇒ wallet unchanged.
      } else if (row.reason === "consume" && row.delta < 0) {
        let toConsume = -row.delta;
        wallet += row.delta;
        // 1. Preferred lot from the original consume row.
        if (row.lot_id) {
          const cur = replay.get(row.lot_id);
          if (cur !== undefined && cur > 0) {
            const take = Math.min(cur, toConsume);
            replay.set(row.lot_id, cur - take);
            toConsume -= take;
          }
        }
        // 2. FIFO across remaining lots eligible at occurred_at.
        if (toConsume > 0) {
          for (const lot of lots) {
            if (toConsume <= 0) break;
            const cur = replay.get(lot.id) ?? 0;
            if (cur <= 0) continue;
            if (lot.purchased_at > row.occurred_at) continue;
            if (lot.expires_at && lot.expires_at <= row.occurred_at) continue;
            const take = Math.min(cur, toConsume);
            replay.set(lot.id, cur - take);
            toConsume -= take;
          }
        }
        // Anything left becomes wallet debt (already reflected in `wallet`).
      } else if (
        (row.reason === "refund" || row.reason === "makeup" ||
         row.reason === "refund_dup_consume") &&
        row.delta > 0
      ) {
        wallet += row.delta;
        const lc = (row.metadata?.lotConsumptions as
          | { lotId: string; qty: number }[]
          | undefined) ?? null;
        if (lc && Array.isArray(lc)) {
          let toRestock = row.delta;
          for (const r of lc) {
            if (toRestock <= 0) break;
            const lot = lotById.get(r.lotId);
            if (!lot) continue;
            const cur = replay.get(lot.id) ?? 0;
            const headroom = lot.qty_total - cur;
            if (headroom <= 0) continue;
            const give = Math.min(headroom, Number(r.qty), toRestock);
            replay.set(lot.id, cur + give);
            toRestock -= give;
          }
        }
      } else if (row.reason === "expiry" && row.delta < 0 && row.lot_id) {
        wallet += row.delta;
        replay.set(row.lot_id, 0);
      } else {
        // manual, money_*, undo_debt_writeoff, refund_*, etc. — wallet only.
        wallet += row.delta;
      }
    }

    if (planned.length === 0) continue;

    // -------------------------------------------------------------------
    // Apply: write one settlement row per planned lot. Deterministic
    // event_key `settle:lot:<lotId>` makes this idempotent across reruns.
    // -------------------------------------------------------------------
    for (const p of planned) {
      const eventKey = `settle:lot:${p.lotId}`;
      totalLotsTouched += 1;
      totalCreditsSettled += p.settleAmount;

      if (!apply) continue;

      await db.transaction(async (tx) => {
        // Lock wallet (also creates if missing) — we only use the lock to
        // serialise concurrent runs; we do NOT mutate wallet here because
        // settlement delta is 0.
        await tx.execute(sql`
          INSERT INTO player_credit_balance (player_id, academy_id, type, credits)
          VALUES (${t.player_id}, ${t.academy_id}, ${t.type}, 0)
          ON CONFLICT (player_id, academy_id, type) DO NOTHING
        `);
        const balRow = (await tx.execute(sql`
          SELECT credits::numeric AS credits FROM player_credit_balance
          WHERE player_id = ${t.player_id}
            AND academy_id = ${t.academy_id}
            AND type = ${t.type}
          FOR UPDATE
        `)).rows[0] as { credits: string | number } | undefined;
        const currentWallet = balRow ? Number(balRow.credits) : 0;

        const ins = await tx.execute(sql`
          INSERT INTO credit_ledger_v2 (
            player_id, academy_id, type, delta, reason, event_key,
            actor_id, actor_role, lot_id, balance_after, metadata, occurred_at
          ) VALUES (
            ${t.player_id}, ${t.academy_id}, ${t.type},
            0, 'consume_debt_settlement', ${eventKey},
            ${actor === "system" ? null : actor},
            ${actor === "system" ? "system" : "admin"},
            ${p.lotId}, ${currentWallet},
            ${JSON.stringify({
              task: 1443,
              kind: "backfill_debt_settlement",
              settleAmount: p.settleAmount,
              lotQtyTotal: p.qtyTotal,
              lotQtyRemainingAfter: p.qtyRemainingAfter,
              preBalance: p.preBalance,
              purchaseEventKey: p.purchaseEventKey,
              lotConsumptions: [{ lotId: p.lotId, qty: p.settleAmount }],
              note: "Backfilled purchase-time settlement (Task #1443).",
            })}::jsonb,
            ${p.purchasedAt}
          )
          ON CONFLICT (event_key) DO NOTHING
          RETURNING id
        `);
        const insertedRows = (ins as unknown as { rowCount?: number }).rowCount ?? 0;
        if (insertedRows === 0) return;
        totalSettlementRowsWritten += 1;

        // Update the lot's current qty_remaining by subtracting settle, but
        // never below 0 (subsequent consumes may already have drained it).
        const lotRow = (await tx.execute(sql`
          SELECT qty_remaining::numeric AS qty_remaining, qty_total::numeric AS qty_total
          FROM credit_lots
          WHERE id = ${p.lotId}
          FOR UPDATE
        `)).rows[0] as { qty_remaining: string | number; qty_total: string | number } | undefined;
        if (!lotRow) return;
        const curLot = Number(lotRow.qty_remaining);
        const newLot = Math.max(0, curLot - p.settleAmount);
        await tx.execute(sql`
          UPDATE credit_lots
          SET qty_remaining = ${newLot},
              status = CASE WHEN ${newLot} <= 0 THEN 'depleted' ELSE status END
          WHERE id = ${p.lotId}
        `);
      });
    }
  }

  console.log(`\nDone.`);
  console.log(`  Lots needing settlement:    ${totalLotsTouched}`);
  console.log(`  Credits settled:            ${totalCreditsSettled}`);
  console.log(`  Settlement rows written:    ${totalSettlementRowsWritten}`);
  if (!apply) {
    console.log(`\n[DRY-RUN] no changes applied. Re-run with --apply --actor <userId>.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
