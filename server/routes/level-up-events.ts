import { Router, Response } from "express";
import { db } from "../db";
import { 
  levelUpEvents, 
  ballLevels, 
  players, 
  roleMessageTemplates,
  levelTrials,
} from "../../shared/schema";
import { eq, and, desc, sql, isNull, or } from "drizzle-orm";
import { AuthenticatedRequest, authMiddlewareWithFreshData as authMiddleware, requireAcademy, validatePlayerOwnership } from "../auth";
import { storage } from "../storage";
import { publishLevelUp } from "../services/feed-publisher";

const router = Router();

// Get player's level-up history
router.get("/api/players/:playerId/level-ups", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    
    // Validate player belongs to this academy
    const ownership = await validatePlayerOwnership(playerId, academyId, storage);
    if (!ownership.valid) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    // ballLevels schema columns: id (e.g. "RED_3"), displayNamePlayer
    // (e.g. "Red 3"), displayNameCoach, stage (RED|ORANGE|GREEN|YELLOW —
    // semantically the "color"). Aliases below preserve the {name,
    // displayName, color} response shape the client already consumes.
    const events = await db
      .select({
        event: levelUpEvents,
        fromLevel: {
          id: ballLevels.id,
          name: ballLevels.id,
          displayName: ballLevels.displayNamePlayer,
          color: ballLevels.stage,
        },
      })
      .from(levelUpEvents)
      .leftJoin(ballLevels, eq(levelUpEvents.fromLevelId, ballLevels.id))
      .where(eq(levelUpEvents.playerId, playerId))
      .orderBy(desc(levelUpEvents.promotedAt));
    
    // Get toLevel for each event
    const eventsWithToLevel = await Promise.all(
      events.map(async (e) => {
        const [toLevel] = await db
          .select({
            id: ballLevels.id,
            name: ballLevels.id,
            displayName: ballLevels.displayNamePlayer,
            color: ballLevels.stage,
          })
          .from(ballLevels)
          .where(eq(ballLevels.id, e.event.toLevelId));
        
        return {
          ...e.event,
          fromLevel: e.fromLevel,
          toLevel,
        };
      })
    );
    
    res.json(eventsWithToLevel);
  } catch (error) {
    console.error("Error fetching level-up history:", error);
    res.status(500).json({ error: "Failed to fetch level-up history" });
  }
});

// Record level-up event
router.post("/api/players/:playerId/level-up", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    const coachId = req.user!.coachId || req.user!.userId;
    
    // Validate player belongs to this academy
    const ownership = await validatePlayerOwnership(playerId, academyId, storage);
    if (!ownership.valid) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const {
      fromLevelId,
      toLevelId,
      trialId,
      xpAwarded,
      badgesAwarded,
      titleUnlocked,
    } = req.body;
    
    if (!fromLevelId || !toLevelId) {
      return res.status(400).json({ error: "fromLevelId and toLevelId are required" });
    }
    
    const [event] = await db
      .insert(levelUpEvents)
      .values({
        playerId,
        fromLevelId,
        toLevelId,
        trialId: trialId || null,
        xpAwarded: xpAwarded || calculateXpReward(fromLevelId, toLevelId),
        badgesAwarded: badgesAwarded || [generateBadge(toLevelId)],
        titleUnlocked: titleUnlocked || generateTitle(toLevelId),
        celebrationShown: false,
        playerNotified: false,
        parentNotified: false,
        promotedBy: coachId,
      })
      .returning();

    if (event?.id) {
      publishLevelUp(event.id).catch(() => {});
    }

    res.status(201).json(event);
  } catch (error) {
    console.error("Error recording level-up:", error);
    res.status(500).json({ error: "Failed to record level-up" });
  }
});

// Mark celebration as shown
router.post("/api/level-ups/:eventId/celebration-shown", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventId } = req.params;
    const academyId = req.user!.academyId;
    
    // Get event with player info for ownership check
    const [existingEvent] = await db
      .select({
        event: levelUpEvents,
        playerAcademyId: players.academyId,
      })
      .from(levelUpEvents)
      .leftJoin(players, eq(levelUpEvents.playerId, players.id))
      .where(eq(levelUpEvents.id, eventId));
    
    if (!existingEvent) {
      return res.status(404).json({ error: "Level-up event not found" });
    }
    
    // Validate player belongs to this academy
    if (existingEvent.playerAcademyId !== academyId) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const [event] = await db
      .update(levelUpEvents)
      .set({
        celebrationShown: true,
        celebrationShownAt: new Date(),
      })
      .where(eq(levelUpEvents.id, eventId))
      .returning();
    
    res.json(event);
  } catch (error) {
    console.error("Error marking celebration:", error);
    res.status(500).json({ error: "Failed to mark celebration" });
  }
});

