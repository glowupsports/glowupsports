/**
 * Glow Rank Engine
 * 
 * Calculates weighted skill and pillar scores for players.
 * Uses exponential moving average for smooth progression tracking.
 * 
 * Weights:
 * - Pillar scores: alpha = 0.3 (slower moving, represents overall domain strength)
 * - Skill scores: alpha = 0.4 (faster moving, represents recent performance)
 */

import { db } from "../db";
import { 
  playerSkillScores, 
  playerPillarProgress, 
  playerBallLevels,
  ballLevels,
  levelSkills,
  glowSkills,
} from "../../shared/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

const PILLAR_ALPHA = 0.3;
const SKILL_ALPHA = 0.4;

const PILLARS = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"] as const;

interface PillarScore {
  pillar: string;
  score: number;
  trend: "improving" | "stable" | "declining";
  skillCount: number;
  achievedCount: number;
}

interface SkillScore {
  skillId: string;
  skillName: string;
  pillar: string;
  score: number;
  movingAverage: number;
  observationCount: number;
  achieved: boolean;
}

interface GlowRank {
  playerId: string;
  levelId: string;
  levelName: string;
  stage: string;
  overallScore: number;
  glowScore: number;
  pillarScores: PillarScore[];
  skillScores: SkillScore[];
  readyForPromotion: boolean;
  skillsAchieved: number;
  skillsTotal: number;
  pillarProgress: number;
}

export async function calculateGlowRank(playerId: string): Promise<GlowRank | null> {
  // Get player's current level
  const [playerLevel] = await db
    .select({
      levelId: playerBallLevels.levelId,
      status: playerBallLevels.status,
    })
    .from(playerBallLevels)
    .where(and(
      eq(playerBallLevels.playerId, playerId),
      sql`${playerBallLevels.status} IN ('active', 'trial')`
    ))
    .limit(1);

  if (!playerLevel) {
    return null;
  }

  // Get level details
  const [level] = await db
    .select()
    .from(ballLevels)
    .where(eq(ballLevels.id, playerLevel.levelId));

  if (!level) {
    return null;
  }

  // Get skills required for this level
  const levelSkillsData = await db
    .select({
      skillId: levelSkills.skillId,
      targetScore: levelSkills.targetScore,
      weight: levelSkills.weight,
      skill: glowSkills,
    })
    .from(levelSkills)
    .innerJoin(glowSkills, eq(levelSkills.skillId, glowSkills.id))
    .where(eq(levelSkills.levelId, playerLevel.levelId));

  // Get player's skill scores (latest for each skill)
  const skillIds = levelSkillsData.map(s => s.skillId);
  const playerSkillScoresData = skillIds.length > 0 ? await db
    .select()
    .from(playerSkillScores)
    .where(and(
      eq(playerSkillScores.playerId, playerId),
      inArray(playerSkillScores.skillId, skillIds)
    ))
    .orderBy(desc(playerSkillScores.scoredAt)) : [];

  // Get latest score for each skill
  const latestScores = new Map<string, typeof playerSkillScoresData[0]>();
  for (const score of playerSkillScoresData) {
    if (!latestScores.has(score.skillId)) {
      latestScores.set(score.skillId, score);
    }
  }

  // Get pillar progress
  const pillarProgress = await db
    .select()
    .from(playerPillarProgress)
    .where(eq(playerPillarProgress.playerId, playerId));

  const pillarProgressMap = new Map(pillarProgress.map(p => [p.pillar, p]));

  // Calculate skill scores with achieved status
  const skillScores: SkillScore[] = levelSkillsData.map(ls => {
    const latestScore = latestScores.get(ls.skillId);
    const score = latestScore?.score ?? 0;
    const movingAvg = latestScore?.movingAverage ? Number(latestScore.movingAverage) : 0;
    const targetScore = ls.targetScore ?? 2;
    
    return {
      skillId: ls.skillId,
      skillName: ls.skill.name,
      pillar: ls.skill.pillar,
      score,
      movingAverage: movingAvg,
      observationCount: latestScore?.observationCount ?? 0,
      achieved: movingAvg >= targetScore,
    };
  });

  // Calculate pillar scores
  const pillarScores: PillarScore[] = PILLARS.map(pillar => {
    const pillarSkills = skillScores.filter(s => s.pillar === pillar);
    const progress = pillarProgressMap.get(pillar);
    
    // Calculate average score for this pillar
    const avgScore = pillarSkills.length > 0
      ? pillarSkills.reduce((sum, s) => sum + s.movingAverage, 0) / pillarSkills.length
      : 0;
    
    // Use stored progress score if available, otherwise use calculated
    const finalScore = progress ? Number(progress.currentScore) : avgScore;
    
    return {
      pillar,
      score: finalScore,
      trend: (progress?.trend as "improving" | "stable" | "declining") || "stable",
      skillCount: pillarSkills.length,
      achievedCount: pillarSkills.filter(s => s.achieved).length,
    };
  });

  // Calculate overall scores
  const skillsAchieved = skillScores.filter(s => s.achieved).length;
  const skillsTotal = skillScores.length;
  
  // Overall score is weighted average of pillar scores
  const pillarWeightedSum = pillarScores.reduce((sum, p) => {
    const pillarWeight = p.skillCount > 0 ? p.skillCount / Math.max(skillsTotal, 1) : 0;
    return sum + (p.score * pillarWeight);
  }, 0);
  
  // Glow Score: 0-100 scale based on achievement percentage
  const achievementRatio = skillsTotal > 0 ? skillsAchieved / skillsTotal : 0;
  const glowScore = Math.round(achievementRatio * 100);
  
  // Pillar progress: average across all pillars
  const pillarProgressScore = pillarScores.length > 0
    ? pillarScores.reduce((sum, p) => sum + p.score, 0) / pillarScores.length
    : 0;

  // Check promotion readiness
  const promotionReqs = level.promotionRequirements as {
    skillAchievedCount?: number;
    pillarMinimum?: Record<string, number>;
    pillarMinimumScores?: Record<string, number>;
  } | null;
  
  let readyForPromotion = false;
  if (promotionReqs) {
    const skillsOk = skillsAchieved >= (promotionReqs.skillAchievedCount || 0);
    
    // Check pillar minimum skill counts (if specified)
    const pillarCountsOk = !promotionReqs.pillarMinimum || 
      Object.entries(promotionReqs.pillarMinimum).every(([pillar, minCount]) => {
        const ps = pillarScores.find(p => p.pillar === pillar);
        return ps && ps.achievedCount >= minCount;
      });
    
    // Check pillar minimum scores (if specified)
    const pillarScoresOk = !promotionReqs.pillarMinimumScores || 
      Object.entries(promotionReqs.pillarMinimumScores).every(([pillar, minScore]) => {
        const ps = pillarScores.find(p => p.pillar === pillar);
        return ps && ps.score >= minScore;
      });
    
    readyForPromotion = skillsOk && pillarCountsOk && pillarScoresOk;
  }

  return {
    playerId,
    levelId: level.id,
    levelName: level.displayNamePlayer,
    stage: level.stage,
    overallScore: pillarWeightedSum,
    glowScore,
    pillarScores,
    skillScores,
    readyForPromotion,
    skillsAchieved,
    skillsTotal,
    pillarProgress: pillarProgressScore,
  };
}

