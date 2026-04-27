// Task #1419 — AI Coach god-endpoint.
//
// Companion to Task #1379 (Player Home), #1383 (Progress + Play),
// #1384 (Community), #1418 (Spotlight fold-in). Until this task the
// PlayerAICoachScreen still fanned out SEVEN parallel React Query
// calls on mount: /me/weekly-plan, /me/sessions, /training-history,
// /me/ai-coach/context, /ai-pro/status, /me/monthly-assessment/current,
// /me/weekly-digest. Same iOS bridge serialisation symptom as the
// other tabs — the AI Coach tab was the slowest cold-start on the
// player side because it had no god-route at all.
//
// Fix: collapse to ONE round trip via `/api/player/me/ai-coach-data`.
// The screen primes every legacy queryKey via `queryClient.setQueryData`
// so any standalone useQuery(["/api/player/me/weekly-plan"]) etc. that
// remains anywhere downstream hits cache instead of network.
//
// Internal fan-out: `dispatchInProcess` (server/lib/in-process-dispatch.ts)
// — same pattern as community-data.ts. Each child request reuses the
// parent's already-resolved `req.user` so we pay zero auth + family-link
// + account-lock DB round trips per sub-fetch. Shape parity is
// byte-equivalent because we dispatch the legacy routes themselves.
//
// Cache: per-`playerId`, 30s TTL — matches the other player god-routes.
// AI digest + monthly assessment turnover is far slower than 30s, but
// the other branches (weekly-plan, sessions) do change with mutations
// elsewhere in the app, so we keep the conservative TTL and rely on
// targeted invalidation (`invalidatePlayerAiCoachDataCache`) at the
// mutation boundaries that need it.

import { Router } from "express";
import type { NextFunction, Response } from "express";
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

const aiCoachDataCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function getCached(playerId: string): Record<string, unknown> | null {
  const entry = aiCoachDataCache.get(playerId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    aiCoachDataCache.delete(playerId);
    return null;
  }
  return entry.data;
}

function setCache(playerId: string, data: Record<string, unknown>): void {
  aiCoachDataCache.set(playerId, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function invalidatePlayerAiCoachDataCache(playerId: string): void {
  aiCoachDataCache.delete(playerId);
}

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
  "/api/player/me/ai-coach-data",
  authMiddleware,
  requirePlayerOrOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;

      // Pre-onboarding / no-player-profile users: return an empty
      // shell so the screen can show the onboarding nudge without
      // crashing on null derefs.
      if (!playerId) {
        return res.json({
          weeklyPlan: null,
          sessions: [],
          trainingHistory: [],
          aiCoachContext: null,
          aiProStatus: null,
          monthlyAssessment: null,
          weeklyDigest: null,
        });
      }

      const cached = getCached(playerId);
      if (cached) {
        return res.json(cached);
      }

      // All 7 branches dispatch in parallel via in-process. Each
      // wrapped in `Promise.allSettled` so a single broken branch
      // (e.g. monthly-assessment failing on a fresh academy) cannot
      // black out the whole tab.
      const [
        weeklyPlanResult,
        sessionsResult,
        trainingHistoryResult,
        aiCoachContextResult,
        aiProStatusResult,
        monthlyAssessmentResult,
        weeklyDigestResult,
      ] = await Promise.allSettled([
        dispatchInProcess<unknown>(req, "/api/player/me/weekly-plan"),
        dispatchInProcess<unknown>(req, "/api/player/me/sessions"),
        dispatchInProcess<unknown>(req, "/api/player/training-history"),
        dispatchInProcess<unknown>(req, "/api/player/me/ai-coach/context"),
        dispatchInProcess<unknown>(req, "/api/ai-pro/status"),
        dispatchInProcess<unknown>(
          req,
          "/api/player/me/monthly-assessment/current",
        ),
        dispatchInProcess<unknown>(req, "/api/player/me/weekly-digest"),
      ]);

      const pickOk = <T,>(
        r: PromiseSettledResult<{ status: "ok" | "error"; data: T | null }>,
        fallback: T | null = null,
      ): T | null => {
        if (r.status !== "fulfilled") return fallback;
        return r.value.status === "ok" ? r.value.data : fallback;
      };

      const result: Record<string, unknown> = {
        weeklyPlan: pickOk(weeklyPlanResult, null),
        sessions: pickOk(sessionsResult, []),
        trainingHistory: pickOk(trainingHistoryResult, []),
        aiCoachContext: pickOk(aiCoachContextResult, null),
        aiProStatus: pickOk(aiProStatusResult, null),
        monthlyAssessment: pickOk(monthlyAssessmentResult, null),
        weeklyDigest: pickOk(weeklyDigestResult, null),
      };

      // Log rejected/non-2xx branches for production triage. Mirrors
      // the pattern in player-home.ts.
      const branches = [
        ["weeklyPlan", weeklyPlanResult],
        ["sessions", sessionsResult],
        ["trainingHistory", trainingHistoryResult],
        ["aiCoachContext", aiCoachContextResult],
        ["aiProStatus", aiProStatusResult],
        ["monthlyAssessment", monthlyAssessmentResult],
        ["weeklyDigest", weeklyDigestResult],
      ] as const;
      for (const [name, r] of branches) {
        if (r.status === "rejected") {
          console.error(
            `[player-ai-coach-data] sub-fetch '${name}' rejected for player ${playerId}:`,
            r.reason,
          );
        } else if (r.value.status !== "ok") {
          console.warn(
            `[player-ai-coach-data] sub-fetch '${name}' returned HTTP ${r.value.httpStatus} for player ${playerId}`,
          );
        }
      }

      // Cache only when at least the AI context branch succeeded —
      // that's the one the screen reads to decide between the
      // onboarding state vs. the full chat surface. Caching a
      // null-context payload would lock users into the onboarding
      // banner for 30s after a transient failure.
      const aiContextOk =
        aiCoachContextResult.status === "fulfilled" &&
        aiCoachContextResult.value.status === "ok";
      if (aiContextOk) {
        setCache(playerId, result);
      }
      return res.json(result);
    } catch (err) {
      console.error(
        "[player-ai-coach-data] GET /api/player/me/ai-coach-data error:",
        err,
      );
      return res.status(500).json({ error: "Failed to fetch ai-coach data" });
    }
  },
);

export default router;
