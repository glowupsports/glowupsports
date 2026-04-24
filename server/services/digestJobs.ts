// Task #1126 — Social Phase 6 digest / recap / highlight jobs.
//
// Responsibilities:
//   - runWeeklyDigestOnce()  — Sunday cron + boot catch-up. Computes per-player
//     summaries for the trailing week, upserts `weekly_digests`, publishes a
//     `weekly_digest` feed item, and dispatches a staggered push.
//   - runMonthlyDigestOnce() — first-of-month cron, same shape but trailing 1
//     month.
//   - runYearlyRecapOnce()   — December-first cron, computes the rich Year-in-
//     Tennis JSON used by the client wrap screen, with country leaderboard
//     rank for Free Players.
//   - runFamilyDigestOnce()  — uses family_groups + parent_player_relations to
//     send each parent a combined summary of every linked child for the week.
//   - runCoachDigestOnce()   — for each coach, summarizes their squads' week
//     (matches, missed sessions, quests, streaks) via push.
//   - runAutoHighlightForMatch() — on a logged match with ≥3 logged score
//     events (= sets) builds the highlight reel JSON and inserts a feed item.
//
// All jobs are idempotent (unique indexes prevent duplicates). Pushes are
// staggered by user-id hash across a 4-hour window to avoid FCM throttling.

import { db, pool } from "../db";
import {
  players,
  matchLogs,
  sessions,
  sessionPlayers,
  playerXpEvents,
  levelUpEvents,
  playerQuests,
  weeklyDigests,
  monthlyDigests,
  yearlyRecaps,
  highlightReels,
  parentPlayerRelations,
  users,
  coaches,
} from "@shared/schema";
import { and, eq, gte, lt, inArray, sql, isNotNull } from "drizzle-orm";
import {
  publishWeeklyDigest,
  publishMonthlyDigest,
  publishYearlyRecap,
  publishHighlightReel,
  publishFamilyDigest,
  publishCoachDigest,
} from "./feed-publisher";
import { sendPushNotification, getUserPushTokens, getCoachPushTokens } from "../pushNotifications";

const STAGGER_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours

