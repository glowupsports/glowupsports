import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  storage,
  getSessionTypeByPlayerCount,
  updateSeriesSessionType,
  recalculateSeriesCredits,
} from "./storage";
import { db, pool } from "./db";
import { awardXP } from "./services/xp-service";
import {
  playerHolidays,
  coachWellnessLogs,
  insertCoachWellnessLogSchema,
  levelUpEvents,
  playerXpEvents,
  ballLevels,
  playerNotifications,
  spotlightNominations,
  spotlightWeeklyWinners,
  spotlightMonthlyWinners,
} from "@shared/schema";
import {
  eq,
  sql,
  desc,
  and,
  ne,
  gt,
  gte,
  asc,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  or,
  count,
  ilike,
  lte,
} from "drizzle-orm";
import {
  invoices,
  payments,
  sessionPlayers,
  sessionWaitlist,
  players,
  locationTravelTimes,
  sessions,
  sessionFeedback,
  inSessionFeedback,
  seriesPlayers,
  coachingSeries,
  sessionSkillObservations,
  sessionSkillFeedback,
  playerSessionCancellations,
  playerPillarProgress,
  coachXpTransactions,
  xpTransactions,
  playerBaselineSkillScores,
  playerBaselines,
  // Social features
  posts as postsTable,
  postReactions as postReactionsTable,
  postComments as postCommentsTable,
  commentLikes as commentLikesTable,
  communityGroups as communityGroupsTable,
  groupMembers as groupMembersTable,
  openToPlay as openToPlayTable,
  userSocialProfiles as userSocialProfilesTable,
  users,
  coaches,
  // Quest system
  questTemplates as questTemplatesTable,
  playerQuests as playerQuestsTable,
  dailyQuestSlots as dailyQuestSlotsTable,
  // Connections
  playerConnections,
  // Badge & Title system
  badges as badgesTable,
  playerBadges as playerBadgesTable,
  titles as titlesTable,
  playerTitles as playerTitlesTable,
  sessionPlans,
  // Social Booking & Open Matches (Phase 2-4)
  bookingInvites,
  bookingInviteGuests,
  openMatches,
  openMatchSlots,
  matchRequests,
  playerBookingPreferences,
  courtAvailability,
  courtAvailabilitySnapshots,
  coachSettings,
  coachAvailability,
  availabilityExceptions,
  coachTimeBlocks,
  // Monthly report tables
  courtBookings,
  matchLogs,
  playerBallLevels,
  academies,
  pushDeviceTokens,
  platformConfig,
  providerInvites,
  serviceProviders,
} from "@shared/schema";
import {
  setupWebSocket,
  broadcastNewMessage,
  broadcastNewSession,
  broadcastFeedbackReceived,
  broadcastSessionUpdate,
} from "./websocket";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  validatePassword,
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  requireAcademy,
  setFreshUserStorage,
  setFeatureUnlockChecker,
  requireFeatureUnlock,
  validatePlayerOwnership,
  validateCourtOwnership,
  validateSessionOwnership,
  validatePackageOwnership,
  validateNotificationOwnership,
  refreshAuthMiddleware,
  JWT_SECRET,
  type AuthenticatedRequest,
} from "./auth";
import {
  loginSchema,
  registerSchema,
  playerRegisterSchema,
  coachInviteRegisterSchema,
  academyApplicationInputSchema,
  insertSessionSchema,
  insertPlayerSchema,
  updatePlayerSchema,
  insertPackageSchema,
  insertPlayerNoteSchema,
  insertMessageSchema,
  insertMessageReactionSchema,
  submitReviewSchema,
} from "@shared/schema";
import crypto from "crypto";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import {
  sanitizeNote,
  sanitizeMessage,
  sanitizeTemplateName,
  sanitizeTemplateContent,
} from "./utils/sanitize";
import {
  localTimeToUTC,
  utcToLocalTime,
  getTimezoneOffset,
  getFirstSessionDate,
  addDaysToLocalDate,
  getLocalDateParts,
  resolveLocalTimeToUTC,
  ensureResolvableLocalTime,
} from "./utils/timezone";
import {
  sendFeedbackNotification,
  sendLevelUpNotification,
  sendBadgeEarnedNotification,
  sendXPGainNotification,
  sendSessionConfirmedNotification,
  sendSessionCancelledNotification,
  sendNewMessageNotification,
  sendCreditsLowNotification,
  getPlayerPushTokens,
  getCoachPushTokens,
  sendPushNotification,
} from "./pushNotifications";
import {
  sendFeedbackNotificationEmail,
  sendLevelUpEmail,
  sendWelcomeEmail,
  sendPlayerInviteEmail,
  sendSessionReminderEmail,
  sendCoachInviteEmail,
  sendOTPEmail,
  verifyOTPCode,
  hasValidOTP,
} from "./emailService";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  checkConnection as checkCalendarConnection,
  SessionEventData,
} from "./googleCalendarService";
import { generateInvoiceHtml, parseLineItems, parseInvoiceMetadata } from "./services/invoicePdf";
import { apiCache, CACHE_KEYS, CACHE_TTL } from "./cache";
import { getCurrencyForCountry } from "@shared/countries";
import shopRoutes from "./shop-routes";
import marketplaceRoutes from "./marketplace-routes";
import equipmentRoutes from "./equipment-routes";
import glowLevelingRoutes from "./routes/glow-leveling";
import sessionPlansRoutes from "./routes/session-plans";
import matchLogsRoutes from "./routes/match-logs";
import skillEvidenceRoutes from "./routes/skill-evidence";
import levelUpEventsRoutes from "./routes/level-up-events";
import coachCalibrationRoutes from "./routes/coach-calibration";
import parentDashboardRoutes from "./routes/parent-dashboard";
import monthlyReportsRoutes from "./routes/monthly-reports";
import adultGlowRankRoutes from "./routes/adult-glow-rank";
import lessonGroupsRoutes from "./routes/lesson-groups";
import matchIntelligenceRoutes from "./routes/match-intelligence";
import playerMatchReadinessRoutes from "./routes/player-match-readiness";
import matchChallengeRoutes from "./routes/match-challenges";
import playerLevelRoutes from "./routes/player-level";
import roleMessagesRoutes from "./routes/role-messages";
import socialFeaturesRoutes from "./routes/social-features";
import playerChatRoutes from "./routes/player-chat";
import videoFeedbackRoutes from "./routes/video-feedback";
import coachEarningsRoutes from "./routes/coach-earnings";
import playerBookingRoutes from "./routes/player-booking";
import playerSocialRoutes from "./routes/player-social";
import tournamentsLaddersRouter from "./routes/tournaments-ladders";
import discoveryMapRouter from "./routes/discovery-map";
import worldChatRouter from "./routes/world-chat";
import chatRoomsRouter from "./routes/chat-rooms";
import adminSeriesRouter from "./routes/admin-series";
import authRoutesRouter from "./routes/auth-routes";
import academyPublicRouter from "./routes/academy-public";
import coachCalendarRouter from "./routes/coach-calendar";
import playerAuthRouter from "./routes/player-auth";
import adminSetupRouter from "./routes/admin-setup";
import playerCreditsRouter from "./routes/player-credits";
import creditsV2Router from "./routes/credits-v2";
import playerProgressRouter from "./routes/player-progress";
import coachingSeriesRouter from "./routes/coaching-series";
import coachManagementRouter from "./routes/coach-management";
import coachAnalyticsRouter from "./routes/coach-analytics";
import academySettingsRouter from "./routes/academy-settings";
import platformOwnerRouter from "./routes/platform-owner";
import playerSessionsRouter from "./routes/player-sessions";
import corporateAccountsRouter from "./routes/corporate-accounts";
import playPartnerRouter from "./routes/play-partner";
import liveScoringRouter from "./routes/live-scoring";
import coachLocationRouter from "./routes/coach-location";
import aiUsageAdminRouter from "./routes/ai-usage-admin";
import subscriptionsRouter from "./routes/subscriptions";
import aiProRouter from "./routes/ai-pro";
import drillsRouter from "./routes/drills";
import coachHomeRouter from "./routes/coach-home";
import quizRouter from "./routes/quiz";
import { filterProfanity } from "./profanityFilter";
import { isPlayerMinor, getPlayerParentalControls } from "./childSafety";
import { chatRateLimiter, postRateLimiter, diagnosticsLimiter, adminRepairLimiter } from "./rateLimiter";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many invite attempts. Please wait 15 minutes and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});

