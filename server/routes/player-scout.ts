// GET /api/players/:id/scout
//
// Returns a pre-match scouting card for a specific player. Used in:
//   - PlayScreen Players sub-tab (scout any player)
//   - HeroCarousel CompeteCard (scout upcoming challenge opponent)
//   - Match confirmation flow
//
// Respects the opponent's privacy settings from user_social_profiles:
//   - showGlowScore (controls glowScore / glowMmr / glowRank visibility)
//   - showLevel (controls ballLevel visibility)
// If a field is private, the response includes it as null with a
// privacyMasked flag so the client can render a lock/Private chip.

import { Router } from "express";
import type { Response } from "express";
import { db } from "../db";
import { players, adultGlowMatches, userSocialProfiles, users } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { authMiddlewareWithFreshData as authMiddleware } from "../auth";
import type { AuthenticatedRequest } from "../auth";

const router = Router();

// Play-style → human-readable label
const PLAYSTYLE_LABELS: Record<string, string> = {
  baseline_warrior: "Baseline Warrior",
  net_ninja: "Net Ninja",
  serve_machine: "Serve Machine",
  all_court_ace: "All-Court Ace",
  counter_puncher: "Counter Puncher",
  tactical_mastermind: "Tactical Mastermind",
};

// Play-style → top 3 skill strength tags (derived from archetype)
const PLAYSTYLE_SKILL_TAGS: Record<string, string[]> = {
  baseline_warrior: ["Deep Groundstrokes", "Consistency", "Endurance"],
  net_ninja: ["Net Play", "Volleys", "Approach Shots"],
  serve_machine: ["Strong Serve", "First Strike", "Power"],
  all_court_ace: ["Versatility", "All-Court", "Adaptability"],
  counter_puncher: ["Defense", "Counter Punching", "Speed"],
  tactical_mastermind: ["Placement", "Strategy", "Spin Variation"],
};

// Maps glowRank (1–9) to a human label (9 = Beginner, 1 = International)
function rankLabel(rank: number | null | undefined): string {
  if (rank === null || rank === undefined) return "Unranked";
  if (rank <= 1) return "International";
  if (rank <= 2) return "Elite";
  if (rank <= 3) return "Advanced";
  if (rank <= 5) return "Intermediate";
  if (rank <= 7) return "Developing";
  return "Beginner";
}

router.get(
  "/api/players/:id/scout",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const opponentId = req.params.id;
      const requestingPlayerId = req.user?.playerId ?? null;

      // Fetch opponent
      const opponent = await db.query.players.findFirst({
        where: eq(players.id, opponentId),
      });

      if (!opponent) {
        res.status(404).json({ error: "Player not found" });
        return;
      }

      // Fetch privacy settings — players don't have userId; look up via users table
      const linkedUser = await db.query.users.findFirst({
        where: eq(users.playerId, opponentId),
        columns: { id: true },
      });
      const socialProfile = linkedUser?.id
        ? await db.query.userSocialProfiles.findFirst({
            where: eq(userSocialProfiles.userId, linkedUser.id),
          })
        : null;

      const showGlowScore = socialProfile?.showGlowScore ?? true;
      const showLevel = socialProfile?.showLevel ?? true;

      // W/L record — last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentMatches = await db
        .select()
        .from(adultGlowMatches)
        .where(
          and(
            eq(adultGlowMatches.playerId, opponentId),
            gte(adultGlowMatches.matchDate, thirtyDaysAgo),
          ),
        )
        .orderBy(desc(adultGlowMatches.matchDate))
        .limit(30);

      const wins30 = recentMatches.filter((m) => m.didWin).length;
      const losses30 = recentMatches.filter((m) => !m.didWin).length;
      const recent5 = recentMatches
        .slice(0, 5)
        .map((m): "W" | "L" => (m.didWin ? "W" : "L"));

      // Head-to-head vs requesting player
      let h2h: { myWins: number; myLosses: number; total: number } | null = null;
      if (requestingPlayerId && requestingPlayerId !== opponentId) {
        // Matches where requestor played vs opponent
        const [myRecords, theirRecords] = await Promise.all([
          db
            .select()
            .from(adultGlowMatches)
            .where(
              and(
                eq(adultGlowMatches.playerId, requestingPlayerId),
                eq(adultGlowMatches.opponentId, opponentId),
              ),
            ),
          db
            .select()
            .from(adultGlowMatches)
            .where(
              and(
                eq(adultGlowMatches.playerId, opponentId),
                eq(adultGlowMatches.opponentId, requestingPlayerId),
              ),
            ),
        ]);

        const myWins = myRecords.filter((m) => m.didWin).length;
        const myLosses = theirRecords.filter((m) => m.didWin).length;
        const total = myWins + myLosses;
        if (total > 0) {
          h2h = { myWins, myLosses, total };
        }
      }

      // Skill tags from play style
      const skillTags = opponent.playStyle
        ? (PLAYSTYLE_SKILL_TAGS[opponent.playStyle] ?? []).slice(0, 3)
        : [];

      const archetype = opponent.playStyle
        ? PLAYSTYLE_LABELS[opponent.playStyle] ?? null
        : null;

      res.json({
        id: opponent.id,
        displayName: opponent.displayName || opponent.name,
        avatarUrl: opponent.profilePhotoUrl ?? null,
        glowScore: showGlowScore ? (opponent.glowScore ?? 0) : null,
        glowMmr: showGlowScore ? (opponent.glowMmr ?? 1000) : null,
        glowRank: showGlowScore ? (opponent.glowRank ?? 9) : null,
        rankLabel: showGlowScore ? rankLabel(opponent.glowRank) : null,
        ballLevel: showLevel ? (opponent.ballLevel ?? null) : null,
        archetype,
        wins30,
        losses30,
        recent5,
        skillTags,
        h2h,
        privacyMasked: {
          glowScore: !showGlowScore,
          level: !showLevel,
        },
      });
    } catch (err) {
      console.error("[player-scout] Error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
