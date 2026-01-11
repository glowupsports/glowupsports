/**
 * Adult Glow Rank API Routes
 * 
 * Endpoints for:
 * - Getting player's Glow Rank and MMR
 * - Recording match results and updating MMR
 * - Checking skill gates
 * - Getting lesson templates
 * - Anti-farming and trust checks
 */

import { Router } from "express";
import { db } from "../db";
import { players, adultGlowMatches, adultSkillAssessments } from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import {
  updateGlowRankAfterMatch,
  getRankInfo,
  getAllRanks,
  getSkillRubric,
  getSkillRubricsByPillar,
  getUnlockedSkillGates,
  mmrToRank,
  calculateExpectedScore,
  type MatchResult,
  type PlayerMatchStats,
} from "../services/glow-rank-engine-adult";
import { ADULT_GLOW_RANKS, ADULT_SKILL_RUBRICS, MMR_CONFIG } from "../seeds/adult-glow-rank-seed";
import { ADULT_LESSON_TEMPLATES, getTemplatesByGoal, getTemplatesByType, selectTemplate } from "../seeds/adult-lesson-templates-seed";

const router = Router();

// =============================================================================
// PLAYER RANK ENDPOINTS
// =============================================================================

/**
 * GET /api/adult-glow/player/:playerId/rank
 * Get player's current Glow Rank and MMR info
 */
