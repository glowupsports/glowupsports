import { Router, Response } from "express";
import { db } from "../db";
import { 
  players,
  sessions,
  sessionFeedback,
  sessionRatings,
  playerBallLevels,
  ballLevels,
  levelUpEvents,
  messages,
  users,
} from "@shared/schema";
import { eq, and, desc, or, sql, inArray } from "drizzle-orm";
import { AuthenticatedRequest, authMiddlewareWithFreshData as authMiddleware } from "../auth";
import { storage } from "../storage";
import { getFamilyMemberIds } from "../lib/family-groups";

const router = Router();

function splitName(name: string | null | undefined): { firstName: string; lastName: string } {
  const trimmed = (name || "").trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function getCallerChildPlayerIds(userId: string): Promise<string[]> {
  const freshUser = await storage.getUserById(userId);
  if (!freshUser || !freshUser.playerId) return [];

  // Primary source: family_members.
  const memberIds = await getFamilyMemberIds(freshUser.playerId).catch(() => [] as string[]);
  const others = memberIds.filter((id) => id !== freshUser.playerId);
  if (others.length > 0) return others;

  // Fallback: legacy email-based link (player.parentEmail = caller email,
  // OR shared-email siblings). This keeps the legacy /api/parent/* endpoints
  // working even before backfill has touched a given account.
  const callerPlayer = await storage.getPlayer(freshUser.playerId);
  const callerEmail = (callerPlayer?.email || freshUser.email || "").trim().toLowerCase();
  if (!callerEmail) return [];
  const linkedRows = await db
    .select({ id: players.id })
    .from(players)
    .where(
      or(
        sql`LOWER(TRIM(${players.parentEmail})) = ${callerEmail}`,
        and(sql`LOWER(TRIM(${players.email})) = ${callerEmail}`, sql`${players.id} <> ${freshUser.playerId}`),
      ),
    );
  return linkedRows.map((r) => r.id);
}

// Returns true if `playerId` is a member of the caller's family (excluding
// the caller themselves — i.e. a "child" in the legacy parent-portal sense).
async function isCallerChildOf(userId: string, playerId: string): Promise<boolean> {
  const ids = await getCallerChildPlayerIds(userId);
  return ids.includes(playerId);
}

router.get("/api/parent/children", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const childIds = await getCallerChildPlayerIds(userId);
    if (childIds.length === 0) return res.json([]);

    const children = await db
      .select({
        id: players.id,
        name: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
        ballLevel: players.ballLevel,
      })
      .from(players)
      .where(inArray(players.id, childIds));

    const childrenWithProgress = await Promise.all(children.map(async (child) => {
      const [level] = await db
        .select({
          levelId: playerBallLevels.levelId,
          status: playerBallLevels.status,
          progressPercentage: playerBallLevels.progressPercentage,
        })
        .from(playerBallLevels)
        .where(and(
          eq(playerBallLevels.playerId, child.id),
          or(
            eq(playerBallLevels.status, "active"),
            eq(playerBallLevels.status, "trial")
          )
        ))
        .orderBy(desc(playerBallLevels.activatedAt))
        .limit(1);

      const { firstName, lastName } = splitName(child.name);
      return {
        ...child,
        firstName,
        lastName,
        photoUrl: child.profilePhotoUrl,
        currentLevel: level?.levelId || child.ballLevel || "RED_3",
        levelStatus: level?.status || "active",
        progressPercentage: level?.progressPercentage || 0,
      };
    }));
    
    res.json(childrenWithProgress);
  } catch (error) {
    console.error("Error fetching children:", error);
    res.status(500).json({ error: "Failed to fetch children" });
  }
});

