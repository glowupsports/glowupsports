import { Router, Response } from "express";
import { db } from "../db";
import { 
  ballLevels, 
  glowSkills, 
  skillRubrics, 
  levelSkills, 
  levelTests,
  playerBallLevels,
  playerSkillScores,
  playerPillarProgress,
  levelTrials,
  sessionSkillFeedback,
  coachCalibration,
  players,
  sessions,
  sessionPlayers,
  sessionIntakeData,
} from "../../shared/schema";
import { eq, and, or, desc, sql, inArray, gte, isNull, notInArray } from "drizzle-orm";
import { AuthenticatedRequest, authMiddlewareWithFreshData as authMiddleware, requireAcademy } from "../auth";
import { awardXP } from "../services/xp-service";
import { ADULT_GLOW_SKILLS_BY_LEVEL } from "../seeds/adult-glow-skills-seed";
import { checkForScoringAnomaly } from "../services/coach-calibration-engine";
import { sendPushNotification, getPlayerPushTokens } from "../pushNotifications";
import { updatePillarProgress } from "../utils/pillarProgress";

const router = Router();

// Helper to validate player ownership
async function validatePlayerAccess(playerId: string, academyId: string | null): Promise<boolean> {
  if (!academyId) return false;
  const [player] = await db.select().from(players).where(and(
    eq(players.id, playerId),
    eq(players.academyId, academyId)
  ));
  return !!player;
}

// ==================== BALL LEVELS ====================

// Get all ball levels with skills count (public reference data)
router.get("/api/glow/levels", async (_req, res: Response) => {
  try {
    const levels = await db.select().from(ballLevels).orderBy(ballLevels.stage, ballLevels.rank);
    
    // Get skill counts per level
    const levelsWithSkills = await Promise.all(
      levels.map(async (level) => {
        const skills = await db.select().from(levelSkills).where(eq(levelSkills.levelId, level.id));
        const tests = await db.select().from(levelTests).where(eq(levelTests.levelId, level.id));
        return {
          ...level,
          skillCount: skills.length,
          requiredSkillCount: skills.filter(s => s.isRequired).length,
          testCount: tests.length,
        };
      })
    );
    
    res.json(levelsWithSkills);
  } catch (error) {
    console.error("Error fetching ball levels:", error);
    res.status(500).json({ error: "Failed to fetch levels" });
  }
});

// Get single level with full details
router.get("/api/glow/levels/:levelId", async (req, res: Response) => {
  try {
    const { levelId } = req.params;
    
    const [level] = await db.select().from(ballLevels).where(eq(ballLevels.id, levelId));
    if (!level) {
      return res.status(404).json({ error: "Level not found" });
    }
    
    // For GLOW levels (adults), use in-memory skill definitions
    if (level.stage === "GLOW" && ADULT_GLOW_SKILLS_BY_LEVEL[levelId]) {
      const adultConfig = ADULT_GLOW_SKILLS_BY_LEVEL[levelId];
      const skillsByPillar: Record<string, any[]> = {};
      
      for (const skill of adultConfig.skills) {
        if (!skillsByPillar[skill.pillar]) {
          skillsByPillar[skill.pillar] = [];
        }
        skillsByPillar[skill.pillar].push({
          id: skill.id,
          name: skill.name,
          pillar: skill.pillar,
          stage: "GLOW",
          description: skill.description,
          targetScore: 2,
          weight: 1,
          isRequired: true,
          rubric: skill.rubric,
        });
      }
      
      return res.json({
        ...level,
        skillsByPillar,
        tests: [],
        promotionRequirements: adultConfig.promotionRequirements,
        abilitySnapshot: adultConfig.abilitySnapshot,
      });
    }
    
    // For BLUE levels (foundation), use in-memory skill definitions
    if (level.stage === "BLUE") {
      const { BLUE_STAGE_SKILLS_BY_LEVEL } = await import("../seeds/blue-stage-skills-seed");
      const blueConfig = BLUE_STAGE_SKILLS_BY_LEVEL[levelId];
      
      if (blueConfig) {
        const skillsByPillar: Record<string, any[]> = {};
        
        for (const skill of blueConfig.skills) {
          if (!skillsByPillar[skill.pillar]) {
            skillsByPillar[skill.pillar] = [];
          }
          skillsByPillar[skill.pillar].push({
            id: skill.id,
            name: skill.name,
            pillar: skill.pillar,
            stage: "BLUE",
            category: skill.category,
            description: skill.description,
            targetScore: 2,
            weight: 1,
            isRequired: true,
            rubric: skill.rubric,
          });
        }
        
        return res.json({
          ...level,
          skillsByPillar,
          tests: [],
          promotionRequirements: blueConfig.promotionRequirements,
          abilitySnapshot: blueConfig.abilitySnapshot,
          philosophy: blueConfig.philosophy,
        });
      }
    }
    
    // For ball levels (kids), use database
    const levelSkillsData = await db
      .select({
        mapping: levelSkills,
        skill: glowSkills,
      })
      .from(levelSkills)
      .innerJoin(glowSkills, eq(levelSkills.skillId, glowSkills.id))
      .where(eq(levelSkills.levelId, levelId));
    
    const tests = await db.select().from(levelTests).where(eq(levelTests.levelId, levelId));
    
    // Get rubrics for all skills
    const skillIds = levelSkillsData.map(s => s.skill.id);
    const rubrics = skillIds.length > 0
      ? await db.select().from(skillRubrics).where(inArray(skillRubrics.skillId, skillIds))
      : [];
    
    // Group rubrics by skill
    const rubricsBySkill: Record<string, any[]> = {};
    for (const rubric of rubrics) {
      if (!rubricsBySkill[rubric.skillId]) {
        rubricsBySkill[rubric.skillId] = [];
      }
      rubricsBySkill[rubric.skillId].push({
        score: rubric.score,
        observable: rubric.observable,
      });
    }
    
    // Group skills by pillar with rubrics
    const skillsByPillar: Record<string, any[]> = {};
    for (const { mapping, skill } of levelSkillsData) {
      if (!skillsByPillar[skill.pillar]) {
        skillsByPillar[skill.pillar] = [];
      }
      skillsByPillar[skill.pillar].push({
        ...skill,
        targetScore: mapping.targetScore,
        weight: mapping.weight,
        isRequired: mapping.isRequired,
        rubric: rubricsBySkill[skill.id] || [],
      });
    }
    
    res.json({
      ...level,
      skillsByPillar,
      tests,
    });
  } catch (error) {
    console.error("Error fetching level details:", error);
    res.status(500).json({ error: "Failed to fetch level details" });
  }
});

