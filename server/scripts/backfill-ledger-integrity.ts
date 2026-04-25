/**
 * server/scripts/backfill-ledger-integrity.ts — Task #1338.
 *
 * Closes the two open V2 ledger holes by emitting paired refund rows for
 * every stale `consume` ledger entry currently sitting on Supabase:
 *
 *   PASS A — cancelled-session over-charges
 *     For every `credit_ledger_v2` row with reason='consume', delta < 0,
 *     joined to a `sessions.status='cancelled'` and a session_players row
 *     with attendance_status='present', AND no matching positive refund row
 *     exists for the same session_player_id, write a paired
 *     +ABS(delta) `refund_cancelled_session` row via `manualAdjustment`.
 *     eventKey: `cancelled-session-refund:<session_player_id>`.
 *
 *   PASS B — ghost orphan rows
 *     For every `credit_ledger_v2` row with reason='consume', delta < 0,
 *     session_player_id NOT NULL, where NO session_player exists with that
 *     id, AND no matching positive refund row exists, write a paired
 *     +ABS(delta) `refund_orphan_consume` row via `manualAdjustment`.
 *     eventKey: `orphan-refund:<session_player_id>`.
 *
 * Both passes are deterministic + idempotent: re-running with --apply on a
 * clean DB is a no-op (DuplicateEventError swallowed by manualAdjustment).
 *
 * Usage:
 *   tsx server/scripts/backfill-ledger-integrity.ts            # dry-run summary
 *   tsx server/scripts/backfill-ledger-integrity.ts --apply    # commit refunds
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { manualAdjustment } from "../services/credit-engine";

interface StaleRow {
  ledger_id: string;
  player_id: string;
  academy_id: string;
  type: string;
  delta: string | number;
  session_player_id: string;
  session_id: string | null;
}

const REFUND_REASONS_SQL = sql`(
  'refund',
  'refund_cancelled_session',
  'refund_attendance_correction',
  'refund_player_removed',
  'refund_orphan_consume'
)`;

async function fetchPassA(): Promise<StaleRow[]> {
  const result = await db.execute(sql`
    SELECT
      l.id                AS ledger_id,
      l.player_id         AS player_id,
      l.academy_id        AS academy_id,
      l.type              AS type,
      l.delta::numeric    AS delta,
      l.session_player_id AS session_player_id,
      l.session_id        AS session_id
    FROM credit_ledger_v2 l
    JOIN sessions s         ON s.id = l.session_id
    JOIN session_players sp ON sp.id = l.session_player_id
    WHERE l.reason = 'consume'
      AND l.delta < 0
      AND s.status = 'cancelled'
      AND sp.attendance_status = 'present'
      AND NOT EXISTS (
        SELECT 1 FROM credit_ledger_v2 r
        WHERE r.session_player_id = l.session_player_id
          AND r.delta > 0
          AND r.reason IN ${REFUND_REASONS_SQL}
      )
    ORDER BY l.occurred_at ASC, l.id ASC
  `);
  return result.rows as unknown as StaleRow[];
}

async function fetchPassB(): Promise<StaleRow[]> {
  const result = await db.execute(sql`
    SELECT
      l.id                AS ledger_id,
      l.player_id         AS player_id,
      l.academy_id        AS academy_id,
      l.type              AS type,
      l.delta::numeric    AS delta,
      l.session_player_id AS session_player_id,
      l.session_id        AS session_id
    FROM credit_ledger_v2 l
    WHERE l.reason = 'consume'
      AND l.delta < 0
      AND l.session_player_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM session_players sp WHERE sp.id = l.session_player_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM credit_ledger_v2 r
        WHERE r.session_player_id = l.session_player_id
          AND r.delta > 0
          AND r.reason IN ${REFUND_REASONS_SQL}
      )
    ORDER BY l.occurred_at ASC, l.id ASC
  `);
  return result.rows as unknown as StaleRow[];
}

async function refundOne(
  row: StaleRow,
  ledgerReason: "refund_cancelled_session" | "refund_orphan_consume",
  eventKey: string,
  apply: boolean,
): Promise<"refunded" | "already" | "skipped"> {
  if (!apply) return "refunded"; // dry-run accounting
  try {
    const result = await manualAdjustment({
      playerId: row.player_id,
      academyId: row.academy_id,
      type: row.type as "group" | "semi_private" | "private",
      delta: Math.abs(Number(row.delta)),
      reason: ledgerReason,
      ledgerReason,
      actorId: "system",
      actorRole: "system",
      eventKey,
      sessionId: row.session_id,
      sessionPlayerId: row.session_player_id,
    });
    return result.alreadyApplied ? "already" : "refunded";
  } catch (err) {
    console.error(
      `  ! Failed to refund ledger row ${row.ledger_id} (sp=${row.session_player_id}):`,
      err,
    );
    return "skipped";
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");

  console.log(
    `\n========================================================================`,
  );
  console.log(
    `  Task #1338 — V2 ledger integrity backfill  ${apply ? "[APPLY]" : "[DRY-RUN]"}`,
  );
  console.log(
    `========================================================================\n`,
  );

  // -----------------------------------------------------------------------
  // PASS A — cancelled-session over-charges
  // -----------------------------------------------------------------------
  console.log(`[Pass A] Cancelled-session over-charges`);
  const passA = await fetchPassA();
  console.log(`  Stale rows: ${passA.length}`);

  let aRefunded = 0;
  let aAlready = 0;
  let aSkipped = 0;
  let aCreditsReturned = 0;
  for (const row of passA) {
    const eventKey = `cancelled-session-refund:${row.session_player_id}`;
    const amount = Math.abs(Number(row.delta));
    console.log(
      `  - sp=${row.session_player_id} player=${row.player_id} type=${row.type} delta=${row.delta} -> +${amount} (${eventKey})`,
    );
    const r = await refundOne(row, "refund_cancelled_session", eventKey, apply);
    if (r === "refunded") {
      aRefunded++;
      aCreditsReturned += amount;
    } else if (r === "already") {
      aAlready++;
    } else {
      aSkipped++;
    }
  }
  console.log(
    `  Pass A summary: refunded=${aRefunded} already_refunded=${aAlready} skipped=${aSkipped} credits_returned=${aCreditsReturned}`,
  );

  // -----------------------------------------------------------------------
  // PASS B — ghost orphan rows
  // -----------------------------------------------------------------------
  console.log(`\n[Pass B] Ghost orphan consume rows`);
  const passB = await fetchPassB();
  console.log(`  Stale rows: ${passB.length}`);

  let bRefunded = 0;
  let bAlready = 0;
  let bSkipped = 0;
  let bCreditsReturned = 0;
  for (const row of passB) {
    const eventKey = `orphan-refund:${row.session_player_id}`;
    const amount = Math.abs(Number(row.delta));
    console.log(
      `  - sp=${row.session_player_id} player=${row.player_id} type=${row.type} delta=${row.delta} -> +${amount} (${eventKey})`,
    );
    const r = await refundOne(row, "refund_orphan_consume", eventKey, apply);
    if (r === "refunded") {
      bRefunded++;
      bCreditsReturned += amount;
    } else if (r === "already") {
      bAlready++;
    } else {
      bSkipped++;
    }
  }
  console.log(
    `  Pass B summary: refunded=${bRefunded} already_refunded=${bAlready} skipped=${bSkipped} credits_returned=${bCreditsReturned}`,
  );

  console.log(`\n[Total]`);
  console.log(`  Rows scanned       : ${passA.length + passB.length}`);
  console.log(`  Rows refunded      : ${aRefunded + bRefunded}`);
  console.log(`  Already refunded   : ${aAlready + bAlready}`);
  console.log(`  Skipped (errored)  : ${aSkipped + bSkipped}`);
  console.log(`  Credits returned   : ${aCreditsReturned + bCreditsReturned}`);
  console.log(`\n${apply ? "Done." : "(dry-run — re-run with --apply to commit)"}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill-ledger-integrity] Fatal:", err);
  process.exit(1);
});
