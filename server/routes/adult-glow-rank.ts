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
import { players, adultGlowMatches, adultSkillAssessments, dssSpeelsterkteThresholds } from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { authMiddlewareWithFreshData as authMiddleware, type AuthenticatedRequest } from "../auth";
import { fireQuestEvent } from "../services/quest-events";
import {
  updateGlowRankAfterMatch,
  getRankInfo,
  getAllRanks,
  getSkillRubric,
  getSkillRubricsByPillar,
  getUnlockedSkillGates,
  mmrToRank,
  calculateExpectedScore,
  mmrToDssRating,
  formatDssRating,
  getDssBracket,
  estimateMatchesToNextRank,
  getRatingTrend,
  getPlayerRatingStatus,
  calculateTeamRating,
  calculateDoublesExpectedScore,
  updateDoublesRatings,
  type MatchResult,
  type PlayerMatchStats,
} from "../services/glow-rank-engine-adult";
import { ADULT_GLOW_RANKS, ADULT_SKILL_RUBRICS, MMR_CONFIG } from "../seeds/adult-glow-rank-seed";
import { ADULT_LESSON_TEMPLATES, getTemplatesByGoal, getTemplatesByType, selectTemplate } from "../seeds/adult-lesson-templates-seed";
import { updatePillarProgressFromMatch } from "../services/match-pillar-update";

const router = Router();

router.use(authMiddleware);

// ─── Helper: verify caller can access a given player ─────────────────────────
// Returns the player row from DB (verifying it exists and caller has access),
// or null if the player was not found, or throws a 403 early via `res`.
async function verifyPlayerAccess(
  req: AuthenticatedRequest,
  res: import("express").Response,
  playerId: string,
  allowCoachAcademy = true,
): Promise<{ id: string; name: string; academyId: string | null } | null> {
  const user = req.user!;
  const [player] = await db
    .select({ id: players.id, name: players.name, academyId: players.academyId })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return null;
  }

  const isOwn = user.playerId === playerId;
  const isPlatformOwner = user.role === "platform_owner";
  const isCoachOrAdmin = allowCoachAcademy && ["coach", "academy_owner", "admin"].includes(user.role);

  if (isOwn || isPlatformOwner) return player;

  if (isCoachOrAdmin) {
    if (player.academyId === user.academyId) return player;
    res.status(403).json({ error: "Access denied" });
    return null;
  }

  res.status(403).json({ error: "Access denied" });
  return null;
}

// =============================================================================
// PLAYER RANK ENDPOINTS
// =============================================================================

/**
 * GET /api/adult-glow/player/:playerId/rank
 * Get player's current Glow Rank and MMR info
 */