function hashPlayerId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function staggerDelayMs(playerId: string): number {
  return hashPlayerId(playerId) % STAGGER_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

function lastMondayUtc(now: Date = new Date()): { weekStart: Date; weekEnd: Date } {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  // 0 = Sun, 1 = Mon, ...
  const day = d.getUTCDay();
  const offsetToThisMonday = day === 0 ? 6 : day - 1;
  const thisMonday = new Date(d);
  thisMonday.setUTCDate(d.getUTCDate() - offsetToThisMonday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  return { weekStart: lastMonday, weekEnd: thisMonday };
}

function lastMonthUtc(now: Date = new Date()): { monthStart: Date; monthEnd: Date } {
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { monthStart, monthEnd };
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Per-player aggregation
// ---------------------------------------------------------------------------

interface PeriodTotals {
  matchesPlayed: number;
  matchesWon: number;
  courtMinutes: number;
  xpEarned: number;
  questsCompleted: number;
  levelChanges: number;
  friendsPlayedWith: number;
  topMoment?: string | null;
  friendNamesPlayedWith?: string[];
  topLevelDisplay?: string | null;
}

async function computeTotalsForPlayer(
  playerId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<PeriodTotals> {
  // Match aggregation (singles only — match_logs is per-player).
  const mlRows = await db
    .select({
      result: matchLogs.result,
      duration: matchLogs.duration,
      opponentName: matchLogs.opponentName,
      opponentPlayerId: matchLogs.opponentPlayerId,
      playedAt: matchLogs.playedAt,
    })
    .from(matchLogs)
    .where(
      and(
        eq(matchLogs.playerId, playerId),
        gte(matchLogs.playedAt, windowStart),
        lt(matchLogs.playedAt, windowEnd),
      ),
    );

  const matchesPlayed = mlRows.length;
  const matchesWon = mlRows.filter((r) => r.result === "won").length;
  const matchMinutes = mlRows.reduce((s, r) => s + (r.duration || 0), 0);
  const friendIds = new Set<string>();
  for (const r of mlRows) {
    if (r.opponentPlayerId) friendIds.add(r.opponentPlayerId);
  }
  const friendNamesPlayedWith = Array.from(
    new Set(mlRows.map((r) => r.opponentName || "").filter((n): n is string => !!n)),
  ).slice(0, 6);

  // Session minutes — only sessions the player attended in the window.
  const sessionRows = await db
    .select({
      duration: sessions.duration,
      startTime: sessions.startTime,
      attendance: sessionPlayers.attendanceStatus,
    })
    .from(sessionPlayers)
    .innerJoin(sessions, eq(sessions.id, sessionPlayers.sessionId))
    .where(
      and(
        eq(sessionPlayers.playerId, playerId),
        gte(sessions.startTime, windowStart),
        lt(sessions.startTime, windowEnd),
      ),
    );
  const sessionMinutes = sessionRows
    .filter((r) => r.attendance === "present" || r.attendance === "late")
    .reduce((s, r) => s + (r.duration || 0), 0);

  // XP
  const xpRows = await db
    .select({ xp: sql<number>`COALESCE(SUM(${playerXpEvents.xpAmount}), 0)::int`.as("xp") })
    .from(playerXpEvents)
    .where(
      and(
        eq(playerXpEvents.playerId, playerId),
        gte(playerXpEvents.createdAt, windowStart),
        lt(playerXpEvents.createdAt, windowEnd),
      ),
    );
  const xpEarned = Number(xpRows[0]?.xp ?? 0);

  // Quests completed
  const questRows = await db
    .select({ id: playerQuests.id })
    .from(playerQuests)
    .where(
      and(
        eq(playerQuests.playerId, playerId),
        isNotNull(playerQuests.completedAt),
        gte(playerQuests.completedAt, windowStart),
        lt(playerQuests.completedAt, windowEnd),
      ),
    );
  const questsCompleted = questRows.length;

  // Level changes
  const luRows = await db
    .select({ id: levelUpEvents.id })
    .from(levelUpEvents)
    .where(
      and(
        eq(levelUpEvents.playerId, playerId),
        gte(levelUpEvents.createdAt, windowStart),
        lt(levelUpEvents.createdAt, windowEnd),
      ),
    );
  const levelChanges = luRows.length;

  // Top moment: pick the most-recent victory's caption-style snippet.
  const lastWin = [...mlRows]
    .filter((r) => r.result === "won")
    .sort((a, b) => (b.playedAt?.getTime() ?? 0) - (a.playedAt?.getTime() ?? 0))[0];
  const topMoment = lastWin
    ? `Beat ${lastWin.opponentName || "your opponent"}!`
    : matchesPlayed > 0
      ? `${matchesPlayed} match${matchesPlayed === 1 ? "" : "es"} logged`
      : null;

  return {
    matchesPlayed,
    matchesWon,
    courtMinutes: matchMinutes + sessionMinutes,
    xpEarned,
    questsCompleted,
    levelChanges,
    friendsPlayedWith: friendIds.size,
    topMoment,
    friendNamesPlayedWith,
  };
}

async function listActivePlayerIds(windowStart: Date, windowEnd: Date): Promise<string[]> {
  // "Active" = had ≥1 match log OR ≥1 session attendance OR ≥1 XP event in
  // the window. Pulls just IDs to keep memory low.
  const r = await pool.query(
    `SELECT DISTINCT player_id FROM (
       SELECT player_id FROM match_logs
        WHERE played_at >= $1 AND played_at < $2
       UNION
       SELECT sp.player_id FROM session_players sp
         JOIN sessions s ON s.id = sp.session_id
        WHERE s.start_time >= $1 AND s.start_time < $2
          AND sp.attendance_status IN ('present', 'late')
       UNION
       SELECT player_id FROM player_xp_events
        WHERE created_at >= $1 AND created_at < $2
     ) u
     WHERE player_id IS NOT NULL`,
    [windowStart, windowEnd],
  );
  return (r.rows || []).map((row: any) => row.player_id as string).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Push helpers
// ---------------------------------------------------------------------------

async function getUserIdForPlayer(playerId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.playerId, playerId))
    .limit(1);
  return row?.id ?? null;
}

async function dispatchStaggeredPush(
  playerId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  const userId = await getUserIdForPlayer(playerId);
  if (!userId) return;
  const tokens = await getUserPushTokens(userId);
  if (tokens.length === 0) return;
  const delay = staggerDelayMs(playerId);
  setTimeout(() => {
    void sendPushNotification(tokens, title, body, data, playerId).catch((err) =>
      console.error("[DigestJobs] push failed:", err),
    );
  }, delay);
}

// ---------------------------------------------------------------------------
// WEEKLY DIGEST
// ---------------------------------------------------------------------------

export async function runWeeklyDigestOnce(now: Date = new Date()): Promise<{ generated: number }> {
  const { weekStart, weekEnd } = lastMondayUtc(now);
  const weekStartIso = dateOnly(weekStart);
  const weekEndIso = dateOnly(weekEnd);
  console.log(
    `[WeeklyDigest] Window ${weekStartIso} → ${weekEndIso}`,
  );

  const playerIds = await listActivePlayerIds(weekStart, weekEnd);
  console.log(`[WeeklyDigest] ${playerIds.length} active players`);

  let generated = 0;
  for (const playerId of playerIds) {
    try {
      // Skip if already generated for this week (idempotent).
      const existing = await db
        .select({ id: weeklyDigests.id })
        .from(weeklyDigests)
        .where(
          and(
            eq(weeklyDigests.playerId, playerId),
            eq(weeklyDigests.weekStart, weekStartIso),
          ),
        )
        .limit(1);
      if (existing[0]) continue;

      const totals = await computeTotalsForPlayer(playerId, weekStart, weekEnd);
      // Skip empty digests so the feed isn't spammed with "0 matches" cards.
      if (totals.matchesPlayed === 0 && totals.courtMinutes === 0 && totals.xpEarned === 0) {
        continue;
      }

      const payload = {
        weekStart: weekStartIso,
        weekEnd: weekEndIso,
        ...totals,
      };

      const [digest] = await db
        .insert(weeklyDigests)
        .values({
          playerId,
          weekStart: weekStartIso,
          weekEnd: weekEndIso,
          matchesPlayed: totals.matchesPlayed,
          matchesWon: totals.matchesWon,
          courtMinutes: totals.courtMinutes,
          xpEarned: totals.xpEarned,
          questsCompleted: totals.questsCompleted,
          levelChanges: totals.levelChanges,
          friendsPlayedWith: totals.friendsPlayedWith,
          payload,
        })
        .onConflictDoNothing({
          target: [weeklyDigests.playerId, weeklyDigests.weekStart],
        })
        .returning({ id: weeklyDigests.id });
      if (!digest?.id) continue;

      const feedItemId = await publishWeeklyDigest({
        digestId: digest.id,
        playerId,
        weekStart: weekStartIso,
        weekEnd: weekEndIso,
        payload,
      });
      if (feedItemId) {
        await db
          .update(weeklyDigests)
          .set({ feedItemId })
          .where(eq(weeklyDigests.id, digest.id));
      }

      await dispatchStaggeredPush(
        playerId,
        "Your Week in Tennis",
        totals.matchesPlayed > 0
          ? `${totals.matchesPlayed} match${totals.matchesPlayed === 1 ? "" : "es"} · ${totals.matchesWon} won · +${totals.xpEarned} XP`
          : `${Math.round(totals.courtMinutes / 60)}h on court · +${totals.xpEarned} XP`,
        { type: "weekly_digest", digestId: digest.id },
      );

      generated++;
    } catch (err) {
      console.error(`[WeeklyDigest] player ${playerId} failed:`, err);
    }
  }

  console.log(`[WeeklyDigest] Generated ${generated} digests`);
  return { generated };
}

// ---------------------------------------------------------------------------
// MONTHLY DIGEST
// ---------------------------------------------------------------------------

export async function runMonthlyDigestOnce(now: Date = new Date()): Promise<{ generated: number }> {
  const { monthStart, monthEnd } = lastMonthUtc(now);
  const monthStartIso = dateOnly(monthStart);
  const monthEndIso = dateOnly(monthEnd);
  console.log(`[MonthlyDigest] Window ${monthStartIso} → ${monthEndIso}`);

  const playerIds = await listActivePlayerIds(monthStart, monthEnd);
  console.log(`[MonthlyDigest] ${playerIds.length} active players`);

  let generated = 0;
  for (const playerId of playerIds) {
    try {
      const existing = await db
        .select({ id: monthlyDigests.id })
        .from(monthlyDigests)
        .where(
          and(
            eq(monthlyDigests.playerId, playerId),
            eq(monthlyDigests.monthStart, monthStartIso),
          ),
        )
        .limit(1);
      if (existing[0]) continue;

      const totals = await computeTotalsForPlayer(playerId, monthStart, monthEnd);
      if (totals.matchesPlayed === 0 && totals.courtMinutes === 0 && totals.xpEarned === 0) {
        continue;
      }

      const payload = {
        monthStart: monthStartIso,
        monthEnd: monthEndIso,
        monthLabel: monthStart.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }),
        ...totals,
      };

      const [digest] = await db
        .insert(monthlyDigests)
        .values({
          playerId,
          monthStart: monthStartIso,
          monthEnd: monthEndIso,
          matchesPlayed: totals.matchesPlayed,
          matchesWon: totals.matchesWon,
          courtMinutes: totals.courtMinutes,
          xpEarned: totals.xpEarned,
          questsCompleted: totals.questsCompleted,
          levelChanges: totals.levelChanges,
          friendsPlayedWith: totals.friendsPlayedWith,
          payload,
        })
        .onConflictDoNothing({
          target: [monthlyDigests.playerId, monthlyDigests.monthStart],
        })
        .returning({ id: monthlyDigests.id });
      if (!digest?.id) continue;

      const feedItemId = await publishMonthlyDigest({
        digestId: digest.id,
        playerId,
        monthStart: monthStartIso,
        monthEnd: monthEndIso,
        payload,
      });
      if (feedItemId) {
        await db
          .update(monthlyDigests)
          .set({ feedItemId })
          .where(eq(monthlyDigests.id, digest.id));
      }

      await dispatchStaggeredPush(
        playerId,
        "Your Month in Tennis",
        `${totals.matchesPlayed} matches · ${totals.matchesWon} wins · +${totals.xpEarned} XP`,
        { type: "monthly_digest", digestId: digest.id },
      );

      generated++;
    } catch (err) {
      console.error(`[MonthlyDigest] player ${playerId} failed:`, err);
    }
  }

  console.log(`[MonthlyDigest] Generated ${generated} digests`);
  return { generated };
}

// ---------------------------------------------------------------------------
// YEAR-IN-TENNIS
// ---------------------------------------------------------------------------

async function getCountryRank(playerId: string, country: string, year: number): Promise<number | null> {
  if (!country) return null;
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  // Sum XP for the year per player whose country (own or via academy) matches.
  try {
    const r = await pool.query(
      `WITH yr AS (
         SELECT player_id, COALESCE(SUM(xp_amount), 0)::int AS xp
           FROM player_xp_events
          WHERE created_at >= $1 AND created_at < $2
          GROUP BY player_id
       ),
       eligible AS (
         SELECT DISTINCT p.id
           FROM players p
      LEFT JOIN academies a ON a.id = p.academy_id
          WHERE p.country = $3 OR a.country = $3
       )
       SELECT player_id, xp,
              RANK() OVER (ORDER BY xp DESC) AS rk
         FROM yr
        WHERE player_id IN (SELECT id FROM eligible)`,
      [yearStart, yearEnd, country],
    );
    const row = (r.rows || []).find((x: any) => x.player_id === playerId);
    return row?.rk ? Number(row.rk) : null;
  } catch (err) {
    console.warn("[YearRecap] country-rank lookup failed:", err);
    return null;
  }
}

export async function runYearlyRecapOnce(now: Date = new Date()): Promise<{ generated: number }> {
  // Generate for the calendar year that's "wrapping up" — i.e. when run on
  // Dec 1 we recap THIS year so far (so the wrap is available the first week
  // of December); we re-run on Jan 1 to lock in the final numbers.
  const year = now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  console.log(`[YearRecap] Year ${year} (window ${yearStart.toISOString()} → ${yearEnd.toISOString()})`);

  const playerIds = await listActivePlayerIds(yearStart, yearEnd);
  console.log(`[YearRecap] ${playerIds.length} active players`);

  let generated = 0;
  for (const playerId of playerIds) {
    try {
      const totals = await computeTotalsForPlayer(playerId, yearStart, yearEnd);
      // Even tiny activity gets a wrap — it's a year! Skip only zero-XP/zero-match.
      if (totals.matchesPlayed === 0 && totals.courtMinutes === 0 && totals.xpEarned === 0) {
        continue;
      }

      // Country rank (best-effort).
      const [pRow] = await db
        .select({
          country: players.country,
          academyId: players.academyId,
          name: players.name,
        })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);
      const playerCountry = pRow?.country ?? null;
      let countryRank: number | null = null;
      if (playerCountry) {
        countryRank = await getCountryRank(playerId, playerCountry, year);
      }

      const payload = {
        year,
        playerName: pRow?.name ?? null,
        country: playerCountry,
        countryRank,
        slides: [
          { kind: "intro", title: `${pRow?.name ?? "Your"} ${year} in Tennis` },
          { kind: "stat", label: "Matches Played", value: totals.matchesPlayed },
          { kind: "stat", label: "Matches Won", value: totals.matchesWon },
          { kind: "stat", label: "Hours on Court", value: Math.round(totals.courtMinutes / 60) },
          { kind: "stat", label: "Total XP", value: totals.xpEarned },
          { kind: "stat", label: "Quests Completed", value: totals.questsCompleted },
          { kind: "stat", label: "Level-Ups", value: totals.levelChanges },
          { kind: "stat", label: "Friends Played With", value: totals.friendsPlayedWith },
          ...(countryRank
            ? [{
                kind: "rank",
                label: `Country rank in ${playerCountry}`,
                value: `#${countryRank}`,
              }]
            : []),
          { kind: "outro", title: "Glow on into the new year" },
        ],
        ...totals,
      };

      const [recap] = await db
        .insert(yearlyRecaps)
        .values({
          playerId,
          year,
          matchesPlayed: totals.matchesPlayed,
          matchesWon: totals.matchesWon,
          courtMinutes: totals.courtMinutes,
          xpEarned: totals.xpEarned,
          questsCompleted: totals.questsCompleted,
          levelChanges: totals.levelChanges,
          friendsPlayedWith: totals.friendsPlayedWith,
          countryRank,
          payload,
        })
        .onConflictDoUpdate({
          target: [yearlyRecaps.playerId, yearlyRecaps.year],
          set: {
            matchesPlayed: totals.matchesPlayed,
            matchesWon: totals.matchesWon,
            courtMinutes: totals.courtMinutes,
            xpEarned: totals.xpEarned,
            questsCompleted: totals.questsCompleted,
            levelChanges: totals.levelChanges,
            friendsPlayedWith: totals.friendsPlayedWith,
            countryRank,
            payload,
          },
        })
        .returning({ id: yearlyRecaps.id });
      if (!recap?.id) continue;

      // Only publish a feed item the first time the recap is created. The
      // upsert above would otherwise re-publish on every refresh.
      const feedItemId = await publishYearlyRecap({
        recapId: recap.id,
        playerId,
        year,
        payload,
      });
      if (feedItemId) {
        await db
          .update(yearlyRecaps)
          .set({ feedItemId })
          .where(eq(yearlyRecaps.id, recap.id));
      }

      await dispatchStaggeredPush(
        playerId,
        `Your ${year} in Tennis`,
        countryRank
          ? `Country rank #${countryRank} · ${totals.matchesPlayed} matches`
          : `${totals.matchesPlayed} matches · +${totals.xpEarned} XP`,
        { type: "yearly_recap", recapId: recap.id, year },
      );

      generated++;
    } catch (err) {
      console.error(`[YearRecap] player ${playerId} failed:`, err);
    }
  }

  console.log(`[YearRecap] Generated ${generated} recaps`);
  return { generated };
}