// Get all levels with full skill and rubric data for Level Cards view
router.get("/api/glow-leveling/levels", async (req, res: Response) => {
  try {
    const { stage } = req.query;
    
    // Import in-memory seed data for all ball stages
    const { RED_STAGE_SKILLS_BY_LEVEL } = await import("../seeds/red-stage-skills-seed");
    const { ORANGE_STAGE_SKILLS_BY_LEVEL } = await import("../seeds/orange-stage-skills-seed");
    const { GREEN_STAGE_SKILLS_BY_LEVEL } = await import("../seeds/green-stage-skills-seed");
    
    // Build levels from in-memory data
    const levelsWithDetails: any[] = [];
    
    // Process RED stage levels
    if (!stage || stage === "RED") {
      for (const [levelId, config] of Object.entries(RED_STAGE_SKILLS_BY_LEVEL)) {
        levelsWithDetails.push({
          id: levelId,
          stage: "RED",
          rank: config.rank,
          displayNamePlayer: `Red ${config.rank} (${config.name})`,
          displayNameCoach: `Red ${config.rank} (${config.name})`,
          identity: config.abilitySnapshot,
          courtType: "RED_COURT",
          ballType: "RED_BALL",
          promotionRequirements: {
            skillAchievedCount: Math.round(config.skills.length * 0.7),
            pillarMinimum: {},
            tests: [],
            evidenceMin: 2,
            matchEvents: 4,
          },
          skills: config.skills.map(skill => ({
            skillId: skill.id,
            skillName: skill.name,
            pillar: skill.pillar,
            targetScore: 2,
            weight: 1,
            rubric: skill.rubric.sort((a, b) => a.score - b.score),
          })),
          tests: [],
        });
      }
    }
    
    // Process ORANGE stage levels
    if (!stage || stage === "ORANGE") {
      for (const [levelId, config] of Object.entries(ORANGE_STAGE_SKILLS_BY_LEVEL)) {
        levelsWithDetails.push({
          id: levelId,
          stage: "ORANGE",
          rank: config.rank,
          displayNamePlayer: `Orange ${config.rank} (${config.name})`,
          displayNameCoach: `Orange ${config.rank} (${config.name})`,
          identity: config.abilitySnapshot,
          courtType: "ORANGE_COURT",
          ballType: "ORANGE_BALL",
          promotionRequirements: {
            skillAchievedCount: Math.round(config.skills.length * 0.7),
            pillarMinimum: {},
            tests: [],
            evidenceMin: 3,
            matchEvents: 6,
          },
          skills: config.skills.map(skill => ({
            skillId: skill.id,
            skillName: skill.name,
            pillar: skill.pillar,
            targetScore: 2,
            weight: 1,
            rubric: skill.rubric.sort((a, b) => a.score - b.score),
          })),
          tests: [],
        });
      }
    }
    
    // Process GREEN stage levels
    if (!stage || stage === "GREEN") {
      for (const [levelId, config] of Object.entries(GREEN_STAGE_SKILLS_BY_LEVEL)) {
        levelsWithDetails.push({
          id: levelId,
          stage: "GREEN",
          rank: config.rank,
          displayNamePlayer: `Green ${config.rank} (${config.name})`,
          displayNameCoach: `Green ${config.rank} (${config.name})`,
          identity: config.abilitySnapshot,
          courtType: "GREEN_COURT",
          ballType: "GREEN_BALL",
          promotionRequirements: {
            skillAchievedCount: Math.round(config.skills.length * 0.7),
            pillarMinimum: {},
            tests: [],
            evidenceMin: 3,
            matchEvents: 8,
          },
          skills: config.skills.map(skill => ({
            skillId: skill.id,
            skillName: skill.name,
            pillar: skill.pillar,
            targetScore: 2,
            weight: 1,
            rubric: skill.rubric.sort((a, b) => a.score - b.score),
          })),
          tests: [],
        });
      }
    }
    
    // YELLOW stage - full court, standard tennis
    if (!stage || stage === "YELLOW") {
      // Yellow has 3 sublevels similar structure
      const yellowLevels = [
        { id: "YELLOW_3", rank: 3, name: "Starter", abilitySnapshot: "Ik speel op een volledige baan met gele ballen." },
        { id: "YELLOW_2", rank: 2, name: "Builder", abilitySnapshot: "Ik kan rallyen en tactieken toepassen." },
        { id: "YELLOW_1", rank: 1, name: "Graduate", abilitySnapshot: "Ik ben klaar voor competitie tennis." },
      ];
      
      for (const level of yellowLevels) {
        levelsWithDetails.push({
          id: level.id,
          stage: "YELLOW",
          rank: level.rank,
          displayNamePlayer: `Yellow ${level.rank} (${level.name})`,
          displayNameCoach: `Yellow ${level.rank} (${level.name})`,
          identity: level.abilitySnapshot,
          courtType: "FULL_COURT",
          ballType: "YELLOW_BALL",
          promotionRequirements: {
            skillAchievedCount: 20,
            pillarMinimum: {},
            tests: [],
            evidenceMin: 4,
            matchEvents: 10,
          },
          skills: [
            { skillId: `Y${level.rank}_SERVE`, skillName: "Full Court Serve", pillar: "TECHNIQUE", targetScore: 2, weight: 1,
              rubric: [
                { score: 0, label: "Not Yet", observable: "Geen consistente service" },
                { score: 1, label: "Emerging", observable: "Service in spel maar met fouten" },
                { score: 2, label: "Achieved", observable: "Consistente service met plaatsing" },
              ]
            },
            { skillId: `Y${level.rank}_RALLY`, skillName: "Rally Consistency", pillar: "TECHNIQUE", targetScore: 2, weight: 1,
              rubric: [
                { score: 0, label: "Not Yet", observable: "Kan geen rally opbouwen" },
                { score: 1, label: "Emerging", observable: "Kan korte rally's spelen" },
                { score: 2, label: "Achieved", observable: "Kan langere rally's consistant spelen" },
              ]
            },
            { skillId: `Y${level.rank}_TACTIC`, skillName: "Court Positioning", pillar: "TACTICAL", targetScore: 2, weight: 1,
              rubric: [
                { score: 0, label: "Not Yet", observable: "Staat op verkeerde positie" },
                { score: 1, label: "Emerging", observable: "Keert soms naar midden terug" },
                { score: 2, label: "Achieved", observable: "Goede baanpositie en recovery" },
              ]
            },
          ],
          tests: [],
        });
      }
    }
    
    // BLUE stage - foundation full-court tennis (uses in-memory seed data)
    if (!stage || stage === "BLUE") {
      const { BLUE_STAGE_SKILLS_BY_LEVEL } = await import("../seeds/blue-stage-skills-seed");
      for (const [levelId, config] of Object.entries(BLUE_STAGE_SKILLS_BY_LEVEL)) {
        levelsWithDetails.push({
          id: levelId,
          stage: "BLUE",
          rank: config.rank,
          displayNamePlayer: `Blue ${config.rank} (${config.name})`,
          displayNameCoach: `Blue ${config.rank} (${config.name})`,
          identity: config.abilitySnapshot,
          courtType: "FULL_COURT",
          ballType: "YELLOW_BALL",
          promotionRequirements: {
            skillAchievedCount: Math.round(config.skills.length * 0.7),
            pillarMinimum: {},
            tests: [],
            evidenceMin: 2,
            matchEvents: 4,
          },
          skills: config.skills.map(skill => ({
            skillId: skill.id,
            skillName: skill.name,
            pillar: skill.pillar,
            targetScore: 2,
            weight: 1,
            rubric: skill.rubric.sort((a, b) => a.score - b.score),
          })),
          tests: [],
        });
      }
    }

    // Fetch technical_specs from DB and merge into levels
    const levelIds = levelsWithDetails.map(l => l.id);
    const dbLevels = levelIds.length > 0
      ? await db.select({ id: ballLevels.id, technicalSpecs: ballLevels.technicalSpecs }).from(ballLevels).where(inArray(ballLevels.id, levelIds))
      : [];
    const techSpecsMap = new Map(dbLevels.map(l => [l.id, l.technicalSpecs]));
    for (const level of levelsWithDetails) {
      level.technicalSpecs = techSpecsMap.get(level.id) ?? null;
    }

    // Sort by stage order and rank
    const stageOrder = { RED: 0, ORANGE: 1, GREEN: 2, YELLOW: 3, BLUE: 4 };
    levelsWithDetails.sort((a, b) => {
      const stageCompare = (stageOrder[a.stage as keyof typeof stageOrder] || 0) - (stageOrder[b.stage as keyof typeof stageOrder] || 0);
      if (stageCompare !== 0) return stageCompare;
      return b.rank - a.rank; // Higher rank first (3, 2, 1)
    });
    
    res.json(levelsWithDetails);
  } catch (error) {
    console.error("Error fetching level cards:", error);
    res.status(500).json({ error: "Failed to fetch level cards" });
  }
});

// ==================== PLAYER BALL LEVEL ====================

// Get player's current ball level
router.get("/api/glow/players/:playerId/level", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    
    // Validate player ownership
    if (!await validatePlayerAccess(playerId, academyId)) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    const [playerLevel] = await db
      .select({
        playerLevel: playerBallLevels,
        level: ballLevels,
      })
      .from(playerBallLevels)
      .innerJoin(ballLevels, eq(playerBallLevels.levelId, ballLevels.id))
      .where(and(
        eq(playerBallLevels.playerId, playerId),
        eq(playerBallLevels.status, "active")
      ))
      .orderBy(desc(playerBallLevels.assignedAt))
      .limit(1);
    
    if (!playerLevel) {
      // Return default RED_3 if no level assigned
      const [defaultLevel] = await db.select().from(ballLevels).where(eq(ballLevels.id, "RED_3"));
      return res.json({
        playerId,
        level: defaultLevel,
        status: "unassigned",
        trial: null,
      });
    }
    
    // Check if player is in trial
    let trial = null;
    if (playerLevel.playerLevel.status === "trial") {
      const [trialData] = await db
        .select()
        .from(levelTrials)
        .where(and(
          eq(levelTrials.playerId, playerId),
          eq(levelTrials.status, "in_progress")
        ))
        .orderBy(desc(levelTrials.startedAt))
        .limit(1);
      trial = trialData;
    }
    
    res.json({
      playerId,
      level: playerLevel.level,
      status: playerLevel.playerLevel.status,
      assignedAt: playerLevel.playerLevel.assignedAt,
      trial,
    });
  } catch (error) {
    console.error("Error fetching player level:", error);
    res.status(500).json({ error: "Failed to fetch player level" });
  }
});

// ==================== SKILL SCORES ====================

// Get player's skill scores (with moving averages)
router.get("/api/glow/players/:playerId/skills", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    
    if (!await validatePlayerAccess(playerId, academyId)) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    // Get all scores grouped by skill with latest moving average
    const scores = await db
      .select({
        skillId: playerSkillScores.skillId,
        latestScore: sql<number>`(SELECT score FROM player_skill_scores ps2 WHERE ps2.skill_id = ${playerSkillScores.skillId} AND ps2.player_id = ${playerId} ORDER BY created_at DESC LIMIT 1)`,
        movingAverage: sql<number>`(SELECT moving_average FROM player_skill_scores ps2 WHERE ps2.skill_id = ${playerSkillScores.skillId} AND ps2.player_id = ${playerId} ORDER BY created_at DESC LIMIT 1)`,
        observationCount: sql<number>`COUNT(*)`,
        skill: glowSkills,
      })
      .from(playerSkillScores)
      .innerJoin(glowSkills, eq(playerSkillScores.skillId, glowSkills.id))
      .where(eq(playerSkillScores.playerId, playerId))
      .groupBy(playerSkillScores.skillId, glowSkills.id);
    
    // Group by pillar
    const skillsByPillar: Record<string, any[]> = {};
    for (const score of scores) {
      const pillar = score.skill.pillar;
      if (!skillsByPillar[pillar]) {
        skillsByPillar[pillar] = [];
      }
      skillsByPillar[pillar].push({
        skillId: score.skillId,
        name: score.skill.name,
        description: score.skill.description,
        latestScore: score.latestScore,
        movingAverage: score.movingAverage,
        observationCount: score.observationCount,
      });
    }
    
    res.json({ playerId, skillsByPillar });
  } catch (error) {
    console.error("Error fetching player skills:", error);
    res.status(500).json({ error: "Failed to fetch player skills" });
  }
});

// ==================== PILLAR PROGRESS ====================

