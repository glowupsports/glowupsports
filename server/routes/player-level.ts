import { Router, Request, Response } from "express";
import { db } from "../db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import {
  players,
  users,
  playerLevelThresholds,
  playerLevelXpRules,
  playerFeatureUnlocks,
  playerXpEvents,
  playerLevelUpCelebrations,
  playerFeatureUnlockHistory,
} from "@shared/schema";
import { sendLevelUpNotification, sendXPGainNotification } from "../pushNotifications";
import { isAppleReviewAccount, authMiddlewareWithFreshData as authMiddleware, type AuthenticatedRequest } from "../auth";

const router = Router();

router.use(authMiddleware);

// ==================== HELPER FUNCTIONS ====================

function getXpForLevelFormula(level: number): number {
  if (level <= 1) return 0;
  if (level <= 50) {
    const fallbackXp = [0,0,10,15,20,25,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200,210,220,230,240,250,260,270,280,290,300,300,300,300,300,300,300,300,300,300,300,300,300,300,300,300,300,300];
    return fallbackXp[level] || Math.max(10, level * 5);
  }
  return Math.round(300 + (level - 50) * 15);
}

function getTitleForLevelFormula(level: number): string {
  if (level <= 5) return "Rookie";
  if (level <= 10) return "Player";
  if (level <= 15) return "Competitor";
  if (level <= 20) return "Strategist";
  if (level <= 25) return "Champion";
  if (level <= 30) return "Legend";
  if (level <= 35) return "Elite";
  if (level <= 40) return "Master";
  if (level <= 45) return "Grandmaster";
  if (level <= 75) return "GOAT";
  if (level <= 100) return "GOAT II";
  if (level <= 150) return "GOAT III";
  if (level <= 200) return "Immortal";
  if (level <= 300) return "Immortal II";
  return "Transcendent";
}

interface ThresholdRow {
  level: number;
  xpRequired: number;
  title: string | null;
}

function calculateLevelFromXp(totalXp: number, dbThresholds: ThresholdRow[]): { level: number; xpUsedByPreviousLevels: number; xpForCurrentLevel: number } {
  let cumulativeXp = 0;
  let level = 1;

  for (const threshold of dbThresholds) {
    cumulativeXp += threshold.xpRequired;
    if (totalXp >= cumulativeXp) {
      level = threshold.level;
    } else {
      const xpUsed = cumulativeXp - threshold.xpRequired;
      return { level, xpUsedByPreviousLevels: xpUsed, xpForCurrentLevel: threshold.xpRequired };
    }
  }

  const lastSeededLevel = dbThresholds.length > 0 ? dbThresholds[dbThresholds.length - 1].level : 1;
  let currentLevel = lastSeededLevel;

  const MAX_SAFE_LEVEL = 10000;
  while (currentLevel < MAX_SAFE_LEVEL) {
    const nextLevelXp = getXpForLevelFormula(currentLevel + 1);
    if (nextLevelXp <= 0) {
      return { level: currentLevel, xpUsedByPreviousLevels: cumulativeXp, xpForCurrentLevel: Math.max(1, getXpForLevelFormula(currentLevel + 1)) };
    }
    if (totalXp >= cumulativeXp + nextLevelXp) {
      cumulativeXp += nextLevelXp;
      currentLevel++;
    } else {
      return { level: currentLevel, xpUsedByPreviousLevels: cumulativeXp, xpForCurrentLevel: nextLevelXp };
    }
  }
  return { level: currentLevel, xpUsedByPreviousLevels: cumulativeXp, xpForCurrentLevel: getXpForLevelFormula(currentLevel + 1) };
}

async function getXpForNextLevel(currentLevel: number): Promise<number> {
  const [threshold] = await db
    .select()
    .from(playerLevelThresholds)
    .where(eq(playerLevelThresholds.level, currentLevel + 1));
  
  if (threshold?.xpRequired) return threshold.xpRequired;
  return getXpForLevelFormula(currentLevel + 1);
}

async function getTitleForLevel(level: number): Promise<string> {
  const [threshold] = await db
    .select()
    .from(playerLevelThresholds)
    .where(eq(playerLevelThresholds.level, level));
  
  return threshold?.title || getTitleForLevelFormula(level);
}