const diagnosticsReportSchema = z.object({
  errorId: z.string().min(1).max(128),
  severity: z.enum(["error", "warning", "info", "critical"]).optional(),
  message: z.string().min(1).max(2000),
  stack: z.string().max(10000).optional().nullable(),
  screen: z.string().max(256).optional().nullable(),
  context: z.record(z.unknown()).optional().nullable(),
  userComment: z.string().max(1000).optional().nullable(),
  platform: z.string().max(32).optional().nullable(),
  appVersion: z.string().max(64).optional().nullable(),
  deviceInfo: z.union([z.string().max(2000), z.record(z.unknown())]).optional().nullable(),
});

function generateShortInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    const randomByte = crypto.randomInt(0, chars.length);
    code += chars[randomByte];
  }
  return code;
}

// File upload configuration
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const COURT_PHOTOS_DIR = path.join(UPLOADS_DIR, "court-photos");
const PROFILE_PHOTOS_DIR = path.join(UPLOADS_DIR, "profile-photos");
const SOCIAL_POSTS_DIR = path.join(UPLOADS_DIR, "social-posts");

// Ensure upload directories exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(COURT_PHOTOS_DIR)) {
  fs.mkdirSync(COURT_PHOTOS_DIR, { recursive: true });
}
if (!fs.existsSync(PROFILE_PHOTOS_DIR)) {
  fs.mkdirSync(PROFILE_PHOTOS_DIR, { recursive: true });
}
if (!fs.existsSync(SOCIAL_POSTS_DIR)) {
  fs.mkdirSync(SOCIAL_POSTS_DIR, { recursive: true });
}

const courtPhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, COURT_PHOTOS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `court-${uniqueSuffix}${ext}`);
  },
});

const courtPhotoUpload = multer({
  storage: courtPhotoStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only JPEG, PNG, WebP, and HEIC images are allowed.",
        ),
      );
    }
  },
});

// Profile photo upload configuration
const profilePhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, PROFILE_PHOTOS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `profile-${uniqueSuffix}${ext}`);
  },
});

const profilePhotoUpload = multer({
  storage: profilePhotoStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max for profile photos
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only JPEG, PNG, WebP, and HEIC images are allowed.",
        ),
      );
    }
  },
});

// Social post photo upload configuration
const socialPostStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, SOCIAL_POSTS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `post-${uniqueSuffix}${ext}`);
  },
});

const socialPostUpload = multer({
  storage: socialPostStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max (for videos)
  },
  fileFilter: (_req, file, cb) => {
    const allowedImageTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "image/gif",
    ];
    const allowedVideoTypes = [
      "video/mp4",
      "video/quicktime",
      "video/mov",
      "video/mpeg",
      "video/x-m4v",
      "video/3gpp",
      "video/webm",
    ];
    if (
      allowedImageTypes.includes(file.mimetype) ||
      allowedVideoTypes.includes(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only images (JPEG, PNG, WebP, HEIC, GIF) and videos (MP4, MOV, WebM) are allowed.",
        ),
      );
    }
  },
});

// Pagination helper
function parsePagination(query: {
  limit?: string;
  offset?: string;
  page?: string;
}) {
  const limit = Math.min(parseInt(query.limit as string) || 50, 100); // Max 100 items
  const page = parseInt(query.page as string) || 1;
  const offset = query.offset
    ? parseInt(query.offset as string)
    : (page - 1) * limit;
  return { limit, offset };
}

// Birthday check helper - returns true if today matches the player birth date (month and day)
function isBirthdayToday(dateOfBirth: string | Date | null): boolean {
  if (!dateOfBirth) return false;
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  return (
    birthDate.getMonth() === today.getMonth() &&
    birthDate.getDate() === today.getDate()
  );
}