// Get player's pillar progress (6 pillars)
router.get("/api/glow/players/:playerId/pillars", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    
    if (!await validatePlayerAccess(playerId, academyId)) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    const progress = await db
      .select()
      .from(playerPillarProgress)
      .where(eq(playerPillarProgress.playerId, playerId));
    
    // Compute curriculum mastery per pillar from the player's current level
    const curriculumPillarMap = new Map<string, { achievedCount: number; skillCount: number }>();
    try {
      const [playerLevel] = await db
        .select({ levelId: playerBallLevels.levelId })
        .from(playerBallLevels)
        .where(and(
          eq(playerBallLevels.playerId, playerId),
          sql`${playerBallLevels.status} IN ('active', 'trial')`
        ))
        .limit(1);
      
      if (playerLevel) {
        const levelSkillsData = await db
          .select({
            skillId: levelSkills.skillId,
            targetScore: levelSkills.targetScore,
            pillar: glowSkills.pillar,
          })
          .from(levelSkills)
          .innerJoin(glowSkills, eq(levelSkills.skillId, glowSkills.id))
          .where(eq(levelSkills.levelId, playerLevel.levelId));
        
        const skillIds = levelSkillsData.map(s => s.skillId);
        const latestScores = new Map<string, number>();
        if (skillIds.length > 0) {
          const scoreRows = await db
            .select({ skillId: playerSkillScores.skillId, movingAverage: playerSkillScores.movingAverage, score: playerSkillScores.score })
            .from(playerSkillScores)
            .where(and(eq(playerSkillScores.playerId, playerId), inArray(playerSkillScores.skillId, skillIds)))
            .orderBy(desc(playerSkillScores.createdAt));
          for (const row of scoreRows) {
            if (!latestScores.has(row.skillId)) {
              latestScores.set(row.skillId, Number(row.movingAverage ?? row.score ?? 0));
            }
          }
        }
        
        for (const ls of levelSkillsData) {
          const entry = curriculumPillarMap.get(ls.pillar) ?? { achievedCount: 0, skillCount: 0 };
          entry.skillCount += 1;
          const movingAvg = latestScores.get(ls.skillId) ?? 0;
          if (movingAvg >= (ls.targetScore ?? 2)) {
            entry.achievedCount += 1;
          }
          curriculumPillarMap.set(ls.pillar, entry);
        }
      }
    } catch (masteryErr) {
      console.error("[PillarProgress] Curriculum mastery computation failed (non-critical):", masteryErr);
    }
    
    // Ensure all 6 pillars are represented
    const PILLAR_NAMES = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"];
    const pillarMap: Record<string, any> = {};
    
    for (const pillar of PILLAR_NAMES) {
      const existing = progress.find(p => p.pillar === pillar);
      const curriculum = curriculumPillarMap.get(pillar);
      const skillsTotal = curriculum?.skillCount ?? 0;
      const skillsMastered = curriculum?.achievedCount ?? 0;
      const masteryPct = skillsTotal > 0
        ? Math.round((skillsMastered / skillsTotal) * 100)
        : 0;
      
      pillarMap[pillar] = {
        ...(existing || {
          pillar,
          currentScore: 0,
          trend: "stable",
          lastSessionDelta: null,
        }),
        skillsTotal,
        skillsMastered,
        masteryPct,
      };
    }
    
    res.json({ playerId, pillars: pillarMap });
  } catch (error) {
    console.error("Error fetching pillar progress:", error);
    res.status(500).json({ error: "Failed to fetch pillar progress" });
  }
});

// Get suggested skills for player's current level (for quick feedback)
router.get("/api/glow/players/:playerId/suggested-skills", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    
    if (!await validatePlayerAccess(playerId, academyId)) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    // Get player's current level from playerBallLevels
    const [playerLevel] = await db
      .select({
        levelId: playerBallLevels.levelId,
      })
      .from(playerBallLevels)
      .where(and(
        eq(playerBallLevels.playerId, playerId),
        or(eq(playerBallLevels.status, "active"), eq(playerBallLevels.status, "trial"))
      ))
      .limit(1);
    
    let resolvedLevelId = playerLevel?.levelId;
    
    if (!resolvedLevelId) {
      const [player] = await db
        .select({ ballLevel: players.ballLevel })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);
      
      if (player?.ballLevel) {
        const stageMap: Record<string, string> = {
          red: "RED_3",
          orange: "ORANGE_3",
          green: "GREEN_3",
          yellow: "YELLOW_3",
          glow: "GLOW_9",
        };
        const mappedLevel = stageMap[player.ballLevel.toLowerCase()];
        if (mappedLevel) {
          resolvedLevelId = mappedLevel;
        }
      }
    }
    
    if (!resolvedLevelId) {
      return res.json([]);
    }
    
    const pillarNames: Record<string, string> = {
      TECHNIQUE: "Technical",
      TACTICAL: "Tactical",
      PHYSICAL: "Physical",
      MENTAL: "Mental",
      SOCIAL: "Social",
      MATCH: "Match Play",
    };
    
    if (resolvedLevelId.startsWith("GLOW_")) {
      const glowLevel = ADULT_GLOW_SKILLS_BY_LEVEL[resolvedLevelId];
      if (glowLevel?.skills) {
        return res.json(glowLevel.skills.map(s => ({
          id: s.id,
          name: s.name,
          pillarId: s.pillar.toLowerCase(),
          pillarName: pillarNames[s.pillar] || s.pillar,
          description: s.description,
        })));
      }
      return res.json([]);
    }
    
    const skills = await db
      .select({
        id: glowSkills.id,
        name: glowSkills.name,
        pillarId: glowSkills.pillar,
        pillarName: glowSkills.pillar,
        description: glowSkills.description,
      })
      .from(levelSkills)
      .innerJoin(glowSkills, eq(levelSkills.skillId, glowSkills.id))
      .where(eq(levelSkills.levelId, resolvedLevelId))
      .orderBy(glowSkills.pillar, glowSkills.name);
    
    res.json(skills.map(s => ({
      id: s.id,
      name: s.name,
      pillarId: s.pillarId.toLowerCase(),
      pillarName: pillarNames[s.pillarId] || s.pillarId,
      description: s.description,
    })));
  } catch (error) {
    console.error("Error fetching suggested skills:", error);
    res.status(500).json({ error: "Failed to fetch suggested skills" });
  }
});

// ==================== SESSION SKILL FEEDBACK ====================

// Submit quick feedback after session (30-second flow)
router.post("/api/glow/sessions/:sessionId/feedback", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const coachId = req.user!.coachId;
    const academyId = req.user!.academyId;
    const {
      playerId,
      effort,
      execution,
      understanding,
      overall,
      pillarRatings,
      skillRatings,
      trialReady,
      note,
      strokeFeedback,
      lessonIntensity,
      playerNote,
    } = req.body;
    
    // "skillOnly" mode: only updates skill scores without requiring full feedback fields.
    // Used by wrap-up skill verification cards in the AI coaching chat.
    const skillOnly = req.body.skillOnly === true;

    if (!skillOnly && (!playerId || effort === undefined || execution === undefined || understanding === undefined || !overall)) {
      return res.status(400).json({ error: "Missing required feedback fields" });
    }

    if (!playerId) {
      return res.status(400).json({ error: "playerId is required" });
    }
    
    // Validate player ownership
    if (!await validatePlayerAccess(playerId, academyId)) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    if (skillOnly) {
      // Skill-only mode: just process skill scores and return.
      // Validate session ownership and player membership before writing scores.
      const [sessionOwner] = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.coachId, coachId!)));
      if (!sessionOwner) {
        return res.status(403).json({ error: "Session not found or not owned by coach" });
      }
      const [playerInSession] = await db
        .select({ playerId: sessionPlayers.playerId })
        .from(sessionPlayers)
        .where(and(eq(sessionPlayers.sessionId, sessionId), eq(sessionPlayers.playerId, playerId)));
      if (!playerInSession) {
        return res.status(403).json({ error: "Player does not belong to this session" });
      }
      if (skillRatings && Object.keys(skillRatings).length > 0) {
        await processSkillScores(playerId, sessionId, coachId!, skillRatings);
      }
      return res.json({ ok: true, skillOnly: true });
    }

    // Validate scores (0-2)
    if (effort < 0 || effort > 2 || execution < 0 || execution > 2 || understanding < 0 || understanding > 2) {
      return res.status(400).json({ error: "Scores must be 0, 1, or 2" });
    }
    
    // Validate overall
    if (!["improved", "stable", "declined"].includes(overall)) {
      return res.status(400).json({ error: "Overall must be: improved, stable, or declined" });
    }
    
    // Check for existing feedback
    const [existing] = await db
      .select()
      .from(sessionSkillFeedback)
      .where(and(
        eq(sessionSkillFeedback.sessionId, sessionId),
        eq(sessionSkillFeedback.playerId, playerId)
      ));
    
    if (existing) {
      return res.status(409).json({ error: "Feedback already submitted for this player and session" });
    }
    
    // Insert feedback
    const [feedback] = await db
      .insert(sessionSkillFeedback)
      .values({
        sessionId,
        playerId,
        coachId,
        effort,
        execution,
        understanding,
        overall,
        techniquePillar: pillarRatings?.TECHNIQUE,
        tacticalPillar: pillarRatings?.TACTICAL,
        physicalPillar: pillarRatings?.PHYSICAL,
        mentalPillar: pillarRatings?.MENTAL,
        socialPillar: pillarRatings?.SOCIAL,
        matchPillar: pillarRatings?.MATCH,
        skillRatings: skillRatings ? JSON.stringify(skillRatings) : null,
        strokeFeedback: strokeFeedback || null,
        lessonIntensity: lessonIntensity || null,
        playerNote: playerNote || null,
        trialReady: trialReady || false,
        note,
      })
      .returning();
    
    // Update pillar progress based on feedback
    await updatePillarProgress(playerId, sessionId, {
      effort,
      execution,
      understanding,
      overall,
      pillarRatings,
    });

    // Notify player that coach has rated their session
    try {
      const playerTokens = await getPlayerPushTokens(playerId);
      if (playerTokens.length > 0) {
        const overallLabel = overall === "improved" ? "great progress" : overall === "declined" ? "areas to work on" : "steady progress";
        await sendPushNotification(
          playerTokens,
          "Coach Feedback Received",
          "Your coach rated your session — check your Pillar Progress!",
          { type: "session_feedback", sessionId, playerId }
        );
      }
    } catch (pushErr) {
      console.error("[Push] Failed to send session feedback notification:", pushErr);
    }
    
    // Process individual skill scores if provided
    if (skillRatings && Object.keys(skillRatings).length > 0) {
      await processSkillScores(playerId, sessionId, coachId, skillRatings);
    }
    
    // Award XP to player for receiving feedback (session attendance)
    try {
      await awardXP(playerId, "session_attend", "session", sessionId);
      
      // Bonus XP for positive feedback
      if (overall === "improved") {
        await awardXP(playerId, "feedback_positive", "session", sessionId);
      }
    } catch (xpError) {
      console.error("Error awarding XP:", xpError);
    }
    
    res.status(201).json(feedback);
  } catch (error) {
    console.error("Error submitting session feedback:", error);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});


