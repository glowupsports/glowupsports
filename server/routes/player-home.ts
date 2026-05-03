// Task #1379 — Player home god-endpoint.
//
// Background: the iPhone Player Home screen was visibly heavier than the
// Coach Home, even though Coach renders just as much. The difference came
// down to mount-time fanout: ProPlayerHomeScreen fired five+ React Query
// calls in parallel on first paint, where Coach Home fires exactly one
// (`/api/coach/me/home-data`). On iOS the JS<->native bridge serialises
// concurrent fetches more strictly than Android, so the player screens
// blocked behind their own request stack while Coach already had its
// response in hand.
//
// This endpoint mirrors the coach-home pattern: one HTTP round trip
// returns every blob ProPlayerHome needs to paint above the fold. It does
// NOT replace the existing per-resource endpoints (`/api/player/me/dashboard`
// etc.) — those keep working for child components, deep links, and any
// other consumer. The screen-level mount fanout is the only thing that
// shrinks; everything else is unchanged.
//
// Cache: 30s in-memory per playerId, matching coach-home.ts. Failures in
// individual branches are absorbed via `Promise.allSettled` so one slow
// or broken sub-fetch (e.g. AI context) cannot black-out the whole home
// screen — exactly the kind of regression the user has been hit by.

import { Router } from "express";
import type { NextFunction, Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import {
  bookingRequests,
  playerNotifications,
  aiCoachConversations,
  spotlightNominations,
  spotlightWeeklyWinners,
  players,
  playerQuests,
  coachAssignedDrills,
  drills,
} from "@shared/schema";
import { and, desc, eq, isNotNull, count, isNull } from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
} from "../auth";
import type { AuthenticatedRequest } from "../auth";
import { dispatchInProcess } from "../lib/in-process-dispatch";

const router = Router();

interface CacheEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}

const homeDataCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function getCached(playerId: string): Record<string, unknown> | null {
  const entry = homeDataCache.get(playerId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    homeDataCache.delete(playerId);
    return null;
  }
  return entry.data;
}

