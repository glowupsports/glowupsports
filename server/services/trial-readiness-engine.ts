/**
 * Trial Readiness Engine
 * 
 * Automatically detects when a player is ready for a level trial based on:
 * - Skill scores meeting level requirements
 * - Required pillar minimums achieved
 * - Evidence videos collected
 * - Match events completed
 * - All prerequisite skills at target scores
 */

import { db } from "../db";
import {
  ballLevels,
  levelSkills,
  levelTests,
  glowSkills,
  skillRubrics,
  playerSkillScores,
  playerBallLevels,
  playerPillarProgress,
  skillEvidence,
  matchLogs,
  players,
} from "../../shared/schema";
import { eq, and, desc, sql, gte, inArray } from "drizzle-orm";

const MIN_OBSERVATIONS_FOR_STABLE_SCORE = 3;
const SKILL_MOVING_AVERAGE_THRESHOLD = 1.7;

export interface TrialReadinessResult {
  playerId: string;
  currentLevelId: string;
  targetLevelId: string | null;
  isReady: boolean;
  readinessPercentage: number;
  requirements: {
    skillsRequired: number;
    skillsAchieved: number;
    skillsProgress: number;
    pillarRequirements: PillarRequirement[];
    evidenceRequired: number;
    evidenceSubmitted: number;
    evidenceProgress: number;
    matchesRequired: number;
    matchesCompleted: number;
    matchesProgress: number;
    winsRequired: number;
    winsAchieved: number;
    winsProgress: number;
    testsRequired: string[];
  };
  blockers: string[];
  recommendations: string[];
  estimatedReadyDate: Date | null;
}

interface PillarRequirement {
  pillar: string;
  minimum: number;
  achieved: number;
  isMet: boolean;
}

interface SkillScore {
  skillId: string;
  latestScore: number;
  movingAverage: number;
  observationCount: number;
  isStable: boolean;
}

