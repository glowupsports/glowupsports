/**
 * server/scripts/undo-task-1332-writeoffs.ts — Task #1443.
 *
 * Reverses the 72 `task-1332-debt-writeoff:*` ledger rows that Task #1332
 * wrote on Apr 25, 2026 to silently forgive 376 credits of player debt
 * across 67 unique players (group/private/semi_private split). The original
 * write-offs were a workaround for the underlying engine bug fixed in this
 * same task: `purchasePackage` did not decrement `qty_remaining` when
 * granting a new lot to a player whose wallet was negative, leaving
 * `credit_lots` over-stating availability while the wallet kept drifting.
 *
 * For every original `manual` row with `event_key LIKE 'task-1332-debt-writeoff:%'`
 * this script writes a single reversal row:
 *   - delta   = -original.delta  (restore the forgiven debt)
 *   - reason  = 'undo_debt_writeoff'
 *   - actor   = the operator passed via --actor (CLI), defaults to 'system'
 *   - eventKey = `task-1332-undo-writeoff:<player>:<academy>:<type>`
 *     (deterministic — re-running the script is a no-op: the unique
 *      event_key index turns the second insert into ON CONFLICT DO NOTHING)
 *   - metadata.original_event_key  links back to the row being undone
 *   - metadata.original_id         the audit-source ledger row id
 *   - metadata.task                1443
 *
 * After the reversal row is written, `player_credit_balance.credits` is
 * recomputed from `SUM(credit_ledger_v2.delta)` for that (player, academy,
 * type) so the wallet reflects the restored debt immediately. This sets up
 * the engine fix (now deployed) + the per-player FIFO backfill
 * (`server/scripts/backfill-debt-settlement.ts`) to drain the over-stated
 * lots back to truth without double-charging the player.
 *
 * Usage:
 *   tsx server/scripts/undo-task-1332-writeoffs.ts                     # dry-run summary
 *   tsx server/scripts/undo-task-1332-writeoffs.ts --apply             # apply for real
 *   tsx server/scripts/undo-task-1332-writeoffs.ts --apply --actor <userId>
 *
 * IMPORTANT — run order: this MUST run BEFORE the per-lot backfill, so the
 * backfill sees the restored debt and can settle it against the existing
 * over-stated lots in the same chronological FIFO order the engine would
 * have used.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

interface WriteoffRow {
  id: string;
  player_id: string;
  academy_id: string;
  type: string;
  delta: string | number;
  event_key: string;
  metadata: Record<string, unknown> | null;
  occurred_at: string | Date;
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
    `  Task #1443 — undo Task #1332 debt write-offs  ${apply ? "[APPLY]" : "[DRY-RUN]"}`,
  );
  console.log(
    `  actor=${actor}${playerFilter ? `  player=${playerFilter}` : ""}`,
  );
  console.log(
    `========================================================================\n`,
  );

  const writeoffsQuery = playerFilter
    ? sql`
        SELECT id, player_id, academy_id, type, delta::numeric AS delta,
               event_key, metadata, occurred_at
        FROM credit_ledger_v2
        WHERE event_key LIKE 'task-1332-debt-writeoff:%'
          AND player_id = ${playerFilter}
        ORDER BY occurred_at ASC, id ASC
      `
    : sql`
        SELECT id, player_id, academy_id, type, delta::numeric AS delta,
               event_key, metadata, occurred_at
        FROM credit_ledger_v2
        WHERE event_key LIKE 'task-1332-debt-writeoff:%'
        ORDER BY occurred_at ASC, id ASC
      `;
  const writeoffs = (await db.execute(writeoffsQuery)).rows as unknown as WriteoffRow[];

  // Aggregate baseline for the operator before any writes happen.
  const totals = writeoffs.reduce(
    (acc, r) => {
      acc.rows += 1;
      const v = Number(r.delta);
      acc.delta += v;
      const k = r.type;
      acc.byType[k] = (acc.byType[k] || 0) + v;
      acc.players.add(r.player_id);
      return acc;
    },
    { rows: 0, delta: 0, byType: {} as Record<string, number>, players: new Set<string>() },
  );
  console.log(`Found ${totals.rows} write-off rows totaling +${totals.delta} credits`);
  console.log(`  unique players: ${totals.players.size}`);
  for (const [t, v] of Object.entries(totals.byType)) {
    console.log(`  ${t.padEnd(13)} +${v}`);
  }

  if (writeoffs.length === 0) {
    console.log(`\nNothing to undo. Exiting.`);
    return;
  }

  // Idempotency check — count how many reversal rows already exist so the
  // operator sees the actual delta this run will apply.
  const existing = (await db.execute(sql`
    SELECT COUNT(*)::int AS c
    FROM credit_ledger_v2
    WHERE event_key LIKE 'task-1443-undo-writeoff:%'
       OR event_key LIKE 'task-1332-undo-writeoff:%'
  `)).rows[0] as { c: number };
  console.log(`\nExisting reversal rows already in ledger: ${existing.c}`);

  if (!apply) {
    console.log(
      `\n[DRY-RUN] would write ${writeoffs.length - existing.c} new reversal rows`,
    );
    console.log(
      `Re-run with: tsx server/scripts/undo-task-1332-writeoffs.ts --apply --actor <userId>`,
    );
    return;
  }

  console.log(`\nApplying reversals...`);
  let writtenRows = 0;
  let walletsUpdated = 0;

  // Process each writeoff in its own transaction so a single failure doesn't
  // leave the script half-applied. Idempotent via deterministic event_key.
  for (const w of writeoffs) {
    const restoreAmount = -Number(w.delta);
    const reversalKey = `task-1332-undo-writeoff:${w.player_id}:${w.academy_id}:${w.type}`;

    await db.transaction(async (tx) => {
      // Lock + insert reversal row.
      await tx.execute(sql`
        INSERT INTO player_credit_balance (player_id, academy_id, type, credits)
        VALUES (${w.player_id}, ${w.academy_id}, ${w.type}, 0)
        ON CONFLICT (player_id, academy_id, type) DO NOTHING
      `);
      const balRow = (await tx.execute(sql`
        SELECT credits::numeric AS credits FROM player_credit_balance
        WHERE player_id = ${w.player_id}
          AND academy_id = ${w.academy_id}
          AND type = ${w.type}
        FOR UPDATE
      `)).rows[0] as { credits: string | number } | undefined;
      const currentBal = balRow ? Number(balRow.credits) : 0;
      const newBal = currentBal + restoreAmount;

      const ins = await tx.execute(sql`
        INSERT INTO credit_ledger_v2 (
          player_id, academy_id, type, delta, reason, event_key,
          actor_id, actor_role, balance_after, metadata, occurred_at
        ) VALUES (
          ${w.player_id}, ${w.academy_id}, ${w.type},
          ${restoreAmount}, 'undo_debt_writeoff', ${reversalKey},
          ${actor === "system" ? null : actor},
          ${actor === "system" ? "system" : "admin"},
          ${newBal},
          ${JSON.stringify({
            task: 1443,
            kind: "undo_task_1332_writeoff",
            original_id: w.id,
            original_event_key: w.event_key,
            original_delta: Number(w.delta),
            original_occurred_at: w.occurred_at,
            original_metadata: w.metadata,
            note: "Restored debt previously forgiven by Task #1332. Backfill will settle against existing lots.",
          })}::jsonb,
          NOW()
        )
        ON CONFLICT (event_key) DO NOTHING
        RETURNING id
      `);
      const inserted = (ins as unknown as { rowCount?: number }).rowCount ?? 0;
      if (inserted === 0) {
        // Already reversed — nothing to do for this row, do not touch wallet.
        return;
      }
      writtenRows += 1;

      // Recompute wallet from canonical sum so it reflects the restored debt.
      const sumRow = (await tx.execute(sql`
        SELECT COALESCE(SUM(delta), 0)::numeric AS total
        FROM credit_ledger_v2
        WHERE player_id = ${w.player_id}
          AND academy_id = ${w.academy_id}
          AND type = ${w.type}
      `)).rows[0] as { total: string | number };
      const canonical = Number(sumRow.total);
      await tx.execute(sql`
        UPDATE player_credit_balance
        SET credits = ${canonical}, updated_at = NOW()
        WHERE player_id = ${w.player_id}
          AND academy_id = ${w.academy_id}
          AND type = ${w.type}
      `);
      walletsUpdated += 1;
    });
  }

  console.log(`\nDone.`);
  console.log(`  Reversal rows written:   ${writtenRows}`);
  console.log(`  Wallets recomputed:      ${walletsUpdated}`);
  console.log(`  Skipped (already done):  ${writeoffs.length - writtenRows}`);
  console.log(
    `\nNext step: tsx server/scripts/backfill-debt-settlement.ts --apply --actor ${actor}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
