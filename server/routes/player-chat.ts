import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  type AuthenticatedRequest,
  JWTPayload,
} from "../auth";
import { filterProfanity } from "../profanityFilter";
import { isPlayerMinor, getPlayerParentalControls } from "../childSafety";
import { chatRateLimiter } from "../rateLimiter";
import { getCoachPushTokens, sendPushNotification, getPlayerPushTokens } from "../pushNotifications";
import { db } from "../db";
import { serviceProviders, users, shopOrders, conversations, conversationParticipants, messageReactions, messages, playerBlocks, groupMembers, communityGroups, seriesPlayers, coachingSeries, sessions, userQuickReplies } from "../../shared/schema";
import { broadcastProviderPlayerMessage, broadcastNewMessage, broadcastToUserIds, broadcastNewConversation, broadcastMessageDeleted, broadcastReactionUpdated, getPlayerPresence } from "../websocket";
import { eq, and, inArray, or, gt, asc, type SQL } from "drizzle-orm";

const router = Router();

// Throttle cache for group chat push notifications (1 per 5 min per conversation)
const groupChatPushCache = new Map<string, number>();

interface AuthRequest extends Request {
  user?: JWTPayload;
}

function requirePlayerOrOwner(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!(req as any).user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const user = (req as any).user;
  if (user.role === "platform_owner" || user.role === "academy_owner" || user.role === "owner" || user.role === "admin") {
    next();
    return;
  }
  if (user.role === "coach" && user.coachId) {
    next();
    return;
  }
  if (user.role === "player") {
    next();
    return;
  }
  res.status(403).json({ error: "Player account required" });
}

// ==================== PLAYER CHAT API ENDPOINTS ====================
// These endpoints use requirePlayerOrOwner instead of requireAcademy
// to allow players without academy membership to chat

