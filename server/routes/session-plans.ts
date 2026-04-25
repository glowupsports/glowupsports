import { Router, Response } from "express";
import { db } from "../db";
import { 
  lessonTemplates, 
  drillBlocks, 
  sessionPlans, 
  sessions,
  playerBallLevels,
  ballLevels,
  players,
} from "../../shared/schema";
import { eq, and, sql, inArray, desc, isNull, or } from "drizzle-orm";
import { AuthenticatedRequest, authMiddlewareWithFreshData as authMiddleware, requireAcademy, validateSessionOwnership } from "../auth";
import { storage } from "../storage";

const router = Router();

// ==================== LESSON TEMPLATES ====================

// Get all lesson templates (global + academy-specific)
router.get("/api/lesson-templates", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const academyId = req.user!.academyId;
    const { levelId, focus } = req.query;
    
    let query = db
      .select()
      .from(lessonTemplates)
      .where(
        sql`(${lessonTemplates.academyId} IS NULL OR ${lessonTemplates.academyId} = ${academyId}) AND ${lessonTemplates.isActive} = true`
      );
    
    const templates = await query;
    
    // Filter by level and focus if provided
    let filtered = templates;
    if (levelId) {
      filtered = filtered.filter(t => !t.levelId || t.levelId === levelId);
    }
    if (focus) {
      filtered = filtered.filter(t => t.focus === focus);
    }
    
    res.json(filtered);
  } catch (error) {
    console.error("Error fetching lesson templates:", error);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

// Get single template with blocks
router.get("/api/lesson-templates/:templateId", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { templateId } = req.params;
    const academyId = req.user!.academyId;
    
    // Verify template is global or belongs to this academy
    const [template] = await db
      .select()
      .from(lessonTemplates)
      .where(and(
        eq(lessonTemplates.id, templateId),
        or(
          isNull(lessonTemplates.academyId),
          eq(lessonTemplates.academyId, academyId!)
        )
      ));
    
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    const blocks = await db
      .select()
      .from(drillBlocks)
      .where(eq(drillBlocks.templateId, templateId))
      .orderBy(drillBlocks.orderIndex);
    
    res.json({ ...template, blocks });
  } catch (error) {
    console.error("Error fetching template:", error);
    res.status(500).json({ error: "Failed to fetch template" });
  }
});

// ==================== SESSION PLANS ====================

// Generate session plan for a session
router.post("/api/sessions/:sessionId/plan/generate", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const coachId = req.user!.coachId || req.user!.userId;
    const academyId = req.user!.academyId;
    const { templateId, customBlocks } = req.body;
    
    // Get session
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(
        eq(sessions.id, sessionId),
        eq(sessions.academyId, academyId!)
      ));
    
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    
    // Check for existing plan
    const [existingPlan] = await db
      .select()
      .from(sessionPlans)
      .where(eq(sessionPlans.sessionId, sessionId));
    
    if (existingPlan) {
      return res.status(409).json({ error: "Session already has a plan", planId: existingPlan.id });
    }
    
    let blocks: any[] = [];
    
    if (templateId) {
      // Generate from template
      const templateBlocks = await db
        .select()
        .from(drillBlocks)
        .where(eq(drillBlocks.templateId, templateId))
        .orderBy(drillBlocks.orderIndex);
      
      blocks = templateBlocks.map((b, index) => ({
        id: `BLOCK_${index + 1}`,
        name: b.name,
        blockType: b.blockType,
        durationMinutes: b.durationMinutes,
        orderIndex: index,
        skillIds: b.skillIds || [],
        coachInstructions: b.coachInstructions,
        playerInstructions: b.playerInstructions,
        equipmentNeeded: b.equipmentNeeded || [],
        status: "pending",
      }));
      
      // Increment template usage
      await db
        .update(lessonTemplates)
        .set({ usageCount: sql`${lessonTemplates.usageCount} + 1` })
        .where(eq(lessonTemplates.id, templateId));
    } else if (customBlocks) {
      blocks = customBlocks;
    } else {
      // Auto-generate based on session players' levels
      blocks = await autoGeneratePlan(sessionId, academyId!);
    }
    
    // Create session plan
    const [plan] = await db
      .insert(sessionPlans)
      .values({
        sessionId,
        templateId: templateId || null,
        status: "draft",
        blocks: JSON.stringify(blocks),
        generatedBy: coachId,
      })
      .returning();
    
    res.status(201).json({ ...plan, blocks });
  } catch (error) {
    console.error("Error generating session plan:", error);
    res.status(500).json({ error: "Failed to generate session plan" });
  }
});