// Get pending celebrations for player
router.get("/api/players/:playerId/pending-celebrations", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    
    // Validate player belongs to this academy
    const ownership = await validatePlayerOwnership(playerId, academyId, storage);
    if (!ownership.valid) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const pending = await db
      .select({
        event: levelUpEvents,
        toLevel: {
          id: ballLevels.id,
          name: ballLevels.id,
          displayName: ballLevels.displayNamePlayer,
          color: ballLevels.stage,
        },
      })
      .from(levelUpEvents)
      .leftJoin(ballLevels, eq(levelUpEvents.toLevelId, ballLevels.id))
      .where(and(
        eq(levelUpEvents.playerId, playerId),
        eq(levelUpEvents.celebrationShown, false)
      ))
      .orderBy(desc(levelUpEvents.promotedAt));
    
    res.json(pending);
  } catch (error) {
    console.error("Error fetching pending celebrations:", error);
    res.status(500).json({ error: "Failed to fetch pending celebrations" });
  }
});

// ==================== ROLE MESSAGE TEMPLATES ====================

// Get role message for a template key
router.get("/api/messages/:templateKey", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { templateKey } = req.params;
    const { role, ...placeholderValues } = req.query;
    const academyId = req.user!.academyId;
    
    // Try academy-specific first, then global
    const templates = await db
      .select()
      .from(roleMessageTemplates)
      .where(and(
        eq(roleMessageTemplates.templateKey, templateKey),
        or(
          eq(roleMessageTemplates.academyId, academyId!),
          isNull(roleMessageTemplates.academyId)
        ),
        eq(roleMessageTemplates.isActive, true)
      ));
    
    // Prefer academy-specific
    const template = templates.find(t => t.academyId === academyId) || templates[0];
    
    if (!template) {
      return res.status(404).json({ error: "Message template not found" });
    }
    
    // Get message for role
    let message: string;
    switch (role) {
      case "coach":
        message = template.coachMessage;
        break;
      case "player":
        message = template.playerMessage;
        break;
      case "parent":
        message = template.parentMessage;
        break;
      default:
        message = template.playerMessage;
    }
    
    // Replace placeholders
    for (const [key, value] of Object.entries(placeholderValues)) {
      message = message.replace(new RegExp(`\\{${key}\\}`, "g"), value as string);
    }
    
    res.json({
      message,
      template: {
        key: template.templateKey,
        category: template.category,
      },
    });
  } catch (error) {
    console.error("Error fetching message:", error);
    res.status(500).json({ error: "Failed to fetch message" });
  }
});

// Get all messages for a template (all roles)
router.get("/api/messages/:templateKey/all-roles", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { templateKey } = req.params;
    const academyId = req.user!.academyId;
    
    const templates = await db
      .select()
      .from(roleMessageTemplates)
      .where(and(
        eq(roleMessageTemplates.templateKey, templateKey),
        or(
          eq(roleMessageTemplates.academyId, academyId!),
          isNull(roleMessageTemplates.academyId)
        ),
        eq(roleMessageTemplates.isActive, true)
      ));
    
    const template = templates.find(t => t.academyId === academyId) || templates[0];
    
    if (!template) {
      return res.status(404).json({ error: "Message template not found" });
    }
    
    res.json({
      coach: template.coachMessage,
      player: template.playerMessage,
      parent: template.parentMessage,
      placeholders: template.placeholders,
      category: template.category,
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Helper functions
function calculateXpReward(fromLevel: string, toLevel: string): number {
  const levelOrder = [
    "RED_3", "RED_2", "RED_1",
    "ORANGE_3", "ORANGE_2", "ORANGE_1",
    "GREEN_3", "GREEN_2", "GREEN_1",
    "YELLOW_3", "YELLOW_2", "YELLOW_1",
  ];
  
  const fromIndex = levelOrder.indexOf(fromLevel);
  const toIndex = levelOrder.indexOf(toLevel);
  
  if (fromIndex === -1 || toIndex === -1) return 100;
  
  // Base XP + bonus for higher levels
  return 100 + (toIndex * 25);
}

function generateBadge(levelId: string): string {
  const stage = levelId.split("_")[0];
  const tier = levelId.split("_")[1];
  
  const badgeNames: Record<string, string> = {
    RED_3: "Rally Starter",
    RED_2: "Rally Builder",
    RED_1: "Rally Master",
    ORANGE_3: "Court Explorer",
    ORANGE_2: "Court Navigator",
    ORANGE_1: "Court Commander",
    GREEN_3: "Baseline Beginner",
    GREEN_2: "Baseline Warrior",
    GREEN_1: "Baseline Champion",
    YELLOW_3: "Match Ready",
    YELLOW_2: "Match Player",
    YELLOW_1: "Match Champion",
  };
  
  return badgeNames[levelId] || `${stage} ${tier} Badge`;
}

function generateTitle(levelId: string): string {
  const titles: Record<string, string> = {
    RED_3: "Rookie Player",
    RED_2: "Rising Star",
    RED_1: "Red Ball Champion",
    ORANGE_3: "Orange Explorer",
    ORANGE_2: "Orange Warrior",
    ORANGE_1: "Orange Ball Champion",
    GREEN_3: "Green Challenger",
    GREEN_2: "Green Competitor",
    GREEN_1: "Green Ball Champion",
    YELLOW_3: "Yellow Contender",
    YELLOW_2: "Yellow Competitor",
    YELLOW_1: "Yellow Ball Champion",
  };
  
  return titles[levelId] || "Tennis Player";
}

export default router;