export type PillarChangeSource = "coach_assessment" | "match" | "coach_verified_match";

export async function updatePillarProgressWithEMA(
  playerId: string,
  pillar: string,
  newScore: number,
  source: PillarChangeSource = "coach_assessment"
): Promise<void> {
  const [existing] = await db
    .select()
    .from(playerPillarProgress)
    .where(and(
      eq(playerPillarProgress.playerId, playerId),
      eq(playerPillarProgress.pillar, pillar)
    ));

  if (existing) {
    const oldScore = Number(existing.currentScore);
    const emaScore = PILLAR_ALPHA * newScore + (1 - PILLAR_ALPHA) * oldScore;
    
    const diff = emaScore - oldScore;
    let trend: string;
    if (diff > 0.1) {
      trend = "improving";
    } else if (diff < -0.1) {
      trend = "declining";
    } else {
      trend = "stable";
    }

    await db
      .update(playerPillarProgress)
      .set({
        currentScore: emaScore.toFixed(2),
        trend,
        lastSessionDelta: diff.toFixed(2),
        lastUpdatedAt: new Date(),
        updatedAt: new Date(),
        lastChangeSource: source,
      })
      .where(eq(playerPillarProgress.id, existing.id));
  } else {
    await db
      .insert(playerPillarProgress)
      .values({
        playerId,
        pillar,
        currentScore: newScore.toFixed(2),
        trend: "stable",
        lastSessionDelta: "0.00",
        lastUpdatedAt: new Date(),
        lastChangeSource: source,
      });
  }
}

export async function updateSkillScoreWithEMA(
  playerId: string,
  skillId: string,
  sessionId: string,
  coachId: string | undefined,
  newScore: number
): Promise<number> {
  // Get previous observations
  const previousScores = await db
    .select()
    .from(playerSkillScores)
    .where(and(
      eq(playerSkillScores.playerId, playerId),
      eq(playerSkillScores.skillId, skillId)
    ))
    .orderBy(desc(playerSkillScores.scoredAt))
    .limit(10);

  let movingAverage: number;
  let observationCount: number;

  if (previousScores.length > 0) {
    const lastAvg = Number(previousScores[0].movingAverage || previousScores[0].score);
    movingAverage = SKILL_ALPHA * newScore + (1 - SKILL_ALPHA) * lastAvg;
    observationCount = (previousScores[0].observationCount || 0) + 1;
  } else {
    movingAverage = newScore;
    observationCount = 1;
  }

  // Insert new score record
  await db.insert(playerSkillScores).values({
    playerId,
    skillId,
    score: newScore,
    sessionId,
    coachId,
    movingAverage: movingAverage.toFixed(2),
    observationCount,
  });

  return movingAverage;
}
