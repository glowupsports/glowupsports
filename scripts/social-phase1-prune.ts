// Social Phase 1 prune — keeps `feed_items` snappy as it grows by trimming
// old auto-generated rows. Runs both as a CLI script and as a library used by
// the daily scheduler (`server/feedPruneJob.ts`).
//
// Behavior:
//   - Targets system-generated source types only:
//       match_result, level_up, quest_complete, tournament_result,
//       open_match, coach_practice_pair
//   - Manual moments (`source_type='manual_moment'`) are NEVER pruned —
//     they're user-authored content keyed to a `posts` row. The same applies
//     to `coach_spotlight`, which is also a user-authored post (the only
//     thing distinguishing it from `manual_moment` in `feed-publisher.ts`
//     is whether the author is a coach), so it's excluded too.
//   - Mode "delete" (default): hard delete + cleanup orphaned reactions /
//     comments that referenced the deleted feed_items via feed_item_id.
//   - Mode "hide": soft-hide (set is_hidden=true). Reads already filter by
//     is_hidden=false so the row disappears from feed queries while the
//     reactions/comments are preserved.
//
// Configuration (env vars, also overridable via CLI flags):
//   FEED_RETENTION_DAYS    Retention window in days (default 90, min 1)
//   FEED_PRUNE_MODE        "delete" (default) | "hide"
//   FEED_PRUNE_BATCH       Max rows to delete/hide per batch (default 5000)
//
// Usage:
//   tsx scripts/social-phase1-prune.ts
//   tsx scripts/social-phase1-prune.ts --days=60 --mode=hide
//   tsx scripts/social-phase1-prune.ts --dry-run

import "dotenv/config";
import type { PoolClient } from "pg";
import { pool } from "../server/db";

export type PruneMode = "delete" | "hide";

export interface PruneOptions {
  days?: number;
  mode?: PruneMode;
  batchSize?: number;
  dryRun?: boolean;
}

export interface PruneResult {
  mode: PruneMode;
  days: number;
  cutoff: Date;
  candidateCount: number;
  feedItemsAffected: number;
  reactionsDeleted: number;
  commentsDeleted: number;
  dryRun: boolean;
}

// System (auto-generated) source types that are eligible for pruning.
// `manual_moment` and `coach_spotlight` are intentionally excluded — both are
// author-owned posts backed by a `posts` row (see `publishMomentPost` in
// `server/services/feed-publisher.ts`, where the only difference between the
// two is whether the author is a coach).
export const PRUNABLE_SOURCE_TYPES: readonly string[] = [
  "match_result",
  "level_up",
  "quest_complete",
  "tournament_result",
  "open_match",
  "coach_practice_pair",
] as const;

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_BATCH_SIZE = 5000;

