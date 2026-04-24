/**
 * scripts/backfill-coach-public-profile.ts
 *
 * Task #1109 — Auto-show all coaches in public directory.
 *
 * The Task #1037 backfill set every existing coach's
 * `public_profile_enabled` to FALSE (opt-in model). That left the landing
 * page "Coaches" rail looking empty even when there were real coaches on
 * the platform. This script flips the model: every existing coach becomes
 * publicly discoverable by default. The schema default for the column is
 * already TRUE, so newly created coaches are unaffected.
 *
 * Idempotent: a one-shot, per-row marker column
 * (`public_profile_default_on_backfilled`) is set to TRUE the first time
 * a coach is processed. Re-running the script is a no-op for those rows.
 * The same migration is also wired into `server/db.ts` so it runs on app
 * startup; this script just lets ops trigger it manually.
 *
 * Once this migration has run for a coach, any subsequent explicit toggle
 * to OFF via the Coach Profile screen is preserved — the script never
 * touches a coach whose marker is already TRUE.
 *
 * Usage:
 *   npx tsx scripts/backfill-coach-public-profile.ts          # apply
 *   npx tsx scripts/backfill-coach-public-profile.ts --dry-run
 */

import { pool } from "../server/db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(
    `[backfill-coach-public-profile] starting (mode=${dryRun ? "dry-run" : "apply"})`,
  );

  // 1. Make sure the marker column exists. Safe to run repeatedly.
  await pool.query(
    `ALTER TABLE coaches ADD COLUMN IF NOT EXISTS public_profile_default_on_backfilled BOOLEAN DEFAULT FALSE`,
  );

  // 2. How many coaches are still pending the default-on flip?
  const pending = await pool.query<{
    total: string;
    currently_false: string;
    currently_true: string;
    currently_null: string;
  }>(`
    SELECT
      COUNT(*)::text                                                               AS total,
      COUNT(*) FILTER (WHERE public_profile_enabled IS FALSE)::text                AS currently_false,
      COUNT(*) FILTER (WHERE public_profile_enabled IS TRUE)::text                 AS currently_true,
      COUNT(*) FILTER (WHERE public_profile_enabled IS NULL)::text                 AS currently_null
    FROM coaches
    WHERE public_profile_default_on_backfilled IS NOT TRUE
  `);

  const stats = pending.rows[0];
  const pendingTotal = Number(stats?.total ?? 0);
  console.log(
    `[backfill-coach-public-profile] pending coaches: ${pendingTotal}`,
    stats,
  );

  if (pendingTotal === 0) {
    console.log(
      "[backfill-coach-public-profile] nothing to do — all coaches have already been processed.",
    );
    await pool.end().catch(() => {});
    return;
  }

  if (dryRun) {
    console.log(
      `[backfill-coach-public-profile] dry-run: would flip ${pendingTotal} coaches to public_profile_enabled = TRUE`,
    );
    await pool.end().catch(() => {});
    return;
  }

  // 3. Apply: flip every coach who hasn't been processed by this migration
  // to enabled=TRUE, then mark them as processed.
  const updated = await pool.query(`
    UPDATE coaches
       SET public_profile_enabled = TRUE,
           public_profile_default_on_backfilled = TRUE
     WHERE public_profile_default_on_backfilled IS NOT TRUE
  `);

  console.log(
    `[backfill-coach-public-profile] flipped ${updated.rowCount ?? 0} coaches to discoverable`,
  );

  // 4. Pre-mark freshly inserted coaches as already processed so a future
  // re-run is guaranteed to be a no-op.
  await pool.query(
    `ALTER TABLE coaches ALTER COLUMN public_profile_default_on_backfilled SET DEFAULT TRUE`,
  );

  // 5. Sanity report.
  const after = await pool.query<{ enabled: string; disabled: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE public_profile_enabled IS TRUE)::text  AS enabled,
      COUNT(*) FILTER (WHERE public_profile_enabled IS FALSE)::text AS disabled
    FROM coaches
  `);
  console.log(
    `[backfill-coach-public-profile] post-run totals: enabled=${after.rows[0]?.enabled} disabled=${after.rows[0]?.disabled}`,
  );

  await pool.end().catch(() => {});
}

main().catch((err) => {
  console.error("[backfill-coach-public-profile] FAILED:", err);
  process.exit(1);
});
