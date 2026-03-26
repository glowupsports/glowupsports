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
import { getCoachPushTokens, sendPushNotification } from "../pushNotifications";
import { db } from "../db";
import { serviceProviders, users, shopOrders, conversations, conversationParticipants } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { broadcastProviderPlayerMessage } from "../websocket";

const router = Router();

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

    const conversations = await storage.getConversationsForPlayer(playerId, academyId);

    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        let coachName: string | null = null;
        let playerName: string | null = null;
        let providerName: string | null = null;
        let providerPhoto: string | null = null;
        if (conv.coachId) {
          const coach = await storage.getCoach(conv.coachId, academyId);
          coachName = coach?.name ?? null;
        }
        if (conv.type === "player_player") {
          const participants = await storage.getConversationParticipants(conv.id, undefined, academyId);
          const other = participants.find(p => p.playerId && p.playerId !== playerId);
          if (other?.playerId) {
            const otherPlayer = await storage.getPlayer(other.playerId, academyId);
            playerName = otherPlayer?.name ?? null;
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
        return { ...conv, coachName, playerName, providerName, providerPhoto };
      })
    );

    res.json(enriched);
  } catch (error) {
    console.error("Error fetching player conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
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
    if (!player || !player.academyId) {
      return res.status(403).json({ error: "Academy membership required for chat" });
    }

    const academyId = player.academyId;
    const { type, otherPlayerId, title, coachId, squadId } = req.body;

    if (!type) {
      return res.status(400).json({ error: "Conversation type required" });
    }

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
      return res.json({ friends: [], pendingRequests: [] });
    }
    const playerId = req.user!.playerId!;
    const player = await storage.getPlayer(playerId);
    if (!player || !player.academyId) {
      return res.json({ friends: [], pendingRequests: [] });
    }

    const { id } = req.params;
    const academyId = player.academyId;
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
    if (!player || !player.academyId) {
      return res.status(403).json({ error: "Academy membership required" });
    }

    const { id } = req.params;
    const academyId = player.academyId;
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
          senderType: "player",
          senderId: playerId,
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
    res.status(201).json(message);
  } catch (error) {
    console.error("Error sending player message:", error);
    res.status(500).json({ error: "Failed to send message" });
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
    if (!player || !player.academyId) {
      return res.status(403).json({ error: "Academy membership required" });
    }

    const { id } = req.params;
    const academyId = player.academyId;

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

    res.status(201).json(reaction);
  } catch (error) {
    console.error("Error adding reaction:", error);
    res.status(500).json({ error: "Failed to add reaction" });
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

export default router;