router.get("/player/:playerId/rank", async (req, res) => {
  try {
    const { playerId } = req.params;
    
    const [player] = await db
      .select({
        id: players.id,
        name: players.name,
        glowMmr: players.glowMmr,
        glowRank: players.glowRank,
        totalMatchesPlayed: players.totalMatchesPlayed,
        isAdult: players.isAdult,
        rageQuitCount: players.rageQuitCount,
        noShowCount: players.noShowCount,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
    
    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    const rankInfo = getRankInfo(player.glowRank || 9);
    
    res.json({
      playerId: player.id,
      name: player.name,
      mmr: player.glowMmr || 1000,
      rank: player.glowRank || 9,
      rankName: rankInfo?.name || "Beginner Starter",
      rankDescription: rankInfo?.abilitySnapshot || "",
      mmrRange: rankInfo?.mmrRange || { min: 0, max: 300 },
      totalMatches: player.totalMatchesPlayed || 0,
      isAdult: player.isAdult || false,
      behaviorFlags: {
        rageQuits: player.rageQuitCount || 0,
        noShows: player.noShowCount || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching player rank:", error);
    res.status(500).json({ error: "Failed to fetch player rank" });
  }
});

/**
 * GET /api/adult-glow/ranks
 * Get all Glow Ranks with their info
 */
router.get("/ranks", async (_req, res) => {
  try {
    const ranks = getAllRanks();
    res.json({
      ranks,
      totalRanks: 9,
      mmrConfig: {
        minMmr: 0,
        maxMmr: 3000,
        startingMmr: 1000,
      },
    });
  } catch (error) {
    console.error("Error fetching ranks:", error);
    res.status(500).json({ error: "Failed to fetch ranks" });
  }
});

/**
 * GET /api/adult-glow/ranks/:rank
 * Get detailed info for a specific rank
 */
router.get("/ranks/:rank", async (req, res) => {
  try {
    const rank = parseInt(req.params.rank);
    
    if (isNaN(rank) || rank < 1 || rank > 9) {
      return res.status(400).json({ error: "Invalid rank (must be 1-9)" });
    }
    
    const rankData = ADULT_GLOW_RANKS.find(r => r.rank === rank);
    
    if (!rankData) {
      return res.status(404).json({ error: "Rank not found" });
    }
    
    res.json({
      rank: rankData.rank,
      name: rankData.name,
      abilitySnapshot: rankData.abilitySnapshot,
      mmrRange: rankData.mmrRange,
      skillGates: rankData.skillGates,
      matchRequirements: rankData.matchRequirements,
      behaviorGates: rankData.behaviorGates,
    });
  } catch (error) {
    console.error("Error fetching rank info:", error);
    res.status(500).json({ error: "Failed to fetch rank info" });
  }
});

// =============================================================================
// MATCH RESULT ENDPOINTS
// =============================================================================

/**
 * POST /api/adult-glow/match
 * Record a match result and update MMR/rank
 */
router.post("/match", async (req, res) => {
  try {
    const {
      playerId,
      opponentId,
      didWin,
      gamesDiff,
      setScore,
      matchType = "friendly",
      verification = "self_reported",
    } = req.body;
    
    // Validate required fields
    if (!playerId || !opponentId || didWin === undefined) {
      return res.status(400).json({ 
        error: "Missing required fields: playerId, opponentId, didWin" 
      });
    }
    
    // Get both players
    const [player, opponent] = await Promise.all([
      db.select().from(players).where(eq(players.id, playerId)).limit(1),
      db.select().from(players).where(eq(players.id, opponentId)).limit(1),
    ]);
    
    if (!player[0]) {
      return res.status(404).json({ error: "Player not found" });
    }
    if (!opponent[0]) {
      return res.status(404).json({ error: "Opponent not found" });
    }
    
    // Load recent matches (last 8 weeks) for anti-farming detection
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
    
    const recentMatchHistory = await db.select({
      opponentId: adultGlowMatches.opponentId,
      matchDate: adultGlowMatches.matchDate,
    })
      .from(adultGlowMatches)
      .where(and(
        eq(adultGlowMatches.playerId, playerId),
        gte(adultGlowMatches.matchDate, eightWeeksAgo)
      ))
      .orderBy(desc(adultGlowMatches.matchDate));
    
    // Build recentOpponents array with count per opponent
    const opponentCounts: Record<string, number> = {};
    for (const match of recentMatchHistory) {
      if (match.opponentId) {
        opponentCounts[match.opponentId] = (opponentCounts[match.opponentId] || 0) + 1;
      }
    }
    const recentOpponents = Object.entries(opponentCounts).map(([id, count]) => ({
      opponentId: id,
      matchCount: count,
      lastMatchDate: recentMatchHistory.find(m => m.opponentId === id)?.matchDate || new Date(),
    }));
    
    // Load skill assessments for skill gate checking
    const playerSkillAssessments = await db.select({
      skillId: adultSkillAssessments.skillId,
      score: adultSkillAssessments.score,
    })
      .from(adultSkillAssessments)
      .where(eq(adultSkillAssessments.playerId, playerId));
    
    // Convert to array format for skill gate checking
    const skillScoresArray = playerSkillAssessments.map(a => ({
      skillId: a.skillId,
      score: a.score,
    }));
    
    // Get unlocked skill gates based on player's skill assessments
    const currentRank = player[0].glowRank || 9;
    const skillGatesUnlocked = getUnlockedSkillGates(skillScoresArray);
    
    // Build match result
    const matchResult: MatchResult = {
      matchId: `match_${Date.now()}`,
      playerId,
      opponentId,
      opponentMmr: opponent[0].glowMmr || 1000,
      opponentRank: opponent[0].glowRank || 9,
      didWin,
      gamesDiff: gamesDiff || 0,
      setScore,
      matchType,
      verification,
      matchDate: new Date(),
    };
    
    // Include current match in recentOpponents for anti-farming check
    const currentMatchDate = new Date();
    const existingOpponentEntry = recentOpponents.find(o => o.opponentId === opponentId);
    if (existingOpponentEntry) {
      existingOpponentEntry.matchCount += 1;
      existingOpponentEntry.lastMatchDate = currentMatchDate; // Update to current date
    } else {
      recentOpponents.push({
        opponentId,
        matchCount: 1,
        lastMatchDate: currentMatchDate,
      });
    }
    
    // Build player stats with REAL data (include current match in counts)
    const playerStats: PlayerMatchStats = {
      playerId,
      currentMmr: player[0].glowMmr || 1000,
      currentRank,
      totalMatches: (player[0].totalMatchesPlayed || 0) + 1, // Include current match
      matchesLast8Weeks: recentMatchHistory.length + 1, // Include current match
      recentOpponents,
      skillGatesUnlocked,
      rageQuitCount: player[0].rageQuitCount || 0,
      noShowCount: player[0].noShowCount || 0,
    };
    
    // Calculate new MMR/rank
    const result = updateGlowRankAfterMatch(playerStats, matchResult);
    
    // Persist match record
    await db.insert(adultGlowMatches).values({
      playerId,
      opponentId,
      didWin,
      gamesDiff: gamesDiff || 0,
      setScore,
      matchType,
      verification,
      playerMmrBefore: playerStats.currentMmr,
      opponentMmrBefore: opponent[0].glowMmr || 1000,
      mmrDelta: result.mmrDelta,
      matchDate: new Date(),
    });
    
    // Update player in database
    await db.update(players)
      .set({
        glowMmr: result.newMmr,
        glowRank: result.newRank,
        totalMatchesPlayed: (player[0].totalMatchesPlayed || 0) + 1,
      })
      .where(eq(players.id, playerId));
    
    // Also update opponent's match count
    await db.update(players)
      .set({
        totalMatchesPlayed: (opponent[0].totalMatchesPlayed || 0) + 1,
      })
      .where(eq(players.id, opponentId));
    
    res.json({
      success: true,
      playerId,
      previousMmr: playerStats.currentMmr,
      newMmr: result.newMmr,
      mmrDelta: result.mmrDelta,
      previousRank: playerStats.currentRank,
      newRank: result.newRank,
      promoted: result.promoted,
      demoted: result.demoted,
      blockedByGates: result.blockedByGates,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("Error recording match:", error);
    res.status(500).json({ error: "Failed to record match" });
  }
});

/**
 * GET /api/adult-glow/player/:playerId/expected-score/:opponentId
 * Get expected score against a specific opponent
 */
router.get("/player/:playerId/expected-score/:opponentId", async (req, res) => {
  try {
    const { playerId, opponentId } = req.params;
    
    const [player, opponent] = await Promise.all([
      db.select({ glowMmr: players.glowMmr }).from(players).where(eq(players.id, playerId)).limit(1),
      db.select({ glowMmr: players.glowMmr }).from(players).where(eq(players.id, opponentId)).limit(1),
    ]);
    
    if (!player[0] || !opponent[0]) {
      return res.status(404).json({ error: "Player(s) not found" });
    }
    
    const expected = calculateExpectedScore(
      player[0].glowMmr || 1000, 
      opponent[0].glowMmr || 1000
    );
    
    res.json({
      playerId,
      opponentId,
      playerMmr: player[0].glowMmr || 1000,
      opponentMmr: opponent[0].glowMmr || 1000,
      expectedWinProbability: Math.round(expected * 100),
    });
  } catch (error) {
    console.error("Error calculating expected score:", error);
    res.status(500).json({ error: "Failed to calculate expected score" });
  }
});

// =============================================================================
// SKILL GATES ENDPOINTS
// =============================================================================

/**
 * GET /api/adult-glow/skills
 * Get all adult skill rubrics
 */
router.get("/skills", async (_req, res) => {
  try {
    res.json({
      skills: ADULT_SKILL_RUBRICS,
      pillars: ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL"],
    });
  } catch (error) {
    console.error("Error fetching skills:", error);
    res.status(500).json({ error: "Failed to fetch skills" });
  }
});

/**
 * GET /api/adult-glow/skills/:pillar
 * Get skill rubrics for a specific pillar
 */
router.get("/skills/pillar/:pillar", async (req, res) => {
  try {
    const { pillar } = req.params;
    const skills = getSkillRubricsByPillar(pillar.toUpperCase());
    
    res.json({
      pillar: pillar.toUpperCase(),
      skills,
    });
  } catch (error) {
    console.error("Error fetching pillar skills:", error);
    res.status(500).json({ error: "Failed to fetch pillar skills" });
  }
});

/**
 * GET /api/adult-glow/skills/:skillId
 * Get a specific skill rubric
 */
router.get("/skills/:skillId", async (req, res) => {
  try {
    const { skillId } = req.params;
    const skill = getSkillRubric(skillId);
    
    if (!skill) {
      return res.status(404).json({ error: "Skill not found" });
    }
    
    res.json(skill);
  } catch (error) {
    console.error("Error fetching skill:", error);
    res.status(500).json({ error: "Failed to fetch skill" });
  }
});

// =============================================================================
// LESSON TEMPLATE ENDPOINTS
// =============================================================================

/**
 * GET /api/adult-glow/templates
 * Get all adult lesson templates
 */
router.get("/templates", async (_req, res) => {
  try {
    res.json({
      templates: ADULT_LESSON_TEMPLATES,
      sessionGoals: [
        "serve_day", "rally_day", "match_day", "net_day", 
        "fitness_day", "mental_day", "pattern_day"
      ],
      sessionTypes: ["private", "semi_private", "group"],
      intensityLevels: ["light", "normal", "high"],
    });
  } catch (error) {
    console.error("Error fetching templates:", error);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

/**
 * GET /api/adult-glow/templates/goal/:goal
 * Get templates for a specific session goal
 */
router.get("/templates/goal/:goal", async (req, res) => {
  try {
    const { goal } = req.params;
    const templates = getTemplatesByGoal(goal as any);
    
    res.json({
      goal,
      templates,
    });
  } catch (error) {
    console.error("Error fetching templates by goal:", error);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

/**
 * GET /api/adult-glow/templates/type/:type
 * Get templates for a specific session type
 */
router.get("/templates/type/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const templates = getTemplatesByType(type as any);
    
    res.json({
      type,
      templates,
    });
  } catch (error) {
    console.error("Error fetching templates by type:", error);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

/**
 * POST /api/adult-glow/templates/select
 * Select appropriate template based on goal and player count
 */
router.post("/templates/select", async (req, res) => {
  try {
    const { goal, playerCount } = req.body;
    
    if (!goal || !playerCount) {
      return res.status(400).json({ error: "Missing required fields: goal, playerCount" });
    }
    
    const template = selectTemplate(goal, playerCount);
    
    if (!template) {
      return res.status(404).json({ error: "No suitable template found" });
    }
    
    res.json({
      template,
    });
  } catch (error) {
    console.error("Error selecting template:", error);
    res.status(500).json({ error: "Failed to select template" });
  }
});

// =============================================================================
// PLAYER ADULT TOGGLE
// =============================================================================

/**
 * POST /api/adult-glow/player/:playerId/toggle-adult
 * Toggle player between youth (ball levels) and adult (Glow Rank) system
 */
router.post("/player/:playerId/toggle-adult", async (req, res) => {
  try {
    const { playerId } = req.params;
    const { isAdult } = req.body;
    
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
    
    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    await db.update(players)
      .set({ isAdult: isAdult ?? !player.isAdult })
      .where(eq(players.id, playerId));
    
    res.json({
      success: true,
      playerId,
      isAdult: isAdult ?? !player.isAdult,
      system: isAdult ? "Glow Rank (Adult)" : "Ball Level (Youth)",
    });
  } catch (error) {
    console.error("Error toggling adult status:", error);
    res.status(500).json({ error: "Failed to toggle adult status" });
  }
});

/**
 * GET /api/adult-glow/config
 * Get MMR calculation configuration (for debugging/transparency)
 */
router.get("/config", async (_req, res) => {
  try {
    res.json({
      mmrConfig: {
        baseK: MMR_CONFIG.baseK,
        trustFactors: MMR_CONFIG.trustFactors,
        rankThresholds: MMR_CONFIG.rankThresholds,
        antiFarming: {
          sameOpponentMaxPerWeek: MMR_CONFIG.sameOpponentMaxPerWeek,
          lowerRankReduction: MMR_CONFIG.lowerRankReduction,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching config:", error);
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

export default router;
