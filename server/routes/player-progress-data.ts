// Task #1383 — Player Progress god-endpoint.
//
// Companion to Task #1379's `/api/player/me/home-data`. Same problem on the
// Progress tab: PlayerProgressScreen fired THIRTEEN parallel React Query
// calls on mount (weekly-plan, monthly-assessment, ai-coach/context,
// weekly-digest, progress, attendance, feedback, stroke-feedback,
// pillar-progress, session-feedback, glow-ratings, video-feedback, profile).
// On iOS the JS<->native bridge serialises that fanout strictly, which
// translates into a visibly heavier mount than Coach Home / now-fixed Player
// Home (1 query each).
//
// Fix: collapse to ONE round trip. The screen calls
// `/api/player/me/progress-data?sport=tennis` once, the server fans out
// internally in parallel via `Promise.allSettled`, and the screen primes
// every legacy queryKey via `queryClient.setQueryData` so child components
// (PillarRows, GlowMirrorLayers, etc.) hit cache instead of network.
//
// Task #1419 — Switched from HTTP loopback `subFetch` to
// `dispatchInProcess` so each child request reuses the parent's
// already-resolved `req.user`. That cuts ~26 redundant DB round-trips
// (auth + family-link + account-lock checks across 13 sub-fetches) and
// the loopback HTTP framing cost out of every Progress tab open. Same
// pattern community-data.ts adopted under Task #1398.
//
// Cache: 60s in-memory per `playerId:sport`. Critical branch is `progress`
// (the radar/XP block — the screen's must-have above-the-fold payload).
// Cache is only set when `progress` succeeds, mirroring the player-home.ts
// pattern.

import { Router } from "express";
import type { NextFunction, Response } from "express";
import {
  authMiddlewareWithFreshData as authMiddleware,
} from "../auth";
import type { AuthenticatedRequest } from "../auth";
import { dispatchInProcess, type DispatchResult } from "../lib/in-process-dispatch";

const router = Router();

interface CacheEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}

const progressDataCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheKey(
  playerId: string,
  academyId: string | null | undefined,
  sport: string,
): string {
  // Include academy context — multi-academy users (admin/owner roles
  // viewing a player tab) can switch their effective academy via
  // x-academy-id, and the resolved progress payload differs per academy.
  // Without this, an academy switch would serve stale data for up to TTL.
  return `${playerId}:${academyId ?? "_"}:${sport}`;
}

