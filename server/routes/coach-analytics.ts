import { Router, type Request, type Response, type NextFunction } from "express";
  import { db } from "../db";
  import { storage } from "../storage";
  import {
    eq, sql, desc, and, ne, gt, gte, asc, inArray, notInArray,
    isNull, isNotNull, or, count, ilike, lte,
  } from "drizzle-orm";
  import {
    authMiddlewareWithFreshData as authMiddleware,
    requireRole,
    requireAcademy,
    requireFeatureUnlock,
    validatePlayerOwnership,
    validateCourtOwnership,
    validateSessionOwnership,
    validatePackageOwnership,
    validateNotificationOwnership,
    type AuthenticatedRequest,
  } from "../auth";
  import { z } from "zod";
  import { fromZodError } from "zod-validation-error";
  import { sanitizeNote, sanitizeMessage, sanitizeTemplateName, sanitizeTemplateContent } from "../utils/sanitize";
  import { localTimeToUTC, utcToLocalTime, getTimezoneOffset, getFirstSessionDate, addDaysToLocalDate, getLocalDateParts, resolveLocalTimeToUTC, ensureResolvableLocalTime } from "../utils/timezone";
  import { apiCache, CACHE_KEYS, CACHE_TTL } from "../cache";
  import {
    users, coaches, players, academies, sessions, coachingSeries, seriesPlayers,
    invoices, payments, sessionPlayers, sessionWaitlist,
    locationTravelTimes, sessionFeedback, inSessionFeedback, sessionSkillObservations,
    sessionSkillFeedback, playerSessionCancellations, playerPillarProgress,
    coachXpTransactions, xpTransactions, playerBaselineSkillScores, playerBaselines,
    coachAvailability, availabilityExceptions, coachTimeBlocks, coachSettings,
    courtAvailability, courtAvailabilitySnapshots,
    bookingInvites, bookingInviteGuests, openMatches, openMatchSlots,
    playerBookingPreferences,
    courtBookings, matchLogs, playerBallLevels,
    playerHolidays, coachWellnessLogs, insertCoachWellnessLogSchema,
    levelUpEvents, playerXpEvents, ballLevels, playerNotifications,
    spotlightNominations, spotlightWeeklyWinners, spotlightMonthlyWinners,
    posts as postsTable, postReactions as postReactionsTable,
    postComments as postCommentsTable, commentLikes as commentLikesTable,
    communityGroups as communityGroupsTable, groupMembers as groupMembersTable,
    openToPlay as openToPlayTable, userSocialProfiles as userSocialProfilesTable,
    questTemplates as questTemplatesTable, playerQuests as playerQuestsTable,
    dailyQuestSlots as dailyQuestSlotsTable, playerConnections,
    badges as badgesTable, playerBadges as playerBadgesTable,
    titles as titlesTable, playerTitles as playerTitlesTable,
    sessionPlans, providerInvites, serviceProviders, platformConfig, pushDeviceTokens,
    loginSchema, registerSchema, playerRegisterSchema, coachInviteRegisterSchema,
    academyApplicationInputSchema, insertSessionSchema, insertPlayerSchema, updatePlayerSchema,
    insertPackageSchema, insertPlayerNoteSchema, insertMessageSchema, insertMessageReactionSchema,
    submitReviewSchema,
  } from "@shared/schema";
  
  const router = Router();

  const _burnoutCache = new Map<string, { data: unknown; expiresAt: number }>();

    // ==================== INSIGHTS & ANALYTICS ENDPOINTS ====================

  // Get attendance trends for academy
  router.get(
    "/api/insights/attendance",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const days = parseInt(req.query.days as string) || 30;

        const trends = await storage.getAttendanceTrends(academyId, days);
        res.json(trends);
      } catch (error) {
        console.error("Error fetching attendance trends:", error);
        res.status(500).json({ error: "Failed to fetch attendance trends" });
      }
    },
  );

  // Get XP velocity for academy
  router.get(
    "/api/insights/xp-velocity",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const days = parseInt(req.query.days as string) || 30;

        const velocity = await storage.getXpVelocity(academyId, days);
        res.json(velocity);
      } catch (error) {
        console.error("Error fetching XP velocity:", error);
        res.status(500).json({ error: "Failed to fetch XP velocity" });
      }
    },
  );

  // Get coach load stats for academy
  router.get(
    "/api/insights/coach-load",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const days = parseInt(req.query.days as string) || 7;

        const stats = await storage.getCoachLoadStats(academyId, days);
        res.json(stats);
      } catch (error) {
        console.error("Error fetching coach load stats:", error);
        res.status(500).json({ error: "Failed to fetch coach load stats" });
      }
    },
  );

  // Get player observation trends
  router.get(
    "/api/players/:id/observation-trends",
    authMiddleware,
    requireAcademy,
    validatePlayerOwnership,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id: playerId } = req.params;
        const days = parseInt(req.query.days as string) || 30;

        const trends = await storage.getPlayerObservationTrends(playerId, days);

        // Enrich with domain info
        const domains = await storage.getSkillDomains();
        const enrichedTrends = trends.map((t) => ({
          ...t,
          domain: domains.find((d) => d.id === t.domainId) || null,
        }));

        res.json(enrichedTrends);
      } catch (error) {
        console.error("Error fetching observation trends:", error);
        res.status(500).json({ error: "Failed to fetch observation trends" });
      }
    },
  );

  // Get player domain XP summary
  router.get(
    "/api/players/:id/domain-xp",
    authMiddleware,
    requireAcademy,
    validatePlayerOwnership,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id: playerId } = req.params;

        const summary = await storage.getPlayerDomainXpSummary(playerId);

        // Enrich with domain info
        const domains = await storage.getSkillDomains();
        const enrichedSummary = summary.map((s) => ({
          ...s,
          domain: domains.find((d) => d.id === s.domainId) || null,
        }));

        res.json(enrichedSummary);
      } catch (error) {
        console.error("Error fetching domain XP summary:", error);
        res.status(500).json({ error: "Failed to fetch domain XP summary" });
      }
    },
  );

  // ==================== COACH INSIGHTS - FORECASTING & BURNOUT ====================

  // Get coach load forecast (next 14 days based on scheduled sessions + historical patterns)
  router.get(
    "/api/coaches/:id/load-forecast",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;

        if (id !== coachId) {
          return res.status(404).json({ error: "Forecast not found" });
        }

        const days = parseInt(req.query.days as string) || 14;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const forecast: Array<{
          date: string;
          scheduledMinutes: number;
          scheduledSessions: number;
          predictedLoad: "light" | "moderate" | "heavy" | "overload";
          burnoutRisk: number;
        }> = [];

        // Get sessions for forecast period
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + days);

        const futureSessions = await storage.getSessionsByCoach(
          id,
          today,
          endDate,
          academyId,
        );

        // Calculate daily load for each forecast day
        for (let i = 0; i < days; i++) {
          const forecastDate = new Date(today);
          forecastDate.setDate(forecastDate.getDate() + i);
          const dateStr = forecastDate.toISOString().split("T")[0];

          const daySessions = futureSessions.filter((s) => {
            const sessionDate = new Date(s.startTime)
              .toISOString()
              .split("T")[0];
            return sessionDate === dateStr;
          });

          const scheduledMinutes = daySessions.reduce(
            (acc, s) => acc + (s.duration || 60),
            0,
          );
          const scheduledSessions = daySessions.length;

          // Calculate back-to-back sessions
          let backToBackCount = 0;
          const sortedSessions = [...daySessions].sort(
            (a, b) =>
              new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
          );
          for (let j = 1; j < sortedSessions.length; j++) {
            const prevEnd = new Date(sortedSessions[j - 1].endTime).getTime();
            const currStart = new Date(sortedSessions[j].startTime).getTime();
            if (currStart - prevEnd <= 15 * 60 * 1000) backToBackCount++;
          }

          // Load scoring: hours + back-to-back penalty
          const totalHours = scheduledMinutes / 60;
          const loadScore = totalHours + backToBackCount * 0.5;

          let predictedLoad: "light" | "moderate" | "heavy" | "overload" =
            "light";
          if (loadScore >= 8 || totalHours >= 9) predictedLoad = "overload";
          else if (loadScore >= 6 || totalHours >= 7) predictedLoad = "heavy";
          else if (loadScore >= 4 || totalHours >= 4)
            predictedLoad = "moderate";

          // Burnout risk: 0-100 scale
          const burnoutRisk = Math.min(100, Math.round((loadScore / 10) * 100));

          forecast.push({
            date: dateStr,
            scheduledMinutes,
            scheduledSessions,
            predictedLoad,
            burnoutRisk,
          });
        }

        res.json({ forecast });
      } catch (error) {
        console.error("Error fetching load forecast:", error);
        res.status(500).json({ error: "Failed to fetch load forecast" });
      }
    },
  );

  // Get coach burnout risk assessment
  router.get(
    "/api/coaches/:id/burnout-risk",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;

        if (id !== coachId) {
          return res.status(404).json({ error: "Assessment not found" });
        }

        const cacheKey = `burnout:${id}`;
        const cached = _burnoutCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          return res.json(cached.data);
        }

        // Analyze last 14 days + next 7 days
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const pastStart = new Date(today);
        pastStart.setDate(pastStart.getDate() - 14);

        const futureEnd = new Date(today);
        futureEnd.setDate(futureEnd.getDate() + 7);

        const pastSessions = await storage.getSessionsByCoach(
          id,
          pastStart,
          today,
          academyId,
        );
        const futureSessions = await storage.getSessionsByCoach(
          id,
          today,
          futureEnd,
          academyId,
        );

        // Calculate metrics
        const pastMinutes = pastSessions.reduce(
          (acc, s) => acc + (s.duration || 60),
          0,
        );
        const futureMinutes = futureSessions.reduce(
          (acc, s) => acc + (s.duration || 60),
          0,
        );

        const avgDailyPast = pastMinutes / 14;
        const avgDailyFuture = futureMinutes / 7;

        // Count consecutive heavy days in past week
        let consecutiveHeavyDays = 0;
        let maxConsecutiveHeavy = 0;
        for (let i = 0; i < 7; i++) {
          const checkDate = new Date(today);
          checkDate.setDate(checkDate.getDate() - i - 1);
          const dateStr = checkDate.toISOString().split("T")[0];

          const dayMinutes = pastSessions
            .filter(
              (s) =>
                new Date(s.startTime).toISOString().split("T")[0] === dateStr,
            )
            .reduce((acc, s) => acc + (s.duration || 60), 0);

          if (dayMinutes >= 300) {
            consecutiveHeavyDays++;
            maxConsecutiveHeavy = Math.max(
              maxConsecutiveHeavy,
              consecutiveHeavyDays,
            );
          } else {
            consecutiveHeavyDays = 0;
          }
        }

        // Calculate burnout risk score (0-100)
        let riskScore = 0;

        // Factor 1: Average daily load (40 points max)
        riskScore += Math.min(40, (avgDailyPast / 360) * 40);

        // Factor 2: Consecutive heavy days (30 points max)
        riskScore += Math.min(30, maxConsecutiveHeavy * 10);

        // Factor 3: Upcoming load increase (20 points max)
        if (avgDailyFuture > avgDailyPast * 1.2) {
          riskScore += Math.min(20, (avgDailyFuture / avgDailyPast - 1) * 20);
        }

        // Factor 4: No rest days in past week (10 points)
        const restDays = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(today);
          d.setDate(d.getDate() - i - 1);
          const dateStr = d.toISOString().split("T")[0];
          return (
            pastSessions.filter(
              (s) =>
                new Date(s.startTime).toISOString().split("T")[0] === dateStr,
            ).length === 0
          );
        }).filter(Boolean).length;

        if (restDays === 0) riskScore += 10;
        else if (restDays === 1) riskScore += 5;

        const riskLevel: "low" | "moderate" | "high" | "critical" =
          riskScore >= 75
            ? "critical"
            : riskScore >= 50
              ? "high"
              : riskScore >= 25
                ? "moderate"
                : "low";

        // Generate recommendations
        const recommendations: string[] = [];
        if (maxConsecutiveHeavy >= 3) {
          recommendations.push(
            "Consider scheduling lighter days after consecutive heavy coaching",
          );
        }
        if (restDays === 0) {
          recommendations.push("Schedule at least one rest day per week");
        }
        if (avgDailyFuture > avgDailyPast * 1.5) {
          recommendations.push(
            "Upcoming week is significantly heavier than recent average",
          );
        }
        if (avgDailyPast >= 300) {
          recommendations.push(
            "Daily coaching average is high - monitor energy levels",
          );
        }

        const burnoutResult = {
          riskScore: Math.round(riskScore),
          riskLevel,
          metrics: {
            avgDailyMinutesPast: Math.round(avgDailyPast),
            avgDailyMinutesFuture: Math.round(avgDailyFuture),
            consecutiveHeavyDays: maxConsecutiveHeavy,
            restDaysLastWeek: restDays,
            totalMinutesPast14Days: pastMinutes,
            scheduledMinutesNext7Days: futureMinutes,
          },
          recommendations,
        };
        _burnoutCache.set(`burnout:${id}`, { data: burnoutResult, expiresAt: Date.now() + 5 * 60 * 1000 });
        res.json(burnoutResult);
      } catch (error) {
        console.error("Error calculating burnout risk:", error);
        res.status(500).json({ error: "Failed to calculate burnout risk" });
      }
    },
  );

  // ==================== COACH WELLNESS TRACKING ====================

  // Get coach wellness logs (last 30 days)
  router.get(
    "/api/coaches/:id/wellness",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;

        if (id !== coachId) {
          return res.status(403).json({ error: "Access denied" });
        }

        const days = parseInt(req.query.days as string) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const logs = await db
          .select()
          .from(coachWellnessLogs)
          .where(
            and(
              eq(coachWellnessLogs.coachId, id),
              gte(
                coachWellnessLogs.date,
                startDate.toISOString().split("T")[0],
              ),
            ),
          )
          .orderBy(desc(coachWellnessLogs.date));

        // Calculate averages
        const avgSleep =
          logs.length > 0
            ? logs.reduce(
                (acc, l) => acc + (parseFloat(l.sleepHours as string) || 0),
                0,
              ) / logs.filter((l) => l.sleepHours).length
            : null;
        const avgEnergy =
          logs.length > 0
            ? logs.reduce((acc, l) => acc + (l.energyLevel || 0), 0) /
              logs.filter((l) => l.energyLevel).length
            : null;
        const avgMood =
          logs.length > 0
            ? logs.reduce((acc, l) => acc + (l.moodLevel || 0), 0) /
              logs.filter((l) => l.moodLevel).length
            : null;

        res.json({
          logs,
          summary: {
            totalEntries: logs.length,
            avgSleep: avgSleep ? Math.round(avgSleep * 10) / 10 : null,
            avgEnergy: avgEnergy ? Math.round(avgEnergy * 10) / 10 : null,
            avgMood: avgMood ? Math.round(avgMood * 10) / 10 : null,
          },
        });
      } catch (error) {
        console.error("Error fetching wellness logs:", error);
        res.status(500).json({ error: "Failed to fetch wellness logs" });
      }
    },
  );

  // Get wellness log for a specific date
  router.get(
    "/api/coaches/:id/wellness/:date",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id, date } = req.params;
        const coachId = req.user!.coachId;

        if (id !== coachId) {
          return res.status(403).json({ error: "Access denied" });
        }

        const [log] = await db
          .select()
          .from(coachWellnessLogs)
          .where(
            and(
              eq(coachWellnessLogs.coachId, id),
              eq(coachWellnessLogs.date, date),
            ),
          )
          .limit(1);

        res.json({ log: log || null });
      } catch (error) {
        console.error("Error fetching wellness log:", error);
        res.status(500).json({ error: "Failed to fetch wellness log" });
      }
    },
  );

  // Create or update wellness log for a date
  router.post(
    "/api/coaches/:id/wellness",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;

        if (id !== coachId) {
          return res.status(403).json({ error: "Access denied" });
        }

        const {
          date,
          sleepHours,
          sleepQuality,
          nutritionScore,
          mealsCount,
          hydrationLevel,
          energyLevel,
          moodLevel,
          stressLevel,
          physicalPain,
          painNotes,
          notes,
        } = req.body;

        if (!date) {
          return res.status(400).json({ error: "Date is required" });
        }

        // Check if entry exists for this date
        const [existing] = await db
          .select()
          .from(coachWellnessLogs)
          .where(
            and(
              eq(coachWellnessLogs.coachId, id),
              eq(coachWellnessLogs.date, date),
            ),
          )
          .limit(1);

        if (existing) {
          // Update existing entry
          const [updated] = await db
            .update(coachWellnessLogs)
            .set({
              sleepHours,
              sleepQuality,
              nutritionScore,
              mealsCount,
              hydrationLevel,
              energyLevel,
              moodLevel,
              stressLevel,
              physicalPain,
              painNotes,
              notes,
              updatedAt: new Date(),
            })
            .where(eq(coachWellnessLogs.id, existing.id))
            .returning();

          res.json({ log: updated, updated: true });
        } else {
          // Create new entry
          const [created] = await db
            .insert(coachWellnessLogs)
            .values({
              coachId: id,
              academyId,
              date,
              sleepHours,
              sleepQuality,
              nutritionScore,
              mealsCount,
              hydrationLevel,
              energyLevel,
              moodLevel,
              stressLevel,
              physicalPain,
              painNotes,
              notes,
            })
            .returning();

          res.json({ log: created, updated: false });
        }
      } catch (error) {
        console.error("Error saving wellness log:", error);
        res.status(500).json({ error: "Failed to save wellness log" });
      }
    },
  );

  // Get calendar heatmap data for a month
  router.get(
    "/api/coaches/:id/calendar-heatmap",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;

        if (id !== coachId) {
          return res.status(404).json({ error: "Heatmap not found" });
        }

        const year =
          parseInt(req.query.year as string) || new Date().getFullYear();
        const month =
          parseInt(req.query.month as string) || new Date().getMonth();

        // Get first and last day of month
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59);

        const sessions = await storage.getSessionsByCoach(
          id,
          startDate,
          endDate,
          academyId,
        );

        // Group by date
        const heatmapData: Record<
          string,
          {
            date: string;
            totalMinutes: number;
            sessionCount: number;
            intensity: number;
            loadLevel: "none" | "light" | "moderate" | "heavy" | "overload";
          }
        > = {};

        // Initialize all days of month
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          heatmapData[dateStr] = {
            date: dateStr,
            totalMinutes: 0,
            sessionCount: 0,
            intensity: 0,
            loadLevel: "none",
          };
        }

        // Populate with session data
        for (const session of sessions) {
          const dateStr = new Date(session.startTime)
            .toISOString()
            .split("T")[0];
          if (heatmapData[dateStr]) {
            heatmapData[dateStr].totalMinutes += session.duration || 60;
            heatmapData[dateStr].sessionCount += 1;
          }
        }

        // Calculate intensity and load level
        for (const dateStr of Object.keys(heatmapData)) {
          const day = heatmapData[dateStr];
          const hours = day.totalMinutes / 60;

          // Intensity: 0-1 scale based on max 8 hours
          day.intensity = Math.min(1, hours / 8);

          // Load level based on hours
          if (hours === 0) day.loadLevel = "none";
          else if (hours < 3) day.loadLevel = "light";
          else if (hours < 5) day.loadLevel = "moderate";
          else if (hours < 7) day.loadLevel = "heavy";
          else day.loadLevel = "overload";
        }

        res.json({
          year,
          month,
          days: Object.values(heatmapData),
        });
      } catch (error) {
        console.error("Error fetching calendar heatmap:", error);
        res.status(500).json({ error: "Failed to fetch calendar heatmap" });
      }
    },
  );

