/**
 * scripts/credit-replay.ts
 *
 * Phase 1 — chronological reconstruction of an academy's credit history into
 * the new Credit Engine V2 tables. **Read-only** for legacy data; only writes
 * to the new V2 tables (`credit_lots`, `credit_ledger_v2`,
 * `player_credit_balance`).
 *
 * Idempotent: every event has a deterministic `event_key`. Re-running the
 * script after partial completion or on top of an already-replayed academy is
 * safe — duplicate events become no-ops via the engine's `DuplicateEventError`
 * unique-constraint guard.
 *
 * Usage:
 *   npx tsx scripts/credit-replay.ts --academy <academyId>
 *   npx tsx scripts/credit-replay.ts --academy <academyId> --dry-run
 *   npx tsx scripts/credit-replay.ts --all
 *
 * Output: per-academy summary (purchases, consumes, refunds counted,
 * skipped, errors) printed to stdout. Does NOT enable the
 * `use_new_credit_system` flag — that's a separate manual decision after the
 * shadow-mode comparison.
 */

import { sql } from "drizzle-orm";
import { db } from "../server/db";
import {
  purchasePackage,
  consumeCredit,
  refundCredit,
  expireCredits,
  type CreditType,
} from "../server/services/credit-engine";

interface ReplayStats {
  academyId: string;
  packagesProcessed: number;
  packagesSkipped: number;
  consumesProcessed: number;
  consumesSkipped: number;
  consumesNotCharged: number;
  refundsProcessed: number;
  refundsSkipped: number;
  errors: number;
  errorDetails: string[];
}

function normalizeCreditType(type: string | null | undefined): CreditType {
  const t = (type || "group").toLowerCase();
  if (t === "private") return "private";
  if (t === "semi_private" || t === "semi-private" || t === "semi") return "semi_private";
  // 'court' and anything else falls back to 'group' (court credits aren't
  // session credits — they're handled separately in the booking system).
  return "group";
}

// Authoritative test/demo flag lives on `players.is_test`. Replay reads it
// per-row from the joined query — never inferred from name/email heuristics.

async function listAcademyIds(): Promise<string[]> {
  const result = await db.execute(sql`SELECT id FROM academies ORDER BY created_at ASC`);
  return result.rows.map((r) => (r as { id: string }).id);
}

