/**
 * Adult Glow Rank Engine
 * 
 * Elo-based MMR calculation with:
 * - Margin factors (score difference)
 * - Trust factors (verification level)
 * - K-factor (activity/volatility dependent)
 * - Anti-farming rules
 * - Skill gate requirements for promotion
 */

import { MMR_CONFIG, ADULT_GLOW_RANKS, ADULT_SKILL_RUBRICS } from "../seeds/adult-glow-rank-seed";

// =============================================================================
// TYPES
// =============================================================================
export interface MatchResult {
  matchId: string;
  playerId: string;
  opponentId: string;
  opponentMmr: number;
  opponentRank: number;
  didWin: boolean;
  gamesDiff: number; // positive = won more games, negative = lost more
  setScore?: string; // e.g., "6-4, 7-5"
  matchType: "friendly" | "ladder" | "tournament";
  verification: "system_verified" | "coach_verified" | "self_reported";
  matchDate: Date;
}

export interface PlayerMatchStats {
  playerId: string;
  currentMmr: number;
  currentRank: number;
  totalMatches: number;
  matchesLast8Weeks: number;
  recentOpponents: { opponentId: string; matchCount: number; lastMatchDate: Date }[];
  skillGatesUnlocked: string[];
  rageQuitCount: number;
  noShowCount: number;
}

export interface RankUpdateResult {
  newMmr: number;
  mmrDelta: number;
  newRank: number;
  promoted: boolean;
  demoted: boolean;
  blockedByGates: string[];
  warnings: string[];
}

// =============================================================================
// CORE ENGINE
// =============================================================================

/**
 * Calculate expected score using Elo formula
 */
export function calculateExpectedScore(playerMmr: number, opponentMmr: number): number {
  return 1 / (1 + Math.pow(10, (opponentMmr - playerMmr) / 400));
}

/**
 * Calculate margin factor based on game difference
 * Close wins = less impact, dominant wins = more impact
 */
export function calculateMarginFactor(gamesDiff: number): number {
  const { marginBase, marginPerGame, marginMin, marginMax } = MMR_CONFIG;
  const factor = marginBase + (Math.abs(gamesDiff) * marginPerGame);
  return Math.max(marginMin, Math.min(marginMax, factor));
}

/**
 * Get trust factor based on verification level
 */
export function getTrustFactor(verification: MatchResult["verification"]): number {
  return MMR_CONFIG.trustFactors[verification] || MMR_CONFIG.trustFactors.selfReported;
}

/**
 * Calculate K-factor based on activity and experience
 */
export function calculateKFactor(
  matchesLast8Weeks: number,
  totalMatches: number
): number {
  const { baseK, activityFactorThreshold, activeActivityFactor, inactiveActivityFactor,
          newPlayerThreshold, newPlayerVolatility, establishedVolatility } = MMR_CONFIG;
  
  const activityFactor = matchesLast8Weeks >= activityFactorThreshold 
    ? activeActivityFactor 
    : inactiveActivityFactor;
  
  const volatilityFactor = totalMatches < newPlayerThreshold 
    ? newPlayerVolatility 
    : establishedVolatility;
  
  return baseK * activityFactor * volatilityFactor;
}

/**
 * Check if match is farming (same opponent too often)
 */
export function isFarming(
  opponentId: string,
  recentOpponents: PlayerMatchStats["recentOpponents"]
): boolean {
  const opponent = recentOpponents.find(o => o.opponentId === opponentId);
  if (!opponent) return false;
  
  // Check matches in last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  return opponent.matchCount >= MMR_CONFIG.sameOpponentMaxPerWeek && 
         opponent.lastMatchDate > sevenDaysAgo;
}

/**
 * Check if win should be reduced (opponent much lower rank)
 */
export function shouldReduceWin(playerRank: number, opponentRank: number): boolean {
  return opponentRank - playerRank > 2; // Opponent 2+ ranks lower
}

/**
 * Convert MMR to rank
 */