// Get conversations for the current player
router.get("/api/player/me/conversations", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.playerId) {
      return res.json({ friends: [], pendingRequests: [] });
    }
    const playerId = req.user!.playerId!;
    const player = await storage.getPlayer(playerId);
    if (!player) {
      return res.json({ friends: [], pendingRequests: [] });
    }

    const academyId = player.academyId;
    if (!academyId) {
      return res.json({ friends: [], pendingRequests: [] });
    }

    const conversationsRaw = await storage.getConversationsForPlayer(playerId, academyId);

    // Get the current user's userId to check against playerBlocks
    const currentUserId = req.user!.userId;

    // Pre-fetch player's active series enrollments + community group memberships so we can
    // filter ghost group conversations (lessons/groups the player is no longer in).
    const activeSeriesRows = await db.select({ seriesId: seriesPlayers.seriesId })
      .from(seriesPlayers)
      .where(and(eq(seriesPlayers.playerId, playerId), eq(seriesPlayers.status, "active")));
    const activeSeriesIds = new Set(activeSeriesRows.map(r => r.seriesId));

    const groupMemberRows = currentUserId
      ? await db.select({ groupId: groupMembers.groupId })
          .from(groupMembers)
          .where(eq(groupMembers.userId, currentUserId))
      : [];
    const memberGroupIds = new Set(groupMemberRows.map(r => r.groupId));

    // Pre-fetch series details (title + schedule) for all referenced series_group/squad/lesson_group conversations
    const seriesGroupTitles = conversationsRaw
      .filter(c => (c.type === "series_group" || c.type === "squad" || c.type === "lesson_group") && c.title)
      .map(c => c.title!) as string[];
    const seriesById = new Map<string, { title: string; dayOfWeek: number; startTime: string; duration: number | null }>();
    if (seriesGroupTitles.length > 0) {
      const seriesRows = await db.select({
        id: coachingSeries.id,
        title: coachingSeries.title,
        dayOfWeek: coachingSeries.dayOfWeek,
        startTime: coachingSeries.startTime,
        duration: coachingSeries.duration,
      }).from(coachingSeries).where(inArray(coachingSeries.id, seriesGroupTitles));
      for (const s of seriesRows) {
        seriesById.set(s.id, { title: s.title, dayOfWeek: s.dayOfWeek, startTime: s.startTime, duration: s.duration ?? null });
      }
    }

    // Filter out group-type conversations the player isn't actually a member of.
    // Defensive: only apply ID-based filtering when `title` looks like a UUID. Legacy chats
    // whose title is a display string are kept (they fall back to the participant-based
    // membership check that storage.getConversationsForPlayer already enforces).
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const conversations = conversationsRaw.filter(conv => {
      if (conv.type === "series_group" || conv.type === "squad" || conv.type === "lesson_group") {
        if (!conv.title || !UUID_RE.test(conv.title)) return true;
        return activeSeriesIds.has(conv.title);
      }
      if (conv.type === "group") {
        if (!conv.title || !UUID_RE.test(conv.title)) return true;
        return memberGroupIds.has(conv.title);
      }
      return true;
    });

    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        let coachName: string | null = null;
        let coachPhoto: string | null = null;
        let playerName: string | null = null;
        let playerPhoto: string | null = null;
        let providerName: string | null = null;
        let providerPhoto: string | null = null;
        let seriesDayOfWeek: number | null = null;
        let seriesStartTime: string | null = null;
        if (conv.coachId) {
          const coach = await storage.getCoach(conv.coachId, academyId);
          coachName = coach?.name ?? null;
          coachPhoto = coach?.profilePhotoUrl ?? null;
        }
        let otherPlayerId: string | null = null;
        let otherPlayerUserId: string | null = null;
        let isBlockedByMe = false;
        if (conv.type === "player_player") {
          const participants = await storage.getConversationParticipants(conv.id, undefined, academyId);
          const other = participants.find(p => p.playerId && p.playerId !== playerId);
          if (other?.playerId) {
            const otherPlayer = await storage.getPlayer(other.playerId, academyId);
            playerName = otherPlayer?.name ?? null;
            playerPhoto = otherPlayer?.profilePhotoUrl ?? null;
            otherPlayerId = other.playerId;
            // Get userId for block functionality
            const [otherUser] = await db.select({ id: users.id }).from(users).where(eq(users.playerId, other.playerId)).limit(1);
            otherPlayerUserId = otherUser?.id ?? null;
            // Check if this player is blocked by the current user
            if (currentUserId && otherPlayerUserId) {
              const [block] = await db.select({ id: playerBlocks.id }).from(playerBlocks).where(
                and(
                  eq(playerBlocks.blockerUserId, currentUserId),
                  eq(playerBlocks.blockedUserId, otherPlayerUserId),
                )
              ).limit(1);
              isBlockedByMe = !!block;
            }
          }
        }
        if (conv.type === "provider_player" && conv.providerId) {
          const [prov] = await db.select({
            displayName: serviceProviders.displayName,
            profilePhotoUrl: serviceProviders.profilePhotoUrl,
          }).from(serviceProviders).where(eq(serviceProviders.id, conv.providerId)).limit(1);
          providerName = prov?.displayName ?? null;
          providerPhoto = prov?.profilePhotoUrl ?? null;
        }
        let resolvedTitle = conv.title;
        if (conv.type === "group" && conv.title) {
          const [group] = await db.select({ name: communityGroups.name }).from(communityGroups).where(eq(communityGroups.id, conv.title)).limit(1);
          if (group?.name) {
            resolvedTitle = group.name;
          }
        }
        if ((conv.type === "series_group" || conv.type === "squad" || conv.type === "lesson_group") && conv.title) {
          const series = seriesById.get(conv.title);
          if (series) {
            resolvedTitle = series.title;
            seriesDayOfWeek = series.dayOfWeek;
            seriesStartTime = series.startTime;
          }
        }
        return { ...conv, title: resolvedTitle, coachName, coachPhoto, playerName, playerPhoto, providerName, providerPhoto, otherPlayerId, otherPlayerUserId, isBlockedByMe, seriesDayOfWeek, seriesStartTime };
      })
    );

    // Filter out conversations where the other player is blocked
    const visible = enriched.filter(conv => !conv.isBlockedByMe);

    res.json(visible);
  } catch (error) {
    console.error("Error fetching player conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Delete (archive) a conversation for the current player
router.delete("/api/player/me/conversations/:id", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }
    const playerId = req.user!.playerId!;
    const { id: conversationId } = req.params;

    const participant = await db.select()
      .from(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.playerId, playerId),
        eq(conversationParticipants.participantType, "player"),
      ))
      .limit(1);

    if (participant.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db.update(conversations)
      .set({ isArchived: true })
      .where(eq(conversations.id, conversationId));

    res.json({ success: true });
  } catch (error) {
    console.error("Error archiving conversation:", error);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

// Get unread count for the current player
router.get("/api/player/me/unread-count", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.playerId) {
      return res.json({ unreadCount: 0 });
    }
    const playerId = req.user!.playerId!;
    const player = await storage.getPlayer(playerId);
    if (!player || !player.academyId) {
      return res.json({ unreadCount: 0 });
    }

    const unreadCount = await storage.getPlayerUnreadCount(playerId, player.academyId);
    res.json({ unreadCount });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

// Create a conversation for the current player
router.post("/api/player/me/conversations", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }
    const playerId = req.user!.playerId!;
    const player = await storage.getPlayer(playerId);
    if (!player) {
      return res.status(403).json({ error: "Player profile not found" });
    }

    const { type, otherPlayerId, title, coachId, squadId, groupId } = req.body;

    if (!type) {
      return res.status(400).json({ error: "Conversation type required" });
    }

    // Group conversations don't require academy membership
    if (type !== "group" && !player.academyId) {
      return res.status(403).json({ error: "Academy membership required for chat" });
    }

    const academyId = player.academyId || null;

    if (type === "coach_player") {
      if (!coachId) {
        return res.status(400).json({ error: "coachId required for coach_player conversation" });
      }
      const conversation = await storage.getOrCreateCoachPlayerConversation(coachId, playerId, academyId);
      return res.json(conversation);
    }

    if (type === "squad") {
      if (!squadId) {
        return res.status(400).json({ error: "squadId required for squad conversation" });
      }
      const existing = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.type, "squad"),
            eq(conversations.title, squadId),
            eq(conversations.academyId, academyId)
          )
        );
      if (existing.length > 0) {
        const conv = existing[0];
        const alreadyParticipant = await db
          .select()
          .from(conversationParticipants)
          .where(
            and(
              eq(conversationParticipants.conversationId, conv.id),
              eq(conversationParticipants.playerId, playerId)
            )
          );
        if (alreadyParticipant.length === 0) {
          await db.insert(conversationParticipants).values({
            conversationId: conv.id,
            playerId,
            coachId: null,
            role: "member",
            participantType: "player",
            canPost: true,
            academyId,
          });
        }
        return res.json(conv);
      }
      const conv = await storage.createConversation({
        type: "squad",
        title: squadId,
        playerId: null,
        coachId: null,
        academyId,
      });
      await db.insert(conversationParticipants).values({
        conversationId: conv.id,
        playerId,
        coachId: null,
        role: "owner",
        participantType: "player",
        canPost: true,
        academyId,
      });
      return res.status(201).json(conv);
    }

    if (type === "group") {
      if (!groupId) {
        return res.status(400).json({ error: "groupId required for group conversation" });
      }
      // Verify user is a member of the group
      const [membership] = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, req.user!.userId!)));
      if (!membership) {
        return res.status(403).json({ error: "Not a member of this group" });
      }
      // Get or create a group conversation
      const [group] = await db.select().from(communityGroups).where(eq(communityGroups.id, groupId));
      const existing = await db.select().from(conversations)
        .where(and(eq(conversations.type, "group"), eq(conversations.title, groupId)));
      if (existing.length > 0) {
        const conv = existing[0];
        const alreadyParticipant = await db.select().from(conversationParticipants)
          .where(and(eq(conversationParticipants.conversationId, conv.id), eq(conversationParticipants.playerId, playerId)));
        if (alreadyParticipant.length === 0) {
          await db.insert(conversationParticipants).values({
            conversationId: conv.id, playerId, coachId: null, role: "member",
            participantType: "player", canPost: true, academyId,
          });
        }
        return res.json({ ...conv, title: group?.name ?? conv.title });
      }
      const conv = await storage.createConversation({
        type: "group", title: groupId, playerId: null, coachId: null, academyId,
      });
      // Add all current group members as participants
      const groupMemberRows = await db.select().from(groupMembers)
        .where(eq(groupMembers.groupId, groupId));
      for (const gm of groupMemberRows) {
        const [memberUser] = await db.select().from(users).where(eq(users.id, gm.userId));
        if (memberUser?.playerId) {
          await db.insert(conversationParticipants).values({
            conversationId: conv.id, playerId: memberUser.playerId, coachId: null,
            role: gm.role === "admin" ? "owner" : "member",
            participantType: "player", canPost: true, academyId,
          }).catch(() => {});
        }
      }
      return res.status(201).json({ ...conv, title: group?.name ?? conv.title });
    }

    if (type === "player_player") {
      const playerIsMinor = await isPlayerMinor(playerId);
      if (playerIsMinor) {
        const controls = await getPlayerParentalControls(playerId);
        if (!controls.chatEnabled) {
          return res.status(403).json({ 
            error: "Chat with other players requires parental approval. Ask a parent to enable chat in the Family Lobby.",
            code: "MINOR_CHAT_RESTRICTED"
          });
        }
      }
    }

    if (type === "player_player" && otherPlayerId) {
      const otherPlayer = await storage.getPlayer(otherPlayerId, academyId);
      if (!otherPlayer) {
        return res.status(404).json({ error: "Other player not found" });
      }
      const existing = await storage.getPlayerToPlayerConversation(playerId, otherPlayerId, academyId);
      if (existing) {
        return res.json(existing);
      }
      const conversation = await storage.createConversation({
        type: "player_player",
        playerId,
        coachId: null,
        title: null,
        academyId,
      });
      await storage.addConversationParticipant({
        conversationId: conversation.id,
        coachId: null,
        playerId,
        role: "owner",
        participantType: "player",
        canPost: true,
        academyId,
      });
      await storage.addConversationParticipant({
        conversationId: conversation.id,
        coachId: null,
        playerId: otherPlayerId,
        role: "member",
        participantType: "player",
        canPost: true,
        academyId,
      });
      // Notify both participants via WS so their conversation lists refresh instantly
      if (academyId) {
        const [creatorUser] = await db.select({ userId: users.id }).from(users).where(eq(users.playerId, playerId)).limit(1);
        const [otherUser] = await db.select({ userId: users.id }).from(users).where(eq(users.playerId, otherPlayerId)).limit(1);
        const participantUserIds = [creatorUser?.userId, otherUser?.userId].filter(Boolean) as string[];
        if (participantUserIds.length > 0) {
          broadcastNewConversation(academyId, participantUserIds, { conversationId: conversation.id, type: "player_player" });
        }
      }
      return res.status(201).json(conversation);
    }

    if (type === "academy") {
      const existing = await storage.getAcademyConversationForPlayer(playerId, academyId);
      if (existing) {
        return res.json(existing);
      }
      const coach = await storage.getFirstCoachForAcademy(academyId);
      const conversation = await storage.createConversation({
        type: "academy",
        playerId,
        coachId: coach?.id || null,
        title: title || "Academy Chat",
        academyId,
      });
      await storage.addConversationParticipant({
        conversationId: conversation.id,
        coachId: null,
        playerId,
        role: "owner",
        participantType: "player",
        canPost: true,
        academyId,
      });
      if (coach?.id) {
        await storage.addConversationParticipant({
          conversationId: conversation.id,
          coachId: coach.id,
          playerId: null,
          role: "member",
          participantType: "coach",
          canPost: true,
          academyId,
        });
      }
      return res.status(201).json(conversation);
    }

    return res.status(400).json({ error: "Invalid conversation type" });
  } catch (error) {
    console.error("Error creating player conversation:", error);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Get messages for a player conversation
router.get("/api/player/me/conversations/:id/messages", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.playerId) {
      return res.json([]);
    }
    const playerId = req.user!.playerId!;
    const player = await storage.getPlayer(playerId);
    if (!player) {
      return res.json([]);
    }

    const { id } = req.params;
    const academyId = player.academyId || null;
    const limit = parseInt(req.query.limit as string) || 50;

    const conversation = await storage.getConversationForPlayer(id, playerId, academyId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const messages = await storage.getMessagesForPlayer(id, playerId, academyId, limit);

    const enriched = await Promise.all(
      messages.map(async (msg) => {
        const reactions = await storage.getMessageReactionsForPlayer(msg.id, playerId, academyId);
        return { ...msg, reactions };
      })
    );

    res.json(enriched.reverse());
  } catch (error) {
    console.error("Error fetching player messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Send a message in a player conversation
router.post("/api/player/me/conversations/:id/messages", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }
    const playerId = req.user!.playerId!;
    const player = await storage.getPlayer(playerId);
    if (!player) {
      return res.status(403).json({ error: "Player profile not found" });
    }

    const { id } = req.params;
    const academyId = player.academyId || null;
    const { body, messageType } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ error: "Message body required" });
    }

    if (chatRateLimiter.isRateLimited(playerId)) {
      return res.status(429).json({ error: "You're sending messages too quickly. Please wait a moment." });
    }
    chatRateLimiter.recordRequest(playerId);

    const filteredBody = filterProfanity(body.trim());

    const conversation = await storage.getConversationForPlayer(id, playerId, academyId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const message = await storage.createMessage({
      conversationId: id,
      senderType: "player",
      senderCoachId: null,
      senderPlayerId: playerId,
      body: filteredBody,
      messageType: messageType || "text",
    });

    await storage.updateConversation(id, {
      lastMessageAt: new Date(),
      lastMessagePreview: filteredBody.substring(0, 100),
    });


    const participants = await storage.getConversationParticipants(id, undefined, academyId);

    // For provider_player conversations: scoped broadcast to avoid academy-wide content leak
    if (conversation.type === "provider_player" && conversation.providerId && academyId) {
      const participantUserIds: string[] = [req.user!.userId];
      const providerUser = await db.select({ userId: serviceProviders.userId })
        .from(serviceProviders).where(eq(serviceProviders.id, conversation.providerId)).limit(1);
      if (providerUser[0]?.userId) participantUserIds.push(providerUser[0].userId);
      broadcastProviderPlayerMessage(academyId, participantUserIds, {
        conversationId: id,
        message: {
          id: message.id,
          content: filteredBody,
          messageType: message.messageType ?? "text",
          senderType: "player",
          senderId: playerId,
          senderName: player.name || undefined,
          senderPhotoUrl: player.profilePhotoUrl || null,
          senderBallLevel: player.ballLevel || null,
          createdAt: message.createdAt?.toISOString() ?? new Date().toISOString(),
        },
      });
    }

    for (const participant of participants) {
      if (participant.coachId) {
        const tokens = await getCoachPushTokens(participant.coachId);
        if (tokens.length > 0) {
          sendPushNotification(
            tokens,
            `New message from ${player.name || "Player"}`,
            filteredBody.substring(0, 100),
            { screen: "Messages", conversationId: id }
          ).catch(err => console.error("[PushNotification] Failed to send coach message notification:", err));
        }
      }
    }

    // Broadcast new_message WS event so recipients get real-time updates
    const wsPayload = {
      conversationId: id,
      message: {
        id: message.id,
        content: filteredBody,
        messageType: message.messageType ?? "text",
        senderType: "player" as const,
        senderId: playerId,
        senderName: player.name || undefined,
        senderPhotoUrl: player.profilePhotoUrl || null,
        senderBallLevel: player.ballLevel || null,
        createdAt: message.createdAt?.toISOString() ?? new Date().toISOString(),
      },
    };
    if (academyId) {
      if (conversation.type === "academy") {
        // Academy-wide channel: broadcast to all academy members
        broadcastNewMessage(academyId, wsPayload);
      } else if (conversation.type !== "provider_player") {
        // Private conversations: participant-scoped broadcast to avoid content leaks
        const participantPlayerIds = participants.filter(p => p.playerId).map(p => p.playerId!);
        const participantCoachIds = participants.filter(p => p.coachId).map(p => p.coachId!);
        const conditions = [];
        if (participantPlayerIds.length > 0) conditions.push(inArray(users.playerId, participantPlayerIds));
        if (participantCoachIds.length > 0) conditions.push(inArray(users.coachId, participantCoachIds));
        if (conditions.length > 0) {
          const participantUsers = await db.select({ id: users.id }).from(users).where(or(...conditions));
          const userIds = [req.user!.userId, ...participantUsers.map(u => u.id)];
          broadcastToUserIds(academyId, userIds, { type: "new_message", payload: wsPayload });
        }
      }
    }

    // For group chats: send throttled push to other player participants
    if (conversation.type === "group") {
      const cacheKey = `group_chat_push:${id}`;
      const lastPushTime = groupChatPushCache.get(cacheKey) ?? 0;
      const now = Date.now();
      if (now - lastPushTime > 5 * 60 * 1000) {
        groupChatPushCache.set(cacheKey, now);
        const otherParticipants = participants.filter(p => p.playerId && p.playerId !== playerId);
        for (const p of otherParticipants) {
          if (p.playerId) {
            const tokens = await getPlayerPushTokens(p.playerId);
            if (tokens.length > 0) {
              sendPushNotification(
                tokens,
                `Group: ${player.name || "Someone"} sent a message`,
                filteredBody.substring(0, 100),
                { screen: "Messages", conversationId: id }
              ).catch(() => {});
            }
          }
        }
      }
    }

    res.status(201).json(message);
  } catch (error) {
    console.error("Error sending player message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Get participant read state for a conversation (server-backed seen indicators)
router.get("/api/player/me/conversations/:id/read-state", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.playerId) return res.json([]);
    const playerId = req.user!.playerId!;
    const player = await storage.getPlayer(playerId);
    if (!player) return res.json([]);
    const { id } = req.params;
    const academyId = player.academyId || null;
    const conversation = await storage.getConversationForPlayer(id, playerId, academyId);
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    const participants = await storage.getConversationParticipants(id, undefined, academyId as string);
    const readState = participants
      .filter(p => p.playerId && p.playerId !== playerId)
      .map(p => ({ playerId: p.playerId, lastReadAt: p.lastReadAt }));
    res.json(readState);
  } catch (error) {
    console.error("Error fetching read state:", error);
    res.status(500).json({ error: "Failed to fetch read state" });
  }
});