function setCache(playerId: string, data: Record<string, unknown>): void {
  homeDataCache.set(playerId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidatePlayerHomeDataCache(playerId: string): void {
  homeDataCache.delete(playerId);
}

// Task #1419 — branch-level slow cache.
//
// The route-level cache has a 30s TTL because the dashboard branch
// (next session, credits, unread count) genuinely changes that often
// during a coaching day. But several branches change much more slowly
// (profile DNA fields, weekly digest, AI coach context which is computed
// from rolling 30-day analytics, the spotlight weekly winner). Re-running
// those every 30s on a hot home tab burns DB time for no client-visible
// benefit.
//
// `memoBranch` wraps a fetcher so the underlying call only fires every
// `ttlMs` per playerId; intermediate calls in the same window get the
// cached value without paying the DB cost. Failures are NOT cached so
// a transient error does not get pinned for the full window.
const SLOW_BRANCH_TTL_MS = 5 * 60 * 1000;
const branchCaches = new Map<string, Map<string, { value: unknown; expiresAt: number }>>();

function memoBranch<T>(
  branch: string,
  ttlMs: number,
  fetcher: (playerId: string) => Promise<T>,
): (playerId: string) => Promise<T> {
  let bucket = branchCaches.get(branch);
  if (!bucket) {
    bucket = new Map();
    branchCaches.set(branch, bucket);
  }
  const cache = bucket;
  return async (playerId: string): Promise<T> => {
    const hit = cache.get(playerId);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value as T;
    }
    const value = await fetcher(playerId);
    cache.set(playerId, { value, expiresAt: Date.now() + ttlMs });
    return value;
  };
}

// Local middleware mirroring `requirePlayerOrOwner` from admin-series.ts —
// duplicated here so this route file stays self-contained.
function requirePlayerOrOwner(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const role = req.user.role;
  if (
    role === "platform_owner" ||
    role === "academy_owner" ||
    role === "owner" ||
    role === "admin" ||
    role === "player"
  ) {
    next();
    return;
  }
  if (role === "coach" && req.user.coachId) {
    next();
    return;
  }
  res.status(403).json({ error: "Player account required" });
}

router.get(
  "/api/player/me/home-data",
  authMiddleware,
  requirePlayerOrOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const role = req.user?.role;

      // Pre-onboarding / no-player-profile users: return the same empty
      // shell the standalone /dashboard endpoint returns, so the screen
      // can show the onboarding prompt without crashing.
      if (!playerId) {
        const isPlayerNeedingOnboarding = role === "player";
        return res.json({
          dashboard: {
            isOnboarding: isPlayerNeedingOnboarding,
            isFreePlayer: false,
            pendingRequest: null,
            player: isPlayerNeedingOnboarding
              ? { onboardingCompleted: false }
              : null,
            coach: null,
            academy: null,
            nextSession: null,
            upcomingSessions: [],
            lastFeedback: null,
            recentXpGains: [],
            credits: { total: 0, group: 0, private: 0, semi_private: 0 },
            creditsTotal: 0,
            creditsByType: { group: 0, private: 0, semi_private: 0 },
          },
          profile: { player: null, coach: null, academy: null },
          unreadCount: { count: 0 },
          weeklyDigest: null,
          aiCoachContext: null,
          spotlightCurrentWeek: null,
          spotlightWeeklyWinner: { winner: null },
          tennisIq: null,
          aiProStatus: { isPro: false, isCoach: false, callCount: 0, limit: 5 },
        });
      }

      const cached = getCached(playerId);
      if (cached) {
        return res.json(cached);
      }

      // All branches run in parallel. We use allSettled because a single
      // slow/broken sub-fetch (most often the AI context) used to take
      // the entire home screen down with it.
      //
      // Task #1418 — added the spotlightCurrentWeek + spotlightWeeklyWinner
      // branches. Both used to be standalone useQuery calls on
      // ProPlayerHomeScreen mount, contributing to the cold-start spinner
      // freeze on iOS. Folding them into the god-route lets the screen
      // seed react-query from the same response and skip those network
      // round-trips entirely.
      //
      // Task #1419 — added the tennisIq + aiProStatus branches for the
      // same reason: TennisIQMiniTile and UnifiedImproveCard each fired
      // their own useQuery on mount. Both are cheap; tennisIq is on the
      // 5-min slow tier, aiProStatus on the route-level 30s tier (quota
      // counters change per call).
      const _userId = req.user!.userId;
      const [
        dashboardResult,
        profileResult,
        unreadResult,
        weeklyDigestResult,
        aiCoachContextResult,
        spotlightCurrentWeekResult,
        spotlightWeeklyWinnerResult,
        tennisIqResult,
        aiProStatusResult,
        dailyFocusResult,
        drillRecommendationResult,
      ] = await Promise.allSettled([
        fetchDashboard(playerId),
        fetchProfile(req),
        fetchUnreadCount(playerId),
        fetchWeeklyDigest(playerId),
        fetchAiCoachContext(playerId),
        fetchSpotlightCurrentWeek(playerId),
        fetchSpotlightWeeklyWinner(playerId),
        fetchTennisIq(playerId),
        fetchAiProStatus(req),
        computeDailyFocus(playerId),
        fetchDrillRecommendation(playerId),
      ]);

      const result: Record<string, unknown> = {
        dashboard:
          dashboardResult.status === "fulfilled" ? dashboardResult.value : null,
        profile:
          profileResult.status === "fulfilled" ? profileResult.value : null,
        unreadCount:
          unreadResult.status === "fulfilled"
            ? unreadResult.value
            : { count: 0 },
        weeklyDigest:
          weeklyDigestResult.status === "fulfilled"
            ? weeklyDigestResult.value
            : null,
        aiCoachContext:
          aiCoachContextResult.status === "fulfilled"
            ? aiCoachContextResult.value
            : null,
        spotlightCurrentWeek:
          spotlightCurrentWeekResult.status === "fulfilled"
            ? spotlightCurrentWeekResult.value
            : null,
        spotlightWeeklyWinner:
          spotlightWeeklyWinnerResult.status === "fulfilled"
            ? spotlightWeeklyWinnerResult.value
            : { winner: null },
        tennisIq:
          tennisIqResult.status === "fulfilled" ? tennisIqResult.value : null,
        aiProStatus:
          aiProStatusResult.status === "fulfilled"
            ? aiProStatusResult.value
            : null,
        dailyFocus:
          dailyFocusResult.status === "fulfilled"
            ? dailyFocusResult.value
            : null,
        drillRecommendation:
          drillRecommendationResult.status === "fulfilled"
            ? drillRecommendationResult.value
            : null,
      };

      // Log any rejected branch so we can see in production logs which
      // sub-fetch is the bottleneck — without surfacing the failure to
      // the client.
      for (const [name, r] of [
        ["dashboard", dashboardResult],
        ["profile", profileResult],
        ["unreadCount", unreadResult],
        ["weeklyDigest", weeklyDigestResult],
        ["aiCoachContext", aiCoachContextResult],
        ["spotlightCurrentWeek", spotlightCurrentWeekResult],
        ["spotlightWeeklyWinner", spotlightWeeklyWinnerResult],
        ["tennisIq", tennisIqResult],
        ["aiProStatus", aiProStatusResult],
        ["dailyFocus", dailyFocusResult],
        ["drillRecommendation", drillRecommendationResult],
      ] as const) {
        if (r.status === "rejected") {
          console.error(
            `[player-home] sub-fetch '${name}' rejected for player ${playerId}:`,
            r.reason,
          );
        }
      }

      // Only cache when the critical `dashboard` branch succeeded.
      // Caching a `dashboard: null` payload would lock every request in
      // the next 30s into rendering a perpetual loading state on the
      // client (which keys "loaded" off `effectiveData`). For 30s of
      // pain we'd rather pay the extra DB roundtrip on the next try.
      if (dashboardResult.status === "fulfilled") {
        setCache(playerId, result);
      }
      return res.json(result);
    } catch (err) {
      console.error("[player-home] GET /api/player/me/home-data error:", err);
      return res.status(500).json({ error: "Failed to fetch home data" });
    }
  },
);

