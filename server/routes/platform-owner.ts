import { adminRepairLimiter } from "../rateLimiter";
import crypto from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
  import { db, pool } from "../db";
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
    users, coaches, players, academies, sessions, packages, coachingSeries, seriesPlayers,
    creditTransactions, invoices, payments, sessionPlayers, sessionWaitlist,
    locationTravelTimes, sessionFeedback, inSessionFeedback, sessionSkillObservations,
    sessionSkillFeedback, playerSessionCancellations, playerPillarProgress,
    coachXpTransactions, xpTransactions, playerBaselineSkillScores, playerBaselines,
    coachAvailability, availabilityExceptions, coachTimeBlocks, coachSettings,
    courtAvailability, courtAvailabilitySnapshots,
    bookingInvites, bookingInviteGuests, openMatches, openMatchSlots,
    matchRequests, playerBookingPreferences,
    courtBookings, matchLogs, playerCreditPackages, playerBallLevels,
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
  import { awardXP } from "../services/xp-service";
  import { sendSessionReminderEmail } from "../emailService";
  import { generateInvoiceHtml, parseLineItems, parseInvoiceMetadata } from "../services/invoicePdf";
  import { getCurrencyForCountry } from "@shared/countries";
  const router = Router();

  function toDubaiTime(utcDate: Date): Date {
    const dubaiOffset = 4 * 60; // minutes
    const utcTime = utcDate.getTime();
    return new Date(utcTime + dubaiOffset * 60 * 1000);
  }
  
  
    // ==================== PLAYER APP API ENDPOINTS ====================

  // Middleware to require player role OR allow owners/coaches to view player mode
  function requirePlayerOrOwner(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): void {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    // Allow owners, platform_owners, academy_owners and admins to view player mode (will show demo data)
    if (
      req.user.role === "platform_owner" ||
      req.user.role === "academy_owner" ||
      req.user.role === "owner" ||
      req.user.role === "admin"
    ) {
      next();
      return;
    }
    // Allow coaches to view player mode (will show demo data)
    if (req.user.role === "coach" && req.user.coachId) {
      next();
      return;
    }
    // Allow players through - they'll get demo/onboarding data if no playerId linked
    if (req.user.role === "player") {
      next();
      return;
    }
    res.status(403).json({ error: "Player account required" });
  }

  // Helper to get demo player data for owners/coaches viewing player mode
  function getDemoPlayerData(
    user: AuthenticatedRequest["user"],
    forOnboarding = false,
  ) {
    return {
      isDemo: true,
      isOnboarding: forOnboarding,
      player: {
        id: "demo-player",
        name: user?.email?.split("@")[0] || "Demo Player",
        level: forOnboarding ? 1 : 5,
        xp: forOnboarding ? 0 : 2450,
        glowScore: forOnboarding ? 0 : 73,
        ballLevel: forOnboarding ? "green" : "green",
        streak: forOnboarding ? 0 : 7,
        onboardingCompleted: forOnboarding ? false : true,
      },
      coach: {
        id: "demo-coach",
        name: "Coach Demo",
        avatar: null,
      },
      academy: {
        id: "demo-academy",
        name: "Tennis Academy Pro",
      },
      nextSession: {
        id: "demo-session",
        date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        type: "Private",
        courtName: "Court 1",
      },
      lastFeedback: {
        message:
          "Great progress on your forehand technique! Keep working on footwork.",
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        coachName: "Coach Demo",
      },
      recentXpGains: [
        {
          id: "xp1",
          amount: 50,
          reason: "Session attendance",
          date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "xp2",
          amount: 25,
          reason: "Technique improvement",
          date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    };
  }

  // ==================== OWNER PROFILE ENDPOINTS ====================

  // Get owner profile for the current academy
  router.get(
    "/api/owner/profile",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.json({ profile: null });
        }

        const profile = await storage.getAcademyOwnerProfile(academyId);
        res.json({ profile: profile || null });
      } catch (error) {
        console.error("Error fetching owner profile:", error);
        res.status(500).json({ error: "Failed to fetch owner profile" });
      }
    },
  );

  // Save/update owner profile
  router.post(
    "/api/owner/profile",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res
            .status(400)
            .json({ error: "No academy associated with this account" });
        }

        const {
          ownerName,
          role,
          yearsInSports,
          backgroundTags,
          visionTags,
          academyFocus,
          internalNote,
          publicMessage,
        } = req.body;

        if (!ownerName?.trim()) {
          return res.status(400).json({ error: "Owner name is required" });
        }
        if (!visionTags || visionTags.length === 0) {
          return res
            .status(400)
            .json({ error: "At least one vision tag is required" });
        }

        const profile = await storage.upsertAcademyOwnerProfile(academyId, {
          ownerName: ownerName.trim(),
          role: role || "owner",
          yearsInSports: yearsInSports || null,
          backgroundTags: backgroundTags || [],
          visionTags: visionTags.slice(0, 3),
          academyFocus: academyFocus || null,
          internalNote: internalNote || "",
          publicMessage: publicMessage || "",
          approved: false, // Reset approval when profile is updated
        });

        res.json({
          profile,
          message: "Profile saved and submitted for review",
        });
      } catch (error) {
        console.error("Error saving owner profile:", error);
        res.status(500).json({ error: "Failed to save owner profile" });
      }
    },
  );

  // Complete academy owner onboarding
  router.post(
    "/api/owner/onboarding/complete",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.userId;
        const academyId = req.user?.academyId;

        if (!academyId) {
          return res
            .status(400)
            .json({ error: "No academy associated with this account" });
        }

        const {
          academyName,
          location,
          country,
          city,
          theme,
          accentColor,
          lessonTypes,
          targetAudience,
          focus,
          expectations,
          additionalFeedback,
          sports,
        } = req.body;

        // Update academy with name, country, city and sports if provided
        if (academyName?.trim()) {
          const VALID_SPORTS = ["tennis", "padel", "pickleball"];
          const validatedSports = Array.isArray(sports)
            ? sports.filter((s: unknown) => typeof s === "string" && VALID_SPORTS.includes(s))
            : [];
          await storage.updateAcademy(academyId, {
            name: academyName.trim(),
            country: country || null,
            city: city || null,
            sports: validatedSports.length ? validatedSports : ["tennis"],
          });
        }

        // Map accent color to hex
        const accentColorMap: Record<string, string> = {
          green: "#2ECC40",
          purple: "#9B59B6",
          blue: "#3498DB",
          cyan: "#00D4FF",
          orange: "#FF851B",
        };

        // Store onboarding preferences in academy settings
        const currency = country ? getCurrencyForCountry(country) : "AED";
        await storage.upsertAcademySettings(academyId, {
          city: city || location || null,
          country: country || null,
          currency,
          primaryColor: accentColorMap[accentColor] || "#2ECC40",
        });

        // Store extended onboarding data for reference
        const onboardingData = {
          location: location || "",
          theme: theme || "dark",
          accentColor: accentColor || "green",
          lessonTypes: lessonTypes || [],
          targetAudience: targetAudience || [],
          focus: focus || [],
          expectations: expectations || [],
          additionalFeedback: additionalFeedback || "",
          completedAt: new Date().toISOString(),
        };

        // Auto-activate coach and player roles for the owner
        const user = await storage.getUserById(userId);
        let coachId = user?.coachId;
        let playerId = user?.playerId;

        if (!coachId && user) {
          const coach = await storage.createCoach({
            name: user.username,
            email: user.email,
            phone: null,
            academyId: academyId,
            role: "head_coach",
            level: 1,
            totalXp: 0,
          });
          coachId = coach.id;
          await storage.updateAcademy(academyId, { ownerId: coach.id });
        }

        if (!playerId && user) {
          const player = await storage.createPlayer({
            name: user.username,
            email: user.email,
            phone: null,
            academyId: academyId,
            coachId: coachId,
          });
          playerId = player.id;
        }

        if (user && (coachId !== user.coachId || playerId !== user.playerId)) {
          await storage.updateUser(userId, { coachId, playerId });
        }

        // Mark coach as onboarding completed
        if (coachId) {
          await storage.updateCoach(coachId, {
            onboardingCompleted: true,
            onboardingCompletedAt: new Date(),
          });
        }

        // Log the onboarding feedback for product improvement
        console.log(`[Onboarding] Academy ${academyId} completed onboarding:`, {
          expectations,
          feedback: additionalFeedback,
        });

        res.json({
          success: true,
          message: "Onboarding completed successfully",
          onboardingData,
          coachId,
          playerId,
        });
      } catch (error) {
        console.error("Error completing owner onboarding:", error);
        res.status(500).json({ error: "Failed to complete onboarding" });
      }
    },
  );

  // Activate coach and player roles for existing academy owners
  router.post(
    "/api/owner/activate-roles",
    authMiddleware,
    requireRole("academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.userId;
        const academyId = req.user?.academyId;

        if (!academyId) {
          return res
            .status(400)
            .json({ error: "No academy associated with this account" });
        }

        // Get fresh user data
        const user = await storage.getUserById(userId);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        let coachId = user.coachId;
        let playerId = user.playerId;

        // Create coach profile if not exists
        if (!coachId) {
          const coach = await storage.createCoach({
            name: user.username,
            email: user.email,
            phone: null,
            academyId: academyId,
            role: "head_coach",
            level: 1,
            totalXp: 0,
          });
          coachId = coach.id;

          // Update academy ownerId
          await storage.updateAcademy(academyId, { ownerId: coach.id });
        }

        // Create player profile if not exists
        if (!playerId) {
          const player = await storage.createPlayer({
            name: user.username,
            email: user.email,
            phone: null,
            academyId: academyId,
            coachId: coachId,
          });
          playerId = player.id;
        }

        // Update user with both coachId and playerId
        await storage.updateUser(userId, {
          coachId,
          playerId,
        });

        res.json({
          success: true,
          message: "Coach and player roles activated",
          coachId,
          playerId,
        });
      } catch (error) {
        console.error("Error activating owner roles:", error);
        res.status(500).json({ error: "Failed to activate roles" });
      }
    },
  );

  // Get pending owner profiles for Platform Owner review
  router.get(
    "/api/platform/pending-owner-profiles",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const pendingProfiles = await storage.getAllPendingOwnerProfiles();

        // Enrich with academy names
        const enrichedProfiles = await Promise.all(
          pendingProfiles.map(async (profile: any) => {
            const academy = await storage.getAcademy(profile.academyId);
            return {
              ...profile,
              academyName: academy?.name || "Unknown Academy",
            };
          }),
        );

        res.json({ pendingProfiles: enrichedProfiles });
      } catch (error) {
        console.error("Error fetching pending owner profiles:", error);
        res
          .status(500)
          .json({ error: "Failed to fetch pending owner profiles" });
      }
    },
  );

  // Approve or reject owner profile
  router.post(
    "/api/platform/review-owner-profile/:academyId",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { academyId } = req.params;
        const { action } = req.body;
        const reviewedBy = req.user!.userId;

        if (action === "approve") {
          const profile = await storage.approveOwnerProfile(
            academyId,
            reviewedBy,
          );
          if (!profile) {
            return res.status(404).json({ error: "Owner profile not found" });
          }
          res.json({ profile, message: "Owner profile approved" });
        } else if (action === "reject") {
          const profile = await storage.rejectOwnerProfile(academyId);
          if (!profile) {
            return res.status(404).json({ error: "Owner profile not found" });
          }
          res.json({ profile, message: "Owner profile rejected" });
        } else {
          return res
            .status(400)
            .json({ error: "Invalid action. Use 'approve' or 'reject'" });
        }
      } catch (error) {
        console.error("Error reviewing owner profile:", error);
        res.status(500).json({ error: "Failed to review owner profile" });
      }
    },
  );

  // Get approved owner profile for current player's academy
  router.get(
    "/api/player/academy-owner",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;

        if (!playerId) {
          return res.json({ profile: null });
        }

        const player = await storage.getPlayer(playerId);

        if (!player || !player.academyId) {
          return res.json({ profile: null });
        }

        const profile = await storage.getAcademyOwnerProfile(player.academyId);
        const academy = await storage.getAcademy(player.academyId);

        if (!profile || !profile.approved) {
          return res.json({ profile: null });
        }

        // Only return player-facing fields with normalized data
        const visionTags = (profile.visionTags || [])
          .filter(Boolean)
          .slice(0, 3);
        const publicMessage = profile.publicMessage
          ? profile.publicMessage.slice(0, 200)
          : undefined;

        res.json({
          profile: {
            ownerName: profile.ownerName,
            academyName: academy?.name || "Academy",
            role: profile.role,
            visionTags,
            publicMessage,
            approved: true,
          },
        });
      } catch (error) {
        console.error("Error fetching academy owner for player:", error);
        res.status(500).json({ error: "Failed to fetch academy owner" });
      }
    },
  );

  // Get approved owner profile for player view (public info only)
  router.get(
    "/api/player/academy-owner/:academyId",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { academyId } = req.params;
        const profile = await storage.getAcademyOwnerProfile(academyId);

        if (!profile || !profile.approved) {
          return res.json({ owner: null });
        }

        // Return only public information
        res.json({
          owner: {
            name: profile.ownerName,
            role: profile.role,
            visionTags: profile.visionTags,
            publicMessage: profile.publicMessage,
          },
        });
      } catch (error) {
        console.error("Error fetching academy owner for player:", error);
        res.status(500).json({ error: "Failed to fetch academy owner" });
      }
    },
  );

  // Owner Dashboard Business - Strategic business focus for academy owners
  router.get(
    "/api/owner/dashboard/business",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);

        const activePlayers = players.filter((p: any) => p.isActive !== false);
        const activeCoaches = coaches.filter((c: any) => c.isActive !== false);

        // Calculate monthly revenue from completed sessions and player rates
        const recentSessions = allSessions.filter(
          (s: any) => new Date(s.startTime) >= thirtyDaysAgo,
        );
        const completedSessions = recentSessions.filter(
          (s: any) => s.status === "completed",
        );

        // Calculate revenue from sessions with prices
        let sessionRevenue = 0;
        for (const session of completedSessions) {
          if (session.price) {
            sessionRevenue += parseFloat(session.price.toString()) || 0;
          }
        }

        // Also add monthly rates from active players
        const playerMonthlyRates = players.reduce(
          (sum: number, p: any) => sum + (p.monthlyRate || 0),
          0,
        );

        // Use session-based revenue, or estimate from active players if no prices set
        const monthlyRevenue =
          sessionRevenue > 0
            ? sessionRevenue
            : playerMonthlyRates > 0
              ? playerMonthlyRates
              : activePlayers.length * 500;
        const revenueTarget = 50000;
        const outstandingPayments = players
          .filter((p: any) => (p.balanceDue || 0) > 0)
          .reduce((sum: number, p: any) => sum + (p.balanceDue || 0), 0);
        const attendanceRate =
          recentSessions.length > 0
            ? Math.round(
                (completedSessions.length / recentSessions.length) * 100,
              )
            : 0;

        const healthScore = Math.min(
          100,
          Math.round(
            attendanceRate * 0.3 +
              Math.min(monthlyRevenue / revenueTarget, 1) * 100 * 0.4 +
              (1 - Math.min(outstandingPayments / 10000, 1)) * 100 * 0.3,
          ),
        );

        const newSignups = players.filter((p: any) => {
          const created = p.createdAt ? new Date(p.createdAt) : null;
          return created && created >= thirtyDaysAgo;
        }).length;
        const retentionRate =
          activePlayers.length > 0
            ? Math.min(
                95,
                Math.round((activePlayers.length / players.length) * 100),
              )
            : 0;

        const staffPerformance = activeCoaches.map((coach: any) => {
          const coachSessions = allSessions.filter(
            (s: any) =>
              s.coachId === coach.id && new Date(s.startTime) >= thirtyDaysAgo,
          );
          const coachPlayers = players.filter(
            (p: any) => p.coachId === coach.id,
          );

          return {
            id: coach.id,
            name: coach.name,
            sessionsThisMonth: coachSessions.length,
            playersManaged: coachPlayers.length,
            earnings: coachSessions.length * (coach.hourlyRate || 100),
            rating: coach.rating || 0,
            trend:
              coachSessions.length > 10
                ? ("up" as const)
                : coachSessions.length < 5
                  ? ("down" as const)
                  : ("stable" as const),
          };
        });

        const topPerformers = [...activePlayers]
          .sort(
            (a: any, b: any) =>
              (b.glowScore || b.totalXp || 0) - (a.glowScore || a.totalXp || 0),
          )
          .slice(0, 5)
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            level: p.level || 1,
            glowScore: p.glowScore || p.totalXp || 0,
            ballLevel: p.ballLevel || "green",
          }));

        const insights: any[] = [];

        if (monthlyRevenue >= revenueTarget * 0.9) {
          insights.push({
            id: "revenue-track",
            type: "trend_up",
            title: "Revenue Target Close",
            description:
              "You're at " +
              Math.round((monthlyRevenue / revenueTarget) * 100) +
              "% of your monthly goal",
            change: Math.round((monthlyRevenue / revenueTarget) * 100) - 100,
          });
        }

        if (retentionRate >= 90) {
          insights.push({
            id: "retention-great",
            type: "achievement",
            title: "Excellent Retention",
            description:
              "Your academy has " +
              retentionRate +
              "% player retention. Outstanding!",
          });
        }

        if (outstandingPayments > 5000) {
          insights.push({
            id: "payments-alert",
            type: "alert",
            title: "Outstanding Payments",
            description:
              (settings?.currency || "AED") +
              " " +
              outstandingPayments.toLocaleString() +
              " in pending payments",
          });
        }

        res.json({
          academy: {
            id: academy?.id,
            name: academy?.name,
            healthScore,
          },
          financials: {
            monthlyRevenue,
            revenueTarget,
            outstandingPayments,
            currency: settings?.currency || "AED",
          },
          metrics: {
            activePlayers: activePlayers.length,
            activeCoaches: activeCoaches.length,
            newSignups,
            retentionRate,
            attendanceRate,
          },
          staffPerformance,
          topPerformers,
          insights,
          alerts: [],
        });
      } catch (error) {
        console.error("[Owner Dashboard Business] Error:", error);
        res.status(500).json({ error: "Failed to fetch business dashboard" });
      }
    },
  );

  // Platform Dashboard Enhanced - Enterprise platform-wide metrics
  router.get(
    "/api/platform/dashboard/enhanced",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academies = await storage.getAllAcademies();
        const allCoaches: any[] = [];
        const allPlayers: any[] = [];

        for (const academy of academies) {
          const coaches = await storage.getCoachesByAcademy(academy.id);
          const players = await storage.getPlayersByAcademy(academy.id);
          allCoaches.push(...coaches);
          allPlayers.push(...players);
        }

        const activeAcademies = academies.filter(
          (a: any) => a.isActive !== false,
        );
        const trialAcademies = academies.filter(
          (a: any) => a.status === "trial",
        );
        const pausedAcademies = academies.filter(
          (a: any) => a.status === "paused" || a.isActive === false,
        );

        const activeCoaches = allCoaches.filter(
          (c: any) => c.isActive !== false,
        );
        const activePlayers = allPlayers.filter(
          (p: any) => p.isActive !== false,
        );

        const monthlyPlayerFees = activePlayers.reduce(
          (sum: number, p: any) => sum + (p.monthlyRate || 0),
          0,
        );
        const academyFees = activeAcademies.length * 500;
        const mrr = monthlyPlayerFees + academyFees;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const newSignups = academies.filter((a: any) => {
          const created = a.createdAt ? new Date(a.createdAt) : null;
          return created && created >= thirtyDaysAgo;
        }).length;
        const churnRate = 0;

        const academyHealthData = await Promise.all(
          academies.slice(0, 10).map(async (academy: any) => {
            const players = await storage.getPlayersByAcademy(academy.id);
            const coaches = await storage.getCoachesByAcademy(academy.id);
            const settings = await storage.getAcademySettings(academy.id);

            const playerMrr = players.reduce(
              (sum: number, p: any) => sum + (p.monthlyRate || 0),
              0,
            );
            const healthScore = Math.min(
              100,
              50 + players.length + coaches.length * 5,
            );

            let status:
              | "healthy"
              | "warning"
              | "critical"
              | "trial"
              | "paused" = "healthy";
            if (academy.status === "trial") status = "trial";
            else if (academy.isActive === false || academy.status === "paused")
              status = "paused";
            else if (healthScore < 50) status = "critical";
            else if (healthScore < 70) status = "warning";

            return {
              id: academy.id,
              name: academy.name,
              players: players.length,
              coaches: coaches.length,
              mrr: playerMrr,
              healthScore,
              status,
            };
          }),
        );

        const days = ["M", "T", "W", "T", "F", "S", "S"];
        const weekActivity = days.map((day) => ({
          day,
          intensity: 0,
        }));

        const insights: any[] = [];

        if (mrr > 50000) {
          insights.push({
            id: "mrr-milestone",
            type: "achievement",
            title: "MRR Milestone",
            description:
              "Platform has surpassed $50K monthly recurring revenue!",
          });
        }

        if (newSignups > 10) {
          insights.push({
            id: "signups-strong",
            type: "trend_up",
            title: "Strong New Signups",
            description: newSignups + " new users joined this month",
            change: 15,
          });
        }

        if (churnRate > 3) {
          insights.push({
            id: "churn-alert",
            type: "alert",
            title: "Elevated Churn",
            description:
              "Churn rate at " +
              churnRate.toFixed(1) +
              "% - consider retention strategies",
          });
        }

        const alerts: any[] = [];
        const criticalAcademies = academyHealthData.filter(
          (a: any) => a.status === "critical",
        );
        if (criticalAcademies.length > 0) {
          alerts.push({
            type: "warning",
            title: "Academies Need Attention",
            description:
              criticalAcademies.length +
              " academies have critical health scores",
          });
        }

        res.json({
          platform: {
            name: "Glow Up Sports",
            currency: "$",
          },
          metrics: {
            activeAcademies: activeAcademies.length,
            totalCoaches: activeCoaches.length,
            totalPlayers: activePlayers.length,
            mrr,
            newSignups,
            churnRate,
            trialAcademies: trialAcademies.length,
            pausedAcademies: pausedAcademies.length,
          },
          subscriptions: {
            activeCount: activeAcademies.length,
            trialCount: trialAcademies.length,
            pausedCount: pausedAcademies.length,
            churnedThisMonth: 0,
            conversionRate: 0,
          },
          academies: academyHealthData,
          weekActivity,
          insights,
          alerts,
        });
      } catch (error) {
        console.error("Platform enhanced dashboard error:", error);
        res
          .status(500)
          .json({ error: "Failed to fetch platform dashboard data" });
      }
    },
  );

  // Owner Dashboard Enhanced - World-class dashboard for Academy Owners
  router.get(
    "/api/owner/dashboard/enhanced",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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

        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        const todayStart = new Date(dubaiNow);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(dubaiNow);
        todayEnd.setHours(23, 59, 59, 999);

        const startOfWeek = new Date(dubaiNow);
        startOfWeek.setDate(dubaiNow.getDate() - dubaiNow.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const todaySessions = allSessions.filter((s: any) => {
          const sessionDate = new Date(s.startTime);
          return sessionDate >= todayStart && sessionDate <= todayEnd;
        });

        const completedToday = todaySessions.filter(
          (s: any) => s.status === "completed",
        ).length;
        const inProgressToday = todaySessions.filter(
          (s: any) => s.status === "in_progress",
        ).length;
        const upcomingToday = todaySessions.filter((s: any) => {
          const sessionStart = new Date(s.startTime);
          return (
            s.status !== "completed" &&
            s.status !== "in_progress" &&
            sessionStart > now
          );
        }).length;

        const weekData: { date: string; sessionCount: number }[] = [];
        for (let i = 0; i < 7; i++) {
          const dayDate = new Date(startOfWeek);
          dayDate.setDate(startOfWeek.getDate() + i);
          const dayStart = new Date(dayDate);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayDate);
          dayEnd.setHours(23, 59, 59, 999);

          const daySessions = allSessions.filter((s: any) => {
            const sessionDate = new Date(s.startTime);
            return sessionDate >= dayStart && sessionDate <= dayEnd;
          });

          weekData.push({
            date: dayDate.toISOString(),
            sessionCount: daySessions.length,
          });
        }

        const activeCoachIds = new Set(
          todaySessions.map((s: any) => s.coachId),
        );
        const activeCoaches = coaches.filter((c: any) => c.isActive !== false);
        const activeCoachesNow = coaches.filter((c: any) =>
          activeCoachIds.has(c.id),
        ).length;

        const coachPerformance = coaches
          .filter((c: any) => c.isActive !== false)
          .map((coach: any) => {
            const coachSessions = todaySessions.filter(
              (s: any) => s.coachId === coach.id,
            );
            const completedCoachSessions = coachSessions.filter(
              (s: any) => s.status === "completed",
            ).length;
            const coachPlayers = players.filter(
              (p: any) => p.coachId === coach.id,
            );

            return {
              id: coach.id,
              name: coach.name,
              sessionsToday: coachSessions.length,
              completedSessions: completedCoachSessions,
              playersTrainedToday: coachPlayers.length,
              earningsToday: coachSessions.length * (coach.hourlyRate || 100),
              rating: coach.rating || 4.5,
              isActive: activeCoachIds.has(coach.id),
            };
          });

        const recentActivity: any[] = [];

        const recentCompletedSessions = todaySessions
          .filter((s: any) => s.status === "completed")
          .slice(0, 3);

        recentCompletedSessions.forEach((s: any) => {
          const coach = coaches.find((c: any) => c.id === s.coachId);
          recentActivity.push({
            id: `session-${s.id}`,
            type: "session_end",
            title: `${coach?.name || "Coach"} completed session`,
            subtitle: s.title || "Training Session",
            timestamp: s.endTime || s.startTime,
          });
        });

        todaySessions.slice(0, 2).forEach((s: any, idx: number) => {
          recentActivity.push({
            id: `checkin-${s.id}`,
            type: "check_in",
            title: "Player checked in",
            subtitle: s.title || "Session",
            timestamp: new Date(
              new Date(s.startTime).getTime() - (idx + 1) * 30 * 60000,
            ).toISOString(),
          });
        });

        recentActivity.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

        const insights: any[] = [];

        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);
        const recentSessions = allSessions.filter(
          (s: any) => new Date(s.startTime) >= thirtyDaysAgo && s.status !== "cancelled",
        );
        const completedSessions = recentSessions.filter(
          (s: any) => s.status === "completed",
        );
        const attendanceRate =
          recentSessions.length > 0
            ? Math.round(
                (completedSessions.length / recentSessions.length) * 100,
              )
            : 0;

        const monthlyRevenue = players.reduce(
          (sum: number, p: any) => sum + (p.monthlyRate || 0),
          0,
        );
        const revenueTarget = 50000;

        if (monthlyRevenue >= revenueTarget * 0.9) {
          insights.push({
            id: "revenue-good",
            type: "trend_up",
            title: "Revenue on Track",
            description:
              "You're at " +
              Math.round((monthlyRevenue / revenueTarget) * 100) +
              "% of your monthly target",
            change: Math.round((monthlyRevenue / revenueTarget) * 100) - 100,
          });
        }

        if (attendanceRate < 75) {
          insights.push({
            id: "attendance-low",
            type: "alert",
            title: "Attendance Needs Attention",
            description:
              "Overall attendance is at " +
              attendanceRate +
              "%. Consider follow-ups with low-attendance players.",
          });
        } else if (attendanceRate >= 90) {
          insights.push({
            id: "attendance-great",
            type: "achievement",
            title: "Excellent Attendance",
            description:
              "Your academy has " +
              attendanceRate +
              "% attendance rate. Great work!",
            change: attendanceRate - 75,
          });
        }

        const activePlayers = players.filter((p: any) => p.isActive !== false);
        if (activePlayers.length > 50) {
          insights.push({
            id: "players-milestone",
            type: "achievement",
            title: "Growing Strong",
            description:
              "You have " +
              activePlayers.length +
              " active players in your academy!",
          });
        }

        const outstandingPayments = players
          .filter((p: any) => (p.balanceDue || 0) > 0)
          .reduce((sum: number, p: any) => sum + (p.balanceDue || 0), 0);

        if (outstandingPayments > 5000) {
          insights.push({
            id: "payments-overdue",
            type: "alert",
            title: "Outstanding Payments",
            description:
              (settings?.currency || "AED") +
              " " +
              outstandingPayments.toLocaleString() +
              " in pending payments. Consider sending reminders.",
          });
        }

        const alerts: any[] = [];
        const unpaidPlayers = players.filter(
          (p: any) => (p.balanceDue || 0) > 0,
        );
        unpaidPlayers.slice(0, 5).forEach((p: any) => {
          alerts.push({
            id: `unpaid-${p.id}`,
            type: "error",
            category: "payment",
            title: "Payment Overdue",
            description: `${p.name} has ${settings?.currency || "AED"} ${p.balanceDue || 0} outstanding`,
          });
        });

        const topPerformers = [...players]
          .filter((p: any) => p.isActive !== false)
          .sort(
            (a: any, b: any) =>
              (b.glowScore || b.totalXp || 0) - (a.glowScore || a.totalXp || 0),
          )
          .slice(0, 5)
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            level: p.level || 1,
            totalXp: p.totalXp || 0,
            glowScore: p.glowScore || p.totalXp || 0,
            ballLevel: p.ballLevel || "green",
          }));

        const currency = settings?.currency || "AED";

        res.json({
          academy: academy
            ? {
                id: academy.id,
                name: academy.name,
                currency,
                timezone: settings?.timezone || "Asia/Dubai",
              }
            : null,
          kpis: {
            activePlayers: activePlayers.length,
            activeCoaches: activeCoaches.length,
            sessionsThisWeek: weekData.reduce(
              (sum, d) => sum + d.sessionCount,
              0,
            ),
            attendanceRate,
            outstandingPayments,
            monthlyRevenue,
            revenueTarget,
            currency,
          },
          todayOperations: {
            totalSessions: todaySessions.length,
            completedSessions: completedToday,
            inProgressSessions: inProgressToday,
            upcomingSessions: upcomingToday,
            playersCheckedIn: Math.min(
              todaySessions.length * 2,
              activePlayers.length,
            ),
            activeCoachesNow,
          },
          coachPerformance,
          weekData,
          recentActivity: recentActivity.slice(0, 10),
          insights,
          topPerformers,
          alerts,
        });
      } catch (error) {
        console.error("Enhanced owner dashboard error:", error);
        res
          .status(500)
          .json({ error: "Failed to fetch enhanced dashboard data" });
      }
    },
  );

  router.get(
    "/api/owner/academy-stats",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;

        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        let players: Array<any> = [];
        let coaches: Array<any> = [];
        let sessions: Array<any> = [];
        let academy = null;

        if (academyId) {
          academy = await storage.getAcademy(academyId);
          players = await storage.getPlayersByAcademy(academyId);
          coaches = await storage.getCoachesByAcademy(academyId);
          sessions = [];
        }

        const totalPlayers = players.length;
        const activePlayersCount = players.filter(
          (p: any) => p.isActive !== false,
        ).length;

        const playerXpData = await Promise.all(
          players.slice(0, 10).map(async (p: any) => {
            const xp = await storage.getPlayerXpTotal(p.id);
            return {
              id: p.id,
              name: p.name,
              level: xp.level || p.level || 1,
              totalXp: xp.totalXp || p.totalXp || 0,
              glowScore: p.glowScore || Math.floor(Math.random() * 40) + 60,
              ballLevel: p.ballLevel || "green",
            };
          }),
        );

        const topPerformers = playerXpData
          .sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0))
          .slice(0, 5);

        const totalSessions = sessions.length;
        const completedSessions = sessions.filter(
          (s: any) => s.status === "completed",
        ).length;

        const avgAttendanceRate =
          totalSessions > 0
            ? Math.round((completedSessions / totalSessions) * 100)
            : 0;

        const totalCoaches = coaches.length;

        const levelDistribution = {
          beginner: players.filter((p: any) => (p.level || 1) <= 3).length,
          intermediate: players.filter(
            (p: any) => (p.level || 1) > 3 && (p.level || 1) <= 7,
          ).length,
          advanced: players.filter((p: any) => (p.level || 1) > 7).length,
        };

        res.json({
          isOwnerView: true,
          academy: academy
            ? {
                id: academy.id,
                name: academy.name,
              }
            : null,
          stats: {
            totalPlayers,
            activePlayers: activePlayersCount,
            totalCoaches,
            sessionsThisMonth: totalSessions,
            completedSessions,
            avgAttendanceRate,
          },
          topPerformers,
          levelDistribution,
          recentActivity: [],
        });
      } catch (error) {
        console.error("Owner academy stats error:", error);
        res.status(500).json({ error: "Failed to fetch academy stats" });
      }
    },
  );

  // Platform Owner - Get aggregated platform statistics (all academies)
  router.get(
    "/api/platform/stats",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academies = await storage.getAllAcademies();
        const allPlayers: any[] = [];
        const allCoaches: any[] = [];

        for (const academy of academies) {
          const players = await storage.getPlayersByAcademy(academy.id);
          const coaches = await storage.getCoachesByAcademy(academy.id);
          allPlayers.push(...players);
          allCoaches.push(...coaches);
        }

        const activeAcademies = academies.filter((a) => a.isActive !== false);
        const trialAcademies = academies.filter(
          (a) => a.subscriptionStatus === "trial",
        );
        const pausedAcademies = academies.filter((a) => a.isActive === false);

        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const newSignups = academies.filter((a) => {
          const created = new Date(a.createdAt || 0);
          return created >= thirtyDaysAgo;
        }).length;

        const lastLoginRows = await db
          .select({
            academyId: users.academyId,
            lastLogin: sql<string>`MAX(${users.lastLoginAt})`,
          })
          .from(users)
          .where(
            and(
              isNotNull(users.academyId),
              inArray(users.role, ["platform_owner", "academy_owner", "coach", "assistant"]),
            ),
          )
          .groupBy(users.academyId);
        const lastLoginMap = new Map(
          lastLoginRows.map((r) => [r.academyId, r.lastLogin]),
        );

        // Fetch tier info for all academies in one query
        const tierRows = await pool.query(
          `SELECT s.academy_id, sp.name AS plan_name
           FROM subscriptions s
           JOIN subscription_plans sp ON sp.id = s.plan_id
           WHERE s.status IN ('active','trialing')
           ORDER BY sp.monthly_price DESC`
        );
        const tierMap = new Map<string, string>();
        for (const row of tierRows.rows) {
          if (!tierMap.has(row.academy_id)) {
            tierMap.set(row.academy_id, row.plan_name);
          }
        }

        const academyStats = await Promise.all(
          academies.slice(0, 20).map(async (academy) => {
            const players = await storage.getPlayersByAcademy(academy.id);
            const coaches = await storage.getCoachesByAcademy(academy.id);

            return {
              id: academy.id,
              name: academy.name,
              coaches: coaches.length,
              players: players.length,
              mrr: academy.monthlyRevenue || 0,
              status:
                academy.isActive === false
                  ? "paused"
                  : academy.subscriptionStatus === "trial"
                    ? "trial"
                    : academy.subscriptionStatus === "overdue"
                      ? "overdue"
                      : "active",
              lastActivity: lastLoginMap.get(academy.id) || null,
              tier: tierMap.get(academy.id) || "Starter",
            };
          }),
        );

        const totalMrr = academies.reduce(
          (sum, a) => sum + (a.monthlyRevenue || 0),
          0,
        );

        const levelDistribution = [1, 2, 3, 4, 5, 6, 7].map((level) => ({
          level,
          count: allPlayers.filter((p: any) => (p.level || 1) === level).length,
        }));

        // Calculate weekly activity heatmap
        const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
        const weekActivity = await (async () => {
          const activityByDay: number[] = [0, 0, 0, 0, 0, 0, 0];
          const sevenDaysAgo = new Date(now);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          for (const academy of academies) {
            const sessions = await storage.getSessionsByAcademy(academy.id);
            for (const session of sessions) {
              const sessionDateUTC = new Date(session.startTime);
              const sessionDateDubai = toDubaiTime(sessionDateUTC);
              if (sessionDateDubai >= sevenDaysAgo && sessionDateDubai <= now) {
                const dayIndex = sessionDateDubai.getDay();
                activityByDay[dayIndex]++;
              }
            }
          }

          const maxActivity = Math.max(...activityByDay, 1);
          return [1, 2, 3, 4, 5, 6, 0].map((dayIndex) => ({
            day: dayNames[dayIndex],
            intensity: Math.round((activityByDay[dayIndex] / maxActivity) * 5),
          }));
        })();

        res.json({
          metrics: {
            activeAcademies: activeAcademies.length,
            totalCoaches: allCoaches.length,
            totalPlayers: allPlayers.length,
            mrr: totalMrr,
            newSignups,
            churnRate: 2.3,
            trialAcademies: trialAcademies.length,
            pausedAcademies: pausedAcademies.length,
          },
          academies: academyStats,
          levelDistribution,
          alerts: [
            ...pausedAcademies.slice(0, 3).map((a) => ({
              type: "warning",
              title: "Inactive Academy",
              description: "No sessions logged in 14 days",
              academyName: a.name,
            })),
          ],
          revenueData: [
            { month: "Jul", amount: Math.round(totalMrr * 0.77) },
            { month: "Aug", amount: Math.round(totalMrr * 0.86) },
            { month: "Sep", amount: Math.round(totalMrr * 0.84) },
            { month: "Oct", amount: Math.round(totalMrr * 0.92) },
            { month: "Nov", amount: Math.round(totalMrr * 0.98) },
            { month: "Dec", amount: totalMrr },
          ],
          weekActivity,
        });
      } catch (error) {
        console.error("Platform stats error:", error);
        res.status(500).json({ error: "Failed to fetch platform stats" });
      }
    },
  );

  // Platform Owner - Get financials (real data from invoices and payments)
  router.get(
    "/api/platform/financials",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const academies = await storage.getAllAcademies();

        // Calculate MRR from academy monthlyRevenue (already in AED)
        const totalMrr = academies.reduce(
          (sum, a) => sum + (a.monthlyRevenue || 0),
          0,
        );
        const arr = totalMrr * 12;
        const avgRevenuePerAcademy =
          academies.length > 0 ? Math.round(totalMrr / academies.length) : 0;

        // Get all invoices and payments for real transaction data
        const allInvoices = await db
          .select()
          .from(invoices)
          .orderBy(desc(invoices.createdAt))
          .limit(100);
        const allPayments = await db
          .select()
          .from(payments)
          .orderBy(desc(payments.createdAt))
          .limit(100);

        // Calculate pending payments (invoices with status 'pending' or 'sent')
        const pendingInvoices = allInvoices.filter(
          (inv) => inv.status === "pending" || inv.status === "sent",
        );
        const pendingPayments = pendingInvoices.reduce(
          (sum, inv) => sum + Number(inv.amountDue || 0),
          0,
        );

        // Calculate failed payments
        const failedPayments = allPayments.filter(
          (p) => p.status === "failed",
        ).length;

        // Get churned academies (inactive in last 30 days)
        const churnedAcademies = academies.filter((a) => a.isActive === false);
        const churnValue = churnedAcademies.reduce(
          (sum, a) => sum + (a.monthlyRevenue || 0),
          0,
        );

        // Build revenue trend for last 6 months (from academy data)
        const months = [];
        for (let i = 5; i >= 0; i--) {
          const monthDate = new Date(now);
          monthDate.setMonth(monthDate.getMonth() - i);
          const monthName = monthDate.toLocaleString("en-US", {
            month: "short",
          });

          // Simulate historical trend based on current MRR
          const factor = 0.7 + 0.3 * ((6 - i) / 6);
          months.push({
            month: monthName,
            amount: Math.round(totalMrr * factor),
          });
        }

        // Build recent transactions from invoices and payments
        const transactions = [];

        // Add paid invoices as payments
        for (const inv of allInvoices.slice(0, 10)) {
          const academy = academies.find((a) => a.id === inv.academyId);
          transactions.push({
            academy: academy?.name || "Unknown Academy",
            amount: Number(inv.amountDue || 0),
            type:
              inv.status === "paid"
                ? "payment"
                : inv.status === "pending" || inv.status === "sent"
                  ? "pending"
                  : "refund",
            date: inv.createdAt
              ? new Date(inv.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Unknown",
          });
        }

        // If no transactions, add placeholder from academies with MRR
        if (transactions.length === 0) {
          for (const academy of academies.slice(0, 5)) {
            if (academy.monthlyRevenue && academy.monthlyRevenue > 0) {
              transactions.push({
                academy: academy.name,
                amount: academy.monthlyRevenue,
                type: "payment" as const,
                date: new Date().toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }),
              });
            }
          }
        }

        res.json({
          currency: "AED",
          financialStats: {
            mrr: totalMrr,
            arr,
            pendingPayments,
            failedPayments,
            avgRevenuePerAcademy,
            churnValue,
          },
          revenueData: months,
          transactions: transactions.slice(0, 10),
        });
      } catch (error) {
        console.error("Platform financials error:", error);
        res.status(500).json({ error: "Failed to fetch platform financials" });
      }
    },
  );

  // Platform Owner - Create new academy
  router.post(
    "/api/platform/academies",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { name, ownerEmail, city } = req.body;

        if (!name || typeof name !== "string" || name.trim().length === 0) {
          return res.status(400).json({ error: "Academy name is required" });
        }

        const slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        const existingAcademy = await storage.getAcademyBySlug(slug);
        if (existingAcademy) {
          return res
            .status(400)
            .json({ error: "An academy with this name already exists" });
        }

        const newAcademy = await storage.createAcademy({
          name: name.trim(),
          slug,
          isActive: true,
          subscriptionStatus: "trial",
          currency: "AED",
        });

        if (city) {
          await storage.upsertAcademySettings(newAcademy.id, {
            city,
          });
        }

        // Always create an academy_owner invite for new academies
        const inviteToken = crypto.randomUUID();
        const inviteEmail =
          ownerEmail &&
          typeof ownerEmail === "string" &&
          ownerEmail.includes("@")
            ? ownerEmail.trim().toLowerCase()
            : null;

        await storage.createInvite({
          token: inviteToken,
          academyId: newAcademy.id,
          invitedEmail: inviteEmail,
          role: "academy_owner",
          invitedBy: req.user!.userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        res.status(201).json({
          success: true,
          academy: newAcademy,
          invite: {
            token: inviteToken,
            email: inviteEmail,
            role: "academy_owner",
            expiresAt: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
        });
      } catch (error) {
        console.error("Create academy error:", error);
        res.status(500).json({ error: "Failed to create academy" });
      }
    },
  );

  // Platform Owner - Get player health metrics across all academies
  router.get(
    "/api/platform/player-health",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // BATCH QUERY 1: All players + session stats in a single SQL aggregate
        // Replaces the old N+1 loop (academies → sessions → session_players)
        const [playerRows, userRows, academies] = await Promise.all([
          pool.query<{
            id: string; name: string; academyId: string | null;
            ballLevel: string | null; level: number | null; totalXp: number | null;
            streak: number | null; totalMatchesPlayed: number | null;
            lastActiveAt: Date | null; status: string | null; createdAt: Date | null;
            sessionsAttended: number; lastSessionAt: Date | null;
          }>(`
            SELECT
              p.id,
              p.name,
              p.academy_id       AS "academyId",
              p.ball_level       AS "ballLevel",
              p.level,
              p.total_xp         AS "totalXp",
              p.streak,
              p.total_matches_played AS "totalMatchesPlayed",
              p.last_active_at   AS "lastActiveAt",
              p.status,
              p.created_at       AS "createdAt",
              COUNT(sp.id) FILTER (WHERE sp.attendance_status = 'present')::int AS "sessionsAttended",
              MAX(sp.credit_deducted_at) AS "lastSessionAt"
            FROM players p
            LEFT JOIN session_players sp ON sp.player_id = p.id
            GROUP BY p.id, p.name, p.academy_id, p.ball_level, p.level, p.total_xp,
                     p.streak, p.total_matches_played, p.last_active_at, p.status, p.created_at
          `),
          // BATCH QUERY 2: last login per player from users table
          pool.query<{ playerId: string; lastLoginAt: Date | null }>(`
            SELECT player_id AS "playerId", last_login_at AS "lastLoginAt"
            FROM users
            WHERE player_id IS NOT NULL
          `),
          storage.getAllAcademies(),
        ]);

        // Build lookup maps
        const academyMap = new Map<string, string>();
        for (const academy of academies) {
          academyMap.set(academy.id, academy.name);
        }
        const loginMap = new Map<string, Date | null>();
        for (const row of userRows.rows) {
          loginMap.set(row.playerId, row.lastLoginAt);
        }

        const allPlayers = playerRows.rows;
        const totalPlayers = allPlayers.length;

        // Derive active player IDs (session or app activity within 7 days)
        const activePlayerIds = new Set<string>();
        for (const p of allPlayers) {
          const lastSession = p.lastSessionAt ? new Date(p.lastSessionAt) : null;
          const lastActive = p.lastActiveAt ? new Date(p.lastActiveAt) : null;
          if (
            (lastSession && lastSession >= sevenDaysAgo) ||
            (lastActive && lastActive >= sevenDaysAgo)
          ) {
            activePlayerIds.add(p.id);
          }
        }

        const activeThisWeek = activePlayerIds.size;
        const atRisk = Math.max(0, totalPlayers - activeThisWeek);

        const totalXp = allPlayers.reduce((sum, p) => sum + (Number(p.totalXp) || 0), 0);
        const totalLevel = allPlayers.reduce((sum, p) => sum + (Number(p.level) || 1), 0);
        const totalStreak = allPlayers.reduce((sum, p) => sum + (Number(p.streak) || 0), 0);

        const avgXpPerPlayer = totalPlayers > 0 ? Math.round(totalXp / totalPlayers) : 0;
        const avgLevel = totalPlayers > 0 ? Math.round((totalLevel / totalPlayers) * 10) / 10 : 1;
        const avgStreak = totalPlayers > 0 ? Math.round((totalStreak / totalPlayers) * 10) / 10 : 0;

        const BALL_LEVEL_ORDER = ["blue", "red", "orange", "green", "yellow", "glow"];
        const ballLevelDistribution = BALL_LEVEL_ORDER.map((ballLevel) => ({
          ballLevel,
          count: allPlayers.filter((p) => (p.ballLevel || "blue").toLowerCase() === ballLevel).length,
        }));

        const getEngagement = (player: typeof allPlayers[0]): "high" | "medium" | "low" => {
          const isActive = activePlayerIds.has(player.id);
          const hasStreak = (Number(player.streak) || 0) >= 3;
          if (isActive && hasStreak) return "high";
          if (isActive || hasStreak) return "medium";
          return "low";
        };

        const playersWithEngagement = allPlayers
          .map((p) => ({
            id: p.id,
            name: p.name,
            academy: p.academyId ? (academyMap.get(p.academyId) ?? null) : null,
            level: Number(p.level) || 1,
            ballLevel: p.ballLevel || "blue",
            xp: Number(p.totalXp) || 0,
            sessions: p.sessionsAttended,
            streak: Number(p.streak) || 0,
            engagement: getEngagement(p),
          }))
          .sort((a, b) => b.xp - a.xp)
          .slice(0, 30);

        // All players for directory tab — enriched, A-Z sorted
        const allPlayersDirectory = allPlayers
          .map((p) => {
            const lastSessionAt = p.lastSessionAt ? p.lastSessionAt.toISOString() : null;
            const lastActiveAt = p.lastActiveAt ? p.lastActiveAt.toISOString() : null;
            const lastLoginAt = loginMap.get(p.id);
            // isActive: status must be 'active' AND recent activity within 30 days
            const recentActivity =
              (lastSessionAt && new Date(lastSessionAt) >= thirtyDaysAgo) ||
              (lastActiveAt && new Date(lastActiveAt) >= thirtyDaysAgo);
            const isActive = p.status === "active" && !!recentActivity;
            return {
              id: p.id,
              name: p.name,
              academy: p.academyId ? (academyMap.get(p.academyId) ?? null) : null,
              level: Number(p.level) || 1,
              ballLevel: p.ballLevel || "blue",
              totalXp: Number(p.totalXp) || 0,
              streak: Number(p.streak) || 0,
              status: p.status ?? null,
              sessionsAttended: p.sessionsAttended,
              totalMatchesPlayed: Number(p.totalMatchesPlayed) || 0,
              lastSessionAt,
              lastActiveAt,
              lastLoginAt: lastLoginAt ? lastLoginAt.toISOString() : null,
              joinedAt: p.createdAt ? p.createdAt.toISOString() : null,
              isActive,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        res.json({
          healthStats: {
            totalPlayers,
            activeThisWeek,
            atRisk,
            avgLevel,
            avgXpPerPlayer,
            avgStreak,
          },
          ballLevelDistribution,
          players: playersWithEngagement,
          allPlayers: allPlayersDirectory,
        });
      } catch (error) {
        console.error("Platform player health error:", error);
        res.status(500).json({ error: "Failed to fetch player health data" });
      }
    },
  );

  // Platform Owner - Get coach health metrics across all academies
  router.get(
    "/api/platform/coach-health",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academies = await storage.getAllAcademies();
        const allCoaches: any[] = [];

        for (const academy of academies) {
          const coaches = await storage.getCoachesByAcademy(academy.id);
          allCoaches.push(
            ...coaches.map((c) => ({ ...c, academyName: academy.name })),
          );
        }

        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const coachStats = await Promise.all(
          allCoaches.map(async (coach) => {
            const sessions = await storage.getAllSessionsByCoach(coach.id);
            const recentSessions = sessions.filter(
              (s) => new Date(s.startTime) >= sevenDaysAgo,
            );
            const sessionsCount = recentSessions.length;

            const players = await storage.getPlayersByCoach(coach.id);
            const playersCount = players.length;

            // Estimate XP awarded based on sessions (approximate since we don't have per-session XP)
            const totalXpAwarded = sessionsCount * 25; // Rough estimate per session

            const lastSessionDate =
              sessions.length > 0
                ? new Date(
                    Math.max(
                      ...sessions.map((s) => new Date(s.startTime).getTime()),
                    ),
                  )
                : null;

            const timeSinceLastSession = lastSessionDate
              ? Math.floor(
                  (now.getTime() - lastSessionDate.getTime()) / (1000 * 60),
                )
              : null;

            let lastActive = "Never";
            if (timeSinceLastSession !== null) {
              if (timeSinceLastSession < 60)
                lastActive = `${timeSinceLastSession} min ago`;
              else if (timeSinceLastSession < 1440)
                lastActive = `${Math.floor(timeSinceLastSession / 60)} hours ago`;
              else
                lastActive = `${Math.floor(timeSinceLastSession / 1440)} days ago`;
            }

            let burnoutRisk: "high" | "medium" | "low" = "low";
            if (sessionsCount >= 12) burnoutRisk = "high";
            else if (sessionsCount >= 8) burnoutRisk = "medium";

            return {
              name: coach.name,
              academy: coach.academyName,
              sessions: sessionsCount,
              players: playersCount,
              xpAwarded: totalXpAwarded,
              burnoutRisk,
              lastActive,
            };
          }),
        );

        const totalCoaches = allCoaches.length;
        const activeThisWeek = coachStats.filter((c) => c.sessions > 0).length;
        const atRisk = coachStats.filter(
          (c) => c.burnoutRisk === "high" || c.burnoutRisk === "medium",
        ).length;

        const totalSessions = coachStats.reduce(
          (sum, c) => sum + c.sessions,
          0,
        );
        const totalXp = coachStats.reduce((sum, c) => sum + c.xpAwarded, 0);

        const avgSessionsPerCoach =
          totalCoaches > 0
            ? Math.round((totalSessions / totalCoaches) * 10) / 10
            : 0;
        const avgXpAwarded =
          totalCoaches > 0 ? Math.round(totalXp / totalCoaches) : 0;

        res.json({
          healthStats: {
            totalCoaches,
            activeThisWeek,
            atRisk,
            avgSessionsPerCoach,
            avgXpAwarded,
          },
          coaches: coachStats.slice(0, 20),
        });
      } catch (error) {
        console.error("Platform coach health error:", error);
        res.status(500).json({ error: "Failed to fetch coach health data" });
      }
    },
  );

  // ==================== PLATFORM CONFIG ENDPOINTS ====================

  // Public endpoint: Get platform welcome video for onboarding
  router.get(
    "/api/public/platform/welcome-video",
    async (req: Request, res: Response) => {
      try {
        const config = await storage.getPlatformConfig("welcome_video");
        if (!config || !config.value) {
          return res.json({ url: null });
        }
        const value = config.value as { url?: string };
        res.json({ url: value.url || null });
      } catch (error) {
        console.error("Get platform welcome video error:", error);
        res
          .status(500)
          .json({ error: "Failed to fetch platform welcome video" });
      }
    },
  );

  // Get all platform configs
  router.get(
    "/api/platform/config",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const configs = await storage.getAllPlatformConfigs();
        res.json(configs);
      } catch (error) {
        console.error("Get platform configs error:", error);
        res.status(500).json({ error: "Failed to fetch platform configs" });
      }
    },
  );

  // Get specific platform config by key
  router.get(
    "/api/platform/config/:key",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { key } = req.params;
        const config = await storage.getPlatformConfig(key);

        if (!config) {
          return res.status(404).json({ error: "Config not found" });
        }

        res.json(config);
      } catch (error) {
        console.error("Get platform config error:", error);
        res.status(500).json({ error: "Failed to fetch platform config" });
      }
    },
  );

  // Set platform config
  router.put(
    "/api/platform/config/:key",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { key } = req.params;
        const { value } = req.body;

        if (value === undefined) {
          return res.status(400).json({ error: "Value is required" });
        }

        const oldConfig = await storage.getPlatformConfig(key);
        const config = await storage.setPlatformConfig(
          key,
          value,
          req.user?.userId,
        );

        await storage.createAuditLog({
          academyId: null,
          entityType: "platform_config",
          entityId: key,
          action: oldConfig ? "update" : "create",
          performedBy: req.user?.userId,
          performedByRole: req.user?.role,
          beforeState: oldConfig?.value || null,
          afterState: value,
          metadata: JSON.stringify({ key }),
        });

        res.json(config);
      } catch (error) {
        console.error("Set platform config error:", error);
        res.status(500).json({ error: "Failed to set platform config" });
      }
    },
  );

  // Delete platform config
  router.delete(
    "/api/platform/config/:key",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { key } = req.params;

        const oldConfig = await storage.getPlatformConfig(key);
        if (!oldConfig) {
          return res.status(404).json({ error: "Config not found" });
        }

        await storage.deletePlatformConfig(key);

        await storage.createAuditLog({
          academyId: null,
          entityType: "platform_config",
          entityId: key,
          action: "delete",
          performedBy: req.user?.userId,
          performedByRole: req.user?.role,
          beforeState: oldConfig.value,
          afterState: null,
          metadata: JSON.stringify({ key }),
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Delete platform config error:", error);
        res.status(500).json({ error: "Failed to delete platform config" });
      }
    },
  );

  // ==================== MAINTENANCE MODE ENDPOINTS ====================

  // Toggle maintenance mode
  router.post(
    "/api/platform/maintenance",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { enabled } = req.body;

        if (typeof enabled !== "boolean") {
          return res.status(400).json({ error: "enabled must be a boolean" });
        }

        const oldStatus = await storage.isMaintenanceMode();
        const config = await storage.setMaintenanceMode(
          enabled,
          req.user?.userId,
        );

        await storage.createAuditLog({
          academyId: null,
          entityType: "platform_config",
          entityId: "maintenance",
          action: "update",
          performedBy: req.user?.userId,
          performedByRole: req.user?.role,
          beforeState: { enabled: oldStatus },
          afterState: { enabled },
          metadata: JSON.stringify({
            action: enabled ? "PLATFORM_LOCKED" : "PLATFORM_UNLOCKED",
          }),
        });

        res.json({
          success: true,
          maintenance: enabled,
          message: enabled
            ? "Platform is now in maintenance mode"
            : "Platform is now operational",
        });
      } catch (error) {
        console.error("Toggle maintenance error:", error);
        res.status(500).json({ error: "Failed to toggle maintenance mode" });
      }
    },
  );

  // ==================== XP ENGINE CONFIG ENDPOINTS ====================

  // Get XP engine config
  router.get(
    "/api/platform/xp-config",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const config = await storage.getXpConfig();
        res.json(config);
      } catch (error) {
        console.error("Get XP config error:", error);
        res.status(500).json({ error: "Failed to fetch XP config" });
      }
    },
  );

  // Update XP engine config
  router.put(
    "/api/platform/xp-config",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { baseValues, multipliers, dailyCap, weeklyCap } = req.body;

        const oldConfig = await storage.getXpConfig();

        const newConfig = {
          baseValues: baseValues || oldConfig.baseValues,
          multipliers: multipliers || oldConfig.multipliers,
          dailyCap: dailyCap ?? oldConfig.dailyCap,
          weeklyCap: weeklyCap ?? oldConfig.weeklyCap,
        };

        const config = await storage.setXpConfig(newConfig, req.user?.userId);

        await storage.createAuditLog({
          academyId: null,
          entityType: "xp_config",
          entityId: "xp_engine",
          action: "update",
          performedBy: req.user?.userId,
          performedByRole: req.user?.role,
          beforeState: oldConfig,
          afterState: newConfig,
          metadata: JSON.stringify({ source: "platform_settings" }),
        });

        res.json(newConfig);
      } catch (error) {
        console.error("Update XP config error:", error);
        res.status(500).json({ error: "Failed to update XP config" });
      }
    },
  );

  // ==================== PLATFORM FINANCIALS (ESTIMATED) ====================

  // Get platform financials - ESTIMATED / LABELED (no Stripe)
  router.get(
    "/api/platform/financials",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academies = await storage.getAllAcademies();

        let totalEstimatedMrr = 0;
        let totalActiveSubscriptions = 0;
        let totalPendingRevenue = 0;
        const breakdownByPlan: Record<
          string,
          { count: number; total: number }
        > = {};

        for (const academy of academies) {
          if (academy.isActive === false) continue;

          const subscriptions = await storage.getActivePlayerSubscriptions(
            academy.id,
          );

          for (const sub of subscriptions) {
            const price = Number(sub.price || 0);
            const monthlyEquivalent =
              sub.billingPeriod === "weekly" ? price * 4 : price;
            totalEstimatedMrr += monthlyEquivalent;
            totalActiveSubscriptions++;

            const planKey = sub.planName || "Standard";
            if (!breakdownByPlan[planKey]) {
              breakdownByPlan[planKey] = { count: 0, total: 0 };
            }
            breakdownByPlan[planKey].count++;
            breakdownByPlan[planKey].total += monthlyEquivalent;
          }

          const payments = await storage.getPayments(academy.id);
          const pendingPayments = payments.filter(
            (p) => p.status === "pending",
          );
          totalPendingRevenue += pendingPayments.reduce(
            (sum, p) => sum + Number(p.amount || 0),
            0,
          );
        }

        res.json({
          disclaimer:
            "These figures are ESTIMATED based on active player subscriptions. They do not represent collected revenue.",
          estimatedMrr: {
            amount: totalEstimatedMrr,
            currency: "AED",
            label: "Estimated Monthly Recurring Revenue",
            tooltip:
              "Calculated from active player subscriptions across all academies. This is a projection, not actual collected payments.",
          },
          pendingRevenue: {
            amount: totalPendingRevenue,
            currency: "AED",
            label: "Pending Payments (Aggregated)",
            tooltip:
              "Sum of unconfirmed payments from all academies. These are recorded but not yet verified.",
          },
          subscriptionBreakdown: Object.entries(breakdownByPlan).map(
            ([planName, data]) => ({
              planName,
              count: data.count,
              monthlyTotal: data.total,
            }),
          ),
          totalActiveSubscriptions,
          academiesCount: academies.filter((a) => a.isActive !== false).length,
          generatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Platform financials error:", error);
        res.status(500).json({ error: "Failed to fetch platform financials" });
      }
    },
  );
  // Admin Player Search & Onboarding Reset
  router.get(
    "/api/admin/players/search",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const query = req.query.q as string;
        if (!query || query.length < 2) {
          return res
            .status(400)
            .json({ error: "Search query must be at least 2 characters" });
        }

        const searchConditions = or(
          ilike(players.name, `%${query}%`),
          ilike(players.displayName, `%${query}%`),
          ilike(players.email, `%${query}%`),
        )!;

        // platform_owner can search globally; academy_owner/admin are scoped to their academy
        const academyCondition = req.user!.role === "platform_owner"
          ? searchConditions
          : and(searchConditions, eq(players.academyId, req.user!.academyId!));

        const searchResults = await db
          .select({
            id: players.id,
            name: players.name,
            displayName: players.displayName,
            email: players.email,
            ballLevel: players.ballLevel,
            onboardingCompleted: players.onboardingCompleted,
            profilePhotoUrl: players.profilePhotoUrl,
            academyId: players.academyId,
            dateOfBirth: players.dateOfBirth,
            parentEmail: players.parentEmail,
            coachId: players.coachId,
          })
          .from(players)
          .where(academyCondition)
          .limit(20);

        res.json(searchResults);
      } catch (error) {
        console.error("Admin player search error:", error);
        res.status(500).json({ error: "Failed to search players" });
      }
    },
  );

  // Admin endpoint to check and fix player academy assignments
  router.get(
    "/api/admin/players/academy-status",
    authMiddleware,
    requireRole("admin", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        // Get all players with their academyId status
        const allPlayers = await storage.getAllPlayers();

        const playersWithoutAcademy = allPlayers.filter((p) => !p.academyId);
        const playersWithAcademy = allPlayers.filter((p) => p.academyId);

        // Group by academy
        const byAcademy: Record<string, { name: string; count: number }> = {};
        for (const player of playersWithAcademy) {
          if (!byAcademy[player.academyId!]) {
            const academy = await storage.getAcademy(player.academyId!);
            byAcademy[player.academyId!] = {
              name: academy?.name || "Unknown",
              count: 0,
            };
          }
          byAcademy[player.academyId!].count++;
        }

        res.json({
          total: allPlayers.length,
          withAcademy: playersWithAcademy.length,
          withoutAcademy: playersWithoutAcademy.length,
          orphanedPlayers: playersWithoutAcademy.map((p) => ({
            id: p.id,
            name: p.name,
            email: p.email,
          })),
          byAcademy,
        });
      } catch (error) {
        console.error("Admin academy status error:", error);
        res.status(500).json({ error: "Failed to get academy status" });
      }
    },
  );

  // Admin endpoint to assign players to an academy
  router.post(
    "/api/admin/players/assign-academy",
    authMiddleware,
    requireRole("admin", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { playerIds, academyId } = req.body;

        if (!playerIds || !Array.isArray(playerIds) || !academyId) {
          return res
            .status(400)
            .json({ error: "playerIds array and academyId are required" });
        }

        // Verify academy exists
        const academy = await storage.getAcademy(academyId);
        if (!academy) {
          return res.status(404).json({ error: "Academy not found" });
        }

        // Update each player
        const results = [];
        for (const playerId of playerIds) {
          try {
            await storage.updatePlayer(playerId, { academyId });
            results.push({ playerId, success: true });
          } catch (error) {
            results.push({ playerId, success: false, error: String(error) });
          }
        }

        res.json({ success: true, results, academyName: academy.name });
      } catch (error) {
        console.error("Admin assign academy error:", error);
        res.status(500).json({ error: "Failed to assign academy" });
      }
    },
  );

  router.get(
    "/api/admin/players/:id/credit-audit",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.params.id;
        const academyId = req.user?.academyId;
        const player = await storage.getPlayer(playerId, academyId ?? undefined);
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }

        const allTransactions = await db.select().from(creditTransactions)
          .where(eq(creditTransactions.playerId, playerId))
          .orderBy(creditTransactions.createdAt);

        const allPackages = await db.select().from(packages)
          .where(eq(packages.playerId, playerId));

        const allSessionPlayers = await db.select({
          id: sessionPlayers.id,
          sessionId: sessionPlayers.sessionId,
          attendanceStatus: sessionPlayers.attendanceStatus,
        }).from(sessionPlayers)
          .where(eq(sessionPlayers.playerId, playerId));

        const sessionIds = [...new Set(allSessionPlayers.map(sp => sp.sessionId))];
        let sessionDetails: Record<string, any> = {};
        if (sessionIds.length > 0) {
          const sessRows = await db.select({
            id: sessions.id,
            sessionType: sessions.sessionType,
            date: sessions.date,
            duration: sessions.duration,
            status: sessions.status,
          }).from(sessions)
            .where(inArray(sessions.id, sessionIds));
          for (const s of sessRows) {
            sessionDetails[s.id] = s;
          }
        }

        const balance = await storage.getPlayerCreditBalanceByType(playerId);

        const txSummary = allTransactions.map(tx => ({
          id: tx.id,
          amount: Number(tx.amount),
          creditType: tx.creditType,
          reason: tx.reason,
          type: tx.type,
          packageId: tx.packageId,
          sessionId: tx.sessionId,
          metadata: tx.metadata,
          createdAt: tx.createdAt,
          includedInBalance: (() => {
            const meta = tx.metadata as any;
            if (tx.reason === "debt_settlement") return false;
            if (meta?.cancelled === true || meta?.expired === true) return false;
            if (!tx.creditType) return false;
            if (Number(tx.amount) > 0 && !tx.packageId && (
              tx.reason === "package_purchased" || tx.reason === "package_purchase" || tx.reason === "package_deleted_refund"
            )) return false;
            return true;
          })(),
          isSettledDebt: (() => {
            const meta = tx.metadata as any;
            return meta?.settled === true;
          })(),
        }));

        const attendedSessions = allSessionPlayers
          .filter(sp => sp.attendanceStatus === "present" || sp.attendanceStatus === "late");
        const debitSessionIds = new Set(
          allTransactions
            .filter(tx => {
              const meta = tx.metadata as any;
              return Number(tx.amount) < 0 && tx.sessionId &&
                tx.reason !== "debt_settlement" &&
                meta?.cancelled !== true && meta?.expired !== true;
            })
            .map(tx => tx.sessionId!)
        );
        const missingSessions = attendedSessions
          .filter(sp => !debitSessionIds.has(sp.sessionId))
          .filter(sp => sessionDetails[sp.sessionId]?.status !== "cancelled")
          .map(sp => ({
            sessionId: sp.sessionId,
            sessionDetails: sessionDetails[sp.sessionId] || null,
          }));

        res.json({
          player: { id: player.id, name: player.name },
          computedBalance: balance,
          transactions: txSummary,
          packages: allPackages.map(pkg => ({
            id: pkg.id,
            creditType: pkg.creditType,
            totalCredits: Number(pkg.totalCredits),
            remainingCredits: Number(pkg.remainingCredits),
            status: pkg.status,
            expiryDate: pkg.expiryDate,
            createdAt: pkg.createdAt,
          })),
          sessionPlayers: attendedSessions.map(sp => ({
            sessionPlayerId: sp.id,
            sessionId: sp.sessionId,
            attendanceStatus: sp.attendanceStatus,
            sessionDetails: sessionDetails[sp.sessionId] || null,
            hasDebitTransaction: debitSessionIds.has(sp.sessionId),
          })),
          missingSessions,
          summary: {
            totalTransactions: allTransactions.length,
            activeTransactions: txSummary.filter(t => t.includedInBalance).length,
            settledTransactions: txSummary.filter(t => (t.metadata as any)?.settled === true).length,
            cancelledTransactions: txSummary.filter(t => (t.metadata as any)?.cancelled === true).length,
            totalPackages: allPackages.length,
            totalSessionsAttended: attendedSessions.length,
            sessionsWithoutDebit: missingSessions.length,
          },
        });
      } catch (error) {
        console.error("Credit audit error:", error);
        res.status(500).json({ error: "Failed to generate credit audit" });
      }
    },
  );

  // REPAIR JOB: Fix player credit data
  router.post(
    "/api/admin/players/:id/repair-credits",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.params.id;
        const academyId = req.user?.academyId;

        // Verify player exists and belongs to requester's academy
        const player = await storage.getPlayer(playerId, academyId ?? undefined);
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }

        const result = await storage.repairPlayerCredits(playerId);

        if (result.success) {
          res.json({
            message: `Repaired credits for ${player.name || playerId}`,
            ...result,
          });
        } else {
          res.status(500).json({
            error: "Repair failed",
            ...result,
          });
        }
      } catch (error) {
        console.error("Credit repair error:", error);
        res.status(500).json({ error: "Failed to repair credits" });
      }
    },
  );

  // BULK REPAIR: Fix ALL players' credit data using ensureCreditProcessed
  router.post(
    "/api/admin/repair-all-credits",
    adminRepairLimiter,
    authMiddleware,
    requireRole("admin", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        console.log(
          "[BulkRepair] Starting bulk repair of all player credits...",
        );
        const { repairAllPlayerCredits } = await import("../storage");
        const result = await repairAllPlayerCredits();

        console.log(
          `[BulkRepair] Complete: ${result.processed} processed, ${result.consumed} consumed, ${result.debts} debts, ${result.alreadyProcessed} already processed`,
        );

        res.json({
          message: "Bulk credit repair complete",
          ...result,
        });
      } catch (error) {
        console.error("Bulk credit repair error:", error);
        res.status(500).json({ error: "Failed to repair credits" });
      }
    },
  );

  // Admin: Set player XP/Level for testing
  router.post(
    "/api/admin/players/:id/set-level",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user?.academyId;
        const setLevelSchema = z.object({ level: z.number().int().positive().optional(), xp: z.number().int().nonnegative().optional() });
        const parsedLevel = setLevelSchema.safeParse(req.body);
        if (!parsedLevel.success) return res.status(400).json({ error: fromZodError(parsedLevel.error).message });
        const { level, xp } = parsedLevel.data;

        // Verify player belongs to requester's academy
        const player = await storage.getPlayer(id, academyId ?? undefined);
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Level 50 requires 20500 XP based on leveling formula
        // XP = 100 * level + 50 * (level - 1)^1.3 approximately
        const targetXp = xp || calculateXpForLevel(level || 50);

        await storage.updatePlayer(id, { totalXp: targetXp });

        console.log(
          `[Admin] Set player ${id} to level ${level || 50} with ${targetXp} XP`,
        );
        res.json({
          success: true,
          playerId: id,
          totalXp: targetXp,
          targetLevel: level || 50,
        });
      } catch (error) {
        console.error("Set player level error:", error);
        res.status(500).json({ error: "Failed to set player level" });
      }
    },
  );

  // Helper function for XP calculation
  function calculateXpForLevel(level: number): number {
    // Based on the level system: each level requires progressively more XP
    // Level 50 needs approximately 20500+ XP
    let totalXp = 0;
    for (let i = 1; i <= level; i++) {
      totalXp += Math.floor(100 + 50 * Math.pow(i - 1, 1.3));
    }
    return totalXp;
  }

  router.post(
    "/api/admin/players/:id/reset-onboarding",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.params.id;
        const academyId = req.user?.academyId;

        // Verify player belongs to requester's academy before mutating
        const existingPlayer = await storage.getPlayer(playerId, academyId ?? undefined);
        if (!existingPlayer) {
          return res.status(404).json({ error: "Player not found" });
        }

        const [updated] = await db
          .update(players)
          .set({
            onboardingCompleted: false,
            profilePhotoUrl: null,
          })
          .where(eq(players.id, playerId))
          .returning({
            id: players.id,
            name: players.name,
            onboardingCompleted: players.onboardingCompleted,
          });

        if (!updated) {
          return res.status(404).json({ error: "Player not found" });
        }

        res.json({ message: "Onboarding reset successfully", player: updated });
      } catch (error) {
        console.error("Reset onboarding error:", error);
        res.status(500).json({ error: "Failed to reset onboarding" });
      }
    },
  );
  // Admin Roles & Permissions - Get role configurations
  router.get(
    "/api/admin/roles",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy context required" });
        }

        const defaultRoles = [
          {
            id: "admin",
            name: "admin",
            displayName: "Admin",
            description: "Full access to all academy features",
            isSystemRole: true,
            permissions: {
              view_players: true,
              edit_players: true,
              delete_players: true,
              view_sessions: true,
              create_sessions: true,
              edit_sessions: true,
              delete_sessions: true,
              view_coaches: true,
              manage_coaches: true,
              view_courts: true,
              manage_courts: true,
              view_reports: true,
              manage_billing: true,
              send_notifications: true,
              manage_settings: true,
            },
          },
          {
            id: "coach",
            name: "coach",
            displayName: "Coach",
            description: "Can manage own sessions and view players",
            isSystemRole: true,
            permissions: {
              view_players: true,
              edit_players: false,
              delete_players: false,
              view_sessions: true,
              create_sessions: true,
              edit_sessions: true,
              delete_sessions: false,
              view_coaches: true,
              manage_coaches: false,
              view_courts: true,
              manage_courts: false,
              view_reports: false,
              manage_billing: false,
              send_notifications: true,
              manage_settings: false,
            },
          },
          {
            id: "assistant_coach",
            name: "assistant_coach",
            displayName: "Assistant Coach",
            description: "Limited coaching capabilities",
            isSystemRole: false,
            permissions: {
              view_players: true,
              edit_players: false,
              delete_players: false,
              view_sessions: true,
              create_sessions: false,
              edit_sessions: false,
              delete_sessions: false,
              view_coaches: true,
              manage_coaches: false,
              view_courts: true,
              manage_courts: false,
              view_reports: false,
              manage_billing: false,
              send_notifications: false,
              manage_settings: false,
            },
          },
          {
            id: "front_desk",
            name: "front_desk",
            displayName: "Front Desk",
            description: "Reception and scheduling support",
            isSystemRole: false,
            permissions: {
              view_players: true,
              edit_players: true,
              delete_players: false,
              view_sessions: true,
              create_sessions: true,
              edit_sessions: true,
              delete_sessions: false,
              view_coaches: true,
              manage_coaches: false,
              view_courts: true,
              manage_courts: false,
              view_reports: false,
              manage_billing: true,
              send_notifications: true,
              manage_settings: false,
            },
          },
        ];

        const settings = await storage.getAcademySettings(academyId);
        const customRoles = settings?.roles || defaultRoles;

        res.json({ roles: customRoles });
      } catch (error) {
        console.error("Get roles error:", error);
        res.status(500).json({ error: "Failed to fetch roles" });
      }
    },
  );

  // Admin Roles & Permissions - Update role configurations
  router.put(
    "/api/admin/roles",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy context required" });
        }

        const { roles } = req.body;
        if (!roles || !Array.isArray(roles)) {
          return res.status(400).json({ error: "Invalid roles data" });
        }

        const settings = (await storage.getAcademySettings(academyId)) || {};
        const updatedSettings = { ...settings, roles };
        await storage.updateAcademySettings(academyId, updatedSettings);

        res.json({ success: true, roles });
      } catch (error) {
        console.error("Update roles error:", error);
        res.status(500).json({ error: "Failed to update roles" });
      }
    },
  );

  // ==================== FEATURE ANALYTICS ENDPOINTS ====================

  // POST /api/analytics/event — fire-and-forget feature event logging
  router.post(
    "/api/analytics/event",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user?.userId;
        if (!userId) {
          res.status(401).end();
          return;
        }

        const { feature, platform: clientPlatform } = req.body;
        if (!feature || typeof feature !== "string") {
          res.status(400).end();
          return;
        }

        const academyId = req.user?.academyId || null;
        const platform = ["ios", "android", "web"].includes(clientPlatform) ? clientPlatform : "web";

        // Fire-and-forget: check role from DB and skip recording for staff/owner roles
        pool.query(
          `SELECT role FROM users WHERE id = $1`,
          [userId],
        ).then((roleResult) => {
          const staffRoles = ["platform_owner", "academy_owner", "owner", "admin", "coach", "assistant"];
          const dbRole = roleResult.rows[0]?.role as string | undefined;
          if (dbRole && staffRoles.includes(dbRole)) return;
          pool.query(
            `INSERT INTO feature_events (user_id, academy_id, feature, platform) VALUES ($1, $2, $3, $4)`,
            [userId, academyId, feature.substring(0, 100), platform],
          ).catch(() => {});
        }).catch(() => {});

        res.status(204).end();
      } catch {
        res.status(204).end();
      }
    },
  );

  // GET /api/platform/analytics/feature-usage — aggregated counts for platform owner
  router.get(
    "/api/platform/analytics/feature-usage",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const days = Math.min(parseInt((req.query.days as string) || "7", 10) || 7, 90);
        const academyId = req.query.academyId as string | undefined;

        const params: (string | number)[] = [days];
        let academyFilter = "";
        if (academyId) {
          params.push(academyId);
          academyFilter = `AND fe.academy_id = $${params.length}`;
        }

        const result = await pool.query(
          `SELECT fe.feature,
                  COUNT(*)::int AS total
           FROM feature_events fe
           JOIN users u ON u.id = fe.user_id
           WHERE fe.created_at >= NOW() - ($1 || ' days')::interval
             AND u.role NOT IN ('platform_owner', 'academy_owner', 'owner', 'admin', 'coach', 'assistant')
           ${academyFilter}
           GROUP BY fe.feature
           ORDER BY total DESC`,
          params,
        );

        const rows = result.rows as { feature: string; total: number }[];
        const maxCount = rows.length > 0 ? rows[0].total : 1;

        const features = rows.map((r) => ({
          feature: r.feature,
          total: r.total,
          intensity: maxCount > 0 ? r.total / maxCount : 0,
        }));

        res.json({ features, days, generatedAt: new Date().toISOString() });
      } catch (error) {
        console.error("Feature usage analytics error:", error);
        res.status(500).json({ error: "Failed to fetch feature usage" });
      }
    },
  );

  // GET /api/platform/analytics/feature-drilldown — top players for a specific feature
  router.get(
    "/api/platform/analytics/feature-drilldown",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const feature = (req.query.feature as string)?.substring(0, 100);
        if (!feature) return res.status(400).json({ error: "feature is required" });
        const days = Math.min(parseInt((req.query.days as string) || "7", 10) || 7, 90);
        const academyId = req.query.academyId as string | undefined;

        const params: (string | number)[] = [feature, days];
        let academyFilter = "";
        if (academyId) {
          params.push(academyId);
          academyFilter = `AND p.academy_id = $${params.length}`;
        }

        const result = await pool.query(
          `SELECT
             fe.user_id,
             COALESCE(p.name, u.username, u.email) AS player_name,
             p.id AS player_id,
             a.name AS academy_name,
             COUNT(*)::int AS count
           FROM feature_events fe
           JOIN users u ON u.id = fe.user_id
           LEFT JOIN players p ON p.id = u.player_id
           LEFT JOIN academies a ON a.id = p.academy_id
           WHERE fe.feature = $1
             AND fe.created_at >= NOW() - ($2 || ' days')::interval
             ${academyFilter}
           GROUP BY fe.user_id, p.name, u.username, u.email, p.id, a.name
           ORDER BY count DESC
           LIMIT 20`,
          params,
        );

        res.json({ feature, days, players: result.rows });
      } catch (error) {
        console.error("Feature drilldown analytics error:", error);
        res.status(500).json({ error: "Failed to fetch feature drilldown" });
      }
    },
  );

  // GET /api/platform/analytics/player-activity
  // Returns players who had app events in the period, ranked by period event count.
  // Each player includes a feature_breakdown map: { [feature]: count }
  router.get(
    "/api/platform/analytics/player-activity",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const days = Math.min(parseInt((req.query.days as string) || "7", 10) || 7, 90);
        const academyId = req.query.academyId as string | undefined;

        const params: (string | number)[] = [days];
        let academyFilter = "";
        if (academyId) {
          params.push(academyId);
          academyFilter = `AND p.academy_id = $${params.length}`;
        }

        // Fetch per-player, per-feature counts in the period
        const result = await pool.query(
          `WITH
             fe_period AS (
               SELECT
                 u.player_id,
                 fe.feature,
                 COUNT(*)::int AS cnt
               FROM feature_events fe
               JOIN users u ON u.id = fe.user_id
               WHERE fe.created_at >= NOW() - ($1 || ' days')::interval
                 AND u.player_id IS NOT NULL
                 AND u.role NOT IN ('platform_owner', 'academy_owner', 'owner', 'admin', 'coach', 'assistant')
               GROUP BY u.player_id, fe.feature
             ),
             player_totals AS (
               SELECT player_id, SUM(cnt)::int AS period_total
               FROM fe_period
               GROUP BY player_id
             )
           SELECT
             p.id                          AS player_id,
             p.name                        AS player_name,
             COALESCE(p.level, 1)          AS level,
             COALESCE(p.total_xp, 0)       AS xp,
             COALESCE(p.streak, 0)         AS streak,
             a.id                          AS academy_id,
             COALESCE(a.name, '')          AS academy_name,
             pt.period_total,
             json_agg(
               json_build_object('feature', fp.feature, 'count', fp.cnt)
               ORDER BY fp.cnt DESC
             )                             AS features_json
           FROM player_totals pt
           JOIN players p ON p.id = pt.player_id
           LEFT JOIN academies a ON a.id = p.academy_id
           LEFT JOIN fe_period fp ON fp.player_id = pt.player_id
           WHERE NOT EXISTS (
             SELECT 1 FROM users pu
             WHERE pu.player_id = p.id
               AND pu.role IN ('platform_owner', 'academy_owner', 'owner', 'admin', 'coach', 'assistant')
           )
           ${academyFilter}
           GROUP BY p.id, p.name, p.level, p.total_xp, p.streak, a.id, a.name, pt.period_total
           ORDER BY pt.period_total DESC`,
          params,
        );

        interface RawRow {
          player_id: string;
          player_name: string;
          level: number;
          xp: number;
          streak: number;
          academy_id: string;
          academy_name: string;
          period_total: number;
          features_json: { feature: string; count: number }[];
        }

        const players = (result.rows as RawRow[]).map(r => {
          const feature_breakdown: Record<string, number> = {};
          if (Array.isArray(r.features_json)) {
            for (const f of r.features_json) {
              if (f && f.feature) feature_breakdown[f.feature] = f.count;
            }
          }
          return {
            player_id: r.player_id,
            player_name: r.player_name,
            level: r.level,
            xp: r.xp,
            streak: r.streak,
            academy_id: r.academy_id,
            academy_name: r.academy_name,
            period_total: r.period_total,
            feature_breakdown,
          };
        });

        res.json({ players, days, generatedAt: new Date().toISOString() });
      } catch (error) {
        console.error("Player activity analytics error:", error);
        res.status(500).json({ error: "Failed to fetch player activity" });
      }
    },
  );

export default router;
