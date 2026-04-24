// Family G — Account Graduation helpers (Task #1138).
//
// A "graduated" account is a former family-child account whose owner has
// taken full ownership of their email + PIN + spend-limit edit rights. The
// graduation state is a single row in `account_graduation` keyed by player_id;
// once present, the account is independent (even though they may still appear
// in the family group for shared chat / shared billing UX).
//
// Family E (spend-limit ownership transition) MUST consult `isAccountGraduated`
// before letting another family member edit a graduate's spend limits — the
// graduate is the only one allowed to do so post-graduation.

import { db } from "../db";
import { accountGraduation, players } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * Calculate full years of age for a YYYY-MM-DD birthdate.
 * Returns null if the input is missing or unparseable.
 */
export function ageFromDateOfBirth(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Whole-day count between today (UTC) and the player's NEXT birthday
 * (whichever comes next, future-only). Returns null when the DOB is missing
 * or unparseable. Useful for the 30-days-to-18 banner / cron trigger.
 */
export function daysUntilNextBirthday(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let next = Date.UTC(now.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate());
  if (next < todayUtc) {
    next = Date.UTC(now.getUTCFullYear() + 1, birth.getUTCMonth(), birth.getUTCDate());
  }
  return Math.round((next - todayUtc) / (1000 * 60 * 60 * 24));
}

/**
 * Days until the player's 18th birthday (positive when in the future,
 * negative when already past, null when DOB unknown).
 */
export function daysUntilEighteen(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  const eighteenth = Date.UTC(birth.getUTCFullYear() + 18, birth.getUTCMonth(), birth.getUTCDate());
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((eighteenth - todayUtc) / (1000 * 60 * 60 * 24));
}

/**
 * Has this player completed graduation? Returns false when no DOB or no row.
 * Family E uses this to gate spend-limit edits.
 */
export async function isAccountGraduated(playerId: string): Promise<boolean> {
  if (!playerId) return false;
  const [row] = await db
    .select({ playerId: accountGraduation.playerId })
    .from(accountGraduation)
    .where(eq(accountGraduation.playerId, playerId))
    .limit(1);
  return !!row;
}

/**
 * Bulk variant — returns the set of graduated player IDs from the input.
 */
export async function graduatedPlayerIds(playerIds: string[]): Promise<Set<string>> {
  if (playerIds.length === 0) return new Set();
  const rows = await db
    .select({ playerId: accountGraduation.playerId })
    .from(accountGraduation)
    .where(inArray(accountGraduation.playerId, playerIds));
  return new Set(rows.map((r) => r.playerId));
}

/**
 * Returns the full graduation row for a player, or null.
 */
export async function getGraduationRow(playerId: string) {
  if (!playerId) return null;
  const [row] = await db
    .select()
    .from(accountGraduation)
    .where(eq(accountGraduation.playerId, playerId))
    .limit(1);
  return row ?? null;
}

/**
 * Convenience: load DOB + graduation flag for a player in a single round trip.
 * Used by the family-status surface to render the graduation banner.
 */
export async function getGraduationStatus(playerId: string): Promise<{
  dateOfBirth: string | null;
  daysUntilEighteen: number | null;
  graduated: boolean;
  graduatedAt: string | null;
}> {
  const [player] = await db
    .select({ dateOfBirth: players.dateOfBirth })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  const grad = await getGraduationRow(playerId);
  return {
    dateOfBirth: player?.dateOfBirth ?? null,
    daysUntilEighteen: daysUntilEighteen(player?.dateOfBirth),
    graduated: !!grad,
    graduatedAt: grad?.graduatedAt ? grad.graduatedAt.toISOString() : null,
  };
}
