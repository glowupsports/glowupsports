// Task #1125 — Player-of-the-Week cron.
// Schedule: runs once on boot (idempotent catch-up) and then every Monday
// at 00:05 UTC. Computes per-academy + per-country top XP earner
// (min 3 matches threshold) and writes a `player_of_week` row + a
// celebratory `posts` row. Idempotency is guaranteed by the unique
// (scope, scope_id, week_start) index on player_of_week.
import { db } from "./db";
import {
  academies,
  players,
  playerXpEvents,
  playerOfWeek,
  posts as postsTable,
  users,
} from "@shared/schema";
import { and, eq, gte, lt, inArray, sql, isNotNull } from "drizzle-orm";
import { mondayOf, aggregatePlayerMatches, sumMatchAgg } from "./routes/leaderboards-extras";

const WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_MATCHES_FOR_AWARD = 3;

interface AwardCandidate {
  playerId: string;
  xp: number;
  matches: number;
}

async function computeTopByXP(
  playerIds: string[],
  weekStart: Date,
  weekEnd: Date
): Promise<AwardCandidate[]> {
  if (playerIds.length === 0) return [];

  const xpRows = await db
    .select({
      playerId: playerXpEvents.playerId,
      xp: sql<number>`COALESCE(SUM(${playerXpEvents.xpAmount}), 0)::int`.as("xp"),
    })
    .from(playerXpEvents)
    .where(
      and(
        inArray(playerXpEvents.playerId, playerIds),
        gte(playerXpEvents.createdAt, weekStart),
        lt(playerXpEvents.createdAt, weekEnd)
      )
    )
    .groupBy(playerXpEvents.playerId);

  // Match counts unified across `matches`, `adult_glow_matches`,
  // `player_matches` (resultStatus='played'). Free players, juniors, and
  // adults all qualify under the same min-matches threshold this way.
  const matchAgg = await aggregatePlayerMatches(playerIds, weekStart, weekEnd);
  const matchMap = new Map<string, number>();
  for (const [pid, agg] of matchAgg) matchMap.set(pid, agg.played);

  return xpRows
    .map((r) => ({
      playerId: r.playerId!,
      xp: Number(r.xp),
      matches: matchMap.get(r.playerId!) ?? 0,
    }))
    .filter((c) => c.matches >= MIN_MATCHES_FOR_AWARD)
    .sort((a, b) => b.xp - a.xp);
}

async function awardForAcademy(
  academyId: string,
  weekStartIso: string,
  weekStart: Date,
  weekEnd: Date
): Promise<void> {
  // Idempotent — bail if a winner already exists for this week.
  const [existing] = await db
    .select({ id: playerOfWeek.id })
    .from(playerOfWeek)
    .where(
      and(
        eq(playerOfWeek.scope, "academy"),
        eq(playerOfWeek.scopeId, academyId),
        eq(playerOfWeek.weekStart, weekStartIso)
      )
    )
    .limit(1);
  if (existing) return;

  const playerRows = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.academyId, academyId));
  const playerIds = playerRows.map((r) => r.id);
  if (playerIds.length === 0) return;

  const candidates = await computeTopByXP(playerIds, weekStart, weekEnd);
  const winner = candidates[0];
  if (!winner) return;

  await db.insert(playerOfWeek).values({
    scope: "academy",
    scopeId: academyId,
    weekStart: weekStartIso,
    playerId: winner.playerId,
    xpEarned: winner.xp,
    matchesPlayed: winner.matches,
  });

  // Celebration post in the academy. posts.academy_id is now nullable
  // (see country branch for free-player support); academy winners always
  // attach to their academy.
  try {
    const [winnerInfo] = await db
      .select({ name: players.name })
      .from(players)
      .where(eq(players.id, winner.playerId))
      .limit(1);
    const [winnerUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.playerId, winner.playerId))
      .limit(1);

    if (winnerUser?.id) {
      await db.insert(postsTable).values({
        authorId: winnerUser.id,
        academyId,
        contextType: "achievement",
        contextId: null,
        caption: `Player of the Week — ${winnerInfo?.name ?? "A player"} earned ${winner.xp} XP across ${winner.matches} matches. Congrats!`,
        mediaUrls: [],
        mediaTypes: [],
        visibility: "academy",
      });
    }
  } catch (postErr) {
    console.warn("[PlayerOfWeek] could not write celebration post:", postErr);
  }
}

