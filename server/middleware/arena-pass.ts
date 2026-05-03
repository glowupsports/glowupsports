/**
 * Arena Pass Middleware
 *
 * Checks whether the authenticated player holds an active "arena_pass" entitlement
 * by querying the RevenueCat REST API.  Results are cached per-player for 5 minutes
 * to avoid hammering the RC API on every request.
 */
import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../auth";

const ARENA_PASS_ENTITLEMENT = "arena_pass";
const RC_API_SECRET = process.env.REVENUECAT_API_SECRET;

interface CacheEntry {
  hasPass: boolean;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function fetchArenaPassStatus(playerId: string): Promise<boolean> {
  if (!RC_API_SECRET) {
    // No API secret configured — deny access unless explicitly in dev mode
    return process.env.NODE_ENV === "development";
  }
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(playerId)}`,
      {
        headers: {
          Authorization: `Bearer ${RC_API_SECRET}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!res.ok) return false;
    const body = (await res.json()) as { subscriber?: { entitlements?: Record<string, { expires_date: string | null }> } };
    const ent = body.subscriber?.entitlements?.[ARENA_PASS_ENTITLEMENT];
    if (!ent) return false;
    // Active if expires_date is null (lifetime) or in the future
    if (ent.expires_date === null) return true;
    return new Date(ent.expires_date).getTime() > Date.now();
  } catch {
    return false;
  }
}

export async function requireArenaPass(req: Request, res: Response, next: NextFunction) {
  const playerId = (req as AuthenticatedRequest).user?.playerId;
  if (!playerId) {
    return res.status(403).json({ error: "Player account required" });
  }

  const cached = cache.get(playerId);
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.hasPass) {
      return res.status(403).json({ error: "Arena Pass required", code: "ARENA_PASS_REQUIRED" });
    }
    return next();
  }

  const hasPass = await fetchArenaPassStatus(playerId);
  cache.set(playerId, { hasPass, expiresAt: Date.now() + CACHE_TTL_MS });

  if (!hasPass) {
    return res.status(403).json({ error: "Arena Pass required", code: "ARENA_PASS_REQUIRED" });
  }
  next();
}

/** Clear the cached status for a player (call after purchase verification). */
export function invalidateArenaPassCache(playerId: string) {
  cache.delete(playerId);
}

/**
 * Academy Pass middleware for Match Prediction routes.
 * The spec refers to this as "Academy Pass" (lines 32, 77 of Phase 4 spec).
 * The underlying RevenueCat entitlement is the same Arena Pass subscription
 * (com.glowupsports.app.arena.pass.monthly / entitlement: "arena_pass").
 * No separate product exists — Academy Pass is a spec alias for Arena Pass.
 */
export async function requireAcademyPass(req: Request, res: Response, next: NextFunction) {
  const playerId = (req as AuthenticatedRequest).user?.playerId;
  if (!playerId) {
    return res.status(403).json({ error: "Player account required" });
  }

  const cached = cache.get(playerId);
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.hasPass) {
      return res.status(403).json({ error: "Academy Pass required", code: "ACADEMY_PASS_REQUIRED" });
    }
    return next();
  }

  const hasPass = await fetchArenaPassStatus(playerId);
  cache.set(playerId, { hasPass, expiresAt: Date.now() + CACHE_TTL_MS });

  if (!hasPass) {
    return res.status(403).json({ error: "Academy Pass required", code: "ACADEMY_PASS_REQUIRED" });
  }
  next();
}
