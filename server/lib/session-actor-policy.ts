/**
 * Batch 2C — SessionActorPolicy
 *
 * Answers:
 *  1. Can this actor mutate this session? (academy match + coach identity or supervisor+)
 *  2. Can this actor write attendance for this player? (session auth + roster check)
 *  3. Can this actor mutate this availability row? (own row or supervisor+)
 *
 * Coach identity rule (per owner spec):
 *  Always resolve from req.user.coachId (references coaches.id).
 *  Never use req.user.userId as a substitute for coachId.
 *
 * Default deny.
 */

import { db } from "../db";
import { sessions, sessionPlayers } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import {
  resolveAcademyAuthority,
  type ActorUser,
  type AcademyAuthority,
} from "./academy-auth";

// ── Types ─────────────────────────────────────────────────────────────────

export interface SessionActor {
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

// Authority levels that can manage sessions belonging to other coaches
const SESSION_MANAGE_AUTHORITY = new Set<AcademyAuthority>([
  "supervisor",
  "admin",
  "owner",
  "platform_owner",
]);

// ── Session mutation ───────────────────────────────────────────────────────

/**
 * Verify the actor may mutate a session (edit, cancel, player-add/remove, etc.)
 *
 * Rules:
 *  - session.academyId must match actor.academyId (tenant isolation)
 *  - actor.coachId must equal session.coachId (own session)
 *    OR actor must have supervisor/admin/owner/platform_owner authority
 */
export async function canMutateSession(
  actor: SessionActor,
  sessionId: string,
): Promise<PolicyResult> {
  if (!actor.academyId) {
    return { allowed: false, reason: "Actor has no academy context" };
  }

  const [session] = await db
    .select({ academyId: sessions.academyId, coachId: sessions.coachId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) return { allowed: false, reason: "Session not found" };

  if (session.academyId !== actor.academyId) {
    return { allowed: false, reason: "Session belongs to a different academy" };
  }

  // Own session — actor's coach identity must come from req.user.coachId
  if (actor.coachId && session.coachId && actor.coachId === session.coachId) {
    return { allowed: true };
  }

  // Elevated authority path
  const authority = await resolveAcademyAuthority(
    actor as ActorUser,
    actor.academyId,
  );
  if (SESSION_MANAGE_AUTHORITY.has(authority)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "Insufficient authority to mutate this session",
  };
}

// ── Attendance write ───────────────────────────────────────────────────────

/**
 * Verify the actor may write attendance for targetPlayerId in sessionId.
 *
 * Rules (per spec):
 *  - Actor must be authorised to mutate the session (canMutateSession).
 *  - Target player must ALREADY be in sessionPlayers (rostered).
 *    If not rostered, reject — do not silently insert.
 */
export async function canWriteAttendance(
  actor: SessionActor,
  sessionId: string,
  targetPlayerId: string,
): Promise<PolicyResult> {
  const sessionAuth = await canMutateSession(actor, sessionId);
  if (!sessionAuth.allowed) return sessionAuth;

  const [roster] = await db
    .select({ id: sessionPlayers.id })
    .from(sessionPlayers)
    .where(
      and(
        eq(sessionPlayers.sessionId, sessionId),
        eq(sessionPlayers.playerId, targetPlayerId),
      ),
    )
    .limit(1);

  if (!roster) {
    return {
      allowed: false,
      reason:
        "Player is not rostered to this session — attendance cannot be written",
    };
  }

  return { allowed: true };
}

// ── Availability mutation ─────────────────────────────────────────────────

/**
 * Verify the actor may mutate an availability row (coachAvailability,
 * availabilityExceptions, coachTimeBlocks).
 *
 * Rules:
 *  - actor.coachId must equal the row's owning coachId (self-edit)
 *    OR actor must have supervisor/admin/owner authority in their academy.
 *
 * IMPORTANT: actor.coachId must come from req.user.coachId — never from
 * the request body or params.
 */
export async function canMutateAvailability(
  actor: SessionActor,
  availabilityCoachId: string | null | undefined,
): Promise<PolicyResult> {
  if (!availabilityCoachId) {
    return { allowed: false, reason: "Availability row has no owning coach" };
  }

  // Self-edit: coachId must reference coaches.id (from req.user.coachId)
  if (actor.coachId && actor.coachId === availabilityCoachId) {
    return { allowed: true };
  }

  if (!actor.academyId) {
    return { allowed: false, reason: "No academy context for authority check" };
  }

  const authority = await resolveAcademyAuthority(
    actor as ActorUser,
    actor.academyId,
  );
  if (SESSION_MANAGE_AUTHORITY.has(authority)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      "Cannot modify another coach's availability without supervisor/admin authority",
  };
}
