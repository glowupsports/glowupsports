// Task #1384 — Community god-endpoint.
//
// Companion to Task #1379 (Player Home), #1383 (Player Progress + Play). The
// Community tab still fired SEVEN parallel React Query calls on mount —
// feed-preferences, friends, feed-unseen, the actual feed page, highlights,
// social/groups (for the create-moment modal's group picker), and the
// suggested-coaches/players row inside DiscoveryRail. Same iOS bridge
// serialisation symptom as the other three screens, plus mobile network
// rate-limit pressure on cold-cache opens.
//
// Fix: collapse to ONE round trip via `/api/player/me/community-data?...`.
// The screen primes every legacy queryKey via `queryClient.setQueryData` so
// downstream components (DiscoveryRail, FriendsSection, the create-moment
// modal's group picker) hit cache instead of network.
//
// Internal HTTP fan-out: same approach as player-progress-data.ts /
// player-play-data.ts. We call the legacy endpoints over loopback (the
// rate-limiter in server/index.ts skips loopback IPs) instead of duplicating
// the social/feed business logic. Shape parity is therefore byte-equivalent
// and drift-free.
//
// Cache: per-`playerId:academyId:filter:typesCSV`, 30s TTL — short because
// the feed mutates rapidly (cheers/comments) and the screen's pull-to-refresh
// invalidates the legacy keys directly. Critical branch is `feed` (the only
// must-have payload — without it the screen sits on a spinner).

import { Router } from "express";
import type { NextFunction, Response } from "express";
import {
  authMiddlewareWithFreshData as authMiddleware,
} from "../auth";
import type { AuthenticatedRequest } from "../auth";

const router = Router();

interface CacheEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}

const communityDataCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function cacheKey(
  playerId: string,
  academyId: string | null | undefined,
  filter: string,
  types: string,
): string {
  // Include academy context — multi-academy users (admin/owner roles
  // viewing a player tab) can switch their effective academy via
  // x-academy-id, and the resolved community payload differs per academy.
  // Without this, an academy switch would serve stale data for up to TTL.
  return `${playerId}|${academyId ?? "_"}|${filter}|${types}`;
}

function getCached(key: string): Record<string, unknown> | null {
  const entry = communityDataCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    communityDataCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: Record<string, unknown>): void {
  communityDataCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidatePlayerCommunityDataCache(playerId: string): void {
  const prefix = `${playerId}|`;
  for (const k of communityDataCache.keys()) {
    if (k.startsWith(prefix)) communityDataCache.delete(k);
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
  "/api/player/me/community-data",
  authMiddleware,
  requirePlayerOrOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const filter =
        typeof req.query.filter === "string" && req.query.filter.length > 0
          ? req.query.filter
          : "all";
      // `types` is the comma-separated active-category list the screen
      // already builds from per-user feed preferences. We forward it raw so
      // the underlying /api/social/feed sees byte-equivalent input and the
      // primed queryKey matches exactly.
      const types =
        typeof req.query.types === "string" ? req.query.types : "";

      // Pre-onboarding / no-player-profile users — return empty shells so
      // the Community screen can still mount and show its locked / empty
      // affordances without erroring out.
      if (!playerId) {
        return res.json({
          feedPreferences: null,
          friends: { friends: [], pendingRequests: [] },
          feedUnseen: { cheers: 0, comments: 0, mentions: 0, total: 0 },
          feed: [],
          highlights: { newMoments: 0, openToPlay: 0 },
          socialGroups: [],
          discoveryPlayers: { players: [] },
          _errors: {},
        });
      }

      const key = cacheKey(
        playerId,
        req.user?.currentAcademyId,
        filter,
        types,
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

      // Build the same /api/social/feed query the screen builds today so
      // the legacy endpoint (and the queryKey we prime below) sees
      // byte-equivalent input.
      const feedParams = new URLSearchParams({ filter });
      const isUnified = filter === "all";
      // The unified feed honours per-user category toggles. Other named
      // tabs (academy/news/events/moments) keep their existing behaviour.
      // When the user has zero active categories the screen returns []
      // without making a request; we mirror that here so the cache and
      // queryKey priming stay in sync.
      const skipFeed = isUnified && types.length === 0;
      if (isUnified && types.length > 0) {
        feedParams.set("types", types);
      }
      const feedPath = `/api/social/feed?${feedParams.toString()}`;

      const [
        feedPreferences,
        friends,
        feedUnseen,
        feed,
        highlights,
        socialGroups,
        discoveryPlayers,
      ] = await Promise.all([
        subFetch<unknown>(`/api/social/feed-preferences`, authHeader, forwardHeaders),
        subFetch<unknown>(`/api/player/me/friends`, authHeader, forwardHeaders),
        subFetch<unknown>(`/api/social/me/feed-unseen`, authHeader, forwardHeaders),
        skipFeed
          ? Promise.resolve({ status: "ok" as const, data: [] as unknown, httpStatus: 200 })
          : subFetch<unknown>(feedPath, authHeader, forwardHeaders),
        subFetch<unknown>(`/api/social/highlights`, authHeader, forwardHeaders),
        subFetch<unknown>(`/api/social/groups`, authHeader, forwardHeaders),
        subFetch<unknown>(`/api/social/discovery/players?limit=12`, authHeader, forwardHeaders),
      ]);

      const errors: Record<string, number | null> = {};
      const note = (k: string, r: SubFetchResult<unknown>) => {
        if (r.status === "error") errors[k] = r.httpStatus;
      };
      note("feedPreferences", feedPreferences);
      note("friends", friends);
      note("feedUnseen", feedUnseen);
      note("feed", feed);
      note("highlights", highlights);
      note("socialGroups", socialGroups);
      note("discoveryPlayers", discoveryPlayers);

      const responseBody = {
        feedPreferences: feedPreferences.data ?? null,
        friends: friends.data ?? { friends: [], pendingRequests: [] },
        feedUnseen:
          feedUnseen.data ?? { cheers: 0, comments: 0, mentions: 0, total: 0 },
        feed: feed.data ?? [],
        highlights: highlights.data ?? { newMoments: 0, openToPlay: 0 },
        socialGroups: socialGroups.data ?? [],
        discoveryPlayers: discoveryPlayers.data ?? { players: [] },
        // Echo the exact composite feed queryKey the screen would otherwise
        // build, so the client primes cache under the EXACT key — no
        // guessing about whether `types` was set or omitted.
        _keys: {
          feed: ["/api/social/feed", { filter, types }],
        },
        _errors: errors,
      };

      // Only cache when the critical `feed` branch succeeded — a transient
      // backend hiccup shouldn't pin a degraded response for the full TTL
      // and lock the screen on an empty list. Mirrors play-data.ts / 
      // progress-data.ts policy.
      if (feed.status === "ok") {
        setCache(key, responseBody);
      }

      return res.json(responseBody);
    } catch (error) {
      console.error("[community-data] Unhandled error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch community data" });
    }
  },
);

export default router;
