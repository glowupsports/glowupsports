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
  // Single chronological merge — purchases, consumes, refunds, expiries
  // are interleaved by timestamp into ONE event stream so lot FIFO and
  // restock semantics match the legacy timeline exactly.
  // ------------------------------------------------------------------
  type ReplayEvent =
    | { kind: "purchase"; at: Date; pkg: PkgRow }
    | { kind: "consume"; at: Date; sp: SpRow }
    | { kind: "refund"; at: Date; tx: TxRow }
    | { kind: "expiry"; at: Date };

  type PkgRow = {
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
  type SpRow = {
    session_player_id: string;
    session_id: string;
    player_id: string;
    attendance_status: string;
    start_time: Date | string | null;
    session_type: string | null;
  };
  type TxRow = {
    id: string;
    player_id: string;
    session_player_id: string;
    amount: string | number;
    created_at: Date | string | null;
    reason: string | null;
    type: string | null;
  };

  // ---------- pull packages -------------------------------------------------
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

  // ---------- pull session_players (consume sources) -----------------------
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
  `);

  // ---------- pull legacy refund credit_transactions -----------------------
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
  `);

  // ---------- filter packages for paid eligibility -------------------------
  const eligiblePkgs: PkgRow[] = [];
  const skippedPkgs = new Set<string>();
  const expiryInstants = new Set<number>();

  for (const raw of packagesResult.rows) {
    const pkg = raw as PkgRow;
    const isPaid = pkg.is_paid === true;
    if (!isPaid && !pkg.invoice_id) {
      skippedPkgs.add(pkg.id);
      continue;
    }
    if (!isPaid && pkg.invoice_id) {
      const inv = await db.execute(sql`
        SELECT status FROM invoices WHERE id = ${pkg.invoice_id} LIMIT 1
      `);
      const invStatus = (inv.rows[0] as { status?: string } | undefined)?.status;
      if (invStatus !== "paid") {
        skippedPkgs.add(pkg.id);
        continue;
      }
    }
    const type = normalizeCreditType(pkg.credit_type);
    if (type === "group" && pkg.credit_type === "court") {
      skippedPkgs.add(pkg.id);
      continue;
    }
    const qty = Number(pkg.total_credits);
    if (!Number.isFinite(qty) || qty <= 0) {
      skippedPkgs.add(pkg.id);
      continue;
    }
    eligiblePkgs.push(pkg);
    if (pkg.expiry_date) {
      expiryInstants.add(new Date(pkg.expiry_date).getTime());
    }
  }
  stats.packagesSkipped += skippedPkgs.size;

  // ---------- build the merged event stream --------------------------------
  // Stable secondary ordering: purchases before consumes before refunds at
  // the same instant, expiries last (so credits earned/used at exactly the
  // expiry instant remain valid).
  const PRIORITY: Record<ReplayEvent["kind"], number> = {
    purchase: 0,
    consume: 1,
    refund: 2,
    expiry: 3,
  };

  const events: ReplayEvent[] = [];
  for (const pkg of eligiblePkgs) {
    events.push({
      kind: "purchase",
      at: pkg.purchase_date ? new Date(pkg.purchase_date) : new Date(0),
      pkg,
    });
  }
  for (const raw of consumesResult.rows) {
    const sp = raw as SpRow;
    events.push({
      kind: "consume",
      at: sp.start_time ? new Date(sp.start_time) : new Date(0),
      sp,
    });
  }
  for (const raw of refundsResult.rows) {
    const tx = raw as TxRow;
    events.push({
      kind: "refund",
      at: tx.created_at ? new Date(tx.created_at) : new Date(0),
      tx,
    });
  }
  for (const ms of expiryInstants) {
    events.push({ kind: "expiry", at: new Date(ms) });
  }

  events.sort((a, b) => {
    const t = a.at.getTime() - b.at.getTime();
    if (t !== 0) return t;
    return PRIORITY[a.kind] - PRIORITY[b.kind];
  });

  // ---------- single chronological dispatch loop ---------------------------
  for (const ev of events) {
    if (dryRun) {
      switch (ev.kind) {
        case "purchase": stats.packagesProcessed++; break;
        case "consume":  stats.consumesProcessed++; break;
        case "refund":   stats.refundsProcessed++;  break;
        case "expiry":   /* no-op in dry-run */     break;
      }
      continue;
    }

    try {
      switch (ev.kind) {
        case "purchase": {
          const pkg = ev.pkg;
          const type = normalizeCreditType(pkg.credit_type);
          const qty = Number(pkg.total_credits);
          const totalPrice = Number(pkg.price ?? 0);
          const pricePerCredit = pkg.price_per_credit != null
            ? Number(pkg.price_per_credit)
            : qty > 0 ? totalPrice / qty : 0;
          const expiresAt = pkg.expiry_date ? new Date(pkg.expiry_date) : null;
          const result = await purchasePackage({
            playerId: pkg.player_id,
            academyId: pkg.academy_id,
            type,
            qty,
            pricePerCredit,
            currency: pkg.currency ?? "AED",
            invoiceId: pkg.invoice_id,
            sourcePackageId: pkg.id,
            purchasedAt: ev.at,
            expiresAt,
            actorRole: "system",
            eventKey: `purchase:pkg:${pkg.id}`,
          });
          if (result.alreadyApplied) stats.packagesSkipped++;
          else stats.packagesProcessed++;
          break;
        }
        case "consume": {
          const result = await consumeCredit({
            sessionPlayerId: ev.sp.session_player_id,
            occurredAt: ev.at,
            actorRole: "system",
            eventKey: `consume:${ev.sp.session_player_id}`,
          });
          if (result.alreadyApplied) stats.consumesSkipped++;
          else if (!result.charged) stats.consumesNotCharged++;
          else stats.consumesProcessed++;
          break;
        }
        case "refund": {
          const result = await refundCredit({
            sessionPlayerId: ev.tx.session_player_id,
            amount: Number(ev.tx.amount),
            policy: "force",
            occurredAt: ev.at,
            actorRole: "system",
            reason: `legacy:${ev.tx.reason ?? ev.tx.type ?? "unknown"}`,
            eventKey: `refund:legacy:${ev.tx.id}`,
          });
          if (result.alreadyApplied || !result.refunded) stats.refundsSkipped++;
          else stats.refundsProcessed++;
          break;
        }
        case "expiry": {
          await expireCredits({ academyId, asOf: ev.at, actorRole: "system" });
          break;
        }
      }
    } catch (err) {
      stats.errors++;
      const tag =
        ev.kind === "purchase" ? `pkg ${ev.pkg.id}` :
        ev.kind === "consume"  ? `sp ${ev.sp.session_player_id}` :
        ev.kind === "refund"   ? `refund ${ev.tx.id}` :
                                 `expiry@${ev.at.toISOString()}`;
      stats.errorDetails.push(
        `${tag}: ${err instanceof Error ? err.message : String(err)}`,
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