// ==================== ROSTER INSIGHTS (AI) ====================

// In-memory cache for roster insights: coachId -> { insights, generatedAt, cachedAt }
const rosterInsightsCache = new Map<string, { insights: { text: string; playerIds: string[] }[]; generatedAt: string; cachedAt: number }>();
const ROSTER_INSIGHTS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

router.get(
  "/api/coach/roster-insights",
  authMiddleware,
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "No coach profile found" });
      }

      const forceRefresh = req.query.refresh === "true";

      // Check cache (24h TTL)
      const cached = rosterInsightsCache.get(coachId);
      if (cached && !forceRefresh && Date.now() - cached.cachedAt < ROSTER_INSIGHTS_TTL_MS) {
        return res.json({
          insights: cached.insights,
          generatedAt: cached.generatedAt,
          fromCache: true,
        });
      }

      const { generateRosterInsights } = await import("../services/ai-progress-engine");
      const result = await generateRosterInsights(coachId);

      if (!result) {
        return res.json({
          insights: [],
          generatedAt: new Date().toISOString(),
          fromCache: false,
          message: "No roster data available to generate insights.",
        });
      }

      rosterInsightsCache.set(coachId, {
        insights: result.insights,
        generatedAt: result.generatedAt,
        cachedAt: Date.now(),
      });

      return res.json({
        insights: result.insights,
        generatedAt: result.generatedAt,
        fromCache: false,
      });
    } catch (error) {
      console.error("Error generating roster insights:", error);
      res.status(500).json({ error: "Failed to generate roster insights" });
    }
  }
);

export default router;
