/**
 * server/services/credit-feature-flag.ts
 *
 * Per-academy gate for the new Credit Engine V2 (Phase 3 — Task #651).
 *
 * `academies.use_new_credit_system` is a boolean flag that, when true,
 * routes all live consume / refund operations for that academy through
 * `server/services/credit-engine.ts` and freezes the legacy
 * `credit_transactions` / `packages.remaining_credits` writes.
 *
 * This module is the single read-point for that flag. It caches results
 * in-memory for `TTL_MS` so the legacy hot paths (attendance + refund)
 * don't add a per-call DB round-trip.
 *
 * The cache is intentionally simple — a flip via the platform-owner
 * "switch to V2" endpoint should call `invalidateAcademyFlag(academyId)`
 * immediately after the UPDATE so the change takes effect without
 * waiting for TTL expiry.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

const TTL_MS = 60_000;

interface CacheEntry {
  enabled: boolean;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function isV2EnabledForAcademy(academyId: string | null | undefined): Promise<boolean> {
  if (!academyId) return false;

  const cached = cache.get(academyId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.enabled;
  }

  try {
    const result = await db.execute(sql`
      SELECT use_new_credit_system FROM academies WHERE id = ${academyId} LIMIT 1
    `);
    const row = result.rows[0] as { use_new_credit_system?: boolean } | undefined;
    const enabled = row?.use_new_credit_system === true;
    cache.set(academyId, { enabled, expiresAt: now + TTL_MS });
    return enabled;
  } catch (err) {
    console.error(`[credit-feature-flag] lookup failed for academy ${academyId}:`, err);
    return false;
  }
}

/** Drop the cached flag for an academy. Call this immediately after a
 *  flip so the new value takes effect without waiting for TTL expiry. */
export function invalidateAcademyFlag(academyId: string): void {
  cache.delete(academyId);
}

/** Drop every cached entry. Useful for tests or after a bulk flag update. */
export function invalidateAllAcademyFlags(): void {
  cache.clear();
}