// Helper to convert UTC to Dubai timezone (UTC+4)
function toDubaiTime(utcDate: Date): Date {
  const dubaiOffset = 4 * 60; // minutes
  const utcTime = utcDate.getTime();
  return new Date(utcTime + dubaiOffset * 60 * 1000);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize storage for fresh user data fetching in auth middleware
  setFreshUserStorage(storage);

  // Initialize feature unlock checker for server-side feature authorization
  setFeatureUnlockChecker({
    isFeatureUnlocked: async (
      playerId: string,
      featureKey: string,
    ): Promise<boolean> => {
      try {
        // Get player's current level
        const [player] = await db
          .select({ level: players.level })
          .from(players)
          .where(eq(players.id, playerId));
        if (!player) return false;

        const playerLevel = player.level || 1;

        // Get feature unlock requirement
        const { playerFeatureUnlocks } = await import("@shared/schema");
        const [feature] = await db
          .select()
          .from(playerFeatureUnlocks)
          .where(eq(playerFeatureUnlocks.featureKey, featureKey));

        // If feature not configured, allow access (fail open)
        if (!feature) return true;

        // If feature is inactive, allow access
        if (!feature.isActive) return true;

        // Check if player level meets requirement
        return playerLevel >= feature.requiredLevel;
      } catch (error) {
        console.error("[FeatureUnlockChecker] Error:", error);
        return true; // Fail open on error
      }
    },
  });

  // Register shop routes
  app.use("/api", shopRoutes);

  // Register marketplace routes
  app.use("/api", marketplaceRoutes);

  // Register equipment rental routes
  app.use("/api", equipmentRoutes);

  // Register Glow Leveling OS routes
  app.use(glowLevelingRoutes);
  app.use("/api/adult-glow", adultGlowRankRoutes);

  // Match Challenges must be BEFORE matchLogsRoutes (which has /api/matches/:matchId that would catch "challenge" as a matchId)
  app.use("/api/matches/challenge", matchChallengeRoutes);

  // Session Plans, Match Logs, Evidence, Level-Up Events
  app.use(sessionPlansRoutes);
  app.use(matchLogsRoutes);
  app.use(skillEvidenceRoutes);
  app.use(levelUpEventsRoutes);
  app.use("/api/coach/calibration", coachCalibrationRoutes);
  app.use(parentDashboardRoutes);
  app.use(monthlyReportsRoutes);
  app.use("/api/lesson-groups", lessonGroupsRoutes);
  app.use("/api/match-intelligence", matchIntelligenceRoutes);
  app.use("/api/players", playerMatchReadinessRoutes);
  app.use("/api/player-level", playerLevelRoutes);
  app.use(roleMessagesRoutes);
  app.use(socialFeaturesRoutes);
  app.use(playerChatRoutes);
  app.use(videoFeedbackRoutes);
  app.use(coachEarningsRoutes);
  app.use(playerBookingRoutes);
  app.use(playerSocialRoutes);
  app.use(tournamentsLaddersRouter);
  app.use(discoveryMapRouter);
  app.use(worldChatRouter);
  app.use(chatRoomsRouter);
  app.use(adminSeriesRouter);

  // Register extracted route modules
  app.use(authRoutesRouter);
  app.use(academyPublicRouter);
  app.use(coachCalendarRouter);
  app.use(playerAuthRouter);
  app.use(adminSetupRouter);
  app.use(playerCreditsRouter);
  app.use(creditsV2Router);
  app.use(playerProgressRouter);
  app.use(coachingSeriesRouter);
  app.use(coachManagementRouter);
  app.use(coachAnalyticsRouter);
  app.use(academySettingsRouter);
  app.use(platformOwnerRouter);
  app.use(playerSessionsRouter);
  app.use(corporateAccountsRouter);
  app.use("/api/play-partner", playPartnerRouter);
  app.use("/api/live-scoring", liveScoringRouter);
  app.use(coachLocationRouter);
  app.use(aiUsageAdminRouter);
  app.use(subscriptionsRouter);
  app.use(aiProRouter);
  app.use(drillsRouter);
  app.use(coachHomeRouter);
  app.use("/api/quiz", quizRouter);

  // ==================== USER ONBOARDING STATE ====================

  app.get(
    "/api/user/onboarding-state",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const key = `user_onboarding_${userId}`;
        const existing = await db
          .select()
          .from(platformConfig)
          .where(eq(platformConfig.key, key))
          .limit(1);
        const state =
          existing.length > 0 ? (existing[0].value as Record<string, any>) : {};
        res.json({ state });
      } catch (error) {
        console.error("[OnboardingState] GET error:", error);
        res.status(500).json({ error: "Failed to fetch onboarding state" });
      }
    },
  );

  app.post(
    "/api/user/onboarding-state",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const onboardingStateSchema = z.object({ key: z.string().min(1).max(128), value: z.unknown() });
        const parsedOnboarding = onboardingStateSchema.safeParse(req.body);
        if (!parsedOnboarding.success) return res.status(400).json({ error: fromZodError(parsedOnboarding.error).message });
        const { key: bodyKey, value: bodyValue } = parsedOnboarding.data;
        const configKey = `user_onboarding_${userId}`;
        const existing = await db
          .select()
          .from(platformConfig)
          .where(eq(platformConfig.key, configKey))
          .limit(1);
        const currentState =
          existing.length > 0 ? (existing[0].value as Record<string, any>) : {};
        const updatedState = { ...currentState, [bodyKey]: bodyValue };
        if (existing.length > 0) {
          await db
            .update(platformConfig)
            .set({ value: updatedState, updatedAt: new Date() })
            .where(eq(platformConfig.key, configKey));
        } else {
          await db
            .insert(platformConfig)
            .values({ key: configKey, value: updatedState, updatedBy: userId });
        }
        res.json({ state: updatedState });
      } catch (error) {
        console.error("[OnboardingState] POST error:", error);
        res.status(500).json({ error: "Failed to update onboarding state" });
      }
    },
  );

  // ==================== HEALTH CHECK ====================

  app.get("/api/health", async (_req: Request, res: Response) => {
    try {
      // Check database connectivity
      const dbHealthy = await storage.checkDatabaseHealth();

      const health = {
        status: dbHealthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbHealthy ? "connected" : "disconnected",
        version: process.env.npm_package_version || "1.0.0",
      };

      res.status(dbHealthy ? 200 : 503).json(health);
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: "error",
        error: "Health check failed",
      });
    }
  });

  // ==================== MAINTENANCE MODE CHECK ====================

  // Monthly Player Report endpoint - sends comprehensive monthly activity report
  app.post(
    "/api/player/:playerId/monthly-report",
    async (req: Request, res: Response) => {
      try {
        // Allow internal service calls or authenticated coaches/admins
        const isInternalService =
          req.headers["x-internal-service"] === "monthly-report-scheduler";
        const authHeader = req.headers.authorization;

        if (!isInternalService && !authHeader) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const { playerId } = req.params;
        const { month, year } = req.body; // Optional: defaults to previous month
        // Calculate the month to report on
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const reportYear =
          year ||
          (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
        const reportMonth =
          month !== undefined
            ? month
            : now.getMonth() === 0
              ? 11
              : now.getMonth() - 1;

        const startDate = new Date(reportYear, reportMonth, 1);
        const endDate = new Date(reportYear, reportMonth + 1, 0, 23, 59, 59);

        const monthName = startDate.toLocaleString("en-US", {
          month: "long",
          year: "numeric",
        });

        // Get player info
        const [player] = await db
          .select()
          .from(players)
          .where(eq(players.id, playerId));
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Get user email
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, player.userId));
        if (!user?.email) {
          return res.status(400).json({ error: "Player has no email address" });
        }

        // Get academy
        const [academy] = player.academyId
          ? await db
              .select()
              .from(academies)
              .where(eq(academies.id, player.academyId))
          : [null];

        // Get session attendance for the month
        const sessionAttendance = await db
          .select({
            sessionId: sessionPlayers.sessionId,
            attendanceStatus: sessionPlayers.attendanceStatus,
            sessionType: sessions.sessionType,
            coachId: sessions.coachId,
            startTime: sessions.startTime,
          })
          .from(sessionPlayers)
          .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
          .where(
            and(
              eq(sessionPlayers.playerId, playerId),
              gte(sessions.startTime, startDate),
              lte(sessions.startTime, endDate),
            ),
          );

        // Calculate lesson stats
        const lessonsTotal = sessionAttendance.length;
        const lessonsAttended = sessionAttendance.filter(
          (s) => s.attendanceStatus === "Present",
        ).length;
        const lessonsLate = sessionAttendance.filter(
          (s) => s.attendanceStatus === "Late",
        ).length;
        const lessonsAbsent = sessionAttendance.filter(
          (s) => s.attendanceStatus === "Absent",
        ).length;
        const lessonsHoliday = sessionAttendance.filter(
          (s) => s.attendanceStatus === "Holiday",
        ).length;

        // Group by session type
        const typeCountMap: Record<string, number> = {};
        sessionAttendance.forEach((s) => {
          const type = s.sessionType || "Other";
          typeCountMap[type] = (typeCountMap[type] || 0) + 1;
        });
        const lessonsByType = Object.entries(typeCountMap).map(
          ([type, count]) => ({
            type:
              type.charAt(0).toUpperCase() + type.slice(1).replace("_", " "),
            count,
          }),
        );

        // Get unique coaches
        const coachIds = [
          ...new Set(sessionAttendance.map((s) => s.coachId).filter(Boolean)),
        ];
        const coachesData =
          coachIds.length > 0
            ? await db
                .select({ id: coaches.id, displayName: coaches.displayName })
                .from(coaches)
                .where(inArray(coaches.id, coachIds as string[]))
            : [];
        const coachNames = coachesData.map((c) => c.displayName || "Coach");

        // Get court bookings
        const courtBookingsData = await db
          .select({
            id: courtBookings.id,
            durationMinutes: courtBookings.durationMinutes,
          })
          .from(courtBookings)
          .where(
            and(
              eq(courtBookings.playerId, playerId),
              gte(courtBookings.date, startDate.toISOString().split("T")[0]),
              lte(courtBookings.date, endDate.toISOString().split("T")[0]),
            ),
          );

        const courtsBooked = courtBookingsData.length;
        const courtHours = Math.round(
          courtBookingsData.reduce(
            (sum, b) => sum + (b.durationMinutes || 0),
            0,
          ) / 60,
        );

        // Get matches
        const matchesData = await db
          .select({
            id: matchLogs.id,
            didWin: matchLogs.didWin,
          })
          .from(matchLogs)
          .where(
            and(
              eq(matchLogs.playerId, playerId),
              gte(matchLogs.createdAt, startDate),
              lte(matchLogs.createdAt, endDate),
            ),
          );

        const matchesPlayed = matchesData.length;
        const matchesWon = matchesData.filter((m) => m.didWin).length;
        const matchesLost = matchesPlayed - matchesWon;

        // Get XP earned this month
        const xpData = await db
          .select({ xpAmount: xpTransactions.xpAmount })
          .from(xpTransactions)
          .where(
            and(
              eq(xpTransactions.playerId, playerId),
              gte(xpTransactions.createdAt, startDate),
              lte(xpTransactions.createdAt, endDate),
            ),
          );

        const xpEarned = xpData.reduce((sum, x) => sum + (x.xpAmount || 0), 0);

        // Get current level and XP (from player record or calculate)
        const currentLevel = player.level || 1;
        const currentXp = player.totalXp || 0;

        // XP requirements per level (simplified)
        const xpPerLevel = [
          0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 3800, 4700, 5700, 6800,
          8000, 9300, 10700, 12200, 13800, 15500, 17300, 20000,
        ];
        const xpForCurrentLevel = xpPerLevel[currentLevel - 1] || 0;
        const xpForNextLevel = xpPerLevel[currentLevel] || 20000;
        const xpProgress = currentXp - xpForCurrentLevel;
        const xpNeeded = xpForNextLevel - xpForCurrentLevel;
        const levelProgress = Math.min(
          100,
          Math.round((xpProgress / xpNeeded) * 100),
        );
        const xpToNextLevel = xpForNextLevel - currentXp;

        // Task #681 Phase 3 — read monthly credit usage from V2 ledger.
        // `consume` rows always have negative `delta`; `occurredAt` is the
        // canonical timestamp on credit_ledger_v2.
        const creditUsageRows = await db.execute(sql`
          SELECT
            COALESCE(SUM(ABS(delta::numeric)), 0)::numeric AS used_total,
            type,
            COALESCE(SUM(ABS(delta::numeric)), 0)::numeric AS used_by_type
          FROM credit_ledger_v2
          WHERE player_id = ${playerId}
            AND reason = 'consume'
            AND occurred_at >= ${startDate.toISOString()}
            AND occurred_at <= ${endDate.toISOString()}
          GROUP BY type
        `);
        let creditsUsed = 0;
        const usedByType: Record<string, number> = {};
        type UsageRow = { type: string; used_by_type: string | number | null };
        for (const row of creditUsageRows.rows as UsageRow[]) {
          const n = Number(row.used_by_type ?? 0) || 0;
          creditsUsed += n;
          usedByType[row.type] = (usedByType[row.type] || 0) + n;
        }

        // Task #681 Phase 3 — current per-type remaining from V2 signed
        // balance. `player_credit_balance.credits` is the running net (can be
        // negative). Clamp to >= 0 for the user-facing "remaining" pill.
        type V2BalanceRow = { type: string; credits: string | number };
        const v2BalanceRes = await db.execute(sql`
          SELECT type, credits
          FROM player_credit_balance
          WHERE player_id = ${playerId}
        `);
        const remainingByType: Record<string, number> = {};
        let creditsRemaining = 0;
        for (const r of v2BalanceRes.rows as V2BalanceRow[]) {
          const n = Math.max(0, Number(r.credits) || 0);
          remainingByType[r.type] = (remainingByType[r.type] || 0) + n;
          creditsRemaining += n;
        }

        // Group credits by type
        const creditsByTypeMap: Record<
          string,
          { used: number; remaining: number }
        > = {};
        for (const [type, used] of Object.entries(usedByType)) {
          if (!creditsByTypeMap[type]) {
            creditsByTypeMap[type] = { used: 0, remaining: 0 };
          }
          creditsByTypeMap[type].used += used;
        }
        for (const [type, remaining] of Object.entries(remainingByType)) {
          if (!creditsByTypeMap[type]) {
            creditsByTypeMap[type] = { used: 0, remaining: 0 };
          }
          creditsByTypeMap[type].remaining += remaining;
        }

        const creditsByType = Object.entries(creditsByTypeMap).map(
          ([type, data]) => ({
            type:
              type.charAt(0).toUpperCase() + type.slice(1).replace("_", " "),
            used: data.used,
            remaining: data.remaining,
          }),
        );

        // Get glow level
        const [ballLevel] = await db
          .select({ ballLevel: playerBallLevels.ballLevel })
          .from(playerBallLevels)
          .where(eq(playerBallLevels.playerId, playerId))
          .limit(1);

        const glowLevel = ballLevel?.ballLevel
          ? ballLevel.ballLevel.charAt(0).toUpperCase() +
            ballLevel.ballLevel.slice(1)
          : undefined;

        // Send the report
        const { sendMonthlyReportEmail } = await import("./emailService");
        const result = await sendMonthlyReportEmail({
          playerName: player.displayName || "Player",
          playerEmail: user.email,
          month: monthName,
          academyName: academy?.name || "Glow Up Sports",

          lessonsTotal,
          lessonsAttended,
          lessonsAbsent,
          lessonsLate,
          lessonsHoliday,
          lessonsByType,
          coachNames,

          courtsBooked,
          courtHours,

          matchesPlayed,
          matchesWon,
          matchesLost,

          xpEarned,
          currentLevel,
          currentXp,
          xpToNextLevel,
          levelProgress,

          creditsUsed,
          creditsRemaining,
          creditsByType,

          glowLevel,
        });

        if (result.success) {
          console.log(`[MonthlyReport] Sent ${monthName} report`);
          res.json({
            success: true,
            message: `Monthly report sent to ${user.email}`,
            month: monthName,
          });
        } else {
          res.status(500).json({ success: false, error: result.error });
        }
      } catch (error: any) {
        console.error("[MonthlyReport] Error:", error);
        res
          .status(500)
          .json({ error: "Failed to send monthly report" });
      }
    },
  );
  // Check maintenance status endpoint (for clients to check before proceeding)
  app.get("/api/maintenance/status", async (_req: Request, res: Response) => {
    try {
      const isMaintenanceMode = await storage.isMaintenanceMode();
      res.json({
        maintenance: isMaintenanceMode,
        message: isMaintenanceMode
          ? "Platform is under maintenance. Please try again later."
          : null,
      });
    } catch (error) {
      res.json({ maintenance: false, message: null });
    }
  });

  // NOTE: Maintenance mode is now enforced in authMiddlewareWithFreshData (server/auth.ts)
  // This ensures:
  // 1. Public endpoints (health, maintenance status, login) work during maintenance
  // 2. Platform owners can still access all routes during maintenance
  // 3. All other authenticated users get 503 when maintenance is enabled

  // ==================== DIAGNOSTICS ENDPOINTS ====================
  // Public endpoint - accepts error reports from any user (authenticated or not)
  app.post("/api/diagnostics/report", diagnosticsLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = diagnosticsReportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const {
        errorId,
        severity,
        message,
        stack,
        screen,
        context,
        userComment,
        platform,
        appVersion,
        deviceInfo,
      } = parsed.data;

      // Check for duplicate reports (same errorId)
      const existing = await storage.getDiagnosticReportByErrorId(errorId);
      if (existing) {
        return res.json({ success: true, duplicate: true, id: existing.id });
      }

      // Extract user context from auth header if present
      let userId: string | undefined;
      let academyId: string | undefined;
      let userRole: string | undefined;

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.substring(7);
          const jwt = require("jsonwebtoken");
          const decoded = jwt.verify(
            token,
            JWT_SECRET,
          ) as any;
          userId = decoded.userId;
          academyId = decoded.academyId;
          userRole = decoded.role;
        } catch (e) {
          // Token invalid, proceed without user context
        }
      }

      const report = await storage.createDiagnosticReport({
        errorId,
        userId: userId || null,
        academyId: academyId || null,
        userRole: userRole || context?.userRole || null,
        severity: severity || "error",
        message,
        stack: stack || null,
        screen: screen || context?.screen || null,
        context: context || null,
        userComment: userComment || null,
        platform: platform || context?.platform || null,
        appVersion: appVersion || context?.appVersion || null,
        deviceInfo:
          (typeof deviceInfo === "string"
            ? deviceInfo
            : deviceInfo
              ? JSON.stringify(deviceInfo)
              : null) ||
          (typeof context?.deviceInfo === "string"
            ? context.deviceInfo
            : context?.deviceInfo
              ? JSON.stringify(context.deviceInfo)
              : null),
      });

      console.log(
        `[Diagnostics] New error report: ${report.id} - ${message.slice(0, 50)}...`,
      );

      res.json({ success: true, id: report.id });
    } catch (error) {
      console.error("Error creating diagnostic report:", error);
      res.status(500).json({ error: "Failed to submit report" });
    }
  });

  const diagnosticsUiIssueSchema = z.object({
    severity: z.string().max(32).optional(),
    message: z.string().min(1).max(2000),
    screen: z.string().max(256).optional().nullable(),
    context: z.record(z.unknown()).optional().nullable(),
    userComment: z.string().max(1000).optional().nullable(),
  });

  // UI Issue Report endpoint - for user-reported UI problems
  app.post(
    "/api/diagnostics/ui-issue",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const parsed = diagnosticsUiIssueSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }
        const { severity, message, screen, context, userComment } = parsed.data;
        const userId = req.user?.id;
        const academyId = req.user?.academyId;
        const userRole = req.user?.role;

        const errorId = `ui_issue_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        const report = await storage.createDiagnosticReport({
          errorId,
          userId: userId || null,
          academyId: academyId || null,
          userRole: userRole || null,
          severity: "ui_issue",
          message: `[UI Issue] ${message}`,
          stack: null,
          screen: screen || null,
          context: {
            ...context,
            type: "ui_issue",
            reportedBy: userId,
          },
          userComment: userComment || null,
          platform: context?.platform || null,
          appVersion: context?.appVersion || "1.0.0",
          deviceInfo:
            typeof context?.deviceInfo === "string"
              ? context.deviceInfo
              : context?.deviceInfo
                ? JSON.stringify(context.deviceInfo)
                : null,
        });

        console.log(
          `[Diagnostics] UI Issue report: ${report.id} from user ${userId} - ${message.slice(0, 50)}...`,
        );

        res.json({ success: true, id: report.id });
      } catch (error) {
        console.error("Error creating UI issue report:", error);
        res.status(500).json({ error: "Failed to submit report" });
      }
    },
  );

  // Platform Owner: Get all diagnostic reports
  app.get(
    "/api/platform/diagnostics",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { academyId, status, severity, userRole, limit } = req.query;

        const reports = await storage.getDiagnosticReports({
          academyId: academyId as string | undefined,
          status: status as string | undefined,
          severity: severity as string | undefined,
          userRole: userRole as string | undefined,
          limit: limit ? parseInt(limit as string) : 100,
        });

        const stats = await storage.getDiagnosticReportStats();

        res.json({ reports, stats });
      } catch (error) {
        console.error("Error fetching diagnostic reports:", error);
        res.status(500).json({ error: "Failed to fetch reports" });
      }
    },
  );

  // Platform Owner: Get single diagnostic report
  app.get(
    "/api/platform/diagnostics/:id",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const report = await storage.getDiagnosticReportById(req.params.id);
        if (!report) {
          return res.status(404).json({ error: "Report not found" });
        }
        res.json(report);
      } catch (error) {
        console.error("Error fetching diagnostic report:", error);
        res.status(500).json({ error: "Failed to fetch report" });
      }
    },
  );

  // Platform Owner: Update diagnostic report status
  app.put(
    "/api/platform/diagnostics/:id",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { status, resolutionNotes } = req.body;

        if (status === "resolved") {
          const report = await storage.resolveDiagnosticReport(
            req.params.id,
            req.user!.id,
            resolutionNotes,
          );
          if (!report) {
            return res.status(404).json({ error: "Report not found" });
          }
          res.json(report);
        } else {
          const report = await storage.updateDiagnosticReport(req.params.id, {
            status,
          });
          if (!report) {
            return res.status(404).json({ error: "Report not found" });
          }
          res.json(report);
        }
      } catch (error) {
        console.error("Error updating diagnostic report:", error);
        res.status(500).json({ error: "Failed to update report" });
      }
    },
  );

  // Academy Owner: Get diagnostic reports for their academy
  app.get(
    "/api/owner/diagnostics",
    authMiddleware,
    requireRole("academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        if (!academyId && req.user!.role !== "platform_owner") {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const { status, severity, limit } = req.query;

        const reports = await storage.getDiagnosticReports({
          academyId: academyId || undefined,
          status: status as string | undefined,
          severity: severity as string | undefined,
          limit: limit ? parseInt(limit as string) : 50,
        });

        res.json({ reports });
      } catch (error) {
        console.error("Error fetching academy diagnostic reports:", error);
        res.status(500).json({ error: "Failed to fetch reports" });
      }
    },
  );


  // Google Maps Travel Time proxy (Directions API) - server-side key only
  app.get("/api/maps/travel-time", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { originLat, originLng, destLat, destLng } = req.query;
      if (!originLat || !originLng || !destLat || !destLng) {
        return res.status(400).json({ error: "originLat, originLng, destLat, destLng are required" });
      }
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "Maps service not configured" });
      }
      const origin = `${originLat},${originLng}`;
      const destination = `${destLat},${destLng}`;
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&departure_time=now&key=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(502).json({ error: "Upstream maps error" });
      }
      const data = await response.json() as any;
      if (data.status !== "OK" || !data.routes?.length) {
        return res.json({ durationText: null, durationSeconds: null });
      }
      const leg = data.routes[0]?.legs?.[0];
      const durationInTraffic = leg?.duration_in_traffic || leg?.duration;
      res.json({
        durationText: durationInTraffic?.text || null,
        durationSeconds: durationInTraffic?.value || null,
        durationMinutes: durationInTraffic?.value ? Math.round(durationInTraffic.value / 60) : null,
      });
    } catch (error) {
      console.error("Travel time error:", error);
      res.status(500).json({ error: "Failed to fetch travel time" });
    }
  });

  // Google Maps Distance Matrix proxy - server-side key only
  app.get("/api/maps/distance-matrix", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { originLat, originLng, destinations } = req.query;
      if (!originLat || !originLng || !destinations) {
        return res.status(400).json({ error: "originLat, originLng, destinations are required" });
      }
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "Maps service not configured" });
      }
      const origin = `${originLat},${originLng}`;
      let destArray: Array<{ lat: number; lng: number; id?: string }> = [];
      try {
        destArray = JSON.parse(destinations as string);
      } catch {
        return res.status(400).json({ error: "destinations must be a JSON array of {lat, lng, id?}" });
      }
      if (!Array.isArray(destArray) || destArray.length === 0) {
        return res.json({ results: [] });
      }
      const destinationStr = destArray.map(d => `${d.lat},${d.lng}`).join("|");
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destinationStr)}&mode=driving&departure_time=now&key=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(502).json({ error: "Upstream maps error" });
      }
      const data = await response.json() as any;
      const elements = data.rows?.[0]?.elements || [];
      const results = destArray.map((dest, i) => {
        const el = elements[i];
        const duration = el?.duration_in_traffic || el?.duration;
        return {
          id: dest.id || i,
          lat: dest.lat,
          lng: dest.lng,
          durationText: duration?.text || null,
          durationSeconds: duration?.value || null,
          durationMinutes: duration?.value ? Math.round(duration.value / 60) : null,
          status: el?.status || "UNKNOWN",
        };
      });
      res.json({ results });
    } catch (error) {
      console.error("Distance matrix error:", error);
      res.status(500).json({ error: "Failed to fetch distance matrix" });
    }
  });

  // Google Maps Places Autocomplete proxy (server-side key, never exposed to client)
  app.get("/api/maps/places-autocomplete", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const role = req.user?.role;
    if (role !== "academy_owner" && role !== "platform_owner" && role !== "coach" && role !== "assistant" && role !== "player") {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const input = req.query.input as string;
      const mode = req.query.mode as string | undefined;
      const countryParam = req.query.country as string | undefined;
      if (!input || input.trim().length < 2) {
        return res.json({ predictions: [] });
      }
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "Maps service not configured" });
      }
      const COUNTRY_ISO: Record<string, string> = {
        "United Arab Emirates": "ae", "Indonesia": "id", "Netherlands": "nl",
        "United Kingdom": "gb", "United States": "us", "Saudi Arabia": "sa",
        "Qatar": "qa", "Bahrain": "bh", "Kuwait": "kw", "Oman": "om",
        "Egypt": "eg", "Australia": "au", "Singapore": "sg", "Malaysia": "my",
        "Germany": "de", "France": "fr", "Spain": "es", "Italy": "it",
        "Belgium": "be", "Switzerland": "ch", "Sweden": "se", "Norway": "no",
        "Denmark": "dk", "Poland": "pl", "India": "in", "Pakistan": "pk",
        "South Africa": "za", "Kenya": "ke", "Nigeria": "ng",
        "Brazil": "br", "Argentina": "ar", "Mexico": "mx",
        "Canada": "ca", "New Zealand": "nz",
      };
      const TIMEZONE_ISO: Record<string, string> = {
        "Asia/Dubai": "ae", "Asia/Muscat": "om",
        "Asia/Jakarta": "id", "Asia/Makassar": "id", "Asia/Jayapura": "id",
        "Asia/Riyadh": "sa", "Asia/Qatar": "qa", "Asia/Bahrain": "bh", "Asia/Kuwait": "kw",
        "Asia/Karachi": "pk", "Asia/Kolkata": "in",
        "Asia/Singapore": "sg", "Asia/Kuala_Lumpur": "my",
        "Australia/Sydney": "au", "Australia/Melbourne": "au", "Australia/Perth": "au",
        "Europe/Amsterdam": "nl", "Europe/London": "gb", "Europe/Berlin": "de",
        "Europe/Paris": "fr", "Europe/Madrid": "es", "Europe/Rome": "it",
        "Europe/Brussels": "be", "Europe/Zurich": "ch", "Europe/Stockholm": "se",
        "Europe/Oslo": "no", "Europe/Copenhagen": "dk", "Europe/Warsaw": "pl",
        "Africa/Cairo": "eg", "Africa/Johannesburg": "za", "Africa/Nairobi": "ke", "Africa/Lagos": "ng",
        "America/Sao_Paulo": "br", "America/Argentina/Buenos_Aires": "ar", "America/Mexico_City": "mx",
        "America/Toronto": "ca", "America/Vancouver": "ca",
        "Pacific/Auckland": "nz",
        "America/New_York": "us", "America/Los_Angeles": "us", "America/Chicago": "us",
      };
      let isoCode = countryParam ? COUNTRY_ISO[countryParam] : undefined;
      if (!isoCode) {
        const academyId = req.user?.academyId;
        if (academyId) {
          const [academy] = await db
            .select({ country: academies.country, timezone: academies.timezone })
            .from(academies)
            .where(eq(academies.id, academyId))
            .limit(1);
          if (academy?.country) {
            isoCode = COUNTRY_ISO[academy.country];
          }
          if (!isoCode && academy?.timezone) {
            isoCode = TIMEZONE_ISO[academy.timezone];
          }
        }
      }
      const COUNTRY_COORDS: Record<string, { lat: number; lng: number; radius: number }> = {
        ae: { lat: 25.0, lng: 55.0, radius: 500000 },
        id: { lat: -2.5, lng: 118.0, radius: 2500000 },
        sa: { lat: 24.0, lng: 45.0, radius: 1200000 },
        qa: { lat: 25.3, lng: 51.2, radius: 150000 },
        bh: { lat: 26.0, lng: 50.5, radius: 60000 },
        kw: { lat: 29.4, lng: 47.8, radius: 200000 },
        om: { lat: 21.0, lng: 57.0, radius: 600000 },
        eg: { lat: 26.0, lng: 30.0, radius: 1000000 },
        au: { lat: -25.3, lng: 133.8, radius: 3000000 },
        sg: { lat: 1.35, lng: 103.82, radius: 50000 },
        my: { lat: 4.2, lng: 108.0, radius: 800000 },
        nl: { lat: 52.1, lng: 5.3, radius: 250000 },
        gb: { lat: 55.4, lng: -3.4, radius: 700000 },
        us: { lat: 37.1, lng: -95.7, radius: 3500000 },
        ca: { lat: 56.1, lng: -106.3, radius: 3500000 },
        de: { lat: 51.2, lng: 10.5, radius: 600000 },
        fr: { lat: 46.2, lng: 2.2, radius: 600000 },
        es: { lat: 40.4, lng: -3.7, radius: 600000 },
        it: { lat: 41.9, lng: 12.5, radius: 600000 },
        be: { lat: 50.5, lng: 4.5, radius: 200000 },
        ch: { lat: 46.8, lng: 8.2, radius: 250000 },
        se: { lat: 62.0, lng: 17.0, radius: 1000000 },
        no: { lat: 62.0, lng: 10.0, radius: 1100000 },
        dk: { lat: 56.3, lng: 9.5, radius: 300000 },
        pl: { lat: 52.0, lng: 19.1, radius: 600000 },
        in: { lat: 20.6, lng: 79.0, radius: 2000000 },
        pk: { lat: 30.3, lng: 69.3, radius: 900000 },
        za: { lat: -29.0, lng: 25.0, radius: 1000000 },
        ke: { lat: 0.0, lng: 37.9, radius: 600000 },
        ng: { lat: 9.1, lng: 8.7, radius: 800000 },
        br: { lat: -14.2, lng: -51.9, radius: 3000000 },
        ar: { lat: -38.4, lng: -63.6, radius: 2000000 },
        mx: { lat: 23.6, lng: -102.6, radius: 1500000 },
        nz: { lat: -40.9, lng: 174.9, radius: 900000 },
        jp: { lat: 36.2, lng: 138.3, radius: 1500000 },
        kr: { lat: 37.0, lng: 127.5, radius: 500000 },
        cn: { lat: 35.0, lng: 105.0, radius: 3000000 },
        th: { lat: 15.0, lng: 101.0, radius: 700000 },
        ph: { lat: 12.9, lng: 122.0, radius: 1000000 },
        tr: { lat: 39.0, lng: 35.0, radius: 900000 },
      };
      const countryFilter = isoCode ? `&components=country:${isoCode}` : "";
      let url: string;
      if (mode === "venue") {
        const coords = isoCode ? COUNTRY_COORDS[isoCode] : undefined;
        const locationBias = coords
          ? `&location=${coords.lat},${coords.lng}&radius=${coords.radius}`
          : "";
        url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${apiKey}&types=establishment&language=en${locationBias}`;
      } else {
        url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${apiKey}&language=en${countryFilter}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(502).json({ error: "Upstream maps error" });
      }
      const data = await response.json() as { predictions: Array<{ place_id: string; description: string; structured_formatting: { main_text: string; secondary_text: string } }> };
      const predictions = (data.predictions || []).map((p) => ({
        placeId: p.place_id,
        description: p.description,
        mainText: p.structured_formatting?.main_text || p.description,
        secondaryText: p.structured_formatting?.secondary_text || "",
      }));
      res.json({ predictions });
    } catch (error) {
      console.error("Places autocomplete error:", error);
      res.status(500).json({ error: "Failed to fetch suggestions" });
    }
  });

  // Nearby courts endpoint — returns platform courts from all academies within 5km
  app.get("/api/play/nearby-courts", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng) {
        return res.status(400).json({ error: "lat and lng are required" });
      }
      const userLat = parseFloat(lat as string);
      const userLng = parseFloat(lng as string);
      if (isNaN(userLat) || isNaN(userLng)) {
        return res.status(400).json({ error: "Invalid lat/lng" });
      }
      const academyId = req.user?.academyId ?? null;
      const RADIUS_KM = 100;

      type NearbyCourt = {
        id: string;
        name: string;
        address: string | null;
        distance: number | null;
        sport: string;
        surface: string;
        isInternal: boolean;
        bookingEnabled: boolean;
        lat: number | null;
        lng: number | null;
        googlePlaceId: string | null;
        academyName: string | null;
      };

      type CourtRow = {
        id: string;
        name: string;
        surface: string | null;
        sport: string | null;
        booking_enabled: boolean | null;
        is_active: boolean | null;
        lat: string | null;
        lng: string | null;
        address: string | null;
        location_name: string | null;
        academy_id: string | null;
        academy_name: string | null;
      };

      const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      // Single query: all active courts with coordinates (100 km radius), plus own-academy courts without coordinates
      const courtRows = await pool.query<CourtRow>(
        `SELECT c.id, c.name, c.surface, c.sport, c.booking_enabled, c.is_active,
                l.lat, l.lng, l.address, l.name as location_name,
                a.id as academy_id, a.name as academy_name
         FROM courts c
         LEFT JOIN locations l ON c.location_id = l.id
         LEFT JOIN academies a ON c.academy_id = a.id
         WHERE c.is_active = true
           AND (
             (l.lat IS NOT NULL AND l.lng IS NOT NULL)
             OR ($1::text IS NOT NULL AND c.academy_id = $1::text)
           )`,
        [academyId]
      );

      const allCourts: NearbyCourt[] = courtRows.rows
        .map((row) => {
          const parsedLat = row.lat != null && row.lat !== "" ? parseFloat(row.lat) : NaN;
          const parsedLng = row.lng != null && row.lng !== "" ? parseFloat(row.lng) : NaN;
          const hasCoords = Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
          const dist = hasCoords ? Math.round(haversineKm(userLat, userLng, parsedLat, parsedLng) * 10) / 10 : null;
          const isOwn = academyId !== null && row.academy_id === academyId;
          return {
            id: row.id,
            name: row.name,
            address: row.address || row.location_name || null,
            distance: dist,
            sport: row.sport || "tennis",
            surface: row.surface || "hard",
            isInternal: isOwn,
            bookingEnabled: isOwn ? row.booking_enabled !== false : false,
            lat: hasCoords ? parsedLat : null,
            lng: hasCoords ? parsedLng : null,
            googlePlaceId: null,
            academyName: isOwn ? null : (row.academy_name || null),
          };
        })
        .filter((c) => c.distance === null || c.distance <= RADIUS_KM)
        .sort((a, b) => (a.distance ?? 999999) - (b.distance ?? 999999));

      res.json(allCourts);
    } catch (error) {
      console.error("Nearby courts error:", error);
      res.status(500).json({ error: "Failed to fetch nearby courts" });
    }
  });

  // Google Maps Geocode by place ID proxy (server-side key, never exposed to client)
  app.get("/api/maps/geocode", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const role = req.user?.role;
    if (role !== "academy_owner" && role !== "platform_owner" && role !== "coach" && role !== "assistant" && role !== "player") {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const placeId = req.query.placeId as string;
      if (!placeId) {
        return res.status(400).json({ error: "placeId is required" });
      }
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "Maps service not configured" });
      }
      const url = `https://maps.googleapis.com/maps/api/geocode/json?place_id=${encodeURIComponent(placeId)}&key=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(502).json({ error: "Upstream geocode error" });
      }
      const data = await response.json() as { results: Array<{ geometry: { location: { lat: number; lng: number } }; formatted_address: string }> };
      if (!data.results || data.results.length === 0) {
        return res.status(404).json({ error: "Location not found" });
      }
      const result = data.results[0];
      res.json({
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formattedAddress: result.formatted_address,
      });
    } catch (error) {
      console.error("Geocode error:", error);
      res.status(500).json({ error: "Failed to geocode location" });
    }
  });

  // ========== GOOGLE MAPS ENRICHMENT ENDPOINTS ==========

  // Rate limiter for public map image proxy endpoints (no auth required, protect against quota drain)
  const mapsProxyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60, // 60 map image requests per minute per IP
    message: { error: "Too many map requests, please slow down" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // In-memory cache for Place Details (24h TTL) — stores photo_reference, not the raw key URL
  const placeDetailsCache = new Map<string, { data: { rating?: number; reviewCount?: number; photoRef?: string }; expiresAt: number }>();

  // Place Details: fetch Google rating + cover photo reference for a venue
  // photoRef is an opaque reference — the actual image is served via /api/maps/place-photo (proxied, no key exposed to client)
  app.get("/api/maps/place-details", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const placeId = req.query.placeId as string;
      if (!placeId) {
        return res.status(400).json({ error: "placeId is required" });
      }
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "Maps service not configured" });
      }
      const cached = placeDetailsCache.get(placeId);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.data);
      }
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,rating,user_ratings_total,photos&key=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(502).json({ error: "Upstream places error" });
      }
      const data = await response.json() as {
        result?: {
          rating?: number;
          user_ratings_total?: number;
          photos?: Array<{ photo_reference: string }>;
        };
      };
      const result = data.result || {};
      const photoRef = result.photos && result.photos.length > 0 ? result.photos[0].photo_reference : undefined;
      const payload = {
        rating: result.rating,
        reviewCount: result.user_ratings_total,
        photoRef,
      };
      placeDetailsCache.set(placeId, { data: payload, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
      res.json(payload);
    } catch (error) {
      console.error("Place details error:", error);
      res.status(500).json({ error: "Failed to fetch place details" });
    }
  });

  // Place Photo proxy: publicly accessible image proxy (no auth headers needed by <Image> components)
  // Security: validates ref param, capped maxwidth, rate-limited by IP
  app.get("/api/maps/place-photo", mapsProxyLimiter, async (req: any, res: Response) => {
    try {
      const ref = req.query.ref as string;
      const maxwidthRaw = parseInt((req.query.maxwidth as string) || "800", 10);
      const maxwidth = Math.min(Math.max(maxwidthRaw || 400, 100), 1600); // clamp 100–1600
      if (!ref) {
        return res.status(400).json({ error: "ref is required" });
      }
      // Validate photo_reference: block obvious injection chars (spaces, quotes, angle brackets, etc.)
      // Google photo references are base64-like but can contain +, /, = chars
      if (/[\s<>"'&;\\]/.test(ref) || ref.length > 2000) {
        return res.status(400).json({ error: "Invalid photo reference" });
      }
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "Maps service not configured" });
      }
      const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxwidth}&photoreference=${encodeURIComponent(ref)}&key=${apiKey}`;
      const response = await fetch(photoUrl);
      if (!response.ok) {
        return res.status(502).json({ error: "Upstream photo error" });
      }
      const contentType = response.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Place photo proxy error:", error);
      res.status(500).json({ error: "Failed to fetch place photo" });
    }
  });

  // Static Map image proxy: returns a map image with a pin at the given lat/lng, rate-limited
  app.get("/api/maps/static-map", mapsProxyLimiter, async (req: any, res: Response) => {
    try {
      const lat = req.query.lat as string;
      const lng = req.query.lng as string;
      const size = (req.query.size as string) || "320x200";
      if (!lat || !lng) {
        return res.status(400).json({ error: "lat and lng are required" });
      }
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "Maps service not configured" });
      }
      const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=${encodeURIComponent(size)}&markers=color:red%7C${lat},${lng}&key=${apiKey}`;
      const response = await fetch(mapUrl);
      if (!response.ok) {
        return res.status(502).json({ error: "Upstream static map error" });
      }
      const contentType = response.headers.get("content-type") || "image/png";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Static map error:", error);
      res.status(500).json({ error: "Failed to fetch static map" });
    }
  });

  // Google Time Zone API proxy (server-side key, IANA timezone detection)
  app.get("/api/maps/timezone", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const role = req.user?.role;
    if (role !== "academy_owner" && role !== "platform_owner" && role !== "coach" && role !== "assistant") {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const lat = req.query.lat as string;
      const lng = req.query.lng as string;
      if (!lat || !lng) {
        return res.status(400).json({ error: "lat and lng are required" });
      }
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "Maps service not configured" });
      }
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `https://maps.googleapis.com/maps/api/timezone/json?location=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&timestamp=${timestamp}&key=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(502).json({ error: "Upstream timezone error" });
      }
      const data = await response.json() as { status: string; timeZoneId?: string; timeZoneName?: string };
      if (data.status !== "OK" || !data.timeZoneId) {
        return res.status(404).json({ error: "Timezone not found for this location" });
      }
      res.json({
        timezone: data.timeZoneId,
        timezoneName: data.timeZoneName || data.timeZoneId,
      });
    } catch (error) {
      console.error("Timezone lookup error:", error);
      res.status(500).json({ error: "Failed to detect timezone" });
    }
  });

  // Reverse geocode: convert lat/lng to address (callable by players)
  // Pass ?detailed=true to get a full street-level formatted address (used by map picker)
  app.get("/api/maps/reverse-geocode", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const lat = req.query.lat as string;
      const lng = req.query.lng as string;
      const detailed = req.query.detailed === "true";
      if (!lat || !lng) {
        return res.status(400).json({ error: "lat and lng are required" });
      }
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "Maps service not configured" });
      }
      // For detailed mode (map picker), omit result_type to get street-level data
      const resultTypeParam = detailed ? "" : "&result_type=locality|country";
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}${resultTypeParam}&key=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(502).json({ error: "Upstream geocode error" });
      }
      const data = await response.json() as {
        results: Array<{
          address_components: Array<{ long_name: string; types: string[] }>;
          formatted_address: string;
        }>;
      };
      if (!data.results || data.results.length === 0) {
        return res.status(404).json({ error: "Location not found" });
      }
      let city: string | undefined;
      let country: string | undefined;
      for (const result of data.results) {
        for (const component of result.address_components) {
          if (!city && (component.types.includes("locality") || component.types.includes("administrative_area_level_1"))) {
            city = component.long_name;
          }
          if (!country && component.types.includes("country")) {
            country = component.long_name;
          }
        }
        if (city && country) break;
      }
      res.json({ city, country, formattedAddress: data.results[0].formatted_address });
    } catch (error) {
      console.error("Reverse geocode error:", error);
      res.status(500).json({ error: "Failed to reverse geocode" });
    }
  });

  const httpServer = createServer(app);

  // Set up WebSocket server for real-time chat
  setupWebSocket(httpServer);
  console.log("WebSocket server initialized on /ws");

  return httpServer;
}
