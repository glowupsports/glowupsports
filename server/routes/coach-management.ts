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
  import { updatePillarProgress } from "../utils/pillarProgress";
  import { localTimeToUTC, utcToLocalTime, getTimezoneOffset, getFirstSessionDate, addDaysToLocalDate, getLocalDateParts, resolveLocalTimeToUTC, ensureResolvableLocalTime } from "../utils/timezone";
  import { apiCache, CACHE_KEYS, CACHE_TTL } from "../cache";
  import {
    users, coaches, players, academies, sessions, coachingSeries, seriesPlayers,
    conversations, conversationParticipants, messages,
    invoices, payments, sessionPlayers, sessionWaitlist,
    locationTravelTimes, sessionFeedback, inSessionFeedback, sessionSkillObservations,
    sessionSkillFeedback, playerSessionCancellations, playerPillarProgress,
    coachXpTransactions, xpTransactions, playerBaselineSkillScores, playerBaselines,
    coachAvailability, availabilityExceptions, coachTimeBlocks, coachSettings,
    courtAvailability, courtAvailabilitySnapshots,
    bookingInvites, bookingInviteGuests, openMatches, openMatchSlots,
    matchRequests, playerBookingPreferences,
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
    seriesReminderLog,
  } from "@shared/schema";
  import { broadcastNewMessage } from "../websocket";
  import { sendNewMessageNotification, getPlayerPushTokens, getCoachPushTokens, sendPushNotification } from "../pushNotifications";
  import { sendFeedbackNotificationEmail, sendLevelUpEmail } from "../emailService";
  import { awardXP } from "../services/xp-service";
  import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, checkConnection as checkCalendarConnection } from "../googleCalendarService";
  import { filterProfanity } from "../profanityFilter";
  import { isPlayerMinor } from "../childSafety";
  import { chatRateLimiter } from "../rateLimiter";
  import { profilePhotoUpload } from "../upload-middleware";

const router = Router();