// Mark conversation as read for player
router.post("/api/player/me/conversations/:id/read", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }
    const playerId = req.user!.playerId!;
    const player = await storage.getPlayer(playerId);
    if (!player) {
      return res.status(403).json({ error: "Player profile not found" });
    }

    const { id } = req.params;
    const academyId = player.academyId || null;

    const conversation = await storage.getConversationForPlayer(id, playerId, academyId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    await storage.markConversationRead(id, playerId, "player");
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking conversation read:", error);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// Add reaction to a message (player)
router.post("/api/player/me/messages/:messageId/reactions", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }
    const playerId = req.user!.playerId!;
    const player = await storage.getPlayer(playerId);
    if (!player || !player.academyId) {
      return res.status(403).json({ error: "Academy membership required" });
    }

    const { messageId } = req.params;
    const { emoji } = req.body;
    const academyId = player.academyId;

    if (!emoji) {
      return res.status(400).json({ error: "Emoji required" });
    }

    const message = await storage.getMessage(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const conversation = await storage.getConversationForPlayer(message.conversationId, playerId, academyId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const reaction = await storage.addMessageReaction({
      messageId,
      reactorType: "player",
      reactorCoachId: null,
      reactorPlayerId: playerId,
      emoji,
    });

    await broadcastReactionToParticipants(message.conversationId, messageId, academyId);

    res.status(201).json(reaction);
  } catch (error) {
    console.error("Error adding reaction:", error);
    res.status(500).json({ error: "Failed to add reaction" });
  }
});