// Get session plan
router.get("/api/sessions/:sessionId/plan", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const academyId = req.user!.academyId;
    
    // Validate session belongs to this academy
    const ownership = await validateSessionOwnership(sessionId, academyId, storage);
    if (!ownership.valid) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const [plan] = await db
      .select()
      .from(sessionPlans)
      .where(eq(sessionPlans.sessionId, sessionId));
    
    if (!plan) {
      return res.json(null);
    }
    
    // Parse blocks
    const blocks = typeof plan.blocks === 'string' ? JSON.parse(plan.blocks) : plan.blocks;
    
    res.json({ ...plan, blocks });
  } catch (error) {
    console.error("Error fetching session plan:", error);
    res.status(500).json({ error: "Failed to fetch session plan" });
  }
});

// Start session plan execution
router.post("/api/sessions/:sessionId/plan/start", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const academyId = req.user!.academyId;
    
    // Validate session belongs to this academy
    const ownership = await validateSessionOwnership(sessionId, academyId, storage);
    if (!ownership.valid) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const [plan] = await db
      .select()
      .from(sessionPlans)
      .where(eq(sessionPlans.sessionId, sessionId));
    
    if (!plan) {
      return res.status(404).json({ error: "Session plan not found" });
    }
    
    await db
      .update(sessionPlans)
      .set({
        status: "active",
        startedAt: new Date(),
        currentBlockIndex: 0,
        updatedAt: new Date(),
      })
      .where(eq(sessionPlans.id, plan.id));
    
    res.json({ success: true, status: "active" });
  } catch (error) {
    console.error("Error starting session plan:", error);
    res.status(500).json({ error: "Failed to start session plan" });
  }
});

// Update block status (during execution)
router.patch("/api/sessions/:sessionId/plan/blocks/:blockIndex", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId, blockIndex } = req.params;
    const academyId = req.user!.academyId;
    const { status, notes } = req.body;
    
    // Validate session belongs to this academy
    const ownership = await validateSessionOwnership(sessionId, academyId, storage);
    if (!ownership.valid) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const [plan] = await db
      .select()
      .from(sessionPlans)
      .where(eq(sessionPlans.sessionId, sessionId));
    
    if (!plan) {
      return res.status(404).json({ error: "Session plan not found" });
    }
    
    const blocks = typeof plan.blocks === 'string' ? JSON.parse(plan.blocks) : plan.blocks;
    const idx = parseInt(blockIndex);
    
    if (idx < 0 || idx >= blocks.length) {
      return res.status(400).json({ error: "Invalid block index" });
    }
    
    // Update block
    blocks[idx] = {
      ...blocks[idx],
      status,
      notes: notes || blocks[idx].notes,
      ...(status === "in_progress" ? { startedAt: new Date().toISOString() } : {}),
      ...(status === "completed" ? { completedAt: new Date().toISOString() } : {}),
    };
    
    // Update current block index if moving forward
    let newCurrentIndex = plan.currentBlockIndex || 0;
    if (status === "completed" && idx === newCurrentIndex && idx < blocks.length - 1) {
      newCurrentIndex = idx + 1;
    }
    
    await db
      .update(sessionPlans)
      .set({
        blocks: JSON.stringify(blocks),
        currentBlockIndex: newCurrentIndex,
        updatedAt: new Date(),
      })
      .where(eq(sessionPlans.id, plan.id));
    
    res.json({ success: true, blocks, currentBlockIndex: newCurrentIndex });
  } catch (error) {
    console.error("Error updating block:", error);
    res.status(500).json({ error: "Failed to update block" });
  }
});

// Complete session plan
router.post("/api/sessions/:sessionId/plan/complete", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const academyId = req.user!.academyId;
    const { coachNotes } = req.body;
    
    // Validate session belongs to this academy
    const ownership = await validateSessionOwnership(sessionId, academyId, storage);
    if (!ownership.valid) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const [plan] = await db
      .select()
      .from(sessionPlans)
      .where(eq(sessionPlans.sessionId, sessionId));
    
    if (!plan) {
      return res.status(404).json({ error: "Session plan not found" });
    }
    
    await db
      .update(sessionPlans)
      .set({
        status: "completed",
        completedAt: new Date(),
        coachNotes: coachNotes || plan.coachNotes,
        updatedAt: new Date(),
      })
      .where(eq(sessionPlans.id, plan.id));
    
    res.json({ success: true, status: "completed" });
  } catch (error) {
    console.error("Error completing session plan:", error);
    res.status(500).json({ error: "Failed to complete session plan" });
  }
});