export async function calculateTrialReadiness(playerId: string): Promise<TrialReadinessResult> {
  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) {
    throw new Error("Player not found");
  }

  const [currentPlayerLevel] = await db
    .select({ level: ballLevels })
    .from(playerBallLevels)
    .innerJoin(ballLevels, eq(playerBallLevels.levelId, ballLevels.id))
    .where(and(
      eq(playerBallLevels.playerId, playerId),
      eq(playerBallLevels.status, "active")
    ))
    .orderBy(desc(playerBallLevels.assignedAt))
    .limit(1);

  const currentLevel = currentPlayerLevel?.level;
  if (!currentLevel) {
    const [defaultLevel] = await db.select().from(ballLevels).where(eq(ballLevels.id, "RED_3"));
    return createEmptyReadinessResult(playerId, "RED_3", defaultLevel?.promotionToLevelId || null);
  }

  const promotionRequirements = currentLevel.promotionRequirements as any;
  if (!promotionRequirements || !currentLevel.promotionToLevelId) {
    return createEmptyReadinessResult(playerId, currentLevel.id, null);
  }

  const playerSkills = await getPlayerSkillScores(playerId, currentLevel.id);
  const pillarProgress = await getPillarProgress(playerId);
  const evidenceCount = await getEvidenceCount(playerId);
  const matchStats = await getMatchStats(playerId);
  const levelTestsData = await db.select().from(levelTests).where(eq(levelTests.levelId, currentLevel.id));

  const skillsRequired = promotionRequirements.skillAchievedCount || 0;
  const skillsAchieved = playerSkills.filter(s => s.movingAverage >= SKILL_MOVING_AVERAGE_THRESHOLD && s.isStable).length;
  const skillsProgress = skillsRequired > 0 ? Math.min(100, Math.round((skillsAchieved / skillsRequired) * 100)) : 100;

  const pillarMin = promotionRequirements.pillarMinimum || {};
  const pillarRequirements: PillarRequirement[] = Object.entries(pillarMin).map(([pillar, min]) => {
    const achieved = pillarProgress[pillar] || 0;
    return {
      pillar,
      minimum: min as number,
      achieved,
      isMet: achieved >= (min as number),
    };
  });

  const evidenceRequired = promotionRequirements.evidenceMin || 0;
  const evidenceProgress = evidenceRequired > 0 ? Math.min(100, Math.round((evidenceCount / evidenceRequired) * 100)) : 100;

  const matchesRequired = promotionRequirements.matchEvents || 0;
  const matchesCompleted = matchStats.total;
  const matchesProgress = matchesRequired > 0 ? Math.min(100, Math.round((matchesCompleted / matchesRequired) * 100)) : 100;

  const winsRequired = promotionRequirements.matchWins || 0;
  const winsAchieved = matchStats.wins;
  const winsProgress = winsRequired > 0 ? Math.min(100, Math.round((winsAchieved / winsRequired) * 100)) : 100;

  const blockers: string[] = [];
  const recommendations: string[] = [];

  if (skillsAchieved < skillsRequired) {
    const remaining = skillsRequired - skillsAchieved;
    blockers.push(`Need ${remaining} more skills at achieved level`);
    
    const emergingSkills = playerSkills.filter(s => s.movingAverage >= 1.0 && s.movingAverage < SKILL_MOVING_AVERAGE_THRESHOLD);
    if (emergingSkills.length > 0) {
      recommendations.push(`Focus on ${emergingSkills.length} emerging skills that are close to achieved`);
    }
  }

  pillarRequirements.filter(p => !p.isMet).forEach(p => {
    blockers.push(`${p.pillar} pillar needs ${p.minimum - p.achieved} more points`);
  });

  if (evidenceCount < evidenceRequired) {
    blockers.push(`Need ${evidenceRequired - evidenceCount} more evidence videos`);
    recommendations.push("Record skill evidence during sessions");
  }

  if (matchesCompleted < matchesRequired) {
    blockers.push(`Need ${matchesRequired - matchesCompleted} more match events`);
    recommendations.push("Participate in more match play");
  }

  if (winsAchieved < winsRequired) {
    blockers.push(`Need ${winsRequired - winsAchieved} more match wins`);
  }

  const weights = { skills: 40, pillars: 20, evidence: 15, matches: 15, wins: 10 };
  const pillarProgressTotal = pillarRequirements.length > 0
    ? pillarRequirements.filter(p => p.isMet).length / pillarRequirements.length * 100
    : 100;

  const readinessPercentage = Math.round(
    (skillsProgress * weights.skills +
     pillarProgressTotal * weights.pillars +
     evidenceProgress * weights.evidence +
     matchesProgress * weights.matches +
     winsProgress * weights.wins) / 100
  );

  const isReady = blockers.length === 0;

  let estimatedReadyDate: Date | null = null;
  if (!isReady && readinessPercentage >= 60) {
    const daysRemaining = Math.ceil((100 - readinessPercentage) * 0.5);
    estimatedReadyDate = new Date();
    estimatedReadyDate.setDate(estimatedReadyDate.getDate() + daysRemaining);
  }

  return {
    playerId,
    currentLevelId: currentLevel.id,
    targetLevelId: currentLevel.promotionToLevelId,
    isReady,
    readinessPercentage,
    requirements: {
      skillsRequired,
      skillsAchieved,
      skillsProgress,
      pillarRequirements,
      evidenceRequired,
      evidenceSubmitted: evidenceCount,
      evidenceProgress,
      matchesRequired,
      matchesCompleted,
      matchesProgress,
      winsRequired,
      winsAchieved,
      winsProgress,
      testsRequired: levelTestsData.map(t => t.id),
    },
    blockers,
    recommendations,
    estimatedReadyDate,
  };
}

