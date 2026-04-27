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
// Fix: collapse to ONE round trip via \`/api/player/me/ai-coach-data\`.
// The screen primes every legacy queryKey via \`queryClient.setQueryData\`
// so any standalone useQuery(["/api/player/me/weekly-plan"]) etc. that
// remains anywhere downstream hits cache instead of network.
//
// Internal fan-out: \`dispatchInProcess\` (server/lib/in-process-dispatch.ts)
// — same pattern as community-data.ts. Each child request reuses the
// parent's already-resolved \`req.user\` so we pay zero auth + family-link
// + account-lock DB round trips per sub-fetch. Shape parity is
// byte-equivalent because we dispatch the legacy routes themselves.
//
// Cache: 30s in-memory per \`playerId:academyId\` — matches the other player god-routes.
// AI digest + monthly assessment turnover is far slower than 30s, but
// the other branches (weekly-plan, sessions) do change with mutations
// elsewhere in the app, so we keep the conservative TTL and rely on
// targeted invalidation (\`invalidatePlayerAiCoachDataCache\`) at the
// mutation boundaries that need it.
//
// The \`aiCoachContext\` branch is the critical must-have for the maturity 
// banner / mirror layer counts; cache is only set when that branch succeeds, 
// mirroring the player-home.ts policy.

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

const aiCoachDataCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function cacheKey(
  playerId: string,
  academyId: string | null | undefined,
): string {
  return `${playerId}|${academyId ?? "_"}`;
}

function getCached(key: string): Record<string, unknown> | null {
  const entry = aiCoachDataCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    aiCoachDataCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: Record<string, unknown>): void {
  aiCoachDataCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidatePlayerAiCoachDataCache(playerId: string): void {
  const prefix = `${playerId}|`;
  for (const k of aiCoachDataCache.keys()) {
    if (k.startsWith(prefix)) aiCoachDataCache.delete(k);
  }
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

type SubFetchResult<T> = DispatchResult<T>;

router.get(
  "/api/player/me/ai-coach-data",
  authMiddleware,
  requirePlayerOrOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;

      if (!playerId) {
        return res.json({
          weeklyPlan: null,
          sessions: [],
          trainingHistory: [],
          aiCoachContext: null,
          aiProStatus: { isPro: false, isCoach: false, callCount: 0, limit: 5 },
          monthlyAssessment: null,
          weeklyDigest: null,
          tennisIq: null,
          _errors: {},
        });
      }

      const key = cacheKey(playerId, req.user?.currentAcademyId);
      const cached = getCached(key);
      if (cached) {
        return res.json(cached);
      }

      const sub = <T>(path: string) => dispatchInProcess<T>(req, path);

      // All 8 branches dispatch in parallel via in-process. 
      const [
        weeklyPlanResult,
        sessionsResult,
        trainingHistoryResult,
        aiCoachContextResult,
        aiProStatusResult,
        monthlyAssessmentResult,
        weeklyDigestResult,
        tennisIqResult,
      ] = await Promise.all([
        sub<unknown>("/api/player/me/weekly-plan"),
        sub<unknown>("/api/player/me/sessions"),
        sub<unknown>("/api/player/training-history"),
        sub<unknown>("/api/player/me/ai-coach/context"),
        sub<unknown>("/api/ai-pro/status"),
        sub<unknown>("/api/player/me/monthly-assessment/current"),
        sub<unknown>("/api/player/me/weekly-digest"),
        sub<unknown>("/api/player/me/tennis-iq"),
      ]);

      const errors: Record<string, number | null> = {};
      const note = (k: string, r: SubFetchResult<unknown>) => {
        if (r.status === "error") {
          errors[k] = r.httpStatus;
          if (r.httpStatus === 500) {
            console.error(`[player-ai-coach-data] sub-fetch '${k}' failed for player ${playerId}`);
          } else {
            console.warn(`[player-ai-coach-data] sub-fetch '${k}' returned HTTP ${r.httpStatus} for player ${playerId}`);
          }
        }
      };

      note("weeklyPlan", weeklyPlanResult);
      note("sessions", sessionsResult);
      note("trainingHistory", trainingHistoryResult);
      note("aiCoachContext", aiCoachContextResult);
      note("aiProStatus", aiProStatusResult);
      note("monthlyAssessment", monthlyAssessmentResult);
      note("weeklyDigest", weeklyDigestResult);
      note("tennisIq", tennisIqResult);

      const result = {
        weeklyPlan: weeklyPlanResult.data ?? null,
        sessions: sessionsResult.data ?? [],
        trainingHistory: trainingHistoryResult.data ?? [],
        aiCoachContext: aiCoachContextResult.data ?? null,
        aiProStatus: aiProStatusResult.data ?? { isPro: false, isCoach: false, callCount: 0, limit: 5 },
        monthlyAssessment: monthlyAssessmentResult.data ?? null,
        weeklyDigest: weeklyDigestResult.data ?? null,
        tennisIq: tennisIqResult.data ?? null,
        _errors: errors,
      };

      // Cache only when at least the AI context branch succeeded.
      if (aiCoachContextResult.status === "ok") {
        setCache(key, result);
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
