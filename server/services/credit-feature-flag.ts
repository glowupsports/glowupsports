/**
 * server/services/credit-feature-flag.ts
 *
 * Task #682 — V1 credit system retired. Credit Engine V2 is now the single
 * source of truth for every academy. The per-academy `use_new_credit_system`
 * flag is no longer consulted at runtime; this module returns hard-coded
 * V2-only answers so that:
 *
 *   - `isV2EnabledForAcademy(...)` always reports V2 enabled
 *   - `v1WritesAllowed(...)` always blocks V1 writes
 *
 * The legacy DB column and the platform-owner switch endpoint are kept around
 * for now (no harm in leaving the column populated), but flipping it has no
 * effect on behaviour.
 */

export async function isV2EnabledForAcademy(
  _academyId: string | null | undefined,
): Promise<boolean> {
  return true;
}

export function invalidateAcademyFlag(_academyId: string): void {
  // No-op: the flag is no longer consulted.
}

export function invalidateAllAcademyFlags(): void {
  // No-op.
}

let _v1SkipCount = 0;
let _v1PackageWriteSkipCount = 0;

export async function v1WritesAllowed(
  _academyId: string | null | undefined,
): Promise<boolean> {
  _v1SkipCount += 1;
  return false;
}

export function snapshotAndResetV1SkipCount(): number {
  const v = _v1SkipCount;
  _v1SkipCount = 0;
  return v;
}

export function noteV1PackageWriteSkip(): void {
  _v1PackageWriteSkipCount += 1;
}

export function snapshotAndResetV1PackageWriteSkipCount(): number {
  const v = _v1PackageWriteSkipCount;
  _v1PackageWriteSkipCount = 0;
  return v;
}