// Get feedback for a session
router.get("/api/glow/sessions/:sessionId/feedback", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const academyId = req.user!.academyId;
    
    // Get feedback and filter to only include players from this academy
    const feedback = await db
      .select({
        feedback: sessionSkillFeedback,
        player: players,
      })
      .from(sessionSkillFeedback)
      .innerJoin(players, eq(sessionSkillFeedback.playerId, players.id))
      .where(and(
        eq(sessionSkillFeedback.sessionId, sessionId),
        eq(players.academyId, academyId!)
      ));
    
    res.json(feedback.map(f => f.feedback));
  } catch (error) {
    console.error("Error fetching session feedback:", error);
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

// Get stroke feedback timeline for a player
router.get("/api/glow/players/:playerId/stroke-feedback", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;

    if (!await validatePlayerAccess(playerId, academyId)) {
      return res.status(404).json({ error: "Player not found" });
    }

    const feedbackRows = await db
      .select({
        id: sessionSkillFeedback.id,
        sessionId: sessionSkillFeedback.sessionId,
        strokeFeedback: sessionSkillFeedback.strokeFeedback,
        lessonIntensity: sessionSkillFeedback.lessonIntensity,
        playerNote: sessionSkillFeedback.playerNote,
        overall: sessionSkillFeedback.overall,
        effort: sessionSkillFeedback.effort,
        createdAt: sessionSkillFeedback.createdAt,
      })
      .from(sessionSkillFeedback)
      .where(eq(sessionSkillFeedback.playerId, playerId))
      .orderBy(desc(sessionSkillFeedback.createdAt))
      .limit(50);

    res.json(feedbackRows);
  } catch (error) {
    console.error("Error fetching stroke feedback:", error);
    res.status(500).json({ error: "Failed to fetch stroke feedback" });
  }
});

// ==================== LEVEL READINESS ====================

// Check if player is ready for level promotion
router.get("/api/glow/players/:playerId/readiness", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    
    if (!await validatePlayerAccess(playerId, academyId)) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    // Get player's current level
    const [playerLevel] = await db
      .select({
        playerLevel: playerBallLevels,
        level: ballLevels,
      })
      .from(playerBallLevels)
      .innerJoin(ballLevels, eq(playerBallLevels.levelId, ballLevels.id))
      .where(and(
        eq(playerBallLevels.playerId, playerId),
        eq(playerBallLevels.status, "active")
      ))
      .orderBy(desc(playerBallLevels.assignedAt))
      .limit(1);
    
    if (!playerLevel) {
      return res.json({ ready: false, reason: "No level assigned", requirements: null });
    }
    
    const level = playerLevel.level;
    const requirements = level.promotionRequirements as any;
    
    if (!requirements || !level.promotionToLevelId) {
      return res.json({ ready: false, reason: "No promotion path available", requirements: null });
    }
    
    // Get player's skill scores for this level
    const levelSkillsData = await db
      .select()
      .from(levelSkills)
      .where(eq(levelSkills.levelId, level.id));
    
    const skillIds = levelSkillsData.map(s => s.skillId);
    
    // Get player's latest scores for these skills
    const playerScores = await db
      .select()
      .from(playerSkillScores)
      .where(and(
        eq(playerSkillScores.playerId, playerId),
        inArray(playerSkillScores.skillId, skillIds)
      ))
      .orderBy(desc(playerSkillScores.createdAt));
    
    // Count achieved skills (score >= target)
    const achievedSkills: string[] = [];
    const latestScoreBySkill: Record<string, number> = {};
    
    for (const score of playerScores) {
      if (!latestScoreBySkill[score.skillId]) {
        latestScoreBySkill[score.skillId] = score.score;
      }
    }
    
    for (const ls of levelSkillsData) {
      const playerScore = latestScoreBySkill[ls.skillId];
      if (playerScore !== undefined && playerScore >= ls.targetScore) {
        achievedSkills.push(ls.skillId);
      }
    }
    
    // Get pillar progress
    const pillarProgress = await db
      .select()
      .from(playerPillarProgress)
      .where(eq(playerPillarProgress.playerId, playerId));
    
    const pillarScores: Record<string, number> = {};
    for (const p of pillarProgress) {
      pillarScores[p.pillar] = Number(p.currentScore);
    }
    
    // Check requirements
    const checks = {
      skillsAchieved: {
        required: requirements.skillAchievedCount || 0,
        current: achievedSkills.length,
        passed: achievedSkills.length >= (requirements.skillAchievedCount || 0),
      },
      pillarMinimums: {} as Record<string, { required: number; current: number; passed: boolean }>,
    };
    
    if (requirements.pillarMinimum) {
      for (const [pillar, minScore] of Object.entries(requirements.pillarMinimum)) {
        const current = pillarScores[pillar] || 0;
        checks.pillarMinimums[pillar] = {
          required: minScore as number,
          current,
          passed: current >= (minScore as number),
        };
      }
    }
    
    // Overall readiness
    const allPillarsPassed = Object.values(checks.pillarMinimums).every(p => p.passed);
    const ready = checks.skillsAchieved.passed && allPillarsPassed;
    
    res.json({
      ready,
      currentLevel: level,
      nextLevel: level.promotionToLevelId,
      checks,
      achievedSkills,
      totalSkillsRequired: levelSkillsData.length,
    });
  } catch (error) {
    console.error("Error checking readiness:", error);
    res.status(500).json({ error: "Failed to check readiness" });
  }
});

// Enhanced trial readiness check with full analysis
router.get("/api/glow/players/:playerId/trial-readiness", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    
    if (!await validatePlayerAccess(playerId, academyId)) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    const { calculateTrialReadiness } = await import("../services/trial-readiness-engine");
    const readiness = await calculateTrialReadiness(playerId);
    
    res.json(readiness);
  } catch (error) {
    console.error("Error calculating trial readiness:", error);
    res.status(500).json({ error: "Failed to calculate trial readiness" });
  }
});

// Get all players ready for trial in academy
router.get("/api/glow/trial-ready-players", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const academyId = req.user!.academyId;
    
    if (!academyId) {
      return res.status(403).json({ error: "Academy required" });
    }
    
    const { getPlayersReadyForTrial } = await import("../services/trial-readiness-engine");
    const readyPlayers = await getPlayersReadyForTrial(academyId);
    
    res.json({ players: readyPlayers });
  } catch (error) {
    console.error("Error fetching trial-ready players:", error);
    res.status(500).json({ error: "Failed to fetch trial-ready players" });
  }
});

// ==================== TRIAL SYSTEM ====================

// Start trial for player
router.post("/api/glow/players/:playerId/trials", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const coachId = req.user!.coachId;
    const academyId = req.user!.academyId;
    const { toLevelId } = req.body;
    
    // Validate player ownership
    if (!await validatePlayerAccess(playerId, academyId)) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    if (!toLevelId) {
      return res.status(400).json({ error: "Target level ID required" });
    }
    
    // Get current level
    const [playerLevel] = await db
      .select({
        playerLevel: playerBallLevels,
        level: ballLevels,
      })
      .from(playerBallLevels)
      .innerJoin(ballLevels, eq(playerBallLevels.levelId, ballLevels.id))
      .where(and(
        eq(playerBallLevels.playerId, playerId),
        eq(playerBallLevels.status, "active")
      ))
      .limit(1);
    
    if (!playerLevel) {
      return res.status(400).json({ error: "Player has no current level" });
    }
    
    // Get target level
    const [targetLevel] = await db.select().from(ballLevels).where(eq(ballLevels.id, toLevelId));
    if (!targetLevel) {
      return res.status(404).json({ error: "Target level not found" });
    }
    
    if (!targetLevel.trialEnabled) {
      return res.status(400).json({ error: "Target level does not support trials" });
    }
    
    // Check for existing active trial
    const [existingTrial] = await db
      .select()
      .from(levelTrials)
      .where(and(
        eq(levelTrials.playerId, playerId),
        eq(levelTrials.status, "in_progress")
      ));
    
    if (existingTrial) {
      return res.status(409).json({ error: "Player already has an active trial" });
    }
    
    // Create trial
    const trialDays = targetLevel.trialDays || 14;
    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + trialDays);
    
    const [trial] = await db
      .insert(levelTrials)
      .values({
        playerId,
        fromLevelId: playerLevel.level.id,
        toLevelId,
        status: "in_progress",
        endsAt,
        evaluatedBy: coachId,
      })
      .returning();
    
    // Update player's ball level to trial status
    await db
      .update(playerBallLevels)
      .set({
        status: "trial",
        trialStartedAt: new Date(),
        trialEndsAt: endsAt,
        trialFromLevelId: playerLevel.level.id,
        updatedAt: new Date(),
      })
      .where(and(
        eq(playerBallLevels.playerId, playerId),
        eq(playerBallLevels.status, "active")
      ));
    
    res.status(201).json(trial);
  } catch (error) {
    console.error("Error starting trial:", error);
    res.status(500).json({ error: "Failed to start trial" });
  }
});