async function getUnlockedFeaturesAtLevel(level: number): Promise<string[]> {
  const features = await db
    .select()
    .from(playerFeatureUnlocks)
    .where(and(
      eq(playerFeatureUnlocks.isActive, true),
      eq(playerFeatureUnlocks.requiredLevel, level)
    ));
  
  return features.map(f => f.featureKey);
}

async function checkAntiAbuse(
  playerId: string,
  actionSource: string,
  rule: any
): Promise<boolean> {
  // Check one-time actions
  if (rule.isOneTime) {
    const existing = await db
      .select()
      .from(playerXpEvents)
      .where(and(
        eq(playerXpEvents.playerId, playerId),
        eq(playerXpEvents.actionSource, actionSource)
      ))
      .limit(1);
    
    if (existing.length > 0) return false;
  }

  // Check cooldown
  if (rule.cooldownMinutes) {
    const cooldownTime = new Date(Date.now() - rule.cooldownMinutes * 60 * 1000);
    const recent = await db
      .select()
      .from(playerXpEvents)
      .where(and(
        eq(playerXpEvents.playerId, playerId),
        eq(playerXpEvents.actionSource, actionSource),
        gte(playerXpEvents.createdAt, cooldownTime)
      ))
      .limit(1);
    
    if (recent.length > 0) return false;
  }

  // Check daily cap
  if (rule.maxPerDay) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const todayCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(playerXpEvents)
      .where(and(
        eq(playerXpEvents.playerId, playerId),
        eq(playerXpEvents.actionSource, actionSource),
        gte(playerXpEvents.createdAt, startOfDay)
      ));
    
    if ((todayCount[0]?.count || 0) >= rule.maxPerDay) return false;
  }

  return true;
}

// ==================== XP AWARD ENDPOINT ====================

router.post("/award-xp", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId, actionSource, contextType, contextId } = req.body;

    if (!playerId || !actionSource) {
      return res.status(400).json({ error: "playerId and actionSource are required" });
    }

    // Get XP rule for this action
    const [rule] = await db
      .select()
      .from(playerLevelXpRules)
      .where(eq(playerLevelXpRules.actionSource, actionSource));

    if (!rule || !rule.isActive) {
      return res.status(400).json({ error: "Unknown or inactive action source" });
    }

    // Check anti-abuse rules
    const allowed = await checkAntiAbuse(playerId, actionSource, rule);
    if (!allowed) {
      return res.json({ 
        success: false, 
        message: "XP not awarded due to anti-abuse rules",
        xpAwarded: 0 
      });
    }

    // Get current player state
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId));

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    const currentLevel = player.level || 1;
    const currentXp = player.totalXp || 0;
    const xpToAward = rule.xpAmount;
    const newTotalXp = currentXp + xpToAward;

    const allThresholds = await db
      .select()
      .from(playerLevelThresholds)
      .orderBy(playerLevelThresholds.level);

    const { level: newLevel } = calculateLevelFromXp(newTotalXp, allThresholds);
    const triggeredLevelUp = newLevel > currentLevel;
    let featuresUnlocked: string[] = [];

    // Record XP event
    await db.insert(playerXpEvents).values({
      playerId,
      actionSource,
      xpAmount: xpToAward,
      contextType,
      contextId,
      levelAtEvent: currentLevel,
      xpBeforeEvent: currentXp,
      xpAfterEvent: newTotalXp,
      triggeredLevelUp,
      newLevel: triggeredLevelUp ? newLevel : null,
    });

    // Update player
    await db
      .update(players)
      .set({ 
        totalXp: newTotalXp,
        level: newLevel,
      })
      .where(eq(players.id, playerId));

    // Send XP gain notification
    sendXPGainNotification(playerId, xpToAward, rule.description || actionSource).catch(err =>
      console.error("Failed to send XP gain notification:", err)
    );

    // Handle level up
    if (triggeredLevelUp) {
      const newTitle = await getTitleForLevel(newLevel);
      featuresUnlocked = await getUnlockedFeaturesAtLevel(newLevel);

      // Create celebration record
      await db.insert(playerLevelUpCelebrations).values({
        playerId,
        fromLevel: currentLevel,
        toLevel: newLevel,
        newTitle,
        featuresUnlocked,
      });

      // Record feature unlock history
      for (const featureKey of featuresUnlocked) {
        await db.insert(playerFeatureUnlockHistory).values({
          playerId,
          featureKey,
          unlockedAtLevel: newLevel,
        }).onConflictDoNothing();
      }

      // Send level up push notification
      sendLevelUpNotification(playerId, newLevel, newTitle).catch(err =>
        console.error("Failed to send level up notification:", err)
      );
    }

    res.json({
      success: true,
      xpAwarded: xpToAward,
      previousXp: currentXp,
      newTotalXp,
      previousLevel: currentLevel,
      newLevel,
      triggeredLevelUp,
      featuresUnlocked,
    });
  } catch (error) {
    console.error("Error awarding XP:", error);
    res.status(500).json({ error: "Failed to award XP" });
  }
});

