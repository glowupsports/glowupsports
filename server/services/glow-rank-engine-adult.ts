/**
 * Adult Glow Rank Engine
 *
 * Elo-based MMR calculation with:
 * - UTR-style score ratio (games_won / total_games) replaces binary win/loss
 * - Trust factors (verification level)
 * - K-factor (activity/volatility dependent)
 * - Anti-farming rules
 * - Skill gates as achievements only — MMR threshold is the sole promotion gate
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
  gamesDiff: number;
  setScore?: string;
  scoreJson?: { p: number; o: number }[]; // Structured per-set scores
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
  explanation: string;
  scoreRatioUsed: number | null;
  achievementBadges: string[];
}

// =============================================================================
// SCORE RATIO ENGINE (UTR-style)
// =============================================================================

/**
 * Calculate score ratio from structured set scores: games_won / total_games
 * Example: [{p:6,o:1},{p:6,o:2}] → (6+6)/(6+1+6+2) = 12/15 = 0.8
 */
export function calculateScoreRatio(scoreJson: { p: number; o: number }[]): number {
  if (!scoreJson || scoreJson.length === 0) return 0.5;
  let playerGames = 0;
  let totalGames = 0;
  for (const set of scoreJson) {
    playerGames += set.p;
    totalGames += set.p + set.o;
  }
  if (totalGames === 0) return 0.5;
  return playerGames / totalGames;
}

/**
 * Parse a setScore text string to score ratio.
 * Convention: first number in each "6-4" token is always the recording player's games.
 * Example: "6-4, 6-3" → player_games=12, opp_games=7 → ratio = 12/19 ≈ 0.632
 */
export function parseSetScoreToRatio(setScore: string): number | null {
  const sets = setScore.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (sets.length === 0) return null;
  let playerGames = 0;
  let opponentGames = 0;
  for (const set of sets) {
    const parts = set.split("-").map((n) => parseInt(n, 10));
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    playerGames += parts[0];
    opponentGames += parts[1];
  }
  const total = playerGames + opponentGames;
  if (total === 0) return null;
  return playerGames / total;
}

/**
 * Generate a human-readable post-match explanation.
 * scoreratio: 0–1 from the recording player's perspective.
 * opponentMmrDiff: positive = opponent stronger than player.
 */