export function mmrToRank(mmr: number): number {
  const threshold = MMR_CONFIG.rankThresholds.find(
    t => mmr >= t.minMmr && mmr <= t.maxMmr
  );
  return threshold?.rank || 9;
}

/**
 * Get required skill gates for a rank
 */
export function getSkillGatesForRank(rank: number): string[] {
  const rankData = ADULT_GLOW_RANKS.find(r => r.rank === rank);
  if (!rankData) return [];
  
  return rankData.skillGates.map(g => g.id);
}

/**
 * Check if player can be promoted to target rank
 */
export function canPromote(
  player: PlayerMatchStats,
  targetRank: number
): { canPromote: boolean; blockedBy: string[] } {
  // Can't promote if already at that rank or lower
  if (player.currentRank <= targetRank) {
    return { canPromote: false, blockedBy: [] };
  }
  
  // Check skill gates for target rank
  const requiredGates = getSkillGatesForRank(targetRank);
  const missingGates = requiredGates.filter(g => !player.skillGatesUnlocked.includes(g));
  
  if (missingGates.length > 0) {
    return { canPromote: false, blockedBy: missingGates };
  }
  
  // Check match volume requirements
  const rankData = ADULT_GLOW_RANKS.find(r => r.rank === targetRank);
  if (rankData?.matchRequirements?.minMatches8Weeks) {
    if (player.matchesLast8Weeks < rankData.matchRequirements.minMatches8Weeks) {
      return { 
        canPromote: false, 
        blockedBy: [`MIN_MATCHES_${rankData.matchRequirements.minMatches8Weeks}`] 
      };
    }
  }
  
  // Check behavior gates (no rage quits for higher ranks)
  if (targetRank <= 6 && player.rageQuitCount > 0) {
    return { canPromote: false, blockedBy: ["NO_RAGE_QUITS"] };
  }
  
  return { canPromote: true, blockedBy: [] };
}

/**
 * Main function: Update player's Glow Rank after a match
 */
export function updateGlowRankAfterMatch(
  player: PlayerMatchStats,
  match: MatchResult
): RankUpdateResult {
  const warnings: string[] = [];
  
  // Anti-farming check
  if (isFarming(match.opponentId, player.recentOpponents)) {
    warnings.push("Match not counted: farming detected (same opponent too often)");
    return {
      newMmr: player.currentMmr,
      mmrDelta: 0,
      newRank: player.currentRank,
      promoted: false,
      demoted: false,
      blockedByGates: [],
      warnings,
    };
  }
  
  // Calculate expected outcome
  const expected = calculateExpectedScore(player.currentMmr, match.opponentMmr);
  const outcome = match.didWin ? 1 : 0;
  
  // Calculate factors
  let marginFactor = calculateMarginFactor(match.gamesDiff);
  const trustFactor = getTrustFactor(match.verification);
  const kFactor = calculateKFactor(player.matchesLast8Weeks, player.totalMatches);
  
  // Reduce win impact if opponent much lower
  if (match.didWin && shouldReduceWin(player.currentRank, match.opponentRank)) {
    marginFactor *= MMR_CONFIG.lowerRankReduction;
    warnings.push("Win impact reduced: opponent significantly lower rank");
  }
  
  // Calculate MMR delta
  const delta = Math.round(kFactor * (outcome - expected) * marginFactor * trustFactor);
  const newMmr = Math.max(0, Math.min(3000, player.currentMmr + delta));
  
  // Determine new rank
  const targetRank = mmrToRank(newMmr);
  
  // Check if can promote
  let newRank = player.currentRank;
  let blockedByGates: string[] = [];
  let promoted = false;
  let demoted = false;
  
  if (targetRank < player.currentRank) {
    // Potential promotion
    const promotionCheck = canPromote(player, targetRank);
    if (promotionCheck.canPromote) {
      newRank = targetRank;
      promoted = true;
    } else {
      blockedByGates = promotionCheck.blockedBy;
      warnings.push(`Promotion to Glow ${targetRank} blocked by gates`);
    }
  } else if (targetRank > player.currentRank) {
    // Demotion (no gates needed)
    newRank = targetRank;
    demoted = true;
  }
  
  return {
    newMmr,
    mmrDelta: delta,
    newRank,
    promoted,
    demoted,
    blockedByGates,
    warnings,
  };
}

