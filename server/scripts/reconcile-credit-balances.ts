/**
 * server/scripts/reconcile-credit-balances.ts — Task #1332.
 *
 * One-shot reconciliation of the V2 credit state on Supabase. After this runs
 * we expect:
 *   - 0 duplicate `reason='consume'` rows for the same `session_player_id`
 *     (defensive — currently 0 on prod; partial unique idx prevents new ones).
 *   - 0 rows in `player_credit_balance` with `credits < 0`.
 *   - `player_credit_balance.credits` always equals SUM(credit_ledger_v2.delta)
 *     for the same (player, academy, type).
 *   - `credit_lots.qty_remaining` re-derived by FIFO replay of every consume
 *     row in the ledger (oldest non-expired lot first, status flipped to
 *     `depleted` when emptied).
 *   - `packages.remaining_credits` resynced from canonical lot state via
 *     `credit_lots.source_package_id` (V1 packages mirror V2 canonical truth).
 *   - Every `session_players` row with `attendance_status IN ('present','late')`
 *     + `sessions.status = 'completed'` + `credit_deducted_at IS NULL` either
 *     stamped (when a matching V2 consume row exists) or left alone (when no
 *     V2 ledger row exists — coach action required).
 *
 * Audit trail: every wallet write-off creates a `manual` ledger row, and
 * every duplicate-consume rollback creates a `refund_dup_consume` ledger row,
 * so the forensic chain is preserved. eventKeys are deterministic so
 * re-running the script is a no-op for already-reconciled players.
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

interface RawLotRow {
  id: string;
  qty_total: string | number;
  qty_remaining: string | number;
  purchased_at: string | Date;
  expires_at: string | Date | null;
  status: string;
}

interface RawLedgerRow {
  id: string;
  delta: string | number;
  reason: string;
  occurred_at: string | Date;
  lot_id: string | null;
  session_player_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface RawWalletRow {
  credits: string | number;
}

interface RawDupRow {
  session_player_id: string;
  oldest_id: string;
  oldest_event_key: string;
  oldest_occurred_at: string | Date;
  dup_id: string;
  dup_event_key: string;
  dup_delta: string | number;
  dup_occurred_at: string | Date;
}

interface RawStampRow {
  sp_id: string;
  occurred_at: string;
  ledger_id: string;
}

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
  // 2) DEDUP duplicate `reason='consume'` rows BEFORE we touch lots/wallet,
  //    so the FIFO replay below sees the canonical (deduplicated) ledger.
  //    For each `session_player_id` with >1 consume row we keep the oldest
  //    and emit a `refund_dup_consume` rollback row for every duplicate
  //    (deterministic eventKey, ON CONFLICT DO NOTHING ⇒ idempotent re-runs).
  //
  //    NOTE: production is currently at 0 duplicate consume rows (verified
  //    Apr 25, 2026) thanks to the per-`session_player` event_key contract
  //    + the new `credit_ledger_v2_no_dup_consume` partial unique index.
  //    This step is defensive — it makes the reconcile self-contained for
  //    any future environment where the contract was broken before the
  //    index landed.
  // ----------------------------------------------------------------------
  console.log(`\n[Step 1/4] Dedup duplicate consume rows...`);
  const dupQuery = playerFilter
    ? sql`
        WITH dups AS (
          SELECT session_player_id,
                 (array_agg(id ORDER BY occurred_at ASC, id ASC))[1] AS oldest_id,
                 (array_agg(event_key ORDER BY occurred_at ASC, id ASC))[1] AS oldest_event_key,
                 (array_agg(occurred_at ORDER BY occurred_at ASC, id ASC))[1] AS oldest_occurred_at
          FROM credit_ledger_v2
          WHERE reason = 'consume' AND session_player_id IS NOT NULL
            AND player_id = ${playerFilter}
          GROUP BY session_player_id
          HAVING COUNT(*) > 1
        )
        SELECT d.session_player_id,
               d.oldest_id, d.oldest_event_key, d.oldest_occurred_at,
               cl.id AS dup_id, cl.event_key AS dup_event_key,
               cl.delta::numeric AS dup_delta, cl.occurred_at AS dup_occurred_at
        FROM dups d
        JOIN credit_ledger_v2 cl
          ON cl.session_player_id = d.session_player_id
         AND cl.reason = 'consume'
         AND cl.id <> d.oldest_id
        ORDER BY d.session_player_id, cl.occurred_at
      `
    : sql`
        WITH dups AS (
          SELECT session_player_id,
                 (array_agg(id ORDER BY occurred_at ASC, id ASC))[1] AS oldest_id,
                 (array_agg(event_key ORDER BY occurred_at ASC, id ASC))[1] AS oldest_event_key,
                 (array_agg(occurred_at ORDER BY occurred_at ASC, id ASC))[1] AS oldest_occurred_at
          FROM credit_ledger_v2
          WHERE reason = 'consume' AND session_player_id IS NOT NULL
          GROUP BY session_player_id
          HAVING COUNT(*) > 1
        )
        SELECT d.session_player_id,
               d.oldest_id, d.oldest_event_key, d.oldest_occurred_at,
               cl.id AS dup_id, cl.event_key AS dup_event_key,
               cl.delta::numeric AS dup_delta, cl.occurred_at AS dup_occurred_at
        FROM dups d
        JOIN credit_ledger_v2 cl
          ON cl.session_player_id = d.session_player_id
         AND cl.reason = 'consume'
         AND cl.id <> d.oldest_id
        ORDER BY d.session_player_id, cl.occurred_at
      `;
  const dupResult = await db.execute(dupQuery);
  const dupRows = dupResult.rows as unknown as RawDupRow[];
  console.log(`  - duplicate consume rows: ${dupRows.length}`);

  if (apply && dupRows.length > 0) {
    let voided = 0;
    for (const d of dupRows) {
      // Look up the (player_id, academy_id, type) of the dup row.
      const ctx = await db.execute(sql`
        SELECT player_id, academy_id, type FROM credit_ledger_v2 WHERE id = ${d.dup_id} LIMIT 1
      `);
      const ctxRow = ctx.rows[0] as { player_id: string; academy_id: string; type: string } | undefined;
      if (!ctxRow) continue;
      const restock = -Number(d.dup_delta); // dup.delta is negative ⇒ restock is positive
      const eventKey = `task-1332-dedup-refund:${d.dup_id}`;

      // 1. Write the audit refund row (+restock) so wallet math still
      //    sums to the single canonical consume.
      await db.execute(sql`
        INSERT INTO credit_ledger_v2 (
          player_id, academy_id, type, delta, reason, event_key,
          actor_id, actor_role, balance_after, metadata, occurred_at
        ) VALUES (
          ${ctxRow.player_id}, ${ctxRow.academy_id}, ${ctxRow.type},
          ${restock}, 'refund_dup_consume', ${eventKey},
          'system', 'system', 0,
          ${JSON.stringify({
            task: 1332,
            kind: "duplicate_consume_rollback",
            duplicate_of: d.oldest_event_key,
            original_id: d.oldest_id,
            original_occurred_at: d.oldest_occurred_at,
            duplicate_id: d.dup_id,
            duplicate_event_key: d.dup_event_key,
            duplicate_occurred_at: d.dup_occurred_at,
            note: "Duplicate consume row neutralized by Task #1332 reconcile.",
          })}::jsonb,
          NOW()
        )
        ON CONFLICT (event_key) DO NOTHING
      `);

      // 2. Materially dedupe: rename the duplicate row's reason from
      //    'consume' to 'consume_voided_dup' so:
      //      - the verification query GROUP BY session_player_id HAVING
      //        COUNT(*) > 1 against reason='consume' returns 0,
      //      - the partial unique idx credit_ledger_v2_no_dup_consume
      //        (WHERE reason='consume') no longer holds this row,
      //      - the row remains in the ledger as audit history (delta
      //        unchanged, original event_key unchanged).
      //    Net wallet math: original_consume(-X) + voided_dup(-X) +
      //    refund_dup_consume(+X) = -X (matches single canonical consume).
      const voidUpd = await db.execute(sql`
        UPDATE credit_ledger_v2
        SET reason = 'consume_voided_dup'
        WHERE id = ${d.dup_id} AND reason = 'consume'
      `);
      voided += Number((voidUpd as unknown as { rowCount?: number }).rowCount ?? 0);
    }
    console.log(`  - refund_dup_consume rows written: ${dupRows.length}`);
    console.log(`  - duplicate consume rows voided:  ${voided}`);
  }

  // ----------------------------------------------------------------------
  // 3) ENUMERATE every (player, academy, type) key that has either a wallet
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

  console.log(`\n[Step 2/4] Reconciling ${keys.length} (player,academy,type) keys...`);

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

    const rawLots = lotsR.rows as unknown as RawLotRow[];
    const lots: Lot[] = rawLots.map((r) => ({
      id: r.id,
      qty_total: Number(r.qty_total),
      qty_remaining: Number(r.qty_remaining),
      purchased_at: new Date(r.purchased_at),
      expires_at: r.expires_at ? new Date(r.expires_at) : null,
      status: r.status,
    }));

    const rawLedger = ledgerR.rows as unknown as RawLedgerRow[];
    const ledger: LedgerRow[] = rawLedger.map((r) => ({
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
    //   3. For every REFUND/MAKEUP row WITH `metadata.lotConsumptions`:
    //      restock the referenced lots (no fallback — see comment below).
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
        (row.reason === "refund" || row.reason === "makeup" ||
         row.reason === "refund_dup_consume") &&
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
    // Wallet reconciliation. Canonical balance = SUM(ledger.delta) AFTER
    // dedup writes from Step 1 (those rows are already in `ledger` if we
    // re-fetched after apply, but in dry-run mode they're not — so we
    // factor them in manually below for accurate dry-run metrics).
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
    const walletRowTyped = walletRow.rows[0] as RawWalletRow | undefined;
    const currentWallet = walletRowTyped ? Number(walletRowTyped.credits) : null;

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
  // 4) SYNC `packages.remaining_credits` from canonical lot state.
  //    Each V2 lot points back to its source V1 package via
  //    `credit_lots.source_package_id`. We aggregate qty_remaining by
  //    source_package_id and rewrite packages.remaining_credits to match.
  //    Packages with no surviving lots are NOT zeroed here (they may have
  //    been fully consumed pre-V2 — leaving the V1 mirror untouched is
  //    safer than guessing).
  // ----------------------------------------------------------------------
  console.log(`\n[Step 3/4] Syncing packages.remaining_credits from canonical lot state...`);
  // When --player is set, scope BOTH the preview and the update to that
  // player's lots so a targeted run never silently mutates other players'
  // packages. Otherwise reconcile the full table.
  const pkgPreview = playerFilter
    ? await db.execute(sql`
        WITH lot_sums AS (
          SELECT source_package_id, SUM(qty_remaining::numeric) AS qty_rem
          FROM credit_lots
          WHERE source_package_id IS NOT NULL
            AND player_id = ${playerFilter}
          GROUP BY source_package_id
        )
        SELECT COUNT(*)::int AS n
        FROM packages p
        JOIN lot_sums ls ON ls.source_package_id = p.id
        WHERE p.remaining_credits::numeric <> ls.qty_rem
      `)
    : await db.execute(sql`
        WITH lot_sums AS (
          SELECT source_package_id, SUM(qty_remaining::numeric) AS qty_rem
          FROM credit_lots
          WHERE source_package_id IS NOT NULL
          GROUP BY source_package_id
        )
        SELECT COUNT(*)::int AS n
        FROM packages p
        JOIN lot_sums ls ON ls.source_package_id = p.id
        WHERE p.remaining_credits::numeric <> ls.qty_rem
      `);
  const pkgDriftCount = Number((pkgPreview.rows[0] as { n: number } | undefined)?.n ?? 0);
  console.log(`  - packages with drift: ${pkgDriftCount}${playerFilter ? `  (scoped to player ${playerFilter})` : ""}`);

  let packagesUpdated = 0;
  if (apply && pkgDriftCount > 0) {
    const pkgUpdate = playerFilter
      ? await db.execute(sql`
          WITH lot_sums AS (
            SELECT source_package_id, SUM(qty_remaining::numeric) AS qty_rem
            FROM credit_lots
            WHERE source_package_id IS NOT NULL
              AND player_id = ${playerFilter}
            GROUP BY source_package_id
          )
          UPDATE packages p
          SET remaining_credits = ls.qty_rem
          FROM lot_sums ls
          WHERE p.id = ls.source_package_id
            AND p.remaining_credits::numeric <> ls.qty_rem
        `)
      : await db.execute(sql`
          WITH lot_sums AS (
            SELECT source_package_id, SUM(qty_remaining::numeric) AS qty_rem
            FROM credit_lots
            WHERE source_package_id IS NOT NULL
            GROUP BY source_package_id
          )
          UPDATE packages p
          SET remaining_credits = ls.qty_rem
          FROM lot_sums ls
          WHERE p.id = ls.source_package_id
            AND p.remaining_credits::numeric <> ls.qty_rem
        `);
    packagesUpdated = Number(
      (pkgUpdate as unknown as { rowCount?: number }).rowCount ?? pkgDriftCount,
    );
    console.log(`  - packages updated:   ${packagesUpdated}`);
  }

  // ----------------------------------------------------------------------
  // 5) STAMP credit_deducted_at on the legacy NULL-flag rows that already
  //    have a V2 consume row in the ledger. This neutralizes the cron
  //    re-discovery loop without touching balances.
  // ----------------------------------------------------------------------
  console.log(`\n[Step 4/4] Stamping credit_deducted_at on legacy NULL rows...`);
  // Scope to --player when set so a targeted run only touches their rows.
  const stampSelect = playerFilter
    ? await db.execute(sql`
        WITH null_flag AS (
          SELECT sp.id
          FROM session_players sp
          JOIN sessions s ON s.id = sp.session_id
          WHERE s.status = 'completed'
            AND sp.attendance_status IN ('present','late')
            AND sp.credit_deducted_at IS NULL
            AND sp.player_id = ${playerFilter}
        ),
        v2_consumes AS (
          SELECT session_player_id,
                 MIN(occurred_at) AS occurred_at,
                 (array_agg(id ORDER BY occurred_at ASC))[1] AS ledger_id
          FROM credit_ledger_v2
          WHERE reason='consume' AND session_player_id IS NOT NULL
            AND player_id = ${playerFilter}
          GROUP BY session_player_id
        )
        SELECT nf.id AS sp_id, vc.occurred_at, vc.ledger_id
        FROM null_flag nf
        JOIN v2_consumes vc ON vc.session_player_id = nf.id
      `)
    : await db.execute(sql`
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
  const stampRows = stampSelect.rows as unknown as RawStampRow[];

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
    stamped = Number(
      (updateRes as unknown as { rowCount?: number }).rowCount ?? stampRows.length,
    );
    console.log(`  - rows stamped:      ${stamped}`);
  }

  // ----------------------------------------------------------------------
  // 6) POST-FIX METRICS
  // ----------------------------------------------------------------------
  if (apply) await printMetrics("AFTER");
  else console.log(`\n[DRY-RUN] No writes performed. Re-run with --apply.`);

  console.log(`\nDone.\n`);
  process.exit(0);
}

interface MetricsRow {
  total_v2_balances: number;
  negative_wallets: number;
  wallet_neq_ledger: number;
  impossible_neg: number;
  null_flag_rows: number;
  dup_consume_rows: number;
  packages_drift: number;
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
    ),
    pkg_drift AS (
      SELECT COUNT(*)::int AS n
      FROM packages p
      JOIN (
        SELECT source_package_id, SUM(qty_remaining::numeric) AS qty_rem
        FROM credit_lots WHERE source_package_id IS NOT NULL
        GROUP BY source_package_id
      ) ls ON ls.source_package_id = p.id
      WHERE p.remaining_credits::numeric <> ls.qty_rem
    )
    SELECT
      (SELECT COUNT(*) FROM wallets)::int AS total_v2_balances,
      (SELECT COUNT(*) FROM wallets WHERE wallet < 0)::int AS negative_wallets,
      (SELECT COUNT(*) FROM wallets WHERE wallet != ledger_total)::int AS wallet_neq_ledger,
      (SELECT COUNT(*) FROM wallets WHERE wallet < 0 AND lot_remaining > 0)::int AS impossible_neg,
      (SELECT n FROM null_flag) AS null_flag_rows,
      (SELECT n FROM dup_consume) AS dup_consume_rows,
      (SELECT n FROM pkg_drift) AS packages_drift
  `);
  const row = m.rows[0] as unknown as MetricsRow;
  console.log(`\n--- METRICS [${label}] ---`);
  console.log(`  total V2 wallets:          ${row.total_v2_balances}`);
  console.log(`  negative wallets:          ${row.negative_wallets}   (target 0)`);
  console.log(`  wallet ≠ ledger sum:       ${row.wallet_neq_ledger}   (target 0)`);
  console.log(`  impossible (neg+lots>0):   ${row.impossible_neg}   (target 0)`);
  console.log(`  NULL credit_deducted_at:   ${row.null_flag_rows}   (target 0)`);
  console.log(`  duplicate consume rows:    ${row.dup_consume_rows}   (target 0)`);
  console.log(`  packages drift vs lots:    ${row.packages_drift}   (target 0)`);
}

main().catch((err) => {
  console.error("[reconcile-credit-balances] FATAL:", err);
  process.exit(1);
});
