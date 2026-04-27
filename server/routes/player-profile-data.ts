// Task #1387 — Player Profile god-endpoint.
//
// Sister of #1379 / #1383 / sibling of player-schedule-data.ts.
// PlayerProfileScreen fired ELEVEN parallel queries on mount: profile,
// groups, connections, dashboard, V2 wallet, active live match,
// badges, titles, player-of-week, vacation. The screen is the slowest
// post-onboarding cold-start surface — we can see the badge row and
// XP chip popping in piece-by-piece in production.
//
// Fix: collapse to ONE round trip via `/api/player/me/profile-data`.
// The screen primes every legacy queryKey via `setQueryData` so the
// downstream PlayerOfWeekChip, BadgeStrip, TitleStrip, etc. all hit
// cache instead of re-firing.
//
// Cache: per-`playerId:academyId`, 60s TTL — Profile changes much
// less often than Schedule (no payment polling), and refreshes happen
// via mutation invalidation. Critical branch is `profile`.
//
// Task #1398 — Replaced HTTP loopback fan-out with in-process Express
// dispatch (`dispatchInProcess`). Each legacy sub-fetch used to pay for
// a TCP round-trip + a full re-run of `authMiddlewareWithFreshData`
// (~2 extra DB queries per call). With 10 sub-fetches that was ~20
// "free" DB hits and ~50ms of HTTP overhead on every Profile open. The
// dispatcher routes the child request through the same Express app
// while reusing the parent request's already-resolved `req.user`, so
// response shape stays byte-equivalent.

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

const profileDataCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheKey(
  playerId: string,
  academyId: string | null | undefined,
): string {
  return `${playerId}|${academyId ?? "_"}`;
}

function getCached(key: string): Record<string, unknown> | null {
  const entry = profileDataCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    profileDataCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: Record<string, unknown>): void {
  profileDataCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidatePlayerProfileDataCache(playerId: string): void {
  const prefix = `${playerId}|`;
  for (const k of profileDataCache.keys()) {
    if (k.startsWith(prefix)) profileDataCache.delete(k);
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
  "/api/player/me/profile-data",
  authMiddleware,
  requirePlayerOrOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;

      if (!playerId) {
        return res.json({
          profile: null,
          groups: { myGroups: [], discover: [] },
          connections: null,
          dashboard: null,
          v2Wallet: null,
          activeLiveMatch: { matches: [] },
          badges: [],
          titles: [],
          playerOfWeek: { awards: [] },
          vacation: null,
          _keys: {
            v2Wallet: "/api/v2/credits/wallet/",
            playerOfWeek: "/api/leaderboards/player-of-week/by-player/",
          },
          _errors: {},
        });
      }

      const key = cacheKey(playerId, req.user?.currentAcademyId);
      const cached = getCached(key);
      if (cached) {
        return res.json(cached);
      }

      // Authorization is optional for in-process dispatch — the
      // dispatcher carries `req.user` directly so child handlers don't
      // need the Bearer header — but we still surface a 401 if the
      // outer request itself wasn't authenticated.
      if (!req.headers.authorization) {
        return res
          .status(401)
          .json({ error: "Authorization header missing" });
      }

      const v2WalletPath = `/api/v2/credits/wallet/${encodeURIComponent(playerId)}`;
      const playerOfWeekPath = `/api/leaderboards/player-of-week/by-player/${encodeURIComponent(playerId)}`;

      // In-process Express dispatch — see server/lib/in-process-dispatch.ts.
      // Replaces 10 HTTP loopback round-trips with a single Promise.all
      // over direct app(req, res) invocations that reuse `req.user`.
      const sub = <T>(path: string) => dispatchInProcess<T>(req, path);

      const [
        profile,
        groups,
        connections,
        dashboard,
        v2Wallet,
        activeLiveMatch,
        badges,
        titles,
        playerOfWeek,
        vacation,
      ] = await Promise.all([
        sub<unknown>(`/api/player/me/profile`),
        sub<unknown>(`/api/player/groups`),
        sub<unknown>(`/api/player/connections`),
        sub<unknown>(`/api/player/me/dashboard`),
        sub<unknown>(v2WalletPath),
        sub<unknown>(`/api/live-scoring/player/me/active`),
        sub<unknown>(`/api/player/badges`),
        sub<unknown>(`/api/player/titles`),
        sub<unknown>(playerOfWeekPath),
        sub<unknown>(`/api/player/me/vacation`),
      ]);

      const errors: Record<string, number | null> = {};
      const note = (k: string, r: SubFetchResult<unknown>) => {
        if (r.status === "error") errors[k] = r.httpStatus;
      };
      note("profile", profile);
      note("groups", groups);
      note("connections", connections);
      note("dashboard", dashboard);
      note("v2Wallet", v2Wallet);
      note("activeLiveMatch", activeLiveMatch);
      note("badges", badges);
      note("titles", titles);
      note("playerOfWeek", playerOfWeek);
      note("vacation", vacation);

      const responseBody = {
        profile: profile.data ?? null,
        groups: groups.data ?? { myGroups: [], discover: [] },
        connections: connections.data ?? null,
        dashboard: dashboard.data ?? null,
        v2Wallet: v2Wallet.data ?? null,
        activeLiveMatch: activeLiveMatch.data ?? { matches: [] },
        badges: badges.data ?? [],
        titles: titles.data ?? [],
        playerOfWeek: playerOfWeek.data ?? { awards: [] },
        vacation: vacation.data ?? null,
        _keys: {
          v2Wallet: v2WalletPath,
          playerOfWeek: playerOfWeekPath,
        },
        _errors: errors,
      };

      // Cache only when the must-have block (profile) succeeded.
      if (profile.status === "ok") {
        setCache(key, responseBody);
      }

      return res.json(responseBody);
    } catch (error) {
      console.error("[player-profile-data] Unhandled error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch player profile data" });
    }
  },
);

export default router;
