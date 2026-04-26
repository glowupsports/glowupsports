// Task #1387 — Player Schedule god-endpoint.
//
// Sister of #1379 (Home), #1383 (Progress + Play). PlayerScheduleScreen
// fired TWELVE parallel React Query calls on mount: sessions,
// court-bookings, matches, vacation, profile (/me), V2 wallet, parent
// payments, notifications, academy-payment-info, calendar token.
// Same iOS bridge serialisation symptom: visibly heavier first paint
// than the now-fixed Home / Progress / Play tabs (1 query each).
//
// Fix: collapse to ONE round trip via `/api/player/me/schedule-data`.
// The screen primes every legacy queryKey via `queryClient.setQueryData`
// so downstream components and chips still hit cache instead of network.
//
// Internal HTTP fan-out: same approach as player-play-data.ts. We call
// the legacy endpoints over loopback (rate-limiter skips loopback IPs in
// server/index.ts ~line 949) instead of duplicating intricate business
// logic. Shape parity is therefore byte-equivalent and drift-free.
//
// Cache: per-`playerId:academyId`, 30s TTL — short because Schedule
// has live payment-confirmation flows where the 15s polling on payments
// + notifications is what catches "coach approved my credit purchase"
// during the user's session. Critical branch is `sessions`.

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

const scheduleDataCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function cacheKey(
  playerId: string,
  academyId: string | null | undefined,
): string {
  // Include academy context — multi-academy users (admin/owner roles
  // viewing a player tab) can switch their effective academy via
  // x-academy-id, and the resolved schedule payload differs per academy.
  return `${playerId}|${academyId ?? "_"}`;
}

function getCached(key: string): Record<string, unknown> | null {
  const entry = scheduleDataCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    scheduleDataCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: Record<string, unknown>): void {
  scheduleDataCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidatePlayerScheduleDataCache(playerId: string): void {
  const prefix = `${playerId}|`;
  for (const k of scheduleDataCache.keys()) {
    if (k.startsWith(prefix)) scheduleDataCache.delete(k);
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
  "/api/player/me/schedule-data",
  authMiddleware,
  requirePlayerOrOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;

      // Pre-onboarding / no-player-profile users — return empty shells
      // so the Schedule screen can still mount its empty-state.
      if (!playerId) {
        return res.json({
          sessions: [],
          courtBookings: [],
          matches: [],
          vacation: null,
          profile: null,
          v2Wallet: null,
          payments: { payments: [] },
          notifications: [],
          academyPaymentInfo: null,
          calendarToken: null,
          _keys: {
            v2Wallet: "/api/v2/credits/wallet/",
            payments: "/api/parent/payments/",
            academyPaymentInfo: "/api/parent/academy-payment-info/",
          },
          _errors: {},
        });
      }

      const key = cacheKey(playerId, req.user?.currentAcademyId);
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

      // Forward player/academy context headers from the original
      // request so sub-fetches resolve against the SAME effective
      // player (Family switch flows depend on `x-active-player-id`;
      // multi-academy users on `x-academy-id`).
      const forwardHeaders: Record<string, string> = {};
      const activePlayerId = req.headers["x-active-player-id"];
      if (typeof activePlayerId === "string") {
        forwardHeaders["x-active-player-id"] = activePlayerId;
      }
      const academyIdHdr = req.headers["x-academy-id"];
      if (typeof academyIdHdr === "string") {
        forwardHeaders["x-academy-id"] = academyIdHdr;
      }

      // Build paths exactly as the screen builds them today so the
      // primed legacy queryKeys hit cache byte-equivalent.
      const v2WalletPath = `/api/v2/credits/wallet/${encodeURIComponent(playerId)}`;
      const paymentsPath = `/api/parent/payments/${encodeURIComponent(playerId)}`;
      const academyPaymentInfoPath = `/api/parent/academy-payment-info/${encodeURIComponent(playerId)}`;

      const [
        sessions,
        courtBookings,
        matches,
        vacation,
        profile,
        v2Wallet,
        payments,
        notifications,
        academyPaymentInfo,
        calendarToken,
      ] = await Promise.all([
        subFetch<unknown>(`/api/player/me/sessions`, authHeader, forwardHeaders),
        subFetch<unknown>(`/api/player/me/court-bookings`, authHeader, forwardHeaders),
        subFetch<unknown>(`/api/player/me/matches`, authHeader, forwardHeaders),
        subFetch<unknown>(`/api/player/me/vacation`, authHeader, forwardHeaders),
        subFetch<unknown>(`/api/player/me`, authHeader, forwardHeaders),
        subFetch<unknown>(v2WalletPath, authHeader, forwardHeaders),
        subFetch<unknown>(paymentsPath, authHeader, forwardHeaders),
        subFetch<unknown>(`/api/player/me/notifications`, authHeader, forwardHeaders),
        subFetch<unknown>(academyPaymentInfoPath, authHeader, forwardHeaders),
        subFetch<unknown>(`/api/player/me/calendar-token`, authHeader, forwardHeaders),
      ]);

      const errors: Record<string, number | null> = {};
      const note = (k: string, r: SubFetchResult<unknown>) => {
        if (r.status === "error") errors[k] = r.httpStatus;
      };
      note("sessions", sessions);
      note("courtBookings", courtBookings);
      note("matches", matches);
      note("vacation", vacation);
      note("profile", profile);
      note("v2Wallet", v2Wallet);
      note("payments", payments);
      note("notifications", notifications);
      note("academyPaymentInfo", academyPaymentInfo);
      note("calendarToken", calendarToken);

      const responseBody = {
        sessions: sessions.data ?? [],
        courtBookings: courtBookings.data ?? [],
        matches: matches.data ?? [],
        vacation: vacation.data ?? null,
        profile: profile.data ?? null,
        v2Wallet: v2Wallet.data ?? null,
        payments: payments.data ?? { payments: [] },
        notifications: notifications.data ?? [],
        academyPaymentInfo: academyPaymentInfo.data ?? null,
        calendarToken: calendarToken.data ?? null,
        // Echo the resolved playerId-templated keys so the client
        // can prime caches under the EXACT keys it would otherwise
        // hit, no string-templating in two places.
        _keys: {
          v2Wallet: v2WalletPath,
          payments: paymentsPath,
          academyPaymentInfo: academyPaymentInfoPath,
        },
        _errors: errors,
      };

      // Only cache when sessions (the screen's must-have block)
      // succeeded. Mirrors player-play-data.ts policy.
      if (sessions.status === "ok") {
        setCache(key, responseBody);
      }

      return res.json(responseBody);
    } catch (error) {
      console.error("[player-schedule-data] Unhandled error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch player schedule data" });
    }
  },
);

export default router;
