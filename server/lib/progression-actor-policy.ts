/**
 * Batch 2C — ProgressionActorPolicy
 *
 * Answers:
 *  1. Can this actor award XP for a target player?
 *  2. Can this actor mutate global progression config (thresholds, XP rules, feature unlocks)?
 *  3. Can this actor review/approve skill evidence?
 *  4. Can this actor start or complete a progression trial for a target player?
 *
 * Key policies (per owner spec):
 *  - Global progression/config endpoints default to platform_owner ONLY.
 *    Do not grant academy admin/owner unless proven academy-scoped.
 *  - Players may submit their own evidence (self-service submit is OK).
 *  - Players must NEVER be able to award XP, approve evidence, or
 *    start/complete their own trial.
 *  - Actor role is always derived from the session, never from request payload.
 *
 * Default deny.
 */

import { resolveAcademyAuthority, type ActorUser, type AcademyAuthority } from "./academy-auth";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ProgressionActor {
  userId: string;
  coachId?: string | null;
  playerId?: string | null;
  academyId?: string | null;
  role?: string | null;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
}

// Roles that may award XP or manage progression state for other players
const XP_AWARD_AUTHORITY = new Set<AcademyAuthority>([
  "supervisor",
  "admin",
  "owner",
  "platform_owner",
  "coach",         // coaches may award XP for their own sessions
  "assistant",     // assistants may award XP
]);

// Roles that may review/approve evidence
const EVIDENCE_REVIEW_AUTHORITY = new Set<AcademyAuthority>([
  "supervisor",
  "admin",
  "owner",
  "platform_owner",
  "coach",
]);

// Roles that may start/complete a trial (coach-side authority)
const TRIAL_AUTHORITY = new Set<AcademyAuthority>([
  "supervisor",
  "admin",
  "owner",
  "platform_owner",
  "coach",
]);

// ── XP award ─────────────────────────────────────────────────────────────

/**
 * Verify the actor may award XP to targetPlayerId.
 *
 * Rules:
 *  - Actor must have coach/assistant/supervisor+ authority — NOT a plain player.
 *  - Actor (if a player) must not be the target player (no self-award via API).
 *  - Academy context is required for the authority resolution.
 */
export async function canAwardXp(
  actor: ProgressionActor,
  targetPlayerId: string,
): Promise<PolicyResult> {
  // Explicit allow-list: resolve authority and check against the allowed set.
  // Do NOT short-circuit with an implicit player-deny — any role not in
  // XP_AWARD_AUTHORITY (including future roles) is rejected by the check below.
  if (!actor.academyId) {
    return { allowed: false, reason: "Academy context required for XP award" };
  }

  const authority = await resolveAcademyAuthority(
    actor as ActorUser,
    actor.academyId,
  );

  if (!XP_AWARD_AUTHORITY.has(authority)) {
    return {
      allowed: false,
      reason: `Authority "${authority}" is not permitted to award XP`,
    };
  }

  // Self-award guard: an actor who also holds a player identity cannot award XP to themselves
  // (prevents dual-role actors — e.g. a coach who is also a player — from self-awarding).
  if (actor.playerId && actor.playerId === targetPlayerId) {
    return {
      allowed: false,
      reason: "An actor cannot award XP to themselves through the management endpoint",
    };
  }

  return { allowed: true };
}

// ── Progression config (platform_owner only) ──────────────────────────────

/**
 * Verify the actor may mutate GLOBAL progression configuration:
 * level thresholds, XP rules, feature unlocks.
 *
 * Per spec: these default to platform_owner ONLY.
 * Academy admin/owner is NOT granted access unless a specific endpoint
 * is explicitly proven to be academy-scoped.
 */
export function canMutateProgressionConfig(actor: ProgressionActor): PolicyResult {
  if (actor.role === "platform_owner") {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: "Global progression config may only be mutated by platform_owner",
  };
}

// ── Evidence review ───────────────────────────────────────────────────────

/**
 * Verify the actor may review or approve skill evidence.
 *
 * Rules:
 *  - Actor must have a coach identity (coachId is set).
 *  - Actor's resolved authority must be coach/supervisor+ in their academy.
 *  - A player may not review their own (or anyone's) evidence through this path.
 */
export async function canReviewEvidence(
  actor: ProgressionActor,
): Promise<PolicyResult> {
  // Must have a coach identity — player-only accounts may not review
  if (!actor.coachId) {
    return {
      allowed: false,
      reason: "Evidence review requires a coach identity",
    };
  }

  if (!actor.academyId) {
    return { allowed: false, reason: "Academy context required for evidence review" };
  }

  const authority = await resolveAcademyAuthority(
    actor as ActorUser,
    actor.academyId,
  );

  if (!EVIDENCE_REVIEW_AUTHORITY.has(authority)) {
    return {
      allowed: false,
      reason: `Authority "${authority}" is not permitted to review evidence`,
    };
  }

  return { allowed: true };
}

// ── Trial start / complete ────────────────────────────────────────────────

/**
 * Verify the actor may start or complete a progression trial for targetPlayerId.
 *
 * Rules:
 *  - Actor must have coach/supervisor+ authority.
 *  - Actor must NOT be the target player (no self-approval).
 *    Compare actor.playerId vs targetPlayerId — both reference players.id.
 */
export async function canManageTrial(
  actor: ProgressionActor,
  targetPlayerId: string,
): Promise<PolicyResult> {
  // Player cannot manage their own trial
  if (actor.playerId && actor.playerId === targetPlayerId) {
    return {
      allowed: false,
      reason: "A player cannot start or complete their own progression trial",
    };
  }

  // Must have a coach identity to manage trials
  if (!actor.coachId) {
    return {
      allowed: false,
      reason: "Trial management requires a coach identity",
    };
  }

  if (!actor.academyId) {
    return { allowed: false, reason: "Academy context required for trial management" };
  }

  const authority = await resolveAcademyAuthority(
    actor as ActorUser,
    actor.academyId,
  );

  if (!TRIAL_AUTHORITY.has(authority)) {
    return {
      allowed: false,
      reason: `Authority "${authority}" is not permitted to manage progression trials`,
    };
  }

  return { allowed: true };
}