router.get("/api/parent/children/:playerId/progress", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { playerId } = req.params;

    if (!(await isCallerChildOf(userId, playerId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const [child] = await db.select().from(players).where(eq(players.id, playerId));
    if (!child) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    const [currentLevel] = await db
      .select({
        levelId: playerBallLevels.levelId,
        status: playerBallLevels.status,
        progressPercentage: playerBallLevels.progressPercentage,
        trialEndsAt: playerBallLevels.trialEndsAt,
      })
      .from(playerBallLevels)
      .where(and(
        eq(playerBallLevels.playerId, playerId),
        or(
          eq(playerBallLevels.status, "active"),
          eq(playerBallLevels.status, "trial")
        )
      ))
      .orderBy(desc(playerBallLevels.activatedAt))
      .limit(1);
    
    const levelInfo = currentLevel ? await db
      .select()
      .from(ballLevels)
      .where(eq(ballLevels.id, currentLevel.levelId)) : [];
    
    const recentEvents = await db
      .select()
      .from(levelUpEvents)
      .where(eq(levelUpEvents.playerId, playerId))
      .orderBy(desc(levelUpEvents.triggeredAt))
      .limit(5);
    
    const { firstName, lastName } = splitName(child.name);
    res.json({
      player: {
        id: child.id,
        name: child.name,
        firstName,
        lastName,
        photoUrl: child.profilePhotoUrl,
        profilePhotoUrl: child.profilePhotoUrl,
      },
      currentLevel: currentLevel || { levelId: child.ballLevel || "RED_3", status: "active", progressPercentage: 0 },
      levelDetails: levelInfo[0] || null,
      recentEvents,
    });
  } catch (error) {
    console.error("Error fetching child progress:", error);
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});

router.get("/api/parent/children/:playerId/sessions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { playerId } = req.params;
    const { limit = "10" } = req.query;

    if (!(await isCallerChildOf(userId, playerId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const recentSessions = await db
      .select({
        id: sessions.id,
        date: sessions.date,
        startTime: sessions.startTime,
        endTime: sessions.endTime,
        status: sessions.status,
        type: sessions.type,
      })
      .from(sessions)
      .where(sql`${playerId} = ANY(${sessions.playerIds})`)
      .orderBy(desc(sessions.date))
      .limit(parseInt(limit as string));
    
    const sessionsWithFeedback = await Promise.all(recentSessions.map(async (session) => {
      const [feedback] = await db
        .select()
        .from(sessionFeedback)
        .where(and(
          eq(sessionFeedback.sessionId, session.id),
          eq(sessionFeedback.playerId, playerId)
        ));
      
      return {
        ...session,
        feedback: feedback || null,
      };
    }));
    
    res.json(sessionsWithFeedback);
  } catch (error) {
    console.error("Error fetching child sessions:", error);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

router.get("/api/parent/children/:playerId/feedback", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { playerId } = req.params;
    const { limit = "10" } = req.query;

    if (!(await isCallerChildOf(userId, playerId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const feedback = await db
      .select({
        id: sessionFeedback.id,
        sessionId: sessionFeedback.sessionId,
        rating: sessionFeedback.rating,
        feedback: sessionFeedback.feedback,
        parentTaalFeedback: sessionFeedback.parentTaalFeedback,
        createdAt: sessionFeedback.createdAt,
      })
      .from(sessionFeedback)
      .where(eq(sessionFeedback.playerId, playerId))
      .orderBy(desc(sessionFeedback.createdAt))
      .limit(parseInt(limit as string));
    
    res.json(feedback);
  } catch (error) {
    console.error("Error fetching feedback:", error);
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

router.get("/api/parent/messages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    
    const parentMessages = await db
      .select({
        id: messages.id,
        content: messages.content,
        createdAt: messages.createdAt,
        readAt: messages.readAt,
        senderName: users.displayName,
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.receiverId, userId))
      .orderBy(desc(messages.createdAt))
      .limit(20);
    
    res.json(parentMessages);
  } catch (error) {
    console.error("Error fetching parent messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// GET /api/parent/children/:playerId/session-ratings — parent view of child's self-submitted lesson ratings
router.get("/api/parent/children/:playerId/session-ratings", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { playerId } = req.params;
    const { limit = "10" } = req.query;

    // Verify the player belongs to this caller's family
    if (!(await isCallerChildOf(userId, playerId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const ratings = await db
      .select({
        id: sessionRatings.id,
        sessionId: sessionRatings.sessionId,
        rating: sessionRatings.rating,
        comment: sessionRatings.comment,
        createdAt: sessionRatings.createdAt,
      })
      .from(sessionRatings)
      .where(eq(sessionRatings.playerId, playerId))
      .orderBy(desc(sessionRatings.createdAt))
      .limit(parseInt(limit as string));

    return res.json({ ratings });
  } catch (error) {
    console.error("Error fetching child session ratings:", error);
    return res.status(500).json({ error: "Failed to fetch ratings" });
  }
});

export default router;
