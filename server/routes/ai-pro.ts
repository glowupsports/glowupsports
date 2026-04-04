import { Router, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
} from "../auth";
import {
  checkAiQuota,
  hasAiProAccess,
} from "../services/aiProSubscription";

const router = Router();

const TIER_CACHE_TTL_MS = 60 * 1000;
type TierCacheEntry = { tier: "pro" | "free"; expiresAt: number };
const tierCache = new Map<string, TierCacheEntry>();

async function getCachedPlayerTier(userId: string): Promise<"pro" | "free"> {
  const cached = tierCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tier;
  }
  const isPro = await hasAiProAccess(userId, "player");
  const tier: "pro" | "free" = isPro ? "pro" : "free";
  tierCache.set(userId, { tier, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
  return tier;
}

// GET /api/ai-pro/status — current subscription status for the authenticated player
router.get(
  "/api/ai-pro/status",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      if (role !== "player") {
        return res.json({ isPro: true, isCoach: true, callCount: 0, limit: 0 });
      }

      const { isPro, callCount, limit } = await checkAiQuota(userId, role);

      return res.json({
        isPro,
        isCoach: false,
        callCount,
        limit,
      });
    } catch (error) {
      console.error("[AIPro] Error getting status:", error);
      return res.status(500).json({ error: "Failed to get subscription status" });
    }
  }
);

// GET /api/ai-pro/player-tiers — for coaches: list players with their AI tier
router.get(
  "/api/ai-pro/player-tiers",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user!.role;
      const isCoachRole = ["coach", "assistant", "academy_owner", "platform_owner"].includes(role);
      if (!isCoachRole) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const result = await db.execute(sql`
        SELECT u.id as user_id, u.player_id
        FROM users u
        WHERE u.role = 'player' AND u.deleted = false
      `);

      const players = result.rows as { user_id: string; player_id: string | null }[];

      const tiers = await Promise.all(
        players.map(async (p) => {
          const tier = await getCachedPlayerTier(p.user_id);
          return {
            user_id: p.user_id,
            player_id: p.player_id,
            ai_tier: tier,
          };
        })
      );

      return res.json({ tiers });
    } catch (error) {
      console.error("[AIPro] Player tiers error:", error);
      return res.status(500).json({ error: "Failed to get player tiers" });
    }
  }
);

export default router;