async function awardForCountry(
  country: string,
  weekStartIso: string,
  weekStart: Date,
  weekEnd: Date
): Promise<void> {
  const [existing] = await db
    .select({ id: playerOfWeek.id })
    .from(playerOfWeek)
    .where(
      and(
        eq(playerOfWeek.scope, "country"),
        eq(playerOfWeek.scopeId, country),
        eq(playerOfWeek.weekStart, weekStartIso)
      )
    )
    .limit(1);
  if (existing) return;

  // Country eligibility includes BOTH:
  //  - players whose own `players.country` is set to this country (covers
  //    free players who don't belong to any academy), AND
  //  - players whose academy is registered in this country.
  // The two are unioned via DISTINCT so a player isn't counted twice.
  const academyMatchedRows = await db
    .selectDistinct({ id: players.id })
    .from(players)
    .innerJoin(academies, eq(academies.id, players.academyId))
    .where(eq(academies.country, country));
  const directMatchedRows = await db
    .selectDistinct({ id: players.id })
    .from(players)
    .where(eq(players.country, country));
  const playerIdSet = new Set<string>();
  for (const r of academyMatchedRows) playerIdSet.add(r.id);
  for (const r of directMatchedRows) playerIdSet.add(r.id);
  const playerIds = [...playerIdSet];
  if (playerIds.length === 0) return;

  const candidates = await computeTopByXP(playerIds, weekStart, weekEnd);
  const winner = candidates[0];
  if (!winner) return;

  await db.insert(playerOfWeek).values({
    scope: "country",
    scopeId: country,
    weekStart: weekStartIso,
    playerId: winner.playerId,
    xpEarned: winner.xp,
    matchesPlayed: winner.matches,
  });

  // Country celebration post — academy_id is now nullable so free-player
  // winners (no academy) still get a public feed post. Players with an
  // academy attach the post to that academy so academy followers see it.
  try {
    const [winnerInfo] = await db
      .select({ name: players.name, academyId: players.academyId })
      .from(players)
      .where(eq(players.id, winner.playerId))
      .limit(1);
    const [winnerUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.playerId, winner.playerId))
      .limit(1);
    if (winnerUser?.id) {
      await db.insert(postsTable).values({
        authorId: winnerUser.id,
        academyId: winnerInfo?.academyId ?? null,
        contextType: "achievement",
        contextId: null,
        caption: `Country Player of the Week (${country}) — ${winnerInfo?.name ?? "A player"} earned ${winner.xp} XP across ${winner.matches} matches. Congrats!`,
        mediaUrls: [],
        mediaTypes: [],
        visibility: "public",
      });
    }
  } catch (postErr) {
    console.warn("[PlayerOfWeek] could not write country celebration post:", postErr);
  }
}

async function runOnce(): Promise<void> {
  // Use last week's window: Monday 00:00 UTC to next Monday 00:00 UTC.
  const today = new Date();
  const thisMonday = new Date(mondayOf(today) + "T00:00:00.000Z");
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
  const weekStartIso = lastMonday.toISOString().slice(0, 10);

  // Per academy
  const academyRows = await db.select({ id: academies.id }).from(academies);
  for (const a of academyRows) {
    try {
      await awardForAcademy(a.id, weekStartIso, lastMonday, thisMonday);
    } catch (err) {
      console.error(`[PlayerOfWeek] academy ${a.id} failed:`, err);
    }
  }

  // Per country: union of countries that have at least one academy AND
  // countries that have at least one player whose own players.country is set
  // (covers free players in countries that have no registered academy).
  const academyCountryRows = await db
    .selectDistinct({ country: academies.country })
    .from(academies)
    .where(isNotNull(academies.country));
  const playerCountryRows = await db
    .selectDistinct({ country: players.country })
    .from(players)
    .where(isNotNull(players.country));
  const countrySet = new Set<string>();
  for (const r of academyCountryRows) {
    if (r.country) countrySet.add(r.country);
  }
  for (const r of playerCountryRows) {
    if (r.country) countrySet.add(r.country);
  }
  for (const country of countrySet) {
    try {
      await awardForCountry(country, weekStartIso, lastMonday, thisMonday);
    } catch (err) {
      console.error(`[PlayerOfWeek] country ${country} failed:`, err);
    }
  }
}

// Returns ms until the next Monday at 00:05 UTC.
function msUntilNextMonday(now: Date = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(0, 5, 0, 0); // 00:05 UTC
  // 0 = Sunday, 1 = Monday, ...
  const day = next.getUTCDay();
  const offset = day === 1 && next.getTime() > now.getTime() ? 0 : (8 - day) % 7 || 7;
  next.setUTCDate(next.getUTCDate() + offset);
  return Math.max(next.getTime() - now.getTime(), 0);
}

export function startPlayerOfWeekJob(): void {
  // Strict Monday-only execution: catch-up run at boot (idempotent — uses
  // (scope, scopeId, weekStart) unique index), then schedule the next run
  // at the next Monday 00:05 UTC, then weekly thereafter.
  const delayUntilMonday = msUntilNextMonday();
  console.log(
    `[PlayerOfWeek] Starting weekly award job (next run in ${Math.round(
      delayUntilMonday / 60_000,
    )} min, then every Monday)`,
  );
  setTimeout(() => {
    void runOnce().catch((err) => console.error("[PlayerOfWeek] boot catch-up failed:", err));
  }, 60_000);
  setTimeout(() => {
    void runOnce().catch((err) => console.error("[PlayerOfWeek] Monday run failed:", err));
    setInterval(() => {
      void runOnce().catch((err) => console.error("[PlayerOfWeek] weekly tick failed:", err));
    }, WEEKLY_INTERVAL_MS);
  }, delayUntilMonday);
}

export const __testing = { runOnce, computeTopByXP, awardForAcademy, awardForCountry };