// Complete trial (pass/fail)
router.post("/api/glow/trials/:trialId/complete", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { trialId } = req.params;
    const coachId = req.user!.coachId;
    const academyId = req.user!.academyId;
    const { passed, testResults, evaluationNotes } = req.body;
    
    const [trial] = await db
      .select()
      .from(levelTrials)
      .where(eq(levelTrials.id, trialId));
    
    if (!trial) {
      return res.status(404).json({ error: "Trial not found" });
    }
    
    // Validate player belongs to this academy
    if (!await validatePlayerAccess(trial.playerId, academyId)) {
      return res.status(404).json({ error: "Trial not found" });
    }
    
    if (trial.status !== "in_progress") {
      return res.status(400).json({ error: "Trial is not in progress" });
    }
    
    const newStatus = passed ? "passed" : "failed";
    
    // Update trial
    await db
      .update(levelTrials)
      .set({
        status: newStatus,
        completedAt: new Date(),
        testResults: testResults ? JSON.stringify(testResults) : null,
        evaluatedBy: coachId,
        evaluationNotes,
        updatedAt: new Date(),
      })
      .where(eq(levelTrials.id, trialId));
    
    // Update player's level based on result
    if (passed) {
      // Promote to new level
      await db
        .update(playerBallLevels)
        .set({
          levelId: trial.toLevelId,
          status: "active",
          previousLevelId: trial.fromLevelId,
          trialStartedAt: null,
          trialEndsAt: null,
          trialFromLevelId: null,
          assignedAt: new Date(),
          assignedBy: coachId,
          updatedAt: new Date(),
        })
        .where(and(
          eq(playerBallLevels.playerId, trial.playerId),
          eq(playerBallLevels.status, "trial")
        ));
    } else {
      // Revert to original level
      await db
        .update(playerBallLevels)
        .set({
          status: "active",
          trialStartedAt: null,
          trialEndsAt: null,
          trialFromLevelId: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(playerBallLevels.playerId, trial.playerId),
          eq(playerBallLevels.status, "trial")
        ));
    }
    
    res.json({ success: true, passed, newLevel: passed ? trial.toLevelId : trial.fromLevelId });
  } catch (error) {
    console.error("Error completing trial:", error);
    res.status(500).json({ error: "Failed to complete trial" });
  }
});

// Get player's trial history
router.get("/api/glow/players/:playerId/trials", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    
    if (!await validatePlayerAccess(playerId, academyId)) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    const trials = await db
      .select({
        trial: levelTrials,
        fromLevel: ballLevels,
      })
      .from(levelTrials)
      .innerJoin(ballLevels, eq(levelTrials.fromLevelId, ballLevels.id))
      .where(eq(levelTrials.playerId, playerId))
      .orderBy(desc(levelTrials.startedAt));
    
    res.json(trials);
  } catch (error) {
    console.error("Error fetching trials:", error);
    res.status(500).json({ error: "Failed to fetch trials" });
  }
});

// ==================== SKILLS & RUBRICS ====================

// Get all skills (optionally filtered by stage/pillar)
router.get("/api/glow/skills", async (req, res: Response) => {
  try {
    const { stage, pillar } = req.query;
    
    let query = db.select().from(glowSkills);
    
    if (stage) {
      query = query.where(eq(glowSkills.stage, stage as string)) as any;
    }
    if (pillar) {
      query = query.where(eq(glowSkills.pillar, pillar as string)) as any;
    }
    
    const skills = await query;
    res.json(skills);
  } catch (error) {
    console.error("Error fetching skills:", error);
    res.status(500).json({ error: "Failed to fetch skills" });
  }
});

// Get rubrics for a skill
router.get("/api/glow/skills/:skillId/rubrics", async (req, res: Response) => {
  try {
    const { skillId } = req.params;
    
    const rubrics = await db
      .select()
      .from(skillRubrics)
      .where(eq(skillRubrics.skillId, skillId))
      .orderBy(skillRubrics.score);
    
    res.json(rubrics);
  } catch (error) {
    console.error("Error fetching rubrics:", error);
    res.status(500).json({ error: "Failed to fetch rubrics" });
  }
});

// ==================== HELPER FUNCTIONS ====================

// updatePillarProgress is imported from ../utils/pillarProgress

async function processSkillScores(
  playerId: string,
  sessionId: string,
  coachId: string | undefined,
  skillRatings: Record<string, number>
) {
  const alpha = 0.4; // Weighted moving average alpha
  
  for (const [skillId, score] of Object.entries(skillRatings)) {
    if (score < 0 || score > 2) continue;
    
    // Get previous scores for this skill
    const previousScores = await db
      .select()
      .from(playerSkillScores)
      .where(and(
        eq(playerSkillScores.playerId, playerId),
        eq(playerSkillScores.skillId, skillId)
      ))
      .orderBy(desc(playerSkillScores.createdAt))
      .limit(1);
    
    let movingAverage: number;
    let observationCount: number;
    
    if (previousScores.length > 0) {
      const prev = previousScores[0];
      const oldAvg = Number(prev.movingAverage) || score;
      movingAverage = alpha * score + (1 - alpha) * oldAvg;
      observationCount = (prev.observationCount || 0) + 1;
    } else {
      movingAverage = score;
      observationCount = 1;
    }
    
    await db
      .insert(playerSkillScores)
      .values({
        playerId,
        skillId,
        score,
        sessionId,
        coachId,
        movingAverage: movingAverage.toFixed(2),
        observationCount,
      });

    // Run calibration anomaly detection silently in the background
    if (coachId) {
      checkForScoringAnomaly(coachId, skillId, sessionId, playerId, score).catch(err => {
        console.error("Error running calibration anomaly check:", err);
      });
    }
  }
}

// ==================== COACH CALIBRATION ====================

router.get("/api/glow/calibration/coach/:coachId", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { coachId } = req.params;
    const academyId = req.user!.academyId;
    
    // Verify coach belongs to academy (optional check, coachId might be current user's coachId)
    // Skip validation for now as coaches table structure may vary
    
    const { getCoachCalibrationStats } = await import("../services/coach-calibration-engine");
    const stats = await getCoachCalibrationStats(coachId);
    
    if (!stats) {
      return res.json({
        coachId,
        calibrationScore: 100,
        totalObservations: 0,
        averageDeviation: 0,
        bias: "neutral",
        anomalyCount: 0,
        recentTrend: "stable",
        message: "No calibration data yet",
      });
    }
    
    res.json(stats);
  } catch (error) {
    console.error("Error fetching coach calibration:", error);
    res.status(500).json({ error: "Failed to fetch calibration stats" });
  }
});

router.get("/api/glow/calibration/academy", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const academyId = req.user!.academyId;
    
    if (!academyId) {
      return res.status(400).json({ error: "Academy context required" });
    }
    
    const { getAcademyCalibrationReport } = await import("../services/coach-calibration-engine");
    const report = await getAcademyCalibrationReport(academyId);
    
    res.json(report);
  } catch (error) {
    console.error("Error fetching academy calibration:", error);
    res.status(500).json({ error: "Failed to fetch academy calibration report" });
  }
});

// ==================== GLOW RANK ====================

router.get("/api/glow/players/:playerId/rank", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    
    if (!await validatePlayerAccess(playerId, academyId)) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    const { calculateGlowRank } = await import("../services/glow-rank-engine");
    const rank = await calculateGlowRank(playerId);
    
    if (!rank) {
      return res.status(404).json({ error: "Player has no level assigned" });
    }
    
    res.json(rank);
  } catch (error) {
    console.error("Error calculating glow rank:", error);
    res.status(500).json({ error: "Failed to calculate glow rank" });
  }
});

// ==================== TRIAL TESTS ====================

// Get tests (gates) for a trial
router.get("/api/glow/trials/:trialId/tests", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { trialId } = req.params;
    const academyId = req.user!.academyId;
    
    const [trial] = await db
      .select()
      .from(levelTrials)
      .where(eq(levelTrials.id, trialId));
    
    if (!trial) {
      return res.status(404).json({ error: "Trial not found" });
    }
    
    if (!await validatePlayerAccess(trial.playerId, academyId)) {
      return res.status(404).json({ error: "Trial not found" });
    }
    
    // Get tests for the target level
    const tests = await db
      .select()
      .from(levelTests)
      .where(eq(levelTests.levelId, trial.toLevelId));
    
    // Get existing test results
    const testResults = trial.testResults ? 
      (typeof trial.testResults === 'string' ? JSON.parse(trial.testResults) : trial.testResults) : 
      {};
    
    const testsWithResults = tests.map(test => ({
      ...test,
      result: testResults[test.id] || null,
      passed: testResults[test.id]?.passed || false,
    }));
    
    res.json({
      trial,
      tests: testsWithResults,
      allTestsPassed: tests.every(t => testResults[t.id]?.passed),
    });
  } catch (error) {
    console.error("Error fetching trial tests:", error);
    res.status(500).json({ error: "Failed to fetch trial tests" });
  }
});