// Remove reaction from a message (player)
router.delete("/api/player/me/messages/:messageId/reactions", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }
    const playerId = req.user!.playerId!;
    const player = await storage.getPlayer(playerId);
    if (!player || !player.academyId) {
      return res.status(403).json({ error: "Academy membership required" });
    }

    const { messageId } = req.params;
    const { emoji } = req.body;
    const academyId = player.academyId;

    if (!emoji) {
      return res.status(400).json({ error: "Emoji required" });
    }

    const message = await storage.getMessage(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const conversation = await storage.getConversationForPlayer(message.conversationId, playerId, academyId);
    if (!conversation) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db.delete(messageReactions).where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.emoji, emoji),
        eq(messageReactions.reactorPlayerId, playerId),
      )
    );

    await broadcastReactionToParticipants(message.conversationId, messageId, academyId);

    res.json({ success: true });
  } catch (error) {
    console.error("Error removing reaction:", error);
    res.status(500).json({ error: "Failed to remove reaction" });
  }
});

// GET /api/player/me/lesson-group-chats — auto-create series_group conversations for all active series
router.get("/api/player/me/lesson-group-chats", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.playerId) return res.json([]);
    const playerId = req.user!.playerId!;
    const player = await storage.getPlayer(playerId);
    if (!player || !player.academyId) return res.json([]);
    const academyId = player.academyId;

    // Find all series this player is actively enrolled in
    const activeMemberships = await db.select({
      seriesId: seriesPlayers.seriesId,
    }).from(seriesPlayers).where(
      and(
        eq(seriesPlayers.playerId, playerId),
        eq(seriesPlayers.status, "active"),
      )
    );

    if (activeMemberships.length === 0) return res.json([]);

    const seriesIds = activeMemberships.map(m => m.seriesId);

    // Get series details
    const seriesData = await db.select({
      id: coachingSeries.id,
      title: coachingSeries.title,
      coachId: coachingSeries.coachId,
    }).from(coachingSeries).where(
      and(
        inArray(coachingSeries.id, seriesIds),
        eq(coachingSeries.academyId, academyId),
      )
    );

    const result = [];

    for (const series of seriesData) {
      // Find or create conversation for this series
      const [existing] = await db.select().from(conversations).where(
        and(
          eq(conversations.type, "series_group"),
          eq(conversations.title, series.id),
          eq(conversations.academyId, academyId),
        )
      ).limit(1);

      let conv = existing;
      if (!conv) {
        const [created] = await db.insert(conversations).values({
          type: "series_group",
          title: series.id,
          academyId,
          coachId: series.coachId || null,
          playerId: null,
        }).returning();
        conv = created;
      }

      // Get all active members of this series
      const allActiveMembers = await db.select({ playerId: seriesPlayers.playerId })
        .from(seriesPlayers).where(
          and(
            eq(seriesPlayers.seriesId, series.id),
            eq(seriesPlayers.status, "active"),
          )
        );

      // Auto-add any missing participants
      for (const member of allActiveMembers) {
        const [existing] = await db.select().from(conversationParticipants).where(
          and(
            eq(conversationParticipants.conversationId, conv.id),
            eq(conversationParticipants.playerId, member.playerId),
          )
        ).limit(1);
        if (!existing) {
          await db.insert(conversationParticipants).values({
            conversationId: conv.id,
            playerId: member.playerId,
            coachId: null,
            role: "member",
            participantType: "player",
            canPost: true,
            academyId,
          }).catch(() => {});
        }
      }

      // Auto-add coach if not already a participant
      if (series.coachId) {
        const [coachParticipant] = await db.select().from(conversationParticipants).where(
          and(
            eq(conversationParticipants.conversationId, conv.id),
            eq(conversationParticipants.coachId, series.coachId),
          )
        ).limit(1);
        if (!coachParticipant) {
          await db.insert(conversationParticipants).values({
            conversationId: conv.id,
            coachId: series.coachId,
            playerId: null,
            role: "owner",
            participantType: "coach",
            canPost: true,
            academyId,
          }).catch(() => {});
        }
      }

      // Fetch next upcoming session for this series (for Squad countdown banner)
      const now = new Date();
      const [nextSession] = await db.select({
        id: sessions.id,
        startTime: sessions.startTime,
        endTime: sessions.endTime,
        title: sessions.title,
      }).from(sessions).where(
        and(
          eq(sessions.seriesId, series.id),
          gt(sessions.startTime, now),
          eq(sessions.status, "scheduled"),
        )
      ).orderBy(asc(sessions.startTime)).limit(1);

      result.push({
        ...conv,
        title: series.title || conv.title,
        seriesTitle: series.title,
        upcomingSession: nextSession ? {
          id: nextSession.id,
          startTime: nextSession.startTime?.toISOString() ?? null,
          endTime: nextSession.endTime?.toISOString() ?? null,
          title: nextSession.title,
        } : null,
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Error fetching lesson group chats:", error);
    res.status(500).json({ error: "Failed to fetch lesson group chats" });
  }
});

