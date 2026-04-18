import { Router, Request, Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { fireQuestEvent } from "../services/quest-events";
import { eq, sql, desc, and, inArray, isNotNull, gte, lte, ne, asc } from "drizzle-orm";
import {
  conversations,
  messages,
  coaches,
  players,
  academies,
  levelUpEvents,
  playerXpEvents,
  sessions,
  sessionPlayers,
  creditTransactions,
  coachXpTransactions,
  xpTransactions,
  playerPillarProgress,
  sessionSkillObservations,
  sessionSkillFeedback,
  sessionPlans,
  playerSessionCancellations,
  sessionWaitlist,
  sessionFeedback,
  inSessionFeedback,
  coachingSeries,
  coachSettings,
  users,
  bookingRequests,
  messageReactions,
} from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireAcademy,
  validateSessionOwnership,
  validatePlayerOwnership,
  type AuthenticatedRequest,
} from "../auth";
import { sanitizeMessage } from "../utils/sanitize";
import { ensureResolvableLocalTime } from "../utils/timezone";
import { awardXP } from "../services/xp-service";
import { broadcastNewSession, broadcastFeedbackReceived, broadcastSessionUpdate, broadcastWorldMessage } from "../websocket";
import {
  sendFeedbackNotification,
  sendLevelUpNotification,
  sendSessionConfirmedNotification,
  sendSessionCancelledNotification,
} from "../pushNotifications";
import { sendFeedbackNotificationEmail, sendLevelUpEmail } from "../emailService";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "../googleCalendarService";
import { apiCache } from "../cache";
import crypto from "crypto";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

const worldChatMessageSchema = z.object({
  body: z.string().min(1).max(4000),
  messageType: z.string().max(32).optional(),
});

const router = Router();

function isBirthdayToday(dateOfBirth: string | Date | null): boolean {
  if (!dateOfBirth) return false;
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  return birthDate.getMonth() === today.getMonth() && birthDate.getDate() === today.getDate();
}

/**
 * Checks whether all active session players in a group session are marked
 * holiday, vacation, or absent. If so, cancels the session, cancels any
 * outstanding credit debts, and sends a push + in-app notification to the coach.
 *
 * Returns `true` if the session was auto-cancelled, `false` otherwise.
 */