// Record test result for a trial
router.post("/api/glow/trials/:trialId/tests/:testId", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { trialId, testId } = req.params;
    const coachId = req.user!.coachId || req.user!.userId; // Fall back to user id for academy admins
    const academyId = req.user!.academyId;
    const { passed, score, notes, metrics } = req.body;
    
    const [trial] = await db
      .select()
      .from(levelTrials)
      .where(eq(levelTrials.id, trialId));
    
    if (!trial) {
      return res.status(404).json({ error: "Trial not found" });
    }
    
    if (!await validatePlayerAccess(trial.playerId, academyId)) {
      return res.status(404).json({ error: "Trial not found" });
    }
    
    if (trial.status !== "in_progress") {
      return res.status(400).json({ error: "Trial is not in progress" });
    }
    
    // Verify test belongs to target level OR is a USTA assessment item from the player's current (from) level
    const [test] = await db
      .select()
      .from(levelTests)
      .where(and(
        eq(levelTests.id, testId),
        or(
          eq(levelTests.levelId, trial.toLevelId),
          and(
            eq(levelTests.levelId, trial.fromLevelId),
            eq(levelTests.testType, "usta_assessment")
          )
        )
      ));
    
    if (!test) {
      return res.status(404).json({ error: "Test not found for this trial" });
    }
    
    // Update test results
    const currentResults = trial.testResults ? 
      (typeof trial.testResults === 'string' ? JSON.parse(trial.testResults) : trial.testResults) : 
      {};
    
    currentResults[testId] = {
      passed: passed === true,
      score: score || null,
      notes: notes || null,
      metrics: metrics || null,
      recordedAt: new Date().toISOString(),
      recordedBy: coachId,
    };
    
    await db
      .update(levelTrials)
      .set({
        testResults: JSON.stringify(currentResults),
        updatedAt: new Date(),
      })
      .where(eq(levelTrials.id, trialId));
    
    res.json({ success: true, testId, result: currentResults[testId] });
  } catch (error) {
    console.error("Error recording test result:", error);
    res.status(500).json({ error: "Failed to record test result" });
  }
});

// Get active trial for player
router.get("/api/glow/players/:playerId/active-trial", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    
    if (!await validatePlayerAccess(playerId, academyId)) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    const [trial] = await db
      .select({
        trial: levelTrials,
        fromLevel: ballLevels,
      })
      .from(levelTrials)
      .innerJoin(ballLevels, eq(levelTrials.fromLevelId, ballLevels.id))
      .where(and(
        eq(levelTrials.playerId, playerId),
        eq(levelTrials.status, "in_progress")
      ))
      .limit(1);
    
    if (!trial) {
      return res.json(null);
    }
    
    // Get target level
    const [toLevel] = await db
      .select()
      .from(ballLevels)
      .where(eq(ballLevels.id, trial.trial.toLevelId));
    
    // Get tests for target level
    const tests = await db
      .select()
      .from(levelTests)
      .where(eq(levelTests.levelId, trial.trial.toLevelId));
    
    const testResults = trial.trial.testResults ? 
      (typeof trial.trial.testResults === 'string' ? JSON.parse(trial.trial.testResults) : trial.trial.testResults) : 
      {};
    
    const testsWithResults = tests.map(t => ({
      ...t,
      result: testResults[t.id] || null,
      passed: testResults[t.id]?.passed || false,
    }));
    
    // Calculate days remaining
    const daysRemaining = trial.trial.endsAt ? 
      Math.max(0, Math.ceil((new Date(trial.trial.endsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 
      0;
    
    res.json({
      ...trial.trial,
      fromLevel: trial.fromLevel,
      toLevel,
      tests: testsWithResults,
      daysRemaining,
      testsPassed: testsWithResults.filter(t => t.passed).length,
      testsTotal: testsWithResults.length,
      allTestsPassed: testsWithResults.every(t => t.passed),
    });
  } catch (error) {
    console.error("Error fetching active trial:", error);
    res.status(500).json({ error: "Failed to fetch active trial" });
  }
});

// ==================== ROLE LANGUAGE ENGINE ====================

// Get role-specific message
router.post("/api/glow/messages/render", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { templateKey, role, context } = req.body;
    const academyId = req.user?.academyId;
    
    if (!templateKey || !role) {
      return res.status(400).json({ error: "templateKey and role are required" });
    }
    
    if (!["coach", "player", "parent"].includes(role)) {
      return res.status(400).json({ error: "role must be coach, player, or parent" });
    }
    
    const { getMessage } = await import("../services/role-language-engine");
    const message = await getMessage(templateKey, role, context || {}, academyId);
    
    res.json({ message, role, templateKey });
  } catch (error) {
    console.error("Error rendering message:", error);
    res.status(500).json({ error: "Failed to render message" });
  }
});

// Get messages for all roles
router.post("/api/glow/messages/render-all", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { templateKey, context } = req.body;
    const academyId = req.user?.academyId;
    
    if (!templateKey) {
      return res.status(400).json({ error: "templateKey is required" });
    }
    
    const { getMessagesForAllRoles } = await import("../services/role-language-engine");
    const messages = await getMessagesForAllRoles(templateKey, context || {}, academyId);
    
    res.json({ templateKey, messages });
  } catch (error) {
    console.error("Error rendering messages:", error);
    res.status(500).json({ error: "Failed to render messages" });
  }
});

// Seed role message templates
router.post("/api/glow/messages/seed", async (_req, res: Response) => {
  try {
    const { seedDefaultTemplates } = await import("../services/role-language-engine");
    const count = await seedDefaultTemplates();
    res.json({ success: true, templatesSeeded: count });
  } catch (error) {
    console.error("Error seeding message templates:", error);
    res.status(500).json({ error: "Failed to seed templates" });
  }
});