// GET /api/player/me/online-players — returns player presence (online IDs + lastSeen) in same academy
router.get("/api/player/me/online-players", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.playerId) return res.json({ onlinePlayerIds: [], presence: {} });
    const playerId = req.user!.playerId!;
    const player = await storage.getPlayer(playerId);
    if (!player || !player.academyId) return res.json({ onlinePlayerIds: [], presence: {} });
    const academyId = player.academyId;

    // Get presence data from WebSocket store (includes lastSeen for recently offline players)
    const presence = getPlayerPresence(academyId);
    const onlinePlayerIds = Object.entries(presence)
      .filter(([pid, data]) => data.isOnline && pid !== playerId)
      .map(([pid]) => pid);

    res.json({ onlinePlayerIds, presence });
  } catch (error) {
    console.error("Error fetching online players:", error);
    res.status(500).json({ error: "Failed to fetch online players" });
  }
});

// GET /api/player/me/bookings/:orderId/conversation — get or create booking conversation
router.get("/api/player/me/bookings/:orderId/conversation", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.playerId) {
      return res.status(403).json({ error: "Player profile required" });
    }
    const playerId = req.user!.playerId!;
    const player = await storage.getPlayer(playerId);
    if (!player || !player.academyId) {
      return res.status(403).json({ error: "Academy membership required" });
    }
    const { orderId } = req.params;
    const academyId = player.academyId;

    // Look up the shop order and verify it belongs to this player
    const [order] = await db.select().from(shopOrders)
      .where(eq(shopOrders.id, orderId)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.playerId !== playerId) return res.status(403).json({ error: "Not your order" });

    // Try to find an existing conversation for this order
    const [existing] = await db.select().from(conversations)
      .where(and(
        eq(conversations.orderId, orderId),
        eq(conversations.playerId, playerId),
        eq(conversations.type, "provider_player"),
      )).limit(1);

    if (existing) {
      return res.json(existing);
    }

    // Find the provider for this order
    if (!order.assignedProviderId) {
      return res.status(400).json({ error: "Order has no assigned provider" });
    }
    const [provider] = await db.select().from(serviceProviders)
      .where(eq(serviceProviders.id, order.assignedProviderId)).limit(1);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    // Create the conversation
    const [conv] = await db.insert(conversations).values({
      type: "provider_player",
      academyId,
      playerId,
      providerId: provider.id,
      orderId,
      title: `Booking #${order.orderNumber || orderId.slice(0, 8)}`,
      lastMessageAt: new Date(),
    }).returning();

    // Add participants
    await db.insert(conversationParticipants).values([
      {
        conversationId: conv.id,
        participantType: "player",
        playerId,
        academyId,
      },
      {
        conversationId: conv.id,
        participantType: "provider",
        providerId: provider.id,
        academyId,
      },
    ]);

    res.status(201).json({ ...conv, providerName: provider.displayName, providerPhoto: provider.profilePhotoUrl });
  } catch (error) {
    console.error("[PlayerChat] Error getting booking conversation:", error);
    res.status(500).json({ error: "Failed to get conversation" });
  }
});

