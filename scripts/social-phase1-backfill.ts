// Social Phase 1 backfill — populates `feed_items` with the last 30 days of
// system events (matches, level-ups, quest completions, finished tournaments,
// open matches, manual moments). Idempotent thanks to ON CONFLICT
// (source_type, source_id) DO NOTHING in each publisher.
//
// Usage:  tsx scripts/social-phase1-backfill.ts
//         tsx scripts/social-phase1-backfill.ts --days=60

import "dotenv/config";
import { db } from "../server/db";
import {
  matchLogs,
  levelUpEvents,
  playerQuests,
  tournaments,
  openMatches,
  posts,
} from "@shared/schema";
import { and, gte, eq, isNotNull, ne } from "drizzle-orm";
import {
  publishMatchResult,
  publishLevelUp,
  publishQuestComplete,
  publishTournamentResult,
  publishOpenMatch,
  publishMomentPost,
} from "../server/services/feed-publisher";

function parseDays(): number {
  const arg = process.argv.find((a) => a.startsWith("--days="));
  if (!arg) return 30;
  const n = parseInt(arg.split("=")[1] || "30", 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

async function main() {
  const days = parseDays();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  console.log(`[Backfill] Backfilling feed_items for the last ${days} days (since ${since.toISOString()})`);

  let counts = {
    matches: 0,
    levelUps: 0,
    quests: 0,
    tournaments: 0,
    openMatches: 0,
    moments: 0,
  };

  try {
    const rows = await db
      .select({ id: matchLogs.id })
      .from(matchLogs)
      .where(gte(matchLogs.playedAt, since));
    for (const r of rows) {
      await publishMatchResult(r.id);
      counts.matches++;
    }
  } catch (err) {
    console.error("[Backfill] match logs error:", err);
  }

  try {
    const rows = await db
      .select({ id: levelUpEvents.id })
      .from(levelUpEvents)
      .where(gte(levelUpEvents.promotedAt, since));
    for (const r of rows) {
      await publishLevelUp(r.id);
      counts.levelUps++;
    }
  } catch (err) {
    console.error("[Backfill] level-ups error:", err);
  }

  try {
    const rows = await db
      .select({ id: playerQuests.id })
      .from(playerQuests)
      .where(
        and(
          eq(playerQuests.status, "completed"),
          isNotNull(playerQuests.completedAt),
          gte(playerQuests.completedAt, since),
        ),
      );
    for (const r of rows) {
      await publishQuestComplete(r.id);
      counts.quests++;
    }
  } catch (err) {
    console.error("[Backfill] quests error:", err);
  }

  try {
    const rows = await db
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.status, "completed"),
          isNotNull(tournaments.winnerId),
          gte(tournaments.updatedAt, since),
        ),
      );
    for (const r of rows) {
      await publishTournamentResult(r.id);
      counts.tournaments++;
    }
  } catch (err) {
    console.error("[Backfill] tournaments error:", err);
  }

  try {
    const rows = await db
      .select({ id: openMatches.id })
      .from(openMatches)
      .where(gte(openMatches.createdAt, since));
    for (const r of rows) {
      await publishOpenMatch(r.id);
      counts.openMatches++;
    }
  } catch (err) {
    console.error("[Backfill] open matches error:", err);
  }

  try {
    const rows = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          gte(posts.createdAt, since),
          eq(posts.isHidden, false),
        ),
      );
    for (const r of rows) {
      await publishMomentPost(r.id);
      counts.moments++;
    }
  } catch (err) {
    console.error("[Backfill] moments error:", err);
  }

  console.log("[Backfill] Done. Counts:", counts);
  process.exit(0);
}

main().catch((err) => {
  console.error("[Backfill] Fatal:", err);
  process.exit(1);
});
