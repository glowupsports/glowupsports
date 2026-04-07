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
import { eq, and, desc, gte, or, sql } from "drizzle-orm";
import { AuthenticatedRequest, authMiddlewareWithFreshData as authMiddleware } from "../auth";

const router = Router();

router.get("/api/parent/children", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const children = await db
      .select({
        id: players.id,
        firstName: players.firstName,
        lastName: players.lastName,
        photoUrl: players.photoUrl,
        ballLevel: players.ballLevel,
      })
      .from(players)
      .where(eq(players.parentUserId, userId));
    
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
      
      return {
        ...child,
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
    const userId = req.user!.id;
    const { playerId } = req.params;
    
    const [child] = await db
      .select()
      .from(players)
      .where(and(
        eq(players.id, playerId),
        eq(players.parentUserId, userId)
      ));
    
    if (!child) {
      return res.status(403).json({ error: "Access denied" });
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
    
    res.json({
      player: {
        id: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        photoUrl: child.photoUrl,
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
    const userId = req.user!.id;
    const { playerId } = req.params;
    const { limit = "10" } = req.query;
    
    const [child] = await db
      .select()
      .from(players)
      .where(and(
        eq(players.id, playerId),
        eq(players.parentUserId, userId)
      ));
    
    if (!child) {
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
    const userId = req.user!.id;
    const { playerId } = req.params;
    const { limit = "10" } = req.query;
    
    const [child] = await db
      .select()
      .from(players)
      .where(and(
        eq(players.id, playerId),
        eq(players.parentUserId, userId)
      ));
    
    if (!child) {
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
    const userId = req.user!.id;
    
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
    const userId = req.user!.id;
    const { playerId } = req.params;
    const { limit = "10" } = req.query;

    // Verify the player belongs to this parent
    const [child] = await db
      .select()
      .from(players)
      .where(and(
        eq(players.id, playerId),
        eq(players.parentUserId, userId)
      ));

    if (!child) {
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