async function getConversationParticipantUserIds(conversationId: string, academyId: string, includeUserId?: string): Promise<string[]> {
  const participants = await storage.getConversationParticipants(conversationId, undefined, academyId);
  const participantPlayerIds = participants.filter(p => p.playerId).map(p => p.playerId!);
  const participantCoachIds = participants.filter(p => p.coachId).map(p => p.coachId!);
  const orConditions: SQL[] = [];
  if (participantPlayerIds.length > 0) orConditions.push(inArray(users.playerId, participantPlayerIds));
  if (participantCoachIds.length > 0) orConditions.push(inArray(users.coachId, participantCoachIds));
  if (orConditions.length === 0) return includeUserId ? [includeUserId] : [];
  const participantUsers = await db.select({ id: users.id }).from(users).where(or(...orConditions));
  const ids = participantUsers.map(x => x.id);
  if (includeUserId && !ids.includes(includeUserId)) ids.push(includeUserId);
  return ids;
}

async function broadcastReactionToParticipants(conversationId: string, messageId: string, academyId: string) {
  try {
    const reactions = await storage.getMessageReactions(messageId, academyId);
    const userIds = await getConversationParticipantUserIds(conversationId, academyId);
    if (userIds.length === 0) return;
    broadcastReactionUpdated(academyId, userIds, {
      conversationId,
      messageId,
      reactions: reactions.map(r => ({
        id: r.id,
        emoji: r.emoji,
        reactorType: r.reactorType,
        reactorCoachId: r.reactorCoachId,
        reactorPlayerId: r.reactorPlayerId,
      })),
    });
  } catch (err) {
    console.error("[broadcastReactionToParticipants] failed:", err);
  }
}

