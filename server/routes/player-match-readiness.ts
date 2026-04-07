import { Router } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { playerMatchReadiness, tournamentMatches } from "../../shared/schema";
import { eq, and, desc, gte, lte, or } from "drizzle-orm";
import { buildMatchReadinessScore } from "../services/ai-progress-engine";
import {
  authMiddlewareWithFreshData as authMiddleware,
  validatePlayerOwnership,
  type JWTPayload,
} from "../auth";
import type { Request, Response } from "express";

interface AuthRequest extends Request {
  user?: JWTPayload;
}

const router = Router();

/**
 * Shared authorization helper for readiness endpoints.
 * - Players may only access their own readiness card.
 * - Coaches and admins may only access players within their own academy.
 * - Platform owners may access any player.
 */
async function authorizeReadinessAccess(
  req: AuthRequest,
  res: Response,
  playerId: string
): Promise<boolean> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }

  // Platform-level owners have unrestricted access
  if (user.role === "platform_owner") {
    return true;
  }

  // Players may only access their own card
  if (user.role === "player") {
    if (user.playerId !== playerId) {
      res.status(403).json({ error: "Access denied" });
      return false;
    }
    return true;
  }

  // Coaches, admins, academy owners: must belong to the same academy as the player
  if (
    user.role === "coach" ||
    user.role === "admin" ||
    user.role === "academy_owner" ||
    user.role === "owner"
  ) {
    const { valid } = await validatePlayerOwnership(
      playerId,
      user.academyId ?? null,
      storage
    );
    if (!valid) {
      res.status(403).json({ error: "Access denied" });
      return false;
    }
    return true;
  }

  res.status(403).json({ error: "Access denied" });
  return false;
}

// GET /api/players/:playerId/match-readiness
router.get("/:playerId/match-readiness", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const { force } = req.query;

    if (!(await authorizeReadinessAccess(req, res, playerId))) return;

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const upcomingMatches = await db
      .select({
        id: tournamentMatches.id,
        scheduledTime: tournamentMatches.scheduledTime,
        status: tournamentMatches.status,
      })
      .from(tournamentMatches)
      .where(
        and(
          or(
            eq(tournamentMatches.player1Id, playerId),
            eq(tournamentMatches.player2Id, playerId)
          ),
          eq(tournamentMatches.status, "scheduled"),
          gte(tournamentMatches.scheduledTime, now),
          lte(tournamentMatches.scheduledTime, in24h)
        )
      )
      .orderBy(tournamentMatches.scheduledTime)
      .limit(1);

    if (upcomingMatches.length === 0) {
      return res.json(null);
    }

    const upcomingMatch = upcomingMatches[0];
    const matchDateStr = upcomingMatch.scheduledTime
      ? upcomingMatch.scheduledTime.toISOString().split("T")[0]
      : now.toISOString().split("T")[0];

    // Check for any existing card (including dismissed) for this match date
    if (force !== "1") {
      const [existing] = await db
        .select()
        .from(playerMatchReadiness)
        .where(
          and(
            eq(playerMatchReadiness.playerId, playerId),
            eq(playerMatchReadiness.matchDate, matchDateStr)
          )
        )
        .orderBy(desc(playerMatchReadiness.createdAt))
        .limit(1);

      if (existing) {
        // If already dismissed, don't show again for this match window
        if (existing.dismissed) return res.json(null);
        return res.json(existing);
      }
    }

    // Generate a new readiness card
    const result = await buildMatchReadinessScore(playerId);
    if (!result) return res.json(null);

    const expiresAt = new Date(
      upcomingMatch.scheduledTime
        ? upcomingMatch.scheduledTime.getTime() + 4 * 60 * 60 * 1000
        : now.getTime() + 28 * 60 * 60 * 1000
    );

    const [inserted] = await db
      .insert(playerMatchReadiness)
      .values({
        playerId,
        tournamentMatchId: upcomingMatch.id,
        matchDate: matchDateStr,
        readinessScore: result.readinessScore,
        topStrength: result.topStrength,
        biggestGap: result.biggestGap,
        tacticalTips: result.tacticalTips,
        dismissed: false,
        expiresAt,
      })
      .returning();

    return res.json(inserted);
  } catch (error) {
    console.error("[MatchReadiness] Error getting match readiness:", error);
    return res.status(500).json({ error: "Failed to get match readiness" });
  }
});

// POST /api/players/:playerId/match-readiness/:readinessId/dismiss
router.post("/:playerId/match-readiness/:readinessId/dismiss", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { playerId, readinessId } = req.params;

    if (!(await authorizeReadinessAccess(req, res, playerId))) return;

    await db
      .update(playerMatchReadiness)
      .set({ dismissed: true })
      .where(
        and(
          eq(playerMatchReadiness.id, readinessId),
          eq(playerMatchReadiness.playerId, playerId)
        )
      );

    return res.json({ success: true });
  } catch (error) {
    console.error("[MatchReadiness] Error dismissing readiness card:", error);
    return res.status(500).json({ error: "Failed to dismiss readiness card" });
  }
});

export default router;
