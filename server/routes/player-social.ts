import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { db } from "../db";
import { storage } from "../storage";
import { awardXP } from "../services/xp-service";
import {
  questTemplates as questTemplatesTable,
  playerQuests as playerQuestsTable,
  dailyQuestSlots as dailyQuestSlotsTable,
  playerStreaks as playerStreaksTable,
  badges as badgesTable,
  playerBadges as playerBadgesTable,
  titles as titlesTable,
  playerTitles as playerTitlesTable,
  playerConnections,
  spotlightNominations,
  spotlightWeeklyWinners,
  spotlightMonthlyWinners,
  levelUpEvents,
  playerXpEvents,
  ballLevels,
  playerNotifications,
  players,
  sessions,
  sessionPlayers,
  coachingSeries,
  creditTransactions,
  packages,
  coaches,
  users,
  openToPlay as openToPlayTable,
  posts as postsTable,
  seriesPlayers,
  academies,
  contentReports as contentReportsTable,
  playerBlocks as playerBlocksTable,
  questChainBonusClaims as questChainBonusClaimsTable,
} from "@shared/schema";
import { eq, and, or, desc, asc, sql, gte, inArray, ne, isNull, count, lte, ilike, not } from "drizzle-orm";
import { HIDDEN_PLAYER_IDS } from "../config/hiddenPlayers";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  requireFeatureUnlock,
  type JWTPayload,
} from "../auth";
import { sendBadgeEarnedNotification, sendFriendRequestNotification, sendPushNotification, getPlayerPushTokens } from "../pushNotifications";
import { sendEmail, sendDeleteAccountRequestEmail } from "../emailService";
import { fireQuestEvent } from "../services/quest-events";
import { qualifiesForPersonalisedQuests, pickPersonalisedQuests } from "../services/ai-progress-engine";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { adminRepairLimiter } from "../rateLimiter";

const CATEGORY_REASONS: Record<string, string[]> = {
  training: [
    "Your training attendance has room to grow — consistent sessions build lasting skill.",
    "Regular court time is the fastest path to improvement at your stage.",
    "Building session consistency now will compound into major gains over the season.",
  ],
  social: [
    "Engaging with the community accelerates your motivation and accountability.",
    "Connecting with fellow players keeps your love for the game strong.",
    "Social activity in the academy reinforces your competitive mindset.",
  ],
  performance: [
    "Match experience is your next frontier — every game teaches something new.",
    "Your game data shows you're ready to test yourself in competitive play.",
    "Logging match results helps your coach tailor training to your real game.",
  ],
  consistency: [
    "Daily check-ins build the habit loop that champions rely on.",
    "Showing up consistently is the one habit that predicts long-term success.",
    "Your consistency streak is a key predictor of skill progression speed.",
  ],
  mental: [
    "Mental resilience is the pillar that ties all your other skills together.",
    "Strengthening your mental game will unlock the next level of your performance.",
    "Focus and composure on court separate good players from great ones.",
  ],
};

function getQuestReason(category: string): string {
  const reasons = CATEGORY_REASONS[category] ?? CATEGORY_REASONS.training;
  return reasons[Math.floor(Math.random() * reasons.length)];
}

