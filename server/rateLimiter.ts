// RL-01 FIX: Security-sensitive rate limiters now use a DB-backed shared store.
// This is required because `.replit` uses `deploymentTarget = "autoscale"` —
// multiple instances can run simultaneously. Process-local MemoryStore multiplies
// the effective limit by replica count, making limits ineffective.
//
// Auth / OTP / reset / diagnostics / adminRepair → DbRateLimitStore (Postgres).
// chatRateLimiter / postRateLimiter → remain in-process (feature limits, not
// security-critical auth limits). Flag for DB-backend before heavy autoscale load.

import rateLimit from "express-rate-limit";
import { db } from "./db";
import { sql } from "drizzle-orm";

// ── Shared DB-backed store ───────────────────────────────────────────────────

// Exported so tests can instantiate two separate instances against the same DB
// and verify that hit counts are shared (autoscale proof).
export class DbRateLimitStore {
  private windowMs: number;
  private prefix: string;

  constructor(windowMs: number, prefix: string) {
    this.windowMs = windowMs;
    this.prefix = prefix;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const fullKey = `${this.prefix}:${key}`;
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / this.windowMs) * this.windowMs);
    const expiresAt = new Date(windowStart.getTime() + this.windowMs);

    const result = await db.execute(sql`
      INSERT INTO rate_limit_hits (key, window_start, count, expires_at)
      VALUES (${fullKey}, ${windowStart.toISOString()}, 1, ${expiresAt.toISOString()})
      ON CONFLICT (key, window_start) DO UPDATE
        SET count = rate_limit_hits.count + 1
      RETURNING count
    `);

    const totalHits = Number((result.rows[0] as { count: string | number } | undefined)?.count ?? 1);
    return { totalHits, resetTime: expiresAt };
  }

  async decrement(key: string): Promise<void> {
    const fullKey = `${this.prefix}:${key}`;
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / this.windowMs) * this.windowMs);
    await db.execute(sql`
      UPDATE rate_limit_hits SET count = GREATEST(0, count - 1)
      WHERE key = ${fullKey} AND window_start = ${windowStart.toISOString()}
    `);
  }

  async resetKey(key: string): Promise<void> {
    const fullKey = `${this.prefix}:${key}`;
    await db.execute(sql`DELETE FROM rate_limit_hits WHERE key = ${fullKey}`);
  }
}

// Periodic cleanup of expired rows — non-critical, runs every 10 minutes
setInterval(async () => {
  try {
    await db.execute(sql`DELETE FROM rate_limit_hits WHERE expires_at < NOW()`);
  } catch {
    // Swallow: cleanup failure should never affect request handling
  }
}, 10 * 60 * 1000);

// ── Security-critical limiters (DB-backed) ───────────────────────────────────

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  store: new DbRateLimitStore(15 * 60 * 1000, "auth"),
});

export const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many invite attempts. Please wait 15 minutes and try again." },
  standardHeaders: true,
  legacyHeaders: false,
  store: new DbRateLimitStore(15 * 60 * 1000, "invite"),
});

export const diagnosticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many diagnostic reports submitted. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  store: new DbRateLimitStore(15 * 60 * 1000, "diagnostics"),
});

export const adminRepairLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many admin repair requests. Please wait before retrying." },
  standardHeaders: true,
  legacyHeaders: false,
  store: new DbRateLimitStore(15 * 60 * 1000, "adminRepair"),
});

// ── Feature rate limiters (in-process — see note above) ─────────────────────

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isRateLimited(userId: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(userId);
    if (!timestamps) return false;
    const valid = timestamps.filter(t => now - t < this.windowMs);
    this.requests.set(userId, valid);
    return valid.length >= this.maxRequests;
  }

  recordRequest(userId: string): void {
    const now = Date.now();
    const timestamps = this.requests.get(userId) || [];
    const valid = timestamps.filter(t => now - t < this.windowMs);
    valid.push(now);
    this.requests.set(userId, valid);
  }
}

export const chatRateLimiter = new RateLimiter(5, 10000);
export const postRateLimiter = new RateLimiter(3, 60000);