function getCached(key: string): Record<string, unknown> | null {
  const entry = progressDataCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    progressDataCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: Record<string, unknown>): void {
  progressDataCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidatePlayerProgressDataCache(playerId: string): void {
  // Drop every cached entry for this player across sport variants.
  const prefix = `${playerId}:`;
  for (const k of progressDataCache.keys()) {
    if (k.startsWith(prefix)) progressDataCache.delete(k);
  }
}

// Local middleware mirroring player-home.ts — keeps this file self-contained.
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

type SubFetchResult<T> = DispatchResult<T>;

router.get(
  "/api/player/me/progress-data",
  authMiddleware,
  requirePlayerOrOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const sport =
        typeof req.query.sport === "string" && req.query.sport.length > 0
          ? req.query.sport
          : "tennis";

      // Pre-onboarding / no-player-profile users — return the same empty
      // shells each legacy endpoint returns for this state so the screen
      // can still render its empty/onboarding affordances without crashing.
      if (!playerId) {
        return res.json({
          progress: {
            level: 1,
            xp: 0,
            xpForNextLevel: 500,
            glowScore: 0,
            ballLevel: "red1",
            displayName: null,
            nextBallLevel: "red2",
            skillRadar: [],
            overallInsights: { strengths: [], focusAreas: [] },
            levelReadiness: null,
          },
          attendance: null,
          weeklyPlan: null,
          monthlyAssessment: null,
          aiCoachContext: null,
          weeklyDigest: null,
          feedback: [],
          sessionFeedback: [],
          strokeFeedback: [],
          glowRatings: [],
          videoFeedback: [],
          pillarProgress: null,
          profile: null,
          _errors: {},
        });
      }

      const key = cacheKey(playerId, req.user?.currentAcademyId, sport);
      const cached = getCached(key);
      if (cached) {
        return res.json(cached);
      }

      if (!req.headers.authorization) {
        return res
          .status(401)
          .json({ error: "Authorization header missing" });
      }

      const sportQS = `?sport=${encodeURIComponent(sport)}`;

      // In-process Express dispatch — see server/lib/in-process-dispatch.ts.
      // Carries the parent request's `req.user`, `x-academy-id` and
      // `x-active-player-id` headers automatically. Failures in any branch
      // are isolated as a typed `{status:"error"}` row so one slow / broken
      // sub-call (e.g. AI coach context) cannot black-out the whole Progress
      // screen.
      const sub = <T>(path: string) => dispatchInProcess<T>(req, path);

      const [
        progress,
        attendance,
        weeklyPlan,
        monthlyAssessment,
        aiCoachContext,
        weeklyDigest,
        feedback,
        sessionFeedback,
        strokeFeedback,
        glowRatings,
        videoFeedback,
        pillarProgress,
        profile,
      ] = await Promise.all([
        sub<unknown>(`/api/player/me/progress${sportQS}`),
        sub<unknown>(`/api/player/me/attendance${sportQS}`),
        sub<unknown>(`/api/player/me/weekly-plan`),
        sub<unknown>(`/api/player/me/monthly-assessment/current`),
        sub<unknown>(`/api/player/me/ai-coach/context`),
        sub<unknown>(`/api/player/me/weekly-digest`),
        sub<unknown>(`/api/player/me/feedback${sportQS}`),
        sub<unknown>(`/api/player/me/session-feedback`),
        sub<unknown>(`/api/player/me/stroke-feedback${sportQS}`),
        sub<unknown>(`/api/player/me/glow-ratings`),
        sub<unknown>(`/api/player/me/video-feedback`),
        sub<unknown>(`/api/player/me/pillar-progress`),
        sub<unknown>(`/api/player/me/profile`),
      ]);

      const errors: Record<string, number | null> = {};
      const note = (key: string, r: SubFetchResult<unknown>) => {
        if (r.status === "error") errors[key] = r.httpStatus;
      };
      note("progress", progress);
      note("attendance", attendance);
      note("weeklyPlan", weeklyPlan);
      note("monthlyAssessment", monthlyAssessment);
      note("aiCoachContext", aiCoachContext);
      note("weeklyDigest", weeklyDigest);
      note("feedback", feedback);
      note("sessionFeedback", sessionFeedback);
      note("strokeFeedback", strokeFeedback);
      note("glowRatings", glowRatings);
      note("videoFeedback", videoFeedback);
      note("pillarProgress", pillarProgress);
      note("profile", profile);

      const responseBody = {
        progress: progress.data,
        attendance: attendance.data,
        weeklyPlan: weeklyPlan.data,
        monthlyAssessment: monthlyAssessment.data,
        aiCoachContext: aiCoachContext.data,
        weeklyDigest: weeklyDigest.data,
        feedback: feedback.data,
        sessionFeedback: sessionFeedback.data,
        strokeFeedback: strokeFeedback.data,
        glowRatings: glowRatings.data,
        videoFeedback: videoFeedback.data,
        pillarProgress: pillarProgress.data,
        profile: profile.data,
        _errors: errors,
      };

      // Only cache when the critical branch (progress radar/XP block)
      // succeeded. Mirrors player-home.ts's "don't cache a degraded response"
      // policy so a transient DB hiccup doesn't get pinned for 60s.
      if (progress.status === "ok") {
        setCache(key, responseBody);
      }

      return res.json(responseBody);
    } catch (error) {
      console.error("[player-progress-data] Unhandled error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch player progress data" });
    }
  },
);

export default router;