// ==================== PLAYER LEVEL STATUS ====================

router.get("/player/:playerId/status", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const user = req.user!;

    // IDOR check: player can only access own data; coaches/owners can access players in their academy
    const isOwnPlayer = user.playerId === playerId;
    const isCoachOrAdmin = ["coach", "academy_owner", "platform_owner", "admin"].includes(user.role);
    if (!isOwnPlayer && !isCoachOrAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId));

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    // Academy isolation for coaches/admins: player must be in the same academy
    if (isCoachOrAdmin && !isOwnPlayer && user.role !== "platform_owner" && player.academyId !== user.academyId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [playerUser] = await db.select({ email: users.email }).from(users).where(eq(users.playerId, playerId));
    if (isAppleReviewAccount(playerUser?.email)) {
      const allFeatures = await db.select().from(playerFeatureUnlocks).orderBy(playerFeatureUnlocks.requiredLevel);
      return res.json({
        level: 20,
        title: "Grand Champion",
        totalXp: 50000,
        xpInCurrentLevel: 0,
        xpNeededForNextLevel: 999999,
        progressPercent: 100,
        unlockedFeatures: allFeatures.map(f => f.featureKey),
        pendingCelebrations: [],
        pendingOnboardings: [],
      });
    }

    const totalXp = player.totalXp || 0;

    const allThresholds = await db
      .select()
      .from(playerLevelThresholds)
      .orderBy(playerLevelThresholds.level);

    const { level: calculatedLevel, xpUsedByPreviousLevels, xpForCurrentLevel } = calculateLevelFromXp(totalXp, allThresholds);
    const currentLevel = calculatedLevel;

    if (currentLevel !== (player.level || 1)) {
      await db.update(players).set({ level: currentLevel, updatedAt: new Date() }).where(eq(players.id, playerId));
    }

    const xpInCurrentLevel = totalXp - xpUsedByPreviousLevels;
    const xpNeededForNextLevel = xpForCurrentLevel;
    const currentTitle = await getTitleForLevel(currentLevel);

    // Get all unlocked features for this player
    const unlockedFeatures = await db
      .select()
      .from(playerFeatureUnlocks)
      .where(and(
        eq(playerFeatureUnlocks.isActive, true),
        sql`${playerFeatureUnlocks.requiredLevel} <= ${currentLevel}`
      ));

    // Get pending celebrations
    const pendingCelebrations = await db
      .select()
      .from(playerLevelUpCelebrations)
      .where(and(
        eq(playerLevelUpCelebrations.playerId, playerId),
        eq(playerLevelUpCelebrations.celebrationShown, false)
      ));

    // Get pending feature onboardings
    const pendingOnboardings = await db
      .select()
      .from(playerFeatureUnlockHistory)
      .where(and(
        eq(playerFeatureUnlockHistory.playerId, playerId),
        eq(playerFeatureUnlockHistory.onboardingShown, false)
      ));

    res.json({
      level: currentLevel,
      title: currentTitle,
      totalXp,
      xpInCurrentLevel: Math.max(0, xpInCurrentLevel),
      xpNeededForNextLevel,
      progressPercent: Math.min(100, Math.round((xpInCurrentLevel / xpNeededForNextLevel) * 100)),
      unlockedFeatures: unlockedFeatures.map(f => f.featureKey),
      pendingCelebrations,
      pendingOnboardings: pendingOnboardings.map(o => o.featureKey),
    });
  } catch (error) {
    console.error("Error getting player level status:", error);
    res.status(500).json({ error: "Failed to get player level status" });
  }
});