const _coachXpCache = new Map<string, { data: unknown; expiresAt: number }>();

  function parsePagination(query: { limit?: string; offset?: string; page?: string }) {
    const limit = Math.min(parseInt(query.limit as string) || 50, 100);
    const page = parseInt(query.page as string) || 1;
    const offset = query.offset ? parseInt(query.offset as string) : (page - 1) * limit;
    return { limit, offset };
  }
  
  
    // ==================== NOTIFICATIONS API ====================

  // Get notifications for a coach (supports optional pagination)
  router.get(
    "/api/coach/notifications",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        if (!coachId) {
          return res.status(400).json({ error: "coachId is required" });
        }
        const { paginated } = req.query;
        const usePagination = paginated === "true";

        if (usePagination) {
          const { limit, offset } = parsePagination(req.query as any);
          const result = await storage.getCoachNotificationsPaginated(
            coachId,
            limit,
            offset,
          );
          res.json({
            data: result.notifications,
            pagination: {
              total: result.total,
              limit,
              offset,
              hasMore: offset + result.notifications.length < result.total,
            },
          });
        } else {
          const notifications = await storage.getCoachNotifications(coachId);
          res.json(notifications);
        }
      } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ error: "Failed to fetch notifications" });
      }
    },
  );

  // Mark notification as read
  router.patch(
    "/api/coach/notifications/:id/read",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;

        const { valid } = await validateNotificationOwnership(
          id,
          coachId,
          storage,
        );
        if (!valid) {
          return res.status(404).json({ error: "Notification not found" });
        }

        await storage.markNotificationRead(id, coachId ?? undefined);
        res.json({ success: true });
      } catch (error) {
        console.error("Error marking notification read:", error);
        res.status(500).json({ error: "Failed to mark notification read" });
      }
    },
  );

  // Mark all notifications as read
  router.post(
    "/api/coach/notifications/mark-all-read",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        if (!coachId) {
          return res.status(400).json({ error: "coachId is required" });
        }
        await storage.markAllNotificationsRead(coachId);
        res.json({ success: true });
      } catch (error) {
        console.error("Error marking all notifications read:", error);
        res
          .status(500)
          .json({ error: "Failed to mark all notifications read" });
      }
    },
  );

  // Delete ALL notifications for the authenticated coach
  router.delete(
    "/api/coach/notifications",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        if (!coachId) {
          return res.status(400).json({ error: "coachId is required" });
        }
        const deleted = await storage.deleteAllCoachNotifications(coachId);
        res.json({ success: true, deleted });
      } catch (error) {
        console.error("Error deleting all notifications:", error);
        res.status(500).json({ error: "Failed to clear notifications" });
      }
    },
  );

  // Delete notification
  router.delete(
    "/api/coach/notifications/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;

        const { valid } = await validateNotificationOwnership(
          id,
          coachId,
          storage,
        );
        if (!valid) {
          return res.status(404).json({ error: "Notification not found" });
        }

        await storage.deleteNotification(id, coachId ?? undefined);
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting notification:", error);
        res.status(500).json({ error: "Failed to delete notification" });
      }
    },
  );

  // Get auto-renew alerts (sessions near week 9/10)
  router.get(
    "/api/coach/auto-renew-alerts",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        if (!coachId) {
          return res.status(400).json({ error: "coachId is required" });
        }
        const alerts = await storage.getAutoRenewAlerts(coachId);
        res.json(alerts);
      } catch (error) {
        console.error("Error fetching auto-renew alerts:", error);
        res.status(500).json({ error: "Failed to fetch auto-renew alerts" });
      }
    },
  );

  // ==================== GOOGLE CALENDAR API ====================

  // Check Google Calendar connection status
  router.get(
    "/api/coach/calendar/status",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const result = await checkCalendarConnection();
        res.json({
          connected: result.connected,
          email: result.email,
          error: result.error,
        });
      } catch (error: any) {
        res.json({
          connected: false,
          error: error.message || "Failed to check calendar connection",
        });
      }
    },
  );

  // ==================== COACH PROFILE API ====================

  // Get coach profile
  router.get(
    "/api/coach/profile/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId!;
        const coach = await storage.getCoach(id, academyId);
        if (!coach) {
          return res.status(404).json({ error: "Coach not found" });
        }
        res.json(coach);
      } catch (error) {
        console.error("Error fetching coach profile:", error);
        res.status(500).json({ error: "Failed to fetch coach profile" });
      }
    },
  );

  // Update coach profile
  router.patch(
    "/api/coach/profile/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId!;

        // Whitelist allowed fields — never allow role, academyId, totalXp, level, or other privileged fields
        // Public profile fields (Task #1037) are also allowed so the coach can
        // toggle public discoverability and edit their public-facing details.
        const {
          name, phone, specialty, bio, hourlyRate, photoUrl, availability, certifications,
          publicProfileEnabled, publicQuote, languages, specializations,
        } = req.body;
        const updates: Record<string, any> = { name, phone, specialty, bio, photoUrl, availability, certifications };
        if (typeof publicProfileEnabled === "boolean") updates.publicProfileEnabled = publicProfileEnabled;
        if (typeof publicQuote === "string" || publicQuote === null) updates.publicQuote = publicQuote;
        if (Array.isArray(languages)) updates.languages = languages;
        if (Array.isArray(specializations)) updates.specializations = specializations;

        // Sanitize numeric fields: convert empty strings to null, valid strings to numbers
        if (hourlyRate === "" || hourlyRate === undefined) {
          updates.hourlyRate = null;
        } else if (hourlyRate !== null) {
          updates.hourlyRate = String(Number(hourlyRate));
        } else {
          updates.hourlyRate = null;
        }

        // Sanitize optional text fields: convert empty strings to null
        if (updates.phone === "") updates.phone = null;
        if (updates.specialty === "") updates.specialty = null;
        if (updates.bio === "") updates.bio = null;

        // Remove undefined keys
        Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

        // Verify coach belongs to academy first
        const coach = await storage.getCoach(id, academyId);
        if (!coach) {
          return res.status(404).json({ error: "Coach not found" });
        }

        const updated = await storage.updateCoach(id, updates);
        res.json(updated);
      } catch (error) {
        console.error("Error updating coach profile:", error);
        res.status(500).json({ error: "Failed to update coach profile" });
      }
    },
  );

  // Upload coach profile photo
  router.post(
    "/api/coach/profile/photo",
    authMiddleware,
    profilePhotoUpload.single("photo"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        if (!coachId) {
          return res.status(400).json({ error: "Coach profile not found" });
        }

        if (!req.file) {
          return res.status(400).json({ error: "No photo uploaded" });
        }

        const mimeType = req.file.mimetype || "image/jpeg";
        const base64Data = req.file.buffer.toString("base64");
        const photoUrl = `data:${mimeType};base64,${base64Data}`;

        await storage.updateCoach(coachId, { photoUrl });

        res.json({
          success: true,
          photoUrl,
          message: "Profile photo updated successfully",
        });
      } catch (error) {
        console.error("Error uploading coach profile photo:", error);
        res.status(500).json({ error: "Failed to upload profile photo" });
      }
    },
  );

  // Coach Earnings routes - extracted to server/routes/coach-earnings.ts

  // ==================== COACH XP SYSTEM ====================

  // Get coach XP and level
  router.get(
    "/api/coach/:id/xp",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId!;

        const cacheKey = `coachXp:${academyId}:${id}`;
        const cached = _coachXpCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          return res.json(cached.data);
        }

        const coach = await storage.getCoach(id, academyId);
        if (!coach) {
          return res.status(404).json({ error: "Coach not found" });
        }

        const totalXp = coach.totalXp || 0;
        const level = coach.level || 1;

        // Calculate XP thresholds using same logic as POST (level up loop)
        // Each level requires: 500 + (level-1) * 100 XP
        // Level 1->2: 500 XP, Level 2->3: 600 XP, Level 3->4: 700 XP, etc.
        let accumulatedXp = 0;
        for (let lvl = 1; lvl < level; lvl++) {
          accumulatedXp += 500 + (lvl - 1) * 100;
        }
        const xpForCurrentLevel = accumulatedXp;
        const requiredForLevel = 500 + (level - 1) * 100;
        const currentLevelXp = Math.max(0, totalXp - xpForCurrentLevel);
        const xpPercent = Math.min(
          100,
          Math.max(0, Math.round((currentLevelXp / requiredForLevel) * 100)),
        );

        // Get recent transactions
        const transactions = await storage.getCoachXpTransactions(id, 10);

        const xpResult = {
          level,
          totalXp,
          currentLevelXp,
          requiredForLevel,
          xpPercent,
          transactions,
        };
        _coachXpCache.set(cacheKey, { data: xpResult, expiresAt: Date.now() + 5 * 60 * 1000 });
        res.json(xpResult);
      } catch (error) {
        console.error("Error fetching coach XP:", error);
        res.status(500).json({ error: "Failed to fetch coach XP" });
      }
    },
  );

  // Get coach observation patterns (anti-abuse stats)
  router.get(
    "/api/coach/:id/observation-patterns",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId!;

        const coach = await storage.getCoach(id, academyId);
        if (!coach) {
          return res.status(404).json({ error: "Coach not found" });
        }

        const patterns = await storage.getCoachObservationPatterns(id, 30);
        const storedStats = await storage.getCoachStats(id);

        res.json({
          observationPatterns: {
            upRate: Math.round(patterns.upRate * 100),
            downRate: Math.round(patterns.downRate * 100),
            highEffortRate: Math.round(patterns.highEffortRate * 100),
            totalObservations: patterns.totalObservations,
          },
          flags: {
            isPatternAbuse: patterns.isPatternAbuse,
            isHighEffortSpammer: storedStats?.isHighEffortSpammer || false,
            isUpSpammer: storedStats?.isUpSpammer || false,
          },
          severityFactor: storedStats?.severityFactor
            ? parseFloat(storedStats.severityFactor)
            : 1.0,
          message: patterns.isPatternAbuse
            ? "Your observation patterns are unusual - consider varying your assessments"
            : "Your observation patterns are healthy",
        });
      } catch (error) {
        console.error("Error fetching coach observation patterns:", error);
        res
          .status(500)
          .json({ error: "Failed to fetch coach observation patterns" });
      }
    },
  );

  // Award coach XP (internal endpoint for session completion, feedback, etc.)
  router.post(
    "/api/coach/:id/xp",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId!;
        const { xpAmount, source, description, sessionId, metadata } = req.body;

        if (!xpAmount || !source) {
          return res
            .status(400)
            .json({ error: "xpAmount and source are required" });
        }

        // Verify coach belongs to academy first
        const coach = await storage.getCoach(id, academyId);
        if (!coach) {
          return res.status(404).json({ error: "Coach not found" });
        }

        // Add XP transaction
        await storage.addCoachXpTransaction({
          coachId: id,
          xpAmount,
          source,
          description,
          sessionId,
          metadata,
        });

        // Update coach total XP and check for level up
        const newTotalXp = (coach.totalXp || 0) + xpAmount;

        // Calculate new level
        let newLevel = 1;
        let xpThreshold = 500;
        let accumulatedXp = 0;
        while (accumulatedXp + xpThreshold <= newTotalXp) {
          accumulatedXp += xpThreshold;
          newLevel++;
          xpThreshold = 500 + (newLevel - 1) * 100;
        }

        await storage.updateCoach(id, { totalXp: newTotalXp, level: newLevel });

        const performedBy = req.user!.coachId;
        await storage.createAuditLog({
          entityType: "coach_xp",
          entityId: id,
          action: `award_${xpAmount}_xp`,
          performedBy: performedBy!,
        });

        res.json({
          success: true,
          newTotalXp,
          newLevel,
          leveledUp: newLevel > (coach.level || 1),
        });
      } catch (error) {
        console.error("Error awarding coach XP:", error);
        res.status(500).json({ error: "Failed to award coach XP" });
      }
    },
  );

  // Get coach stats (sessions count, players count, streak)
  router.get(
    "/api/coach/:id/stats",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId!;

        // Verify coach belongs to academy first
        const coach = await storage.getCoach(id, academyId);
        if (!coach) {
          return res.status(404).json({ error: "Coach not found" });
        }

        // Get all sessions for this coach
        const allSessions = await storage.getAllSessionsByCoach(id, academyId);
        const completedSessions = allSessions.filter(
          (s) => s.status === "completed",
        );

        // Get unique player count using batch query (optimized)
        const sessionIds = allSessions.map((s) => s.id);
        const allSessionPlayers =
          await storage.getSessionPlayersBatch(sessionIds);
        const playerIds = new Set<string>();
        allSessionPlayers.forEach((sp) => {
          if (sp.playerId) playerIds.add(sp.playerId);
        });
        // Calculate streak (consecutive days with completed sessions)
        let streak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sortedSessions = completedSessions
          .filter((s) => new Date(s.startTime) <= today)
          .sort(
            (a, b) =>
              new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
          );

        if (sortedSessions.length > 0) {
          let checkDate = new Date(today);
          const sessionDates = new Set(
            sortedSessions.map((s) => {
              const d = new Date(s.startTime);
              d.setHours(0, 0, 0, 0);
              return d.getTime();
            }),
          );

          while (sessionDates.has(checkDate.getTime())) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          }
        }

        res.json({
          sessionsCount: completedSessions.length,
          playersCount: playerIds.size,
          streak,
          totalSessionsScheduled: allSessions.length,
        });
      } catch (error) {
        console.error("Error fetching coach stats:", error);
        res.status(500).json({ error: "Failed to fetch coach stats" });
      }
    },
  );

  // ==================== PROGRESS ENGINE V2 API ====================

  // Get all skill domains
  router.get(
    "/api/progress/domains",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        // Seed domains if not present
        await storage.seedSkillDomains();
        const domains = await storage.getAllSkillDomains();
        // Cache for 1 hour - domains rarely change
        res.set("Cache-Control", "private, max-age=3600");
        res.json(domains);
      } catch (error) {
        console.error("Error fetching skill domains:", error);
        res.status(500).json({ error: "Failed to fetch skill domains" });
      }
    },
  );

  // Get player skill states (current progress per domain)
  router.get(
    "/api/players/:id/skill-state",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Initialize skill states if not present
        await storage.seedSkillDomains();
        await storage.initializePlayerSkillStates(id);

        const states = await storage.getPlayerSkillStates(
          id,
          academyId || undefined,
        );
        const domains = await storage.getAllSkillDomains();
        const domainXpSummary = await storage.getPlayerDomainXpSummary(id);

        // Merge domain info with state and XP data
        const statesWithDomains = states.map((state) => {
          const domain = domains.find((d) => d.id === state.domainId);
          const xpData = domainXpSummary.find(
            (x) => x.domainId === state.domainId,
          );
          return {
            ...state,
            domain: domain || null,
            domainXp: xpData?.totalXp || 0,
            observationCount: xpData?.observationCount || 0,
            avgDelta: xpData?.avgDelta || 0,
            lastObservation: xpData?.lastObservation || null,
          };
        });

        res.json(statesWithDomains);
      } catch (error) {
        console.error("Error fetching player skill states:", error);
        res.status(500).json({ error: "Failed to fetch skill states" });
      }
    },
  );

  // Get player observation trends for charts
  router.get(
    "/api/players/:id/observation-trends",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;
        const days = parseInt(req.query.days as string) || 30;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const trends = await storage.getPlayerObservationTrends(id, days);
        const domains = await storage.getAllSkillDomains();

        const trendsWithDomains = trends.map((t) => {
          const domain = domains.find((d) => d.id === t.domainId);
          return { ...t, domain };
        });

        res.json(trendsWithDomains);
      } catch (error) {
        console.error("Error fetching observation trends:", error);
        res.status(500).json({ error: "Failed to fetch observation trends" });
      }
    },
  );

  // Submit skill observations for a session
  router.post(
    "/api/coach/sessions/:sessionId/observations",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { sessionId } = req.params;
        const coachId = req.user!.coachId;
        const { playerId, observations } = req.body;
        // observations: [{ domainId, direction: 'up'|'stable'|'down', effortLevel: 'high'|'normal'|'low', note? }]

        if (
          !playerId ||
          !coachId ||
          !observations ||
          !Array.isArray(observations)
        ) {
          return res
            .status(400)
            .json({ error: "playerId and observations array required" });
        }

        // ==================== ANTI-ABUSE CHECKS ====================
        const DAILY_XP_CAP = 50; // Max XP per player per day
        const warnings: string[] = [];

        // Check daily XP cap
        const dailyXpSoFar = await storage.getPlayerDailyXp(playerId);
        const isNearDailyCap = dailyXpSoFar >= DAILY_XP_CAP * 0.8;
        const isAtDailyCap = dailyXpSoFar >= DAILY_XP_CAP;

        if (isAtDailyCap) {
          warnings.push(
            "Daily XP cap reached - observations recorded but no XP awarded",
          );
        } else if (isNearDailyCap) {
          warnings.push("Approaching daily XP cap");
        }

        // Check coach patterns for abuse
        const coachPatterns = await storage.getCoachObservationPatterns(
          coachId,
          30,
        );
        let coachSeverityFactor = 1.0;

        if (coachPatterns.isPatternAbuse) {
          coachSeverityFactor = 0.7; // 30% reduction for abusive patterns
          warnings.push(
            "Observation impact reduced due to unusual patterns - vary your assessments",
          );
        } else if (coachPatterns.upRate > 0.7) {
          coachSeverityFactor = 0.9; // 10% reduction for generous coaches
        }

        // Check coach-player relationship for frequent flyer detection
        const relationship = await storage.checkCoachPlayerRelationship(
          coachId,
          playerId,
        );
        if (relationship.isFrequentFlyer) {
          coachSeverityFactor *= 0.8; // Additional 20% reduction
          warnings.push(
            "High observation frequency with this player - impact reduced",
          );
        }

        const results = [];
        let skillImprovementXp = 0;
        const effortLevels: string[] = [];

        // Count observations per session for diminishing returns
        const observationCounts: Record<string, number> = {};

        // Track sessions with downs for down-guard (per session basis)
        const recentDownSessions = await storage.getRecentDownSessionsForPlayer(
          playerId,
          3,
        );

        // Track if we've already applied a down in this session
        let downAppliedThisSession = false;

        for (const obs of observations) {
          const { domainId, direction, effortLevel, note } = obs;

          // Track effort levels (we'll use average for session XP)
          effortLevels.push(effortLevel);

          // Get current state
          const currentState = await storage.getPlayerSkillState(
            playerId,
            domainId,
          );

          // Calculate diminishing return factor
          const countKey = `${sessionId}-${playerId}-${domainId}`;
          observationCounts[countKey] = (observationCounts[countKey] || 0) + 1;
          const obsCount = observationCounts[countKey];
          const diminishingFactors = [1.0, 0.7, 0.5, 0.3, 0.3];
          const diminishingFactor =
            diminishingFactors[Math.min(obsCount - 1, 4)];

          // Calculate raw delta
          let rawDelta = 0;
          if (direction === "up") rawDelta = 5;
          else if (direction === "down") rawDelta = -3;
          // stable = 0

          // Calculate effort multiplier for this observation's delta
          let effortMultiplier = 1.0;
          if (effortLevel === "high") effortMultiplier = 1.2;
          else if (effortLevel === "low") effortMultiplier = 0.8;

          // Check for down-guard (max 1 effective down per 3 sessions - on session basis)
          let wasDownGuarded = false;
          if (direction === "down") {
            // Check if we already have a down in last 3 sessions OR already applied one this session
            const hasRecentDown =
              recentDownSessions.length >= 1 &&
              !recentDownSessions.includes(sessionId);
            if (hasRecentDown || downAppliedThisSession) {
              wasDownGuarded = true;
              rawDelta = 0; // Convert to stable
            } else {
              // This is the first down in this session and no recent down sessions
              downAppliedThisSession = true;
            }
          }

          // Check cooldown (if up was given recently, reduce impact)
          let wasCooldownApplied = false;
          if (direction === "up" && currentState?.lastUpDate) {
            const hoursSinceLastUp =
              (Date.now() - new Date(currentState.lastUpDate).getTime()) /
              (1000 * 60 * 60);
            if (hoursSinceLastUp < 48) {
              // Within 48 hours
              wasCooldownApplied = true;
              rawDelta = Math.round(rawDelta * 0.5);
            }
          }

          // Calculate applied delta (including coach severity factor)
          let appliedDelta = Math.round(
            rawDelta *
              effortMultiplier *
              diminishingFactor *
              coachSeverityFactor,
          );

          // Confidence guard: prevent hard drops
          if (
            appliedDelta < 0 &&
            currentState?.confidenceScore &&
            currentState.confidenceScore < 30
          ) {
            appliedDelta = 0; // Don't allow drops when confidence is low
          }

          // Create observation record
          const observation = await storage.createSkillObservation({
            sessionId,
            playerId,
            coachId,
            domainId,
            direction,
            effortLevel,
            note,
            rawDelta,
            appliedDelta,
            wasDownGuarded,
            wasCooldownApplied,
            diminishingReturnFactor: String(diminishingFactor),
          });
          results.push(observation);

          // Update player skill state
          const newProgressValue = Math.max(
            0,
            Math.min(100, (currentState?.progressValue || 0) + appliedDelta),
          );

          // Calculate new trend based on recent observations
          const recentObs = await storage.getPlayerRecentObservations(
            playerId,
            5,
          );
          const domainObs = recentObs.filter((o) => o.domainId === domainId);
          const upCount = domainObs.filter((o) => o.direction === "up").length;
          const downCount = domainObs.filter(
            (o) => o.direction === "down",
          ).length;

          let newTrend = "stable";
          if (upCount >= 3) newTrend = "improving";
          else if (downCount >= 2) newTrend = "focus";

          // Calculate momentum
          let newMomentum = "building";
          if (upCount >= 4) newMomentum = "strong";
          else if (downCount >= 2 || (upCount === 0 && domainObs.length >= 3))
            newMomentum = "slowing";

          // Update confidence score
          let newConfidence = currentState?.confidenceScore || 50;
          if (direction === "up")
            newConfidence = Math.min(100, newConfidence + 5);
          else if (direction === "down")
            newConfidence = Math.max(0, newConfidence - 3);

          await storage.upsertPlayerSkillState({
            playerId,
            domainId,
            progressValue: newProgressValue,
            trend: newTrend,
            momentum: newMomentum,
            confidenceScore: newConfidence,
            lastUpDate:
              direction === "up"
                ? new Date()
                : currentState?.lastUpDate || undefined,
            upCountRecent:
              direction === "up"
                ? (currentState?.upCountRecent || 0) + 1
                : currentState?.upCountRecent || 0,
            downCountRecent:
              direction === "down"
                ? (currentState?.downCountRecent || 0) + 1
                : currentState?.downCountRecent || 0,
          });

          // Calculate skill improvement XP bonus (per upward observation)
          if (direction === "up") {
            skillImprovementXp += 5;
          }
        }

        // Calculate session effort multiplier based on most common effort level
        const effortCounts = { high: 0, normal: 0, low: 0 };
        for (const level of effortLevels) {
          if (level === "high") effortCounts.high++;
          else if (level === "low") effortCounts.low++;
          else effortCounts.normal++;
        }

        // Use the most frequent effort level for session XP
        let sessionEffortMultiplier = 1.0;
        if (
          effortCounts.high >= effortCounts.normal &&
          effortCounts.high >= effortCounts.low
        ) {
          sessionEffortMultiplier = 1.2;
        } else if (
          effortCounts.low >= effortCounts.normal &&
          effortCounts.low >= effortCounts.high
        ) {
          sessionEffortMultiplier = 0.8;
        }

        // Calculate total XP: Base 10 per session (once) + effort multiplier + skill improvement bonuses
        const baseSessionXp = Math.round(10 * sessionEffortMultiplier);
        let totalXpGained = baseSessionXp + skillImprovementXp;

        // Apply daily XP cap
        const remainingDailyXp = DAILY_XP_CAP - dailyXpSoFar;
        const xpBeforeCap = totalXpGained;

        if (isAtDailyCap) {
          totalXpGained = 0;
        } else if (totalXpGained > remainingDailyXp) {
          totalXpGained = Math.max(0, remainingDailyXp);
          warnings.push(
            `XP reduced from ${xpBeforeCap} to ${totalXpGained} due to daily cap`,
          );
        }

        // Create XP transaction
        if (totalXpGained > 0) {
          await storage.createXpTransaction({
            playerId,
            sessionId,
            xpAmount: totalXpGained,
            source: "session",
            description: `Session: ${baseSessionXp} base + ${skillImprovementXp} skill bonus`,
          });
        }

        // Update coach stats for pattern detection (async, don't block response)
        storage
          .updateCoachStatsFromObservations(coachId)
          .catch((err) => console.error("Failed to update coach stats:", err));

        // Also update pillar progress from observations as server-side fallback (B3)
        if (observations.length > 0) {
          const effortMap: Record<string, number> = { high: 2, normal: 1, low: 0 };
          const directionMap: Record<string, number> = { up: 2, stable: 1, down: 0 };
          const avgEffort = effortLevels.length > 0
            ? effortLevels.reduce((sum, e) => sum + (effortMap[e] ?? 1), 0) / effortLevels.length
            : 1;
          const avgExecution = observations.length > 0
            ? observations.reduce((sum: number, o: any) => sum + (directionMap[o.direction] ?? 1), 0) / observations.length
            : 1;
          updatePillarProgress(playerId, sessionId, {
            effort: Math.round(avgEffort),
            execution: Math.round(avgExecution),
            understanding: 1,
            overall: avgExecution > 1.2 ? "improved" : avgExecution < 0.8 ? "declined" : "stable",
          }).catch((err) => console.error("Failed to update pillar progress from observations:", err));
        }

        res.status(201).json({
          observations: results,
          xpGained: totalXpGained,
          xpBeforeCap,
          dailyXpRemaining: Math.max(
            0,
            DAILY_XP_CAP - dailyXpSoFar - totalXpGained,
          ),
          warnings: warnings.length > 0 ? warnings : undefined,
          message: `${results.length} observations recorded`,
        });
      } catch (error) {
        console.error("Error creating skill observations:", error);
        res.status(500).json({ error: "Failed to create observations" });
      }
    },
  );

  // Get session observations
  router.get(
    "/api/coach/sessions/:sessionId/observations",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { sessionId } = req.params;
        const observations =
          await storage.getSessionSkillObservations(sessionId);
        res.json(observations);
      } catch (error) {
        console.error("Error fetching session observations:", error);
        res.status(500).json({ error: "Failed to fetch observations" });
      }
    },
  );

  // Create assessment for a player
  router.post(
    "/api/players/:id/assessments",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;
        const { domainId, status, notes, isBaseline } = req.body;

        if (!coachId || !domainId || !status) {
          return res
            .status(400)
            .json({ error: "domainId and status required" });
        }

        // Get previous status
        const latestAssessment = await storage.getLatestAssessment(
          id,
          domainId,
        );
        const previousStatus = latestAssessment?.status || null;

        const assessment = await storage.createAssessment({
          playerId: id,
          coachId,
          domainId,
          status,
          previousStatus,
          notes,
          isBaseline: isBaseline || !latestAssessment, // First assessment is always baseline
        });

        // Update player skill state with new assessment
        await storage.upsertPlayerSkillState({
          playerId: id,
          domainId,
          assessmentStatus: status,
          lastAssessmentDate: new Date(),
        });

        res.status(201).json(assessment);
      } catch (error) {
        console.error("Error creating assessment:", error);
        res.status(500).json({ error: "Failed to create assessment" });
      }
    },
  );

  // Get player assessments
  router.get(
    "/api/players/:id/assessments",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const assessments = await storage.getPlayerAssessments(id);
        res.json(assessments);
      } catch (error) {
        console.error("Error fetching assessments:", error);
        res.status(500).json({ error: "Failed to fetch assessments" });
      }
    },
  );

  // Get level requirements
  router.get(
    "/api/progress/levels",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const requirements = await storage.getAllLevelRequirements();
        // Cache for 1 hour - level requirements rarely change
        res.set("Cache-Control", "private, max-age=3600");
        res.json(requirements);
      } catch (error) {
        console.error("Error fetching level requirements:", error);
        res.status(500).json({ error: "Failed to fetch level requirements" });
      }
    },
  );

  // Get level readiness for a player
  router.get(
    "/api/players/:id/level-readiness/:level",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id, level } = req.params;
        const readiness = await storage.calculatePlayerLevelReadiness(
          id,
          level,
        );
        res.json(readiness);
      } catch (error) {
        console.error("Error calculating level readiness:", error);
        res.status(500).json({ error: "Failed to calculate level readiness" });
      }
    },
  );

  // Promote/demote player level with coach override
  router.post(
    "/api/players/:id/level-change",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId;
        const { newLevel, reason, isOverride } = req.body;

        if (!newLevel) {
          return res.status(400).json({ error: "newLevel is required" });
        }

        const { valid, player } = await validatePlayerOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid || !player) {
          return res.status(404).json({ error: "Player not found" });
        }

        const previousLevel = player.ballLevel || "red1";

        // Check level readiness if not override
        if (!isOverride) {
          const readiness = await storage.calculatePlayerLevelReadiness(
            id,
            newLevel,
          );
          if (!readiness.isReady) {
            return res.status(400).json({
              error: "Player does not meet level requirements",
              readiness,
              message: "Use override to promote anyway",
            });
          }
        }

        // Update player level
        await storage.updatePlayer(id, { ballLevel: newLevel });

        // Create audit log with override details
        await storage.createAuditLog({
          entityType: "player_level",
          entityId: id,
          action: isOverride ? "override_level_change" : "level_change",
          performedBy: coachId!,
          metadata: JSON.stringify({
            previousLevel,
            newLevel,
            reason: reason || null,
            isOverride: isOverride || false,
            timestamp: new Date().toISOString(),
          }),
        });

        // Create flag if override used without meeting requirements
        if (isOverride) {
          const readiness = await storage.calculatePlayerLevelReadiness(
            id,
            newLevel,
          );
          if (!readiness.isReady) {
            await storage.createPlayerFlag({
              playerId: id,
              flagType: "speedrun_flag",
              severity: "medium",
              description: `Level changed to ${newLevel} via coach override without meeting all requirements`,
              metadata: JSON.stringify({
                previousLevel,
                newLevel,
                coachId,
                reason,
                unmetRequirements: readiness.requirements.filter((r) => !r.met),
              }),
            });
          }
        }

        res.json({
          success: true,
          previousLevel,
          newLevel,
          isOverride: isOverride || false,
          message: isOverride
            ? `Level changed to ${newLevel} via coach override`
            : `Level changed to ${newLevel}`,
        });
      } catch (error) {
        console.error("Error changing player level:", error);
        res.status(500).json({ error: "Failed to change player level" });
      }
    },
  );

  // Get player override history
  router.get(
    "/api/players/:id/level-history",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const logs = await storage.getAuditLogs("player_level", id);

        res.json(
          logs.map((log) => ({
            id: log.id,
            action: log.action,
            performedBy: log.performedBy,
            timestamp: log.timestamp,
            details: log.metadata ? JSON.parse(log.metadata) : null,
          })),
        );
      } catch (error) {
        console.error("Error fetching level history:", error);
        res.status(500).json({ error: "Failed to fetch level history" });
      }
    },
  );

  // Get player XP and transactions
  router.get(
    "/api/players/:id/xp",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const totalXp = await storage.getPlayerTotalXp(
          id,
          academyId || undefined,
        );
        const transactions = await storage.getPlayerXpTransactions(
          id,
          20,
          academyId || undefined,
        );
        res.json({ totalXp, transactions });
      } catch (error) {
        console.error("Error fetching player XP:", error);
        res.status(500).json({ error: "Failed to fetch XP" });
      }
    },
  );

  // Freeze/unfreeze player progress
  router.post(
    "/api/players/:id/progress-freeze",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;
        const { freeze, reason } = req.body;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const skillStates = await storage.getPlayerSkillStates(
          id,
          academyId || undefined,
        );

        for (const state of skillStates) {
          await storage.upsertPlayerSkillState({
            playerId: id,
            domainId: state.domainId,
            isFrozen: freeze,
            freezeReason: freeze ? reason : null,
          });
        }

        res.json({ success: true, frozen: freeze, reason });
      } catch (error) {
        console.error("Error updating progress freeze:", error);
        res.status(500).json({ error: "Failed to update progress freeze" });
      }
    },
  );

  // ==================== COACH COURT PREFERENCES ====================

  // Get court preferences for a coach
  router.get(
    "/api/coaches/:id/court-preferences",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;

        if (id !== coachId) {
          return res.status(404).json({ error: "Preferences not found" });
        }

        const courtPreferences = await storage.getCoachCourtPreferences(id);
        const rules = await storage.getCoachCourtRules(id);

        res.json({
          courtPreferences,
          rules: rules || null,
        });
      } catch (error) {
        console.error("Error fetching court preferences:", error);
        res.status(500).json({ error: "Failed to fetch court preferences" });
      }
    },
  );

  // Update court preferences for a coach
  router.put(
    "/api/coaches/:id/court-preferences",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;

        if (id !== coachId) {
          return res.status(404).json({ error: "Preferences not found" });
        }

        const { courtPreferences, rules } = req.body;

        if (courtPreferences && Array.isArray(courtPreferences)) {
          await storage.upsertCoachCourtPreferences(id, courtPreferences);
        }

        if (rules) {
          await storage.upsertCoachCourtRules(id, rules);
        }

        const updatedPreferences = await storage.getCoachCourtPreferences(id);
        const updatedRules = await storage.getCoachCourtRules(id);

        res.json({
          courtPreferences: updatedPreferences,
          rules: updatedRules || null,
        });
      } catch (error) {
        console.error("Error updating court preferences:", error);
        res.status(500).json({ error: "Failed to update court preferences" });
      }
    },
  );

  // ==================== GLOW CHAT API ====================

  // Get all conversations for a coach
  router.get(
    "/api/coaches/:id/conversations",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;

        // Verify the authenticated coach is requesting their own conversations
        if (id !== coachId) {
          return res.status(404).json({ error: "Conversations not found" });
        }

        // Check cache first
        const cacheKey = CACHE_KEYS.COACH_CONVERSATIONS(coachId);
        const cached = apiCache.get(cacheKey);
        if (cached) {
          console.log("[Conversations PERF] Cache HIT for coach:", coachId);
          return res.json(cached);
        }
        const _perfStart = Date.now();

        const conversations = await storage.getConversationsForCoach(
          id,
          academyId,
        );

        // OPTIMIZED: Batch fetch all participants and players at once
        const conversationIds = conversations.map((c) => c.id);
        const playerIds = conversations
          .map((c) => c.playerId)
          .filter(Boolean) as string[];

        // Pre-collect series IDs from recurring class chats (title is the series id)
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const seriesIds = Array.from(new Set(
          conversations
            .filter((c) =>
              (c.type === "series_group" || c.type === "squad" || c.type === "lesson_group") &&
              !!c.title && UUID_RE.test(c.title)
            )
            .map((c) => c.title!) as string[]
        ));

        // Parallel batch fetch
        const [allParticipants, allPlayers, seriesRows] = await Promise.all([
          conversationIds.length > 0
            ? storage.getConversationParticipantsBatch(
                conversationIds,
                coachId!,
              )
            : Promise.resolve([]),
          playerIds.length > 0
            ? db
                .select({ id: players.id, name: players.name })
                .from(players)
                .where(inArray(players.id, playerIds))
            : Promise.resolve([]),
          seriesIds.length > 0
            ? db
                .select({
                  id: coachingSeries.id,
                  title: coachingSeries.title,
                  dayOfWeek: coachingSeries.dayOfWeek,
                  startTime: coachingSeries.startTime,
                  sessionType: coachingSeries.sessionType,
                })
                .from(coachingSeries)
                .where(inArray(coachingSeries.id, seriesIds))
            : Promise.resolve([] as Array<{ id: string; title: string; dayOfWeek: number; startTime: string; sessionType: string }>),
        ]);

        // Create lookup maps
        const participantsByConv = new Map<string, typeof allParticipants>();
        for (const p of allParticipants) {
          if (!participantsByConv.has(p.conversationId))
            participantsByConv.set(p.conversationId, []);
          participantsByConv.get(p.conversationId)!.push(p);
        }

        const playerNameMap = new Map<string, string>();
        for (const p of allPlayers) {
          playerNameMap.set(p.id, p.name);
        }

        const seriesById = new Map<string, { title: string; dayOfWeek: number; startTime: string; sessionType: string }>();
        for (const s of seriesRows) {
          seriesById.set(s.id, {
            title: s.title,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            sessionType: s.sessionType,
          });
        }

        // Enrich using cached data (no await in loop)
        const enriched = conversations.map((conv) => {
          const participants = participantsByConv.get(conv.id) || [];
          const playerName = conv.playerId
            ? playerNameMap.get(conv.playerId) || null
            : null;
          let seriesDayOfWeek: number | null = null;
          let seriesStartTime: string | null = null;
          let sessionType: string | null = null;
          let resolvedTitle = conv.title;
          if (
            (conv.type === "series_group" ||
              conv.type === "squad" ||
              conv.type === "lesson_group") &&
            conv.title
          ) {
            const series = seriesById.get(conv.title);
            if (series) {
              resolvedTitle = series.title;
              seriesDayOfWeek = series.dayOfWeek;
              seriesStartTime = series.startTime;
              sessionType = series.sessionType;
            }
          }
          return {
            ...conv,
            title: resolvedTitle,
            participants,
            playerName,
            seriesDayOfWeek,
            seriesStartTime,
            sessionType,
          };
        });

        // Return only real conversations - no sample/demo data
        res.json(enriched);
      } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ error: "Failed to fetch conversations" });
      }
    },
  );

  // Get all conversations for a player
  router.get(
    "/api/players/:id/conversations",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId!;

        // Verify player belongs to this academy
        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Conversations not found" });
        }

        const conversations = await storage.getConversationsForPlayer(
          id,
          academyId,
        );

        // Enrich with coach name
        const enriched = await Promise.all(
          conversations.map(async (conv) => {
            let coachName = null;
            if (conv.coachId) {
              const coach = await storage.getCoach(conv.coachId, academyId);
              coachName = coach?.name;
            }
            return { ...conv, coachName };
          }),
        );

        res.json(enriched);
      } catch (error) {
        console.error("Error fetching player conversations:", error);
        res.status(500).json({ error: "Failed to fetch conversations" });
      }
    },
  );

  // Get or create a coach-player conversation
  router.post(
    "/api/conversations/coach-player",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;
        const { playerId } = req.body;

        if (!coachId || !playerId) {
          return res.status(400).json({ error: "playerId required" });
        }

        // Verify player belongs to the academy
        const player = await storage.getPlayer(playerId, academyId);
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }

        const conversation = await storage.getOrCreateCoachPlayerConversation(
          coachId!,
          playerId,
          academyId,
        );
        res.json(conversation);
      } catch (error) {
        console.error("Error creating conversation:", error);
        res.status(500).json({ error: "Failed to create conversation" });
      }
    },
  );

  // Create a new conversation
  router.post(
    "/api/conversations",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;
        const { type, playerId, title } = req.body;

        if (!type || !coachId) {
          return res.status(400).json({ error: "type required" });
        }

        // Verify player belongs to academy if provided
        if (playerId) {
          const player = await storage.getPlayer(playerId, academyId);
          if (!player) {
            return res.status(404).json({ error: "Player not found" });
          }
        }

        // For coach_player type, use the existing method
        if (type === "coach_player" && playerId) {
          const conversation = await storage.getOrCreateCoachPlayerConversation(
            coachId!,
            playerId,
            academyId,
          );
          return res.json(conversation);
        }

        // For other types, create a new conversation
        const conversation = await storage.createConversation({
          type,
          playerId: playerId || null,
          coachId,
          title: title || null,
          academyId,
        });

        res.status(201).json(conversation);
      } catch (error) {
        console.error("Error creating conversation:", error);
        res.status(500).json({ error: "Failed to create conversation" });
      }
    },
  );

  // Get all squads (hardcoded for now)
  router.get(
    "/api/squads",
    authMiddleware,
    async (_req: AuthenticatedRequest, res: Response) => {
      try {
        const squads = [
          { id: "squad-red-1", name: "Red 1" },
          { id: "squad-red-2", name: "Red 2" },
          { id: "squad-orange-1", name: "Orange 1" },
          { id: "squad-orange-2", name: "Orange 2" },
          { id: "squad-yellow", name: "Yellow" },
          { id: "squad-green", name: "Green" },
        ];
        res.json(squads);
      } catch (error) {
        console.error("Error fetching squads:", error);
        res.status(500).json({ error: "Failed to fetch squads" });
      }
    },
  );

  // Get messages for a conversation
  router.get(
    "/api/conversations/:id/messages",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;
        const limit = parseInt(req.query.limit as string) || 50;

        // Handle sample conversations with sample messages
        if (id.startsWith("sample-")) {
          const sampleMessages = getSampleMessages(id);
          return res.json(sampleMessages);
        }

        // Verify coach has access to this conversation within their academy
        const conversation = await storage.getConversation(
          id,
          coachId ?? undefined,
          academyId,
        );
        if (!conversation) {
          // Check if coach is a participant
          const participants = await storage.getConversationParticipants(
            id,
            coachId!,
            academyId,
          );
          const isParticipant = participants.some((p) => p.coachId === coachId);
          if (!isParticipant) {
            return res.status(404).json({ error: "Conversation not found" });
          }
        }

        const messages = await storage.getMessages(
          id,
          limit,
          coachId!,
          academyId,
        );

        // Enrich with reactions
        const enriched = await Promise.all(
          messages.map(async (msg) => {
            const reactions = await storage.getMessageReactions(
              msg.id,
              coachId!,
              academyId,
            );
            return { ...msg, reactions };
          }),
        );

        res.json(enriched.reverse()); // Return oldest first for chat UI
      } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ error: "Failed to fetch messages" });
      }
    },
  );

  // Helper function for sample messages
  function getSampleMessages(conversationId: string) {
    const dateParam = req.query.date as string | undefined;
    const now = dateParam ? new Date(dateParam) : new Date();
    const DUBAI_OFFSET = 4;
    const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
    const hour = 60 * 60 * 1000;

    if (conversationId === "sample-academy") {
      return [
        {
          id: "msg-academy-1",
          conversationId,
          senderType: "system",
          senderCoachId: null,
          senderPlayerId: null,
          body: "Sarah M. leveled up to Level 3! Great progress in Technical skills.",
          messageType: "system",
          createdAt: new Date(now.getTime() - 3 * hour).toISOString(),
          reactions: [],
        },
        {
          id: "msg-academy-2",
          conversationId,
          senderType: "coach",
          senderCoachId: null,
          senderPlayerId: null,
          body: "Welcome to the winter training program! Looking forward to an amazing season.",
          messageType: "text",
          createdAt: new Date(now.getTime() - 2 * hour).toISOString(),
          reactions: [],
        },
        {
          id: "msg-academy-3",
          conversationId,
          senderType: "system",
          senderCoachId: null,
          senderPlayerId: null,
          body: "Jake T. earned the 'Rally Master' badge for 50+ consecutive serves!",
          messageType: "system",
          createdAt: new Date(now.getTime() - 1 * hour).toISOString(),
          reactions: [],
        },
        {
          id: "msg-academy-4",
          conversationId,
          senderType: "system",
          senderCoachId: null,
          senderPlayerId: null,
          body: "New weekly challenge: Complete 3 sessions this week for bonus XP!",
          messageType: "system",
          createdAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
          reactions: [],
        },
      ];
    }

    if (conversationId === "sample-admin") {
      return [
        {
          id: "msg-admin-1",
          conversationId,
          senderType: "coach",
          senderCoachId: null,
          senderPlayerId: null,
          body: "Court 3 maintenance scheduled for tomorrow morning.",
          messageType: "text",
          createdAt: new Date(now.getTime() - 2 * hour).toISOString(),
          reactions: [],
        },
        {
          id: "msg-admin-2",
          conversationId,
          senderType: "coach",
          senderCoachId: null,
          senderPlayerId: null,
          body: "Updated holiday schedule posted on the board.",
          messageType: "text",
          createdAt: new Date(now.getTime() - hour).toISOString(),
          reactions: [],
        },
      ];
    }

    if (conversationId === "sample-squad-1") {
      return [
        {
          id: "msg-squad-1",
          conversationId,
          senderType: "coach",
          senderCoachId: null,
          senderPlayerId: null,
          body: "Great practice today everyone! See you Thursday.",
          messageType: "text",
          createdAt: new Date(now.getTime() - hour).toISOString(),
          reactions: [],
        },
      ];
    }

    if (conversationId === "sample-coach-maria") {
      return [
        {
          id: "msg-coach-1",
          conversationId,
          senderType: "coach",
          senderCoachId: null,
          senderPlayerId: null,
          body: "Did you see the new training schedule?",
          messageType: "text",
          createdAt: new Date(now.getTime() - hour).toISOString(),
          reactions: [],
        },
      ];
    }

    return [];
  }

  // Send a message
  router.post(
    "/api/conversations/:id/messages",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id: conversationId } = req.params;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;
        const {
          senderType,
          senderCoachId,
          senderPlayerId,
          body,
          messageType,
          replyToId,
        } = req.body;

        if (!body || !senderType) {
          return res
            .status(400)
            .json({ error: "body and senderType required" });
        }

        const sanitizedBody = filterProfanity(sanitizeMessage(body) || "");
        if (!sanitizedBody) {
          return res
            .status(400)
            .json({ error: "Message body is required after sanitization" });
        }

        if (coachId && chatRateLimiter.isRateLimited(coachId)) {
          return res
            .status(429)
            .json({
              error:
                "You're sending messages too quickly. Please wait a moment.",
            });
        }
        if (coachId) {
          chatRateLimiter.recordRequest(coachId);
        }

        const conversation = await storage.getConversation(
          conversationId,
          coachId ?? undefined,
          academyId,
        );
        if (!conversation) {
          const participants = await storage.getConversationParticipants(
            conversationId,
            coachId!,
            academyId,
          );
          const isParticipant = participants.some((p) => p.coachId === coachId);
          if (!isParticipant) {
            return res.status(404).json({ error: "Conversation not found" });
          }
        }

        const message = await storage.createMessage(
          {
            conversationId,
            senderType,
            senderCoachId: senderCoachId || null,
            senderPlayerId: senderPlayerId || null,
            body: sanitizedBody,
            messageType: messageType || "text",
            replyToId: replyToId || null,
          },
          coachId!,
          academyId,
        );

        if (!message) {
          return res
            .status(403)
            .json({ error: "Access denied to conversation" });
        }

        // Award XP for coach sending messages (engagement)
        if (senderType === "coach" && senderCoachId) {
          await storage.addCoachXpTransaction({
            coachId: senderCoachId,
            xpAmount: 2, // Small XP for chat engagement
            source: "chat_message",
            description: "Sent a message to player",
          });
        }

        // Broadcast new message via WebSocket to all academy members
        broadcastNewMessage(academyId, {
          conversationId,
          message: {
            id: message.id,
            content: sanitizedBody,
            senderType: message.senderType as "coach" | "player" | "system",
            senderId:
              message.senderCoachId || message.senderPlayerId || undefined,
            createdAt:
              message.createdAt?.toISOString() || new Date().toISOString(),
          },
        });

        res.status(201).json(message);

        // Send push notification to recipient (non-blocking)
        if (senderType === "coach" && senderCoachId) {
          // Get players in this conversation to notify them
          const participants = await storage.getConversationParticipants(
            conversationId,
            coachId!,
            academyId,
          );
          const coachData = await storage.getCoach(senderCoachId);
          const senderName = coachData?.firstName
            ? `${coachData.firstName} ${coachData.lastName || ""}`.trim()
            : "Coach";

          for (const participant of participants) {
            if (participant.playerId) {
              sendNewMessageNotification(
                participant.playerId,
                senderName,
                sanitizedBody.substring(0, 100),
              ).catch((err) =>
                console.error(
                  "[PushNotification] Failed to send message notification:",
                  err,
                ),
              );
            }
          }
        }
      } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ error: "Failed to send message" });
      }
    },
  );

  // Mark conversation as read
  router.post(
    "/api/conversations/:id/read",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id: conversationId } = req.params;
        const { participantType, participantId } = req.body;

        await storage.updateParticipantLastRead(
          conversationId,
          participantType,
          participantId,
        );
        res.json({ success: true });
      } catch (error) {
        console.error("Error marking conversation read:", error);
        res.status(500).json({ error: "Failed to mark as read" });
      }
    },
  );

  // Add reaction to message
  router.post(
    "/api/messages/:id/reactions",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id: messageId } = req.params;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;
        const { reactorType, reactorCoachId, reactorPlayerId, emoji } =
          req.body;

        if (!emoji || !reactorType) {
          return res
            .status(400)
            .json({ error: "emoji and reactorType required" });
        }

        const reaction = await storage.addReaction(
          {
            messageId,
            reactorType,
            reactorCoachId: reactorCoachId || null,
            reactorPlayerId: reactorPlayerId || null,
            emoji,
          },
          coachId!,
          academyId,
        );

        if (!reaction) {
          return res.status(403).json({ error: "Access denied to message" });
        }

        res.status(201).json(reaction);
      } catch (error) {
        console.error("Error adding reaction:", error);
        res.status(500).json({ error: "Failed to add reaction" });
      }
    },
  );

  // Remove reaction from message
  router.delete(
    "/api/messages/:id/reactions",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id: messageId } = req.params;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;
        const { reactorType, reactorId, emoji } = req.body;

        const success = await storage.removeReaction(
          messageId,
          reactorType,
          reactorId,
          emoji,
          coachId!,
          academyId,
        );
        if (!success) {
          return res.status(403).json({ error: "Access denied to message" });
        }
        res.json({ success: true });
      } catch (error) {
        console.error("Error removing reaction:", error);
        res.status(500).json({ error: "Failed to remove reaction" });
      }
    },
  );

  // Get unread count for coach
  router.get(
    "/api/coaches/:id/unread-count",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const count = await storage.getUnreadCountForCoach(id);
        res.json({ unreadCount: count });
      } catch (error) {
        console.error("Error fetching unread count:", error);
        res.status(500).json({ error: "Failed to fetch unread count" });
      }
    },
  );

  // Get unread count for player
  router.get(
    "/api/players/:id/unread-count",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const count = await storage.getUnreadCountForPlayer(id);
        res.json({ unreadCount: count });
      } catch (error) {
        console.error("Error fetching unread count:", error);
        res.status(500).json({ error: "Failed to fetch unread count" });
      }
    },
  );

  // ==================== SERIES GROUP REMINDER ====================
  // Persistent throttle: max 3 reminders per coach+series in trailing 60 min.
  // Backed by the `series_reminder_log` Postgres table (see migration
  // 0018_series_reminder_log.sql) so the limit survives server restarts and
  // is shared across instances. Concurrent requests are serialised with a
  // transaction-scoped advisory lock keyed on (coachId, seriesId), then the
  // count + insert happen inside the same transaction, so concurrent
  // requests can never collectively exceed the cap.
  const SERIES_REMINDER_WINDOW_MS = 60 * 60 * 1000;
  const SERIES_REMINDER_MAX = 3;

  router.post(
    "/api/coach/series/:seriesId/reminder",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        if (!coachId) {
          return res.status(403).json({ error: "Coach profile required" });
        }
        const { seriesId } = req.params;
        const bodySchema = z.object({
          message: z.string().trim().min(1).max(280),
          lessonSessionId: z.string().optional().nullable(),
        });
        const parsed = bodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: fromZodError(parsed.error).toString(),
          });
        }
        const message = parsed.data.message.trim();
        const lessonSessionId = parsed.data.lessonSessionId || undefined;

        // Verify coach owns the series
        const [series] = await db
          .select({
            id: coachingSeries.id,
            coachId: coachingSeries.coachId,
            academyId: coachingSeries.academyId,
            title: coachingSeries.title,
          })
          .from(coachingSeries)
          .where(eq(coachingSeries.id, seriesId))
          .limit(1);
        if (!series) {
          return res.status(404).json({ error: "Series not found" });
        }
        if (series.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "You do not own this series" });
        }

        // Atomic throttle: serialise concurrent requests for the same
        // (coach, series) using a transaction-scoped Postgres advisory lock,
        // then count + insert inside the same transaction. The lock makes
        // the count -> insert sequence race-free even across multiple server
        // instances; the lock is released automatically at COMMIT/ROLLBACK.
        // Fail-closed: if the reservation transaction throws, abort with 500
        // rather than silently allowing the send through.
        const throttleKey = `series_reminder:${coachId}:${seriesId}`;
        let reservationId: string | null = null;
        try {
          reservationId = await db.transaction(async (tx) => {
            await tx.execute(
              sql`SELECT pg_advisory_xact_lock(hashtextextended(${throttleKey}, 0))`,
            );
            const countResult = await tx.execute<{ n: number }>(sql`
              SELECT count(*)::int AS n
              FROM ${seriesReminderLog}
              WHERE ${seriesReminderLog.coachId} = ${coachId}
                AND ${seriesReminderLog.seriesId} = ${seriesId}
                AND ${seriesReminderLog.sentAt}
                    >= now() - (${SERIES_REMINDER_WINDOW_MS} || ' milliseconds')::interval
            `);
            const recentCount = countResult.rows[0]?.n ?? 0;
            if (recentCount >= SERIES_REMINDER_MAX) {
              return null;
            }
            const insertResult = await tx.execute<{ id: string }>(sql`
              INSERT INTO ${seriesReminderLog} (coach_id, series_id)
              VALUES (${coachId}, ${seriesId})
              RETURNING id
            `);
            return insertResult.rows[0]?.id ?? null;
          });
        } catch (err) {
          console.error("[series-reminder] throttle reservation failed", err);
          return res.status(500).json({ error: "Failed to send reminder" });
        }
        if (!reservationId) {
          return res.status(429).json({
            error: "Too many reminders. Try again in a few minutes.",
          });
        }

        // Helper to roll back the reservation if the rest of the request
        // cannot complete. Keeps the legacy semantic that a reminder which
        // never made it out of the server should not consume a throttle slot.
        const releaseReservation = async () => {
          try {
            await db
              .delete(seriesReminderLog)
              .where(eq(seriesReminderLog.id, reservationId!));
          } catch (releaseErr) {
            console.error(
              "[series-reminder] failed to release throttle reservation",
              releaseErr,
            );
          }
        };

        try {
        // Lookup coach name for notification title
        const [coach] = await db
          .select({ name: coaches.name })
          .from(coaches)
          .where(eq(coaches.id, coachId))
          .limit(1);
        const coachName = coach?.name || "your coach";

        // Active players in the series
        const activeMembers = await db
          .select({ playerId: seriesPlayers.playerId })
          .from(seriesPlayers)
          .where(
            and(
              eq(seriesPlayers.seriesId, seriesId),
              eq(seriesPlayers.status, "active"),
            ),
          );

        const screen = lessonSessionId ? "TrainingDetail" : "SeriesDetail";
        const notifData = {
          type: "series_reminder",
          seriesId,
          ...(lessonSessionId ? { lessonSessionId } : {}),
          screen,
        };

        let sent = 0;
        let failed = 0;
        await Promise.all(
          activeMembers.map(async (m) => {
            try {
              const tokens = await getPlayerPushTokens(m.playerId);
              if (tokens.length === 0) {
                failed += 1;
                return;
              }
              await sendPushNotification(
                tokens,
                `Reminder from ${coachName}`,
                message,
                notifData,
              );
              sent += 1;
            } catch (err) {
              console.error(
                "[series-reminder] failed to push player",
                m.playerId,
                err,
              );
              failed += 1;
            }
          }),
        );

        // Append to existing series group conversation if one exists.
        try {
          const convConditions = [
            eq(conversations.title, seriesId),
            inArray(conversations.type, [
              "series_group",
              "squad",
              "lesson_group",
            ]),
          ];
          if (series.academyId) {
            convConditions.push(eq(conversations.academyId, series.academyId));
          }
          const [conv] = await db
            .select()
            .from(conversations)
            .where(and(...convConditions))
            .limit(1);
          if (conv) {
            await db.insert(messages).values({
              conversationId: conv.id,
              academyId: series.academyId || null,
              senderType: "coach",
              senderCoachId: coachId,
              body: message,
              // Tag so the player-side "Recent reminders" surface can
              // distinguish coach reminders from regular chat messages.
              messageType: "reminder",
            });
            await db
              .update(conversations)
              .set({
                lastMessageAt: new Date(),
                lastMessagePreview: message.substring(0, 100),
              })
              .where(eq(conversations.id, conv.id));
          }
        } catch (err) {
          console.error(
            "[series-reminder] failed to mirror to group chat",
            err,
          );
        }

        // The throttle slot was already reserved atomically above (fail-closed).
        // Opportunistic cleanup of rows older than 2x the window so the table
        // doesn't grow unbounded. Best-effort — does not affect the response.
        try {
          await db
            .delete(seriesReminderLog)
            .where(
              lte(
                seriesReminderLog.sentAt,
                new Date(Date.now() - SERIES_REMINDER_WINDOW_MS * 2),
              ),
            );
        } catch (err) {
          console.error(
            "[series-reminder] throttle log cleanup failed (non-fatal)",
            err,
          );
        }

        res.json({ sent, failed });
        } catch (innerErr) {
          // Roll back the throttle reservation so failed sends don't burn a slot.
          await releaseReservation();
          throw innerErr;
        }
      } catch (error) {
        console.error("Error sending series reminder:", error);
        res.status(500).json({ error: "Failed to send reminder" });
      }
    },
  );

export default router;