// ==================== DELETE OWN MESSAGE ====================
router.delete("/api/me/messages/:messageId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const u = req.user!;
    const { messageId } = req.params;
    const message = await storage.getMessage(messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });

    const isAuthor =
      (u.coachId && message.senderType === "coach" && message.senderCoachId === u.coachId) ||
      (u.playerId && message.senderType === "player" && message.senderPlayerId === u.playerId);
    if (!isAuthor) return res.status(403).json({ error: "Only the author can delete this message" });

    await db.update(messages).set({ isDeleted: true, body: "" }).where(eq(messages.id, messageId));

    const academyId = message.academyId || u.academyId || null;
    if (academyId) {
      const participants = await storage.getConversationParticipants(message.conversationId, undefined, academyId);
      const participantPlayerIds = participants.filter(p => p.playerId).map(p => p.playerId!);
      const participantCoachIds = participants.filter(p => p.coachId).map(p => p.coachId!);
      const orConditions: SQL[] = [];
      if (participantPlayerIds.length > 0) orConditions.push(inArray(users.playerId, participantPlayerIds));
      if (participantCoachIds.length > 0) orConditions.push(inArray(users.coachId, participantCoachIds));
      if (orConditions.length > 0) {
        const participantUsers = await db.select({ id: users.id }).from(users).where(or(...orConditions));
        const userIds = [u.userId, ...participantUsers.map(x => x.id)];
        broadcastMessageDeleted(academyId, userIds, { conversationId: message.conversationId, messageId });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ error: "Failed to delete message" });
  }
});

