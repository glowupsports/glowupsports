/**
 * One-time, intentionally gated production repair.
 *
 * Run with:
 *   npx tsx scripts/repair-mistaken-30-week-series.ts --execute
 *
 * The storage transaction repeats these invariants while holding row locks.
 * If even one does not match, it writes nothing.
 */
import { storage } from "../server/storage";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const TARGET_SERIES_ID = "63122dbd-0e1e-473f-bdee-a9fe21322bc8";

async function main() {
  const execute = process.argv.includes("--execute");
  const verifyOnly = process.argv.includes("--verify-only");
  if (!execute && !verifyOnly) {
    console.error("Refusing to write. Re-run with --execute after reviewing the guarded target, or use --verify-only.");
    process.exitCode = 1;
    return;
  }

  const result = execute
    ? await storage.cancelCoachingSeriesAtomic(TARGET_SERIES_ID, {
        cancelledBy: "system:guarded-series-repair",
        reason: "Approved repair: mistaken recurring series",
        expected: {
          sessionCount: 30,
          firstSessionDate: "2026-08-19",
          lastSessionDate: "2027-03-10",
          playerNames: ["Aisha Almahasneh", "Amelia Ava Holdich"],
        },
      })
    : { cancelledSessions: 0, refunded: 0 };

  const [sessionVerification, ledgerVerification, seriesVerification] = await Promise.all([
    db.execute(sql`
      SELECT status, COUNT(*)::int AS count
      FROM sessions
      WHERE series_id = ${TARGET_SERIES_ID}
      GROUP BY status
      ORDER BY status
    `),
    db.execute(sql`
      SELECT l.reason, COUNT(*)::int AS count, COALESCE(SUM(l.delta), 0)::text AS total_delta
      FROM credit_ledger_v2 l
      JOIN sessions s ON s.id = l.session_id
      WHERE s.series_id = ${TARGET_SERIES_ID}
        AND l.reason IN (
          'consume', 'refund', 'refund_cancelled_session',
          'refund_attendance_correction', 'refund_player_removed',
          'refund_orphan_consume'
        )
      GROUP BY l.reason
      ORDER BY l.reason
    `),
    db.execute(sql`
      SELECT status
      FROM coaching_series
      WHERE id = ${TARGET_SERIES_ID}
    `),
  ]);

  console.log(JSON.stringify({
    targetSeriesId: TARGET_SERIES_ID,
    cancelledSessions: result.cancelledSessions,
    v2CreditsRefunded: result.refunded,
    verification: {
      series: seriesVerification.rows,
      sessionsByStatus: sessionVerification.rows,
      ledger: ledgerVerification.rows,
    },
  }));
}

main().catch((error) => {
  console.error("Guarded series repair failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});