// ============================================================================
// Sub-fetchers
// ----------------------------------------------------------------------------
// Each function mirrors the data-fetching logic of one existing standalone
// endpoint. Shape parity is intentional: the existing per-resource endpoints
// stay the source of truth and remain unchanged. Any future change to those
// endpoints' response shape must also be applied here — keep these functions
// in lockstep with the linked source endpoint.
// ============================================================================

// Mirror of `/api/player/me/dashboard` (server/routes/admin-series.ts).
async function fetchDashboard(playerId: string): Promise<Record<string, unknown>> {
  const player = await storage.getPlayer(playerId);
  if (!player) {
    return {
      isOnboarding: false,
      isFreePlayer: false,
      pendingRequest: null,
      player: null,
      coach: null,
      academy: null,
      nextSession: null,
      upcomingSessions: [],
      lastFeedback: null,
      recentXpGains: [],
      credits: { total: 0, group: 0, private: 0, semi_private: 0 },
      creditsTotal: 0,
      creditsByType: { group: 0, private: 0, semi_private: 0 },
    };
  }

  // Run all independent reads in parallel — within this single sub-fetch
  // we already gain a sizable speedup vs. the original handler which
  // serialised getCoach + getAcademy + sessions + xp + credits.
  const [coach, academy, xpData, v2Balance, feedbackList, bookingReqs] =
    await Promise.all([
      player.coachId ? storage.getCoach(player.coachId) : Promise.resolve(null),
      player.academyId
        ? storage.getAcademy(player.academyId)
        : Promise.resolve(null),
      storage.getPlayerXpTotal(playerId).catch(() => ({
        totalXp: 0,
        level: 1,
        xpToNextLevel: 500,
      })),
      storage
        .getPlayerCreditBalanceByType(playerId)
        .catch(() => ({ group: 0, private: 0, semi_private: 0 })),
      storage.getPlayerFeedbackNotes(playerId, 1).catch(() => []),
      storage.getBookingRequests({ playerId }).catch(() => []),
    ]);

  const threeHoursAgo = new Date();
  threeHoursAgo.setHours(threeHoursAgo.getHours() - 3);
  const future = new Date();
  future.setDate(future.getDate() + 30);
  const now = new Date();

  const upcomingSessions = await storage
    .getPlayerSessionsWithDetails(playerId, threeHoursAgo, future)
    .catch(() => []);

  const sortedSessions = upcomingSessions
    .map((s) => ({
      ...s,
      isActive: s.startTime <= now && s.endTime > now,
      isUpcoming: s.startTime > now,
    }))
    .sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return (
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
    });

  // Build the up-to-4 list for the home "next sessions" stack.
  const relevant = sortedSessions
    .filter((s) => s.isActive || s.isUpcoming)
    .slice(0, 4);
  const courtIds = Array.from(
    new Set(relevant.map((s) => s.courtId).filter(Boolean) as string[]),
  );
  const coachIds = Array.from(
    new Set(relevant.map((s) => s.coachId).filter(Boolean) as string[]),
  );
  const courtMap = new Map<string, any>();
  const coachMap = new Map<string, any>();
  await Promise.all([
    ...courtIds.map(async (id) => {
      courtMap.set(id, await storage.getCourt(id).catch(() => null));
    }),
    ...coachIds.map(async (id) => {
      coachMap.set(id, await storage.getCoach(id).catch(() => null));
    }),
  ]);
  const upcomingSessionsList = relevant.map((s) => {
    const court = s.courtId ? courtMap.get(s.courtId) : null;
    const c = s.coachId ? coachMap.get(s.coachId) : null;
    const dur =
      s.startTime && s.endTime
        ? Math.round(
            (new Date(s.endTime).getTime() -
              new Date(s.startTime).getTime()) /
              (1000 * 60),
          )
        : null;
    return {
      id: s.id,
      date: s.startTime,
      endTime: s.endTime,
      type: s.sessionType,
      courtName: court?.name || null,
      coachName: c?.name || null,
      duration: dur,
      isLive: s.isActive,
    };
  });

  let nextSession: Record<string, unknown> | null = null;
  if (sortedSessions.length > 0) {
    const session =
      sortedSessions.find((s) => s.isActive) ||
      sortedSessions.find((s) => s.isUpcoming) ||
      sortedSessions[0];
    const sessionCourt = session.courtId
      ? await storage.getCourt(session.courtId).catch(() => null)
      : null;
    const sessionCoach = session.coachId
      ? await storage.getCoach(session.coachId).catch(() => null)
      : null;
    const durationMinutes =
      session.startTime && session.endTime
        ? Math.round(
            (new Date(session.endTime).getTime() -
              new Date(session.startTime).getTime()) /
              (1000 * 60),
          )
        : null;
    const sessionPlayerRecord = await storage
      .getSessionPlayer(session.id, playerId)
      .catch(() => null);
    const playerCheckedIn = sessionPlayerRecord
      ? !!(sessionPlayerRecord as any).checkedInAt ||
        sessionPlayerRecord.attendanceStatus === "present" ||
        sessionPlayerRecord.attendanceStatus === "late"
      : false;

    let courtBookingStatus: string | null = null;
    let courtBookingNote: string | null = null;
    let courtBookingUrl: string | null = null;
    try {
      const [br] = await db
        .select({
          status: bookingRequests.courtBookingStatus,
          note: bookingRequests.courtBookingNote,
          url: bookingRequests.courtBookingUrl,
        })
        .from(bookingRequests)
        .where(
          and(
            eq(bookingRequests.sessionId, session.id),
            eq(bookingRequests.playerId, playerId),
            isNotNull(bookingRequests.courtBookingStatus),
          ),
        )
        .orderBy(desc(bookingRequests.createdAt))
        .limit(1);
      if (br) {
        courtBookingStatus = br.status ?? null;
        courtBookingNote = br.note ?? null;
        courtBookingUrl = br.url ?? null;
      }
    } catch {
      // best-effort
    }

    nextSession = {
      id: session.id,
      date: session.startTime,
      endTime: session.endTime,
      type: session.sessionType,
      courtName: sessionCourt?.name,
      coachName: sessionCoach?.name || null,
      isLive: session.isActive,
      duration: durationMinutes,
      playerCheckedIn,
      courtBookingStatus,
      courtBookingNote,
      courtBookingUrl,
    };
  }

  // 30-day attendance streak (mirrors original handler).
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const pastSessions = await storage
    .getPlayerSessionsWithDetails(playerId, thirtyDaysAgo, now)
    .catch(() => []);
  const streak = pastSessions.filter(
    (s) => s.attendanceStatus === "present",
  ).length;

  // Consecutive check-in streak: walk most-recent sessions backward,
  // count until the first session without a recorded check-in.
  let checkinStreak = 0;
  try {
    const { sql: sqlTag } = await import("drizzle-orm");
    const checkinRows = await db.execute(sqlTag`
      SELECT sc.id IS NOT NULL AS has_checkin
      FROM session_players sp
      JOIN sessions s ON s.id = sp.session_id
      LEFT JOIN session_checkins sc
        ON sc.session_id = s.id AND sc.player_id = ${playerId}
      WHERE sp.player_id = ${playerId}
        AND s.start_time < now()
      ORDER BY s.start_time DESC
      LIMIT 30
    `);
    for (const row of checkinRows.rows as any[]) {
      if (row.has_checkin) checkinStreak++;
      else break;
    }
  } catch {
    checkinStreak = 0;
  }

  const creditsByType = {
    group: Math.max(0, v2Balance.group),
    private: Math.max(0, v2Balance.private),
    semi_private: Math.max(0, v2Balance.semi_private),
  };
  const totalCredits =
    creditsByType.group + creditsByType.private + creditsByType.semi_private;

  const totalXp = xpData.totalXp || player.totalXp || 0;
  const level = xpData.level || player.level || 1;
  const glowScore = Math.min(
    100,
    Math.round((totalXp / (level * 500)) * 100),
  );

  const onboardingCompleted = player.onboardingCompleted ?? false;

  // Pending booking request: same priority order as the original handler
  // (counter-proposed → pending → recently declined within 24h).
  let pendingRequest: Record<string, unknown> | null = null;
  try {
    const active =
      bookingReqs.find(
        (r) =>
          r.status === "awaiting_player_reply" ||
          (r.status === "pending" &&
            r.counterProposedStart &&
            r.counterProposalStatus === "pending"),
      ) ||
      bookingReqs.find((r) => r.status === "pending") ||
      bookingReqs.find((r) => {
        if (r.status !== "declined") return false;
        const t = r.respondedAt ? new Date(r.respondedAt).getTime() : 0;
        return t > 0 && Date.now() - t < 24 * 60 * 60 * 1000;
      });
    if (active) {
      const reqCoach = active.coachId
        ? await storage.getCoach(active.coachId).catch(() => null)
        : null;
      pendingRequest = {
        id: active.id,
        status: active.status,
        sessionType: active.sessionType,
        requestedStart: active.requestedStart,
        requestedEnd: active.requestedEnd,
        coachName: reqCoach?.name || null,
        expiresAt: active.expiresAt || null,
        counterProposedStart: active.counterProposedStart || null,
        counterProposedEnd: active.counterProposedEnd || null,
        responseNote: active.responseNote || null,
        declineReason: active.declineReason || null,
      };
    }
  } catch (pendingReqErr) {
    console.error(
      "[player-home] pending booking lookup failed (non-fatal):",
      pendingReqErr,
    );
  }

  const lastFeedback =
    feedbackList.length > 0
      ? {
          message: feedbackList[0].content,
          date: feedbackList[0].createdAt,
          coachName: coach?.name || "Coach",
        }
      : null;

  return {
    isOnboarding: !onboardingCompleted,
    isFreePlayer: !player.academyId,
    pendingRequest,
    player: {
      id: player.id,
      name: player.name,
      level,
      xp: totalXp,
      glowScore,
      ballLevel: player.ballLevel,
      streak,
      checkinStreak,
      onboardingCompleted,
      academyId: player.academyId,
      dateOfBirth: player.dateOfBirth,
      profilePhotoUrl: (player as any).profilePhotoUrl || null,
      playStyle: (player as any).playStyle || null,
      // Task #1467 — surface the live match-derived fields so the
      // ProPlayerHomeScreen home-data success path can mirror them
      // back into AuthContext.player. Without these, screens that
      // read glowRank / glowMmr / totalMatchesPlayed via usePlayer()
      // (Growth, Me, profile header) would stay stale until the user
      // backgrounds + foregrounds the app or hits a flow that calls
      // refreshAuth(). They're already on the player record, so this
      // is just a passthrough — no extra DB cost.
      glowMmr: player.glowMmr || 1000,
      glowRank: player.glowRank || 9,
      totalMatchesPlayed: player.totalMatchesPlayed || 0,
    },
    coach: coach
      ? {
          id: coach.id,
          name: coach.name,
          photoUrl: coach.photoUrl || null,
          yearsExperience: coach.yearsExperience,
          philosophyTags: coach.philosophyTags || [],
          publicQuote:
            coach.bioStatus === "approved" ? coach.publicQuote : null,
          bioApproved: coach.bioStatus === "approved",
        }
      : null,
    academy: academy
      ? {
          id: academy.id,
          name: academy.name,
          timezone: academy.timezone || null,
        }
      : null,
    nextSession,
    upcomingSessions: upcomingSessionsList,
    lastFeedback,
    recentXpGains: [],
    credits: {
      total: totalCredits,
      group: creditsByType.group,
      private: creditsByType.private,
      semi_private: creditsByType.semi_private,
    },
    creditsTotal: totalCredits,
    creditsByType,
  };
}