function getChainBonusPeriodKey(type: "daily" | "weekly" | "monthly"): string {
  const now = new Date();
  if (type === "daily") {
    return now.toISOString().split('T')[0]; // "YYYY-MM-DD"
  }
  if (type === "monthly") {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; // "YYYY-MM"
  }
  // Weekly: ISO week number
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`; // "YYYY-WNN"
}

const router = Router();

interface AuthRequest extends Request {
  user?: JWTPayload;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

function requirePlayerOrOwner(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.user.role === "platform_owner" || req.user.role === "academy_owner" || req.user.role === "owner" || req.user.role === "admin") {
    next();
    return;
  }
  if (req.user.role === "coach" && req.user.coachId) {
    next();
    return;
  }
  if (req.user.role === "player") {
    next();
    return;
  }
  res.status(403).json({ error: "Player account required" });
}

  // ==================== QUEST SYSTEM API ====================

  // Get player's active quests (daily + weekly)
router.get("/api/quests", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      const today = new Date().toISOString().split('T')[0];
      
      const now = new Date();
      const activeQuests = await db.select({
        quest: playerQuestsTable,
        template: questTemplatesTable,
      })
      .from(playerQuestsTable)
      .innerJoin(questTemplatesTable, eq(playerQuestsTable.questTemplateId, questTemplatesTable.id))
      .where(and(
        eq(playerQuestsTable.playerId, playerId),
        inArray(playerQuestsTable.status, ["active", "completed", "claimed"]),
        or(
          isNull(playerQuestsTable.expiresAt),
          gte(playerQuestsTable.expiresAt, now)
        )
      ))
      .orderBy(asc(questTemplatesTable.order));
      
      const [dailySlot] = await db.select()
        .from(dailyQuestSlotsTable)
        .where(and(
          eq(dailyQuestSlotsTable.playerId, playerId),
          eq(dailyQuestSlotsTable.slotDate, today)
        ));

      // Fetch any chain bonus claims for the current period across all types
      const weeklyPeriodKey = getChainBonusPeriodKey("weekly");
      const monthlyPeriodKey = getChainBonusPeriodKey("monthly");
      const chainBonusClaims = await db.select()
        .from(questChainBonusClaimsTable)
        .where(and(
          eq(questChainBonusClaimsTable.playerId, playerId),
          inArray(questChainBonusClaimsTable.periodKey, [today, weeklyPeriodKey, monthlyPeriodKey])
        ));
      const claimedTypes = new Set(chainBonusClaims.map(c => c.questType));
      
      const [streak] = await db.select()
        .from(playerStreaksTable)
        .where(eq(playerStreaksTable.playerId, playerId));
      
      const dailyQuests = activeQuests.filter(q => q.template.questType === "daily");
      const weeklyQuests = activeQuests.filter(q => q.template.questType === "weekly");
      const monthlyQuests = activeQuests.filter(q => q.template.questType === "monthly");
      
      const mapQuest = (q: typeof activeQuests[0]) => ({
        id: q.quest.id,
        name: q.template.name,
        description: q.template.description,
        iconName: q.template.iconName,
        iconColor: q.template.iconColor,
        difficulty: q.template.difficulty,
        category: q.template.category,
        currentProgress: q.quest.currentProgress || 0,
        targetProgress: q.quest.targetProgress,
        status: q.quest.status,
        xpReward: q.quest.xpReward || q.template.xpReward,
        currencyReward: q.quest.currencyReward || q.template.currencyReward,
        expiresAt: q.quest.expiresAt,
        evidenceUrl: q.quest.evidenceUrl,
        evidenceType: q.quest.evidenceType,
        personalisedBy: q.quest.personalisedBy || null,
        aiReason: q.quest.aiReason || null,
        targetAction: q.template.targetAction || null,
      });
      
      const currentStreak = streak?.currentStreak || 0;
      let multiplier = 1;
      if (currentStreak >= 30) multiplier = 3;
      else if (currentStreak >= 14) multiplier = 2.5;
      else if (currentStreak >= 7) multiplier = 2;
      else if (currentStreak >= 3) multiplier = 1.5;
      
      res.json({
        daily: dailyQuests.map(mapQuest),
        weekly: weeklyQuests.map(mapQuest),
        monthly: monthlyQuests.map(mapQuest),
        streak: {
          currentStreak,
          longestStreak: streak?.longestStreak || 0,
          multiplier,
          lastActiveDate: streak?.lastActiveDate || null,
          streakShields: streak?.streakShields || 0,
          totalDaysActive: streak?.totalDaysActive || 0,
        },
        dailySlot: dailySlot ? {
          completedCount: dailySlot.completedCount,
          allCompleted: dailySlot.allCompleted,
          bonusUnlocked: dailySlot.bonusUnlocked,
          bonusClaimed: dailySlot.bonusClaimed || claimedTypes.has("daily"),
        } : null,
        chainBonusClaimed: {
          daily: claimedTypes.has("daily"),
          weekly: claimedTypes.has("weekly"),
          monthly: claimedTypes.has("monthly"),
        },
      });
    } catch (error) {
      console.error("Error fetching quests:", error);
      res.status(500).json({ error: "Failed to fetch quests" });
    }
  });

  // Assign daily quests to player (called on app start if needed)
router.post("/api/quests/assign-daily", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      const academyId = req.user!.academyId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      const today = new Date().toISOString().split('T')[0];
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      
      // Check if already assigned today
      const [existingSlot] = await db.select()
        .from(dailyQuestSlotsTable)
        
          .where(and(
          eq(dailyQuestSlotsTable.playerId, playerId),
          eq(dailyQuestSlotsTable.slotDate, today)
        ));
      
      if (existingSlot) {
        return res.json({ message: "Daily quests already assigned", alreadyAssigned: true });
      }
      
      const allDailyTemplates = await db.select()
        .from(questTemplatesTable)
        .where(and(
          eq(questTemplatesTable.questType, "daily"),
          eq(questTemplatesTable.isActive, true),
          or(
            isNull(questTemplatesTable.academyId),
            eq(questTemplatesTable.academyId, academyId || "")
          )
        ))
        .orderBy(asc(questTemplatesTable.order));
      
      const shuffled = allDailyTemplates.sort(() => Math.random() - 0.5);

      let templates = shuffled.slice(0, 3);
      let personalisedBy: string | null = null;
      let pillarReasons: Record<string, string> = {};

      if (shuffled.length > 3) {
        const qualifies = await qualifiesForPersonalisedQuests(playerId).catch(() => false);
        if (qualifies) {
          const result = await pickPersonalisedQuests(playerId, shuffled, 3).catch(() => ({ templates: shuffled.slice(0, 3), reasons: {} as Record<string, string>, personalisedBy: null as null }));
          templates = result.templates;
          personalisedBy = result.personalisedBy;
          pillarReasons = result.reasons;
        }
      }

      if (templates.length === 0) {
        return res.json({ message: "No quest templates available", quests: [] });
      }
      
      // Create player quests
      const createdQuests = [];
      for (const template of templates) {
        const aiReason = pillarReasons[template.id] ?? getQuestReason(template.category ?? "training");
        const [quest] = await db.insert(playerQuestsTable).values({
          playerId,
          questTemplateId: template.id,
          targetProgress: template.targetCount,
          xpReward: template.xpReward,
          currencyReward: template.currencyReward,
          expiresAt: endOfDay,
          personalisedBy,
          aiReason,
        }).returning();
        createdQuests.push(quest);
      }
      
      // Create daily slot
      await db.insert(dailyQuestSlotsTable).values({
        playerId,
        slotDate: today,
        quest1Id: createdQuests[0]?.id,
        quest2Id: createdQuests[1]?.id,
        quest3Id: createdQuests[2]?.id,
      });

      fireQuestEvent(playerId, "daily_login").catch(() => {});

      res.status(201).json({ 
        message: "Daily quests assigned", 
        questCount: createdQuests.length,
      });
    } catch (error) {
      console.error("Error assigning daily quests:", error);
      res.status(500).json({ error: "Failed to assign daily quests" });
    }
  });

  // Assign weekly quests to player (called when opening Quests screen)
router.post("/api/quests/assign-weekly", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      const academyId = req.user!.academyId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      // Get current week start (Monday)
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() + mondayOffset);
      weekStart.setHours(0, 0, 0, 0);
      const weekStartStr = weekStart.toISOString().split('T')[0];
      
      // End of week (Sunday 23:59:59)
      const endOfWeek = new Date(weekStart);
      endOfWeek.setDate(weekStart.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      
      // Check if already has active weekly quests for this week
      const existingWeeklyQuests = await db.select()
        .from(playerQuestsTable)
        .innerJoin(questTemplatesTable, eq(playerQuestsTable.questTemplateId, questTemplatesTable.id))
        
          .where(and(
          eq(playerQuestsTable.playerId, playerId),
          eq(questTemplatesTable.questType, "weekly"),
          gte(playerQuestsTable.expiresAt, now)
        ));
      
      if (existingWeeklyQuests.length > 0) {
        return res.json({ message: "Weekly quests already assigned", alreadyAssigned: true });
      }
      
      const allWeeklyTemplates = await db.select()
        .from(questTemplatesTable)
        .where(and(
          eq(questTemplatesTable.questType, "weekly"),
          eq(questTemplatesTable.isActive, true),
          or(
            isNull(questTemplatesTable.academyId),
            eq(questTemplatesTable.academyId, academyId || "")
          )
        ))
        .orderBy(asc(questTemplatesTable.order));
      
      const shuffledWeekly = allWeeklyTemplates.sort(() => Math.random() - 0.5);

      let weeklyTemplates = shuffledWeekly.slice(0, 3);
      let weeklyPersonalisedBy: string | null = null;
      let weeklyPillarReasons: Record<string, string> = {};

      if (shuffledWeekly.length > 3) {
        const qualifies = await qualifiesForPersonalisedQuests(playerId).catch(() => false);
        if (qualifies) {
          const result = await pickPersonalisedQuests(playerId, shuffledWeekly, 3).catch(() => ({ templates: shuffledWeekly.slice(0, 3), reasons: {} as Record<string, string>, personalisedBy: null as null }));
          weeklyTemplates = result.templates;
          weeklyPersonalisedBy = result.personalisedBy;
          weeklyPillarReasons = result.reasons;
        }
      }

      if (weeklyTemplates.length === 0) {
        return res.json({ message: "No weekly quest templates available", quests: [] });
      }
      
      // Create player quests
      const createdQuests = [];
      for (const template of weeklyTemplates) {
        const aiReason = weeklyPillarReasons[template.id] ?? getQuestReason(template.category ?? "training");
        const [quest] = await db.insert(playerQuestsTable).values({
          playerId,
          questTemplateId: template.id,
          targetProgress: template.targetCount,
          xpReward: template.xpReward,
          currencyReward: template.currencyReward,
          expiresAt: endOfWeek,
          personalisedBy: weeklyPersonalisedBy,
          aiReason,
        }).returning();
        createdQuests.push(quest);
      }
      
      res.status(201).json({ 
        message: "Weekly quests assigned", 
        questCount: createdQuests.length,
      });
    } catch (error) {
      console.error("Error assigning weekly quests:", error);
      res.status(500).json({ error: "Failed to assign weekly quests" });
    }
  });

  // Assign monthly quests to player
router.post("/api/quests/assign-monthly", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      const academyId = req.user!.academyId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      
      const existingMonthlyQuests = await db.select()
        .from(playerQuestsTable)
        .innerJoin(questTemplatesTable, eq(playerQuestsTable.questTemplateId, questTemplatesTable.id))
        .where(and(
          eq(playerQuestsTable.playerId, playerId),
          eq(questTemplatesTable.questType, "monthly"),
          gte(playerQuestsTable.expiresAt, now)
        ));
      
      if (existingMonthlyQuests.length > 0) {
        return res.json({ message: "Monthly quests already assigned", alreadyAssigned: true });
      }
      
      const allMonthlyTemplates = await db.select()
        .from(questTemplatesTable)
        .where(and(
          eq(questTemplatesTable.questType, "monthly"),
          eq(questTemplatesTable.isActive, true),
          or(
            isNull(questTemplatesTable.academyId),
            eq(questTemplatesTable.academyId, academyId || "")
          )
        ))
        .orderBy(asc(questTemplatesTable.order));
      
      const shuffledMonthly = allMonthlyTemplates.sort(() => Math.random() - 0.5);

      let monthlyTemplates = shuffledMonthly.slice(0, 3);
      let monthlyPersonalisedBy: string | null = null;
      let monthlyPillarReasons: Record<string, string> = {};

      if (shuffledMonthly.length > 3) {
        const qualifies = await qualifiesForPersonalisedQuests(playerId).catch(() => false);
        if (qualifies) {
          const result = await pickPersonalisedQuests(playerId, shuffledMonthly, 3).catch(() => ({ templates: shuffledMonthly.slice(0, 3), reasons: {} as Record<string, string>, personalisedBy: null as null }));
          monthlyTemplates = result.templates;
          monthlyPersonalisedBy = result.personalisedBy;
          monthlyPillarReasons = result.reasons;
        }
      }

      if (monthlyTemplates.length === 0) {
        return res.json({ message: "No monthly quest templates available", quests: [] });
      }
      
      const createdQuests = [];
      for (const template of monthlyTemplates) {
        const aiReason = monthlyPillarReasons[template.id] ?? getQuestReason(template.category ?? "training");
        const [quest] = await db.insert(playerQuestsTable).values({
          playerId,
          questTemplateId: template.id,
          targetProgress: template.targetCount,
          xpReward: template.xpReward,
          currencyReward: template.currencyReward,
          expiresAt: monthEnd,
          personalisedBy: monthlyPersonalisedBy,
          aiReason,
        }).returning();
        createdQuests.push(quest);
      }
      
      res.status(201).json({ 
        message: "Monthly quests assigned", 
        questCount: createdQuests.length,
      });
    } catch (error) {
      console.error("Error assigning monthly quests:", error);
      res.status(500).json({ error: "Failed to assign monthly quests" });
    }
  });

  // Update quest progress
router.post("/api/quests/:id/progress", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const playerId = req.user!.playerId;
      const { increment = 1 } = req.body;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      // Get quest
      const [quest] = await db.select({
        quest: playerQuestsTable,
        template: questTemplatesTable,
      })
      .from(playerQuestsTable)
      .innerJoin(questTemplatesTable, eq(playerQuestsTable.questTemplateId, questTemplatesTable.id))
      
          .where(and(
        eq(playerQuestsTable.id, id),
        eq(playerQuestsTable.playerId, playerId)
      ));
      
      if (!quest) {
        return res.status(404).json({ error: "Quest not found" });
      }
      
      if (quest.quest.status !== "active") {
        return res.json({ message: "Quest already completed or expired", quest: quest.quest });
      }
      
      const newProgress = Math.min(
        (quest.quest.currentProgress || 0) + increment,
        quest.quest.targetProgress
      );
      const isComplete = newProgress >= quest.quest.targetProgress;
      
      // Update progress
      const [updatedQuest] = await db.update(playerQuestsTable)
        .set({
          currentProgress: newProgress,
          status: isComplete ? "completed" : "active",
          completedAt: isComplete ? new Date() : null,
        })
        .where(eq(playerQuestsTable.id, id))
        .returning();
      
      // If completed, update daily slot count
      if (isComplete && quest.template.questType === "daily") {
        const today = new Date().toISOString().split('T')[0];
        await db.update(dailyQuestSlotsTable)
          .set({ 
            completedCount: sql`completed_count + 1`,
            allCompleted: sql`completed_count + 1 >= 3`,
            bonusUnlocked: sql`completed_count + 1 >= 3`,
          })
          
          .where(and(
            eq(dailyQuestSlotsTable.playerId, playerId),
            eq(dailyQuestSlotsTable.slotDate, today)
          ));
      }
      
      res.json({
        quest: {
          ...updatedQuest,
          name: quest.template.name,
          iconName: quest.template.iconName,
          iconColor: quest.template.iconColor,
        },
        completed: isComplete,
        xpEarned: isComplete ? (quest.quest.xpReward || quest.template.xpReward) : 0,
      });
    } catch (error) {
      console.error("Error updating quest progress:", error);
      res.status(500).json({ error: "Failed to update quest progress" });
    }
  });

  // Claim quest reward
router.post("/api/quests/:id/claim", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const playerId = req.user!.playerId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      const [quest] = await db.select({
        quest: playerQuestsTable,
        template: questTemplatesTable,
      })
      .from(playerQuestsTable)
      .innerJoin(questTemplatesTable, eq(playerQuestsTable.questTemplateId, questTemplatesTable.id))
      .where(and(
        eq(playerQuestsTable.id, id),
        eq(playerQuestsTable.playerId, playerId)
      ));
      
      if (!quest) {
        return res.status(404).json({ error: "Quest not found" });
      }
      
      if (quest.quest.status !== "completed") {
        return res.status(400).json({ error: "Quest not completed yet" });
      }
      
      if (quest.quest.claimedAt) {
        return res.status(400).json({ error: "Reward already claimed" });
      }
      
      await db.update(playerQuestsTable)
        .set({
          status: "claimed",
          claimedAt: new Date(),
        })
        .where(eq(playerQuestsTable.id, id));
      
      const [streak] = await db.select()
        .from(playerStreaksTable)
        .where(eq(playerStreaksTable.playerId, playerId));
      
      const currentStreak = streak?.currentStreak || 0;
      let multiplier = 1;
      if (currentStreak >= 30) multiplier = 3;
      else if (currentStreak >= 14) multiplier = 2.5;
      else if (currentStreak >= 7) multiplier = 2;
      else if (currentStreak >= 3) multiplier = 1.5;
      
      const baseXp = quest.quest.xpReward || quest.template.xpReward || 0;
      const xpReward = Math.round(baseXp * multiplier);
      const coinsAwarded = quest.quest.currencyReward || quest.template.currencyReward || 0;
      if (xpReward > 0 || coinsAwarded > 0) {
        await db.update(players)
          .set({
            totalXp: sql`COALESCE(total_xp, 0) + ${xpReward}`,
            glowCoins: sql`COALESCE(glow_coins, 0) + ${coinsAwarded}`,
          })
          .where(eq(players.id, playerId));
      }
      
      const today = new Date().toISOString().split('T')[0];
      if (streak) {
        const lastActive = streak.lastActiveDate;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        let newStreak = streak.currentStreak || 0;
        if (lastActive !== today) {
          if (lastActive === yesterdayStr) {
            newStreak += 1;
          } else if (lastActive && lastActive < yesterdayStr) {
            if ((streak.streakShields || 0) > 0) {
              newStreak += 1;
              await db.update(playerStreaksTable)
                .set({ streakShields: sql`streak_shields - 1` })
                .where(eq(playerStreaksTable.playerId, playerId));
            } else {
              newStreak = 1;
            }
          } else if (!lastActive) {
            newStreak = 1;
          }
          
          await db.update(playerStreaksTable)
            .set({
              currentStreak: newStreak,
              longestStreak: sql`GREATEST(longest_streak, ${newStreak})`,
              lastActiveDate: today,
              totalDaysActive: sql`total_days_active + 1`,
              updatedAt: new Date(),
            })
            .where(eq(playerStreaksTable.playerId, playerId));
        }
      } else {
        await db.insert(playerStreaksTable).values({
          playerId,
          currentStreak: 1,
          longestStreak: 1,
          lastActiveDate: today,
          totalDaysActive: 1,
        });
      }
      
      const [updatedPlayer] = await db.select({ totalXp: players.totalXp, glowCoins: players.glowCoins })
        .from(players)
        .where(eq(players.id, playerId));

      res.json({
        success: true,
        xpAwarded: xpReward,
        coinsAwarded,
        baseXp,
        multiplier,
        newTotalXp: updatedPlayer?.totalXp || 0,
        newGlowCoins: updatedPlayer?.glowCoins || 0,
      });
    } catch (error) {
      console.error("Error claiming quest reward:", error);
      res.status(500).json({ error: "Failed to claim quest reward" });
    }
  });

  // Claim chain bonus XP (awarded once per period when all quests for a given type are claimed)
  // type: "daily" | "weekly" | "monthly"
  // Idempotency: quest_chain_bonus_claims table enforces one claim per (player, type, periodKey)
router.post("/api/quests/claim-chain-bonus", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      const questType = req.body?.type as "daily" | "weekly" | "monthly" | undefined;

      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }

      if (!questType || !["daily", "weekly", "monthly"].includes(questType)) {
        return res.status(400).json({ error: "Invalid quest type — must be daily, weekly, or monthly" });
      }

      const CHAIN_BONUS_XP = 50;
      const periodKey = getChainBonusPeriodKey(questType);

      // Check persistent idempotency guard first (applies to ALL types)
      const [existingClaim] = await db.select()
        .from(questChainBonusClaimsTable)
        .where(and(
          eq(questChainBonusClaimsTable.playerId, playerId),
          eq(questChainBonusClaimsTable.questType, questType),
          eq(questChainBonusClaimsTable.periodKey, periodKey)
        ));

      if (existingClaim) {
        return res.status(400).json({ error: `${questType} chain bonus already claimed for this period` });
      }

      // Verify eligibility before awarding
      if (questType === "daily") {
        const today = periodKey;
        const [slot] = await db.select()
          .from(dailyQuestSlotsTable)
          .where(and(
            eq(dailyQuestSlotsTable.playerId, playerId),
            eq(dailyQuestSlotsTable.slotDate, today)
          ));

        if (!slot) {
          return res.status(404).json({ error: "No daily quest slot found for today" });
        }
        if (!slot.bonusUnlocked) {
          return res.status(400).json({ error: "Complete all daily quests first to unlock the chain bonus" });
        }

        // Mark bonus_claimed on the daily slot for quick UI look-up
        await db.update(dailyQuestSlotsTable)
          .set({ bonusClaimed: true })
          .where(eq(dailyQuestSlotsTable.id, slot.id));
      } else {
        // Weekly / Monthly: verify all active quests for this period are in "claimed" status
        const now = new Date();
        const activeQuests = await db.select({ quest: playerQuestsTable })
          .from(playerQuestsTable)
          .innerJoin(questTemplatesTable, eq(playerQuestsTable.questTemplateId, questTemplatesTable.id))
          .where(and(
            eq(playerQuestsTable.playerId, playerId),
            eq(questTemplatesTable.questType, questType),
            gte(playerQuestsTable.expiresAt, now)
          ));

        if (activeQuests.length === 0) {
          return res.status(404).json({ error: `No active ${questType} quests found` });
        }
        if (!activeQuests.every(q => q.quest.status === "claimed")) {
          return res.status(400).json({ error: `Claim all ${questType} quest rewards first to unlock the chain bonus` });
        }
      }

      // Atomically record the claim and award XP.
      // The UNIQUE INDEX on (player_id, quest_type, period_key) prevents duplicate inserts
      // even under concurrent requests — a second insert will throw and roll back.
      await db.insert(questChainBonusClaimsTable).values({
        playerId,
        questType,
        periodKey,
        xpAwarded: CHAIN_BONUS_XP,
      });

      await db.update(players)
        .set({ totalXp: sql`COALESCE(total_xp, 0) + ${CHAIN_BONUS_XP}` })
        .where(eq(players.id, playerId));

      const [updatedPlayer] = await db.select({ totalXp: players.totalXp, glowCoins: players.glowCoins })
        .from(players)
        .where(eq(players.id, playerId));

      res.json({
        success: true,
        bonusXpAwarded: CHAIN_BONUS_XP,
        newTotalXp: updatedPlayer?.totalXp || 0,
        newGlowCoins: updatedPlayer?.glowCoins || 0,
      });
    } catch (error: any) {
      // Unique constraint violation means concurrent duplicate request — treat as already-claimed
      if (error?.code === "23505") {
        return res.status(400).json({ error: "Chain bonus already claimed for this period" });
      }
      console.error("Error claiming chain bonus:", error);
      res.status(500).json({ error: "Failed to claim chain bonus" });
    }
  });

  // ==================== BADGES & TITLES ENDPOINTS ====================

  // Get all available badges
router.get("/api/badges", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const allBadges = await db.select()
        .from(badgesTable)
        .where(eq(badgesTable.isActive, true))
        .orderBy(asc(badgesTable.order));
      
      res.json(allBadges);
    } catch (error) {
      console.error("Error fetching badges:", error);
      res.status(500).json({ error: "Failed to fetch badges" });
    }
  });

  // Get player's badges and titles collection with locked/unlocked status
router.get("/api/player/badges", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      // Get all available badges
      const allBadges = await db.select().from(badgesTable).where(eq(badgesTable.isActive, true));
      
      // Get player's earned badges
      const earnedBadges = await db.select({
        playerBadge: playerBadgesTable,
        badge: badgesTable,
      })
        .from(playerBadgesTable)
        .innerJoin(badgesTable, eq(playerBadgesTable.badgeId, badgesTable.id))
        .where(eq(playerBadgesTable.playerId, playerId))
        .orderBy(desc(playerBadgesTable.earnedAt));
      
      const earnedBadgeMap = new Map(earnedBadges.map(eb => [eb.badge.id, eb.playerBadge.earnedAt]));
      
      // Get all available titles
      const allTitles = await db.select().from(titlesTable).where(eq(titlesTable.isActive, true));
      
      // Get player's unlocked titles
      const unlockedTitles = await db.select({
        playerTitle: playerTitlesTable,
        title: titlesTable,
      })
        .from(playerTitlesTable)
        .innerJoin(titlesTable, eq(playerTitlesTable.titleId, titlesTable.id))
        .where(eq(playerTitlesTable.playerId, playerId));
      
      const unlockedTitleMap = new Map(unlockedTitles.map(ut => [ut.title.id, { unlockedAt: ut.playerTitle.unlockedAt, isEquipped: ut.playerTitle.isEquipped }]));
      
      // Build response with all badges and titles including earned/locked status
      const badges = allBadges.map(badge => ({
        ...badge,
        earnedAt: earnedBadgeMap.get(badge.id) || null,
      }));
      
      const titles = allTitles.map(title => ({
        ...title,
        unlockedAt: unlockedTitleMap.get(title.id)?.unlockedAt || null,
        isEquipped: unlockedTitleMap.get(title.id)?.isEquipped || false,
      }));
      
      res.json({
        badges,
        titles,
        stats: {
          totalBadges: allBadges.length,
          earnedBadges: earnedBadges.length,
          totalTitles: allTitles.length,
          unlockedTitles: unlockedTitles.length,
        },
      });
    } catch (error) {
      console.error("Error fetching player badges:", error);
      res.status(500).json({ error: "Failed to fetch player badges" });
    }
  });

  // Get all available titles
router.get("/api/titles", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const allTitles = await db.select()
        .from(titlesTable)
        .where(eq(titlesTable.isActive, true))
        .orderBy(asc(titlesTable.order));
      
      res.json(allTitles);
    } catch (error) {
      console.error("Error fetching titles:", error);
      res.status(500).json({ error: "Failed to fetch titles" });
    }
  });

  // Get player's unlocked titles
router.get("/api/player/titles", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      const unlockedTitles = await db.select({
        playerTitle: playerTitlesTable,
        title: titlesTable,
      })
        .from(playerTitlesTable)
        .innerJoin(titlesTable, eq(playerTitlesTable.titleId, titlesTable.id))
        .where(eq(playerTitlesTable.playerId, playerId))
        .orderBy(desc(playerTitlesTable.unlockedAt));
      
      res.json(unlockedTitles.map(ut => ({
        ...ut.title,
        unlockedAt: ut.playerTitle.unlockedAt,
        isEquipped: ut.playerTitle.isEquipped,
      })));
    } catch (error) {
      console.error("Error fetching player titles:", error);
      res.status(500).json({ error: "Failed to fetch player titles" });
    }
  });

  // Equip a title (only one can be active)
router.post("/api/player/titles/:titleId/equip", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      const { titleId } = req.params;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      // Check if player has unlocked this title
      const [playerTitle] = await db.select()
        .from(playerTitlesTable)
        
          .where(and(
          eq(playerTitlesTable.playerId, playerId),
          eq(playerTitlesTable.titleId, titleId)
        ));
      
      if (!playerTitle) {
        return res.status(404).json({ error: "Title not unlocked" });
      }
      
      // Unequip all other titles first
      await db.update(playerTitlesTable)
        .set({ isEquipped: false })
        .where(eq(playerTitlesTable.playerId, playerId));
      
      // Equip the selected title
      await db.update(playerTitlesTable)
        .set({ isEquipped: true })
        .where(eq(playerTitlesTable.id, playerTitle.id));
      
      res.json({ success: true, message: "Title equipped" });
    } catch (error) {
      console.error("Error equipping title:", error);
      res.status(500).json({ error: "Failed to equip title" });
    }
  });

  // Get player's badges and titles for profile display
router.get("/api/player/:playerId/achievements", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      
      // Verify the target player exists (allow cross-academy for social features)
      const [targetPlayer] = await db.select().from(players).where(eq(players.id, playerId));
      if (!targetPlayer) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Get earned badges
      const earnedBadges = await db.select({
        playerBadge: playerBadgesTable,
        badge: badgesTable,
      })
        .from(playerBadgesTable)
        .innerJoin(badgesTable, eq(playerBadgesTable.badgeId, badgesTable.id))
        .where(eq(playerBadgesTable.playerId, playerId))
        .orderBy(desc(playerBadgesTable.earnedAt));
      
      // Get equipped title
      const [equippedTitle] = await db.select({
        playerTitle: playerTitlesTable,
        title: titlesTable,
      })
        .from(playerTitlesTable)
        .innerJoin(titlesTable, eq(playerTitlesTable.titleId, titlesTable.id))
        
          .where(and(
          eq(playerTitlesTable.playerId, playerId),
          eq(playerTitlesTable.isEquipped, true)
        ));
      
      res.json({
        badges: earnedBadges.map(eb => ({
          ...eb.badge,
          earnedAt: eb.playerBadge.earnedAt,
        })),
        equippedTitle: equippedTitle ? {
          ...equippedTitle.title,
          unlockedAt: equippedTitle.playerTitle.unlockedAt,
        } : null,
      });
    } catch (error) {
      console.error("Error fetching player achievements:", error);
      res.status(500).json({ error: "Failed to fetch player achievements" });
    }
  });

  // Check and award badges based on player progress (called after XP/level changes)
router.post("/api/player/check-badges", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      // Get player stats
      const [player] = await db.select().from(players).where(eq(players.id, playerId));
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Get player's session count
      const [sessionCount] = await db.select({ count: count() })
        .from(sessionPlayers)
        .where(eq(sessionPlayers.playerId, playerId));
      
      // Get all available badges
      const allBadges = await db.select()
        .from(badgesTable)
        .where(eq(badgesTable.isActive, true));
      
      // Get player's already earned badges
      const earnedBadgeIds = (await db.select({ badgeId: playerBadgesTable.badgeId })
        .from(playerBadgesTable)
        .where(eq(playerBadgesTable.playerId, playerId)))
        .map(eb => eb.badgeId);
      
      const newlyEarnedBadges: string[] = [];
      
      for (const badge of allBadges) {
        if (earnedBadgeIds.includes(badge.id)) continue;
        
        const criteria = badge.unlockCriteria as { type: string; threshold?: number } | null;
        if (!criteria) continue;
        
        let shouldAward = false;
        
        switch (criteria.type) {
          case "session_count":
            shouldAward = sessionCount.count >= (criteria.threshold || 0);
            break;
          case "level":
            shouldAward = (player.level || 1) >= (criteria.threshold || 0);
            break;
          case "streak":
            shouldAward = (player.streak || 0) >= (criteria.threshold || 0);
            break;
          case "xp_total":
            shouldAward = (player.totalXp || 0) >= (criteria.threshold || 0);
            break;
        }
        
        if (shouldAward) {
          try {
            await db.insert(playerBadgesTable).values({
              playerId,
              badgeId: badge.id,
            });
            newlyEarnedBadges.push(badge.id);
            // Send push notification for earned badge
            sendBadgeEarnedNotification(playerId, badge.name, badge.description || "").catch(err =>
              console.error("Failed to send badge earned notification:", err)
            );
          } catch (e) {
            // Ignore duplicate key errors
          }
        }
      }
      
      // Check and award titles similarly
      const allTitles = await db.select()
        .from(titlesTable)
        .where(eq(titlesTable.isActive, true));
      
      const earnedTitleIds = (await db.select({ titleId: playerTitlesTable.titleId })
        .from(playerTitlesTable)
        .where(eq(playerTitlesTable.playerId, playerId)))
        .map(et => et.titleId);
      
      const newlyUnlockedTitles: string[] = [];
      
      for (const title of allTitles) {
        if (earnedTitleIds.includes(title.id)) continue;
        
        const criteria = title.unlockCriteria as { type: string; threshold?: number } | null;
        if (!criteria) continue;
        
        let shouldUnlock = false;
        
        switch (criteria.type) {
          case "level":
            shouldUnlock = (player.level || 1) >= (criteria.threshold || 0);
            break;
          case "xp_total":
            shouldUnlock = (player.totalXp || 0) >= (criteria.threshold || 0);
            break;
          case "streak":
            shouldUnlock = (player.streak || 0) >= (criteria.threshold || 0);
            break;
          case "session_count":
            shouldUnlock = sessionCount.count >= (criteria.threshold || 0);
            break;
        }
        
        if (shouldUnlock) {
          try {
            await db.insert(playerTitlesTable).values({
              playerId,
              titleId: title.id,
            });
            newlyUnlockedTitles.push(title.id);
          } catch (e) {
            // Ignore duplicate key errors
          }
        }
      }
      
      res.json({
        newBadges: newlyEarnedBadges,
        newTitles: newlyUnlockedTitles,
      });
    } catch (error) {
      console.error("Error checking badges:", error);
      res.status(500).json({ error: "Failed to check badges" });
    }
  });

  // Get mission control data (combines dashboard, quests, social highlights)
router.get("/api/player/mission-control", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const playerId = req.user!.playerId;
      const academyId = req.user!.academyId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const today = now.toISOString().split('T')[0];
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      // Get player profile
      const [player] = await db.select().from(players).where(eq(players.id, playerId));
      
      // Get today's quests using simpler query pattern
      const playerQuestRows = await db.select()
        .from(playerQuestsTable)
        
          .where(and(
          eq(playerQuestsTable.playerId, playerId),
          inArray(playerQuestsTable.status, ["active", "completed"])
        ))
        .limit(10);
      
      // Get templates for these quests
      const templateIds = playerQuestRows.map(q => q.questTemplateId).filter(Boolean);
      const questTemplateRows = templateIds.length > 0 
        ? await db.select().from(questTemplatesTable).where(
            and(
              inArray(questTemplatesTable.id, templateIds),
              eq(questTemplatesTable.questType, "daily")
            )
          )
        : [];
      
      // Combine quest data with template data
      const todayQuests = playerQuestRows
        .map(quest => {
          const template = questTemplateRows.find(t => t.id === quest.questTemplateId);
          return template ? { quest, template } : null;
        })
        .filter((q): q is { quest: typeof playerQuestRows[0], template: typeof questTemplateRows[0] } => q !== null)
        .sort((a, b) => (a.template.order || 0) - (b.template.order || 0))
        .slice(0, 3);
      
      // Get next upcoming session
      let upcomingSessions: any[] = [];
      try {
        const playerSessionLinks = await db.select({ sessionId: sessionPlayers.sessionId })
          .from(sessionPlayers)
          .where(eq(sessionPlayers.playerId, playerId));
        
        const sessionIds = playerSessionLinks.map(ps => ps.sessionId).filter((id): id is string => id !== null);
        
        if (sessionIds.length > 0) {
          const allSessions = await db.select().from(sessions).where(inArray(sessions.id, sessionIds));
          upcomingSessions = allSessions
            .filter(s => !s.isCancelled && new Date(s.date) >= now)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 1);
        }
      } catch (e) {
        console.log("Session query fallback:", e);
      }
      
      // Get social highlights - use safer count queries
      let momentCount = { count: 0 };
      let openToPlayCount = { count: 0 };
      
      try {
        if (academyId) {
          const momentResult = await db.select({ count: count() })
            .from(postsTable)
            
          .where(and(
              eq(postsTable.academyId, academyId),
              eq(postsTable.isHidden, false)
            ));
          momentCount = momentResult[0] || { count: 0 };
          
          const otpResult = await db.select({ count: count() })
            .from(openToPlayTable)
            
          .where(and(
              eq(openToPlayTable.academyId, academyId),
              eq(openToPlayTable.isActive, true)
            ));
          openToPlayCount = otpResult[0] || { count: 0 };
        }
      } catch (e) {
        console.log("Social count queries skipped:", e);
      }
      
      // Calculate streak
      const streak = player?.consecutiveDays || 0;
      
      // Calculate daily quest progress
      const completedQuests = todayQuests.filter(q => q.quest.status === "completed").length;
      const totalQuests = todayQuests.length;
      
      res.json({
        player: {
          name: player?.name,
          photoUrl: player?.photoUrl,
          xp: player?.xp || 0,
          level: player?.level || 1,
          glowScore: player?.glowScore || 0,
          ballLevel: player?.ballLevel,
          streak,
        },
        quests: {
          today: todayQuests.map(q => ({
            id: q.quest.id,
            name: q.template.name,
            iconName: q.template.iconName,
            iconColor: q.template.iconColor,
            currentProgress: q.quest.currentProgress || 0,
            targetProgress: q.quest.targetProgress,
            status: q.quest.status,
            xpReward: q.template.xpReward,
          })),
          completedCount: completedQuests,
          totalCount: totalQuests,
        },
        nextMission: upcomingSessions[0] ? {
          type: "session",
          title: upcomingSessions[0].type || "Training Session",
          time: upcomingSessions[0].date,
          location: upcomingSessions[0].courtId,
        } : null,
        social: {
          newMoments: Number(momentCount?.count || 0),
          openToPlay: Number(openToPlayCount?.count || 0),
        },
      });
    } catch (error) {
      console.error("Error fetching mission control data:", error);
      res.status(500).json({ error: "Failed to fetch mission control data" });
    }
  });

  // Get leaderboard rankings
router.get("/api/player/leaderboard", authMiddleware, requireFeatureUnlock("glow_leaderboard"), async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const playerId = req.user!.playerId;
      const scope = (req.query.scope as string) || "academy";
      const category = (req.query.category as string) || "glow_score";
      const cityFilter = (req.query.city as string) || null;
      const sportFilter = (req.query.sport as string) || null;
      const limitParam = parseInt((req.query.limit as string) || "100", 10);
      const limit = Math.min(isNaN(limitParam) ? 100 : limitParam, 200);

      // For global scope: join with academies to support city/country filtering
      const isGlobalScope = scope === "global";

      // Build conditions array
      const conditions: any[] = [eq(players.status, "active")];
      if (!isGlobalScope && scope === "academy" && academyId) {
        conditions.push(eq(players.academyId, academyId));
      }

      // Exclude hidden players in global scope + require active user account
      if (isGlobalScope) {
        conditions.push(sql`${players.privacyLevel} != 'hidden'`);
        conditions.push(eq(users.status, "active"));
        conditions.push(sql`COALESCE(${users.deleted}, false) = false`);
      }

      // Add category-specific conditions
      if (category === "dss_rating") {
        conditions.push(eq(players.isAdult, true));
        conditions.push(sql`COALESCE(${players.glowMmr}, 0) > 0`);
      } else if (category === "ball_level") {
        conditions.push(sql`${players.ballLevel} IS NOT NULL`);
      }

      // For global leaderboard: always require glowMmr > 0
      if (isGlobalScope) {
        conditions.push(sql`COALESCE(${players.glowMmr}, 0) > 0`);
      }

      // City filter: match academy city or player city
      if (isGlobalScope && cityFilter && cityFilter !== "all") {
        conditions.push(
          or(
            sql`LOWER(${academies.city}) = LOWER(${cityFilter})`,
            sql`LOWER(${academies.country}) = LOWER(${cityFilter})`,
            sql`LOWER(${players.city}) = LOWER(${cityFilter})`,
            sql`LOWER(${players.country}) = LOWER(${cityFilter})`
          )
        );
      }

      // Sport filter: match academy sports array OR player sport profile key
      if (isGlobalScope && sportFilter && sportFilter !== "all") {
        conditions.push(
          or(
            sql`${academies.sports} @> ${JSON.stringify([sportFilter])}::jsonb`,
            sql`${players.sportProfiles} ? ${sportFilter}`
          )
        );
      }

      // Get top players with simple ordering
      let topPlayers: any[];

      if (isGlobalScope) {
        // Global leaderboard: join with users (active check) and academies (city/country)
        topPlayers = await db.select({
          id: players.id,
          name: players.name,
          photoUrl: players.profilePhotoUrl,
          level: players.level,
          glowScore: players.glowScore,
          xp: players.xp,
          ballLevel: players.ballLevel,
          glowMmr: players.glowMmr,
          glowRank: players.glowRank,
          streak: players.consecutiveDays,
          academyName: academies.name,
          city: sql<string>`COALESCE(${academies.city}, ${players.city})`,
          country: sql<string>`COALESCE(${academies.country}, ${players.country})`,
        })
        .from(players)
        .innerJoin(users, eq(users.playerId, players.id))
        .leftJoin(academies, eq(players.academyId, academies.id))
        .where(and(...conditions))
        .orderBy(desc(players.glowMmr))
        .limit(limit);
      } else if (category === "xp") {
        topPlayers = await db.select({
          id: players.id,
          name: players.name,
          photoUrl: players.profilePhotoUrl,
          level: players.level,
          glowScore: players.glowScore,
          xp: players.xp,
          ballLevel: players.ballLevel,
          glowMmr: players.glowMmr,
          glowRank: players.glowRank,
          streak: players.consecutiveDays,
          academyName: sql<string | null>`NULL`,
          city: sql<string | null>`NULL`,
          country: sql<string | null>`NULL`,
        })
        .from(players)
        .where(and(...conditions))
        .orderBy(desc(players.xp))
        .limit(50);
      } else if (category === "dss_rating") {
        topPlayers = await db.select({
          id: players.id,
          name: players.name,
          photoUrl: players.profilePhotoUrl,
          level: players.level,
          glowScore: players.glowScore,
          xp: players.xp,
          ballLevel: players.ballLevel,
          glowMmr: players.glowMmr,
          glowRank: players.glowRank,
          streak: players.consecutiveDays,
          academyName: sql<string | null>`NULL`,
          city: sql<string | null>`NULL`,
          country: sql<string | null>`NULL`,
        })
        .from(players)
        .where(and(...conditions))
        .orderBy(desc(players.glowMmr))
        .limit(50);
      } else if (category === "ball_level") {
        topPlayers = await db.select({
          id: players.id,
          name: players.name,
          photoUrl: players.profilePhotoUrl,
          level: players.level,
          glowScore: players.glowScore,
          xp: players.xp,
          ballLevel: players.ballLevel,
          glowMmr: players.glowMmr,
          glowRank: players.glowRank,
          streak: players.consecutiveDays,
          academyName: sql<string | null>`NULL`,
          city: sql<string | null>`NULL`,
          country: sql<string | null>`NULL`,
        })
        .from(players)
        .where(and(...conditions))
        .orderBy(desc(players.glowScore))
        .limit(50);
        // Sort by ball level manually
        const ballOrder: Record<string, number> = { yellow: 1, green: 2, orange: 3, red: 4 };
        topPlayers.sort((a, b) => (ballOrder[a.ballLevel] || 5) - (ballOrder[b.ballLevel] || 5));
      } else {
        // Default: glow_score
        topPlayers = await db.select({
          id: players.id,
          name: players.name,
          photoUrl: players.profilePhotoUrl,
          level: players.level,
          glowScore: players.glowScore,
          xp: players.xp,
          ballLevel: players.ballLevel,
          glowMmr: players.glowMmr,
          glowRank: players.glowRank,
          streak: players.consecutiveDays,
          academyName: sql<string | null>`NULL`,
          city: sql<string | null>`NULL`,
          country: sql<string | null>`NULL`,
        })
        .from(players)
        .where(and(...conditions))
        .orderBy(desc(players.glowScore))
        .limit(50);
      }
      
      // Helper to format DSS rating from MMR
      const formatDssRating = (mmr: number | null) => {
        if (!mmr) return null;
        return ((mmr - 1000) / 1000 * 3 + 3).toFixed(1);
      };

      const formatRankingRow = (p: any, rank: number) => ({
        rank,
        id: p.id,
        name: p.name,
        photoUrl: p.photoUrl,
        level: p.level || 1,
        glowScore: p.glowScore || 0,
        xp: p.xp || 0,
        ballLevel: p.ballLevel,
        glowRank: p.glowRank,
        glowMmr: p.glowMmr || 0,
        dssRating: formatDssRating(p.glowMmr),
        streak: p.streak || 0,
        academyName: p.academyName || null,
        city: p.city || null,
        isCurrentPlayer: p.id === playerId,
      });

      // Calculate current player's rank
      let myRank = 0;
      let currentPlayerData: any = null;

      if (playerId) {
        const playerIndex = topPlayers.findIndex(p => p.id === playerId);
        if (playerIndex >= 0) {
          myRank = playerIndex + 1;
          currentPlayerData = topPlayers[playerIndex];
        } else if (isGlobalScope) {
          // Player is outside top-N: fetch their own row first (with same joins + privacy check)
          const myRows = await db.select({
            id: players.id,
            name: players.name,
            photoUrl: players.profilePhotoUrl,
            level: players.level,
            glowScore: players.glowScore,
            xp: players.xp,
            ballLevel: players.ballLevel,
            glowMmr: players.glowMmr,
            glowRank: players.glowRank,
            streak: players.consecutiveDays,
            academyName: academies.name,
            city: sql<string>`COALESCE(${academies.city}, ${players.city})`,
            country: sql<string>`COALESCE(${academies.country}, ${players.country})`,
          })
          .from(players)
          .innerJoin(users, eq(users.playerId, players.id))
          .leftJoin(academies, eq(players.academyId, academies.id))
          .where(and(
            eq(players.id, playerId),
            eq(players.status, "active"),
            sql`${players.privacyLevel} != 'hidden'`,
            eq(users.status, "active"),
            sql`COALESCE(${users.deleted}, false) = false`,
            sql`COALESCE(${players.glowMmr}, 0) > 0`,
          ))
          .limit(1);

          if (myRows[0]) {
            currentPlayerData = myRows[0];
            const myMmr = myRows[0].glowMmr ?? 0;

            // Determine if player satisfies the active filter constraints (city/sport)
            // by checking if they would match the same conditions as the main query.
            // We check this by verifying the player's city/sport match the filters.
            let satisfiesFilters = true;

            if (cityFilter && cityFilter !== "all") {
              // Use exact same OR logic as main query: academy.city | academy.country | player.city | player.country
              // Re-query via DB to avoid COALESCE shortcut divergence
              const cityMatch = await db.select({ id: players.id })
                .from(players)
                .innerJoin(users, eq(users.playerId, players.id))
                .leftJoin(academies, eq(players.academyId, academies.id))
                .where(and(
                  eq(players.id, playerId),
                  or(
                    sql`LOWER(${academies.city}) = LOWER(${cityFilter})`,
                    sql`LOWER(${academies.country}) = LOWER(${cityFilter})`,
                    sql`LOWER(${players.city}) = LOWER(${cityFilter})`,
                    sql`LOWER(${players.country}) = LOWER(${cityFilter})`
                  )
                ))
                .limit(1);
              satisfiesFilters = cityMatch.length > 0;
            }

            if (satisfiesFilters && sportFilter && sportFilter !== "all") {
              // Re-check by running a filtered existence query
              const sportMatch = await db.select({ id: players.id })
                .from(players)
                .innerJoin(users, eq(users.playerId, players.id))
                .leftJoin(academies, eq(players.academyId, academies.id))
                .where(and(
                  eq(players.id, playerId),
                  or(
                    sql`${academies.sports} @> ${JSON.stringify([sportFilter])}::jsonb`,
                    sql`${players.sportProfiles} ? ${sportFilter}`
                  )
                ))
                .limit(1);
              satisfiesFilters = sportMatch.length > 0;
            }

            if (satisfiesFilters) {
              // Count how many players with glowMmr > mine satisfy the same full filter set
              const countConditions: any[] = [
                eq(players.status, "active"),
                sql`${players.privacyLevel} != 'hidden'`,
                eq(users.status, "active"),
                sql`COALESCE(${users.deleted}, false) = false`,
                sql`COALESCE(${players.glowMmr}, 0) > 0`,
                sql`COALESCE(${players.glowMmr}, 0) > ${myMmr}`,
              ];
              if (cityFilter && cityFilter !== "all") {
                countConditions.push(
                  or(
                    sql`LOWER(${academies.city}) = LOWER(${cityFilter})`,
                    sql`LOWER(${academies.country}) = LOWER(${cityFilter})`,
                    sql`LOWER(${players.city}) = LOWER(${cityFilter})`,
                    sql`LOWER(${players.country}) = LOWER(${cityFilter})`
                  )
                );
              }
              if (sportFilter && sportFilter !== "all") {
                countConditions.push(
                  or(
                    sql`${academies.sports} @> ${JSON.stringify([sportFilter])}::jsonb`,
                    sql`${players.sportProfiles} ? ${sportFilter}`
                  )
                );
              }
              const aboveCount = await db.select({ count: count() })
                .from(players)
                .innerJoin(users, eq(users.playerId, players.id))
                .leftJoin(academies, eq(players.academyId, academies.id))
                .where(and(...countConditions));
              myRank = (aboveCount[0]?.count ?? 0) + 1;
            } else {
              // Player doesn't match current filters — do not append row, rank unknown in this filter context
              currentPlayerData = null;
            }
          }
        } else {
          myRank = topPlayers.length + 1;
        }
      }

      // Collect available cities for global scope via a distinct query (not just top-N results)
      const availableCities: string[] = [];
      if (isGlobalScope) {
        const cityRows = await db.selectDistinct({
          city: sql<string | null>`COALESCE(${academies.city}, ${players.city})`,
          country: sql<string | null>`COALESCE(${academies.country}, ${players.country})`,
        })
        .from(players)
        .innerJoin(users, eq(users.playerId, players.id))
        .leftJoin(academies, eq(players.academyId, academies.id))
        .where(and(
          eq(players.status, "active"),
          sql`${players.privacyLevel} != 'hidden'`,
          eq(users.status, "active"),
          sql`COALESCE(${users.deleted}, false) = false`,
          sql`COALESCE(${players.glowMmr}, 0) > 0`,
        ));
        const citySet = new Set<string>();
        cityRows.forEach(r => {
          if (r.city) citySet.add(r.city);
          if (r.country) citySet.add(r.country);
        });
        availableCities.push(...Array.from(citySet).sort());
      }

      // Build rankings list; append current player row if they're outside top-N
      const rankings = topPlayers.map((p, idx) => formatRankingRow(p, idx + 1));
      if (isGlobalScope && playerId && currentPlayerData && !topPlayers.find(p => p.id === playerId)) {
        rankings.push({ ...formatRankingRow(currentPlayerData, myRank), isCurrentPlayer: true });
      }

      res.json({
        scope,
        category,
        myRank,
        availableCities,
        currentPlayer: currentPlayerData ? {
          ...currentPlayerData,
          rank: myRank,
          dssRating: formatDssRating(currentPlayerData.glowMmr),
        } : null,
        rankings,
      });
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });
  // Search players for connections
router.get("/api/player/search", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const playerId = req.user!.playerId;
      const searchQuery = (req.query.q as string) || "";
      const skillLevel = req.query.skill as string;
      const openToPlayOnly = req.query.openToPlay === "true";
      
      let conditions: any[] = [eq(players.status, "active")];
      
      if (academyId) {
        conditions.push(eq(players.academyId, academyId));
      }
      
      if (playerId) {
        conditions.push(sql`${players.id} != ${playerId}`);
      }
      
      if (searchQuery) {
        conditions.push(sql`LOWER(${players.name}) LIKE LOWER(${"%" + searchQuery + "%"})`);
      }
      
      if (skillLevel) {
        conditions.push(eq(players.ballLevel, skillLevel));
      }
      
      if (openToPlayOnly) {
        conditions.push(eq(players.openToPlay, true));
      }

      conditions.push(not(inArray(players.id, HIDDEN_PLAYER_IDS)));
      
      const results = await db.select({
        id: players.id,
        name: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
        level: players.level,
        glowScore: players.glowScore,
        ballLevel: players.ballLevel,
        academyId: players.academyId,
        openToPlay: players.openToPlay,
        homeAddress: players.homeAddress,
        homeLat: players.homeLat,
        homeLng: players.homeLng,
      })
      .from(players)
      .where(and(...conditions))
      .orderBy(desc(players.glowScore))
      .limit(30);
      
      res.json({
        query: searchQuery,
        results: results.map(p => ({
          id: p.id,
          name: p.name,
          photoUrl: p.profilePhotoUrl,
          level: p.level || 1,
          glowScore: p.glowScore || 0,
          ballLevel: p.ballLevel,
          openToPlay: p.openToPlay || false,
          hasHomeAddress: !!(p.homeAddress && p.homeLat != null && p.homeLng != null),
        })),
      });
    } catch (error) {
      console.error("Error searching players:", error);
      res.status(500).json({ error: "Failed to search players" });
    }
  });

  // Discover players with filters (recommended, sameLevel, academy)
router.get("/api/player/discover", authMiddleware, requireFeatureUnlock("player_finder"), async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const playerId = req.user!.playerId;
      const filter = req.query.filter as string || "recommended";
      
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }
      
      // Get current player's info for filtering
      const currentPlayerResult = await db.select({
        level: players.level,
        ballLevel: players.ballLevel,
        profilePhotoUrl: players.profilePhotoUrl,
        academyId: players.academyId,
        glowScore: players.glowScore,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
      
      const currentPlayer = currentPlayerResult[0];
      if (!currentPlayer) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      let conditions: any[] = [
        eq(players.status, "active"),
        sql`${players.id} != ${playerId}`,
        not(inArray(players.id, HIDDEN_PLAYER_IDS)),
      ];
      let orderBy = desc(players.glowScore);
      
      if (filter === "academy") {
        // Players in the same academy
        if (academyId) {
          conditions.push(eq(players.academyId, academyId));
        }
      } else if (filter === "sameLevel") {
        // Players with same or similar level (+/- 2 levels)
        const playerLevel = currentPlayer.level || 1;
        conditions.push(sql`${players.level} >= ${Math.max(1, playerLevel - 2)}`);
        conditions.push(sql`${players.level} <= ${playerLevel + 2}`);
        if (academyId) {
          conditions.push(eq(players.academyId, academyId));
        }
        // Order by closest level match, use standard desc for Drizzle compatibility
        orderBy = desc(players.glowScore);
      } else {
        // "recommended" - default: mix of factors
        // Prioritize: same academy, similar level, open to play, recent activity
        if (academyId) {
          conditions.push(eq(players.academyId, academyId));
        }
        // Boost players who are open to play - order by openToPlay first, then glowScore
        orderBy = desc(players.glowScore);
      }
      
      const results = await db.select()
      .from(players)
      .where(and(...conditions))
      .orderBy(desc(players.glowScore))
      .limit(30);
      
      res.json({
        filter,
        players: results.map(p => ({
          id: p.id,
          name: p.name,
          photoUrl: p.profilePhotoUrl,
          level: p.level || 1,
          glowScore: p.glowScore || 0,
          ballLevel: p.ballLevel,
          openToPlay: p.openToPlay || false,
          hasHomeAddress: !!(p.homeAddress && p.homeLat != null && p.homeLng != null),
        })),
      });
    } catch (error) {
      console.error("Error discovering players:", error);
      res.status(500).json({ error: "Failed to discover players" });
    }
  });

  // Get Open to Play players
router.get("/api/player/open-to-play", authMiddleware, requireFeatureUnlock("player_finder"), async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const playerId = req.user!.playerId;
      
      // Build conditions for players query
      const playerConditions = [
        eq(players.status, "active"),
        eq(players.openToPlay, true),
        not(inArray(players.id, HIDDEN_PLAYER_IDS)),
      ];
      if (academyId) {
        playerConditions.push(eq(players.academyId, academyId));
      }
      if (playerId) {
        playerConditions.push(sql`${players.id} != ${playerId}`);
      }
      
      // Get players who are open to play
      const openPlayers = await db.select({
        id: players.id,
        name: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
        level: players.level,
        glowScore: players.glowScore,
        ballLevel: players.ballLevel,
        academyId: players.academyId,
        homeAddress: players.homeAddress,
        homeLat: players.homeLat,
        homeLng: players.homeLng,
      })
      .from(players)
      .where(and(...playerConditions))
      .orderBy(desc(players.glowScore))
      .limit(20);
      
      // Get open to play listings from openToPlayTable if it exists
      let listings: any[] = [];
      try {
        const listingConditions = [
          eq(openToPlayTable.isActive, true),
          gte(openToPlayTable.availableUntil, new Date()),
        ];
        if (academyId) {
          listingConditions.push(eq(openToPlayTable.academyId, academyId));
        }
        
        listings = await db.select({
          id: openToPlayTable.id,
          playerId: openToPlayTable.playerId,
          message: openToPlayTable.message,
          availableUntil: openToPlayTable.availableUntil,
          skillPreference: openToPlayTable.skillPreference,
        })
        .from(openToPlayTable)
        .where(and(...listingConditions))
        .orderBy(desc(openToPlayTable.createdAt))
        .limit(20);
      } catch (e) {
        // Table might not exist
      }
      
      res.json({
        players: openPlayers.map(p => ({
          id: p.id,
          name: p.name,
          photoUrl: p.profilePhotoUrl,
          level: p.level || 1,
          glowScore: p.glowScore || 0,
          ballLevel: p.ballLevel,
          openToPlay: true,
          hasHomeAddress: !!(p.homeAddress && p.homeLat != null && p.homeLng != null),
        })),
        listings,
      });
    } catch (error) {
      console.error("Error fetching open to play:", error);
      res.status(500).json({ error: "Failed to fetch open to play" });
    }
  });

  // ==================== FRIEND CONNECTIONS SYSTEM ====================
  
  // Get player's connections (friends and pending requests)
router.get("/api/player/connections", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }
      
      // Get all connections where player is involved
      const allConnections = await db.select({
        id: playerConnections.id,
        player1Id: playerConnections.player1Id,
        player2Id: playerConnections.player2Id,
        status: playerConnections.status,
        connectionType: playerConnections.connectionType,
        matchesPlayed: playerConnections.matchesPlayed,
        lastPlayedAt: playerConnections.lastPlayedAt,
        createdAt: playerConnections.createdAt,
        acceptedAt: playerConnections.acceptedAt,
      })
      .from(playerConnections)
      .where(or(
        eq(playerConnections.player1Id, playerId),
        eq(playerConnections.player2Id, playerId)
      ))
      .orderBy(desc(playerConnections.createdAt));
      
      // Enrich with player data
      const enrichedConnections = await Promise.all(allConnections.map(async (conn) => {
        const otherId = conn.player1Id === playerId ? conn.player2Id : conn.player1Id;
        const isRequester = conn.player1Id === playerId;
        
        const [otherPlayer] = await db.select({
          id: players.id,
          name: players.name,
          profilePhotoUrl: players.profilePhotoUrl,
          level: players.level,
          glowScore: players.glowScore,
          ballLevel: players.ballLevel,
        academyId: players.academyId,
          openToPlay: players.openToPlay,
        })
        .from(players)
        .where(eq(players.id, otherId));
        
        return {
          id: conn.id,
          status: conn.status,
          connectionType: conn.connectionType,
          matchesPlayed: conn.matchesPlayed || 0,
          lastPlayedAt: conn.lastPlayedAt,
          createdAt: conn.createdAt,
          acceptedAt: conn.acceptedAt,
          isRequester,
          player: otherPlayer ? {
            id: otherPlayer.id,
            name: otherPlayer.name,
            photoUrl: otherPlayer.photoUrl,
            level: otherPlayer.level || 1,
            glowScore: otherPlayer.glowScore || 0,
            ballLevel: otherPlayer.ballLevel,
            openToPlay: otherPlayer.openToPlay,
          } : null,
        };
      }));
      
      // Separate by status
      const friends = enrichedConnections.filter(c => c.status === "accepted");
      const pendingReceived = enrichedConnections.filter(c => c.status === "pending" && !c.isRequester);
      const pendingSent = enrichedConnections.filter(c => c.status === "pending" && c.isRequester);
      
      res.json({
        friends,
        pendingReceived,
        pendingSent,
        totalFriends: friends.length,
        totalPending: pendingReceived.length,
      });
    } catch (error) {
      console.error("Error fetching connections:", error);
      res.status(500).json({ error: "Failed to fetch connections" });
    }
  });
  
  // Send friend request
router.post("/api/player/connections/request", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "You need a player profile to send friend requests. Switch to a player account to connect with other players." });
      }

      const { targetPlayerId } = req.body;
      if (!targetPlayerId || typeof targetPlayerId !== "string") {
        return res.status(400).json({ error: "Target player ID required" });
      }

      if (targetPlayerId === playerId) {
        return res.status(400).json({ error: "You can't send a friend request to yourself" });
      }

      // Validate target player exists
      const [targetPlayer] = await db
        .select({ id: players.id, name: players.name })
        .from(players)
        .where(eq(players.id, targetPlayerId))
        .limit(1);

      if (!targetPlayer) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Look up requester for notification text
      const [requester] = await db
        .select({ id: players.id, name: players.name })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      // Check if connection already exists
      const existingConnection = await db.select()
        .from(playerConnections)
        .where(or(
          and(eq(playerConnections.player1Id, playerId), eq(playerConnections.player2Id, targetPlayerId)),
          and(eq(playerConnections.player1Id, targetPlayerId), eq(playerConnections.player2Id, playerId))
        ))
        .limit(1);

      if (existingConnection.length > 0) {
        const existing = existingConnection[0];
        if (existing.status === "accepted") {
          return res.status(409).json({ error: "You're already friends with this player" });
        }
        if (existing.status === "pending") {
          const isRequester = existing.player1Id === playerId;
          return res.status(409).json({
            error: isRequester
              ? "Friend request already sent"
              : `${targetPlayer.name} already sent you a friend request — check your connections to respond`,
          });
        }
      }

      // Create new connection request
      const [newConnection] = await db.insert(playerConnections)
        .values({
          player1Id: playerId,
          player2Id: targetPlayerId,
          status: "pending",
          connectionType: "friend",
        })
        .returning();

      fireQuestEvent(playerId, "send_connection").catch(() => {});

      // Check token availability synchronously so we can tell the sender whether
      // the recipient will get an instant push or only sees it on next app open.
      let recipientHasPushTokens = false;
      try {
        const tokens = await getPlayerPushTokens(targetPlayerId);
        recipientHasPushTokens = tokens.length > 0;

        // Notify the receiver (push + in-app). Don't block the response on this.
        // sendFriendRequestNotification only stores an in-app notification when the
        // receiver has push tokens, so fall back to a direct insert otherwise.
        (async () => {
          try {
            if (recipientHasPushTokens) {
              await sendFriendRequestNotification(targetPlayerId, requester?.name || "A player");
            } else {
              await db.insert(playerNotifications).values({
                playerId: targetPlayerId,
                title: "Friend Request",
                body: `${requester?.name || "A player"} wants to connect with you`,
                type: "friend_request",
                data: { connectionId: newConnection.id, fromPlayerId: playerId },
              });
            }
          } catch (err) {
            console.error("[FriendRequest] Failed to send notification:", err);
          }
        })();
      } catch (err) {
        console.error("[FriendRequest] Failed to look up push tokens:", err);
      }

      res.json({ success: true, connection: newConnection, recipientHasPushTokens });
    } catch (error) {
      console.error("Error sending friend request:", error);
      res.status(500).json({ error: "Something went wrong sending the friend request. Please try again." });
    }
  });
  
  // Accept or decline friend request
router.post("/api/player/connections/:connectionId/respond", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }
      
      const { connectionId } = req.params;
      const { action } = req.body; // "accept" or "decline"
      
      if (!["accept", "decline"].includes(action)) {
        return res.status(400).json({ error: "Invalid action" });
      }
      
      // Get the connection
      const [connection] = await db.select()
        .from(playerConnections)
        .where(eq(playerConnections.id, connectionId));
      
      if (!connection) {
        return res.status(404).json({ error: "Connection not found" });
      }
      
      // Only the receiver (player2) can respond
      if (connection.player2Id !== playerId) {
        return res.status(403).json({ error: "Not authorized to respond to this request" });
      }
      
      if (connection.status !== "pending") {
        return res.status(400).json({ error: "Request already responded to" });
      }
      
      if (action === "accept") {
        await db.update(playerConnections)
          .set({ status: "accepted", acceptedAt: new Date() })
          .where(eq(playerConnections.id, connectionId));

        // Notify the original requester that their request was accepted
        try {
          const [accepter] = await db
            .select({ name: players.name })
            .from(players)
            .where(eq(players.id, playerId))
            .limit(1);

          const requesterTokens = await getPlayerPushTokens(connection.player1Id);
          if (requesterTokens.length > 0) {
            await sendPushNotification(
              requesterTokens,
              "Friend Request Accepted",
              `${accepter?.name || "A player"} accepted your friend request`,
              { type: "friend_request_accepted", playerId: connection.player1Id, screen: "FriendsList" }
            );
          } else {
            // Still record an in-app notification even when no push tokens
            await db.insert(playerNotifications).values({
              playerId: connection.player1Id,
              title: "Friend Request Accepted",
              body: `${accepter?.name || "A player"} accepted your friend request`,
              type: "friend_request_accepted",
              data: { connectionId, otherPlayerId: playerId },
            });
          }
        } catch (notifyErr) {
          console.error("[FriendRequest] Failed to send accept notification:", notifyErr);
        }
      } else {
        await db.delete(playerConnections)
          .where(eq(playerConnections.id, connectionId));
      }

      res.json({ success: true, action });
    } catch (error) {
      console.error("Error responding to friend request:", error);
      res.status(500).json({ error: "Failed to respond to friend request" });
    }
  });
  
  // Remove friend connection
router.delete("/api/player/connections/:connectionId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }
      
      const { connectionId } = req.params;
      
      // Get the connection
      const [connection] = await db.select()
        .from(playerConnections)
        .where(eq(playerConnections.id, connectionId));
      
      if (!connection) {
        return res.status(404).json({ error: "Connection not found" });
      }
      
      // Either player can remove the connection
      if (connection.player1Id !== playerId && connection.player2Id !== playerId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      await db.delete(playerConnections)
        .where(eq(playerConnections.id, connectionId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing connection:", error);
      res.status(500).json({ error: "Failed to remove connection" });
    }
  });
  
  // Check connection status with a specific player
router.get("/api/player/connections/status/:targetPlayerId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        // Coach-only / platform-owner accounts can view profiles but can't form
        // friend connections. Return a clear non-error state so the UI can
        // disable the Add Friend button with an explanatory message instead of
        // silently looking like an unconnected player.
        return res.json({
          status: "unavailable",
          connectionId: null,
          isRequester: false,
          reason: "no_player_profile",
        });
      }

      const { targetPlayerId } = req.params;
      
      const [connection] = await db.select()
        .from(playerConnections)
        .where(or(
          and(eq(playerConnections.player1Id, playerId), eq(playerConnections.player2Id, targetPlayerId)),
          and(eq(playerConnections.player1Id, targetPlayerId), eq(playerConnections.player2Id, playerId))
        ))
        .limit(1);
      
      if (!connection) {
        return res.json({ status: "none", connectionId: null });
      }
      
      const isRequester = connection.player1Id === playerId;
      res.json({
        status: connection.status,
        connectionId: connection.id,
        isRequester,
      });
    } catch (error) {
      console.error("Error checking connection status:", error);
      res.status(500).json({ error: "Failed to check connection status" });
    }
  });

  // ==================== DELETE ACCOUNT REQUEST API ====================
  // Public endpoint - no auth required
router.post("/api/delete-account-request", authLimiter, async (req: Request, res: Response) => {
    try {
      const { email, name, reason, comments } = req.body;
      
      if (!email || !name) {
        return res.status(400).json({ error: "Email and name are required" });
      }
      
      // Import and use the email service
      const { sendDeleteAccountRequestEmail } = await import("../emailService");
      
      const result = await sendDeleteAccountRequestEmail({
        userEmail: email,
        userName: name,
        reason,
        comments,
      });
      
      if (result.success) {
        res.json({ success: true, message: "Deletion request submitted successfully" });
      } else {
        console.error("Failed to send delete account email:", result.error);
        // Still return success to user - we'll handle manually if email fails
        res.json({ success: true, message: "Deletion request submitted" });
      }
    } catch (error) {
      console.error("Error processing delete account request:", error);
      res.status(500).json({ error: "Failed to submit deletion request" });
    }
  });

  // Admin endpoint to fix vacation attendance debts retroactively
router.post("/api/admin/fix-vacation-debts", authMiddleware, requireRole("platform_owner"), async (req: Request, res: Response) => {
    try {
      console.log("[VacationDebtFix] Starting retroactive vacation debt cancellation...");
      
      // Find all session_players records with vacation status
      const vacationRecords = await db
        .select({
          sessionId: sessionPlayers.sessionId,
          playerId: sessionPlayers.playerId,
          status: sessionPlayers.attendanceStatus,
        })
        .from(sessionPlayers)
        .where(eq(sessionPlayers.attendanceStatus, "vacation"));
      
      console.log(`[VacationDebtFix] Found ${vacationRecords.length} vacation attendance records`);
      
      let totalCancelled = 0;
      const results: { playerId: string; sessionId: string; creditsRestored: number }[] = [];
      
      for (const record of vacationRecords) {
        if (!record.playerId || !record.sessionId) continue;
        
        const cancelResult = await storage.cancelSessionDebt(record.playerId, record.sessionId);
        if (cancelResult.cancelled) {
          totalCancelled += cancelResult.amount;
          results.push({
            playerId: record.playerId,
            sessionId: record.sessionId,
            creditsRestored: cancelResult.amount
          });
          console.log(`[VacationDebtFix] Cancelled ${cancelResult.amount} debt for player ${record.playerId} session ${record.sessionId}`);
        }
      }
      
      console.log(`[VacationDebtFix] Complete. Total credits restored: ${totalCancelled}`);
      
      res.json({
        success: true,
        message: `Fixed vacation debts for ${results.length} records`,
        totalCreditsRestored: totalCancelled,
        details: results
      });
    } catch (error) {
      console.error("[VacationDebtFix] Error:", error);
      res.status(500).json({ error: "Failed to fix vacation debts" });
    }
  });


  // Admin endpoint to recalculate V3 debt based on actual attendance (excluding vacation)
router.post("/api/admin/recalculate-v3-debts", authMiddleware, requireRole("platform_owner"), async (req: Request, res: Response) => {
    try {
      console.log("[V3DebtFix] Starting recalculation of V3 debts...");
      
      const v3Debts = await db.select().from(creditTransactions)
        .where(and(
          eq(creditTransactions.reason, "session_debt"),
          isNull(creditTransactions.sessionId)
        ));
      
      console.log(`[V3DebtFix] Found ${v3Debts.length} V3 debt transactions to review`);
      
      const results: { playerId: string; creditType: string; oldDebt: number; newDebt: number; change: number }[] = [];
      
      for (const debt of v3Debts) {
        if (!debt.playerId) continue;
        
        const creditType = debt.creditType || "group";
        const oldDebtAmount = Math.abs(debt.amount);
        
        const sessionTypesForCredit = creditType === "group" 
          ? ["group"]
          : creditType === "semi_private" 
            ? ["semi_private", "semi-private"]
            : ["private"];
        
        const presentSessions = await db
          .select({ count: sql<number>`count(*)` })
          .from(sessionPlayers)
          .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
          .where(and(
            eq(sessionPlayers.playerId, debt.playerId),
            eq(sessionPlayers.attendanceStatus, "present"),
            inArray(sessions.sessionType, sessionTypesForCredit)
          ));
        
        const presentCount = Number(presentSessions[0]?.count || 0);
        
        const playerPackages = await db.select({
          totalCredits: sql<number>`COALESCE(SUM(total_credits), 0)`
        }).from(packages)
          .where(and(
            eq(packages.playerId, debt.playerId),
            eq(packages.creditType, creditType)
          ));
        
        const totalPurchased = Number(playerPackages[0]?.totalCredits || 0);
        const newDebtAmount = Math.max(0, presentCount - totalPurchased);
        const change = oldDebtAmount - newDebtAmount;
        
        if (change !== 0) {
          if (newDebtAmount === 0) {
            await db.update(creditTransactions)
              .set({
                amount: 0,
                metadata: {
                  ...(debt.metadata as Record<string, unknown> || {}),
                  cancelled: true,
                  recalculatedAt: new Date().toISOString(),
                  oldAmount: debt.amount,
                  reason: "v3_debt_recalculation"
                }
              })
              .where(eq(creditTransactions.id, debt.id));
          } else {
            await db.update(creditTransactions)
              .set({
                amount: -newDebtAmount,
                metadata: {
                  ...(debt.metadata as Record<string, unknown> || {}),
                  recalculatedAt: new Date().toISOString(),
                  oldAmount: debt.amount,
                  presentCount,
                  totalPurchased,
                  reason: "v3_debt_recalculation"
                }
              })
              .where(eq(creditTransactions.id, debt.id));
          }
          
          results.push({
            playerId: debt.playerId,
            creditType,
            oldDebt: oldDebtAmount,
            newDebt: newDebtAmount,
            change
          });
          
          console.log(`[V3DebtFix] Player ${debt.playerId.slice(0, 8)}: ${creditType} debt ${oldDebtAmount} -> ${newDebtAmount} (change: ${change})`);
        }
      }
      
      console.log(`[V3DebtFix] Complete. Updated ${results.length} debt records`);
      
      res.json({
        success: true,
        message: `Recalculated ${results.length} V3 debt records`,
        totalCreditsRestored: results.reduce((sum, r) => sum + r.change, 0),
        details: results
      });
    } catch (error) {
      console.error("[V3DebtFix] Error:", error);
      res.status(500).json({ error: "Failed to recalculate V3 debts" });
    }
  });


  // Admin endpoint to subtract vacation sessions from V3 debts
router.post("/api/admin/fix-vacation-v3-debts", authMiddleware, requireRole("platform_owner"), async (req: Request, res: Response) => {
    try {
      console.log("[VacationV3Fix] Starting vacation debt adjustment...");
      
      const v3Debts = await db.select().from(creditTransactions)
        .where(and(
          eq(creditTransactions.reason, "session_debt"),
          isNull(creditTransactions.sessionId)
        ));
      
      console.log(`[VacationV3Fix] Found ${v3Debts.length} V3 debt transactions`);
      
      const results: { playerId: string; creditType: string; oldDebt: number; newDebt: number; vacationCount: number }[] = [];
      
      for (const debt of v3Debts) {
        if (!debt.playerId) continue;
        
        const meta = debt.metadata as Record<string, unknown> | null;
        if (meta?.cancelled) continue;
        
        const creditType = debt.creditType || "group";
        const oldDebtAmount = Math.abs(debt.amount);
        
        const sessionTypesForCredit = creditType === "group" 
          ? ["group"]
          : creditType === "semi_private" 
            ? ["semi_private", "semi-private"]
            : ["private"];
        
        const vacationSessions = await db
          .select({ count: sql<number>`count(*)` })
          .from(sessionPlayers)
          .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
          .where(and(
            eq(sessionPlayers.playerId, debt.playerId),
            eq(sessionPlayers.attendanceStatus, "vacation"),
            inArray(sessions.sessionType, sessionTypesForCredit)
          ));
        
        const vacationCount = Number(vacationSessions[0]?.count || 0);
        
        if (vacationCount === 0) continue;
        
        const newDebtAmount = Math.max(0, oldDebtAmount - vacationCount);
        
        if (newDebtAmount === 0) {
          await db.update(creditTransactions)
            .set({
              amount: 0,
              metadata: {
                ...(meta || {}),
                cancelled: true,
                vacationAdjustment: vacationCount,
                adjustedAt: new Date().toISOString(),
                oldAmount: debt.amount,
              }
            })
            .where(eq(creditTransactions.id, debt.id));
        } else {
          await db.update(creditTransactions)
            .set({
              amount: -newDebtAmount,
              metadata: {
                ...(meta || {}),
                vacationAdjustment: vacationCount,
                adjustedAt: new Date().toISOString(),
                oldAmount: debt.amount,
              }
            })
            .where(eq(creditTransactions.id, debt.id));
        }
        
        results.push({
          playerId: debt.playerId,
          creditType,
          oldDebt: oldDebtAmount,
          newDebt: newDebtAmount,
          vacationCount
        });
        
        console.log(`[VacationV3Fix] Player ${debt.playerId.slice(0, 8)}: ${creditType} debt ${oldDebtAmount} -> ${newDebtAmount} (vacations: ${vacationCount})`);
      }
      
      console.log(`[VacationV3Fix] Complete. Adjusted ${results.length} debt records`);
      
      res.json({
        success: true,
        message: `Adjusted ${results.length} V3 debt records for vacation sessions`,
        totalCreditsRestored: results.reduce((sum, r) => sum + (r.oldDebt - r.newDebt), 0),
        details: results
      });
    } catch (error) {
      console.error("[VacationV3Fix] Error:", error);
      res.status(500).json({ error: "Failed to fix vacation V3 debts" });
    }
  });


  // Admin endpoint to recalculate all player debts from scratch based on actual session attendance
router.post("/api/admin/recalculate-all-debts", authMiddleware, requireRole("platform_owner"), async (req: Request, res: Response) => {
    try {
      console.log("[RecalculateDebts] Starting full recalculation of all player debts...");
      
      const sessionsNeedingDebt = await db.execute(sql`
        SELECT 
          sp.id as session_player_id,
          sp.player_id,
          sp.session_id,
          sp.attendance_status,
          sp.credit_deducted_at,
          sp.credit_transaction_id,
          s.session_type,
          s.academy_id,
          s.start_time as session_date
        FROM session_players sp
        JOIN sessions s ON s.id = sp.session_id
        WHERE sp.attendance_status IN ('present', 'late')
          AND s.status = 'completed'
        ORDER BY sp.player_id, s.start_time
      `);
      
      console.log(`[RecalculateDebts] Found ${sessionsNeedingDebt.rows.length} present/late session records`);
      
      const v3DebtsResult = await db.execute(sql`
        UPDATE credit_transactions 
        SET amount = 0,
            metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb), 
              '{cancelled}', 
              'true'::jsonb
            ) || jsonb_build_object('cancelledAt', NOW()::text, 'cancelReason', 'recalculate_all_debts')
        WHERE reason = 'session_debt' 
          AND session_id IS NULL
          AND (metadata->>'cancelled')::boolean IS NOT TRUE
        RETURNING id
      `);
      
      console.log(`[RecalculateDebts] Cancelled ${v3DebtsResult.rows.length} V3 aggregated debt records`);
      
      const playerDebts: Map<string, Map<string, { playerId: string; creditType: string; sessions: any[] }>> = new Map();
      
      for (const row of sessionsNeedingDebt.rows as any[]) {
        const playerId = row.player_id;
        const sessionType = row.session_type || "group";
        const creditType = sessionType.includes("private") && !sessionType.includes("semi") 
          ? "private" 
          : sessionType.includes("semi") 
            ? "semi_private" 
            : "group";
        
        if (!playerDebts.has(playerId)) {
          playerDebts.set(playerId, new Map());
        }
        
        const playerMap = playerDebts.get(playerId)!;
        if (!playerMap.has(creditType)) {
          playerMap.set(creditType, { playerId, creditType, sessions: [] });
        }
        
        playerMap.get(creditType)!.sessions.push(row);
      }
      
      const results: { playerId: string; creditType: string; presentCount: number; availableCredits: number; debtCreated: number }[] = [];
      
      for (const [playerId, creditTypes] of playerDebts) {
        for (const [creditType, data] of creditTypes) {
          const packagesResult = await db.execute(sql`
            SELECT COALESCE(SUM(remaining_credits), 0) as total_credits
            FROM packages 
            WHERE player_id = ${playerId}
              AND status = 'active'
              AND (credit_type = ${creditType} OR credit_type IS NULL)
          `);
          
          const consumedResult = await db.execute(sql`
            SELECT COUNT(*) as consumed
            FROM credit_transactions
            WHERE player_id = ${playerId}
              AND credit_type = ${creditType}
              AND reason = 'session_consumed'
              AND package_id IS NOT NULL
          `);
          
          const availableCredits = Number((packagesResult.rows[0] as any)?.total_credits || 0);
          const alreadyConsumed = Number((consumedResult.rows[0] as any)?.consumed || 0);
          const presentCount = data.sessions.length;
          const totalCreditsEver = availableCredits + alreadyConsumed;
          const debtAmount = Math.max(0, presentCount - totalCreditsEver);
          
          if (debtAmount > 0) {
            // Task #685 Phase 4 — V1 retired. The legacy `credit_transactions`
            // recalc-debt insert no longer runs; V2 owes are derived from
            // credit_ledger_v2 and don't need a debit row to be materialised.
            console.log(`[RecalculateDebts] Player ${playerId.slice(0,8)}: ${creditType} debt = ${debtAmount} (present: ${presentCount}, credits: ${totalCreditsEver}) — V1 retired, no insert.`);
          }
          
          results.push({
            playerId,
            creditType,
            presentCount,
            availableCredits: totalCreditsEver,
            debtCreated: debtAmount
          });
        }
      }
      
      const totalDebtCreated = results.reduce((sum, r) => sum + r.debtCreated, 0);
      console.log(`[RecalculateDebts] Complete. Created ${totalDebtCreated} total debt across ${results.filter(r => r.debtCreated > 0).length} player/type combos`);
      
      res.json({
        success: true,
        message: `Recalculated debts for ${playerDebts.size} players`,
        v3DebtsCancelled: v3DebtsResult.rows.length,
        totalDebtCreated,
        details: results.filter(r => r.debtCreated > 0)
      });
    } catch (error) {
      console.error("[RecalculateDebts] Error:", error);
      res.status(500).json({ error: "Failed to recalculate debts" });
    }
  });


  // Admin Dashboard Operations - Operational focus for daily management
router.get("/api/admin/dashboard/operations", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const academy = await storage.getAcademy(academyId);
      const settings = await storage.getAcademySettings(academyId);
      const players = await storage.getPlayersByAcademy(academyId);
      const coaches = await storage.getCoachesByAcademy(academyId);
      const allSessions = await storage.getSessionsByAcademy(academyId);

      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date();
      const DUBAI_OFFSET = 4;
      
      const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const todayStart = new Date(dubaiNow);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(dubaiNow);
      todayEnd.setHours(23, 59, 59, 999);

      const todaySessions = allSessions.filter((s: any) => {
        const sessionDate = new Date(s.startTime);
        return sessionDate >= todayStart && sessionDate <= todayEnd;
      });

      const completedToday = todaySessions.filter((s: any) => s.status === "completed");
      const inProgressToday = todaySessions.filter((s: any) => s.status === "in_progress");
      const upcomingToday = todaySessions.filter((s: any) => {
        const sessionStart = new Date(s.startTime);
        return s.status !== "completed" && s.status !== "in_progress" && sessionStart > now;
      });

      const activeCoachIds = new Set(inProgressToday.map((s: any) => s.coachId));
      const activeCoachesNow = coaches.filter((c: any) => activeCoachIds.has(c.id)).length;

      const nextSession = upcomingToday[0];
      const nextSessionIn = nextSession 
        ? Math.max(0, Math.floor((new Date(nextSession.startTime).getTime() - now.getTime()) / 60000))
        : 0;

      const sessionQueue = todaySessions.slice(0, 10).map((s: any) => {
        const coach = coaches.find((c: any) => c.id === s.coachId);
        const sessionPlayers = players.filter((p: any) => p.coachId === s.coachId);
        const sessionTime = new Date(s.startTime);
        
        let status: "upcoming" | "in_progress" | "completed" = "upcoming";
        if (s.status === "completed") status = "completed";
        else if (s.status === "in_progress") status = "in_progress";
        else if (sessionTime <= now) status = "in_progress";
        
        return {
          id: s.id,
          title: s.title || "Training Session",
          time: sessionTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
          coachName: coach?.name || "Unassigned",
          playerCount: sessionPlayers.length,
          status,
        };
      });

      const checkIns = todaySessions.slice(0, 5).map((s: any, idx: number) => {
        const player = players[idx % players.length];
        return {
          id: `checkin-${s.id}-${idx}`,
          playerName: player?.name || "Player",
          sessionTitle: s.title || "Training Session",
          time: new Date(s.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
          status: idx < 2 ? "pending" as const : "confirmed" as const,
        };
      });

      const taskAlerts: any[] = [];
      
      const unpaidPlayers = players.filter((p: any) => (p.balanceDue || 0) > 0);
      unpaidPlayers.slice(0, 2).forEach((p: any) => {
        taskAlerts.push({
          id: `payment-${p.id}`,
          type: "payment",
          title: "Outstanding Payment",
          description: `${p.name} - ${settings?.currency || "AED"} ${p.balanceDue || 0}`,
          actionLabel: "Remind",
        });
      });

      if (upcomingToday.length > 0 && nextSessionIn < 15) {
        taskAlerts.push({
          id: "session-starting",
          type: "urgent",
          title: "Session Starting Soon",
          description: `${upcomingToday[0].title || "Session"} starts in ${nextSessionIn} minutes`,
          actionLabel: "View",
        });
      }

      const currency = settings?.currency || "AED";

      res.json({
        academy: academy ? {
          id: academy.id,
          name: academy.name,
          currency,
        } : null,
        liveStats: {
          activeSessions: inProgressToday.length,
          waitingCheckIns: checkIns.filter(c => c.status === "pending").length,
          activeCoaches: activeCoachesNow,
          nextSessionIn,
        },
        todayOperations: {
          totalSessions: todaySessions.length,
          completedSessions: completedToday.length,
          inProgressSessions: inProgressToday.length,
          upcomingSessions: upcomingToday.length,
        },
        sessionQueue,
        checkIns,
        taskAlerts,
        quickStats: {
          todayPlayers: Math.min(todaySessions.length * 3, players.length),
          todayCoaches: coaches.filter((c: any) => c.isActive !== false).length,
          attendanceRate: (() => { const nonCancelled = todaySessions.filter((s: any) => s.status !== "cancelled"); return nonCancelled.length > 0 ? Math.round((completedToday.length / nonCancelled.length) * 100) : 0; })(),
          completedSessions: completedToday.length,
        },
      });
    } catch (error) {
      console.error("Admin operations dashboard error:", error);
      res.status(500).json({ error: "Failed to fetch operations dashboard data" });
    }
  });

  // Demo data seed endpoint for TheLaw (Play Store mockups)
router.post("/api/admin/seed-demo-data", adminRepairLimiter, authMiddleware, requireRole("platform_owner"), async (req: AuthRequest, res: Response) => {
    try {

      const { seedDemoDataForTheLaw } = await import("../seeds/demo-data-seed");
      const result = await seedDemoDataForTheLaw();
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("Demo seed error:", error);
      res.status(500).json({ error: "Failed to seed demo data" });
    }
  });


router.post("/api/admin/repair-private-adjusted", adminRepairLimiter, authMiddleware, requireRole("admin", "platform_owner"), async (req: Request, res: Response) => {
    try {
      console.log('[RepairPrivateAdjusted] Starting repair of wrongly charged absent players in private_adjusted sessions...');

      const badTransactions = await db.execute(sql`
        SELECT ct.id as transaction_id, ct.player_id, ct.session_id, ct.amount, ct.credit_type,
               sp.id as session_player_id, sp.attendance_status, sp.credit_deducted_at,
               s.session_type, cs.session_type as series_type
        FROM credit_transactions ct
        JOIN session_players sp ON sp.session_id = ct.session_id AND sp.player_id = ct.player_id
        JOIN sessions s ON s.id = ct.session_id
        LEFT JOIN coaching_series cs ON cs.id = s.series_id
        WHERE s.session_type = 'private_adjusted'
          AND sp.attendance_status = 'absent'
          AND ct.type = 'debit'
          AND (ct.metadata IS NULL OR (ct.metadata->>'cancelled')::boolean IS NOT TRUE)
          AND (cs.session_type = 'semi_private' OR (cs.session_type IS NULL AND (
            SELECT COUNT(*) FROM session_players sp2 WHERE sp2.session_id = s.id
          ) >= 2))
      `);

      const rows = badTransactions.rows as any[];
      console.log(`[RepairPrivateAdjusted] Found ${rows.length} bad transactions to fix`);

      let transactionsCancelled = 0;
      let sessionPlayersReset = 0;
      const details: any[] = [];

      for (const row of rows) {
        await db.execute(sql`
          UPDATE credit_transactions
          SET amount = 0,
              metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{cancelled}',
                'true'::jsonb
              ) || jsonb_build_object(
                'cancelledAt', NOW()::text,
                'cancelReason', 'repair_private_adjusted_absent_semi_private'
              )
          WHERE id = ${row.transaction_id}
        `);
        transactionsCancelled++;

        await db.execute(sql`
          UPDATE session_players
          SET credit_deducted_at = NULL, credit_transaction_id = NULL
          WHERE id = ${row.session_player_id}
        `);
        sessionPlayersReset++;

        details.push({
          transactionId: row.transaction_id,
          playerId: row.player_id,
          sessionId: row.session_id,
          originalCreditType: row.credit_type,
          seriesType: row.series_type,
        });
      }

      console.log(`[RepairPrivateAdjusted] Complete: ${transactionsCancelled} transactions cancelled, ${sessionPlayersReset} session_players reset`);
      res.json({
        success: true,
        transactionsCancelled,
        sessionPlayersReset,
        details,
      });
    } catch (error: any) {
      console.error('[RepairPrivateAdjusted] Error:', error);
      res.status(500).json({ error: 'Repair failed. Check server logs for details.' });
    }
  });

  // One-time fix: repair series titles with "undefined" and merge duplicate flexible series
router.post("/api/admin/fix-series-titles-and-merge", adminRepairLimiter, authMiddleware, requireRole("admin", "platform_owner"), async (req: Request, res: Response) => {
    try {
      console.log("[SeriesFix] Starting series title repair and merge...");
      const fixes: string[] = [];
      
      // 1. Find all series with "undefined" in their title
      const allSeries = await db.select().from(coachingSeries);
      const undefinedSeries = allSeries.filter(s => s.title && s.title.includes("undefined"));
      
      for (const s of undefinedSeries) {
        // Get players in this series
        const sPlayers = await storage.getSeriesPlayers(s.id);
        const activePlayerIds = sPlayers.filter((p: any) => p.status === "active").map((p: any) => p.playerId);
        
        let playerNameSuffix = "";
        if (activePlayerIds.length > 0) {
          const playerNames = await Promise.all(activePlayerIds.map(async (pid: string) => {
            const p = await storage.getPlayer(pid);
            return p?.name?.split(" ")[0] || "Player";
          }));
          playerNameSuffix = ` - ${playerNames.join(", ")}`;
        }
        
        const sessionTypeLabels: Record<string, string> = {
          private: "Private Lesson",
          semi_private: "Semi-Private",
          group: "Group Session",
          physical: "Physical Training",
          activity: "Activity",
        };
        
        const newTitle = `${sessionTypeLabels[s.sessionType || ""] || s.sessionType || "Session"}${playerNameSuffix}`;
        
        await db.update(coachingSeries)
          .set({ title: newTitle })
          .where(eq(coachingSeries.id, s.id));
        
        fixes.push(`Renamed "${s.title}" → "${newTitle}" (ID: ${s.id})`);
      }
      
      // 2. Find and merge duplicate flexible series (same coach + same players + same session type)
      const activeSeries = allSeries.filter(s => s.status === "active" && s.dayOfWeek === -1);
      
      // Group by coach + session type
      const seriesByKey: Record<string, typeof activeSeries> = {};
      for (const s of activeSeries) {
        const key = `${s.coachId}_${s.sessionType}`;
        if (!seriesByKey[key]) seriesByKey[key] = [];
        seriesByKey[key].push(s);
      }
      
      for (const [key, group] of Object.entries(seriesByKey)) {
        if (group.length <= 1) continue;
        
        // For each pair, check if they share the same players
        const seriesWithPlayers = await Promise.all(group.map(async (s) => {
          const sPlayers = await storage.getSeriesPlayers(s.id);
          const activeIds = sPlayers.filter((p: any) => p.status === "active").map((p: any) => p.playerId).sort();
          return { series: s, playerIds: activeIds };
        }));
        
        // Group by sorted player IDs
        const byPlayers: Record<string, typeof seriesWithPlayers> = {};
        for (const swp of seriesWithPlayers) {
          const pKey = swp.playerIds.join(",");
          if (!byPlayers[pKey]) byPlayers[pKey] = [];
          byPlayers[pKey].push(swp);
        }
        
        for (const [pKey, duplicates] of Object.entries(byPlayers)) {
          if (duplicates.length <= 1 || pKey === "") continue;
          
          // Keep the first one (oldest), merge others into it
          const primary = duplicates[0];
          const toMerge = duplicates.slice(1);
          
          for (const dup of toMerge) {
            // Move all sessions from duplicate to primary
            const dupSessions = await db.select().from(sessions)
              .where(eq(sessions.seriesId, dup.series.id));
            
            for (const sess of dupSessions) {
              await db.update(sessions)
                .set({ seriesId: primary.series.id })
                .where(eq(sessions.id, sess.id));
            }
            
            // Archive the duplicate series
            await db.update(coachingSeries)
              .set({ status: "ended" })
              .where(eq(coachingSeries.id, dup.series.id));
            
            fixes.push(`Merged series "${dup.series.title}" (ID: ${dup.series.id}) → "${primary.series.title}" (ID: ${primary.series.id}), moved ${dupSessions.length} sessions`);
          }
          
          // Update primary series weekCount based on actual sessions
          const allPrimarySessions = await db.select().from(sessions)
            .where(eq(sessions.seriesId, primary.series.id));
          
          // Update end date to latest session
          let latestDate = primary.series.seriesEndDate;
          for (const sess of allPrimarySessions) {
            const sessDate = sess.startTime ? new Date(sess.startTime).toISOString().split('T')[0] : null;
            if (sessDate && (!latestDate || sessDate > latestDate)) {
              latestDate = sessDate;
            }
          }
          
          await db.update(coachingSeries)
            .set({ 
              weekCount: allPrimarySessions.length,
              seriesEndDate: latestDate,
            })
            .where(eq(coachingSeries.id, primary.series.id));
        }
      }
      
      console.log(`[SeriesFix] Completed. ${fixes.length} changes made.`);
      res.json({ success: true, fixes });
    } catch (error: any) {
      console.error("[SeriesFix] Error:", error);
      res.status(500).json({ error: "Fix failed. Check server logs for details." });
    }
  });
  
  // Get academy players for spotlight nomination
router.get("/api/player/spotlight/academy-players", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const playerId = req.user?.playerId;
      if (!academyId) return res.status(400).json({ error: "No academy" });
      
      const academyPlayers = await db
        .select({
          id: players.id,
          name: players.name,
          profilePhotoUrl: players.profilePhotoUrl,
          level: players.level,
          ballLevel: players.ballLevel,
        })
        .from(players)
        .where(and(
          eq(players.academyId, academyId),
          ne(players.id, playerId || "")
        ))
        .orderBy(asc(players.name));
      
      res.json(academyPlayers);
    } catch (error: any) {
      console.error("[Spotlight] Get academy players error:", error);
      res.status(500).json({ error: "Failed to get players" });
    }
  });


  
  // DIAGNOSTIC: Check credit processing status for a specific player's semi-private sessions
router.get("/api/admin/credits/diagnose/:playerId", adminRepairLimiter, authMiddleware, requireRole("admin", "platform_owner"), async (req: AuthRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      
      // 1. Get all completed sessions where this player participated
      const sessionData = await db.execute(sql`
        SELECT 
          sp.id as session_player_id,
          sp.session_id,
          sp.player_id,
          sp.attendance_status,
          sp.credit_deducted_at,
          sp.credit_transaction_id,
          s.session_type,
          s.status as session_status,
          s.start_time,
          s.series_id,
          cs.session_type as series_session_type,
          cs.title as series_title
        FROM session_players sp
        JOIN sessions s ON s.id = sp.session_id
        LEFT JOIN coaching_series cs ON cs.id = s.series_id
        WHERE sp.player_id = ${playerId}
          AND s.status = 'completed'
        ORDER BY s.start_time DESC
      `);
      
      // 2. Get credit transactions for this player
      const transactions = await db.execute(sql`
        SELECT id, session_id, session_player_id, type, credit_type, amount, reason, created_at, package_id
        FROM credit_transactions 
        WHERE player_id = ${playerId}
        ORDER BY created_at DESC
      `);
      
      // 3. Get packages for this player
      const packages = await db.execute(sql`
        SELECT id, credit_type, total_credits, remaining_credits, status, expiry_date
        FROM packages 
        WHERE player_id = ${playerId}
        ORDER BY created_at DESC
      `);
      
      // 4. Analyze
      const sessions = sessionData.rows as any[];
      const semiPrivateSessions = sessions.filter((s: any) => 
        s.series_session_type === 'semi_private' || s.session_type === 'semi_private'
      );
      const semiPrivateWithCredit = semiPrivateSessions.filter((s: any) => s.credit_deducted_at);
      const semiPrivateWithoutCredit = semiPrivateSessions.filter((s: any) => !s.credit_deducted_at);
      const privateSessions = sessions.filter((s: any) => 
        s.session_type === 'private' || s.session_type === 'private_adjusted'
      );
      const groupSessions = sessions.filter((s: any) => s.session_type === 'group');
      
      res.json({
        playerId,
        summary: {
          totalCompletedSessions: sessions.length,
          semiPrivate: {
            total: semiPrivateSessions.length,
            creditDeducted: semiPrivateWithCredit.length,
            creditMissing: semiPrivateWithoutCredit.length,
          },
          private: { total: privateSessions.length },
          group: { total: groupSessions.length },
        },
        missingSemiPrivateCredits: semiPrivateWithoutCredit.map((s: any) => ({
          sessionPlayerId: s.session_player_id,
          sessionId: s.session_id,
          sessionType: s.session_type,
          seriesType: s.series_session_type,
          attendanceStatus: s.attendance_status,
          startTime: s.start_time,
          seriesTitle: s.series_title,
        })),
        packages: packages.rows,
        recentTransactions: (transactions.rows as any[]).slice(0, 20),
      });
    } catch (error: any) {
      console.error("[Diagnose] Error:", error);
      res.status(500).json({ error: "Failed to fetch diagnostics" });
    }
  });


  // ==================== PLAYER SPOTLIGHT ENDPOINTS ====================

  function getWeekStart(date: Date = new Date()): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return d.toISOString().split('T')[0];
  }

const spotlightNominateSchema = z.object({
  nominatedPlayerId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

router.post("/api/player/spotlight/nominate", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const playerId = req.user?.playerId;
      if (!academyId || !playerId) {
        return res.status(400).json({ error: "Academy and player context required" });
      }

      const parsed = spotlightNominateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { nominatedPlayerId, reason } = parsed.data;

      if (nominatedPlayerId === playerId) {
        return res.status(400).json({ error: "You cannot nominate yourself" });
      }

      const [nominee] = await db.select({ id: players.id, academyId: players.academyId }).from(players).where(eq(players.id, nominatedPlayerId));
      if (!nominee || nominee.academyId !== academyId) {
        return res.status(400).json({ error: "Nominated player must be in the same academy" });
      }

      const weekStart = getWeekStart();

      const existing = await db.select({ id: spotlightNominations.id }).from(spotlightNominations)
        .where(and(
          eq(spotlightNominations.nominatorPlayerId, playerId),
          eq(spotlightNominations.weekStart, weekStart)
        ));

      if (existing.length > 0) {
        return res.status(400).json({ error: "You have already nominated someone this week" });
      }

      const [nomination] = await db.insert(spotlightNominations).values({
        academyId,
        nominatorPlayerId: playerId,
        nominatedPlayerId,
        reason,
        weekStart,
      }).returning();

      res.json({ success: true, nomination });
    } catch (error) {
      console.error("[Spotlight] Nominate error:", error);
      res.status(500).json({ error: "Failed to submit nomination" });
    }
  });

router.get("/api/player/spotlight/current-week", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const playerId = req.user?.playerId;
      if (!academyId) {
        return res.json({ weekStart: getWeekStart(), nominations: [], myNomination: null, daysRemaining: 0, totalVotes: 0 });
      }

      const weekStart = getWeekStart();

      const nominations = await db.select({
        nominatedPlayerId: spotlightNominations.nominatedPlayerId,
        reason: spotlightNominations.reason,
        nominatorPlayerId: spotlightNominations.nominatorPlayerId,
        playerName: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
        level: players.level,
        ballLevel: players.ballLevel,
      })
        .from(spotlightNominations)
        .innerJoin(players, eq(players.id, spotlightNominations.nominatedPlayerId))
        .where(and(
          eq(spotlightNominations.academyId, academyId),
          eq(spotlightNominations.weekStart, weekStart)
        ));

      const aggregated: Record<string, { playerId: string; playerName: string; profilePhotoUrl: string | null; level: number | null; ballLevel: string | null; totalVotes: number; reasons: string[] }> = {};
      for (const nom of nominations) {
        if (!aggregated[nom.nominatedPlayerId]) {
          aggregated[nom.nominatedPlayerId] = {
            playerId: nom.nominatedPlayerId,
            playerName: nom.playerName,
            profilePhotoUrl: nom.profilePhotoUrl,
            level: nom.level,
            ballLevel: nom.ballLevel,
            totalVotes: 0,
            reasons: [],
          };
        }
        aggregated[nom.nominatedPlayerId].totalVotes++;
        aggregated[nom.nominatedPlayerId].reasons.push(nom.reason);
      }

      const sortedNominations = Object.values(aggregated).sort((a, b) => b.totalVotes - a.totalVotes);

      const myNomination = playerId ? nominations.find(n => n.nominatorPlayerId === playerId) || null : null;

      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysRemaining = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

      const totalVotes = nominations.length;

      res.json({ weekStart, nominations: sortedNominations, myNomination, daysRemaining, totalVotes });
    } catch (error) {
      console.error("[Spotlight] Current week error:", error);
      res.status(500).json({ error: "Failed to fetch current week spotlight" });
    }
  });

router.get("/api/player/spotlight/weekly-winner", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.json({ winner: null });
      }

      let targetWeekStart = req.query.weekStart as string | undefined;
      if (!targetWeekStart) {
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        targetWeekStart = getWeekStart(lastWeek);
      }

      const [existingWinner] = await db.select({
        playerId: spotlightWeeklyWinners.playerId,
        totalVotes: spotlightWeeklyWinners.totalVotes,
        topReason: spotlightWeeklyWinners.topReason,
        weekStart: spotlightWeeklyWinners.weekStart,
        playerName: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
        level: players.level,
        ballLevel: players.ballLevel,
      })
        .from(spotlightWeeklyWinners)
        .innerJoin(players, eq(players.id, spotlightWeeklyWinners.playerId))
        .where(and(
          eq(spotlightWeeklyWinners.academyId, academyId),
          eq(spotlightWeeklyWinners.weekStart, targetWeekStart)
        ));

      if (existingWinner) {
        return res.json({ winner: existingWinner });
      }

      const weekEnd = new Date(targetWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const now = new Date();
      if (now <= weekEnd) {
        return res.json({ winner: null });
      }

      const weekNominations = await db.select({
        nominatedPlayerId: spotlightNominations.nominatedPlayerId,
        reason: spotlightNominations.reason,
      })
        .from(spotlightNominations)
        .where(and(
          eq(spotlightNominations.academyId, academyId),
          eq(spotlightNominations.weekStart, targetWeekStart)
        ));

      if (weekNominations.length === 0) {
        return res.json({ winner: null });
      }

      const voteCounts: Record<string, { count: number; reasons: string[] }> = {};
      for (const nom of weekNominations) {
        if (!voteCounts[nom.nominatedPlayerId]) {
          voteCounts[nom.nominatedPlayerId] = { count: 0, reasons: [] };
        }
        voteCounts[nom.nominatedPlayerId].count++;
        voteCounts[nom.nominatedPlayerId].reasons.push(nom.reason);
      }

      const winnerId = Object.entries(voteCounts).sort((a, b) => b[1].count - a[1].count)[0][0];
      const winnerData = voteCounts[winnerId];

      const [inserted] = await db.insert(spotlightWeeklyWinners).values({
        academyId,
        playerId: winnerId,
        weekStart: targetWeekStart,
        totalVotes: winnerData.count,
        topReason: winnerData.reasons[0],
      }).returning();

      const [winnerPlayer] = await db.select({
        name: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
        level: players.level,
        ballLevel: players.ballLevel,
      }).from(players).where(eq(players.id, winnerId));

      // Award XP for weekly spotlight winner (50 XP)
      try {
        await awardXP(winnerId, "spotlight_weekly_winner", "spotlight", inserted.id);
        console.log("[Spotlight] Awarded 50 XP to weekly winner:", winnerId);
      } catch (xpErr) {
        console.log("[Spotlight] XP award skipped (rule may not exist):", xpErr);
      }

      res.json({
        winner: {
          playerId: winnerId,
          playerName: winnerPlayer?.name || "Unknown",
          profilePhotoUrl: winnerPlayer?.profilePhotoUrl || null,
          level: winnerPlayer?.level || null,
          ballLevel: winnerPlayer?.ballLevel || null,
          totalVotes: winnerData.count,
          topReason: winnerData.reasons[0],
          weekStart: targetWeekStart,
        },
      });
    } catch (error) {
      console.error("[Spotlight] Weekly winner error:", error);
      res.status(500).json({ error: "Failed to fetch weekly winner" });
    }
  });

router.get("/api/player/spotlight/monthly", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.json({ winner: null, leaderboard: [], weeklyWinners: [], month: new Date().getMonth() + 1, year: new Date().getFullYear() });
      }

      const now = new Date();
      let month = parseInt(req.query.month as string) || now.getMonth() + 1;
      let year = parseInt(req.query.year as string) || now.getFullYear();

      if (month === now.getMonth() + 1 && year === now.getFullYear()) {
        month = now.getMonth() === 0 ? 12 : now.getMonth();
        year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      }

      const [existingWinner] = await db.select({
        playerId: spotlightMonthlyWinners.playerId,
        totalWeeklyWins: spotlightMonthlyWinners.totalWeeklyWins,
        totalVotesAllWeeks: spotlightMonthlyWinners.totalVotesAllWeeks,
        month: spotlightMonthlyWinners.month,
        year: spotlightMonthlyWinners.year,
        playerName: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
      })
        .from(spotlightMonthlyWinners)
        .innerJoin(players, eq(players.id, spotlightMonthlyWinners.playerId))
        .where(and(
          eq(spotlightMonthlyWinners.academyId, academyId),
          eq(spotlightMonthlyWinners.month, month),
          eq(spotlightMonthlyWinners.year, year)
        ));

      const monthEnd = new Date(year, month, 0);
      const isMonthOver = now > monthEnd;

      const monthStart = new Date(year, month - 1, 1);
      const weeklyWinners = await db.select({
        playerId: spotlightWeeklyWinners.playerId,
        totalVotes: spotlightWeeklyWinners.totalVotes,
        weekStart: spotlightWeeklyWinners.weekStart,
        playerName: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
      })
        .from(spotlightWeeklyWinners)
        .innerJoin(players, eq(players.id, spotlightWeeklyWinners.playerId))
        .where(and(
          eq(spotlightWeeklyWinners.academyId, academyId),
          gte(spotlightWeeklyWinners.weekStart, monthStart.toISOString().split('T')[0]),
          lte(spotlightWeeklyWinners.weekStart, monthEnd.toISOString().split('T')[0])
        ));

      const leaderboardMap: Record<string, { playerId: string; playerName: string; profilePhotoUrl: string | null; totalVotes: number; weeksWon: number }> = {};
      for (const ww of weeklyWinners) {
        if (!leaderboardMap[ww.playerId]) {
          leaderboardMap[ww.playerId] = {
            playerId: ww.playerId,
            playerName: ww.playerName,
            profilePhotoUrl: ww.profilePhotoUrl,
            totalVotes: 0,
            weeksWon: 0,
          };
        }
        leaderboardMap[ww.playerId].totalVotes += ww.totalVotes;
        leaderboardMap[ww.playerId].weeksWon++;
      }
      const leaderboard = Object.values(leaderboardMap).sort((a, b) => b.totalVotes - a.totalVotes);

      let winner = existingWinner || null;

      if (!existingWinner && isMonthOver && leaderboard.length > 0) {
        const topPlayer = leaderboard[0];
        const [inserted] = await db.insert(spotlightMonthlyWinners).values({
          academyId,
          playerId: topPlayer.playerId,
          month,
          year,
          totalWeeklyWins: topPlayer.weeksWon,
          totalVotesAllWeeks: topPlayer.totalVotes,
        }).returning();

      // Award XP for monthly spotlight winner (200 XP)
      try {
        const monthlyWinnerId = inserted.playerId;
        await awardXP(monthlyWinnerId, "spotlight_monthly_winner", "spotlight", inserted.id);
        console.log("[Spotlight] Awarded 200 XP to monthly winner:", monthlyWinnerId);
      } catch (xpErr) {
        console.log("[Spotlight] Monthly XP award skipped:", xpErr);
      }

        winner = {
          playerId: topPlayer.playerId,
          playerName: topPlayer.playerName,
          profilePhotoUrl: topPlayer.profilePhotoUrl,
          totalWeeklyWins: topPlayer.weeksWon,
          totalVotesAllWeeks: topPlayer.totalVotes,
          month,
          year,
        };
      }

      res.json({ winner, leaderboard });
    } catch (error) {
      console.error("[Spotlight] Monthly error:", error);
      res.status(500).json({ error: "Failed to fetch monthly spotlight" });
    }
  });

router.get("/api/player/spotlight/leaderboard", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.json({ leaderboard: [], weekStart: getWeekStart() });
      }

      const weekStart = getWeekStart();

      const nominations = await db.select({
        nominatedPlayerId: spotlightNominations.nominatedPlayerId,
        reason: spotlightNominations.reason,
        playerName: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
        level: players.level,
        ballLevel: players.ballLevel,
      })
        .from(spotlightNominations)
        .innerJoin(players, eq(players.id, spotlightNominations.nominatedPlayerId))
        .where(and(
          eq(spotlightNominations.academyId, academyId),
          eq(spotlightNominations.weekStart, weekStart)
        ));

      const aggregated: Record<string, { playerId: string; playerName: string; profilePhotoUrl: string | null; level: number | null; ballLevel: string | null; totalVotes: number; reasons: string[] }> = {};
      for (const nom of nominations) {
        if (!aggregated[nom.nominatedPlayerId]) {
          aggregated[nom.nominatedPlayerId] = {
            playerId: nom.nominatedPlayerId,
            playerName: nom.playerName,
            profilePhotoUrl: nom.profilePhotoUrl,
            level: nom.level,
            ballLevel: nom.ballLevel,
            totalVotes: 0,
            reasons: [],
          };
        }
        aggregated[nom.nominatedPlayerId].totalVotes++;
        aggregated[nom.nominatedPlayerId].reasons.push(nom.reason);
      }

      const leaderboard = Object.values(aggregated).sort((a, b) => b.totalVotes - a.totalVotes);

      res.json({ weekStart, leaderboard });
    } catch (error) {
      console.error("[Spotlight] Leaderboard error:", error);
      res.status(500).json({ error: "Failed to fetch spotlight leaderboard" });
    }
  });

router.get("/api/player/spotlight/history", authMiddleware, requirePlayerOrOwner, async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.json({ history: [] });
      }

      const twelveWeeksAgo = new Date();
      twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
      const cutoffDate = twelveWeeksAgo.toISOString().split('T')[0];

      const weeklyWinners = await db.select({
        playerId: spotlightWeeklyWinners.playerId,
        weekStart: spotlightWeeklyWinners.weekStart,
        totalVotes: spotlightWeeklyWinners.totalVotes,
        topReason: spotlightWeeklyWinners.topReason,
        playerName: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
      })
        .from(spotlightWeeklyWinners)
        .innerJoin(players, eq(players.id, spotlightWeeklyWinners.playerId))
        .where(and(
          eq(spotlightWeeklyWinners.academyId, academyId),
          gte(spotlightWeeklyWinners.weekStart, cutoffDate)
        ))
        .orderBy(desc(spotlightWeeklyWinners.weekStart));

      const monthlyWinners = await db.select({
        playerId: spotlightMonthlyWinners.playerId,
        month: spotlightMonthlyWinners.month,
        year: spotlightMonthlyWinners.year,
        totalWeeklyWins: spotlightMonthlyWinners.totalWeeklyWins,
        totalVotesAllWeeks: spotlightMonthlyWinners.totalVotesAllWeeks,
        playerName: players.name,
        profilePhotoUrl: players.profilePhotoUrl,
      })
        .from(spotlightMonthlyWinners)
        .innerJoin(players, eq(players.id, spotlightMonthlyWinners.playerId))
        .where(eq(spotlightMonthlyWinners.academyId, academyId))
        .orderBy(desc(spotlightMonthlyWinners.year), desc(spotlightMonthlyWinners.month));

      res.json({ weeklyWinners, monthlyWinners });
    } catch (error) {
      console.error("[Spotlight] History error:", error);
      res.status(500).json({ error: "Failed to fetch spotlight history" });
    }
  });


// ==================== ACCOUNT DELETION ====================

router.delete("/api/player/me/account", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const playerId = req.user?.playerId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Safety guard for family-switch synthetic tokens: if the token's playerId
    // differs from the user record's stored playerId, this is a switched session
    // (parent userId + child playerId). Deleting here would wipe the parent's
    // user account, which is not allowed.
    if (playerId) {
      const userRecord = await storage.getUserById(userId);
      if (userRecord && userRecord.playerId && userRecord.playerId !== playerId) {
        return res.status(403).json({ error: "Account deletion is not available in a family switch session" });
      }
    }

    // Capture PII before anonymizing for the confirmation email
    let playerEmailForNotification: string | null = null;
    let playerNameForNotification = "User";

    if (playerId) {
      const [playerRecord] = await db.select({ email: players.email, name: players.name })
        .from(players)
        .where(eq(players.id, playerId));
      if (playerRecord) {
        playerEmailForNotification = playerRecord.email;
        playerNameForNotification = playerRecord.name;
      }
    }

    // Fallback for coaches/owners/admins who may not have a player record
    if (!playerEmailForNotification) {
      const coachId = req.user?.coachId;
      const [userRecord] = await db.select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId));
      if (userRecord) {
        playerEmailForNotification = userRecord.email?.includes("@glowupsports.invalid") ? null : userRecord.email;
      }
      if (!playerNameForNotification || playerNameForNotification === "User") {
        if (coachId) {
          const [coachRecord] = await db.select({ name: coaches.name })
            .from(coaches)
            .where(eq(coaches.id, coachId));
          if (coachRecord) playerNameForNotification = coachRecord.name;
        }
      }
    }

    // Anonymize player PII and remove from academy active roster
    if (playerId) {
      await db.update(players)
        .set({
          name: "Deleted User",
          email: null,
          phone: null,
          dateOfBirth: null,
          parentEmail: null,
          profilePhotoUrl: null,
          status: "inactive",
          academyId: null,
        })
        .where(eq(players.id, playerId));
    }

    // Soft-delete the user account (email must stay non-null per schema; use a marker value)
    const deletedAt = new Date();
    await db.update(users)
      .set({
        deleted: true,
        deletedAt,
        email: `deleted_${userId}@glowupsports.invalid`,
        appleId: null,
      })
      .where(eq(users.id, userId));

    console.log(`[AccountDeletion] User ${userId} (player ${playerId}) account deleted at ${deletedAt.toISOString()}`);

    // Non-blocking: send confirmation email to the player and archive notification to support
    if (playerEmailForNotification) {
      sendEmail({
        to: playerEmailForNotification,
        subject: "Your Glow Up Sports account has been deleted",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #C8FF3D;">Account Deletion Confirmed</h2>
            <p>Hi ${playerNameForNotification},</p>
            <p>Your Glow Up Sports account has been permanently deleted. All your personal data, including your profile, progress, XP, and match history, has been removed from our systems.</p>
            <p>If you believe this was done in error or have any questions, please contact us at <a href="mailto:support@glowupsports.com">support@glowupsports.com</a>.</p>
            <p>Thank you for being part of the Glow Up Sports community.</p>
            <p style="color: #666; font-size: 12px; margin-top: 20px;">This is an automated message. Please do not reply to this email.</p>
          </div>
        `,
        text: `Hi ${playerNameForNotification},\n\nYour Glow Up Sports account has been permanently deleted.\n\nIf you have questions, contact support@glowupsports.com.`,
      }).catch(emailErr => {
        console.error("[AccountDeletion] Failed to send player confirmation email:", emailErr);
      });

      // Archive notification to support for compliance records
      sendDeleteAccountRequestEmail({
        userEmail: playerEmailForNotification,
        userName: playerNameForNotification,
        reason: "Player-initiated immediate deletion via app",
      }).catch(supportEmailErr => {
        console.error("[AccountDeletion] Failed to send support archive email:", supportEmailErr);
      });
    }

    res.json({ success: true, message: "Account successfully deleted" });
  } catch (error) {
    console.error("[AccountDeletion] Error:", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// ==================== REPORT & BLOCK (player-scoped aliases) ====================

// Report a post: POST /api/player/me/report/posts/:postId
router.post("/api/player/me/report/posts/:postId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const postId = req.params.postId;
    const { reason } = req.body;

    if (!postId) return res.status(400).json({ error: "Post ID required" });

    const existing = await db.select({ id: contentReportsTable.id })
      .from(contentReportsTable)
      .where(and(
        eq(contentReportsTable.reporterUserId, userId),
        eq(contentReportsTable.contentId, postId),
        eq(contentReportsTable.contentType, "post")
      ))
      .limit(1);

    if (existing.length > 0) return res.json({ success: true, alreadyReported: true });

    await db.insert(contentReportsTable).values({
      reporterUserId: userId,
      contentType: "post",
      contentId: postId,
      reason: reason || null,
    });

    console.log(`[Report] User ${userId} reported post ${postId}: ${reason || "no reason"}`);
    res.json({ success: true });
  } catch (error) {
    console.error("[Report] Error:", error);
    res.status(500).json({ error: "Failed to submit report" });
  }
});

