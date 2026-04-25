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
export function getAllRanks(): {
  rank: number;
  name: string;
  mmrRange: { min: number; max: number };
}[] {
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

// =============================================================================
// DSS-STYLE DECIMAL RATING SYSTEM
// =============================================================================

/**
 * Convert MMR (0-3000) to DSS-style decimal rating (9.0000 to 1.0000)
 * Higher MMR = Lower (better) DSS rating
 * 
 * DSS Format: X.YYYY where X is rank (1-9), YYYY is decimal (0000-9999)
 * Example: MMR 750 → DSS 7.5000 (middle of rank 7 range)
 */
export function mmrToDssRating(mmr: number): number {
  // Clamp MMR to valid range
  const clampedMmr = Math.max(0, Math.min(3000, mmr));
  
  // Find the rank threshold
  const threshold = MMR_CONFIG.rankThresholds.find(
    t => clampedMmr >= t.minMmr && clampedMmr <= t.maxMmr
  );
  
  if (!threshold) {
    return 9.0000; // Default to beginner
  }
  
  const rank = threshold.rank;
  const rangeSize = threshold.maxMmr - threshold.minMmr;
  const positionInRange = clampedMmr - threshold.minMmr;
  
  // Calculate decimal part (0.0000 to 0.9999 within rank)
  // Higher MMR within rank = lower decimal (closer to next rank)
  const decimalPart = 1 - (positionInRange / rangeSize);
  
  // Combine: rank + decimal
  const dssRating = rank + decimalPart * 0.9999;
  
  return Math.round(dssRating * 10000) / 10000;
}

/**
 * Convert DSS rating back to MMR
 */
export function dssRatingToMmr(dssRating: number): number {
  const rank = Math.floor(dssRating);
  const decimal = dssRating - rank;
  
  const threshold = MMR_CONFIG.rankThresholds.find(t => t.rank === rank);
  if (!threshold) return 0;
  
  const rangeSize = threshold.maxMmr - threshold.minMmr;
  const positionInRange = (1 - decimal / 0.9999) * rangeSize;
  
  return Math.round(threshold.minMmr + positionInRange);
}

/**
 * Format DSS rating for display (e.g., "7.1234")
 */
export function formatDssRating(dssRating: number): string {
  return dssRating.toFixed(4);
}

/**
 * Get the DSS rating bracket label (e.g., "Bracket 7" or "Speelsterkte 7")
 */
export function getDssBracket(dssRating: number): number {
  return Math.floor(dssRating);
}

// =============================================================================
// MATCHES TO NEXT LEVEL CALCULATOR
// =============================================================================

/**
 * Calculate estimated matches needed to reach next rank
 * Based on average delta per match at current skill level
 */
export function estimateMatchesToNextRank(
  currentMmr: number,
  currentRank: number,
  averageOpponentMmr?: number
): {
  matchesNeeded: number;
  mmrNeeded: number;
  targetRank: number;
  confidence: "low" | "medium" | "high";
} {
  // Can't go higher than rank 1
  if (currentRank <= 1) {
    return { matchesNeeded: 0, mmrNeeded: 0, targetRank: 1, confidence: "high" };
  }
  
  const targetRank = currentRank - 1;
  const targetThreshold = MMR_CONFIG.rankThresholds.find(t => t.rank === targetRank);
  
  if (!targetThreshold) {
    return { matchesNeeded: 999, mmrNeeded: 0, targetRank, confidence: "low" };
  }
  
  const mmrNeeded = targetThreshold.minMmr - currentMmr;
  
  if (mmrNeeded <= 0) {
    // Already has MMR for next rank, just needs skill gates
    return { matchesNeeded: 0, mmrNeeded: 0, targetRank, confidence: "high" };
  }
  
  // Estimate average delta per win
  // Against equal opponent: ~14 MMR per win (K=28, expected=0.5, outcome=1)
  // Against slightly stronger: ~18-20 MMR per win
  // We use a conservative estimate assuming 60% win rate against equal opponents
  const opponentMmr = averageOpponentMmr || currentMmr;
  const expectedWinRate = calculateExpectedScore(currentMmr, opponentMmr);
  
  // Average delta per match (wins and losses combined)
  // With 60% win rate: 0.6 * 14 + 0.4 * -14 = 8.4 - 5.6 = 2.8 MMR per match
  const avgDeltaPerMatch = MMR_CONFIG.baseK * (0.6 - expectedWinRate);
  
  if (avgDeltaPerMatch <= 0) {
    // Can't progress with current matchmaking
    return { matchesNeeded: 999, mmrNeeded, targetRank, confidence: "low" };
  }
  
  const matchesNeeded = Math.ceil(mmrNeeded / avgDeltaPerMatch);
  
  // Confidence based on variance
  const confidence = matchesNeeded <= 10 ? "high" : matchesNeeded <= 30 ? "medium" : "low";
  
  return { matchesNeeded, mmrNeeded, targetRank, confidence };
}

/**
 * Get rating trend based on recent matches
 */
export function getRatingTrend(
  ratingHistory: { mmr: number; date: Date }[]
): {
  trend: "up" | "down" | "stable";
  changePercent: number;
  recentDelta: number;
} {
  if (ratingHistory.length < 2) {
    return { trend: "stable", changePercent: 0, recentDelta: 0 };
  }
  
  // Compare last 5 matches to previous 5
  const recent = ratingHistory.slice(-5);
  const previous = ratingHistory.slice(-10, -5);
  
  if (previous.length === 0) {
    const firstMmr = ratingHistory[0].mmr;
    const lastMmr = ratingHistory[ratingHistory.length - 1].mmr;
    const delta = lastMmr - firstMmr;
    const changePercent = (delta / firstMmr) * 100;
    return {
      trend: delta > 10 ? "up" : delta < -10 ? "down" : "stable",
      changePercent: Math.round(changePercent * 10) / 10,
      recentDelta: delta,
    };
  }
  
  const recentAvg = recent.reduce((sum, r) => sum + r.mmr, 0) / recent.length;
  const previousAvg = previous.reduce((sum, r) => sum + r.mmr, 0) / previous.length;
  
  const delta = recentAvg - previousAvg;
  const changePercent = (delta / previousAvg) * 100;
  
  return {
    trend: delta > 15 ? "up" : delta < -15 ? "down" : "stable",
    changePercent: Math.round(changePercent * 10) / 10,
    recentDelta: Math.round(delta),
  };
}

// =============================================================================
// DOUBLES RATING ENGINE
// =============================================================================

/**
 * DSS Doubles: Calculate team rating from two players
 * Uses θ = 0.5 weighting (equal contribution)
 */
export function calculateTeamRating(player1Mmr: number, player2Mmr: number): number {
  const theta = 0.5;
  return theta * player1Mmr + theta * player2Mmr;
}

/**
 * DSS Doubles: Calculate expected score for team vs team
 * Uses q = 2.012 for doubles (vs 1.824 for singles)
 */
export function calculateDoublesExpectedScore(
  teamAMmr: number,
  teamBMmr: number
): number {
  const q = 2.012; // Doubles constant (slightly different from singles)
  return 1 / (1 + Math.pow(10, (teamBMmr - teamAMmr) / (400 * q)));
}

/**
 * Update both players' doubles ratings after a doubles match
 */
export function updateDoublesRatings(
  player1Mmr: number,
  player2Mmr: number,
  opponent1Mmr: number,
  opponent2Mmr: number,
  didWin: boolean,
  verification: MatchResult["verification"]
): { player1Delta: number; player2Delta: number } {
  const teamAMmr = calculateTeamRating(player1Mmr, player2Mmr);
  const teamBMmr = calculateTeamRating(opponent1Mmr, opponent2Mmr);
  
  const expected = calculateDoublesExpectedScore(teamAMmr, teamBMmr);
  const outcome = didWin ? 1 : 0;
  const trustFactor = getTrustFactor(verification);
  
  // Both players get same delta based on team performance
  const kFactor = MMR_CONFIG.baseK * 0.85; // Slightly lower K for doubles
  const delta = Math.round(kFactor * (outcome - expected) * trustFactor);
  
  return { player1Delta: delta, player2Delta: delta };
}

// =============================================================================
// RATING DISPLAY HELPERS
// =============================================================================

/**
 * Get complete rating status for display
 */
export function getPlayerRatingStatus(
  mmr: number,
  rank: number,
  matchesPlayed: number,
  ratingHistory: { mmr: number; date: Date }[]
): {
  mmr: number;
  dssRating: string;
  bracket: number;
  rankName: string;
  trend: "up" | "down" | "stable";
  matchesToNext: number;
  confidence: "low" | "medium" | "high";
  isProvisional: boolean;
} {
  const dssRating = formatDssRating(mmrToDssRating(mmr));
  const bracket = getDssBracket(parseFloat(dssRating));
  const rankInfo = getRankInfo(rank);
  const trendInfo = getRatingTrend(ratingHistory);
  const progressInfo = estimateMatchesToNextRank(mmr, rank);
  
  return {
    mmr,
    dssRating,
    bracket,
    rankName: rankInfo?.name || "Unknown",
    trend: trendInfo.trend,
    matchesToNext: progressInfo.matchesNeeded,
    confidence: progressInfo.confidence,
    isProvisional: matchesPlayed < MMR_CONFIG.newPlayerThreshold,
  };
}