router.get("/player/:playerId/rank", async (req: AuthenticatedRequest, res) => {
  try {
    const { playerId } = req.params;
    
    const access = await verifyPlayerAccess(req, res, playerId);
    if (!access) return;

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
router.post("/match", async (req: AuthenticatedRequest, res) => {
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

    // Authorization: caller must be the player themselves or a coach/admin in same academy
    const access = await verifyPlayerAccess(req, res, playerId);
    if (!access) return;
    
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

    // Academy isolation: opponent must be in the same academy as the player
    // (platform_owner can record cross-academy matches)
    const user = req.user!;
    if (user.role !== "platform_owner" && opponent[0].academyId && player[0].academyId &&
        opponent[0].academyId !== player[0].academyId) {
      return res.status(403).json({ error: "Cannot record match with a player from a different academy" });
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

    // Update pillar progress for Glow 1-5 (data-driven) players
    try {
      await updatePillarProgressFromMatch({
        playerId,
        result: didWin ? "win" : "loss",
        coachVerified: verification === "coach_verified",
      });
    } catch (pillarErr) {
      console.error("[adult-glow/match] Pillar update failed (non-fatal):", pillarErr);
    }
    
    fireQuestEvent(playerId, "log_match").catch(() => {});
    if (didWin) {
      fireQuestEvent(playerId, "win_match").catch(() => {});
    }

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
router.get("/player/:playerId/expected-score/:opponentId", async (req: AuthenticatedRequest, res) => {
  try {
    const { playerId, opponentId } = req.params;

    const access = await verifyPlayerAccess(req, res, playerId);
    if (!access) return;
    
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
 * POST /api/adult-glow/find-or-create-opponent
 * Find an existing opponent by name or create a placeholder opponent record.
 * Academy isolation: search is limited to the caller's academy; created records
 * are assigned to the caller's academy.
 */
router.post("/find-or-create-opponent", async (req: AuthenticatedRequest, res) => {
  try {
    const { name } = req.body;
    const user = req.user!;
    // Scope the opponent to the caller's academy — ignore any academyId from the client
    const scopedAcademyId = user.role === "platform_owner" ? (req.body.academyId || user.academyId) : user.academyId;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Opponent name is required" });
    }
    
    const trimmedName = name.trim();
    
    // Try to find existing player by name within same academy
    const existingPlayers = await db
      .select({ id: players.id, name: players.name })
      .from(players)
      .where(and(
        sql`LOWER(${players.name}) = LOWER(${trimmedName})`,
        scopedAcademyId ? eq(players.academyId, scopedAcademyId) : sql`true`,
      ))
      .limit(5);
    
    if (existingPlayers.length > 0) {
      // Return first match
      return res.json({
        opponent: existingPlayers[0],
        created: false,
        suggestions: existingPlayers,
      });
    }
    
    // Create a new "external" opponent scoped to caller's academy
    const [newOpponent] = await db.insert(players).values({
      name: trimmedName,
      academyId: scopedAcademyId || null,
      isAdult: true,
      glowMmr: 1000,
      glowRank: 9,
    }).returning({ id: players.id, name: players.name });
    
    res.json({
      opponent: newOpponent,
      created: true,
      suggestions: [],
    });
  } catch (error) {
    console.error("Error finding/creating opponent:", error);
    res.status(500).json({ error: "Failed to process opponent" });
  }
});

/**
 * POST /api/adult-glow/player/:playerId/toggle-adult
 * Toggle player between youth (ball levels) and adult (Glow Rank) system
 * Requires coach/admin role — players cannot toggle their own adult status.
 */
router.post("/player/:playerId/toggle-adult", async (req: AuthenticatedRequest, res) => {
  try {
    const { playerId } = req.params;
    const { isAdult } = req.body;
    const user = req.user!;

    // Only coaches, academy owners, admins, and platform owners can toggle adult status
    const canToggle = ["coach", "academy_owner", "admin", "platform_owner"].includes(user.role);
    if (!canToggle) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [player] = await db
      .select({ id: players.id, isAdult: players.isAdult, academyId: players.academyId })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
    
    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    // Academy isolation: non-platform_owner can only manage players in their own academy
    if (user.role !== "platform_owner" && player.academyId !== user.academyId) {
      return res.status(403).json({ error: "Access denied" });
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
 * GET /api/adult-glow/player/:playerId/full-profile
 * Get complete adult glow profile: rank, matches, gates, stats in one call
 */
router.get("/player/:playerId/full-profile", async (req: AuthenticatedRequest, res) => {
  try {
    const { playerId } = req.params;

    const access = await verifyPlayerAccess(req, res, playerId);
    if (!access) return;
    
    // Get player
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
    
    const currentRank = player.glowRank || 9;
    const rankInfo = getRankInfo(currentRank);
    const nextRankInfo = getRankInfo(currentRank - 1);
    const fullRankData = ADULT_GLOW_RANKS.find(r => r.rank === currentRank);
    
    // Get recent matches (last 10)
    const recentMatches = await db
      .select({
        id: adultGlowMatches.id,
        opponentId: adultGlowMatches.opponentId,
        didWin: adultGlowMatches.didWin,
        setScore: adultGlowMatches.setScore,
        matchType: adultGlowMatches.matchType,
        mmrDelta: adultGlowMatches.mmrDelta,
        matchDate: adultGlowMatches.matchDate,
      })
      .from(adultGlowMatches)
      .where(eq(adultGlowMatches.playerId, playerId))
      .orderBy(desc(adultGlowMatches.matchDate))
      .limit(10);
    
    // Get opponent names for matches
    const opponentIds = [...new Set(recentMatches.map(m => m.opponentId))];
    const opponents = opponentIds.length > 0 
      ? await db
          .select({ id: players.id, name: players.name })
          .from(players)
          .where(sql`${players.id} IN ${opponentIds}`)
      : [];
    const opponentMap = new Map(opponents.map(o => [o.id, o.name]));
    
    // Get skill assessments
    const assessments = await db
      .select({
        skillId: adultSkillAssessments.skillId,
        score: adultSkillAssessments.score,
      })
      .from(adultSkillAssessments)
      .where(eq(adultSkillAssessments.playerId, playerId));
    
    // Calculate unlocked gates based on assessments
    const assessmentArray = assessments.map(a => ({ skillId: a.skillId, score: a.score }));
    const skillGatesUnlocked = getUnlockedSkillGates(assessmentArray);
    
    // Calculate stats
    const wins = recentMatches.filter(m => m.didWin).length;
    const matchesWithResults = recentMatches.length;
    const winRate = matchesWithResults > 0 ? Math.round((wins / matchesWithResults) * 100) : 0;
    
    // Calculate current streak
    let streak = 0;
    for (const match of recentMatches) {
      if (match.didWin) {
        streak++;
      } else {
        break;
      }
    }
    
    const nextFullRankData = ADULT_GLOW_RANKS.find(r => r.rank === currentRank - 1);
    
    // Compute DSS speelsterkte equivalence from MMR using KNLTB 2026 boundaries.
    // Policy: use men's singles thresholds as the reference scale (inclusive label).
    // For speelsterkte 3–5 men's singles is stricter than women's, so using the
    // women's boundary would over-assign; we use men's for a conservative estimate.
    const dssRatingNum = mmrToDssRating(player.glowMmr || 1000);
    const dssThresholds = await db
      .select()
      .from(dssSpeelsterkteThresholds)
      .orderBy(dssSpeelsterkteThresholds.speelsterkte);

    // Walk speelsterkte 1→9; pick the first bracket where dssRating ≤ men_singles_max.
    // DSS 1 and 2 are ranking-based (no numeric upper boundary in the published table),
    // so they are excluded from MMR-based approximation. The equivalence range is 3–9.
    // Players with very low DSS ratings (national/elite level) will map to DSS 3 as the
    // closest numeric bracket. This is intentional conservative approximation.
    let dssEquivalent = 9; // default: entry level
    for (const row of dssThresholds) {
      const max = row.menSinglesMaxRating !== null ? parseFloat(row.menSinglesMaxRating as string) : null;
      if (max === null) continue; // speelsterkte 1 and 2 have no numeric upper bound
      if (dssRatingNum <= max) {
        dssEquivalent = row.speelsterkte;
        break;
      }
    }

    // Read K-factor from seeded config row (stored as 'dss_k_factor' in app_config)
    // Falls back to the well-known 2026 KNLTB constant (0.275) if the table is unavailable.
    let dssKFactor = 0.275;
    try {
      const rows = await db.execute(
        sql`SELECT value::text AS value FROM app_config WHERE key = 'dss_k_factor' LIMIT 1`
      );
      const first = rows.rows?.[0];
      if (first && "value" in first && typeof first.value === "string") {
        const parsed = parseFloat(first.value);
        if (!isNaN(parsed)) dssKFactor = parsed;
      }
    } catch { /* app_config may not exist in older envs; default is fine */ }

    res.json({
      playerId: player.id,
      name: player.name,
      mmr: player.glowMmr || 1000,
      rank: currentRank,
      rankName: rankInfo?.name || "Beginner Starter",
      rankDescription: rankInfo?.abilitySnapshot || "",
      mmrRange: rankInfo?.mmrRange || { min: 0, max: 300 },
      nextRank: nextRankInfo && nextFullRankData ? {
        rank: nextFullRankData.rank,
        name: nextRankInfo.name,
        mmrMin: nextRankInfo.mmrRange.min,
      } : null,
      isAdult: player.isAdult || false,
      dssEquivalent,
      dssRating: formatDssRating(dssRatingNum),
      dssKFactor,
      stats: {
        totalMatches: player.totalMatchesPlayed || 0,
        wins,
        winRate,
        streak,
      },
      behaviorFlags: {
        rageQuits: player.rageQuitCount || 0,
        noShows: player.noShowCount || 0,
      },
      skillGates: {
        unlocked: skillGatesUnlocked,
        required: fullRankData?.skillGates || [],
      },
      recentMatches: recentMatches.map(m => ({
        id: m.id,
        opponentName: opponentMap.get(m.opponentId) || "Unknown",
        didWin: m.didWin,
        setScore: m.setScore,
        matchType: m.matchType,
        mmrDelta: m.mmrDelta,
        matchDate: m.matchDate,
      })),
    });
  } catch (error) {
    console.error("Error fetching full profile:", error);
    res.status(500).json({ error: "Failed to fetch full profile" });
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

// =============================================================================
// DSS-STYLE RATING ENDPOINTS
// =============================================================================

/**
 * GET /api/adult-glow/player/:playerId/dss-rating
 * Get player's DSS-style rating (7.1234 format) with full status
 */
router.get("/player/:playerId/dss-rating", async (req: AuthenticatedRequest, res) => {
  try {
    const { playerId } = req.params;

    const access = await verifyPlayerAccess(req, res, playerId);
    if (!access) return;
    
    const [player] = await db
      .select({
        id: players.id,
        name: players.name,
        glowMmr: players.glowMmr,
        glowRank: players.glowRank,
        totalMatchesPlayed: players.totalMatchesPlayed,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
    
    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    const mmr = player.glowMmr || 1000;
    const rank = player.glowRank || 9;
    
    // Get rating history for trend calculation
    const ratingHistory = await db
      .select({
        mmr: adultGlowMatches.playerMmrBefore,
        delta: adultGlowMatches.mmrDelta,
        date: adultGlowMatches.matchDate,
      })
      .from(adultGlowMatches)
      .where(eq(adultGlowMatches.playerId, playerId))
      .orderBy(desc(adultGlowMatches.matchDate))
      .limit(20);
    
    // Build cumulative rating history (most recent first, need to reverse)
    const historyForTrend: { mmr: number; date: Date }[] = [];
    let currentMmr = mmr;
    
    for (const match of ratingHistory) {
      historyForTrend.unshift({ mmr: currentMmr, date: match.date! });
      currentMmr = (match.mmr || 1000);
    }
    
    if (historyForTrend.length === 0) {
      historyForTrend.push({ mmr, date: new Date() });
    }
    
    const status = getPlayerRatingStatus(
      mmr,
      rank,
      player.totalMatchesPlayed || 0,
      historyForTrend
    );
    
    const dssRating = mmrToDssRating(mmr);
    const progressToNext = estimateMatchesToNextRank(mmr, rank);
    
    res.json({
      playerId: player.id,
      name: player.name,
      
      // DSS-style rating
      dssRating: formatDssRating(dssRating),
      dssRatingNumeric: dssRating,
      bracket: getDssBracket(dssRating),
      
      // Raw MMR (internal)
      mmr,
      mmrRange: {
        min: MMR_CONFIG.rankThresholds.find(t => t.rank === rank)?.minMmr || 0,
        max: MMR_CONFIG.rankThresholds.find(t => t.rank === rank)?.maxMmr || 300,
      },
      
      // Status
      rankName: status.rankName,
      trend: status.trend,
      isProvisional: status.isProvisional,
      
      // Progress to next level
      progressToNext: {
        targetRank: progressToNext.targetRank,
        matchesNeeded: progressToNext.matchesNeeded,
        mmrNeeded: progressToNext.mmrNeeded,
        confidence: progressToNext.confidence,
      },
      
      // Recent history for mini-chart
      recentHistory: historyForTrend.slice(-10).map(h => ({
        mmr: h.mmr,
        dssRating: formatDssRating(mmrToDssRating(h.mmr)),
        date: h.date,
      })),
    });
  } catch (error) {
    console.error("Error fetching DSS rating:", error);
    res.status(500).json({ error: "Failed to fetch DSS rating" });
  }
});

/**
 * GET /api/adult-glow/player/:playerId/rating-history
 * Get full rating history for chart display
 */
router.get("/player/:playerId/rating-history", async (req: AuthenticatedRequest, res) => {
  try {
    const { playerId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const access = await verifyPlayerAccess(req, res, playerId);
    if (!access) return;
    
    const [player] = await db
      .select({
        id: players.id,
        glowMmr: players.glowMmr,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
    
    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    // Get match history with MMR changes
    const matches = await db
      .select({
        id: adultGlowMatches.id,
        mmrBefore: adultGlowMatches.playerMmrBefore,
        mmrDelta: adultGlowMatches.mmrDelta,
        didWin: adultGlowMatches.didWin,
        matchType: adultGlowMatches.matchType,
        verification: adultGlowMatches.verification,
        matchDate: adultGlowMatches.matchDate,
        opponentId: adultGlowMatches.opponentId,
      })
      .from(adultGlowMatches)
      .where(eq(adultGlowMatches.playerId, playerId))
      .orderBy(desc(adultGlowMatches.matchDate))
      .limit(limit);
    
    // Build history array with calculated MMR after each match
    const history = matches.reverse().map((match, index) => {
      const mmrAfter = (match.mmrBefore || 1000) + (match.mmrDelta || 0);
      return {
        matchNumber: index + 1,
        matchId: match.id,
        mmrBefore: match.mmrBefore || 1000,
        mmrAfter,
        mmrDelta: match.mmrDelta || 0,
        dssRatingBefore: formatDssRating(mmrToDssRating(match.mmrBefore || 1000)),
        dssRatingAfter: formatDssRating(mmrToDssRating(mmrAfter)),
        didWin: match.didWin,
        matchType: match.matchType,
        verification: match.verification,
        matchDate: match.matchDate,
      };
    });
    
    // Calculate statistics
    const currentMmr = player.glowMmr || 1000;
    const startMmr = history.length > 0 ? history[0].mmrBefore : currentMmr;
    const highestMmr = Math.max(currentMmr, ...history.map(h => h.mmrAfter));
    const lowestMmr = Math.min(startMmr, ...history.map(h => h.mmrBefore));
    
    res.json({
      playerId,
      currentMmr,
      currentDssRating: formatDssRating(mmrToDssRating(currentMmr)),
      
      stats: {
        totalMatches: history.length,
        startMmr,
        highestMmr,
        lowestMmr,
        netChange: currentMmr - startMmr,
        highestDssRating: formatDssRating(mmrToDssRating(highestMmr)),
        lowestDssRating: formatDssRating(mmrToDssRating(lowestMmr)),
      },
      
      history,
    });
  } catch (error) {
    console.error("Error fetching rating history:", error);
    res.status(500).json({ error: "Failed to fetch rating history" });
  }
});

/**
 * POST /api/adult-glow/doubles-match
 * Record a doubles match result and update both players' ratings
 */
router.post("/doubles-match", async (req: AuthenticatedRequest, res) => {
  try {
    const {
      team1Player1Id,
      team1Player2Id,
      team2Player1Id,
      team2Player2Id,
      team1Won,
      gamesDiff,
      setScore,
      matchType = "friendly",
      verification = "self_reported",
    } = req.body;
    
    // Validate required fields
    if (!team1Player1Id || !team1Player2Id || !team2Player1Id || !team2Player2Id || team1Won === undefined) {
      return res.status(400).json({ 
        error: "Missing required fields: all 4 player IDs and team1Won required" 
      });
    }

    // Authorization: caller must be one of the 4 players, or a coach/admin in the same academy
    const user = req.user!;
    const callerIds = [team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id];
    const isParticipant = user.playerId && callerIds.includes(user.playerId);
    const isPlatformOwner = user.role === "platform_owner";
    const isCoachOrAdmin = ["coach", "academy_owner", "admin"].includes(user.role);

    if (!isParticipant && !isPlatformOwner && !isCoachOrAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    // Get all players
    const allPlayerIds = [team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id];
    const playersData = await db.select().from(players).where(
      sql`${players.id} = ANY(${allPlayerIds})`
    );

    // Academy isolation for coaches/admins: all players must be in the caller's academy
    if (isCoachOrAdmin && !isPlatformOwner) {
      const outsideAcademy = playersData.filter(p => p.academyId !== user.academyId);
      if (outsideAcademy.length > 0) {
        return res.status(403).json({ error: "Access denied: players belong to a different academy" });
      }
    }
    
    if (playersData.length !== 4) {
      return res.status(404).json({ error: "One or more players not found" });
    }
    
    const getPlayer = (id: string) => playersData.find(p => p.id === id);
    const t1p1 = getPlayer(team1Player1Id);
    const t1p2 = getPlayer(team1Player2Id);
    const t2p1 = getPlayer(team2Player1Id);
    const t2p2 = getPlayer(team2Player2Id);
    
    if (!t1p1 || !t1p2 || !t2p1 || !t2p2) {
      return res.status(404).json({ error: "Player data incomplete" });
    }
    
    // Calculate doubles rating updates for team 1
    const team1Updates = updateDoublesRatings(
      t1p1.glowMmr || 1000,
      t1p2.glowMmr || 1000,
      t2p1.glowMmr || 1000,
      t2p2.glowMmr || 1000,
      team1Won,
      verification
    );
    
    // Calculate doubles rating updates for team 2
    const team2Updates = updateDoublesRatings(
      t2p1.glowMmr || 1000,
      t2p2.glowMmr || 1000,
      t1p1.glowMmr || 1000,
      t1p2.glowMmr || 1000,
      !team1Won,
      verification
    );
    
    // Update all players
    const updates = [
      { id: team1Player1Id, delta: team1Updates.player1Delta, won: team1Won },
      { id: team1Player2Id, delta: team1Updates.player2Delta, won: team1Won },
      { id: team2Player1Id, delta: team2Updates.player1Delta, won: !team1Won },
      { id: team2Player2Id, delta: team2Updates.player2Delta, won: !team1Won },
    ];
    
    for (const update of updates) {
      const player = getPlayer(update.id);
      if (player) {
        const newMmr = Math.max(0, Math.min(3000, (player.glowMmr || 1000) + update.delta));
        const newRank = mmrToRank(newMmr);
        
        await db.update(players)
          .set({
            glowMmr: newMmr,
            glowRank: newRank,
            totalMatchesPlayed: (player.totalMatchesPlayed || 0) + 1,
          })
          .where(eq(players.id, update.id));
      }
    }
    
    res.json({
      success: true,
      matchType: "doubles",
      team1: {
        players: [team1Player1Id, team1Player2Id],
        won: team1Won,
        mmrDeltas: [team1Updates.player1Delta, team1Updates.player2Delta],
      },
      team2: {
        players: [team2Player1Id, team2Player2Id],
        won: !team1Won,
        mmrDeltas: [team2Updates.player1Delta, team2Updates.player2Delta],
      },
    });
  } catch (error) {
    console.error("Error recording doubles match:", error);
    res.status(500).json({ error: "Failed to record doubles match" });
  }
});

/**
 * GET /api/adult-glow/simulate-match
 * Simulate a match outcome without recording it (for UI preview)
 */
router.get("/simulate-match", async (req, res) => {
  try {
    const playerMmr = parseInt(req.query.playerMmr as string) || 1000;
    const opponentMmr = parseInt(req.query.opponentMmr as string) || 1000;
    
    const expected = calculateExpectedScore(playerMmr, opponentMmr);
    
    // Simulate win
    const winDelta = Math.round(MMR_CONFIG.baseK * (1 - expected));
    const newMmrWin = playerMmr + winDelta;
    
    // Simulate loss
    const loseDelta = Math.round(MMR_CONFIG.baseK * (0 - expected));
    const newMmrLose = playerMmr + loseDelta;
    
    res.json({
      playerMmr,
      playerDssRating: formatDssRating(mmrToDssRating(playerMmr)),
      opponentMmr,
      opponentDssRating: formatDssRating(mmrToDssRating(opponentMmr)),
      
      winProbability: Math.round(expected * 100),
      
      ifWin: {
        mmrDelta: winDelta,
        newMmr: newMmrWin,
        newDssRating: formatDssRating(mmrToDssRating(newMmrWin)),
        newBracket: getDssBracket(mmrToDssRating(newMmrWin)),
      },
      ifLose: {
        mmrDelta: loseDelta,
        newMmr: newMmrLose,
        newDssRating: formatDssRating(mmrToDssRating(newMmrLose)),
        newBracket: getDssBracket(mmrToDssRating(newMmrLose)),
      },
    });
  } catch (error) {
    console.error("Error simulating match:", error);
    res.status(500).json({ error: "Failed to simulate match" });
  }
});

/**
 * GET /api/adult-glow/leaderboard
 * Get top players by DSS rating
 */
router.get("/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const academyId = req.query.academyId as string;
    
    let query = db
      .select({
        id: players.id,
        name: players.name,
        glowMmr: players.glowMmr,
        glowRank: players.glowRank,
        totalMatchesPlayed: players.totalMatchesPlayed,
        academyId: players.academyId,
      })
      .from(players)
      .where(
        and(
          eq(players.isAdult, true),
          gte(players.totalMatchesPlayed, 5) // Min 5 matches for leaderboard
        )
      )
      .orderBy(desc(players.glowMmr))
      .limit(limit);
    
    const topPlayers = await query;
    
    const leaderboard = topPlayers.map((player, index) => {
      const mmr = player.glowMmr || 1000;
      return {
        rank: index + 1,
        playerId: player.id,
        name: player.name,
        dssRating: formatDssRating(mmrToDssRating(mmr)),
        bracket: getDssBracket(mmrToDssRating(mmr)),
        mmr,
        matchesPlayed: player.totalMatchesPlayed || 0,
      };
    });
    
    res.json({
      leaderboard,
      totalPlayers: leaderboard.length,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

export default router;
