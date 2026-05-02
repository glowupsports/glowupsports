/**
 * Task #1531 / #1549 — Smart Glow Level Assessment
 *
 * GET  /api/player/me/glow-assessment-status   — check if player can retake
 * POST /api/player/me/glow-assessment          — submit self-assessment result
 *
 * Task #1549 additions:
 * - Self-assessment result is capped at rank 3 (server-enforced)
 * - Players who have attended at least one lesson are blocked from retaking
 *   (coach manages their rank from that point onwards)
 */

import { Router } from "express";
import { db } from "../db";
import { players, sessionPlayers, sessions } from "@shared/schema";
import { eq, and, count } from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
} from "../auth";

const router = Router();
router.use(authMiddleware);

// ─── SELF-ASSESSMENT RANK CAP ─────────────────────────────────────────────────
// Self-assessments can suggest at most rank 3.
// Ranks 1 and 2 require coach assessment or match data.
const SELF_ASSESSMENT_MIN_RANK = 3; // lower number = better; cap means never better than 3

// ─── GLOW RANK METADATA ──────────────────────────────────────────────────────
export const GLOW_RANK_META: Record<
  number,
  { name: string; color: string; description: string }
> = {
  9: { name: "Absolute Beginner", color: "#6B7280", description: "Just starting out — welcome to tennis!" },
  8: { name: "Beginner+",        color: "#10B981", description: "Getting comfortable with the basics." },
  7: { name: "Intermediate",     color: "#F59E0B", description: "Rallying consistently and learning tactics." },
  6: { name: "Competitive",      color: "#3B82F6", description: "Club play and local tournaments." },
  5: { name: "Performance",      color: "#8B5CF6", description: "Regional competition level." },
  4: { name: "Elite Performance",color: "#EC4899", description: "High-level national competition." },
  3: { name: "Elite",            color: "#EF4444", description: "National ranking, elite circuit." },
  2: { name: "Performance Talent",color: "#F97316", description: "Pro pathway player." },
  1: { name: "Elite Semi-Pro",   color: "#FFD700", description: "Semi-professional competition." },
};

// ─── Helper: count attended sessions for player ───────────────────────────────
// Throws on DB error — callers must handle and fail closed (deny assessment).
async function getPlayerSessionCount(playerId: string): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(sessionPlayers)
    .innerJoin(sessions, eq(sessions.id, sessionPlayers.sessionId))
    .where(
      and(
        eq(sessionPlayers.playerId, playerId),
        eq(sessions.status, "completed"),
      ),
    );
  return result?.count ?? 0;
}

/**
 * GET /api/player/me/glow-assessment-status
 *
 * Returns whether the player is eligible to take the self-assessment.
 * Once a player has attended at least one lesson, the coach manages their rank.
 */
router.get("/api/player/me/glow-assessment-status", async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    if (!user.playerId) {
      return res.status(403).json({ error: "Player account required" });
    }

    // Fail closed: if session-count query fails, deny eligibility with 500.
    let sessionCount: number;
    try {
      sessionCount = await getPlayerSessionCount(user.playerId);
    } catch (err) {
      console.error("[glow-assessment] Unable to verify assessment eligibility:", err);
      return res.status(500).json({ error: "Unable to verify assessment eligibility" });
    }
    const hasHadLessons = sessionCount > 0;

    return res.json({ hasHadLessons, sessionCount });
  } catch (err) {
    console.error("[glow-assessment] GET status error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/player/me/glow-assessment
 *
 * Body:
 *   suggestedRank  {number}  1–9 — rank derived by the client from questionnaire
 *   applyRank      {boolean} — if true, persist the suggested rank
 *   answers        {Record<string, string>} — raw answers for audit (optional)
 *
 * Returns:
 *   suggestedRank, rankName, color, description, applied, currentRank, cappedByPolicy
 */
router.post("/api/player/me/glow-assessment", async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    if (!user.playerId) {
      return res.status(403).json({ error: "Player account required" });
    }

    // Block if player has already had lessons — coach manages rank from here.
    // Fail closed: if the session count query fails, deny access with 500.
    let sessionCount: number;
    try {
      sessionCount = await getPlayerSessionCount(user.playerId);
    } catch (err) {
      console.error("[glow-assessment] Unable to verify assessment eligibility:", err);
      return res.status(500).json({ error: "Unable to verify assessment eligibility" });
    }
    if (sessionCount > 0) {
      return res.status(403).json({
        error: "Je coach beheert je level na je eerste les.",
        hasHadLessons: true,
      });
    }

    const { suggestedRank, applyRank = false } = req.body as {
      suggestedRank: number;
      applyRank?: boolean;
      answers?: Record<string, string>;
    };

    // Validate range
    let rank = Math.round(Number(suggestedRank));
    if (!Number.isFinite(rank) || rank < 1 || rank > 9) {
      return res.status(400).json({ error: "suggestedRank must be 1–9" });
    }

    // Cap self-assessment: never better than rank 3
    const cappedByPolicy = rank < SELF_ASSESSMENT_MIN_RANK;
    if (cappedByPolicy) {
      rank = SELF_ASSESSMENT_MIN_RANK;
    }

    const [player] = await db
      .select({ id: players.id, glowRank: players.glowRank })
      .from(players)
      .where(eq(players.id, user.playerId))
      .limit(1);

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    const currentRank: number = player.glowRank ?? 9;
    let appliedRank = rank;
    let applied = false;

    if (applyRank) {
      // Cap movement at ±2 from current rank to prevent wild jumps,
      // but also enforce the self-assessment policy cap.
      const capped = Math.max(currentRank - 2, Math.min(currentRank + 2, appliedRank));
      appliedRank = Math.max(SELF_ASSESSMENT_MIN_RANK, Math.min(9, capped));

      await db
        .update(players)
        .set({ glowRank: appliedRank })
        .where(eq(players.id, user.playerId));

      applied = true;
    }

    const meta = GLOW_RANK_META[appliedRank] ?? GLOW_RANK_META[9];
    return res.json({
      suggestedRank: appliedRank,
      rankName: meta.name,
      color: meta.color,
      description: meta.description,
      applied,
      currentRank,
      cappedByPolicy,
    });
  } catch (err) {
    console.error("[glow-assessment] POST error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
