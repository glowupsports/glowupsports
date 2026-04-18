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

// ---------------------------------------------------------------------------
// Task #676 Phase 2 — V1 write gate.
//
// `v1WritesAllowed(academyId)` returns true ONLY for academies that have NOT
// yet been migrated to V2. Every legacy `credit_transactions` insert site is
// expected to early-return when this returns false.
//
// We also keep an in-process counter of skipped writes so the 5-min watchdog
// in pushNotifications.ts can report `skips_blocked=N` alongside the DB-level
// V1 write count. A clean V2 migration should converge to:
//   `[V1 writes] credit_transactions=0 (last 5m, V2 academies) | skips_blocked=N`
// where N grows steadily and the DB count stays at 0 for 48 consecutive hours.
// ---------------------------------------------------------------------------

let _v1SkipCount = 0;
let _v1PackageWriteSkipCount = 0;

/** Returns true if it's still legal to write to V1 `credit_transactions` for
 *  this academy. Safe-by-default: when academyId is unknown we ALLOW the
 *  write (the existing pre-V2 behavior) so we don't silently break code that
 *  hasn't yet been audited for academy-id propagation. */
export async function v1WritesAllowed(
  academyId: string | null | undefined,
): Promise<boolean> {
  if (!academyId) return true;
  const v2 = await isV2EnabledForAcademy(academyId);
  if (v2) {
    _v1SkipCount += 1;
    return false;
  }
  return true;
}

/** Read the running V1 transaction-skip counter and reset it. */
export function snapshotAndResetV1SkipCount(): number {
  const v = _v1SkipCount;
  _v1SkipCount = 0;
  return v;
}

/** Bumped whenever a gated V1 code path skips a paired
 *  `update(packages).set({ remainingCredits })` because the academy is on V2.
 *  Surfaced by the 5-min watchdog as `package_writes_blocked=N` so we can
 *  observe both halves of the V1 write pair (the credit_transactions INSERT
 *  and the packages.remaining_credits UPDATE) converging to zero together. */
export function noteV1PackageWriteSkip(): void {
  _v1PackageWriteSkipCount += 1;
}

export function snapshotAndResetV1PackageWriteSkipCount(): number {
  const v = _v1PackageWriteSkipCount;
  _v1PackageWriteSkipCount = 0;
  return v;
}
