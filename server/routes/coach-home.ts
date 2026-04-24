import { Router } from "express";
import type { Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import {
  coaches,
  sessions,
  locations,
  locationTravelTimes,
  sessionPlayers,
  coachingSeries,
  players,
  sessionSkillFeedback,
  bookingRequests,
  coachSettings,
  xpTransactions,
} from "@shared/schema";
import {
  eq,
  and,
  gte,
  lte,
  isNotNull,
  asc,
  inArray,
  isNull,
  lt,
  desc,
  gte as greaterThanOrEqual,
  count,
  sql,
} from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
} from "../auth";
import type { AuthenticatedRequest } from "../auth";
import {
  fetchDistanceMatrixMinutes,
  haversineKm,
  SAME_LOCATION_KM,
  LOCATION_FRESHNESS_MINUTES,
} from "./coach-location";

const router = Router();

interface CacheEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}

const homeDataCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function getCached(coachId: string): Record<string, unknown> | null {
  const entry = homeDataCache.get(coachId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    homeDataCache.delete(coachId);
    return null;
  }
  return entry.data;
}

function setCache(coachId: string, data: Record<string, unknown>): void {
  homeDataCache.set(coachId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

router.get(
  "/api/coach/me/home-data",
  authMiddleware,
  requireRole("coach", "assistant", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;

      if (!coachId) {
        return res.status(400).json({ error: "Coach profile not found" });
      }

      const cached = getCached(coachId);
      if (cached) {
        return res.json(cached);
      }

      const [
        notificationsResult,
        pendingAttendanceResult,
        pendingFeedbackResult,
        pendingBookingResult,
        nextSessionEtaResult,
        coachXpResult,
        burnoutRiskResult,
        reviewsResult,
        pendingMatchReviewsResult,
      ] = await Promise.all([
        fetchNotifications(coachId),
        fetchPendingAttendance(coachId),
        fetchPendingFeedback(coachId, academyId),
        fetchPendingBookingRequests(coachId, academyId),
        fetchNextSessionEta(coachId),
        fetchCoachXp(coachId, academyId),
        fetchBurnoutRisk(coachId, academyId),
        fetchReviews(coachId),
        fetchPendingMatchReviews(coachId),
      ]);

      const result: Record<string, unknown> = {
        notifications: notificationsResult,
        unreadNotificationCount: Array.isArray(notificationsResult)
          ? notificationsResult.filter((n: any) => !n.isRead).length
          : 0,
        pendingAttendance: pendingAttendanceResult,
        pendingAttendanceCount: Array.isArray(pendingAttendanceResult)
          ? pendingAttendanceResult.length
          : 0,
        pendingFeedback: pendingFeedbackResult,
        pendingBookingRequests: pendingBookingResult,
        pendingBookingCount: Array.isArray(pendingBookingResult)
          ? pendingBookingResult.length
          : 0,
        nextSessionEta: nextSessionEtaResult,
        xp: coachXpResult,
        burnoutRisk: burnoutRiskResult,
        reviews: reviewsResult,
        pendingMatchReviews: pendingMatchReviewsResult,
        pendingMatchReviewCount: Array.isArray(pendingMatchReviewsResult)
          ? pendingMatchReviewsResult.length
          : 0,
      };

      setCache(coachId, result);
      return res.json(result);
    } catch (err) {
      console.error("[coach-home] GET /api/coach/me/home-data error:", err);
      return res.status(500).json({ error: "Failed to fetch home data" });
    }
  }
);

async function fetchNotifications(coachId: string): Promise<unknown[]> {
  try {
    return await storage.getCoachNotifications(coachId);
  } catch {
    return [];
  }
}

async function fetchPendingAttendance(coachId: string): Promise<unknown[]> {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const pendingSessionRows = await db
      .select({ sessionId: sessions.id, startTime: sessions.startTime })
      .from(sessions)
      .where(
        and(
          eq(sessions.coachId, coachId),
          eq(sessions.status, "completed"),
          lt(sessions.endTime, now),
          gte(sessions.startTime, thirtyDaysAgo),
          isNull(sessions.coachReviewedAt)
        )
      )
      .orderBy(desc(sessions.startTime))
      .limit(20);

    if (pendingSessionRows.length === 0) return [];

    const sessionIds = pendingSessionRows
      .map((r) => r.sessionId)
      .filter(Boolean) as string[];

    const [sessionDetails, allPlayers] = await Promise.all([
      db
        .select({
          sessionId: sessions.id,
          startTime: sessions.startTime,
          endTime: sessions.endTime,
          sessionType: sessions.sessionType,
          seriesId: sessions.seriesId,
          seriesTitle: coachingSeries.title,
        })
        .from(sessions)
        .leftJoin(coachingSeries, eq(coachingSeries.id, sessions.seriesId))
        .where(inArray(sessions.id, sessionIds))
        .orderBy(desc(sessions.startTime)),
      db
        .select({
          sessionId: sessionPlayers.sessionId,
          playerId: sessionPlayers.playerId,
          playerName: players.name,
        })
        .from(sessionPlayers)
        .innerJoin(players, eq(players.id, sessionPlayers.playerId))
        .where(inArray(sessionPlayers.sessionId, sessionIds)),
    ]);

    return sessionDetails.map((sess) => ({
      sessionId: sess.sessionId,
      startTime: sess.startTime,
      endTime: sess.endTime,
      sessionType: sess.sessionType,
      seriesTitle: sess.seriesTitle ?? "Session",
      players: allPlayers
        .filter((p) => p.sessionId === sess.sessionId)
        .map((p) => ({ id: p.playerId, name: p.playerName })),
    }));
  } catch {
    return [];
  }
}