async function autoCancel(
  sessionId: string,
  session: { startTime: string; coachId?: string | null },
  coachId: string | null | undefined,
  storageArg: typeof storage,
  dbArg: typeof db,
): Promise<boolean> {
  const allSessionPlayers = await storageArg.getSessionPlayers(sessionId);
  if (allSessionPlayers.length === 0) return false;

  const allAbsent = allSessionPlayers.every(
    (sp) =>
      sp.attendanceStatus === "holiday" ||
      sp.attendanceStatus === "vacation" ||
      sp.attendanceStatus === "absent",
  );
  if (!allAbsent) return false;

  await storageArg.updateSession(sessionId, {
    status: "cancelled",
    skipReason: "all_players_on_holiday",
    cancelledAt: new Date(),
  });

  for (const sp of allSessionPlayers) {
    const cancelResult = await storageArg.cancelSessionDebt(sp.playerId, sessionId);
    if (cancelResult.cancelled) {
      console.log(`[AutoCancel] Cancelled debt for player ${sp.playerId} in session ${sessionId}`);
    }
  }

  console.log(`[AutoCancel] Session ${sessionId} auto-cancelled: all players on holiday/absent`);

  if (coachId) {
    try {
      const { sendPushNotification, getCoachPushTokens } = await import("../pushNotifications");
      const { coachNotifications } = await import("@shared/schema");
      const tokens = await getCoachPushTokens(coachId);
      const sessionTime = new Date(session.startTime).toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const title = "Les automatisch geannuleerd";
      const message = `Alle spelers zijn op vakantie — les ${sessionTime} is automatisch geannuleerd`;
      if (tokens.length > 0) {
        await sendPushNotification(tokens, title, message, {
          type: "auto_cancel_all_holiday",
          sessionId,
          coachId,
        });
      }
      await dbArg.insert(coachNotifications).values({
        coachId,
        type: "session_cancelled",
        title,
        message,
        priority: "high",
        metadata: { sessionId, reason: "all_players_on_holiday" },
      });
    } catch (notifErr) {
      console.error("[AutoCancel] Error sending auto-cancel notification:", notifErr);
    }
  }

  return true;
}

  // ==================== WORLD CHAT ====================
  // Global chat across all academies

  // Get or create the world chat conversation
  router.get("/api/world-chat", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Find existing world chat conversation
      let worldConv = await db.select({
        id: conversations.id,
        type: conversations.type,
        title: conversations.title,
        academyId: conversations.academyId,
        playerId: conversations.playerId,
        coachId: conversations.coachId,
        providerId: conversations.providerId,
        orderId: conversations.orderId,
        lastMessageAt: conversations.lastMessageAt,
        lastMessagePreview: conversations.lastMessagePreview,
        isArchived: conversations.isArchived,
        createdAt: conversations.createdAt,
      }).from(conversations)
        .where(eq(conversations.type, "world"))
        .limit(1);

      if (worldConv.length === 0) {
        // Create the world chat
        const created = await db.insert(conversations).values({
          type: "world",
          title: "World Chat",
          academyId: null,
          coachId: null,
          playerId: null,
        }).returning();
        worldConv = created;
      }

      res.json(worldConv[0]);
    } catch (error) {
      console.error("Error getting world chat:", error);
      res.status(500).json({ error: "Failed to get world chat" });
    }
  });

  // Get world chat messages
  router.get("/api/world-chat/messages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Find world chat conversation
      const worldConvResult = await db.select({
        id: conversations.id,
        type: conversations.type,
        title: conversations.title,
        academyId: conversations.academyId,
        playerId: conversations.playerId,
        coachId: conversations.coachId,
        providerId: conversations.providerId,
        orderId: conversations.orderId,
        lastMessageAt: conversations.lastMessageAt,
        lastMessagePreview: conversations.lastMessagePreview,
        isArchived: conversations.isArchived,
        createdAt: conversations.createdAt,
      }).from(conversations)
        .where(eq(conversations.type, "world"))
        .limit(1);

      if (worldConvResult.length === 0) {
        return res.json([]);
      }

      const worldConvId = worldConvResult[0].id;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      // Get messages with sender info
      const msgs = await db.select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderType: messages.senderType,
        senderCoachId: messages.senderCoachId,
        senderPlayerId: messages.senderPlayerId,
        body: messages.body,
        messageType: messages.messageType,
        createdAt: messages.createdAt,
      }).from(messages)
        .where(and(
          eq(messages.conversationId, worldConvId),
          eq(messages.isDeleted, false)
        ))
        .orderBy(desc(messages.createdAt))
        .limit(limit);

      // Reverse for chronological display
      const orderedMsgs = msgs.reverse();

      // Get sender details (coach names + academy names)
      const coachIds = [...new Set(orderedMsgs.filter(m => m.senderCoachId).map(m => m.senderCoachId!))];
      const playerIds = [...new Set(orderedMsgs.filter(m => m.senderPlayerId).map(m => m.senderPlayerId!))];

      const coachMap = new Map<string, { name: string; academyName: string; photoUrl: string | null }>();
      const playerMap = new Map<string, { name: string; academyName: string; photoUrl: string | null }>();

      if (coachIds.length > 0) {
        const coachData = await db.select({
          id: coaches.id,
          name: coaches.name,
          academyId: coaches.academyId,
          photoUrl: coaches.photoUrl,
        }).from(coaches).where(inArray(coaches.id, coachIds));

        const academyIds = [...new Set(coachData.filter(c => c.academyId).map(c => c.academyId!))];
        const academyData = academyIds.length > 0
          ? await db.select({ id: academies.id, name: academies.name }).from(academies).where(inArray(academies.id, academyIds))
          : [];
        const academyNameMap = new Map(academyData.map(a => [a.id, a.name]));

        for (const c of coachData) {
          const name = c.name || 'Coach';
          coachMap.set(c.id, { name, academyName: (c.academyId ? academyNameMap.get(c.academyId) : null) || 'Academy', photoUrl: c.photoUrl || null });
        }
      }

      const playerUserIdMap = new Map<string, string | null>();
      if (playerIds.length > 0) {
        const playerData = await db.select({
          id: players.id,
          name: players.name,
          academyId: players.academyId,
          profilePhotoUrl: players.profilePhotoUrl,
        }).from(players).where(inArray(players.id, playerIds));

        const academyIds = [...new Set(playerData.filter(p => p.academyId).map(p => p.academyId!))];
        const academyData = academyIds.length > 0
          ? await db.select({ id: academies.id, name: academies.name }).from(academies).where(inArray(academies.id, academyIds))
          : [];
        const academyNameMap = new Map(academyData.map(a => [a.id, a.name]));

        for (const p of playerData) {
          const name = p.name || 'Player';
          playerMap.set(p.id, { name, academyName: (p.academyId ? academyNameMap.get(p.academyId) : null) || 'Academy', photoUrl: p.profilePhotoUrl || null });
        }

        // Get userIds for players (for block functionality)
        const playerUserData = await db.select({
          playerId: users.playerId,
          userId: users.id,
        }).from(users).where(inArray(users.playerId, playerIds));
        for (const u of playerUserData) {
          if (u.playerId) playerUserIdMap.set(u.playerId, u.userId);
        }
      }

      // Fetch reactions for these messages
      const messageIds = orderedMsgs.map(m => m.id);
      const reactionsByMsg = new Map<string, Array<{ id: string; messageId: string; reactorType: string; reactorCoachId: string | null; reactorPlayerId: string | null; emoji: string; createdAt: Date }>>();
      if (messageIds.length > 0) {
        const reacRows = await db.select().from(messageReactions).where(inArray(messageReactions.messageId, messageIds));
        for (const r of reacRows) {
          const arr = reactionsByMsg.get(r.messageId) || [];
          arr.push(r as any);
          reactionsByMsg.set(r.messageId, arr);
        }
      }

      // Enrich messages with sender info
      const enrichedMessages = orderedMsgs.map(m => {
        let senderName = "Unknown";
        let academyName = "";
        let senderPhotoUrl: string | null = null;
        let senderUserId: string | null = null;
        if (m.senderType === "coach" && m.senderCoachId) {
          const info = coachMap.get(m.senderCoachId);
          senderName = info?.name || "Coach";
          academyName = info?.academyName || "";
          senderPhotoUrl = info?.photoUrl || null;
        } else if (m.senderType === "player" && m.senderPlayerId) {
          const info = playerMap.get(m.senderPlayerId);
          senderName = info?.name || "Player";
          academyName = info?.academyName || "";
          senderPhotoUrl = info?.photoUrl || null;
          senderUserId = playerUserIdMap.get(m.senderPlayerId) || null;
        } else if (m.senderType === "system") {
          senderName = "System";
        }

        return {
          ...m,
          senderName,
          academyName,
          senderPhotoUrl,
          senderUserId,
          reactions: reactionsByMsg.get(m.id) || [],
        };
      });

      res.json(enrichedMessages);
    } catch (error) {
      console.error("Error getting world chat messages:", error);
      res.status(500).json({ error: "Failed to get world chat messages" });
    }
  });

  // Post message to world chat
  router.post("/api/world-chat/messages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsedMsg = worldChatMessageSchema.safeParse(req.body);
      if (!parsedMsg.success) {
        return res.status(400).json({ error: fromZodError(parsedMsg.error).message });
      }
      const { body, messageType } = parsedMsg.data;
      const userId = req.user!.id;
      const coachId = req.user!.coachId;
      const playerId = req.user!.playerId;

      const sanitizedBody = sanitizeMessage(body);
      if (!sanitizedBody) {
        return res.status(400).json({ error: "Message body required after sanitization" });
      }

      // Get or create world chat conversation
      let worldConvResult = await db.select({
        id: conversations.id,
        type: conversations.type,
        title: conversations.title,
        academyId: conversations.academyId,
        playerId: conversations.playerId,
        coachId: conversations.coachId,
        providerId: conversations.providerId,
        orderId: conversations.orderId,
        lastMessageAt: conversations.lastMessageAt,
        lastMessagePreview: conversations.lastMessagePreview,
        isArchived: conversations.isArchived,
        createdAt: conversations.createdAt,
      }).from(conversations)
        .where(eq(conversations.type, "world"))
        .limit(1);

      if (worldConvResult.length === 0) {
        const created = await db.insert(conversations).values({
          type: "world",
          title: "World Chat",
          academyId: null,
          coachId: null,
          playerId: null,
        }).returning();
        worldConvResult = created;
      }

      const worldConvId = worldConvResult[0].id;

      const senderType = coachId ? "coach" : playerId ? "player" : "system";

      const result = await db.insert(messages).values({
        conversationId: worldConvId,
        senderType,
        senderCoachId: coachId || null,
        senderPlayerId: playerId || null,
        body: sanitizedBody,
        messageType: messageType || "text",
        academyId: null,
      }).returning();

      // Update conversation last message
      await db.update(conversations).set({
        lastMessageAt: new Date(),
        lastMessagePreview: sanitizedBody.substring(0, 100),
      }).where(eq(conversations.id, worldConvId));

      // Get sender info for response
      let senderName = "Unknown";
      let academyName = "";
      let senderPhotoUrl: string | null = null;
      if (senderType === "coach" && coachId) {
        const coachData = await db.select({
          name: coaches.name,
          academyId: coaches.academyId,
          photoUrl: coaches.photoUrl,
        }).from(coaches).where(eq(coaches.id, coachId)).limit(1);
        if (coachData.length > 0) {
          senderName = coachData[0].name || 'Coach';
          senderPhotoUrl = coachData[0].photoUrl || null;
          if (coachData[0].academyId) {
            const acad = await db.select({ name: academies.name }).from(academies).where(eq(academies.id, coachData[0].academyId!)).limit(1);
            academyName = acad[0]?.name || '';
          }
        }
      } else if (senderType === "player" && playerId) {
        const playerData = await db.select({
          name: players.name,
          academyId: players.academyId,
          profilePhotoUrl: players.profilePhotoUrl,
        }).from(players).where(eq(players.id, playerId)).limit(1);
        if (playerData.length > 0) {
          senderName = playerData[0].name || 'Player';
          senderPhotoUrl = playerData[0].profilePhotoUrl || null;
          if (playerData[0].academyId) {
            const acad = await db.select({ name: academies.name }).from(academies).where(eq(academies.id, playerData[0].academyId!)).limit(1);
            academyName = acad[0]?.name || '';
          }
        }
      }

      const worldMessagePayload = {
        ...result[0],
        senderName,
        academyName,
        senderPhotoUrl,
        reactions: [],
      };
      // Broadcast to all connected sockets so recipients get instant update
      broadcastWorldMessage(worldMessagePayload);
      res.status(201).json(worldMessagePayload);
    } catch (error) {
      console.error("Error posting to world chat:", error);
      res.status(500).json({ error: "Failed to post message" });
    }
  });


  // Academy Activity Feed - shows what's happening in the academy
  router.get("/api/academy/activity-feed", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const limit = Math.min(parseInt(req.query.limit as string) || 30, 50);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Get all academy players
      const academyPlayers = await db.select({ 
        id: players.id, 
        name: players.name,
      }).from(players).where(eq(players.academyId, academyId!));
      
      const playerIds = academyPlayers.map(p => p.id);
      const playerMap = new Map(academyPlayers.map(p => [p.id, p.name || 'Player']));
      
      if (playerIds.length === 0) {
        return res.json({ events: [] });
      }

      // Fetch events in parallel
      const [levelUps, xpEvents, completedSessions] = await Promise.all([
        // Level-up events (ball level promotions)
        db.select({
          id: levelUpEvents.id,
          playerId: levelUpEvents.playerId,
          toLevelId: levelUpEvents.toLevelId,
          fromLevelId: levelUpEvents.fromLevelId,
          xpAwarded: levelUpEvents.xpAwarded,
          titleUnlocked: levelUpEvents.titleUnlocked,
          createdAt: levelUpEvents.createdAt,
        }).from(levelUpEvents)
          .where(and(
            inArray(levelUpEvents.playerId, playerIds),
            gte(levelUpEvents.createdAt, sevenDaysAgo)
          ))
          .orderBy(desc(levelUpEvents.createdAt))
          .limit(10),

        // XP events (level ups in XP system)
        db.select({
          id: playerXpEvents.id,
          playerId: playerXpEvents.playerId,
          actionSource: playerXpEvents.actionSource,
          xpAmount: playerXpEvents.xpAmount,
          triggeredLevelUp: playerXpEvents.triggeredLevelUp,
          newLevel: playerXpEvents.newLevel,
          levelAtEvent: playerXpEvents.levelAtEvent,
          createdAt: playerXpEvents.createdAt,
        }).from(playerXpEvents)
          .where(and(
            inArray(playerXpEvents.playerId, playerIds),
            gte(playerXpEvents.createdAt, sevenDaysAgo)
          ))
          .orderBy(desc(playerXpEvents.createdAt))
          .limit(20),

        // Recently completed sessions
        db.select({
          id: sessions.id,
          title: sessions.title,
          sessionType: sessions.sessionType,
          startTime: sessions.startTime,
          status: sessions.status,
        }).from(sessions)
          .where(and(
            eq(sessions.academyId, academyId!),
            eq(sessions.status, "completed"),
            gte(sessions.startTime, sevenDaysAgo)
          ))
          .orderBy(desc(sessions.startTime))
          .limit(10),
      ]);

      // Build unified activity feed
      const events: Array<{
        id: string;
        type: string;
        icon: string;
        title: string;
        description: string;
        playerName?: string;
        timestamp: string;
        xp?: number;
        level?: number;
      }> = [];

      // Add ball level promotions
      for (const lu of levelUps) {
        const name = playerMap.get(lu.playerId) || 'Player';
        events.push({
          id: `levelup-${lu.id}`,
          type: "level_up",
          icon: "arrow-up-circle",
          title: `${name} leveled up!`,
          description: lu.titleUnlocked ? `Unlocked title: ${lu.titleUnlocked}` : `Promoted to new ball level`,
          playerName: name,
          timestamp: lu.createdAt?.toISOString() || new Date().toISOString(),
          xp: lu.xpAwarded || 0,
        });
      }

      // Add XP level-ups (player XP system)
      for (const xp of xpEvents) {
        const name = playerMap.get(xp.playerId) || 'Player';
        if (xp.triggeredLevelUp && xp.newLevel) {
          events.push({
            id: `xplevel-${xp.id}`,
            type: "xp_level_up",
            icon: "star",
            title: `${name} reached Level ${xp.newLevel}!`,
            description: `Earned ${xp.xpAmount} XP from ${xp.actionSource.replace(/_/g, ' ')}`,
            playerName: name,
            timestamp: xp.createdAt?.toISOString() || new Date().toISOString(),
            xp: xp.xpAmount,
            level: xp.newLevel,
          });
        } else if (xp.xpAmount >= 50) {
          // Only show significant XP gains
          events.push({
            id: `xp-${xp.id}`,
            type: "xp_earned",
            icon: "flash",
            title: `${name} earned ${xp.xpAmount} XP`,
            description: `From ${xp.actionSource.replace(/_/g, ' ')}`,
            playerName: name,
            timestamp: xp.createdAt?.toISOString() || new Date().toISOString(),
            xp: xp.xpAmount,
            level: xp.levelAtEvent,
          });
        }
      }

      // Add completed sessions
      for (const s of completedSessions) {
        const typeLabel = s.sessionType === "private" ? "Private" : 
          s.sessionType === "semi_private" ? "Semi-Private" : 
          s.sessionType === "group" ? "Group" : 
          s.sessionType === "private_adjusted" ? "Private (Adjusted)" : s.sessionType;
        events.push({
          id: `session-${s.id}`,
          type: "session_completed",
          icon: "checkmark-circle",
          title: `${typeLabel} session completed`,
          description: s.title || `${typeLabel} Session`,
          timestamp: s.startTime?.toISOString() || new Date().toISOString(),
        });
      }

      // Sort all events by timestamp descending
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      res.json({ events: events.slice(0, limit) });
    } catch (error) {
      console.error("Error fetching activity feed:", error);
      res.status(500).json({ error: "Failed to fetch activity feed" });
    }
  });

  router.get("/api/coach/birthdays/today", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      
      if (!coachId) {
        return res.status(400).json({ error: "Coach ID required" });
      }
      
      // Get all players assigned to this coach
      const coachPlayers = await db
        .select({
          id: players.id,
          name: players.name,
          ballLevel: players.ballLevel,
          profilePhotoUrl: players.profilePhotoUrl,
          dateOfBirth: players.dateOfBirth,
        })
        .from(players)
        .where(
          and(
            eq(players.coachId, coachId),
            isNotNull(players.dateOfBirth)
          )
        );
      
      // Filter players whose birthday is today
      const today = new Date();
      const birthdayPlayers = coachPlayers.filter(p => {
        if (!p.dateOfBirth) return false;
        const birth = new Date(p.dateOfBirth);
        return birth.getMonth() === today.getMonth() && birth.getDate() === today.getDate();
      }).map(p => {
        const birth = new Date(p.dateOfBirth!);
        const age = today.getFullYear() - birth.getFullYear();
        return {
          id: p.id,
          name: p.name,
          ballLevel: p.ballLevel,
          photoUrl: p.profilePhotoUrl,
          turningAge: age,
        };
      });
      
      res.json({ birthdays: birthdayPlayers, count: birthdayPlayers.length });
    } catch (error) {
      console.error("Error fetching today's birthdays:", error);
      res.status(500).json({ error: "Failed to fetch birthdays" });
    }
  });

  router.get("/api/coach/birthdays/upcoming", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "Coach ID required" });
      }

      const days = Math.min(parseInt(req.query.days as string) || 7, 60);

      const coachPlayers = await db
        .select({
          id: players.id,
          name: players.name,
          ballLevel: players.ballLevel,
          profilePhotoUrl: players.profilePhotoUrl,
          dateOfBirth: players.dateOfBirth,
        })
        .from(players)
        .where(
          and(
            eq(players.coachId, coachId),
            isNotNull(players.dateOfBirth)
          )
        );

      const today = new Date();
      const todayMonth = today.getMonth();
      const todayDate = today.getDate();

      const todayBirthdays: any[] = [];
      const upcomingBirthdays: any[] = [];

      const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

      for (const p of coachPlayers) {
        if (!p.dateOfBirth) continue;
        const birth = new Date(p.dateOfBirth);
        const bMonth = birth.getMonth();
        const bDate = birth.getDate();

        const thisYearBirthday = new Date(today.getFullYear(), bMonth, bDate);
        if (thisYearBirthday < new Date(today.getFullYear(), todayMonth, todayDate)) {
          thisYearBirthday.setFullYear(today.getFullYear() + 1);
        }

        const diffMs = thisYearBirthday.getTime() - new Date(today.getFullYear(), todayMonth, todayDate).getTime();
        const daysAway = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const age = thisYearBirthday.getFullYear() - birth.getFullYear();
        const monthLabel = `${MONTH_NAMES[thisYearBirthday.getMonth()]} ${thisYearBirthday.getFullYear()}`;
        const dateLabel = `${MONTH_NAMES[thisYearBirthday.getMonth()].slice(0, 3)} ${thisYearBirthday.getDate()}`;

        const entry = {
          id: p.id,
          name: p.name,
          ballLevel: p.ballLevel,
          photoUrl: p.profilePhotoUrl,
          turningAge: age,
          daysAway,
          monthLabel,
          dateLabel,
        };

        if (daysAway === 0) {
          todayBirthdays.push(entry);
        } else if (daysAway > 0 && daysAway <= days) {
          upcomingBirthdays.push(entry);
        }
      }

      upcomingBirthdays.sort((a, b) => a.daysAway - b.daysAway);

      res.json({
        today: todayBirthdays,
        upcoming: upcomingBirthdays,
        todayCount: todayBirthdays.length,
        upcomingCount: upcomingBirthdays.length,
      });
    } catch (error) {
      console.error("Error fetching upcoming birthdays:", error);
      res.status(500).json({ error: "Failed to fetch upcoming birthdays" });
    }
  });

  router.get("/api/coach/birthdays/week", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "Coach ID required" });
      }

      const weekStartParam = req.query.weekStart as string;
      if (!weekStartParam || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)) {
        return res.status(400).json({ error: "weekStart must be YYYY-MM-DD" });
      }

      // Force UTC midnight parsing to avoid server-timezone shifts
      const weekDates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStartParam + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + i);
        weekDates.push(d.toISOString().split("T")[0]);
      }

      const coachPlayers = await db
        .select({
          id: players.id,
          name: players.name,
          dateOfBirth: players.dateOfBirth,
        })
        .from(players)
        .where(
          and(
            eq(players.coachId, coachId),
            isNotNull(players.dateOfBirth)
          )
        );

      const grouped: Record<string, { id: string; name: string; turningAge: number }[]> = {};
      for (const isoDate of weekDates) {
        grouped[isoDate] = [];
      }

      for (const p of coachPlayers) {
        if (!p.dateOfBirth) continue;
        // Force UTC parsing for date_of_birth to avoid server-timezone influence
        const dobStr = typeof p.dateOfBirth === "string"
          ? p.dateOfBirth.substring(0, 10)
          : new Date(p.dateOfBirth).toISOString().split("T")[0];
        const birth = new Date(dobStr + "T00:00:00Z");
        const bMonth = birth.getUTCMonth();
        const bDay = birth.getUTCDate();

        for (const isoDate of weekDates) {
          const d = new Date(isoDate + "T00:00:00Z");
          if (d.getUTCMonth() === bMonth && d.getUTCDate() === bDay) {
            const turningAge = d.getUTCFullYear() - birth.getUTCFullYear();
            grouped[isoDate].push({ id: p.id, name: p.name, turningAge });
          }
        }
      }

      for (const key of Object.keys(grouped)) {
        if (grouped[key].length === 0) delete grouped[key];
      }

      res.json(grouped);
    } catch (error) {
      console.error("Error fetching week birthdays:", error);
      res.status(500).json({ error: "Failed to fetch week birthdays" });
    }
  });

  // Check for conflicts before booking
  router.get("/api/coach/sessions/check-conflict", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { courtId, startTime, endTime, playerIds, excludeSessionId } = req.query;
      const coachId = req.user!.coachId;

      if (!courtId || !coachId || !startTime || !endTime) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const start = new Date(startTime as string);
      const end = new Date(endTime as string);
      const conflicts: string[] = [];

      const academyId = req.user?.academyId ?? undefined;
      
      // Check unified time block conflict (across ALL academies)
      const dateStr = start.toISOString().split('T')[0];
      const startTimeStr = start.toISOString().split('T')[1].slice(0, 5);
      const endTimeStr = end.toISOString().split('T')[1].slice(0, 5);
      const unifiedConflict = await storage.checkUnifiedCoachConflict(
        coachId as string,
        dateStr,
        startTimeStr,
        endTimeStr,
        excludeSessionId as string | undefined,
        academyId
      );
      if (unifiedConflict.hasConflict && !unifiedConflict.isOwnAcademy) {
        conflicts.push("Coach is already booked at another academy for this time");
      }

      // Check coach conflict within same academy
      const coachConflict = await storage.checkCoachConflict(
        coachId as string, 
        start, 
        end, 
        excludeSessionId as string | undefined,
        academyId
      );
      if (coachConflict) {
        conflicts.push("Coach is already booked for this time");
      }

      // Check court conflict
      const courtConflict = await storage.checkCourtConflict(
        courtId as string, 
        start, 
        end,
        excludeSessionId as string | undefined,
        academyId
      );
      if (courtConflict) {
        conflicts.push("Court is already booked for this time");
      }

      // Check player conflicts if provided
      if (playerIds) {
        const playerIdArray = Array.isArray(playerIds) ? playerIds : [playerIds];
        for (const playerId of playerIdArray) {
          const playerConflict = await storage.checkPlayerConflict(
            playerId as string, 
            start, 
            end,
            excludeSessionId as string | undefined,
            academyId
          );
          if (playerConflict) {
            conflicts.push(`Player is already booked for this time`);
            break;
          }
        }
      }

      // Check travel time from previous session
      interface Warning {
        level: 1 | 2 | 3;
        type: string;
        message: string;
      }
      const warnings: Warning[] = [];
      
      // Get adjacent sessions for the coach on the same day
      const dayStart = new Date(start);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(start);
      dayEnd.setHours(23, 59, 59, 999);
      const coachSessions = await storage.getSessionsByCoach(coachId as string, dayStart, dayEnd);
      
      for (const session of coachSessions) {
        if (excludeSessionId && session.id === excludeSessionId) continue;
        
        const sessionStart = new Date(session.startTime);
        const sessionEnd = new Date(session.endTime);
        const requiredTravelTime = session.travelTime || 0;
        
        // Check if session ends just before new session
        if (sessionEnd <= start) {
          const gapMinutes = (start.getTime() - sessionEnd.getTime()) / 60000;
          if (gapMinutes < requiredTravelTime) {
            warnings.push({
              level: 2,
              type: "travel_time",
              message: `Not enough travel time (${Math.round(gapMinutes)}m available, ${requiredTravelTime}m needed)`,
            });
          } else if (gapMinutes < 5) {
            warnings.push({
              level: 1,
              type: "tight_schedule",
              message: `Only ${Math.round(gapMinutes)} minutes between sessions`,
            });
          }
        }
        
        // Check if new session ends just before existing session
        if (end <= sessionStart) {
          const gapMinutes = (sessionStart.getTime() - end.getTime()) / 60000;
          if (gapMinutes < requiredTravelTime) {
            warnings.push({
              level: 2,
              type: "travel_time",
              message: `Not enough travel time to next session (${Math.round(gapMinutes)}m available)`,
            });
          } else if (gapMinutes < 5) {
            warnings.push({
              level: 1,
              type: "tight_schedule",
              message: `Only ${Math.round(gapMinutes)} minutes before next session`,
            });
          }
        }
      }

      // Add Level 3 conflicts
      conflicts.forEach((conflict) => {
        warnings.push({ level: 3, type: "conflict", message: conflict });
      });

      res.json({ 
        conflicts,
        warnings,
        hasConflicts: conflicts.length > 0,
        maxWarningLevel: warnings.length > 0 ? Math.max(...warnings.map(w => w.level)) : 0,
      });
    } catch (error) {
      console.error("Error checking conflicts:", error);
      res.status(500).json({ error: "Failed to check conflicts" });
    }
  });

  // Get multi-week availability for recurring session creation
  router.post("/api/coach/sessions/multi-week-availability", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      const { dates, courtId } = req.body;

      if (!dates || !Array.isArray(dates) || dates.length === 0) {
        return res.status(400).json({ error: "dates array is required" });
      }

      // Build result: for each date, get blocked slots
      const result: Record<string, { 
        blockedSlots: Array<{ courtId: string | null; start: string; end: string }>;
        coachBlocked: Array<{ start: string; end: string }>;
      }> = {};

      for (const dateStr of dates) {
        const [year, month, day] = dateStr.split("-").map(Number);
        const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

        // Get all sessions for this day (blocked slots = other coaches' sessions)
        const blockedSessions = await storage.getBlockedSessions(coachId as string, startDate, endDate, academyId ?? undefined);
        const ownSessions = await storage.getSessionsByCoach(coachId as string, startDate, endDate, academyId ?? undefined);

        // Court blocked slots (other coaches)
        const blockedSlots = blockedSessions
          .filter(s => !courtId || s.courtId === courtId)
          .map(s => ({
            courtId: s.courtId,
            start: new Date(s.startTime).toISOString(),
            end: new Date(s.endTime).toISOString(),
          }));

        // Coach blocked (own sessions - coach can't be in two places)
        const coachBlocked = ownSessions.map(s => ({
          start: new Date(s.startTime).toISOString(),
          end: new Date(s.endTime).toISOString(),
        }));

        // Also add other coaches' sessions to coachBlocked if on same court
        if (courtId) {
          const courtBlocked = blockedSessions
            .filter(s => s.courtId === courtId)
            .map(s => ({
              start: new Date(s.startTime).toISOString(),
              end: new Date(s.endTime).toISOString(),
            }));
          coachBlocked.push(...courtBlocked);
        }

        result[dateStr] = { blockedSlots, coachBlocked };
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching multi-week availability:", error);
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  // Create session
  router.post("/api/coach/sessions", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      const {
        courtId,
        locationId,
        date,
        startTime,
        duration,
        sessionType,
        ballLevel,
        // Multi-level group support: optional array of ball levels for a single
        // group session (e.g. ["red", "blue"]). When present, the legacy
        // `ballLevel` column is set to the first entry for backward compat.
        ballLevels: rawBallLevels,
        skillLevel,
        weekCount,
        travelTime,
        playerIds,
        isFlexible,
        flexibleDates,
        maxPlayers,
        isOpenGroup,
        visibleToPlayers,
        notes,
        sport,
      } = req.body;

      const ballLevelsArr: string[] | null = Array.isArray(rawBallLevels) && rawBallLevels.length > 0
        ? rawBallLevels.filter((l: unknown): l is string => typeof l === "string" && l.length > 0)
        : null;
      const primaryBallLevel: string | null = ballLevelsArr && ballLevelsArr.length > 0
        ? ballLevelsArr[0]
        : (ballLevel || null);
      
      const FLEXIBLE_DAY = -1;
      const VALID_SPORTS = ["tennis", "padel", "pickleball"];
      const validatedSport = sport && VALID_SPORTS.includes(sport) ? sport : "tennis";

      if (!coachId || !startTime || !duration || !sessionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Get academy timezone for proper time handling
      const academyData = await storage.getAcademy(academyId!);
      const academyTimezone = academyData?.timezone || "Europe/Amsterdam";

      // Support both ISO timestamp format and separate date/time format
      let start: Date;
      if (date && startTime && !startTime.includes('T')) {
        // Validate that the start time is resolvable in the academy timezone
        const timeResolution = ensureResolvableLocalTime(date, startTime, academyTimezone);
        if (!timeResolution.ok) {
          return res.status(400).json({ error: timeResolution.error });
        }
        // Convert local time to UTC using academy timezone
        start = timeResolution.utcDate;
      } else {
        // startTime is already a full ISO timestamp
        start = new Date(startTime);
      }
      const end = new Date(start.getTime() + duration * 60000);
      const dateStr = start.toISOString().split('T')[0];
      const startTimeStr = start.toISOString().split('T')[1].slice(0, 5);
      const endTimeStr = end.toISOString().split('T')[1].slice(0, 5);

      // Check unified time block conflict (across ALL academies)
      const unifiedConflict = await storage.checkUnifiedCoachConflict(coachId, dateStr, startTimeStr, endTimeStr, undefined, academyId ?? undefined);
      if (unifiedConflict.hasConflict && !unifiedConflict.isOwnAcademy) {
        return res.status(409).json({ 
          error: "Coach conflict", 
          level: 3,
          message: "Coach is already booked at another academy for this time slot" 
        });
      }

      // Check conflicts within this academy
      const coachConflict = await storage.checkCoachConflict(coachId, start, end, undefined, academyId ?? undefined, courtId);
      if (coachConflict) {
        console.log(`[CoachConflict] Coach ${coachId} has conflict at ${start.toISOString()} - ${end.toISOString()}`);
        const conflictingSessions = await storage.getCoachSessionsInRange(coachId, academyId!, start, end);
        console.log(`[CoachConflict] Conflicting sessions:`, conflictingSessions.map(s => ({ id: s.id, seriesId: s.seriesId, start: s.startTime, status: s.status })));
        return res.status(409).json({ 
          error: "Coach conflict", 
          level: 3,
          message: "Coach is already booked for this time slot" 
        });
      }

      if (courtId) {
        const courtConflict = await storage.checkCourtConflict(courtId, start, end, undefined, academyId ?? undefined);
        if (courtConflict) {
          return res.status(409).json({ 
            error: "Court conflict", 
            level: 3,
            message: "Court is already booked for this time slot" 
          });
        }
      }

      // Smart Rules Validation: Check coach settings for minimum session length and buffer
      const coachSettingsData = await storage.getCoachSettings(coachId);
      if (coachSettingsData) {
        // Validate minimum session length
        if (coachSettingsData.minSessionLength && duration < coachSettingsData.minSessionLength) {
          return res.status(400).json({
            error: "Session too short",
            level: 2,
            message: `Session duration (${duration} min) is less than your minimum session length setting (${coachSettingsData.minSessionLength} min)`
          });
        }

        // Validate buffer between sessions
        if (coachSettingsData.bufferBetweenSessions && coachSettingsData.bufferBetweenSessions > 0) {
          const bufferMinutes = coachSettingsData.bufferBetweenSessions;
          
          // Check for sessions that end within buffer time before this session starts
          const bufferStartCheck = new Date(start.getTime() - bufferMinutes * 60000);
          const sessionsBeforeBuffer = await storage.getCoachSessionsInRange(
            coachId, 
            academyId!, 
            bufferStartCheck, 
            start
          );
          
          // Filter to find sessions that actually end within the buffer window
          const conflictingBefore = sessionsBeforeBuffer.filter(s => {
            const sessionEnd = new Date(s.endTime);
            const timeBetween = (start.getTime() - sessionEnd.getTime()) / 60000;
            return timeBetween > 0 && timeBetween < bufferMinutes;
          });
          
          if (conflictingBefore.length > 0) {
            const prevSession = conflictingBefore[0];
            const prevEnd = new Date(prevSession.endTime);
            const gapMinutes = Math.round((start.getTime() - prevEnd.getTime()) / 60000);
            return res.status(409).json({
              error: "Buffer conflict",
              level: 2,
              message: `Only ${gapMinutes} min gap before this session. Your settings require ${bufferMinutes} min buffer between sessions.`
            });
          }
          
          // Check for sessions that start within buffer time after this session ends
          const bufferEndCheck = new Date(end.getTime() + bufferMinutes * 60000);
          const sessionsAfterBuffer = await storage.getCoachSessionsInRange(
            coachId, 
            academyId!, 
            end, 
            bufferEndCheck
          );
          
          // Filter to find sessions that actually start within the buffer window
          const conflictingAfter = sessionsAfterBuffer.filter(s => {
            const sessionStart = new Date(s.startTime);
            const timeBetween = (sessionStart.getTime() - end.getTime()) / 60000;
            return timeBetween > 0 && timeBetween < bufferMinutes;
          });
          
          if (conflictingAfter.length > 0) {
            const nextSession = conflictingAfter[0];
            const nextStart = new Date(nextSession.startTime);
            const gapMinutes = Math.round((nextStart.getTime() - end.getTime()) / 60000);
            return res.status(409).json({
              error: "Buffer conflict",
              level: 2,
              message: `Only ${gapMinutes} min gap after this session. Your settings require ${bufferMinutes} min buffer between sessions.`
            });
          }
        }
      }

      // Create sessions (single, recurring, or flexible)
      const isFlexibleSession = isFlexible && flexibleDates && Array.isArray(flexibleDates) && flexibleDates.length > 0;
      const sessionsToCreate = isFlexibleSession ? flexibleDates.length : (weekCount && weekCount > 1 ? weekCount : 1);
      const recurringGroupId = sessionsToCreate > 1 ? crypto.randomUUID() : null;
      const createdSessions = [];
      const skippedWeeks: number[] = [];
      
      // Create coaching_series for ALL sessions (recurring, flexible, AND one-off)
      // - Recurring (weekly): dayOfWeek = 0-6
      // - Flexible/One-off: dayOfWeek = -1 (appears in "Flexible Schedule" section)
      let seriesId: string | null = null;
      const sessionTypeLabels: Record<string, string> = {
        private: "Private Lesson",
        semi_private: "Semi-Private",
        group: "Group Session",
        physical: "Physical Training",
        activity: "Activity",
      };
      
      if (academyId && coachId) {
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        let seriesTitle: string;
        let effectiveDayOfWeek: number;
        let seriesStartDateStr: string;
        let seriesEndDateStr: string;
        let effectiveWeekCount: number;
        
        if (isFlexibleSession) {
          // FLEXIBLE: Smart merge - check if existing flexible series matches these players
          let matchingFlexSeries: any = null;
          
          if (playerIds && Array.isArray(playerIds) && playerIds.length > 0) {
            const allCoachSeries = await storage.getCoachingSeries(coachId, academyId!);
            for (const s of allCoachSeries) {
              if (s.status !== "active") continue;
              if (s.dayOfWeek !== FLEXIBLE_DAY) continue;
              if (s.sessionType !== sessionType) continue;
              
              const sPlayers = await storage.getSeriesPlayers(s.id);
              const activeIds = sPlayers.filter((p: any) => p.status === "active").map((p: any) => p.playerId);
              
              const allMatch = playerIds.every((pid: string) => activeIds.includes(pid));
              if (allMatch && activeIds.length === playerIds.length) {
                matchingFlexSeries = s;
                break;
              }
            }
          }
          
          if (matchingFlexSeries) {
            seriesId = matchingFlexSeries.id;
            console.log(`[SmartSession] Adding flexible sessions to existing series: ${matchingFlexSeries.title} (ID: ${matchingFlexSeries.id})`);
            
            const sortedNewDates = [...flexibleDates].sort((a: any, b: any) => 
              (a.date || a).localeCompare(b.date || b)
            );
            const lastNewDate = typeof sortedNewDates[sortedNewDates.length - 1] === 'string' 
              ? sortedNewDates[sortedNewDates.length - 1] 
              : sortedNewDates[sortedNewDates.length - 1].date;
            
            if (!matchingFlexSeries.seriesEndDate || lastNewDate > matchingFlexSeries.seriesEndDate) {
              await db.update(coachingSeries)
                .set({ 
                  seriesEndDate: lastNewDate,
                  weekCount: (matchingFlexSeries.weekCount || 0) + flexibleDates.length,
                })
                .where(eq(coachingSeries.id, matchingFlexSeries.id));
            }
          }
          
          if (!seriesId) {
            effectiveDayOfWeek = FLEXIBLE_DAY;
            const sortedDates = [...flexibleDates].sort((a: any, b: any) => 
              (a.date || a).localeCompare(b.date || b)
            );
            seriesStartDateStr = typeof sortedDates[0] === 'string' ? sortedDates[0] : sortedDates[0].date;
            seriesEndDateStr = typeof sortedDates[sortedDates.length - 1] === 'string' 
              ? sortedDates[sortedDates.length - 1] 
              : sortedDates[sortedDates.length - 1].date;
            effectiveWeekCount = flexibleDates.length;
            
            let playerNameSuffix = "";
            if ((sessionType === "private" || sessionType === "semi_private") && playerIds && playerIds.length > 0) {
              const playerNames = await Promise.all(playerIds.map(async (pid: string) => {
                const p = await storage.getPlayer(pid);
                return p?.name?.split(" ")[0] || "Player";
              }));
              playerNameSuffix = ` - ${playerNames.join(", ")}`;
            }
            seriesTitle = `${sessionTypeLabels[sessionType] || sessionType}${playerNameSuffix}`;
          }
        } else if (sessionsToCreate === 1) {
          // ONE-OFF: Check if players already have a matching series on same day of week + time
          const sessionDayOfWeek = start.getUTCDay();
          let matchingSeries: any = null;
          
          if (playerIds && Array.isArray(playerIds) && playerIds.length > 0) {
            // Find series where ALL these players are active members, same day of week, same time
            const allCoachSeries = await storage.getCoachingSeries(coachId, academyId!);
            for (const s of allCoachSeries) {
              // Include both active AND ended series for smart merge
              if (s.status !== "active" && s.status !== "ended") continue;
              if (s.dayOfWeek !== sessionDayOfWeek) continue;
              if (s.startTime !== startTimeStr) continue;
              if (s.sessionType !== sessionType) continue;
              
              // Get active players in this series
              const seriesPlayers = await storage.getSeriesPlayers(s.id);
              const activePlayerIds = seriesPlayers.filter((p: any) => p.status === "active").map((p: any) => p.playerId);
              
              // Check if all selected players are in this series
              const allPlayersMatch = playerIds.every((pid: string) => activePlayerIds.includes(pid));
              if (allPlayersMatch && activePlayerIds.length === playerIds.length) {
                matchingSeries = s;
                break;
              }
            }
          }
          
          if (matchingSeries) {
            // Found matching series - add session to it instead of creating new
            seriesId = matchingSeries.id;
            console.log(`[SmartSession] Adding to existing series: ${matchingSeries.title} (ID: ${matchingSeries.id})`);
            
            // Skip series creation, go directly to session creation
            // Get pricing from matchingSeries or fetch academy pricing
            let sessionPricing: { academyPrice?: string; coachPayout?: string; academyMargin?: string } = {};
            if (matchingSeries.price) {
              sessionPricing = { academyPrice: matchingSeries.price };
            } else {
              const academyPricing = await storage.getAcademyPricing(academyId!);
              const pricingForType = academyPricing?.find((p: any) => p.sessionType === sessionType);
              if (pricingForType) {
                sessionPricing = {
                  academyPrice: pricingForType.price,
                  coachPayout: pricingForType.coachPayout,
                  academyMargin: pricingForType.academyMargin
                };
              }
            }

            const newSession = await storage.createSession({
              seriesId: matchingSeries.id,
              coachId: coachId!,
              academyId: academyId!,
              courtId,
              sessionType,
              startTime: start,
              endTime: end,
              duration,
              status: "scheduled",
              maxPlayers: matchingSeries.maxPlayers,
              xpValue: matchingSeries.xpPerSession || 20,
              ...sessionPricing
            });
            
            // Add players to this session
            for (const pid of playerIds) {
              try {
                await storage.addPlayerToSession({ sessionId: newSession.id, playerId: pid });
              } catch (e) {}
            }

            // Send push notifications to added players
            if (playerIds && playerIds.length > 0) {
              try {
                const coachDataSmart = await storage.getCoach(coachId!);
                const coachNameSmart = coachDataSmart?.name || "Your coach";
                for (const pid of playerIds) {
                  sendSessionConfirmedNotification(
                    pid,
                    sessionType,
                    newSession.startTime || start,
                    coachNameSmart,
                    academyId
                  ).catch(err => console.error("[PushNotification] SmartSession one-off notification failed:", err));
                }
              } catch (err) {
                console.error("[PushNotification] Failed to send SmartSession one-off notifications:", err);
              }
            }
            
            return res.json({
              series: matchingSeries,
              sessions: [newSession],
              skippedWeeks: [],
              addedToExistingSeries: true,
              message: `Session added to existing class: ${matchingSeries.title}`
            });
          }
          
          // No matching series found, create one-off as usual
          effectiveDayOfWeek = FLEXIBLE_DAY;
          seriesStartDateStr = dateStr;
          seriesEndDateStr = dateStr;
          effectiveWeekCount = 1;
          let oneOffPlayerSuffix = "";
          if ((sessionType === "private" || sessionType === "semi_private") && playerIds && playerIds.length > 0) {
            const oneOffPlayerNames = await Promise.all(playerIds.map(async (pid: string) => {
              const p = await storage.getPlayer(pid);
              return p?.name?.split(" ")[0] || "Player";
            }));
            oneOffPlayerSuffix = ` - ${oneOffPlayerNames.join(", ")}`;
          }
          seriesTitle = `${sessionTypeLabels[sessionType] || sessionType}${oneOffPlayerSuffix}`;
        } else {
          // RECURRING (weekly): dayOfWeek = 0-6
          effectiveDayOfWeek = start.getUTCDay();
          seriesStartDateStr = dateStr;
          const seriesEndDate = new Date(start.getTime() + (sessionsToCreate - 1) * 7 * 24 * 60 * 60 * 1000);
          seriesEndDateStr = seriesEndDate.toISOString().split('T')[0];
          effectiveWeekCount = sessionsToCreate;
          seriesTitle = `${sessionTypeLabels[sessionType] || sessionType} - ${dayNames[effectiveDayOfWeek]} ${startTimeStr}`;
        }
        
        if (!seriesId) {
          const series = await storage.createCoachingSeries({
            academyId,
            coachId,
            courtId: courtId || null,
            locationId: locationId || null,
            title: seriesTitle,
            dayOfWeek: effectiveDayOfWeek,
            startTime: startTimeStr,
            duration,
            sessionType,
            ballLevel: primaryBallLevel,
            ballLevels: ballLevelsArr ?? undefined,
            skillLevel: skillLevel || null,
            maxPlayers: maxPlayers || (sessionType === "private" ? 1 : sessionType === "semi_private" ? 2 : 6),
            weekCount: effectiveWeekCount,
            seriesStartDate: seriesStartDateStr,
            seriesEndDate: seriesEndDateStr,
            status: "active",
            sport: validatedSport,
          });
          seriesId = series.id;
          
          // Add players to series if provided
          if (playerIds && Array.isArray(playerIds)) {
            for (const playerId of playerIds) {
              await storage.addPlayerToSeries({
                seriesId: series.id,
                playerId,
                status: "active",
                joinedAt: start,
              });
            }
          }
        }
      }

      // FLEXIBLE sessions: create session for each date in flexibleDates
      if (isFlexibleSession) {
        for (let i = 0; i < flexibleDates.length; i++) {
          const flexDate = flexibleDates[i];
          const flexDateStr = typeof flexDate === 'string' ? flexDate : flexDate.date;
          const flexTimeStr = typeof flexDate === 'object' && flexDate.time ? flexDate.time : startTime;
          
          // Parse the flexible date with time
          const timeResolution = ensureResolvableLocalTime(flexDateStr, flexTimeStr, academyTimezone);
          if (!timeResolution.ok) {
            skippedWeeks.push(i + 1);
            continue;
          }
          
          const flexStart = timeResolution.utcDate;
          const flexEnd = new Date(flexStart.getTime() + duration * 60000);
          const flexStartTimeStr = flexStart.toISOString().split('T')[1].slice(0, 5);
          const flexEndTimeStr = flexEnd.toISOString().split('T')[1].slice(0, 5);
          
          // Check conflicts
          const unifiedConflict = await storage.checkUnifiedCoachConflict(coachId, flexDateStr, flexStartTimeStr, flexEndTimeStr, undefined, academyId ?? undefined);
          const coachConflict = await storage.checkCoachConflict(coachId, flexStart, flexEnd, undefined, academyId ?? undefined);
          const courtConflict = await storage.checkCourtConflict(courtId, flexStart, flexEnd, undefined, academyId ?? undefined);
          
          if ((unifiedConflict.hasConflict && !unifiedConflict.isOwnAcademy) || coachConflict || courtConflict) {
            skippedWeeks.push(i + 1);
            continue;
          }
          
          // Snapshot pricing
          let pricingSnapshot: { academyPrice?: string; coachPayout?: string; academyMargin?: string } = {};
          if (academyId && coachId) {
            try {
              const pricing = await storage.calculateSessionPricing(academyId, coachId, sessionType, duration);
              pricingSnapshot = {
                academyPrice: String(pricing.academyPrice),
                coachPayout: String(pricing.coachPayout),
                academyMargin: String(pricing.academyMargin),
              };
            } catch (err: any) {
              return res.status(422).json({ 
                error: "Pricing error", 
                message: err.message || "Could not calculate session pricing"
              });
            }
          }
          
          const session = await storage.createSession({
        duration: duration || 60,
            academyId,
            coachId,
            courtId,
            locationId,
            startTime: flexStart,
            endTime: flexEnd,
            duration,
            sessionType,
            ballLevel: primaryBallLevel,
            ballLevels: ballLevelsArr ?? undefined,
            skillLevel,
            isRecurring: false,
            recurringGroupId,
            weekCount: flexibleDates.length,
            travelTime: travelTime || 0,
            paymentStatus: "unpaid",
            status: "scheduled",
            seriesId: seriesId || undefined,
            weekNumber: i + 1,
            sport: validatedSport,
            ...pricingSnapshot,
          });
          
          // Create time block
          await storage.createCoachTimeBlock({
            coachId,
            sourceType: 'session',
            sourceAcademyId: academyId ?? undefined,
            sourceSessionId: session.id,
            date: flexDateStr,
            startTime: flexStartTimeStr,
            endTime: flexEndTimeStr,
            isPrivate: true,
          });
          
          // Add players to session
          if (playerIds && Array.isArray(playerIds)) {
            for (const playerId of playerIds) {
              await storage.addPlayerToSession({
                sessionId: session.id,
                playerId,
              });
            }
          }
          
          createdSessions.push(session);
        }
        
        // Return early for flexible sessions
        if (createdSessions.length === 0) {
          return res.status(409).json({ 
            error: "All time slots have conflicts",
            message: "Could not create any sessions due to conflicts"
          });
        }
        
        await storage.createAuditLog({
          entityType: "session",
          entityId: createdSessions[0].id,
          action: `create_flexible_${createdSessions.length}`,
          performedBy: coachId,
        });

        // Send push notifications to assigned players for flexible sessions
        if (playerIds && Array.isArray(playerIds) && playerIds.length > 0) {
          try {
            const coachDataFlex = await storage.getCoach(coachId!);
            const coachNameFlex = coachDataFlex?.name || "Your coach";
            const firstFlexSession = createdSessions[0];
            for (const pid of playerIds) {
              sendSessionConfirmedNotification(
                pid,
                sessionType,
                firstFlexSession.startTime || start,
                coachNameFlex,
                academyId
              ).catch(err => console.error("[PushNotification] Flexible session notification failed:", err));
            }
          } catch (err) {
            console.error("[PushNotification] Failed to send flexible session notifications:", err);
          }
        }
        
        return res.status(201).json({
          sessions: createdSessions,
          seriesId,
          skippedWeeks,
          message: `Created ${createdSessions.length} flexible session(s)`,
        });
      }

      // REGULAR and ONE-OFF sessions: continue with original loop
      for (let week = 0; week < sessionsToCreate; week++) {
        const weekStart = new Date(start.getTime() + week * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + duration * 60000);
        const weekDateStr = weekStart.toISOString().split('T')[0];
        const weekStartTimeStr = weekStart.toISOString().split('T')[1].slice(0, 5);
        const weekEndTimeStr = weekEnd.toISOString().split('T')[1].slice(0, 5);

        // Check unified time block conflicts for each week (across ALL academies)
        const weekUnifiedConflict = await storage.checkUnifiedCoachConflict(coachId, weekDateStr, weekStartTimeStr, weekEndTimeStr, undefined, academyId ?? undefined);
        const weekCoachConflict = await storage.checkCoachConflict(coachId, weekStart, weekEnd, undefined, academyId ?? undefined);
        const weekCourtConflict = await storage.checkCourtConflict(courtId, weekStart, weekEnd, undefined, academyId ?? undefined);
        
        // Skip if there's an external conflict or within-academy conflict
        if ((weekUnifiedConflict.hasConflict && !weekUnifiedConflict.isOwnAcademy) || weekCoachConflict || weekCourtConflict) {
          skippedWeeks.push(week + 1);
          continue;
        }

        // Snapshot pricing at booking time (Layer 3)
        let pricingSnapshot: { academyPrice?: string; coachPayout?: string; academyMargin?: string } = {};
        if (academyId && coachId) {
          try {
            const pricing = await storage.calculateSessionPricing(academyId, coachId, sessionType, duration);
            pricingSnapshot = {
              academyPrice: String(pricing.academyPrice),
              coachPayout: String(pricing.coachPayout),
              academyMargin: String(pricing.academyMargin),
            };
          } catch (err: any) {
            // Currency mismatch and other critical errors must block session creation
            return res.status(422).json({ 
              error: "Pricing error", 
              message: err.message || "Could not calculate session pricing"
            });
          }
        }

        const session = await storage.createSession({
        duration: duration || 60,
          academyId,
          coachId,
          courtId,
          locationId,
          startTime: weekStart,
          endTime: weekEnd,
          duration,
          sessionType,
          ballLevel: primaryBallLevel,
          ballLevels: ballLevelsArr ?? undefined,
          skillLevel,
          isRecurring: sessionsToCreate > 1,
          recurringGroupId,
          weekCount: sessionsToCreate,
          travelTime: travelTime || 0,
          paymentStatus: "unpaid",
          status: "scheduled",
          seriesId: seriesId || undefined,
          weekNumber: seriesId ? week + 1 : undefined,
          sport: validatedSport,
          ...pricingSnapshot,
        });

        // Create unified time block to prevent double-booking across academies
        await storage.createCoachTimeBlock({
          coachId,
          sourceType: 'session',
          sourceAcademyId: academyId ?? undefined,
          sourceSessionId: session.id,
          date: weekDateStr,
          startTime: weekStartTimeStr,
          endTime: weekEndTimeStr,
          isPrivate: true,
        });

        // Add players if provided (with credit deduction)
        let playerNames: string[] = [];
        if (playerIds && Array.isArray(playerIds)) {
          for (const playerId of playerIds) {
            const player = await storage.getPlayer(playerId, academyId!);
            if (player) {
              playerNames.push(player.name);
            }
            
            await storage.addPlayerToSession({
              sessionId: session.id,
              playerId,
            });
          }
        }

        // Sync to Google Calendar (non-blocking)
        const court = courtId ? await storage.getCourt(courtId, academyId!) : null;
        const location = locationId ? await storage.getLocation(locationId, academyId!) : null;
        const sessionTitle = `Tennis ${sessionType.charAt(0).toUpperCase() + sessionType.slice(1)} Session`;
        
        createCalendarEvent({
          sessionId: session.id,
          title: sessionTitle,
          description: `Ball Level: ${ballLevel || 'Not specified'}\nSkill Level: ${skillLevel || 'Not specified'}`,
          startTime: weekStart,
          endTime: weekEnd,
          location: location?.name || court?.name,
          playerNames,
        }).then(async (result) => {
          if (result.success && result.eventId) {
            await storage.updateSession(session.id, { googleCalendarEventId: result.eventId }, academyId!);
          }
        }).catch(err => console.error('[GoogleCalendar] Sync error:', err));

        createdSessions.push(session);
      }

      if (createdSessions.length === 0) {
        return res.status(409).json({ 
          error: "All time slots have conflicts",
          message: "Could not create any sessions due to conflicts"
        });
      }

      // Audit log
      await storage.createAuditLog({
        entityType: "session",
        entityId: createdSessions[0].id,
        action: sessionsToCreate > 1 ? `create_recurring_${createdSessions.length}` : "create",
        performedBy: coachId,
      });

      // Broadcast new session via WebSocket for real-time updates
      if (academyId) {
        for (const session of createdSessions) {
          broadcastNewSession(academyId, {
            sessionId: session.id,
            sessionName: session.name || `${sessionType} Session`,
            coachId: coachId!,
            startTime: session.startTime?.toISOString() || "",
          });
        }
      }

      if (playerIds && Array.isArray(playerIds) && playerIds.length > 0) {
        const coachData = await storage.getCoach(coachId!);
        const coachName = coachData?.name || "Your coach";
        const firstSession = createdSessions[0];
        
        for (const playerId of playerIds) {
          sendSessionConfirmedNotification(
            playerId,
            sessionType,
            firstSession.startTime || new Date(),
            coachName,
            academyId
          ).catch(err => console.error("[PushNotification] Failed to send session notification:", err));
        }
      }

      // For recurring sessions, return summary with skipped weeks info
      if (sessionsToCreate > 1) {
        res.status(201).json({
          sessions: createdSessions,
          summary: {
            requested: sessionsToCreate,
            created: createdSessions.length,
            skippedWeeks: skippedWeeks,
          }
        });
      } else {
        res.status(201).json(createdSessions[0]);
      }
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // Bulk create sessions (flexible schedule)
  router.post("/api/coach/sessions/bulk", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      
      const {
        courtId,
        duration,
        sessionType,
        ballLevel,
        // Multi-level group support — see comment on POST /api/coach/sessions.
        ballLevels: rawBallLevels,
        skillLevel,
        notes,
        playerIds,
        maxPlayers,
        isOpen,
        visibleToPlayers,
        flexibleSessions, // Array of { date, time, startTime, endTime }
        sport,
      } = req.body;

      const ballLevelsArr: string[] | null = Array.isArray(rawBallLevels) && rawBallLevels.length > 0
        ? rawBallLevels.filter((l: unknown): l is string => typeof l === "string" && l.length > 0)
        : null;
      const primaryBallLevel: string | null = ballLevelsArr && ballLevelsArr.length > 0
        ? ballLevelsArr[0]
        : (ballLevel || null);
      
      if (!coachId || !courtId || !flexibleSessions || !Array.isArray(flexibleSessions) || flexibleSessions.length === 0) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const VALID_SPORTS = ["tennis", "padel", "pickleball"];
      const validatedSport = sport && VALID_SPORTS.includes(sport) ? sport : "tennis";
      
      const createdSessions: any[] = [];
      const skippedDates: string[] = [];
      
      // Get pricing snapshot once for all sessions
      let pricingSnapshot: { academyPrice?: string; coachPayout?: string; academyMargin?: string } = {};
      if (academyId && coachId) {
        try {
          const pricing = await storage.calculateSessionPricing(academyId, coachId, sessionType, duration);
          pricingSnapshot = {
            academyPrice: String(pricing.academyPrice),
            coachPayout: String(pricing.coachPayout),
            academyMargin: String(pricing.academyMargin),
          };
        } catch (err: any) {
          return res.status(422).json({ 
            error: "Pricing error", 
            message: err.message || "Could not calculate session pricing"
          });
        }
      }
      
      // Determine series to use: find existing or create new flexible series
      let seriesId: string | null = null;
      const sortedDates = [...flexibleSessions].sort((a: any, b: any) => a.date.localeCompare(b.date));
      const firstDate = sortedDates[0]?.date;
      const lastDate = sortedDates[sortedDates.length - 1]?.date;
      
      // If players provided, try to find their existing active series with this coach
      if (playerIds && playerIds.length > 0 && academyId) {
        const firstPlayerId = playerIds[0];
        const playerSeries = await storage.getPlayerSeries(firstPlayerId);
        const existingSeries = playerSeries.find((s: any) => 
          s.coachId === coachId && 
          s.sessionType === sessionType && 
          s.status === "active"
        );
        if (existingSeries) {
          seriesId = existingSeries.id;
        }
      }
      
      // If no existing series, create a flexible series
      if (!seriesId && academyId) {
        let seriesTitle = `Flexible ${sessionType === 'private' ? 'Private' : sessionType === 'semi_private' ? 'Semi-Private' : 'Group'}`;
        if (playerIds && playerIds.length > 0) {
          const playerNames: string[] = [];
          for (const pid of playerIds.slice(0, 2)) {
            const p = await storage.getPlayer(pid, academyId);
            if (p) playerNames.push(p.name.split(' ')[0]);
          }
          if (playerNames.length > 0) {
            seriesTitle = `${playerNames.join(' & ')}${playerIds.length > 2 ? ` +${playerIds.length - 2}` : ''} - Flexible`;
          }
        }
        
        const newSeries = await storage.createCoachingSeries({
          academyId,
          coachId,
          courtId: courtId || null,
          title: seriesTitle,
          dayOfWeek: -1,
          startTime: "00:00",
          duration,
          sessionType,
          ballLevel: primaryBallLevel,
          ballLevels: ballLevelsArr ?? undefined,
          skillLevel: skillLevel || null,
          maxPlayers: sessionType === "private" ? 1 : sessionType === "semi_private" ? 2 : maxPlayers || 6,
          weekCount: flexibleSessions.length,
          seriesStartDate: firstDate,
          seriesEndDate: lastDate,
          status: "active",
          sport: validatedSport,
        });
        seriesId = newSeries.id;
        
        if (playerIds && Array.isArray(playerIds)) {
          for (const playerId of playerIds) {
            await storage.addPlayerToSeries({
              seriesId: newSeries.id,
              playerId,
              status: "active",
            });
          }
        }
      }
      
      for (const fs of flexibleSessions) {
        const start = new Date(fs.startTime);
        const end = new Date(fs.endTime);
        const dateStr = fs.date;
        const startTimeStr = fs.time;
        const endTimeStr = end.toISOString().split('T')[1].slice(0, 5);
        
        // Check for conflicts
        const coachConflict = await storage.checkCoachConflict(coachId, start, end, undefined, academyId ?? undefined, courtId);
        const courtConflict = await storage.checkCourtConflict(courtId, start, end, undefined, academyId ?? undefined);
        
        if (coachConflict || courtConflict) {
          skippedDates.push(dateStr);
          continue;
        }
        
        // Create the session linked to series
        const session = await storage.createSession({
        duration: duration || 60,
          coachId,
          courtId,
          academyId: academyId || undefined,
          startTime: start,
          endTime: end,
          duration,
          sessionType,
          status: "scheduled",
          name: notes || null,
          ballLevel: primaryBallLevel,
          ballLevels: ballLevelsArr ?? undefined,
          skillLevel: skillLevel || null,
          maxPlayers: sessionType === "private" ? 1 : sessionType === "semi_private" ? 2 : maxPlayers || 6,
          recurringGroupId: null,
          seriesId: seriesId || undefined,
          sport: validatedSport,
          ...pricingSnapshot,
        });
        
        // Create unified coach time block
        await storage.createCoachTimeBlock({
          coachId,
          sourceType: "session",
          sourceAcademyId: academyId || undefined,
          sourceSessionId: session.id,
          date: dateStr,
          startTime: startTimeStr,
          endTime: endTimeStr,
          isPrivate: true,
        });
        
        // Add players if provided
        if (playerIds && Array.isArray(playerIds)) {
          for (const playerId of playerIds) {
            await storage.addPlayerToSession({ sessionId: session.id, playerId, status: "confirmed" });
          }
        }
        
        createdSessions.push(session);
      }
      
      if (createdSessions.length === 0) {
        return res.status(409).json({ 
          error: "All sessions had conflicts", 
          skippedDates 
        });
      }
      
      // Audit log
      await storage.createAuditLog({
        entityType: "session",
        entityId: createdSessions[0].id,
        action: `bulk_create_${createdSessions.length}`,
        performedBy: coachId,
      });
      
      res.status(201).json({
        sessions: createdSessions,
        seriesId,
        summary: {
          requested: flexibleSessions.length,
          created: createdSessions.length,
          skippedDates,
        },
        message: skippedDates.length > 0 
          ? `Created ${createdSessions.length} sessions, skipped ${skippedDates.length} due to conflicts`
          : `Created ${createdSessions.length} sessions successfully`
      });
    } catch (error) {
      console.error("Error creating bulk sessions:", error);
      res.status(500).json({ error: "Failed to create sessions" });
    }
  });

  // Update session
  router.patch("/api/coach/sessions/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const updates = { ...req.body };

      // Convert timestamp strings to Date objects for Drizzle ORM
      const timestampFields = ['startTime', 'endTime', 'completedAt', 'cancelledAt', 'createdAt', 'updatedAt'];
      for (const field of timestampFields) {
        if (updates[field] && typeof updates[field] === 'string') {
          updates[field] = new Date(updates[field]);
        }
      }

      const academyId = req.user!.academyId!;
      const session = await storage.getSession(id, academyId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check ownership
      if (session.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to modify this session" });
      }

      // If time changed, check conflicts
      if (updates.startTime || updates.duration) {
        const start = updates.startTime ? new Date(updates.startTime) : session.startTime;
        const duration = updates.duration || session.duration;
        const end = new Date(start.getTime() + duration * 60000);
        const academyId = req.user?.academyId ?? undefined;

        const coachConflict = await storage.checkCoachConflict(coachId!, start, end, id, academyId);
        if (coachConflict) {
          return res.status(409).json({ error: "Coach conflict", level: 3 });
        }

        const courtId = updates.courtId || session.courtId;
        const courtConflict = await storage.checkCourtConflict(courtId!, start, end, id, academyId);
        if (courtConflict) {
          return res.status(409).json({ error: "Court conflict", level: 3 });
        }

        updates.endTime = end;
      }

      const updated = await storage.updateSession(id, updates);

      // Recreate time block for rescheduled session (delete old, create new)
      if (coachId && session.status !== 'cancelled' && (updates.startTime || updates.duration)) {
        await storage.deleteCoachTimeBlockBySession(id);
        const newStart = updates.startTime ? new Date(updates.startTime) : session.startTime;
        const newEnd = updates.endTime || session.endTime;
        const sessionDate = newStart.toISOString().split('T')[0];
        const startTimeStr = newStart.toISOString().split('T')[1].substring(0, 5);
        const endTimeStr = newEnd.toISOString().split('T')[1].substring(0, 5);
        await storage.createCoachTimeBlock({
          coachId,
          sourceType: 'session',
          sourceAcademyId: academyId || undefined,
          sourceSessionId: id,
          date: sessionDate,
          startTime: startTimeStr,
          endTime: endTimeStr,
          isPrivate: true,
        });
      }

      // Sync to Google Calendar if event exists (non-blocking)
      if (session.googleCalendarEventId) {
        const sessionPlayers = await storage.getSessionPlayers(id);
        const playerNames = sessionPlayers.map(sp => sp.player?.name).filter(Boolean) as string[];
        
        const updatedCourtId = updates.courtId || session.courtId;
        const updatedLocationId = updates.locationId || session.locationId;
        const court = updatedCourtId ? await storage.getCourt(updatedCourtId, academyId) : null;
        const location = updatedLocationId ? await storage.getLocation(updatedLocationId, academyId) : null;
        
        const startTime = updates.startTime ? new Date(updates.startTime) : session.startTime;
        const endTime = updated?.endTime || session.endTime;
        
        updateCalendarEvent(session.googleCalendarEventId, {
          sessionId: id,
          title: `Tennis ${(updates.sessionType || session.sessionType).charAt(0).toUpperCase() + (updates.sessionType || session.sessionType).slice(1)} Session`,
          description: `Ball Level: ${updates.ballLevel || session.ballLevel || 'Not specified'}\nSkill Level: ${updates.skillLevel || session.skillLevel || 'Not specified'}`,
          startTime,
          endTime,
          location: location?.name || court?.name,
          playerNames,
        }).catch(err => console.error('[GoogleCalendar] Update sync error:', err));
      }

      await storage.createAuditLog({
        entityType: "session",
        entityId: id,
        action: "update",
        performedBy: coachId!,
      });

      // Broadcast session update via WebSocket
      if (academyId) {
        broadcastSessionUpdate(academyId, {
          sessionId: id,
          type: "updated",
        });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  // Cancel session - FULL DELETE with credit refund
  router.post("/api/coach/sessions/:id/cancel", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const { reason } = req.body;

      const academyId = req.user!.academyId!;
      const session = await storage.getSession(id, academyId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Refund credits for this session before deleting
      // Find all session_player records to locate credit transactions by session_player_id
      const spRecordsForRefund = await db.select({ id: sessionPlayers.id, playerId: sessionPlayers.playerId, creditDeductedAt: sessionPlayers.creditDeductedAt })
        .from(sessionPlayers)
        .where(eq(sessionPlayers.sessionId, id));
      
      let refundedCount = 0;
      for (const sp of spRecordsForRefund) {
        if (!sp.creditDeductedAt) continue;
        
        // Try using the existing refund method first
        try {
          const refundResult = await storage.refundCreditsForSession(sp.playerId, id, academyId);
          if (refundResult.success) {
            refundedCount++;
            console.log(`[DeleteSession] Refunded credit for player ${sp.playerId} via refundCreditsForSession`);
            continue;
          }
        } catch (err) {
          console.log(`[DeleteSession] refundCreditsForSession failed for ${sp.playerId}, trying direct lookup`);
        }
        
        // Fallback: find debit transactions by session_player_id
        const debitTxns = await db.select().from(creditTransactions)
          .where(and(
            eq(creditTransactions.sessionPlayerId, sp.id),
            eq(creditTransactions.type, "debit"),
            sql`(${creditTransactions.metadata}->>'cancelled')::boolean IS NOT TRUE`
          ));
        
        // Task #676 Phase 2 — V1 write gate. The two INSERT branches below
        // mint legacy refund rows; for V2 academies the refund is recorded in
        // credit_ledger_v2 by the engine instead.
        const { v1WritesAllowed: _v1WritesAllowed_wc } = await import("../services/credit-feature-flag");
        const _v1Ok_wc = await _v1WritesAllowed_wc(session.academyId);

        for (const tx of debitTxns) {
          const meta = tx.metadata ? (typeof tx.metadata === 'string' ? JSON.parse(tx.metadata) : tx.metadata) : {};
          
          if (meta.isDebt && !meta.settled) {
            // Unsettled debt - just cancel it
            await db.update(creditTransactions)
              .set({ metadata: { ...meta, cancelled: true, cancelledReason: "session_deleted" } })
              .where(eq(creditTransactions.id, tx.id));
          } else if (meta.settled) {
            // Settled debt - cancel it and create refund
            await db.update(creditTransactions)
              .set({ metadata: { ...meta, cancelled: true, cancelledReason: "session_deleted" } })
              .where(eq(creditTransactions.id, tx.id));
            if (_v1Ok_wc) {
              await db.insert(creditTransactions).values({
                id: crypto.randomUUID(),
                playerId: tx.playerId,
                type: "refund",
                creditType: tx.creditType,
                amount: Math.abs(tx.amount),
                reason: "refund",
                metadata: { refundedDebtId: tx.id, reason: "Session deleted - credit refund", sessionDeleted: true },
                createdAt: new Date(),
              });
            }
          } else {
            // Regular debit (credit consumed) - create refund
            if (_v1Ok_wc) {
              await db.insert(creditTransactions).values({
                id: crypto.randomUUID(),
                playerId: tx.playerId,
                packageId: tx.packageId,
                type: "refund",
                creditType: tx.creditType,
                amount: Math.abs(tx.amount),
                reason: "refund",
                metadata: { refundedTransactionId: tx.id, reason: "Session deleted - credit refund", sessionDeleted: true },
                createdAt: new Date(),
              });
            }
          }
          refundedCount++;
        }
      }
      if (refundedCount > 0) {
        console.log(`[DeleteSession] Refunded ${refundedCount} credit(s) for session ${id}`);
      }

      // Get players for notification before deleting session_players
      const playersInSession = await db.select({ playerId: sessionPlayers.playerId })
        .from(sessionPlayers)
        .where(eq(sessionPlayers.sessionId, id));
      const coachData = coachId ? await storage.getCoach(coachId) : null;
      const coachName = coachData?.name || "Your coach";

      for (const p of playersInSession) {
        if (p.playerId) {
          sendSessionCancelledNotification(
            p.playerId,
            session.sessionType,
            session.startTime,
            reason || `Cancelled by ${coachName}`,
            academyId
          ).catch(err => console.error("[PushNotification] Failed to send cancellation notification:", err));
        }
      }

      // Wrap all DB nullification and deletion in a transaction for atomicity
      await db.transaction(async (tx) => {
        // Nullify session references in related tables
        await tx.update(creditTransactions).set({ sessionId: null }).where(eq(creditTransactions.sessionId, id));
        await tx.update(xpTransactions).set({ sessionId: null }).where(eq(xpTransactions.sessionId, id));
        await tx.update(coachXpTransactions).set({ sessionId: null }).where(eq(coachXpTransactions.sessionId, id));
        await tx.update(playerPillarProgress).set({ lastSessionId: null }).where(eq(playerPillarProgress.lastSessionId, id));

        // Nullify sessionPlayerId references in credit_transactions before deleting session_players
        // This is required because credit_transactions has a foreign key to session_players
        const sessionPlayerRecords = await tx.select({ id: sessionPlayers.id }).from(sessionPlayers).where(eq(sessionPlayers.sessionId, id));
        if (sessionPlayerRecords.length > 0) {
          const spIds = sessionPlayerRecords.map(sp => sp.id);
          await tx.update(creditTransactions)
            .set({ sessionPlayerId: null })
            .where(inArray(creditTransactions.sessionPlayerId, spIds));
        }

        // Delete related records
        await tx.delete(inSessionFeedback).where(eq(inSessionFeedback.sessionId, id));
        await tx.delete(sessionPlayers).where(eq(sessionPlayers.sessionId, id));
        await tx.delete(sessionSkillObservations).where(eq(sessionSkillObservations.sessionId, id));
        await tx.delete(sessionSkillFeedback).where(eq(sessionSkillFeedback.sessionId, id));
        await tx.delete(sessionPlans).where(eq(sessionPlans.sessionId, id));
        await tx.delete(playerSessionCancellations).where(eq(playerSessionCancellations.sessionId, id));
        await tx.delete(sessionWaitlist).where(eq(sessionWaitlist.sessionId, id));

        // Nullify booking_requests.sessionId before deleting the session (FK constraint)
        await tx.update(bookingRequests).set({ sessionId: null }).where(eq(bookingRequests.sessionId, id));

        // Delete the session itself
        await tx.delete(sessions).where(eq(sessions.id, id));
      });

      // Delete the unified time block to free up this time slot
      await storage.deleteCoachTimeBlockBySession(id);

      // Remove from Google Calendar if event exists (non-blocking)
      if (session.googleCalendarEventId) {
        deleteCalendarEvent(session.googleCalendarEventId)
          .catch(err => console.error('[GoogleCalendar] Delete sync error:', err));
      }

      await storage.createAuditLog({
        entityType: "session",
        entityId: id,
        action: "delete",
        performedBy: coachId!,
      });

      // Broadcast session deletion via WebSocket
      if (academyId) {
        broadcastSessionUpdate(academyId, {
          sessionId: id,
          type: "deleted",
        });
      }

      // Invalidate server-side caches
      if (coachId) {
        apiCache.invalidate(`series:${coachId}`);
        apiCache.invalidate(`earnings:${coachId}`);
        apiCache.invalidate(`calendar:${coachId}`);
        apiCache.invalidate(`stats:${coachId}`);
      }
      if (academyId) {
        apiCache.invalidate(`players:${academyId}`);
      }
      
      res.json({ success: true, deleted: true, creditsRefunded: refundedCount });
    } catch (error) {
      console.error("Error deleting session:", error);
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  // Transfer session to another coach
  router.post("/api/coach/sessions/:id/transfer", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const currentCoachId = req.user!.coachId;
      const academyId = req.user!.academyId!;
      const { targetCoachId, reason } = req.body;

      if (!targetCoachId) {
        return res.status(400).json({ error: "Target coach ID is required" });
      }

      if (targetCoachId === currentCoachId) {
        return res.status(400).json({ error: "Cannot transfer to yourself" });
      }

      // Get the session
      const session = await storage.getSession(id, academyId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Verify current coach owns this session OR owns the series
      let isAuthorized = session.coachId === currentCoachId;
      
      // Also allow transfer if coach owns the series this session belongs to
      if (!isAuthorized && session.seriesId) {
        const series = await storage.getCoachingSeriesById(session.seriesId);
        if (series && series.coachId === currentCoachId) {
          isAuthorized = true;
        }
      }
      
      if (!isAuthorized) {
        return res.status(403).json({ error: "Not authorized to transfer this session" });
      }

      // Verify target coach exists and is in the same academy
      const targetCoach = await storage.getCoach(targetCoachId);
      if (!targetCoach) {
        return res.status(404).json({ error: "Target coach not found" });
      }

      // Check if target coach has a conflict at this time
      const conflict = await storage.checkCoachConflict(
        targetCoachId,
        session.startTime,
        session.endTime,
        id,
        academyId
      );
      if (conflict) {
        return res.status(409).json({ error: "Target coach has a scheduling conflict at this time" });
      }

      // Transfer the session by updating coachId
      const updated = await storage.updateSession(id, {
        coachId: targetCoachId,
      });

      // If the session belongs to a series, copy series_players to session_players
      // This ensures the new coach can see the players for this specific session
      if (session.seriesId) {
        const seriesPlayersList = await storage.getSeriesPlayers(session.seriesId);
        
        for (const sp of seriesPlayersList) {
          if (sp.status === "active") {
            // Add player to this specific session (addPlayerToSession handles duplicates)
            await storage.addPlayerToSession({
              sessionId: id,
              playerId: sp.playerId,
              status: "enrolled",
            });
          }
        }
      }

      // Create audit log
      await storage.createAuditLog({
        entityType: "session",
        entityId: id,
        action: "transfer",
        performedBy: currentCoachId!,
        details: { 
          fromCoachId: currentCoachId, 
          toCoachId: targetCoachId,
          reason: reason || "Session transferred to another coach"
        },
      });

      // Broadcast update to both coaches
      if (academyId) {
        broadcastSessionUpdate(academyId, {
          sessionId: id,
          type: "transferred",
          fromCoachId: currentCoachId,
          toCoachId: targetCoachId,
        });
      }

      res.json({ 
        success: true, 
        message: `Session transferred to ${targetCoach.name}`,
        session: updated 
      });
    } catch (error) {
      console.error("Error transferring session:", error);
      res.status(500).json({ error: "Failed to transfer session" });
    }
  });

  // Extend session
  router.post("/api/coach/sessions/:id/extend", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const { minutes } = req.body;

      if (!minutes || ![15, 30].includes(minutes)) {
        return res.status(400).json({ error: "Invalid extension minutes" });
      }

      const academyId = req.user!.academyId!;
      const session = await storage.getSession(id, academyId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const newEndTime = new Date(session.endTime.getTime() + minutes * 60000);

      // Check if extension causes conflict
      const coachConflict = await storage.checkCoachConflict(coachId!, session.endTime, newEndTime, id, academyId);
      if (coachConflict) {
        return res.status(409).json({ error: "Cannot extend - coach has another session" });
      }

      const courtConflict = await storage.checkCourtConflict(session.courtId!, session.endTime, newEndTime, id, academyId);
      if (courtConflict) {
        return res.status(409).json({ error: "Cannot extend - court is booked" });
      }

      const updated = await storage.updateSession(id, {
        endTime: newEndTime,
        duration: session.duration + minutes,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error extending session:", error);
      res.status(500).json({ error: "Failed to extend session" });
    }
  });

  // Add players to session
  router.post("/api/coach/sessions/:id/players", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { playerId, isGuest, skipCreditCheck } = req.body;
      const academyId = req.user!.academyId;

      const { valid: sessionValid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!sessionValid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Validate player belongs to same academy
      if (playerId) {
        const { valid: playerValid } = await validatePlayerOwnership(playerId, academyId, storage);
        if (!playerValid) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Credit type validation and ATOMIC deduction - check and deduct credits BEFORE adding player
        // Skip credit check for guests (credits handled at session completion by ensureCreditProcessed)
        if (!isGuest && !skipCreditCheck) {
          const creditCheck = await storage.checkPlayerCreditsForSessionType(
            playerId,
            session.sessionType,
            academyId
          );

          if (!creditCheck.hasCredits) {
            const player = await storage.getPlayer(playerId, academyId);
            
            return res.status(200).json({
              warning: "credit_mismatch",
              message: `${player?.name || "Player"} has no ${creditCheck.creditType} credits available`,
              sessionType: session.sessionType,
              requiredCreditType: creditCheck.creditType,
              availableCredits: creditCheck.availableCredits,
              playerName: player?.name,
              playerId,
              sessionId: id,
            });
          }
        }
      }

      // Check if player is already enrolled
      const existingEnrollment = await storage.getSessionPlayer(id, playerId);
      let sessionPlayer: typeof existingEnrollment;
      let isNewEnrollment = false;
      
      if (existingEnrollment) {
        // Player already enrolled - check if credits were already deducted
        if (existingEnrollment.creditDeductedAt) {
          return res.status(200).json({
            ...existingEnrollment,
            success: true,
            alreadyEnrolled: true,
            creditDeducted: true,
            message: "Player was already enrolled with credits deducted",
          });
        }
        // Enrolled but no credits deducted - attempt to deduct now
        sessionPlayer = existingEnrollment;
      } else {
        // Create new enrollment
        sessionPlayer = await storage.addPlayerToSession({
          sessionId: id,
          playerId,
          isGuest: isGuest || false,
        });
        isNewEnrollment = true;
      }

      if (skipCreditCheck && playerId && !isGuest) {
        const creditCheck = await storage.checkPlayerCreditsForSessionType(
          playerId,
          session.sessionType,
          academyId
        );

        if (!creditCheck.hasCredits) {
          const player = await storage.getPlayer(playerId, academyId);
          const creditTypeLabel = (creditCheck.creditType || "").replace("_", "-");
          
          await storage.createNotification({
            playerId,
            type: "credits_needed",
            title: "Credits Required",
            message: `You've been added to a ${creditTypeLabel} lesson but don't have matching credits. Please ask your parent to purchase credits.`,
            metadata: JSON.stringify({
              sessionId: id,
              sessionType: session.sessionType,
              requiredCreditType: creditCheck.creditType,
              sessionDate: session.startTime.toISOString(),
            }),
          });

          if (player?.parentUserId) {
            await storage.createNotification({
              userId: player.parentUserId,
              type: "credits_needed",
              title: "Credits Required",
              message: `${player.name} has been added to a ${creditTypeLabel} lesson but needs ${creditTypeLabel} credits.`,
              metadata: JSON.stringify({
                playerId,
                playerName: player.name,
                sessionId: id,
                sessionType: session.sessionType,
                requiredCreditType: creditCheck.creditType,
                sessionDate: session.startTime.toISOString(),
              }),
            });
          }
        }
      }

      if (playerId && !isGuest && isNewEnrollment) {
        const coachId = req.user?.coachId;
        const coachData = coachId ? await storage.getCoach(coachId) : null;
        const coachName = coachData?.name || "Your coach";
        sendSessionConfirmedNotification(
          playerId,
          session.sessionType,
          session.startTime,
          coachName,
          req.user?.academyId
        ).catch(err => console.error("[PushNotification] Failed to send session notification:", err));
      }
      res.status(201).json({ 
        ...sessionPlayer, 
        success: true,
        creditDeducted: false,
        creditType: null,
        remainingCredits: null,
      });
    } catch (error) {
      console.error("Error adding player:", error);
      res.status(500).json({ error: "Failed to add player" });
    }
  });

  router.post("/api/coach/sessions/:id/players/multi-week", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { playerId, isGuest, skipCreditCheck, weeks } = req.body;
      const academyId = req.user!.academyId;

      if (!playerId) {
        return res.status(400).json({ error: "playerId is required" });
      }
      const weekCount = Math.min(Math.max(parseInt(weeks) || 1, 1), 4);

      const { valid: sessionValid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!sessionValid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const { valid: playerValid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!playerValid) {
        return res.status(404).json({ error: "Player not found" });
      }

      const results: { sessionId: string; success: boolean; error?: string; week: number }[] = [];

      const addToSession = async (sessionId: string, weekNum: number) => {
        try {
          const existingEnrollment = await storage.getSessionPlayer(sessionId, playerId);
          if (existingEnrollment) {
            results.push({ sessionId, success: true, week: weekNum, error: "already_enrolled" });
            return;
          }
          await storage.addPlayerToSession({
            sessionId,
            playerId,
            isGuest: isGuest || false,
          });
          results.push({ sessionId, success: true, week: weekNum });
        } catch (err) {
          results.push({ sessionId, success: false, week: weekNum, error: "failed" });
        }
      };

      await addToSession(id, 1);

      if (weekCount > 1) {
        const sessionStart = new Date(session.startTime);
        const sessionHour = sessionStart.getUTCHours();
        const sessionMinute = sessionStart.getUTCMinutes();
        const sessionDay = sessionStart.getUTCDay();

        for (let w = 1; w < weekCount; w++) {
          const targetDate = new Date(sessionStart);
          targetDate.setUTCDate(targetDate.getUTCDate() + (w * 7));

          const rangeStart = new Date(targetDate);
          rangeStart.setUTCHours(0, 0, 0, 0);
          const rangeEnd = new Date(targetDate);
          rangeEnd.setUTCHours(23, 59, 59, 999);

          const candidateSessions = await storage.getSessionsByDateRange(rangeStart, rangeEnd, academyId);

          const sorted = candidateSessions
            .filter(s => {
              const sStart = new Date(s.startTime);
              return (
                sStart.getUTCDay() === sessionDay &&
                sStart.getUTCHours() === sessionHour &&
                sStart.getUTCMinutes() === sessionMinute &&
                s.coachId === session.coachId &&
                s.status !== "cancelled"
              );
            })
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

          if (sorted.length > 0) {
            await addToSession(sorted[0].id, w + 1);
          } else {
            results.push({ sessionId: "", success: false, week: w + 1, error: "no_session_found" });
          }
        }
      }

      const added = results.filter(r => r.success && !r.error).length;
      const alreadyEnrolled = results.filter(r => r.error === "already_enrolled").length;
      const notFound = results.filter(r => r.error === "no_session_found").length;
      const failed = results.filter(r => r.error === "failed").length;

      res.status(201).json({
        success: true,
        results,
        added,
        alreadyEnrolled,
        notFound,
        failed,
        weeksRequested: weekCount,
      });
    } catch (error) {
      console.error("Error adding player to multiple weeks:", error);
      res.status(500).json({ error: "Failed to add player to sessions" });
    }
  });

  // Remove player from session
  router.delete("/api/coach/sessions/:id/players/:playerId", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const academyId = req.user!.academyId;

      const { valid: sessionValid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!sessionValid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Validate player belongs to same academy
      const { valid: playerValid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!playerValid) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Always refund credits when removing player
      let refundResult = null;
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      refundResult = await storage.refundCreditsForSession(playerId, id, academyId); // Always refund

      await storage.removePlayerFromSession(id, playerId);

      res.json({ 
        success: true,
        creditRefunded: refundResult?.success || false,
        creditType: refundResult?.creditType,
      });
    } catch (error) {
      console.error("Error removing player:", error);
      res.status(500).json({ error: "Failed to remove player" });
    }
  });

  // Get session players with player details (using efficient JOIN)
  router.get("/api/coach/sessions/:id/players", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;

      const { valid } = await validateSessionOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Session not found" });
      }

      const playersWithDetails = await storage.getSessionPlayersWithPlayerInfo(id);
      console.log("[SessionPlayers] Returning players for session", id, ":", JSON.stringify(playersWithDetails.map(p => ({ playerId: p.playerId, attendanceStatus: p.attendanceStatus }))));
      res.json(playersWithDetails);
    } catch (error) {
      console.error("Error fetching players:", error);
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  // Save attendance (offline-safe) - supports single or batch
  router.post("/api/coach/sessions/:id/attendance", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const coachId = req.user!.coachId;

      const { valid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }

      let xpAwarded = false;

      // Handle batch attendance (array of records)
      if (req.body.attendance && Array.isArray(req.body.attendance)) {
        const results = [];
        for (const record of req.body.attendance) {
          const updated = await storage.updateAttendance(
            id,
            record.playerId,
            record.status,
            record.lateMinutes,
            record.absentReason
          );
          results.push(updated);

          if (record.status === "present" || record.status === "late") {
            fireQuestEvent(record.playerId, "complete_session").catch(() => {});
          }

          // When attendance changes to holiday/vacation, cancel any debt for this session
          // Note: updateAttendance() now also handles this internally — this is a safety net
          if (record.status === "vacation" || record.status === "holiday") {
            const cancelReason = record.status === "vacation" ? "attendance_changed_to_vacation" : "attendance_changed_to_holiday";
            const cancelResult = await storage.cancelSessionDebt(record.playerId, id, cancelReason);
            if (cancelResult.cancelled) {
              console.log(`[Attendance] Cancelled ${cancelResult.amount} credits of debt for player ${record.playerId} due to ${record.status} status`);
            }
          }
        }

        // AUTO-CANCEL: Check if all players in this group session are on holiday/vacation/absent
        // Validates against ALL persisted session_players from DB (not just request payload)
        const isGroupSession = session.sessionType === "group";
        let autoCancelled = false;
        const eligibleForAutoCancel = session.status === "scheduled" || session.status === "in_progress";
        if (isGroupSession && eligibleForAutoCancel && req.body.attendance.length > 0) {
          autoCancelled = await autoCancel(id, session, coachId, storage, db);
        }
        
        // Award XP for timely attendance marking (during class time)
        if (coachId && session.endTime) {
          const { rewardCoachForTimelyAttendance } = await import("../pushNotifications");
          xpAwarded = await rewardCoachForTimelyAttendance(coachId, id, session.endTime);
        }
        
        // If markCompleted flag is set, mark session as completed and consume credits
        let creditConsumptionResult = null;
        const presentPlayers = req.body.attendance.filter((a: { status: string }) => a.status === "present" || a.status === "late");
        
        // BUSINESS RULE: Absent players ALWAYS get charged (they missed the lesson but it still counts)
        // Only vacation/holiday status skips credit deduction
        const isPrivateSession = session.sessionType === "private" || session.sessionType === "private_adjusted";
        const chargeablePlayers = req.body.attendance.filter((a: { status: string }) => 
          a.status === "present" || a.status === "late" || a.status === "absent"
        );
        
        if (req.body.markCompleted && !autoCancelled) {
          // Auto-adjust session type based on present players
          // If only 1 player is present in a semi-private session, convert to private_adjusted
          let adjustedSessionType = session.sessionType;
          const presentCount = presentPlayers.length;
          
          if (session.sessionType === "semi_private" && presentCount === 1) {
            adjustedSessionType = "private_adjusted";
            console.log(`[SessionType] Auto-adjusting session ${id} from semi_private to private_adjusted (only 1 player present)`);
          }
          
          await storage.updateSession(id, { 
            status: "completed",
            sessionType: adjustedSessionType 
          });
          
          // REFACTORED: Use ensureCreditProcessed() for bulletproof credit handling
          // Process credits for chargeable players using the single entrypoint
          const { ensureCreditProcessed: processCredit } = await import("../storage");
          
          // Track original session type BEFORE adjustment for correct charging logic
          const originalSessionType = session.sessionType;
          const creditResults = { consumed: 0, debts: 0, skipped: 0, errors: [] as string[] };
          
          for (const updatedRecord of results) {
            if (!updatedRecord) continue;
            
            // BUSINESS RULE for credit charging:
            // - Private sessions: absent = still charged (coach was there waiting)
            // - Semi-private sessions: absent = NOT charged (only the present player pays, as private)
            // - Group sessions: absent = still charged (lesson happened regardless)
            const attendanceStatus = (updatedRecord.attendanceStatus || '').toLowerCase();
            const isAbsent = attendanceStatus === 'absent';
            const wasSemiPrivate = originalSessionType === 'semi_private';
            
            // Skip credit deduction for absent players in semi-private sessions
            if (isAbsent && wasSemiPrivate) {
              console.log(`[Credits] Skipping credit for absent player ${updatedRecord.playerId} in semi-private session ${id} (original type: semi_private)`);
              creditResults.skipped++;
              continue;
            }
            
            const isChargeable = ['present', 'late', 'absent'].includes(attendanceStatus);
            
            if (isChargeable) {
              try {
                const result = await processCredit(updatedRecord.id);
                if (result.action === "consumed") creditResults.consumed++;
                else if (result.action === "debt_created") creditResults.debts++;
                else if (result.action === "already_processed") creditResults.skipped++;
                else if (result.action === "error") creditResults.errors.push(result.error || "Unknown error");
              } catch (err: any) {
                console.error(`[Credits] Error processing credit for session_player ${updatedRecord.id}:`, err);
                creditResults.errors.push(err.message);
              }
            }
          }
          
          creditConsumptionResult = {
            consumed: creditResults.consumed,
            debts: creditResults.debts,
            skipped: creditResults.skipped,
            actualCreditType: session.sessionType || "group"
          };
          console.log(`[Credits] Session ${id}: consumed ${creditResults.consumed}, debts ${creditResults.debts}, skipped ${creditResults.skipped}`);

          // Send low credit notifications to chargeable players after credit consumption
          try {
            const { sendLowCreditNotificationsAfterSession } = await import("../pushNotifications");
            const chargeablePlayerIds = chargeablePlayers.map((a: { playerId: string }) => a.playerId).filter(Boolean);
            if (chargeablePlayerIds.length > 0) {
              sendLowCreditNotificationsAfterSession(chargeablePlayerIds, session.sessionType, academyId)
                .catch(err => console.error("[LowCredit] Error sending low credit notifications:", err));
            }
          } catch (notifErr) {
            console.error("[LowCredit] Error importing notification function:", notifErr);
          }

          // Award XP to players marked as present or late (not absent, not vacation)
          // Uses canonical session_attendance XP rule (10 XP per session)
          for (const presentPlayer of presentPlayers) {
            try {
              const xpResult = await awardXP(presentPlayer.playerId, "session_attendance", "session", id);
              if (xpResult.success) {
                console.log(`[XP] Awarded ${xpResult.xpAwarded} XP to player ${presentPlayer.playerId} for session ${id} (session_attendance)`);
              }
            } catch (xpError) {
              console.error(`[XP] Error awarding XP to player ${presentPlayer.playerId}:`, xpError);
            }
          }
        }

          // Auto-assign coach to present players if not already assigned
          for (const presentPlayer of presentPlayers) {
            try {
              await storage.autoAssignCoachFromSession(presentPlayer.playerId, id);
            } catch (coachError) {
              console.error(`[AutoAssign] Error assigning coach to player ${presentPlayer.playerId}:`, coachError);
            }
          }
        
        // Award session completion XP to coach (batch flow)
        let sessionCompletionXp = 0;
        if (req.body.markCompleted && coachId && !autoCancelled) {
          const COACH_XP_REWARDS_BATCH = {
            private: 25,
            semi_private: 35,
            group: 50,
            camp: 75,
            team_training: 60,
            clinic: 45,
            match: 30,
            assessment: 40,
          } as Record<string, number>;
          sessionCompletionXp = COACH_XP_REWARDS_BATCH[session.sessionType] || 20;

          try {
            const existingSessionXp = await db.select()
              .from(coachXpTransactions)
              .where(and(
                eq(coachXpTransactions.coachId, coachId),
                eq(coachXpTransactions.source, 'session_completion'),
                eq(coachXpTransactions.sessionId, id)
              ));

            if (existingSessionXp.length === 0) {
              await db.insert(coachXpTransactions).values({
                coachId,
                xpAmount: sessionCompletionXp,
                source: 'session_completion',
                description: 'Completed ' + session.sessionType + ' session',
                sessionId: id,
              });

              const coachForXp = await storage.getCoach(coachId);
              if (coachForXp) {
                const newTotalXp = (coachForXp.totalXp || 0) + sessionCompletionXp + (xpAwarded ? 25 : 0);
                let newLevel = 1;
                let xpThreshold = 500;
                let accumulatedXp = 0;
                while (accumulatedXp + xpThreshold <= newTotalXp) {
                  accumulatedXp += xpThreshold;
                  newLevel++;
                  xpThreshold = 500 + (newLevel - 1) * 100;
                }
                await storage.updateCoach(coachId, { totalXp: newTotalXp, level: newLevel });
                console.log('[CoachXP] Awarded ' + sessionCompletionXp + ' session completion XP to coach ' + coachId + ' (total: ' + newTotalXp + ')');
              }
            }
          } catch (xpErr) {
            console.error('[CoachXP] Error awarding session completion XP:', xpErr);
          }
        }

        const totalXpAwarded = (xpAwarded ? 25 : 0) + sessionCompletionXp;
        
        // Mark session as reviewed by coach
        await db.update(sessions).set({ coachReviewedAt: new Date() }).where(eq(sessions.id, id));

        // Invalidate server-side caches so next fetch gets fresh data
        if (coachId) {
          apiCache.invalidate(`series:${coachId}`);
          apiCache.invalidate(`earnings:${coachId}`);
          apiCache.invalidate(`calendar:${coachId}`);
          apiCache.invalidate(`stats:${coachId}`);
        }
        if (academyId) {
          apiCache.invalidate(`players:${academyId}`);
        }
        // Invalidate player-specific caches
        for (const r of results) {
          if (r?.playerId) {
            apiCache.invalidate(`packages:${r.playerId}`);
            apiCache.invalidate(`credits:${r.playerId}`);
          }
        }
        
        return res.json({ 
          success: true, 
          updated: results.length, 
          message: autoCancelled ? 'Session auto-cancelled: all players on holiday' : (req.body.markCompleted ? 'Attendance saved and session completed' : 'Attendance saved'),
          xpAwarded: totalXpAwarded,
          creditConsumption: creditConsumptionResult,
          autoCancelled,
        });
      }

      // Handle single player attendance (legacy)
      const { playerId, status, lateMinutes, absenceReason } = req.body;
      const updated = await storage.updateAttendance(
        id,
        playerId,
        status,
        lateMinutes,
        absenceReason
      );

      // AUTO-CANCEL (single-attendance path): For group sessions, check if all players are now on holiday/vacation/absent
      let singleAutoCancelled = false;
      const singleEligibleForAutoCancel = session.status === "scheduled" || session.status === "in_progress";
      if (session.sessionType === "group" && singleEligibleForAutoCancel) {
        singleAutoCancelled = await autoCancel(id, session, coachId, storage, db);
      }

      // Always mark session as completed when attendance is saved (single player), unless auto-cancelled
      if (!singleAutoCancelled && session.status === "scheduled") {
        await storage.updateSession(id, { status: "completed" });
        console.log(`[Attendance] Auto-completed session ${id} after attendance save`);
        // Fire-and-forget AI session digest for this player
        if (playerId) {
          const _sessionId = id;
          const _playerId = playerId;
          setImmediate(async () => {
            try {
              const { generateSessionDigest } = await import("../services/ai-progress-engine");
              await generateSessionDigest(_sessionId, _playerId);
            } catch { /* non-critical */ }
          });
        }
        
        // Check if player is eligible for coach review prompt (3+ sessions)
        if (playerId && session.coachId) {
          try {
            const sessionCount = await storage.getPlayerCoachSessionCount(playerId, session.coachId);
            const hasExistingReview = await storage.hasPlayerReviewedCoach(playerId, session.coachId);
            const hasPendingPrompt = await storage.getPendingReviewPrompt(playerId, session.coachId);
            
            if (sessionCount >= 3 && !hasExistingReview && !hasPendingPrompt) {
              await storage.createReviewPrompt({
                playerId,
                coachId: session.coachId,
                academyId: session.academyId || req.user?.academyId || "",
                triggerType: "session_milestone",
                sessionId: id,
                isDismissed: false,
              });
              console.log(`[ReviewPrompt] Created review prompt for player ${playerId} after ${sessionCount} sessions with coach ${session.coachId}`);
            }
          } catch (promptError) {
            console.error("[ReviewPrompt] Error creating review prompt:", promptError);
          }
        }
      }
      
      // Award XP for timely attendance marking (during class time)
      if (coachId && session.endTime) {
        const { rewardCoachForTimelyAttendance } = await import("../pushNotifications");
        xpAwarded = await rewardCoachForTimelyAttendance(coachId, id, session.endTime);
      }

      // Mark session as reviewed by coach
      await db.update(sessions).set({ coachReviewedAt: new Date() }).where(eq(sessions.id, id));

      // Invalidate server-side caches for single player attendance
      if (coachId) {
        apiCache.invalidate(`series:${coachId}`);
        apiCache.invalidate(`calendar:${coachId}`);
      }
      if (academyId) {
        apiCache.invalidate(`players:${academyId}`);
      }
      if (playerId) {
        apiCache.invalidate(`packages:${playerId}`);
        apiCache.invalidate(`credits:${playerId}`);
      }
      
      res.json({ ...updated, xpAwarded: xpAwarded ? 25 : 0, autoCancelled: singleAutoCancelled });
    } catch (error) {
      console.error("Error saving attendance:", error);
      res.status(500).json({ error: "Failed to save attendance" });
    }
  });

  // Cancel session (holiday/no class)
  router.patch("/api/coach/sessions/:id/cancel", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const { reason } = req.body;

      const { valid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Mark session as cancelled - no credits consumed
      await storage.updateSession(id, { 
        status: "cancelled",
        notes: reason || "Session cancelled" 
      });
      
      // Refund credits for any players who had credits deducted for this session
      const sessionPlayersForRefund = await storage.getSessionPlayers(id);
      let refundedCount = 0;
      
      for (const sp of sessionPlayersForRefund) {
        if (sp.creditDeductedAt) {
          const refundResult = await storage.refundCreditsForSession(sp.playerId, id, academyId);
          if (refundResult.success) {
            refundedCount++;
            console.log(`[Cancel PATCH] Refunded credit to player ${sp.playerId}`);
          }
        }
      }

      // Cancel any unsettled debt for ALL players — including those processed by ensureCreditProcessed.
      for (const sp of sessionPlayersForRefund) {
        const debtResult = await storage.cancelSessionDebt(sp.playerId, id, "session_cancelled_by_admin");
        if (debtResult.cancelled) {
          console.log(`[Cancel PATCH] Cancelled debt for player ${sp.playerId}, session ${id}`);
        }
      }

      // Invalidate server-side caches
      const cancelCoachId = req.user!.coachId || session.coachId;
      if (cancelCoachId) {
        apiCache.invalidate(`series:${cancelCoachId}`);
        apiCache.invalidate(`earnings:${cancelCoachId}`);
        apiCache.invalidate(`calendar:${cancelCoachId}`);
      }
      if (academyId) {
        apiCache.invalidate(`players:${academyId}`);
      }
      
      res.json({ 
        success: true, 
        message: refundedCount > 0 
          ? `Session cancelled. ${refundedCount} credit(s) refunded.`
          : "Session cancelled successfully",
        sessionId: id,
        creditsRefunded: refundedCount
      });
    } catch (error) {
      console.error("Error cancelling session:", error);
      res.status(500).json({ error: "Failed to cancel session" });
    }
  });

  // Restore a cancelled session
  router.patch("/api/coach/sessions/:id/restore", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;

      const { valid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.status !== "cancelled" && session.status !== "skipped") {
        return res.status(400).json({ error: "Session is not cancelled" });
      }

      // Restore session to scheduled status
      await storage.updateSession(id, { status: "scheduled" });

      res.json({ 
        success: true, 
        message: "Session restored successfully",
        sessionId: id,
      });
    } catch (error) {
      console.error("Error restoring session:", error);
      res.status(500).json({ error: "Failed to restore session" });
    }
  });

  // Save feedback and award XP
  router.post("/api/coach/sessions/:id/feedback", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { intensity, mood, focusTags, coachNotes } = req.body;
      const academyId = req.user!.academyId;

      // Get session details with ownership validation
      const { valid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Create feedback record
      const feedback = await storage.createSessionFeedback({
        sessionId: id,
        intensity,
        mood,
        focusTags: JSON.stringify(focusTags || []),
        coachNotes,
      });

      // Auto-fill attendance for players without attendance status (default to 'present')
      try {
        const sessionPlayers = await storage.getSessionPlayersWithPlayerInfo(id);
        for (const sp of sessionPlayers) {
          if (!sp.attendanceStatus || sp.attendanceStatus === 'pending') {
            await storage.updateAttendance(id, sp.playerId!, 'present');
          }
        }
      } catch (attendanceError) {
        console.error("[Attendance] Error auto-filling attendance:", attendanceError);
      }

      // Mark session as completed
      await storage.updateSession(id, { status: "completed" });

      // Award Coach XP based on session type
      const COACH_XP_REWARDS: Record<string, number> = {
        private: 25,
        semi_private: 35,
        group: 50,
        camp: 75,
        team_training: 60,
        clinic: 45,
        match: 30,
        assessment: 40,
      };
      const coachXp = COACH_XP_REWARDS[session.sessionType] || 20;
      
      if (session.coachId) {
        await storage.addCoachXpTransaction({
          coachId: session.coachId,
          xpAmount: coachXp,
          source: "session_feedback",
          description: `Completed ${session.sessionType} session with feedback`,
          sessionId: id,
        });
        
        // Update coach total XP
        const coach = await storage.getCoach(session.coachId);
        if (coach) {
          const newTotalXp = (coach.totalXp || 0) + coachXp;
          let newLevel = 1;
          let xpThreshold = 500;
          let accumulatedXp = 0;
          while (accumulatedXp + xpThreshold <= newTotalXp) {
            accumulatedXp += xpThreshold;
            newLevel++;
            xpThreshold = 500 + (newLevel - 1) * 100;
          }
          await storage.updateCoach(session.coachId, { totalXp: newTotalXp, level: newLevel });
        }
      }

      // Award Player XP for each player in session
      const PLAYER_XP_REWARDS: Record<string, number> = {
        private: 30,
        semi_private: 25,
        group: 20,
        camp: 35,
        team_training: 25,
        clinic: 20,
        match: 40,
        assessment: 15,
      };
      const playerXp = PLAYER_XP_REWARDS[session.sessionType] || 15;
      
      const sessionPlayersList = await storage.getSessionPlayers(id);
      
      for (const sp of sessionPlayersList) {
        if (sp.playerId && sp.attendanceStatus === "present") {
          // Fetch player first to check for birthday bonus
          const player = await storage.getPlayer(sp.playerId);
          const hasBirthdayBonus = player && isBirthdayToday(player.dateOfBirth);
          const xpWithBonus = hasBirthdayBonus ? playerXp * 2 : playerXp;
          const xpDescription = hasBirthdayBonus 
            ? `Attended ${session.sessionType} session (2x Birthday Bonus!)`
            : `Attended ${session.sessionType} session`;
          
          await storage.createXpTransaction({
            playerId: sp.playerId,
            xpAmount: xpWithBonus,
            source: "session_complete",
            description: xpDescription,
            sessionId: id,
          });
          
          // Update player total XP and check for level up
          if (player) {
            const oldLevel = player.level || 1;
            const newTotalXp = (player.totalXp || 0) + xpWithBonus;
            
            // Calculate new level based on XP thresholds
            const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500];
            let newLevel = 1;
            for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
              if (newTotalXp >= LEVEL_THRESHOLDS[i]) {
                newLevel = i + 1;
                break;
              }
            }
            
            await storage.updatePlayer(sp.playerId, { totalXp: newTotalXp, level: newLevel });
            
            // Send level up notification if player leveled up
            if (newLevel > oldLevel) {
              const LEVEL_NAMES = ["Red", "Orange", "Green", "Yellow", "Glow", "Star", "Champion", "Legend", "Master", "Grand Master"];
              const levelName = LEVEL_NAMES[Math.min(newLevel - 1, LEVEL_NAMES.length - 1)] || `Level ${newLevel}`;
              sendLevelUpNotification(sp.playerId, newLevel, levelName).catch(err => 
                console.error("Failed to send level up notification:", err)
              );
              // Send level up email if player has email
              if (player.email) {
                sendLevelUpEmail({
                  to: player.email,
                  playerName: player.name,
                  newLevel: levelName,
                  totalXP: newTotalXp,
                }).catch(err => console.error("Failed to send level up email:", err));
              }
            }
          }
          
        }
      }

      // Send feedback notifications to all attending players (non-blocking)
      const coach = session.coachId ? await storage.getCoach(session.coachId) : null;
      const coachName = coach?.name || "Your coach";
      const sessionDate = new Date(session.startTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      for (const sp of sessionPlayersList) {
        if (sp.playerId && sp.attendanceStatus === "present") {
          sendFeedbackNotification(sp.playerId, coachName, session.name || "Training session").catch(err =>
            console.error("Failed to send feedback notification:", err)
          );
          // Broadcast feedback received via WebSocket for real-time updates
          if (academyId && sp.playerId) {
            broadcastFeedbackReceived(academyId, {
              playerId: sp.playerId,
              sessionId: id,
              coachName,
            });
          }
          // Send feedback email if player has email
          const feedbackPlayer = await storage.getPlayer(sp.playerId);
          if (feedbackPlayer?.email) {
            sendFeedbackNotificationEmail({
              to: feedbackPlayer.email,
              playerName: feedbackPlayer.name,
              sessionDate,
              coachName,
              feedbackSummary: feedback?.coachNotes?.substring(0, 150),
            }).catch(err => console.error("Failed to send feedback email:", err));
          }
        }
      }

      // Fire-and-forget AI session digests for all players after session feedback
      const _feedbackSessionId = id;
      const _feedbackPlayerIds = sessionPlayersList.map((sp) => sp.playerId).filter(Boolean) as string[];
      setImmediate(async () => {
        try {
          const { generateSessionDigest } = await import("../services/ai-progress-engine");
          for (const pid of _feedbackPlayerIds) {
            await generateSessionDigest(_feedbackSessionId, pid);
          }
        } catch { /* non-critical */ }
      });

      res.status(201).json({ 
        feedback, 
        xpAwarded: { coach: coachXp, playerCount: sessionPlayersList.filter(sp => sp.attendanceStatus === "present").length },
        creditsDeducted: [],
      });
    } catch (error) {
      console.error("Error saving feedback:", error);
      res.status(500).json({ error: "Failed to save feedback" });
    }
  });

export default router;
