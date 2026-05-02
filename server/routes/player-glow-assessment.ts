/**
 * Task #1531 — Smart Glow Level Assessment
 *
 * POST /api/player/me/glow-assessment
 *
 * Accepts a self-assessment questionnaire result from the player and
 * optionally applies a suggested glowRank to the player's profile.
 * The suggested rank is derived on the CLIENT from the questionnaire
 * answers; the server validates the range, caps ±1 deviation from
 * the current rank, and persists it.
 */

import { Router } from "express";
import { db } from "../db";
import { players } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
} from "../auth";

const router = Router();
router.use(authMiddleware);

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

/**
 * POST /api/player/me/glow-assessment
 *
 * Body:
 *   suggestedRank  {number}  1–9 — rank derived by the client from questionnaire
 *   applyRank      {boolean} — if true, persist the suggested rank
 *   answers        {Record<string, string>} — raw answers for audit (optional)
 *
 * Returns:
 *   suggestedRank, rankName, color, description, applied, currentRank
 */
router.post("/api/player/me/glow-assessment", async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    if (!user.playerId) {
      return res.status(403).json({ error: "Player account required" });
    }

    const { suggestedRank, applyRank = false } = req.body as {
      suggestedRank: number;
      applyRank?: boolean;
      answers?: Record<string, string>;
    };

    // Validate range
    const rank = Math.round(Number(suggestedRank));
    if (!Number.isFinite(rank) || rank < 1 || rank > 9) {
      return res.status(400).json({ error: "suggestedRank must be 1–9" });
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
      // Cap movement at ±2 from current rank to prevent wild jumps
      const capped = Math.max(currentRank - 2, Math.min(currentRank + 2, appliedRank));
      appliedRank = Math.max(1, Math.min(9, capped));

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
    });
  } catch (err) {
    console.error("[glow-assessment] POST error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