async function fetchPendingFeedback(
  coachId: string,
  academyId: string | null | undefined
): Promise<unknown[]> {
  if (!coachId || !academyId) return [];
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recentCompleted = await db
      .select({
        id: sessions.id,
        startTime: sessions.startTime,
        sessionType: sessions.sessionType,
        status: sessions.status,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.coachId, coachId),
          eq(sessions.status, "completed"),
          gte(sessions.startTime, sevenDaysAgo)
        )
      )
      .orderBy(desc(sessions.startTime));

    if (recentCompleted.length === 0) return [];

    const sessionIds = recentCompleted.map((s) => s.id);

    const [presentPlayers, existingFeedback] = await Promise.all([
      db
        .select({
          sessionId: sessionPlayers.sessionId,
          playerId: sessionPlayers.playerId,
          playerName: players.name,
          attendanceStatus: sessionPlayers.attendanceStatus,
        })
        .from(sessionPlayers)
        .innerJoin(players, eq(sessionPlayers.playerId, players.id))
        .where(
          and(
            inArray(sessionPlayers.sessionId, sessionIds),
            eq(sessionPlayers.attendanceStatus, "present")
          )
        ),
      db
        .select({
          sessionId: sessionSkillFeedback.sessionId,
          playerId: sessionSkillFeedback.playerId,
        })
        .from(sessionSkillFeedback)
        .where(inArray(sessionSkillFeedback.sessionId, sessionIds)),
    ]);

    const feedbackSet = new Set(
      existingFeedback.map((f) => `${f.sessionId}:${f.playerId}`)
    );

    const playersBySession = new Map<
      string,
      { id: string; name: string; attendanceStatus: string }[]
    >();
    for (const p of presentPlayers) {
      if (!playersBySession.has(p.sessionId)) {
        playersBySession.set(p.sessionId, []);
      }
      playersBySession
        .get(p.sessionId)!
        .push({
          id: p.playerId,
          name: p.playerName,
          attendanceStatus: p.attendanceStatus ?? "present",
        });
    }

    const pending: unknown[] = [];
    for (const session of recentCompleted) {
      const sessionPlayerList = playersBySession.get(session.id) || [];
      if (sessionPlayerList.length === 0) continue;

      const isGroup = session.sessionType === "group";
      const isSemiPrivate = session.sessionType === "semi_private";
      const isPrivate = session.sessionType === "private";

      if (isGroup) {
        const missingPlayers = sessionPlayerList.filter(
          (p) => !feedbackSet.has(`${session.id}:${p.id}`)
        );
        if (missingPlayers.length > 0) {
          pending.push({
            sessionId: session.id,
            startTime: session.startTime,
            sessionType: session.sessionType,
            players: missingPlayers,
            playerCount: missingPlayers.length,
            needsGroupDynamics: true,
            cardType: "group",
          });
        }
      } else {
        for (const p of sessionPlayerList) {
          if (!feedbackSet.has(`${session.id}:${p.id}`)) {
            pending.push({
              sessionId: session.id,
              startTime: session.startTime,
              sessionType: session.sessionType,
              players: [p],
              playerCount: 1,
              needsGroupDynamics: isSemiPrivate,
              cardType: isPrivate ? "private" : "semi_private",
            });
          }
        }
      }
    }

    return pending;
  } catch {
    return [];
  }
}

