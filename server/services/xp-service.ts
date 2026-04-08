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

  // Per-context deduplication: if a contextId is provided (e.g. sessionId), ensure XP
  // has not already been awarded for this exact player + action + context combination.
  if (contextId) {
    const alreadyAwarded = await db
      .select()
      .from(playerXpEvents)
      .where(and(
        eq(playerXpEvents.playerId, playerId),
        eq(playerXpEvents.actionSource, actionSource),
        eq(playerXpEvents.contextId, contextId)
      ))
      .limit(1);

    if (alreadyAwarded.length > 0) {
      const [player] = await db.select().from(players).where(eq(players.id, playerId));
      const currentLevel = player?.level || 1;
      const xpNeeded = await getXpForNextLevel(currentLevel);
      return {
        success: false,
        message: "XP already awarded for this context",
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

  const { level: newLevel } = calculateLevelFromXp(newTotalXp, allThresholds);
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
        celebrationShown: false,
      });

      for (const featureKey of levelFeatures) {
        await db.insert(playerFeatureUnlockHistory).values({
          playerId,
          featureKey,
          unlockedAtLevel: level,
          onboardingShown: false,
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

  const { xpUsedByPreviousLevels: xpUsedByCompletedLevels, xpForCurrentLevel: xpNeededForNextLevel } = calculateLevelFromXp(newTotalXp, allThresholds);
  const xpProgressInLevel = newTotalXp - xpUsedByCompletedLevels;

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

  const totalXp = player.totalXp || 0;

  const allThresholds = await db
    .select()
    .from(playerLevelThresholds)
    .orderBy(playerLevelThresholds.level);

  const { level: currentLevel, xpUsedByPreviousLevels, xpForCurrentLevel } = calculateLevelFromXp(totalXp, allThresholds);

  if (currentLevel !== (player.level || 1)) {
    await db.update(players).set({ level: currentLevel, updatedAt: new Date() }).where(eq(players.id, playerId));
  }

  const xpProgressInLevel = totalXp - xpUsedByPreviousLevels;
  const xpNeededForNextLevel = xpForCurrentLevel;
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
      eq(playerLevelUpCelebrations.celebrationShown, false)
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
    celebrationShown: true,
    celebrationShownAt: new Date(),
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