// mirror of `/api/player/me/profile`.
// Fix: dispatch the legacy /profile route in-process so we get a
// byte-equivalent shape with zero duplication. The auth middleware
// short-circuits because dispatchInProcess attaches `__inProcessUser`
// + `__inProcessDispatch` from the parent request — see
// server/lib/in-process-dispatch.ts. Cost: one extra ~1ms in-process
// hop, but it's inside `Promise.allSettled` alongside dashboard so it
// runs in parallel and doesn't extend the home-data critical path.
async function fetchProfile(
  req: AuthenticatedRequest,
): Promise<Record<string, unknown> | null> {
  const result = await dispatchInProcess<Record<string, unknown>>(
    req,
    "/api/player/me/profile",
  );
  return result.status === "ok" ? result.data : null;
}

// Task #1419 — mirror of `/api/ai-pro/status` (server/routes/ai-pro.ts).
// Same rationale as fetchProfile: the home screen's `isNearLimit`
// banner used to fire its own useQuery for this on cold start. Now it
// rides home-data so the banner can paint without an extra round trip.
async function fetchAiProStatus(
  req: AuthenticatedRequest,
): Promise<Record<string, unknown> | null> {
  const result = await dispatchInProcess<Record<string, unknown>>(
    req,
    "/api/ai-pro/status",
  );
  return result.status === "ok" ? result.data : null;
}