// Get available template keys
router.get("/api/glow/messages/templates", async (_req, res: Response) => {
  try {
    const { getDefaultTemplates } = await import("../services/role-language-engine");
    const templates = getDefaultTemplates();
    res.json({ templates: Object.keys(templates) });
  } catch (error) {
    console.error("Error fetching templates:", error);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

// ==================== ADULT GLOW SKILLS API ====================

// Get all adult Glow levels with full skill checklists
router.get("/api/glow/adult-levels", async (_req, res: Response) => {
  try {
    const { 
      ADULT_GLOW_SKILLS_BY_LEVEL, 
      getOrderedLevelIds,
      countSkillsPerLevel 
    } = await import("../seeds/adult-glow-skills-seed");
    
    const levelIds = getOrderedLevelIds();
    const levels = levelIds.map(levelId => {
      const level = ADULT_GLOW_SKILLS_BY_LEVEL[levelId];
      return {
        levelId: level.levelId,
        rank: level.rank,
        name: level.name,
        subtitle: level.subtitle,
        abilitySnapshot: level.abilitySnapshot,
        philosophy: level.philosophy,
        pillarWeighting: level.pillarWeighting,
        promotionRequirements: level.promotionRequirements,
        isDataDriven: level.isDataDriven || false,
        skillCount: countSkillsPerLevel(levelId),
      };
    });
    
    res.json({ levels });
  } catch (error) {
    console.error("Error fetching adult glow levels:", error);
    res.status(500).json({ error: "Failed to fetch adult glow levels" });
  }
});

// Get single adult Glow level with all skills organized by pillar
router.get("/api/glow/adult-levels/:levelId", async (req, res: Response) => {
  try {
    const { levelId } = req.params;
    const { ADULT_GLOW_SKILLS_BY_LEVEL, getSkillsByPillar } = await import("../seeds/adult-glow-skills-seed");
    
    const level = ADULT_GLOW_SKILLS_BY_LEVEL[levelId];
    if (!level) {
      return res.status(404).json({ error: "Level not found" });
    }
    
    // Group skills by pillar
    const pillars = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"];
    const skillsByPillar: Record<string, any[]> = {};
    
    for (const pillar of pillars) {
      const skills = getSkillsByPillar(levelId, pillar);
      if (skills.length > 0) {
        // Group by category within pillar (for technique)
        const categories: Record<string, any[]> = {};
        for (const skill of skills) {
          const category = skill.category || "General";
          if (!categories[category]) {
            categories[category] = [];
          }
          categories[category].push({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            category: skill.category,
            rubric: skill.rubric,
          });
        }
        skillsByPillar[pillar] = Object.entries(categories).map(([cat, catSkills]) => ({
          category: cat,
          skills: catSkills,
        }));
      } else {
        skillsByPillar[pillar] = [];
      }
    }
    
    res.json({
      levelId: level.levelId,
      rank: level.rank,
      name: level.name,
      subtitle: level.subtitle,
      abilitySnapshot: level.abilitySnapshot,
      philosophy: level.philosophy,
      pillarWeighting: level.pillarWeighting,
      promotionRequirements: level.promotionRequirements,
      isDataDriven: level.isDataDriven || false,
      skillsByPillar,
      totalSkills: level.skills.length,
    });
  } catch (error) {
    console.error("Error fetching adult level details:", error);
    res.status(500).json({ error: "Failed to fetch adult level details" });
  }
});

// Get skills for a specific pillar at a specific level
router.get("/api/glow/adult-levels/:levelId/pillar/:pillar", async (req, res: Response) => {
  try {
    const { levelId, pillar } = req.params;
    const { ADULT_GLOW_SKILLS_BY_LEVEL, getSkillsByPillar, getPillarWeighting } = await import("../seeds/adult-glow-skills-seed");
    
    const level = ADULT_GLOW_SKILLS_BY_LEVEL[levelId];
    if (!level) {
      return res.status(404).json({ error: "Level not found" });
    }
    
    const upperPillar = pillar.toUpperCase();
    const skills = getSkillsByPillar(levelId, upperPillar);
    const weighting = getPillarWeighting(levelId);
    
    // Group by category
    const categories: Record<string, any[]> = {};
    for (const skill of skills) {
      const category = skill.category || "General";
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        rubric: skill.rubric,
      });
    }
    
    res.json({
      levelId,
      pillar: upperPillar,
      weight: weighting ? weighting[upperPillar.toLowerCase() as keyof typeof weighting] : 0,
      categories: Object.entries(categories).map(([cat, catSkills]) => ({
        category: cat,
        skills: catSkills,
      })),
      totalSkills: skills.length,
    });
  } catch (error) {
    console.error("Error fetching pillar skills:", error);
    res.status(500).json({ error: "Failed to fetch pillar skills" });
  }
});

// Save player skill assessment (coach checklist)
router.post("/api/glow/players/:playerId/assessment", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const { levelId, skillScores, notes } = req.body;
    const academyId = req.user!.academyId;
    const coachId = req.user!.coachId;
    
    if (!await validatePlayerAccess(playerId, academyId)) {
      return res.status(404).json({ error: "Player not found" });
    }
    
    if (!levelId || !skillScores) {
      return res.status(400).json({ error: "levelId and skillScores are required" });
    }
    
    // Calculate pillar scores and overall readiness
    const { ADULT_GLOW_SKILLS_BY_LEVEL, getPillarWeighting } = await import("../seeds/adult-glow-skills-seed");
    const level = ADULT_GLOW_SKILLS_BY_LEVEL[levelId];
    
    if (!level) {
      return res.status(400).json({ error: "Invalid level" });
    }
    
    const weighting = getPillarWeighting(levelId);
    const pillarScores: Record<string, { achieved: number; total: number; percentage: number }> = {};
    
    // Group skills by pillar and calculate scores
    for (const skill of level.skills) {
      const pillar = skill.pillar;
      if (!pillarScores[pillar]) {
        pillarScores[pillar] = { achieved: 0, total: 0, percentage: 0 };
      }
      pillarScores[pillar].total += 2; // Max score per skill is 2
      const score = skillScores[skill.id] ?? 0;
      pillarScores[pillar].achieved += score;
    }
    
    // Calculate percentages and weighted total
    let weightedTotal = 0;
    for (const pillar of Object.keys(pillarScores)) {
      const ps = pillarScores[pillar];
      ps.percentage = ps.total > 0 ? Math.round((ps.achieved / ps.total) * 100) : 0;
      const pillarWeight = weighting ? weighting[pillar.toLowerCase() as keyof typeof weighting] || 0 : 0;
      weightedTotal += (ps.percentage * pillarWeight) / 100;
    }
    
    // Check promotion readiness
    const promotionReady = level.promotionRequirements.techniqueMinPercent
      ? pillarScores["TECHNIQUE"]?.percentage >= level.promotionRequirements.techniqueMinPercent
      : weightedTotal >= 60;
    
    // Store assessment in player_skill_scores (one record per skill)
    for (const [skillId, score] of Object.entries(skillScores)) {
      if (typeof score === 'number') {
        await db.insert(playerSkillScores).values({
          id: `${playerId}_${skillId}_${Date.now()}`,
          playerId,
          skillId,
          score,
          movingAverage: score, // Initial moving average
          observedByCoachId: coachId || undefined,
          confidence: 1.0,
        }).onConflictDoNothing();
      }
    }
    
    // Update pillar progress
    for (const [pillar, scores] of Object.entries(pillarScores)) {
      const existing = await db.select().from(playerPillarProgress).where(
        and(eq(playerPillarProgress.playerId, playerId), eq(playerPillarProgress.pillar, pillar))
      );
      
      if (existing.length > 0) {
        await db.update(playerPillarProgress)
          .set({
            currentScore: scores.percentage,
            trend: scores.percentage > (existing[0].currentScore || 0) ? "up" : 
                   scores.percentage < (existing[0].currentScore || 0) ? "down" : "stable",
            lastUpdated: new Date(),
          })
          .where(and(eq(playerPillarProgress.playerId, playerId), eq(playerPillarProgress.pillar, pillar)));
      } else {
        await db.insert(playerPillarProgress).values({
          id: `${playerId}_${pillar}`,
          playerId,
          pillar,
          currentScore: scores.percentage,
          trend: "stable",
        });
      }
    }
    
    res.json({
      success: true,
      playerId,
      levelId,
      pillarScores,
      weightedScore: Math.round(weightedTotal),
      promotionReady,
      assessedAt: new Date().toISOString(),
      notes,
    });
  } catch (error) {
    console.error("Error saving assessment:", error);
    res.status(500).json({ error: "Failed to save assessment" });
  }
});

// ==================== BLUE STAGE SKILLS API ====================

// Get all Blue stage levels with full skill checklists
router.get("/api/glow/blue-levels", async (_req, res: Response) => {
  try {
    const { 
      BLUE_STAGE_SKILLS_BY_LEVEL, 
      getOrderedBlueLevelIds,
      countBlueSkillsPerLevel 
    } = await import("../seeds/blue-stage-skills-seed");
    
    const levelIds = getOrderedBlueLevelIds();
    const levels = levelIds.map(levelId => {
      const level = BLUE_STAGE_SKILLS_BY_LEVEL[levelId];
      return {
        levelId: level.levelId,
        rank: level.rank,
        name: level.name,
        subtitle: level.subtitle,
        abilitySnapshot: level.abilitySnapshot,
        philosophy: level.philosophy,
        pillarWeighting: level.pillarWeighting,
        promotionRequirements: level.promotionRequirements,
        skillCount: countBlueSkillsPerLevel(levelId),
      };
    });
    
    res.json({ levels });
  } catch (error) {
    console.error("Error fetching blue stage levels:", error);
    res.status(500).json({ error: "Failed to fetch blue stage levels" });
  }
});

// Get single Blue stage level with all skills organized by pillar
router.get("/api/glow/blue-levels/:levelId", async (req, res: Response) => {
  try {
    const { levelId } = req.params;
    const { BLUE_STAGE_SKILLS_BY_LEVEL, getBlueSkillsByPillar } = await import("../seeds/blue-stage-skills-seed");
    
    const level = BLUE_STAGE_SKILLS_BY_LEVEL[levelId];
    if (!level) {
      return res.status(404).json({ error: "Level not found" });
    }
    
    // Group skills by pillar
    const pillars = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"];
    const skillsByPillar: Record<string, any[]> = {};
    
    for (const pillar of pillars) {
      const skills = getBlueSkillsByPillar(levelId, pillar);
      if (skills.length > 0) {
        // Group by category within pillar
        const categories: Record<string, any[]> = {};
        for (const skill of skills) {
          const category = skill.category || "General";
          if (!categories[category]) {
            categories[category] = [];
          }
          categories[category].push({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            category: skill.category,
            rubric: skill.rubric,
          });
        }
        skillsByPillar[pillar] = Object.entries(categories).map(([cat, catSkills]) => ({
          category: cat,
          skills: catSkills,
        }));
      } else {
        skillsByPillar[pillar] = [];
      }
    }
    
    res.json({
      levelId: level.levelId,
      rank: level.rank,
      name: level.name,
      subtitle: level.subtitle,
      abilitySnapshot: level.abilitySnapshot,
      philosophy: level.philosophy,
      pillarWeighting: level.pillarWeighting,
      promotionRequirements: level.promotionRequirements,
      skillsByPillar,
      totalSkills: level.skills.length,
    });
  } catch (error) {
    console.error("Error fetching blue level details:", error);
    res.status(500).json({ error: "Failed to fetch blue level details" });
  }
});

// Get skills for a specific pillar at a specific Blue level
router.get("/api/glow/blue-levels/:levelId/pillar/:pillar", async (req, res: Response) => {
  try {
    const { levelId, pillar } = req.params;
    const { BLUE_STAGE_SKILLS_BY_LEVEL, getBlueSkillsByPillar, getBluePillarWeighting } = await import("../seeds/blue-stage-skills-seed");
    
    const level = BLUE_STAGE_SKILLS_BY_LEVEL[levelId];
    if (!level) {
      return res.status(404).json({ error: "Level not found" });
    }
    
    const upperPillar = pillar.toUpperCase();
    const skills = getBlueSkillsByPillar(levelId, upperPillar);
    const weighting = getBluePillarWeighting(levelId);
    
    // Group by category
    const categories: Record<string, any[]> = {};
    for (const skill of skills) {
      const category = skill.category || "General";
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        rubric: skill.rubric,
      });
    }
    
    res.json({
      levelId,
      pillar: upperPillar,
      weight: weighting ? weighting[upperPillar.toLowerCase() as keyof typeof weighting] : 0,
      categories: Object.entries(categories).map(([cat, catSkills]) => ({
        category: cat,
        skills: catSkills,
      })),
      totalSkills: skills.length,
    });
  } catch (error) {
    console.error("Error fetching blue pillar skills:", error);
    res.status(500).json({ error: "Failed to fetch blue pillar skills" });
  }
});

// ==================== SESSION INTAKE ====================

