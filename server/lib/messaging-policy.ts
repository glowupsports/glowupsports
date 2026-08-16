/**
 * Batch 2B — MessagingPolicy
 *
 * Answers only:
 *  1. Can this actor access/send to this conversation? (participant check)
 *  2. Can these two users DM? (block + minor-safety, both directions)
 *  3. Does a block prohibit this interaction?
 *  4. Do child-safety/parental controls prohibit this interaction?
 *
 * Scoping rules (per owner spec):
 *  - Academy scope is enforced ONLY where the conversation IS academy-scoped
 *    (conversations.academyId is not null).
 *  - World/global/community rooms remain cross-academy; they still enforce
 *    authenticated identity, blocks, minor safety, and mute/ban.
 *  - A block prevents direct messaging/contact.  It does NOT automatically
 *    remove both users from a shared public room unless that is already the
 *    product rule.
 *
 * Default deny.
 */

import { db } from "../db";
import {
  conversationParticipants,
  conversations,
  playerBlocks,
  players,
} from "@shared/schema";
import { eq, and, or } from "drizzle-orm";
import {
  isMinor,
  isMinorByAge,
  getPlayerParentalControls,
} from "../childSafety";

// ── Types ─────────────────────────────────────────────────────────────────

export interface MessagingActor {
  userId: string;
  coachId?: string | null;
  playerId?: string | null;
  academyId?: string | null;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
}

// ── Block check ───────────────────────────────────────────────────────────

/**
 * Returns true if userIdA has blocked userIdB OR userIdB has blocked userIdA.
 * Uses users.id (not players.id / coaches.id).
 */
export async function isBlockedByEither(
  userIdA: string,
  userIdB: string,
): Promise<boolean> {
  if (!userIdA || !userIdB || userIdA === userIdB) return false;
  const row = await db
    .select({ id: playerBlocks.id })
    .from(playerBlocks)
    .where(
      or(
        and(
          eq(playerBlocks.blockerUserId, userIdA),
          eq(playerBlocks.blockedUserId, userIdB),
        ),
        and(
          eq(playerBlocks.blockerUserId, userIdB),
          eq(playerBlocks.blockedUserId, userIdA),
        ),
      ),
    )
    .limit(1);
  return row.length > 0;
}

// ── Minor-safety check ────────────────────────────────────────────────────

/**
 * Check minor/child safety for a DM or private send.
 * Checks BOTH sender and recipient — missing DOB is treated as minor (default deny).
 * Returns allowed=true only if both parties permit this interaction.
 *
 * Note: this is for private/DM interactions only.  World/community rooms use
 * a lighter variant that only enforces per-player mutes and bans.
 */
export async function checkMinorSafetyForDM(
  senderPlayerId: string | null | undefined,
  recipientPlayerId: string | null | undefined,
): Promise<PolicyResult> {
  // If neither side is a player, no minor check needed (coach↔coach DM)
  if (!senderPlayerId && !recipientPlayerId) return { allowed: true };

  if (senderPlayerId) {
    const sender = await db.query.players.findFirst({
      where: eq(players.id, senderPlayerId),
      columns: { dateOfBirth: true, age: true },
    });
    // Missing DOB → treat as minor for safety
    const senderIsMinor =
      sender === undefined ||
      isMinor(sender?.dateOfBirth) ||
      isMinorByAge(sender?.age);

    if (senderIsMinor) {
      const controls = await getPlayerParentalControls(senderPlayerId);
      if (!controls.chatEnabled) {
        return { allowed: false, reason: "Sender minor restrictions prevent messaging" };
      }
    }
  }

  if (recipientPlayerId) {
    const recipient = await db.query.players.findFirst({
      where: eq(players.id, recipientPlayerId),
      columns: { dateOfBirth: true, age: true },
    });
    const recipientIsMinor =
      recipient === undefined ||
      isMinor(recipient?.dateOfBirth) ||
      isMinorByAge(recipient?.age);

    if (recipientIsMinor) {
      const controls = await getPlayerParentalControls(recipientPlayerId);
      if (!controls.chatEnabled) {
        return { allowed: false, reason: "Recipient minor restrictions prevent messaging" };
      }
    }
  }

  return { allowed: true };
}