async function fetchPendingBookingRequests(
  coachId: string,
  academyId: string | null | undefined
): Promise<unknown[]> {
  try {
    const requests = await storage.getBookingRequests({
      coachId,
      academyId: academyId || undefined,
      status: "pending",
    });
    if (!Array.isArray(requests) || requests.length === 0) return [];

    // Get coach settings for response window
    const [coachSetting] = await db
      .select({
        bookingResponseWindowMinutes: coachSettings.bookingResponseWindowMinutes,
      })
      .from(coachSettings)
      .where(eq(coachSettings.coachId, coachId))
      .limit(1);
    const responseWindowMinutes = coachSetting?.bookingResponseWindowMinutes ?? 120;

    // Enrich with player data
    const playerIds = [...new Set(requests.map((r: any) => r.playerId).filter(Boolean))];
    const playerRows = playerIds.length > 0
      ? await db
          .select({
            id: players.id,
            name: players.name,
            ballLevel: players.ballLevel,
            skillLevel: players.skillLevel,
            profilePhotoUrl: players.profilePhotoUrl,
          })
          .from(players)
          .where(inArray(players.id, playerIds))
      : [];

    const playerMap = new Map(playerRows.map((p: any) => [p.id, p]));

    // Count past sessions between each player and this coach in a single
    // grouped query (avoid N+1: was one count query per player).
    const pastSessionCounts: Record<string, number> = {};
    if (playerIds.length > 0) {
      const countRows = await db
        .select({
          playerId: sessionPlayers.playerId,
          cnt: count(sessionPlayers.sessionId),
        })
        .from(sessionPlayers)
        .innerJoin(sessions, eq(sessions.id, sessionPlayers.sessionId))
        .where(
          and(
            inArray(sessionPlayers.playerId, playerIds),
            eq(sessions.coachId, coachId),
            sql`${sessions.status} = 'completed'`
          )
        )
        .groupBy(sessionPlayers.playerId);
      for (const row of countRows) {
        if (row.playerId) {
          pastSessionCounts[row.playerId] = Number(row.cnt ?? 0);
        }
      }
    }

    // Get player XP streak (total XP as proxy)
    const xpRows = playerIds.length > 0
      ? await db
          .select({ playerId: xpTransactions.playerId, total: sql<number>`SUM(${xpTransactions.xpAmount})` })
          .from(xpTransactions)
          .where(inArray(xpTransactions.playerId, playerIds))
          .groupBy(xpTransactions.playerId)
      : [];
    const xpMap = new Map(xpRows.map((r: any) => [r.playerId, Number(r.total ?? 0)]));

    return requests.map((req: any) => {
      const player = playerMap.get(req.playerId);
      const createdAt = new Date(req.createdAt);
      const expiresAt = req.expiresAt
        ? new Date(req.expiresAt)
        : new Date(createdAt.getTime() + responseWindowMinutes * 60 * 1000);
      const duration = Math.round(
        (new Date(req.requestedEnd).getTime() - new Date(req.requestedStart).getTime()) / 60000
      );
      return {
        ...req,
        duration: isNaN(duration) ? 60 : duration,
        expiresAt: expiresAt.toISOString(),
        playerName: player?.name || null,
        playerPhotoUrl: player?.profilePhotoUrl || null,
        playerLevel: player?.ballLevel || null,
        playerSkillLevel: player?.skillLevel || null,
        lessonsWithCoach: pastSessionCounts[req.playerId] ?? 0,
        playerXp: xpMap.get(req.playerId) ?? 0,
      };
    });
  } catch (err) {
    console.error("[coach-home] fetchPendingBookingRequests error:", err);
    return [];
  }
}

