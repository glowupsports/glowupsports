/**
 * server/services/credit-feature-flag.ts
 *
 * Task #682 — V1 credit system retired. Credit Engine V2 is the single source
 * of truth for every academy. The per-academy `use_new_credit_system` flag is
 * no longer consulted at runtime; this module returns hard-coded V2-only
 * answers.
 *
 * Task #685 Phase 4 — the per-process V1 skip counters and
 * `noteV1PackageWriteSkip` were removed alongside the V1 watchdog and most
 * gated V1 write sites (pushNotifications.ts, equipment-routes.ts, and the
 * routes/ files). `v1WritesAllowed` is preserved as a permanently-false stub
 * so the remaining storage.ts gates (which short-circuit legacy code paths
 * to a safe no-op) keep compiling until those bodies are deleted in a
 * follow-up. `isV2EnabledForAcademy` is also preserved for storage shims
 * and credits-v2.
 */

export async function isV2EnabledForAcademy(
  _academyId: string | null | undefined,
): Promise<boolean> {
  return true;
}

/**
 * Permanently-false stub. Every legacy gate that reads this value uses it as
 * "skip the V1 write path"; with V1 retired, that decision is now constant.
 */
export async function v1WritesAllowed(
  _academyId: string | null | undefined,
): Promise<boolean> {
  return false;
}

export function invalidateAcademyFlag(_academyId: string): void {
  // No-op: the flag is no longer consulted.
}

export function invalidateAllAcademyFlags(): void {
  // No-op.
}