// fetchProfile and fetchAiProStatus take req directly (not playerId),
// so they are called directly without memoBranch caching.

// Forward declarations of slow branch wrappers — implementations live
// further down. We construct the wrappers right next to the impls but
// reference them from the route handler, hence the `let` bindings here
// to satisfy hoisting.
let fetchWeeklyDigest: (playerId: string) => Promise<Record<string, unknown> | null>;
let fetchAiCoachContext: (playerId: string) => Promise<Record<string, unknown> | null>;
let fetchSpotlightWeeklyWinner: (playerId: string) => Promise<Record<string, unknown> | null>;
let fetchTennisIq: (playerId: string) => Promise<Record<string, unknown> | null>;
let fetchDrillRecommendation: (playerId: string) => Promise<Record<string, unknown> | null>;

// Mirror of `/api/player/me/notifications/unread-count` (coach-calendar.ts).
async function fetchUnreadCount(playerId: string): Promise<{ count: number }> {
  const [result] = await db
    .select({ count: count() })
    .from(playerNotifications)
    .where(
      and(
        eq(playerNotifications.playerId, playerId),
        eq(playerNotifications.read, false),
      ),
    );
  return { count: result?.count || 0 };
}

// Mirror of `/api/player/me/weekly-digest` (coach-calendar.ts).
async function fetchWeeklyDigestImpl(
  playerId: string,
): Promise<Record<string, unknown> | null> {
  const [digest] = await db
    .select()
    .from(playerNotifications)
    .where(
      and(
        eq(playerNotifications.playerId, playerId),
        eq(playerNotifications.type, "ai_weekly_digest"),
      ),
    )
    .orderBy(desc(playerNotifications.createdAt))
    .limit(1);
  return digest ?? null;
}
fetchWeeklyDigest = memoBranch(
  "weeklyDigest",
  SLOW_BRANCH_TTL_MS,
  fetchWeeklyDigestImpl,
);