// Auto-generate plan based on player levels
async function autoGeneratePlan(sessionId: string, academyId: string): Promise<any[]> {
  // Get session players
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  
  if (!session || !session.playerIds || session.playerIds.length === 0) {
    // Default beginner plan
    return getDefaultPlan("RED_3");
  }
  
  // Get players' levels
  const playerLevels = await db
    .select({
      levelId: playerBallLevels.levelId,
    })
    .from(playerBallLevels)
    .where(and(
      inArray(playerBallLevels.playerId, session.playerIds as string[]),
      sql`${playerBallLevels.status} IN ('active', 'trial')`
    ));
  
  // Use the most common or lowest level
  const levelCount: Record<string, number> = {};
  for (const pl of playerLevels) {
    levelCount[pl.levelId] = (levelCount[pl.levelId] || 0) + 1;
  }
  
  const targetLevel = Object.entries(levelCount)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "RED_3";
  
  return await getPlanFromTemplateOrDefault(targetLevel);
}

async function getPlanFromTemplateOrDefault(levelId: string): Promise<any[]> {
  const { lessonTemplates, drillBlocks } = await import("../../shared/schema");
  
  const templates = await db
    .select()
    .from(lessonTemplates)
    .where(eq(lessonTemplates.levelId, levelId));
  
  if (templates.length > 0) {
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    const blocks = await db
      .select()
      .from(drillBlocks)
      .where(eq(drillBlocks.templateId, template.id))
      .orderBy(drillBlocks.orderIndex);
    
    if (blocks.length > 0) {
      return blocks.map((block, index) => ({
        id: `BLOCK_${index + 1}`,
        name: block.name,
        blockType: block.blockType,
        durationMinutes: block.durationMinutes,
        orderIndex: index,
        skillIds: block.skillIds || [],
        pillars: block.pillars || [],
        status: "pending",
        coachInstructions: block.coachInstructions || "",
        playerInstructions: block.playerInstructions || "",
        successCriteria: block.successCriteria || "",
        equipment: block.equipment || [],
      }));
    }
  }
  
  return getDefaultPlan(levelId);
}

function getDefaultPlan(levelId: string): any[] {
  const stage = levelId.split("_")[0];
  
  const stageSkills: Record<string, string[]> = {
    RED: ["FH_CONTACT", "BH_CONTACT", "RALLY_COOP"],
    ORANGE: ["BASELINE_RALLY_OR", "SERVE_FULL_MOTION", "CROSSCOURT_INTENT"],
    GREEN: ["FULL_COURT_RALLY_8", "DEPTH_CONTROL_6_10", "RECOVERY_NEUTRAL"],
    YELLOW: ["RALLY_PRESSURE_12_15", "SERVE_60_PERCENT", "HIGH_PERCENTAGE_TENNIS"],
  };
  
  const skills = stageSkills[stage] || stageSkills.RED;
  
  const basePlan = [
    { id: "BLOCK_1", name: "Warm-up", blockType: "warmup", durationMinutes: 10, orderIndex: 0, skillIds: [], pillars: ["PHYSICAL"], status: "pending", coachInstructions: "Dynamic stretching, light hitting, and movement prep", playerInstructions: "Get your body ready to move!" },
    { id: "BLOCK_2", name: "Technical Focus", blockType: "drill", durationMinutes: 15, orderIndex: 1, skillIds: [skills[0]], pillars: ["TECHNIQUE"], status: "pending", coachInstructions: `Focus on ${skills[0].replace(/_/g, " ").toLowerCase()}`, playerInstructions: "Watch the ball and stay balanced" },
    { id: "BLOCK_3", name: "Rally Practice", blockType: "drill", durationMinutes: 15, orderIndex: 2, skillIds: [skills[1]], pillars: ["TECHNIQUE", "TACTICAL"], status: "pending", coachInstructions: "Build consistency and depth", playerInstructions: "Keep the ball in play!" },
    { id: "BLOCK_4", name: "Game Play", blockType: "game", durationMinutes: 15, orderIndex: 3, skillIds: [skills[2]], pillars: ["MATCH", "MENTAL"], status: "pending", coachInstructions: "Apply skills in match situations", playerInstructions: "Play your best!" },
    { id: "BLOCK_5", name: "Cool Down", blockType: "cooldown", durationMinutes: 5, orderIndex: 4, skillIds: [], pillars: ["PHYSICAL", "MENTAL"], status: "pending", coachInstructions: "Stretching and session review", playerInstructions: "What did you learn today?" },
  ];
  
  return basePlan;
}

export default router;
