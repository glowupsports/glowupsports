// Task #1147 — Daily prune of auto-generated `feed_items`.
//
// Keeps Community → Feed (especially country/global scopes) snappy by
// trimming system events (matches, level-ups, quests, tournaments, open
// matches, coach spotlights, coach practice pairs) older than the
// configured retention window. Manual moments are NEVER touched.
//
// Configuration (env):
//   FEED_RETENTION_DAYS      Retention window in days (default 90)
//   FEED_PRUNE_MODE          "delete" (default) | "hide"
//   FEED_PRUNE_BATCH         Rows per delete batch (default 5000)
//   FEED_PRUNE_HOUR_UTC      Hour-of-day to run (UTC, default 3 — quiet 03:00)
//
// Scheduler shape (mirrors playerOfWeekJob): catch-up run shortly after
// boot (idempotent — operates on rows older than the cutoff, so re-running
// is safe), then once per day at the configured UTC hour.
import { pruneOldFeedItems, resolveOptions } from "../scripts/social-phase1-prune";

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BOOT_DELAY_MS = 5 * 60 * 1000; // wait 5 min after boot for repairs/migrations

function pruneHourUtc(): number {
  const raw = process.env.FEED_PRUNE_HOUR_UTC;
  if (!raw) return 3;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > 23) return 3;
  return n;
}

function msUntilNextRun(hourUtc: number, now: Date = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(hourUtc, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return Math.max(next.getTime() - now.getTime(), 0);
}

async function runOnce(): Promise<void> {
  const opts = resolveOptions();
  try {
    const result = await pruneOldFeedItems();
    if (result.candidateCount === 0) {
      console.log(
        `[FeedPrune] OK — nothing to prune (retention=${opts.days}d, mode=${opts.mode})`,
      );
      return;
    }
    console.log(
      `[FeedPrune] Pruned ${result.feedItemsAffected} feed_items ` +
        `(mode=${result.mode}, retention=${result.days}d, ` +
        `cutoff=${result.cutoff.toISOString()}, candidates=${result.candidateCount}, ` +
        `reactions=${result.reactionsDeleted}, comments=${result.commentsDeleted})`,
    );
  } catch (err) {
    console.error("[FeedPrune] Run failed:", err);
  }
}

let started = false;

export function startFeedPruneScheduler(): void {
  if (started) {
    console.log("[FeedPrune] Scheduler already running");
    return;
  }
  started = true;

  const hour = pruneHourUtc();
  const opts = resolveOptions();
  const delay = msUntilNextRun(hour);
  console.log(
    `[FeedPrune] Starting daily prune scheduler (mode=${opts.mode}, retention=${opts.days}d, ` +
      `next run in ${Math.round(delay / 60_000)} min at ${String(hour).padStart(2, "0")}:00 UTC)`,
  );

  // Boot catch-up (delayed so it doesn't compete with startup repair scripts).
  setTimeout(() => {
    void runOnce();
  }, BOOT_DELAY_MS);

  // First scheduled run, then daily thereafter.
  setTimeout(() => {
    void runOnce();
    setInterval(() => {
      void runOnce();
    }, DAILY_INTERVAL_MS);
  }, delay);
}

export const __testing = { runOnce, msUntilNextRun, pruneHourUtc };