// Mirror of `/api/player/me/ai-coach/context` (player-progress.ts).
// This is the single biggest tail-latency source on the original home
// screen — `buildPlayerSelfAIContext` opens a chain of analytics queries.
// We still call it (to keep response parity) but it sits inside the
// `Promise.allSettled` so its slowness no longer blocks anything else.
async function fetchAiCoachContextImpl(
  playerId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { buildPlayerSelfAIContext } = await import(
      "../services/ai-progress-engine"
    );
    const ctx = await buildPlayerSelfAIContext(playerId);
    if (!ctx) return null;

    const [historyCount] = await db
      .select({ count: count() })
      .from(aiCoachConversations)
      .where(
        and(
          eq(aiCoachConversations.playerId, playerId),
          eq(aiCoachConversations.contextType, "player_self"),
        ),
      );
    const hasHistory = (historyCount?.count ?? 0) > 0;

    return {
      dataMaturity: ctx.dataMaturity,
      glowMirrorLayers: ctx.glowMirrorLayers,
      hasHistory,
    };
  } catch (err) {
    console.error("[player-home] aiCoachContext failed:", err);
    return null;
  }
}
fetchAiCoachContext = memoBranch(
  "aiCoachContext",
  SLOW_BRANCH_TTL_MS,
  fetchAiCoachContextImpl,
);

// Task #1419 — Mirror of `/api/player/me/tennis-iq` (player-tennis-iq.ts).
// The home screen's TennisIQMiniTile previously fired a standalone
// useQuery for this. The score is updated only when the player completes
// a quiz, so it's safe to memoise for 5 minutes.
async function fetchTennisIqImpl(
  playerId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const player = await storage.getPlayer(playerId);
    if (!player) return null;
    return {
      score: (player as any).quizScore ?? null,
      lastQuizAt: (player as any).lastQuizAt ?? null,
    };
  } catch (err) {
    console.error("[player-home] tennisIq failed:", err);
    return null;
  }
}
fetchTennisIq = memoBranch(
  "tennisIq",
  SLOW_BRANCH_TTL_MS,
  fetchTennisIqImpl,
);

// Spotlight (Task #1418)
// ----------------------------------------------------------------------------
// Mirrors of `/api/player/spotlight/current-week` and
// `/api/player/spotlight/weekly-winner` from server/routes/player-social.ts.
// Logic intentionally duplicated rather than extracted/shared, to keep this
// route file self-contained — exactly like fetchDashboard / fetchProfile
// above. Any future change to the spotlight handlers' response shape MUST
// be applied here too.

function getSpotlightWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().split("T")[0];
}

async function fetchSpotlightCurrentWeek(
  playerId: string,
): Promise<Record<string, unknown>> {
  const player = await storage.getPlayer(playerId).catch(() => null);
  const academyId = player?.academyId ?? null;
  const weekStart = getSpotlightWeekStart();

  // No academy → return the same empty shell the standalone endpoint
  // returns so client-side State C ("be the first to nominate") still
  // renders correctly.
  if (!academyId) {
    return {
      weekStart,
      nominations: [],
      myNomination: null,
      daysRemaining: 0,
      totalVotes: 0,
    };
  }

  const nominations = await db
    .select({
      nominatedPlayerId: spotlightNominations.nominatedPlayerId,
      reason: spotlightNominations.reason,
      nominatorPlayerId: spotlightNominations.nominatorPlayerId,
      playerName: players.name,
      profilePhotoUrl: players.profilePhotoUrl,
      level: players.level,
      ballLevel: players.ballLevel,
    })
    .from(spotlightNominations)
    .innerJoin(players, eq(players.id, spotlightNominations.nominatedPlayerId))
    .where(
      and(
        eq(spotlightNominations.academyId, academyId),
        eq(spotlightNominations.weekStart, weekStart),
      ),
    );

  const aggregated: Record<
    string,
    {
      playerId: string;
      playerName: string;
      profilePhotoUrl: string | null;
      level: number | null;
      ballLevel: string | null;
      totalVotes: number;
      reasons: string[];
    }
  > = {};
  for (const nom of nominations) {
    if (!aggregated[nom.nominatedPlayerId]) {
      aggregated[nom.nominatedPlayerId] = {
        playerId: nom.nominatedPlayerId,
        playerName: nom.playerName,
        profilePhotoUrl: nom.profilePhotoUrl,
        level: nom.level,
        ballLevel: nom.ballLevel,
        totalVotes: 0,
        reasons: [],
      };
    }
    aggregated[nom.nominatedPlayerId].totalVotes++;
    aggregated[nom.nominatedPlayerId].reasons.push(nom.reason);
  }

  const sortedNominations = Object.values(aggregated).sort(
    (a, b) => b.totalVotes - a.totalVotes,
  );

  const myNomination =
    nominations.find((n) => n.nominatorPlayerId === playerId) ?? null;

  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysRemaining = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

  return {
    weekStart,
    nominations: sortedNominations,
    myNomination,
    daysRemaining,
    totalVotes: nominations.length,
  };
}

