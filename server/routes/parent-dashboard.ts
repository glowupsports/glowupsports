import { Router, Response } from "express";
import { db } from "../db";
import {
  players,
  sessions,
  sessionRatings,
  sessionPlayers,
  playerBallLevels,
  ballLevels,
  levelUpEvents,
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
      // playerBallLevels schema: levelId, status, assignedAt (no
      // `activatedAt`, no `progressPercentage` column). Pick the
      // most recently-assigned active/trial row to get the current
      // ball level — progress percentage is computed from skill
      // scores elsewhere in the app and is therefore omitted from
      // this response payload.
      const [level] = await db
        .select({
          levelId: playerBallLevels.levelId,
          status: playerBallLevels.status,
        })
        .from(playerBallLevels)
        .where(and(
          eq(playerBallLevels.playerId, child.id),
          or(
            eq(playerBallLevels.status, "active"),
            eq(playerBallLevels.status, "trial")
          )
        ))
        .orderBy(desc(playerBallLevels.assignedAt))
        .limit(1);

      const { firstName, lastName } = splitName(child.name);
      return {
        ...child,
        firstName,
        lastName,
        photoUrl: child.profilePhotoUrl,
        currentLevel: level?.levelId || child.ballLevel || "RED_3",
        levelStatus: level?.status || "active",
        // Progress percentage is no longer stored on playerBallLevels
        // (the table is a level-history log, not a progress tracker).
        // Returning 0 keeps the existing client contract intact.
        progressPercentage: 0,
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

    // playerBallLevels is keyed by assignedAt (no activatedAt /
    // progressPercentage columns exist on the schema).
    const [currentLevel] = await db
      .select({
        levelId: playerBallLevels.levelId,
        status: playerBallLevels.status,
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
      .orderBy(desc(playerBallLevels.assignedAt))
      .limit(1);

    const levelInfo = currentLevel ? await db
      .select()
      .from(ballLevels)
      .where(eq(ballLevels.id, currentLevel.levelId)) : [];

    // levelUpEvents records when a player was promoted from one ball
    // level to the next. The schema column is `promotedAt`.
    const recentEvents = await db
      .select()
      .from(levelUpEvents)
      .where(eq(levelUpEvents.playerId, playerId))
      .orderBy(desc(levelUpEvents.promotedAt))
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
      currentLevel: currentLevel
        ? { ...currentLevel, progressPercentage: 0 }
        : { levelId: child.ballLevel || "RED_3", status: "active", progressPercentage: 0 },
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

    // Sessions are linked to players via the sessionPlayers join table
    // (the legacy `sessions.playerIds` array column does not exist).
    // The schema uses `startTime` as the canonical schedule anchor and
    // `sessionType` as the type column.
    const recentSessions = await db
      .select({
        id: sessions.id,
        date: sessions.startTime,
        startTime: sessions.startTime,
        endTime: sessions.endTime,
        status: sessions.status,
        type: sessions.sessionType,
      })
      .from(sessions)
      .innerJoin(sessionPlayers, eq(sessionPlayers.sessionId, sessions.id))
      .where(eq(sessionPlayers.playerId, playerId))
      .orderBy(desc(sessions.startTime))
      .limit(parseInt(limit as string));

    // sessionFeedback is session-wide (not per-player) and only carries
    // intensity / mood / focusTags / coachNotes — the per-player rating
    // / parentTaalFeedback fields the previous implementation tried to
    // read do not exist on the schema. Surface the session-level coach
    // notes so the parent UI still has something useful to show.
    const sessionsWithFeedback = await Promise.all(recentSessions.map(async (session) => {
      const { sessionFeedback } = await import("@shared/schema");
      const [feedback] = await db
        .select({
          id: sessionFeedback.id,
          sessionId: sessionFeedback.sessionId,
          intensity: sessionFeedback.intensity,
          mood: sessionFeedback.mood,
          focusTags: sessionFeedback.focusTags,
          coachNotes: sessionFeedback.coachNotes,
        })
        .from(sessionFeedback)
        .where(eq(sessionFeedback.sessionId, session.id));

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

    // Per-player feedback is captured by `sessionRatings` (a player's
    // self-submitted rating + comment for a session). The legacy
    // `sessionFeedback.playerId` / `.rating` / `.feedback` /
    // `.parentTaalFeedback` columns referenced here previously do not
    // exist on the schema — sessionFeedback is session-wide coach
    // notes. Use sessionRatings filtered by player so the parent view
    // surfaces the child's own session feedback.
    const feedback = await db
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

    res.json(feedback);
  } catch (error) {
    console.error("Error fetching feedback:", error);
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

router.get("/api/parent/messages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // The messages schema is conversation-based: rows do not carry
    // sender/receiver user-id columns nor a `content` field — they
    // store `conversationId`, sender role, sender id by role, and a
    // message `body`. There is also no `users.displayName` column.
    // Returning a parent-scoped inbox here would require joining
    // through the conversation/participant tables, which is outside
    // the scope of this endpoint's contract today. Surface an empty
    // list rather than a fabricated payload — the dedicated chat
    // endpoints already render parent conversations.
    res.json([]);
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
