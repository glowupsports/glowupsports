// Task #1383 — Player Play god-endpoint.
//
// Companion to Task #1379 (Player Home) and the sister Progress god-endpoint.
// PlayScreen fired six parallel React Query calls on mount: profile,
// booking-invites, open-matches, corporate/my-account, play/sessions,
// play/nearby-players. Same iOS bridge serialisation symptom as the other
// two screens.
//
// Fix: collapse to ONE round trip via `/api/player/me/play-data?...`. The
// screen primes every legacy queryKey via `queryClient.setQueryData` so
// downstream components and chip toggles still hit cache instead of network.
//
// Internal HTTP fan-out: same approach as player-progress-data.ts. We call
// the legacy endpoints over loopback (rate-limiter skips loopback IPs in
// server/index.ts ~line 949) instead of duplicating ~1500 lines of intricate
// `/api/play/sessions` + `/api/play/nearby-players` + `/api/open-matches`
// business logic. Shape parity is therefore byte-equivalent and drift-free.
//
// Cache: per-`playerId:level:scope:sport:filter:travelTime`, 30s TTL — short
// because the screen re-keys when chips change, so cache is mostly hit on
// rapid re-mounts (e.g. tab swipe back-and-forth) rather than long sessions.
// Critical branch is `sessions` (the upcoming play list — must-have payload).

import { Router } from "express";
import type { NextFunction, Response } from "express";
import { db } from "../db";
import { players } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
} from "../auth";
import type { AuthenticatedRequest } from "../auth";

const router = Router();

interface CacheEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}

const playDataCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function cacheKey(
  playerId: string,
  academyId: string | null | undefined,
  level: string,
  scope: string,
  sport: string,
  filter: string,
  travelTime: string,
): string {
  // Include academy context — multi-academy users (admin/owner roles
  // viewing a player tab) can switch their effective academy via
  // x-academy-id, and the resolved play payload differs per academy.
  // Without this, an academy switch would serve stale data for up to TTL.
  return `${playerId}|${academyId ?? "_"}|${level}|${scope}|${sport}|${filter}|${travelTime}`;
}