// ==================== MARK CELEBRATION SHOWN ====================

router.post("/player/:playerId/celebration/:celebrationId/shown", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId, celebrationId } = req.params;
    const user = req.user!;
    const isOwnPlayer = user.playerId === playerId;
    const isPlatformOwner = user.role === "platform_owner";
    const isCoachOrAdmin = ["coach", "academy_owner", "admin"].includes(user.role);

    if (!isOwnPlayer && !isPlatformOwner && !isCoachOrAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Academy isolation for coaches/admins
    if (isCoachOrAdmin && !isOwnPlayer) {
      const [targetPlayer] = await db
        .select({ academyId: players.academyId })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);
      if (!targetPlayer || targetPlayer.academyId !== user.academyId) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    await db
      .update(playerLevelUpCelebrations)
      .set({ 
        celebrationShown: true,
        celebrationShownAt: new Date(),
      })
      .where(and(
        eq(playerLevelUpCelebrations.id, celebrationId),
        eq(playerLevelUpCelebrations.playerId, playerId),
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking celebration shown:", error);
    res.status(500).json({ error: "Failed to mark celebration shown" });
  }
});

// ==================== MARK ONBOARDING SHOWN ====================

router.post("/player/:playerId/onboarding/:featureKey/shown", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId, featureKey } = req.params;
    const user = req.user!;
    const isOwnPlayer = user.playerId === playerId;
    const isPlatformOwner = user.role === "platform_owner";
    const isCoachOrAdmin = ["coach", "academy_owner", "admin"].includes(user.role);

    if (!isOwnPlayer && !isPlatformOwner && !isCoachOrAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Academy isolation for coaches/admins
    if (isCoachOrAdmin && !isOwnPlayer) {
      const [targetPlayer] = await db
        .select({ academyId: players.academyId })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);
      if (!targetPlayer || targetPlayer.academyId !== user.academyId) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    await db
      .update(playerFeatureUnlockHistory)
      .set({ 
        onboardingShown: true,
        onboardingShownAt: new Date(),
      })
      .where(and(
        eq(playerFeatureUnlockHistory.playerId, playerId),
        eq(playerFeatureUnlockHistory.featureKey, featureKey)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking onboarding shown:", error);
    res.status(500).json({ error: "Failed to mark onboarding shown" });
  }
});

// ==================== XP HISTORY ====================

router.get("/player/:playerId/xp-history", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const user = req.user!;
    const isOwnPlayer = user.playerId === playerId;
    const isPlatformOwner = user.role === "platform_owner";
    const isCoachOrAdmin = ["coach", "academy_owner", "admin"].includes(user.role);

    if (!isOwnPlayer && !isPlatformOwner && !isCoachOrAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Academy isolation for coaches/admins
    if (isCoachOrAdmin && !isOwnPlayer) {
      const [targetPlayer] = await db
        .select({ academyId: players.academyId })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);
      if (!targetPlayer || targetPlayer.academyId !== user.academyId) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const limit = parseInt(req.query.limit as string) || 50;

    const history = await db
      .select()
      .from(playerXpEvents)
      .where(eq(playerXpEvents.playerId, playerId))
      .orderBy(desc(playerXpEvents.createdAt))
      .limit(limit);

    res.json(history);
  } catch (error) {
    console.error("Error getting XP history:", error);
    res.status(500).json({ error: "Failed to get XP history" });
  }
});

// ==================== PLATFORM OWNER: LEVEL THRESHOLDS ====================

router.get("/config/thresholds", async (req: Request, res: Response) => {
  try {
    const thresholds = await db
      .select()
      .from(playerLevelThresholds)
      .orderBy(playerLevelThresholds.level);

    res.json(thresholds);
  } catch (error) {
    console.error("Error getting level thresholds:", error);
    res.status(500).json({ error: "Failed to get level thresholds" });
  }
});

