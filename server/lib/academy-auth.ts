/**
 * Batch 2A — Canonical academy authority resolver
 *
 * Design principles (owner-confirmed):
 *  - Authority is NOT a simple numeric hierarchy.
 *    canManage* helpers use explicit named sets — never compare strings with >=/<= ordering.
 *  - Default is always "member" (default deny).
 *  - resolveAcademyAuthority reads three data sources in priority order and
 *    enforces that the actor's academyId matches the target academy before
 *    elevating from the users table (platform_owner exempt).
 */

import { db } from "../db";
import { coachAcademyMemberships } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// ── Seven canonical internal authority levels ──────────────────────────────
// Do NOT treat these as a numeric scale. Use the explicit permission sets below.
export type AcademyAuthority =
  | "platform_owner" // cross-academy superuser
  | "owner"          // academy_owner | owner | director | founder for THIS academy
  | "admin"          // admin for THIS academy
  | "supervisor"     // head_coach acting in explicit supervisor capacity
  | "coach"          // coach | freelance_partner
  | "assistant"      // assistant coach
  | "member";        // default: player | parent | service_provider | unknown

// ── Permission sets (explicit — never use numeric comparison) ──────────────

const SETTINGS_AUTHORITY = new Set<AcademyAuthority>(["admin", "owner", "platform_owner"]);
const MEMBERS_AUTHORITY  = new Set<AcademyAuthority>(["admin", "owner", "platform_owner"]);
const FINANCE_AUTHORITY  = new Set<AcademyAuthority>(["admin", "owner", "platform_owner"]);

// Session-plan management via authority alone (assigned-coach path is checked separately)
const SESSION_PLAN_AUTHORITY = new Set<AcademyAuthority>([
  "supervisor", "admin", "owner", "platform_owner",
]);

export function canManageSettings(authority: AcademyAuthority): boolean {
  return SETTINGS_AUTHORITY.has(authority);
}

export function canManageMembers(authority: AcademyAuthority): boolean {
  return MEMBERS_AUTHORITY.has(authority);
}

export function canManageFinances(authority: AcademyAuthority): boolean {
  return FINANCE_AUTHORITY.has(authority);
}

/**
 * Check whether an actor may manage a specific session plan.
 *
 * IMPORTANT: both IDs must reference coaches.id (NOT users.id).
 * Never pass req.user.userId as actorCoachId — use req.user.coachId.
 *
 * @param sessionCoachId  The coachId stored on the session row (coaches.id reference).
 * @param actorCoachId    The actor's coach profile ID (req.user.coachId — may be null).
 */
export function canManageSessionPlan(
  authority: AcademyAuthority,
  sessionCoachId: string | null | undefined,
  actorCoachId: string | null | undefined,
): boolean {
  // No assigned coach on the session → any authenticated academy member may manage
  if (!sessionCoachId) return true;
  // Assigned coach: compare coaches.id values (never mix with users.id)
  if (actorCoachId && sessionCoachId === actorCoachId) return true;
  return SESSION_PLAN_AUTHORITY.has(authority);
}

// ── Role-grant matrix ──────────────────────────────────────────────────────
// Defines which roles a caller of a given authority may assign via generic
// invite / member-mutation endpoints.
// platform_owner is NEVER grantable through generic endpoints — only a trusted
// out-of-band ownership flow may create platform owners.

const GRANT_MAP: Record<AcademyAuthority, readonly string[]> = {
  supervisor:     ["coach", "assistant"],
  admin:          ["coach", "assistant", "head_coach"],
  owner:          ["coach", "assistant", "head_coach", "admin"],
  platform_owner: ["coach", "assistant", "head_coach", "admin", "academy_owner"],
  coach:          [],
  assistant:      [],
  member:         [],
};

export function canGrantRole(callerAuthority: AcademyAuthority, targetRole: string): boolean {
  return (GRANT_MAP[callerAuthority] as string[]).includes(targetRole);
}

// ── Authority resolver ─────────────────────────────────────────────────────

export interface ActorUser {
  userId: string;
  role: string | null;
  academyId: string | null;
  coachId: string | null;
}

/**
 * Resolve the canonical academy authority for an actor within a specific academy.
 *
 * Priority order:
 *  1. users.role === "platform_owner"                → platform_owner (cross-academy)
 *  2. coach_academy_memberships (coachId + academyId, active)
 *  3. users.role + users.academyId match (exact — prevents cross-academy escalation)
 *  Default: "member"
 */
export async function resolveAcademyAuthority(
  actor: ActorUser,
  academyId: string,
): Promise<AcademyAuthority> {
  const role = actor.role ?? "";

  // 1. Platform-owner: cross-academy superuser — no academyId match required
  if (role === "platform_owner") return "platform_owner";

  // 2. Check coach_academy_memberships — most specific, per-academy role record
  if (actor.coachId) {
    const [membership] = await db
      .select({ role: coachAcademyMemberships.role })
      .from(coachAcademyMemberships)
      .where(
        and(
          eq(coachAcademyMemberships.coachId, actor.coachId),
          eq(coachAcademyMemberships.academyId, academyId),
          eq(coachAcademyMemberships.isActive, true),
        ),
      )
      .limit(1);

    if (membership) {
      const mr = membership.role ?? "coach";
      if (mr === "platform_owner") return "platform_owner";
      if (mr === "academy_owner")  return "owner";
      if (mr === "head_coach")     return "supervisor";
      if (mr === "assistant")      return "assistant";
      if (mr === "coach" || mr === "freelance_partner") return "coach";
      // Unrecognized membership role → default deny
      return "member";
    }
  }

  // 3. Fallback: users.role + users.academyId must match target academy.
  //    Mismatch means a cross-academy request → always "member" (default deny).
  if (actor.academyId !== academyId) return "member";

  if (role === "academy_owner" || role === "owner") return "owner";
  if (role === "admin")                              return "admin";
  if (role === "head_coach")                         return "supervisor";
  if (role === "assistant")                          return "assistant";
  if (role === "coach" || role === "freelance_partner") return "coach";

  // director / founder only appear on academy_owner_profiles (profile label),
  // not on users.role — they land here as "member" by design.
  return "member";
}