function envInt(name: string, fallback: number, min = 1): number {
  // Task #1313 — Standalone CLI/cron script; dynamic env reads here are
  // intentional helpers, not user-facing client code.
  // eslint-disable-next-line expo/no-dynamic-env-var
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

function envMode(): PruneMode {
  const raw = (process.env.FEED_PRUNE_MODE || "").toLowerCase().trim();
  return raw === "hide" ? "hide" : "delete";
}

export function resolveOptions(opts: PruneOptions = {}): Required<PruneOptions> {
  const days = opts.days ?? envInt("FEED_RETENTION_DAYS", DEFAULT_RETENTION_DAYS);
  const mode: PruneMode = opts.mode ?? envMode();
  const batchSize = opts.batchSize ?? envInt("FEED_PRUNE_BATCH", DEFAULT_BATCH_SIZE);
  const dryRun = opts.dryRun ?? false;
  return { days, mode, batchSize, dryRun };
}

/**
 * Prune (delete or hide) auto-generated `feed_items` older than the retention
 * window. Manual moments are always preserved.
 *
 * Returns counts so callers (CLI + scheduler) can log a single tidy summary.
 */
export async function pruneOldFeedItems(opts: PruneOptions = {}): Promise<PruneResult> {
  const { days, mode, batchSize, dryRun } = resolveOptions(opts);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Count candidates first so the log/result is meaningful even when 0 rows
  // get touched (e.g. dry-run, or table already clean).
  const countRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM feed_items
      WHERE source_type = ANY($1::text[])
        AND created_at < $2`,
    [PRUNABLE_SOURCE_TYPES as unknown as string[], cutoff],
  );
  const candidateCount = Number(countRes.rows[0]?.count ?? 0);

  const result: PruneResult = {
    mode,
    days,
    cutoff,
    candidateCount,
    feedItemsAffected: 0,
    reactionsDeleted: 0,
    commentsDeleted: 0,
    dryRun,
  };

  if (candidateCount === 0 || dryRun) {
    return result;
  }

  if (mode === "hide") {
    // Soft hide. Done in one statement — UPDATE is cheap because it only
    // touches not-yet-hidden rows older than the cutoff.
    const upd = await pool.query(
      `UPDATE feed_items
          SET is_hidden = true
        WHERE source_type = ANY($1::text[])
          AND created_at < $2
          AND is_hidden = false`,
      [PRUNABLE_SOURCE_TYPES as unknown as string[], cutoff],
    );
    result.feedItemsAffected = upd.rowCount ?? 0;
    return result;
  }

  // Mode === "delete". Batch the deletes so a backlog of millions of rows
  // doesn't lock feed_items for an extended period or blow out WAL.
  // Each batch runs in its OWN transaction: the feed_items DELETE and the
  // post_reactions / post_comments orphan cleanup either all commit together
  // or all roll back. This prevents a transient DB error in the dependent
  // cleanup step from leaving orphaned engagement rows pointing at
  // already-deleted feed_items.
  let totalDeleted = 0;
  let totalReactions = 0;
  let totalComments = 0;
  // Safety stop: cap total batches per run so a misconfigured retention
  // window (e.g. 0 days) can't accidentally wipe everything in one go.
  const maxBatches = Math.max(1, Math.ceil(candidateCount / batchSize)) + 2;
  for (let i = 0; i < maxBatches; i++) {
    const batch = await pruneBatchTx(cutoff, batchSize);
    if (batch.deleted === 0) break;
    totalDeleted += batch.deleted;
    totalReactions += batch.reactions;
    totalComments += batch.comments;
    if (batch.deleted < batchSize) break;
  }

  result.feedItemsAffected = totalDeleted;
  result.reactionsDeleted = totalReactions;
  result.commentsDeleted = totalComments;
  return result;
}

interface BatchResult {
  deleted: number;
  reactions: number;
  comments: number;
}

async function pruneBatchTx(cutoff: Date, batchSize: number): Promise<BatchResult> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    // Delete a batch of feed_items and capture their ids in a single
    // statement (DELETE ... RETURNING). FOR UPDATE SKIP LOCKED on the
    // CTE picks safe candidates if multiple prune runs ever overlap.
    const del = await client.query<{ id: string }>(
      `WITH victims AS (
         SELECT id
           FROM feed_items
          WHERE source_type = ANY($1::text[])
            AND created_at < $2
          ORDER BY created_at ASC
          LIMIT $3
          FOR UPDATE SKIP LOCKED
       )
       DELETE FROM feed_items
        WHERE id IN (SELECT id FROM victims)
       RETURNING id`,
      [PRUNABLE_SOURCE_TYPES as unknown as string[], cutoff, batchSize],
    );
    const ids = del.rows.map((r) => r.id);
    if (ids.length === 0) {
      await client.query("COMMIT");
      return { deleted: 0, reactions: 0, comments: 0 };
    }

    const r = await client.query(
      `DELETE FROM post_reactions WHERE feed_item_id = ANY($1::text[])`,
      [ids],
    );
    const c = await client.query(
      `DELETE FROM post_comments WHERE feed_item_id = ANY($1::text[])`,
      [ids],
    );

    await client.query("COMMIT");
    return {
      deleted: ids.length,
      reactions: r.rowCount ?? 0,
      comments: c.rowCount ?? 0,
    };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    console.error("[FeedPrune] batch failed (rolled back):", err);
    // Re-throw so the caller stops looping on persistent DB errors and the
    // scheduler/CLI surfaces the failure in its own try/catch + logs.
    throw err;
  } finally {
    client.release();
  }
}

function parseCliFlag(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return undefined;
  return arg.split("=").slice(1).join("=");
}

function parseCliBool(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parsePositiveIntFlag(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || String(n) !== raw.trim()) {
    console.error(
      `[FeedPrune] Invalid --${name} value "${raw}" — expected a positive integer. Aborting.`,
    );
    process.exit(2);
  }
  return n;
}

async function main() {
  const daysFlag = parseCliFlag("days");
  const modeFlagRaw = parseCliFlag("mode");
  const batchFlag = parseCliFlag("batch");
  const dryRun = parseCliBool("dry-run");

  if (modeFlagRaw !== undefined && modeFlagRaw !== "hide" && modeFlagRaw !== "delete") {
    console.error(
      `[FeedPrune] Invalid --mode value "${modeFlagRaw}" — expected "delete" or "hide". Aborting.`,
    );
    process.exit(2);
  }

  const opts: PruneOptions = {
    dryRun,
    ...(daysFlag !== undefined ? { days: parsePositiveIntFlag("days", daysFlag)! } : {}),
    ...(modeFlagRaw === "hide" || modeFlagRaw === "delete" ? { mode: modeFlagRaw } : {}),
    ...(batchFlag !== undefined ? { batchSize: parsePositiveIntFlag("batch", batchFlag)! } : {}),
  };

  const resolved = resolveOptions(opts);
  console.log(
    `[FeedPrune] Pruning system feed_items older than ${resolved.days} days ` +
      `(mode=${resolved.mode}, batch=${resolved.batchSize}, dryRun=${resolved.dryRun}, ` +
      `cutoff=${new Date(Date.now() - resolved.days * 86_400_000).toISOString()})`,
  );

  const result = await pruneOldFeedItems(opts);
  console.log(
    `[FeedPrune] Done. candidates=${result.candidateCount} ` +
      `feed_items=${result.feedItemsAffected} ` +
      `reactions=${result.reactionsDeleted} ` +
      `comments=${result.commentsDeleted}` +
      (result.dryRun ? " (dry-run — nothing changed)" : ""),
  );
  process.exit(0);
}

const isDirectRun =
  process.argv[1]?.endsWith("social-phase1-prune.ts") ||
  process.argv[1]?.endsWith("social-phase1-prune.js");
if (isDirectRun) {
  main().catch((err) => {
    console.error("[FeedPrune] Fatal:", err);
    process.exit(1);
  });
}