// DELIBERATE BEHAVIOURAL DIVERGENCE from the standalone
// `/api/player/spotlight/weekly-winner` route: that route has a
// compute-and-insert side-effect — if no winner row exists for the
// target week, it tallies the nominations and INSERTs the winner.
// This god-route sub-fetcher reads only. Two reasons:
//   1. The god-route runs on EVERY home open; promoting a write into
//      that hot path would amplify a single user opening the app to N
//      tally+insert cycles per week instead of one.
//   2. A read-only fan-out is safe to run in `Promise.allSettled` — a
//      failure in the writer-path would otherwise have to be quietly
//      swallowed to avoid breaking the rest of the home-data response.
// Net effect for the client: home-data may briefly return
// `{ winner: null }` for the very first page load of the new week
// until a player visits the standalone Spotlight detail screen (which
// hits the legacy endpoint and triggers the insert). That's an
// acceptable tradeoff — the home Spotlight tile already handles the
// null-winner state, and the data converges within minutes of the
// first detail-screen visit.
async function fetchSpotlightWeeklyWinnerImpl(
  playerId: string,
): Promise<{ winner: Record<string, unknown> | null }> {
  const player = await storage.getPlayer(playerId).catch(() => null);
  const academyId = player?.academyId ?? null;
  if (!academyId) {
    return { winner: null };
  }

  // Same default as the standalone endpoint: target last week's window.
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  const targetWeekStart = getSpotlightWeekStart(lastWeek);

  const [existingWinner] = await db
    .select({
      playerId: spotlightWeeklyWinners.playerId,
      totalVotes: spotlightWeeklyWinners.totalVotes,
      topReason: spotlightWeeklyWinners.topReason,
      weekStart: spotlightWeeklyWinners.weekStart,
      playerName: players.name,
      profilePhotoUrl: players.profilePhotoUrl,
      level: players.level,
      ballLevel: players.ballLevel,
    })
    .from(spotlightWeeklyWinners)
    .innerJoin(players, eq(players.id, spotlightWeeklyWinners.playerId))
    .where(
      and(
        eq(spotlightWeeklyWinners.academyId, academyId),
        eq(spotlightWeeklyWinners.weekStart, targetWeekStart),
      ),
    );

  if (existingWinner) {
    return { winner: existingWinner };
  }

  // The standalone handler computes-and-inserts a fresh winner here when
  // the target week has ended and nominations exist. We deliberately
  // SKIP that side-effect: the home god-route is a read path, fires on
  // every cold start, and writing winner rows from a hot read code path
  // would introduce duplicate inserts under concurrent loads. The first
  // visit to the spotlight details screen still hits the standalone
  // endpoint and computes the winner there. For the home tile, returning
  // `winner: null` is functionally identical to a not-yet-computed week
  // — the tile falls back to State C correctly.
  return { winner: null };
}
fetchSpotlightWeeklyWinner = memoBranch(
  "spotlightWeeklyWinner",
  SLOW_BRANCH_TTL_MS,
  fetchSpotlightWeeklyWinnerImpl,
) as (playerId: string) => Promise<Record<string, unknown> | null>;

// ============================================================================
// Daily Focus — Task #1564
// ============================================================================
// Priority order:
//   1. Session today (live or upcoming)
//   2. Streak at risk (streak >= 2 and no session logged today)
//   3. Quest close to completion (>= 40% done, in_progress)
//   4. Booking nudge (has coach, nothing scheduled)
//   5. Rest day

interface FocusCardResult {
  type: "session" | "quest" | "streak_risk" | "booking_nudge" | "rest_day";
  title: string;
  subtitle: string;
  cta_label: string;
  cta_action: string;
  urgency_level: "high" | "medium" | "low";
  session_time?: string | null;
  xp_remaining?: number | null;
  coach_name?: string | null;
  streak_count?: number | null;
}