async function replayAcademy(academyId: string, dryRun: boolean): Promise<ReplayStats> {
  const stats: ReplayStats = {
    academyId,
    packagesProcessed: 0,
    packagesSkipped: 0,
    consumesProcessed: 0,
    consumesSkipped: 0,
    consumesNotCharged: 0,
    refundsProcessed: 0,
    refundsSkipped: 0,
    errors: 0,
    errorDetails: [],
  };

  // ------------------------------------------------------------------
  // PASS 1 — packages → lots
  // ------------------------------------------------------------------
  // Only replay packages that ever produced legitimate credits. Cancelled /
  // refunded / draft packages are excluded — their credits should not appear
  // in the V2 lots. Status values match the enum used in
  // shared/schema.ts (`packages.status`): active | expired | depleted.
  // Anything else (refunded/cancelled/void/draft) is skipped.
  const packagesResult = await db.execute(sql`
    SELECT
      p.id, p.player_id, p.academy_id, p.credit_type, p.total_credits,
      p.price, p.price_per_credit, p.currency, p.purchase_date, p.expiry_date,
      p.invoice_id, p.status, p.is_paid
    FROM packages p
    JOIN players pl ON pl.id = p.player_id
    WHERE p.academy_id = ${academyId}
      AND p.player_id IS NOT NULL
      AND p.status IN ('active','expired','depleted')
      AND COALESCE(pl.is_test, false) = false
    ORDER BY p.purchase_date ASC NULLS FIRST, p.created_at ASC
  `);

  for (const raw of packagesResult.rows) {
    const pkg = raw as {
      id: string;
      player_id: string;
      academy_id: string;
      credit_type: string | null;
      total_credits: string | number;
      price: string | number | null;
      price_per_credit: string | number | null;
      currency: string | null;
      purchase_date: Date | string | null;
      expiry_date: Date | string | null;
      invoice_id: string | null;
      status: string | null;
      is_paid: boolean | null;
    };

    // Only replay packages that were actually paid for. Either the package
    // itself is_paid=true, or its linked invoice is in 'paid' status. Unpaid
    // / draft / refunded packages would phantom-mint credits.
    const isPaid = pkg.is_paid === true;
    if (!isPaid && !pkg.invoice_id) {
      stats.packagesSkipped++;
      continue;
    }
    if (!isPaid && pkg.invoice_id) {
      const inv = await db.execute(sql`
        SELECT status FROM invoices WHERE id = ${pkg.invoice_id} LIMIT 1
      `);
      const invStatus = (inv.rows[0] as { status?: string } | undefined)?.status;
      if (invStatus !== "paid") {
        stats.packagesSkipped++;
        continue;
      }
    }

    const type = normalizeCreditType(pkg.credit_type);
    if (type === "group" && pkg.credit_type === "court") {
      // 'court' isn't a session credit — skip entirely.
      stats.packagesSkipped++;
      continue;
    }

    const qty = Number(pkg.total_credits);
    if (!Number.isFinite(qty) || qty <= 0) {
      stats.packagesSkipped++;
      continue;
    }

    const totalPrice = Number(pkg.price ?? 0);
    const pricePerCredit = pkg.price_per_credit != null
      ? Number(pkg.price_per_credit)
      : qty > 0 ? totalPrice / qty : 0;

    const purchasedAt = pkg.purchase_date
      ? new Date(pkg.purchase_date)
      : new Date();
    // Preserve the exact legacy expiry instant — no month-rounding, no
    // setMonth() drift across month-end / leap-year boundaries.
    const expiresAt = pkg.expiry_date ? new Date(pkg.expiry_date) : null;

    if (dryRun) {
      stats.packagesProcessed++;
      continue;
    }

    try {
      const result = await purchasePackage({
        playerId: pkg.player_id,
        academyId: pkg.academy_id,
        type,
        qty,
        pricePerCredit,
        currency: pkg.currency ?? "AED",
        invoiceId: pkg.invoice_id,
        sourcePackageId: pkg.id,
        purchasedAt,
        expiresAt,
        actorRole: "system",
        eventKey: `purchase:pkg:${pkg.id}`,
      });
      if (result.alreadyApplied) {
        stats.packagesSkipped++;
      } else {
        stats.packagesProcessed++;
      }
    } catch (err) {
      stats.errors++;
      stats.errorDetails.push(
        `pkg ${pkg.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // PASS 2 — session_players → consumes (chronological)
  //
  // We replay in occurred-at order so FIFO across lots matches reality.
  // ------------------------------------------------------------------
  const consumesResult = await db.execute(sql`
    SELECT
      sp.id AS session_player_id,
      sp.session_id,
      sp.player_id,
      sp.attendance_status,
      s.start_time,
      s.session_type
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    JOIN players pl ON pl.id = sp.player_id
    WHERE s.academy_id = ${academyId}
      AND sp.player_id IS NOT NULL
      AND sp.attendance_status IS NOT NULL
      AND sp.attendance_status IN ('present','late','absent')
      AND COALESCE(pl.is_test, false) = false
    ORDER BY s.start_time ASC NULLS FIRST, sp.id ASC
  `);

  // Run expiry pass + consumes interleaved by chronological time. We keep
  // a "watermark" of all unique lot expiry instants for this academy and
  // flush every expiry that falls before the next consume's occurredAt.
  const expiryQueueResult = await db.execute(sql`
    SELECT DISTINCT expires_at
    FROM credit_lots
    WHERE academy_id = ${academyId} AND expires_at IS NOT NULL
    ORDER BY expires_at ASC
  `);
  const expiryQueue: Date[] = expiryQueueResult.rows
    .map((r) => (r as { expires_at: Date | string | null }).expires_at)
    .filter((d): d is Date | string => d != null)
    .map((d) => new Date(d));
  let expiryIdx = 0;

  async function flushExpiriesUpTo(asOf: Date) {
    while (expiryIdx < expiryQueue.length && expiryQueue[expiryIdx].getTime() <= asOf.getTime()) {
      const at = expiryQueue[expiryIdx++];
      if (dryRun) continue;
      try {
        await expireCredits({ academyId, asOf: at, actorRole: "system" });
      } catch (err) {
        stats.errors++;
        stats.errorDetails.push(
          `expiry@${at.toISOString()}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  for (const raw of consumesResult.rows) {
    const sp = raw as {
      session_player_id: string;
      session_id: string;
      player_id: string;
      attendance_status: string;
      start_time: Date | string | null;
      session_type: string | null;
    };

    const occurredAt = sp.start_time ? new Date(sp.start_time) : new Date();
    await flushExpiriesUpTo(occurredAt);

    if (dryRun) {
      stats.consumesProcessed++;
      continue;
    }

    try {
      const result = await consumeCredit({
        sessionPlayerId: sp.session_player_id,
        occurredAt,
        actorRole: "system",
        eventKey: `consume:${sp.session_player_id}`,
      });
      if (result.alreadyApplied) {
        stats.consumesSkipped++;
      } else if (!result.charged) {
        stats.consumesNotCharged++;
      } else {
        stats.consumesProcessed++;
      }
    } catch (err) {
      stats.errors++;
      stats.errorDetails.push(
        `sp ${sp.session_player_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // PASS 3 — legacy refunds → V2 refundCredit
  //
  // Reads `credit_transactions` rows that represent positive credit returns
  // for previously-consumed sessions (cancellations, settlements, coach
  // cancels). Each calls refundCredit with eventKey
  // `refund:legacy:<creditTransactionId>` so reruns are idempotent.
  // ------------------------------------------------------------------
  const refundsResult = await db.execute(sql`
    SELECT
      ct.id, ct.player_id, ct.session_player_id, ct.amount,
      ct.created_at, ct.reason, ct.type
    FROM credit_transactions ct
    JOIN players pl ON pl.id = ct.player_id
    WHERE ct.academy_id = ${academyId}
      AND ct.session_player_id IS NOT NULL
      AND CAST(ct.amount AS numeric) > 0
      AND (
        ct.type = 'refund'
        OR ct.reason IN ('session_cancel','session_settlement','coach_cancel')
      )
      AND COALESCE(pl.is_test, false) = false
    ORDER BY ct.created_at ASC NULLS FIRST
  `);

  for (const raw of refundsResult.rows) {
    const tx = raw as {
      id: string;
      player_id: string;
      session_player_id: string;
      amount: string | number;
      created_at: Date | string | null;
      reason: string | null;
      type: string | null;
    };

    if (dryRun) {
      stats.refundsProcessed++;
      continue;
    }

    try {
      const result = await refundCredit({
        sessionPlayerId: tx.session_player_id,
        amount: Number(tx.amount),
        policy: "force",
        actorRole: "system",
        reason: `legacy:${tx.reason ?? tx.type ?? "unknown"}`,
        eventKey: `refund:legacy:${tx.id}`,
      });
      if (result.alreadyApplied) {
        stats.refundsSkipped++;
      } else if (!result.refunded) {
        stats.refundsSkipped++;
      } else {
        stats.refundsProcessed++;
      }
    } catch (err) {
      stats.errors++;
      stats.errorDetails.push(
        `refund ${tx.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return stats;
}

function formatStats(s: ReplayStats): string {
  const lines = [
    `Academy ${s.academyId}:`,
    `  Packages: ${s.packagesProcessed} new, ${s.packagesSkipped} skipped`,
    `  Consumes: ${s.consumesProcessed} new, ${s.consumesSkipped} dup, ${s.consumesNotCharged} not-charged`,
    `  Errors:   ${s.errors}`,
  ];
  if (s.errors > 0 && s.errorDetails.length > 0) {
    lines.push("  First errors:");
    for (const d of s.errorDetails.slice(0, 5)) lines.push(`    - ${d}`);
  }
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const all = args.includes("--all");
  const academyIdx = args.indexOf("--academy");
  const academyArg = academyIdx >= 0 ? args[academyIdx + 1] : undefined;

  if (!all && !academyArg) {
    console.error(
      "Usage: tsx scripts/credit-replay.ts --academy <id> [--dry-run]\n" +
      "       tsx scripts/credit-replay.ts --all [--dry-run]",
    );
    process.exit(1);
  }

  const ids = all ? await listAcademyIds() : [academyArg as string];
  console.log(`[credit-replay] Replaying ${ids.length} academy(s) (dryRun=${dryRun})`);

  for (const id of ids) {
    const t0 = Date.now();
    const stats = await replayAcademy(id, dryRun);
    const ms = Date.now() - t0;
    console.log(formatStats(stats));
    console.log(`  Took ${ms}ms`);
  }

  console.log("[credit-replay] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[credit-replay] Fatal:", err);
  process.exit(1);
});
