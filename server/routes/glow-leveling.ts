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
  players
} from "../../shared/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { AuthenticatedRequest, authMiddlewareWithFreshData as authMiddleware, requireAcademy } from "../auth";

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
    
    const levelSkillsData = await db
      .select({
        mapping: levelSkills,
        skill: glowSkills,
      })
      .from(levelSkills)
      .innerJoin(glowSkills, eq(levelSkills.skillId, glowSkills.id))
      .where(eq(levelSkills.levelId, levelId));
    
    const tests = await db.select().from(levelTests).where(eq(levelTests.levelId, levelId));
    
    // Group skills by pillar
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
    
    // Ensure all 6 pillars are represented
    const pillars = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"];
    const pillarMap: Record<string, any> = {};
    
    for (const pillar of pillars) {
      const existing = progress.find(p => p.pillar === pillar);
      pillarMap[pillar] = existing || {
        pillar,
        currentScore: 0,
        trend: "stable",
        lastSessionDelta: null,
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
    
    // Get player's current level
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
    
    if (!playerLevel?.levelId) {
      return res.json([]);
    }
    
    // Get skills for this level
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
      .where(eq(levelSkills.levelId, playerLevel.levelId))
      .orderBy(glowSkills.pillar, glowSkills.name);
    
    // Map pillar names
    const pillarNames: Record<string, string> = {
      TECHNIQUE: "Technical",
      TACTICAL: "Tactical",
      PHYSICAL: "Physical",
      MENTAL: "Mental",
      SOCIAL: "Social",
      MATCH: "Match Play",
    };
    
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
    } = req.body;
    
    if (!playerId || effort === undefined || execution === undefined || understanding === undefined || !overall) {
      return res.status(400).json({ error: "Missing required feedback fields" });
    }
    
    // Validate player ownership
    if (!await validatePlayerAccess(playerId, academyId)) {
      return res.status(404).json({ error: "Player not found" });
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
    
    // Process individual skill scores if provided
    if (skillRatings && Object.keys(skillRatings).length > 0) {
      await processSkillScores(playerId, sessionId, coachId, skillRatings);
    }
    
    // Update coach calibration
    if (coachId) {
      await updateCoachCalibration(coachId);
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

async function updatePillarProgress(
  playerId: string,
  sessionId: string,
  feedback: {
    effort: number;
    execution: number;
    understanding: number;
    overall: string;
    pillarRatings?: Record<string, number>;
  }
) {
  const pillars = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"];
  
  // Calculate overall session score (0-2 scale)
  const sessionScore = (feedback.effort + feedback.execution + feedback.understanding) / 3;
  
  for (const pillar of pillars) {
    // Get current progress
    const [current] = await db
      .select()
      .from(playerPillarProgress)
      .where(and(
        eq(playerPillarProgress.playerId, playerId),
        eq(playerPillarProgress.pillar, pillar)
      ));
    
    // Calculate new score with exponential moving average (alpha = 0.3)
    const alpha = 0.3;
    const pillarScore = feedback.pillarRatings?.[pillar] ?? sessionScore;
    
    let newScore: number;
    let trend: string;
    let delta: string;
    
    if (current) {
      const oldScore = Number(current.currentScore);
      newScore = alpha * pillarScore + (1 - alpha) * oldScore;
      
      const diff = newScore - oldScore;
      if (diff > 0.1) {
        trend = "improving";
        delta = `+${diff.toFixed(2)}`;
      } else if (diff < -0.1) {
        trend = "declining";
        delta = diff.toFixed(2);
      } else {
        trend = "stable";
        delta = "0.00";
      }
      
      await db
        .update(playerPillarProgress)
        .set({
          currentScore: newScore.toFixed(2),
          trend,
          lastSessionDelta: delta,
          lastSessionId: sessionId,
          lastUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(playerPillarProgress.id, current.id));
    } else {
      newScore = pillarScore;
      trend = "stable";
      delta = "0.00";
      
      await db
        .insert(playerPillarProgress)
        .values({
          playerId,
          pillar,
          currentScore: newScore.toFixed(2),
          trend,
          lastSessionDelta: delta,
          lastSessionId: sessionId,
          lastUpdatedAt: new Date(),
        });
    }
  }
}

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
  }
}

async function updateCoachCalibration(coachId: string) {
  // Get or create calibration record
  const [existing] = await db
    .select()
    .from(coachCalibration)
    .where(eq(coachCalibration.coachId, coachId));
  
  if (existing) {
    await db
      .update(coachCalibration)
      .set({
        calibrationCount: (existing.calibrationCount || 0) + 1,
        lastCalibrationAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(coachCalibration.coachId, coachId));
  } else {
    await db
      .insert(coachCalibration)
      .values({
        coachId,
        calibrationCount: 1,
        lastCalibrationAt: new Date(),
      });
  }
}

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