async function computeDailyFocus(playerId: string): Promise<FocusCardResult> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const player = await storage.getPlayer(playerId).catch(() => null);

  const restDay: FocusCardResult = {
    type: "rest_day",
    title: [0, 6].includes(now.getDay())
      ? "Rest day — enjoy the weekend"
      : "Rest day — great job this week",
    subtitle: "Recovery is part of training. You're doing great.",
    cta_label: "",
    cta_action: "",
    urgency_level: "low",
  };

  if (!player) return restDay;

  // 1. Session today?
  const todaySessions = await storage
    .getPlayerSessionsWithDetails(playerId, todayStart, todayEnd)
    .catch(() => []);

  const relevantToday = todaySessions.filter((s) => {
    const start = new Date(s.startTime);
    const end = new Date(s.endTime);
    return end > now || (start <= now && end > now);
  });

  if (relevantToday.length > 0) {
    const session = relevantToday[0];
    const start = new Date(session.startTime);
    const isLive = start <= now;
    const hoursAway = Math.max(
      0,
      Math.round((start.getTime() - now.getTime()) / (1000 * 60 * 60)),
    );
    const coach = session.coachId
      ? await storage.getCoach(session.coachId).catch(() => null)
      : null;
    const timeStr = start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return {
      type: "session",
      title: isLive
        ? "You have a live session right now"
        : `Session today at ${timeStr}`,
      subtitle: isLive
        ? `Your ${session.sessionType} session is happening now${coach ? ` with ${coach.name}` : ""}`
        : `${hoursAway > 0 ? `${hoursAway}h away — ` : ""}${session.sessionType}${coach ? ` with ${coach.name}` : ""}`,
      cta_label: "View Session",
      cta_action: "view_session",
      urgency_level: "medium",
      session_time: String(session.startTime),
      coach_name: coach?.name || null,
    };
  }

  // 2. Streak at risk?
  const streak = Number((player as any).streak ?? 0);
  if (streak >= 2) {
    const todayPresent = todaySessions.filter(
      (s) => s.attendanceStatus === "present",
    );
    if (todayPresent.length === 0) {
      const coach = player.coachId
        ? await storage.getCoach(player.coachId).catch(() => null)
        : null;
      return {
        type: "streak_risk",
        title: `Your ${streak}-day streak is at risk`,
        subtitle:
          "Log a session or complete a quest today to keep your streak alive",
        cta_label: "Book a Session",
        cta_action: "book_session",
        urgency_level: "high",
        streak_count: streak,
        coach_name: coach?.name || null,
      };
    }
  }

  // 3. Quest near completion?
  try {
    const activeQuests = await db
      .select()
      .from(playerQuests)
      .where(
        and(
          eq(playerQuests.playerId, playerId),
          eq(playerQuests.status, "in_progress"),
        ),
      )
      .limit(10);

    const best = activeQuests
      .filter((q) => q.targetProgress && q.targetProgress > 0)
      .map((q) => ({
        ...q,
        ratio: (q.currentProgress ?? 0) / (q.targetProgress ?? 1),
      }))
      .sort((a, b) => b.ratio - a.ratio)[0];

    if (best && best.ratio >= 0.4) {
      const remaining = Math.max(
        0,
        (best.targetProgress ?? 0) - (best.currentProgress ?? 0),
      );
      return {
        type: "quest",
        title: "Complete your daily quest",
        subtitle:
          remaining === 0
            ? "You're ready to claim your reward!"
            : `${remaining} ${remaining === 1 ? "step" : "steps"} remaining${(best as any).xpReward ? ` — +${(best as any).xpReward} XP` : ""}`,
        cta_label: "Open Quests",
        cta_action: "open_quests",
        urgency_level: "low",
        xp_remaining: (best as any).xpReward ?? null,
      };
    }
  } catch {
    // best-effort
  }

  // 4. Booking nudge?
  if (player.coachId) {
    const coach = await storage.getCoach(player.coachId).catch(() => null);
    return {
      type: "booking_nudge",
      title: `Book with ${coach?.name ?? "your coach"}`,
      subtitle: "Schedule your next session to keep your progress on track",
      cta_label: "Book Now",
      cta_action: "book_session",
      urgency_level: "low",
      coach_name: coach?.name || null,
    };
  }

  return restDay;
}

// Standalone endpoint
router.get(
  "/api/player/me/daily-focus",
  authMiddleware,
  requirePlayerOrOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.json({
          type: "rest_day",
          title: "Welcome to Glow",
          subtitle: "Set up your profile to get started",
          cta_label: "",
          cta_action: "",
          urgency_level: "low",
        });
      }
      const focus = await computeDailyFocus(playerId);
      return res.json(focus);
    } catch (err) {
      console.error("[player-home] GET /api/player/me/daily-focus error:", err);
      return res.status(500).json({ error: "Failed to compute daily focus" });
    }
  },
);

// Drill recommendation: return first active assigned drill, or a random drill
// if no assignment exists — gives the AI coach card a "Try this drill" prompt.
async function fetchDrillRecommendationImpl(
  playerId: string,
): Promise<Record<string, unknown> | null> {
  try {
    // Prefer coach-assigned drill that hasn't been dismissed
    const [assignment] = await db
      .select({
        drillId: coachAssignedDrills.drillId,
        drillName: drills.name,
        category: drills.category,
        durationMinutes: drills.durationMinutes,
      })
      .from(coachAssignedDrills)
      .innerJoin(drills, eq(drills.id, coachAssignedDrills.drillId))
      .where(
        and(
          eq(coachAssignedDrills.playerId, playerId),
          isNull(coachAssignedDrills.dismissedAt),
        ),
      )
      .orderBy(desc(coachAssignedDrills.assignedAt))
      .limit(1);

    if (assignment) {
      return {
        drillId: assignment.drillId,
        drillName: assignment.drillName,
        category: assignment.category,
        durationMinutes: assignment.durationMinutes,
      };
    }

    // Fall back to any drill (weighted toward beginner/intermediate for new players)
    const [anyDrill] = await db
      .select({ id: drills.id, name: drills.name, category: drills.category, durationMinutes: drills.durationMinutes })
      .from(drills)
      .limit(1);

    if (!anyDrill) return null;
    return { drillId: anyDrill.id, drillName: anyDrill.name, category: anyDrill.category, durationMinutes: anyDrill.durationMinutes };
  } catch {
    return null;
  }
}
fetchDrillRecommendation = memoBranch(
  "drillRecommendation",
  SLOW_BRANCH_TTL_MS,
  fetchDrillRecommendationImpl,
) as (playerId: string) => Promise<Record<string, unknown> | null>;

export default router;