// =============================================================================
// BATCH MATCH PROCESSING
// =============================================================================

/**
 * Get player's match stats for the last 8 weeks
 */
export function getMatchStatsWindow(
  matches: MatchResult[],
  playerId: string
): { count: number; opponents: Map<string, { count: number; lastDate: Date }> } {
  const eightWeeksAgo = new Date();
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
  
  const recentMatches = matches.filter(
    m => m.playerId === playerId && m.matchDate >= eightWeeksAgo
  );
  
  const opponentMap = new Map<string, { count: number; lastDate: Date }>();
  
  for (const match of recentMatches) {
    const existing = opponentMap.get(match.opponentId);
    if (existing) {
      existing.count++;
      if (match.matchDate > existing.lastDate) {
        existing.lastDate = match.matchDate;
      }
    } else {
      opponentMap.set(match.opponentId, { count: 1, lastDate: match.matchDate });
    }
  }
  
  return { count: recentMatches.length, opponents: opponentMap };
}

// =============================================================================
// SKILL GATE EVALUATION
// =============================================================================

/**
 * Check if a skill rubric score meets the gate requirement
 */
export function evaluateSkillGate(
  gateId: string,
  currentScore: number,
  requiredScore: number
): boolean {
  return currentScore >= requiredScore;
}

/**
 * Get all skill gates a player has unlocked based on their rubric scores
 */
export function getUnlockedSkillGates(
  playerSkillScores: { skillId: string; score: number }[]
): string[] {
  const unlocked: string[] = [];
  
  for (const rankData of ADULT_GLOW_RANKS) {
    for (const gate of rankData.skillGates) {
      // Check if player meets this gate
      if ("min" in gate) {
        // Threshold-based gate
        const playerScore = playerSkillScores.find(s => s.skillId === gate.metric);
        if (playerScore && playerScore.score >= gate.min) {
          unlocked.push(gate.id);
        }
      } else if ("required" in gate && gate.required) {
        // Boolean gate - check if confirmed
        const playerScore = playerSkillScores.find(s => s.skillId === gate.metric);
        if (playerScore && playerScore.score >= 2) {
          unlocked.push(gate.id);
        }
      }
    }
  }
  
  return [...new Set(unlocked)]; // Remove duplicates
}

// =============================================================================
// RANK INFO HELPERS
// =============================================================================

/**
 * Get display information for a rank
 */
export function getRankInfo(rank: number): {
  name: string;
  abilitySnapshot: string;
  mmrRange: { min: number; max: number };
} | null {
  const rankData = ADULT_GLOW_RANKS.find(r => r.rank === rank);
  if (!rankData) return null;
  
  return {
    name: rankData.name,
    abilitySnapshot: rankData.abilitySnapshot,
    mmrRange: rankData.mmrRange,
  };
}

/**
 * Get all ranks with their info
 */
export function getAllRanks(): Array<{
  rank: number;
  name: string;
  mmrRange: { min: number; max: number };
}> {
  return ADULT_GLOW_RANKS.map(r => ({
    rank: r.rank,
    name: r.name,
    mmrRange: r.mmrRange,
  }));
}

/**
 * Get skill rubric by ID
 */
export function getSkillRubric(skillId: string) {
  return ADULT_SKILL_RUBRICS.find(s => s.id === skillId);
}

/**
 * Get all skill rubrics for a pillar
 */
export function getSkillRubricsByPillar(pillar: string) {
  return ADULT_SKILL_RUBRICS.filter(s => s.pillar === pillar);
}