async function fetchNextSessionEta(coachId: string): Promise<unknown> {
  try {
    const [coach] = await db
      .select({
        id: coaches.id,
        lastLat: coaches.lastLat,
        lastLng: coaches.lastLng,
        lastLocationAt: coaches.lastLocationAt,
        homeLocationId: coaches.homeLocationId,
      })
      .from(coaches)
      .where(eq(coaches.id, coachId));

    if (!coach) return null;

    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const upcomingSessions = await db
      .select({
        id: sessions.id,
        startTime: sessions.startTime,
        locationId: sessions.locationId,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.coachId, coachId),
          inArray(sessions.status, ["scheduled", "upcoming"]),
          gte(sessions.startTime, now),
          lte(sessions.startTime, todayEnd),
          isNotNull(sessions.locationId)
        )
      )
      .orderBy(asc(sessions.startTime))
      .limit(1);

    if (upcomingSessions.length === 0) {
      return { eta: null, reason: "no_upcoming_sessions" };
    }

    const nextSession = upcomingSessions[0];
    const sessionStart = new Date(nextSession.startTime);
    const minutesToSession = Math.round(
      (sessionStart.getTime() - now.getTime()) / (1000 * 60)
    );

    const [sessionLocation] = await db
      .select({
        id: locations.id,
        name: locations.name,
        lat: locations.lat,
        lng: locations.lng,
      })
      .from(locations)
      .where(eq(locations.id, nextSession.locationId!));

    if (!sessionLocation) {
      return { eta: null, reason: "location_not_found" };
    }

    const destLat = sessionLocation.lat;
    const destLng = sessionLocation.lng;

    if (
      destLat === null ||
      destLat === undefined ||
      destLng === null ||
      destLng === undefined
    ) {
      return { eta: null, reason: "location_no_coordinates" };
    }

    if (
      coach.lastLat === null ||
      coach.lastLat === undefined ||
      coach.lastLng === null ||
      coach.lastLng === undefined
    ) {
      return {
        sessionId: nextSession.id,
        locationName: sessionLocation.name,
        sessionStart: sessionStart.toISOString(),
        minutesToSession,
        eta: null,
        reason: "no_coach_location",
      };
    }

    const freshnessMs = LOCATION_FRESHNESS_MINUTES * 60 * 1000;
    if (coach.lastLocationAt !== null && coach.lastLocationAt !== undefined) {
      const ageMs =
        now.getTime() - new Date(coach.lastLocationAt).getTime();
      if (ageMs > freshnessMs) {
        return {
          sessionId: nextSession.id,
          locationName: sessionLocation.name,
          sessionStart: sessionStart.toISOString(),
          minutesToSession,
          eta: null,
          reason: "stale_coach_location",
        };
      }
    }

    const coachLat = coach.lastLat;
    const coachLng = coach.lastLng;
    const distKm = haversineKm(coachLat, coachLng, destLat, destLng);

    if (distKm < SAME_LOCATION_KM) {
      return {
        sessionId: nextSession.id,
        locationName: sessionLocation.name,
        sessionStart: sessionStart.toISOString(),
        minutesToSession,
        minutes: 0,
        sameLocation: true,
      };
    }

    let travelMinutes: number | null = null;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      try {
        travelMinutes = await fetchDistanceMatrixMinutes(
          coachLat,
          coachLng,
          destLat,
          destLng,
          apiKey
        );
      } catch {
        // fall through to fallback
      }
    }

    if (travelMinutes === null) {
      travelMinutes = await fallbackTravelMinutes(
        coachId,
        coachLat,
        coachLng,
        sessionLocation.id,
        coach.homeLocationId ?? null
      );
    }

    const shouldLeaveInMinutes = minutesToSession - travelMinutes;

    return {
      sessionId: nextSession.id,
      locationName: sessionLocation.name,
      sessionStart: sessionStart.toISOString(),
      minutesToSession,
      minutes: travelMinutes,
      sameLocation: false,
      shouldLeaveInMinutes,
    };
  } catch {
    return null;
  }
}