// GET /api/coach/sessions/pending-feedback
// Returns completed sessions in last 7 days that have no session_skill_feedback for at least one present player
router.get("/api/coach/sessions/pending-feedback", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user!.coachId;
    const academyId = req.user!.academyId;
    if (!coachId || !academyId) return res.status(403).json({ error: "Forbidden" });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get completed sessions from last 7 days for this coach
    const recentCompleted = await db
      .select({
        id: sessions.id,
        startTime: sessions.startTime,
        sessionType: sessions.sessionType,
        status: sessions.status,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.coachId, coachId),
          eq(sessions.status, "completed"),
          gte(sessions.startTime, sevenDaysAgo)
        )
      )
      .orderBy(desc(sessions.startTime));

    if (recentCompleted.length === 0) {
      return res.json([]);
    }

    const sessionIds = recentCompleted.map((s) => s.id);

    // Get all present players for these sessions
    const presentPlayers = await db
      .select({
        sessionId: sessionPlayers.sessionId,
        playerId: sessionPlayers.playerId,
        playerName: players.name,
        attendanceStatus: sessionPlayers.attendanceStatus,
      })
      .from(sessionPlayers)
      .innerJoin(players, eq(sessionPlayers.playerId, players.id))
      .where(
        and(
          inArray(sessionPlayers.sessionId, sessionIds),
          eq(sessionPlayers.attendanceStatus, "present")
        )
      );

    // Get sessions that already have feedback for ALL present players
    const existingFeedback = await db
      .select({
        sessionId: sessionSkillFeedback.sessionId,
        playerId: sessionSkillFeedback.playerId,
      })
      .from(sessionSkillFeedback)
      .where(inArray(sessionSkillFeedback.sessionId, sessionIds));

    const feedbackSet = new Set(
      existingFeedback.map((f) => `${f.sessionId}:${f.playerId}`)
    );

    // Build per-session player map
    const playersBySession = new Map<string, { id: string; name: string; attendanceStatus: string }[]>();
    for (const p of presentPlayers) {
      if (!playersBySession.has(p.sessionId)) {
        playersBySession.set(p.sessionId, []);
      }
      playersBySession.get(p.sessionId)!.push({ id: p.playerId, name: p.playerName, attendanceStatus: p.attendanceStatus ?? "present" });
    }

    const pending = [];
    for (const session of recentCompleted) {
      const sessionPlayerList = playersBySession.get(session.id) || [];
      if (sessionPlayerList.length === 0) continue;

      const isGroup = session.sessionType === "group";
      const isSemiPrivate = session.sessionType === "semi_private";
      const isPrivate = session.sessionType === "private";

      if (isGroup) {
        // Group: one card per session — show all players needing feedback
        const missingPlayers = sessionPlayerList.filter(
          (p) => !feedbackSet.has(`${session.id}:${p.id}`)
        );
        if (missingPlayers.length > 0) {
          pending.push({
            sessionId: session.id,
            startTime: session.startTime,
            sessionType: session.sessionType,
            players: missingPlayers,
            playerCount: missingPlayers.length,
            needsGroupDynamics: true,
            cardType: "group" as const,
          });
        }
      } else {
        // Private / semi-private: one card per player needing feedback
        for (const p of sessionPlayerList) {
          if (!feedbackSet.has(`${session.id}:${p.id}`)) {
            pending.push({
              sessionId: session.id,
              startTime: session.startTime,
              sessionType: session.sessionType,
              players: [p],
              playerCount: 1,
              needsGroupDynamics: isSemiPrivate,
              cardType: (isPrivate ? "private" : "semi_private") as "private" | "semi_private",
            });
          }
        }
      }
    }

    res.json(pending);
  } catch (error) {
    console.error("[PendingFeedback] Error:", error);
    res.status(500).json({ error: "Failed to fetch pending feedback" });
  }
});

// POST /api/coach/sessions/:sessionId/intake
// Save intake data for a session. If saveOnly=true, also writes pillar ratings directly to skill feedback.
router.post("/api/coach/sessions/:sessionId/intake", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const coachId = req.user!.coachId;
    const academyId = req.user!.academyId;
    if (!coachId || !academyId) return res.status(403).json({ error: "Forbidden" });

    const {
      trainedSkills,
      intensity,
      groupDynamics,
      playerData, // array of { playerId, playerTags, pillarRatings, highlight }
      saveOnly,
    } = req.body as {
      trainedSkills: string[];
      intensity: string;
      groupDynamics?: Record<string, string>;
      playerData: {
        playerId: string;
        playerTags?: string[];
        pillarRatings?: Record<string, string>;
        highlight?: string;
      }[];
      saveOnly?: boolean;
    };

    if (!Array.isArray(playerData) || playerData.length === 0) {
      return res.status(400).json({ error: "playerData is required" });
    }

    // Verify session ownership
    const [session] = await db
      .select({ id: sessions.id, sessionType: sessions.sessionType })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.coachId, coachId)));
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Verify all submitted playerIds actually belong to this session
    const submittedPlayerIds = playerData.map((pd) => pd.playerId);
    const sessionPlayerRows = await db
      .select({ playerId: sessionPlayers.playerId })
      .from(sessionPlayers)
      .where(and(
        eq(sessionPlayers.sessionId, sessionId),
        inArray(sessionPlayers.playerId, submittedPlayerIds),
      ));
    if (sessionPlayerRows.length !== submittedPlayerIds.length) {
      return res.status(403).json({ error: "One or more players do not belong to this session" });
    }

    const isGroup = session.sessionType === "group" || session.sessionType === "semi_private";

    // Store session-level intake row (playerId = null) for ALL session types so that
    // trainedSkills/intensity can be read for AI context injection in private sessions too.
    // Delete any existing session-level row first, then insert fresh.
    await db
      .delete(sessionIntakeData)
      .where(and(
        eq(sessionIntakeData.sessionId, sessionId),
        isNull(sessionIntakeData.playerId),
      ));
    await db
      .insert(sessionIntakeData)
      .values({
        sessionId,
        playerId: null,
        coachId,
        trainedSkills: trainedSkills || [],
        intensity: intensity || null,
        groupDynamics: (isGroup && groupDynamics) ? groupDynamics : null,
        playerTags: null,
        pillarRatings: null,
        highlight: null,
      });

    // Store per-player intake rows
    for (const pd of playerData) {
      await db
        .insert(sessionIntakeData)
        .values({
          sessionId,
          playerId: pd.playerId,
          coachId,
          trainedSkills: isGroup ? [] : (trainedSkills || []),
          intensity: isGroup ? null : (intensity || null),
          groupDynamics: null,
          playerTags: pd.playerTags || null,
          pillarRatings: pd.pillarRatings || null,
          highlight: pd.highlight || null,
        });
    }

    // If save-only mode, write pillar ratings directly to session_skill_feedback
    if (saveOnly) {
      const pillarToScore = (val: string | undefined): number => {
        if (val === "good") return 2;
        if (val === "developing") return 1;
        return 0;
      };

      for (const pd of playerData) {
        if (!pd.pillarRatings) continue;
        const pr = pd.pillarRatings;

        // Check for existing feedback (to avoid duplicate unique constraint)
        const [existing] = await db
          .select({ id: sessionSkillFeedback.id })
          .from(sessionSkillFeedback)
          .where(
            and(
              eq(sessionSkillFeedback.sessionId, sessionId),
              eq(sessionSkillFeedback.playerId, pd.playerId)
            )
          );

        if (existing) {
          // Update with intake pillar ratings
          await db
            .update(sessionSkillFeedback)
            .set({
              techniquePillar: pillarToScore(pr.technique),
              tacticalPillar: pillarToScore(pr.tactical),
              physicalPillar: pillarToScore(pr.physical),
              mentalPillar: pillarToScore(pr.mental),
              lessonIntensity: intensity || null,
            })
            .where(eq(sessionSkillFeedback.id, existing.id));
        } else {
          const effortScore = pillarToScore(pr.effort);
          await db.insert(sessionSkillFeedback).values({
            sessionId,
            playerId: pd.playerId,
            coachId,
            effort: effortScore,
            execution: effortScore,
            understanding: effortScore,
            overall: pd.highlight === "breakthrough" ? "improved" : pd.highlight === "tough_day" ? "declined" : "stable",
            techniquePillar: pillarToScore(pr.technique),
            tacticalPillar: pillarToScore(pr.tactical),
            physicalPillar: pillarToScore(pr.physical),
            mentalPillar: pillarToScore(pr.mental),
            lessonIntensity: intensity || null,
          });
        }

        // Update pillar progress
        await updatePillarProgress(pd.playerId, sessionId, {
          effort: pillarToScore(pr.effort),
          execution: pillarToScore(pr.technique ?? pr.effort),
          understanding: pillarToScore(pr.tactical ?? pr.effort),
          overall: pd.highlight === "breakthrough" ? "improved" : pd.highlight === "tough_day" ? "declined" : "stable",
        });
      }
    }

    res.status(201).json({ success: true });
  } catch (error) {
    console.error("[Intake] Error saving intake data:", error);
    res.status(500).json({ error: "Failed to save intake data" });
  }
});

// ==================== SEED ENDPOINT ====================

router.post("/api/glow/seed", async (_req, res: Response) => {
  try {
    const { seedGlowLevelingData } = await import("../seeds/glow-leveling-seed");
    const result = await seedGlowLevelingData();
    res.json(result);
  } catch (error) {
    console.error("Error seeding glow leveling data:", error);
    res.status(500).json({ error: "Failed to seed data", details: String(error) });
  }
});

export default router;