export function generateMatchExplanation(
  delta: number,
  scoreRatio: number | null,
  didWin: boolean,
  opponentMmrDiff: number,
  scoreJson?: { p: number; o: number }[],
): string {
  const opponentDesc =
    opponentMmrDiff > 200
      ? "veel sterkere tegenstander"
      : opponentMmrDiff > 60
      ? "sterkere tegenstander"
      : opponentMmrDiff > -60
      ? "gelijkwaardige tegenstander"
      : opponentMmrDiff > -200
      ? "zwakkere tegenstander"
      : "veel zwakkere tegenstander";

  const scoreStr = scoreJson ? scoreJson.map((s) => `${s.p}-${s.o}`).join(", ") : "";

  let matchDesc: string;
  if (didWin) {
    if (scoreRatio !== null && scoreRatio >= 0.68) {
      matchDesc = "Dominante overwinning";
    } else if (scoreRatio !== null && scoreRatio >= 0.57) {
      matchDesc = "Comfortabele overwinning";
    } else {
      matchDesc = "Nipte overwinning";
    }
  } else {
    if (scoreRatio !== null && scoreRatio >= 0.45) {
      matchDesc = "Sterke strijd ondanks verlies";
    } else if (scoreRatio !== null && scoreRatio >= 0.33) {
      matchDesc = "Gevecht tot het einde";
    } else {
      matchDesc = "Zware verlies";
    }
  }

  const sign = delta >= 0 ? "+" : "";
  const scoreClause = scoreStr ? ` (${scoreStr})` : "";
  return `${sign}${delta} rating — ${matchDesc}${scoreClause} vs ${opponentDesc}`;
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
 * Legacy margin factor — only used as fallback when no set score is provided.
 */
export function calculateMarginFactor(gamesDiff: number): number {
  const { marginBase, marginPerGame, marginMin, marginMax } = MMR_CONFIG;
  const factor = marginBase + Math.abs(gamesDiff) * marginPerGame;
  return Math.max(marginMin, Math.min(marginMax, factor));
}

/**
 * Get trust factor based on verification level
 */
export function getTrustFactor(verification: MatchResult["verification"]): number {
  return (
    MMR_CONFIG.trustFactors[verification as keyof typeof MMR_CONFIG.trustFactors] ||
    MMR_CONFIG.trustFactors.selfReported
  );
}

/**
 * Calculate K-factor based on activity and experience
 */
export function calculateKFactor(matchesLast8Weeks: number, totalMatches: number): number {
  const {
    baseK,
    activityFactorThreshold,
    activeActivityFactor,
    inactiveActivityFactor,
    newPlayerThreshold,
    newPlayerVolatility,
    establishedVolatility,
  } = MMR_CONFIG;

  const activityFactor =
    matchesLast8Weeks >= activityFactorThreshold ? activeActivityFactor : inactiveActivityFactor;
  const volatilityFactor =
    totalMatches < newPlayerThreshold ? newPlayerVolatility : establishedVolatility;

  return baseK * activityFactor * volatilityFactor;
}

/**
 * Check if match is farming (same opponent too often)
 */
export function isFarming(
  opponentId: string,
  recentOpponents: PlayerMatchStats["recentOpponents"],
): boolean {
  const opponent = recentOpponents.find((o) => o.opponentId === opponentId);
  if (!opponent) return false;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return (
    opponent.matchCount >= MMR_CONFIG.sameOpponentMaxPerWeek &&
    opponent.lastMatchDate > sevenDaysAgo
  );
}

/**
 * Check if win should be reduced (opponent much lower rank)
 */
export function shouldReduceWin(playerRank: number, opponentRank: number): boolean {
  return opponentRank - playerRank > 2;
}

/**
 * Convert MMR to rank
 */
export function mmrToRank(mmr: number): number {
  const threshold = MMR_CONFIG.rankThresholds.find((t) => mmr >= t.minMmr && mmr <= t.maxMmr);
  return threshold?.rank || 9;
}

/**
 * Get required skill gates for a rank (informational only — no longer blocks promotion)
 */
export function getSkillGatesForRank(rank: number): string[] {
  const rankData = ADULT_GLOW_RANKS.find((r) => r.rank === rank);
  if (!rankData) return [];
  return rankData.skillGates.map((g) => g.id);
}

/**
 * Check if player can be promoted to target rank.
 * Since skill gates are achievements now, only MMR determines promotion.
 */
export function canPromote(
  player: PlayerMatchStats,
  targetRank: number,
): { canPromote: boolean; blockedBy: string[] } {
  if (player.currentRank <= targetRank) {
    return { canPromote: false, blockedBy: [] };
  }

  // MMR threshold is the only gate — skill gates are achievements, not blockers.
  return { canPromote: true, blockedBy: [] };
}

/**
 * Return all skill gate IDs the player has unlocked (as achievement badges).
 */
export function getSkillGateAchievements(skillGatesUnlocked: string[]): string[] {
  return [...skillGatesUnlocked];
}

/**
 * Main function: Update player's Glow Rank after a match.
 * Uses UTR-style score ratio when set scores are available.
 */
export function updateGlowRankAfterMatch(
  player: PlayerMatchStats,
  match: MatchResult,
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
      explanation: "Match telt niet mee — te vaak dezelfde tegenstander deze week",
      scoreRatioUsed: null,
      achievementBadges: getSkillGateAchievements(player.skillGatesUnlocked),
    };
  }

  // Calculate expected outcome (Elo)
  const expected = calculateExpectedScore(player.currentMmr, match.opponentMmr);

  // Determine score ratio (UTR-style)
  let scoreRatio: number | null = null;
  let marginFactor = 1.0;

  if (match.scoreJson && match.scoreJson.length > 0) {
    scoreRatio = calculateScoreRatio(match.scoreJson);
  } else if (match.setScore) {
    scoreRatio = parseSetScoreToRatio(match.setScore);
  }

  if (scoreRatio === null) {
    // No score available — fall back to binary outcome with legacy margin factor
    scoreRatio = match.didWin ? 1.0 : 0.0;
    marginFactor = calculateMarginFactor(match.gamesDiff);
  }

  let effectiveScoreRatio = scoreRatio;
  const trustFactor = getTrustFactor(match.verification);
  const kFactor = calculateKFactor(player.matchesLast8Weeks, player.totalMatches);

  // Reduce win impact if opponent much lower rank
  if (match.didWin && shouldReduceWin(player.currentRank, match.opponentRank)) {
    effectiveScoreRatio = 0.5 + (effectiveScoreRatio - 0.5) * MMR_CONFIG.lowerRankReduction;
    warnings.push("Win impact reduced: opponent significantly lower rank");
  }

  // Calculate MMR delta: K * (scoreRatio - expected) * marginFactor * trust
  const delta = Math.round(kFactor * (effectiveScoreRatio - expected) * marginFactor * trustFactor);
  const newMmr = Math.max(0, Math.min(3000, player.currentMmr + delta));

  // Determine new rank (MMR is the only gate)
  const targetRank = mmrToRank(newMmr);
  let newRank = player.currentRank;
  let promoted = false;
  let demoted = false;

  if (targetRank < player.currentRank) {
    const promotionCheck = canPromote(player, targetRank);
    if (promotionCheck.canPromote) {
      newRank = targetRank;
      promoted = true;
    }
  } else if (targetRank > player.currentRank) {
    newRank = targetRank;
    demoted = true;
  }

  const opponentMmrDiff = match.opponentMmr - player.currentMmr;
  const explanation = generateMatchExplanation(
    delta,
    scoreRatio,
    match.didWin,
    opponentMmrDiff,
    match.scoreJson,
  );

  return {
    newMmr,
    mmrDelta: delta,
    newRank,
    promoted,
    demoted,
    blockedByGates: [],
    warnings,
    explanation,
    scoreRatioUsed: scoreRatio,
    achievementBadges: getSkillGateAchievements(player.skillGatesUnlocked),
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
  playerId: string,
): { count: number; opponents: Map<string, { count: number; lastDate: Date }> } {
  const eightWeeksAgo = new Date();
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

  const recentMatches = matches.filter(
    (m) => m.playerId === playerId && m.matchDate >= eightWeeksAgo,
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
// SKILL GATE EVALUATION (kept for achievement checking)
// =============================================================================

/**
 * Check if a skill rubric score meets the gate requirement
 */
export function evaluateSkillGate(
  _gateId: string,
  currentScore: number,
  requiredScore: number,
): boolean {
  return currentScore >= requiredScore;
}

/**
 * Get all skill gates a player has unlocked based on their rubric scores
 */
export function getUnlockedSkillGates(
  playerSkillScores: { skillId: string; score: number }[],
): string[] {
  const unlocked: string[] = [];

  for (const rankData of ADULT_GLOW_RANKS) {
    for (const gate of rankData.skillGates) {
      if ("min" in gate) {
        const playerScore = playerSkillScores.find((s) => s.skillId === gate.metric);
        if (playerScore && gate.min != null && playerScore.score >= (gate.min ?? 0)) {
          unlocked.push(gate.id);
        }
      } else if ("required" in gate && gate.required) {
        const playerScore = playerSkillScores.find((s) => s.skillId === gate.metric);
        if (playerScore && playerScore.score >= 2) {
          unlocked.push(gate.id);
        }
      }
    }
  }

  return [...new Set(unlocked)];
}

// =============================================================================
// RANK INFO HELPERS
// =============================================================================

export function getRankInfo(rank: number): {
  name: string;
  abilitySnapshot: string;
  mmrRange: { min: number; max: number };
} | null {
  const rankData = ADULT_GLOW_RANKS.find((r) => r.rank === rank);
  if (!rankData) return null;

  return {
    name: rankData.name,
    abilitySnapshot: rankData.abilitySnapshot,
    mmrRange: rankData.mmrRange,
  };
}

export function getAllRanks(): {
  rank: number;
  name: string;
  mmrRange: { min: number; max: number };
}[] {
  return ADULT_GLOW_RANKS.map((r) => ({
    rank: r.rank,
    name: r.name,
    mmrRange: r.mmrRange,
  }));
}

export function getSkillRubric(skillId: string) {
  return ADULT_SKILL_RUBRICS.find((s) => s.id === skillId);
}

export function getSkillRubricsByPillar(pillar: string) {
  return ADULT_SKILL_RUBRICS.filter((s) => s.pillar === pillar);
}

// =============================================================================
// DSS-STYLE DECIMAL RATING SYSTEM
// =============================================================================

export function mmrToDssRating(mmr: number): number {
  const clampedMmr = Math.max(0, Math.min(3000, mmr));

  const threshold = MMR_CONFIG.rankThresholds.find(
    (t) => clampedMmr >= t.minMmr && clampedMmr <= t.maxMmr,
  );

  if (!threshold) {
    return 9.0;
  }

  const rank = threshold.rank;
  const rangeSize = threshold.maxMmr - threshold.minMmr;
  const positionInRange = clampedMmr - threshold.minMmr;
  const decimalPart = 1 - positionInRange / rangeSize;
  const dssRating = rank + decimalPart * 0.9999;

  return Math.round(dssRating * 10000) / 10000;
}

export function dssRatingToMmr(dssRating: number): number {
  const rank = Math.floor(dssRating);
  const decimal = dssRating - rank;

  const threshold = MMR_CONFIG.rankThresholds.find((t) => t.rank === rank);
  if (!threshold) return 0;

  const rangeSize = threshold.maxMmr - threshold.minMmr;
  const positionInRange = (1 - decimal / 0.9999) * rangeSize;

  return Math.round(threshold.minMmr + positionInRange);
}

export function formatDssRating(dssRating: number): string {
  return dssRating.toFixed(4);
}

export function getDssBracket(dssRating: number): number {
  return Math.floor(dssRating);
}

// =============================================================================
// MATCHES TO NEXT LEVEL CALCULATOR
// =============================================================================

export function estimateMatchesToNextRank(
  currentMmr: number,
  currentRank: number,
  averageOpponentMmr?: number,
): {
  matchesNeeded: number;
  mmrNeeded: number;
  targetRank: number;
  confidence: "low" | "medium" | "high";
} {
  if (currentRank <= 1) {
    return { matchesNeeded: 0, mmrNeeded: 0, targetRank: 1, confidence: "high" };
  }

  const targetRank = currentRank - 1;
  const targetThreshold = MMR_CONFIG.rankThresholds.find((t) => t.rank === targetRank);

  if (!targetThreshold) {
    return { matchesNeeded: 999, mmrNeeded: 0, targetRank, confidence: "low" };
  }

  const mmrNeeded = targetThreshold.minMmr - currentMmr;

  if (mmrNeeded <= 0) {
    return { matchesNeeded: 0, mmrNeeded: 0, targetRank, confidence: "high" };
  }

  const opponentMmr = averageOpponentMmr || currentMmr;
  const expectedWinRate = calculateExpectedScore(currentMmr, opponentMmr);
  const avgDeltaPerMatch = MMR_CONFIG.baseK * (0.6 - expectedWinRate);

  if (avgDeltaPerMatch <= 0) {
    return { matchesNeeded: 999, mmrNeeded, targetRank, confidence: "low" };
  }

  const matchesNeeded = Math.ceil(mmrNeeded / avgDeltaPerMatch);
  const confidence = matchesNeeded <= 10 ? "high" : matchesNeeded <= 30 ? "medium" : "low";

  return { matchesNeeded, mmrNeeded, targetRank, confidence };
}

// =============================================================================
// RATING TREND
// =============================================================================

export function getRatingTrend(ratingHistory: { mmr: number; date: Date }[]): {
  trend: "up" | "down" | "stable";
  changePercent: number;
  recentDelta: number;
} {
  if (ratingHistory.length < 2) {
    return { trend: "stable", changePercent: 0, recentDelta: 0 };
  }

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
 * DSS Doubles: Calculate team rating from two players (equal weighting)
 */
export function calculateTeamRating(player1Mmr: number, player2Mmr: number): number {
  return 0.5 * player1Mmr + 0.5 * player2Mmr;
}

/**
 * DSS Doubles: Calculate expected score for team vs team
 */
export function calculateDoublesExpectedScore(teamAMmr: number, teamBMmr: number): number {
  const q = 2.012;
  return 1 / (1 + Math.pow(10, (teamBMmr - teamAMmr) / (400 * q)));
}

/**
 * Update both players' doubles ratings after a doubles match.
 * Uses UTR-style score ratio when set scores are available.
 */
export function updateDoublesRatings(
  player1Mmr: number,
  player2Mmr: number,
  opponent1Mmr: number,
  opponent2Mmr: number,
  didWin: boolean,
  verification: MatchResult["verification"],
  scoreJson?: { p: number; o: number }[],
): { player1Delta: number; player2Delta: number; explanation: string } {
  const teamAMmr = calculateTeamRating(player1Mmr, player2Mmr);
  const teamBMmr = calculateTeamRating(opponent1Mmr, opponent2Mmr);

  const expected = calculateDoublesExpectedScore(teamAMmr, teamBMmr);
  const trustFactor = getTrustFactor(verification);
  const kFactor = MMR_CONFIG.baseK * 0.85;

  let scoreRatio: number;
  let marginFactor = 1.0;

  if (scoreJson && scoreJson.length > 0) {
    scoreRatio = calculateScoreRatio(scoreJson);
  } else {
    scoreRatio = didWin ? 1.0 : 0.0;
    marginFactor = 1.0;
  }

  const delta = Math.round(kFactor * (scoreRatio - expected) * marginFactor * trustFactor);

  const opponentMmrDiff = teamBMmr - teamAMmr;
  const explanation = generateMatchExplanation(delta, scoreRatio, didWin, opponentMmrDiff, scoreJson);

  return { player1Delta: delta, player2Delta: delta, explanation };
}

// =============================================================================
// RATING DISPLAY HELPERS
// =============================================================================

export function getPlayerRatingStatus(
  mmr: number,
  rank: number,
  matchesPlayed: number,
  ratingHistory: { mmr: number; date: Date }[],
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