// ---------------------------------------------------------------------------
// FAMILY DIGEST  (parents/guardians get a summary of every child's week)
// ---------------------------------------------------------------------------

export async function runFamilyDigestOnce(now: Date = new Date()): Promise<{ sent: number }> {
  const { weekStart, weekEnd } = lastMondayUtc(now);
  // Group children by parent user.
  const relations = await db
    .select({
      parentUserId: parentPlayerRelations.parentUserId,
      playerId: parentPlayerRelations.playerId,
      canReceive: parentPlayerRelations.canReceiveNotifications,
    })
    .from(parentPlayerRelations);

  const byParent = new Map<string, string[]>();
  for (const r of relations) {
    if (r.canReceive === false) continue;
    const arr = byParent.get(r.parentUserId) || [];
    arr.push(r.playerId);
    byParent.set(r.parentUserId, arr);
  }

  let sent = 0;
  for (const [parentUserId, childIds] of byParent.entries()) {
    try {
      const childRows = await db
        .select({ id: players.id, name: players.name, age: players.age, parentEmail: players.parentEmail })
        .from(players)
        .where(inArray(players.id, childIds));

      const summaries: {
        playerId: string;
        name: string;
        matchesPlayed: number;
        matchesWon: number;
        sessionsAttended: number;
        questsCompleted: number;
      }[] = [];

      for (const child of childRows) {
        const totals = await computeTotalsForPlayer(child.id, weekStart, weekEnd);
        const sessionsAttendedRow = await db
          .select({ c: sql<number>`COUNT(*)::int`.as("c") })
          .from(sessionPlayers)
          .innerJoin(sessions, eq(sessions.id, sessionPlayers.sessionId))
          .where(
            and(
              eq(sessionPlayers.playerId, child.id),
              gte(sessions.startTime, weekStart),
              lt(sessions.startTime, weekEnd),
              inArray(sessionPlayers.attendanceStatus, ["present", "late"]),
            ),
          );
        const sessionsAttended = Number(sessionsAttendedRow[0]?.c ?? 0);
        if (totals.matchesPlayed > 0 || sessionsAttended > 0 || totals.questsCompleted > 0) {
          summaries.push({
            playerId: child.id,
            name: child.name,
            matchesPlayed: totals.matchesPlayed,
            matchesWon: totals.matchesWon,
            sessionsAttended,
            questsCompleted: totals.questsCompleted,
          });
        }
      }
      if (summaries.length === 0) continue;

      // Push (always) — staggered by parent user id.
      const tokens = await getUserPushTokens(parentUserId);
      const previewName = summaries[0].name.split(" ")[0];
      const totalSessions = summaries.reduce((s, x) => s + x.sessionsAttended, 0);
      const totalMatches = summaries.reduce((s, x) => s + x.matchesPlayed, 0);
      const body = summaries.length === 1
        ? `${previewName}: ${summaries[0].sessionsAttended} session${summaries[0].sessionsAttended === 1 ? "" : "s"} · ${summaries[0].matchesPlayed} match${summaries[0].matchesPlayed === 1 ? "" : "es"}`
        : `${summaries.length} kids · ${totalSessions} sessions · ${totalMatches} matches`;

      // Publish a private feed item so the parent sees it in their own feed too.
      const digestKey = `family-${parentUserId}-${dateOnly(weekStart)}`;
      void publishFamilyDigest({
        digestKey,
        parentUserId,
        weekStart: dateOnly(weekStart),
        payload: {
          weekStart: dateOnly(weekStart),
          weekEnd: dateOnly(weekEnd),
          childCount: summaries.length,
          totalSessions,
          totalMatches,
          summaries,
        },
      }).catch((err) => console.error("[FamilyDigest] publish failed:", err));

      if (tokens.length > 0) {
        const delay = staggerDelayMs(parentUserId);
        setTimeout(() => {
          void sendPushNotification(
            tokens,
            "Family Tennis Recap",
            body,
            { type: "family_digest", weekStart: dateOnly(weekStart) },
          ).catch((err) => console.error("[FamilyDigest] push failed:", err));
        }, delay);
      }

      // Optional email — gated on the legacy parent_reporting opt-in (per
      // child). If ANY child is opted-in and has a parentEmail, send a
      // combined family weekly email.
      const optedInChild = childRows.find((c) => c.parentEmail);
      if (optedInChild?.parentEmail) {
        try {
          const { sendEmail } = await import("../emailService");
          const html = renderFamilyDigestEmail(summaries, dateOnly(weekStart), dateOnly(weekEnd));
          await sendEmail({
            to: optedInChild.parentEmail,
            subject: `Your family's week in tennis — ${dateOnly(weekStart)}`,
            html,
          });
        } catch (err) {
          console.error("[FamilyDigest] email failed:", err);
        }
      }

      sent++;
    } catch (err) {
      console.error(`[FamilyDigest] parent ${parentUserId} failed:`, err);
    }
  }

  console.log(`[FamilyDigest] Sent to ${sent} parents`);
  return { sent };
}