// ── Conversation participant check ─────────────────────────────────────────

/**
 * Returns true if the actor is an active participant of the given conversation.
 * Uses conversationParticipants which is the source of truth for membership.
 */
export async function isConversationParticipant(
  actor: MessagingActor,
  conversationId: string,
): Promise<boolean> {
  // Build OR conditions for coach or player identity
  const conditions: ReturnType<typeof eq>[] = [
    eq(conversationParticipants.conversationId, conversationId),
  ];

  if (!actor.coachId && !actor.playerId) return false;

  // Check via coachId
  if (actor.coachId) {
    const row = await db
      .select({ id: conversationParticipants.id })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.coachId, actor.coachId),
        ),
      )
      .limit(1);
    if (row.length > 0) return true;
  }

  // Check via playerId
  if (actor.playerId) {
    const row = await db
      .select({ id: conversationParticipants.id })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.playerId, actor.playerId),
        ),
      )
      .limit(1);
    if (row.length > 0) return true;
  }

  return false;
}

/**
 * Verify actor can access a conversation.
 * For academy-scoped conversations: actor must be a participant AND same academy.
 * For cross-academy/global conversations (academyId is null): participant check only.
 * Default deny.
 */
export async function canAccessConversation(
  actor: MessagingActor,
  conversationId: string,
): Promise<PolicyResult> {
  const [conv] = await db
    .select({ academyId: conversations.academyId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv) return { allowed: false, reason: "Conversation not found" };

  // Academy-scoped: actor must belong to the same academy
  if (conv.academyId && actor.academyId && conv.academyId !== actor.academyId) {
    return { allowed: false, reason: "Cross-academy conversation access denied" };
  }

  const isParticipant = await isConversationParticipant(actor, conversationId);
  if (!isParticipant) {
    return { allowed: false, reason: "Not a participant of this conversation" };
  }

  return { allowed: true };
}

/**
 * Verify actor can send to a conversation.
 * Adds block + minor-safety check on top of canAccessConversation.
 * For direct DMs only (coach_player or player_player type), pass senderPlayerId and recipientPlayerId.
 */
export async function canSendToConversation(
  actor: MessagingActor,
  conversationId: string,
  opts?: {
    senderPlayerId?: string | null;
    recipientPlayerId?: string | null;
    recipientUserId?: string | null;
  },
): Promise<PolicyResult> {
  const access = await canAccessConversation(actor, conversationId);
  if (!access.allowed) return access;

  // Block check (user IDs)
  if (opts?.recipientUserId) {
    const blocked = await isBlockedByEither(actor.userId, opts.recipientUserId);
    if (blocked) {
      return { allowed: false, reason: "A block prevents this interaction" };
    }
  }

  // Minor safety for DMs
  if (opts?.senderPlayerId || opts?.recipientPlayerId) {
    const safety = await checkMinorSafetyForDM(
      opts.senderPlayerId,
      opts.recipientPlayerId,
    );
    if (!safety.allowed) return safety;
  }

  return { allowed: true };
}

/**
 * Verify a direct message between two users can be initiated.
 * Checks blocks in both directions + minor safety for both parties.
 * Used for DM creation / first-message paths.
 */
export async function canInitiateDM(
  actor: MessagingActor,
  targetUserId: string,
  opts?: {
    actorPlayerId?: string | null;
    targetPlayerId?: string | null;
  },
): Promise<PolicyResult> {
  const blocked = await isBlockedByEither(actor.userId, targetUserId);
  if (blocked) {
    return { allowed: false, reason: "A block prevents this interaction" };
  }

  if (opts?.actorPlayerId || opts?.targetPlayerId) {
    return checkMinorSafetyForDM(opts.actorPlayerId, opts.targetPlayerId);
  }

  return { allowed: true };
}