function getCached(key: string): Record<string, unknown> | null {
  const entry = playDataCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    playDataCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: Record<string, unknown>): void {
  playDataCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidatePlayerPlayDataCache(playerId: string): void {
  const prefix = `${playerId}|`;
  for (const k of playDataCache.keys()) {
    if (k.startsWith(prefix)) playDataCache.delete(k);
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

const INTERNAL_PORT = process.env.PORT || "5000";
const INTERNAL_BASE = `http://127.0.0.1:${INTERNAL_PORT}`;

interface SubFetchResult<T> {
  status: "ok" | "error";
  data: T | null;
  httpStatus: number | null;
}

async function subFetch<T>(
  path: string,
  authHeader: string,
  forwardHeaders: Record<string, string> = {},
): Promise<SubFetchResult<T>> {
  try {
    const r = await fetch(`${INTERNAL_BASE}${path}`, {
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
        ...forwardHeaders,
      },
    });
    if (!r.ok) {
      return { status: "error", data: null, httpStatus: r.status };
    }
    const data = (await r.json()) as T;
    return { status: "ok", data, httpStatus: r.status };
  } catch {
    return { status: "error", data: null, httpStatus: null };
  }
}

router.get(
  "/api/player/me/play-data",
  authMiddleware,
  requirePlayerOrOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const sport =
        typeof req.query.sport === "string" && req.query.sport.length > 0
          ? req.query.sport
          : "tennis";
      // The screen's chip selections come in raw — `level=__my_level__` is a
      // sentinel meaning "use my own ball level"; `scope=mine` from a free
      // player gets downgraded to "country" (Task #1033 parity). The legacy
      // endpoints don't know about these sentinels, so we resolve them
      // server-side using the player record before fanning out.
      const rawLevel =
        typeof req.query.level === "string" && req.query.level.length > 0
          ? req.query.level
          : "all";
      const rawScope =
        typeof req.query.scope === "string" && req.query.scope.length > 0
          ? req.query.scope
          : "mine";
      const filter =
        typeof req.query.filter === "string" && req.query.filter.length > 0
          ? req.query.filter
          : "all";
      const travelTime =
        String(req.query.travelTime ?? "true") === "true" ? "true" : "false";

      // Pre-onboarding / no-player-profile users — return empty shells so
      // the Play screen can still mount its empty-state.
      if (!playerId) {
        return res.json({
          profile: null,
          bookingInvites: [],
          openMatches: [],
          corporate: { corporateAccount: null, member: null },
          sessions: [],
          nearbyPlayers: [],
          _errors: {},
        });
      }

      // Resolve the chip sentinels using the player record. Mirrors the
      // client-side useMemo at PlayScreen `sessionsLevelParam`/`effectiveScope`.
      let resolvedLevel = rawLevel;
      let resolvedScope = rawScope;
      try {
        const [row] = await db
          .select({ ballLevel: players.ballLevel, academyId: players.academyId })
          .from(players)
          .where(eq(players.id, playerId))
          .limit(1);
        const playerBallLevel = (row?.ballLevel || "glow").toLowerCase();
        const playerAcademyId = row?.academyId || null;
        if (rawLevel === "__my_level__" || rawLevel === "my_level") {
          resolvedLevel = playerBallLevel;
        }
        // Free players (no academy) cannot use "mine" — fall back to country.
        if (rawScope === "mine" && !playerAcademyId) {
          resolvedScope = "country";
        }
      } catch (e) {
        // If the player lookup fails we still fan out with the raw values
        // so the screen can render *something* instead of erroring out.
        console.error("[player-play-data] Player resolution failed:", e);
      }

      const key = cacheKey(
        playerId,
        req.user?.currentAcademyId,
        resolvedLevel,
        resolvedScope,
        sport,
        filter,
        travelTime,
      );
      const cached = getCached(key);
      if (cached) {
        return res.json(cached);
      }

      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res
          .status(401)
          .json({ error: "Authorization header missing" });
      }

      // Forward player/academy context headers from the original request so
      // sub-fetches resolve against the SAME effective player (Family switch
      // flows depend on `x-active-player-id`; multi-academy users on
      // `x-academy-id`). Without this the god-endpoint would silently
      // resolve against the user's default player and parity with the
      // legacy direct fetches breaks.
      const forwardHeaders: Record<string, string> = {};
      const activePlayerId = req.headers["x-active-player-id"];
      if (typeof activePlayerId === "string") {
        forwardHeaders["x-active-player-id"] = activePlayerId;
      }
      const academyIdHdr = req.headers["x-academy-id"];
      if (typeof academyIdHdr === "string") {
        forwardHeaders["x-academy-id"] = academyIdHdr;
      }

      // Build the same query strings the screens build today so the legacy
      // endpoints see byte-equivalent input.
      const sessionsPath = `/api/play/sessions?level=${encodeURIComponent(resolvedLevel)}&sport=${encodeURIComponent(sport)}&scope=${encodeURIComponent(resolvedScope)}`;
      const nearbyPath =
        filter !== "all"
          ? `/api/play/nearby-players?filter=${encodeURIComponent(filter)}&sport=${encodeURIComponent(sport)}&travelTime=${travelTime}&scope=${encodeURIComponent(resolvedScope)}`
          : `/api/play/nearby-players?sport=${encodeURIComponent(sport)}&travelTime=${travelTime}&scope=${encodeURIComponent(resolvedScope)}`;
      const openMatchesPath = `/api/open-matches?includeAllLevels=true&sport=${encodeURIComponent(sport)}&scope=${encodeURIComponent(resolvedScope)}`;

      const [
        profile,
        bookingInvites,
        openMatches,
        corporate,
        sessions,
        nearbyPlayers,
      ] = await Promise.all([
        subFetch<unknown>(`/api/player/me/profile`, authHeader, forwardHeaders),
        subFetch<unknown>(`/api/player/booking-invites`, authHeader, forwardHeaders),
        subFetch<unknown>(openMatchesPath, authHeader, forwardHeaders),
        subFetch<unknown>(`/api/corporate/my-account`, authHeader, forwardHeaders),
        subFetch<unknown>(sessionsPath, authHeader, forwardHeaders),
        subFetch<unknown>(nearbyPath, authHeader, forwardHeaders),
      ]);

      const errors: Record<string, number | null> = {};
      const note = (k: string, r: SubFetchResult<unknown>) => {
        if (r.status === "error") errors[k] = r.httpStatus;
      };
      note("profile", profile);
      note("bookingInvites", bookingInvites);
      note("openMatches", openMatches);
      note("corporate", corporate);
      note("sessions", sessions);
      note("nearbyPlayers", nearbyPlayers);

      const responseBody = {
        profile: profile.data,
        bookingInvites: bookingInvites.data ?? [],
        openMatches: openMatches.data ?? [],
        corporate: corporate.data ?? { corporateAccount: null, member: null },
        sessions: sessions.data ?? [],
        nearbyPlayers: nearbyPlayers.data ?? [],
        // Echo back the resolved query keys so the client can prime caches
        // under the EXACT keys it would otherwise use, no guessing.
        _keys: {
          sessions: sessionsPath,
          nearbyPlayers: nearbyPath,
          openMatches: ["/api/open-matches", { includeAllLevels: true, includeMine: false, sport, scope: resolvedScope }],
        },
        _errors: errors,
      };

      // Only cache when sessions (the screen's must-have block) succeeded.
      if (sessions.status === "ok") {
        setCache(key, responseBody);
      }

      return res.json(responseBody);
    } catch (error) {
      console.error("[player-play-data] Unhandled error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch player play data" });
    }
  },
);

export default router;