async function getPlayerSkillScores(playerId: string, levelId: string): Promise<SkillScore[]> {
  const levelSkillsData = await db
    .select({ skillId: levelSkills.skillId })
    .from(levelSkills)
    .where(eq(levelSkills.levelId, levelId));

  const skillIds = levelSkillsData.map(s => s.skillId);
  if (skillIds.length === 0) return [];

  const scores = await db
    .select({
      skillId: playerSkillScores.skillId,
      score: playerSkillScores.score,
      movingAverage: playerSkillScores.movingAverage,
    })
    .from(playerSkillScores)
    .where(and(
      eq(playerSkillScores.playerId, playerId),
      inArray(playerSkillScores.skillId, skillIds)
    ))
    .orderBy(playerSkillScores.skillId, desc(playerSkillScores.createdAt));

  const skillScoresMap: Record<string, { scores: number[]; movingAverage: number }> = {};
  for (const score of scores) {
    if (!skillScoresMap[score.skillId]) {
      skillScoresMap[score.skillId] = { scores: [], movingAverage: score.movingAverage || 0 };
    }
    skillScoresMap[score.skillId].scores.push(score.score);
  }

  return Object.entries(skillScoresMap).map(([skillId, data]) => ({
    skillId,
    latestScore: data.scores[0] || 0,
    movingAverage: data.movingAverage,
    observationCount: data.scores.length,
    isStable: data.scores.length >= MIN_OBSERVATIONS_FOR_STABLE_SCORE,
  }));
}

async function getPillarProgress(playerId: string): Promise<Record<string, number>> {
  const progress = await db
    .select()
    .from(playerPillarProgress)
    .where(eq(playerPillarProgress.playerId, playerId));

  const result: Record<string, number> = {};
  for (const p of progress) {
    result[p.pillar] = Number(p.currentScore ?? 0);
  }
  return result;
}

async function getEvidenceCount(playerId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(skillEvidence)
    .where(and(
      eq(skillEvidence.playerId, playerId),
      eq(skillEvidence.status, "approved")
    ));
  return result?.count || 0;
}

async function getMatchStats(playerId: string): Promise<{ total: number; wins: number }> {
  const playerMatchData = await db
    .select()
    .from(matchLogs)
    .where(eq(matchLogs.playerId, playerId));

  const wins = playerMatchData.filter(m => m.result === "win").length;
  return { total: playerMatchData.length, wins };
}

function createEmptyReadinessResult(
  playerId: string,
  currentLevelId: string,
  targetLevelId: string | null
): TrialReadinessResult {
  return {
    playerId,
    currentLevelId,
    targetLevelId,
    isReady: false,
    readinessPercentage: 0,
    requirements: {
      skillsRequired: 0,
      skillsAchieved: 0,
      skillsProgress: 0,
      pillarRequirements: [],
      evidenceRequired: 0,
      evidenceSubmitted: 0,
      evidenceProgress: 0,
      matchesRequired: 0,
      matchesCompleted: 0,
      matchesProgress: 0,
      winsRequired: 0,
      winsAchieved: 0,
      winsProgress: 0,
      testsRequired: [],
    },
    blockers: ["No current level assigned"],
    recommendations: ["Assign player to a starting level"],
    estimatedReadyDate: null,
  };
}

export async function getPlayersReadyForTrial(academyId: string): Promise<TrialReadinessResult[]> {
  const academyPlayers = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.academyId, academyId));

  const results: TrialReadinessResult[] = [];
  for (const player of academyPlayers) {
    try {
      const readiness = await calculateTrialReadiness(player.id);
      if (readiness.readinessPercentage >= 80) {
        results.push(readiness);
      }
    } catch (error) {
      console.error(`Error calculating readiness for player ${player.id}:`, error);
    }
  }

  return results.sort((a, b) => b.readinessPercentage - a.readinessPercentage);
}

export async function checkAndNotifyTrialReady(playerId: string): Promise<boolean> {
  const readiness = await calculateTrialReadiness(playerId);
  
  if (readiness.isReady) {
    console.log(`[TrialReadiness] Player ${playerId} is ready for trial to ${readiness.targetLevelId}`);
    return true;
  }
  
  return false;
}
