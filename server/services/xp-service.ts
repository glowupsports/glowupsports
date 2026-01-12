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

export interface XPAwardResult {
  success: boolean;
  message: string;
  xpAwarded: number;
  newTotalXp: number;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
  featuresUnlocked: string[];
  xpProgressInLevel: number;
  xpNeededForNextLevel: number;
}

async function getXpForNextLevel(currentLevel: number): Promise<number> {
  const [threshold] = await db
    .select()
    .from(playerLevelThresholds)
    .where(eq(playerLevelThresholds.level, currentLevel + 1));
  
  return threshold?.xpRequired || 100;
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

export async function awardXP(
  playerId: string,
  actionSource: string,
  contextType?: string,
  contextId?: string
): Promise<XPAwardResult> {
  const [rule] = await db
    .select()
    .from(playerLevelXpRules)
    .where(eq(playerLevelXpRules.actionSource, actionSource));

  if (!rule || !rule.isActive) {
    return {
      success: false,
      message: "Unknown or inactive action source",
      xpAwarded: 0,
      newTotalXp: 0,
      previousLevel: 1,
      newLevel: 1,
      leveledUp: false,
      featuresUnlocked: [],
      xpProgressInLevel: 0,
      xpNeededForNextLevel: 50,
    };
  }

  const allowed = await checkAntiAbuse(playerId, actionSource, rule);
  if (!allowed) {
    const [player] = await db.select().from(players).where(eq(players.id, playerId));
    const currentLevel = player?.level || 1;
    const xpNeeded = await getXpForNextLevel(currentLevel);
    
    return {
      success: false,
      message: "XP not awarded due to anti-abuse rules",
      xpAwarded: 0,
      newTotalXp: player?.totalXp || 0,
      previousLevel: currentLevel,
      newLevel: currentLevel,
      leveledUp: false,
      featuresUnlocked: [],
      xpProgressInLevel: 0,
      xpNeededForNextLevel: xpNeeded,
    };
  }

  const [player] = await db.select().from(players).where(eq(players.id, playerId));

  if (!player) {
    return {
      success: false,
      message: "Player not found",
      xpAwarded: 0,
      newTotalXp: 0,
      previousLevel: 1,
      newLevel: 1,
      leveledUp: false,
      featuresUnlocked: [],
      xpProgressInLevel: 0,
      xpNeededForNextLevel: 50,
    };
  }

  const currentLevel = player.level || 1;
  const currentXp = player.totalXp || 0;
  const xpToAward = rule.xpAmount;
  const newTotalXp = currentXp + xpToAward;

  const allThresholds = await db
    .select()
    .from(playerLevelThresholds)
    .orderBy(playerLevelThresholds.level);

  let newLevel = 1;
  let cumulativeXp = 0;
  for (const threshold of allThresholds) {
    cumulativeXp += threshold.xpRequired;
    if (newTotalXp >= cumulativeXp) {
      newLevel = threshold.level;
    } else {
      break;
    }
  }

  const leveledUp = newLevel > currentLevel;
  let featuresUnlocked: string[] = [];

  if (leveledUp) {
    for (let level = currentLevel + 1; level <= newLevel; level++) {
      const levelFeatures = await getUnlockedFeaturesAtLevel(level);
      featuresUnlocked = [...featuresUnlocked, ...levelFeatures];
      
      const title = await getTitleForLevel(level);
      const [threshold] = await db
        .select()
        .from(playerLevelThresholds)
        .where(eq(playerLevelThresholds.level, level));
      
      await db.insert(playerLevelUpCelebrations).values({
        playerId,
        level,
        title,
        xpReward: 0,
        badgeUnlock: threshold?.badgeUnlock || null,
        titleUnlock: threshold?.titleUnlock || null,
        featuresUnlocked: levelFeatures,
        isCelebrated: false,
      });

      for (const featureKey of levelFeatures) {
        await db.insert(playerFeatureUnlockHistory).values({
          playerId,
          featureKey,
          levelAtUnlock: level,
          isOnboardingCompleted: false,
        });
      }
    }
  }

  await db.insert(playerXpEvents).values({
    playerId,
    actionSource,
    xpAmount: xpToAward,
    contextType: contextType || null,
    contextId: contextId || null,
    levelAtTime: currentLevel,
  });

  await db.update(players).set({
    totalXp: newTotalXp,
    level: newLevel,
    updatedAt: new Date(),
  }).where(eq(players.id, playerId));

  let xpUsedByCompletedLevels = 0;
  for (const threshold of allThresholds) {
    if (threshold.level <= newLevel) {
      xpUsedByCompletedLevels += threshold.xpRequired;
    }
  }
  const xpProgressInLevel = newTotalXp - xpUsedByCompletedLevels;
  const xpNeededForNextLevel = await getXpForNextLevel(newLevel);

  return {
    success: true,
    message: leveledUp ? `Level up! Now level ${newLevel}!` : "XP awarded!",
    xpAwarded: xpToAward,
    newTotalXp,
    previousLevel: currentLevel,
    newLevel,
    leveledUp,
    featuresUnlocked,
    xpProgressInLevel: Math.max(0, xpProgressInLevel),
    xpNeededForNextLevel,
  };
}

export async function getPlayerLevelStatus(playerId: string) {
  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  
  if (!player) {
    return null;
  }

  const currentLevel = player.level || 1;
  const totalXp = player.totalXp || 0;

  const allThresholds = await db
    .select()
    .from(playerLevelThresholds)
    .orderBy(playerLevelThresholds.level);

  let xpUsedByCompletedLevels = 0;
  for (const threshold of allThresholds) {
    if (threshold.level <= currentLevel) {
      xpUsedByCompletedLevels += threshold.xpRequired;
    }
  }

  const xpProgressInLevel = totalXp - xpUsedByCompletedLevels;
  const xpNeededForNextLevel = await getXpForNextLevel(currentLevel);
  const title = await getTitleForLevel(currentLevel);

  const unlockedFeatures = await db
    .select()
    .from(playerFeatureUnlocks)
    .where(and(
      eq(playerFeatureUnlocks.isActive, true),
    ));

  const playerUnlockedFeatures = unlockedFeatures
    .filter(f => f.requiredLevel <= currentLevel)
    .map(f => f.featureKey);

  const pendingCelebrations = await db
    .select()
    .from(playerLevelUpCelebrations)
    .where(and(
      eq(playerLevelUpCelebrations.playerId, playerId),
      eq(playerLevelUpCelebrations.isCelebrated, false)
    ))
    .orderBy(desc(playerLevelUpCelebrations.createdAt));

  return {
    playerId,
    level: currentLevel,
    title,
    totalXp,
    xpProgressInLevel: Math.max(0, xpProgressInLevel),
    xpNeededForNextLevel,
    progressPercent: xpNeededForNextLevel > 0 ? Math.min(100, (xpProgressInLevel / xpNeededForNextLevel) * 100) : 100,
    unlockedFeatures: playerUnlockedFeatures,
    pendingCelebrations,
  };
}

export async function markCelebrationComplete(celebrationId: string): Promise<boolean> {
  await db.update(playerLevelUpCelebrations).set({
    isCelebrated: true,
    celebratedAt: new Date(),
  }).where(eq(playerLevelUpCelebrations.id, celebrationId));
  
  return true;
}

export async function checkFeatureAccess(playerId: string, featureKey: string): Promise<boolean> {
  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) return false;

  const [feature] = await db
    .select()
    .from(playerFeatureUnlocks)
    .where(and(
      eq(playerFeatureUnlocks.featureKey, featureKey),
      eq(playerFeatureUnlocks.isActive, true)
    ));

  if (!feature) return true;
  
  return (player.level || 1) >= feature.requiredLevel;
}
