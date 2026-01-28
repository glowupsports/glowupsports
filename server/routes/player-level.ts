import { Router, Request, Response } from "express";
import { db } from "../db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import {
  players,
  playerLevelThresholds,
  playerLevelXpRules,
  playerFeatureUnlocks,
  playerXpEvents,
  playerLevelUpCelebrations,
  playerFeatureUnlockHistory,
} from "@shared/schema";
import { sendLevelUpNotification, sendXPGainNotification } from "../pushNotifications";

const router = Router();

// ==================== HELPER FUNCTIONS ====================

async function getXpForNextLevel(currentLevel: number): Promise<number> {
  const [threshold] = await db
    .select()
    .from(playerLevelThresholds)
    .where(eq(playerLevelThresholds.level, currentLevel + 1));
  
  return threshold?.xpRequired || 100; // Default 100 XP if not configured
}

async function getTitleForLevel(level: number): Promise<string> {
  const [threshold] = await db
    .select()
    .from(playerLevelThresholds)
    .where(eq(playerLevelThresholds.level, level));
  
  return threshold?.title || "Rookie";
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

router.post("/award-xp", async (req: Request, res: Response) => {
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

    // Calculate XP within current level
    let xpInCurrentLevel = currentXp;
    let tempLevel = 1;
    
    // Calculate how much XP is "used" by previous levels
    const allThresholds = await db
      .select()
      .from(playerLevelThresholds)
      .orderBy(playerLevelThresholds.level);
    
    let xpUsedByPreviousLevels = 0;
    for (const threshold of allThresholds) {
      if (threshold.level <= currentLevel) {
        xpUsedByPreviousLevels += threshold.xpRequired;
      }
    }
    
    // XP progress in current level
    const xpProgressInLevel = currentXp - xpUsedByPreviousLevels + (allThresholds.find(t => t.level === currentLevel)?.xpRequired || 0);
    
    // Check for level up
    const xpNeeded = await getXpForNextLevel(currentLevel);
    let newLevel = currentLevel;
    let triggeredLevelUp = false;
    let featuresUnlocked: string[] = [];

    // Simple level calculation: check if we crossed threshold
    let cumulativeXpNeeded = 0;
    for (const threshold of allThresholds) {
      cumulativeXpNeeded += threshold.xpRequired;
      if (newTotalXp >= cumulativeXpNeeded && threshold.level > newLevel) {
        newLevel = threshold.level;
        triggeredLevelUp = true;
      }
    }

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
    sendXPGainNotification(playerId, xpToAward, rule.displayName || actionSource).catch(err =>
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

router.get("/player/:playerId/status", async (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;

    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId));

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    const currentLevel = player.level || 1;
    const totalXp = player.totalXp || 0;

    // Get all thresholds up to current level
    const allThresholds = await db
      .select()
      .from(playerLevelThresholds)
      .orderBy(playerLevelThresholds.level);

    // Calculate XP used by previous levels (cumulative)
    let xpForPreviousLevels = 0;
    for (const threshold of allThresholds) {
      if (threshold.level < currentLevel) {
        xpForPreviousLevels += threshold.xpRequired;
      }
    }

    // Current progress in this level
    const xpInCurrentLevel = totalXp - xpForPreviousLevels;
    const xpNeededForNextLevel = await getXpForNextLevel(currentLevel);
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

router.post("/player/:playerId/celebration/:celebrationId/shown", async (req: Request, res: Response) => {
  try {
    const { celebrationId } = req.params;

    await db
      .update(playerLevelUpCelebrations)
      .set({ 
        celebrationShown: true,
        celebrationShownAt: new Date(),
      })
      .where(eq(playerLevelUpCelebrations.id, celebrationId));

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking celebration shown:", error);
    res.status(500).json({ error: "Failed to mark celebration shown" });
  }
});

// ==================== MARK ONBOARDING SHOWN ====================

router.post("/player/:playerId/onboarding/:featureKey/shown", async (req: Request, res: Response) => {
  try {
    const { playerId, featureKey } = req.params;

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

router.get("/player/:playerId/xp-history", async (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
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
      { level: 2, xpRequired: 50, title: "Rookie" },
      { level: 3, xpRequired: 75, title: "Rookie" },
      { level: 4, xpRequired: 100, title: "Player" },
      { level: 5, xpRequired: 125, title: "Player" },
      { level: 6, xpRequired: 150, title: "Player" },
      { level: 7, xpRequired: 180, title: "Competitor" },
      { level: 8, xpRequired: 220, title: "Competitor" },
      { level: 9, xpRequired: 260, title: "Competitor" },
      { level: 10, xpRequired: 300, title: "Strategist" },
      { level: 11, xpRequired: 350, title: "Strategist" },
      { level: 12, xpRequired: 400, title: "Strategist" },
      { level: 13, xpRequired: 500, title: "Champion" },
      { level: 14, xpRequired: 600, title: "Champion" },
      { level: 15, xpRequired: 700, title: "Champion" },
      { level: 16, xpRequired: 850, title: "Legend" },
      { level: 17, xpRequired: 1000, title: "Legend" },
      { level: 18, xpRequired: 1150, title: "Legend" },
      { level: 19, xpRequired: 1300, title: "Elite" },
      { level: 20, xpRequired: 1500, title: "Elite" },
    ];

    for (const threshold of defaultThresholds) {
      await db.insert(playerLevelThresholds).values(threshold).onConflictDoNothing();
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
    const defaultFeatureUnlocks = [
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
      // Level 10 - Court booking
      { featureKey: "court_booking", requiredLevel: 10, featureName: "Court Booking", featureIcon: "tennisball", onboardingTitle: "Court Booking Unlocked!", onboardingDescription: "Book courts for practice sessions" },
      { featureKey: "my_court_bookings", requiredLevel: 10, featureName: "My Bookings", featureIcon: "calendar-number" },
      // Level 12 - Marketplace
      { featureKey: "marketplace", requiredLevel: 12, featureName: "Marketplace", featureIcon: "pricetag", onboardingTitle: "Marketplace Unlocked!", onboardingDescription: "Buy and sell tennis equipment" },
      { featureKey: "my_listings", requiredLevel: 12, featureName: "My Listings", featureIcon: "list-circle" },
      // Level 15 - Advanced
      { featureKey: "academy_browser", requiredLevel: 15, featureName: "Academy Browser", featureIcon: "business", onboardingTitle: "Academy Browser Unlocked!", onboardingDescription: "Explore other academies" },
      { featureKey: "coach_directory", requiredLevel: 15, featureName: "Coach Directory", featureIcon: "people-sharp" },
    ];

    for (const feature of defaultFeatureUnlocks) {
      await db.insert(playerFeatureUnlocks).values(feature).onConflictDoNothing();
    }

    res.json({ success: true, message: "Default data seeded successfully" });
  } catch (error) {
    console.error("Error seeding defaults:", error);
    res.status(500).json({ error: "Failed to seed defaults" });
  }
});

export default router;