router.put("/config/thresholds/:level", async (req: Request, res: Response) => {
  try {
    const level = parseInt(req.params.level);
    const { xpRequired, title, badgeUnlock, titleUnlock } = req.body;

    const [existing] = await db
      .select()
      .from(playerLevelThresholds)
      .where(eq(playerLevelThresholds.level, level));

    if (existing) {
      await db
        .update(playerLevelThresholds)
        .set({ 
          xpRequired,
          title,
          badgeUnlock,
          titleUnlock,
          updatedAt: new Date(),
        })
        .where(eq(playerLevelThresholds.level, level));
    } else {
      await db.insert(playerLevelThresholds).values({
        level,
        xpRequired,
        title,
        badgeUnlock,
        titleUnlock,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating level threshold:", error);
    res.status(500).json({ error: "Failed to update level threshold" });
  }
});

// ==================== PLATFORM OWNER: XP RULES ====================

router.get("/config/xp-rules", async (req: Request, res: Response) => {
  try {
    const rules = await db
      .select()
      .from(playerLevelXpRules)
      .orderBy(playerLevelXpRules.actionSource);

    res.json(rules);
  } catch (error) {
    console.error("Error getting XP rules:", error);
    res.status(500).json({ error: "Failed to get XP rules" });
  }
});

router.put("/config/xp-rules/:actionSource", async (req: Request, res: Response) => {
  try {
    const { actionSource } = req.params;
    const { xpAmount, description, isOneTime, cooldownMinutes, maxPerDay, isActive } = req.body;

    const [existing] = await db
      .select()
      .from(playerLevelXpRules)
      .where(eq(playerLevelXpRules.actionSource, actionSource));

    if (existing) {
      await db
        .update(playerLevelXpRules)
        .set({ 
          xpAmount,
          description,
          isOneTime,
          cooldownMinutes,
          maxPerDay,
          isActive,
          updatedAt: new Date(),
        })
        .where(eq(playerLevelXpRules.actionSource, actionSource));
    } else {
      await db.insert(playerLevelXpRules).values({
        actionSource,
        xpAmount,
        description,
        isOneTime,
        cooldownMinutes,
        maxPerDay,
        isActive,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating XP rule:", error);
    res.status(500).json({ error: "Failed to update XP rule" });
  }
});

// ==================== PLATFORM OWNER: FEATURE UNLOCKS ====================

router.get("/config/feature-unlocks", async (req: Request, res: Response) => {
  try {
    const features = await db
      .select()
      .from(playerFeatureUnlocks)
      .orderBy(playerFeatureUnlocks.requiredLevel);

    res.json(features);
  } catch (error) {
    console.error("Error getting feature unlocks:", error);
    res.status(500).json({ error: "Failed to get feature unlocks" });
  }
});

router.put("/config/feature-unlocks/:featureKey", async (req: Request, res: Response) => {
  try {
    const { featureKey } = req.params;
    const { 
      requiredLevel, 
      featureName, 
      featureDescription, 
      featureIcon,
      onboardingTitle,
      onboardingDescription,
      onboardingTips,
      isActive 
    } = req.body;

    const [existing] = await db
      .select()
      .from(playerFeatureUnlocks)
      .where(eq(playerFeatureUnlocks.featureKey, featureKey));

    if (existing) {
      await db
        .update(playerFeatureUnlocks)
        .set({ 
          requiredLevel,
          featureName,
          featureDescription,
          featureIcon,
          onboardingTitle,
          onboardingDescription,
          onboardingTips,
          isActive,
          updatedAt: new Date(),
        })
        .where(eq(playerFeatureUnlocks.featureKey, featureKey));
    } else {
      await db.insert(playerFeatureUnlocks).values({
        featureKey,
        requiredLevel,
        featureName,
        featureDescription,
        featureIcon,
        onboardingTitle,
        onboardingDescription,
        onboardingTips,
        isActive,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating feature unlock:", error);
    res.status(500).json({ error: "Failed to update feature unlock" });
  }
});

// ==================== SEED DEFAULT DATA ====================

router.post("/seed-defaults", async (req: Request, res: Response) => {
  try {
    // Seed level thresholds
    const defaultThresholds = [
      { level: 1, xpRequired: 0, title: "Rookie" },
      { level: 2, xpRequired: 10, title: "Rookie" },
      { level: 3, xpRequired: 15, title: "Rookie" },
      { level: 4, xpRequired: 20, title: "Rookie" },
      { level: 5, xpRequired: 25, title: "Rookie" },
      { level: 6, xpRequired: 30, title: "Player" },
      { level: 7, xpRequired: 35, title: "Player" },
      { level: 8, xpRequired: 40, title: "Player" },
      { level: 9, xpRequired: 50, title: "Player" },
      { level: 10, xpRequired: 55, title: "Player" },
      { level: 11, xpRequired: 60, title: "Competitor" },
      { level: 12, xpRequired: 65, title: "Competitor" },
      { level: 13, xpRequired: 70, title: "Competitor" },
      { level: 14, xpRequired: 80, title: "Competitor" },
      { level: 15, xpRequired: 85, title: "Competitor" },
      { level: 16, xpRequired: 90, title: "Strategist" },
      { level: 17, xpRequired: 95, title: "Strategist" },
      { level: 18, xpRequired: 100, title: "Strategist" },
      { level: 19, xpRequired: 110, title: "Strategist" },
      { level: 20, xpRequired: 115, title: "Strategist" },
      { level: 21, xpRequired: 120, title: "Champion" },
      { level: 22, xpRequired: 125, title: "Champion" },
      { level: 23, xpRequired: 130, title: "Champion" },
      { level: 24, xpRequired: 140, title: "Champion" },
      { level: 25, xpRequired: 145, title: "Champion" },
      { level: 26, xpRequired: 150, title: "Legend" },
      { level: 27, xpRequired: 155, title: "Legend" },
      { level: 28, xpRequired: 160, title: "Legend" },
      { level: 29, xpRequired: 170, title: "Legend" },
      { level: 30, xpRequired: 175, title: "Legend" },
      { level: 31, xpRequired: 180, title: "Elite" },
      { level: 32, xpRequired: 185, title: "Elite" },
      { level: 33, xpRequired: 190, title: "Elite" },
      { level: 34, xpRequired: 200, title: "Elite" },
      { level: 35, xpRequired: 205, title: "Elite" },
      { level: 36, xpRequired: 210, title: "Master" },
      { level: 37, xpRequired: 215, title: "Master" },
      { level: 38, xpRequired: 220, title: "Master" },
      { level: 39, xpRequired: 230, title: "Master" },
      { level: 40, xpRequired: 235, title: "Master" },
      { level: 41, xpRequired: 240, title: "Grandmaster" },
      { level: 42, xpRequired: 245, title: "Grandmaster" },
      { level: 43, xpRequired: 250, title: "Grandmaster" },
      { level: 44, xpRequired: 260, title: "Grandmaster" },
      { level: 45, xpRequired: 265, title: "Grandmaster" },
      { level: 46, xpRequired: 270, title: "GOAT" },
      { level: 47, xpRequired: 275, title: "GOAT" },
      { level: 48, xpRequired: 280, title: "GOAT" },
      { level: 49, xpRequired: 290, title: "GOAT" },
      { level: 50, xpRequired: 300, title: "GOAT" },
    ];

    for (const threshold of defaultThresholds) {
      await db.insert(playerLevelThresholds).values(threshold)
        .onConflictDoUpdate({
          target: playerLevelThresholds.level,
          set: { xpRequired: threshold.xpRequired, title: threshold.title },
        });
    }

    // Seed XP rules
    const defaultXpRules = [
      { actionSource: "session_attendance", xpAmount: 10, description: "Attend a training session" },
      { actionSource: "feedback_received", xpAmount: 8, description: "Receive feedback from coach" },
      { actionSource: "feedback_read", xpAmount: 5, description: "Read coach feedback" },
      { actionSource: "match_played", xpAmount: 15, description: "Play a match" },
      { actionSource: "match_evaluation", xpAmount: 10, description: "Complete post-match evaluation" },
      { actionSource: "quest_daily", xpAmount: 5, description: "Complete a daily quest" },
      { actionSource: "quest_weekly", xpAmount: 15, description: "Complete a weekly quest" },
      { actionSource: "streak_bonus", xpAmount: 20, description: "3-session attendance streak", maxPerDay: 1 },
      { actionSource: "profile_complete", xpAmount: 15, description: "Complete your profile", isOneTime: true },
      { actionSource: "first_community_post", xpAmount: 10, description: "Create your first community post", isOneTime: true },
      { actionSource: "first_friend_added", xpAmount: 5, description: "Add your first friend", isOneTime: true },
      { actionSource: "level_up_bonus", xpAmount: 25, description: "Bonus XP for leveling up" },
      { actionSource: "badge_earned", xpAmount: 20, description: "Earn an achievement badge" },
      { actionSource: "skill_validation", xpAmount: 15, description: "Coach validates skill improvement" },
      { actionSource: "court_booking", xpAmount: 5, description: "Book a court" },
      { actionSource: "lesson_booking", xpAmount: 5, description: "Book a lesson" },
    ];

    for (const rule of defaultXpRules) {
      await db.insert(playerLevelXpRules).values(rule).onConflictDoNothing();
    }

    // Seed feature unlocks
    interface DefaultFeatureUnlock {
      featureKey: string;
      requiredLevel: number;
      featureName: string;
      featureIcon?: string;
      featureDescription?: string;
      onboardingTitle?: string;
      onboardingDescription?: string;
    }
    const defaultFeatureUnlocks: DefaultFeatureUnlock[] = [
      // Level 1 - Core features (always available)
      { featureKey: "home_dashboard", requiredLevel: 1, featureName: "Home Dashboard", featureIcon: "home" },
      { featureKey: "profile", requiredLevel: 1, featureName: "Profile", featureIcon: "person" },
      { featureKey: "settings", requiredLevel: 1, featureName: "Settings", featureIcon: "settings" },
      { featureKey: "notifications", requiredLevel: 1, featureName: "Notifications", featureIcon: "notifications" },
      { featureKey: "help", requiredLevel: 1, featureName: "Help", featureIcon: "help-circle" },
      { featureKey: "coach_chat", requiredLevel: 1, featureName: "Chat with Coach", featureIcon: "chatbubble" },
      { featureKey: "schedule", requiredLevel: 1, featureName: "Schedule", featureIcon: "calendar" },
      // Level 1-2 - Critical for academy revenue
      { featureKey: "credit_store", requiredLevel: 1, featureName: "Credit Store", featureIcon: "card", featureDescription: "Buy training credits" },
      { featureKey: "lesson_booking", requiredLevel: 1, featureName: "Book Lessons", featureIcon: "calendar-outline", featureDescription: "Book training sessions" },
      { featureKey: "my_lesson_requests", requiredLevel: 1, featureName: "My Lesson Requests", featureIcon: "list" },
      { featureKey: "parent_dashboard", requiredLevel: 1, featureName: "Parent Dashboard", featureIcon: "people" },
      { featureKey: "invoices", requiredLevel: 1, featureName: "Invoices", featureIcon: "receipt" },
      { featureKey: "payments", requiredLevel: 1, featureName: "Payments", featureIcon: "wallet" },
      // Level 2 - Engagement
      { featureKey: "quests", requiredLevel: 2, featureName: "Quests", featureIcon: "trophy", onboardingTitle: "Daily Quests Unlocked!", onboardingDescription: "Complete quests to earn XP and rewards" },
      { featureKey: "coach_profile_view", requiredLevel: 2, featureName: "Coach Profile", featureIcon: "person-circle" },
      // Level 3 - Progress tracking
      { featureKey: "training_history", requiredLevel: 3, featureName: "Training History", featureIcon: "time", onboardingTitle: "Training History Unlocked!", onboardingDescription: "View all your past training sessions" },
      { featureKey: "skill_journey", requiredLevel: 3, featureName: "Skill Journey", featureIcon: "trending-up" },
      // Level 4 - Social basics
      { featureKey: "community_feed", requiredLevel: 4, featureName: "Community", featureIcon: "people", onboardingTitle: "Community Unlocked!", onboardingDescription: "Connect with other players in your academy" },
      // Level 5 - Progress & Analysis
      { featureKey: "progress_overview", requiredLevel: 5, featureName: "Progress Overview", featureIcon: "stats-chart", onboardingTitle: "Progress Overview Unlocked!", onboardingDescription: "Track your improvement across all skill areas" },
      { featureKey: "skill_details", requiredLevel: 5, featureName: "Skill Details", featureIcon: "analytics" },
      { featureKey: "glow_leaderboard", requiredLevel: 5, featureName: "Leaderboard", featureIcon: "podium", onboardingTitle: "Leaderboard Unlocked!", onboardingDescription: "See how you rank against other players" },
      { featureKey: "collection", requiredLevel: 1, featureName: "Collection", featureIcon: "ribbon", featureDescription: "View your badges and titles" },
      // Level 6 - Social expansion
      { featureKey: "player_finder", requiredLevel: 6, featureName: "Player Finder", featureIcon: "search", onboardingTitle: "Player Finder Unlocked!", onboardingDescription: "Find other players to train and compete with" },
      { featureKey: "friends_list", requiredLevel: 6, featureName: "Friends", featureIcon: "people-circle" },
      { featureKey: "public_profile", requiredLevel: 6, featureName: "Public Profile", featureIcon: "id-card" },
      // Level 7 - Match Intelligence
      { featureKey: "match_preparation", requiredLevel: 7, featureName: "Match Prep", featureIcon: "clipboard", onboardingTitle: "Match Preparation Unlocked!", onboardingDescription: "Prepare tactically for your matches" },
      { featureKey: "groups", requiredLevel: 7, featureName: "Groups", featureIcon: "people-outline" },
      // Level 8 - Match Analysis
      { featureKey: "match_analysis", requiredLevel: 8, featureName: "Match Analysis", featureIcon: "analytics", onboardingTitle: "Match Analysis Unlocked!", onboardingDescription: "Deep dive into your match performance" },
      // Level 9 - Marketplace
      { featureKey: "academy_shop", requiredLevel: 9, featureName: "Academy Shop", featureIcon: "storefront", onboardingTitle: "Shop Unlocked!", onboardingDescription: "Browse products and services from your academy" },
      // Level 1 - Court booking (available to all players)
      { featureKey: "court_booking", requiredLevel: 1, featureName: "Court Booking", featureIcon: "tennisball", onboardingTitle: "Court Booking Unlocked!", onboardingDescription: "Book courts for practice sessions" },
      { featureKey: "my_court_bookings", requiredLevel: 1, featureName: "My Bookings", featureIcon: "calendar-number" },
      // Level 12 - Marketplace
      { featureKey: "marketplace", requiredLevel: 12, featureName: "Marketplace", featureIcon: "pricetag", onboardingTitle: "Marketplace Unlocked!", onboardingDescription: "Buy and sell tennis equipment" },
      { featureKey: "my_listings", requiredLevel: 12, featureName: "My Listings", featureIcon: "list-circle" },
      // Level 15 - Advanced
      { featureKey: "academy_browser", requiredLevel: 15, featureName: "Academy Browser", featureIcon: "business", onboardingTitle: "Academy Browser Unlocked!", onboardingDescription: "Explore other academies" },
      { featureKey: "coach_directory", requiredLevel: 15, featureName: "Coach Directory", featureIcon: "people-sharp" },
      // Level 1 - Progress & Feedback features (always available)
      { featureKey: "skill_evidence", requiredLevel: 1, featureName: "Skill Evidence", featureIcon: "ribbon", featureDescription: "View evidence of your skill progress" },
      { featureKey: "xp_history", requiredLevel: 1, featureName: "XP History", featureIcon: "time", featureDescription: "View your XP earning history" },
      { featureKey: "level_up_history", requiredLevel: 1, featureName: "Level-Up History", featureIcon: "trending-up", featureDescription: "View your level progression history" },
      { featureKey: "trial_gates", requiredLevel: 1, featureName: "Trial Gates", featureIcon: "flag", featureDescription: "View your trial gate achievements" },
    ];

    for (const feature of defaultFeatureUnlocks) {
      await db.insert(playerFeatureUnlocks).values(feature).onConflictDoUpdate({
        target: playerFeatureUnlocks.featureKey,
        set: {
          requiredLevel: feature.requiredLevel,
          featureName: feature.featureName,
          featureDescription: feature.featureDescription ?? null,
          featureIcon: feature.featureIcon ?? null,
          onboardingTitle: feature.onboardingTitle ?? null,
          onboardingDescription: feature.onboardingDescription ?? null,
        },
      });
    }

    res.json({ success: true, message: "Default data seeded successfully" });
  } catch (error) {
    console.error("Error seeding defaults:", error);
    res.status(500).json({ error: "Failed to seed defaults" });
  }
});

export default router;