// ==================== USER QUICK REPLIES (custom chat phrases) ====================
const MAX_QUICK_REPLIES = 8;
const MAX_QUICK_REPLY_LEN = 60;

router.get("/api/me/quick-replies", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const rows = await db
      .select()
      .from(userQuickReplies)
      .where(eq(userQuickReplies.userId, userId))
      .orderBy(asc(userQuickReplies.sortOrder), asc(userQuickReplies.createdAt));
    res.json(rows);
  } catch (e) {
    console.error("Error fetching quick replies:", e);
    res.status(500).json({ error: "Failed to fetch quick replies" });
  }
});

router.post("/api/me/quick-replies", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const body = String(req.body?.body ?? "").trim();
    if (!body) return res.status(400).json({ error: "Body required" });
    if (body.length > MAX_QUICK_REPLY_LEN) return res.status(400).json({ error: "Phrase too long" });

    const existing = await db.select({ id: userQuickReplies.id }).from(userQuickReplies).where(eq(userQuickReplies.userId, userId));
    if (existing.length >= MAX_QUICK_REPLIES) {
      return res.status(400).json({ error: `Max ${MAX_QUICK_REPLIES} quick replies` });
    }

    const sortOrder = Number(req.body?.sortOrder ?? existing.length);
    const [row] = await db.insert(userQuickReplies).values({ userId, body, sortOrder }).returning();
    res.status(201).json(row);
  } catch (e) {
    console.error("Error creating quick reply:", e);
    res.status(500).json({ error: "Failed to create quick reply" });
  }
});

router.put("/api/me/quick-replies/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const body = String(req.body?.body ?? "").trim();
    if (!body) return res.status(400).json({ error: "Body required" });
    if (body.length > MAX_QUICK_REPLY_LEN) return res.status(400).json({ error: "Phrase too long" });

    const [existing] = await db.select().from(userQuickReplies).where(and(eq(userQuickReplies.id, id), eq(userQuickReplies.userId, userId)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const [updated] = await db.update(userQuickReplies).set({ body, updatedAt: new Date() }).where(eq(userQuickReplies.id, id)).returning();
    res.json(updated);
  } catch (e) {
    console.error("Error updating quick reply:", e);
    res.status(500).json({ error: "Failed to update quick reply" });
  }
});

router.delete("/api/me/quick-replies/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    await db.delete(userQuickReplies).where(and(eq(userQuickReplies.id, id), eq(userQuickReplies.userId, userId)));
    res.json({ success: true });
  } catch (e) {
    console.error("Error deleting quick reply:", e);
    res.status(500).json({ error: "Failed to delete quick reply" });
  }
});

// ============ Chat Onboarding (first-time tutorial) ============
router.get("/api/me/chat-onboarding", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const rows = await db
      .select({ seenAt: users.chatOnboardingSeenAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const seenAt = rows[0]?.seenAt ?? null;
    res.json({ seen: seenAt !== null, seenAt });
  } catch (e) {
    console.error("Error fetching chat onboarding status:", e);
    res.status(500).json({ error: "Failed to fetch chat onboarding status" });
  }
});

router.post("/api/me/chat-onboarding/seen", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    await db.update(users).set({ chatOnboardingSeenAt: now }).where(eq(users.id, userId));
    res.json({ success: true, seenAt: now });
  } catch (e) {
    console.error("Error marking chat onboarding seen:", e);
    res.status(500).json({ error: "Failed to mark chat onboarding seen" });
  }
});

export default router;