function renderFamilyDigestEmail(
  summaries: {
    name: string;
    matchesPlayed: number;
    matchesWon: number;
    sessionsAttended: number;
    questsCompleted: number;
  }[],
  weekStartIso: string,
  weekEndIso: string,
): string {
  const rows = summaries
    .map(
      (s) => `
    <tr>
      <td style="padding:12px 16px;color:#fff;font-weight:600;border-bottom:1px solid #333;">${escapeHtml(s.name)}</td>
      <td style="padding:12px 16px;color:#cccccc;border-bottom:1px solid #333;text-align:center;">${s.sessionsAttended}</td>
      <td style="padding:12px 16px;color:#cccccc;border-bottom:1px solid #333;text-align:center;">${s.matchesPlayed} (${s.matchesWon}W)</td>
      <td style="padding:12px 16px;color:#cccccc;border-bottom:1px solid #333;text-align:center;">${s.questsCompleted}</td>
    </tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html><body style="background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#1a1a1a;border-radius:16px;padding:32px;">
    <h1 style="color:#2ECC40;margin:0 0 8px;font-size:22px;">Family Tennis Recap</h1>
    <p style="color:#888;margin:0 0 24px;font-size:13px;">Week of ${weekStartIso} → ${weekEndIso}</p>
    <table style="width:100%;border-collapse:collapse;background:#111;border-radius:12px;overflow:hidden;">
      <thead>
        <tr style="background:#222;color:#888;font-size:12px;">
          <th style="padding:10px 16px;text-align:left;">Player</th>
          <th style="padding:10px 16px;text-align:center;">Sessions</th>
          <th style="padding:10px 16px;text-align:center;">Matches</th>
          <th style="padding:10px 16px;text-align:center;">Quests</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#555;font-size:11px;margin-top:24px;text-align:center;">Glow Up Sports · You can opt out from the Parent dashboard.</p>
  </div></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// COACH DIGEST  (coaches get a summary of their squads' week)
// ---------------------------------------------------------------------------

export async function runCoachDigestOnce(now: Date = new Date()): Promise<{ sent: number }> {
  const { weekStart, weekEnd } = lastMondayUtc(now);

  // For each coach, find the players they coached this week (sessions joined
  // their session id).
  const coachRows = await db
    .select({ id: coaches.id, name: coaches.name })
    .from(coaches);

  let sent = 0;
  for (const coach of coachRows) {
    try {
      const r = await pool.query(
        `SELECT DISTINCT sp.player_id
           FROM sessions s
           JOIN session_players sp ON sp.session_id = s.id
          WHERE s.coach_id = $1
            AND s.start_time >= $2 AND s.start_time < $3`,
        [coach.id, weekStart, weekEnd],
      );
      const squadPlayerIds: string[] = (r.rows || [])
        .map((row: any) => row.player_id)
        .filter(Boolean);
      if (squadPlayerIds.length === 0) continue;

      let totalMatches = 0;
      let totalWins = 0;
      let totalQuests = 0;
      let totalLevelUps = 0;
      let absences = 0;
      let presents = 0;
      const improvers: string[] = [];

      for (const pid of squadPlayerIds) {
        const totals = await computeTotalsForPlayer(pid, weekStart, weekEnd);
        totalMatches += totals.matchesPlayed;
        totalWins += totals.matchesWon;
        totalQuests += totals.questsCompleted;
        totalLevelUps += totals.levelChanges;
        if (totals.levelChanges > 0 || totals.matchesWon >= 2) {
          const [p] = await db
            .select({ name: players.name })
            .from(players)
            .where(eq(players.id, pid))
            .limit(1);
          if (p?.name) improvers.push(p.name);
        }
        const att = await db
          .select({ a: sessionPlayers.attendanceStatus })
          .from(sessionPlayers)
          .innerJoin(sessions, eq(sessions.id, sessionPlayers.sessionId))
          .where(
            and(
              eq(sessionPlayers.playerId, pid),
              eq(sessions.coachId, coach.id),
              gte(sessions.startTime, weekStart),
              lt(sessions.startTime, weekEnd),
            ),
          );
        for (const row of att) {
          if (row.a === "absent") absences++;
          else if (row.a === "present" || row.a === "late") presents++;
        }
      }

      // Publish a private feed item so the coach sees a card too.
      const [coachUserRow] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.coachId, coach.id))
        .limit(1);
      const coachUserId = coachUserRow?.id ?? null;
      const digestKey = `coach-${coach.id}-${dateOnly(weekStart)}`;
      void publishCoachDigest({
        digestKey,
        coachUserId,
        coachId: coach.id,
        weekStart: dateOnly(weekStart),
        payload: {
          weekStart: dateOnly(weekStart),
          weekEnd: dateOnly(weekEnd),
          coachName: coach.name,
          playerCount: squadPlayerIds.length,
          totalMatches,
          totalWins,
          totalQuests,
          totalLevelUps,
          presents,
          absences,
          improvers: improvers.slice(0, 6),
        },
      }).catch((err) => console.error("[CoachDigest] publish failed:", err));

      const tokens = await getCoachPushTokens(coach.id);
      if (tokens.length === 0) {
        sent++;
        continue;
      }

      const body = `${squadPlayerIds.length} players · ${presents} present · ${absences} missed · ${totalMatches} matches · ${totalLevelUps} level-ups`;
      const delay = staggerDelayMs(coach.id);
      setTimeout(() => {
        void sendPushNotification(tokens, "Squad Weekly Recap", body, {
          type: "coach_digest",
          weekStart: dateOnly(weekStart),
          improvers,
        }).catch((err) => console.error("[CoachDigest] push failed:", err));
      }, delay);

      sent++;
    } catch (err) {
      console.error(`[CoachDigest] coach ${coach.id} failed:`, err);
    }
  }

  console.log(`[CoachDigest] Sent to ${sent} coaches`);
  return { sent };
}

// ---------------------------------------------------------------------------
// AUTO-HIGHLIGHT REELS
// ---------------------------------------------------------------------------

/**
 * Build a highlight-reel frames JSON from a logged match. Treats each set
 * + the final score line as a "score event" — needs ≥3 to publish.
 * Idempotent: the unique index on (match_log_id) prevents re-insertion.
 */
export async function runAutoHighlightForMatch(matchLogId: string): Promise<{ published: boolean; reason?: string }> {
  try {
    const [m] = await db.select().from(matchLogs).where(eq(matchLogs.id, matchLogId));
    if (!m) return { published: false, reason: "no_match" };

    const playerScore: number[] = Array.isArray(m.playerScore) ? m.playerScore : [];
    const opponentScore: number[] = Array.isArray(m.opponentScore) ? m.opponentScore : [];
    const setCount = Math.min(playerScore.length, opponentScore.length);
    // "Score events" = each completed set + any non-zero stat overlay (aces /
    // winners). Threshold is ≥3 per the task spec; below threshold skips.
    const aceEvent = (m.aces ?? 0) > 0 ? 1 : 0;
    const winnerEvent = (m.winners ?? 0) > 0 ? 1 : 0;
    const scoreEvents = setCount + aceEvent + winnerEvent;
    if (scoreEvents < 3) {
      return { published: false, reason: "insufficient_events" };
    }

    // Skip if already exists.
    const existing = await db
      .select({ id: highlightReels.id })
      .from(highlightReels)
      .where(eq(highlightReels.matchLogId, matchLogId))
      .limit(1);
    if (existing[0]) return { published: false, reason: "already_exists" };

    const frames: Record<string, unknown>[] = [];
    const opponentName = m.opponentName || "Opponent";

    frames.push({
      kind: "intro",
      label: `${m.matchType?.toUpperCase() || "MATCH"} vs ${opponentName}`,
      durationMs: 1500,
    });

    for (let i = 0; i < setCount; i++) {
      frames.push({
        kind: "set",
        setIndex: i + 1,
        playerScore: playerScore[i],
        opponentScore: opponentScore[i],
        label: `Set ${i + 1}: ${playerScore[i]}–${opponentScore[i]}`,
        durationMs: 2200,
      });
    }

    // Stat overlays
    if ((m.aces ?? 0) > 0) {
      frames.push({ kind: "stat", label: `${m.aces} aces`, durationMs: 1400 });
    }
    if ((m.winners ?? 0) > 0) {
      frames.push({ kind: "stat", label: `${m.winners} winners`, durationMs: 1400 });
    }

    frames.push({
      kind: "outro",
      label: m.result === "won" ? "Victory!" : m.result === "lost" ? "Tough match" : "Match logged",
      durationMs: 1800,
    });

    const durationMs = frames.reduce((s, f) => s + Number(f.durationMs || 0), 0);

    const [reel] = await db
      .insert(highlightReels)
      .values({
        playerId: m.playerId,
        matchLogId,
        frames,
        durationMs,
      })
      .onConflictDoNothing({ target: [highlightReels.matchLogId] })
      .returning({ id: highlightReels.id });
    if (!reel?.id) return { published: false, reason: "conflict" };

    const payload = {
      matchLogId,
      opponentName,
      result: m.result,
      matchType: m.matchType,
      playerScore,
      opponentScore,
      durationMs,
      framesCount: frames.length,
    };
    const feedItemId = await publishHighlightReel({
      reelId: reel.id,
      playerId: m.playerId,
      matchLogId,
      payload,
      occurredAt: m.playedAt,
    });
    if (feedItemId) {
      await db
        .update(highlightReels)
        .set({ feedItemId })
        .where(eq(highlightReels.id, reel.id));
    }
    return { published: true };
  } catch (err) {
    console.error("[AutoHighlight] failed:", err);
    return { published: false, reason: "error" };
  }
}

// ---------------------------------------------------------------------------
// JOB STARTER
// ---------------------------------------------------------------------------

const SUNDAY = 0;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function msUntilNextSundayAt(hourUtc: number, now: Date = new Date()): number {
  const target = new Date(now);
  target.setUTCHours(hourUtc, 0, 0, 0);
  const day = target.getUTCDay();
  const offset = day === SUNDAY && target.getTime() > now.getTime() ? 0 : (7 - day) % 7 || 7;
  target.setUTCDate(target.getUTCDate() + offset);
  return Math.max(target.getTime() - now.getTime(), 0);
}

function msUntilNextFirstOfMonth(hourUtc: number, now: Date = new Date()): number {
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, hourUtc, 0, 0, 0));
  return Math.max(target.getTime() - now.getTime(), 0);
}

function msUntilNextDecemberFirst(hourUtc: number, now: Date = new Date()): number {
  let year = now.getUTCFullYear();
  let target = new Date(Date.UTC(year, 11, 1, hourUtc, 0, 0, 0));
  if (target.getTime() <= now.getTime()) {
    year++;
    target = new Date(Date.UTC(year, 11, 1, hourUtc, 0, 0, 0));
  }
  return Math.max(target.getTime() - now.getTime(), 0);
}

export function startDigestJobs(): void {
  // Catch-up on boot — the unique indexes guarantee idempotency.
  setTimeout(() => {
    void runWeeklyDigestOnce().catch((err) => console.error("[DigestJobs] weekly boot catch-up failed:", err));
    void runFamilyDigestOnce().catch((err) => console.error("[DigestJobs] family boot catch-up failed:", err));
    void runCoachDigestOnce().catch((err) => console.error("[DigestJobs] coach boot catch-up failed:", err));
    void runMonthlyDigestOnce().catch((err) => console.error("[DigestJobs] monthly boot catch-up failed:", err));
    // Year recap — only catch-up if we're inside the December → end-of-Jan window.
    const now = new Date();
    const m = now.getUTCMonth();
    if (m === 11 || m === 0) {
      void runYearlyRecapOnce().catch((err) => console.error("[DigestJobs] yearly boot catch-up failed:", err));
    }
  }, 90_000); // 90s after boot — well after the player-of-week catch-up

  // Weekly: every Sunday 18:00 UTC.
  const weeklyDelay = msUntilNextSundayAt(18);
  console.log(
    `[DigestJobs] Next weekly digest in ${Math.round(weeklyDelay / 60_000)} min (Sunday 18:00 UTC)`,
  );
  setTimeout(() => {
    void runWeeklyDigestOnce().catch((err) => console.error("[DigestJobs] weekly tick failed:", err));
    void runFamilyDigestOnce().catch((err) => console.error("[DigestJobs] family tick failed:", err));
    void runCoachDigestOnce().catch((err) => console.error("[DigestJobs] coach tick failed:", err));
    setInterval(() => {
      void runWeeklyDigestOnce().catch((err) => console.error("[DigestJobs] weekly tick failed:", err));
      void runFamilyDigestOnce().catch((err) => console.error("[DigestJobs] family tick failed:", err));
      void runCoachDigestOnce().catch((err) => console.error("[DigestJobs] coach tick failed:", err));
    }, WEEK_MS);
  }, weeklyDelay);

  // Monthly: first of every month 06:00 UTC.
  const monthlyDelay = msUntilNextFirstOfMonth(6);
  console.log(
    `[DigestJobs] Next monthly digest in ${Math.round(monthlyDelay / 60_000)} min`,
  );
  setTimeout(() => {
    void runMonthlyDigestOnce().catch((err) => console.error("[DigestJobs] monthly tick failed:", err));
    // Schedule the next one at the first of the next month — recompute each
    // time because months have variable lengths.
    const reschedule = () => {
      const next = msUntilNextFirstOfMonth(6);
      setTimeout(() => {
        void runMonthlyDigestOnce().catch((err) => console.error("[DigestJobs] monthly tick failed:", err));
        reschedule();
      }, next);
    };
    reschedule();
  }, monthlyDelay);

  // Yearly: Dec 1 at 09:00 UTC. After that runs daily through end of Jan to
  // pick up late activity (idempotent upsert).
  const yearlyDelay = msUntilNextDecemberFirst(9);
  console.log(
    `[DigestJobs] Next year-recap in ${Math.round(yearlyDelay / DAY_MS)} day(s)`,
  );
  setTimeout(() => {
    void runYearlyRecapOnce().catch((err) => console.error("[DigestJobs] yearly tick failed:", err));
    // Daily refresh for the rest of December and all of January.
    const dailyId = setInterval(() => {
      const now = new Date();
      const m = now.getUTCMonth();
      if (m === 11 || m === 0) {
        void runYearlyRecapOnce().catch((err) => console.error("[DigestJobs] yearly daily tick failed:", err));
      } else {
        clearInterval(dailyId);
      }
    }, DAY_MS);
  }, yearlyDelay);
}

export const __testing = {
  runWeeklyDigestOnce,
  runMonthlyDigestOnce,
  runYearlyRecapOnce,
  runFamilyDigestOnce,
  runCoachDigestOnce,
  runAutoHighlightForMatch,
  computeTotalsForPlayer,
  lastMondayUtc,
  lastMonthUtc,
};