// Block a user: POST /api/player/me/block/:playerId
// Resolves playerId -> userId so feed filtering (which uses user IDs) works correctly
router.post("/api/player/me/block/:playerId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const blockerUserId = req.user!.userId;
    const targetPlayerId = req.params.playerId;

    if (!targetPlayerId) return res.status(400).json({ error: "Player ID required" });

    // Resolve playerId to userId for consistent feed filtering
    const [targetUser] = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.playerId, targetPlayerId))
      .limit(1);

    const blockedUserId = targetUser?.id || targetPlayerId;

    if (blockerUserId === blockedUserId) return res.status(400).json({ error: "Cannot block yourself" });

    await db.insert(playerBlocksTable).values({
      blockerUserId,
      blockedUserId,
    }).onConflictDoNothing();

    console.log(`[Block] User ${blockerUserId} blocked player ${targetPlayerId} (userId: ${blockedUserId})`);
    res.json({ success: true });
  } catch (error) {
    console.error("[Block] Error:", error);
    res.status(500).json({ error: "Failed to block user" });
  }
});

// Friend Spotlight: GET /api/player/spotlight/friends
router.get("/api/player/spotlight/friends", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.user!.playerId;
    if (!playerId) {
      return res.json({ topFriend: null });
    }

    // Get accepted connections
    const acceptedConnections = await db
      .select()
      .from(playerConnections)
      .where(
        and(
          eq(playerConnections.status, "accepted"),
          or(
            eq(playerConnections.player1Id, playerId),
            eq(playerConnections.player2Id, playerId)
          )
        )
      );

    if (acceptedConnections.length === 0) {
      return res.json({ topFriend: null });
    }

    const friendIds = acceptedConnections.map((c) =>
      c.player1Id === playerId ? c.player2Id : c.player1Id
    );

    // Get XP earned this week for each friend
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const friendStats = await Promise.all(
      friendIds.map(async (fid) => {
        const [xpResult] = await db
          .select({ total: sql<number>`coalesce(sum(${playerXpEvents.xpAmount}), 0)` })
          .from(playerXpEvents)
          .where(
            and(
              eq(playerXpEvents.playerId, fid),
              gte(playerXpEvents.createdAt, weekStart)
            )
          );

        const weeklyXp = Number(xpResult?.total || 0);

        const friendPlayer = await db
          .select({
            id: players.id,
            displayName: players.displayName,
            profilePhotoUrl: players.profilePhotoUrl,
            ballLevel: players.ballLevel,
            level: players.level,
          })
          .from(players)
          .where(eq(players.id, fid))
          .limit(1);

        if (!friendPlayer[0]) return null;
        return {
          playerId: fid,
          playerName: friendPlayer[0].displayName || "Player",
          profilePhotoUrl: friendPlayer[0].profilePhotoUrl || null,
          ballLevel: friendPlayer[0].ballLevel || null,
          weeklyXp,
        };
      })
    );

    const validStats = friendStats.filter(Boolean) as NonNullable<typeof friendStats[0]>[];
    validStats.sort((a, b) => b.weeklyXp - a.weeklyXp);
    const topFriend = validStats[0] || null;

    res.json({ topFriend });
  } catch (error) {
    console.error("Error fetching friend spotlight:", error);
    res.status(500).json({ error: "Failed to fetch friend spotlight" });
  }
});

// Unblock a user: DELETE /api/player/me/block/:playerId
// Resolves playerId -> userId to match block entries
router.delete("/api/player/me/block/:playerId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const blockerUserId = req.user!.userId;
    const targetPlayerId = req.params.playerId;

    // Resolve playerId to userId
    const [targetUser] = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.playerId, targetPlayerId))
      .limit(1);

    const blockedUserId = targetUser?.id || targetPlayerId;

    await db.delete(playerBlocksTable)
      .where(and(
        eq(playerBlocksTable.blockerUserId, blockerUserId),
        eq(playerBlocksTable.blockedUserId, blockedUserId)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("[Unblock] Error:", error);
    res.status(500).json({ error: "Failed to unblock user" });
  }
});

export default router;