async function fallbackTravelMinutes(
  coachId: string,
  coachLat: number,
  coachLng: number,
  toLocationId: string,
  homeLocationId: string | null
): Promise<number> {
  let fromLocationId: string | null = homeLocationId;

  if (fromLocationId === null) {
    const allLocations = await db
      .select({ id: locations.id, lat: locations.lat, lng: locations.lng })
      .from(locations)
      .where(isNotNull(locations.lat));

    let nearestId: string | null = null;
    let nearestDist = Infinity;
    for (const loc of allLocations) {
      if (
        loc.lat === null ||
        loc.lat === undefined ||
        loc.lng === null ||
        loc.lng === undefined
      )
        continue;
      const d = haversineKm(coachLat, coachLng, loc.lat, loc.lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestId = loc.id;
      }
    }
    fromLocationId = nearestId;
  }

  if (fromLocationId !== null) {
    const [row] = await db
      .select({ travelTimeMinutes: locationTravelTimes.travelTimeMinutes })
      .from(locationTravelTimes)
      .where(
        and(
          eq(locationTravelTimes.coachId, coachId),
          eq(locationTravelTimes.fromLocationId, fromLocationId),
          eq(locationTravelTimes.toLocationId, toLocationId)
        )
      )
      .limit(1);

    if (row?.travelTimeMinutes !== undefined) return row.travelTimeMinutes;
  }

  const [anyRow] = await db
    .select({ travelTimeMinutes: locationTravelTimes.travelTimeMinutes })
    .from(locationTravelTimes)
    .where(
      and(
        eq(locationTravelTimes.coachId, coachId),
        eq(locationTravelTimes.toLocationId, toLocationId)
      )
    )
    .limit(1);

  if (anyRow?.travelTimeMinutes !== undefined) return anyRow.travelTimeMinutes;

  return 30;
}

async function fetchCoachXp(
  coachId: string,
  academyId: string | null | undefined
): Promise<unknown> {
  if (!academyId) return null;
  try {
    const coach = await storage.getCoach(coachId, academyId);
    if (!coach) return null;

    const totalXp = coach.totalXp || 0;
    const level = coach.level || 1;

    let accumulatedXp = 0;
    for (let lvl = 1; lvl < level; lvl++) {
      accumulatedXp += 500 + (lvl - 1) * 100;
    }
    const requiredForLevel = 500 + (level - 1) * 100;
    const currentLevelXp = Math.max(0, totalXp - accumulatedXp);
    const xpPercent = Math.min(
      100,
      Math.max(
        0,
        Math.round((currentLevelXp / requiredForLevel) * 100)
      )
    );

    return { level, totalXp, currentLevelXp, requiredForLevel, xpPercent };
  } catch {
    return null;
  }
}

