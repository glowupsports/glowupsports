import { Router, Response } from "express";
import { db } from "../db";
import { matchLogs, players, sessions, coaches } from "../../shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { AuthenticatedRequest, authMiddlewareWithFreshData as authMiddleware, requireAcademy, validatePlayerOwnership, validateSessionOwnership } from "../auth";
import { storage } from "../storage";
import { fireQuestEvent } from "../services/quest-events";
import { publishMatchResult } from "../services/feed-publisher";

const router = Router();

// Get player's match history
router.get("/api/players/:playerId/matches", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    const { limit = "20", offset = "0" } = req.query;
    
    // Validate player belongs to this academy
    const ownership = await validatePlayerOwnership(playerId, academyId, storage);
    if (!ownership.valid) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const matches = await db
      .select()
      .from(matchLogs)
      .where(eq(matchLogs.playerId, playerId))
      .orderBy(desc(matchLogs.playedAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));
    
    // Calculate stats
    const stats = {
      totalMatches: matches.length,
      wins: matches.filter(m => m.result === "won").length,
      losses: matches.filter(m => m.result === "lost").length,
      draws: matches.filter(m => m.result === "draw").length,
      winRate: matches.length > 0 
        ? Math.round((matches.filter(m => m.result === "won").length / matches.length) * 100) 
        : 0,
    };
    
    res.json({ matches, stats });
  } catch (error) {
    console.error("Error fetching match history:", error);
    res.status(500).json({ error: "Failed to fetch match history" });
  }
});

// Log a new match
router.post("/api/players/:playerId/matches", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    const coachId = req.user!.coachId || req.user!.id;
    
    // Validate player belongs to this academy
    const ownership = await validatePlayerOwnership(playerId, academyId, storage);
    if (!ownership.valid) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const {
      sessionId,
      matchType,
      matchFormat,
      courtSurface,
      ballType,
      opponentName,
      opponentPlayerId,
      opponentLevel,
      playerScore,
      opponentScore,
      result,
      aces,
      doubleFaults,
      winners,
      unforcedErrors,
      observations,
      coachNotes,
      playedAt,
      duration,
    } = req.body;
    
    // Validate required fields
    if (!matchType || !matchFormat || !playerScore || !opponentScore || !result) {
      return res.status(400).json({ error: "Missing required match data" });
    }
    
    // Validate sessionId belongs to this academy if provided
    if (sessionId) {
      const sessionOwnership = await validateSessionOwnership(sessionId, academyId, storage);
      if (!sessionOwnership.valid) {
        return res.status(403).json({ error: "Session access denied" });
      }
    }
    
    const [match] = await db
      .insert(matchLogs)
      .values({
        playerId,
        sessionId: sessionId || null,
        coachId,
        matchType,
        matchFormat,
        courtSurface,
        ballType,
        opponentName,
        opponentPlayerId: opponentPlayerId || null,
        opponentLevel,
        playerScore: playerScore,
        opponentScore: opponentScore,
        result,
        aces: aces || 0,
        doubleFaults: doubleFaults || 0,
        winners: winners || 0,
        unforcedErrors: unforcedErrors || 0,
        observations: observations || null,
        coachNotes,
        playedAt: playedAt ? new Date(playedAt) : new Date(),
        duration,
      })
      .returning();

    fireQuestEvent(playerId, "log_match").catch(() => {});
    if (result === "won") {
      fireQuestEvent(playerId, "win_match").catch(() => {});
    }
    if (match?.id) {
      publishMatchResult(match.id).catch(() => {});
    }

    res.status(201).json(match);
  } catch (error) {
    console.error("Error logging match:", error);
    res.status(500).json({ error: "Failed to log match" });
  }
});

// Get single match details
router.get("/api/matches/:matchId", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { matchId } = req.params;
    const academyId = req.user!.academyId;
    
    // Get match with player info for ownership check
    const [match] = await db
      .select({
        match: matchLogs,
        playerAcademyId: players.academyId,
      })
      .from(matchLogs)
      .leftJoin(players, eq(matchLogs.playerId, players.id))
      .where(eq(matchLogs.id, matchId));
    
    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }
    
    // Validate player belongs to this academy
    if (match.playerAcademyId !== academyId) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    res.json(match.match);
  } catch (error) {
    console.error("Error fetching match:", error);
    res.status(500).json({ error: "Failed to fetch match" });
  }
});

// Update match (add notes, fix scores)
router.patch("/api/matches/:matchId", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { matchId } = req.params;
    const academyId = req.user!.academyId;
    const updates = req.body;
    
    // Get match with player info for ownership check
    const [existingMatch] = await db
      .select({
        match: matchLogs,
        playerAcademyId: players.academyId,
      })
      .from(matchLogs)
      .leftJoin(players, eq(matchLogs.playerId, players.id))
      .where(eq(matchLogs.id, matchId));
    
    if (!existingMatch) {
      return res.status(404).json({ error: "Match not found" });
    }
    
    // Validate player belongs to this academy
    if (existingMatch.playerAcademyId !== academyId) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    // Clean up updates
    const cleanUpdates: any = { updatedAt: new Date() };
    
    if (updates.coachNotes !== undefined) cleanUpdates.coachNotes = updates.coachNotes;
    if (updates.observations) cleanUpdates.observations = updates.observations;
    if (updates.aces !== undefined) cleanUpdates.aces = updates.aces;
    if (updates.doubleFaults !== undefined) cleanUpdates.doubleFaults = updates.doubleFaults;
    if (updates.winners !== undefined) cleanUpdates.winners = updates.winners;
    if (updates.unforcedErrors !== undefined) cleanUpdates.unforcedErrors = updates.unforcedErrors;
    
    const [match] = await db
      .update(matchLogs)
      .set(cleanUpdates)
      .where(eq(matchLogs.id, matchId))
      .returning();
    
    res.json(match);
  } catch (error) {
    console.error("Error updating match:", error);
    res.status(500).json({ error: "Failed to update match" });
  }
});

// Get session matches
router.get("/api/sessions/:sessionId/matches", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const academyId = req.user!.academyId;
    
    // Validate session belongs to this academy
    const ownership = await validateSessionOwnership(sessionId, academyId, storage);
    if (!ownership.valid) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const matches = await db
      .select()
      .from(matchLogs)
      .where(eq(matchLogs.sessionId, sessionId))
      .orderBy(desc(matchLogs.playedAt));
    
    res.json(matches);
  } catch (error) {
    console.error("Error fetching session matches:", error);
    res.status(500).json({ error: "Failed to fetch session matches" });
  }
});

export default router;