async function fetchBurnoutRisk(
  coachId: string,
  academyId: string | null | undefined
): Promise<unknown> {
  if (!academyId) return null;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pastStart = new Date(today);
    pastStart.setDate(pastStart.getDate() - 14);

    const futureEnd = new Date(today);
    futureEnd.setDate(futureEnd.getDate() + 7);

    const [pastSessions, futureSessions] = await Promise.all([
      storage.getSessionsByCoach(coachId, pastStart, today, academyId),
      storage.getSessionsByCoach(coachId, today, futureEnd, academyId),
    ]);

    const pastMinutes = pastSessions.reduce(
      (acc, s) => acc + (s.duration || 60),
      0
    );
    const futureMinutes = futureSessions.reduce(
      (acc, s) => acc + (s.duration || 60),
      0
    );

    const avgDailyPast = pastMinutes / 14;
    const avgDailyFuture = futureMinutes / 7;

    let consecutiveHeavyDays = 0;
    let maxConsecutiveHeavy = 0;
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i - 1);
      const dateStr = checkDate.toISOString().split("T")[0];

      const dayMinutes = pastSessions
        .filter(
          (s) =>
            new Date(s.startTime).toISOString().split("T")[0] === dateStr
        )
        .reduce((acc, s) => acc + (s.duration || 60), 0);

      if (dayMinutes >= 300) {
        consecutiveHeavyDays++;
        maxConsecutiveHeavy = Math.max(
          maxConsecutiveHeavy,
          consecutiveHeavyDays
        );
      } else {
        consecutiveHeavyDays = 0;
      }
    }

    let riskScore = 0;
    riskScore += Math.min(40, (avgDailyPast / 360) * 40);
    riskScore += Math.min(30, maxConsecutiveHeavy * 10);

    if (avgDailyFuture > avgDailyPast * 1.2) {
      riskScore += Math.min(
        20,
        (avgDailyFuture / avgDailyPast - 1) * 20
      );
    }

    const restDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - i - 1);
      const dateStr = d.toISOString().split("T")[0];
      return (
        pastSessions.filter(
          (s) =>
            new Date(s.startTime).toISOString().split("T")[0] === dateStr
        ).length === 0
      );
    }).filter(Boolean).length;

    if (restDays === 0) riskScore += 10;
    else if (restDays === 1) riskScore += 5;

    const riskLevel =
      riskScore >= 75
        ? "critical"
        : riskScore >= 50
        ? "high"
        : riskScore >= 25
        ? "moderate"
        : "low";

    return {
      riskScore: Math.round(riskScore),
      riskLevel,
      metrics: {
        avgDailyMinutesPast: Math.round(avgDailyPast),
        avgDailyMinutesFuture: Math.round(avgDailyFuture),
        consecutiveHeavyDays: maxConsecutiveHeavy,
        restDaysLastWeek: restDays,
        totalMinutesPast14Days: pastMinutes,
        scheduledMinutesNext7Days: futureMinutes,
      },
    };
  } catch {
    return null;
  }
}

async function fetchReviews(coachId: string): Promise<unknown> {
  try {
    const stats = await storage.getCoachReviewStats(coachId);
    return {
      stats: stats
        ? {
            totalReviews: stats.totalReviews || 0,
            averageOverall: stats.averageOverall
              ? parseFloat(stats.averageOverall.toString())
              : null,
          }
        : null,
    };
  } catch {
    return { stats: null };
  }
}

async function fetchPendingMatchReviews(coachId: string): Promise<unknown[]> {
  try {
    const { matches } = await import("@shared/schema");
    const playersResult = await db
      .select()
      .from(players)
      .where(eq(players.coachId, coachId));

    const playerIds = playersResult.map((p) => p.id);
    if (playerIds.length === 0) return [];

    const { sql } = await import("drizzle-orm");
    const recentMatches = await db
      .select()
      .from(matches)
      .where(
        sql`${matches.playerId} = ANY(${playerIds}) AND ${matches.verifiedBy} IS NULL`
      )
      .orderBy(desc(matches.matchDate))
      .limit(20);

    const matchesWithPlayers = await Promise.all(
      recentMatches.map(async (match) => {
        const [player] = await db
          .select()
          .from(players)
          .where(eq(players.id, match.playerId));
        return { ...match, player };
      })
    );

    return matchesWithPlayers;
  } catch {
    return [];
  }
}

export function invalidateHomeDataCache(coachId: string): void {
  homeDataCache.delete(coachId);
}

export default router;
