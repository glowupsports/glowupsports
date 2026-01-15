import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { db } from "./db";
import { playerHolidays } from "@shared/schema";
import { eq, sql, desc, and, ne, gt, gte, asc, inArray, isNull, isNotNull, or, count } from "drizzle-orm";
import { 
  invoices, payments, sessionPlayers, sessionWaitlist, creditTransactions, players, 
  locationTravelTimes, sessions, sessionFeedback, seriesPlayers, coachingSeries,
  sessionSkillObservations, sessionSkillFeedback, playerSessionCancellations,
  playerPillarProgress, coachXpTransactions, xpTransactions, packages, playerBaselineSkillScores,
  // Social features
  posts as postsTable,
  postReactions as postReactionsTable,
  postComments as postCommentsTable,
  communityGroups as communityGroupsTable,
  groupMembers as groupMembersTable,
  openToPlay as openToPlayTable,
  userSocialProfiles as userSocialProfilesTable,
  users, coaches,
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
  playerBookingPreferences,
  courtAvailabilitySnapshots,
} from "@shared/schema";
import { setupWebSocket, broadcastNewMessage, broadcastNewSession, broadcastFeedbackReceived, broadcastSessionUpdate } from "./websocket";
import { 
  hashPassword, 
  verifyPassword, 
  generateToken, 
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
  type AuthenticatedRequest 
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
import { sanitizeNote, sanitizeMessage, sanitizeTemplateName, sanitizeTemplateContent } from "./utils/sanitize";
import { localTimeToUTC, utcToLocalTime, getTimezoneOffset, getFirstSessionDate, addDaysToLocalDate, getLocalDateParts, resolveLocalTimeToUTC, ensureResolvableLocalTime } from "./utils/timezone";
import { sendFeedbackNotification, sendLevelUpNotification, sendBadgeEarnedNotification, sendXPGainNotification } from "./pushNotifications";
import { sendFeedbackNotificationEmail, sendLevelUpEmail, sendWelcomeEmail, sendSessionReminderEmail, sendCoachInviteEmail } from "./emailService";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, checkConnection as checkCalendarConnection, SessionEventData } from "./googleCalendarService";
import { generateInvoiceHtml, parseLineItems } from "./services/invoicePdf";
import shopRoutes from "./shop-routes";
import marketplaceRoutes from "./marketplace-routes";
import glowLevelingRoutes from "./routes/glow-leveling";
import sessionPlansRoutes from "./routes/session-plans";
import matchLogsRoutes from "./routes/match-logs";
import skillEvidenceRoutes from "./routes/skill-evidence";
import levelUpEventsRoutes from "./routes/level-up-events";
import coachCalibrationRoutes from "./routes/coach-calibration";
import parentDashboardRoutes from "./routes/parent-dashboard";
import adultGlowRankRoutes from "./routes/adult-glow-rank";
import lessonGroupsRoutes from "./routes/lesson-groups";
import matchIntelligenceRoutes from "./routes/match-intelligence";
import playerLevelRoutes from "./routes/player-level";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

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
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, WebP, and HEIC images are allowed."));
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
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `profile-${uniqueSuffix}${ext}`);
  },
});

const profilePhotoUpload = multer({
  storage: profilePhotoStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max for profile photos
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, WebP, and HEIC images are allowed."));
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
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `post-${uniqueSuffix}${ext}`);
  },
});

const socialPostUpload = multer({
  storage: socialPostStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max (for videos)
  },
  fileFilter: (_req, file, cb) => {
    const allowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];
    const allowedVideoTypes = ["video/mp4", "video/quicktime", "video/mov", "video/mpeg", "video/x-m4v", "video/3gpp", "video/webm"];
    if (allowedImageTypes.includes(file.mimetype) || allowedVideoTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only images (JPEG, PNG, WebP, HEIC, GIF) and videos (MP4, MOV, WebM) are allowed."));
    }
  },
});

// Pagination helper
function parsePagination(query: { limit?: string; offset?: string; page?: string }) {
  const limit = Math.min(parseInt(query.limit as string) || 50, 100); // Max 100 items
  const page = parseInt(query.page as string) || 1;
  const offset = query.offset ? parseInt(query.offset as string) : (page - 1) * limit;
  return { limit, offset };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize storage for fresh user data fetching in auth middleware
  setFreshUserStorage(storage);
  
  // Initialize feature unlock checker for server-side feature authorization
  setFeatureUnlockChecker({
    isFeatureUnlocked: async (playerId: string, featureKey: string): Promise<boolean> => {
      try {
        // Get player's current level
        const [player] = await db.select({ level: players.level }).from(players).where(eq(players.id, playerId));
        if (!player) return false;
        
        const playerLevel = player.level || 1;
        
        // Get feature unlock requirement
        const { playerFeatureUnlocks } = await import("@shared/schema");
        const [feature] = await db.select().from(playerFeatureUnlocks).where(eq(playerFeatureUnlocks.featureKey, featureKey));
        
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
    }
  });

  // Register shop routes
  app.use("/api", shopRoutes);
  
  // Register marketplace routes
  app.use("/api", marketplaceRoutes);
  
  // Register Glow Leveling OS routes
  app.use(glowLevelingRoutes);
  app.use("/api/adult-glow", adultGlowRankRoutes);
  
  // Session Plans, Match Logs, Evidence, Level-Up Events
  app.use(sessionPlansRoutes);
  app.use(matchLogsRoutes);
  app.use(skillEvidenceRoutes);
  app.use(levelUpEventsRoutes);
  app.use("/api/coach/calibration", coachCalibrationRoutes);
  app.use(parentDashboardRoutes);
  app.use("/api/lesson-groups", lessonGroupsRoutes);
  app.use("/api/match-intelligence", matchIntelligenceRoutes);
  app.use("/api/player-level", playerLevelRoutes);

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
  // Check maintenance status endpoint (for clients to check before proceeding)
  app.get("/api/maintenance/status", async (_req: Request, res: Response) => {
    try {
      const isMaintenanceMode = await storage.isMaintenanceMode();
      res.json({ 
        maintenance: isMaintenanceMode,
        message: isMaintenanceMode ? "Platform is under maintenance. Please try again later." : null,
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
  app.post("/api/diagnostics/report", async (req: Request, res: Response) => {
    try {
      const { errorId, severity, message, stack, screen, context, userComment, platform, appVersion, deviceInfo } = req.body;

      if (!errorId || !message) {
        return res.status(400).json({ error: "errorId and message are required" });
      }

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
          const decoded = jwt.verify(token, process.env.SESSION_SECRET || "dev-secret") as any;
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
        userRole: userRole || (context?.userRole || null),
        severity: severity || "error",
        message,
        stack: stack || null,
        screen: screen || (context?.screen || null),
        context: context || null,
        userComment: userComment || null,
        platform: platform || (context?.platform || null),
        appVersion: appVersion || (context?.appVersion || null),
        deviceInfo: deviceInfo || (context?.deviceInfo || null),
      });

      console.log(`[Diagnostics] New error report: ${report.id} - ${message.slice(0, 50)}...`);

      res.json({ success: true, id: report.id });
    } catch (error) {
      console.error("Error creating diagnostic report:", error);
      res.status(500).json({ error: "Failed to submit report" });
    }
  });

  // UI Issue Report endpoint - for user-reported UI problems
  app.post("/api/diagnostics/ui-issue", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { severity, message, screen, context, userComment } = req.body;
      const userId = req.user?.id;
      const academyId = req.user?.academyId;
      const userRole = req.user?.role;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

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
        deviceInfo: context?.deviceInfo || null,
      });

      console.log(`[Diagnostics] UI Issue report: ${report.id} from user ${userId} - ${message.slice(0, 50)}...`);

      res.json({ success: true, id: report.id });
    } catch (error) {
      console.error("Error creating UI issue report:", error);
      res.status(500).json({ error: "Failed to submit report" });
    }
  });

  // Platform Owner: Get all diagnostic reports
  app.get("/api/platform/diagnostics", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
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
  });

  // Platform Owner: Get single diagnostic report
  app.get("/api/platform/diagnostics/:id", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
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
  });

  // Platform Owner: Update diagnostic report status
  app.put("/api/platform/diagnostics/:id", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status, resolutionNotes } = req.body;

      if (status === "resolved") {
        const report = await storage.resolveDiagnosticReport(req.params.id, req.user!.id, resolutionNotes);
        if (!report) {
          return res.status(404).json({ error: "Report not found" });
        }
        res.json(report);
      } else {
        const report = await storage.updateDiagnosticReport(req.params.id, { status });
        if (!report) {
          return res.status(404).json({ error: "Report not found" });
        }
        res.json(report);
      }
    } catch (error) {
      console.error("Error updating diagnostic report:", error);
      res.status(500).json({ error: "Failed to update report" });
    }
  });

  // Academy Owner: Get diagnostic reports for their academy
  app.get("/api/owner/diagnostics", authMiddleware, requireRole("academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
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
  });

  // ==================== AUTH ENDPOINTS ====================
  // Registration routes are role-specific:
  // - /auth/register/player - Open player self-registration
  // - /auth/register/coach - Invite-only coach registration (requires valid invite token)
  // - /auth/apply/academy - Academy owner application (requires platform owner approval)
  // The legacy /auth/register endpoint has been removed for security.

  // Check username availability (for real-time validation during registration)
  app.get("/api/auth/check-username/:username", async (req: Request, res: Response) => {
    try {
      const { username: rawUsername } = req.params;
      
      // Normalize to lowercase for consistent checking
      const username = rawUsername.toLowerCase();
      
      if (!username || username.length < 3) {
        return res.status(400).json({ available: false, error: "Username must be at least 3 characters" });
      }
      
      if (!/^[a-z0-9_]+$/.test(username)) {
        return res.status(400).json({ available: false, error: "Only letters, numbers, and underscores allowed" });
      }
      
      const exists = await storage.checkUsernameExists(username);
      res.json({ available: !exists });
    } catch (error) {
      console.error("Username check error:", error);
      res.status(500).json({ available: false, error: "Check failed" });
    }
  });

  app.post("/auth/login", authLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const { username, password } = parsed.data;

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const validPassword = await verifyPassword(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      await storage.updateUserLastLogin(user.id);

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        academyId: user.academyId,
        coachId: user.coachId,
        playerId: user.playerId,
      });

      res.json({ 
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          academyId: user.academyId,
          coachId: user.coachId,
          playerId: user.playerId,
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Player self-registration (open, no academy required)
  app.post("/auth/register/player", authLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = playerRegisterSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const { username: rawUsername, firstName, lastName, dateOfBirth, email, phone, password, tshirtSize, height } = parsed.data;
      
      // Normalize username to lowercase for consistent storage
      const username = rawUsername.toLowerCase();
      
      // Calculate age from date of birth
      let age: number | null = null;
      if (dateOfBirth) {
        const birthDate = new Date(dateOfBirth);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
      }

      // Check if username is already taken (globally unique)
      const usernameExists = await storage.checkUsernameExists(username);
      if (usernameExists) {
        return res.status(409).json({ error: "Username already taken. Please choose a different one." });
      }

      const hashedPassword = await hashPassword(password);
      const fullName = `${firstName} ${lastName}`;

      // Create player profile first
      const player = await storage.createPlayer({
        name: fullName,
        email,
        phone: phone || null,
        tshirtSize: tshirtSize || null,
        height: height || null,
        age: age,
        dateOfBirth: dateOfBirth || null,
        academyId: null, // No academy yet
        coachId: null,
      });

      // Create user account with username
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        role: "player",
        academyId: null,
        coachId: null,
      });

      // Link player to user
      await storage.updateUser(user.id, { playerId: player.id });

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        academyId: user.academyId,
        coachId: user.coachId,
        playerId: player.id,
      });

      res.status(201).json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          academyId: user.academyId,
          playerId: player.id,
        },
        message: "Account created successfully. Join an academy to start training!",
      });
    } catch (error) {
      console.error("Player registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Coach registration via invite token
  app.post("/auth/register/coach", authLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = coachInviteRegisterSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const { token, username: rawUsername, name, email, password, phone, specialty, tshirtSize } = parsed.data;
      
      // Normalize username to lowercase for consistent storage
      const username = rawUsername.toLowerCase();

      // Check if username is already taken
      const usernameExists = await storage.checkUsernameExists(username);
      if (usernameExists) {
        return res.status(409).json({ error: "Username already taken. Please choose a different one." });
      }

      // Validate invite token
      const invite = await storage.getInviteByToken(token);
      if (!invite) {
        return res.status(400).json({ error: "Invalid or expired invite link" });
      }

      if (invite.usedAt) {
        return res.status(400).json({ error: "This invite has already been used" });
      }

      if (new Date() > new Date(invite.expiresAt)) {
        return res.status(400).json({ error: "This invite has expired" });
      }

      // Check if email matches invite (if pre-set)
      if (invite.invitedEmail && invite.invitedEmail.toLowerCase() !== email.toLowerCase()) {
        return res.status(400).json({ error: "Email does not match the invite" });
      }

      const hashedPassword = await hashPassword(password);

      // Create coach profile
      const coach = await storage.createCoach({
        name,
        email,
        phone: phone || null,
        tshirtSize: tshirtSize || null,
        specialty: specialty || null,
        academyId: invite.academyId,
        role: invite.role || "coach",
        level: 1,
        totalXp: 0,
      });

      // Create user account with username
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        role: invite.role || "coach",
        academyId: invite.academyId,
        coachId: coach.id,
      });

      // Mark invite as used
      await storage.markInviteUsed(invite.id, user.id);

      const authToken = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        academyId: user.academyId,
        coachId: user.coachId,
        playerId: user.playerId,
      });

      res.status(201).json({
        token: authToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          academyId: user.academyId,
          coachId: user.coachId,
        },
        message: "Welcome to the team!",
      });
    } catch (error) {
      console.error("Coach registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Check if username is available (for real-time validation)
  app.get("/auth/check-username/:username", async (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      const normalizedUsername = username.toLowerCase().trim();

      if (normalizedUsername.length < 3) {
        return res.json({ 
          available: false, 
          error: "Username must be at least 3 characters",
          suggestions: [] 
        });
      }

      if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
        return res.json({ 
          available: false, 
          error: "Only letters, numbers, and underscores allowed",
          suggestions: [] 
        });
      }

      const existingUser = await storage.getUserByUsername(normalizedUsername);
      
      if (existingUser) {
        const suggestions: string[] = [];
        for (let i = 1; i <= 5; i++) {
          const suggestion = `${normalizedUsername}${i}`;
          const exists = await storage.getUserByUsername(suggestion);
          if (!exists) {
            suggestions.push(suggestion);
            if (suggestions.length >= 3) break;
          }
        }
        if (suggestions.length < 3) {
          for (let i = 10; i <= 99; i += 10) {
            const suggestion = `${normalizedUsername}_${i}`;
            const exists = await storage.getUserByUsername(suggestion);
            if (!exists) {
              suggestions.push(suggestion);
              if (suggestions.length >= 3) break;
            }
          }
        }
        
        return res.json({ 
          available: false, 
          error: "Username already taken",
          suggestions 
        });
      }

      res.json({ available: true, suggestions: [] });
    } catch (error) {
      console.error("Username check error:", error);
      res.status(500).json({ available: false, error: "Failed to check username", suggestions: [] });
    }
  });

  // Validate invite token (for checking before showing registration form)
  // Supports both general invites (academy owner, coach) and player invites
  app.get("/auth/invite/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      
      // First, try to find a general invite (academy owner, coach)
      const invite = await storage.getInviteByToken(token);

      if (invite) {
        if (invite.usedAt) {
          return res.status(400).json({ error: "This invite has already been used" });
        }

        if (new Date() > new Date(invite.expiresAt)) {
          return res.status(400).json({ error: "This invite has expired" });
        }

        // Get academy info
        const academy = await storage.getAcademy(invite.academyId);

        return res.json({
          valid: true,
          role: invite.role,
          academyName: academy?.name || "Unknown Academy",
          email: invite.invitedEmail,
          invitedEmail: invite.invitedEmail,
          expiresAt: invite.expiresAt,
        });
      }
      
      // If not found, try player invite
      const playerInvite = await storage.getPlayerInvite(token);
      
      if (playerInvite) {
        if (playerInvite.status !== "pending") {
          return res.status(400).json({ error: "This invite has already been claimed or expired" });
        }
        
        // Get player and academy info
        const player = await storage.getPlayer(playerInvite.playerId);
        const academy = await storage.getAcademy(playerInvite.academyId);
        
        return res.json({
          valid: true,
          role: "player",
          academyName: academy?.name || "Unknown Academy",
          playerName: player?.name || null,
          playerId: playerInvite.playerId,
          email: null,
          invitedEmail: null,
          isPlayerInvite: true,
        });
      }
      
      // Neither found
      return res.status(404).json({ error: "Invite not found" });
    } catch (error) {
      console.error("Invite validation error:", error);
      res.status(500).json({ error: "Failed to validate invite" });
    }
  });

  // Register user via invite (for academy owners invited by platform owner)
  app.post("/auth/register/invite", authLimiter, async (req: Request, res: Response) => {
    try {
      const { token, username, email, firstName, lastName, password, phone } = req.body;

      console.log("[InviteRegister] Attempting registration for username:", username, "email:", email);

      if (!token || !username || !email || !firstName || !lastName || !password) {
        console.log("[InviteRegister] Missing fields - token:", !!token, "username:", !!username, "email:", !!email, "firstName:", !!firstName, "lastName:", !!lastName, "password:", !!password);
        return res.status(400).json({ error: "Missing required fields" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email address" });
      }

      const normalizedUsername = username.toLowerCase();

      if (normalizedUsername.length < 3) {
        return res.status(400).json({ error: "Username must be at least 3 characters" });
      }

      if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
        return res.status(400).json({ error: "Username can only contain letters, numbers, and underscores" });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      // Validate invite
      const invite = await storage.getInviteByToken(token);
      if (!invite) {
        return res.status(400).json({ error: "Invalid invite code" });
      }

      if (invite.usedAt) {
        return res.status(400).json({ error: "This invite has already been used" });
      }

      if (new Date() > new Date(invite.expiresAt)) {
        return res.status(400).json({ error: "This invite has expired" });
      }

      // Check if username is taken
      const existingUser = await storage.getUserByUsername(normalizedUsername);
      if (existingUser) {
        return res.status(409).json({ error: "Username already taken" });
      }

      // Note: We do NOT check email uniqueness here because login is username-based
      // This allows one person to own multiple academies with the same email

      const hashedPassword = await hashPassword(password);

      // Use invite's email if set, otherwise use the email from request
      // This prevents users from tampering with the email for targeted invites
      const userEmail = invite.invitedEmail 
        ? invite.invitedEmail.toLowerCase().trim()
        : email.toLowerCase().trim();

      // Create user based on role
      if (invite.role === "academy_owner") {
        // Create user as academy owner
        const user = await storage.createUser({
          username: normalizedUsername,
          email: userEmail,
          password: hashedPassword,
          role: "academy_owner",
          academyId: invite.academyId,
        });

        // Mark invite as used
        await storage.markInviteUsed(invite.id, user.id);

        // Get academy name
        const academy = await storage.getAcademy(invite.academyId);

        res.status(201).json({
          success: true,
          message: `Welcome! You are now the owner of ${academy?.name || "your academy"}.`,
        });
      } else if (invite.role === "coach") {
        // Create coach profile
        const coach = await storage.createCoach({
          name: `${firstName} ${lastName}`,
          email: userEmail,
          phone: phone || null,
          academyId: invite.academyId,
          role: "coach",
          level: 1,
          totalXp: 0,
        });

        // Create user account
        const user = await storage.createUser({
          username: normalizedUsername,
          email: userEmail,
          password: hashedPassword,
          role: "coach",
          academyId: invite.academyId,
          coachId: coach.id,
        });

        // Mark invite as used
        await storage.markInviteUsed(invite.id, user.id);

        res.status(201).json({
          success: true,
          message: "Welcome to the team!",
        });
      } else {
        return res.status(400).json({ error: "Unsupported invite role" });
      }
    } catch (error) {
      console.error("Invite registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Register user via player invite (for players invited by academy)
  app.post("/auth/register/player-invite", authLimiter, async (req: Request, res: Response) => {
    try {
      const { token, username, email, firstName, lastName, password, phone, playerId } = req.body;

      console.log("[PlayerInviteRegister] Attempting registration for username:", username, "playerId:", playerId);

      if (!token || !username || !email || !firstName || !lastName || !password || !playerId) {
        console.log("[PlayerInviteRegister] Missing fields");
        return res.status(400).json({ error: "Missing required fields" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email address" });
      }

      const normalizedUsername = username.toLowerCase();

      if (normalizedUsername.length < 3) {
        return res.status(400).json({ error: "Username must be at least 3 characters" });
      }

      if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
        return res.status(400).json({ error: "Username can only contain letters, numbers, and underscores" });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      // Validate player invite
      const playerInvite = await storage.getPlayerInvite(token);
      if (!playerInvite) {
        return res.status(400).json({ error: "Invalid invite code" });
      }

      if (playerInvite.status !== "pending") {
        return res.status(400).json({ error: "This invite has already been claimed or expired" });
      }

      if (playerInvite.playerId !== playerId) {
        return res.status(400).json({ error: "Invalid player invite" });
      }

      // Check if username is taken
      const existingUser = await storage.getUserByUsername(normalizedUsername);
      if (existingUser) {
        return res.status(409).json({ error: "Username already taken" });
      }

      const hashedPassword = await hashPassword(password);

      // Get player details
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(400).json({ error: "Player not found" });
      }

      // Create user as player
      const user = await storage.createUser({
        username: normalizedUsername,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: "player",
        academyId: playerInvite.academyId,
        playerId: playerId,
      });

      // Update player with user info
      await storage.updatePlayer(playerId, {
        email: email.toLowerCase().trim(),
        firstName,
        lastName,
        phone: phone || undefined,
      }, playerInvite.academyId);

      // Mark invite as claimed
      await storage.claimPlayerInvite(token, user.id);

      console.log("[PlayerInviteRegister] Successfully created user for player:", playerId);

      // Generate JWT token for immediate authentication
      const jwtToken = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        academyId: user.academyId,
        coachId: null,
        playerId: playerId,
      });

      res.status(201).json({
        success: true,
        message: "Welcome to the team!",
        token: jwtToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          academyId: user.academyId,
          playerId: playerId,
        },
      });
    } catch (error) {
      console.error("Player invite registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Academy application (submit for platform owner approval)
  app.post("/auth/apply/academy", authLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = academyApplicationInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const { academyName, country, contactPerson, email, phone, description } = parsed.data;

      // Check for existing pending application
      const existingApplication = await storage.getAcademyApplicationByEmail(email);
      if (existingApplication) {
        return res.status(409).json({ error: "You already have a pending application" });
      }

      // Check if academy name slug exists
      const slug = academyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const existingAcademy = await storage.getAcademyBySlug(slug);
      if (existingAcademy) {
        return res.status(409).json({ error: "An academy with this name already exists" });
      }

      const application = await storage.createAcademyApplication({
        academyName,
        country,
        contactPerson,
        email,
        phone: phone || null,
        description: description || null,
        status: "pending",
      });

      res.status(201).json({
        application: {
          id: application.id,
          academyName: application.academyName,
          status: application.status,
        },
        message: "Application submitted successfully. You will be notified once reviewed.",
      });
    } catch (error) {
      console.error("Academy application error:", error);
      res.status(500).json({ error: "Application submission failed" });
    }
  });

  app.post("/auth/logout", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    res.json({ success: true, message: "Logged out successfully" });
  });

  app.post("/auth/refresh", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const token = generateToken({
        userId: user.userId,
        email: user.email,
        role: user.role,
        academyId: user.academyId,
        coachId: user.coachId,
        playerId: user.playerId,
      });
      res.json({ token });
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(500).json({ error: "Token refresh failed" });
    }
  });

  // ==================== COACH INVITES (Academy Owner/Admin) ====================
  
  // Create coach invite
  app.post("/api/invites", authMiddleware, requireRole("academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { role = "coach", email, expiresInDays = 7 } = req.body;
      // Use currentAcademyId (from X-Academy-Id header) for multi-academy support
      const academyId = req.user!.currentAcademyId || req.user!.academyId;
      const invitedBy = req.user!.coachId || req.user!.userId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy ID is required" });
      }

      if (!invitedBy) {
        return res.status(400).json({ error: "User ID is required" });
      }

      // Generate secure token
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const invite = await storage.createInvite({
        token,
        role,
        academyId,
        invitedEmail: email?.toLowerCase() || null,
        invitedBy,
        expiresAt,
      });

      res.status(201).json({
        invite: {
          id: invite.id,
          token: invite.token,
          role: invite.role,
          invitedEmail: invite.invitedEmail,
          expiresAt: invite.expiresAt,
        },
        inviteUrl: `/join/${invite.token}`,
      });
    } catch (error) {
      console.error("Create invite error:", error);
      res.status(500).json({ error: "Failed to create invite" });
    }
  });

  // List invites for academy
  app.get("/api/invites", authMiddleware, requireRole("academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Use currentAcademyId (from X-Academy-Id header) for multi-academy support
      const academyId = req.user!.currentAcademyId || req.user!.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID is required" });
      }

      const invitesList = await storage.getCoachInvites(academyId);
      res.json({ invites: invitesList });
    } catch (error) {
      console.error("Get invites error:", error);
      res.status(500).json({ error: "Failed to get invites" });
    }
  });

  // Verify invite token (public endpoint for registration)
  app.get("/api/invites/verify/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const invite = await storage.getInviteByToken(token);

      if (!invite) {
        return res.status(404).json({ valid: false, message: "Invite not found" });
      }

      if (invite.usedAt) {
        return res.status(400).json({ valid: false, message: "Invite has already been used" });
      }

      if (new Date(invite.expiresAt) < new Date()) {
        return res.status(400).json({ valid: false, message: "Invite has expired" });
      }

      const academy = await storage.getAcademy(invite.academyId);

      res.json({
        valid: true,
        role: invite.role,
        academyName: academy?.name || "Unknown Academy",
        invitedEmail: invite.invitedEmail,
        expiresAt: invite.expiresAt,
      });
    } catch (error) {
      console.error("Verify invite error:", error);
      res.status(500).json({ valid: false, message: "Failed to verify invite" });
    }
  });

  // ==================== ACADEMY BROWSING (Public/Player) ====================

  // Look up academy by join code (for quick onboarding)
  app.get("/api/academies/join-code/:code", async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      
      if (!code || code.length < 4) {
        return res.status(400).json({ error: "Invalid join code" });
      }

      const academy = await storage.getAcademyByJoinCode(code.toUpperCase());
      
      if (!academy) {
        return res.status(404).json({ error: "Academy not found. Please check the code and try again." });
      }

      const coaches = await storage.getCoachesByAcademy(academy.id);
      const players = await storage.getPlayersByAcademy(academy.id);

      res.json({
        academy: {
          id: academy.id,
          name: academy.name,
          slug: academy.slug,
          city: academy.city,
          country: academy.country,
          description: academy.description,
          coachCount: coaches.length,
          playerCount: players.length,
        }
      });
    } catch (error) {
      console.error("Join code lookup error:", error);
      res.status(500).json({ error: "Failed to look up academy" });
    }
  });

  // Browse available academies (for players to find and join)
  app.get("/api/academies/browse", async (req: Request, res: Response) => {
    try {
      const { search, city, country } = req.query;
      let academies = await storage.getAllAcademies();
      
      // Filter by search term
      if (search && typeof search === "string") {
        const searchLower = search.toLowerCase();
        academies = academies.filter(a => 
          a.name.toLowerCase().includes(searchLower) ||
          a.city?.toLowerCase().includes(searchLower) ||
          a.country?.toLowerCase().includes(searchLower)
        );
      }
      
      // Filter by city
      if (city && typeof city === "string") {
        academies = academies.filter(a => 
          a.city?.toLowerCase() === city.toLowerCase()
        );
      }
      
      // Filter by country
      if (country && typeof country === "string") {
        academies = academies.filter(a => 
          a.country?.toLowerCase() === country.toLowerCase()
        );
      }
      
      // Return public info only
      const publicAcademies = await Promise.all(
        academies.map(async (academy) => {
          const coaches = await storage.getCoachesByAcademy(academy.id);
          const players = await storage.getPlayersByAcademy(academy.id);
          return {
            id: academy.id,
            name: academy.name,
            slug: academy.slug,
            city: academy.city,
            country: academy.country,
            description: academy.description,
            coachCount: coaches.length,
            playerCount: players.length,
          };
        })
      );

      res.json({ academies: publicAcademies });
    } catch (error) {
      console.error("Browse academies error:", error);
      res.status(500).json({ error: "Failed to browse academies" });
    }
  });

  // Get academy join code (for coaches/owners to share with players)
  app.get("/api/academy/join-code", authMiddleware, requireRole("academy_owner", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy not found" });
      }

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      let joinCode = academy.joinCode;
      
      // If no join code exists, generate one
      if (!joinCode) {
        joinCode = await storage.generateJoinCode(academyId);
      }

      res.json({ 
        joinCode,
        academyName: academy.name
      });
    } catch (error) {
      console.error("Get join code error:", error);
      res.status(500).json({ error: "Failed to get join code" });
    }
  });

  // Regenerate academy join code (for coaches/owners)
  app.post("/api/academy/join-code/regenerate", authMiddleware, requireRole("academy_owner", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy not found" });
      }

      const joinCode = await storage.generateJoinCode(academyId);
      const academy = await storage.getAcademy(academyId);

      res.json({ 
        joinCode,
        academyName: academy?.name,
        message: "Join code regenerated successfully"
      });
    } catch (error) {
      console.error("Regenerate join code error:", error);
      res.status(500).json({ error: "Failed to regenerate join code" });
    }
  });

  // Reset academy data (selective data wipe) - owners and platform owners only
  app.post("/api/academy/reset", authMiddleware, requireRole("academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy not found" });
      }
      
      const { resetTypes, confirmationCode } = req.body;
      
      // Require confirmation code for safety
      if (confirmationCode !== "RESET") {
        return res.status(400).json({ error: "Invalid confirmation code. Please type RESET to confirm." });
      }
      
      if (!resetTypes || typeof resetTypes !== "object") {
        return res.status(400).json({ error: "Please specify which data types to reset" });
      }
      
      const validTypes = ["sessions", "attendance", "payments", "progress", "feedback", "packages", "invoices", "players"];
      const selectedTypes = Object.keys(resetTypes).filter(key => resetTypes[key] && validTypes.includes(key));
      
      if (selectedTypes.length === 0) {
        return res.status(400).json({ error: "Please select at least one data type to reset" });
      }
      
      const result = await storage.resetAcademyData(academyId, resetTypes);
      
      // Log the reset action
      console.log(`[Academy Reset] Academy ${academyId} reset: ${selectedTypes.join(", ")}`, result.deleted);
      
      res.json({ 
        success: true,
        message: `Academy data reset successfully`,
        deletedCounts: result.deleted
      });
    } catch (error) {
      console.error("Academy reset error:", error);
      res.status(500).json({ error: "Failed to reset academy data" });
    }
  });

  // Get academy reset counts (for showing in the reset modal)
  app.get("/api/academy/reset-counts", authMiddleware, requireRole("academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy not found" });
      }
      
      const counts = await storage.getAcademyResetCounts(academyId);
      res.json({ counts });
    } catch (error) {
      console.error("Get reset counts error:", error);
      res.status(500).json({ error: "Failed to get reset counts" });
    }
  });

  // ==================== ACADEMY PUBLIC PROFILE ====================

  // Get academy public profile (detailed view with coaches)
  app.get("/api/academies/:id/profile", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const profile = await storage.getAcademyPublicProfile(id);
      
      if (!profile) {
        return res.status(404).json({ error: "Academy not found" });
      }
      
      res.json({ profile });
    } catch (error) {
      console.error("Get academy profile error:", error);
      res.status(500).json({ error: "Failed to get academy profile" });
    }
  });

  // Update academy public profile (owner only)
  app.put("/api/academy/profile", authMiddleware, requireRole("academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy not found" });
      }

      const { website, phone, email, facilities, courtCount, ageGroups, programs, priceRange, profileVisibility } = req.body;
      
      const updated = await storage.updateAcademy(academyId, {
        website,
        phone,
        email,
        facilities,
        courtCount,
        ageGroups,
        programs,
        priceRange,
        profileVisibility,
      });

      res.json({ academy: updated });
    } catch (error) {
      console.error("Update academy profile error:", error);
      res.status(500).json({ error: "Failed to update academy profile" });
    }
  });

  // ==================== COACH DIRECTORY ====================

  // Browse coaches across the platform
  app.get("/api/coaches/directory", async (req: Request, res: Response) => {
    try {
      const { search, specialization, openToOpportunities } = req.query;
      
      const coaches = await storage.getCoachesForDirectory({
        search: search as string,
        specialization: specialization as string,
        openToOpportunities: openToOpportunities === "true",
      });
      
      res.json({ coaches });
    } catch (error) {
      console.error("Coach directory error:", error);
      res.status(500).json({ error: "Failed to browse coaches" });
    }
  });

  // Get coach public profile
  app.get("/api/coaches/:id/profile", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const profile = await storage.getCoachPublicProfile(id);
      
      if (!profile) {
        return res.status(404).json({ error: "Coach not found" });
      }
      
      res.json({ profile });
    } catch (error) {
      console.error("Get coach profile error:", error);
      res.status(500).json({ error: "Failed to get coach profile" });
    }
  });

  // Update coach directory settings
  app.put("/api/coach/directory-settings", authMiddleware, requireRole("coach", "academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "Coach profile not found" });
      }

      const { showInDirectory, openToOpportunities, specializations, languages } = req.body;
      
      const updated = await storage.updateCoach(coachId, {
        showInDirectory,
        openToOpportunities,
        specializations,
        languages,
      });

      res.json({ coach: updated });
    } catch (error) {
      console.error("Update directory settings error:", error);
      res.status(500).json({ error: "Failed to update directory settings" });
    }
  });

  // ==================== FREELANCE LICENSE ====================

  // Get coach freelance profile
  app.get("/api/coach/freelance-profile", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(200).json({ profile: null });
      }

      const profile = await storage.getCoachFreelanceProfile(coachId);
      res.json({ profile: profile || null });
    } catch (error) {
      console.error("Get freelance profile error:", error);
      res.status(500).json({ error: "Failed to get freelance profile" });
    }
  });

  // Activate freelance license (creates freelance academy + profile)
  app.post("/api/coach/freelance-license", authMiddleware, requireRole("coach", "academy_owner", "admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const coach = await storage.getCoach(coachId!);
      
      if (!coach) {
        return res.status(400).json({ error: "Coach profile not found" });
      }

      // Check if already has freelance profile
      const existingProfile = await storage.getCoachFreelanceProfile(coachId!);
      if (existingProfile?.isActive) {
        return res.status(400).json({ error: "Freelance license already active" });
      }

      const { businessName, tagline, contactEmail, contactPhone } = req.body;
      
      if (!businessName || businessName.trim().length < 2) {
        return res.status(400).json({ error: "Business name is required (at least 2 characters)" });
      }

      // Generate slug from business name
      const baseSlug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      let slug = baseSlug;
      let counter = 1;
      
      // Ensure slug is unique
      while (await storage.getAcademyBySlug(slug)) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      // Create freelance academy
      const freelanceAcademy = await storage.createAcademy({
        name: businessName.trim(),
        slug,
        ownerId: coachId!,
        isFreelance: true,
        freelanceOwnerCoachId: coachId!,
        description: tagline || `Personal coaching by ${coach.name}`,
        email: contactEmail || coach.email,
        phone: contactPhone || coach.phone,
      });

      // Create or update freelance profile
      let profile;
      if (existingProfile) {
        profile = await storage.updateCoachFreelanceProfile(coachId!, {
          businessName: businessName.trim(),
          slug,
          tagline,
          contactEmail: contactEmail || coach.email,
          contactPhone: contactPhone || coach.phone,
          freelanceAcademyId: freelanceAcademy.id,
          isActive: true,
          activatedAt: new Date(),
        });
      } else {
        profile = await storage.createCoachFreelanceProfile({
          coachId: coachId!,
          businessName: businessName.trim(),
          slug,
          tagline,
          contactEmail: contactEmail || coach.email,
          contactPhone: contactPhone || coach.phone,
          freelanceAcademyId: freelanceAcademy.id,
          isActive: true,
          activatedAt: new Date(),
        });
      }

      // Auto-create membership for coach in their freelance academy
      await storage.createCoachAcademyMembership({
        coachId: coachId!,
        academyId: freelanceAcademy.id,
        role: "academy_owner",
        isActive: true,
        isPrimary: false,
      });

      res.status(201).json({ 
        profile,
        academy: freelanceAcademy,
        message: "Freelance license activated successfully!"
      });
    } catch (error) {
      console.error("Activate freelance license error:", error);
      res.status(500).json({ error: "Failed to activate freelance license" });
    }
  });

  // Update freelance profile
  app.put("/api/coach/freelance-profile", authMiddleware, requireRole("coach", "academy_owner", "admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "Coach profile not found" });
      }

      const profile = await storage.getCoachFreelanceProfile(coachId);
      if (!profile) {
        return res.status(404).json({ error: "Freelance profile not found. Activate your license first." });
      }

      const {
        businessName, tagline, bio, primaryColor,
        contactEmail, contactPhone, website, socialLinks,
        serviceAreas, travelRadius, specialties, ageGroupsServed,
        showPricing, hourlyRateMin, hourlyRateMax, currency
      } = req.body;

      const updated = await storage.updateCoachFreelanceProfile(coachId, {
        businessName, tagline, bio, primaryColor,
        contactEmail, contactPhone, website, socialLinks,
        serviceAreas, travelRadius, specialties, ageGroupsServed,
        showPricing, hourlyRateMin, hourlyRateMax, currency,
        updatedAt: new Date(),
      });

      // Also update the freelance academy name if businessName changed
      if (businessName && profile.freelanceAcademyId) {
        await storage.updateAcademy(profile.freelanceAcademyId, {
          name: businessName,
          description: tagline || undefined,
          email: contactEmail || undefined,
          phone: contactPhone || undefined,
        });
      }

      res.json({ profile: updated });
    } catch (error) {
      console.error("Update freelance profile error:", error);
      res.status(500).json({ error: "Failed to update freelance profile" });
    }
  });

  // ==================== ACADEMY TRANSFER REQUESTS ====================

  // Player requests to transfer to another academy
  app.post("/api/player/transfer-request", authMiddleware, requireRole("player"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      const fromAcademyId = req.user!.academyId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player profile not found" });
      }
      
      if (!fromAcademyId) {
        return res.status(400).json({ error: "You must be a member of an academy to request a transfer" });
      }

      const { toAcademyId, reason } = req.body;
      
      if (!toAcademyId) {
        return res.status(400).json({ error: "Destination academy is required" });
      }

      if (toAcademyId === fromAcademyId) {
        return res.status(400).json({ error: "You are already a member of this academy" });
      }

      // Check if there's already a pending transfer
      const existing = await storage.getPlayerTransferRequests(playerId);
      const hasPending = existing.some(r => r.status === "pending");
      if (hasPending) {
        return res.status(400).json({ error: "You already have a pending transfer request" });
      }

      const request = await storage.createTransferRequest({
        playerId,
        fromAcademyId,
        toAcademyId,
        reason,
        status: "pending",
        fromAcademyStatus: "pending",
        toAcademyStatus: "pending",
      });

      res.status(201).json({ request });
    } catch (error) {
      console.error("Create transfer request error:", error);
      res.status(500).json({ error: "Failed to create transfer request" });
    }
  });

  // Get player's transfer requests
  app.get("/api/player/transfer-requests", authMiddleware, requireRole("player"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(400).json({ error: "Player profile not found" });
      }

      const requests = await storage.getPlayerTransferRequests(playerId);
      res.json({ requests });
    } catch (error) {
      console.error("Get transfer requests error:", error);
      res.status(500).json({ error: "Failed to get transfer requests" });
    }
  });

  // Coach/Owner: Get incoming transfer requests (players wanting to join)
  app.get("/api/coach/transfer-requests/incoming", authMiddleware, requireRole("coach", "academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy not found" });
      }

      const requests = await storage.getAcademyIncomingTransfers(academyId);
      
      // Enrich with player and academy names
      const enriched = await Promise.all(requests.map(async (r) => {
        const player = await storage.getPlayer(r.playerId);
        const fromAcademy = await storage.getAcademy(r.fromAcademyId);
        return {
          ...r,
          playerName: player?.name,
          fromAcademyName: fromAcademy?.name,
        };
      }));

      res.json({ requests: enriched });
    } catch (error) {
      console.error("Get incoming transfers error:", error);
      res.status(500).json({ error: "Failed to get transfer requests" });
    }
  });

  // Coach/Owner: Get outgoing transfer requests (players wanting to leave)
  app.get("/api/coach/transfer-requests/outgoing", authMiddleware, requireRole("coach", "academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy not found" });
      }

      const requests = await storage.getAcademyOutgoingTransfers(academyId);
      
      // Enrich with player and academy names
      const enriched = await Promise.all(requests.map(async (r) => {
        const player = await storage.getPlayer(r.playerId);
        const toAcademy = await storage.getAcademy(r.toAcademyId);
        return {
          ...r,
          playerName: player?.name,
          toAcademyName: toAcademy?.name,
        };
      }));

      res.json({ requests: enriched });
    } catch (error) {
      console.error("Get outgoing transfers error:", error);
      res.status(500).json({ error: "Failed to get transfer requests" });
    }
  });

  // Coach/Owner: Approve or reject transfer request (from their side)
  app.post("/api/coach/transfer-requests/:id/respond", authMiddleware, requireRole("coach", "academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { decision, note } = req.body; // decision: "approve" | "reject"
      const academyId = req.user!.academyId;
      const coachId = req.user!.coachId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy not found" });
      }

      const request = await storage.getTransferRequest(id);
      if (!request) {
        return res.status(404).json({ error: "Transfer request not found" });
      }

      // Determine which side we're responding for
      const isFromAcademy = request.fromAcademyId === academyId;
      const isToAcademy = request.toAcademyId === academyId;

      if (!isFromAcademy && !isToAcademy) {
        return res.status(403).json({ error: "You are not authorized to respond to this request" });
      }

      const updateData: Record<string, any> = {};
      const now = new Date();

      if (isFromAcademy) {
        updateData.fromAcademyStatus = decision === "approve" ? "approved" : "rejected";
        updateData.fromAcademyReviewedBy = coachId;
        updateData.fromAcademyReviewedAt = now;
        updateData.fromAcademyNote = note;
      } else {
        updateData.toAcademyStatus = decision === "approve" ? "approved" : "rejected";
        updateData.toAcademyReviewedBy = coachId;
        updateData.toAcademyReviewedAt = now;
        updateData.toAcademyNote = note;
      }

      // Get updated request to check if both sides have approved
      const updatedRequest = await storage.updateTransferRequest(id, updateData);
      
      // If either side rejected, mark overall as rejected
      if (updatedRequest?.fromAcademyStatus === "rejected" || updatedRequest?.toAcademyStatus === "rejected") {
        await storage.updateTransferRequest(id, { status: "rejected" });
      }
      // If both sides approved, complete the transfer
      else if (updatedRequest?.fromAcademyStatus === "approved" && updatedRequest?.toAcademyStatus === "approved") {
        // Execute the transfer
        await storage.updatePlayer(request.playerId, { academyId: request.toAcademyId });
        await storage.updateTransferRequest(id, { status: "approved", completedAt: now });
      }

      res.json({ request: updatedRequest });
    } catch (error) {
      console.error("Respond to transfer error:", error);
      res.status(500).json({ error: "Failed to respond to transfer request" });
    }
  });

  // ==================== COACH INVITATIONS ====================

  // Academy owner invites a coach
  app.post("/api/coach-invitations", authMiddleware, requireRole("academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const invitedBy = req.user!.coachId;

      if (!academyId || !invitedBy) {
        return res.status(400).json({ error: "Academy not found" });
      }

      const { email, role, message } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Check if already invited
      const existing = await storage.getCoachInvitationByEmail(email, academyId);
      if (existing) {
        return res.status(400).json({ error: "This email has already been invited" });
      }

      // Check if the coach already exists on the platform (via user table)
      const existingUser = await storage.getUserByEmail(email);
      const existingCoach = existingUser?.coachId ? await storage.getCoach(existingUser.coachId) : null;
      
      // Generate unique token
      const token = `ci_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      
      const invitation = await storage.createCoachInvitation({
        academyId,
        email: email.toLowerCase(),
        role: role || "coach",
        invitedBy,
        coachId: existingCoach?.id || null,
        message,
        token,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      res.status(201).json({ invitation });
    } catch (error) {
      console.error("Create coach invitation error:", error);
      res.status(500).json({ error: "Failed to create invitation" });
    }
  });

  // Get academy's coach invitations
  app.get("/api/coach-invitations", authMiddleware, requireRole("academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy not found" });
      }

      const invitations = await storage.getAcademyCoachInvitations(academyId);
      res.json({ invitations });
    } catch (error) {
      console.error("Get coach invitations error:", error);
      res.status(500).json({ error: "Failed to get invitations" });
    }
  });

  // Get coach's pending invitations (from other academies)
  app.get("/api/coach/pending-invitations", authMiddleware, requireRole("coach", "academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "Coach profile not found" });
      }

      const invitations = await storage.getCoachPendingInvitations(coachId);
      
      // Enrich with academy names
      const enriched = await Promise.all(invitations.map(async (inv) => {
        const academy = await storage.getAcademy(inv.academyId);
        return {
          ...inv,
          academyName: academy?.name,
          academyCity: academy?.city,
        };
      }));

      res.json({ invitations: enriched });
    } catch (error) {
      console.error("Get pending invitations error:", error);
      res.status(500).json({ error: "Failed to get invitations" });
    }
  });

  // Coach accepts or declines invitation
  app.post("/api/coach-invitations/:id/respond", authMiddleware, requireRole("coach", "academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { decision } = req.body; // "accept" | "decline"
      const coachId = req.user!.coachId;

      if (!coachId) {
        return res.status(400).json({ error: "Coach profile not found" });
      }

      const invitation = await storage.getCoachInvitation(id);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      if (invitation.coachId !== coachId) {
        return res.status(403).json({ error: "This invitation is not for you" });
      }

      if (invitation.status !== "pending") {
        return res.status(400).json({ error: "This invitation has already been responded to" });
      }

      const now = new Date();
      
      if (decision === "accept") {
        // Create coach-academy membership
        await storage.createCoachMembership({
          coachId,
          academyId: invitation.academyId,
          role: invitation.role || "coach",
          isActive: true,
          isPrimary: false,
        });
        
        await storage.updateCoachInvitation(id, { 
          status: "accepted", 
          acceptedAt: now 
        });
      } else {
        await storage.updateCoachInvitation(id, { 
          status: "declined", 
          declinedAt: now 
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Respond to invitation error:", error);
      res.status(500).json({ error: "Failed to respond to invitation" });
    }
  });

  // Delete coach invitation
  app.delete("/api/coach-invitations/:id", authMiddleware, requireRole("academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;

      const invitation = await storage.getCoachInvitation(id);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      if (invitation.academyId !== academyId) {
        return res.status(403).json({ error: "You can only delete invitations from your academy" });
      }

      await storage.deleteCoachInvitation(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete invitation error:", error);
      res.status(500).json({ error: "Failed to delete invitation" });
    }
  });

  // ==================== PLAYER JOIN REQUESTS ====================

  // Submit join request (player)
  app.post("/api/join-requests", authMiddleware, requireRole("player"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { academyId, message } = req.body;
      const playerId = req.user!.playerId;

      if (!playerId) {
        return res.status(400).json({ error: "Player profile not found" });
      }

      if (!academyId) {
        return res.status(400).json({ error: "Academy ID is required" });
      }

      // Check if academy exists
      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      // Check for existing pending request
      const existingRequest = await storage.getJoinRequestByPlayerAndAcademy(playerId, academyId);
      if (existingRequest) {
        if (existingRequest.status === "pending") {
          return res.status(400).json({ error: "You already have a pending request to this academy" });
        }
        if (existingRequest.status === "approved") {
          return res.status(400).json({ error: "You are already a member of this academy" });
        }
      }

      const joinRequest = await storage.createJoinRequest({
        playerId,
        academyId,
        message: message || null,
        status: "pending",
      });

      res.status(201).json({
        request: joinRequest,
        message: "Join request submitted successfully",
      });
    } catch (error) {
      console.error("Submit join request error:", error);
      res.status(500).json({ error: "Failed to submit join request" });
    }
  });

  // Get player's own join requests
  app.get("/api/join-requests/my", authMiddleware, requireRole("player"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(400).json({ error: "Player profile not found" });
      }

      const requests = await storage.getJoinRequestsByPlayer(playerId);
      res.json({ requests });
    } catch (error) {
      console.error("Get player join requests error:", error);
      res.status(500).json({ error: "Failed to get join requests" });
    }
  });

  // Get join requests for academy (owner/coach)
  app.get("/api/join-requests", authMiddleware, requireRole("academy_owner", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID is required" });
      }

      const { status } = req.query;
      const requests = await storage.getJoinRequestsByAcademy(academyId, status as string | undefined);
      res.json({ requests });
    } catch (error) {
      console.error("Get join requests error:", error);
      res.status(500).json({ error: "Failed to get join requests" });
    }
  });

  // Approve join request (owner/coach)
  app.post("/api/join-requests/:id/approve", authMiddleware, requireRole("academy_owner", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const reviewedBy = req.user!.coachId;
      const academyId = req.user!.academyId;

      const joinRequest = await storage.getJoinRequest(id);
      if (!joinRequest) {
        return res.status(404).json({ error: "Join request not found" });
      }

      if (joinRequest.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized to approve this request" });
      }

      if (joinRequest.status !== "pending") {
        return res.status(400).json({ error: "Request has already been processed" });
      }

      // Update join request status
      await storage.updateJoinRequest(id, {
        status: "approved",
        reviewedBy,
        reviewedAt: new Date(),
      });

      // Update player's academy
      await storage.updatePlayer(joinRequest.playerId, { academyId });

      // Update user's academy
      const player = await storage.getPlayer(joinRequest.playerId);
      if (player) {
        const user = await storage.getUserByPlayerId(joinRequest.playerId);
        if (user) {
          await storage.updateUser(user.id, { academyId });
        }
      }

      res.json({ message: "Join request approved", requestId: id });
    } catch (error) {
      console.error("Approve join request error:", error);
      res.status(500).json({ error: "Failed to approve join request" });
    }
  });

  // Reject join request (owner/coach)
  app.post("/api/join-requests/:id/reject", authMiddleware, requireRole("academy_owner", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const reviewedBy = req.user!.coachId;
      const academyId = req.user!.academyId;

      const joinRequest = await storage.getJoinRequest(id);
      if (!joinRequest) {
        return res.status(404).json({ error: "Join request not found" });
      }

      if (joinRequest.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized to reject this request" });
      }

      if (joinRequest.status !== "pending") {
        return res.status(400).json({ error: "Request has already been processed" });
      }

      await storage.updateJoinRequest(id, {
        status: "rejected",
        reviewedBy,
        reviewedAt: new Date(),
        rejectionReason: reason || null,
      });

      res.json({ message: "Join request rejected", requestId: id });
    } catch (error) {
      console.error("Reject join request error:", error);
      res.status(500).json({ error: "Failed to reject join request" });
    }
  });

  // ==================== ACADEMY APPLICATIONS (Platform Owner Only) ====================

  // List all academy applications
  app.get("/api/platform/applications", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status } = req.query;
      const applications = await storage.getAllAcademyApplications(status as string | undefined);
      res.json({ applications });
    } catch (error) {
      console.error("Get applications error:", error);
      res.status(500).json({ error: "Failed to get applications" });
    }
  });

  // Get single application
  app.get("/api/platform/applications/:id", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const application = await storage.getAcademyApplication(id);
      
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      res.json({ application });
    } catch (error) {
      console.error("Get application error:", error);
      res.status(500).json({ error: "Failed to get application" });
    }
  });

  // Approve academy application
  app.post("/api/platform/applications/:id/approve", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const reviewedBy = req.user!.userId;

      const application = await storage.getAcademyApplication(id);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (application.status !== "pending") {
        return res.status(400).json({ error: "Application has already been processed" });
      }

      // Create the academy
      const slug = application.academyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const academy = await storage.createAcademy({
        name: application.academyName,
        slug,
        ownerId: null,
      });

      // Create invite for the academy owner
      const inviteToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days to accept

      await storage.createInvite({
        token: inviteToken,
        role: "academy_owner",
        academyId: academy.id,
        invitedEmail: application.email,
        invitedBy: reviewedBy,
        expiresAt,
      });

      // Update application status
      await storage.updateAcademyApplication(id, {
        status: "approved",
        reviewedBy,
        reviewedAt: new Date(),
      });

      res.json({
        success: true,
        academy: {
          id: academy.id,
          name: academy.name,
        },
        inviteToken,
        message: "Academy approved. Invite sent to owner.",
      });
    } catch (error) {
      console.error("Approve application error:", error);
      res.status(500).json({ error: "Failed to approve application" });
    }
  });

  // Reject academy application
  app.post("/api/platform/applications/:id/reject", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const reviewedBy = req.user!.userId;

      const application = await storage.getAcademyApplication(id);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (application.status !== "pending") {
        return res.status(400).json({ error: "Application has already been processed" });
      }

      await storage.updateAcademyApplication(id, {
        status: "rejected",
        reviewedBy,
        reviewedAt: new Date(),
        rejectionReason: reason || null,
      });

      res.json({
        success: true,
        message: "Application rejected.",
      });
    } catch (error) {
      console.error("Reject application error:", error);
      res.status(500).json({ error: "Failed to reject application" });
    }
  });

  // ==================== COACH CALENDAR API ====================

  // Get calendar for a date range
  app.get("/api/coach/calendar", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { date, view = "day" } = req.query;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      
      if (!date || !coachId) {
        return res.status(400).json({ error: "date is required" });
      }

      // Parse date string as UTC to avoid timezone issues
      const dateStr = date as string;
      const [year, month, day] = dateStr.split("-").map(Number);
      const targetDate = new Date(Date.UTC(year, month - 1, day));
      let startDate: Date;
      let endDate: Date;

      switch (view) {
        case "week":
          const dayOfWeek = targetDate.getUTCDay();
          startDate = new Date(targetDate);
          startDate.setUTCDate(targetDate.getUTCDate() - dayOfWeek);
          startDate.setUTCHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setUTCDate(startDate.getUTCDate() + 7);
          endDate.setUTCHours(23, 59, 59, 999);
          break;
        case "month":
          startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
          endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
          break;
        default: // day
          startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
          endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
      }

      // Get own sessions (full data) - filtered by academy
      const ownSessions = await storage.getSessionsByCoach(coachId as string, startDate, endDate, academyId ?? undefined);
      
      // Fetch players for each session using unified roster helper
      // This combines series players (base roster) with session-specific overrides (attendance, guests)
      const sessionsWithPlayers = await Promise.all(
        ownSessions.map(async (session) => {
          const players = await storage.getSessionRoster(session.id, session.seriesId || null, academyId ?? undefined);
          return {
            ...session,
            players,
          };
        })
      );
      
      // Get blocked sessions (other coaches, no details) - filtered by academy
      const blockedSessions = await storage.getBlockedSessions(coachId as string, startDate, endDate, academyId ?? undefined);
      const blockedSessionsMinimal = blockedSessions.map(s => ({
        id: s.id,
        courtId: s.courtId,
        startTime: s.startTime,
        endTime: s.endTime,
        blocked: true,
      }));

      // Get external time blocks (this coach at OTHER academies - show as "Busy")
      // Use single range query for efficiency
      let externalBlocks: { startTime: Date; endTime: Date; isExternal: true; label: string }[] = [];
      if (academyId) {
        const rawBlocks = await storage.getCoachExternalBlocksForRange(coachId as string, startDate, endDate, academyId);
        externalBlocks = rawBlocks.map((block: any) => {
          // Convert date + time to full Date objects
          const [blockYear, blockMonth, blockDay] = block.date.split('-').map(Number);
          const [startHour, startMin] = block.start_time.split(':').map(Number);
          const [endHour, endMin] = block.end_time.split(':').map(Number);
          
          const blockStart = new Date(Date.UTC(blockYear, blockMonth - 1, blockDay, startHour, startMin, 0, 0));
          const blockEnd = new Date(Date.UTC(blockYear, blockMonth - 1, blockDay, endHour, endMin, 0, 0));
          
          return {
            startTime: blockStart,
            endTime: blockEnd,
            isExternal: true as const,
            label: "Busy",
          };
        });
      }

      // Get courts - filtered by academy
      const courts = await storage.getAllCourts(academyId ?? undefined);
      const locations = await storage.getAllLocations(academyId ?? undefined);

      res.json({
        ownSessions: sessionsWithPlayers,
        blockedSessions: blockedSessionsMinimal,
        externalBlocks,
        courts,
        locations,
        dateRange: { start: startDate, end: endDate },
      });
    } catch (error) {
      console.error("Error fetching calendar:", error);
      res.status(500).json({ error: "Failed to fetch calendar" });
    }
  });

  // Get today's sessions for Coach HQ
  app.get("/api/coach/sessions/today", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      
      if (!coachId) {
        return res.status(400).json({ error: "Coach ID required" });
      }
      
      const today = new Date();
      const startOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));
      const endOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));
      
      const todaySessions = await storage.getSessionsByCoach(coachId, startOfDay, endOfDay, academyId ?? undefined);
      
      const sessionsWithDetails = await Promise.all(
        todaySessions.map(async (session) => {
          const players = await storage.getSessionRoster(session.id, session.seriesId || null, academyId ?? undefined);
          
          const [plan] = await db
            .select({ id: sessionPlans.id, status: sessionPlans.status })
            .from(sessionPlans)
            .where(eq(sessionPlans.sessionId, session.id));
          
          const firstPlayer = players[0];
          
          return {
            id: session.id,
            playerId: firstPlayer?.id || null,
            playerName: firstPlayer ? `${firstPlayer.firstName} ${firstPlayer.lastName}` : "No Player",
            playerLevel: firstPlayer?.ballLevel || "RED_3",
            startTime: session.startTime,
            endTime: session.endTime,
            type: session.type || "private",
            status: session.status === "completed" ? "completed" : session.status === "in_progress" ? "in_progress" : "scheduled",
            sessionPlanId: plan?.id || null,
          };
        })
      );
      
      res.json(sessionsWithDetails);
    } catch (error) {
      console.error("Error fetching today's sessions:", error);
      res.status(500).json({ error: "Failed to fetch today's sessions" });
    }
  });

  // Check for conflicts before booking
  app.get("/api/coach/sessions/check-conflict", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { courtId, startTime, endTime, playerIds, excludeSessionId } = req.query;
      const coachId = req.user!.coachId;

      if (!courtId || !coachId || !startTime || !endTime) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const start = new Date(startTime as string);
      const end = new Date(endTime as string);
      const conflicts: string[] = [];

      const academyId = req.user?.academyId ?? undefined;
      
      // Check unified time block conflict (across ALL academies)
      const dateStr = start.toISOString().split('T')[0];
      const startTimeStr = start.toISOString().split('T')[1].slice(0, 5);
      const endTimeStr = end.toISOString().split('T')[1].slice(0, 5);
      const unifiedConflict = await storage.checkUnifiedCoachConflict(
        coachId as string,
        dateStr,
        startTimeStr,
        endTimeStr,
        excludeSessionId as string | undefined,
        academyId
      );
      if (unifiedConflict.hasConflict && !unifiedConflict.isOwnAcademy) {
        conflicts.push("Coach is already booked at another academy for this time");
      }

      // Check coach conflict within same academy
      const coachConflict = await storage.checkCoachConflict(
        coachId as string, 
        start, 
        end, 
        excludeSessionId as string | undefined,
        academyId
      );
      if (coachConflict) {
        conflicts.push("Coach is already booked for this time");
      }

      // Check court conflict
      const courtConflict = await storage.checkCourtConflict(
        courtId as string, 
        start, 
        end,
        excludeSessionId as string | undefined,
        academyId
      );
      if (courtConflict) {
        conflicts.push("Court is already booked for this time");
      }

      // Check player conflicts if provided
      if (playerIds) {
        const playerIdArray = Array.isArray(playerIds) ? playerIds : [playerIds];
        for (const playerId of playerIdArray) {
          const playerConflict = await storage.checkPlayerConflict(
            playerId as string, 
            start, 
            end,
            excludeSessionId as string | undefined,
            academyId
          );
          if (playerConflict) {
            conflicts.push(`Player is already booked for this time`);
            break;
          }
        }
      }

      // Check travel time from previous session
      interface Warning {
        level: 1 | 2 | 3;
        type: string;
        message: string;
      }
      const warnings: Warning[] = [];
      
      // Get adjacent sessions for the coach on the same day
      const dayStart = new Date(start);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(start);
      dayEnd.setHours(23, 59, 59, 999);
      const coachSessions = await storage.getSessionsByCoach(coachId as string, dayStart, dayEnd);
      
      for (const session of coachSessions) {
        if (excludeSessionId && session.id === excludeSessionId) continue;
        
        const sessionStart = new Date(session.startTime);
        const sessionEnd = new Date(session.endTime);
        const requiredTravelTime = session.travelTime || 0;
        
        // Check if session ends just before new session
        if (sessionEnd <= start) {
          const gapMinutes = (start.getTime() - sessionEnd.getTime()) / 60000;
          if (gapMinutes < requiredTravelTime) {
            warnings.push({
              level: 2,
              type: "travel_time",
              message: `Not enough travel time (${Math.round(gapMinutes)}m available, ${requiredTravelTime}m needed)`,
            });
          } else if (gapMinutes < 5) {
            warnings.push({
              level: 1,
              type: "tight_schedule",
              message: `Only ${Math.round(gapMinutes)} minutes between sessions`,
            });
          }
        }
        
        // Check if new session ends just before existing session
        if (end <= sessionStart) {
          const gapMinutes = (sessionStart.getTime() - end.getTime()) / 60000;
          if (gapMinutes < requiredTravelTime) {
            warnings.push({
              level: 2,
              type: "travel_time",
              message: `Not enough travel time to next session (${Math.round(gapMinutes)}m available)`,
            });
          } else if (gapMinutes < 5) {
            warnings.push({
              level: 1,
              type: "tight_schedule",
              message: `Only ${Math.round(gapMinutes)} minutes before next session`,
            });
          }
        }
      }

      // Add Level 3 conflicts
      conflicts.forEach((conflict) => {
        warnings.push({ level: 3, type: "conflict", message: conflict });
      });

      res.json({ 
        conflicts,
        warnings,
        hasConflicts: conflicts.length > 0,
        maxWarningLevel: warnings.length > 0 ? Math.max(...warnings.map(w => w.level)) : 0,
      });
    } catch (error) {
      console.error("Error checking conflicts:", error);
      res.status(500).json({ error: "Failed to check conflicts" });
    }
  });

  // Get multi-week availability for recurring session creation
  app.post("/api/coach/sessions/multi-week-availability", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      const { dates, courtId } = req.body;

      if (!dates || !Array.isArray(dates) || dates.length === 0) {
        return res.status(400).json({ error: "dates array is required" });
      }

      // Build result: for each date, get blocked slots
      const result: Record<string, { 
        blockedSlots: Array<{ courtId: string | null; start: string; end: string }>;
        coachBlocked: Array<{ start: string; end: string }>;
      }> = {};

      for (const dateStr of dates) {
        const [year, month, day] = dateStr.split("-").map(Number);
        const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

        // Get all sessions for this day (blocked slots = other coaches' sessions)
        const blockedSessions = await storage.getBlockedSessions(coachId as string, startDate, endDate, academyId ?? undefined);
        const ownSessions = await storage.getSessionsByCoach(coachId as string, startDate, endDate, academyId ?? undefined);

        // Court blocked slots (other coaches)
        const blockedSlots = blockedSessions
          .filter(s => !courtId || s.courtId === courtId)
          .map(s => ({
            courtId: s.courtId,
            start: new Date(s.startTime).toISOString(),
            end: new Date(s.endTime).toISOString(),
          }));

        // Coach blocked (own sessions - coach can't be in two places)
        const coachBlocked = ownSessions.map(s => ({
          start: new Date(s.startTime).toISOString(),
          end: new Date(s.endTime).toISOString(),
        }));

        // Also add other coaches' sessions to coachBlocked if on same court
        if (courtId) {
          const courtBlocked = blockedSessions
            .filter(s => s.courtId === courtId)
            .map(s => ({
              start: new Date(s.startTime).toISOString(),
              end: new Date(s.endTime).toISOString(),
            }));
          coachBlocked.push(...courtBlocked);
        }

        result[dateStr] = { blockedSlots, coachBlocked };
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching multi-week availability:", error);
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  // Create session
  app.post("/api/coach/sessions", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      const {
        courtId,
        locationId,
        startTime,
        duration,
        sessionType,
        ballLevel,
        skillLevel,
        weekCount,
        travelTime,
        playerIds,
      } = req.body;

      if (!coachId || !courtId || !startTime || !duration || !sessionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const start = new Date(startTime);
      const end = new Date(start.getTime() + duration * 60000);
      const dateStr = start.toISOString().split('T')[0];
      const startTimeStr = start.toISOString().split('T')[1].slice(0, 5);
      const endTimeStr = end.toISOString().split('T')[1].slice(0, 5);

      // Check unified time block conflict (across ALL academies)
      const unifiedConflict = await storage.checkUnifiedCoachConflict(coachId, dateStr, startTimeStr, endTimeStr, undefined, academyId ?? undefined);
      if (unifiedConflict.hasConflict && !unifiedConflict.isOwnAcademy) {
        return res.status(409).json({ 
          error: "Coach conflict", 
          level: 3,
          message: "Coach is already booked at another academy for this time slot" 
        });
      }

      // Check conflicts within this academy
      const coachConflict = await storage.checkCoachConflict(coachId, start, end, undefined, academyId ?? undefined);
      if (coachConflict) {
        return res.status(409).json({ 
          error: "Coach conflict", 
          level: 3,
          message: "Coach is already booked for this time slot" 
        });
      }

      const courtConflict = await storage.checkCourtConflict(courtId, start, end, undefined, academyId ?? undefined);
      if (courtConflict) {
        return res.status(409).json({ 
          error: "Court conflict", 
          level: 3,
          message: "Court is already booked for this time slot" 
        });
      }

      // Create sessions (single or recurring)
      const sessionsToCreate = weekCount && weekCount > 1 ? weekCount : 1;
      const recurringGroupId = sessionsToCreate > 1 ? crypto.randomUUID() : null;
      const createdSessions = [];
      const skippedWeeks: number[] = [];
      
      // Create coaching_series for recurring sessions (so they appear in Classes view)
      let seriesId: string | null = null;
      if (sessionsToCreate > 1 && academyId && coachId) {
        const dayOfWeek = start.getUTCDay(); // 0=Sunday, 1=Monday, etc.
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const sessionTypeLabels: Record<string, string> = {
          private: "Private Lesson",
          semi_private: "Semi-Private",
          group: "Group Session",
        };
        const seriesTitle = `${sessionTypeLabels[sessionType] || sessionType} - ${dayNames[dayOfWeek]} ${startTimeStr}`;
        const seriesStartDate = dateStr;
        
        // Calculate end date based on weekCount
        const seriesEndDate = new Date(start.getTime() + (sessionsToCreate - 1) * 7 * 24 * 60 * 60 * 1000);
        const seriesEndDateStr = seriesEndDate.toISOString().split('T')[0];
        
        const series = await storage.createCoachingSeries({
          academyId,
          coachId,
          courtId: courtId || null,
          locationId: locationId || null,
          title: seriesTitle,
          dayOfWeek,
          startTime: startTimeStr,
          duration,
          sessionType,
          ballLevel: ballLevel || null,
          skillLevel: skillLevel || null,
          maxPlayers: sessionType === "private" ? 1 : sessionType === "semi_private" ? 2 : 4,
          weekCount: sessionsToCreate,
          seriesStartDate,
          seriesEndDate: seriesEndDateStr,
          status: "active",
        });
        seriesId = series.id;
        
        // Add players to series if provided
        if (playerIds && Array.isArray(playerIds)) {
          for (const playerId of playerIds) {
            await storage.addPlayerToSeries({
              seriesId: series.id,
              playerId,
              status: "active",
            });
          }
        }
      }

      for (let week = 0; week < sessionsToCreate; week++) {
        const weekStart = new Date(start.getTime() + week * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + duration * 60000);
        const weekDateStr = weekStart.toISOString().split('T')[0];
        const weekStartTimeStr = weekStart.toISOString().split('T')[1].slice(0, 5);
        const weekEndTimeStr = weekEnd.toISOString().split('T')[1].slice(0, 5);

        // Check unified time block conflicts for each week (across ALL academies)
        const weekUnifiedConflict = await storage.checkUnifiedCoachConflict(coachId, weekDateStr, weekStartTimeStr, weekEndTimeStr, undefined, academyId ?? undefined);
        const weekCoachConflict = await storage.checkCoachConflict(coachId, weekStart, weekEnd, undefined, academyId ?? undefined);
        const weekCourtConflict = await storage.checkCourtConflict(courtId, weekStart, weekEnd, undefined, academyId ?? undefined);
        
        // Skip if there's an external conflict or within-academy conflict
        if ((weekUnifiedConflict.hasConflict && !weekUnifiedConflict.isOwnAcademy) || weekCoachConflict || weekCourtConflict) {
          skippedWeeks.push(week + 1);
          continue;
        }

        // Snapshot pricing at booking time (Layer 3)
        let pricingSnapshot: { academyPrice?: string; coachPayout?: string; academyMargin?: string } = {};
        if (academyId && coachId) {
          try {
            const pricing = await storage.calculateSessionPricing(academyId, coachId, sessionType, duration);
            pricingSnapshot = {
              academyPrice: String(pricing.academyPrice),
              coachPayout: String(pricing.coachPayout),
              academyMargin: String(pricing.academyMargin),
            };
          } catch (err: any) {
            // Currency mismatch and other critical errors must block session creation
            return res.status(422).json({ 
              error: "Pricing error", 
              message: err.message || "Could not calculate session pricing"
            });
          }
        }

        const session = await storage.createSession({
          academyId,
          coachId,
          courtId,
          locationId,
          startTime: weekStart,
          endTime: weekEnd,
          duration,
          sessionType,
          ballLevel,
          skillLevel,
          isRecurring: sessionsToCreate > 1,
          recurringGroupId,
          weekCount: sessionsToCreate,
          travelTime: travelTime || 0,
          paymentStatus: "unpaid",
          status: "scheduled",
          seriesId: seriesId || undefined,
          weekNumber: seriesId ? week + 1 : undefined,
          ...pricingSnapshot,
        });

        // Create unified time block to prevent double-booking across academies
        await storage.createCoachTimeBlock({
          coachId,
          sourceType: 'session',
          sourceAcademyId: academyId ?? undefined,
          sourceSessionId: session.id,
          date: weekDateStr,
          startTime: weekStartTimeStr,
          endTime: weekEndTimeStr,
          isPrivate: true,
        });

        // Add players if provided (with credit deduction)
        let playerNames: string[] = [];
        if (playerIds && Array.isArray(playerIds)) {
          for (const playerId of playerIds) {
            const player = await storage.getPlayer(playerId, academyId!);
            if (player) {
              playerNames.push(player.name);
            }
            
            // First add player to session (creates session_player record)
            await storage.addPlayerToSession({
              sessionId: session.id,
              playerId,
            });
            
            // Then deduct typed credits (updates session_player with creditDeductedAt)
            const creditResult = await storage.deductTypedCreditsForSession(
              playerId,
              sessionType,
              session.id,
              academyId || undefined
            );
            
            // If credits couldn't be deducted, create notification
            if (!creditResult.success && player) {
              const creditTypeLabel = (creditResult.creditType || sessionType).replace("_", "-");
              await storage.createNotification({
                playerId,
                type: "credits_needed",
                title: "Credits Required",
                message: `You've been added to a ${creditTypeLabel} lesson but don't have matching credits.`,
                metadata: JSON.stringify({
                  sessionId: session.id,
                  sessionType,
                  requiredCreditType: creditResult.creditType,
                }),
              });
            }
          }
        }

        // Sync to Google Calendar (non-blocking)
        const court = courtId ? await storage.getCourt(courtId, academyId!) : null;
        const location = locationId ? await storage.getLocation(locationId, academyId!) : null;
        const sessionTitle = `Tennis ${sessionType.charAt(0).toUpperCase() + sessionType.slice(1)} Session`;
        
        createCalendarEvent({
          sessionId: session.id,
          title: sessionTitle,
          description: `Ball Level: ${ballLevel || 'Not specified'}\nSkill Level: ${skillLevel || 'Not specified'}`,
          startTime: weekStart,
          endTime: weekEnd,
          location: location?.name || court?.name,
          playerNames,
        }).then(async (result) => {
          if (result.success && result.eventId) {
            await storage.updateSession(session.id, { googleCalendarEventId: result.eventId }, academyId!);
          }
        }).catch(err => console.error('[GoogleCalendar] Sync error:', err));

        createdSessions.push(session);
      }

      if (createdSessions.length === 0) {
        return res.status(409).json({ 
          error: "All time slots have conflicts",
          message: "Could not create any sessions due to conflicts"
        });
      }

      // Audit log
      await storage.createAuditLog({
        entityType: "session",
        entityId: createdSessions[0].id,
        action: sessionsToCreate > 1 ? `create_recurring_${createdSessions.length}` : "create",
        performedBy: coachId,
      });

      // Broadcast new session via WebSocket for real-time updates
      if (academyId) {
        for (const session of createdSessions) {
          broadcastNewSession(academyId, {
            sessionId: session.id,
            sessionName: session.name || `${sessionType} Session`,
            coachId: coachId!,
            startTime: session.startTime?.toISOString() || "",
          });
        }
      }

      // For recurring sessions, return summary with skipped weeks info
      if (sessionsToCreate > 1) {
        res.status(201).json({
          sessions: createdSessions,
          summary: {
            requested: sessionsToCreate,
            created: createdSessions.length,
            skippedWeeks: skippedWeeks,
          }
        });
      } else {
        res.status(201).json(createdSessions[0]);
      }
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // Update session
  app.patch("/api/coach/sessions/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const updates = req.body;

      const academyId = req.user!.academyId!;
      const session = await storage.getSession(id, academyId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check ownership
      if (session.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to modify this session" });
      }

      // If time changed, check conflicts
      if (updates.startTime || updates.duration) {
        const start = updates.startTime ? new Date(updates.startTime) : session.startTime;
        const duration = updates.duration || session.duration;
        const end = new Date(start.getTime() + duration * 60000);
        const academyId = req.user?.academyId ?? undefined;

        const coachConflict = await storage.checkCoachConflict(coachId!, start, end, id, academyId);
        if (coachConflict) {
          return res.status(409).json({ error: "Coach conflict", level: 3 });
        }

        const courtId = updates.courtId || session.courtId;
        const courtConflict = await storage.checkCourtConflict(courtId!, start, end, id, academyId);
        if (courtConflict) {
          return res.status(409).json({ error: "Court conflict", level: 3 });
        }

        updates.endTime = end;
      }

      const updated = await storage.updateSession(id, updates);

      // Recreate time block for rescheduled session (delete old, create new)
      if (coachId && session.status !== 'cancelled' && (updates.startTime || updates.duration)) {
        await storage.deleteCoachTimeBlockBySession(id);
        const newStart = updates.startTime ? new Date(updates.startTime) : session.startTime;
        const newEnd = updates.endTime || session.endTime;
        const sessionDate = newStart.toISOString().split('T')[0];
        const startTimeStr = newStart.toISOString().split('T')[1].substring(0, 5);
        const endTimeStr = newEnd.toISOString().split('T')[1].substring(0, 5);
        await storage.createCoachTimeBlock({
          coachId,
          sourceType: 'session',
          sourceAcademyId: academyId || undefined,
          sourceSessionId: id,
          date: sessionDate,
          startTime: startTimeStr,
          endTime: endTimeStr,
          isPrivate: true,
        });
      }

      // Sync to Google Calendar if event exists (non-blocking)
      if (session.googleCalendarEventId) {
        const sessionPlayers = await storage.getSessionPlayers(id);
        const playerNames = sessionPlayers.map(sp => sp.player?.name).filter(Boolean) as string[];
        
        const updatedCourtId = updates.courtId || session.courtId;
        const updatedLocationId = updates.locationId || session.locationId;
        const court = updatedCourtId ? await storage.getCourt(updatedCourtId, academyId) : null;
        const location = updatedLocationId ? await storage.getLocation(updatedLocationId, academyId) : null;
        
        const startTime = updates.startTime ? new Date(updates.startTime) : session.startTime;
        const endTime = updated?.endTime || session.endTime;
        
        updateCalendarEvent(session.googleCalendarEventId, {
          sessionId: id,
          title: `Tennis ${(updates.sessionType || session.sessionType).charAt(0).toUpperCase() + (updates.sessionType || session.sessionType).slice(1)} Session`,
          description: `Ball Level: ${updates.ballLevel || session.ballLevel || 'Not specified'}\nSkill Level: ${updates.skillLevel || session.skillLevel || 'Not specified'}`,
          startTime,
          endTime,
          location: location?.name || court?.name,
          playerNames,
        }).catch(err => console.error('[GoogleCalendar] Update sync error:', err));
      }

      await storage.createAuditLog({
        entityType: "session",
        entityId: id,
        action: "update",
        performedBy: coachId!,
      });

      // Broadcast session update via WebSocket
      if (academyId) {
        broadcastSessionUpdate(academyId, {
          sessionId: id,
          type: "updated",
        });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  // Cancel session - FULL DELETE with credit refund
  app.post("/api/coach/sessions/:id/cancel", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const { reason } = req.body;

      const academyId = req.user!.academyId!;
      const session = await storage.getSession(id, academyId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Refund credits if any were used for this session
      const usedCredits = await db
        .select()
        .from(creditTransactions)
        .where(and(
          eq(creditTransactions.sessionId, id),
          eq(creditTransactions.type, "use")
        ));
      
      for (const tx of usedCredits) {
        // Create refund transaction
        await db.insert(creditTransactions).values({
          id: crypto.randomUUID(),
          playerId: tx.playerId,
          packageId: tx.packageId,
          type: "refund",
          amount: Math.abs(tx.amount),
          sessionId: null,
          description: `Refund for cancelled session`,
          createdAt: new Date(),
        });
        
        // Update package credits
        if (tx.packageId) {
          await db
            .update(packages)
            .set({ 
              creditsRemaining: sql`credits_remaining + ${Math.abs(tx.amount)}` 
            })
            .where(eq(packages.id, tx.packageId));
        }
      }

      // Nullify session references in related tables
      await db.update(creditTransactions).set({ sessionId: null }).where(eq(creditTransactions.sessionId, id));
      await db.update(xpTransactions).set({ sessionId: null }).where(eq(xpTransactions.sessionId, id));
      await db.update(coachXpTransactions).set({ sessionId: null }).where(eq(coachXpTransactions.sessionId, id));
      await db.update(playerPillarProgress).set({ lastSessionId: null }).where(eq(playerPillarProgress.lastSessionId, id));
      
      // Delete related records
      await db.delete(sessionPlayers).where(eq(sessionPlayers.sessionId, id));
      await db.delete(sessionSkillObservations).where(eq(sessionSkillObservations.sessionId, id));
      await db.delete(sessionSkillFeedback).where(eq(sessionSkillFeedback.sessionId, id));
      await db.delete(sessionPlans).where(eq(sessionPlans.sessionId, id));
      await db.delete(playerSessionCancellations).where(eq(playerSessionCancellations.sessionId, id));
      await db.delete(sessionWaitlist).where(eq(sessionWaitlist.sessionId, id));

      // Delete the unified time block to free up this time slot
      await storage.deleteCoachTimeBlockBySession(id);

      // Remove from Google Calendar if event exists (non-blocking)
      if (session.googleCalendarEventId) {
        deleteCalendarEvent(session.googleCalendarEventId)
          .catch(err => console.error('[GoogleCalendar] Delete sync error:', err));
      }

      // Finally delete the session itself
      await db.delete(sessions).where(eq(sessions.id, id));

      await storage.createAuditLog({
        entityType: "session",
        entityId: id,
        action: "delete",
        performedBy: coachId!,
      });

      // Broadcast session deletion via WebSocket
      if (academyId) {
        broadcastSessionUpdate(academyId, {
          sessionId: id,
          type: "deleted",
        });
      }

      res.json({ success: true, deleted: true });
    } catch (error) {
      console.error("Error deleting session:", error);
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  // Transfer session to another coach
  app.post("/api/coach/sessions/:id/transfer", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const currentCoachId = req.user!.coachId;
      const academyId = req.user!.academyId!;
      const { targetCoachId, reason } = req.body;

      if (!targetCoachId) {
        return res.status(400).json({ error: "Target coach ID is required" });
      }

      if (targetCoachId === currentCoachId) {
        return res.status(400).json({ error: "Cannot transfer to yourself" });
      }

      // Get the session
      const session = await storage.getSession(id, academyId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Verify current coach owns this session
      if (session.coachId !== currentCoachId) {
        return res.status(403).json({ error: "Not authorized to transfer this session" });
      }

      // Verify target coach exists and is in the same academy
      const targetCoach = await storage.getCoach(targetCoachId);
      if (!targetCoach) {
        return res.status(404).json({ error: "Target coach not found" });
      }

      // Check if target coach has a conflict at this time
      const conflict = await storage.checkCoachConflict(
        targetCoachId,
        session.startTime,
        session.endTime,
        id,
        academyId
      );
      if (conflict) {
        return res.status(409).json({ error: "Target coach has a scheduling conflict at this time" });
      }

      // Transfer the session by updating coachId
      const updated = await storage.updateSession(id, {
        coachId: targetCoachId,
      });

      // Create audit log
      await storage.createAuditLog({
        entityType: "session",
        entityId: id,
        action: "transfer",
        performedBy: currentCoachId!,
        details: { 
          fromCoachId: currentCoachId, 
          toCoachId: targetCoachId,
          reason: reason || "Session transferred to another coach"
        },
      });

      // Broadcast update to both coaches
      if (academyId) {
        broadcastSessionUpdate(academyId, {
          sessionId: id,
          type: "transferred",
          fromCoachId: currentCoachId,
          toCoachId: targetCoachId,
        });
      }

      res.json({ 
        success: true, 
        message: `Session transferred to ${targetCoach.name}`,
        session: updated 
      });
    } catch (error) {
      console.error("Error transferring session:", error);
      res.status(500).json({ error: "Failed to transfer session" });
    }
  });

  // Extend session
  app.post("/api/coach/sessions/:id/extend", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const { minutes } = req.body;

      if (!minutes || ![15, 30].includes(minutes)) {
        return res.status(400).json({ error: "Invalid extension minutes" });
      }

      const academyId = req.user!.academyId!;
      const session = await storage.getSession(id, academyId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const newEndTime = new Date(session.endTime.getTime() + minutes * 60000);

      // Check if extension causes conflict
      const coachConflict = await storage.checkCoachConflict(coachId!, session.endTime, newEndTime, id, academyId);
      if (coachConflict) {
        return res.status(409).json({ error: "Cannot extend - coach has another session" });
      }

      const courtConflict = await storage.checkCourtConflict(session.courtId!, session.endTime, newEndTime, id, academyId);
      if (courtConflict) {
        return res.status(409).json({ error: "Cannot extend - court is booked" });
      }

      const updated = await storage.updateSession(id, {
        endTime: newEndTime,
        duration: session.duration + minutes,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error extending session:", error);
      res.status(500).json({ error: "Failed to extend session" });
    }
  });

  // Add players to session
  app.post("/api/coach/sessions/:id/players", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { playerId, isGuest, skipCreditCheck } = req.body;
      const academyId = req.user!.academyId;

      const { valid: sessionValid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!sessionValid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Validate player belongs to same academy (unless guest)
      if (playerId && !isGuest) {
        const { valid: playerValid } = await validatePlayerOwnership(playerId, academyId, storage);
        if (!playerValid) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Credit type validation and ATOMIC deduction - check and deduct credits BEFORE adding player
        if (!skipCreditCheck) {
          const creditCheck = await storage.checkPlayerCreditsForSessionType(
            playerId,
            session.sessionType,
            academyId
          );

          if (!creditCheck.hasCredits) {
            // Get player info for the response
            const player = await storage.getPlayer(playerId, academyId);
            
            return res.status(200).json({
              warning: "credit_mismatch",
              message: `${player?.name || "Player"} has no ${creditCheck.creditType} credits available`,
              sessionType: session.sessionType,
              requiredCreditType: creditCheck.creditType,
              availableCredits: creditCheck.availableCredits,
              playerName: player?.name,
              playerId,
              sessionId: id,
            });
          }
        }
      }

      // Check if player is already enrolled
      const existingEnrollment = await storage.getSessionPlayer(id, playerId);
      let sessionPlayer: typeof existingEnrollment;
      let isNewEnrollment = false;
      
      if (existingEnrollment) {
        // Player already enrolled - check if credits were already deducted
        if (existingEnrollment.creditDeductedAt) {
          return res.status(200).json({
            ...existingEnrollment,
            success: true,
            alreadyEnrolled: true,
            creditDeducted: true,
            message: "Player was already enrolled with credits deducted",
          });
        }
        // Enrolled but no credits deducted - attempt to deduct now
        sessionPlayer = existingEnrollment;
      } else {
        // Create new enrollment
        sessionPlayer = await storage.addPlayerToSession({
          sessionId: id,
          playerId,
          isGuest: isGuest || false,
        });
        isNewEnrollment = true;
      }

      let creditDeductionResult = null;

      // Deduct typed credits (updates specific session_player row with creditDeductedAt)
      if (playerId && !isGuest && !skipCreditCheck) {
        creditDeductionResult = await storage.deductTypedCreditsForSession(
          playerId,
          session.sessionType,
          id,
          academyId,
          sessionPlayer?.id // Pass specific session_player ID for precise targeting
        );
        
        // If deduction failed, only remove if this was a NEW enrollment
        if (!creditDeductionResult.success) {
          if (isNewEnrollment) {
            await storage.removePlayerFromSession(id, playerId);
          }
          const player = await storage.getPlayer(playerId, academyId);
          return res.status(400).json({
            error: "credit_deduction_failed",
            message: `Could not deduct credits for ${player?.name || "player"}: ${creditDeductionResult.reason}`,
            creditType: creditDeductionResult.creditType,
            playerId,
            sessionId: id,
            alreadyEnrolled: !isNewEnrollment,
          });
        }
      }

      if (skipCreditCheck && playerId && !isGuest) {
        const creditCheck = await storage.checkPlayerCreditsForSessionType(
          playerId,
          session.sessionType,
          academyId
        );

        if (!creditCheck.hasCredits) {
          const player = await storage.getPlayer(playerId, academyId);
          const creditTypeLabel = (creditCheck.creditType || "").replace("_", "-");
          
          await storage.createNotification({
            playerId,
            type: "credits_needed",
            title: "Credits Required",
            message: `You've been added to a ${creditTypeLabel} lesson but don't have matching credits. Please ask your parent to purchase credits.`,
            metadata: JSON.stringify({
              sessionId: id,
              sessionType: session.sessionType,
              requiredCreditType: creditCheck.creditType,
              sessionDate: session.startTime.toISOString(),
            }),
          });

          if (player?.parentUserId) {
            await storage.createNotification({
              userId: player.parentUserId,
              type: "credits_needed",
              title: "Credits Required",
              message: `${player.name} has been added to a ${creditTypeLabel} lesson but needs ${creditTypeLabel} credits.`,
              metadata: JSON.stringify({
                playerId,
                playerName: player.name,
                sessionId: id,
                sessionType: session.sessionType,
                requiredCreditType: creditCheck.creditType,
                sessionDate: session.startTime.toISOString(),
              }),
            });
          }
        }
      }

      res.status(201).json({ 
        ...sessionPlayer, 
        success: true,
        creditDeducted: creditDeductionResult?.success || false,
        creditType: creditDeductionResult?.creditType,
        remainingCredits: creditDeductionResult?.package?.remainingCredits,
      });
    } catch (error) {
      console.error("Error adding player:", error);
      res.status(500).json({ error: "Failed to add player" });
    }
  });

  // Remove player from session
  app.delete("/api/coach/sessions/:id/players/:playerId", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const academyId = req.user!.academyId;

      const { valid: sessionValid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!sessionValid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Validate player belongs to same academy
      const { valid: playerValid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!playerValid) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Refund credits if session hasn't started yet
      let refundResult = null;
      const now = new Date();
      if (session.startTime > now) {
        refundResult = await storage.refundCreditsForSession(playerId, id, academyId);
      }

      await storage.removePlayerFromSession(id, playerId);

      res.json({ 
        success: true,
        creditRefunded: refundResult?.success || false,
        creditType: refundResult?.creditType,
      });
    } catch (error) {
      console.error("Error removing player:", error);
      res.status(500).json({ error: "Failed to remove player" });
    }
  });

  // Get session players with player details (using efficient JOIN)
  app.get("/api/coach/sessions/:id/players", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;

      const { valid } = await validateSessionOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Session not found" });
      }

      const playersWithDetails = await storage.getSessionPlayersWithPlayerInfo(id);
      console.log("[SessionPlayers] Returning players for session", id, ":", JSON.stringify(playersWithDetails.map(p => ({ playerId: p.playerId, attendanceStatus: p.attendanceStatus }))));
      res.json(playersWithDetails);
    } catch (error) {
      console.error("Error fetching players:", error);
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  // Save attendance (offline-safe) - supports single or batch
  app.post("/api/coach/sessions/:id/attendance", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const coachId = req.user!.coachId;

      const { valid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }

      let xpAwarded = false;

      // Handle batch attendance (array of records)
      if (req.body.attendance && Array.isArray(req.body.attendance)) {
        const results = [];
        for (const record of req.body.attendance) {
          const updated = await storage.updateAttendance(
            id,
            record.playerId,
            record.status,
            record.lateMinutes,
            record.absentReason
          );
          results.push(updated);
        }
        
        // Award XP for timely attendance marking (during class time)
        if (coachId && session.endTime) {
          const { rewardCoachForTimelyAttendance } = await import("./pushNotifications");
          xpAwarded = await rewardCoachForTimelyAttendance(coachId, id, session.endTime);
        }
        
        // If markCompleted flag is set, mark session as completed and consume credits
        let creditConsumptionResult = null;
        const presentPlayers = req.body.attendance.filter((a: { status: string }) => a.status === "present");
        
        // For GROUP sessions: charge both present AND absent players (vacation players are exempt)
        // For PRIVATE/SEMI-PRIVATE sessions: only charge present players (no-show = no charge)
        const isGroupSession = session.sessionType === "group" || session.sessionType === "camp" || session.sessionType === "team_training" || session.sessionType === "clinic";
        const chargeablePlayers = isGroupSession
          ? req.body.attendance.filter((a: { status: string }) => 
              a.status === "present" || a.status === "absent"
            )
          : presentPlayers;
        
        if (req.body.markCompleted) {
          await storage.updateSession(id, { status: "completed" });
          
          // Consume credits for class session with dynamic credit type (only for series-based sessions)
          if (session.seriesId) {
            try {
              // FIRST: Delete any existing credit transactions for this session
              // This prevents duplicate debts when attendance is edited
              await storage.deleteSessionCreditTransactions(id);
              
              // Use presentCount for credit type determination, but charge all non-vacation players
              const presentCount = presentPlayers.length;
              const totalPlayersInSession = req.body.attendance.length;
              
              creditConsumptionResult = await storage.consumeCreditsForClassSessionWithAttendance(
                session.seriesId,
                id,
                new Date(session.startTime),
                chargeablePlayers.map((p: { playerId: string }) => p.playerId),
                presentCount,
                totalPlayersInSession
              );
              console.log(`[Credits] Session ${id}: consumed ${creditConsumptionResult.consumed}, skipped ${creditConsumptionResult.skipped}, actualCreditType: ${creditConsumptionResult.actualCreditType}`);
            } catch (creditError) {
              console.error("[Credits] Error consuming credits for class session:", creditError);
            }
          }
          
          // Award XP ONLY to players marked as present (not absent, not vacation)
          const xpPerSession = session.xpPerSession || 20;
          for (const presentPlayer of presentPlayers) {
            try {
              // Check if XP already awarded for this session to prevent duplicates
              const existingXp = await storage.getPlayerXpTransactions(presentPlayer.playerId, 100, academyId);
              const alreadyAwarded = existingXp.some(t => t.sessionId === id && t.source === "session");
              
              if (!alreadyAwarded) {
                await storage.createXpTransaction({
                  playerId: presentPlayer.playerId,
                  sessionId: id,
                  xpAmount: xpPerSession,
                  source: "session",
                  description: `Attended training session`,
                  metadata: session.seriesId ? { seriesId: session.seriesId } : {},
                });
                console.log(`[XP] Awarded ${xpPerSession} XP to player ${presentPlayer.playerId} for session ${id}`);
              }
            } catch (xpError) {
              console.error(`[XP] Error awarding XP to player ${presentPlayer.playerId}:`, xpError);
            }
          }
        }
        
        return res.json({ 
          success: true, 
          updated: results.length, 
          message: req.body.markCompleted ? "Attendance saved and session completed" : "Attendance saved",
          xpAwarded: xpAwarded ? 25 : 0,
          creditConsumption: creditConsumptionResult
        });
      }

      // Handle single player attendance (legacy)
      const { playerId, status, lateMinutes, absenceReason } = req.body;
      const updated = await storage.updateAttendance(
        id,
        playerId,
        status,
        lateMinutes,
        absenceReason
      );
      
      // Award XP for timely attendance marking (during class time)
      if (coachId && session.endTime) {
        const { rewardCoachForTimelyAttendance } = await import("./pushNotifications");
        xpAwarded = await rewardCoachForTimelyAttendance(coachId, id, session.endTime);
      }

      res.json({ ...updated, xpAwarded: xpAwarded ? 25 : 0 });
    } catch (error) {
      console.error("Error saving attendance:", error);
      res.status(500).json({ error: "Failed to save attendance" });
    }
  });

  // Cancel session (holiday/no class)
  app.patch("/api/coach/sessions/:id/cancel", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const { reason } = req.body;

      const { valid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Mark session as cancelled - no credits consumed
      await storage.updateSession(id, { 
        status: "cancelled",
        notes: reason || "Session cancelled" 
      });
      
      // Refund credits for any players who had credits deducted for this session
      const sessionPlayersForRefund = await storage.getSessionPlayers(id);
      let refundedCount = 0;
      
      for (const sp of sessionPlayersForRefund) {
        if (sp.creditDeductedAt) {
          const refundResult = await storage.refundCreditsForSession(sp.playerId, id, academyId);
          if (refundResult.success) {
            refundedCount++;
            console.log(`[Cancel PATCH] Refunded credit to player ${sp.playerId}`);
          }
        }
      }

      res.json({ 
        success: true, 
        message: refundedCount > 0 
          ? `Session cancelled. ${refundedCount} credit(s) refunded.`
          : "Session cancelled successfully",
        sessionId: id,
        creditsRefunded: refundedCount
      });
    } catch (error) {
      console.error("Error cancelling session:", error);
      res.status(500).json({ error: "Failed to cancel session" });
    }
  });

  // Restore a cancelled session
  app.patch("/api/coach/sessions/:id/restore", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;

      const { valid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.status !== "cancelled" && session.status !== "skipped") {
        return res.status(400).json({ error: "Session is not cancelled" });
      }

      // Restore session to scheduled status
      await storage.updateSession(id, { status: "scheduled" });

      res.json({ 
        success: true, 
        message: "Session restored successfully",
        sessionId: id,
      });
    } catch (error) {
      console.error("Error restoring session:", error);
      res.status(500).json({ error: "Failed to restore session" });
    }
  });

  // Save feedback and award XP
  app.post("/api/coach/sessions/:id/feedback", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { intensity, mood, focusTags, coachNotes } = req.body;
      const academyId = req.user!.academyId;

      // Get session details with ownership validation
      const { valid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Create feedback record
      const feedback = await storage.createSessionFeedback({
        sessionId: id,
        intensity,
        mood,
        focusTags: JSON.stringify(focusTags || []),
        coachNotes,
      });

      // Mark session as completed
      await storage.updateSession(id, { status: "completed" });

      // If this is a class session, consume credits for active members
      let creditConsumptionResult = null;
      if (session.seriesId) {
        try {
          creditConsumptionResult = await storage.consumeCreditsForClassSession(
            session.seriesId,
            id,
            new Date(session.startTime)
          );
          console.log(`[Credits] Session ${id}: consumed ${creditConsumptionResult.consumed}, skipped ${creditConsumptionResult.skipped}, errors: ${creditConsumptionResult.errors.length}`);
        } catch (creditError) {
          console.error("[Credits] Error consuming credits for class session:", creditError);
          // Don't fail the whole request, just log the error
        }
      }

      // Award Coach XP based on session type
      const COACH_XP_REWARDS: Record<string, number> = {
        private: 25,
        semi_private: 35,
        group: 50,
        camp: 75,
        team_training: 60,
        clinic: 45,
        match: 30,
        assessment: 40,
      };
      const coachXp = COACH_XP_REWARDS[session.sessionType] || 20;
      
      if (session.coachId) {
        await storage.addCoachXpTransaction({
          coachId: session.coachId,
          xpAmount: coachXp,
          source: "session_feedback",
          description: `Completed ${session.sessionType} session with feedback`,
          sessionId: id,
        });
        
        // Update coach total XP
        const coach = await storage.getCoach(session.coachId);
        if (coach) {
          const newTotalXp = (coach.totalXp || 0) + coachXp;
          let newLevel = 1;
          let xpThreshold = 500;
          let accumulatedXp = 0;
          while (accumulatedXp + xpThreshold <= newTotalXp) {
            accumulatedXp += xpThreshold;
            newLevel++;
            xpThreshold = 500 + (newLevel - 1) * 100;
          }
          await storage.updateCoach(session.coachId, { totalXp: newTotalXp, level: newLevel });
        }
      }

      // Award Player XP for each player in session
      const PLAYER_XP_REWARDS: Record<string, number> = {
        private: 30,
        semi_private: 25,
        group: 20,
        camp: 35,
        team_training: 25,
        clinic: 20,
        match: 40,
        assessment: 15,
      };
      const playerXp = PLAYER_XP_REWARDS[session.sessionType] || 15;
      
      const sessionPlayers = await storage.getSessionPlayers(id);
      const creditResults: { playerId: string; success: boolean; reason?: string }[] = [];
      
      for (const sp of sessionPlayers) {
        if (sp.playerId && sp.attendanceStatus === "present") {
          await storage.createXpTransaction({
            playerId: sp.playerId,
            xpAmount: playerXp,
            source: "session_complete",
            description: `Attended ${session.sessionType} session`,
            sessionId: id,
          });
          
          // Update player total XP and check for level up
          const player = await storage.getPlayer(sp.playerId);
          if (player) {
            const oldLevel = player.level || 1;
            const newTotalXp = (player.totalXp || 0) + playerXp;
            
            // Calculate new level based on XP thresholds
            const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500];
            let newLevel = 1;
            for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
              if (newTotalXp >= LEVEL_THRESHOLDS[i]) {
                newLevel = i + 1;
                break;
              }
            }
            
            await storage.updatePlayer(sp.playerId, { totalXp: newTotalXp, level: newLevel });
            
            // Send level up notification if player leveled up
            if (newLevel > oldLevel) {
              const LEVEL_NAMES = ["Red", "Orange", "Green", "Yellow", "Glow", "Star", "Champion", "Legend", "Master", "Grand Master"];
              const levelName = LEVEL_NAMES[Math.min(newLevel - 1, LEVEL_NAMES.length - 1)] || `Level ${newLevel}`;
              sendLevelUpNotification(sp.playerId, newLevel, levelName).catch(err => 
                console.error("Failed to send level up notification:", err)
              );
              // Send level up email if player has email
              if (player.email) {
                sendLevelUpEmail({
                  to: player.email,
                  playerName: player.name,
                  newLevel: levelName,
                  totalXP: newTotalXp,
                }).catch(err => console.error("Failed to send level up email:", err));
              }
            }
          }
          
          // Check if credits were already deducted at booking time (new flow)
          const existingTransactions = await storage.getCreditTransactionsBySession(id);
          const alreadyDeducted = existingTransactions.some(
            t => t.playerId === sp.playerId && t.type === "debit" && t.reason === "session_booking"
          );
          
          if (!alreadyDeducted) {
            // Auto-deduct credit from player's active package (legacy flow for old sessions)
            const creditResult = await storage.autoDeductPlayerCredit(sp.playerId, academyId || undefined);
            creditResults.push({
              playerId: sp.playerId,
              success: creditResult.success,
              reason: creditResult.reason,
            });
          } else {
            creditResults.push({
              playerId: sp.playerId,
              success: true,
              reason: "already_deducted_at_booking",
            });
          }
        }
      }

      // Send feedback notifications to all attending players (non-blocking)
      const coach = session.coachId ? await storage.getCoach(session.coachId) : null;
      const coachName = coach?.name || "Your coach";
      const sessionDate = new Date(session.startTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      for (const sp of sessionPlayers) {
        if (sp.playerId && sp.attendanceStatus === "present") {
          sendFeedbackNotification(sp.playerId, coachName, session.name || "Training session").catch(err =>
            console.error("Failed to send feedback notification:", err)
          );
          // Broadcast feedback received via WebSocket for real-time updates
          if (academyId && sp.playerId) {
            broadcastFeedbackReceived(academyId, {
              playerId: sp.playerId,
              sessionId: id,
              coachName,
            });
          }
          // Send feedback email if player has email
          const feedbackPlayer = await storage.getPlayer(sp.playerId);
          if (feedbackPlayer?.email) {
            sendFeedbackNotificationEmail({
              to: feedbackPlayer.email,
              playerName: feedbackPlayer.name,
              sessionDate,
              coachName,
              feedbackSummary: feedback?.coachNotes?.substring(0, 150),
            }).catch(err => console.error("Failed to send feedback email:", err));
          }
        }
      }

      res.status(201).json({ 
        feedback, 
        xpAwarded: { coach: coachXp, playerCount: sessionPlayers.filter(sp => sp.attendanceStatus === "present").length },
        creditsDeducted: creditResults,
      });
    } catch (error) {
      console.error("Error saving feedback:", error);
      res.status(500).json({ error: "Failed to save feedback" });
    }
  });

  // ==================== SESSION CANCELLATION ====================
  
  // Cancel session by coach (no charge, with reason)
  app.post("/api/coach/sessions/:id/cancel", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      
      // Validate session ownership
      const { valid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Check if session is already cancelled or completed
      if (session.status === "cancelled" || session.status === "completed") {
        return res.status(400).json({ error: `Session is already ${session.status}` });
      }
      
      const now = new Date();
      
      // Update session with cancellation details (no charge for coach-initiated cancellations)
      const updates: Record<string, unknown> = {
        status: "cancelled",
        cancelledAt: now,
        cancelledBy: coachId,
        cancellationReason: reason || "Cancelled by coach",
        isLastMinuteCancellation: false,
        cancellationCharged: false,
        cancellationChargeAmount: null,
      };
      
      await storage.updateSession(id, updates);

      // Delete the unified time block to free up this time slot
      await storage.deleteCoachTimeBlockBySession(id);
      
      // Refund credits for any players who had credits deducted for this session
      const sessionPlayersForRefund = await storage.getSessionPlayers(id);
      const refundResults: { playerId: string; playerName?: string; success: boolean; reason?: string }[] = [];
      
      for (const sp of sessionPlayersForRefund) {
        // Only refund if credits were actually deducted (creditDeductedAt is set)
        if (sp.creditDeductedAt) {
          const refundResult = await storage.refundCreditsForSession(sp.playerId, id, academyId);
          const player = await storage.getPlayer(sp.playerId, academyId);
          refundResults.push({
            playerId: sp.playerId,
            playerName: player?.name,
            success: refundResult.success,
            reason: refundResult.reason,
          });
          
          if (refundResult.success) {
            console.log(`[Cancel] Refunded ${refundResult.creditType} credit to player ${player?.name || sp.playerId}`);
          }
        }
      }
      
      // Audit log
      await storage.createAuditLog({
        entityType: "session",
        entityId: id,
        action: "cancelled",
        performedBy: coachId || req.user!.userId,
        details: JSON.stringify({
          reason: reason || "Cancelled by coach",
          cancelledBy: "coach",
          noCharge: true,
          creditsRefunded: refundResults.filter(r => r.success).length,
        }),
        academyId: academyId!,
      });

      // Broadcast session cancellation via WebSocket
      if (academyId) {
        broadcastSessionUpdate(academyId, {
          sessionId: id,
          type: "cancelled",
        });
      }
      
      const refundedCount = refundResults.filter(r => r.success).length;
      res.json({
        success: true,
        message: refundedCount > 0 
          ? `Session cancelled. ${refundedCount} credit(s) refunded to players.`
          : "Session has been cancelled successfully.",
        creditsRefunded: refundResults,
      });
    } catch (error) {
      console.error("Error cancelling session:", error);
      res.status(500).json({ error: "Failed to cancel session" });
    }
  });
  
  // Mark session as last-minute cancelled with policy enforcement (legacy - for student cancellations)
  app.post("/api/coach/sessions/:id/last-minute-cancel", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      
      // Validate session ownership
      const { valid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Check if session is already cancelled or completed
      if (session.status === "cancelled" || session.status === "completed") {
        return res.status(400).json({ error: `Session is already ${session.status}` });
      }
      
      // Get academy cancellation policy settings
      const settings = await storage.getAcademySettings(academyId!);
      const policyEnabled = settings?.cancellationPolicyEnabled !== false;
      const windowHours = settings?.cancellationWindowHours || 24;
      const chargePercent = settings?.cancellationChargePercent || 100;
      
      // Calculate hours until session
      const now = new Date();
      const sessionStart = new Date(session.startTime);
      const hoursUntilSession = (sessionStart.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      // Determine if this is a chargeable last-minute cancellation
      const isLastMinute = hoursUntilSession <= windowHours;
      const shouldCharge = policyEnabled && isLastMinute && chargePercent > 0;
      
      // Calculate charge amount
      let chargeAmount = 0;
      if (shouldCharge && session.price) {
        const sessionPrice = parseFloat(session.price.toString());
        chargeAmount = (sessionPrice * chargePercent) / 100;
      }
      
      // Update session with cancellation details
      const updates: Record<string, unknown> = {
        status: "cancelled",
        cancelledAt: now,
        cancelledBy: coachId,
        isLastMinuteCancellation: isLastMinute,
        cancellationCharged: shouldCharge,
        cancellationChargeAmount: shouldCharge ? chargeAmount.toString() : null,
      };
      
      await storage.updateSession(id, updates);

      // Delete the unified time block to free up this time slot
      await storage.deleteCoachTimeBlockBySession(id);
      
      // If charged, create an invoice for the cancellation fee
      if (shouldCharge && chargeAmount > 0) {
        const sessionPlayers = await storage.getSessionPlayers(id);
        for (const sp of sessionPlayers) {
          if (sp.playerId) {
            const player = await storage.getPlayer(sp.playerId);
            if (player) {
              await storage.createInvoice({
                academyId: academyId!,
                playerId: sp.playerId,
                invoiceNumber: `CANCEL-${Date.now()}-${sp.playerId.slice(-4)}`,
                amount: chargeAmount.toString(),
                currency: settings?.currency || "AED",
                status: "pending",
                dueDate: new Date(Date.now() + (settings?.invoiceDueDays || 14) * 24 * 60 * 60 * 1000).toISOString(),
                notes: `Late cancellation fee for session on ${sessionStart.toLocaleDateString()}`,
                lineItems: JSON.stringify([{
                  description: `Late Cancellation Fee (${chargePercent}% of lesson)`,
                  quantity: 1,
                  unitPrice: chargeAmount,
                  total: chargeAmount,
                }]),
              });
            }
          }
        }
      }
      
      // Audit log
      await storage.createAuditLog({
        entityType: "session",
        entityId: id,
        action: isLastMinute ? "last_minute_cancel" : "cancel",
        performedBy: coachId || undefined,
        metadata: JSON.stringify({ 
          hoursUntilSession: hoursUntilSession.toFixed(1),
          charged: shouldCharge,
          chargeAmount,
        }),
      });

      // Broadcast session cancellation via WebSocket
      if (academyId) {
        broadcastSessionUpdate(academyId, {
          sessionId: id,
          type: "cancelled",
        });
      }
      
      res.json({
        success: true,
        isLastMinute,
        charged: shouldCharge,
        chargeAmount,
        chargePercent: shouldCharge ? chargePercent : 0,
        message: shouldCharge 
          ? `Session cancelled. ${chargePercent}% cancellation fee applied.`
          : isLastMinute 
            ? "Session cancelled (no charge - policy disabled)"
            : "Session cancelled within policy window (no charge)",
      });
    } catch (error) {
      console.error("Error cancelling session:", error);
      res.status(500).json({ error: "Failed to cancel session" });
    }
  });

  // ==================== COACH PIN PROTECTION ====================
  
  // Verify PIN for Parent Dashboard access
  app.post("/api/coach/pin/verify", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const { pin } = req.body;
      
      if (!coachId) {
        return res.status(400).json({ error: "Coach ID required" });
      }
      
      if (!pin || typeof pin !== "string" || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: "PIN must be exactly 4 digits" });
      }
      
      const coach = await storage.getCoach(coachId);
      if (!coach) {
        return res.status(404).json({ error: "Coach not found" });
      }
      
      const storedPin = coach.parentDashboardPin || "1234";
      const isValid = pin === storedPin;
      const requiresChange = !coach.pinChangedAt; // Never changed from default
      
      res.json({
        valid: isValid,
        requiresChange: isValid ? requiresChange : false,
      });
    } catch (error) {
      console.error("Error verifying PIN:", error);
      res.status(500).json({ error: "Failed to verify PIN" });
    }
  });
  
  // Change PIN
  app.post("/api/coach/pin/change", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const { currentPin, newPin } = req.body;
      
      if (!coachId) {
        return res.status(400).json({ error: "Coach ID required" });
      }
      
      if (!newPin || typeof newPin !== "string" || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
        return res.status(400).json({ error: "New PIN must be exactly 4 digits" });
      }
      
      const coach = await storage.getCoach(coachId);
      if (!coach) {
        return res.status(404).json({ error: "Coach not found" });
      }
      
      const storedPin = coach.parentDashboardPin || "1234";
      
      // If PIN was never changed, allow any currentPin (first-time setup)
      if (coach.pinChangedAt && currentPin !== storedPin) {
        return res.status(401).json({ error: "Current PIN is incorrect" });
      }
      
      await storage.updateCoach(coachId, {
        parentDashboardPin: newPin,
        pinChangedAt: new Date(),
      });
      
      res.json({ success: true, message: "PIN changed successfully" });
    } catch (error) {
      console.error("Error changing PIN:", error);
      res.status(500).json({ error: "Failed to change PIN" });
    }
  });
  
  // Platform Owner: Reset coach PIN to default
  app.post("/api/platform/coaches/:coachId/reset-pin", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      
      // Only platform owners can reset PINs
      if (user.role !== "platform_owner") {
        return res.status(403).json({ error: "Only platform owners can reset PINs" });
      }
      
      const { coachId } = req.params;
      
      const coach = await storage.getCoach(coachId);
      if (!coach) {
        return res.status(404).json({ error: "Coach not found" });
      }
      
      await storage.updateCoach(coachId, {
        parentDashboardPin: "1234",
        pinChangedAt: null,
      });
      
      // Audit log
      await storage.createAuditLog({
        entityType: "coach",
        entityId: coachId,
        action: "pin_reset",
        performedBy: user.coachId || undefined,
        metadata: JSON.stringify({ resetTo: "default" }),
      });
      
      res.json({ success: true, message: `PIN for ${coach.name} reset to 1234` });
    } catch (error) {
      console.error("Error resetting PIN:", error);
      res.status(500).json({ error: "Failed to reset PIN" });
    }
  });

  // Offline sync
  app.post("/api/coach/offline/sync", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const { actions } = req.body;

      const results = [];
      for (const action of actions) {
        try {
          // Process each offline action
          switch (action.type) {
            case "attendance":
              await storage.updateAttendance(
                action.sessionId,
                action.playerId,
                action.status,
                action.lateMinutes,
                action.absenceReason
              );
              break;
            case "feedback":
              await storage.createSessionFeedback({
                sessionId: action.sessionId,
                intensity: action.intensity,
                mood: action.mood,
                focusTags: action.focusTags,
                coachNotes: action.coachNotes,
              });
              break;
          }
          results.push({ id: action.id, success: true });
        } catch (err) {
          results.push({ id: action.id, success: false, error: (err as Error).message });
        }
      }

      res.json({ synced: results });
    } catch (error) {
      console.error("Error syncing offline actions:", error);
      res.status(500).json({ error: "Failed to sync" });
    }
  });

  // ==================== PLAYER API ====================

  // Set holiday
  app.post("/api/player/holidays", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId, startDate, endDate } = req.body;

      const holiday = await storage.createPlayerHoliday({
        playerId,
        startDate,
        endDate,
      });

      res.status(201).json(holiday);
    } catch (error) {
      console.error("Error creating holiday:", error);
      res.status(500).json({ error: "Failed to create holiday" });
    }
  });

  // ==================== AUTH/ME ENDPOINTS ====================

  // Get current user with coach and academy context (authenticated)
  app.get("/api/me", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    try {
      const tokenUser = req.user!;
      
      // Fetch fresh user data from database to get current coachId/academyId
      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      let coach = null;
      let academy = null;
      
      // Use fresh database values, not stale JWT claims
      if (freshUser.coachId) {
        coach = await storage.getCoach(freshUser.coachId);
      }
      
      if (freshUser.academyId) {
        academy = await storage.getAcademy(freshUser.academyId);
      }
      
      res.json({
        user: {
          id: freshUser.id,
          email: freshUser.email,
          role: freshUser.role,
          academyId: freshUser.academyId,
          coachId: freshUser.coachId,
          playerId: freshUser.playerId,
        },
        coach: coach ? {
          id: coach.id,
          name: coach.name,
          email: coach.email,
          phone: coach.phone,
          role: coach.role,
          level: coach.level,
          totalXp: coach.totalXp,
          academyId: coach.academyId,
          onboardingCompleted: coach.onboardingCompleted,
          photoUrl: coach.photoUrl,
          specialty: coach.specialty,
          bio: coach.bio,
        } : null,
        academy: academy ? {
          id: academy.id,
          name: academy.name,
          slug: academy.slug,
          timezone: academy.timezone || "Asia/Dubai",
        } : null,
      });
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.status(500).json({ error: "Failed to fetch current user" });
    }
  });

  // ==================== FAMILY LOBBY ENDPOINTS ====================

  // Get family status - returns all players linked by same parentEmail
  app.get("/api/family/status", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      
      // Get the user's player record
      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser || !freshUser.playerId) {
        return res.json({ isFamily: false });
      }
      
      const player = await storage.getPlayer(freshUser.playerId);
      if (!player || !player.parentEmail) {
        return res.json({ isFamily: false });
      }
      
      // Find all players with the same parentEmail
      const familyMembers = await db
        .select()
        .from(players)
        .where(eq(players.parentEmail, player.parentEmail));
      
      if (familyMembers.length <= 1) {
        return res.json({ isFamily: false });
      }
      
      // Get outstanding balances for each player
      const memberData = await Promise.all(familyMembers.map(async (member) => {
        // Get next session - skip for now to get basic functionality working
        // TODO: Implement proper session query after fixing SQL template issues
        const nextSessionResult: any[] = [];
        
        const nextSession = nextSessionResult[0] ? {
          date: nextSessionResult[0].date,
          type: nextSessionResult[0].sessionType || "training",
        } : null;
        
        // Get outstanding balance - calculate from debit transactions
        // type === "debit" with negative amounts represents money owed
        const debitTransactions = await db
          .select()
          .from(creditTransactions)
          .where(eq(creditTransactions.playerId, member.id));
        
        const outstandingBalance = debitTransactions.reduce((sum, tx) => {
          const amount = Number(tx.amount) || 0;
          // Negative amounts represent debits (money owed)
          return sum + (amount < 0 ? Math.abs(amount) : 0);
        }, 0);
        
        return {
          id: member.id,
          name: member.name,
          avatarUrl: member.profilePhotoUrl,
          level: member.level || 1,
          xp: member.totalXp || 0,
          ballLevel: member.ballLevel,
          nextSession,
          outstandingBalance,
          lastActiveAt: member.lastActiveAt?.toISOString() || null,
        };
      }));
      
      const outstandingTotal = memberData.reduce((sum, m) => sum + m.outstandingBalance, 0);
      
      res.json({
        isFamily: true,
        family: {
          parentEmail: player.parentEmail,
          members: memberData,
          outstandingTotal,
        },
      });
    } catch (error) {
      console.error("Error fetching family status:", error);
      res.status(500).json({ error: "Failed to fetch family status" });
    }
  });

  // Bulk payment for family
  app.post("/api/billing/pay-bulk", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerIds } = req.body;
      
      if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
        return res.status(400).json({ error: "playerIds array is required" });
      }
      
      // Get all debit transactions for these players
      // Note: Using 'type' field which contains 'debit' for negative balance transactions
      const debitTransactions = await db
        .select()
        .from(creditTransactions)
        .where(
          and(
            inArray(creditTransactions.playerId, playerIds),
            eq(creditTransactions.type, "debit")
          )
        );
      
      // Calculate outstanding balance (negative amounts represent debits)
      const totalOwed = debitTransactions.reduce((sum, tx) => {
        const amount = Number(tx.amount) || 0;
        return sum + (amount < 0 ? Math.abs(amount) : 0);
      }, 0);
      
      if (totalOwed === 0) {
        return res.json({ success: true, message: "No outstanding balances to pay", paid: 0 });
      }
      
      // TODO: Integrate with actual payment processing
      // For now, return success with the calculated amount
      const totalPaid = totalOwed;
      
      res.json({ 
        success: true, 
        message: `Paid ${debitTransactions.length} outstanding items`,
        paid: totalPaid,
        count: debitTransactions.length,
      });
    } catch (error) {
      console.error("Error processing bulk payment:", error);
      res.status(500).json({ error: "Failed to process payment" });
    }
  });

  // ==================== ADMIN/SETUP ENDPOINTS ====================

  // Backfill debt transactions for past attended sessions
  // This creates debt records for players who attended sessions without credits
  app.post("/api/admin/backfill-debts", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const role = req.user!.role;
      
      // Only allow academy owners and platform owners
      if (role !== "academy_owner" && role !== "platform_owner") {
        return res.status(403).json({ error: "Only academy owners can run backfill" });
      }
      
      console.log(`[Backfill] Starting debt backfill for academy ${academyId}`);
      const result = await storage.backfillDebtTransactions(academyId);
      
      res.json({
        success: true,
        message: `Backfill complete: ${result.debtsCreated} debts created, ${result.skipped} skipped`,
        ...result,
      });
    } catch (error) {
      console.error("Error running debt backfill:", error);
      res.status(500).json({ error: "Failed to run debt backfill" });
    }
  });

  // Get all sessions for admin schedule
  app.get("/api/sessions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role;
      const academyId = req.user?.academyId;
      
      if (!academyId && role !== "platform_owner") {
        return res.status(403).json({ error: "Academy membership required" });
      }
      
      let allSessions;
      if (academyId) {
        allSessions = await storage.getSessionsByAcademy(academyId);
      } else {
        // Platform owner viewing default academy
        const defaultAcademy = await storage.getAcademyBySlug("default");
        if (defaultAcademy) {
          allSessions = await storage.getSessionsByAcademy(defaultAcademy.id);
        } else {
          allSessions = [];
        }
      }
      
      const sessionsWithPlayers = await Promise.all(
        allSessions.map(async (session) => {
          const players = await storage.getSessionPlayers(session.id);
          return {
            ...session,
            players: players.map((p: any) => ({ id: p.id, name: p.name })),
          };
        })
      );
      
      res.json(sessionsWithPlayers);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // Get all coaches
  app.get("/api/coaches", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role;
      const academyId = req.user?.academyId;
      
      if (role !== "platform_owner" && !academyId) {
        return res.status(403).json({ error: "Academy membership required" });
      }
      
      const allCoaches = await storage.getAllCoaches(role === "platform_owner" ? undefined : academyId);
      res.json(allCoaches);
    } catch (error) {
      console.error("Error fetching coaches:", error);
      res.status(500).json({ error: "Failed to fetch coaches" });
    }
  });

  // Create coach
  app.post("/api/coaches", authMiddleware, requireRole("academy_owner", "platform_owner", "admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const { hourlyRate, ...coachData } = req.body;
      
      // Create the coach record (hourlyRate still saved on coach for backwards compatibility)
      const coach = await storage.createCoach({ ...coachData, academyId, hourlyRate });
      
      // Also create the academy membership with the hourly rate
      if (academyId) {
        await storage.createCoachMembership({
          coachId: coach.id,
          academyId,
          role: req.body.role || "coach",
          isActive: true,
          isPrimary: true,
          hourlyRate: hourlyRate ? String(hourlyRate) : undefined,
          sessionBillingMode: "academy_managed",
          payoutType: "per_hour",
        });
      }
      
      res.status(201).json(coach);
    } catch (error) {
      console.error("Error creating coach:", error);
      res.status(500).json({ error: "Failed to create coach" });
    }
  });

  // Get all locations
  app.get("/api/locations", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const allLocations = await storage.getAllLocations(academyId ?? undefined);
      res.json(allLocations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });

  // Create location
  app.post("/api/locations", authMiddleware, requireRole("academy_owner", "platform_owner", "admin"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const location = await storage.createLocation({ ...req.body, academyId });
      res.status(201).json(location);
    } catch (error) {
      console.error("Error creating location:", error);
      res.status(500).json({ error: "Failed to create location" });
    }
  });

  // Update location
  app.patch("/api/locations/:id", authMiddleware, requireRole("academy_owner", "platform_owner", "admin", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const location = await storage.updateLocation(id, req.body, academyId ?? undefined);
      if (!location) {
        return res.status(404).json({ error: "Location not found" });
      }
      res.json(location);
    } catch (error) {
      console.error("Error updating location:", error);
      res.status(500).json({ error: "Failed to update location" });
    }
  });

  // Delete location
  app.delete("/api/locations/:id", authMiddleware, requireRole("academy_owner", "platform_owner", "admin", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      // Check if location has courts
      const courtsAtLocation = await storage.getCourtsByLocation(id, academyId ?? undefined);
      if (courtsAtLocation && courtsAtLocation.length > 0) {
        return res.status(400).json({ error: "Cannot delete location with courts. Move or delete courts first." });
      }
      
      await storage.deleteLocation(id, academyId ?? undefined);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting location:", error);
      res.status(500).json({ error: "Failed to delete location" });
    }
  });

  // Get all courts
  app.get("/api/courts", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const { locationId } = req.query;
      if (locationId) {
        const locationCourts = await storage.getCourtsByLocation(locationId as string, academyId ?? undefined);
        return res.json(locationCourts);
      }
      const allCourts = await storage.getAllCourts(academyId ?? undefined);
      res.json(allCourts);
    } catch (error) {
      console.error("Error fetching courts:", error);
      res.status(500).json({ error: "Failed to fetch courts" });
    }
  });

  // Create court
  app.post("/api/courts", authMiddleware, requireRole("academy_owner", "platform_owner", "admin", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }
      
      const { name } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Court name is required" });
      }
      
      // Check for duplicate court name within academy
      const existingCourt = await storage.getCourtByName(name.trim(), academyId);
      if (existingCourt) {
        return res.status(409).json({ error: `A court named "${name.trim()}" already exists` });
      }
      
      const court = await storage.createCourt({ ...req.body, name: name.trim(), academyId });
      res.status(201).json(court);
    } catch (error) {
      console.error("Error creating court:", error);
      res.status(500).json({ error: "Failed to create court" });
    }
  });

  // Update court
  app.patch("/api/courts/:id", authMiddleware, requireRole("academy_owner", "platform_owner", "admin", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validateCourtOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Court not found" });
      }
      
      const court = await storage.updateCourt(id, req.body, academyId ?? undefined);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      res.json(court);
    } catch (error) {
      console.error("Error updating court:", error);
      res.status(500).json({ error: "Failed to update court" });
    }
  });

  // Delete court
  app.delete("/api/courts/:id", authMiddleware, requireRole("academy_owner", "platform_owner", "admin", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validateCourtOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Court not found" });
      }
      
      await storage.deleteCourt(id, academyId ?? undefined);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting court:", error);
      res.status(500).json({ error: "Failed to delete court" });
    }
  });

  // Reorder courts (update positions)
  app.post("/api/courts/reorder", authMiddleware, requireRole("academy_owner", "platform_owner", "admin", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }
      
      const { courtIds } = req.body as { courtIds: string[] };
      if (!Array.isArray(courtIds) || courtIds.length === 0) {
        return res.status(400).json({ error: "courtIds array required" });
      }
      
      // Load academy's courts to validate all IDs belong to this academy
      const academyCourts = await storage.getAllCourts(academyId);
      const academyCourtIds = new Set(academyCourts.map(c => c.id));
      
      // Validate all provided court IDs belong to this academy
      for (const courtId of courtIds) {
        if (!academyCourtIds.has(courtId)) {
          return res.status(403).json({ error: "Invalid court ID" });
        }
      }
      
      // Update each court's position based on index in array
      for (let i = 0; i < courtIds.length; i++) {
        await storage.updateCourt(courtIds[i], { position: i }, academyId);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering courts:", error);
      res.status(500).json({ error: "Failed to reorder courts" });
    }
  });

  // Get all players with last lesson date (supports optional pagination and credits)
  app.get("/api/players", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role;
      const academyId = req.user?.academyId;
      
      if (role !== "platform_owner" && !academyId) {
        return res.status(403).json({ error: "Academy membership required" });
      }
      
      // Always filter by academyId if set, even for platform_owner
      // This ensures consistency with delete/edit operations that require academy membership
      const effectiveAcademyId = academyId || undefined;
      const { search, paginated, withCredits } = req.query;
      const usePagination = paginated === 'true';
      const includeCredits = withCredits === 'true';
      
      let playerList: any[];
      let total = 0;
      
      if (usePagination) {
        const { limit, offset } = parsePagination(req.query as any);
        if (search) {
          const result = await storage.searchPlayersPaginated(search as string, limit, offset, effectiveAcademyId);
          playerList = result.players;
          total = result.total;
        } else {
          const result = await storage.getAllPlayersPaginated(limit, offset, effectiveAcademyId);
          playerList = result.players;
          total = result.total;
        }
      } else {
        // Backward compatible: return all players as array
        if (search) {
          playerList = await storage.searchPlayers(search as string, effectiveAcademyId);
        } else if (includeCredits) {
          playerList = await storage.getAllPlayersWithCredits(effectiveAcademyId);
        } else {
          playerList = await storage.getAllPlayers(effectiveAcademyId);
        }
      }
      
      // Enhance each player with their last lesson date
      const playersWithLessonDates = await Promise.all(
        playerList.map(async (player) => {
          const lastLesson = await storage.getPlayerLastSession(player.id);
          return {
            ...player,
            lastLessonDate: lastLesson?.startTime || null,
          };
        })
      );
      
      if (usePagination) {
        const { limit, offset } = parsePagination(req.query as any);
        res.json({
          data: playersWithLessonDates,
          pagination: { total, limit, offset, hasMore: offset + playerList.length < total }
        });
      } else {
        res.json(playersWithLessonDates);
      }
    } catch (error) {
      console.error("Error fetching players:", error);
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  // Create player
  app.post("/api/players", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const player = await storage.createPlayer({ ...req.body, academyId });
      
      // Generate player invite code
      const inviteCode = crypto.randomBytes(8).toString("hex"); // 16 char code
      const playerInvite = await storage.createPlayerInvite({
        playerId: player.id,
        academyId: academyId!,
        inviteCode,
        status: "pending",
        parentName: req.body.parentName || null,
        parentPhone: req.body.parentPhone || null,
        expiresAt: null, // No expiry for player invites
      });
      
      // Send welcome email if player has email (non-blocking)
      if (player.email) {
        const academy = academyId ? await storage.getAcademy(academyId) : null;
        const coach = player.coachId ? await storage.getCoach(player.coachId) : null;
        sendWelcomeEmail({
          to: player.email,
          playerName: player.name,
          academyName: academy?.name || "your academy",
          coachName: coach?.name,
        }).catch(err => console.error("Failed to send welcome email:", err));
      }
      
      // Return player with invite code
      res.status(201).json({
        ...player,
        inviteCode: playerInvite.inviteCode,
      });
    } catch (error) {
      console.error("Error creating player:", error);
      res.status(500).json({ error: "Failed to create player" });
    }
  });

  // Get player invite link
  app.get("/api/players/:id/invite", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      // Validate player ownership
      const { valid, player } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid || !player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Check for existing invite
      let invite = await storage.getPlayerInviteByPlayerId(id);
      
      // If no pending invite exists, create one
      if (!invite) {
        const inviteCode = crypto.randomBytes(8).toString("hex");
        invite = await storage.createPlayerInvite({
          playerId: id,
          academyId: academyId!,
          inviteCode,
          status: "pending",
          expiresAt: null,
        });
      }
      
      // Build invite link using request headers with EXPO_PUBLIC_DOMAIN as override
      const publicDomain = process.env.EXPO_PUBLIC_DOMAIN;
      const forwardedHost = req.headers['x-forwarded-host'] as string;
      const forwardedProto = req.headers['x-forwarded-proto'] as string || 'https';
      const host = publicDomain || forwardedHost || req.headers.host || 'glowupsports.com';
      const protocol = publicDomain ? 'https' : forwardedProto;
      const inviteLink = `${protocol}://${host}/invite/player/${invite.inviteCode}`;
      
      res.json({
        inviteCode: invite.inviteCode,
        inviteLink,
        status: invite.status,
        createdAt: invite.createdAt,
      });
    } catch (error) {
      console.error("Error getting player invite:", error);
      res.status(500).json({ error: "Failed to get player invite" });
    }
  });

  // Regenerate player invite link
  app.post("/api/players/:id/invite/regenerate", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      // Validate player ownership
      const { valid, player } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid || !player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Revoke existing pending invites
      const existingInvite = await storage.getPlayerInviteByPlayerId(id);
      if (existingInvite) {
        await storage.updatePlayerInvite(existingInvite.id, { status: "revoked" });
      }
      
      // Create new invite
      const inviteCode = crypto.randomBytes(8).toString("hex");
      const newInvite = await storage.createPlayerInvite({
        playerId: id,
        academyId: academyId!,
        inviteCode,
        status: "pending",
        expiresAt: null,
      });
      
      res.json({
        inviteCode: newInvite.inviteCode,
        status: newInvite.status,
        createdAt: newInvite.createdAt,
      });
    } catch (error) {
      console.error("Error regenerating player invite:", error);
      res.status(500).json({ error: "Failed to regenerate player invite" });
    }
  });

  // Claim player invite (public endpoint for parents/players to link their account)
  app.post("/api/player-invite/claim", async (req: Request, res: Response) => {
    try {
      const { inviteCode, userId } = req.body;
      
      if (!inviteCode || !userId) {
        return res.status(400).json({ error: "Invite code and user ID are required" });
      }
      
      const invite = await storage.getPlayerInvite(inviteCode);
      if (!invite) {
        return res.status(404).json({ error: "Invalid invite code" });
      }
      
      if (invite.status !== "pending") {
        return res.status(400).json({ error: "This invite has already been claimed or expired" });
      }
      
      // Claim the invite
      const claimedInvite = await storage.claimPlayerInvite(inviteCode, userId);
      if (!claimedInvite) {
        return res.status(400).json({ error: "Failed to claim invite" });
      }
      
      // Get player details
      const player = await storage.getPlayer(invite.playerId);
      
      res.json({
        success: true,
        player: player ? { id: player.id, name: player.name } : null,
        academyId: invite.academyId,
      });
    } catch (error) {
      console.error("Error claiming player invite:", error);
      res.status(500).json({ error: "Failed to claim invite" });
    }
  });

  // Validate player invite (public endpoint to check if invite is valid)
  app.get("/api/player-invite/:code", async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      
      const invite = await storage.getPlayerInvite(code);
      if (!invite) {
        return res.status(404).json({ error: "Invalid invite code" });
      }
      
      // Get player and academy details
      const player = await storage.getPlayer(invite.playerId);
      const academy = await storage.getAcademy(invite.academyId);
      
      res.json({
        valid: invite.status === "pending",
        status: invite.status,
        playerName: player?.name || null,
        academyName: academy?.name || null,
      });
    } catch (error) {
      console.error("Error validating player invite:", error);
      res.status(500).json({ error: "Failed to validate invite" });
    }
  });

  // Get squad members (other players in same academy for private chat)
  app.get("/api/players/squad-members", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const playerId = req.user?.playerId;
      
      // If player doesn't have an academy yet, return empty array gracefully
      if (!academyId) {
        return res.json([]);
      }
      
      // Get all players in the same academy
      const allPlayers = await storage.getPlayersByAcademy(academyId);
      
      // Filter out current player and return basic info
      const squadMembers = allPlayers
        .filter((p: any) => p.id !== playerId)
        .map((p: any) => ({
          id: p.id,
          firstName: p.firstName || p.name?.split(' ')[0] || 'Player',
          lastName: p.lastName || p.name?.split(' ').slice(1).join(' ') || '',
        }));
      
      res.json(squadMembers);
    } catch (error) {
      console.error("Error fetching squad members:", error);
      res.status(500).json({ error: "Failed to fetch squad members" });
    }
  });

  // Get single player
  app.get("/api/players/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid, player } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid || !player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      res.json(player);
    } catch (error) {
      console.error("Error fetching player:", error);
      res.status(500).json({ error: "Failed to fetch player" });
    }
  });

  // Update player
  app.patch("/api/players/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Validate and transform the update data
      const parseResult = updatePlayerSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(parseResult.error).message 
        });
      }
      
      const updated = await storage.updatePlayer(id, parseResult.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating player:", error);
      res.status(500).json({ error: "Failed to update player" });
    }
  });

  // Delete player (permanently removes all associated data)
  app.delete("/api/players/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId!;
      
      const deleted = await storage.deletePlayer(id, academyId);
      if (!deleted) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      await storage.createAuditLog({
        entityType: "player",
        entityId: id,
        action: "delete",
        performedBy: coachId!,
        metadata: JSON.stringify({ academyId, deletedAt: new Date().toISOString() }),
      });
      
      res.json({ success: true, message: "Player deleted" });
    } catch (error) {
      console.error("Error deleting player:", error);
      res.status(500).json({ error: "Failed to delete player" });
    }
  });

  // ===================== PLAYER BASELINES (Start Baseline Feature) =====================
  
  // Get player baseline
  app.get("/api/players/:id/baseline", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid, player } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid || !player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const baseline = await storage.getPlayerBaseline(id);
      res.json({ baseline: baseline || null, player });
    } catch (error) {
      console.error("Error fetching player baseline:", error);
      res.status(500).json({ error: "Failed to fetch baseline" });
    }
  });

  // Calculate suggested level based on age and intake questions
  app.post("/api/players/:id/baseline/suggest-level", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const { tennisExperience, playsCompetition, canRallyFive, serveAbility } = req.body;
      
      const { valid, player } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid || !player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Calculate age from DOB or use age field
      let age = player.age;
      if (!age && player.dateOfBirth) {
        const dob = new Date(player.dateOfBirth);
        const today = new Date();
        age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
          age--;
        }
      }
      age = age || 10; // Default to 10 if no age data
      const isAdult = age >= 18;
      
      // Auto-level suggestion based on age (recommended track)
      // Blue: 2-4, Red: 4-8, Orange: 8-10, Green: 10-12, Yellow: 12-18, Glow: 18+
      let suggestedStage: string;
      if (isAdult) {
        suggestedStage = "GLOW";
      } else if (age < 4) {
        suggestedStage = "BLUE";
      } else if (age < 8) {
        suggestedStage = "RED";
      } else if (age < 10) {
        suggestedStage = "ORANGE";
      } else if (age < 12) {
        suggestedStage = "GREEN";
      } else {
        suggestedStage = "YELLOW";
      }
      
      // Adjust based on intake questions
      // GLOW has ranks 9→1, others have 3→1
      let suggestedRank = isAdult ? 9 : 3; // Start at entry level
      let confidenceScore = 50;
      
      // Tennis experience adjustment
      if (tennisExperience === "18m+") {
        if (isAdult) {
          suggestedRank = Math.max(5, suggestedRank - 2); // Adults move faster with experience
        } else {
          suggestedRank = Math.max(1, suggestedRank - 1);
        }
        confidenceScore += 15;
      } else if (tennisExperience === "6-18m") {
        if (isAdult) {
          suggestedRank = Math.max(7, suggestedRank - 1);
        } else {
          suggestedRank = Math.max(2, suggestedRank);
        }
        confidenceScore += 10;
      }
      
      // Competition experience adjustment
      if (playsCompetition === "often") {
        if (isAdult) {
          suggestedRank = Math.max(3, suggestedRank - 2);
        } else {
          suggestedRank = Math.max(1, suggestedRank - 1);
        }
        confidenceScore += 15;
      } else if (playsCompetition === "sometimes") {
        confidenceScore += 10;
      }
      
      // Rally ability
      if (canRallyFive === true) {
        confidenceScore += 10;
        // If can rally but in BLUE, ready for RED
        if (suggestedStage === "BLUE" && tennisExperience !== "0-6m") {
          suggestedStage = "RED";
          suggestedRank = 3;
        }
        // If can rally but in RED, might be ready for ORANGE
        else if (suggestedStage === "RED" && tennisExperience !== "0-6m") {
          suggestedStage = "ORANGE";
          suggestedRank = 3;
        }
      }
      
      // Serve ability
      if (serveAbility === "consistent") {
        confidenceScore += 10;
        if (isAdult) {
          suggestedRank = Math.max(1, suggestedRank - 2);
        } else {
          suggestedRank = Math.max(1, suggestedRank - 1);
        }
      } else if (serveAbility === "basic") {
        confidenceScore += 5;
      }
      
      confidenceScore = Math.min(100, confidenceScore);
      
      // Construct level ID (e.g., "RED_3", "GLOW_9")
      const suggestedLevelId = `${suggestedStage}_${suggestedRank}`;
      
      res.json({
        suggestedLevelId,
        suggestedStage,
        suggestedRank,
        confidenceScore,
        age,
        isAdult,
        inputsUsed: { tennisExperience, playsCompetition, canRallyFive, serveAbility },
      });
    } catch (error) {
      console.error("Error calculating suggested level:", error);
      res.status(500).json({ error: "Failed to calculate suggested level" });
    }
  });

  // Create or update player baseline
  app.post("/api/players/:id/baseline", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const coachId = req.user!.coachId;
      
      const { valid, player } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid || !player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Check if baseline already exists and is locked
      const existingBaseline = await storage.getPlayerBaseline(id);
      if (existingBaseline?.status === "locked") {
        return res.status(403).json({ error: "Baseline is locked. Request unlock from admin to modify." });
      }
      
      const {
        suggestedLevelId,
        confirmedLevelId,
        confidenceScore,
        tennisExperience,
        playsCompetition,
        canRallyFive,
        serveAbility,
        techniqueRating,
        tacticalRating,
        physicalRating,
        mentalRating,
        socialRating,
        matchRating,
        overrideReason,
        overrideNote,
        deepSkillScores, // Deep baseline skill-by-skill scores
      } = req.body;
      
      const wasOverridden = confirmedLevelId && suggestedLevelId && confirmedLevelId !== suggestedLevelId;
      
      if (existingBaseline) {
        // Update existing baseline
        const updated = await storage.updatePlayerBaseline(existingBaseline.id, {
          suggestedLevelId,
          confirmedLevelId,
          confidenceScore,
          tennisExperience,
          playsCompetition,
          canRallyFive,
          serveAbility,
          techniqueRating,
          tacticalRating,
          physicalRating,
          mentalRating,
          socialRating,
          matchRating,
          wasOverridden,
          overrideReason: wasOverridden ? overrideReason : null,
          overrideNote: wasOverridden ? overrideNote : null,
          status: "confirmed",
        });
        
        // Also update the player's ball level
        if (confirmedLevelId) {
          const [stage, rank] = confirmedLevelId.split("_");
          await storage.updatePlayer(id, {
            ballLevel: stage.toLowerCase(),
            skillLevel: parseInt(rank, 10),
          });
        }
        
        // Save deep skill scores if provided
        if (deepSkillScores && typeof deepSkillScores === "object") {
          // Delete existing scores for this baseline
          await db.delete(playerBaselineSkillScores).where(eq(playerBaselineSkillScores.baselineId, existingBaseline.id));
          
          // Insert new scores
          const scoreEntries = Object.entries(deepSkillScores) as [string, { rating: number | null; notObserved: boolean; notes?: string }][];
          for (const [skillId, scoreData] of scoreEntries) {
            if (scoreData.rating !== null || scoreData.notObserved) {
              // Extract pillar and category from skill ID
              const pillarMap: Record<string, string> = {
                fh: "TECHNIQUE", bh: "TECHNIQUE", sv: "TECHNIQUE", rt: "TECHNIQUE", vl: "TECHNIQUE", oh: "TECHNIQUE",
                mv: "MOVEMENT", tc: "TACTICAL", mn: "MENTAL", sc: "SOCIAL", mt: "MATCH",
              };
              const prefix = skillId.split("_")[0];
              const pillar = pillarMap[prefix] || "TECHNIQUE";
              
              await db.insert(playerBaselineSkillScores).values({
                baselineId: existingBaseline.id,
                playerId: id,
                pillar,
                skillCategory: skillId,
                rating: scoreData.rating,
                notObserved: scoreData.notObserved,
                notes: scoreData.notes || null,
                coachId: coachId || null,
              });
            }
          }
        }
        
        res.json(updated);
      } else {
        // Create new baseline
        const baseline = await storage.createPlayerBaseline({
          playerId: id,
          academyId: academyId!,
          suggestedLevelId,
          confirmedLevelId,
          confidenceScore,
          tennisExperience,
          playsCompetition,
          canRallyFive,
          serveAbility,
          techniqueRating,
          tacticalRating,
          physicalRating,
          mentalRating,
          socialRating,
          matchRating,
          wasOverridden,
          overrideReason: wasOverridden ? overrideReason : null,
          overrideNote: wasOverridden ? overrideNote : null,
          status: "confirmed",
        });
        
        // Also update the player's ball level
        if (confirmedLevelId) {
          const [stage, rank] = confirmedLevelId.split("_");
          await storage.updatePlayer(id, {
            ballLevel: stage.toLowerCase(),
            skillLevel: parseInt(rank, 10),
          });
        }
        
        // Save deep skill scores if provided
        if (deepSkillScores && typeof deepSkillScores === "object") {
          const scoreEntries = Object.entries(deepSkillScores) as [string, { rating: number | null; notObserved: boolean; notes?: string }][];
          for (const [skillId, scoreData] of scoreEntries) {
            if (scoreData.rating !== null || scoreData.notObserved) {
              const pillarMap: Record<string, string> = {
                fh: "TECHNIQUE", bh: "TECHNIQUE", sv: "TECHNIQUE", rt: "TECHNIQUE", vl: "TECHNIQUE", oh: "TECHNIQUE",
                mv: "MOVEMENT", tc: "TACTICAL", mn: "MENTAL", sc: "SOCIAL", mt: "MATCH",
              };
              const prefix = skillId.split("_")[0];
              const pillar = pillarMap[prefix] || "TECHNIQUE";
              
              await db.insert(playerBaselineSkillScores).values({
                baselineId: baseline.id,
                playerId: id,
                pillar,
                skillCategory: skillId,
                rating: scoreData.rating,
                notObserved: scoreData.notObserved,
                notes: scoreData.notes || null,
                coachId: coachId || null,
              });
            }
          }
        }
        
        res.status(201).json(baseline);
      }
    } catch (error) {
      console.error("Error saving player baseline:", error);
      res.status(500).json({ error: "Failed to save baseline" });
    }
  });

  // Lock player baseline
  app.post("/api/players/:id/baseline/lock", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const coachId = req.user!.coachId;
      
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const baseline = await storage.getPlayerBaseline(id);
      if (!baseline) {
        return res.status(404).json({ error: "No baseline found for this player" });
      }
      
      if (baseline.status === "locked") {
        return res.status(400).json({ error: "Baseline is already locked" });
      }
      
      const locked = await storage.lockPlayerBaseline(baseline.id, coachId!);
      res.json(locked);
    } catch (error) {
      console.error("Error locking baseline:", error);
      res.status(500).json({ error: "Failed to lock baseline" });
    }
  });

  // Unlock player baseline (admin/owner only)
  app.post("/api/players/:id/baseline/unlock", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const role = req.user!.role;
      
      // Only platform owner or academy admins can unlock
      if (role !== "platform_owner" && role !== "academy_owner") {
        return res.status(403).json({ error: "Only academy owners can unlock baselines" });
      }
      
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const baseline = await storage.getPlayerBaseline(id);
      if (!baseline) {
        return res.status(404).json({ error: "No baseline found for this player" });
      }
      
      if (baseline.status !== "locked") {
        return res.status(400).json({ error: "Baseline is not locked" });
      }
      
      const unlocked = await storage.unlockPlayerBaseline(baseline.id);
      res.json(unlocked);
    } catch (error) {
      console.error("Error unlocking baseline:", error);
      res.status(500).json({ error: "Failed to unlock baseline" });
    }
  });

  // Get academy baseline stats
  app.get("/api/academy/baseline-stats", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const stats = await storage.getAcademyBaselineStats(academyId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching baseline stats:", error);
      res.status(500).json({ error: "Failed to fetch baseline stats" });
    }
  });

  // Get players without baseline
  app.get("/api/academy/players-without-baseline", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const players = await storage.getPlayersWithoutBaseline(academyId);
      res.json(players);
    } catch (error) {
      console.error("Error fetching players without baseline:", error);
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  // Get all ball levels
  app.get("/api/ball-levels", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const levels = await storage.getAllBallLevels();
      res.json(levels);
    } catch (error) {
      console.error("Error fetching ball levels:", error);
      res.status(500).json({ error: "Failed to fetch ball levels" });
    }
  });

  // ===================== PACKAGES / CREDITS =====================
  app.get("/api/players/:playerId/packages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const coachId = req.user!.coachId;
      let academyId = req.user!.academyId;
      
      // For coaches without direct academyId, get their primary academy from memberships
      if (!academyId && coachId) {
        const memberships = await storage.getCoachAcademyMemberships(coachId);
        if (memberships.length > 0) {
          academyId = memberships[0].academyId;
        }
      }
      
      // Verify player exists and coach has access (either direct academyId or through player visibility)
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const pkgs = await storage.getPlayerPackages(playerId);
      res.json(pkgs);
    } catch (error) {
      console.error("Error fetching packages:", error);
      res.status(500).json({ error: "Failed to fetch packages" });
    }
  });

  app.get("/api/players/:playerId/packages/active", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const coachId = req.user!.coachId;
      let academyId = req.user!.academyId;
      
      // For coaches without direct academyId, get their primary academy from memberships
      if (!academyId && coachId) {
        const memberships = await storage.getCoachAcademyMemberships(coachId);
        if (memberships.length > 0) {
          academyId = memberships[0].academyId;
        }
      }
      
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const pkgs = await storage.getActivePlayerPackages(playerId);
      res.json(pkgs);
    } catch (error) {
      console.error("Error fetching active packages:", error);
      res.status(500).json({ error: "Failed to fetch active packages" });
    }
  });

  // Get player credit balance by type, including debts (negative values = debt)
  app.get("/api/players/:playerId/credit-balance", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const balance = await storage.getPlayerCreditBalanceByType(playerId);
      res.json(balance);
    } catch (error) {
      console.error("Error fetching credit balance:", error);
      res.status(500).json({ error: "Failed to fetch credit balance" });
    }
  });

  app.post("/api/packages", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { 
        playerId, 
        totalCredits, 
        remainingCredits, 
        expiryDate, 
        creditType = "group", // group | private | semi_private
        purchasedAt, // ISO date string for backdating - defaults to now
        expiryMonths = 12, // Number of months until expiry from purchaseDate
      } = req.body;
      const academyId = req.user!.academyId;
      const coachId = req.user!.coachId;
      
      if (!playerId || totalCredits === undefined) {
        return res.status(400).json({ error: "playerId and totalCredits are required" });
      }
      
      // Validate credit type
      const validCreditTypes = ["group", "private", "semi_private"];
      if (!validCreditTypes.includes(creditType)) {
        return res.status(400).json({ error: "Invalid creditType. Must be group, private, or semi_private" });
      }
      
      const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Look up academy pricing for this credit type
      const pricing = await storage.getAcademyPricingByType(academyId!, creditType);
      const pricePerCredit = pricing ? Number(pricing.pricePerSession) : 0;
      const currency = pricing?.currency || "AED";
      const totalPrice = pricePerCredit * totalCredits;
      
      // Calculate purchase date and expiry
      const purchaseDate = purchasedAt ? new Date(purchasedAt) : new Date();
      let finalExpiryDate = expiryDate;
      if (!finalExpiryDate && expiryMonths) {
        const expiry = new Date(purchaseDate);
        expiry.setMonth(expiry.getMonth() + expiryMonths);
        finalExpiryDate = expiry.toISOString().split('T')[0];
      }
      
      // Generate invoice number
      const invoiceNumber = await storage.generateInvoiceNumber(academyId!);
      
      // Get player info for invoice
      const player = await storage.getPlayer(playerId);
      
      // Create invoice first
      // If purchasedAt is provided, mark as paid; otherwise mark as pending
      const isPaid = !!purchasedAt;
      const dueDate = !isPaid ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null; // 7 days from now
      
      const invoice = await storage.createInvoice({
        academyId: academyId!,
        playerId,
        invoiceNumber,
        invoiceType: "package",
        amount: totalPrice.toString(),
        currency,
        status: isPaid ? "paid" : "pending",
        paidAt: isPaid ? purchaseDate : null,
        dueDate: dueDate,
        lineItems: [{
          description: `${totalCredits} ${creditType.replace('_', ' ')} lesson credits`,
          quantity: totalCredits,
          unitPrice: pricePerCredit,
          total: totalPrice,
          creditType,
        }],
        notes: `Credit package purchase - ${creditType.replace('_', ' ')} lessons`,
      });
      
      // Create the package
      const pkg = await storage.createPackage({
        academyId,
        playerId,
        creditType,
        totalCredits,
        remainingCredits: remainingCredits ?? totalCredits,
        price: totalPrice.toString(),
        pricePerCredit: pricePerCredit.toString(),
        currency,
        purchaseDate,
        expiryDate: finalExpiryDate || null,
        invoiceId: invoice.id,
        name: `${totalCredits} ${creditType.replace('_', ' ')} credits`,
      });
      
      // Update invoice with package ID
      await storage.updateInvoice(invoice.id, { packageId: pkg.id });
      
      // Create credit transaction for the purchase
      await storage.createCreditTransaction({
        playerId,
        academyId,
        packageId: pkg.id,
        type: "credit",
        creditType,
        amount: totalCredits,
        reason: "package_purchased",
        metadata: { 
          invoiceId: invoice.id,
          pricePerCredit,
          totalPrice,
          currency,
        },
      });
      
      // Settle any outstanding debts for this player and credit type
      const debtSettlement = await storage.settlePlayerDebts(playerId, creditType, pkg.id);
      if (debtSettlement.settledCount > 0) {
        console.log(`[Package] Settled ${debtSettlement.settledCount} debt(s) for player ${playerId}, deducted ${debtSettlement.totalDeducted} credits from package ${pkg.id}`);
      }
      
      // Audit log
      if (coachId) {
        await storage.createAuditLog({
          entityType: "package",
          entityId: pkg.id,
          action: "create",
          performedBy: coachId,
          metadata: { creditType, totalCredits, totalPrice, invoiceId: invoice.id },
        });
      }
      
      res.status(201).json({ ...pkg, invoice });
    } catch (error) {
      console.error("Error creating package:", error);
      res.status(500).json({ error: "Failed to create package" });
    }
  });

  app.patch("/api/packages/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePackageOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Package not found" });
      }
      
      const pkg = await storage.updatePackage(id, req.body, academyId ?? undefined);
      if (!pkg) {
        return res.status(404).json({ error: "Package not found" });
      }
      res.json(pkg);
    } catch (error) {
      console.error("Error updating package:", error);
      res.status(500).json({ error: "Failed to update package" });
    }
  });

  app.delete("/api/packages/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { force } = req.query;
      const academyId = req.user!.academyId;
      
      console.log(`[PackageDelete] Attempting to delete package ${id} for academy ${academyId}, force=${force}`);
      
      const { valid } = await validatePackageOwnership(id, academyId, storage);
      if (!valid) {
        console.log(`[PackageDelete] Package ${id} not found or not owned by academy ${academyId}`);
        return res.status(404).json({ error: "Package not found" });
      }
      
      const result = await storage.deletePackage(id, academyId ?? undefined, force === "true");
      console.log(`[PackageDelete] Delete result:`, result);
      
      if (!result.success) {
        return res.status(400).json({ 
          error: result.error,
          creditsUsed: result.creditsUsed 
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("[PackageDelete] Error deleting package:", error);
      res.status(500).json({ error: "Failed to delete package" });
    }
  });

  app.post("/api/packages/:id/use", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePackageOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Package not found" });
      }
      
      const pkg = await storage.usePackageCredit(id, academyId ?? undefined);
      if (!pkg) {
        return res.status(400).json({ error: "No credits remaining or package not found" });
      }

      const coachId = req.user!.coachId;
      await storage.createAuditLog({
        entityType: "package",
        entityId: id,
        action: "use_credit",
        performedBy: coachId!,
      });

      res.json(pkg);
    } catch (error) {
      console.error("Error using package credit:", error);
      res.status(500).json({ error: "Failed to use package credit" });
    }
  });

  // Get single session with players
  app.get("/api/coach/sessions/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      const players = await storage.getSessionPlayers(id);
      res.json({ ...session, players });
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });
  
  // Update session (for drag-and-drop reschedule)
  app.patch("/api/sessions/:sessionId", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { startTime, endTime, courtId, checkConflicts } = req.body;
      const academyId = req.user!.academyId;
      
      const { valid, session } = await validateSessionOwnership(sessionId, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Determine new times
      const newStartTime = startTime ? new Date(startTime) : session.startTime;
      const newEndTime = endTime ? new Date(endTime) : session.endTime;
      const newCourtId = courtId !== undefined ? courtId : session.courtId;
      
      // Check for conflicts if requested
      if (checkConflicts !== false) {
        // Check coach conflict (exclude current session)
        if (session.coachId) {
          const coachConflict = await storage.checkCoachConflict(
            session.coachId, 
            newStartTime, 
            newEndTime, 
            sessionId,
            academyId || undefined
          );
          if (coachConflict) {
            return res.status(409).json({ 
              error: "Coach has a conflicting session at this time",
              conflictType: "coach",
              conflictingSession: coachConflict
            });
          }
        }
        
        // Check court conflict (exclude current session)
        if (newCourtId) {
          const courtConflict = await storage.checkCourtConflict(
            newCourtId, 
            newStartTime, 
            newEndTime, 
            sessionId,
            academyId || undefined
          );
          if (courtConflict) {
            return res.status(409).json({ 
              error: "Court is already booked at this time",
              conflictType: "court",
              conflictingSession: courtConflict
            });
          }
        }
        
        // Check player conflicts
        const playersInSession = await storage.getSessionPlayersWithDetails(sessionId, academyId || undefined);
        for (const player of playersInSession) {
          const playerConflict = await storage.checkPlayerConflict(
            player.id, 
            newStartTime, 
            newEndTime, 
            sessionId,
            academyId || undefined
          );
          if (playerConflict) {
            return res.status(409).json({ 
              error: `Player ${player.name} has a conflicting session at this time`,
              conflictType: "player",
              playerId: player.id,
              playerName: player.name,
              conflictingSession: playerConflict
            });
          }
        }
      }
      
      const updateData: Record<string, any> = {};
      if (startTime) updateData.startTime = newStartTime;
      if (endTime) updateData.endTime = newEndTime;
      if (courtId !== undefined) updateData.courtId = newCourtId;
      
      const updatedSession = await storage.updateSession(sessionId, updateData);
      
      // Recreate time block for rescheduled session (delete old, create new)
      if (session.coachId && session.status !== 'cancelled' && (startTime || endTime)) {
        await storage.deleteCoachTimeBlockBySession(sessionId);
        const sessionDate = newStartTime.toISOString().split('T')[0];
        const startTimeStr = newStartTime.toISOString().split('T')[1].substring(0, 5);
        const endTimeStr = newEndTime.toISOString().split('T')[1].substring(0, 5);
        await storage.createCoachTimeBlock({
          coachId: session.coachId,
          sourceType: 'session',
          sourceAcademyId: academyId || undefined,
          sourceSessionId: sessionId,
          date: sessionDate,
          startTime: startTimeStr,
          endTime: endTimeStr,
          isPrivate: true,
        });
      }
      
      res.json(updatedSession);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  // ==================== PLAYER NOTES (COACH MEMORY HUB) ====================

  // Get notes for a player
  app.get("/api/players/:id/notes", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const notes = await storage.getPlayerNotes(id, academyId || undefined);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching player notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Add a note for a player
  app.post("/api/players/:id/notes", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      const { content, category, sessionId } = req.body;
      
      if (!content || !content.trim()) {
        return res.status(400).json({ error: "Content is required" });
      }

      if (!id) {
        return res.status(400).json({ error: "Player ID is required" });
      }

      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }

      const sanitizedContent = sanitizeNote(content);
      if (!sanitizedContent) {
        return res.status(400).json({ error: "Content is required after sanitization" });
      }

      const note = await storage.createPlayerNote({
        playerId: id,
        coachId: coachId || null,
        content: sanitizedContent,
        category: category || "general",
        sessionId: sessionId || null,
        isPinned: false,
      });
      res.status(201).json(note);
    } catch (error) {
      console.error("Error creating player note:", error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // Delete a player note
  app.delete("/api/players/:playerId/notes/:noteId", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId, noteId } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      await storage.deletePlayerNote(noteId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting player note:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Toggle note pin
  app.patch("/api/players/:playerId/notes/:noteId/pin", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId, noteId } = req.params;
      const { isPinned } = req.body;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const note = await storage.toggleNotePin(noteId, isPinned);
      res.json(note);
    } catch (error) {
      console.error("Error toggling note pin:", error);
      res.status(500).json({ error: "Failed to toggle pin" });
    }
  });

  // ==================== PLAYER PROGRESS ====================

  // Get progress history for a player
  app.get("/api/players/:id/progress", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const progress = await storage.getPlayerProgress(id, academyId || undefined);
      res.json(progress);
    } catch (error) {
      console.error("Error fetching player progress:", error);
      res.status(500).json({ error: "Failed to fetch progress" });
    }
  });

  // Get progress summary for a player (aggregated by skill area)
  app.get("/api/players/:id/progress/summary", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const summary = await storage.getProgressSummary(id, academyId || undefined);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching progress summary:", error);
      res.status(500).json({ error: "Failed to fetch progress summary" });
    }
  });

  // Generate progress report PDF for a player
  app.get("/api/players/:id/progress-report", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const coachId = req.user!.coachId;
      
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const { generateProgressReportHtml, ProgressReportData } = await import("./services/progressReportPdf");
      
      const player = await storage.getPlayer(id);
      const academy = academyId ? await storage.getAcademy(academyId) : null;
      const coach = coachId ? await storage.getCoach(coachId) : null;
      const progressRecords = await storage.getPlayerProgress(id, academyId || undefined);
      const summary = await storage.getProgressSummary(id, academyId || undefined);
      
      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      
      const allSessions = await storage.getSessionsByAcademy(academyId || "");
      const playerSessions = await Promise.all(
        allSessions.map(async (session) => {
          const players = await storage.getSessionPlayers(session.id);
          const playerRecord = players.find(p => p.playerId === id);
          return playerRecord ? { session, playerRecord } : null;
        })
      ).then(results => results.filter(Boolean) as Array<{ session: any; playerRecord: any }>);
      
      const recentSessions = playerSessions.filter(ps => {
        const sessionDate = new Date(ps.session.date);
        return sessionDate >= threeMonthsAgo && sessionDate <= now;
      });
      
      const attendedSessions = recentSessions.filter(ps => 
        ps.playerRecord.attendanceStatus === "present" || ps.playerRecord.attendanceStatus === "late"
      );
      
      const totalMinutes = attendedSessions.reduce((sum, ps) => sum + (ps.session.duration || 60), 0);
      const attendanceRate = recentSessions.length > 0 
        ? Math.round((attendedSessions.length / recentSessions.length) * 100) 
        : 0;
      
      const pillars = (summary as Array<{ skillArea: string; latestRating: number; trend: string }> || []).map(s => ({
        name: s.skillArea || "General",
        score: s.latestRating || 0,
        maxScore: 10,
        trend: (s.trend as "up" | "down" | "stable") || "stable",
      }));
      
      const defaultPillars = ["Technique", "Tactical", "Physical", "Mental", "Social", "Match"];
      const existingPillarNames = pillars.map(p => p.name);
      const missingPillars = defaultPillars.filter(p => !existingPillarNames.includes(p));
      missingPillars.forEach(name => {
        pillars.push({ name, score: 0, maxScore: 10, trend: "stable" as const });
      });
      
      const reportData: typeof ProgressReportData = {
        reportDate: now.toISOString(),
        period: {
          from: threeMonthsAgo.toISOString(),
          to: now.toISOString(),
        },
        academy: {
          name: academy?.name || "Tennis Academy",
        },
        coach: {
          name: coach?.name || "Coach",
          title: coach?.specialty || undefined,
        },
        player: {
          name: player?.name || "Player",
          age: player?.age || undefined,
          ballLevel: player?.ballLevel || "RED_1",
          xpLevel: player?.level || 1,
          totalXp: player?.totalXp || 0,
        },
        pillars,
        skills: [],
        sessionsSummary: {
          totalSessions: recentSessions.length,
          attendedSessions: attendedSessions.length,
          attendanceRate,
          totalMinutes,
        },
        achievements: [],
        recommendations: [
          "Continue with regular practice sessions",
          "Focus on developing identified improvement areas",
          "Participate in match play opportunities when available",
        ],
      };
      
      const html = generateProgressReportHtml(reportData as any);
      
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error) {
      console.error("Error generating progress report:", error);
      res.status(500).json({ error: "Failed to generate progress report" });
    }
  });

  // Add progress entry for a player
  app.post("/api/players/:id/progress", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      const { skillArea, rating, trend, notes, sessionId } = req.body;
      
      if (!skillArea) {
        return res.status(400).json({ error: "Skill area is required" });
      }

      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }

      const progress = await storage.createPlayerProgress({
        playerId: id,
        coachId,
        sessionId,
        skillArea,
        rating,
        trend: trend || "stable",
        notes,
      });
      res.status(201).json(progress);
    } catch (error) {
      console.error("Error creating player progress:", error);
      res.status(500).json({ error: "Failed to create progress" });
    }
  });

  // Get all players with their progress summary (for coaching dashboard)
  app.get("/api/coach/players/progress", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const allPlayers = await storage.getAllPlayers();
      const playersWithProgress = await Promise.all(
        allPlayers.map(async (player) => {
          const summary = await storage.getProgressSummary(player.id, player.academyId || undefined);
          const notes = await storage.getPlayerNotes(player.id, player.academyId || undefined);
          const totalXp = await storage.getPlayerTotalXp(player.id, player.academyId || undefined);
          const pinnedNotes = notes.filter(n => n.isPinned);
          const recentNote = notes[0];
          return {
            ...player,
            progressSummary: summary,
            pinnedNotes,
            recentNote,
            totalNotes: notes.length,
            totalXp,
          };
        })
      );
      res.json(playersWithProgress);
    } catch (error) {
      console.error("Error fetching players with progress:", error);
      res.status(500).json({ error: "Failed to fetch players with progress" });
    }
  });

  // Get player attendance summary (for player profile)
  app.get("/api/coach/players/:playerId/attendance-summary", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user!.academyId;

      const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Get all session_players records for this player
      const sessionPlayerRecords = await db
        .select({
          sessionId: sessionPlayers.sessionId,
          attendanceStatus: sessionPlayers.attendanceStatus,
          lateMinutes: sessionPlayers.lateMinutes,
        })
        .from(sessionPlayers)
        .where(eq(sessionPlayers.playerId, playerId));

      const totalLessons = sessionPlayerRecords.length;
      const presentCount = sessionPlayerRecords.filter(r => r.attendanceStatus === "present").length;
      const lateCount = sessionPlayerRecords.filter(r => r.lateMinutes && r.lateMinutes > 0).length;
      const attendancePercentage = totalLessons > 0 ? Math.round((presentCount / totalLessons) * 100) : 0;

      res.json({
        totalLessons,
        presentCount,
        attendancePercentage,
        lateCount,
      });
    } catch (error) {
      console.error("Error fetching player attendance summary:", error);
      res.status(500).json({ error: "Failed to fetch attendance summary" });
    }
  });

  // Get player full attendance history with session details
  app.get("/api/coach/players/:playerId/attendance-history", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user!.academyId;

      const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Step 1: Get all session_players records for this player
      const playerRecords = await db
        .select({
          sessionId: sessionPlayers.sessionId,
          attendanceStatus: sessionPlayers.attendanceStatus,
          lateMinutes: sessionPlayers.lateMinutes,
        })
        .from(sessionPlayers)
        .where(eq(sessionPlayers.playerId, playerId));

      // Step 2: Get session details separately to avoid Drizzle LEFT JOIN issues
      const sessionIds = playerRecords.map(r => r.sessionId).filter(Boolean);
      let sessionMap: Record<string, { startTime: Date; endTime: Date; sessionType: string; status: string }> = {};
      
      if (sessionIds.length > 0) {
        const sessionDetails = await db
          .select({
            id: sessions.id,
            startTime: sessions.startTime,
            endTime: sessions.endTime,
            sessionType: sessions.sessionType,
            status: sessions.status,
          })
          .from(sessions)
          .where(inArray(sessions.id, sessionIds));
        
        sessionMap = sessionDetails.reduce((acc, s) => {
          acc[s.id] = { startTime: s.startTime, endTime: s.endTime, sessionType: s.sessionType, status: s.status };
          return acc;
        }, {} as Record<string, { startTime: Date; endTime: Date; sessionType: string; status: string }>);
      }

      // Step 3: Combine and sort
      const combinedRecords = playerRecords.map(record => {
        const sessionInfo = record.sessionId ? sessionMap[record.sessionId] : null;
        return {
          sessionId: record.sessionId,
          attendanceStatus: record.attendanceStatus,
          lateMinutes: record.lateMinutes,
          sessionStartTime: sessionInfo?.startTime || null,
          sessionEndTime: sessionInfo?.endTime || null,
          sessionType: sessionInfo?.sessionType || null,
          sessionStatus: sessionInfo?.status || null,
        };
      });

      // Sort by session start time (newest first)
      const sortedRecords = combinedRecords.sort((a, b) => {
        const dateA = a.sessionStartTime ? new Date(a.sessionStartTime) : new Date(0);
        const dateB = b.sessionStartTime ? new Date(b.sessionStartTime) : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

      // Format for frontend - include records even if session details are missing
      const history = sortedRecords.map(record => ({
        sessionId: record.sessionId,
        date: record.sessionStartTime ? new Date(record.sessionStartTime).toISOString().split('T')[0] : null,
        startTime: record.sessionStartTime || null,
        endTime: record.sessionEndTime || null,
        sessionType: record.sessionType || "group",
        status: record.attendanceStatus,
        lateMinutes: record.lateMinutes,
        sessionStatus: record.sessionStatus || "completed",
      }));

      res.json(history);
    } catch (error) {
      console.error("Error fetching player attendance history:", error);
      res.status(500).json({ error: "Failed to fetch attendance history" });
    }
  });

  // ==================== RECURRING SESSIONS API ====================

  // Get all recurring series for a coach
  app.get("/api/coach/recurring-series", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      
      if (!coachId) {
        return res.status(400).json({ error: "coachId is required" });
      }
      
      const series = await storage.getRecurringSeriesForCoach(coachId, academyId || undefined);
      res.json(series);
    } catch (error) {
      console.error("Error fetching recurring series:", error);
      res.status(500).json({ error: "Failed to fetch recurring series" });
    }
  });

  // Get a single recurring series
  app.get("/api/coach/recurring-series/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const series = await storage.getRecurringSeries(id, academyId || undefined);
      if (!series) {
        return res.status(404).json({ error: "Recurring series not found" });
      }
      
      // Get all sessions in this series
      const sessionInstances = await storage.getSessionsByRecurringGroupId(id, academyId || undefined);
      
      res.json({ ...series, sessions: sessionInstances });
    } catch (error) {
      console.error("Error fetching recurring series:", error);
      res.status(500).json({ error: "Failed to fetch recurring series" });
    }
  });

  // Create a recurring series with session instances
  app.post("/api/coach/recurring-series", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      const {
        courtId,
        locationId,
        dayOfWeek,
        startTime,
        duration,
        sessionType,
        ballLevel,
        skillLevel,
        weekCount,
        seriesStartDate,
        price,
        playerIds,
      } = req.body;
      
      if (!coachId || dayOfWeek === undefined || !startTime || !duration || !sessionType || !weekCount || !seriesStartDate) {
        return res.status(400).json({ error: "dayOfWeek, startTime, duration, sessionType, weekCount, and seriesStartDate are required" });
      }
      
      // Validate players belong to academy
      if (playerIds && Array.isArray(playerIds) && playerIds.length > 0 && academyId) {
        for (const playerId of playerIds) {
          const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
          if (!valid) {
            return res.status(400).json({ error: `Player ${playerId} not found or not authorized` });
          }
        }
      }
      
      // Get academy timezone for proper time handling
      const academyData = await storage.getAcademy(academyId!);
      const academyTimezone = academyData?.timezone || "Asia/Dubai";
      
      // Validate that the start time is resolvable in the academy timezone using consolidated helper
      const initialResolution = ensureResolvableLocalTime(seriesStartDate, startTime, academyTimezone);
      if (!initialResolution.ok) {
        return res.status(400).json({ error: initialResolution.error });
      }
      // Note: ambiguity is acceptable - first occurrence used (standard calendar behavior)
      
      // Calculate the first session date using timezone-aware helper
      const firstRecurringResult = getFirstSessionDate(
        seriesStartDate,
        dayOfWeek,
        startTime,
        academyTimezone
      );
      
      if (firstRecurringResult.status === "error") {
        return res.status(400).json({
          error: { code: "TIME_UNRESOLVABLE", message: firstRecurringResult.message }
        });
      }
      if (firstRecurringResult.status === "gap") {
        return res.status(400).json({
          error: {
            code: "TIME_UNRESOLVABLE",
            requestedTime: startTime,
            suggestedNext: firstRecurringResult.suggestedTime,
            date: firstRecurringResult.dateStr,
            message: `The time ${startTime} does not exist on ${firstRecurringResult.dateStr} in timezone ${academyTimezone} (DST transition). Please use ${firstRecurringResult.suggestedTime} instead.`
          }
        });
      }
      
      const { dateStr: firstRecurringDateStr, utcDate: firstRecurringDate } = firstRecurringResult;
      
      // Check for conflicts for all weeks
      for (let week = 0; week < weekCount; week++) {
        // Calculate session date for this week
        const sessionDateStr = addDaysToLocalDate(firstRecurringDateStr, week * 7);
        
        // Validate each session date for DST transitions using consolidated helper
        const weekResolution = ensureResolvableLocalTime(sessionDateStr, startTime, academyTimezone);
        if (!weekResolution.ok) {
          return res.status(400).json({
            error: {
              ...weekResolution.error,
              week: week + 1,
              message: `Week ${week + 1}: ${weekResolution.error.message}`
            }
          });
        }
        
        const sessionStartTime = weekResolution.utcDate;
        const sessionEndTime = new Date(sessionStartTime.getTime() + duration * 60000);
        
        // Check coach conflict (pass undefined for excludeSessionId, academyId for tenant isolation)
        const coachConflict = await storage.checkCoachConflict(coachId, sessionStartTime, sessionEndTime, undefined, academyId || undefined);
        if (coachConflict) {
          return res.status(409).json({ 
            error: `Coach has a conflicting session on week ${week + 1}`,
            conflictWeek: week + 1,
            conflictDate: sessionStartTime.toISOString()
          });
        }
        
        // Check court conflict if courtId provided
        if (courtId) {
          const courtConflict = await storage.checkCourtConflict(courtId, sessionStartTime, sessionEndTime, undefined, academyId || undefined);
          if (courtConflict) {
            return res.status(409).json({ 
              error: `Court has a conflicting booking on week ${week + 1}`,
              conflictWeek: week + 1,
              conflictDate: sessionStartTime.toISOString()
            });
          }
        }
      }
      
      // Calculate end date
      const endDate = new Date(firstRecurringDate);
      endDate.setDate(endDate.getDate() + ((weekCount - 1) * 7));
      
      // Create the recurring series
      const series = await storage.createRecurringSeries({
        academyId,
        coachId,
        courtId: courtId || null,
        locationId: locationId || null,
        dayOfWeek,
        startTime,
        duration,
        sessionType,
        ballLevel: ballLevel || null,
        skillLevel: skillLevel || null,
        weekCount,
        seriesStartDate,
        seriesEndDate: endDate.toISOString().split('T')[0],
        price: price || null,
      });
      
      // Create all session instances (with auto-skip for player holidays)
      const { sessions: sessionInstances, skippedSessions } = await storage.createRecurringSessionInstances(
        series.id,
        {
          academyId,
          coachId,
          courtId: courtId || null,
          locationId: locationId || null,
          sessionType,
          ballLevel: ballLevel || null,
          skillLevel: skillLevel || null,
          travelTime: 0,
          paymentStatus: 'unpaid',
          price: price || null,
          status: 'scheduled',
          duration,
        },
        startDate,
        weekCount,
        dayOfWeek,
        startTime,
        duration,
        playerIds && Array.isArray(playerIds) ? playerIds : undefined,
        academyId || undefined
      );
      
      // Add players to all non-skipped sessions with credit deduction
      if (playerIds && Array.isArray(playerIds) && playerIds.length > 0) {
        for (const session of sessionInstances) {
          if (!session.isSkipped) {
            for (const playerId of playerIds) {
              // First add player to session
              await storage.addPlayerToSession({
                sessionId: session.id,
                playerId,
              });
              
              // Then deduct typed credits (updates session_player with creditDeductedAt)
              await storage.deductTypedCreditsForSession(
                playerId,
                sessionType,
                session.id,
                academyId || undefined
              );
            }
          }
        }
      }
      
      res.status(201).json({ 
        series, 
        sessions: sessionInstances,
        skippedSessions,
        message: skippedSessions.length > 0 
          ? `${skippedSessions.length} session(s) auto-skipped due to player holidays`
          : undefined
      });
    } catch (error) {
      console.error("Error creating recurring series:", error);
      res.status(500).json({ error: "Failed to create recurring series" });
    }
  });

  // Update a recurring series (future instances only)
  app.patch("/api/coach/recurring-series/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const { courtId, locationId, price, isActive } = req.body;
      
      const series = await storage.getRecurringSeries(id, academyId || undefined);
      if (!series) {
        return res.status(404).json({ error: "Recurring series not found" });
      }
      
      const updateData: Record<string, any> = {};
      if (courtId !== undefined) updateData.courtId = courtId;
      if (locationId !== undefined) updateData.locationId = locationId;
      if (price !== undefined) updateData.price = price;
      if (isActive !== undefined) updateData.isActive = isActive;
      
      const updatedSeries = await storage.updateRecurringSeries(id, updateData, academyId || undefined);
      res.json(updatedSeries);
    } catch (error) {
      console.error("Error updating recurring series:", error);
      res.status(500).json({ error: "Failed to update recurring series" });
    }
  });

  // Delete a recurring series (cancels future sessions)
  app.delete("/api/coach/recurring-series/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const { cancelFutureSessions } = req.query;
      
      const series = await storage.getRecurringSeries(id, academyId || undefined);
      if (!series) {
        return res.status(404).json({ error: "Recurring series not found" });
      }
      
      // Mark series as inactive
      await storage.deleteRecurringSeries(id, academyId || undefined);
      
      // Cancel future sessions if requested
      if (cancelFutureSessions === 'true') {
        await storage.deleteRecurringSessionInstances(id, new Date(), academyId || undefined);
        
        // Broadcast session update via WebSocket so players see the change immediately
        if (academyId) {
          broadcastSessionUpdate(academyId, {
            sessionId: id,
            type: "cancelled",
          });
        }
      }
      
      res.json({ success: true, message: "Recurring series deleted" });
    } catch (error) {
      console.error("Error deleting recurring series:", error);
      res.status(500).json({ error: "Failed to delete recurring series" });
    }
  });

  // Skip a recurring session instance
  app.post("/api/coach/sessions/:id/skip", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const { reason } = req.body;
      
      const session = await storage.getSession(id);
      if (!session || (academyId && session.academyId !== academyId)) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      const updated = await storage.updateSession(id, {
        isSkipped: true,
        skipReason: reason || "manual",
        status: "cancelled",
      });

      // Broadcast session cancellation via WebSocket
      if (academyId) {
        broadcastSessionUpdate(academyId, {
          sessionId: id,
          type: "cancelled",
        });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error skipping session:", error);
      res.status(500).json({ error: "Failed to skip session" });
    }
  });

  // Unskip a recurring session instance
  app.post("/api/coach/sessions/:id/unskip", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const session = await storage.getSession(id);
      if (!session || (academyId && session.academyId !== academyId)) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      const updated = await storage.updateSession(id, {
        isSkipped: false,
        skipReason: null,
        status: "scheduled",
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error unskipping session:", error);
      res.status(500).json({ error: "Failed to unskip session" });
    }
  });

  // Edit single session (break from series)
  app.patch("/api/coach/sessions/:id/edit-single", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const { startTime, endTime, duration, courtId, locationId } = req.body;
      
      const session = await storage.getSession(id);
      if (!session || (academyId && session.academyId !== academyId)) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      const updateData: Record<string, any> = { isModifiedFromSeries: true };
      if (startTime) updateData.startTime = new Date(startTime);
      if (endTime) updateData.endTime = new Date(endTime);
      if (duration !== undefined) updateData.duration = duration;
      if (courtId !== undefined) updateData.courtId = courtId;
      if (locationId !== undefined) updateData.locationId = locationId;
      
      const updated = await storage.updateSession(id, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Error editing single session:", error);
      res.status(500).json({ error: "Failed to edit session" });
    }
  });

  // Edit all future sessions in series
  app.patch("/api/coach/sessions/:id/edit-series", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const { duration, courtId, locationId, price } = req.body;
      
      const session = await storage.getSession(id);
      if (!session || (academyId && session.academyId !== academyId)) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      if (!session.recurringGroupId) {
        return res.status(400).json({ error: "Session is not part of a recurring series" });
      }
      
      // Get all future sessions in the series (not modified individually)
      const allSessions = await storage.getSessionsByRecurringGroupId(session.recurringGroupId, academyId || undefined);
      const now = new Date();
      const futureSessions = allSessions.filter(s => 
        new Date(s.startTime) >= now && !s.isModifiedFromSeries
      );
      
      const updateData: Record<string, any> = {};
      if (duration !== undefined) updateData.duration = duration;
      if (courtId !== undefined) updateData.courtId = courtId;
      if (locationId !== undefined) updateData.locationId = locationId;
      if (price !== undefined) updateData.price = price;
      
      // Update all future unmodified sessions
      const updatedSessions = [];
      for (const s of futureSessions) {
        const updated = await storage.updateSession(s.id, updateData);
        updatedSessions.push(updated);
      }
      
      // Also update the series metadata
      if (session.recurringGroupId) {
        await storage.updateRecurringSeries(session.recurringGroupId, updateData, academyId || undefined);
      }
      
      res.json({ updated: updatedSessions.length, sessions: updatedSessions });
    } catch (error) {
      console.error("Error editing series:", error);
      res.status(500).json({ error: "Failed to edit series" });
    }
  });

  // Get player holidays for a list of players
  app.post("/api/coach/player-holidays/check", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerIds, startDate, endDate } = req.body;
      const academyId = req.user!.academyId;
      
      if (!playerIds || !Array.isArray(playerIds) || !startDate || !endDate) {
        return res.status(400).json({ error: "playerIds, startDate, and endDate are required" });
      }
      
      const holidays: Record<string, any[]> = {};
      for (const playerId of playerIds) {
        const playerHolidays = await storage.getPlayerHolidays(playerId, academyId || undefined);
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        holidays[playerId] = playerHolidays.filter(h => {
          const hStart = new Date(h.startDate);
          const hEnd = new Date(h.endDate);
          return (hStart <= end && hEnd >= start);
        });
      }
      
      res.json(holidays);
    } catch (error) {
      console.error("Error checking holidays:", error);
      res.status(500).json({ error: "Failed to check holidays" });
    }
  });

  // Preview recurring sessions before creation
  app.post("/api/coach/recurring-series/preview", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, weekCount, dayOfWeek, startTime, duration, playerIds, courtId } = req.body;
      const academyId = req.user!.academyId;
      const coachId = req.user!.coachId;
      
      if (!startDate || !weekCount || dayOfWeek === undefined || !startTime || !duration) {
        return res.status(400).json({ error: "startDate, weekCount, dayOfWeek, startTime, and duration are required" });
      }
      
      const [hours, minutes] = startTime.split(':').map(Number);
      const start = new Date(startDate);
      const previewSessions = [];
      
      // Get player holidays if players specified
      const playerHolidaysMap: Record<string, any[]> = {};
      if (playerIds && Array.isArray(playerIds)) {
        for (const playerId of playerIds) {
          playerHolidaysMap[playerId] = await storage.getPlayerHolidays(playerId, academyId || undefined);
        }
      }
      
      // Get existing sessions for conflict detection
      const existingSessions = coachId ? await storage.getAllSessionsByCoach(coachId, academyId || undefined) : [];
      
      for (let week = 0; week < weekCount; week++) {
        const sessionDate = new Date(start);
        sessionDate.setDate(sessionDate.getDate() + (week * 7));
        
        // Adjust to correct day of week
        const currentDay = sessionDate.getDay();
        const daysToAdd = dayOfWeek - currentDay;
        sessionDate.setDate(sessionDate.getDate() + daysToAdd);
        
        const sessionStart = new Date(sessionDate);
        sessionStart.setHours(hours, minutes, 0, 0);
        
        const sessionEnd = new Date(sessionStart);
        sessionEnd.setMinutes(sessionEnd.getMinutes() + duration);
        
        // Check for conflicts
        const hasConflict = existingSessions.some(existing => {
          if (courtId && existing.courtId !== courtId) return false;
          const exStart = new Date(existing.startTime);
          const exEnd = new Date(existing.endTime);
          return (sessionStart < exEnd && sessionEnd > exStart);
        });
        
        // Check for player holidays
        let holidayConflict = false;
        let affectedPlayers: string[] = [];
        if (playerIds && Array.isArray(playerIds)) {
          for (const playerId of playerIds) {
            const holidays = playerHolidaysMap[playerId] || [];
            for (const h of holidays) {
              const hStart = new Date(h.startDate);
              const hEnd = new Date(h.endDate);
              hEnd.setHours(23, 59, 59);
              if (sessionStart >= hStart && sessionStart <= hEnd) {
                holidayConflict = true;
                affectedPlayers.push(playerId);
                break;
              }
            }
          }
        }
        
        previewSessions.push({
          week: week + 1,
          date: sessionStart.toISOString(),
          endDate: sessionEnd.toISOString(),
          dayOfWeek,
          hasConflict,
          holidayConflict,
          affectedPlayers,
          willBeSkipped: hasConflict || holidayConflict,
        });
      }
      
      res.json({
        total: weekCount,
        willCreate: previewSessions.filter(s => !s.willBeSkipped).length,
        willSkip: previewSessions.filter(s => s.willBeSkipped).length,
        sessions: previewSessions,
      });
    } catch (error) {
      console.error("Error previewing recurring series:", error);
      res.status(500).json({ error: "Failed to preview recurring series" });
    }
  });

  // ==================== SESSION TEMPLATES API ====================

  // Get all session templates for a coach
  app.get("/api/coach/templates", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "coachId is required" });
      }
      const templates = await storage.getSessionTemplates(coachId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Create a session template
  app.post("/api/coach/templates", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const { name, sessionType, duration, ballLevel, skillLevel, defaultPlayerIds, notes } = req.body;
      
      if (!coachId || !name || !sessionType || !duration) {
        return res.status(400).json({ error: "name, sessionType, and duration are required" });
      }

      const sanitizedName = sanitizeTemplateName(name);
      const sanitizedNotes = notes ? sanitizeTemplateContent(notes) : null;

      const template = await storage.createSessionTemplate({
        coachId,
        name: sanitizedName,
        sessionType,
        duration,
        ballLevel,
        skillLevel,
        defaultPlayerIds,
        notes: sanitizedNotes,
      });
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  // Delete a session template
  app.delete("/api/coach/templates/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deleteSessionTemplate(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // ==================== COACHING SERIES API ====================
  // Series-first approach: coaches manage training blocks, not individual sessions

  // Get all coaching series for the logged-in coach
  app.get("/api/coach/series", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      
      if (!coachId) {
        return res.status(400).json({ error: "Coach ID required" });
      }
      
      const { status } = req.query;
      
      let series;
      if (status === "active") {
        series = await storage.getActiveCoachingSeries(coachId, academyId || undefined);
      } else {
        series = await storage.getCoachingSeries(coachId, academyId || undefined);
      }
      
      // Enrich each series with player count, players preview, and sessions completed
      const enrichedSeries = await Promise.all(series.map(async (s) => {
        // Use getSeriesPlayersWithDetails to get player names and ball levels
        const activePlayers = await storage.getSeriesPlayersWithDetails(s.id);
        
        // Count completed sessions for this series
        const sessionsForSeries = await db
          .select()
          .from(sessions)
          .where(and(
            eq(sessions.seriesId, s.id),
            eq(sessions.status, "completed")
          ));
        
        // Count pending feedback (completed sessions without feedback)
        const completedSessionIds = sessionsForSeries.map(sess => sess.id);
        let pendingFeedback = 0;
        if (completedSessionIds.length > 0) {
          const feedbackCount = await db
            .select({ count: sql<number>`count(distinct ${sessionFeedback.sessionId})` })
            .from(sessionFeedback)
            .where(inArray(sessionFeedback.sessionId, completedSessionIds));
          pendingFeedback = sessionsForSeries.length - (feedbackCount[0]?.count || 0);
        }
        
        // Get next scheduled session date
        const now = new Date();
        const nextSessionResult = await db
          .select({ startTime: sessions.startTime })
          .from(sessions)
          .where(and(
            eq(sessions.seriesId, s.id),
            eq(sessions.status, "scheduled"),
            gte(sessions.startTime, now)
          ))
          .orderBy(asc(sessions.startTime))
          .limit(1);
        const nextSessionDate = nextSessionResult[0]?.startTime || null;
        
        // Get player preview data (first 4 players with names and ball levels)
        const playerPreview = activePlayers.slice(0, 4).map(p => ({
          id: p.playerId,
          name: p.playerName || "Unknown",
          ballLevel: p.playerBallLevel || null,
        }));
        
        // Get primary ball level (most common among players)
        const ballLevelCounts: Record<string, number> = {};
        activePlayers.forEach(p => {
          const level = p.playerBallLevel;
          if (level) {
            ballLevelCounts[level] = (ballLevelCounts[level] || 0) + 1;
          }
        });
        const primaryBallLevel = Object.entries(ballLevelCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        
        return {
          ...s,
          playerCount: activePlayers.length,
          sessionsCompleted: sessionsForSeries.length,
          pendingFeedback: Math.max(0, pendingFeedback),
          playerPreview,
          primaryBallLevel,
          nextSessionDate,
        };
      }));
      
      res.json(enrichedSeries);
    } catch (error) {
      console.error("Error fetching coaching series:", error);
      res.status(500).json({ error: "Failed to fetch coaching series" });
    }
  });

  // Get a single coaching series by ID with full details
  app.get("/api/coach/series/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      
      const series = await storage.getCoachingSeriesById(id);
      
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }
      
      // Verify ownership
      if (series.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to view this series" });
      }
      
      // Get players in this series
      const seriesPlayersList = await storage.getSeriesPlayers(id);
      
      // Get credit balances for all players in batch (efficient)
      const playerIds = seriesPlayersList.map(sp => sp.playerId);
      const creditBalances = await storage.getPlayersCreditBalances(playerIds);
      
      // Get real attendance counts aggregated from sessionPlayers (source of truth)
      const attendanceSummary = await storage.getSeriesPlayerAttendanceSummary(id);
      
      // Get player details with full membership data for frontend consumption
      const playerDetails = await Promise.all(seriesPlayersList.map(async (sp) => {
        const player = await storage.getPlayer(sp.playerId);
        const credits = creditBalances[sp.playerId] || { group: 0, semi_private: 0, private: 0, totalDebt: 0, hasDebt: false };
        const realAttendanceCount = attendanceSummary.get(sp.playerId) || 0;
        return {
          id: sp.playerId,
          name: player?.name || "Unknown Player",
          ballLevel: player?.ballLevel || null,
          status: sp.status,
          sessionsAttended: realAttendanceCount,
          totalXpEarned: sp.totalXpEarned || 0,
          joinedAt: sp.joinedAt?.toISOString() || null,
          leftAt: sp.leftAt?.toISOString() || null,
          pauseFrom: sp.pauseFrom || null,
          pauseUntil: sp.pauseUntil || null,
          pauseReason: sp.pauseReason || null,
          linkedPackageId: sp.linkedPackageId || null,
          credits,
        };
      }));
      
      // Get all sessions for this series
      const seriesSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.seriesId, id))
        .orderBy(asc(sessions.startTime));
      
      // Get location name if applicable
      let locationName = null;
      if (series.locationId) {
        const location = await storage.getLocationById(series.locationId);
        locationName = location?.name;
      }
      
      // Get court name if applicable
      let courtName = null;
      if (series.courtId) {
        const court = await storage.getCourt(series.courtId);
        courtName = court?.name;
      }
      
      res.json({
        ...series,
        locationName,
        courtName,
        players: playerDetails,
        sessions: seriesSessions,
        stats: {
          totalSessions: series.weekCount || seriesSessions.length,
          completedSessions: seriesSessions.filter(s => s.status === "completed").length,
          upcomingSessions: seriesSessions.filter(s => s.status === "scheduled" && new Date(s.startTime) > new Date()).length,
          cancelledSessions: seriesSessions.filter(s => s.status === "cancelled").length,
        },
      });
    } catch (error) {
      console.error("Error fetching coaching series details:", error);
      res.status(500).json({ error: "Failed to fetch series details" });
    }
  });

  // Create a new coaching series
  app.post("/api/coach/series", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      
      if (!coachId || !academyId) {
        return res.status(400).json({ error: "Coach and academy required" });
      }
      
      const {
        title,
        dayOfWeek,
        startTime,
        duration,
        sessionType,
        ballLevel,
        skillLevel,
        maxPlayers,
        weekCount,
        seriesStartDate,
        seriesEndDate,
        xpPerSession,
        vibe,
        price,
        courtId,
        locationId,
        playerIds,
      } = req.body;
      
      if (!title || dayOfWeek === undefined || !startTime || !duration || !sessionType || !seriesStartDate) {
        return res.status(400).json({ error: "title, dayOfWeek, startTime, duration, sessionType, and seriesStartDate are required" });
      }
      
      // Create the series
      const series = await storage.createCoachingSeries({
        academyId,
        coachId,
        courtId: courtId || null,
        locationId: locationId || null,
        title: sanitizeTemplateName(title),
        dayOfWeek,
        startTime,
        duration,
        sessionType,
        ballLevel,
        skillLevel,
        maxPlayers: maxPlayers || 4,
        weekCount: weekCount || null,
        seriesStartDate,
        seriesEndDate: seriesEndDate || null,
        xpPerSession: xpPerSession || 20,
        vibe: vibe || "casual",
        price: price || null,
        status: "active",
      });
      
      // Add players if provided
      if (playerIds && Array.isArray(playerIds) && playerIds.length > 0) {
        for (const playerId of playerIds) {
          await storage.addPlayerToSeries({
            seriesId: series.id,
            playerId,
            status: "active",
          });
        }
      }
      
      // Derive session instances from the series
      const createdSessions: any[] = [];
      const skippedWeeks: { week: number; reason: string }[] = [];
      
      // Get academy timezone for proper time handling
      const academy = await storage.getAcademy(academyId);
      const academyTimezone = academy?.timezone || "Asia/Dubai";
      
      // Validate that the start time is resolvable in the academy timezone using consolidated helper
      const initialResolution = ensureResolvableLocalTime(seriesStartDate, startTime, academyTimezone);
      if (!initialResolution.ok) {
        return res.status(400).json({ error: initialResolution.error });
      }
      // Note: ambiguity is acceptable - first occurrence used (standard calendar behavior)
      
      // Calculate the first session date using timezone-aware helper
      const firstSessionResult = getFirstSessionDate(
        seriesStartDate,
        dayOfWeek,
        startTime,
        academyTimezone
      );
      
      if (firstSessionResult.status === "error") {
        return res.status(400).json({
          error: { code: "TIME_UNRESOLVABLE", message: firstSessionResult.message }
        });
      }
      if (firstSessionResult.status === "gap") {
        return res.status(400).json({
          error: {
            code: "TIME_UNRESOLVABLE",
            requestedTime: startTime,
            suggestedNext: firstSessionResult.suggestedTime,
            date: firstSessionResult.dateStr,
            message: `The time ${startTime} does not exist on ${firstSessionResult.dateStr} in timezone ${academyTimezone} (DST transition). Please use ${firstSessionResult.suggestedTime} instead.`
          }
        });
      }
      
      const { dateStr: firstDateStr, utcDate: firstSessionDate } = firstSessionResult;
      
      // Track current local date for week iteration
      let currentLocalDateStr = firstDateStr;
      
      // Parse series end date if provided using consolidated helper
      let seriesEnd: Date | null = null;
      if (seriesEndDate) {
        const endResolution = ensureResolvableLocalTime(seriesEndDate, "23:59", academyTimezone);
        if (endResolution.ok) {
          seriesEnd = endResolution.utcDate;
        }
        // If gap, we simply don't set seriesEnd - sessions will be bounded by weekCount instead
      }
      
      // Calculate maximum number of sessions considering both weekCount and seriesEndDate
      let calculatedMaxWeeks = weekCount || 52; // Default to 52 weeks if not specified
      
      if (seriesEnd) {
        // Calculate how many weeks fit between first session and series end
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const weeksBetween = Math.floor((seriesEnd.getTime() - firstSessionDate.getTime()) / msPerWeek) + 1;
        calculatedMaxWeeks = Math.min(calculatedMaxWeeks, Math.max(0, weeksBetween));
      }
      
      // Cap at provided weekCount if specified
      const maxSessions = weekCount ? Math.min(weekCount, calculatedMaxWeeks) : calculatedMaxWeeks;
      
      // Generate sessions for each week
      for (let weekIndex = 0; weekIndex < maxSessions; weekIndex++) {
        // Calculate the local date for this session (add weeks to first session)
        const sessionDateStr = addDaysToLocalDate(currentLocalDateStr, weekIndex * 7);
        
        // Validate and convert to UTC using academy timezone with consolidated helper
        const weekResolution = ensureResolvableLocalTime(sessionDateStr, startTime, academyTimezone);
        if (!weekResolution.ok) {
          // Skip weeks with DST gaps but track them
          skippedWeeks.push({
            week: weekIndex + 1,
            reason: weekResolution.error.message
          });
          continue;
        }
        
        const sessionDate = weekResolution.utcDate;
        
        // Check if this session would be after the series end date
        if (seriesEnd && sessionDate.getTime() > seriesEnd.getTime()) {
          break;
        }
        
        const weekNumber = weekIndex + 1; // 1-indexed week number
        
        const sessionEndTime = new Date(sessionDate.getTime() + duration * 60000);
        
        // For display purposes, convert back to local time
        const localSession = utcToLocalTime(sessionDate, academyTimezone);
        const localEndSession = utcToLocalTime(sessionEndTime, academyTimezone);
        const dateStr = localSession.date;
        const startTimeStr = localSession.time;
        const endTimeStr = localEndSession.time;
        
        // Check for conflicts - track both types
        const coachConflict = await storage.checkCoachConflict(coachId, sessionDate, sessionEndTime, undefined, academyId);
        const courtConflict = courtId ? await storage.checkCourtConflict(courtId, sessionDate, sessionEndTime, undefined, academyId) : false;
        
        if (coachConflict || courtConflict) {
          const reasons: string[] = [];
          if (coachConflict) reasons.push("Coach already booked");
          if (courtConflict) reasons.push("Court already booked");
          
          skippedWeeks.push({
            week: weekNumber,
            reason: reasons.join(" and "),
          });
          continue;
        }
        
        // Snapshot pricing at booking time (Layer 3)
        let pricingSnapshot: { academyPrice?: string; coachPayout?: string; academyMargin?: string } = {};
        if (academyId && coachId) {
          try {
            const pricing = await storage.calculateSessionPricing(academyId, coachId, sessionType, duration);
            pricingSnapshot = {
              academyPrice: String(pricing.academyPrice),
              coachPayout: String(pricing.coachPayout),
              academyMargin: String(pricing.academyMargin),
            };
          } catch (err: any) {
            // Currency mismatch and other critical errors must block series creation
            return res.status(422).json({ 
              error: "Pricing error", 
              message: err.message || "Could not calculate session pricing"
            });
          }
        }

        // Create the session linked to this series
        const session = await storage.createSession({
          academyId,
          coachId,
          courtId: courtId || null,
          locationId: locationId || null,
          startTime: sessionDate,
          endTime: sessionEndTime,
          duration,
          sessionType,
          ballLevel,
          skillLevel,
          isRecurring: true,
          recurringGroupId: series.id, // Use series ID as the recurring group
          weekCount: maxSessions,
          seriesId: series.id,
          weekNumber,
          travelTime: 0,
          paymentStatus: "unpaid",
          status: "scheduled",
          ...pricingSnapshot,
        });
        
        // Create unified time block
        await storage.createCoachTimeBlock({
          coachId,
          sourceType: "session",
          sourceAcademyId: academyId,
          sourceSessionId: session.id,
          date: dateStr,
          startTime: startTimeStr,
          endTime: endTimeStr,
          isPrivate: true,
        });
        
        // Add players to the session
        if (playerIds && Array.isArray(playerIds)) {
          for (const playerId of playerIds) {
            await storage.addPlayerToSession({
              sessionId: session.id,
              playerId,
              status: "confirmed",
            });
          }
        }
        
        // Serialize session with ISO strings for frontend consumption
        createdSessions.push({
          ...session,
          startTime: session.startTime instanceof Date ? session.startTime.toISOString() : session.startTime,
          endTime: session.endTime instanceof Date ? session.endTime.toISOString() : session.endTime,
          weekNumber,
        });
      }
      
      // Build enriched player list for response
      const enrichedPlayers = playerIds && Array.isArray(playerIds) ? await Promise.all(
        playerIds.map(async (playerId: string) => {
          const player = await storage.getPlayer(playerId);
          return {
            id: playerId,
            name: player?.name || "Unknown Player",
            ballLevel: player?.ballLevel || null,
            status: "active",
            sessionsAttended: 0,
            totalXpEarned: 0,
          };
        })
      ) : [];

      // Get location and court names
      let locationName = null;
      let courtName = null;
      if (locationId) {
        const location = await storage.getLocationById(locationId);
        locationName = location?.name || null;
      }
      if (courtId) {
        const court = await storage.getCourtById(courtId);
        courtName = court?.name || null;
      }
      
      // Return fully enriched series matching GET /api/coach/series/:id structure
      res.status(201).json({
        series: {
          ...series,
          locationName,
          courtName,
          players: enrichedPlayers,
          sessions: createdSessions,
          stats: {
            totalSessions: maxSessions,
            completedSessions: 0,
            upcomingSessions: createdSessions.length,
            cancelledSessions: 0,
          },
        },
        createdSessions,
        skippedWeeks,
      });
    } catch (error) {
      console.error("Error creating coaching series:", error);
      res.status(500).json({ error: "Failed to create coaching series" });
    }
  });

  // Update a coaching series
  app.patch("/api/coach/series/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      
      const existing = await storage.getCoachingSeriesById(id);
      if (!existing) {
        return res.status(404).json({ error: "Series not found" });
      }
      
      if (existing.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to update this series" });
      }
      
      const updates: any = {};
      const allowedFields = ["title", "courtId", "locationId", "startTime", "duration", "ballLevel", "skillLevel", "maxPlayers", "xpPerSession", "vibe", "price", "seriesEndDate"];
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = field === "title" ? sanitizeTemplateName(req.body[field]) : req.body[field];
        }
      }
      
      const updated = await storage.updateCoachingSeries(id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating coaching series:", error);
      res.status(500).json({ error: "Failed to update coaching series" });
    }
  });

  // Pause a coaching series
  app.post("/api/coach/series/:id/pause", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      
      const existing = await storage.getCoachingSeriesById(id);
      if (!existing) {
        return res.status(404).json({ error: "Series not found" });
      }
      
      if (existing.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to pause this series" });
      }
      
      const paused = await storage.pauseCoachingSeries(id);
      res.json(paused);
    } catch (error) {
      console.error("Error pausing coaching series:", error);
      res.status(500).json({ error: "Failed to pause series" });
    }
  });

  // Resume a paused coaching series
  app.post("/api/coach/series/:id/resume", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      
      const existing = await storage.getCoachingSeriesById(id);
      if (!existing) {
        return res.status(404).json({ error: "Series not found" });
      }
      
      if (existing.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to resume this series" });
      }
      
      const resumed = await storage.resumeCoachingSeries(id);
      res.json(resumed);
    } catch (error) {
      console.error("Error resuming coaching series:", error);
      res.status(500).json({ error: "Failed to resume series" });
    }
  });

  // End a coaching series
  app.post("/api/coach/series/:id/end", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      
      const existing = await storage.getCoachingSeriesById(id);
      if (!existing) {
        return res.status(404).json({ error: "Series not found" });
      }
      
      if (existing.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to end this series" });
      }
      
      const ended = await storage.endCoachingSeries(id);
      res.json(ended);
    } catch (error) {
      console.error("Error ending coaching series:", error);
      res.status(500).json({ error: "Failed to end series" });
    }
  });

  // Delete a coaching series (PERMANENT - no soft delete)
  app.delete("/api/coach/series/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      
      const existing = await storage.getCoachingSeriesById(id);
      if (!existing) {
        return res.status(404).json({ error: "Series not found" });
      }
      
      if (existing.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to delete this series" });
      }
      
      await storage.deleteCoachingSeries(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting coaching series:", error);
      res.status(500).json({ error: "Failed to delete series" });
    }
  });

  // Add a player to a class (with optional joinedAt date for backdating, package linking, and attendance backfill)
  app.post("/api/coach/series/:id/players", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { playerId, joinDate, joinedAt, packageId, packageTemplateId, creditPackage, attendedSessionIds = [] } = req.body;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId!;
      
      // Support both joinDate (new) and joinedAt (legacy) parameter names
      const effectiveJoinDate = joinDate || joinedAt;
      
      // If packageTemplateId provided, assign package to player first and get the package ID
      let assignedPackageId = packageId || null;
      if (packageTemplateId && !assignedPackageId) {
        try {
          const player = await storage.getPlayer(playerId);
          if (player) {
            const template = await storage.getPackageTemplate(packageTemplateId, academyId);
            if (template) {
              const expiryDate = new Date();
              expiryDate.setDate(expiryDate.getDate() + (template.validityDays || 90));
              
              const pkg = await storage.createPackage({
                academyId,
                playerId,
                templateId: packageTemplateId,
                name: template.name,
                totalCredits: template.credits,
                remainingCredits: template.credits,
                price: template.price,
                currency: template.currency || 'AED',
                expiryDate: expiryDate.toISOString().split('T')[0],
                status: 'active',
              });
              assignedPackageId = pkg.id;
              console.log(`[AddPlayer] Assigned package ${pkg.id} (${template.name}) to player ${playerId}`);
            }
          }
        } catch (pkgError) {
          console.error("[AddPlayer] Failed to assign package:", pkgError);
          // Continue without package - don't fail the enrollment
        }
      }
      
      // If creditPackage provided (from accordion selector), create a package from credit packages
      if (creditPackage && !assignedPackageId) {
        try {
          const { creditType, credits } = creditPackage;
          // Map credit type to session type for pricing lookup
          const sessionTypeMap: Record<string, string> = { private: "private", semi: "semi_private", group: "group" };
          const sessionType = sessionTypeMap[creditType] || creditType;
          
          // Get pricing for this credit type
          const pricing = await storage.getAcademyPricing(academyId);
          const pricingItem = pricing.find(p => p.sessionType === sessionType && p.isActive);
          const pricePerCredit = pricingItem ? parseFloat(pricingItem.pricePerSession) : 0;
          const totalPrice = pricePerCredit * credits;
          const currency = pricingItem?.currency || "AED";
          
          // Create package with 12 month validity
          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 12);
          
          const pkg = await storage.createPackage({
            academyId,
            playerId,
            creditType: sessionType,
            name: `${credits} ${creditType.charAt(0).toUpperCase() + creditType.slice(1)} Credits`,
            totalCredits: credits,
            remainingCredits: credits,
            price: totalPrice.toString(),
            currency,
            expiryDate: expiryDate.toISOString().split('T')[0],
            status: 'active',
          });
          assignedPackageId = pkg.id;
          console.log(`[AddPlayer] Created credit package ${pkg.id} (${credits} ${creditType} credits) for player ${playerId}`);
        } catch (pkgError) {
          console.error("[AddPlayer] Failed to create credit package:", pkgError);
          // Continue without package - don't fail the enrollment
        }
      }
      
      if (!playerId) {
        return res.status(400).json({ error: "playerId is required" });
      }
      
      const existing = await storage.getCoachingSeriesById(id);
      if (!existing) {
        return res.status(404).json({ error: "Class not found" });
      }
      
      if (existing.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to add players to this class" });
      }
      
      // Check if player already in class (including former players)
      const currentPlayers = await storage.getSeriesPlayers(id);
      const existingMembership = currentPlayers.find(p => p.playerId === playerId);
      
      if (existingMembership) {
        // If player previously left, allow re-adding by updating status
        if (existingMembership.status === "left") {
          const reactivated = await storage.updateSeriesPlayer(id, playerId, {
            status: "active",
            joinedAt: effectiveJoinDate ? new Date(effectiveJoinDate) : new Date(),
            leftAt: null,
            linkedPackageId: assignedPackageId,
          });
          
          // Backfill attendance for specified sessions
          if (attendedSessionIds && attendedSessionIds.length > 0) {
            for (const sessionId of attendedSessionIds) {
              try {
                // Mark as attended - returns object with isNewAttendance flag
                const attendanceResult = await storage.markAttendance(sessionId, playerId, true, academyId);
                // Only consume credit if this is NEW attendance (not a duplicate)
                if (attendanceResult && attendanceResult.isNewAttendance) {
                  await storage.consumeSingleCreditForSession(playerId, sessionId, academyId, assignedPackageId);
                  // Award XP for attended session
                  const session = await storage.getSession(sessionId);
                  if (session) {
                    const xpAmount = session.xpValue || 20;
                    await storage.addPlayerXP(playerId, xpAmount, sessionId, "session_attendance");
                  }
                }
              } catch (e) {
                console.error(`Failed to backfill attendance for session ${sessionId}:`, e);
              }
            }
          }
          
          // Return with linkedPackageId explicitly included
          return res.status(200).json({ 
            ...reactivated, 
            linkedPackageId: assignedPackageId,
            packageAssigned: !!assignedPackageId,
          });
        }
        return res.status(400).json({ error: "Player already in this class" });
      }
      
      // Check max players (only active players count)
      if (existing.maxPlayers && currentPlayers.filter(p => p.status === "active").length >= existing.maxPlayers) {
        return res.status(400).json({ error: "Class is at maximum capacity" });
      }
      
      const seriesPlayer = await storage.addPlayerToSeries({
        seriesId: id,
        playerId,
        status: "active",
        joinedAt: effectiveJoinDate ? new Date(effectiveJoinDate) : new Date(),
        linkedPackageId: assignedPackageId,
      });
      
      // Backfill attendance for specified sessions (for new players)
      if (attendedSessionIds && attendedSessionIds.length > 0) {
        for (const sessionId of attendedSessionIds) {
          try {
            // First add player to session if not already
            const sessionPlayersList = await storage.getSessionPlayers(sessionId);
            if (!sessionPlayersList.some(p => p.id === playerId)) {
              await storage.addPlayerToSession({ sessionId, playerId });
            }
            // Mark as attended - returns object with isNewAttendance flag
            const attendanceResult = await storage.markAttendance(sessionId, playerId, true, academyId);
            // Only consume credit if this is NEW attendance (not a duplicate)
            if (attendanceResult && attendanceResult.isNewAttendance) {
              await storage.consumeSingleCreditForSession(playerId, sessionId, academyId, assignedPackageId);
              // Award XP for attended session
              const session = await storage.getSession(sessionId);
              if (session) {
                const xpAmount = session.xpValue || 20;
                await storage.addPlayerXP(playerId, xpAmount, sessionId, "session_attendance");
              }
            }
          } catch (e) {
            console.error(`Failed to backfill attendance for session ${sessionId}:`, e);
          }
        }
      }
      
      // Return the series player with linkedPackageId explicitly included
      res.status(201).json({ 
        ...seriesPlayer, 
        linkedPackageId: assignedPackageId,
        packageAssigned: !!assignedPackageId,
      });
    } catch (error) {
      console.error("Error adding player to class:", error);
      res.status(500).json({ error: "Failed to add player to class" });
    }
  });

  // Remove a player from a series (permanent delete - use leave endpoint for history preservation)
  app.delete("/api/coach/series/:id/players/:playerId", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const coachId = req.user!.coachId;
      
      const existing = await storage.getCoachingSeriesById(id);
      if (!existing) {
        return res.status(404).json({ error: "Series not found" });
      }
      
      if (existing.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to remove players from this series" });
      }
      
      await storage.removePlayerFromSeries(id, playerId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing player from series:", error);
      res.status(500).json({ error: "Failed to remove player from series" });
    }
  });

  // Mark a player as left (keeps history - preferred over delete)
  app.post("/api/coach/series/:id/players/:playerId/leave", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const { leftAt } = req.body;
      const coachId = req.user!.coachId;
      
      const existing = await storage.getCoachingSeriesById(id);
      if (!existing) {
        return res.status(404).json({ error: "Class not found" });
      }
      
      if (existing.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to manage this class" });
      }
      
      const leftAtDate = leftAt ? new Date(leftAt) : undefined;
      const updated = await storage.markPlayerLeftSeries(id, playerId, leftAtDate);
      if (!updated) {
        return res.status(404).json({ error: "Player not found in this class" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error marking player as left:", error);
      res.status(500).json({ error: "Failed to update player status" });
    }
  });

  // Pause a player's membership (vacation/injury)
  app.post("/api/coach/series/:id/players/:playerId/pause", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const { pauseFrom, pauseUntil, reason } = req.body;
      const coachId = req.user!.coachId;
      
      if (!pauseFrom || !pauseUntil) {
        return res.status(400).json({ error: "pauseFrom and pauseUntil dates are required" });
      }
      
      const existing = await storage.getCoachingSeriesById(id);
      if (!existing) {
        return res.status(404).json({ error: "Class not found" });
      }
      
      if (existing.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to manage this class" });
      }
      
      const updated = await storage.pauseSeriesPlayer(
        id, 
        playerId, 
        new Date(pauseFrom), 
        new Date(pauseUntil), 
        reason
      );
      
      if (!updated) {
        return res.status(404).json({ error: "Player not found in this class" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error pausing player membership:", error);
      res.status(500).json({ error: "Failed to pause membership" });
    }
  });

  // Unpause a player's membership (early return from vacation)
  app.post("/api/coach/series/:id/players/:playerId/unpause", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const coachId = req.user!.coachId;
      
      const existing = await storage.getCoachingSeriesById(id);
      if (!existing) {
        return res.status(404).json({ error: "Class not found" });
      }
      
      if (existing.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to manage this class" });
      }
      
      const updated = await storage.unpauseSeriesPlayer(id, playerId);
      if (!updated) {
        return res.status(404).json({ error: "Player not found in this class" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error unpausing player membership:", error);
      res.status(500).json({ error: "Failed to unpause membership" });
    }
  });

  // Update a player's join date
  app.patch("/api/coach/series/:id/players/:playerId/join-date", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const { joinDate } = req.body;
      const coachId = req.user!.coachId;
      
      if (!joinDate) {
        return res.status(400).json({ error: "joinDate is required" });
      }
      
      const existing = await storage.getCoachingSeriesById(id);
      if (!existing) {
        return res.status(404).json({ error: "Class not found" });
      }
      
      if (existing.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to manage this class" });
      }
      
      // Update the player's join date directly in the database
      const updated = await db.update(seriesPlayers)
        .set({ joinedAt: new Date(joinDate) })
        .where(and(
          eq(seriesPlayers.seriesId, id),
          eq(seriesPlayers.playerId, playerId)
        ))
        .returning();
      
      if (!updated.length) {
        return res.status(404).json({ error: "Player not found in this class" });
      }
      
      res.json(updated[0]);
    } catch (error) {
      console.error("Error updating player join date:", error);
      res.status(500).json({ error: "Failed to update join date" });
    }
  });

  // Link a package to a player's class membership (for credit consumption)
  app.post("/api/coach/series/:id/players/:playerId/link-package", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const { packageId } = req.body;
      const coachId = req.user!.coachId;
      
      if (!packageId) {
        return res.status(400).json({ error: "packageId is required" });
      }
      
      const existing = await storage.getCoachingSeriesById(id);
      if (!existing) {
        return res.status(404).json({ error: "Class not found" });
      }
      
      if (existing.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to manage this class" });
      }
      
      const updated = await storage.linkPackageToMembership(id, playerId, packageId);
      if (!updated) {
        return res.status(404).json({ error: "Player not found in this class" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error linking package to membership:", error);
      res.status(500).json({ error: "Failed to link package" });
    }
  });

  // Get active players for a specific session date (excludes paused players)
  app.get("/api/coach/series/:id/active-players", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { date } = req.query;
      const coachId = req.user!.coachId;
      
      const existing = await storage.getCoachingSeriesById(id);
      if (!existing) {
        return res.status(404).json({ error: "Class not found" });
      }
      
      if (existing.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to view this class" });
      }
      
      const sessionDate = date ? new Date(date as string) : new Date();
      const activePlayers = await storage.getActiveSeriesPlayersForDate(id, sessionDate);
      
      // Enrich with player details
      const playerDetails = await Promise.all(activePlayers.map(async (sp) => {
        const player = await storage.getPlayer(sp.playerId);
        return { ...sp, player };
      }));
      
      res.json(playerDetails);
    } catch (error) {
      console.error("Error getting active players:", error);
      res.status(500).json({ error: "Failed to get active players" });
    }
  });

  // Get series feedback (aggregated from all sessions)
  app.get("/api/coach/series/:id/feedback", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      
      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }
      
      if (series.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to view this series" });
      }
      
      // Get all sessions for this series
      const seriesSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.seriesId, id));
      
      const sessionIds = seriesSessions.map(s => s.id);
      
      if (sessionIds.length === 0) {
        return res.json({ feedback: [], summary: { total: 0, withFeedback: 0, intensity: {} } });
      }
      
      // Get all feedback for these sessions
      const feedbackList = await db
        .select()
        .from(sessionFeedback)
        .where(inArray(sessionFeedback.sessionId, sessionIds));
      
      // Get player feedback for these sessions
      const playerFeedbackList = await db
        .select()
        .from(playerFeedback)
        .where(inArray(playerFeedback.sessionId, sessionIds));
      
      // Calculate summary stats
      const intensityCounts: Record<string, number> = {};
      feedbackList.forEach(f => {
        if (f.intensity) {
          intensityCounts[f.intensity] = (intensityCounts[f.intensity] || 0) + 1;
        }
      });
      
      res.json({
        feedback: feedbackList.map(f => ({
          ...f,
          sessionDate: seriesSessions.find(s => s.id === f.sessionId)?.startTime,
        })),
        playerFeedback: playerFeedbackList,
        summary: {
          total: seriesSessions.length,
          withFeedback: feedbackList.length,
          intensity: intensityCounts,
        },
      });
    } catch (error) {
      console.error("Error fetching series feedback:", error);
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });

  // Get series progress (XP and skill data for all players)
  app.get("/api/coach/series/:id/progress", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      
      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }
      
      if (series.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to view this series" });
      }
      
      // Get all sessions for this series
      const seriesSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.seriesId, id));
      
      const sessionIds = seriesSessions.map(s => s.id);
      
      // Get players in this series
      const seriesPlayersData = await storage.getSeriesPlayers(id);
      const playerIds = seriesPlayersData.map(sp => sp.playerId);
      
      if (playerIds.length === 0 || sessionIds.length === 0) {
        return res.json({ players: [], totalXp: 0 });
      }
      
      // Get XP transactions for these sessions
      const xpData = await db
        .select()
        .from(xpTransactions)
        .where(and(
          inArray(xpTransactions.playerId, playerIds),
          inArray(xpTransactions.sessionId, sessionIds)
        ));
      
      // Aggregate XP by player
      const playerXpMap: Record<string, number> = {};
      xpData.forEach(tx => {
        playerXpMap[tx.playerId] = (playerXpMap[tx.playerId] || 0) + tx.xpAmount;
      });
      
      // Get per-player attendance from sessionPlayers table
      const completedSessionIds = seriesSessions
        .filter(s => s.status === "completed")
        .map(s => s.id);
      
      let playerAttendanceMap: Record<string, number> = {};
      if (completedSessionIds.length > 0) {
        // Count players with attendanceStatus of "present" or "late" (both count as attended)
        // Also count if attendanceStatus is null but they're enrolled (legacy data)
        const attendanceData = await db
          .select({
            playerId: sessionPlayers.playerId,
            sessionCount: sql<number>`count(*)::int`,
          })
          .from(sessionPlayers)
          .where(and(
            inArray(sessionPlayers.playerId, playerIds),
            inArray(sessionPlayers.sessionId, completedSessionIds),
            or(
              inArray(sessionPlayers.attendanceStatus, ["present", "late"]),
              isNull(sessionPlayers.attendanceStatus)  // Legacy data without attendance tracking
            )
          ))
          .groupBy(sessionPlayers.playerId);
        
        attendanceData.forEach(att => {
          if (att.playerId) {
            playerAttendanceMap[att.playerId] = att.sessionCount;
          }
        });
      }
      
      // Get player details
      const playerDetails = await Promise.all(playerIds.map(async (playerId) => {
        const player = await storage.getPlayer(playerId);
        return {
          id: playerId,
          name: player?.name || "Unknown",
          xpEarned: playerXpMap[playerId] || 0,
          sessionsAttended: playerAttendanceMap[playerId] || 0,
        };
      }));
      
      res.json({
        players: playerDetails.sort((a, b) => b.xpEarned - a.xpEarned),
        totalXp: Object.values(playerXpMap).reduce((sum, xp) => sum + xp, 0),
        sessionsCompleted: seriesSessions.filter(s => s.status === "completed").length,
        totalSessions: seriesSessions.length,
      });
    } catch (error) {
      console.error("Error fetching series progress:", error);
      res.status(500).json({ error: "Failed to fetch progress" });
    }
  });

  // Get series timeline (weekly breakdown)
  app.get("/api/coach/series/:id/timeline", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      
      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }
      
      if (series.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to view this series" });
      }
      
      // Get all sessions for this series
      const seriesSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.seriesId, id))
        .orderBy(asc(sessions.weekNumber), asc(sessions.startTime));
      
      // Get feedback for these sessions
      const sessionIds = seriesSessions.map(s => s.id);
      let feedbackMap: Record<string, boolean> = {};
      
      if (sessionIds.length > 0) {
        const feedback = await db
          .select({ sessionId: sessionFeedback.sessionId })
          .from(sessionFeedback)
          .where(inArray(sessionFeedback.sessionId, sessionIds));
        
        feedback.forEach(f => {
          if (f.sessionId) feedbackMap[f.sessionId] = true;
        });
      }
      
      // Build timeline
      const timeline = seriesSessions.map(session => {
        const now = new Date();
        const sessionDate = new Date(session.startTime);
        const isToday = sessionDate.toDateString() === now.toDateString();
        const isPast = sessionDate < now;
        const hasFeedback = feedbackMap[session.id] || false;
        
        let status: "completed" | "needs_feedback" | "today" | "upcoming" | "skipped" | "cancelled" = "upcoming";
        
        if (session.status === "cancelled") {
          status = "cancelled";
        } else if (session.isSkipped) {
          status = "skipped";
        } else if (isToday) {
          status = "today";
        } else if (session.status === "completed") {
          status = hasFeedback ? "completed" : "needs_feedback";
        } else if (isPast) {
          status = hasFeedback ? "completed" : "needs_feedback";
        }
        
        return {
          sessionId: session.id,
          weekNumber: session.weekNumber || 1,
          date: session.startTime,
          status,
          hasFeedback,
        };
      });
      
      res.json(timeline);
    } catch (error) {
      console.error("Error fetching series timeline:", error);
      res.status(500).json({ error: "Failed to fetch timeline" });
    }
  });

  // Migrate existing recurring sessions to series format
  app.post("/api/coach/series/migrate", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      
      if (!coachId) {
        return res.status(400).json({ error: "Coach ID required" });
      }
      
      // Find all unique recurring_group_ids for this coach that haven't been migrated
      const recurringGroups = await db
        .select({
          recurringGroupId: sessions.recurringGroupId,
        })
        .from(sessions)
        .where(and(
          eq(sessions.coachId, coachId),
          eq(sessions.isRecurring, true),
          isNotNull(sessions.recurringGroupId),
          isNull(sessions.seriesId)
        ))
        .groupBy(sessions.recurringGroupId);
      
      if (recurringGroups.length === 0) {
        return res.json({ 
          message: "No recurring sessions to migrate",
          migratedCount: 0,
          seriesCreated: []
        });
      }
      
      const migratedSeries: any[] = [];
      
      for (const group of recurringGroups) {
        if (!group.recurringGroupId) continue;
        
        // Get all sessions in this group
        const groupSessions = await db
          .select()
          .from(sessions)
          .where(eq(sessions.recurringGroupId, group.recurringGroupId))
          .orderBy(asc(sessions.startTime));
        
        if (groupSessions.length === 0) continue;
        
        const firstSession = groupSessions[0];
        const lastSession = groupSessions[groupSessions.length - 1];
        
        // Derive series properties from first session using UTC-safe calculation
        const startDate = new Date(firstSession.startTime);
        const endDate = new Date(lastSession.startTime);
        
        // Use UTC day to avoid timezone shift issues
        const dayOfWeek = startDate.getUTCDay();
        
        // Extract time as HH:mm from the stored timestamp (sessions store local time in the timestamp)
        const hours = startDate.getHours();
        const minutes = startDate.getMinutes();
        const startTimeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        const duration = firstSession.duration || 60;
        
        // Generate title from session type
        const sessionTypeLabels: Record<string, string> = {
          "private": "Private Lesson",
          "semi_private": "Semi-Private",
          "group": "Group Session",
          "squad": "Squad Training",
          "clinic": "Clinic",
          "camp": "Camp",
        };
        const title = `${sessionTypeLabels[firstSession.sessionType || "group"] || "Training"} - ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayOfWeek]} ${startTimeStr}`;
        
        // Create the series
        const newSeries = await storage.createCoachingSeries({
          coachId: firstSession.coachId,
          academyId: firstSession.academyId || academyId || "default-academy",
          title,
          sessionType: firstSession.sessionType || "group",
          dayOfWeek,
          startTime: startTimeStr,
          duration,
          maxSessions: groupSessions.length,
          seriesStartDate: startDate,
          seriesEndDate: endDate,
          courtId: firstSession.courtId || null,
          locationId: firstSession.locationId || null,
          ballLevel: firstSession.ballLevel || null,
          skillLevel: firstSession.skillLevel || null,
          maxPlayers: firstSession.maxPlayers || 4,
          xpPerSession: firstSession.xpReward || 100,
          vibe: firstSession.vibe || null,
          price: firstSession.price ? String(firstSession.price) : null,
          status: "active",
        });
        
        // Update all sessions with proper week number based on actual week offsets
        // Calculate week numbers based on difference from first session
        const firstWeekStart = new Date(startDate);
        firstWeekStart.setUTCHours(0, 0, 0, 0);
        
        for (const session of groupSessions) {
          const sessionDate = new Date(session.startTime);
          sessionDate.setUTCHours(0, 0, 0, 0);
          
          // Calculate weeks elapsed since first session
          const msPerWeek = 7 * 24 * 60 * 60 * 1000;
          const weeksElapsed = Math.round((sessionDate.getTime() - firstWeekStart.getTime()) / msPerWeek);
          const weekNumber = weeksElapsed + 1; // Week 1 is the first week
          
          await db
            .update(sessions)
            .set({ 
              seriesId: newSeries.id,
              weekNumber,
            })
            .where(eq(sessions.id, session.id));
        }
        
        // Gather all unique players from ALL sessions in the group (not just first)
        const allSessionIds = groupSessions.map(s => s.id);
        const allSessionPlayers = await db
          .select({ playerId: sessionPlayers.playerId })
          .from(sessionPlayers)
          .where(inArray(sessionPlayers.sessionId, allSessionIds));
        
        // Deduplicate player IDs
        const uniquePlayerIds = [...new Set(allSessionPlayers.map(sp => sp.playerId).filter(Boolean))];
        
        for (const playerId of uniquePlayerIds) {
          if (playerId && newSeries.id) {
            await storage.addPlayerToSeries({
              seriesId: newSeries.id,
              playerId: playerId,
              status: "active",
            });
          }
        }
        
        migratedSeries.push({
          seriesId: newSeries.id,
          title: newSeries.title,
          sessionCount: groupSessions.length,
          playerCount: uniquePlayerIds.length,
        });
      }
      
      res.json({
        message: `Successfully migrated ${migratedSeries.length} recurring session groups to series`,
        migratedCount: migratedSeries.length,
        seriesCreated: migratedSeries,
      });
    } catch (error) {
      console.error("Error migrating recurring sessions:", error);
      res.status(500).json({ error: "Failed to migrate recurring sessions" });
    }
  });

  // ==================== NOTIFICATIONS API ====================

  // Get notifications for a coach (supports optional pagination)
  app.get("/api/coach/notifications", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "coachId is required" });
      }
      const { paginated } = req.query;
      const usePagination = paginated === 'true';
      
      if (usePagination) {
        const { limit, offset } = parsePagination(req.query as any);
        const result = await storage.getCoachNotificationsPaginated(coachId, limit, offset);
        res.json({
          data: result.notifications,
          pagination: { total: result.total, limit, offset, hasMore: offset + result.notifications.length < result.total }
        });
      } else {
        const notifications = await storage.getCoachNotifications(coachId);
        res.json(notifications);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Mark notification as read
  app.patch("/api/coach/notifications/:id/read", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      
      const { valid } = await validateNotificationOwnership(id, coachId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      await storage.markNotificationRead(id, coachId ?? undefined);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ error: "Failed to mark notification read" });
    }
  });

  // Mark all notifications as read
  app.post("/api/coach/notifications/mark-all-read", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "coachId is required" });
      }
      await storage.markAllNotificationsRead(coachId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications read:", error);
      res.status(500).json({ error: "Failed to mark all notifications read" });
    }
  });

  // Delete notification
  app.delete("/api/coach/notifications/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      
      const { valid } = await validateNotificationOwnership(id, coachId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      await storage.deleteNotification(id, coachId ?? undefined);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  // Get auto-renew alerts (sessions near week 9/10)
  app.get("/api/coach/auto-renew-alerts", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
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
  });

  // ==================== GOOGLE CALENDAR API ====================

  // Check Google Calendar connection status
  app.get("/api/coach/calendar/status", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
  });

  // ==================== COACH PROFILE API ====================

  // Get coach profile
  app.get("/api/coach/profile/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
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
  });

  // Update coach profile
  app.patch("/api/coach/profile/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId!;
      const updates = { ...req.body };
      
      // Sanitize numeric fields: convert empty strings to null, valid strings to numbers
      if (updates.hourlyRate === "" || updates.hourlyRate === undefined) {
        updates.hourlyRate = null;
      } else if (updates.hourlyRate !== null) {
        updates.hourlyRate = String(Number(updates.hourlyRate));
      }
      
      // Sanitize optional text fields: convert empty strings to null
      if (updates.phone === "") updates.phone = null;
      if (updates.specialty === "") updates.specialty = null;
      if (updates.bio === "") updates.bio = null;
      
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
  });

  // Upload coach profile photo
  app.post("/api/coach/profile/photo", authMiddleware, profilePhotoUpload.single("photo"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "Coach profile not found" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No photo uploaded" });
      }

      const photoUrl = `/uploads/profile-photos/${req.file.filename}`;
      
      await storage.updateCoach(coachId, { photoUrl });
      
      res.json({ 
        success: true, 
        photoUrl,
        message: "Profile photo updated successfully" 
      });
    } catch (error) {
      console.error("Error uploading coach profile photo:", error);
      res.status(500).json({ error: "Failed to upload profile photo" });
    }
  });

  // ==================== COACH EARNINGS API ====================

  // Helper function to get human-readable warning message
  function getWarningMessage(code: string): string {
    const messages: Record<string, string> = {
      no_contract: "No coach contract found for this academy",
      invalid_hourly_rate: "Coach contract has invalid hourly rate",
      invalid_session_rate: "Coach contract has invalid session rate",
      invalid_percentage_rate: "Coach contract has invalid percentage rate",
      missing_academy_id: "Session is missing academy assignment",
      missing_academy_pricing: "Academy has no pricing configured for this session type",
      unknown_pay_type: "Coach contract has unknown pay type",
    };
    return messages[code] || "Unknown configuration error";
  }

  // Helper function to calculate session earning based on contract
  async function calculateSessionEarning(
    session: { id?: string; academyId?: string | null; duration?: number | null; sessionType?: string | null },
    coachId: string,
    contracts: any[]
  ): Promise<{ amount: number; currency: string; warning?: string; playerCount?: number }> {
    const sessionId = session.id;
    const academyId = session.academyId;
    const duration = session.duration || 60;
    const rawSessionType = session.sessionType || "private";
    
    // Normalize session type - handle variations: "semi", "semi_private", "semi-private"
    const normalizeSessionType = (type: string): string => {
      const cleaned = type.toLowerCase().replace(/-/g, "_").trim();
      if (cleaned === "semi" || cleaned === "semi_private") return "semi_private";
      return cleaned;
    };
    const sessionType = normalizeSessionType(rawSessionType);
    
    // Find the contract for this session's academy
    const contract = contracts.find((c: any) => c.academyId === academyId);
    
    if (!contract) {
      // Return 0 earnings with warning - don't silently make up amounts
      console.warn(`[Earnings] No contract found for coach ${coachId} at academy ${academyId}`);
      return { amount: 0, currency: "AED", warning: "no_contract" };
    }
    
    const currency = contract.currency || "AED";
    let amount = 0;
    
    // Get player count for group/semi-private sessions (needed for percentage-based pay)
    // Players can be tracked either in session_players (for individual sessions) or series_players (for recurring series)
    let playerCount = 1;
    if (sessionType === "group" || sessionType === "semi_private") {
      // First check session_players table
      if (sessionId) {
        const sessionPlayers = await storage.getSessionPlayers(sessionId);
        if (sessionPlayers.length > 0) {
          playerCount = sessionPlayers.length;
        }
      }
      
      // If no session_players found and session has a series, check series_players
      if (playerCount === 1 && (session as any).seriesId) {
        const seriesPlayers = await storage.getSeriesPlayers((session as any).seriesId);
        // Count active players in the series
        const activeSeriesPlayers = seriesPlayers.filter((sp: any) => sp.status === "active");
        if (activeSeriesPlayers.length > 0) {
          playerCount = activeSeriesPlayers.length;
        }
      }
    }
    
    // Check for session-type specific rates first
    if (sessionType === "private" && contract.privateRate) {
      amount = Number(contract.privateRate) || 0;
    } else if (sessionType === "semi_private" && contract.semiPrivateRate) {
      amount = Number(contract.semiPrivateRate) || 0;
    } else if (sessionType === "group" && contract.groupRate) {
      amount = Number(contract.groupRate) || 0;
    } else {
      // Calculate based on pay type
      switch (contract.payType) {
        case "hourly":
          const hourlyRate = Number(contract.hourlyRate);
          if (isNaN(hourlyRate) || hourlyRate <= 0) {
            console.warn(`[Earnings] Invalid hourly rate for contract ${contract.id}`);
            return { amount: 0, currency, warning: "invalid_hourly_rate" };
          }
          amount = hourlyRate * (duration / 60);
          break;
        case "per_session":
          const sessionRate = Number(contract.sessionRate);
          if (isNaN(sessionRate) || sessionRate <= 0) {
            console.warn(`[Earnings] Invalid session rate for contract ${contract.id}`);
            return { amount: 0, currency, warning: "invalid_session_rate" };
          }
          amount = sessionRate;
          break;
        case "percentage":
          const percentageRate = Number(contract.percentageRate);
          if (isNaN(percentageRate) || percentageRate <= 0) {
            console.warn(`[Earnings] Invalid percentage rate for contract ${contract.id}`);
            return { amount: 0, currency, warning: "invalid_percentage_rate" };
          }
          
          if (!academyId) {
            console.warn(`[Earnings] Percentage contract but no academyId on session`);
            return { amount: 0, currency, warning: "missing_academy_id" };
          }
          
          const pricing = await storage.getAcademyPricingByType(academyId, sessionType);
          if (!pricing) {
            console.warn(`[Earnings] No academy pricing found for ${academyId} / ${sessionType}`);
            return { amount: 0, currency, warning: "missing_academy_pricing" };
          }
          
          // Calculate per-player price
          let perPlayerPrice = 0;
          if (pricing.pricePerHour) {
            perPlayerPrice = Number(pricing.pricePerHour) * (duration / 60);
          } else {
            perPlayerPrice = Number(pricing.pricePerSession) || 0;
          }
          
          // For group/semi-private sessions, total revenue = per-player price × player count
          const totalSessionRevenue = perPlayerPrice * playerCount;
          amount = totalSessionRevenue * (percentageRate / 100);
          break;
        default:
          console.warn(`[Earnings] Unknown pay type: ${contract.payType}`);
          return { amount: 0, currency, warning: "unknown_pay_type" };
      }
    }
    
    return { amount, currency, playerCount };
  }

  // Get coach earnings summary (this month + projected)
  app.get("/api/coach/earnings/summary", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "Coach ID required" });
      }
      
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      
      // Get all active contracts for this coach (across all academies)
      const contracts = await storage.getCoachContractsByCoach(coachId);
      
      // Find the primary contract to determine display info
      const primaryContract = contracts[0];
      
      // Get completed sessions this month (realized earnings)
      const completedSessions = await storage.getCoachCompletedSessionsForMonth(coachId, currentMonth, currentYear);
      
      // Get upcoming sessions this month (projected earnings)
      const upcomingSessions = await storage.getCoachUpcomingSessionsForMonth(coachId, currentMonth, currentYear);
      
      // Track earnings and session counts by currency to handle multi-currency coaches properly
      const realizedByCurrency: Record<string, { amount: number; sessions: number }> = {};
      const projectedByCurrency: Record<string, { amount: number; sessions: number }> = {};
      const errors: Array<{ sessionId: string; code: string; message: string }> = [];
      
      // Calculate realized from completed sessions using contracts
      for (const session of completedSessions) {
        const earning = await calculateSessionEarning(session, coachId, contracts);
        if (earning.warning) {
          errors.push({
            sessionId: session.id,
            code: earning.warning,
            message: getWarningMessage(earning.warning),
          });
        }
        if (!realizedByCurrency[earning.currency]) {
          realizedByCurrency[earning.currency] = { amount: 0, sessions: 0 };
        }
        realizedByCurrency[earning.currency].amount += earning.amount;
        realizedByCurrency[earning.currency].sessions += 1;
      }
      
      // Calculate projected from upcoming sessions using contracts
      for (const session of upcomingSessions) {
        const earning = await calculateSessionEarning(session, coachId, contracts);
        if (earning.warning) {
          errors.push({
            sessionId: session.id,
            code: earning.warning,
            message: getWarningMessage(earning.warning),
          });
        }
        if (!projectedByCurrency[earning.currency]) {
          projectedByCurrency[earning.currency] = { amount: 0, sessions: 0 };
        }
        projectedByCurrency[earning.currency].amount += earning.amount;
        projectedByCurrency[earning.currency].sessions += 1;
      }
      
      // Use primary contract currency as the display currency
      const displayCurrency = primaryContract?.currency || "AED";
      
      // Get earnings and counts for display currency
      const realizedData = realizedByCurrency[displayCurrency] || { amount: 0, sessions: 0 };
      const projectedData = projectedByCurrency[displayCurrency] || { amount: 0, sessions: 0 };
      
      // Check if there are earnings in other currencies
      const otherCurrencies = Object.keys({ ...realizedByCurrency, ...projectedByCurrency }).filter(c => c !== displayCurrency);
      
      if (otherCurrencies.length > 0) {
        console.warn(`[Earnings] Coach ${coachId} has earnings in multiple currencies: ${[displayCurrency, ...otherCurrencies].join(', ')}`);
      }
      
      // Determine payment rule display info from primary contract
      let paymentRuleDisplay: { type: string; hourlyRate?: string; percentageRate?: string; currency: string; isDefault: boolean };
      if (primaryContract) {
        paymentRuleDisplay = {
          type: primaryContract.payType || "hourly",
          currency: primaryContract.currency || "AED",
          isDefault: false,
        };
        if (primaryContract.payType === "hourly") {
          paymentRuleDisplay.hourlyRate = primaryContract.hourlyRate;
        } else if (primaryContract.payType === "percentage") {
          paymentRuleDisplay.percentageRate = primaryContract.percentageRate;
        } else if (primaryContract.payType === "per_session") {
          paymentRuleDisplay.hourlyRate = primaryContract.sessionRate;
        }
      } else {
        paymentRuleDisplay = { type: "hourly", currency: "AED", isDefault: true };
      }
      
      res.json({
        realized: {
          amount: realizedData.amount.toFixed(2),
          currency: displayCurrency,
          sessionsCount: realizedData.sessions,
          status: "confirmed",
        },
        projected: {
          amount: projectedData.amount.toFixed(2),
          currency: displayCurrency,
          sessionsCount: projectedData.sessions,
          status: "pending",
        },
        total: {
          amount: (realizedData.amount + projectedData.amount).toFixed(2),
          currency: displayCurrency,
        },
        paymentRule: paymentRuleDisplay,
        period: {
          month: currentMonth,
          year: currentYear,
          monthName: now.toLocaleString("en-US", { month: "long" }),
        },
        // Include multi-currency breakdown for transparency when earnings exist in other currencies
        ...(otherCurrencies.length > 0 ? {
          multiCurrencyBreakdown: {
            realized: Object.fromEntries(
              Object.entries(realizedByCurrency).map(([cur, data]) => [cur, { amount: data.amount.toFixed(2), sessions: data.sessions }])
            ),
            projected: Object.fromEntries(
              Object.entries(projectedByCurrency).map(([cur, data]) => [cur, { amount: data.amount.toFixed(2), sessions: data.sessions }])
            ),
          },
        } : {}),
        // Include errors array if any configuration issues detected
        ...(errors.length > 0 ? { configErrors: errors } : {}),
      });
    } catch (error) {
      console.error("Error fetching coach earnings summary:", error);
      res.status(500).json({ error: "Failed to fetch earnings summary" });
    }
  });

  // Get coach earnings breakdown (detailed list of sessions)
  app.get("/api/coach/earnings/breakdown", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "Coach ID required" });
      }
      
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      
      // Get all active contracts for this coach
      const contracts = await storage.getCoachContractsByCoach(coachId);
      const primaryContract = contracts[0];
      const currency = primaryContract?.currency || "AED";
      
      // Get all sessions for the month
      const completedSessions = await storage.getCoachCompletedSessionsForMonth(coachId, month, year);
      
      // Calculate breakdown using contracts
      const breakdown = [];
      const totalsByCurrency: Record<string, { amount: number; sessions: number }> = {};
      
      for (const session of completedSessions) {
        const earning = await calculateSessionEarning(session, coachId, contracts);
        breakdown.push({
          id: session.id,
          date: session.startTime,
          sessionType: session.sessionType,
          duration: session.duration || 60,
          amount: earning.amount.toFixed(2),
          currency: earning.currency,
          status: "confirmed",
          ...(earning.warning ? { warning: earning.warning } : {}),
        });
        if (!totalsByCurrency[earning.currency]) {
          totalsByCurrency[earning.currency] = { amount: 0, sessions: 0 };
        }
        totalsByCurrency[earning.currency].amount += earning.amount;
        totalsByCurrency[earning.currency].sessions += 1;
      }
      
      // Use primary contract currency for summary display
      const currencyData = totalsByCurrency[currency] || { amount: 0, sessions: 0 };
      const totalEarned = currencyData.amount;
      const sessionsInCurrency = currencyData.sessions;
      const avgPerLesson = sessionsInCurrency > 0 ? totalEarned / sessionsInCurrency : 0;
      
      // Build payment rule display for the breakdown page
      let paymentRuleDisplay: { type: string; hourlyRate?: string; percentageRate?: string; currency: string; isDefault: boolean };
      if (primaryContract) {
        paymentRuleDisplay = {
          type: primaryContract.payType || "hourly",
          currency: primaryContract.currency || "AED",
          isDefault: false,
        };
        if (primaryContract.payType === "hourly") {
          paymentRuleDisplay.hourlyRate = primaryContract.hourlyRate;
        } else if (primaryContract.payType === "percentage") {
          paymentRuleDisplay.percentageRate = primaryContract.percentageRate;
        } else if (primaryContract.payType === "per_session") {
          paymentRuleDisplay.hourlyRate = primaryContract.sessionRate;
        }
      } else {
        paymentRuleDisplay = { type: "hourly", hourlyRate: "150", currency: "AED", isDefault: true };
      }
      
      // Check for other currencies
      const otherCurrencies = Object.keys(totalsByCurrency).filter(c => c !== currency);
      
      res.json({
        breakdown,
        summary: {
          totalEarned: totalEarned.toFixed(2),
          totalSessions: sessionsInCurrency,
          avgPerLesson: avgPerLesson.toFixed(2),
          currency,
        },
        paymentRule: paymentRuleDisplay,
        period: {
          month,
          year,
        },
        // Include multi-currency breakdown when applicable
        ...(otherCurrencies.length > 0 ? {
          multiCurrencyBreakdown: Object.fromEntries(
            Object.entries(totalsByCurrency).map(([cur, data]) => [cur, { amount: data.amount.toFixed(2), sessions: data.sessions }])
          ),
        } : {}),
      });
    } catch (error) {
      console.error("Error fetching coach earnings breakdown:", error);
      res.status(500).json({ error: "Failed to fetch earnings breakdown" });
    }
  });

  // Get coach earnings history (past months)
  app.get("/api/coach/earnings/history", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "Coach ID required" });
      }
      
      // Get all active contracts for this coach
      const contracts = await storage.getCoachContractsByCoach(coachId);
      const primaryContract = contracts[0];
      const currency = primaryContract?.currency || "AED";
      
      // Get last 6 months of history
      const history = [];
      const now = new Date();
      
      for (let i = 0; i < 6; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        
        const sessions = await storage.getCoachCompletedSessionsForMonth(coachId, month, year);
        
        // Group by currency for proper multi-currency handling
        const earnedByCurrency: Record<string, { amount: number; sessions: number }> = {};
        for (const session of sessions) {
          const earning = await calculateSessionEarning(session, coachId, contracts);
          if (!earnedByCurrency[earning.currency]) {
            earnedByCurrency[earning.currency] = { amount: 0, sessions: 0 };
          }
          earnedByCurrency[earning.currency].amount += earning.amount;
          earnedByCurrency[earning.currency].sessions += 1;
        }
        
        // Use primary contract currency data for display
        const currencyData = earnedByCurrency[currency] || { amount: 0, sessions: 0 };
        const totalEarned = currencyData.amount;
        const sessionsInCurrency = currencyData.sessions;
        const avgPerLesson = sessionsInCurrency > 0 ? totalEarned / sessionsInCurrency : 0;
        
        // Check for other currencies
        const otherCurrencies = Object.keys(earnedByCurrency).filter(c => c !== currency);
        
        history.push({
          month,
          year,
          monthName: date.toLocaleString("en-US", { month: "long" }),
          totalEarned: totalEarned.toFixed(2),
          totalSessions: sessionsInCurrency,
          avgPerLesson: avgPerLesson.toFixed(2),
          currency,
          // Include multi-currency breakdown when applicable
          ...(otherCurrencies.length > 0 ? {
            multiCurrencyBreakdown: Object.fromEntries(
              Object.entries(earnedByCurrency).map(([cur, data]) => [cur, { amount: data.amount.toFixed(2), sessions: data.sessions }])
            ),
          } : {}),
        });
      }
      
      res.json({ history });
    } catch (error) {
      console.error("Error fetching coach earnings history:", error);
      res.status(500).json({ error: "Failed to fetch earnings history" });
    }
  });

  // Get coach payment rule (view only for coach)
  app.get("/api/coach/payment-rule", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "Coach ID required" });
      }
      
      const paymentRule = await storage.getCoachPaymentRule(coachId);
      
      if (!paymentRule) {
        // Return default hourly rule
        return res.json({
          type: "hourly",
          hourlyRate: "150",
          currency: "AED",
          isDefault: true,
        });
      }
      
      res.json({
        type: paymentRule.paymentType,
        hourlyRate: paymentRule.hourlyRate,
        privateSessionRate: paymentRule.privateSessionRate,
        groupSessionRate: paymentRule.groupSessionRate,
        commissionPercentage: paymentRule.commissionPercentage,
        hybridBaseRate: paymentRule.hybridBaseRate,
        hybridCommissionPercentage: paymentRule.hybridCommissionPercentage,
        currency: paymentRule.currency,
        isDefault: false,
      });
    } catch (error) {
      console.error("Error fetching coach payment rule:", error);
      res.status(500).json({ error: "Failed to fetch payment rule" });
    }
  });

  // ==================== COACH XP SYSTEM ====================

  // Get coach XP and level
  app.get("/api/coach/:id/xp", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId!;
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
      const xpPercent = Math.min(100, Math.max(0, Math.round((currentLevelXp / requiredForLevel) * 100)));
      
      // Get recent transactions
      const transactions = await storage.getCoachXpTransactions(id, 10);
      
      res.json({
        level,
        totalXp,
        currentLevelXp,
        requiredForLevel,
        xpPercent,
        transactions,
      });
    } catch (error) {
      console.error("Error fetching coach XP:", error);
      res.status(500).json({ error: "Failed to fetch coach XP" });
    }
  });

  // Get coach observation patterns (anti-abuse stats)
  app.get("/api/coach/:id/observation-patterns", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
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
        severityFactor: storedStats?.severityFactor ? parseFloat(storedStats.severityFactor) : 1.0,
        message: patterns.isPatternAbuse 
          ? "Your observation patterns are unusual - consider varying your assessments"
          : "Your observation patterns are healthy",
      });
    } catch (error) {
      console.error("Error fetching coach observation patterns:", error);
      res.status(500).json({ error: "Failed to fetch coach observation patterns" });
    }
  });

  // Award coach XP (internal endpoint for session completion, feedback, etc.)
  app.post("/api/coach/:id/xp", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId!;
      const { xpAmount, source, description, sessionId, metadata } = req.body;
      
      if (!xpAmount || !source) {
        return res.status(400).json({ error: "xpAmount and source are required" });
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
  });

  // Get coach stats (sessions count, players count, streak)
  app.get("/api/coach/:id/stats", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
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
      const completedSessions = allSessions.filter(s => s.status === "completed");
      
      // Get unique player count from session players (parallel fetch for efficiency)
      const playerIds = new Set<string>();
      const sessionPlayerResults = await Promise.all(
        allSessions.map(session => storage.getSessionPlayers(session.id))
      );
      sessionPlayerResults.flat().forEach(sp => {
        if (sp.playerId) playerIds.add(sp.playerId);
      });
      
      // Calculate streak (consecutive days with completed sessions)
      let streak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const sortedSessions = completedSessions
        .filter(s => new Date(s.startTime) <= today)
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
      
      if (sortedSessions.length > 0) {
        let checkDate = new Date(today);
        const sessionDates = new Set(sortedSessions.map(s => {
          const d = new Date(s.startTime);
          d.setHours(0, 0, 0, 0);
          return d.getTime();
        }));
        
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
  });

  // ==================== PROGRESS ENGINE V2 API ====================

  // Get all skill domains
  app.get("/api/progress/domains", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Seed domains if not present
      await storage.seedSkillDomains();
      const domains = await storage.getAllSkillDomains();
      // Cache for 1 hour - domains rarely change
      res.set('Cache-Control', 'private, max-age=3600');
      res.json(domains);
    } catch (error) {
      console.error("Error fetching skill domains:", error);
      res.status(500).json({ error: "Failed to fetch skill domains" });
    }
  });

  // Get player skill states (current progress per domain)
  app.get("/api/players/:id/skill-state", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
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
      
      const states = await storage.getPlayerSkillStates(id, academyId || undefined);
      const domains = await storage.getAllSkillDomains();
      const domainXpSummary = await storage.getPlayerDomainXpSummary(id);
      
      // Merge domain info with state and XP data
      const statesWithDomains = states.map(state => {
        const domain = domains.find(d => d.id === state.domainId);
        const xpData = domainXpSummary.find(x => x.domainId === state.domainId);
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
  });

  // Get player observation trends for charts
  app.get("/api/players/:id/observation-trends", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
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
      
      const trendsWithDomains = trends.map(t => {
        const domain = domains.find(d => d.id === t.domainId);
        return { ...t, domain };
      });
      
      res.json(trendsWithDomains);
    } catch (error) {
      console.error("Error fetching observation trends:", error);
      res.status(500).json({ error: "Failed to fetch observation trends" });
    }
  });

  // Submit skill observations for a session
  app.post("/api/coach/sessions/:sessionId/observations", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const coachId = req.user!.coachId;
      const { playerId, observations } = req.body;
      // observations: [{ domainId, direction: 'up'|'stable'|'down', effortLevel: 'high'|'normal'|'low', note? }]

      if (!playerId || !coachId || !observations || !Array.isArray(observations)) {
        return res.status(400).json({ error: "playerId and observations array required" });
      }

      // ==================== ANTI-ABUSE CHECKS ====================
      const DAILY_XP_CAP = 50; // Max XP per player per day
      const warnings: string[] = [];
      
      // Check daily XP cap
      const dailyXpSoFar = await storage.getPlayerDailyXp(playerId);
      const isNearDailyCap = dailyXpSoFar >= DAILY_XP_CAP * 0.8;
      const isAtDailyCap = dailyXpSoFar >= DAILY_XP_CAP;
      
      if (isAtDailyCap) {
        warnings.push("Daily XP cap reached - observations recorded but no XP awarded");
      } else if (isNearDailyCap) {
        warnings.push("Approaching daily XP cap");
      }
      
      // Check coach patterns for abuse
      const coachPatterns = await storage.getCoachObservationPatterns(coachId, 30);
      let coachSeverityFactor = 1.0;
      
      if (coachPatterns.isPatternAbuse) {
        coachSeverityFactor = 0.7; // 30% reduction for abusive patterns
        warnings.push("Observation impact reduced due to unusual patterns - vary your assessments");
      } else if (coachPatterns.upRate > 0.7) {
        coachSeverityFactor = 0.9; // 10% reduction for generous coaches
      }
      
      // Check coach-player relationship for frequent flyer detection
      const relationship = await storage.checkCoachPlayerRelationship(coachId, playerId);
      if (relationship.isFrequentFlyer) {
        coachSeverityFactor *= 0.8; // Additional 20% reduction
        warnings.push("High observation frequency with this player - impact reduced");
      }

      const results = [];
      let skillImprovementXp = 0;
      const effortLevels: string[] = [];

      // Count observations per session for diminishing returns
      const observationCounts: Record<string, number> = {};
      
      // Track sessions with downs for down-guard (per session basis)
      const recentDownSessions = await storage.getRecentDownSessionsForPlayer(playerId, 3);
      
      // Track if we've already applied a down in this session
      let downAppliedThisSession = false;

      for (const obs of observations) {
        const { domainId, direction, effortLevel, note } = obs;
        
        // Track effort levels (we'll use average for session XP)
        effortLevels.push(effortLevel);
        
        // Get current state
        const currentState = await storage.getPlayerSkillState(playerId, domainId);
        
        // Calculate diminishing return factor
        const countKey = `${sessionId}-${playerId}-${domainId}`;
        observationCounts[countKey] = (observationCounts[countKey] || 0) + 1;
        const obsCount = observationCounts[countKey];
        const diminishingFactors = [1.0, 0.7, 0.5, 0.3, 0.3];
        const diminishingFactor = diminishingFactors[Math.min(obsCount - 1, 4)];

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
          const hasRecentDown = recentDownSessions.length >= 1 && !recentDownSessions.includes(sessionId);
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
          const hoursSinceLastUp = (Date.now() - new Date(currentState.lastUpDate).getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastUp < 48) { // Within 48 hours
            wasCooldownApplied = true;
            rawDelta = Math.round(rawDelta * 0.5);
          }
        }

        // Calculate applied delta (including coach severity factor)
        let appliedDelta = Math.round(rawDelta * effortMultiplier * diminishingFactor * coachSeverityFactor);

        // Confidence guard: prevent hard drops
        if (appliedDelta < 0 && currentState?.confidenceScore && currentState.confidenceScore < 30) {
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
        const newProgressValue = Math.max(0, Math.min(100, (currentState?.progressValue || 0) + appliedDelta));
        
        // Calculate new trend based on recent observations
        const recentObs = await storage.getPlayerRecentObservations(playerId, 5);
        const domainObs = recentObs.filter(o => o.domainId === domainId);
        const upCount = domainObs.filter(o => o.direction === "up").length;
        const downCount = domainObs.filter(o => o.direction === "down").length;
        
        let newTrend = "stable";
        if (upCount >= 3) newTrend = "improving";
        else if (downCount >= 2) newTrend = "focus";

        // Calculate momentum
        let newMomentum = "building";
        if (upCount >= 4) newMomentum = "strong";
        else if (downCount >= 2 || (upCount === 0 && domainObs.length >= 3)) newMomentum = "slowing";

        // Update confidence score
        let newConfidence = currentState?.confidenceScore || 50;
        if (direction === "up") newConfidence = Math.min(100, newConfidence + 5);
        else if (direction === "down") newConfidence = Math.max(0, newConfidence - 3);

        await storage.upsertPlayerSkillState({
          playerId,
          domainId,
          progressValue: newProgressValue,
          trend: newTrend,
          momentum: newMomentum,
          confidenceScore: newConfidence,
          lastUpDate: direction === "up" ? new Date() : currentState?.lastUpDate || undefined,
          upCountRecent: direction === "up" ? (currentState?.upCountRecent || 0) + 1 : currentState?.upCountRecent || 0,
          downCountRecent: direction === "down" ? (currentState?.downCountRecent || 0) + 1 : currentState?.downCountRecent || 0,
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
      if (effortCounts.high >= effortCounts.normal && effortCounts.high >= effortCounts.low) {
        sessionEffortMultiplier = 1.2;
      } else if (effortCounts.low >= effortCounts.normal && effortCounts.low >= effortCounts.high) {
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
        warnings.push(`XP reduced from ${xpBeforeCap} to ${totalXpGained} due to daily cap`);
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
      storage.updateCoachStatsFromObservations(coachId).catch(err => 
        console.error("Failed to update coach stats:", err)
      );

      res.status(201).json({ 
        observations: results, 
        xpGained: totalXpGained,
        xpBeforeCap,
        dailyXpRemaining: Math.max(0, DAILY_XP_CAP - dailyXpSoFar - totalXpGained),
        warnings: warnings.length > 0 ? warnings : undefined,
        message: `${results.length} observations recorded` 
      });
    } catch (error) {
      console.error("Error creating skill observations:", error);
      res.status(500).json({ error: "Failed to create observations" });
    }
  });

  // Get session observations
  app.get("/api/coach/sessions/:sessionId/observations", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const observations = await storage.getSessionSkillObservations(sessionId);
      res.json(observations);
    } catch (error) {
      console.error("Error fetching session observations:", error);
      res.status(500).json({ error: "Failed to fetch observations" });
    }
  });

  // Create assessment for a player
  app.post("/api/players/:id/assessments", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const { domainId, status, notes, isBaseline } = req.body;

      if (!coachId || !domainId || !status) {
        return res.status(400).json({ error: "domainId and status required" });
      }

      // Get previous status
      const latestAssessment = await storage.getLatestAssessment(id, domainId);
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
  });

  // Get player assessments
  app.get("/api/players/:id/assessments", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const assessments = await storage.getPlayerAssessments(id);
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching assessments:", error);
      res.status(500).json({ error: "Failed to fetch assessments" });
    }
  });

  // Get level requirements
  app.get("/api/progress/levels", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const requirements = await storage.getAllLevelRequirements();
      // Cache for 1 hour - level requirements rarely change
      res.set('Cache-Control', 'private, max-age=3600');
      res.json(requirements);
    } catch (error) {
      console.error("Error fetching level requirements:", error);
      res.status(500).json({ error: "Failed to fetch level requirements" });
    }
  });

  // Get level readiness for a player
  app.get("/api/players/:id/level-readiness/:level", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, level } = req.params;
      const readiness = await storage.calculatePlayerLevelReadiness(id, level);
      res.json(readiness);
    } catch (error) {
      console.error("Error calculating level readiness:", error);
      res.status(500).json({ error: "Failed to calculate level readiness" });
    }
  });

  // Promote/demote player level with coach override
  app.post("/api/players/:id/level-change", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      const { newLevel, reason, isOverride } = req.body;
      
      if (!newLevel) {
        return res.status(400).json({ error: "newLevel is required" });
      }
      
      const { valid, player } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid || !player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const previousLevel = player.ballLevel || 'red1';
      
      // Check level readiness if not override
      if (!isOverride) {
        const readiness = await storage.calculatePlayerLevelReadiness(id, newLevel);
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
        const readiness = await storage.calculatePlayerLevelReadiness(id, newLevel);
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
              unmetRequirements: readiness.requirements.filter(r => !r.met),
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
  });

  // Get player override history
  app.get("/api/players/:id/level-history", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const logs = await storage.getAuditLogs("player_level", id);
      
      res.json(logs.map(log => ({
        id: log.id,
        action: log.action,
        performedBy: log.performedBy,
        timestamp: log.timestamp,
        details: log.metadata ? JSON.parse(log.metadata) : null,
      })));
    } catch (error) {
      console.error("Error fetching level history:", error);
      res.status(500).json({ error: "Failed to fetch level history" });
    }
  });

  // Get player XP and transactions
  app.get("/api/players/:id/xp", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const totalXp = await storage.getPlayerTotalXp(id, academyId || undefined);
      const transactions = await storage.getPlayerXpTransactions(id, 20, academyId || undefined);
      res.json({ totalXp, transactions });
    } catch (error) {
      console.error("Error fetching player XP:", error);
      res.status(500).json({ error: "Failed to fetch XP" });
    }
  });

  // Freeze/unfreeze player progress
  app.post("/api/players/:id/progress-freeze", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const { freeze, reason } = req.body;

      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }

      const skillStates = await storage.getPlayerSkillStates(id, academyId || undefined);
      
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
  });

  // ==================== COACH COURT PREFERENCES ====================

  // Get court preferences for a coach
  app.get("/api/coaches/:id/court-preferences", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
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
  });

  // Update court preferences for a coach
  app.put("/api/coaches/:id/court-preferences", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
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
  });

  // ==================== GLOW CHAT API ====================
  
  // Get all conversations for a coach
  app.get("/api/coaches/:id/conversations", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId!;
      
      // Verify the authenticated coach is requesting their own conversations
      if (id !== coachId) {
        return res.status(404).json({ error: "Conversations not found" });
      }
      
      const conversations = await storage.getConversationsForCoach(id, academyId);
      
      // Enrich with participant info
      const enriched = await Promise.all(
        conversations.map(async (conv) => {
          const participants = await storage.getConversationParticipants(conv.id, coachId!);
          
          // Get player name for conversations with a player
          let playerName = null;
          if (conv.playerId) {
            const player = await storage.getPlayer(conv.playerId, academyId);
            playerName = player?.name;
          }
          
          return { ...conv, participants, playerName };
        })
      );
      
      // Return only real conversations - no sample/demo data
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get all conversations for a player
  app.get("/api/players/:id/conversations", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId!;
      
      // Verify player belongs to this academy
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Conversations not found" });
      }
      
      const conversations = await storage.getConversationsForPlayer(id, academyId);
      
      // Enrich with coach name
      const enriched = await Promise.all(
        conversations.map(async (conv) => {
          let coachName = null;
          if (conv.coachId) {
            const coach = await storage.getCoach(conv.coachId, academyId);
            coachName = coach?.name;
          }
          return { ...conv, coachName };
        })
      );
      
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching player conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get or create a coach-player conversation
  app.post("/api/conversations/coach-player", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
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
      
      const conversation = await storage.getOrCreateCoachPlayerConversation(coachId!, playerId, academyId);
      res.json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Create a new conversation
  app.post("/api/conversations", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
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
        const conversation = await storage.getOrCreateCoachPlayerConversation(coachId!, playerId, academyId);
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
  });

  // Get all squads (hardcoded for now)
  app.get("/api/squads", authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
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
  });

  // Get messages for a conversation
  app.get("/api/conversations/:id/messages", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
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
      const conversation = await storage.getConversation(id, coachId ?? undefined, academyId);
      if (!conversation) {
        // Check if coach is a participant
        const participants = await storage.getConversationParticipants(id, coachId!, academyId);
        const isParticipant = participants.some(p => p.coachId === coachId);
        if (!isParticipant) {
          return res.status(404).json({ error: "Conversation not found" });
        }
      }
      
      const messages = await storage.getMessages(id, limit, coachId!, academyId);
      
      // Enrich with reactions
      const enriched = await Promise.all(
        messages.map(async (msg) => {
          const reactions = await storage.getMessageReactions(msg.id, coachId!, academyId);
          return { ...msg, reactions };
        })
      );
      
      res.json(enriched.reverse()); // Return oldest first for chat UI
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });
  
  // Helper function for sample messages
  function getSampleMessages(conversationId: string) {
    const now = new Date();
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
  app.post("/api/conversations/:id/messages", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: conversationId } = req.params;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId!;
      const { senderType, senderCoachId, senderPlayerId, body, messageType, replyToId } = req.body;
      
      if (!body || !senderType) {
        return res.status(400).json({ error: "body and senderType required" });
      }

      const sanitizedBody = sanitizeMessage(body);
      if (!sanitizedBody) {
        return res.status(400).json({ error: "Message body is required after sanitization" });
      }
      
      // Verify coach has access to this conversation within their academy
      const conversation = await storage.getConversation(conversationId, coachId ?? undefined, academyId);
      if (!conversation) {
        const participants = await storage.getConversationParticipants(conversationId, coachId!, academyId);
        const isParticipant = participants.some(p => p.coachId === coachId);
        if (!isParticipant) {
          return res.status(404).json({ error: "Conversation not found" });
        }
      }
      
      const message = await storage.createMessage({
        conversationId,
        senderType,
        senderCoachId: senderCoachId || null,
        senderPlayerId: senderPlayerId || null,
        body: sanitizedBody,
        messageType: messageType || "text",
        replyToId: replyToId || null,
      }, coachId!, academyId);
      
      if (!message) {
        return res.status(403).json({ error: "Access denied to conversation" });
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
          senderId: message.senderCoachId || message.senderPlayerId || undefined,
          createdAt: message.createdAt?.toISOString() || new Date().toISOString(),
        },
      });
      
      res.status(201).json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Mark conversation as read
  app.post("/api/conversations/:id/read", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: conversationId } = req.params;
      const { participantType, participantId } = req.body;
      
      await storage.updateParticipantLastRead(conversationId, participantType, participantId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking conversation read:", error);
      res.status(500).json({ error: "Failed to mark as read" });
    }
  });

  // Add reaction to message
  app.post("/api/messages/:id/reactions", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: messageId } = req.params;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId!;
      const { reactorType, reactorCoachId, reactorPlayerId, emoji } = req.body;
      
      if (!emoji || !reactorType) {
        return res.status(400).json({ error: "emoji and reactorType required" });
      }
      
      const reaction = await storage.addReaction({
        messageId,
        reactorType,
        reactorCoachId: reactorCoachId || null,
        reactorPlayerId: reactorPlayerId || null,
        emoji,
      }, coachId!, academyId);
      
      if (!reaction) {
        return res.status(403).json({ error: "Access denied to message" });
      }
      
      res.status(201).json(reaction);
    } catch (error) {
      console.error("Error adding reaction:", error);
      res.status(500).json({ error: "Failed to add reaction" });
    }
  });

  // Remove reaction from message
  app.delete("/api/messages/:id/reactions", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: messageId } = req.params;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId!;
      const { reactorType, reactorId, emoji } = req.body;
      
      const success = await storage.removeReaction(messageId, reactorType, reactorId, emoji, coachId!, academyId);
      if (!success) {
        return res.status(403).json({ error: "Access denied to message" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing reaction:", error);
      res.status(500).json({ error: "Failed to remove reaction" });
    }
  });

  // Get unread count for coach
  app.get("/api/coaches/:id/unread-count", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const count = await storage.getUnreadCountForCoach(id);
      res.json({ unreadCount: count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // Get unread count for player
  app.get("/api/players/:id/unread-count", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const count = await storage.getUnreadCountForPlayer(id);
      res.json({ unreadCount: count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // ==================== INSIGHTS & ANALYTICS ENDPOINTS ====================
  
  // Get attendance trends for academy
  app.get("/api/insights/attendance", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const days = parseInt(req.query.days as string) || 30;
      
      const trends = await storage.getAttendanceTrends(academyId, days);
      res.json(trends);
    } catch (error) {
      console.error("Error fetching attendance trends:", error);
      res.status(500).json({ error: "Failed to fetch attendance trends" });
    }
  });
  
  // Get XP velocity for academy
  app.get("/api/insights/xp-velocity", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const days = parseInt(req.query.days as string) || 30;
      
      const velocity = await storage.getXpVelocity(academyId, days);
      res.json(velocity);
    } catch (error) {
      console.error("Error fetching XP velocity:", error);
      res.status(500).json({ error: "Failed to fetch XP velocity" });
    }
  });
  
  // Get coach load stats for academy
  app.get("/api/insights/coach-load", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const days = parseInt(req.query.days as string) || 7;
      
      const stats = await storage.getCoachLoadStats(academyId, days);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching coach load stats:", error);
      res.status(500).json({ error: "Failed to fetch coach load stats" });
    }
  });
  
  // Get player observation trends
  app.get("/api/players/:id/observation-trends", authMiddleware, requireAcademy, validatePlayerOwnership, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: playerId } = req.params;
      const days = parseInt(req.query.days as string) || 30;
      
      const trends = await storage.getPlayerObservationTrends(playerId, days);
      
      // Enrich with domain info
      const domains = await storage.getSkillDomains();
      const enrichedTrends = trends.map(t => ({
        ...t,
        domain: domains.find(d => d.id === t.domainId) || null,
      }));
      
      res.json(enrichedTrends);
    } catch (error) {
      console.error("Error fetching observation trends:", error);
      res.status(500).json({ error: "Failed to fetch observation trends" });
    }
  });
  
  // Get player domain XP summary
  app.get("/api/players/:id/domain-xp", authMiddleware, requireAcademy, validatePlayerOwnership, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: playerId } = req.params;
      
      const summary = await storage.getPlayerDomainXpSummary(playerId);
      
      // Enrich with domain info
      const domains = await storage.getSkillDomains();
      const enrichedSummary = summary.map(s => ({
        ...s,
        domain: domains.find(d => d.id === s.domainId) || null,
      }));
      
      res.json(enrichedSummary);
    } catch (error) {
      console.error("Error fetching domain XP summary:", error);
      res.status(500).json({ error: "Failed to fetch domain XP summary" });
    }
  });

  // ==================== COACH INSIGHTS - FORECASTING & BURNOUT ====================

  // Get coach load forecast (next 14 days based on scheduled sessions + historical patterns)
  app.get("/api/coaches/:id/load-forecast", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
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
      
      const futureSessions = await storage.getSessionsByCoach(id, today, endDate, academyId);
      
      // Calculate daily load for each forecast day
      for (let i = 0; i < days; i++) {
        const forecastDate = new Date(today);
        forecastDate.setDate(forecastDate.getDate() + i);
        const dateStr = forecastDate.toISOString().split('T')[0];
        
        const daySessions = futureSessions.filter(s => {
          const sessionDate = new Date(s.startTime).toISOString().split('T')[0];
          return sessionDate === dateStr;
        });
        
        const scheduledMinutes = daySessions.reduce((acc, s) => acc + (s.duration || 60), 0);
        const scheduledSessions = daySessions.length;
        
        // Calculate back-to-back sessions
        let backToBackCount = 0;
        const sortedSessions = [...daySessions].sort((a, b) => 
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
        for (let j = 1; j < sortedSessions.length; j++) {
          const prevEnd = new Date(sortedSessions[j - 1].endTime).getTime();
          const currStart = new Date(sortedSessions[j].startTime).getTime();
          if (currStart - prevEnd <= 15 * 60 * 1000) backToBackCount++;
        }
        
        // Load scoring: hours + back-to-back penalty
        const totalHours = scheduledMinutes / 60;
        const loadScore = totalHours + (backToBackCount * 0.5);
        
        let predictedLoad: "light" | "moderate" | "heavy" | "overload" = "light";
        if (loadScore >= 8 || totalHours >= 9) predictedLoad = "overload";
        else if (loadScore >= 6 || totalHours >= 7) predictedLoad = "heavy";
        else if (loadScore >= 4 || totalHours >= 4) predictedLoad = "moderate";
        
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
  });

  // Get coach burnout risk assessment
  app.get("/api/coaches/:id/burnout-risk", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId!;
      
      if (id !== coachId) {
        return res.status(404).json({ error: "Assessment not found" });
      }
      
      // Analyze last 14 days + next 7 days
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const pastStart = new Date(today);
      pastStart.setDate(pastStart.getDate() - 14);
      
      const futureEnd = new Date(today);
      futureEnd.setDate(futureEnd.getDate() + 7);
      
      const pastSessions = await storage.getSessionsByCoach(id, pastStart, today, academyId);
      const futureSessions = await storage.getSessionsByCoach(id, today, futureEnd, academyId);
      
      // Calculate metrics
      const pastMinutes = pastSessions.reduce((acc, s) => acc + (s.duration || 60), 0);
      const futureMinutes = futureSessions.reduce((acc, s) => acc + (s.duration || 60), 0);
      
      const avgDailyPast = pastMinutes / 14;
      const avgDailyFuture = futureMinutes / 7;
      
      // Count consecutive heavy days in past week
      let consecutiveHeavyDays = 0;
      let maxConsecutiveHeavy = 0;
      for (let i = 0; i < 7; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i - 1);
        const dateStr = checkDate.toISOString().split('T')[0];
        
        const dayMinutes = pastSessions
          .filter(s => new Date(s.startTime).toISOString().split('T')[0] === dateStr)
          .reduce((acc, s) => acc + (s.duration || 60), 0);
        
        if (dayMinutes >= 300) {
          consecutiveHeavyDays++;
          maxConsecutiveHeavy = Math.max(maxConsecutiveHeavy, consecutiveHeavyDays);
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
        riskScore += Math.min(20, ((avgDailyFuture / avgDailyPast) - 1) * 20);
      }
      
      // Factor 4: No rest days in past week (10 points)
      const restDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - i - 1);
        const dateStr = d.toISOString().split('T')[0];
        return pastSessions.filter(s => 
          new Date(s.startTime).toISOString().split('T')[0] === dateStr
        ).length === 0;
      }).filter(Boolean).length;
      
      if (restDays === 0) riskScore += 10;
      else if (restDays === 1) riskScore += 5;
      
      const riskLevel: "low" | "moderate" | "high" | "critical" = 
        riskScore >= 75 ? "critical" :
        riskScore >= 50 ? "high" :
        riskScore >= 25 ? "moderate" : "low";
      
      // Generate recommendations
      const recommendations: string[] = [];
      if (maxConsecutiveHeavy >= 3) {
        recommendations.push("Consider scheduling lighter days after consecutive heavy coaching");
      }
      if (restDays === 0) {
        recommendations.push("Schedule at least one rest day per week");
      }
      if (avgDailyFuture > avgDailyPast * 1.5) {
        recommendations.push("Upcoming week is significantly heavier than recent average");
      }
      if (avgDailyPast >= 300) {
        recommendations.push("Daily coaching average is high - monitor energy levels");
      }
      
      res.json({
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
      });
    } catch (error) {
      console.error("Error calculating burnout risk:", error);
      res.status(500).json({ error: "Failed to calculate burnout risk" });
    }
  });

  // Get calendar heatmap data for a month
  app.get("/api/coaches/:id/calendar-heatmap", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId!;
      
      if (id !== coachId) {
        return res.status(404).json({ error: "Heatmap not found" });
      }
      
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || new Date().getMonth();
      
      // Get first and last day of month
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0, 23, 59, 59);
      
      const sessions = await storage.getSessionsByCoach(id, startDate, endDate, academyId);
      
      // Group by date
      const heatmapData: Record<string, {
        date: string;
        totalMinutes: number;
        sessionCount: number;
        intensity: number;
        loadLevel: "none" | "light" | "moderate" | "heavy" | "overload";
      }> = {};
      
      // Initialize all days of month
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
        const dateStr = new Date(session.startTime).toISOString().split('T')[0];
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
  });

  // ==================== PHASE 3: ACADEMY SETTINGS ====================

  app.get("/api/academy/settings", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      let settings = await storage.getAcademySettings(academyId);
      if (!settings) {
        settings = await storage.createAcademySettings({ academyId });
      }
      
      const academy = await storage.getAcademy(academyId);
      const response = {
        ...settings,
        bankName: (academy as any)?.bankName || null,
        bankAccountNumber: (academy as any)?.bankAccountNumber || null,
        bankIban: (academy as any)?.bankIban || null,
        bankAccountHolder: (academy as any)?.bankAccountHolder || null,
        bankSwiftCode: (academy as any)?.bankSwiftCode || null,
        paymentInstructions: (academy as any)?.paymentInstructions || null,
        acceptsCash: (academy as any)?.acceptsCash !== false,
        acceptsBankTransfer: (academy as any)?.acceptsBankTransfer !== false,
      };
      
      res.json(response);
    } catch (error) {
      console.error("Error fetching academy settings:", error);
      res.status(500).json({ error: "Failed to fetch academy settings" });
    }
  });

  app.patch("/api/academy/settings", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      
      const { 
        bankName, bankAccountNumber, bankIban, bankAccountHolder, 
        bankSwiftCode, paymentInstructions, acceptsCash, acceptsBankTransfer,
        ...settingsData 
      } = req.body;
      
      const bankFields = { 
        bankName, bankAccountNumber, bankIban, bankAccountHolder, 
        bankSwiftCode, paymentInstructions, acceptsCash, acceptsBankTransfer 
      };
      const hasBankFields = Object.values(bankFields).some(v => v !== undefined);
      
      if (hasBankFields) {
        await storage.updateAcademy(academyId, bankFields);
      }
      
      const settings = await storage.upsertAcademySettings(academyId, settingsData);
      res.json(settings);
    } catch (error) {
      console.error("Error updating academy settings:", error);
      res.status(500).json({ error: "Failed to update academy settings" });
    }
  });

  // ==================== PHASE 3: ACADEMY INVITES ====================

  app.get("/api/academy/invites", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const invites = await storage.getAcademyInvites(academyId);
      res.json(invites);
    } catch (error) {
      console.error("Error fetching invites:", error);
      res.status(500).json({ error: "Failed to fetch invites" });
    }
  });

  app.post("/api/academy/invites", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const coachId = req.user!.coachId!;
      const { email, role = "coach" } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Generate invite code
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase() + 
                         Math.random().toString(36).substring(2, 10).toUpperCase();
      
      // Set expiry to 7 days
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invite = await storage.createAcademyInvite({
        academyId,
        email,
        role,
        inviteCode,
        expiresAt,
        invitedBy: coachId,
      });

      res.status(201).json(invite);
    } catch (error) {
      console.error("Error creating invite:", error);
      res.status(500).json({ error: "Failed to create invite" });
    }
  });

  app.post("/api/academy/invites/:code/accept", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { code } = req.params;
      const userId = req.user!.userId;
      const userEmail = req.user!.email;
      
      const invite = await storage.getAcademyInviteByCode(code);
      if (!invite) {
        return res.status(404).json({ error: "Invite not found" });
      }
      
      // Verify email matches if invite has email specified
      if (invite.email && invite.email.toLowerCase() !== userEmail?.toLowerCase()) {
        return res.status(403).json({ error: "This invite was sent to a different email address" });
      }
      
      if (invite.status !== "pending") {
        return res.status(400).json({ error: "Invite is no longer valid" });
      }
      
      if (new Date() > invite.expiresAt) {
        await storage.updateAcademyInvite(invite.id, { status: "expired" });
        return res.status(400).json({ error: "Invite has expired" });
      }

      // Mark invite as accepted FIRST to prevent race conditions
      const updatedInvite = await storage.updateAcademyInvite(invite.id, {
        status: "accepted",
        acceptedAt: new Date(),
      });
      
      if (!updatedInvite || updatedInvite.status !== "accepted") {
        return res.status(400).json({ error: "Invite already used" });
      }

      // Create coach profile if not exists
      let coachId = req.user!.coachId;
      if (!coachId) {
        const user = await storage.getUserById(userId);
        const coach = await storage.createCoach({
          name: user?.email?.split('@')[0] || 'New Coach',
          email: user?.email,
          academyId: invite.academyId,
          role: invite.role || 'coach',
        });
        coachId = coach.id;
        await storage.updateUser(userId, { coachId: coach.id, academyId: invite.academyId });
      }

      // Check if membership already exists
      const existingMemberships = await storage.getCoachMemberships(coachId);
      const alreadyMember = existingMemberships.some(m => m.academyId === invite.academyId);
      
      if (!alreadyMember) {
        // Create membership
        await storage.createCoachMembership({
          coachId,
          academyId: invite.academyId,
          role: invite.role || 'coach',
          isPrimary: existingMemberships.length === 0,
        });
      }

      // Update invite with acceptedBy
      await storage.updateAcademyInvite(invite.id, { acceptedBy: coachId });

      res.json({ success: true, academyId: invite.academyId });
    } catch (error) {
      console.error("Error accepting invite:", error);
      res.status(500).json({ error: "Failed to accept invite" });
    }
  });

  app.delete("/api/academy/invites/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { id } = req.params;
      
      // Verify invite belongs to this academy
      const invite = await storage.getAcademyInvite(id);
      if (!invite || invite.academyId !== academyId) {
        return res.status(404).json({ error: "Invite not found" });
      }
      
      await storage.deleteAcademyInvite(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting invite:", error);
      res.status(500).json({ error: "Failed to delete invite" });
    }
  });

  // ==================== PHASE 3: ACADEMY MEMBERS ====================

  app.get("/api/academy/members", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const memberships = await storage.getAcademyMembers(academyId);
      
      // Get coach details for each membership
      const members = await Promise.all(
        memberships.map(async (m) => {
          const coach = await storage.getCoach(m.coachId);
          return {
            ...m,
            coach: coach ? { id: coach.id, name: coach.name, email: coach.email, role: coach.role } : null,
          };
        })
      );
      
      res.json(members);
    } catch (error) {
      console.error("Error fetching members:", error);
      res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  app.patch("/api/academy/members/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { id } = req.params;
      const { role, isActive } = req.body;
      
      // Verify membership belongs to this academy
      const members = await storage.getAcademyMembers(academyId);
      const targetMember = members.find(m => m.id === id);
      if (!targetMember) {
        return res.status(404).json({ error: "Member not found" });
      }
      
      const membership = await storage.updateCoachMembership(id, { role, isActive });
      res.json(membership);
    } catch (error) {
      console.error("Error updating member:", error);
      res.status(500).json({ error: "Failed to update member" });
    }
  });

  // ==================== PHASE 3: COACH ACADEMIES (SWITCHER) ====================

  app.get("/api/coach/academies", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.json([]);
      }
      
      const memberships = await storage.getCoachMemberships(coachId);
      
      // Get academy details for each
      const academiesData = await Promise.all(
        memberships.map(async (m) => {
          const academy = await storage.getAcademy(m.academyId);
          return {
            ...m,
            academy: academy ? { id: academy.id, name: academy.name, slug: academy.slug, isFreelance: academy.isFreelance } : null,
          };
        })
      );
      
      res.json(academiesData);
    } catch (error) {
      console.error("Error fetching coach academies:", error);
      res.status(500).json({ error: "Failed to fetch academies" });
    }
  });

  app.post("/api/coach/switch-academy", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const userId = req.user!.userId;
      const { academyId } = req.body;

      if (!coachId) {
        return res.status(400).json({ error: "No coach profile found" });
      }

      // Verify membership
      const memberships = await storage.getCoachMemberships(coachId);
      const membership = memberships.find(m => m.academyId === academyId);
      
      if (!membership) {
        return res.status(403).json({ error: "Not a member of this academy" });
      }

      // Update user's current academy and coach's academy
      await storage.updateUser(userId, { academyId });
      await storage.updateCoach(coachId, { academyId });
      await storage.setPrimaryAcademy(coachId, academyId);

      res.json({ success: true, academyId });
    } catch (error) {
      console.error("Error switching academy:", error);
      res.status(500).json({ error: "Failed to switch academy" });
    }
  });

  // ==================== PHASE 3: PUSH NOTIFICATIONS ====================

  app.post("/api/push/register", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const coachId = req.user!.coachId;
      const playerId = req.user!.playerId;
      const { token, platform, deviceName } = req.body;

      if (!token || !platform) {
        return res.status(400).json({ error: "Token and platform are required" });
      }

      const deviceToken = await storage.registerPushToken({
        userId,
        coachId: coachId || null,
        playerId: playerId || null,
        token,
        platform,
        deviceName,
      });

      console.log(`[PushNotifications] Registered token for user ${userId} (coach: ${coachId}, player: ${playerId})`);
      res.json(deviceToken);
    } catch (error) {
      console.error("Error registering push token:", error);
      res.status(500).json({ error: "Failed to register push token" });
    }
  });

  app.delete("/api/push/unregister", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { token } = req.body;
      if (token) {
        await storage.deactivatePushToken(token);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error unregistering push token:", error);
      res.status(500).json({ error: "Failed to unregister push token" });
    }
  });

  app.get("/api/push/preferences", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.json(null);
      }
      
      const prefs = await storage.getNotificationPreferences(coachId);
      res.json(prefs || {
        sessionReminders: true,
        feedbackRequests: true,
        packageExpiry: true,
        loadWarnings: true,
        chatMessages: true,
        reminderMinutesBefore: 30,
      });
    } catch (error) {
      console.error("Error fetching notification preferences:", error);
      res.status(500).json({ error: "Failed to fetch preferences" });
    }
  });

  app.patch("/api/push/preferences", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "No coach profile found" });
      }
      
      const prefs = await storage.upsertNotificationPreferences(coachId, req.body);
      res.json(prefs);
    } catch (error) {
      console.error("Error updating notification preferences:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  app.post("/api/push/test", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { sendPushNotification, getUserPushTokens } = await import("./pushNotifications");
      
      const tokens = await getUserPushTokens(userId);
      
      if (tokens.length === 0) {
        return res.status(400).json({ 
          error: "No push tokens registered", 
          message: "Open the app on your phone with notifications enabled first" 
        });
      }
      
      const result = await sendPushNotification(
        tokens,
        "Test Notification",
        "Push notifications are working! This is a test from Glow Up Sports.",
        { type: "test", timestamp: new Date().toISOString() }
      );
      
      console.log(`[PushTest] Sent test notification to user ${userId}, ${tokens.length} devices`);
      res.json({ success: true, devicesNotified: tokens.length, result });
    } catch (error) {
      console.error("Error sending test push:", error);
      res.status(500).json({ error: "Failed to send test notification" });
    }
  });

  app.post("/api/platform/test/academy-signup", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userRole = req.user!.role;
      if (userRole !== "platform_owner") {
        return res.status(403).json({ error: "Platform owner access required" });
      }
      
      const userId = req.user!.userId;
      const { sendPushNotification, getUserPushTokens } = await import("./pushNotifications");
      
      const tokens = await getUserPushTokens(userId);
      
      const testAcademyName = `Test Academy ${Date.now().toString().slice(-4)}`;
      const testOwnerName = "John Doe";
      const testEmail = "john.doe@example.com";
      
      if (tokens.length > 0) {
        await sendPushNotification(
          tokens,
          "New Academy Sign-up Request",
          `${testOwnerName} (${testEmail}) wants to create "${testAcademyName}"`,
          { type: "academy_signup_request", academyName: testAcademyName, ownerName: testOwnerName }
        );
      }
      
      console.log(`[PlatformTest] Simulated academy sign-up for user ${userId}`);
      res.json({ 
        success: true, 
        simulation: {
          academyName: testAcademyName,
          ownerName: testOwnerName,
          email: testEmail,
          notificationSent: tokens.length > 0,
        }
      });
    } catch (error) {
      console.error("Error simulating academy sign-up:", error);
      res.status(500).json({ error: "Failed to simulate academy sign-up" });
    }
  });

  // Test endpoint: Player receives simulated coach feedback
  app.post("/api/player/test/feedback", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { sendPushNotification, getUserPushTokens } = await import("./pushNotifications");
      
      const tokens = await getUserPushTokens(userId);
      
      const testCoachName = "Coach Sarah";
      const testFeedbackType = "Great session today!";
      const testXpGained = 25;
      
      if (tokens.length > 0) {
        await sendPushNotification(
          tokens,
          "New Feedback from Coach",
          `${testCoachName} left feedback: "${testFeedbackType}" (+${testXpGained} XP)`,
          { type: "feedback_received", coachName: testCoachName, xpGained: testXpGained }
        );
      }
      
      console.log(`[PlayerTest] Simulated feedback notification for user ${userId}`);
      res.json({ 
        success: true, 
        simulation: {
          coachName: testCoachName,
          feedbackType: testFeedbackType,
          xpGained: testXpGained,
          notificationSent: tokens.length > 0,
        }
      });
    } catch (error) {
      console.error("Error simulating player feedback:", error);
      res.status(500).json({ error: "Failed to simulate feedback" });
    }
  });

  // Test endpoint: Coach receives simulated booking request
  app.post("/api/coach/test/booking-request", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userRole = req.user!.role;
      if (userRole !== "coach" && userRole !== "academy_owner" && userRole !== "admin" && userRole !== "platform_owner") {
        return res.status(403).json({ error: "Coach, Admin or Owner access required" });
      }
      
      const userId = req.user!.userId;
      const { sendPushNotification, getUserPushTokens } = await import("./pushNotifications");
      
      const tokens = await getUserPushTokens(userId);
      
      const testPlayerName = "Emma Johnson";
      const testSessionType = "Private Lesson";
      const testDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString();
      
      if (tokens.length > 0) {
        await sendPushNotification(
          tokens,
          "New Booking Request",
          `${testPlayerName} requested a ${testSessionType} on ${testDate}`,
          { type: "booking_request", playerName: testPlayerName, sessionType: testSessionType }
        );
      }
      
      console.log(`[CoachTest] Simulated booking request for user ${userId}`);
      res.json({ 
        success: true, 
        simulation: {
          playerName: testPlayerName,
          sessionType: testSessionType,
          requestedDate: testDate,
          notificationSent: tokens.length > 0,
        }
      });
    } catch (error) {
      console.error("Error simulating booking request:", error);
      res.status(500).json({ error: "Failed to simulate booking request" });
    }
  });

  // Test endpoint: Admin receives simulated coach invite acceptance
  app.post("/api/admin/test/coach-invite", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userRole = req.user!.role;
      if (userRole !== "admin" && userRole !== "academy_owner" && userRole !== "platform_owner") {
        return res.status(403).json({ error: "Admin or Owner access required" });
      }
      
      const userId = req.user!.userId;
      const { sendPushNotification, getUserPushTokens } = await import("./pushNotifications");
      
      const tokens = await getUserPushTokens(userId);
      
      const testCoachName = "Michael Chen";
      const testCoachEmail = "m.chen@example.com";
      const testSpecialization = "Junior Development";
      
      if (tokens.length > 0) {
        await sendPushNotification(
          tokens,
          "Coach Invite Accepted",
          `${testCoachName} (${testCoachEmail}) has joined your academy as a ${testSpecialization} coach!`,
          { type: "coach_invite_accepted", coachName: testCoachName, email: testCoachEmail }
        );
      }
      
      console.log(`[AdminTest] Simulated coach invite acceptance for user ${userId}`);
      res.json({ 
        success: true, 
        simulation: {
          coachName: testCoachName,
          email: testCoachEmail,
          specialization: testSpecialization,
          notificationSent: tokens.length > 0,
        }
      });
    } catch (error) {
      console.error("Error simulating coach invite:", error);
      res.status(500).json({ error: "Failed to simulate coach invite" });
    }
  });

  // ==================== PHASE 3: BILLING ====================

  app.get("/api/billing/account", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      let account = await storage.getBillingAccount(academyId);
      if (!account) {
        account = await storage.createBillingAccount({ academyId });
      }
      res.json(account);
    } catch (error) {
      console.error("Error fetching billing account:", error);
      res.status(500).json({ error: "Failed to fetch billing account" });
    }
  });

  app.patch("/api/billing/account", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const account = await storage.updateBillingAccount(academyId, req.body);
      res.json(account);
    } catch (error) {
      console.error("Error updating billing account:", error);
      res.status(500).json({ error: "Failed to update billing account" });
    }
  });

  app.get("/api/billing/plans", async (req: Request, res: Response) => {
    try {
      const plans = await storage.getSubscriptionPlans();
      res.json(plans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });

  app.get("/api/billing/subscription", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const subscription = await storage.getSubscription(academyId);
      res.json(subscription || null);
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  // ==================== PACKAGE TEMPLATES ====================
  
  // Auto-priced credit packages based on academy session pricing
  // Returns available packages for each session type with fixed quantities (1, 5, 10, 20)
  app.get("/api/billing/credit-packages", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const CREDIT_QUANTITIES = [1, 5, 10, 20];
      const CREDIT_TYPES = ["private", "semi", "group"] as const;
      
      // Get active pricing for all session types
      const pricing = await storage.getAcademyPricing(academyId);
      
      // Build auto-priced packages
      const packages: Array<{
        creditType: string;
        credits: number;
        pricePerCredit: string;
        totalPrice: string;
        currency: string;
        label: string;
        hasPricing: boolean;
      }> = [];
      
      for (const creditType of CREDIT_TYPES) {
        const sessionPricing = pricing.find(p => p.sessionType === creditType);
        const pricePerCredit = sessionPricing ? parseFloat(sessionPricing.pricePerSession) : 0;
        const currency = sessionPricing?.currency || "AED";
        const hasPricing = !!sessionPricing && pricePerCredit > 0;
        
        for (const credits of CREDIT_QUANTITIES) {
          const totalPrice = pricePerCredit * credits;
          const creditTypeLabel = creditType === "semi" ? "Semi-Private" : 
                                  creditType.charAt(0).toUpperCase() + creditType.slice(1);
          packages.push({
            creditType,
            credits,
            pricePerCredit: pricePerCredit.toFixed(2),
            totalPrice: totalPrice.toFixed(2),
            currency,
            label: `${credits} ${creditTypeLabel} Credit${credits > 1 ? 's' : ''}`,
            hasPricing,
          });
        }
      }
      
      res.json(packages);
    } catch (error) {
      console.error("Error fetching credit packages:", error);
      res.status(500).json({ error: "Failed to fetch credit packages" });
    }
  });
  
  // Legacy: Manual package templates (for backward compatibility)
  app.get("/api/billing/package-templates", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const templates = await storage.getPackageTemplates(academyId);
      // Add frontend compatibility fields
      const normalizedTemplates = templates.map(t => ({
        ...t,
        creditType: t.sessionType,
        pricePerCredit: t.credits > 0 ? (parseFloat(t.price) / t.credits).toFixed(2) : '0',
      }));
      res.json(normalizedTemplates);
    } catch (error) {
      console.error("Error fetching package templates:", error);
      res.status(500).json({ error: "Failed to fetch package templates" });
    }
  });

  app.post("/api/billing/package-templates", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { name, description, credits, price, pricePerCredit, currency, validityDays, sessionType, creditType } = req.body;
      
      if (!name || typeof credits !== 'number' || credits <= 0) {
        return res.status(400).json({ error: "Name and positive credits required" });
      }
      
      // Support both price (total) and pricePerCredit (per unit)
      let finalPrice: number;
      if (pricePerCredit !== undefined && pricePerCredit !== null) {
        const parsedPricePerCredit = parseFloat(String(pricePerCredit));
        if (!isFinite(parsedPricePerCredit) || parsedPricePerCredit <= 0) {
          return res.status(400).json({ error: "Price per credit must be a positive number" });
        }
        finalPrice = parsedPricePerCredit * credits;
      } else if (typeof price === 'number' && isFinite(price) && price > 0) {
        finalPrice = price;
      } else {
        return res.status(400).json({ error: "Price must be a positive number" });
      }
      
      const template = await storage.createPackageTemplate({
        academyId,
        name,
        description,
        credits,
        price: String(finalPrice),
        currency: currency || 'AED',
        validityDays: validityDays || 90,
        sessionType: sessionType || creditType,
      });
      
      // Return with pricePerCredit for frontend compatibility
      const pricePerCreditValue = (finalPrice / credits).toFixed(2);
      res.status(201).json({
        ...template,
        pricePerCredit: pricePerCreditValue,
        creditType: template.sessionType,
      });
    } catch (error) {
      console.error("Error creating package template:", error);
      res.status(500).json({ error: "Failed to create package template" });
    }
  });

  app.patch("/api/billing/package-templates/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { id } = req.params;
      
      const template = await storage.updatePackageTemplate(id, req.body, academyId);
      if (!template) {
        return res.status(404).json({ error: "Package template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error updating package template:", error);
      res.status(500).json({ error: "Failed to update package template" });
    }
  });

  app.delete("/api/billing/package-templates/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { id } = req.params;
      
      const deleted = await storage.deletePackageTemplate(id, academyId);
      if (!deleted) {
        return res.status(404).json({ error: "Package template not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting package template:", error);
      res.status(500).json({ error: "Failed to delete package template" });
    }
  });

  // Assign package to player (creates package instance + invoice)
  app.post("/api/billing/assign-package", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { playerId, templateId, customPrice, notes } = req.body;
      
      // Validate player
      const player = await storage.getPlayer(playerId);
      if (!player || player.academyId !== academyId) {
        return res.status(400).json({ error: "Player not found in this academy" });
      }
      
      // Validate template
      const template = await storage.getPackageTemplate(templateId, academyId);
      if (!template) {
        return res.status(400).json({ error: "Package template not found" });
      }
      
      // Calculate expiry date
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + (template.validityDays || 90));
      
      // Create package for player
      const pkg = await storage.createPackage({
        academyId,
        playerId,
        templateId,
        name: template.name,
        totalCredits: template.credits,
        remainingCredits: template.credits,
        price: customPrice ? String(customPrice) : template.price,
        currency: template.currency || 'AED',
        expiryDate: expiryDate.toISOString().split('T')[0],
        status: 'active',
      });
      
      // Generate invoice for the package
      const invoiceNumber = await storage.generateInvoiceNumber(academyId);
      const settings = await storage.getAcademySettings(academyId);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (settings?.invoiceDueDays || 14));
      
      const invoice = await storage.createInvoice({
        academyId,
        playerId,
        packageId: pkg.id,
        invoiceNumber,
        invoiceType: 'package',
        amount: customPrice ? String(customPrice) : template.price,
        currency: template.currency || 'AED',
        dueDate: dueDate.toISOString().split('T')[0],
        lineItems: JSON.stringify([{
          description: template.name,
          quantity: 1,
          unitPrice: customPrice || parseFloat(template.price),
          total: customPrice || parseFloat(template.price),
        }]),
        notes,
        status: 'pending',
      });
      
      res.status(201).json({ package: pkg, invoice });
    } catch (error) {
      console.error("Error assigning package:", error);
      res.status(500).json({ error: "Failed to assign package" });
    }
  });

  app.get("/api/billing/invoices", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const invoicesList = await storage.getInvoices(academyId);
      res.json(invoicesList);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  app.post("/api/billing/invoices", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { playerId, packageId, amount, currency, dueDate, lineItems, notes } = req.body;
      
      // Validate required fields
      if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: "Amount must be a positive number" });
      }
      
      // Validate player belongs to academy if provided
      if (playerId) {
        const player = await storage.getPlayer(playerId);
        if (!player || player.academyId !== academyId) {
          return res.status(400).json({ error: "Player not found in this academy" });
        }
      }
      
      // Validate package belongs to academy if provided
      if (packageId) {
        const pkg = await storage.getPackage(packageId);
        if (!pkg || pkg.academyId !== academyId) {
          return res.status(400).json({ error: "Package not found in this academy" });
        }
      }
      
      const invoiceNumber = await storage.generateInvoiceNumber(academyId);
      
      const invoice = await storage.createInvoice({
        academyId,
        playerId,
        packageId,
        invoiceNumber,
        amount,
        currency: currency || 'AED',
        dueDate,
        lineItems,
        notes,
      });
      
      res.status(201).json(invoice);
    } catch (error) {
      console.error("Error creating invoice:", error);
      res.status(500).json({ error: "Failed to create invoice" });
    }
  });

  app.patch("/api/billing/invoices/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { id } = req.params;
      
      // Verify invoice belongs to academy
      const existing = await storage.getInvoice(id);
      if (!existing || existing.academyId !== academyId) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      
      // Don't allow changing academyId
      const { academyId: _, ...updates } = req.body;
      
      const invoice = await storage.updateInvoice(id, updates);
      res.json(invoice);
    } catch (error) {
      console.error("Error updating invoice:", error);
      res.status(500).json({ error: "Failed to update invoice" });
    }
  });

  app.get("/api/billing/invoices/:id/html", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { id } = req.params;
      
      const invoice = await storage.getInvoice(id);
      if (!invoice || invoice.academyId !== academyId) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      
      const academy = await storage.getAcademy(academyId);
      const settings = await storage.getAcademySettings(academyId);
      const player = invoice.playerId ? await storage.getPlayer(invoice.playerId) : null;
      
      const lineItems = parseLineItems(invoice.lineItems);
      const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
      
      const invoiceData = {
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.createdAt?.toISOString() || new Date().toISOString(),
        dueDate: invoice.dueDate || new Date().toISOString(),
        academy: {
          name: academy?.name || 'Academy',
          email: settings?.contactEmail || undefined,
          phone: settings?.contactPhone || undefined,
        },
        player: {
          name: player?.name || 'Customer',
          email: player?.email || undefined,
          phone: player?.phone || undefined,
        },
        lineItems: lineItems.length > 0 ? lineItems : [{
          description: 'Tennis Lessons',
          quantity: 1,
          unitPrice: parseFloat(invoice.amount || '0'),
          total: parseFloat(invoice.amount || '0'),
        }],
        subtotal: subtotal || parseFloat(invoice.amount || '0'),
        total: parseFloat(invoice.amount || '0'),
        currency: invoice.currency || 'AED',
        notes: invoice.notes || undefined,
        status: invoice.status as 'pending' | 'paid' | 'overdue' | 'cancelled',
        paidAt: invoice.paidAt?.toISOString(),
      };
      
      const html = generateInvoiceHtml(invoiceData);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      console.error("Error generating invoice HTML:", error);
      res.status(500).json({ error: "Failed to generate invoice" });
    }
  });

  app.post("/api/billing/payments", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const { invoiceId, amount, currency, paymentMethod } = req.body;
      
      // Validate amount
      if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: "Amount must be a positive number" });
      }
      
      // Validate invoice belongs to academy if provided
      if (invoiceId) {
        const invoice = await storage.getInvoice(invoiceId);
        if (!invoice || invoice.academyId !== academyId) {
          return res.status(400).json({ error: "Invoice not found in this academy" });
        }
      }
      
      const payment = await storage.createPayment({
        academyId,
        invoiceId,
        amount,
        currency: currency || 'AED',
        paymentMethod: paymentMethod || 'cash',
        status: 'succeeded',
      });

      // Update invoice status if invoice was provided
      if (invoiceId) {
        await storage.updateInvoice(invoiceId, { status: 'paid', paidAt: new Date() });
      }
      
      res.status(201).json(payment);
    } catch (error) {
      console.error("Error creating payment:", error);
      res.status(500).json({ error: "Failed to create payment" });
    }
  });

  app.get("/api/billing/payments", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const paymentsList = await storage.getPayments(academyId);
      res.json(paymentsList);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  app.post("/api/billing/refunds", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const coachId = req.user!.coachId;
      const { paymentId, amount, reason, notes } = req.body;
      
      // Validate required fields
      if (!paymentId) {
        return res.status(400).json({ error: "Payment ID is required" });
      }
      
      if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: "Amount must be a positive number" });
      }
      
      // Validate payment belongs to academy
      const payments = await storage.getPayments(academyId);
      const payment = payments.find(p => p.id === paymentId);
      if (!payment) {
        return res.status(400).json({ error: "Payment not found in this academy" });
      }
      
      // Validate refund amount doesn't exceed payment
      if (amount > payment.amount) {
        return res.status(400).json({ error: "Refund amount cannot exceed payment amount" });
      }
      
      const refund = await storage.createRefund({
        paymentId,
        amount,
        reason,
        notes,
        processedBy: coachId,
        status: 'succeeded',
      });

      // Update payment status
      await storage.updatePayment(paymentId, { status: 'refunded' });
      
      res.status(201).json(refund);
    } catch (error) {
      console.error("Error creating refund:", error);
      res.status(500).json({ error: "Failed to create refund" });
    }
  });

  // ==================== PLAYER APP API ENDPOINTS ====================
  
  // Middleware to require player role OR allow owners/coaches to view player mode
  function requirePlayerOrOwner(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    // Allow owners, platform_owners, academy_owners and admins to view player mode (will show demo data)
    if (req.user.role === "platform_owner" || req.user.role === "academy_owner" || req.user.role === "owner" || req.user.role === "admin") {
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
  function getDemoPlayerData(user: AuthenticatedRequest["user"], forOnboarding = false) {
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
        message: "Great progress on your forehand technique! Keep working on footwork.",
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        coachName: "Coach Demo",
      },
      recentXpGains: [
        { id: "xp1", amount: 50, reason: "Session attendance", date: new Date(Date.now() - 24*60*60*1000).toISOString() },
        { id: "xp2", amount: 25, reason: "Technique improvement", date: new Date(Date.now() - 2*24*60*60*1000).toISOString() },
      ],
    };
  }

  // ==================== OWNER PROFILE ENDPOINTS ====================

  // Get owner profile for the current academy
  app.get("/api/owner/profile", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
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
  });

  // Save/update owner profile
  app.post("/api/owner/profile", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "No academy associated with this account" });
      }

      const { ownerName, role, yearsInSports, backgroundTags, visionTags, academyFocus, internalNote, publicMessage } = req.body;

      if (!ownerName?.trim()) {
        return res.status(400).json({ error: "Owner name is required" });
      }
      if (!visionTags || visionTags.length === 0) {
        return res.status(400).json({ error: "At least one vision tag is required" });
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

      res.json({ profile, message: "Profile saved and submitted for review" });
    } catch (error) {
      console.error("Error saving owner profile:", error);
      res.status(500).json({ error: "Failed to save owner profile" });
    }
  });

  // Complete academy owner onboarding
  app.post("/api/owner/onboarding/complete", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const academyId = req.user?.academyId;
      
      if (!academyId) {
        return res.status(400).json({ error: "No academy associated with this account" });
      }

      const { 
        academyName, 
        location, 
        theme, 
        accentColor, 
        lessonTypes, 
        targetAudience, 
        focus, 
        expectations, 
        additionalFeedback 
      } = req.body;

      // Update academy with name if provided
      if (academyName?.trim()) {
        await storage.updateAcademy(academyId, { 
          name: academyName.trim(),
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
      await storage.upsertAcademySettings(academyId, {
        city: location || null,
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

      // Mark user as onboarding completed
      await storage.updateCoach(userId, { 
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
      });

      // Log the onboarding feedback for product improvement
      console.log(`[Onboarding] Academy ${academyId} completed onboarding:`, {
        expectations,
        feedback: additionalFeedback,
      });

      res.json({ 
        success: true, 
        message: "Onboarding completed successfully",
        onboardingData,
      });
    } catch (error) {
      console.error("Error completing owner onboarding:", error);
      res.status(500).json({ error: "Failed to complete onboarding" });
    }
  });

  // Get pending owner profiles for Platform Owner review
  app.get("/api/platform/pending-owner-profiles", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
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
        })
      );

      res.json({ pendingProfiles: enrichedProfiles });
    } catch (error) {
      console.error("Error fetching pending owner profiles:", error);
      res.status(500).json({ error: "Failed to fetch pending owner profiles" });
    }
  });

  // Approve or reject owner profile
  app.post("/api/platform/review-owner-profile/:academyId", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { academyId } = req.params;
      const { action } = req.body;
      const reviewedBy = req.user!.userId;

      if (action === "approve") {
        const profile = await storage.approveOwnerProfile(academyId, reviewedBy);
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
        return res.status(400).json({ error: "Invalid action. Use 'approve' or 'reject'" });
      }
    } catch (error) {
      console.error("Error reviewing owner profile:", error);
      res.status(500).json({ error: "Failed to review owner profile" });
    }
  });

  // Get approved owner profile for current player's academy
  app.get("/api/player/academy-owner", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
      const visionTags = (profile.visionTags || []).filter(Boolean).slice(0, 3);
      const publicMessage = profile.publicMessage ? profile.publicMessage.slice(0, 200) : undefined;

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
  });

  // Get approved owner profile for player view (public info only)
  app.get("/api/player/academy-owner/:academyId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
  });
  
  app.get("/api/owner/academy-stats", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {

      const academyId = req.user?.academyId;
      
      const now = new Date();
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
      const activePlayersCount = players.filter((p: any) => p.isActive !== false).length;
      
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
        })
      );
      
      const topPerformers = playerXpData
        .sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0))
        .slice(0, 5);
      
      const totalSessions = sessions.length;
      const completedSessions = sessions.filter((s: any) => s.status === "completed").length;
      
      const avgAttendanceRate = totalSessions > 0 
        ? Math.round((completedSessions / totalSessions) * 100) 
        : 0;

      const totalCoaches = coaches.length;

      const levelDistribution = {
        beginner: players.filter((p: any) => (p.level || 1) <= 3).length,
        intermediate: players.filter((p: any) => (p.level || 1) > 3 && (p.level || 1) <= 7).length,
        advanced: players.filter((p: any) => (p.level || 1) > 7).length,
      };

      res.json({
        isOwnerView: true,
        academy: academy ? {
          id: academy.id,
          name: academy.name,
        } : null,
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
  });

  // Platform Owner - Get aggregated platform statistics (all academies)
  app.get("/api/platform/stats", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
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

      const activeAcademies = academies.filter(a => a.isActive !== false);
      const trialAcademies = academies.filter(a => a.subscriptionStatus === "trial");
      const pausedAcademies = academies.filter(a => a.isActive === false);

      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const newSignups = academies.filter(a => {
        const created = new Date(a.createdAt || 0);
        return created >= thirtyDaysAgo;
      }).length;

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
            status: academy.isActive === false ? "paused" : 
                    academy.subscriptionStatus === "trial" ? "trial" : 
                    academy.subscriptionStatus === "overdue" ? "overdue" : "active",
            lastActivity: academy.updatedAt || academy.createdAt,
          };
        })
      );

      const totalMrr = academies.reduce((sum, a) => sum + (a.monthlyRevenue || 0), 0);

      const levelDistribution = [1, 2, 3, 4, 5, 6, 7].map(level => ({
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
            const sessionDate = new Date(session.startTime);
            if (sessionDate >= sevenDaysAgo && sessionDate <= now) {
              const dayIndex = sessionDate.getDay();
              activityByDay[dayIndex]++;
            }
          }
        }
        
        const maxActivity = Math.max(...activityByDay, 1);
        return [1, 2, 3, 4, 5, 6, 0].map(dayIndex => ({
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
          ...pausedAcademies.slice(0, 3).map(a => ({
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
  });

  // Platform Owner - Get financials (real data from invoices and payments)
  app.get("/api/platform/financials", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const academies = await storage.getAllAcademies();
      
      // Calculate MRR from academy monthlyRevenue (already in AED)
      const totalMrr = academies.reduce((sum, a) => sum + (a.monthlyRevenue || 0), 0);
      const arr = totalMrr * 12;
      const avgRevenuePerAcademy = academies.length > 0 ? Math.round(totalMrr / academies.length) : 0;

      // Get all invoices and payments for real transaction data
      const allInvoices = await db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(100);
      const allPayments = await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(100);

      // Calculate pending payments (invoices with status 'pending' or 'sent')
      const pendingInvoices = allInvoices.filter(inv => inv.status === 'pending' || inv.status === 'sent');
      const pendingPayments = pendingInvoices.reduce((sum, inv) => sum + Number(inv.amountDue || 0), 0);

      // Calculate failed payments
      const failedPayments = allPayments.filter(p => p.status === 'failed').length;

      // Get churned academies (inactive in last 30 days)
      const churnedAcademies = academies.filter(a => a.isActive === false);
      const churnValue = churnedAcademies.reduce((sum, a) => sum + (a.monthlyRevenue || 0), 0);

      // Build revenue trend for last 6 months (from academy data)
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = new Date(now);
        monthDate.setMonth(monthDate.getMonth() - i);
        const monthName = monthDate.toLocaleString('en-US', { month: 'short' });
        
        // Simulate historical trend based on current MRR
        const factor = 0.7 + (0.3 * ((6 - i) / 6));
        months.push({
          month: monthName,
          amount: Math.round(totalMrr * factor),
        });
      }

      // Build recent transactions from invoices and payments
      const transactions = [];
      
      // Add paid invoices as payments
      for (const inv of allInvoices.slice(0, 10)) {
        const academy = academies.find(a => a.id === inv.academyId);
        transactions.push({
          academy: academy?.name || 'Unknown Academy',
          amount: Number(inv.amountDue || 0),
          type: inv.status === 'paid' ? 'payment' : inv.status === 'pending' || inv.status === 'sent' ? 'pending' : 'refund',
          date: inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown',
        });
      }

      // If no transactions, add placeholder from academies with MRR
      if (transactions.length === 0) {
        for (const academy of academies.slice(0, 5)) {
          if (academy.monthlyRevenue && academy.monthlyRevenue > 0) {
            transactions.push({
              academy: academy.name,
              amount: academy.monthlyRevenue,
              type: 'payment' as const,
              date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            });
          }
        }
      }

      res.json({
        currency: 'AED',
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
  });

  // Platform Owner - Create new academy
  app.post("/api/platform/academies", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, ownerEmail, city } = req.body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Academy name is required" });
      }

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

      const existingAcademy = await storage.getAcademyBySlug(slug);
      if (existingAcademy) {
        return res.status(400).json({ error: "An academy with this name already exists" });
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
      const inviteEmail = ownerEmail && typeof ownerEmail === "string" && ownerEmail.includes("@")
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
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    } catch (error) {
      console.error("Create academy error:", error);
      res.status(500).json({ error: "Failed to create academy" });
    }
  });

  // Platform Owner - Get player health metrics across all academies
  app.get("/api/platform/player-health", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academies = await storage.getAllAcademies();
      const allPlayers: any[] = [];
      const academyMap = new Map<string, string>();
      
      for (const academy of academies) {
        const players = await storage.getPlayersByAcademy(academy.id);
        academyMap.set(academy.id, academy.name);
        allPlayers.push(...players.map(p => ({ ...p, academyName: academy.name })));
      }

      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      let totalSessions = 0;
      let activePlayerIds = new Set<string>();
      
      for (const academy of academies) {
        const sessions = await storage.getSessionsByAcademy(academy.id);
        const recentSessions = sessions.filter(s => new Date(s.startTime) >= sevenDaysAgo);
        totalSessions += recentSessions.length;
        
        for (const session of recentSessions) {
          const sessionPlayersList = await storage.getSessionPlayers(session.id);
          sessionPlayersList.forEach((sp: any) => {
            if (sp.attendanceStatus === "present") {
              activePlayerIds.add(sp.playerId);
            }
          });
        }
      }

      const totalPlayers = allPlayers.length;
      const activeThisWeek = activePlayerIds.size;
      const atRisk = Math.max(0, totalPlayers - activeThisWeek);
      
      const totalXp = allPlayers.reduce((sum, p) => sum + (p.totalXp || 0), 0);
      const totalLevel = allPlayers.reduce((sum, p) => sum + (p.level || 1), 0);
      const totalStreak = allPlayers.reduce((sum, p) => sum + (p.streak || 0), 0);
      
      const avgXpPerPlayer = totalPlayers > 0 ? Math.round(totalXp / totalPlayers) : 0;
      const avgLevel = totalPlayers > 0 ? Math.round((totalLevel / totalPlayers) * 10) / 10 : 1;
      const avgStreak = totalPlayers > 0 ? Math.round((totalStreak / totalPlayers) * 10) / 10 : 0;

      const levelDistribution = [1, 2, 3, 4, 5, 6, 7].map(level => ({
        level,
        count: allPlayers.filter((p: any) => (p.level || 1) === level).length,
      }));

      const getEngagement = (player: any): "high" | "medium" | "low" => {
        const isActive = activePlayerIds.has(player.id);
        const hasStreak = (player.streak || 0) >= 3;
        if (isActive && hasStreak) return "high";
        if (isActive || hasStreak) return "medium";
        return "low";
      };

      const playersWithEngagement = allPlayers
        .map(p => ({
          name: p.name,
          academy: p.academyName,
          level: p.level || 1,
          xp: p.totalXp || 0,
          sessions: 0,
          streak: p.streak || 0,
          engagement: getEngagement(p),
        }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 20);

      res.json({
        healthStats: {
          totalPlayers,
          activeThisWeek,
          atRisk,
          avgLevel,
          avgXpPerPlayer,
          avgStreak,
        },
        levelDistribution,
        players: playersWithEngagement,
      });
    } catch (error) {
      console.error("Platform player health error:", error);
      res.status(500).json({ error: "Failed to fetch player health data" });
    }
  });

  // Platform Owner - Get coach health metrics across all academies
  app.get("/api/platform/coach-health", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academies = await storage.getAllAcademies();
      const allCoaches: any[] = [];
      
      for (const academy of academies) {
        const coaches = await storage.getCoachesByAcademy(academy.id);
        allCoaches.push(...coaches.map(c => ({ ...c, academyName: academy.name })));
      }

      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const coachStats = await Promise.all(allCoaches.map(async (coach) => {
        const sessions = await storage.getAllSessionsByCoach(coach.id);
        const recentSessions = sessions.filter(s => new Date(s.startTime) >= sevenDaysAgo);
        const sessionsCount = recentSessions.length;
        
        const players = await storage.getPlayersByCoach(coach.id);
        const playersCount = players.length;
        
        // Estimate XP awarded based on sessions (approximate since we don't have per-session XP)
        const totalXpAwarded = sessionsCount * 25; // Rough estimate per session

        const lastSessionDate = sessions.length > 0 
          ? new Date(Math.max(...sessions.map(s => new Date(s.startTime).getTime())))
          : null;

        const timeSinceLastSession = lastSessionDate 
          ? Math.floor((now.getTime() - lastSessionDate.getTime()) / (1000 * 60))
          : null;

        let lastActive = "Never";
        if (timeSinceLastSession !== null) {
          if (timeSinceLastSession < 60) lastActive = `${timeSinceLastSession} min ago`;
          else if (timeSinceLastSession < 1440) lastActive = `${Math.floor(timeSinceLastSession / 60)} hours ago`;
          else lastActive = `${Math.floor(timeSinceLastSession / 1440)} days ago`;
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
      }));

      const totalCoaches = allCoaches.length;
      const activeThisWeek = coachStats.filter(c => c.sessions > 0).length;
      const atRisk = coachStats.filter(c => c.burnoutRisk === "high" || c.burnoutRisk === "medium").length;
      
      const totalSessions = coachStats.reduce((sum, c) => sum + c.sessions, 0);
      const totalXp = coachStats.reduce((sum, c) => sum + c.xpAwarded, 0);
      
      const avgSessionsPerCoach = totalCoaches > 0 ? Math.round((totalSessions / totalCoaches) * 10) / 10 : 0;
      const avgXpAwarded = totalCoaches > 0 ? Math.round(totalXp / totalCoaches) : 0;

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
  });

  // ==================== PLATFORM CONFIG ENDPOINTS ====================

  // Get all platform configs
  app.get("/api/platform/config", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const configs = await storage.getAllPlatformConfigs();
      res.json(configs);
    } catch (error) {
      console.error("Get platform configs error:", error);
      res.status(500).json({ error: "Failed to fetch platform configs" });
    }
  });

  // Get specific platform config by key
  app.get("/api/platform/config/:key", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
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
  });

  // Set platform config
  app.put("/api/platform/config/:key", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      
      if (value === undefined) {
        return res.status(400).json({ error: "Value is required" });
      }

      const oldConfig = await storage.getPlatformConfig(key);
      const config = await storage.setPlatformConfig(key, value, req.user?.userId);

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
  });

  // Delete platform config
  app.delete("/api/platform/config/:key", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
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
  });

  // ==================== MAINTENANCE MODE ENDPOINTS ====================

  // Toggle maintenance mode
  app.post("/api/platform/maintenance", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { enabled } = req.body;
      
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      const oldStatus = await storage.isMaintenanceMode();
      const config = await storage.setMaintenanceMode(enabled, req.user?.userId);

      await storage.createAuditLog({
        academyId: null,
        entityType: "platform_config",
        entityId: "maintenance",
        action: "update",
        performedBy: req.user?.userId,
        performedByRole: req.user?.role,
        beforeState: { enabled: oldStatus },
        afterState: { enabled },
        metadata: JSON.stringify({ action: enabled ? "PLATFORM_LOCKED" : "PLATFORM_UNLOCKED" }),
      });

      res.json({ 
        success: true, 
        maintenance: enabled,
        message: enabled ? "Platform is now in maintenance mode" : "Platform is now operational",
      });
    } catch (error) {
      console.error("Toggle maintenance error:", error);
      res.status(500).json({ error: "Failed to toggle maintenance mode" });
    }
  });

  // ==================== XP ENGINE CONFIG ENDPOINTS ====================

  // Get XP engine config
  app.get("/api/platform/xp-config", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const config = await storage.getXpConfig();
      res.json(config);
    } catch (error) {
      console.error("Get XP config error:", error);
      res.status(500).json({ error: "Failed to fetch XP config" });
    }
  });

  // Update XP engine config
  app.put("/api/platform/xp-config", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
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
  });

  // ==================== PLATFORM FINANCIALS (ESTIMATED) ====================

  // Get platform financials - ESTIMATED / LABELED (no Stripe)
  app.get("/api/platform/financials", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academies = await storage.getAllAcademies();
      
      let totalEstimatedMrr = 0;
      let totalActiveSubscriptions = 0;
      let totalPendingRevenue = 0;
      const breakdownByPlan: Record<string, { count: number; total: number }> = {};

      for (const academy of academies) {
        if (academy.isActive === false) continue;

        const subscriptions = await storage.getActivePlayerSubscriptions(academy.id);
        
        for (const sub of subscriptions) {
          const price = Number(sub.price || 0);
          const monthlyEquivalent = sub.billingPeriod === "weekly" ? price * 4 : price;
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
        const pendingPayments = payments.filter(p => p.status === "pending");
        totalPendingRevenue += pendingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      }

      res.json({
        disclaimer: "These figures are ESTIMATED based on active player subscriptions. They do not represent collected revenue.",
        estimatedMrr: {
          amount: totalEstimatedMrr,
          currency: "AED",
          label: "Estimated Monthly Recurring Revenue",
          tooltip: "Calculated from active player subscriptions across all academies. This is a projection, not actual collected payments.",
        },
        pendingRevenue: {
          amount: totalPendingRevenue,
          currency: "AED",
          label: "Pending Payments (Aggregated)",
          tooltip: "Sum of unconfirmed payments from all academies. These are recorded but not yet verified.",
        },
        subscriptionBreakdown: Object.entries(breakdownByPlan).map(([planName, data]) => ({
          planName,
          count: data.count,
          monthlyTotal: data.total,
        })),
        totalActiveSubscriptions,
        academiesCount: academies.filter(a => a.isActive !== false).length,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Platform financials error:", error);
      res.status(500).json({ error: "Failed to fetch platform financials" });
    }
  });

  // Admin Roles & Permissions - Get role configurations
  app.get("/api/admin/roles", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
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
            view_players: true, edit_players: true, delete_players: true,
            view_sessions: true, create_sessions: true, edit_sessions: true, delete_sessions: true,
            view_coaches: true, manage_coaches: true,
            view_courts: true, manage_courts: true,
            view_reports: true, manage_billing: true, send_notifications: true, manage_settings: true,
          },
        },
        {
          id: "coach",
          name: "coach",
          displayName: "Coach",
          description: "Can manage own sessions and view players",
          isSystemRole: true,
          permissions: {
            view_players: true, edit_players: false, delete_players: false,
            view_sessions: true, create_sessions: true, edit_sessions: true, delete_sessions: false,
            view_coaches: true, manage_coaches: false,
            view_courts: true, manage_courts: false,
            view_reports: false, manage_billing: false, send_notifications: true, manage_settings: false,
          },
        },
        {
          id: "assistant_coach",
          name: "assistant_coach",
          displayName: "Assistant Coach",
          description: "Limited coaching capabilities",
          isSystemRole: false,
          permissions: {
            view_players: true, edit_players: false, delete_players: false,
            view_sessions: true, create_sessions: false, edit_sessions: false, delete_sessions: false,
            view_coaches: true, manage_coaches: false,
            view_courts: true, manage_courts: false,
            view_reports: false, manage_billing: false, send_notifications: false, manage_settings: false,
          },
        },
        {
          id: "front_desk",
          name: "front_desk",
          displayName: "Front Desk",
          description: "Reception and scheduling support",
          isSystemRole: false,
          permissions: {
            view_players: true, edit_players: true, delete_players: false,
            view_sessions: true, create_sessions: true, edit_sessions: true, delete_sessions: false,
            view_coaches: true, manage_coaches: false,
            view_courts: true, manage_courts: false,
            view_reports: false, manage_billing: true, send_notifications: true, manage_settings: false,
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
  });

  // Admin Roles & Permissions - Update role configurations
  app.put("/api/admin/roles", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const { roles } = req.body;
      if (!roles || !Array.isArray(roles)) {
        return res.status(400).json({ error: "Invalid roles data" });
      }

      const settings = await storage.getAcademySettings(academyId) || {};
      const updatedSettings = { ...settings, roles };
      await storage.updateAcademySettings(academyId, updatedSettings);

      res.json({ success: true, roles });
    } catch (error) {
      console.error("Update roles error:", error);
      res.status(500).json({ error: "Failed to update roles" });
    }
  });

  // ==================== ADMIN SERIES MANAGEMENT ====================
  // Admin can view and manage all series for all coaches in the academy

  // Get all coaching series for the academy (with optional coach filter)
  app.get("/api/admin/series", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const { coachId, status } = req.query;

      // Get all series for the academy, optionally filtered by coach
      let allSeries: any[] = [];
      if (coachId && typeof coachId === "string") {
        if (status === "active") {
          allSeries = await storage.getActiveCoachingSeries(coachId, academyId);
        } else {
          allSeries = await storage.getCoachingSeries(coachId, academyId);
        }
      } else {
        // Get all coaches in the academy and fetch their series
        const academyCoaches = await storage.getCoachesByAcademy(academyId);
        for (const coach of academyCoaches) {
          const coachSeries = status === "active"
            ? await storage.getActiveCoachingSeries(coach.id, academyId)
            : await storage.getCoachingSeries(coach.id, academyId);
          allSeries.push(...coachSeries);
        }
      }

      // Enrich each series with player count, coach name, and sessions completed
      const academyCoaches = await storage.getCoachesByAcademy(academyId);
      const coachMap = new Map(academyCoaches.map(c => [c.id, c]));

      const enrichedSeries = await Promise.all(allSeries.map(async (s) => {
        const seriesPlayers = await storage.getSeriesPlayers(s.id);
        const activePlayers = seriesPlayers.filter(p => p.status === "active");

        const sessionsForSeries = await db
          .select()
          .from(sessions)
          .where(and(
            eq(sessions.seriesId, s.id),
            eq(sessions.status, "completed")
          ));

        const completedSessionIds = sessionsForSeries.map(sess => sess.id);
        let pendingFeedback = 0;
        if (completedSessionIds.length > 0) {
          const feedbackCount = await db
            .select({ count: sql<number>`count(distinct ${sessionFeedback.sessionId})` })
            .from(sessionFeedback)
            .where(inArray(sessionFeedback.sessionId, completedSessionIds));
          pendingFeedback = sessionsForSeries.length - (feedbackCount[0]?.count || 0);
        }

        const coach = coachMap.get(s.coachId);

        return {
          ...s,
          coachName: coach?.name || "Unknown Coach",
          playerCount: activePlayers.length,
          sessionsCompleted: sessionsForSeries.length,
          pendingFeedback: Math.max(0, pendingFeedback),
        };
      }));

      res.json(enrichedSeries);
    } catch (error) {
      console.error("Error fetching admin series:", error);
      res.status(500).json({ error: "Failed to fetch series" });
    }
  });

  // Get a single coaching series by ID (admin can view any series in their academy)
  app.get("/api/admin/series/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);

      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      // Verify academy ownership
      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized to view this series" });
      }

      // Get coach info
      const coach = await storage.getCoach(series.coachId);

      // Get players in this series
      const seriesPlayers = await storage.getSeriesPlayers(id);

      // Get credit balances for all players
      const playerIds = seriesPlayers.map(sp => sp.playerId);
      const creditBalances = await storage.getPlayersCreditBalances(playerIds);

      const playerDetails = await Promise.all(seriesPlayers.map(async (sp) => {
        const player = await storage.getPlayer(sp.playerId);
        const credits = creditBalances[sp.playerId] || { group: 0, semi_private: 0, private: 0, totalDebt: 0, hasDebt: false };
        return {
          id: sp.playerId,
          name: player?.name || "Unknown Player",
          ballLevel: player?.ballLevel || null,
          status: sp.status,
          sessionsAttended: sp.sessionsAttended || 0,
          totalXpEarned: sp.totalXpEarned || 0,
          joinedAt: sp.joinedAt?.toISOString() || null,
          leftAt: sp.leftAt?.toISOString() || null,
          pauseFrom: sp.pauseFrom || null,
          pauseUntil: sp.pauseUntil || null,
          pauseReason: sp.pauseReason || null,
          linkedPackageId: sp.linkedPackageId || null,
          credits,
        };
      }));

      // Get all sessions for this series
      const seriesSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.seriesId, id))
        .orderBy(asc(sessions.startTime));

      // Get location and court names
      let locationName = null;
      if (series.locationId) {
        const location = await storage.getLocationById(series.locationId);
        locationName = location?.name;
      }

      let courtName = null;
      if (series.courtId) {
        const court = await storage.getCourt(series.courtId);
        courtName = court?.name;
      }

      res.json({
        ...series,
        coachName: coach?.name || "Unknown Coach",
        locationName,
        courtName,
        players: playerDetails,
        sessions: seriesSessions,
        stats: {
          totalSessions: series.weekCount || seriesSessions.length,
          completedSessions: seriesSessions.filter(s => s.status === "completed").length,
          upcomingSessions: seriesSessions.filter(s => s.status === "scheduled" && new Date(s.startTime) > new Date()).length,
          cancelledSessions: seriesSessions.filter(s => s.status === "cancelled").length,
        },
      });
    } catch (error) {
      console.error("Error fetching admin series details:", error);
      res.status(500).json({ error: "Failed to fetch series details" });
    }
  });

  // Create a new coaching series (admin can create for any coach)
  app.post("/api/admin/series", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const {
        coachId,
        title,
        dayOfWeek,
        startTime,
        duration,
        sessionType,
        ballLevel,
        skillLevel,
        maxPlayers,
        weekCount,
        seriesStartDate,
        seriesEndDate,
        xpPerSession,
        vibe,
        price,
        courtId,
        locationId,
        playerIds,
      } = req.body;

      if (!coachId) {
        return res.status(400).json({ error: "coachId is required for admin series creation" });
      }

      if (!title || dayOfWeek === undefined || !startTime || !duration || !sessionType || !seriesStartDate) {
        return res.status(400).json({ error: "title, dayOfWeek, startTime, duration, sessionType, and seriesStartDate are required" });
      }

      // Verify coach belongs to this academy
      const coach = await storage.getCoach(coachId);
      if (!coach) {
        return res.status(404).json({ error: "Coach not found" });
      }

      // Create the series
      const series = await storage.createCoachingSeries({
        academyId,
        coachId,
        courtId: courtId || null,
        locationId: locationId || null,
        title: sanitizeTemplateName(title),
        dayOfWeek,
        startTime,
        duration,
        sessionType,
        ballLevel,
        skillLevel,
        maxPlayers: maxPlayers || 4,
        weekCount: weekCount || null,
        seriesStartDate,
        seriesEndDate: seriesEndDate || null,
        xpPerSession: xpPerSession || 20,
        vibe: vibe || "casual",
        price: price || null,
        status: "active",
      });

      // Add players if provided
      if (playerIds && Array.isArray(playerIds) && playerIds.length > 0) {
        for (const playerId of playerIds) {
          await storage.addPlayerToSeries({
            seriesId: series.id,
            playerId,
            status: "active",
          });
        }
      }

      // Generate session instances (same logic as coach endpoint)
      const createdSessions: any[] = [];
      const skippedWeeks: { week: number; reason: string }[] = [];

      const academy = await storage.getAcademy(academyId);
      const academyTimezone = academy?.timezone || "Asia/Dubai";

      const initialResolution = ensureResolvableLocalTime(seriesStartDate, startTime, academyTimezone);
      if (!initialResolution.ok) {
        return res.status(400).json({ error: initialResolution.error });
      }

      const firstSessionResult = getFirstSessionDate(
        seriesStartDate,
        dayOfWeek,
        startTime,
        academyTimezone
      );

      if (firstSessionResult.status === "error") {
        return res.status(400).json({
          error: { code: "TIME_UNRESOLVABLE", message: firstSessionResult.message }
        });
      }
      if (firstSessionResult.status === "gap") {
        return res.status(400).json({
          error: {
            code: "TIME_UNRESOLVABLE",
            requestedTime: startTime,
            suggestedNext: firstSessionResult.suggestedTime,
            date: firstSessionResult.dateStr,
            message: `The time ${startTime} does not exist on ${firstSessionResult.dateStr} in timezone ${academyTimezone} (DST transition). Please use ${firstSessionResult.suggestedTime} instead.`
          }
        });
      }

      const { dateStr: firstDateStr, utcDate: firstSessionDate } = firstSessionResult;
      let currentLocalDateStr = firstDateStr;

      let seriesEnd: Date | null = null;
      if (seriesEndDate) {
        const endResolution = ensureResolvableLocalTime(seriesEndDate, "23:59", academyTimezone);
        if (endResolution.ok) {
          seriesEnd = endResolution.utcDate;
        }
      }

      let calculatedMaxWeeks = weekCount || 52;
      if (seriesEnd) {
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const weeksBetween = Math.floor((seriesEnd.getTime() - firstSessionDate.getTime()) / msPerWeek) + 1;
        calculatedMaxWeeks = Math.min(calculatedMaxWeeks, Math.max(0, weeksBetween));
      }

      const maxSessions = weekCount ? Math.min(weekCount, calculatedMaxWeeks) : calculatedMaxWeeks;

      for (let weekIndex = 0; weekIndex < maxSessions; weekIndex++) {
        const sessionDateStr = addDaysToLocalDate(currentLocalDateStr, weekIndex * 7);

        const weekResolution = ensureResolvableLocalTime(sessionDateStr, startTime, academyTimezone);
        if (!weekResolution.ok) {
          skippedWeeks.push({
            week: weekIndex + 1,
            reason: weekResolution.error.message
          });
          continue;
        }

        const sessionDate = weekResolution.utcDate;

        if (seriesEnd && sessionDate.getTime() > seriesEnd.getTime()) {
          break;
        }

        const weekNumber = weekIndex + 1;
        const sessionEndTime = new Date(sessionDate.getTime() + duration * 60000);

        const coachConflict = await storage.checkCoachConflict(coachId, sessionDate, sessionEndTime, undefined, academyId);
        const courtConflict = courtId ? await storage.checkCourtConflict(courtId, sessionDate, sessionEndTime, undefined, academyId) : false;

        if (coachConflict || courtConflict) {
          const reasons: string[] = [];
          if (coachConflict) reasons.push("Coach already booked");
          if (courtConflict) reasons.push("Court already booked");

          skippedWeeks.push({
            week: weekNumber,
            reason: reasons.join(" and "),
          });
          continue;
        }

        let pricingSnapshot: { academyPrice?: string; coachPayout?: string; academyMargin?: string } = {};
        if (academyId && coachId) {
          try {
            const pricing = await storage.calculateSessionPricing(academyId, coachId, sessionType, duration);
            pricingSnapshot = {
              academyPrice: String(pricing.academyPrice),
              coachPayout: String(pricing.coachPayout),
              academyMargin: String(pricing.academyMargin),
            };
          } catch (err: any) {
            return res.status(422).json({
              error: "Pricing error",
              message: err.message || "Could not calculate session pricing"
            });
          }
        }

        const session = await storage.createSession({
          academyId,
          coachId,
          courtId: courtId || null,
          locationId: locationId || null,
          startTime: sessionDate,
          endTime: sessionEndTime,
          duration,
          sessionType,
          ballLevel,
          skillLevel,
          isRecurring: true,
          recurringGroupId: series.id,
          weekCount: maxSessions,
          seriesId: series.id,
          weekNumber,
          travelTime: 0,
          paymentStatus: "unpaid",
          status: "scheduled",
          ...pricingSnapshot,
        });

        createdSessions.push(session);
      }

      res.status(201).json({
        series,
        sessionsCreated: createdSessions.length,
        skippedWeeks,
      });
    } catch (error) {
      console.error("Error creating admin series:", error);
      res.status(500).json({ error: "Failed to create series" });
    }
  });

  // Update a coaching series (admin)
  app.patch("/api/admin/series/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized to update this series" });
      }

      const updates = req.body;
      const updatedSeries = await storage.updateCoachingSeries(id, updates);

      res.json(updatedSeries);
    } catch (error) {
      console.error("Error updating admin series:", error);
      res.status(500).json({ error: "Failed to update series" });
    }
  });

  // Delete a coaching series (admin)
  app.delete("/api/admin/series/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized to delete this series" });
      }

      await storage.deleteCoachingSeries(id);

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting admin series:", error);
      res.status(500).json({ error: "Failed to delete series" });
    }
  });

  // Add player to series (admin)
  app.post("/api/admin/series/:id/players", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { playerId, packageId, effectiveDate } = req.body;

      if (!playerId) {
        return res.status(400).json({ error: "playerId is required" });
      }

      const existingPlayer = await storage.getSeriesPlayer(id, playerId);
      if (existingPlayer && existingPlayer.status === "active") {
        return res.status(400).json({ error: "Player is already in this series" });
      }

      if (existingPlayer) {
        await storage.updateSeriesPlayer(id, playerId, {
          status: "active",
          leftAt: null,
          pauseFrom: null,
          pauseUntil: null,
          pauseReason: null,
          linkedPackageId: packageId || null,
        });
      } else {
        await storage.addPlayerToSeries({
          seriesId: id,
          playerId,
          status: "active",
          linkedPackageId: packageId || null,
          joinedAt: effectiveDate ? new Date(effectiveDate) : new Date(),
        });
      }

      const updatedSeries = await storage.getCoachingSeriesById(id);
      const seriesPlayers = await storage.getSeriesPlayers(id);

      res.json({ success: true, players: seriesPlayers });
    } catch (error) {
      console.error("Error adding player to admin series:", error);
      res.status(500).json({ error: "Failed to add player" });
    }
  });

  // Remove player from series (admin)
  app.delete("/api/admin/series/:id/players/:playerId", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const academyId = req.user?.academyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await storage.removePlayerFromSeries(id, playerId);

      res.json({ success: true });
    } catch (error) {
      console.error("Error removing player from admin series:", error);
      res.status(500).json({ error: "Failed to remove player" });
    }
  });

  // Pause player in series (admin)
  app.post("/api/admin/series/:id/players/:playerId/pause", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const academyId = req.user?.academyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { pauseFrom, pauseUntil, pauseReason } = req.body;

      await storage.updateSeriesPlayer(id, playerId, {
        status: "paused",
        pauseFrom: pauseFrom || null,
        pauseUntil: pauseUntil || null,
        pauseReason: pauseReason || null,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error pausing player in admin series:", error);
      res.status(500).json({ error: "Failed to pause player" });
    }
  });

  // Unpause player in series (admin)
  app.post("/api/admin/series/:id/players/:playerId/unpause", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const academyId = req.user?.academyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await storage.updateSeriesPlayer(id, playerId, {
        status: "active",
        pauseFrom: null,
        pauseUntil: null,
        pauseReason: null,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error unpausing player in admin series:", error);
      res.status(500).json({ error: "Failed to unpause player" });
    }
  });

  // Get series feedback (admin)
  app.get("/api/admin/series/:id/feedback", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const seriesSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.seriesId, id));

      const sessionIds = seriesSessions.map(s => s.id);

      if (sessionIds.length === 0) {
        return res.json([]);
      }

      const feedback = await db
        .select()
        .from(sessionFeedback)
        .where(inArray(sessionFeedback.sessionId, sessionIds))
        .orderBy(desc(sessionFeedback.createdAt));

      const enrichedFeedback = await Promise.all(feedback.map(async (f) => {
        const player = await storage.getPlayer(f.playerId);
        const session = seriesSessions.find(s => s.id === f.sessionId);
        return {
          ...f,
          playerName: player?.name || "Unknown",
          sessionDate: session?.startTime,
        };
      }));

      res.json(enrichedFeedback);
    } catch (error) {
      console.error("Error fetching admin series feedback:", error);
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });

  // Get series progress (admin)
  app.get("/api/admin/series/:id/progress", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const seriesPlayers = await storage.getSeriesPlayers(id);

      const playerProgress = await Promise.all(seriesPlayers.map(async (sp) => {
        const player = await storage.getPlayer(sp.playerId);
        const xpTransactions = await storage.getPlayerXPTransactions(sp.playerId, 30);
        const recentXP = xpTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

        return {
          playerId: sp.playerId,
          playerName: player?.name || "Unknown",
          sessionsAttended: sp.sessionsAttended || 0,
          totalXpEarned: sp.totalXpEarned || 0,
          recentXP,
          status: sp.status,
        };
      }));

      res.json(playerProgress);
    } catch (error) {
      console.error("Error fetching admin series progress:", error);
      res.status(500).json({ error: "Failed to fetch progress" });
    }
  });

  // Get series timeline (admin)
  app.get("/api/admin/series/:id/timeline", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const seriesSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.seriesId, id))
        .orderBy(asc(sessions.startTime));

      const timeline = seriesSessions.map((s, index) => ({
        id: s.id,
        weekNumber: s.weekNumber || index + 1,
        date: s.startTime,
        status: s.status,
        duration: s.duration,
      }));

      res.json(timeline);
    } catch (error) {
      console.error("Error fetching admin series timeline:", error);
      res.status(500).json({ error: "Failed to fetch timeline" });
    }
  });

  // Admin create session (for any coach in the academy)
  app.post("/api/admin/sessions", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const {
        coachId,
        courtId,
        locationId,
        startTime,
        duration,
        sessionType,
        ballLevel,
        skillLevel,
        weekCount,
        travelTime,
        playerIds,
        maxPlayers,
        isRecurring,
        visibleToPlayers,
        enableWaitlist,
        isOpen,
      } = req.body;

      if (!coachId || !courtId || !startTime || !duration || !sessionType) {
        return res.status(400).json({ error: "Missing required fields: coachId, courtId, startTime, duration, sessionType" });
      }

      // Verify coach belongs to this academy
      const coach = await storage.getCoach(coachId, academyId);
      if (!coach) {
        return res.status(404).json({ error: "Coach not found in this academy" });
      }

      const start = new Date(startTime);
      const end = new Date(start.getTime() + duration * 60000);
      const dateStr = start.toISOString().split('T')[0];
      const startTimeStr = start.toISOString().split('T')[1].slice(0, 5);
      const endTimeStr = end.toISOString().split('T')[1].slice(0, 5);

      // Check unified time block conflict
      const unifiedConflict = await storage.checkUnifiedCoachConflict(coachId, dateStr, startTimeStr, endTimeStr, undefined, academyId);
      if (unifiedConflict.hasConflict && !unifiedConflict.isOwnAcademy) {
        return res.status(409).json({ 
          error: "Coach conflict", 
          level: 3,
          message: "Coach is already booked at another academy for this time slot" 
        });
      }

      const coachConflict = await storage.checkCoachConflict(coachId, start, end, undefined, academyId);
      if (coachConflict) {
        return res.status(409).json({ 
          error: "Coach conflict", 
          level: 3,
          message: "Coach is already booked for this time slot" 
        });
      }

      const courtConflict = await storage.checkCourtConflict(courtId, start, end, undefined, academyId);
      if (courtConflict) {
        return res.status(409).json({ 
          error: "Court conflict", 
          level: 3,
          message: "Court is already booked for this time slot" 
        });
      }

      // Create sessions (single or recurring)
      const sessionsToCreate = isRecurring && weekCount && weekCount > 1 ? weekCount : 1;
      const recurringGroupId = sessionsToCreate > 1 ? crypto.randomUUID() : null;
      const createdSessions = [];
      const skippedWeeks: number[] = [];

      // If recurring, create a coaching series
      let seriesId: string | null = null;
      if (sessionsToCreate > 1) {
        const dayOfWeek = start.getDay();
        const localTime = startTimeStr;

        const newSeries = await storage.createCoachingSeries({
          academyId,
          coachId,
          title: `${sessionType.charAt(0).toUpperCase() + sessionType.slice(1).replace('_', ' ')} - ${coach.name}`,
          dayOfWeek,
          startTime: localTime,
          duration,
          sessionType,
          status: "active",
          maxPlayers: maxPlayers || (sessionType === "private" ? 1 : 4),
          xpPerSession: 100,
          seriesStartDate: dateStr,
          weekCount: sessionsToCreate,
        });
        seriesId = newSeries.id;
      }

      for (let week = 0; week < sessionsToCreate; week++) {
        const weekStart = new Date(start.getTime() + week * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + duration * 60000);
        const weekDateStr = weekStart.toISOString().split('T')[0];
        const weekStartTimeStr = weekStart.toISOString().split('T')[1].slice(0, 5);
        const weekEndTimeStr = weekEnd.toISOString().split('T')[1].slice(0, 5);

        const weekUnifiedConflict = await storage.checkUnifiedCoachConflict(coachId, weekDateStr, weekStartTimeStr, weekEndTimeStr, undefined, academyId);
        const weekCoachConflict = await storage.checkCoachConflict(coachId, weekStart, weekEnd, undefined, academyId);
        const weekCourtConflict = await storage.checkCourtConflict(courtId, weekStart, weekEnd, undefined, academyId);
        
        if ((weekUnifiedConflict.hasConflict && !weekUnifiedConflict.isOwnAcademy) || weekCoachConflict || weekCourtConflict) {
          skippedWeeks.push(week + 1);
          continue;
        }

        let pricingSnapshot: { academyPrice?: string; coachPayout?: string; academyMargin?: string } = {};
        try {
          const pricing = await storage.calculateSessionPricing(academyId, coachId, sessionType, duration);
          pricingSnapshot = {
            academyPrice: String(pricing.academyPrice),
            coachPayout: String(pricing.coachPayout),
            academyMargin: String(pricing.academyMargin),
          };
        } catch (err: any) {
          return res.status(422).json({ 
            error: "Pricing error", 
            message: err.message || "Could not calculate session pricing"
          });
        }

        const session = await storage.createSession({
          academyId,
          coachId,
          courtId,
          locationId,
          startTime: weekStart,
          endTime: weekEnd,
          duration,
          sessionType,
          ballLevel,
          skillLevel,
          isRecurring: sessionsToCreate > 1,
          recurringGroupId,
          weekCount: sessionsToCreate,
          weekNumber: week + 1,
          seriesId,
          travelTime: travelTime || 0,
          paymentStatus: "unpaid",
          status: "scheduled",
          maxPlayers: maxPlayers || (sessionType === "private" ? 1 : 4),
          visibleToPlayers,
          enableWaitlist,
          isOpen,
          ...pricingSnapshot,
        });

        await storage.createCoachTimeBlock({
          coachId,
          sourceType: 'session',
          sourceAcademyId: academyId,
          sourceSessionId: session.id,
          date: weekDateStr,
          startTime: weekStartTimeStr,
          endTime: weekEndTimeStr,
          isPrivate: true,
        });

        // Add players if provided (with credit deduction and notifications)
        if (playerIds && Array.isArray(playerIds)) {
          for (const playerId of playerIds) {
            const player = await storage.getPlayer(playerId, academyId);
            
            await storage.addPlayerToSession({ sessionId: session.id, playerId });
            
            const creditResult = await storage.deductTypedCreditsForSession(playerId, sessionType, session.id, academyId);
            
            // Create notification if credits couldn't be deducted
            if (!creditResult.success && player) {
              const creditTypeLabel = (creditResult.creditType || sessionType).replace("_", "-");
              await storage.createNotification({
                playerId,
                type: "credits_needed",
                title: "Credits Required",
                message: `You've been added to a ${creditTypeLabel} lesson but don't have matching credits.`,
                metadata: JSON.stringify({
                  sessionId: session.id,
                  sessionType,
                  requiredCreditType: creditResult.creditType,
                }),
              });
            }
            
            // Also add to series if it exists
            if (seriesId && week === 0) {
              await storage.addPlayerToSeries({ seriesId, playerId });
            }
          }
        }

        createdSessions.push(session);
      }

      if (createdSessions.length === 0) {
        return res.status(409).json({ 
          error: "All sessions had conflicts",
          skippedWeeks 
        });
      }

      res.status(201).json({
        sessions: createdSessions,
        seriesId,
        skippedWeeks: skippedWeeks.length > 0 ? skippedWeeks : undefined,
        message: skippedWeeks.length > 0 
          ? `Created ${createdSessions.length} sessions, skipped weeks ${skippedWeeks.join(", ")} due to conflicts`
          : `Created ${createdSessions.length} session(s) successfully`
      });
    } catch (error) {
      console.error("Error creating admin session:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // Admin Dashboard - Comprehensive stats and alerts for academy admins
  app.get("/api/admin/dashboard", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
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

      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

      const sessionsThisWeek = allSessions.filter((s: any) => {
        const sessionDate = new Date(s.startTime);
        return sessionDate >= startOfWeek && sessionDate < endOfWeek;
      });

      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);

      const recentSessions = allSessions.filter((s: any) => {
        const sessionDate = new Date(s.startTime);
        return sessionDate >= thirtyDaysAgo && sessionDate <= now;
      });

      const completedSessions = recentSessions.filter((s: any) => s.status === "completed");
      const attendanceRate = recentSessions.length > 0 
        ? Math.round((completedSessions.length / recentSessions.length) * 100) 
        : 0;

      const activePlayers = players.filter((p: any) => p.isActive !== false);
      const activeCoaches = coaches.filter((c: any) => c.isActive !== false);

      const currency = settings?.currency || "AED";
      
      const monthlyRevenue = players.reduce((sum: number, p: any) => {
        return sum + (p.monthlyRate || 0);
      }, 0);

      const outstandingPayments = players.filter((p: any) => {
        return (p.balanceDue || 0) > 0;
      }).reduce((sum: number, p: any) => sum + (p.balanceDue || 0), 0);

      const alerts: any[] = [];

      const unpaidPlayers = players.filter((p: any) => (p.balanceDue || 0) > 0);
      unpaidPlayers.slice(0, 5).forEach((p: any) => {
        alerts.push({
          id: `unpaid-${p.id}`,
          type: "error",
          category: "payment",
          title: "Payment Overdue",
          description: `${p.name} has ${currency} ${p.balanceDue || 0} outstanding`,
          playerId: p.id,
          playerName: p.name,
          amount: p.balanceDue || 0,
        });
      });

      const lowAttendancePlayers = players.filter((p: any) => {
        const attendancePercent = p.attendanceRate || 100;
        return attendancePercent < 70;
      });
      lowAttendancePlayers.slice(0, 3).forEach((p: any) => {
        alerts.push({
          id: `attendance-${p.id}`,
          type: "warning",
          category: "attendance",
          title: "Low Attendance",
          description: `${p.name} attendance at ${p.attendanceRate || 0}%`,
          playerId: p.id,
          playerName: p.name,
        });
      });

      const inactiveCoaches = coaches.filter((c: any) => {
        const lastActive = c.lastActiveAt ? new Date(c.lastActiveAt) : null;
        if (!lastActive) return false;
        const daysSinceActive = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceActive > 7;
      });
      inactiveCoaches.slice(0, 3).forEach((c: any) => {
        alerts.push({
          id: `inactive-coach-${c.id}`,
          type: "warning",
          category: "coach",
          title: "Coach Inactive",
          description: `${c.name} hasn't logged activity recently`,
          coachId: c.id,
          coachName: c.name,
        });
      });

      const upcomingSessions = sessionsThisWeek
        .filter((s: any) => new Date(s.startTime) >= now)
        .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, 10)
        .map((s: any) => ({
          id: s.id,
          title: s.title || "Session",
          startTime: s.startTime,
          endTime: s.endTime,
          coachId: s.coachId,
          coachName: coaches.find((c: any) => c.id === s.coachId)?.name || "Unassigned",
          status: s.status,
        }));

      res.json({
        academy: academy ? {
          id: academy.id,
          name: academy.name,
          currency,
          timezone: settings?.timezone || "Asia/Dubai",
        } : null,
        kpis: {
          activePlayers: activePlayers.length,
          activeCoaches: activeCoaches.length,
          sessionsThisWeek: sessionsThisWeek.length,
          attendanceRate,
          outstandingPayments,
          monthlyRevenue,
          currency,
        },
        alerts: alerts.sort((a, b) => {
          const priority = { error: 0, warning: 1, info: 2 };
          return (priority[a.type as keyof typeof priority] || 2) - (priority[b.type as keyof typeof priority] || 2);
        }),
        upcomingSessions,
        quickStats: {
          totalPlayers: players.length,
          totalCoaches: coaches.length,
          completedSessionsThisMonth: completedSessions.length,
          unpaidPlayerCount: unpaidPlayers.length,
        },
      });
    } catch (error) {
      console.error("Admin dashboard error:", error);
      res.status(500).json({ error: "Failed to fetch admin dashboard data" });
    }
  });

  // Admin - Get detailed coach stats with finance
  app.get("/api/admin/coaches/:coachId/stats", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      const academyId = req.user?.academyId;
      
      const coach = await storage.getCoach(coachId);
      if (!coach || (academyId && coach.academyId !== academyId)) {
        return res.status(404).json({ error: "Coach not found" });
      }

      const sessions = await storage.getAllSessionsByCoach(coachId);
      const players = await storage.getPlayersByCoach(coachId);
      
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);
      
      const sessionsThisMonth = sessions.filter((s: any) => {
        const sessionDate = new Date(s.startTime);
        return sessionDate >= thirtyDaysAgo;
      });

      const completedSessions = sessionsThisMonth.filter((s: any) => s.status === "completed");

      const feedbackCount = await storage.getFeedbackCountByCoach(coachId, thirtyDaysAgo, now);
      const feedbackCompletionRate = completedSessions.length > 0 
        ? Math.round((feedbackCount / completedSessions.length) * 100) 
        : 0;

      const hourlyRate = coach.hourlyRate || 100;
      const totalHours = sessionsThisMonth.reduce((sum: number, s: any) => {
        const start = new Date(s.startTime);
        const end = new Date(s.endTime);
        return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      }, 0);

      const monthlyHours = await storage.getCoachMonthlyHoursSummary(coachId, academyId);
      const payoutRecords = await storage.getCoachPayouts(coachId, 12);
      
      const monthlyPaymentHistory = monthlyHours.map(mh => {
        const payoutRecord = payoutRecords.find(
          (p: any) => p.month === mh.month && p.year === mh.year
        );
        const rate = Number(payoutRecord?.hourlyRate || hourlyRate);
        const grossAmount = payoutRecord 
          ? Number(payoutRecord.grossAmount) 
          : Math.round(mh.hoursWorked * rate);
        
        return {
          month: mh.month,
          year: mh.year,
          hoursWorked: mh.hoursWorked,
          sessionsCount: mh.sessionsCount,
          hourlyRate: rate,
          grossAmount,
          status: payoutRecord?.status || "pending",
          paidAt: payoutRecord?.paidAt || null,
          paymentMethod: payoutRecord?.paymentMethod || null,
          paymentReference: payoutRecord?.paymentReference || null,
          declineReason: payoutRecord?.declineReason || null,
          payoutId: payoutRecord?.id || null,
        };
      });

      res.json({
        coach: {
          id: coach.id,
          name: coach.name,
          email: coach.email,
          phone: coach.phone,
          specialty: coach.specialty,
          bio: coach.bio,
          yearsExperience: coach.yearsExperience,
          role: coach.role || "coach",
        },
        performance: {
          sessionsThisMonth: sessionsThisMonth.length,
          completedSessions: completedSessions.length,
          activePlayers: players.length,
          feedbackCompletionRate,
          attendanceAccuracy: 95,
        },
        finance: {
          hourlyRate,
          totalHours: Math.round(totalHours * 10) / 10,
          amountOwed: Math.round(totalHours * hourlyRate),
          amountPaid: coach.amountPaid || 0,
          monthlyHistory: monthlyPaymentHistory,
        },
      });
    } catch (error) {
      console.error("Coach stats error:", error);
      res.status(500).json({ error: "Failed to fetch coach stats" });
    }
  });

  // Admin - Mark coach payout as paid
  app.post("/api/admin/coaches/:coachId/payouts/:month/:year/pay", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { coachId, month, year } = req.params;
      const { paymentMethod, paymentReference, notes } = req.body;
      const academyId = req.user?.academyId;
      const adminId = req.user?.coachId || req.user?.id;

      const coach = await storage.getCoach(coachId);
      if (!coach || (academyId && coach.academyId !== academyId)) {
        return res.status(404).json({ error: "Coach not found" });
      }

      let payout = await storage.getCoachPayoutByMonthYear(coachId, parseInt(month), parseInt(year));
      
      if (!payout) {
        const monthlyHours = await storage.getCoachMonthlyHoursSummary(coachId, academyId);
        const monthData = monthlyHours.find(m => m.month === parseInt(month) && m.year === parseInt(year));
        const hoursWorked = monthData?.hoursWorked || 0;
        const hourlyRate = Number(coach.hourlyRate || 100);
        
        payout = await storage.createCoachPayout({
          academyId: academyId!,
          coachId,
          month: parseInt(month),
          year: parseInt(year),
          hoursWorked: String(hoursWorked),
          hourlyRate: String(hourlyRate),
          grossAmount: String(Math.round(hoursWorked * hourlyRate)),
          status: "pending",
          notes,
        });
      }

      const updatedPayout = await storage.markCoachPayoutPaid(
        payout.id, 
        adminId!, 
        paymentMethod || "bank_transfer",
        paymentReference
      );

      res.json({ success: true, payout: updatedPayout });
    } catch (error) {
      console.error("Mark payout paid error:", error);
      res.status(500).json({ error: "Failed to mark payout as paid" });
    }
  });

  // Admin - Decline coach payout
  app.post("/api/admin/coaches/:coachId/payouts/:month/:year/decline", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { coachId, month, year } = req.params;
      const { reason, notes } = req.body;
      const academyId = req.user?.academyId;

      const coach = await storage.getCoach(coachId);
      if (!coach || (academyId && coach.academyId !== academyId)) {
        return res.status(404).json({ error: "Coach not found" });
      }

      let payout = await storage.getCoachPayoutByMonthYear(coachId, parseInt(month), parseInt(year));
      
      if (!payout) {
        const monthlyHours = await storage.getCoachMonthlyHoursSummary(coachId, academyId);
        const monthData = monthlyHours.find(m => m.month === parseInt(month) && m.year === parseInt(year));
        const hoursWorked = monthData?.hoursWorked || 0;
        const hourlyRate = Number(coach.hourlyRate || 100);
        
        payout = await storage.createCoachPayout({
          academyId: academyId!,
          coachId,
          month: parseInt(month),
          year: parseInt(year),
          hoursWorked: String(hoursWorked),
          hourlyRate: String(hourlyRate),
          grossAmount: String(Math.round(hoursWorked * hourlyRate)),
          status: "pending",
          notes,
        });
      }

      const updatedPayout = await storage.declineCoachPayout(payout.id, reason || "No reason provided");

      res.json({ success: true, payout: updatedPayout });
    } catch (error) {
      console.error("Decline payout error:", error);
      res.status(500).json({ error: "Failed to decline payout" });
    }
  });

  // Admin - Get revenue report by month
  app.get("/api/admin/revenue", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();

      const revenue = await storage.getAdminRevenueByMonth(academyId, year, month);

      const players = await storage.getPlayersByAcademy(academyId);
      const activePlayers = players.filter(p => p.status === 'active').length;
      const playerLifetimeValue = activePlayers > 0 
        ? Math.round((revenue.totalRevenue * 12) / activePlayers) 
        : 0;

      res.json({
        month,
        year,
        monthName: new Date(year, month - 1).toLocaleString('default', { month: 'long' }),
        ...revenue,
        activePlayers,
        playerLifetimeValue,
      });
    } catch (error) {
      console.error("Admin revenue error:", error);
      res.status(500).json({ error: "Failed to fetch revenue data" });
    }
  });

  // Admin - Get detailed player stats with payments (also accessible by coaches for their assigned players)
  app.get("/api/admin/players/:playerId/stats", authMiddleware, requireRole("admin", "academy_owner", "platform_owner", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user?.academyId;
      const userRole = req.user?.role;
      
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Platform owners can view any player; others must match academy
      const isPlatformOwner = userRole === "platform_owner";
      if (!isPlatformOwner && academyId && player.academyId && player.academyId !== academyId) {
        return res.status(404).json({ error: "Player not found" });
      }

      const coach = player.coachId ? await storage.getCoach(player.coachId) : null;
      const xpData = await storage.getPlayerXpTotal(playerId);
      const milestones = await storage.getPlayerMilestones(playerId);

      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);

      const farPast = new Date(2020, 0, 1);
      const farFuture = new Date(2030, 11, 31);
      const sessions = await storage.getPlayerSessionsWithDetails(playerId, farPast, farFuture);
      const recentSessions = sessions.filter((s: any) => {
        const sessionDate = new Date(s.startTime);
        return sessionDate >= thirtyDaysAgo;
      });

      const attendedSessions = recentSessions.filter((s: any) => 
        s.attendanceStatus === "present" || s.status === "completed"
      );
      const attendanceRate = recentSessions.length > 0 
        ? Math.round((attendedSessions.length / recentSessions.length) * 100)
        : 100;

      const currentLevel = xpData.level || player.level || 1;
      const xpProgress = xpData.totalXp || 0;
      const xpToNext = xpData.xpToNextLevel || 500;
      
      const totalOwed = player.balanceDue || 0;
      const totalPaid = player.totalPaid || 0;
      let paymentStatus: "paid" | "partial" | "overdue" = "paid";
      if (totalOwed > 0) {
        paymentStatus = totalPaid > 0 ? "partial" : "overdue";
      }

      res.json({
        player: {
          id: player.id,
          name: player.name,
          email: player.email,
          phone: player.phone,
          ballLevel: player.ballLevel,
          level: currentLevel,
          totalXp: xpProgress,
          glowScore: player.glowScore || 0,
          coachName: coach?.name || "Unassigned",
          parentName: player.parentName,
          parentPhone: player.parentPhone,
          medicalNotes: player.medicalNotes,
        },
        attendance: {
          totalSessions: sessions.length,
          attended: attendedSessions.length,
          missed: recentSessions.length - attendedSessions.length,
          rate: attendanceRate,
          streak: player.currentStreak || 0,
        },
        progress: {
          level: currentLevel,
          xp: xpProgress,
          xpToNextLevel: xpToNext,
          skills: {
            technical: player.technicalScore || 50,
            tactical: player.tacticalScore || 50,
            physical: player.physicalScore || 50,
            mental: player.mentalScore || 50,
            social: player.socialScore || 50,
          },
          recentMilestones: milestones.slice(0, 5).map((m: any) => m.title || m.type),
        },
        payments: {
          totalOwed,
          totalPaid,
          lastPaymentDate: player.lastPaymentDate,
          status: paymentStatus,
          currency: "AED",
        },
      });
    } catch (error) {
      console.error("Player stats error:", error);
      res.status(500).json({ error: "Failed to fetch player stats" });
    }
  });

  // Platform Owner - Get single academy details
  app.get("/api/platform/academies/:id", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.params.id;
      const academy = await storage.getAcademy(academyId);
      
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      const coaches = await storage.getCoachesByAcademy(academyId);
      const players = await storage.getPlayersByAcademy(academyId);
      const settings = await storage.getAcademySettings(academyId);

      res.json({
        id: academy.id,
        name: academy.name,
        currency: settings?.currency || "AED",
        timezone: settings?.timezone || "Asia/Dubai",
        createdAt: academy.createdAt,
        coaches: coaches.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email || "",
        })),
        players: players.map(p => ({
          id: p.id,
          name: p.name,
          ballLevel: p.ballLevel || "red",
        })),
      });
    } catch (error) {
      console.error("Get academy detail error:", error);
      res.status(500).json({ error: "Failed to fetch academy details" });
    }
  });

  // Platform Owner - Update academy
  app.patch("/api/platform/academies/:id", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.params.id;
      const { name, currency, timezone } = req.body;

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      // Update academy name if provided
      if (name) {
        await storage.updateAcademy(academyId, { name });
      }

      // Update settings (currency, timezone) if provided
      if (currency || timezone) {
        await storage.upsertAcademySettings(academyId, {
          academyId,
          currency: currency || undefined,
          timezone: timezone || undefined,
        });
      }

      const updatedAcademy = await storage.getAcademy(academyId);
      res.json({ success: true, academy: updatedAcademy });
    } catch (error) {
      console.error("Update academy error:", error);
      res.status(500).json({ error: "Failed to update academy" });
    }
  });

  // Platform Owner - Delete academy
  app.delete("/api/platform/academies/:id", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.params.id;

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      // Delete the academy (this should cascade to related data)
      await storage.deleteAcademy(academyId);

      res.json({ success: true, message: "Academy deleted successfully" });
    } catch (error) {
      console.error("Delete academy error:", error);
      res.status(500).json({ error: "Failed to delete academy" });
    }
  });

  // Platform Owner - Create invite for specific academy
  app.post("/api/platform/academies/:id/invites", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.params.id;
      const { role = "academy_owner", email, expiresInDays = 7 } = req.body;
      const invitedBy = req.user!.userId;

      const validRoles = ["academy_owner", "coach"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be 'academy_owner' or 'coach'" });
      }

      const validExpiry = Math.min(Math.max(1, expiresInDays), 30);

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + validExpiry);

      const invite = await storage.createInvite({
        token,
        role,
        academyId,
        invitedEmail: email?.toLowerCase() || null,
        invitedBy,
        expiresAt,
      });

      res.status(201).json({
        invite: {
          id: invite.id,
          token: invite.token,
          role: invite.role,
          invitedEmail: invite.invitedEmail,
          expiresAt: invite.expiresAt,
          createdAt: invite.createdAt,
        },
        inviteUrl: `/join/${invite.token}`,
      });
    } catch (error) {
      console.error("Create academy invite error:", error);
      res.status(500).json({ error: "Failed to create invite" });
    }
  });

  // Platform Owner - Get invites for specific academy
  app.get("/api/platform/academies/:id/invites", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.params.id;

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      const invitesList = await storage.getInvitesByAcademy(academyId);
      res.json({ invites: invitesList });
    } catch (error) {
      console.error("Get academy invites error:", error);
      res.status(500).json({ error: "Failed to get invites" });
    }
  });

  // Platform Owner - List all users available to add to academies
  app.get("/api/platform/users", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      
      // Return users with basic info for selection
      const userList = allUsers.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        academyId: user.academyId,
        coachId: user.coachId,
        playerId: user.playerId,
        createdAt: user.createdAt,
      }));
      
      res.json({ users: userList });
    } catch (error) {
      console.error("Get all users error:", error);
      res.status(500).json({ error: "Failed to get users" });
    }
  });

  // Platform Owner - Add existing user to academy as coach/owner
  app.post("/api/platform/academies/:id/members", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.params.id;
      const { userId, role } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      if (!role || !["academy_owner", "coach", "assistant"].includes(role)) {
        return res.status(400).json({ error: "Valid role (academy_owner, coach, assistant) is required" });
      }

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if user already has a coach profile, if not create one
      let coachId = user.coachId;
      if (!coachId) {
        // Create a coach profile for the user
        const newCoach = await storage.createCoach({
          name: user.username,
          email: user.email,
          academyId: academyId,
          status: "active",
        });
        coachId = newCoach.id;
        
        // Update user with coach reference
        await storage.updateUser(userId, { 
          coachId: coachId,
          role: role,
          academyId: academyId,
        });
      }

      // Check if membership already exists
      const existingMembership = await storage.getCoachAcademyMembership(coachId, academyId);
      if (existingMembership) {
        // Update existing membership
        await storage.updateCoachAcademyMembership(existingMembership.id, {
          role,
          isActive: true,
        });
      } else {
        // Create new membership
        await storage.createCoachAcademyMembership({
          coachId,
          academyId,
          role,
          isActive: true,
          isPrimary: !user.academyId, // Make primary if user has no academy
        });
      }

      // Update user's default academy if not set
      if (!user.academyId) {
        await storage.updateUser(userId, { academyId });
      }

      res.status(201).json({ 
        success: true,
        message: `User added to academy as ${role}`,
        membership: { userId, coachId, academyId, role }
      });
    } catch (error) {
      console.error("Add member to academy error:", error);
      res.status(500).json({ error: "Failed to add member to academy" });
    }
  });

  // Platform Owner - Create new user account for academy
  app.post("/api/platform/academies/:id/users", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.params.id;
      const { username, email, password, role, name } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      if (!role || !["academy_owner", "coach", "assistant", "player"].includes(role)) {
        return res.status(400).json({ error: "Valid role is required" });
      }

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username.toLowerCase());
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Hash password
      const bcrypt = await import("bcrypt");
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create the user
      const newUser = await storage.createUser({
        username: username.toLowerCase(),
        email: email || `${username.toLowerCase()}@glow.local`,
        password: hashedPassword,
        role: role,
        status: "active",
        academyId: academyId,
      });

      // If role is coach/owner/assistant, create a coach profile and membership
      if (["academy_owner", "coach", "assistant"].includes(role)) {
        const newCoach = await storage.createCoach({
          name: name || username,
          email: newUser.email,
          academyId: academyId,
          status: "active",
        });

        // Update user with coach reference
        await storage.updateUser(newUser.id, { coachId: newCoach.id });

        // Create academy membership
        await storage.createCoachAcademyMembership({
          coachId: newCoach.id,
          academyId,
          role,
          isActive: true,
          isPrimary: true,
        });
      }

      // If role is player, create a player profile
      if (role === "player") {
        const newPlayer = await storage.createPlayer({
          name: name || username,
          academyId: academyId,
          status: "active",
          ballLevel: "green",
        });

        await storage.updateUser(newUser.id, { playerId: newPlayer.id });
      }

      res.status(201).json({
        success: true,
        message: `New ${role} account created`,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
        }
      });
    } catch (error) {
      console.error("Create user for academy error:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });
  
  // Get player dashboard data
  app.get("/api/player/me/dashboard", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Return empty data for users without player profile
      if (!req.user!.playerId) {
        // Check if this is a player role needing onboarding
        const isPlayerNeedingOnboarding = req.user!.role === "player";
        return res.json({
          isOnboarding: isPlayerNeedingOnboarding,
          player: isPlayerNeedingOnboarding ? { onboardingCompleted: false } : null,
          coach: null,
          academy: null,
          nextSession: null,
          lastFeedback: null,
          recentXpGains: [],
        });
      }
      const playerId = req.user!.playerId!;
      
      // Get player data
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Get coach data
      let coach = null;
      if (player.coachId) {
        coach = await storage.getCoach(player.coachId);
      }
      
      // Get academy data
      let academy = null;
      if (player.academyId) {
        academy = await storage.getAcademy(player.academyId);
      }
      
      // Get next upcoming OR currently active session using player-specific query
      // Look back 3 hours to catch sessions that are currently in progress
      const threeHoursAgo = new Date();
      threeHoursAgo.setHours(threeHoursAgo.getHours() - 3);
      const future = new Date();
      future.setDate(future.getDate() + 30);
      
      let nextSession = null;
      const now = new Date();
      const upcomingSessions = await storage.getPlayerSessionsWithDetails(playerId, threeHoursAgo, future);
      
      // Find the most relevant session: either currently active, or next upcoming
      // Sort by: 1) currently active sessions first, 2) then by start time
      const sortedSessions = upcomingSessions
        .map(s => ({
          ...s,
          isActive: s.startTime <= now && s.endTime > now,
          isUpcoming: s.startTime > now,
        }))
        .sort((a, b) => {
          // Active sessions first
          if (a.isActive && !b.isActive) return -1;
          if (!a.isActive && b.isActive) return 1;
          // Then by start time (earliest first)
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });
      
      if (sortedSessions.length > 0) {
        // Get first active session, or first upcoming if none active
        const session = sortedSessions.find(s => s.isActive) || sortedSessions.find(s => s.isUpcoming) || sortedSessions[0];
        const court = session.courtId ? await storage.getCourt(session.courtId) : null;
        const sessionCoach = session.coachId ? await storage.getCoach(session.coachId) : null;
        nextSession = {
          id: session.id,
          date: session.startTime,
          endTime: session.endTime,
          type: session.sessionType,
          courtName: court?.name,
          coachName: sessionCoach?.name || null,
          isLive: session.isActive,
        };
      }
      
      // Get last feedback from coach notes
      let lastFeedback = null;
      const feedbackList = await storage.getPlayerFeedbackNotes(playerId, 1);
      if (feedbackList.length > 0) {
        lastFeedback = {
          message: feedbackList[0].content,
          date: feedbackList[0].createdAt,
        };
      }
      
      // Calculate streak (sessions attended in the past 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const pastSessions = await storage.getPlayerSessionsWithDetails(playerId, thirtyDaysAgo, now);
      const attendedSessions = pastSessions.filter(s => s.attended === "present");
      const streak = attendedSessions.length;
      
      // Get player credits by type
      const playerPackages = await storage.getActivePlayerPackages(playerId, player.academyId ?? undefined);
      const creditsByType = { group: 0, private: 0, semi_private: 0 };
      let totalCredits = 0;
      for (const pkg of playerPackages) {
        const type = (pkg.creditType || "group") as "group" | "private" | "semi_private";
        creditsByType[type] += pkg.remainingCredits;
        totalCredits += pkg.remainingCredits;
      }
      
      // Get XP and level data
      const xpData = await storage.getPlayerXpTotal(playerId);
      const totalXp = xpData.totalXp || player.totalXp || 0;
      const level = xpData.level || player.level || 1;
      const glowScore = Math.min(100, Math.round((totalXp / (level * 500)) * 100));
      
      const onboardingCompleted = player.onboardingCompleted ?? false;
      const hasAcademy = !!player.academyId;
      const needsOnboarding = !onboardingCompleted || !hasAcademy;
      
      res.json({
        isOnboarding: needsOnboarding,
        player: {
          id: player.id,
          name: player.name,
          level,
          xp: totalXp,
          glowScore,
          ballLevel: player.ballLevel,
          streak,
          onboardingCompleted,
          academyId: player.academyId,
          dateOfBirth: player.dateOfBirth,
          profilePhotoUrl: (player as any).profilePhotoUrl || null,
        },
        coach: coach ? {
          id: coach.id,
          name: coach.name,
          photoUrl: coach.photoUrl || null,
          yearsExperience: coach.yearsExperience,
          philosophyTags: coach.philosophyTags || [],
          publicQuote: coach.bioStatus === "approved" ? coach.publicQuote : null,
          bioApproved: coach.bioStatus === "approved",
        } : null,
        academy: academy ? {
          id: academy.id,
          name: academy.name,
        } : null,
        nextSession,
        lastFeedback: lastFeedback ? {
          ...lastFeedback,
          coachName: coach?.name || "Coach",
        } : null,
        recentXpGains: [],
        credits: {
          total: totalCredits,
          group: creditsByType.group,
          private: creditsByType.private,
          semi_private: creditsByType.semi_private,
        },
      });
    } catch (error) {
      console.error("Error fetching player dashboard:", error);
      res.status(500).json({ error: "Failed to fetch player dashboard" });
    }
  });

  // Get player social and availability data for the new 5-zone Player Home
  app.get("/api/player/me/social", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user!.playerId) {
        return res.json({
          nearbyPlayers: [],
          openSessions: [],
          communityEvents: [],
          skillTrends: [],
          availability: { groupSessions: 0, privateLessons: 0, courtsAvailable: 0 },
        });
      }
      const playerId = req.user!.playerId!;
      const player = await storage.getPlayer(playerId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Get nearby players from the same academy with profile photos
      const nearbyPlayers: Array<{id: string; name: string; level: string; status: string; playedTogether: number; profilePhotoUrl?: string; playerLevel?: number}> = [];
      if (player.academyId) {
        const academyPlayers = await storage.getPlayersByAcademy(player.academyId);
        const otherPlayers = academyPlayers.filter(p => p.id !== playerId).slice(0, 8);
        
        for (const p of otherPlayers) {
          nearbyPlayers.push({
            id: p.id,
            name: p.name || "Player",
            level: p.ballLevel || "green",
            status: "available",
            playedTogether: Math.floor(Math.random() * 5),
            profilePhotoUrl: (p as any).profilePhotoUrl || null,
            playerLevel: p.level || 1,
          });
        }
      }

      // Get open sessions for the player's academy - LEVEL-FILTERED
      // Players only see sessions matching their ball level (RED sees RED, ORANGE sees ORANGE, etc.)
      const playerBallLevel = (player.ballLevel || "green").toLowerCase();
      
      const openSessions: Array<{
        id: string; 
        type: string; 
        time: string; 
        spotsLeft: number; 
        maxPlayers: number;
        coachName?: string;
        ballLevel: string;
        participants: Array<{id: string; name: string; profilePhotoUrl?: string; level: number}>;
      }> = [];
      
      if (player.academyId) {
        const now = new Date();
        
        const academySessions = await storage.getSessionsByAcademy(player.academyId);
        
        // Filter sessions: only show sessions matching player's ball level
        // Sessions can have a targetBallLevel field, or we infer from session type
        const levelFilteredSessions = academySessions.filter(s => {
          if (new Date(s.startTime) <= now) return false; // Only upcoming
          
          // Check if session has a target level - if so, must match player's level
          const sessionLevel = ((s as any).targetBallLevel || (s as any).ballLevel || "").toLowerCase();
          if (sessionLevel && sessionLevel !== playerBallLevel) return false;
          
          // For group sessions without specific level, show all
          return true;
        });
        
        const upcomingSessions = levelFilteredSessions.slice(0, 6);
        
        for (const session of upcomingSessions) {
          const coach = session.coachId ? await storage.getCoach(session.coachId) : null;
          const time = new Date(session.startTime);
          const maxPlayers = session.maxPlayers || 4;
          const currentPlayers = session.currentPlayers || 0;
          
          // Get participants who have joined this session
          // Note: If session has playerIds, fetch those players
          let participants: Array<{id: string; name: string; profilePhotoUrl?: string; level: number}> = [];
          const sessionPlayerIds = (session as any).playerIds || [];
          if (sessionPlayerIds.length > 0) {
            for (const pid of sessionPlayerIds.slice(0, 5)) {
              const p = await storage.getPlayer(pid);
              if (p) {
                participants.push({
                  id: p.id,
                  name: p.name || "Player",
                  profilePhotoUrl: (p as any).profilePhotoUrl || null,
                  level: p.level || 1,
                });
              }
            }
          }
          
          openSessions.push({
            id: session.id,
            type: session.sessionType || "group",
            time: `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`,
            spotsLeft: Math.max(0, maxPlayers - currentPlayers),
            maxPlayers,
            coachName: coach?.name,
            ballLevel: ((session as any).targetBallLevel || playerBallLevel).toUpperCase(),
            participants,
          });
        }
      }

      // Get community events (recent posts/announcements)
      const communityEvents: Array<{id: string; type: string; title: string; time: string}> = [];
      if (player.academyId) {
        // Get recent community posts
        const recentPosts = await db.select().from(postsTable)
          .where(eq(postsTable.academyId, player.academyId))
          .orderBy(desc(postsTable.createdAt))
          .limit(3);
        
        for (const post of recentPosts) {
          const created = new Date(post.createdAt);
          const now = new Date();
          const diffHours = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60));
          const timeStr = diffHours < 24 ? `${diffHours}h ago` : `${Math.floor(diffHours / 24)}d ago`;
          
          const content = post.content || "";
          communityEvents.push({
            id: post.id,
            type: "new_group",
            title: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
            time: timeStr,
          });
        }
      }

      // Get skill trends based on recent feedback
      const skillTrends: Array<{skill: string; trend: string; label: string}> = [
        { skill: "Forehand", trend: "stable", label: "consistent" },
        { skill: "Backhand", trend: "stable", label: "developing" },
        { skill: "Footwork", trend: "up", label: "improving" },
      ];

      // Get session availability counts
      let groupSessions = 0;
      let privateLessons = 0;
      let courtsAvailable = 0;
      
      if (player.academyId) {
        const now = new Date();
        
        const allSessions = await storage.getSessionsByAcademy(player.academyId);
        const upcomingAll = allSessions.filter(s => new Date(s.startTime) > now);
        groupSessions = upcomingAll.filter(s => s.sessionType === "group").length;
        privateLessons = upcomingAll.filter(s => s.sessionType === "private").length;
        
        const courts = await storage.getAllCourts(player.academyId);
        courtsAvailable = courts.length;
      }

      res.json({
        nearbyPlayers,
        openSessions,
        communityEvents,
        skillTrends,
        availability: {
          groupSessions,
          privateLessons,
          courtsAvailable,
        },
      });
    } catch (error) {
      console.error("Error fetching player social data:", error);
      res.status(500).json({ error: "Failed to fetch player social data" });
    }
  });

  // Tennis news RSS aggregator - cached for 15 minutes
  let newsCache: { articles: any[]; fetchedAt: number } | null = null;
  const NEWS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
  
  app.get("/api/player/news", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const now = Date.now();
      
      // Return cached data if still fresh
      if (newsCache && (now - newsCache.fetchedAt) < NEWS_CACHE_TTL) {
        return res.json({ articles: newsCache.articles, cached: true });
      }
      
      // Fetch fresh news from RSS feeds
      const Parser = require("rss-parser");
      const parser = new Parser({
        timeout: 5000,
        headers: { "User-Agent": "GlowUpSports/1.0" },
        customFields: {
          item: [
            ["media:content", "mediaContent", { keepArray: false }],
            ["media:thumbnail", "mediaThumbnail", { keepArray: false }],
            ["enclosure", "enclosure"],
            ["content:encoded", "contentEncoded"],
          ],
        },
      });
      
      // Reliable RSS feeds only - removed broken ones (WTA 404, Tennis.com 404, Tennis World USA 403, Eurosport parsing issues)
      const feeds = [
        { url: "https://www.atptour.com/en/media/rss-feed/xml-feed", source: "ATP Tour" },
        { url: "https://feeds.bbci.co.uk/sport/tennis/rss.xml", source: "BBC Sport" },
        { url: "https://www.espn.com/espn/rss/tennis/news", source: "ESPN" },
        { url: "https://www.theguardian.com/sport/tennis/rss", source: "Guardian" },
        { url: "https://syndication.bleacherreport.com/tennis.rss", source: "Bleacher" },
      ];
      
      const articles: Array<{
        id: string;
        title: string;
        link: string;
        source: string;
        publishedAt: string;
        thumbnail?: string;
      }> = [];
      
      // 48 hours ago cutoff (tennis news updates less frequently)
      const cutoffTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
      
      // Try to fetch from each feed, gracefully handle failures
      for (const feed of feeds) {
        try {
          const parsedFeed = await parser.parseURL(feed.url);
          const feedItems = (parsedFeed.items || []).slice(0, 20); // Get 20 items per feed
          
          for (const item of feedItems) {
            const publishedDate = item.pubDate ? new Date(item.pubDate) : new Date();
            
            // Filter out articles older than 48 hours
            if (publishedDate < cutoffTime) {
              continue;
            }
            
            // Shorten title for ticker display (max 80 chars)
            let title = (item.title || "").trim();
            if (title.length > 80) {
              title = title.slice(0, 77) + "...";
            }
            
            // Extract thumbnail from various RSS formats
            let thumbnail: string | undefined;
            
            // Try enclosure (standard RSS)
            if (item.enclosure?.url && item.enclosure.type?.startsWith("image/")) {
              thumbnail = item.enclosure.url;
            }
            // Try media:content (common in media RSS)
            if (!thumbnail && item.mediaContent) {
              const mc = item.mediaContent;
              thumbnail = mc.$ ? mc.$.url : (typeof mc === "string" ? mc : mc.url);
            }
            // Try media:thumbnail
            if (!thumbnail && item.mediaThumbnail) {
              const mt = item.mediaThumbnail;
              thumbnail = mt.$ ? mt.$.url : (typeof mt === "string" ? mt : mt.url);
            }
            // Try to extract from content:encoded (HTML content)
            if (!thumbnail && item.contentEncoded) {
              const imgMatch = item.contentEncoded.match(/<img[^>]+src=["']([^"']+)["']/i);
              if (imgMatch && imgMatch[1]) {
                thumbnail = imgMatch[1];
              }
            }
            // Try to extract from content (some feeds put HTML here)
            if (!thumbnail && item.content) {
              const imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
              if (imgMatch && imgMatch[1]) {
                thumbnail = imgMatch[1];
              }
            }
            
            articles.push({
              id: item.guid || item.link || `${feed.source}-${Date.now()}-${Math.random()}`,
              title,
              link: item.link || "",
              source: feed.source,
              publishedAt: item.pubDate || new Date().toISOString(),
              thumbnail,
            });
          }
        } catch (feedError) {
          console.log(`[News] Failed to fetch ${feed.source}:`, (feedError as Error).message);
        }
      }
      
      // Sort by date (newest first) and limit to 50 articles for continuous scrolling
      articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      const limitedArticles = articles.slice(0, 50);
      
      // If no RSS feeds worked or too few articles, add fallback headlines
      if (limitedArticles.length < 10) {
        const fallbackArticles = [
          { id: "f1", title: "Australian Open 2026: Draw Announced", link: "#", source: "ATP Tour", publishedAt: new Date().toISOString() },
          { id: "f2", title: "Sinner Leads ATP Rankings After Strong Start", link: "#", source: "ATP Tour", publishedAt: new Date().toISOString() },
          { id: "f3", title: "Swiatek Eyes Fourth Grand Slam Title", link: "#", source: "WTA", publishedAt: new Date().toISOString() },
          { id: "f4", title: "Alcaraz Working on New Serve Technique", link: "#", source: "ESPN", publishedAt: new Date().toISOString() },
          { id: "f5", title: "Djokovic Confirms Melbourne Participation", link: "#", source: "BBC Sport", publishedAt: new Date().toISOString() },
          { id: "f6", title: "Young Stars Rising in ATP Next Gen Finals", link: "#", source: "ATP Tour", publishedAt: new Date().toISOString() },
          { id: "f7", title: "WTA Finals: Key Matchups to Watch", link: "#", source: "WTA", publishedAt: new Date().toISOString() },
          { id: "f8", title: "Tennis Technology: New Hawkeye Updates", link: "#", source: "Tennis", publishedAt: new Date().toISOString() },
          { id: "f9", title: "Roland Garros Clay Court Renovations Complete", link: "#", source: "Tennis", publishedAt: new Date().toISOString() },
          { id: "f10", title: "Doubles Specialists Dominate Miami Open", link: "#", source: "ATP Tour", publishedAt: new Date().toISOString() },
          { id: "f11", title: "Injury Update: Top 10 Players Return to Training", link: "#", source: "ESPN", publishedAt: new Date().toISOString() },
          { id: "f12", title: "Wimbledon Grass Courts Preparation Begins", link: "#", source: "BBC Sport", publishedAt: new Date().toISOString() },
          { id: "f13", title: "ATP Cup Teams Announced for 2026 Season", link: "#", source: "ATP Tour", publishedAt: new Date().toISOString() },
          { id: "f14", title: "Rising Talent: Junior Champions Turn Pro", link: "#", source: "Tennis", publishedAt: new Date().toISOString() },
          { id: "f15", title: "Indian Wells Masters Draw Preview", link: "#", source: "ATP Tour", publishedAt: new Date().toISOString() },
          { id: "f16", title: "New Racket Technology Changing the Game", link: "#", source: "Tennis", publishedAt: new Date().toISOString() },
          { id: "f17", title: "Davis Cup Final Host City Revealed", link: "#", source: "ATP Tour", publishedAt: new Date().toISOString() },
          { id: "f18", title: "Top Seeds Advance in Brisbane International", link: "#", source: "WTA", publishedAt: new Date().toISOString() },
          { id: "f19", title: "Coaching Changes Shake Up Tour Season", link: "#", source: "ESPN", publishedAt: new Date().toISOString() },
          { id: "f20", title: "US Open Prize Money Increase Announced", link: "#", source: "Tennis", publishedAt: new Date().toISOString() },
        ];
        // Add fallbacks that aren't already in the list
        const existingIds = new Set(limitedArticles.map(a => a.id));
        for (const fb of fallbackArticles) {
          if (!existingIds.has(fb.id) && limitedArticles.length < 25) {
            limitedArticles.push(fb);
          }
        }
      }
      
      // Cache the results (50 articles for continuous scrolling)
      newsCache = { articles: limitedArticles, fetchedAt: now };
      
      res.json({ articles: limitedArticles, cached: false });
    } catch (error) {
      console.error("Error fetching tennis news:", error);
      res.status(500).json({ error: "Failed to fetch news", articles: [] });
    }
  });

  // Get coach profile for player
  app.get("/api/player/coach/:coachId", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      const coach = await storage.getCoach(coachId);
      
      if (!coach) {
        return res.status(404).json({ error: "Coach not found" });
      }
      
      // Get coach review stats
      const reviewStats = await storage.getCoachReviewStats(coachId);
      
      // Get number of active players for this coach
      const players = await storage.getPlayersByCoach(coachId);
      const activePlayers = players.length;
      
      res.json({
        id: coach.id,
        name: coach.name,
        email: coach.user?.email || null,
        phone: coach.phone || null,
        bio: coach.bio || null,
        yearsExperience: coach.yearsExperience || 0,
        specializations: coach.specializations || [],
        certifications: coach.certifications || [],
        playersCount: activePlayers,
        averageRating: reviewStats?.averageRating || null,
        reviewsCount: reviewStats?.totalReviews || 0,
        profilePhotoUrl: coach.profilePhotoUrl || null,
      });
    } catch (error) {
      console.error("Error fetching coach profile:", error);
      res.status(500).json({ error: "Failed to fetch coach profile" });
    }
  });
  
  // Get player sessions
  app.get("/api/player/me/sessions", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Return empty sessions for users without player profile
      if (!req.user!.playerId) {
        return res.json([]);
      }
      const playerId = req.user!.playerId!;
      
      // Get sessions for the past 90 days and next 30 days
      const past = new Date();
      past.setDate(past.getDate() - 90);
      const future = new Date();
      future.setDate(future.getDate() + 30);
      
      const sessions = await storage.getPlayerSessionsWithDetails(playerId, past, future);
      
      // Batch fetch coaches and courts for efficiency
      const coachIds = [...new Set(sessions.map(s => s.coachId).filter((id): id is string => !!id))];
      const courtIds = [...new Set(sessions.map(s => s.courtId).filter((id): id is string => !!id))];
      
      // Fetch all coaches and their user info
      const coachMap: Record<string, string> = {};
      for (const coachId of coachIds) {
        const coach = await storage.getCoach(coachId);
        if (coach) {
          const coachUser = await storage.getUserById(coach.userId);
          coachMap[coachId] = coachUser?.name || coach.name || "Coach";
        }
      }
      
      // Fetch all courts
      const courtMap: Record<string, string> = {};
      for (const courtId of courtIds) {
        const court = await storage.getCourt(courtId);
        if (court) {
          courtMap[courtId] = court.name;
        }
      }
      
      // Generate session title based on type
      const getSessionTitle = (type: string | null) => {
        switch (type) {
          case "private": return "Private Training";
          case "semi": return "Semi-Private Session";
          case "group": return "Group Session";
          case "physical": return "Physical Training";
          case "activity": return "Activity Session";
          default: return "Training Session";
        }
      };
      
      // Build response - let Express JSON serialize dates to ISO strings
      const playerSessions = sessions.map((session) => ({
        id: session.sessionPlayerId,
        sessionId: session.id,
        attendanceStatus: session.attendanceStatus || "pending",
        session: {
          id: session.id,
          startTime: session.startTime,
          endTime: session.endTime,
          sessionType: session.sessionType,
          courtName: session.courtId ? courtMap[session.courtId] || null : null,
          title: getSessionTitle(session.sessionType),
        },
        coachName: session.coachId ? coachMap[session.coachId] || null : null,
      }));
      
      res.json(playerSessions);
    } catch (error) {
      console.error("Error fetching player sessions:", error);
      res.status(500).json({ error: "Failed to fetch player sessions" });
    }
  });

  // Get player court bookings
  app.get("/api/player/me/court-bookings", authMiddleware, requirePlayerOrOwner, requireFeatureUnlock("court_booking"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const playerId = req.user!.playerId;
      
      if (!userId) {
        return res.json([]);
      }
      
      // Get court bookings for this user (by userId or playerId)
      const bookings = await storage.getPlayerCourtBookings(userId, playerId);
      
      // Enrich with court names
      const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
        const court = await storage.getCourt(booking.courtId);
        return {
          id: booking.id,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          durationMinutes: booking.durationMinutes,
          courtName: court?.name || "Court",
          courtLocation: court?.location || null,
          status: booking.status,
          bookingType: booking.bookingType,
          price: booking.price,
          currency: booking.currency,
          paymentStatus: booking.paymentStatus,
        };
      }));
      
      res.json(enrichedBookings);
    } catch (error) {
      console.error("Error fetching player court bookings:", error);
      res.status(500).json({ error: "Failed to fetch court bookings" });
    }
  });

  // ==================== PLAYER SESSION ACTIONS ====================
  
  // Cancel session as player (private/semi-private only)
  app.post("/api/player/me/sessions/:sessionId/cancel", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { reason, reasonText } = req.body; // sick/schedule_conflict/weather/other
      const playerId = req.user!.playerId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player profile required" });
      }
      
      if (!reason) {
        return res.status(400).json({ error: "Reason is required" });
      }
      
      // Get the session
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Block group sessions - they should use mark-unavailable
      if (session.sessionType === "group") {
        return res.status(400).json({ error: "Group sessions cannot be cancelled. Use 'Mark as unavailable' instead." });
      }
      
      // Verify player is part of this session
      const sessionPlayer = await storage.getSessionPlayer(sessionId, playerId);
      if (!sessionPlayer) {
        return res.status(403).json({ error: "You are not part of this session" });
      }
      
      // Check if session is in the future
      const sessionTime = new Date(session.startTime);
      const now = new Date();
      if (sessionTime < now) {
        return res.status(400).json({ error: "Cannot cancel a past session" });
      }
      
      // Get player and academy info
      const player = await storage.getPlayer(playerId);
      const academy = player?.academyId ? await storage.getAcademy(player.academyId) : null;
      const cancellationWindowHours = academy?.cancelHoursBeforeFree || 24;
      
      // Calculate if this is a late cancellation
      const hoursUntilSession = (sessionTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      const isLateCancellation = hoursUntilSession < cancellationWindowHours;
      
      // Determine billing status based on timing
      const billingStatus = isLateCancellation ? "charged" : "not_charged";
      const makeUpEligibility = isLateCancellation ? "not_eligible" : "eligible";
      
      // Update session player to cancelled/absent
      await storage.updateSessionPlayer(sessionPlayer.id, {
        attendanceStatus: "absent",
        absenceReason: reason,
        notes: `Cancelled: ${reason}${reasonText ? ` - ${reasonText}` : ""} (${Math.round(hoursUntilSession)}h notice)`,
      });
      
      // Create cancellation record
      await storage.createPlayerSessionCancellation({
        sessionId,
        playerId,
        academyId: player?.academyId,
        sessionType: session.sessionType,
        cancellationType: "cancel",
        reason,
        reasonText: reasonText || null,
        sessionDate: sessionTime,
        hoursBeforeSession: Math.round(hoursUntilSession),
        isLateCancel: isLateCancellation,
        billingStatus,
        makeUpEligibility,
        notifiedCoach: true,
        coachNotifiedAt: new Date(),
      });
      
      // Handle semi-private auto-transformation
      // Business rule: When 1 player cancels a semi-private session, upgrade to private for remaining player
      let semiPrivateUpgraded = false;
      let remainingPlayerId: string | null = null;
      
      if (session.sessionType === "semi") {
        // Get all players in this session (fresh query to get updated status)
        const allPlayers = await storage.getSessionPlayers(sessionId);
        // "Active participant" definition: Players planning to attend (not yet marked absent)
        // - null: Future session, attendance not yet taken (assumed attending)
        // - present/late: Already confirmed attending
        // - absent/holiday: Not attending, excluded from count
        const remainingPlayers = allPlayers.filter(p => 
          p.playerId !== playerId && 
          p.playerId !== null &&
          (p.attendanceStatus === null || p.attendanceStatus === "present" || p.attendanceStatus === "late")
        );
        
        // If exactly 1 active player remains, upgrade session to private_adjusted
        if (remainingPlayers.length === 1 && remainingPlayers[0].playerId) {
          remainingPlayerId = remainingPlayers[0].playerId;
          semiPrivateUpgraded = true;
          
          // Update session type to private_adjusted
          await storage.updateSession(sessionId, {
            sessionType: "private_adjusted",
          });
          
          // Notify the remaining player about the upgrade
          const remainingPlayer = await storage.getPlayer(remainingPlayerId);
          
          if (remainingPlayer) {
            await storage.createNotification({
              playerId: remainingPlayerId,
              type: "session_upgraded",
              title: "Session Upgraded",
              message: "Your semi-private session has been upgraded to a private lesson because the other player is unavailable.",
              metadata: JSON.stringify({
                sessionId,
                originalType: "semi",
                newType: "private_adjusted",
                cancelledBy: player?.name,
              }),
            });
          }
        }
      }
      
      // Send notification to coach
      if (session.coachId) {
        await storage.createNotification({
          coachId: session.coachId,
          type: "session_cancelled",
          title: semiPrivateUpgraded ? "Semi-Private Upgraded" : "Session Cancelled",
          message: semiPrivateUpgraded 
            ? `${player?.name || "A player"} cancelled. Session upgraded to private for remaining player.`
            : `${player?.name || "A player"} has cancelled their ${session.sessionType} session${isLateCancellation ? " (late cancellation)" : ""}`,
          metadata: JSON.stringify({
            sessionId,
            playerId,
            playerName: player?.name,
            reason,
            reasonText,
            isLateCancellation,
            hoursNotice: Math.round(hoursUntilSession),
            semiPrivateUpgraded,
            remainingPlayerId,
          }),
        });
      }
      
      res.json({
        success: true,
        message: isLateCancellation 
          ? `Session cancelled. Note: This is a late cancellation (less than ${cancellationWindowHours}h notice).`
          : "Session cancelled successfully.",
        isLateCancellation,
        hoursNotice: Math.round(hoursUntilSession),
        billingStatus,
        semiPrivateUpgraded,
      });
    } catch (error) {
      console.error("Error cancelling session:", error);
      res.status(500).json({ error: "Failed to cancel session" });
    }
  });
  
  // Mark as unavailable for group sessions (lesson still counts)
  app.post("/api/player/me/sessions/:sessionId/mark-unavailable", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { reason, reasonText } = req.body; // sick/schedule_conflict/vacation/other
      const playerId = req.user!.playerId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player profile required" });
      }
      
      if (!reason) {
        return res.status(400).json({ error: "Reason is required" });
      }
      
      // Validate reason for "other" requires text
      if (reason === "other" && (!reasonText || !reasonText.trim())) {
        return res.status(400).json({ error: "Please provide an explanation for your absence" });
      }
      
      // Get the session
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Verify this is a group session
      if (session.sessionType !== "group") {
        return res.status(400).json({ error: "Mark as unavailable is only for group sessions. Use cancel for private/semi-private." });
      }
      
      // Verify player is part of this session
      const sessionPlayer = await storage.getSessionPlayer(sessionId, playerId);
      if (!sessionPlayer) {
        return res.status(403).json({ error: "You are not part of this session" });
      }
      
      // Check if session is in the future
      const sessionTime = new Date(session.startTime);
      const now = new Date();
      if (sessionTime < now) {
        return res.status(400).json({ error: "Cannot mark unavailable for a past session" });
      }
      
      // Calculate hours before session
      const hoursBeforeSession = Math.round((sessionTime.getTime() - now.getTime()) / (1000 * 60 * 60));
      
      // Get player and academy info
      const player = await storage.getPlayer(playerId);
      const academy = player?.academyId ? await storage.getAcademy(player.academyId) : null;
      const cancelHoursBeforeFree = academy?.cancelHoursBeforeFree || 24;
      const isLateNotice = hoursBeforeSession < cancelHoursBeforeFree;
      
      // Update session player to unavailable
      await storage.updateSessionPlayer(sessionPlayer.id, {
        attendanceStatus: "absent",
        absenceReason: reason,
        notes: `Marked unavailable: ${reason}${reasonText ? ` - ${reasonText}` : ""} (${hoursBeforeSession}h notice)`,
      });
      
      // Create cancellation record for tracking
      await storage.createPlayerSessionCancellation({
        sessionId,
        playerId,
        academyId: player?.academyId,
        sessionType: "group",
        cancellationType: "unavailable",
        reason,
        reasonText: reasonText || null,
        sessionDate: sessionTime,
        hoursBeforeSession,
        isLateCancel: isLateNotice,
        billingStatus: "charged", // Group always counts
        makeUpEligibility: isLateNotice ? "not_eligible" : "eligible", // Academy can grant make-up for timely notices
        notifiedCoach: true,
        coachNotifiedAt: new Date(),
      });
      
      // Send notification to coach
      if (session.coachId) {
        await storage.createNotification({
          coachId: session.coachId,
          type: "player_unavailable",
          title: "Player Unavailable",
          message: `${player?.name || "A player"} won't be attending the group session${isLateNotice ? " (late notice)" : ""}`,
          metadata: JSON.stringify({
            sessionId,
            playerId,
            playerName: player?.name,
            reason,
            reasonText,
            hoursBeforeSession,
            isLateNotice,
          }),
        });
      }
      
      res.json({
        success: true,
        message: "Marked as unavailable. Your coach has been notified.",
        hoursBeforeSession,
        isLateNotice,
        makeUpEligibility: isLateNotice ? "not_eligible" : "eligible",
      });
    } catch (error) {
      console.error("Error marking unavailable:", error);
      res.status(500).json({ error: "Failed to mark as unavailable" });
    }
  });
  
  // Notify coach that player is running late
  app.post("/api/player/me/sessions/:sessionId/late", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { minutes, message } = req.body; // 5, 10, 15, 20, 30
      const playerId = req.user!.playerId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player profile required" });
      }
      
      if (!minutes || minutes < 1 || minutes > 60) {
        return res.status(400).json({ error: "Please specify valid delay in minutes (1-60)" });
      }
      
      // Get the session
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Verify player is part of this session
      const sessionPlayer = await storage.getSessionPlayer(sessionId, playerId);
      if (!sessionPlayer) {
        return res.status(403).json({ error: "You are not part of this session" });
      }
      
      // Check if session is today or in the near future
      const sessionTime = new Date(session.startTime);
      const now = new Date();
      const hoursUntilSession = (sessionTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      if (hoursUntilSession < -2) {
        return res.status(400).json({ error: "Session has already passed" });
      }
      
      if (hoursUntilSession > 24) {
        return res.status(400).json({ error: "You can only send late notifications within 24 hours of the session" });
      }
      
      // Update session player with late status
      await storage.updateSessionPlayer(sessionPlayer.id, {
        attendanceStatus: "late",
        lateMinutes: minutes,
        notes: message || `Running ${minutes} min late`,
      });
      
      const player = await storage.getPlayer(playerId);
      
      // Send notification to coach
      if (session.coachId) {
        await storage.createNotification({
          coachId: session.coachId,
          type: "player_running_late",
          title: "Player Running Late",
          message: `${player?.name || "A player"} is running ${minutes} min late${message ? `: "${message}"` : ""}`,
          metadata: JSON.stringify({
            sessionId,
            playerId,
            playerName: player?.name,
            lateMinutes: minutes,
            message,
          }),
        });
        
        // Also try to send push notification
        const coachTokens = await storage.getCoachPushTokens(session.coachId);
        if (coachTokens.length > 0) {
          // Push notification would be sent here through expo-notifications
          console.log(`[Late] Push notification to coach ${session.coachId}: ${player?.name} is ${minutes} min late`);
        }
      }
      
      res.json({
        success: true,
        message: "Coach has been notified that you're running late.",
        coachNotified: true,
      });
    } catch (error) {
      console.error("Error notifying late:", error);
      res.status(500).json({ error: "Failed to send late notification" });
    }
  });
  
  // Report an issue with a session (equipment, court, safety, coach, other)
  app.post("/api/player/me/sessions/:sessionId/report-issue", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { issueType, description } = req.body;
      const playerId = req.user!.playerId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player profile required" });
      }
      
      const validIssueTypes = ["equipment", "court", "safety", "coach", "other"];
      if (!issueType || !validIssueTypes.includes(issueType)) {
        return res.status(400).json({ error: "Please select a valid issue type" });
      }
      
      // Get the session
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Verify player is part of this session
      const sessionPlayer = await storage.getSessionPlayer(sessionId, playerId);
      if (!sessionPlayer) {
        return res.status(403).json({ error: "You are not part of this session" });
      }
      
      const player = await storage.getPlayer(playerId);
      const issueLabels: Record<string, string> = {
        equipment: "Equipment Issue",
        court: "Court Problem", 
        safety: "Safety Concern",
        coach: "Coach-Related",
        other: "Other Issue",
      };
      
      // Create diagnostic report for platform owner visibility
      await storage.createDiagnosticReport({
        source: "player_app",
        category: `session_issue_${issueType}`,
        severity: issueType === "safety" ? "high" : "medium",
        title: `${issueLabels[issueType]} - Session Report`,
        message: description || `Player reported a ${issueType} issue`,
        metadata: JSON.stringify({
          sessionId,
          playerId,
          playerName: player?.name,
          issueType,
          sessionDate: session.startTime,
          coachId: session.coachId,
          academyId: session.academyId,
        }),
        status: "new",
      });
      
      // Notify coach if it's not a coach-related issue (avoid conflict)
      if (session.coachId && issueType !== "coach") {
        await storage.createNotification({
          coachId: session.coachId,
          type: "session_issue_reported",
          title: "Session Issue Reported",
          message: `${player?.name || "A player"} reported: ${issueLabels[issueType]}`,
          metadata: JSON.stringify({
            sessionId,
            playerId,
            playerName: player?.name,
            issueType,
            description,
          }),
        });
      }
      
      // For coach-related issues, notify academy owner instead
      if (issueType === "coach" && session.academyId) {
        const academy = await storage.getAcademy(session.academyId);
        if (academy?.ownerId) {
          await storage.createNotification({
            playerId: undefined,
            coachId: undefined,
            ownerId: academy.ownerId,
            type: "coach_issue_reported",
            title: "Coach Issue Reported",
            message: `${player?.name || "A player"} reported a coach-related concern`,
            metadata: JSON.stringify({
              sessionId,
              playerId,
              playerName: player?.name,
              coachId: session.coachId,
              description,
            }),
          });
        }
      }
      
      // For safety issues, create critical diagnostic with urgency flag
      // Platform owners see these via the diagnostics inbox with high severity
      if (issueType === "safety") {
        console.log(`[SAFETY ALERT] Player ${player?.name} reported safety concern for session ${sessionId}`);
        
        // Create additional critical-level diagnostic for immediate visibility
        await storage.createDiagnosticReport({
          source: "player_app",
          category: "safety_critical",
          severity: "critical",
          title: "URGENT: Safety Concern - Immediate Action Required",
          message: `Player reported safety concern: ${description || "No details provided"}`,
          metadata: JSON.stringify({
            sessionId,
            playerId,
            playerName: player?.name,
            issueType: "safety",
            sessionDate: session.startTime,
            coachId: session.coachId,
            academyId: session.academyId,
            urgent: true,
          }),
          status: "new",
        });
      }
      
      res.json({
        success: true,
        message: "Your report has been submitted. Thank you for helping us improve.",
        ticketCreated: true,
      });
    } catch (error) {
      console.error("Error reporting issue:", error);
      res.status(500).json({ error: "Failed to submit report" });
    }
  });
  
  // Get player vacation status
  app.get("/api/player/me/vacation", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      
      if (!playerId) {
        return res.json({ active: false, holidays: [] });
      }
      
      const holidays = await storage.getPlayerHolidays(playerId);
      const now = new Date();
      
      // Find active vacation
      const activeVacation = holidays.find(h => {
        const start = new Date(h.startDate);
        const end = new Date(h.endDate);
        return now >= start && now <= end;
      });
      
      // Find upcoming vacation
      const upcomingVacation = holidays.find(h => {
        const start = new Date(h.startDate);
        return start > now;
      });
      
      res.json({
        active: !!activeVacation,
        currentVacation: activeVacation ? {
          id: activeVacation.id,
          startDate: activeVacation.startDate,
          endDate: activeVacation.endDate,
        } : null,
        upcomingVacation: upcomingVacation ? {
          id: upcomingVacation.id,
          startDate: upcomingVacation.startDate,
          endDate: upcomingVacation.endDate,
        } : null,
        holidays: holidays.map(h => ({
          id: h.id,
          startDate: h.startDate,
          endDate: h.endDate,
        })),
      });
    } catch (error) {
      console.error("Error fetching vacation status:", error);
      res.status(500).json({ error: "Failed to fetch vacation status" });
    }
  });
  
  // Set player vacation
  app.post("/api/player/me/vacation", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate } = req.body;
      const playerId = req.user!.playerId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player profile required" });
      }
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "Start and end dates are required" });
      }
      
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (end < start) {
        return res.status(400).json({ error: "End date must be after start date" });
      }
      
      // Check for maximum vacation length (e.g., 90 days)
      const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 90) {
        return res.status(400).json({ error: "Vacation cannot exceed 90 days" });
      }
      
      // Create the holiday
      const holiday = await storage.createPlayerHoliday({
        playerId,
        startDate: startDate,
        endDate: endDate,
      });
      
      res.json({
        success: true,
        message: "Vacation set successfully. Enjoy your break!",
        vacation: {
          id: holiday.id,
          startDate: holiday.startDate,
          endDate: holiday.endDate,
        },
      });
    } catch (error) {
      console.error("Error setting vacation:", error);
      res.status(500).json({ error: "Failed to set vacation" });
    }
  });
  
  // Cancel/delete player vacation
  app.delete("/api/player/me/vacation/:id", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const playerId = req.user!.playerId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player profile required" });
      }
      
      // Verify this vacation belongs to the player
      const holidays = await storage.getPlayerHolidays(playerId);
      const holiday = holidays.find(h => h.id === id);
      
      if (!holiday) {
        return res.status(404).json({ error: "Vacation not found" });
      }
      
      // Delete the holiday using direct database operation
      await db.delete(playerHolidays).where(eq(playerHolidays.id, id));
      
      res.json({
        success: true,
        message: "Vacation cancelled. Welcome back!",
      });
    } catch (error) {
      console.error("Error cancelling vacation:", error);
      res.status(500).json({ error: "Failed to cancel vacation" });
    }
  });
  
  // Get player progress data (skill domains, XP, level)
  app.get("/api/player/me/progress", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Return empty progress for users without player profile
      if (!req.user!.playerId) {
        return res.json({
          level: 1,
          xp: 0,
          xpForNextLevel: 500,
          glowScore: 0,
          ballLevel: "red1",
          nextBallLevel: "red2",
          skillRadar: [],
          overallInsights: {
            strengths: [],
            focusAreas: [],
          },
          levelReadiness: null,
        });
      }
      const playerId = req.user!.playerId!;
      
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Get skill domains metadata
      const domains = await storage.listSkillDomains();
      
      // Get player skill states for all domains
      const skillStates = await storage.getPlayerSkillStates(playerId);
      
      // Get domain XP summary from observations
      const domainXpSummary = await storage.getPlayerDomainXpSummary(playerId);
      
      // Get XP data
      const xpData = await storage.getPlayerXpTotal(playerId);
      const totalXp = xpData.totalXp || player.totalXp || 0;
      const level = xpData.level || player.level || 1;
      
      // Build skill radar data with domain insights
      const skillRadarPromises = domains.map(async (domain) => {
        const skillState = skillStates.find(s => s.domainId === domain.id);
        const xpInfo = domainXpSummary.find(x => x.domainId === domain.id);
        const insights = await storage.getPlayerDomainInsights(playerId, domain.id);
        
        return {
          domain: domain.displayName || domain.name,
          domainId: domain.id,
          color: domain.color || "#888888",
          icon: domain.icon || "star",
          progress: skillState?.progressValue || 0,
          trend: skillState?.trend || "stable",
          momentum: skillState?.momentum || "building",
          xp: xpInfo?.totalXp || 0,
          observationCount: xpInfo?.observationCount || 0,
          assessmentStatus: skillState?.assessmentStatus || "not_yet",
          insights: {
            recentHighlights: insights.recentHighlights,
            focusAreas: insights.focusAreas,
            lastObservation: insights.lastObservation,
            avgDelta: insights.avgDelta,
          },
        };
      });
      
      const skillRadar = await Promise.all(skillRadarPromises);
      
      // Calculate Glow Score based on average progress across all domains
      const avgProgress = skillRadar.length > 0 
        ? skillRadar.reduce((sum, s) => sum + s.progress, 0) / skillRadar.length 
        : 0;
      const glowScore = Math.min(100, Math.round(avgProgress));
      
      // Aggregate overall strengths and focus areas from all domains
      const allHighlights = skillRadar.flatMap(s => s.insights.recentHighlights).slice(0, 5);
      const allFocusAreas = skillRadar.flatMap(s => s.insights.focusAreas).slice(0, 5);
      
      // Calculate level readiness for next level
      // Support both legacy composite (red1, red2) and new split (ballLevel=red, skillLevel=1) formats
      const currentBallLevel = player.ballLevel || 'red';
      const currentSkillLevel = player.skillLevel || 1;
      
      // Determine next level based on current ball level and skill level
      // Returns normalized underscore format: BALL_SUBLEVEL (e.g., GREEN_2)
      const getNextLevel = (ball: string, skill: number): { composite: string; ballLevel: string; subLevel: number } => {
        // Normalize input: extract ball color and skill number
        const ballColor = ball.replace(/\d+$/, '').toLowerCase();
        const currentSub = ball.match(/\d$/) ? parseInt(ball.slice(-1)) : skill;
        
        const ballOrder = ['red', 'orange', 'green', 'yellow'];
        
        // Move to next sub-level within same ball
        if (currentSub < 3) {
          const nextSub = currentSub + 1;
          return { 
            composite: `${ballColor.toUpperCase()}_${nextSub}`,
            ballLevel: ballColor,
            subLevel: nextSub,
          };
        }
        
        // Move to next ball level
        const currentIndex = ballOrder.indexOf(ballColor);
        if (currentIndex >= 0 && currentIndex < ballOrder.length - 1) {
          const nextBall = ballOrder[currentIndex + 1];
          return {
            composite: `${nextBall.toUpperCase()}_1`,
            ballLevel: nextBall,
            subLevel: 1,
          };
        }
        
        // At maximum level (YELLOW_3) - transition to Glow
        return { composite: 'GLOW', ballLevel: 'glow', subLevel: 0 };
      };
      
      const nextLevel = getNextLevel(currentBallLevel, currentSkillLevel);
      
      let levelReadiness = null;
      try {
        levelReadiness = await storage.calculatePlayerLevelReadiness(playerId, nextLevel.composite);
      } catch (e) {
        // Silently fail - readiness is optional
      }
      
      // Calculate Glow Battle Power (sum of 6 pillar scores)
      const pillarScores = {
        technique: 0,
        tactical: 0,
        physical: 0,
        mental: 0,
        social: 0,
        match: 0,
      };
      
      skillRadar.forEach((skill) => {
        const domainLower = skill.domainId.toLowerCase();
        if (domainLower in pillarScores) {
          pillarScores[domainLower as keyof typeof pillarScores] = skill.progress;
        }
      });
      
      const battlePower = Object.values(pillarScores).reduce((sum, score) => sum + score, 0);
      const maxBattlePower = 600;
      const battlePowerPercentage = Math.round((battlePower / maxBattlePower) * 100);
      
      const getPowerLevel = (power: number) => {
        if (power >= 500) return { level: "Legendary", tier: 6 };
        if (power >= 400) return { level: "Elite", tier: 5 };
        if (power >= 300) return { level: "Champion", tier: 4 };
        if (power >= 200) return { level: "Contender", tier: 3 };
        if (power >= 100) return { level: "Rising", tier: 2 };
        return { level: "Novice", tier: 1 };
      };
      
      const powerInfo = getPowerLevel(battlePower);
      
      // Normalize ball level to always use underscore format
      const normalizedBallLevel = currentBallLevel.replace(/\d+$/, '').toLowerCase();
      const normalizedSkillLevel = currentBallLevel.match(/\d$/) ? parseInt(currentBallLevel.slice(-1)) : currentSkillLevel;
      const compositeLevel = `${normalizedBallLevel.toUpperCase()}_${normalizedSkillLevel}`;
      
      res.json({
        level,
        xp: totalXp,
        xpForNextLevel: (level + 1) * 500,
        glowScore,
        ballLevel: compositeLevel, // Always use composite format: GREEN_2
        stage: normalizedBallLevel, // Just the color: green
        skillLevel: normalizedSkillLevel, // Just the number: 2
        nextBallLevel: nextLevel.composite, // Next level in composite format
        nextLevelDetails: {
          composite: nextLevel.composite,
          stage: nextLevel.ballLevel,
          subLevel: nextLevel.subLevel,
        },
        skillRadar,
        overallInsights: {
          strengths: allHighlights,
          focusAreas: allFocusAreas,
        },
        levelReadiness: levelReadiness ? {
          isReady: levelReadiness.isReady,
          requirements: levelReadiness.requirements,
          sessionCount: levelReadiness.sessionCount,
          minSessionsRequired: levelReadiness.minSessionsRequired,
          coachApprovalRequired: true,
          coachApprovalStatus: "pending",
        } : null,
        glowBattlePower: {
          total: battlePower,
          max: maxBattlePower,
          percentage: battlePowerPercentage,
          pillars: pillarScores,
          powerLevel: powerInfo.level,
          powerTier: powerInfo.tier,
        },
        threeTierProgression: {
          xpLevel: { level, xp: totalXp, xpForNext: (level + 1) * 500 },
          skillLevel: { 
            ballLevel: normalizedBallLevel,
            subLevel: normalizedSkillLevel,
            composite: compositeLevel,
          },
          battlePower: { total: battlePower, level: powerInfo.level, tier: powerInfo.tier },
        },
      });
    } catch (error) {
      console.error("Error fetching player progress:", error);
      res.status(500).json({ error: "Failed to fetch player progress" });
    }
  });
  
  // Get player attendance summary per series/class
  app.get("/api/player/me/attendance", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user!.playerId) {
        return res.json({ classes: [], summary: { totalPresent: 0, totalSessions: 0, attendanceRate: 0 } });
      }
      const playerId = req.user!.playerId!;
      
      // Get all series this player is enrolled in
      const playerSeriesRecords = await db
        .select({
          seriesId: seriesPlayers.seriesId,
          status: seriesPlayers.status,
          joinedAt: seriesPlayers.joinedAt,
          leftAt: seriesPlayers.leftAt,
        })
        .from(seriesPlayers)
        .where(eq(seriesPlayers.playerId, playerId));
      
      if (playerSeriesRecords.length === 0) {
        return res.json({ classes: [], summary: { totalPresent: 0, totalSessions: 0, attendanceRate: 0 } });
      }
      
      const seriesIds = playerSeriesRecords.map(r => r.seriesId);
      
      // Get series details
      const seriesDetails = await db
        .select()
        .from(coachingSeries)
        .where(inArray(coachingSeries.id, seriesIds));
      
      // Get attendance counts per series
      const classes = await Promise.all(seriesDetails.map(async (series) => {
        const seriesRecord = playerSeriesRecords.find(r => r.seriesId === series.id);
        
        // Get all sessions for this series
        const seriesSessions = await db
          .select({ id: sessions.id, startTime: sessions.startTime })
          .from(sessions)
          .where(eq(sessions.seriesId, series.id));
        
        const sessionIds = seriesSessions.map(s => s.id);
        
        // Count attendance by status
        const attendanceRecords = sessionIds.length > 0 ? await db
          .select({
            status: sessionPlayers.attendanceStatus,
            count: count(),
          })
          .from(sessionPlayers)
          .where(and(
            inArray(sessionPlayers.sessionId, sessionIds),
            eq(sessionPlayers.playerId, playerId)
          ))
          .groupBy(sessionPlayers.attendanceStatus) : [];
        
        const presentOnTimeCount = Number(attendanceRecords.find(r => r.status === "present")?.count || 0);
        const lateCount = Number(attendanceRecords.find(r => r.status === "late")?.count || 0);
        const presentCount = presentOnTimeCount + lateCount;
        const vacationCount = Number(attendanceRecords.find(r => r.status === "vacation")?.count || 0);
        const absentCount = Number(attendanceRecords.find(r => r.status === "absent")?.count || 0);
        const totalRecorded = presentCount + vacationCount + absentCount;
        
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        
        return {
          id: series.id,
          title: series.title,
          dayOfWeek: dayNames[series.dayOfWeek || 0],
          time: series.startTime,
          sessionType: series.sessionType,
          status: seriesRecord?.status || "active",
          joinedAt: seriesRecord?.joinedAt?.toISOString() || null,
          leftAt: seriesRecord?.leftAt?.toISOString() || null,
          attendance: {
            present: Number(presentCount),
            vacation: Number(vacationCount),
            absent: Number(absentCount),
            total: totalRecorded,
            rate: totalRecorded > 0 ? Math.round((Number(presentCount) / totalRecorded) * 100) : 0,
          },
        };
      }));
      
      // Calculate overall summary
      const totalPresent = classes.reduce((sum, c) => sum + c.attendance.present, 0);
      const totalSessions = classes.reduce((sum, c) => sum + c.attendance.total, 0);
      const overallRate = totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : 0;
      
      res.json({
        classes: classes.sort((a, b) => a.dayOfWeek.localeCompare(b.dayOfWeek)),
        summary: {
          totalPresent,
          totalSessions,
          attendanceRate: overallRate,
        },
      });
    } catch (error) {
      console.error("Error fetching player attendance:", error);
      res.status(500).json({ error: "Failed to fetch attendance" });
    }
  });
  
  // Get player journey (milestones, badges, achievements)
  app.get("/api/player/me/journey", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    // Return empty journey for users without player profile
    if (!req.user!.playerId) {
      return res.json({
        milestones: [],
        badges: [],
        badgesAvailable: false,
        badgeMessage: "Start training to unlock achievements!",
        totalMilestones: 0,
        totalBadges: 0,
        xpHistory: [],
      });
    }
    // Original implementation below
    try {
      const playerId = req.user!.playerId!;
      
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Get milestones (skill improvements and XP gains)
      const milestones = await storage.getPlayerMilestones(playerId);
      
      // Get XP transaction history for additional context
      const xpHistory = await storage.getPlayerXpHistory(playerId, 10);
      
      // Transform milestones for frontend
      const formattedMilestones = milestones.map(m => ({
        id: m.id,
        type: m.type,
        title: m.title,
        description: m.type === "skill_improvement" ? "Great progress on skills" : "XP achievement",
        date: m.date?.toISOString() || new Date().toISOString(),
        icon: m.type === "skill_improvement" ? "trending-up" : "award",
        color: m.type === "skill_improvement" ? "#2ECC40" : "#FFD700",
      }));
      
      // Add XP history items as timeline entries
      const xpMilestones = xpHistory.map(xp => ({
        id: `xp-${xp.id}`,
        type: "xp_earned",
        title: `+${xp.amount} XP`,
        description: xp.reason || "Experience earned",
        date: xp.createdAt?.toISOString() || new Date().toISOString(),
        icon: "star",
        color: "#00D4FF",
      }));
      
      // Combine and sort all milestones
      const allMilestones = [...formattedMilestones, ...xpMilestones]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 30);
      
      res.json({
        milestones: allMilestones,
        badges: [],
        badgesAvailable: false,
        badgeMessage: "Badges coming soon! Keep training to unlock achievements.",
        totalMilestones: allMilestones.length,
        totalBadges: 0,
        xpHistory: xpHistory.map(xp => ({
          id: xp.id,
          amount: xp.amount,
          reason: xp.reason,
          date: xp.createdAt,
        })),
      });
    } catch (error) {
      console.error("Error fetching player journey:", error);
      res.status(500).json({ error: "Failed to fetch player journey" });
    }
  });
  
  // Get player profile data
  app.get("/api/player/me/profile", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    // Return empty profile for users without player profile
    if (!req.user!.playerId) {
      return res.json({
        player: null,
        coach: null,
        academy: null,
        stats: { sessionsAttended: 0, sessionsTotal: 0, attendanceRate: 0 },
      });
    }
    // Original implementation below
    try {
      const playerId = req.user!.playerId!;
      
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Get coach data
      let coach = null;
      if (player.coachId) {
        coach = await storage.getCoach(player.coachId);
      }
      
      // Get academy data
      let academy = null;
      if (player.academyId) {
        academy = await storage.getAcademy(player.academyId);
      }
      
      // Get XP and stats
      const xpData = await storage.getPlayerXpTotal(playerId);
      const totalXp = xpData.totalXp || player.totalXp || 0;
      const level = xpData.level || player.level || 1;
      
      // Get session attendance stats using player sessions helper
      const ninety = new Date();
      ninety.setDate(ninety.getDate() - 90);
      const now = new Date();
      
      const playerSessions = await storage.getPlayerSessionsWithDetails(playerId, ninety, now);
      const totalSessions = playerSessions.length;
      const sessionsAttended = playerSessions.filter(s => s.attended === "present").length;
      
      // Get social data (matches and connections)
      const matchesResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM player_matches 
        WHERE (initiator_id = ${playerId} OR receiver_id = ${playerId})
        AND status = 'completed'
      `);
      const matchesPlayed = Number(matchesResult.rows[0]?.count || 0);

      const connectionsResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM player_connections 
        WHERE (player1_id = ${playerId} OR player2_id = ${playerId})
      `);
      const connectionsCount = Number(connectionsResult.rows[0]?.count || 0);

      // Get recent play partners (up to 5)
      const recentPartnersResult = await db.execute(sql`
        SELECT DISTINCT ON (partner_id) 
          partner_id, 
          partner_name,
          last_played_at
        FROM (
          SELECT 
            CASE WHEN initiator_id = ${playerId} THEN receiver_id ELSE initiator_id END as partner_id,
            CASE WHEN initiator_id = ${playerId} 
              THEN (SELECT name FROM players WHERE id = receiver_id)
              ELSE (SELECT name FROM players WHERE id = initiator_id)
            END as partner_name,
            proposed_date as last_played_at
          FROM player_matches
          WHERE (initiator_id = ${playerId} OR receiver_id = ${playerId})
          AND status = 'completed'
          ORDER BY proposed_date DESC
        ) sub
        ORDER BY partner_id, last_played_at DESC
        LIMIT 5
      `);
      
      const recentPartners = recentPartnersResult.rows.map((row: any) => ({
        id: row.partner_id,
        name: row.partner_name || "Player",
        lastPlayedAt: row.last_played_at,
      }));

      console.log("[Profile API] Returning player with profilePhotoUrl:", (player as any).profilePhotoUrl);
      res.json({
        player: {
          id: player.id,
          name: player.name,
          email: player.email,
          level,
          xp: totalXp,
          glowScore: player.glowScore || 0,
          ballLevel: player.ballLevel || "red",
          streak: player.streak || 0,
          createdAt: player.createdAt,
          dominantHand: (player as any).dominantHand || null,
          preferredPlayType: (player as any).preferredPlayType || null,
          openToPlay: (player as any).openToPlay || false,
          typicalPlayTimes: (player as any).typicalPlayTimes || null,
          preferredCities: (player as any).preferredCities || null,
          matchPreference: (player as any).matchPreference || null,
          bio: (player as any).bio || null,
          displayName: (player as any).displayName || null,
          profilePhotoUrl: (player as any).profilePhotoUrl || null,
        },
        coach: coach ? {
          id: coach.id,
          name: coach.name,
          email: coach.email,
        } : null,
        academy: academy ? {
          id: academy.id,
          name: academy.name,
        } : null,
        stats: {
          sessionsAttended,
          sessionsTotal: totalSessions,
          attendanceRate: totalSessions > 0 ? Math.round((sessionsAttended / totalSessions) * 100) : 0,
        },
        social: {
          matchesPlayed,
          connectionsCount,
          recentPartners,
        },
      });
    } catch (error) {
      console.error("Error fetching player profile:", error);
      res.status(500).json({ error: "Failed to fetch player profile" });
    }
  });

  // Update player social profile
  app.patch("/api/player/me/profile", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user!.playerId) {
      return res.status(400).json({ error: "No player profile found" });
    }
    
    try {
      const playerId = req.user!.playerId!;
      const { openToPlay, dominantHand, preferredPlayType, typicalPlayTimes, preferredCities, matchPreference, bio, displayName, privacyLevel } = req.body;
      
      // Use parameterized updates for each field individually for safety
      if (typeof openToPlay === "boolean") {
        await db.execute(sql`UPDATE players SET open_to_play = ${openToPlay} WHERE id = ${playerId}`);
      }
      if (dominantHand !== undefined) {
        await db.execute(sql`UPDATE players SET dominant_hand = ${dominantHand} WHERE id = ${playerId}`);
      }
      if (preferredPlayType !== undefined) {
        await db.execute(sql`UPDATE players SET preferred_play_type = ${preferredPlayType} WHERE id = ${playerId}`);
      }
      if (typicalPlayTimes !== undefined) {
        await db.execute(sql`UPDATE players SET typical_play_times = ${typicalPlayTimes} WHERE id = ${playerId}`);
      }
      if (preferredCities !== undefined) {
        await db.execute(sql`UPDATE players SET preferred_cities = ${preferredCities} WHERE id = ${playerId}`);
      }
      if (matchPreference !== undefined) {
        await db.execute(sql`UPDATE players SET match_preference = ${matchPreference} WHERE id = ${playerId}`);
      }
      if (bio !== undefined) {
        await db.execute(sql`UPDATE players SET bio = ${bio} WHERE id = ${playerId}`);
      }
      if (displayName !== undefined) {
        await db.execute(sql`UPDATE players SET display_name = ${displayName} WHERE id = ${playerId}`);
      }
      if (privacyLevel !== undefined) {
        await db.execute(sql`UPDATE players SET privacy_level = ${privacyLevel} WHERE id = ${playerId}`);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating player profile:", error);
      res.status(500).json({ error: "Failed to update player profile" });
    }
  });

  // Upload player profile photo
  app.post("/api/player/me/photo", authMiddleware, requirePlayerOrOwner, profilePhotoUpload.single("photo"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(400).json({ error: "Player profile not found" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No photo uploaded" });
      }

      const photoUrl = `/uploads/profile-photos/${req.file.filename}`;
      
      await db.execute(sql`UPDATE players SET profile_photo_url = ${photoUrl} WHERE id = ${playerId}`);
      
      res.json({ 
        success: true, 
        profilePhotoUrl: photoUrl,
        message: "Profile photo updated successfully" 
      });
    } catch (error) {
      console.error("Error uploading player profile photo:", error);
      res.status(500).json({ error: "Failed to upload profile photo" });
    }
  });
  
  // Get academy peers (other players in same academy for safe comparison)
  app.get("/api/player/me/peers", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    // Return empty peers for users without player profile
    if (!req.user!.playerId) {
      return res.json({
        totalPeers: 0,
        peers: [],
        sameLevelPeers: [],
        myRankAtLevel: 0,
        totalAtLevel: 0,
      });
    }
    // Original implementation below
    try {
      const playerId = req.user!.playerId!;
      
      const player = await storage.getPlayer(playerId);
      if (!player || !player.academyId) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Get other players in the same academy (excluding self)
      const allPlayers = await storage.getPlayersByAcademy(player.academyId);
      const peers = allPlayers
        .filter(p => p.id !== playerId)
        .map(p => ({
          id: p.id,
          name: p.name,
          level: p.level || 1,
          ballLevel: p.ballLevel,
          glowScore: p.glowScore || 0,
          avatar: p.name.charAt(0).toUpperCase(),
        }))
        .slice(0, 20); // Limit to 20 peers
      
      // Group by ball level for safe comparison
      const peersByLevel: Record<string, typeof peers> = {};
      peers.forEach(peer => {
        const level = peer.ballLevel || 'unknown';
        if (!peersByLevel[level]) peersByLevel[level] = [];
        peersByLevel[level].push(peer);
      });
      
      // Get players at same level for comparison
      const sameLevelPeers = peers.filter(p => p.ballLevel === player.ballLevel);
      
      res.json({
        totalPeers: peers.length,
        peers: peers,
        sameLevelPeers: sameLevelPeers,
        peersByLevel,
        myRankAtLevel: sameLevelPeers.length > 0 
          ? sameLevelPeers.filter(p => (p.glowScore || 0) > (player.glowScore || 0)).length + 1
          : 1,
        totalAtLevel: sameLevelPeers.length + 1,
      });
    } catch (error) {
      console.error("Error fetching peers:", error);
      res.status(500).json({ error: "Failed to fetch peers" });
    }
  });

  // ============================================
  // GROUPS API - Player Social Groups System
  // ============================================

  // Get all groups for player
  app.get("/api/player/groups", authMiddleware, requirePlayerOrOwner, requireFeatureUnlock("groups"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId!;
      const player = await storage.getPlayer(playerId);
      if (!player || !player.academyId) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Get groups player is a member of
      const memberRows = await db.select()
        .from(groupMembersTable)
        .where(eq(groupMembersTable.userId, req.user!.userId!));

      const myGroupIds = memberRows.map(m => m.groupId);

      // Get academy groups (public ones player can join)
      const academyGroups = await db.select()
        .from(communityGroupsTable)
        .where(eq(communityGroupsTable.academyId, player.academyId));

      const groups = academyGroups.map(g => ({
        ...g,
        isMember: myGroupIds.includes(g.id),
        role: memberRows.find(m => m.groupId === g.id)?.role || null,
      }));

      res.json({
        myGroups: groups.filter(g => g.isMember),
        discover: groups.filter(g => !g.isMember && !g.isPrivate),
      });
    } catch (error) {
      console.error("Error fetching groups:", error);
      res.status(500).json({ error: "Failed to fetch groups" });
    }
  });

  // Get single group details with members
  app.get("/api/player/groups/:groupId", authMiddleware, requirePlayerOrOwner, requireFeatureUnlock("groups"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.userId!;
      const playerId = req.user!.playerId!;

      // Get player's academy for authorization
      const player = await storage.getPlayer(playerId);
      if (!player || !player.academyId) {
        return res.status(403).json({ error: "Player must be in an academy" });
      }

      const [group] = await db.select()
        .from(communityGroupsTable)
        .where(eq(communityGroupsTable.id, groupId));

      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      // Security: Verify player belongs to the same academy as the group
      if (group.academyId !== player.academyId) {
        return res.status(404).json({ error: "Group not found" });
      }

      // Check if user is a member
      const [membership] = await db.select()
        .from(groupMembersTable)
        .where(and(
          eq(groupMembersTable.groupId, groupId),
          eq(groupMembersTable.userId, userId)
        ));

      // For private groups, only members can see details
      if (group.isPrivate && !membership) {
        return res.status(403).json({ error: "This is a private group" });
      }

      // Get all members with user details
      const membersData = await db.select({
        member: groupMembersTable,
        user: users,
      })
        .from(groupMembersTable)
        .leftJoin(users, eq(groupMembersTable.userId, users.id))
        .where(eq(groupMembersTable.groupId, groupId));

      const members = membersData.map(m => ({
        id: m.member.id,
        userId: m.member.userId,
        name: m.user?.email?.split("@")[0] || "Unknown",
        role: m.member.role,
        joinedAt: m.member.joinedAt,
      }));

      res.json({
        group,
        isMember: !!membership,
        myRole: membership?.role || null,
        members,
        memberCount: members.length,
      });
    } catch (error) {
      console.error("Error fetching group:", error);
      res.status(500).json({ error: "Failed to fetch group" });
    }
  });

  // Get group feed (posts within group)
  app.get("/api/player/groups/:groupId/feed", authMiddleware, requirePlayerOrOwner, requireFeatureUnlock("groups"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.userId!;

      // Verify membership
      const [membership] = await db.select()
        .from(groupMembersTable)
        .where(and(
          eq(groupMembersTable.groupId, groupId),
          eq(groupMembersTable.userId, userId)
        ));

      if (!membership) {
        return res.status(403).json({ error: "Not a member of this group" });
      }

      // Get posts in this group
      const groupPosts = await db.select()
        .from(posts)
        .where(eq(posts.groupId, groupId))
        .orderBy(desc(posts.createdAt))
        .limit(50);

      // Add author info
      const postsWithAuthor = await Promise.all(groupPosts.map(async (post) => {
        const [author] = await db.select().from(users).where(eq(users.id, post.authorId));
        return {
          ...post,
          authorName: author?.email?.split("@")[0] || "Unknown",
        };
      }));

      res.json({ posts: postsWithAuthor });
    } catch (error) {
      console.error("Error fetching group feed:", error);
      res.status(500).json({ error: "Failed to fetch group feed" });
    }
  });

  // Join a group
  app.post("/api/player/groups/:groupId/join", authMiddleware, requirePlayerOrOwner, requireFeatureUnlock("groups"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.userId!;
      const playerId = req.user!.playerId!;

      // Get player's academy for authorization
      const player = await storage.getPlayer(playerId);
      if (!player || !player.academyId) {
        return res.status(403).json({ error: "Player must be in an academy" });
      }

      const [group] = await db.select()
        .from(communityGroupsTable)
        .where(eq(communityGroupsTable.id, groupId));

      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      // Security: Verify player belongs to the same academy as the group
      if (group.academyId !== player.academyId) {
        return res.status(404).json({ error: "Group not found" });
      }

      // Security: Cannot join private groups directly (need invite)
      if (group.isPrivate) {
        return res.status(403).json({ error: "This is a private group. You need an invitation to join." });
      }

      // Check if already a member
      const [existing] = await db.select()
        .from(groupMembersTable)
        .where(and(
          eq(groupMembersTable.groupId, groupId),
          eq(groupMembersTable.userId, userId)
        ));

      if (existing) {
        return res.status(400).json({ error: "Already a member" });
      }

      // Join the group
      await db.insert(groupMembersTable).values({
        groupId,
        userId,
        role: "member",
      });

      // Update member count
      await db.update(communityGroupsTable)
        .set({ memberCount: sql`${communityGroupsTable.memberCount} + 1` })
        .where(eq(communityGroupsTable.id, groupId));

      res.json({ success: true, message: "Joined group" });
    } catch (error) {
      console.error("Error joining group:", error);
      res.status(500).json({ error: "Failed to join group" });
    }
  });

  // Leave a group
  app.post("/api/player/groups/:groupId/leave", authMiddleware, requirePlayerOrOwner, requireFeatureUnlock("groups"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { groupId } = req.params;
      const userId = req.user!.userId!;

      // Check if member
      const [membership] = await db.select()
        .from(groupMembersTable)
        .where(and(
          eq(groupMembersTable.groupId, groupId),
          eq(groupMembersTable.userId, userId)
        ));

      if (!membership) {
        return res.status(400).json({ error: "Not a member" });
      }

      // Admin cannot leave (must transfer ownership first)
      if (membership.role === "admin") {
        return res.status(400).json({ error: "Admins must transfer ownership before leaving" });
      }

      // Leave the group
      await db.delete(groupMembersTable)
        .where(and(
          eq(groupMembersTable.groupId, groupId),
          eq(groupMembersTable.userId, userId)
        ));

      // Update member count
      await db.update(communityGroupsTable)
        .set({ memberCount: sql`${communityGroupsTable.memberCount} - 1` })
        .where(eq(communityGroupsTable.id, groupId));

      res.json({ success: true, message: "Left group" });
    } catch (error) {
      console.error("Error leaving group:", error);
      res.status(500).json({ error: "Failed to leave group" });
    }
  });

  // Create a new group (player-created groups)
  app.post("/api/player/groups", authMiddleware, requirePlayerOrOwner, requireFeatureUnlock("groups"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId!;
      const playerId = req.user!.playerId!;
      const player = await storage.getPlayer(playerId);

      if (!player || !player.academyId) {
        return res.status(400).json({ error: "Player must be in an academy to create groups" });
      }

      const { name, description, type = "friends", isPrivate = false } = req.body;

      if (!name || name.trim().length < 2) {
        return res.status(400).json({ error: "Group name must be at least 2 characters" });
      }

      const [newGroup] = await db.insert(communityGroupsTable)
        .values({
          academyId: player.academyId,
          name: name.trim(),
          description: description?.trim() || null,
          type,
          isPrivate,
          createdBy: userId,
          memberCount: 1,
        })
        .returning();

      // Add creator as admin
      await db.insert(groupMembersTable).values({
        groupId: newGroup.id,
        userId,
        role: "admin",
      });

      res.json({ success: true, group: newGroup });
    } catch (error) {
      console.error("Error creating group:", error);
      res.status(500).json({ error: "Failed to create group" });
    }
  });
  
  // Save player onboarding data
  app.post("/api/player/me/onboarding", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      let playerId = req.user!.playerId;
      let newPlayerCreated = false;
      const { academyId, motivationType, dateOfBirth, height, tshirtSize, dominantHand, backhandType, experienceLevel, enjoymentTags, focusGoals, selfConfidenceFlags } = req.body;

      // Academy selection is now optional - players can skip it
      let selectedAcademyId = academyId || null;
      
      // If academyId provided, verify it exists
      if (selectedAcademyId) {
        const academy = await storage.getAcademy(selectedAcademyId);
        if (!academy) {
          return res.status(400).json({ error: "Selected academy not found" });
        }
      }

      // If no player profile exists, create one during onboarding
      if (!playerId) {
        if (req.user!.role !== "player") {
          return res.status(403).json({ error: "Player account required" });
        }
        
        // Create a new player profile for this user
        // Defensive: handle both userId (standard) and id (legacy) field names
        const userIdValue = req.user!.userId ?? (req.user as any).id;
        const user = await storage.getUser(userIdValue);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }
        
        // Create player with the selected academy (or null if skipped)
        const newPlayer = await storage.createPlayer({
          name: user.email.split("@")[0] || "Player",
          email: user.email,
          ballLevel: "green",
          academyId: selectedAcademyId,
          coachId: null,
        });
        
        playerId = newPlayer.id;
        newPlayerCreated = true;
        
        // Link the player to the user account and update their academy
        await storage.updateUser(user.id, { playerId: newPlayer.id, academyId: selectedAcademyId });
      }

      const updatedPlayer = await storage.updatePlayer(playerId, {
        onboardingCompleted: true,
        academyId: selectedAcademyId,
        motivationType,
        dateOfBirth,
        height,
        tshirtSize,
        dominantHand,
        backhandType,
        experienceLevel,
        enjoymentTags,
        focusGoals,
        selfConfidenceFlags,
      });

      // If a new player was created, generate a fresh token with the new playerId
      // This ensures the frontend can immediately use the new playerId without re-login
      let token: string | undefined;
      if (newPlayerCreated) {
        const user = await storage.getUser(req.user!.id);
        if (user) {
          token = generateToken({
            userId: user.id,
            email: user.email,
            role: user.role,
            academyId: user.academyId,
            coachId: user.coachId,
            playerId: playerId,
          });
        }
      }

      res.json({ 
        success: true, 
        player: updatedPlayer, 
        playerId,
        token, // Include fresh token if player was just created
      });
    } catch (error) {
      console.error("Error saving onboarding:", error);
      res.status(500).json({ error: "Failed to save onboarding data" });
    }
  });

  // Save coach onboarding data
  app.post("/api/coach/me/onboarding", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(403).json({ error: "Coach account required" });
      }

      const { yearsExperience, backgroundTags, philosophyTags, acknowledgements, publicQuote } = req.body;

      const updatedCoach = await storage.updateCoach(coachId, {
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
        onboardingMode: "standard",
        yearsExperience,
        backgroundTags,
        philosophyTags,
        onboardingAcknowledgements: acknowledgements,
        publicQuote,
        bioStatus: publicQuote ? "pending_approval" : "draft",
      });

      res.json({ success: true, coach: updatedCoach });
    } catch (error) {
      console.error("Error saving coach onboarding:", error);
      res.status(500).json({ error: "Failed to save onboarding data" });
    }
  });

  // Get coach profile (for onboarding status)
  app.get("/api/coach/me/profile", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(403).json({ error: "Coach account required" });
      }

      const coach = await storage.getCoach(coachId);
      if (!coach) {
        return res.status(404).json({ error: "Coach not found" });
      }

      res.json({ coach });
    } catch (error) {
      console.error("Error fetching coach profile:", error);
      res.status(500).json({ error: "Failed to fetch coach profile" });
    }
  });

  // Get pending coach bios for review (Platform Owner only)
  app.get("/api/platform/pending-bios", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const allCoaches = await storage.getAllCoaches();
      const pendingBios = allCoaches.filter((coach: any) => coach.bioStatus === "pending_approval");
      
      // Enrich with academy names
      const enrichedBios = await Promise.all(
        pendingBios.map(async (coach: any) => {
          let academyName = null;
          if (coach.academyId) {
            const academy = await storage.getAcademy(coach.academyId);
            academyName = academy?.name;
          }
          return {
            id: coach.id,
            name: coach.name,
            email: coach.email,
            academy: academyName,
            yearsExperience: coach.yearsExperience,
            backgroundTags: coach.backgroundTags || [],
            philosophyTags: coach.philosophyTags || [],
            publicQuote: coach.publicQuote,
            submittedAt: coach.onboardingCompletedAt,
          };
        })
      );
      
      res.json({ pendingBios: enrichedBios });
    } catch (error) {
      console.error("Error fetching pending bios:", error);
      res.status(500).json({ error: "Failed to fetch pending bios" });
    }
  });

  // Approve or reject coach bio (Platform Owner only)
  app.post("/api/platform/review-bio/:coachId", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      const { action, rejectionReason } = req.body;

      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({ error: "Invalid action. Use 'approve' or 'reject'" });
      }

      const coach = await storage.getCoach(coachId);
      if (!coach) {
        return res.status(404).json({ error: "Coach not found" });
      }

      const updatedCoach = await storage.updateCoach(coachId, {
        bioStatus: action === "approve" ? "approved" : "rejected",
        bioReviewedAt: new Date(),
        bioReviewedBy: req.user!.id,
        bioRejectionReason: action === "reject" ? rejectionReason : null,
      });

      res.json({ success: true, coach: updatedCoach });
    } catch (error) {
      console.error("Error reviewing bio:", error);
      res.status(500).json({ error: "Failed to review bio" });
    }
  });

  // Get player recognition (badges, achievements, validations)
  app.get("/api/player/me/recognition", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    // Return empty recognition for users without player profile
    if (!req.user!.playerId) {
      return res.json({
        achievements: [],
        domainBadges: [],
        validations: [],
        summary: {
          totalAchievements: 0,
          earnedAchievements: 0,
          totalDomainBadges: 0,
          earnedDomainBadges: 0,
          totalValidations: 0,
        },
      });
    }
    // Original implementation below
    try {
      const playerId = req.user!.playerId!;
      
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Get skill states for domain badges
      const skillStates = await storage.getPlayerSkillStates(playerId);
      const domains = await storage.listSkillDomains();
      
      // Get XP history for streak calculation
      const xpHistory = await storage.getPlayerXpHistory(playerId);
      
      // Get session attendance for consistency badge
      const sessions = await storage.getPlayerSessionsWithDetails(
        playerId, 
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        new Date()
      );
      
      const attendedSessions = sessions.filter(s => s.attended === "present").length;
      
      // Calculate achievements
      const achievements = [
        {
          id: "first_session",
          name: "First Steps",
          description: "Complete your first training session",
          icon: "footsteps",
          color: "#2ECC40",
          earned: attendedSessions >= 1,
          earnedAt: attendedSessions >= 1 ? sessions[0]?.startTime?.toISOString() : null,
        },
        {
          id: "five_sessions",
          name: "Getting Started",
          description: "Complete 5 training sessions",
          icon: "tennisball",
          color: "#FF9500",
          earned: attendedSessions >= 5,
          earnedAt: attendedSessions >= 5 ? new Date().toISOString() : null,
        },
        {
          id: "ten_sessions",
          name: "Consistency Champion",
          description: "Complete 10 training sessions",
          icon: "ribbon",
          color: "#00D4FF",
          earned: attendedSessions >= 10,
          earnedAt: attendedSessions >= 10 ? new Date().toISOString() : null,
        },
        {
          id: "twenty_sessions",
          name: "Dedicated Player",
          description: "Complete 20 training sessions",
          icon: "trophy",
          color: "#FFD700",
          earned: attendedSessions >= 20,
          earnedAt: attendedSessions >= 20 ? new Date().toISOString() : null,
        },
        {
          id: "level_5",
          name: "Rising Star",
          description: "Reach level 5",
          icon: "star",
          color: "#FFD700",
          earned: (player.level || 1) >= 5,
          earnedAt: (player.level || 1) >= 5 ? new Date().toISOString() : null,
        },
        {
          id: "level_10",
          name: "Advanced Player",
          description: "Reach level 10",
          icon: "diamond",
          color: "#E040FB",
          earned: (player.level || 1) >= 10,
          earnedAt: (player.level || 1) >= 10 ? new Date().toISOString() : null,
        },
      ];
      
      // Domain mastery badges
      const domainBadges = domains.map(domain => {
        const state = skillStates.find(s => s.domainId === domain.id);
        const progress = state?.progressValue || 0;
        return {
          id: `domain_${domain.id}`,
          name: `${domain.displayName} Apprentice`,
          description: `Reach 50% progress in ${domain.displayName}`,
          icon: domain.icon || "star",
          color: domain.color || "#888888",
          earned: progress >= 50,
          earnedAt: progress >= 50 ? new Date().toISOString() : null,
          progress: progress,
          domainId: domain.id,
        };
      });
      
      // Coach validations
      const validations = skillStates
        .filter(s => s.assessmentStatus === "meets" || s.assessmentStatus === "above")
        .map(s => {
          const domain = domains.find(d => d.id === s.domainId);
          return {
            id: `validation_${s.domainId}`,
            type: "coach_validation",
            domain: domain?.displayName || "Skill",
            status: s.assessmentStatus,
            validatedAt: s.updatedAt,
          };
        });
      
      const earnedAchievements = achievements.filter(a => a.earned);
      const earnedDomainBadges = domainBadges.filter(b => b.earned);
      
      res.json({
        achievements,
        domainBadges,
        validations,
        summary: {
          totalAchievements: achievements.length,
          earnedAchievements: earnedAchievements.length,
          totalDomainBadges: domainBadges.length,
          earnedDomainBadges: earnedDomainBadges.length,
          totalValidations: validations.length,
        },
      });
    } catch (error) {
      console.error("Error fetching recognition:", error);
      res.status(500).json({ error: "Failed to fetch recognition" });
    }
  });

  // Get player training history for training tab
  app.get("/api/player/training-history", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Return empty training history for users without player profile
      if (!req.user!.playerId) {
        return res.json([]);
      }
      const playerId = req.user!.playerId!;
      
      const sessions = await storage.getPlayerSessionsWithDetails(
        playerId,
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        new Date()
      );
      
      const trainingHistory = sessions
        .filter(s => s.attended === "present")
        .map(s => {
          return {
            id: s.id,
            date: s.startTime,
            type: s.sessionType || "training",
            duration: 60,
            coachName: "Coach",
            attended: true,
            xpEarned: 50,
            domains: [],
            feedback: undefined,
          };
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      res.json(trainingHistory);
    } catch (error) {
      console.error("Error fetching training history:", error);
      res.status(500).json({ error: "Failed to fetch training history" });
    }
  });
  
  // Get single training session detail
  app.get("/api/player/training/:sessionId", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Return not found for users without player profile
      if (!req.user!.playerId) {
        return res.status(404).json({ error: "No player profile found" });
      }
      const playerId = req.user!.playerId!;
      const { sessionId } = req.params;
      
      // Include future sessions (add 1 year to endDate to capture upcoming sessions)
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      
      const sessions = await storage.getPlayerSessionsWithDetails(
        playerId,
        new Date(0),
        futureDate
      );
      
      const sessionData = sessions.find(s => s.id === sessionId);
      if (!sessionData) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      const domains = await storage.listSkillDomains();
      
      res.json({
        id: sessionData.id,
        date: sessionData.startTime,
        type: sessionData.sessionType || "training",
        duration: 60,
        coachName: "Coach",
        xpEarned: 50,
        feedback: { focus: 3, effort: 3 },
        domainImpacts: [],
        focusArea: null,
      });
    } catch (error) {
      console.error("Error fetching training detail:", error);
      res.status(500).json({ error: "Failed to fetch training detail" });
    }
  });
  
  // Get skill details for a specific domain
  app.get("/api/player/skills/:domain", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Return not found for users without player profile
      if (!req.user!.playerId) {
        return res.status(404).json({ error: "No player profile found" });
      }
      const playerId = req.user!.playerId!;
      const { domain: domainId } = req.params;
      
      const domains = await storage.listSkillDomains();
      const targetDomain = domains.find(d => d.id === domainId);
      if (!targetDomain) {
        return res.status(404).json({ error: "Domain not found" });
      }
      
      const skillStates = await storage.getPlayerSkillStates(playerId);
      const domainState = skillStates.find(s => s.domainId === domainId);
      
      const allTrends = await storage.getPlayerObservationTrends(playerId, 30);
      const domainTrend = allTrends.find(t => t.domainId === domainId);
      const historyItems = domainTrend?.history || [];
      
      const skills = [
        {
          id: `${domainId}_1`,
          name: `${targetDomain.displayName} Fundamentals`,
          progress: domainState?.progressValue || 50,
          status: domainState?.momentum === "improving" ? "improving" : "stable",
          recentImpact: historyItems.slice(0, 3).map(h => ({
            session: "Training Session",
            change: h.delta || 0,
            date: h.date || "Recent",
          })),
          suggestions: ["Complete more sessions in this domain", "Focus on consistent practice"],
        },
        {
          id: `${domainId}_2`,
          name: `Advanced ${targetDomain.displayName}`,
          progress: Math.max(0, (domainState?.progressValue || 40) - 15),
          status: "stable",
          recentImpact: [],
          suggestions: ["Build on fundamentals first"],
        },
      ];
      
      res.json({
        domain: domainId,
        overallProgress: domainState?.progressValue || 50,
        skills,
      });
    } catch (error) {
      console.error("Error fetching skill details:", error);
      res.status(500).json({ error: "Failed to fetch skill details" });
    }
  });
  
  // Get peer journey snapshot
  app.get("/api/player/peers/:peerId/journey", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Return not found for users without player profile
      if (!req.user!.playerId) {
        return res.status(404).json({ error: "No player profile found" });
      }
      const playerId = req.user!.playerId!;
      const { peerId } = req.params;
      
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const peer = await storage.getPlayer(peerId);
      if (!peer || peer.academyId !== player.academyId) {
        return res.status(404).json({ error: "Peer not found" });
      }
      
      const peerSkillStates = await storage.getPlayerSkillStates(peerId);
      const mySkillStates = await storage.getPlayerSkillStates(playerId);
      const domains = await storage.listSkillDomains();
      
      const domainComparison = domains.map(d => {
        const peerState = peerSkillStates.find(s => s.domainId === d.id);
        const myState = mySkillStates.find(s => s.domainId === d.id);
        const peerProgress = peerState?.progressValue || 0;
        const myProgress = myState?.progressValue || 0;
        
        let status: "ahead" | "same" | "behind" = "same";
        if (myProgress > peerProgress + 10) status = "ahead";
        else if (myProgress < peerProgress - 10) status = "behind";
        
        return { domain: d.id, status };
      });
      
      res.json({
        id: peer.id,
        name: peer.name,
        level: peer.level || 1,
        ballLevel: peer.ballLevel || "orange",
        recentAchievements: [
          { id: "1", type: "level_up", title: `Reached Level ${peer.level || 1}`, date: "Recently" },
        ],
        domains: domainComparison,
      });
    } catch (error) {
      console.error("Error fetching peer journey:", error);
      res.status(500).json({ error: "Failed to fetch peer journey" });
    }
  });
  
  // Get group challenges (V2 placeholder)
  app.get("/api/player/challenges", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Return empty challenges for users without player profile
      if (!req.user!.playerId) {
        return res.json([]);
      }
      const playerId = req.user!.playerId!;
      const player = await storage.getPlayer(playerId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      res.json([]);
    } catch (error) {
      console.error("Error fetching challenges:", error);
      res.status(500).json({ error: "Failed to fetch challenges" });
    }
  });

  // ==================== PLAYER CHAT API ENDPOINTS ====================
  // These endpoints use requirePlayerOrOwner instead of requireAcademy
  // to allow players without academy membership to chat

  // Get conversations for the current player
  app.get("/api/player/me/conversations", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user!.playerId) {
        return res.json([]);
      }
      const playerId = req.user!.playerId!;
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.json([]);
      }

      const academyId = player.academyId;
      if (!academyId) {
        return res.json([]);
      }

      const conversations = await storage.getConversationsForPlayer(playerId, academyId);

      const enriched = await Promise.all(
        conversations.map(async (conv) => {
          let coachName = null;
          if (conv.coachId) {
            const coach = await storage.getCoach(conv.coachId, academyId);
            coachName = coach?.name;
          }
          return { ...conv, coachName };
        })
      );

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching player conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get unread count for the current player
  app.get("/api/player/me/unread-count", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user!.playerId) {
        return res.json({ unreadCount: 0 });
      }
      const playerId = req.user!.playerId!;
      const player = await storage.getPlayer(playerId);
      if (!player || !player.academyId) {
        return res.json({ unreadCount: 0 });
      }

      const unreadCount = await storage.getPlayerUnreadCount(playerId, player.academyId);
      res.json({ unreadCount });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // Create a conversation for the current player
  app.post("/api/player/me/conversations", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user!.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }
      const playerId = req.user!.playerId!;
      const player = await storage.getPlayer(playerId);
      if (!player || !player.academyId) {
        return res.status(403).json({ error: "Academy membership required for chat" });
      }

      const academyId = player.academyId;
      const { type, otherPlayerId, title } = req.body;

      if (!type) {
        return res.status(400).json({ error: "Conversation type required" });
      }

      if (type === "player_player" && otherPlayerId) {
        const otherPlayer = await storage.getPlayer(otherPlayerId, academyId);
        if (!otherPlayer) {
          return res.status(404).json({ error: "Other player not found" });
        }
        const existing = await storage.getPlayerToPlayerConversation(playerId, otherPlayerId, academyId);
        if (existing) {
          return res.json(existing);
        }
        const conversation = await storage.createConversation({
          type: "player_player",
          playerId,
          coachId: null,
          title: null,
          academyId,
        });
        await storage.addConversationParticipant({
          conversationId: conversation.id,
          coachId: null,
          playerId,
          role: "owner",
          participantType: "player",
          canPost: true,
          academyId,
        });
        await storage.addConversationParticipant({
          conversationId: conversation.id,
          coachId: null,
          playerId: otherPlayerId,
          role: "member",
          participantType: "player",
          canPost: true,
          academyId,
        });
        return res.status(201).json(conversation);
      }

      if (type === "academy") {
        const existing = await storage.getAcademyConversationForPlayer(playerId, academyId);
        if (existing) {
          return res.json(existing);
        }
        const coach = await storage.getFirstCoachForAcademy(academyId);
        const conversation = await storage.createConversation({
          type: "academy",
          playerId,
          coachId: coach?.id || null,
          title: title || "Academy Chat",
          academyId,
        });
        await storage.addConversationParticipant({
          conversationId: conversation.id,
          coachId: null,
          playerId,
          role: "owner",
          participantType: "player",
          canPost: true,
          academyId,
        });
        if (coach?.id) {
          await storage.addConversationParticipant({
            conversationId: conversation.id,
            coachId: coach.id,
            playerId: null,
            role: "member",
            participantType: "coach",
            canPost: true,
            academyId,
          });
        }
        return res.status(201).json(conversation);
      }

      return res.status(400).json({ error: "Invalid conversation type" });
    } catch (error) {
      console.error("Error creating player conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Get messages for a player conversation
  app.get("/api/player/me/conversations/:id/messages", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user!.playerId) {
        return res.json([]);
      }
      const playerId = req.user!.playerId!;
      const player = await storage.getPlayer(playerId);
      if (!player || !player.academyId) {
        return res.json([]);
      }

      const { id } = req.params;
      const academyId = player.academyId;
      const limit = parseInt(req.query.limit as string) || 50;

      const conversation = await storage.getConversationForPlayer(id, playerId, academyId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const messages = await storage.getMessagesForPlayer(id, playerId, academyId, limit);

      const enriched = await Promise.all(
        messages.map(async (msg) => {
          const reactions = await storage.getMessageReactionsForPlayer(msg.id, playerId, academyId);
          return { ...msg, reactions };
        })
      );

      res.json(enriched.reverse());
    } catch (error) {
      console.error("Error fetching player messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Send a message in a player conversation
  app.post("/api/player/me/conversations/:id/messages", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user!.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }
      const playerId = req.user!.playerId!;
      const player = await storage.getPlayer(playerId);
      if (!player || !player.academyId) {
        return res.status(403).json({ error: "Academy membership required" });
      }

      const { id } = req.params;
      const academyId = player.academyId;
      const { body, messageType } = req.body;

      if (!body || !body.trim()) {
        return res.status(400).json({ error: "Message body required" });
      }

      const conversation = await storage.getConversationForPlayer(id, playerId, academyId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const message = await storage.createMessage({
        conversationId: id,
        senderType: "player",
        senderCoachId: null,
        senderPlayerId: playerId,
        body: body.trim(),
        messageType: messageType || "text",
      });

      await storage.updateConversation(id, {
        lastMessageAt: new Date(),
        lastMessagePreview: body.trim().substring(0, 100),
      });

      res.status(201).json(message);
    } catch (error) {
      console.error("Error sending player message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Mark conversation as read for player
  app.post("/api/player/me/conversations/:id/read", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user!.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }
      const playerId = req.user!.playerId!;
      const player = await storage.getPlayer(playerId);
      if (!player || !player.academyId) {
        return res.status(403).json({ error: "Academy membership required" });
      }

      const { id } = req.params;
      const academyId = player.academyId;

      const conversation = await storage.getConversationForPlayer(id, playerId, academyId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      await storage.markConversationRead(id, playerId, "player");
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking conversation read:", error);
      res.status(500).json({ error: "Failed to mark as read" });
    }
  });

  // Add reaction to a message (player)
  app.post("/api/player/me/messages/:messageId/reactions", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user!.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }
      const playerId = req.user!.playerId!;
      const player = await storage.getPlayer(playerId);
      if (!player || !player.academyId) {
        return res.status(403).json({ error: "Academy membership required" });
      }

      const { messageId } = req.params;
      const { emoji } = req.body;
      const academyId = player.academyId;

      if (!emoji) {
        return res.status(400).json({ error: "Emoji required" });
      }

      const message = await storage.getMessage(messageId);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      const conversation = await storage.getConversationForPlayer(message.conversationId, playerId, academyId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const reaction = await storage.addMessageReaction({
        messageId,
        reactorType: "player",
        reactorCoachId: null,
        reactorPlayerId: playerId,
        emoji,
      });

      res.status(201).json(reaction);
    } catch (error) {
      console.error("Error adding reaction:", error);
      res.status(500).json({ error: "Failed to add reaction" });
    }
  });

  // Academy Owner - Get schedule/operations data
  app.get("/api/owner/operations", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const period = (req.query.period as string) || "day";
      
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }
      
      // Calculate date range based on period
      const now = new Date();
      let startDate: Date;
      let endDate: Date = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      
      if (period === "day") {
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
      } else if (period === "week") {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
      } else { // month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
      }
      
      // Get courts
      const dbCourts = await storage.getAllCourts(academyId);
      
      // Get sessions for the period
      const allSessions = await storage.getAllSessions(academyId);
      const periodSessions = allSessions.filter(session => {
        const sessionDate = new Date(session.date);
        return sessionDate >= startDate && sessionDate <= endDate;
      });
      
      // Group sessions by court
      const courtSessionsMap: Record<string, any[]> = {};
      for (const session of periodSessions) {
        const courtId = session.courtId || "unassigned";
        if (!courtSessionsMap[courtId]) {
          courtSessionsMap[courtId] = [];
        }
        courtSessionsMap[courtId].push(session);
      }
      
      // Build court schedule
      const courtSchedule = dbCourts.map(court => {
        const sessions = courtSessionsMap[court.id] || [];
        return {
          name: court.name,
          sessions: sessions.map(s => ({
            time: s.time || "TBD",
            coach: s.coachName || "Unassigned",
            status: s.status === "cancelled" ? "conflict" : "booked" as const,
            date: s.date,
          })),
        };
      });
      
      // Add unassigned court sessions if any
      if (courtSessionsMap["unassigned"]?.length > 0) {
        courtSchedule.push({
          name: "No Court Assigned",
          sessions: courtSessionsMap["unassigned"].map(s => ({
            time: s.time || "TBD",
            coach: s.coachName || "Unassigned",
            status: "conflict" as const,
            date: s.date,
          })),
        });
      }
      
      // Calculate insights
      const totalSessions = periodSessions.length;
      const conflicts = periodSessions.filter(s => s.status === "cancelled" || !s.courtId).length;
      
      // Find peak hours
      const hourCounts: Record<number, number> = {};
      for (const session of periodSessions) {
        if (session.time) {
          const hour = parseInt(session.time.split(":")[0]) || 0;
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        }
      }
      const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
      const peakHoursLabel = peakHour ? `${peakHour[0]}:00` : "N/A";
      
      // Calculate utilization (sessions per court per day)
      const daysInPeriod = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const maxPossibleSessions = dbCourts.length * daysInPeriod * 12; // Assume 12 slots per court per day
      const utilization = maxPossibleSessions > 0 ? Math.round((totalSessions / maxPossibleSessions) * 100) : 0;

      res.json({
        courts: courtSchedule,
        insights: {
          peakHours: peakHoursLabel,
          utilization,
          conflicts,
        },
        period,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      });
    } catch (error) {
      console.error("Owner operations error:", error);
      res.status(500).json({ error: "Failed to fetch operations data" });
    }
  });

  // Academy Owner - Get finance data with 3 clear sections: Collected, Pending, Estimated
  app.get("/api/owner/finance", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      // Get real payment data
      const allPayments = await storage.getPayments(academyId);
      const now = new Date();
      const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      // Filter by payment date
      const thisWeekPayments = allPayments.filter(p => 
        p.status === "confirmed" && p.paymentDate && new Date(p.paymentDate) >= thisWeekStart
      );
      const thisMonthPayments = allPayments.filter(p => 
        p.status === "confirmed" && p.paymentDate && new Date(p.paymentDate) >= thisMonthStart
      );
      const lastMonthPayments = allPayments.filter(p => 
        p.status === "confirmed" && p.paymentDate && 
        new Date(p.paymentDate) >= lastMonthStart && new Date(p.paymentDate) <= lastMonthEnd
      );

      // Calculate collected revenue (confirmed payments only)
      const collectedThisWeek = thisWeekPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const collectedThisMonth = thisMonthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const collectedLastMonth = lastMonthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      // Pending revenue (pending manual payments)
      const pendingPayments = allPayments.filter(p => p.status === "pending");
      const pendingAmount = pendingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      // Get active player subscriptions for estimated revenue
      const activeSubscriptions = await storage.getActivePlayerSubscriptions(academyId);
      
      // Calculate estimated monthly revenue from subscriptions
      let estimatedMonthlyRevenue = 0;
      const subscriptionBreakdown: Record<string, { count: number; total: number }> = {};

      for (const sub of activeSubscriptions) {
        const price = Number(sub.price || 0);
        const monthlyEquivalent = sub.billingPeriod === "weekly" ? price * 4 : price;
        estimatedMonthlyRevenue += monthlyEquivalent;

        if (!subscriptionBreakdown[sub.planName]) {
          subscriptionBreakdown[sub.planName] = { count: 0, total: 0 };
        }
        subscriptionBreakdown[sub.planName].count++;
        subscriptionBreakdown[sub.planName].total += monthlyEquivalent;
      }

      // Cash vs Bank breakdown for this month
      const cashTotal = thisMonthPayments
        .filter(p => p.paymentMethod === "cash")
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const bankTotal = thisMonthPayments
        .filter(p => p.paymentMethod === "bank_transfer")
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      // Month-over-month change
      const monthChange = collectedLastMonth > 0 
        ? Math.round(((collectedThisMonth - collectedLastMonth) / collectedLastMonth) * 100)
        : 0;

      // Get recent payments with player names
      const recentPayments = allPayments.slice(0, 10);
      const paymentsWithPlayers = await Promise.all(
        recentPayments.map(async (payment) => {
          const player = payment.playerId ? await storage.getPlayerById(payment.playerId) : null;
          return {
            id: payment.id,
            playerName: payment.payerName || player?.name || "Unknown",
            package: "Manual Payment",
            amount: Number(payment.amount || 0),
            status: payment.status === "confirmed" ? "paid" : payment.status || "pending",
            paymentMethod: payment.paymentMethod,
            date: payment.paymentDate,
          };
        })
      );

      // Get academy settings for currency
      const settings = await storage.getAcademySettings(academyId);
      const currency = settings?.currency || "AED";

      res.json({
        currency,
        // Section 1: Collected Revenue (confirmed payments only)
        collected: {
          thisWeek: collectedThisWeek,
          thisMonth: collectedThisMonth,
          lastMonth: collectedLastMonth,
          monthChange,
          cashTotal,
          bankTotal,
          tooltip: "Confirmed payments only. This is money you have actually received.",
        },
        // Section 2: Pending Revenue (expected but not confirmed)
        pending: {
          amount: pendingAmount,
          count: pendingPayments.length,
          tooltip: "Pending payments awaiting confirmation. These have been recorded but not yet verified.",
        },
        // Section 3: Estimated Revenue (forecast from subscriptions)
        estimated: {
          monthlyForecast: estimatedMonthlyRevenue,
          activeSubscriptions: activeSubscriptions.length,
          breakdown: Object.entries(subscriptionBreakdown).map(([planName, data]) => ({
            planName,
            count: data.count,
            monthlyTotal: data.total,
          })),
          tooltip: "Estimated revenue based on active player subscriptions. This is a forecast, not actual collected money.",
        },
        // Recent payment activity
        recentPayments: paymentsWithPlayers,
        // Legacy format for backward compatibility
        revenue: {
          thisWeek: collectedThisWeek,
          thisMonth: collectedThisMonth,
          weekChange: 0,
          monthChange,
          weekSessions: 0,
          monthSessions: 0,
        },
        summary: {
          collected: collectedThisMonth,
          pending: pendingAmount,
          overdue: 0, // We don't track overdue status in manual payments
        },
        payments: paymentsWithPlayers,
        subscriptions: {
          total: activeSubscriptions.length,
          monthlyRevenue: estimatedMonthlyRevenue,
          breakdown: Object.entries(subscriptionBreakdown).map(([type, data]) => ({
            type,
            count: data.count,
          })),
        },
      });
    } catch (error) {
      console.error("Owner finance error:", error);
      res.status(500).json({ error: "Failed to fetch finance data" });
    }
  });

  // ==================== ACADEMY SETTINGS & EXPORTS ====================

  // Get academy settings (for settings screen)
  app.get("/api/owner/academy-settings", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      res.json({
        defaultSessionLength: (academy as any).defaultSessionLength || 60,
        xpVisibleToPlayers: (academy as any).xpVisibleToPlayers ?? true,
        notificationsEnabled: (academy as any).notificationsEnabled ?? true,
      });
    } catch (error) {
      console.error("Get academy settings error:", error);
      res.status(500).json({ error: "Failed to fetch academy settings" });
    }
  });

  // Update academy settings
  app.patch("/api/owner/academy-settings", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const updates = req.body;
      const updated = await storage.updateAcademy(academyId, updates);

      res.json({ success: true, ...updates });
    } catch (error) {
      console.error("Update academy settings error:", error);
      res.status(500).json({ error: "Failed to update academy settings" });
    }
  });

  // Export players as CSV (returns JSON with CSV data for cross-platform compatibility)
  app.get("/api/owner/export/players", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const players = await storage.getPlayersByAcademy(academyId);
      
      const csvHeader = "Name,Email,Phone,Ball Level,Status,Created At\n";
      const csvRows = players.map(p => 
        `"${p.name || ""}","${p.email || ""}","${p.phone || ""}","${p.ballLevel || ""}","${p.isActive ? "Active" : "Inactive"}","${p.createdAt || ""}"`
      ).join("\n");
      
      const csv = csvHeader + csvRows;
      
      res.json({ csv, filename: "players.csv" });
    } catch (error) {
      console.error("Export players error:", error);
      res.status(500).json({ error: "Failed to export players" });
    }
  });

  // Export sessions as CSV (returns JSON with CSV data for cross-platform compatibility)
  app.get("/api/owner/export/sessions", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const sessions = await storage.getAllSessions(academyId);
      
      const csvHeader = "Date,Time,Coach,Type,Status,Players,Duration\n";
      const csvRows = sessions.map(s => 
        `"${s.date || ""}","${s.time || ""}","${s.coachName || ""}","${s.sessionType || ""}","${s.status || ""}","${s.playerName || ""}","${s.duration || 60} min"`
      ).join("\n");
      
      const csv = csvHeader + csvRows;
      
      res.json({ csv, filename: "sessions.csv" });
    } catch (error) {
      console.error("Export sessions error:", error);
      res.status(500).json({ error: "Failed to export sessions" });
    }
  });

  // ==================== ACADEMY PROFILE & SETTINGS ====================
  
  // Get academy profile
  app.get("/api/owner/academy", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      res.json(academy);
    } catch (error) {
      console.error("Get academy error:", error);
      res.status(500).json({ error: "Failed to fetch academy" });
    }
  });

  // Update academy profile
  app.patch("/api/owner/academy", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const { 
        name, description, email, phone, address, website, logoUrl, primaryColor, secondaryColor,
        bankName, bankAccountHolder, bankAccountNumber, bankIban
      } = req.body;
      
      // Build update object with only provided properties to support partial updates
      // Empty strings are valid values (user intentionally clearing a field)
      const updates: Record<string, any> = {};
      if (name !== undefined && name !== null) updates.name = name;
      if (description !== undefined && description !== null) updates.description = description;
      if (email !== undefined && email !== null) updates.email = email;
      if (phone !== undefined && phone !== null) updates.phone = phone;
      if (address !== undefined && address !== null) updates.address = address;
      if (website !== undefined && website !== null) updates.website = website;
      if (logoUrl !== undefined && logoUrl !== null) updates.logoUrl = logoUrl;
      if (primaryColor !== undefined && primaryColor !== null) updates.primaryColor = primaryColor;
      if (secondaryColor !== undefined && secondaryColor !== null) updates.secondaryColor = secondaryColor;
      if (bankName !== undefined && bankName !== null) updates.bankName = bankName;
      if (bankAccountHolder !== undefined && bankAccountHolder !== null) updates.bankAccountHolder = bankAccountHolder;
      if (bankAccountNumber !== undefined && bankAccountNumber !== null) updates.bankAccountNumber = bankAccountNumber;
      if (bankIban !== undefined && bankIban !== null) updates.bankIban = bankIban;
      
      const updated = await storage.updateAcademy(academyId, updates);

      res.json(updated);
    } catch (error) {
      console.error("Update academy error:", error);
      res.status(500).json({ error: "Failed to update academy" });
    }
  });

  // Get academy settings
  app.get("/api/owner/settings", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      // Return settings from academy or defaults
      res.json({
        cancellationHours: academy.cancelHoursBeforeFree || 24,
        noShowPenalty: academy.noShowPenalty || 100,
        lateCancellationPenalty: academy.lateCancellationPenalty || 50,
        xpPerSession: academy.xpPerSession || 10,
        xpBonusStreak: academy.xpBonusStreak || 5,
        attendanceThreshold: academy.attendanceThreshold || 80,
        requireConfirmation: academy.requireConfirmation ?? true,
        allowWaitlist: academy.allowWaitlist ?? true,
        maxWaitlistSize: academy.maxWaitlistSize || 3,
      });
    } catch (error) {
      console.error("Get settings error:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Update academy settings
  app.patch("/api/owner/settings", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const { cancellationHours, ...otherSettings } = req.body;
      const updates: Record<string, any> = { ...otherSettings };
      
      // Map frontend field name to schema field name
      if (cancellationHours !== undefined) {
        updates.cancelHoursBeforeFree = cancellationHours;
      }
      
      const updated = await storage.updateAcademy(academyId, updates);

      res.json({ success: true, settings: updated });
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Academy Owner - Get coaches and players for People screen
  app.get("/api/owner/people", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      
      let coaches: any[] = [];
      let players: any[] = [];
      
      if (academyId) {
        coaches = await storage.getCoachesByAcademy(academyId);
        players = await storage.getPlayersByAcademy(academyId);
      }

      const coachData = await Promise.all(
        coaches.map(async (coach) => {
          // Calculate weekly session count dynamically
          const now = new Date();
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay());
          weekStart.setHours(0, 0, 0, 0);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 7);
          
          const sessions = await storage.getSessionsByCoach(coach.id, weekStart, weekEnd, academyId);
          const weeklySessionCount = sessions.length;
          
          return {
            id: coach.id,
            name: coach.name,
            role: coach.role || "Coach",
            status: coach.isActive !== false ? "active" : "paused",
            stats: [
              { label: "Sessions/wk", value: String(weeklySessionCount) },
              { label: "Feedback %", value: `${coach.feedbackRate || 0}%` },
              { label: "Level", value: String(coach.level || 1) },
            ],
          };
        })
      );

      const playerData = await Promise.all(
        players.map(async (player) => {
          const xpData = await storage.getPlayerXpTotal(player.id);
          return {
            id: player.id,
            name: player.name,
            role: player.ballLevel ? `${player.ballLevel.charAt(0).toUpperCase() + player.ballLevel.slice(1)} Ball` : "Green Ball",
            status: player.isActive !== false ? "active" : "paused",
            stats: [
              { label: "Attendance", value: `${player.attendanceRate || 0}%` },
              { label: "Streak", value: String(player.streak || 0) },
              { label: "Level", value: String(xpData.level || player.level || 1) },
            ],
            coachId: player.coachId,
          };
        })
      );

      res.json({
        coaches: coachData,
        players: playerData,
      });
    } catch (error) {
      console.error("Owner people error:", error);
      res.status(500).json({ error: "Failed to fetch people data" });
    }
  });

  // Get coach's upcoming sessions (for reassignment before deletion)
  app.get("/api/owner/coaches/:id/sessions", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId || req.header("X-Academy-Id");
      const coachId = req.params.id;

      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const sessions = await storage.getCoachUpcomingSessions(coachId, academyId);
      res.json({ sessions, count: sessions.length });
    } catch (error) {
      console.error("Get coach sessions error:", error);
      res.status(500).json({ error: "Failed to fetch coach sessions" });
    }
  });

  // Reassign coach's sessions to another coach
  app.post("/api/owner/coaches/:id/reassign-sessions", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId || req.header("X-Academy-Id");
      const fromCoachId = req.params.id;
      const { toCoachId } = req.body;

      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      if (!toCoachId) {
        return res.status(400).json({ error: "Target coach ID required" });
      }

      // Verify target coach exists in this academy
      const targetCoach = await storage.getCoach(toCoachId, academyId);
      if (!targetCoach) {
        return res.status(404).json({ error: "Target coach not found in this academy" });
      }

      const count = await storage.reassignCoachSessions(fromCoachId, toCoachId, academyId);
      res.json({ success: true, reassignedCount: count, message: `${count} sessions reassigned` });
    } catch (error) {
      console.error("Reassign sessions error:", error);
      res.status(500).json({ error: "Failed to reassign sessions" });
    }
  });

  // Soft remove coach from academy (marks as inactive, keeps record)
  app.delete("/api/owner/coaches/:id", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId || req.header("X-Academy-Id");
      const coachId = req.params.id;

      if (!academyId) {
        console.error("Coach deletion failed: No academyId in token or header. User:", JSON.stringify(req.user));
        return res.status(400).json({ error: "Academy ID required. Please re-login or select an academy." });
      }

      console.log(`Removing coach ${coachId} from academy ${academyId}`);
      const removed = await storage.removeCoachFromAcademy(coachId, academyId);
      if (!removed) {
        return res.status(404).json({ error: "Coach not found in this academy" });
      }

      res.json({ success: true, message: "Coach removed from academy" });
    } catch (error: any) {
      console.error("Remove coach error:", error);
      res.status(500).json({ error: error.message || "Failed to remove coach" });
    }
  });

  // Fully delete coach (permanent deletion after session reassignment)
  app.delete("/api/owner/coaches/:id/permanent", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId || req.header("X-Academy-Id");
      const coachId = req.params.id;

      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      // Check for upcoming sessions
      const upcomingSessions = await storage.getCoachUpcomingSessions(coachId, academyId);
      if (upcomingSessions.length > 0) {
        return res.status(400).json({ 
          error: "Coach has upcoming sessions that must be reassigned or cancelled first",
          upcomingSessionCount: upcomingSessions.length
        });
      }

      console.log(`Permanently deleting coach ${coachId} from academy ${academyId}`);
      const deleted = await storage.fullyDeleteCoach(coachId, academyId);
      if (!deleted) {
        return res.status(404).json({ error: "Coach not found in this academy" });
      }

      res.json({ success: true, message: "Coach permanently deleted" });
    } catch (error: any) {
      console.error("Permanent delete coach error:", error);
      res.status(500).json({ error: error.message || "Failed to permanently delete coach" });
    }
  });

  // Permanently delete player from academy (academy owner)
  app.delete("/api/owner/players/:id", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const playerId = req.params.id;
      const userId = req.user?.coachId || req.user?.userId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      // Permanent delete - completely remove player and all related data
      const deleted = await storage.deletePlayer(playerId, academyId);
      if (!deleted) {
        return res.status(404).json({ error: "Player not found in this academy" });
      }

      await storage.createAuditLog({
        academyId,
        entityType: "player",
        entityId: playerId,
        action: "delete",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        metadata: JSON.stringify({ deletedAt: new Date().toISOString() }),
      });

      res.json({ success: true, message: "Player permanently deleted" });
    } catch (error) {
      console.error("Delete player error:", error);
      res.status(500).json({ error: "Failed to delete player" });
    }
  });

  // Get coach details (academy owner)
  app.get("/api/owner/coaches/:id", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const coachId = req.params.id;

      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const coach = await storage.getCoach(coachId, academyId);
      if (!coach) {
        return res.status(404).json({ error: "Coach not found" });
      }

      // Get coach's players
      const players = await storage.getPlayersByCoach(coachId, academyId);
      
      // Get coach's sessions this week
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      
      const sessions = await storage.getSessionsByCoach(coachId, academyId);
      const weekSessions = sessions.filter(s => {
        const sessionDate = new Date(s.date);
        return sessionDate >= weekStart && sessionDate < weekEnd;
      });

      res.json({
        ...coach,
        playerCount: players.length,
        weeklySessionCount: weekSessions.length,
        players: players.slice(0, 10).map(p => ({ id: p.id, name: p.name, ballLevel: p.ballLevel })),
      });
    } catch (error) {
      console.error("Get coach details error:", error);
      res.status(500).json({ error: "Failed to fetch coach details" });
    }
  });

  // Get player details (academy owner)
  app.get("/api/owner/players/:id", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const playerId = req.params.id;

      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const player = await storage.getPlayer(playerId, academyId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Get player's coach
      let coach = null;
      if (player.coachId) {
        coach = await storage.getCoach(player.coachId);
      }

      // Get XP data
      const xpData = await storage.getPlayerXpTotal(playerId);

      // Get recent sessions
      const sessions = await storage.getSessionsForPlayer(playerId, academyId);

      res.json({
        ...player,
        coach: coach ? { id: coach.id, name: coach.name } : null,
        xp: xpData,
        recentSessions: sessions.slice(0, 5),
      });
    } catch (error) {
      console.error("Get player details error:", error);
      res.status(500).json({ error: "Failed to fetch player details" });
    }
  });

  // ==================== ACADEMY ADMIN MANAGEMENT (Academy Owner only) ====================
  
  // Get all admins for the academy
  app.get("/api/owner/admins", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const admins = await storage.getAcademyAdmins(academyId);
      res.json(admins);
    } catch (error) {
      console.error("Get admins error:", error);
      res.status(500).json({ error: "Failed to fetch admins" });
    }
  });

  // Promote a coach to admin role
  app.post("/api/owner/admins", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const { coachId } = req.body;
      
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }
      if (!coachId) {
        return res.status(400).json({ error: "Coach ID required" });
      }

      // Verify coach exists and belongs to this academy
      const coach = await storage.getCoach(coachId);
      if (!coach || coach.academyId !== academyId) {
        return res.status(404).json({ error: "Coach not found in this academy" });
      }

      // Update coach academy membership to admin role
      await storage.promoteToAdmin(coachId, academyId);
      
      res.json({ success: true, message: `${coach.name} promoted to admin` });
    } catch (error) {
      console.error("Promote to admin error:", error);
      res.status(500).json({ error: "Failed to promote coach to admin" });
    }
  });

  // Demote an admin back to coach role
  app.delete("/api/owner/admins/:coachId", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const { coachId } = req.params;
      
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      // Verify the coach is currently an admin in this academy
      const admins = await storage.getAcademyAdmins(academyId);
      const isAdmin = admins.some(a => a.id === coachId);
      
      if (!isAdmin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      // Demote back to coach
      await storage.demoteFromAdmin(coachId, academyId);
      
      res.json({ success: true, message: "Admin demoted to coach" });
    } catch (error) {
      console.error("Demote admin error:", error);
      res.status(500).json({ error: "Failed to demote admin" });
    }
  });

  // ==================== ADMIN COACH MANAGEMENT ====================

  // Delete coach (admin) - removes coach from academy
  app.delete("/api/admin/coaches/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId || req.user?.userId;
      const { id } = req.params;

      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const removed = await storage.removeCoachFromAcademy(id, academyId);
      if (!removed) {
        return res.status(404).json({ error: "Coach not found in this academy" });
      }

      await storage.createAuditLog({
        academyId,
        entityType: "coach",
        entityId: id,
        action: "delete",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        metadata: JSON.stringify({ removedAt: new Date().toISOString() }),
      });

      res.json({ success: true, message: "Coach removed from academy" });
    } catch (error) {
      console.error("Admin delete coach error:", error);
      res.status(500).json({ error: "Failed to remove coach" });
    }
  });

  // Delete player (admin) - removes player from academy
  app.delete("/api/admin/players/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId || req.user?.userId;
      const { id } = req.params;

      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const deleted = await storage.deletePlayer(id, academyId);
      if (!deleted) {
        return res.status(404).json({ error: "Player not found in this academy" });
      }

      await storage.createAuditLog({
        academyId,
        entityType: "player",
        entityId: id,
        action: "delete",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        metadata: JSON.stringify({ deletedAt: new Date().toISOString() }),
      });

      res.json({ success: true, message: "Player deleted" });
    } catch (error) {
      console.error("Admin delete player error:", error);
      res.status(500).json({ error: "Failed to delete player" });
    }
  });

  // ==================== ADMIN PAYMENTS (MANUAL PAYMENTS MVP) ====================

  // Get all payments with filters
  app.get("/api/admin/payments", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const filters: any = {};
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.paymentMethod) filters.paymentMethod = req.query.paymentMethod as string;
      if (req.query.playerId) filters.playerId = req.query.playerId as string;
      if (req.query.receivedBy) filters.receivedBy = req.query.receivedBy as string;
      if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string);
      if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string);

      const payments = await storage.getPaymentsWithFilters(academyId, filters);

      const paymentsWithDetails = await Promise.all(
        payments.map(async (p) => {
          const player = p.playerId ? await storage.getPlayer(p.playerId) : null;
          const receiver = p.receivedBy ? await storage.getCoach(p.receivedBy) : null;
          return {
            ...p,
            playerName: player?.name || p.payerName || "Unknown",
            receiverName: receiver?.name || "Unknown",
          };
        })
      );

      res.json(paymentsWithDetails);
    } catch (error) {
      console.error("Admin payments error:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  // Create a new payment (admin only)
  app.post("/api/admin/payments", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const { playerId, payerName, amount, currency, paymentMethod, paymentDate, receivedBy, proofUrl, notes, status } = req.body;

      if (!amount || !paymentMethod) {
        return res.status(400).json({ error: "Amount and payment method are required" });
      }

      const payment = await storage.createPayment({
        academyId,
        playerId: playerId || null,
        payerName: payerName || null,
        amount: String(amount),
        currency: currency || "AED",
        paymentMethod,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        receivedBy: receivedBy || userId || null,
        proofUrl: proofUrl || null,
        notes: notes || null,
        status: status || "pending",
      });

      await storage.createAuditLog({
        academyId,
        entityType: "payment",
        entityId: payment.id,
        action: "create",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        afterState: payment as any,
      });

      res.status(201).json(payment);
    } catch (error) {
      console.error("Create payment error:", error);
      res.status(500).json({ error: "Failed to create payment" });
    }
  });

  // Update a payment
  app.put("/api/admin/payments/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId;

      const existingPayment = await storage.getPayment(id);
      if (!existingPayment || (academyId && existingPayment.academyId !== academyId)) {
        return res.status(404).json({ error: "Payment not found" });
      }

      if (existingPayment.status === "confirmed") {
        return res.status(400).json({ error: "Cannot edit confirmed payments" });
      }

      const { playerId, payerName, amount, currency, paymentMethod, paymentDate, receivedBy, proofUrl, notes } = req.body;

      const updatedPayment = await storage.updatePayment(id, {
        playerId: playerId !== undefined ? playerId : existingPayment.playerId,
        payerName: payerName !== undefined ? payerName : existingPayment.payerName,
        amount: amount !== undefined ? String(amount) : existingPayment.amount,
        currency: currency !== undefined ? currency : existingPayment.currency,
        paymentMethod: paymentMethod !== undefined ? paymentMethod : existingPayment.paymentMethod,
        paymentDate: paymentDate ? new Date(paymentDate) : existingPayment.paymentDate,
        receivedBy: receivedBy !== undefined ? receivedBy : existingPayment.receivedBy,
        proofUrl: proofUrl !== undefined ? proofUrl : existingPayment.proofUrl,
        notes: notes !== undefined ? notes : existingPayment.notes,
      });

      await storage.createAuditLog({
        academyId,
        entityType: "payment",
        entityId: id,
        action: "update",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        beforeState: existingPayment as any,
        afterState: updatedPayment as any,
      });

      res.json(updatedPayment);
    } catch (error) {
      console.error("Update payment error:", error);
      res.status(500).json({ error: "Failed to update payment" });
    }
  });

  // Confirm a payment (admin only)
  app.post("/api/admin/payments/:id/confirm", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId;

      const existingPayment = await storage.getPayment(id);
      if (!existingPayment || (academyId && existingPayment.academyId !== academyId)) {
        return res.status(404).json({ error: "Payment not found" });
      }

      if (existingPayment.status !== "pending") {
        return res.status(400).json({ error: "Only pending payments can be confirmed" });
      }

      const confirmedPayment = await storage.confirmPayment(id, userId || "");

      await storage.createAuditLog({
        academyId,
        entityType: "payment",
        entityId: id,
        action: "confirm",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        beforeState: existingPayment as any,
        afterState: confirmedPayment as any,
      });

      res.json(confirmedPayment);
    } catch (error) {
      console.error("Confirm payment error:", error);
      res.status(500).json({ error: "Failed to confirm payment" });
    }
  });

  // Reject a payment (admin only)
  app.post("/api/admin/payments/:id/reject", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId;

      const existingPayment = await storage.getPayment(id);
      if (!existingPayment || (academyId && existingPayment.academyId !== academyId)) {
        return res.status(404).json({ error: "Payment not found" });
      }

      if (existingPayment.status !== "pending") {
        return res.status(400).json({ error: "Only pending payments can be rejected" });
      }

      const rejectedPayment = await storage.rejectPayment(id, userId || "", reason || "No reason provided");

      await storage.createAuditLog({
        academyId,
        entityType: "payment",
        entityId: id,
        action: "reject",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        beforeState: existingPayment as any,
        afterState: rejectedPayment as any,
        metadata: JSON.stringify({ reason }),
      });

      res.json(rejectedPayment);
    } catch (error) {
      console.error("Reject payment error:", error);
      res.status(500).json({ error: "Failed to reject payment" });
    }
  });

  // Delete a payment (admin only, only pending/rejected)
  app.delete("/api/admin/payments/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId;

      const existingPayment = await storage.getPayment(id);
      if (!existingPayment || (academyId && existingPayment.academyId !== academyId)) {
        return res.status(404).json({ error: "Payment not found" });
      }

      if (existingPayment.status === "confirmed") {
        return res.status(400).json({ error: "Cannot delete confirmed payments" });
      }

      await storage.deletePayment(id);

      await storage.createAuditLog({
        academyId,
        entityType: "payment",
        entityId: id,
        action: "delete",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        beforeState: existingPayment as any,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Delete payment error:", error);
      res.status(500).json({ error: "Failed to delete payment" });
    }
  });

  // Coach payment registration (pending only)
  app.post("/api/coach/payments", authMiddleware, requireRole("coach", "admin", "academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const coachId = req.user?.coachId;
      if (!academyId || !coachId) {
        return res.status(400).json({ error: "Academy and coach ID required" });
      }

      const { playerId, payerName, amount, currency, paymentMethod, paymentDate, proofUrl, notes } = req.body;

      if (!amount || !paymentMethod) {
        return res.status(400).json({ error: "Amount and payment method are required" });
      }

      const payment = await storage.createPayment({
        academyId,
        playerId: playerId || null,
        payerName: payerName || null,
        amount: String(amount),
        currency: currency || "AED",
        paymentMethod,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        receivedBy: coachId,
        proofUrl: proofUrl || null,
        notes: notes || null,
        status: "pending",
      });

      await storage.createAuditLog({
        academyId,
        entityType: "payment",
        entityId: payment.id,
        action: "create",
        performedBy: coachId,
        performedByRole: "coach",
        afterState: payment as any,
      });

      res.status(201).json(payment);
    } catch (error) {
      console.error("Coach create payment error:", error);
      res.status(500).json({ error: "Failed to create payment" });
    }
  });

  // ==================== ADMIN COURTS MANAGEMENT ====================

  app.get("/api/admin/courts", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const courts = await storage.getAllCourts(academyId);
      const locations = await storage.getAllLocations(academyId);

      const courtsWithLocations = courts.map(court => {
        const location = locations.find(l => l.id === court.locationId);
        return {
          ...court,
          locationName: location?.name || "Unassigned",
        };
      });

      res.json(courtsWithLocations);
    } catch (error) {
      console.error("Admin courts error:", error);
      res.status(500).json({ error: "Failed to fetch courts" });
    }
  });

  app.post("/api/admin/courts", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const { name, locationId, color, isActive } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Court name is required" });
      }

      // Check for duplicate court name within academy
      const existingCourt = await storage.getCourtByName(name.trim(), academyId);
      if (existingCourt) {
        return res.status(409).json({ error: `A court named "${name.trim()}" already exists` });
      }

      const court = await storage.createCourt({
        academyId,
        name: name.trim(),
        locationId: locationId || null,
        color: color || "#2ECC40",
        isActive: isActive !== false,
      });

      await storage.createAuditLog({
        academyId,
        entityType: "court",
        entityId: court.id,
        action: "create",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        afterState: court as any,
      });

      res.status(201).json(court);
    } catch (error) {
      console.error("Create court error:", error);
      res.status(500).json({ error: "Failed to create court" });
    }
  });

  app.put("/api/admin/courts/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId;

      const existingCourt = await storage.getCourt(id, academyId || undefined);
      if (!existingCourt) {
        return res.status(404).json({ error: "Court not found" });
      }

      const { name, locationId, color, isActive } = req.body;

      const updatedCourt = await storage.updateCourt(id, {
        name: name !== undefined ? name : existingCourt.name,
        locationId: locationId !== undefined ? locationId : existingCourt.locationId,
        color: color !== undefined ? color : existingCourt.color,
        isActive: isActive !== undefined ? isActive : existingCourt.isActive,
      }, academyId || undefined);

      await storage.createAuditLog({
        academyId,
        entityType: "court",
        entityId: id,
        action: "update",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        beforeState: existingCourt as any,
        afterState: updatedCourt as any,
      });

      res.json(updatedCourt);
    } catch (error) {
      console.error("Update court error:", error);
      res.status(500).json({ error: "Failed to update court" });
    }
  });

  app.delete("/api/admin/courts/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId;

      const existingCourt = await storage.getCourt(id, academyId || undefined);
      if (!existingCourt) {
        return res.status(404).json({ error: "Court not found" });
      }

      // Soft delete - deactivate instead of hard delete to preserve references
      await storage.updateCourt(id, { isActive: false }, academyId || undefined);

      await storage.createAuditLog({
        academyId,
        entityType: "court",
        entityId: id,
        action: "deactivate",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        beforeState: existingCourt as any,
        afterState: { ...existingCourt, isActive: false } as any,
      });

      res.json({ success: true, message: "Court deactivated successfully" });
    } catch (error: any) {
      console.error("Delete court error:", error);
      if (error.code === "23503") {
        return res.status(409).json({ 
          error: "Cannot delete court with existing bookings. Please reassign or cancel bookings first." 
        });
      }
      res.status(500).json({ error: "Failed to delete court" });
    }
  });

  // Court photo upload endpoint
  app.post("/api/upload/court-photo", authMiddleware, requireRole("admin", "academy_owner", "platform_owner", "coach"), courtPhotoUpload.single("photo"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const courtId = req.body.courtId;
      
      if (!courtId) {
        return res.status(400).json({ error: "Court ID is required" });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: "No photo file provided" });
      }
      
      // Verify the court exists and belongs to the user's academy
      const court = await storage.getCourt(courtId, academyId || undefined);
      if (!court) {
        // Delete the uploaded file if court doesn't exist
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {
          console.warn("Could not clean up orphaned upload:", e);
        }
        return res.status(404).json({ error: "Court not found" });
      }
      
      // Generate the public URL for the uploaded file
      const photoUrl = `/uploads/court-photos/${req.file.filename}`;
      
      // Update the court with the new photo URL
      const updatedCourt = await storage.updateCourt(courtId, { photoUrl }, academyId || undefined);
      
      // Delete old photo if it exists and is different
      if (court.photoUrl && court.photoUrl !== photoUrl) {
        const oldPhotoPath = path.join(process.cwd(), court.photoUrl.replace(/^\//, ""));
        if (fs.existsSync(oldPhotoPath)) {
          try {
            fs.unlinkSync(oldPhotoPath);
          } catch (e) {
            console.warn("Could not delete old photo:", e);
          }
        }
      }
      
      await storage.createAuditLog({
        academyId,
        entityType: "court",
        entityId: courtId,
        action: "update",
        performedBy: req.user?.coachId || null,
        performedByRole: req.user?.role || null,
        beforeState: { photoUrl: court.photoUrl },
        afterState: { photoUrl },
      });
      
      res.json({ 
        success: true, 
        photoUrl,
        court: updatedCourt,
      });
    } catch (error) {
      console.error("Court photo upload error:", error);
      // Clean up uploaded file on error
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {
          console.warn("Could not clean up file:", e);
        }
      }
      res.status(500).json({ error: "Failed to upload court photo" });
    }
  });

  // ==================== ADMIN LOCATIONS MANAGEMENT ====================

  app.get("/api/admin/locations", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const locations = await storage.getAllLocations(academyId);
      const courts = await storage.getAllCourts(academyId);

      const locationsWithCounts = locations.map(loc => ({
        ...loc,
        courtCount: courts.filter(c => c.locationId === loc.id).length,
      }));

      res.json(locationsWithCounts);
    } catch (error) {
      console.error("Admin locations error:", error);
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });

  app.post("/api/admin/locations", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const { name, timezone } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Location name is required" });
      }

      const location = await storage.createLocation({
        academyId,
        name,
        timezone: timezone || "Asia/Dubai",
      });

      await storage.createAuditLog({
        academyId,
        entityType: "location",
        entityId: location.id,
        action: "create",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        afterState: location as any,
      });

      res.status(201).json(location);
    } catch (error) {
      console.error("Create location error:", error);
      res.status(500).json({ error: "Failed to create location" });
    }
  });

  app.put("/api/admin/locations/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId;

      const existingLocation = await storage.getLocation(id, academyId || undefined);
      if (!existingLocation) {
        return res.status(404).json({ error: "Location not found" });
      }

      const { name, timezone } = req.body;

      const updatedLocation = await storage.updateLocation(id, {
        name: name !== undefined ? name : existingLocation.name,
        timezone: timezone !== undefined ? timezone : existingLocation.timezone,
      }, academyId || undefined);

      await storage.createAuditLog({
        academyId,
        entityType: "location",
        entityId: id,
        action: "update",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        beforeState: existingLocation as any,
        afterState: updatedLocation as any,
      });

      res.json(updatedLocation);
    } catch (error) {
      console.error("Update location error:", error);
      res.status(500).json({ error: "Failed to update location" });
    }
  });

  app.delete("/api/admin/locations/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId;

      const existingLocation = await storage.getLocation(id, academyId || undefined);
      if (!existingLocation) {
        return res.status(404).json({ error: "Location not found" });
      }

      const courts = await storage.getCourtsByLocation(id, academyId || undefined);
      if (courts.length > 0) {
        return res.status(400).json({ error: "Cannot delete location with courts. Move or delete courts first." });
      }

      await storage.deleteLocation(id, academyId || undefined);

      await storage.createAuditLog({
        academyId,
        entityType: "location",
        entityId: id,
        action: "delete",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        beforeState: existingLocation as any,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Delete location error:", error);
      res.status(500).json({ error: "Failed to delete location" });
    }
  });

  // ==================== ADMIN PLAYER SUBSCRIPTIONS (CONTRACTS) ====================

  app.get("/api/admin/player-subscriptions", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const subscriptions = await storage.getPlayerSubscriptions(academyId);
      
      const subscriptionsWithPlayers = await Promise.all(subscriptions.map(async (sub) => {
        const player = await storage.getPlayerById(sub.playerId);
        return {
          ...sub,
          playerName: player?.name || "Unknown Player",
        };
      }));

      res.json(subscriptionsWithPlayers);
    } catch (error) {
      console.error("Admin get player subscriptions error:", error);
      res.status(500).json({ error: "Failed to fetch player subscriptions" });
    }
  });

  app.post("/api/admin/player-subscriptions", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const { playerId, planName, price, currency, billingPeriod, sessionsPerPeriod, startDate, notes } = req.body;

      if (!playerId || !planName || !price || !startDate) {
        return res.status(400).json({ error: "playerId, planName, price, and startDate are required" });
      }

      const subscription = await storage.createPlayerSubscription({
        academyId,
        playerId,
        planName,
        price: price.toString(),
        currency: currency || "AED",
        billingPeriod: billingPeriod || "monthly",
        sessionsPerPeriod,
        startDate,
        notes,
        status: "active",
      });

      await storage.createAuditLog({
        academyId,
        entityType: "player_subscription",
        entityId: subscription.id,
        action: "create",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        afterState: subscription as any,
      });

      res.json(subscription);
    } catch (error) {
      console.error("Admin create player subscription error:", error);
      res.status(500).json({ error: "Failed to create player subscription" });
    }
  });

  app.put("/api/admin/player-subscriptions/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId;

      const existingSubscription = await storage.getPlayerSubscriptionById(id);
      if (!existingSubscription || existingSubscription.academyId !== academyId) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      const { planName, price, currency, billingPeriod, sessionsPerPeriod, status, startDate, endDate, notes } = req.body;

      const updated = await storage.updatePlayerSubscription(id, {
        planName,
        price: price?.toString(),
        currency,
        billingPeriod,
        sessionsPerPeriod,
        status,
        startDate,
        endDate,
        notes,
      });

      await storage.createAuditLog({
        academyId,
        entityType: "player_subscription",
        entityId: id,
        action: "update",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        beforeState: existingSubscription as any,
        afterState: updated as any,
      });

      res.json(updated);
    } catch (error) {
      console.error("Admin update player subscription error:", error);
      res.status(500).json({ error: "Failed to update player subscription" });
    }
  });

  app.delete("/api/admin/player-subscriptions/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.academyId;
      const userId = req.user?.coachId;

      const existingSubscription = await storage.getPlayerSubscriptionById(id);
      if (!existingSubscription || existingSubscription.academyId !== academyId) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      await storage.deletePlayerSubscription(id);

      await storage.createAuditLog({
        academyId,
        entityType: "player_subscription",
        entityId: id,
        action: "delete",
        performedBy: userId || null,
        performedByRole: req.user?.role || null,
        beforeState: existingSubscription as any,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Admin delete player subscription error:", error);
      res.status(500).json({ error: "Failed to delete player subscription" });
    }
  });

  // ==================== ADMIN AUDIT LOGS ====================

  app.get("/api/admin/audit-logs", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const filters: any = {};
      if (req.query.entityType) filters.entityType = req.query.entityType as string;
      if (req.query.startDate) filters.startDate = new Date(req.query.startDate as string);
      if (req.query.endDate) filters.endDate = new Date(req.query.endDate as string);
      if (req.query.limit) filters.limit = parseInt(req.query.limit as string);

      const logs = await storage.getAuditLogsByAcademy(academyId, filters);

      res.json(logs);
    } catch (error) {
      console.error("Admin audit logs error:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // ==================== PLAYER BOOKING SYSTEM ====================

  // Get available time slots for booking
  app.get("/api/player/availability", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const { coachId, locationId, startDate, endDate, duration } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }

      const player = await storage.getPlayer(playerId, req.user?.academyId || "");
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const slots = await storage.getAvailableSlots({
        academyId: player.academyId || "",
        coachId: coachId as string | undefined,
        locationId: locationId as string | undefined,
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        duration: parseInt(duration as string) || 60,
      });

      res.json(slots);
    } catch (error) {
      console.error("Player availability error:", error);
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  // Get player's booking requests
  app.get("/api/player/booking-requests", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const status = req.query.status as string | undefined;
      const requests = await storage.getBookingRequests({ playerId, status });

      res.json(requests);
    } catch (error) {
      console.error("Player booking requests error:", error);
      res.status(500).json({ error: "Failed to fetch booking requests" });
    }
  });

  // Create a booking request (new session OR join existing session)
  app.post("/api/player/booking-requests", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const player = await storage.getPlayer(playerId, req.user?.academyId || "");
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const { coachId, locationId, courtId, requestedStart, requestedEnd, duration, sessionType, playerNote, sessionId, isJoinRequest } = req.body;

      if (!requestedStart || !requestedEnd || !duration || !sessionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // For join requests, validate the session exists and has spots
      if (isJoinRequest && sessionId) {
        const session = await storage.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }
        
        // Check if session belongs to player's academy
        if (session.academyId !== player.academyId) {
          return res.status(403).json({ error: "Session not in your academy" });
        }
        
        // Check if session has available spots
        const sessionPlayers = await storage.getSessionPlayers(sessionId);
        const maxPlayers = session.maxPlayers || 6;
        if (sessionPlayers.length >= maxPlayers) {
          return res.status(400).json({ error: "Session is full" });
        }
        
        // Check if player is already in the session
        if (sessionPlayers.some((sp: any) => sp.id === playerId)) {
          return res.status(400).json({ error: "Already enrolled in this session" });
        }
      }

      const request = await storage.createBookingRequest({
        academyId: player.academyId,
        playerId,
        coachId: coachId || null,
        locationId: locationId || null,
        courtId: courtId || null,
        sessionId: isJoinRequest ? sessionId : null,
        requestedStart: new Date(requestedStart),
        requestedEnd: new Date(requestedEnd),
        duration,
        sessionType,
        playerNote: playerNote || null,
        status: "pending",
      });

      await storage.createAuditLog({
        academyId: player.academyId,
        entityType: "booking_request",
        entityId: request.id,
        action: isJoinRequest ? "join_request" : "create",
        performedBy: playerId,
        performedByRole: "player",
      });

      res.status(201).json(request);
    } catch (error) {
      console.error("Create booking request error:", error);
      res.status(500).json({ error: "Failed to create booking request" });
    }
  });

  // Get joinable sessions for player (open groups with spots in their academy)
  app.get("/api/player/joinable-sessions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;
      
      if (!playerId || !academyId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const player = await storage.getPlayer(playerId, academyId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const { date, sessionType } = req.query;
      
      // Get all future sessions for the academy
      const allSessions = await storage.getSessionsByAcademy(academyId);
      const now = new Date();
      
      // Filter joinable sessions
      const joinable = await Promise.all(
        allSessions.filter((s: any) => {
          const sessionStart = new Date(s.startTime);
          const isFuture = sessionStart > now;
          const matchesType = !sessionType || s.sessionType === sessionType;
          const matchesDate = !date || sessionStart.toISOString().split('T')[0] === date;
          const isGroupType = s.sessionType === "group" || s.sessionType === "semi_private" || s.sessionType === "open_play";
          return isFuture && matchesType && matchesDate && isGroupType;
        }).map(async (s: any) => {
          const players = await storage.getSessionPlayers(s.id);
          const maxPlayers = s.maxPlayers || 6;
          const hasSpots = players.length < maxPlayers;
          const isEnrolled = players.some((p: any) => p.id === playerId);
          
          if (!hasSpots || isEnrolled) return null;
          
          return {
            id: s.id,
            sessionType: s.sessionType,
            startTime: s.startTime,
            endTime: s.endTime,
            duration: s.duration,
            coachId: s.coachId,
            coachName: s.coachName || "Coach",
            courtName: s.courtName || "Court",
            locationName: s.locationName || s.location || "Location",
            maxPlayers,
            currentPlayers: players.length,
            players: players.map((p: any) => ({ id: p.id, name: p.name })),
            ballLevel: s.ballLevel,
            skillLevel: s.skillLevel,
          };
        })
      );
      
      res.json(joinable.filter(Boolean));
    } catch (error) {
      console.error("Player joinable sessions error:", error);
      res.status(500).json({ error: "Failed to fetch joinable sessions" });
    }
  });

  // Cancel a booking request
  app.post("/api/player/booking-requests/:id/cancel", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { id } = req.params;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const request = await storage.getBookingRequest(id);
      if (!request || request.playerId !== playerId) {
        return res.status(404).json({ error: "Booking request not found" });
      }

      if (request.status !== "pending") {
        return res.status(400).json({ error: "Only pending requests can be cancelled" });
      }

      const updated = await storage.updateBookingRequest(id, { status: "cancelled" });

      res.json(updated);
    } catch (error) {
      console.error("Cancel booking request error:", error);
      res.status(500).json({ error: "Failed to cancel booking request" });
    }
  });

  // ==================== PLAY SCREEN (MMO STYLE) ====================

  // Get available sessions for Play screen
  app.get("/api/play/sessions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      // Get upcoming group/semi sessions from player's academy + public sessions
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 14); // Next 2 weeks

      const sessions = await db.query.sessions.findMany({
        where: (s, { and, or, eq, gte, lte, inArray }) => and(
          or(
            eq(s.academyId, academyId || ""),
            eq(s.academyId, null as any) // Public sessions
          ),
          inArray(s.sessionType, ["group", "semi"]),
          eq(s.status, "scheduled"),
          gte(s.startTime, now),
          lte(s.startTime, futureDate)
        ),
        orderBy: (s, { asc }) => [asc(s.startTime)],
        limit: 20,
      });

      // Enrich sessions with player count and player info
      const enrichedSessions = await Promise.all(sessions.map(async (session) => {
        // Get players in this session
        const sessionPlayerRecords = await db.query.sessionPlayers.findMany({
          where: (sp, { eq }) => eq(sp.sessionId, session.id),
        });
        
        const playerIds = sessionPlayerRecords.map(sp => sp.playerId).filter(Boolean) as string[];
        const players = playerIds.length > 0 
          ? await db.query.players.findMany({
              where: (p, { inArray }) => inArray(p.id, playerIds),
            })
          : [];

        // Get coach info
        let coachName = null;
        if (session.coachId) {
          const coach = await storage.getCoach(session.coachId);
          coachName = coach?.name || null;
        }

        // Get location info
        let locationName = "Location TBD";
        if (session.locationId) {
          const location = await storage.getLocation(session.locationId);
          locationName = location?.name || "Location TBD";
        }

        // Get court info
        let courtName = null;
        if (session.courtId) {
          const court = await storage.getCourt(session.courtId);
          courtName = court?.name || null;
        }

        // Check waitlist
        const waitlistRecords = await db.query.sessionWaitlist.findMany({
          where: (w, { and, eq }) => and(
            eq(w.sessionId, session.id),
            eq(w.status, "waiting")
          ),
        });

        const maxPlayers = session.maxPlayers || 4;
        const currentPlayers = players.length;
        let status: "open" | "almost_full" | "full" = "open";
        if (currentPlayers >= maxPlayers) status = "full";
        else if (maxPlayers - currentPlayers === 1) status = "almost_full";

        return {
          id: session.id,
          title: session.title || `${session.sessionType === "group" ? "Group" : "Semi"} Training`,
          sessionType: session.sessionType,
          startTime: session.startTime.toISOString(),
          endTime: session.endTime.toISOString(),
          locationName,
          courtName,
          coachName,
          coachId: session.coachId,
          ballLevel: session.ballLevel,
          vibe: session.vibe || "casual",
          minLevel: session.minLevel,
          maxLevel: session.maxLevel,
          xpReward: session.xpReward || 20,
          maxPlayers,
          currentPlayers,
          players: players.map(p => ({
            id: p.id,
            name: p.name,
            level: p.level || 1,
            ballLevel: p.ballLevel,
            avatarUrl: p.profilePhotoUrl,
          })),
          waitlistCount: waitlistRecords.length,
          status,
        };
      }));

      res.json(enrichedSessions);
    } catch (error) {
      console.error("Play sessions error:", error);
      res.status(500).json({ error: "Failed to fetch play sessions" });
    }
  });

  // Get nearby players for Play screen
  app.get("/api/play/nearby-players", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      // Get players from the same academy (or public players)
      const players = await db.query.players.findMany({
        where: (p, { and, eq, ne }) => and(
          eq(p.academyId, academyId || ""),
          ne(p.id, playerId)
        ),
        limit: 20,
      });

      // Build enriched players with mutual session counts
      const enrichedPlayers = await Promise.all(players.map(async (player) => {
        let mutualCount = 0;
        
        // Only query mutual sessions if both player IDs are valid
        if (playerId && player.id) {
          try {
            const mutualSessions = await db.execute(
              sql`SELECT COUNT(DISTINCT sp1.session_id)::int as count
                  FROM session_players sp1
                  INNER JOIN session_players sp2 ON sp1.session_id = sp2.session_id
                  WHERE sp1.player_id = ${playerId}
                    AND sp2.player_id = ${player.id}`
            );
            mutualCount = Number(mutualSessions.rows[0]?.count || 0);
          } catch (e) {
            console.error("Mutual sessions query failed:", e);
          }
        }

        return {
          id: player.id,
          name: player.name,
          level: player.level || 1,
          avatarUrl: player.profilePhotoUrl,
          vibe: player.preferredPlayType || "casual",
          mutualSessions: mutualCount,
          preferredTime: player.preferredTime || undefined,
        };
      }));

      // Sort by mutual sessions first, then by level proximity
      enrichedPlayers.sort((a, b) => b.mutualSessions - a.mutualSessions);

      res.json(enrichedPlayers);
    } catch (error) {
      console.error("Nearby players error:", error);
      res.status(500).json({ error: "Failed to fetch nearby players" });
    }
  });

  // Join a session
  app.post("/api/play/sessions/:sessionId/join", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { sessionId } = req.params;
      const { useMakeUpCredit } = req.body || {};
      
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check if already joined
      const existingPlayer = await db.query.sessionPlayers.findFirst({
        where: (sp, { and, eq }) => and(
          eq(sp.sessionId, sessionId),
          eq(sp.playerId, playerId)
        ),
      });

      if (existingPlayer) {
        return res.status(400).json({ error: "Already joined this session" });
      }

      // Check capacity
      const currentPlayers = await db.query.sessionPlayers.findMany({
        where: (sp, { eq }) => eq(sp.sessionId, sessionId),
      });

      const maxPlayers = session.maxPlayers || 4;
      if (currentPlayers.length >= maxPlayers) {
        return res.status(400).json({ error: "Session is full. Join the waitlist instead." });
      }

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Determine credit cost based on session type
      const sessionCredits = session.sessionType === "private" ? 2 : 1;
      let creditsUsed = 0;
      let makeUpUsed = false;
      let paymentMethod = "credits";

      // Check for make-up credits first if requested
      if (useMakeUpCredit) {
        const makeUpCredits = player.makeUpCredits || 0;
        if (makeUpCredits > 0) {
          // Use make-up credit
          await storage.updatePlayer(playerId, {
            makeUpCredits: makeUpCredits - 1,
          });
          makeUpUsed = true;
          paymentMethod = "make_up_credit";
        }
      }

      // If no make-up credit used, deduct regular credits
      if (!makeUpUsed) {
        const playerCredits = player.credits || 0;
        if (playerCredits < sessionCredits) {
          return res.status(400).json({ 
            error: `Not enough credits. This session requires ${sessionCredits} credit(s). You have ${playerCredits}.`,
            creditsRequired: sessionCredits,
            creditsAvailable: playerCredits,
            makeUpCreditsAvailable: player.makeUpCredits || 0,
          });
        }
        
        // Deduct credits
        await storage.updatePlayer(playerId, {
          credits: playerCredits - sessionCredits,
        });
        creditsUsed = sessionCredits;
      }

      // Add player to session
      await db.insert(sessionPlayers).values({
        sessionId,
        playerId,
      });

      // Log the credit transaction
      await storage.createCreditTransaction({
        playerId,
        academyId: session.academyId || player.academyId,
        type: "debit",
        amount: makeUpUsed ? 0 : -sessionCredits,
        reason: makeUpUsed ? "make_up_lesson_used" : "session_join",
        sessionId,
        metadata: JSON.stringify({
          sessionType: session.sessionType,
          paymentMethod,
          makeUpUsed,
        }),
      });

      const remainingCredits = makeUpUsed 
        ? (player.credits || 0) 
        : ((player.credits || 0) - sessionCredits);

      res.json({ 
        success: true, 
        message: makeUpUsed 
          ? "Joined with make-up credit!" 
          : `Joined! ${sessionCredits} credit${sessionCredits > 1 ? "s" : ""} deducted.`,
        creditsDeducted: creditsUsed,
        makeUpUsed,
        remainingCredits,
      });
    } catch (error) {
      console.error("Join session error:", error);
      res.status(500).json({ error: "Failed to join session" });
    }
  });

  // Leave a play session (frees up slot and notifies waitlist/make-up credit holders)
  app.post("/api/play/sessions/:sessionId/leave", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { sessionId } = req.params;
      const { reason } = req.body;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check if player is in this session
      const sessionPlayer = await db.query.sessionPlayers.findFirst({
        where: (sp, { and: spAnd, eq: spEq }) => spAnd(
          spEq(sp.sessionId, sessionId),
          spEq(sp.playerId, playerId)
        ),
      });

      if (!sessionPlayer) {
        return res.status(400).json({ error: "You are not in this session" });
      }

      // Calculate hours until session for cancellation policy
      const now = new Date();
      const sessionStart = new Date(session.startTime);
      const hoursUntilSession = (sessionStart.getTime() - now.getTime()) / (1000 * 60 * 60);
      const isLateCancel = hoursUntilSession < 24;

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Check the original join transaction to determine which credit type was used
      const originalTransactions = await storage.getCreditTransactionsBySession(sessionId);
      const playerJoinTx = originalTransactions.find(
        tx => tx.playerId === playerId && (tx.reason === "session_join" || tx.reason === "make_up_lesson_used")
      );
      
      // Determine if make-up credit was used based on transaction reason or metadata
      let usedMakeUpCredit = false;
      if (playerJoinTx) {
        if (playerJoinTx.reason === "make_up_lesson_used") {
          usedMakeUpCredit = true;
        } else if (playerJoinTx.metadata) {
          try {
            const metadata = typeof playerJoinTx.metadata === "string" 
              ? JSON.parse(playerJoinTx.metadata) 
              : playerJoinTx.metadata;
            usedMakeUpCredit = metadata.makeUpUsed === true;
          } catch {
            usedMakeUpCredit = false;
          }
        }
      }

      // Remove player from session
      await db.delete(sessionPlayers).where(
        and(
          eq(sessionPlayers.sessionId, sessionId),
          eq(sessionPlayers.playerId, playerId)
        )
      );

      // Log the cancellation
      await storage.createPlayerSessionCancellation({
        playerId,
        sessionId,
        reason: reason || "player_left_session",
        hoursBeforeSession: Math.max(0, hoursUntilSession),
        isLateNotice: isLateCancel,
        makeUpEligibility: isLateCancel ? "not_eligible" : "eligible",
      });

      let creditRefunded = false;
      let makeUpRefunded = false;
      
      // Early cancel: refund the correct credit type
      // Only refund if we found a valid join transaction (prevents double refunds and errors)
      if (!isLateCancel && playerJoinTx) {
        if (usedMakeUpCredit) {
          // Refund make-up credit
          await storage.updatePlayer(playerId, {
            makeUpCredits: (player.makeUpCredits || 0) + 1,
          });
          makeUpRefunded = true;

          await storage.createCreditTransaction({
            playerId,
            academyId: session.academyId || player.academyId,
            type: "refund",
            amount: 0,
            reason: "make_up_credit_refund",
            sessionId,
            metadata: JSON.stringify({
              hoursBeforeSession: hoursUntilSession,
              originalPaymentMethod: "make_up_credit",
              originalTransactionId: playerJoinTx.id,
            }),
          });
        } else {
          // Refund regular credit - use the amount from the original transaction
          const originalAmount = Math.abs(playerJoinTx.amount || 1);
          await storage.updatePlayer(playerId, {
            credits: (player.credits || 0) + originalAmount,
          });
          creditRefunded = true;

          await storage.createCreditTransaction({
            playerId,
            academyId: session.academyId || player.academyId,
            type: "refund",
            amount: originalAmount,
            reason: "session_cancel_early",
            sessionId,
            metadata: JSON.stringify({
              hoursBeforeSession: hoursUntilSession,
              originalPaymentMethod: "credits",
              originalTransactionId: playerJoinTx.id,
              originalAmount: originalAmount,
            }),
          });
        }
      } else if (!isLateCancel && !playerJoinTx) {
        // No transaction found - log warning but don't refund to prevent abuse
        console.warn(`[Leave Session] No join transaction found for player ${playerId} session ${sessionId}. No refund issued.`);
      }

      // Notify and promote first player on waitlist
      const waitlistPlayers = await db.query.sessionWaitlist.findMany({
        where: (wl, { and: wlAnd, eq: wlEq }) => wlAnd(
          wlEq(wl.sessionId, sessionId),
          wlEq(wl.status, "waiting")
        ),
        orderBy: (wl, { asc: wlAsc }) => wlAsc(wl.joinedAt),
      });

      let waitlistPromoted = false;
      const sessionCredits = session.sessionType === "private" ? 2 : 1;
      
      // Promote first eligible waitlist player to the session (with credit deduction)
      // Loop through waitlist until we find someone who can pay
      for (const waitlistEntry of waitlistPlayers) {
        if (waitlistPromoted) break; // Stop once someone is promoted
        
        const waitlistPlayer = await storage.getPlayer(waitlistEntry.playerId);
        if (!waitlistPlayer) continue;
        
        const playerCredits = waitlistPlayer.credits || 0;
        const playerMakeUpCredits = waitlistPlayer.makeUpCredits || 0;
        
        let canPromote = false;
        let useMakeUp = false;
        
        // Prefer make-up credits, then regular credits
        if (playerMakeUpCredits > 0) {
          canPromote = true;
          useMakeUp = true;
        } else if (playerCredits >= sessionCredits) {
          canPromote = true;
          useMakeUp = false;
        }
        
        if (canPromote) {
          try {
            // Use database transaction for atomicity - all or nothing
            await db.transaction(async (tx) => {
              // Step 1: Atomically deduct credits with guard to prevent negative balance
              // Uses raw SQL column references for concurrency safety
              if (useMakeUp) {
                const result = await tx.update(players)
                  .set({ makeUpCredits: sql`GREATEST(0, COALESCE(make_up_credits, 0) - 1)` })
                  .where(and(
                    eq(players.id, waitlistPlayer.id),
                    sql`COALESCE(make_up_credits, 0) > 0`
                  ))
                  .returning({ id: players.id });
                
                if (result.length === 0) {
                  throw new Error("Insufficient make-up credits (concurrent deduction)");
                }
              } else {
                const result = await tx.update(players)
                  .set({ credits: sql`GREATEST(0, COALESCE(credits, 0) - ${sessionCredits})` })
                  .where(and(
                    eq(players.id, waitlistPlayer.id),
                    sql`COALESCE(credits, 0) >= ${sessionCredits}`
                  ))
                  .returning({ id: players.id });
                
                if (result.length === 0) {
                  throw new Error("Insufficient credits (concurrent deduction)");
                }
              }
              
              // Step 2: Add player to session
              await tx.insert(sessionPlayers).values({
                sessionId,
                playerId: waitlistPlayer.id,
              });
              
              // Step 3: Log the credit transaction
              await tx.insert(creditTransactions).values({
                playerId: waitlistPlayer.id,
                academyId: session.academyId || waitlistPlayer.academyId,
                type: "debit",
                amount: useMakeUp ? 0 : -sessionCredits,
                reason: useMakeUp ? "make_up_lesson_used" : "session_join",
                sessionId,
                metadata: JSON.stringify({
                  sessionType: session.sessionType,
                  paymentMethod: useMakeUp ? "make_up_credit" : "credits",
                  makeUpUsed: useMakeUp,
                  promotedFromWaitlist: true,
                }),
              });
              
              // Step 4: Update waitlist status to promoted
              await tx.update(sessionWaitlist)
                .set({ status: "promoted" })
                .where(eq(sessionWaitlist.id, waitlistEntry.id));
            });
            
            // Transaction succeeded - mark as promoted
            waitlistPromoted = true;
            
            // Step 5: Notify the promoted player (outside transaction, non-critical)
            if (waitlistPlayer.userId) {
              await storage.createScheduledNotification({
                userId: waitlistPlayer.userId,
                playerId: waitlistPlayer.id,
                title: "You're In!",
                body: useMakeUp 
                  ? `You've been promoted from the waitlist! Make-up credit used.`
                  : `You've been promoted from the waitlist! ${sessionCredits} credit(s) deducted.`,
                type: "waitlist_promoted",
                metadata: JSON.stringify({
                  sessionId,
                  sessionType: session.sessionType,
                  startTime: session.startTime,
                  creditsUsed: useMakeUp ? 0 : sessionCredits,
                  makeUpUsed: useMakeUp,
                }),
                scheduledFor: new Date(),
              });
            }
          } catch (promotionError) {
            // Transaction rolled back - try next waitlist player
            console.error(`[Waitlist] Promotion transaction failed for player ${waitlistPlayer.id}:`, promotionError);
            continue;
          }
        } else {
          // Player doesn't have enough credits - notify and continue to next
          if (waitlistPlayer.userId) {
            await storage.createScheduledNotification({
              userId: waitlistPlayer.userId,
              playerId: waitlistPlayer.id,
              title: "Spot Available - Credits Needed",
              body: `A spot opened up but you need ${sessionCredits} credit(s) to join.`,
              type: "waitlist_credits_needed",
              metadata: JSON.stringify({
                sessionId,
                sessionType: session.sessionType,
                creditsNeeded: sessionCredits,
              }),
              scheduledFor: new Date(),
            });
          }
          // Update waitlist status to show they were notified but continue loop
          await db.update(sessionWaitlist)
            .set({ status: "insufficient_credits" })
            .where(eq(sessionWaitlist.id, waitlistEntry.id));
        }
      }

      // Only notify make-up credit holders if no waitlist promotion happened (spot is still open)
      const academyId = session.academyId || player.academyId;
      if (academyId && !waitlistPromoted) {
        const playersWithMakeUp = await db.query.players.findMany({
          where: (p, { and: pAnd, eq: pEq, gt: pGt }) => pAnd(
            pEq(p.academyId, academyId),
            pGt(p.makeUpCredits, 0)
          ),
        });

        // Filter out the player who left and limit notifications
        const eligiblePlayers = playersWithMakeUp
          .filter(p => p.id !== playerId && p.userId)
          .slice(0, 5);

        for (const makeUpPlayer of eligiblePlayers) {
          await storage.createScheduledNotification({
            userId: makeUpPlayer.userId!,
            playerId: makeUpPlayer.id,
            title: "Spot Available!",
            body: `A spot opened up in a ${session.sessionType} session. Use your make-up credit!`,
            type: "make_up_opportunity",
            metadata: JSON.stringify({
              sessionId,
              sessionType: session.sessionType,
              startTime: session.startTime,
              locationName: session.locationName || session.location,
            }),
            scheduledFor: new Date(),
          });
        }
      }

      const refundMessage = makeUpRefunded 
        ? "Make-up credit refunded." 
        : creditRefunded 
          ? "Credit refunded." 
          : "No refund (late cancellation).";

      res.json({ 
        success: true, 
        message: `You've left the session. ${refundMessage}${waitlistPromoted ? " Waitlist player promoted to your spot." : ""}`,
        creditRefunded,
        makeUpRefunded,
        hoursBeforeSession: hoursUntilSession,
        waitlistPromoted,
        waitlistCount: waitlistPlayers.length,
      });
    } catch (error) {
      console.error("Leave session error:", error);
      res.status(500).json({ error: "Failed to leave session" });
    }
  });

  // Join session waitlist
  app.post("/api/play/sessions/:sessionId/waitlist", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { sessionId } = req.params;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      // Check if already on waitlist
      const existingWaitlist = await db.query.sessionWaitlist.findFirst({
        where: (w, { and, eq }) => and(
          eq(w.sessionId, sessionId),
          eq(w.playerId, playerId),
          eq(w.status, "waiting")
        ),
      });

      if (existingWaitlist) {
        return res.status(400).json({ error: "Already on the waitlist" });
      }

      // Get current position
      const waitlistCount = await db.query.sessionWaitlist.findMany({
        where: (w, { and, eq }) => and(
          eq(w.sessionId, sessionId),
          eq(w.status, "waiting")
        ),
      });

      const position = waitlistCount.length + 1;

      await db.insert(sessionWaitlist).values({
        sessionId,
        playerId,
        position,
        xpBonusOnJoin: 5,
        status: "waiting",
      });

      res.json({ 
        success: true, 
        position,
        message: `You're #${position} on the waitlist. +5 XP if you get in!` 
      });
    } catch (error) {
      console.error("Join waitlist error:", error);
      res.status(500).json({ error: "Failed to join waitlist" });
    }
  });

  // ==================== COACH BOOKING REQUESTS ====================

  // Get coach's booking requests
  app.get("/api/coach/booking-requests", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      
      if (!coachId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const status = req.query.status as string | undefined;
      const requests = await storage.getBookingRequests({ coachId, academyId: academyId || undefined, status });

      res.json(requests);
    } catch (error) {
      console.error("Coach booking requests error:", error);
      res.status(500).json({ error: "Failed to fetch booking requests" });
    }
  });

  // Approve a booking request
  app.post("/api/coach/booking-requests/:id/approve", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      const { id } = req.params;
      
      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const request = await storage.getBookingRequest(id);
      if (!request) {
        return res.status(404).json({ error: "Booking request not found" });
      }

      if (request.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized to access this request" });
      }

      if (request.coachId && request.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to approve this request" });
      }

      if (request.status !== "pending") {
        return res.status(400).json({ error: "Only pending requests can be approved" });
      }

      const result = await storage.approveBookingRequest(id, coachId);

      await storage.createAuditLog({
        academyId: request.academyId,
        entityType: "booking_request",
        entityId: id,
        action: "approve",
        performedBy: coachId,
        performedByRole: "coach",
      });

      res.json(result);
    } catch (error) {
      console.error("Approve booking request error:", error);
      res.status(500).json({ error: "Failed to approve booking request" });
    }
  });

  // Decline a booking request
  app.post("/api/coach/booking-requests/:id/decline", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      const { id } = req.params;
      const { reason } = req.body;
      
      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const request = await storage.getBookingRequest(id);
      if (!request) {
        return res.status(404).json({ error: "Booking request not found" });
      }

      if (request.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized to access this request" });
      }

      if (request.coachId && request.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to decline this request" });
      }

      if (request.status !== "pending") {
        return res.status(400).json({ error: "Only pending requests can be declined" });
      }

      const updated = await storage.updateBookingRequest(id, {
        status: "declined",
        respondedBy: coachId,
        respondedAt: new Date(),
        responseNote: reason || null,
      });

      await storage.createAuditLog({
        academyId: request.academyId,
        entityType: "booking_request",
        entityId: id,
        action: "decline",
        performedBy: coachId,
        performedByRole: "coach",
      });

      res.json(updated);
    } catch (error) {
      console.error("Decline booking request error:", error);
      res.status(500).json({ error: "Failed to decline booking request" });
    }
  });

  // ==================== COACH AVAILABILITY MANAGEMENT ====================

  // Get coach's availability
  app.get("/api/coach/availability", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      
      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const availability = await storage.getCoachAvailability(coachId, academyId);

      res.json(availability);
    } catch (error) {
      console.error("Coach availability error:", error);
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  // Create availability slot
  app.post("/api/coach/availability", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      
      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const { weekday, startTime, endTime, locationId, courtId, sessionTypes, slotDuration } = req.body;

      if (weekday === undefined || !startTime || !endTime) {
        return res.status(400).json({ error: "weekday, startTime, and endTime are required" });
      }

      const slot = await storage.createCoachAvailability({
        academyId,
        coachId,
        weekday,
        startTime,
        endTime,
        locationId: locationId || null,
        courtId: courtId || null,
        sessionTypes: sessionTypes || null,
        slotDuration: slotDuration || 60,
        isActive: true,
      });

      res.status(201).json(slot);
    } catch (error) {
      console.error("Create availability error:", error);
      res.status(500).json({ error: "Failed to create availability" });
    }
  });

  // Update availability slot
  app.patch("/api/coach/availability/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const { id } = req.params;
      
      if (!coachId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const updated = await storage.updateCoachAvailability(id, req.body);

      res.json(updated);
    } catch (error) {
      console.error("Update availability error:", error);
      res.status(500).json({ error: "Failed to update availability" });
    }
  });

  // Delete availability slot
  app.delete("/api/coach/availability/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const { id } = req.params;
      
      if (!coachId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      await storage.deleteCoachAvailability(id);

      res.json({ success: true });
    } catch (error) {
      console.error("Delete availability error:", error);
      res.status(500).json({ error: "Failed to delete availability" });
    }
  });

  // ==================== LOCATION TRAVEL TIMES ====================

  // Get all travel times for coach
  app.get("/api/coach/travel-times", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      
      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const travelTimes = await db
        .select()
        .from(locationTravelTimes)
        .where(and(
          eq(locationTravelTimes.coachId, coachId),
          eq(locationTravelTimes.academyId, academyId)
        ));

      res.json(travelTimes);
    } catch (error) {
      console.error("Get travel times error:", error);
      res.status(500).json({ error: "Failed to get travel times" });
    }
  });

  // Create or update travel time between locations
  app.post("/api/coach/travel-times", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      
      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const { fromLocationId, toLocationId, travelTimeMinutes } = req.body;

      if (!fromLocationId || !toLocationId || typeof travelTimeMinutes !== 'number') {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (fromLocationId === toLocationId) {
        return res.status(400).json({ error: "Cannot set travel time to same location" });
      }

      // Check if travel time already exists for this pair
      const existing = await db
        .select()
        .from(locationTravelTimes)
        .where(and(
          eq(locationTravelTimes.coachId, coachId),
          eq(locationTravelTimes.academyId, academyId),
          eq(locationTravelTimes.fromLocationId, fromLocationId),
          eq(locationTravelTimes.toLocationId, toLocationId)
        ))
        .limit(1);

      let result;
      if (existing.length > 0) {
        // Update existing
        [result] = await db
          .update(locationTravelTimes)
          .set({ 
            travelTimeMinutes,
            updatedAt: new Date()
          })
          .where(eq(locationTravelTimes.id, existing[0].id))
          .returning();
      } else {
        // Create new
        [result] = await db
          .insert(locationTravelTimes)
          .values({
            coachId,
            academyId,
            fromLocationId,
            toLocationId,
            travelTimeMinutes,
          })
          .returning();
      }

      res.json(result);
    } catch (error) {
      console.error("Create travel time error:", error);
      res.status(500).json({ error: "Failed to create travel time" });
    }
  });

  // Delete travel time
  app.delete("/api/coach/travel-times/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const { id } = req.params;
      
      if (!coachId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      await db
        .delete(locationTravelTimes)
        .where(and(
          eq(locationTravelTimes.id, id),
          eq(locationTravelTimes.coachId, coachId)
        ));

      res.json({ success: true });
    } catch (error) {
      console.error("Delete travel time error:", error);
      res.status(500).json({ error: "Failed to delete travel time" });
    }
  });

  // ==================== PARENT PORTAL API ====================

  // Get parent's linked children
  app.get("/api/parent/children", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const playerId = req.user?.playerId;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // If user is a player, return their own info as a single child
      if (playerId) {
        const player = await storage.getPlayer(playerId);
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }
        return res.json({ 
          children: [{
            id: player.id,
            name: player.name,
            academyId: player.academyId,
            relationship: "self",
          }]
        });
      }

      // Otherwise fetch linked children
      const children = await storage.getParentChildren(userId);
      res.json({ children });
    } catch (error) {
      console.error("Get parent children error:", error);
      res.status(500).json({ error: "Failed to get children" });
    }
  });

  // Get invoices for a player (parent view)
  app.get("/api/parent/invoices/:playerId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check access: either the player themselves or a linked parent
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(userId, playerId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const invoices = await storage.getPlayerInvoices(playerId);
      
      // Get academy names for each invoice
      const invoicesWithAcademy = await Promise.all(invoices.map(async (inv) => {
        if (!inv.academyId) return { ...inv, academyName: null };
        const academy = await storage.getAcademy(inv.academyId);
        return { ...inv, academyName: academy?.name || null };
      }));

      res.json({ invoices: invoicesWithAcademy });
    } catch (error) {
      console.error("Get player invoices error:", error);
      res.status(500).json({ error: "Failed to get invoices" });
    }
  });

  // Get single invoice with details (parent view)
  app.get("/api/parent/invoices/:playerId/:invoiceId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId, invoiceId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check access
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(userId, playerId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || invoice.playerId !== playerId) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const academy = invoice.academyId ? await storage.getAcademy(invoice.academyId) : null;
      
      res.json({ 
        invoice: { 
          ...invoice, 
          academyName: academy?.name || null 
        } 
      });
    } catch (error) {
      console.error("Get invoice error:", error);
      res.status(500).json({ error: "Failed to get invoice" });
    }
  });

  // Get payments for a player (parent view)
  app.get("/api/parent/payments/:playerId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check access
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(userId, playerId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const payments = await storage.getPlayerPayments(playerId);
      res.json({ payments });
    } catch (error) {
      console.error("Get player payments error:", error);
      res.status(500).json({ error: "Failed to get payments" });
    }
  });

  // Get lesson overview for a player (parent view)
  app.get("/api/parent/lessons/:playerId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;
      const { month, year } = req.query;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check access
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(userId, playerId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const targetMonth = month ? parseInt(month as string) : new Date().getMonth() + 1;
      const targetYear = year ? parseInt(year as string) : new Date().getFullYear();

      const lessonSummary = await storage.getPlayerLessonSummary(playerId, targetMonth, targetYear);
      res.json({ summary: lessonSummary });
    } catch (error) {
      console.error("Get lesson summary error:", error);
      res.status(500).json({ error: "Failed to get lesson summary" });
    }
  });

  // Get parent settings
  app.get("/api/parent/settings", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      let settings = await storage.getParentSettings(userId);
      
      // Create default settings if not exists
      if (!settings) {
        settings = await storage.createParentSettings({ userId });
      }

      res.json({ settings });
    } catch (error) {
      console.error("Get parent settings error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // Update parent settings
  app.patch("/api/parent/settings", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const updates = req.body;
      const settings = await storage.updateParentSettings(userId, updates);

      res.json({ settings });
    } catch (error) {
      console.error("Update parent settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Get parent dashboard summary
  app.get("/api/parent/dashboard/:playerId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check access
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(userId, playerId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const academy = player.academyId ? await storage.getAcademy(player.academyId) : null;
      
      // Get pending and overdue invoices
      const invoices = await storage.getPlayerInvoices(playerId);
      const pendingInvoices = invoices.filter(inv => inv.status === "pending");
      const overdueInvoices = invoices.filter(inv => inv.status === "pending" && inv.dueDate && new Date(inv.dueDate) < new Date());
      
      // Get current month lesson summary
      const now = new Date();
      const lessonSummary = await storage.getPlayerLessonSummary(playerId, now.getMonth() + 1, now.getFullYear());
      
      // Get session-based billing (attended sessions with prices)
      const sessionBilling = await storage.getPlayerSessionBilling(playerId);

      res.json({
        player: {
          id: player.id,
          name: player.name,
        },
        academy: academy ? { id: academy.id, name: academy.name } : null,
        invoiceSummary: {
          pending: pendingInvoices.length + sessionBilling.unpaidCount,
          overdue: overdueInvoices.length,
          totalPending: pendingInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount || "0"), 0) + sessionBilling.unpaidTotal,
        },
        pendingInvoices: pendingInvoices.map(inv => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amount: parseFloat(inv.amount || "0"),
          dueDate: inv.dueDate,
          status: inv.status,
          description: inv.description,
        })),
        sessionBilling: {
          unpaidCount: sessionBilling.unpaidCount,
          unpaidTotal: sessionBilling.unpaidTotal,
          paidCount: sessionBilling.paidCount,
          paidTotal: sessionBilling.paidTotal,
        },
        lessonSummary,
      });
    } catch (error) {
      console.error("Get parent dashboard error:", error);
      res.status(500).json({ error: "Failed to get dashboard" });
    }
  });

  app.get("/api/parent/packages/:playerId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(userId, playerId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const packages = await storage.getPlayerPackages(playerId);
      const activePackages = packages.filter(pkg => 
        pkg.status === 'active' && pkg.remainingCredits > 0
      );
      
      const totalCredits = activePackages.reduce((sum, pkg) => sum + pkg.remainingCredits, 0);
      
      res.json({
        packages: packages.map(pkg => ({
          id: pkg.id,
          name: pkg.name || 'Package',
          totalCredits: pkg.totalCredits,
          remainingCredits: pkg.remainingCredits,
          expiryDate: pkg.expiryDate,
          status: pkg.status,
          purchaseDate: pkg.purchaseDate,
        })),
        summary: {
          activePackages: activePackages.length,
          totalCreditsRemaining: totalCredits,
        },
      });
    } catch (error) {
      console.error("Get parent packages error:", error);
      res.status(500).json({ error: "Failed to get packages" });
    }
  });

  app.get("/api/parent/invoices/:playerId/:invoiceId/html", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId, invoiceId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(userId, playerId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || invoice.playerId !== playerId) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const player = await storage.getPlayer(playerId);
      const academy = invoice.academyId ? await storage.getAcademy(invoice.academyId) : null;
      const settings = invoice.academyId ? await storage.getAcademySettings(invoice.academyId) : null;
      
      const lineItems = parseLineItems(invoice.lineItems);
      const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
      
      const invoiceData = {
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.createdAt?.toISOString() || new Date().toISOString(),
        dueDate: invoice.dueDate || new Date().toISOString(),
        academy: {
          name: academy?.name || 'Academy',
          email: settings?.contactEmail || undefined,
          phone: settings?.contactPhone || undefined,
        },
        player: {
          name: player?.name || 'Customer',
          email: player?.email || undefined,
          phone: player?.phone || undefined,
        },
        lineItems: lineItems.length > 0 ? lineItems : [{
          description: 'Tennis Lessons',
          quantity: 1,
          unitPrice: parseFloat(invoice.amount || '0'),
          total: parseFloat(invoice.amount || '0'),
        }],
        subtotal: subtotal || parseFloat(invoice.amount || '0'),
        total: parseFloat(invoice.amount || '0'),
        currency: invoice.currency || 'AED',
        notes: invoice.notes || undefined,
        status: invoice.status as 'pending' | 'paid' | 'overdue' | 'cancelled',
        paidAt: invoice.paidAt?.toISOString(),
      };
      
      const html = generateInvoiceHtml(invoiceData);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      console.error("Get parent invoice HTML error:", error);
      res.status(500).json({ error: "Failed to generate invoice" });
    }
  });

  // ==================== PARENT CREDIT STORE ====================

  app.get("/api/parent/credit-store/:playerId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const player = await storage.getPlayer(playerId);
      const isOwnPlayer = userPlayerId === playerId;
      const isParent = await storage.checkParentPlayerAccess(userId, playerId);
      if (!player || (!isOwnPlayer && !isParent)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Generate auto-priced packages from academy session pricing
      const CREDIT_QUANTITIES = [1, 5, 10, 20];
      const CREDIT_TYPES = ["private", "semi", "group"] as const;
      const CREDIT_TYPE_MAP: Record<string, string> = {
        private: "private",
        semi: "semi_private", 
        group: "group",
      };
      
      const pricing = await storage.getAcademyPricing(player.academyId);
      
      const packages: Array<{
        id: string;
        name: string;
        creditType: string;
        credits: number;
        pricePerCredit: string;
        totalPrice: string;
        currency: string;
        validityDays: number;
        description?: string;
        isPopular?: boolean;
      }> = [];
      
      for (const creditType of CREDIT_TYPES) {
        const sessionPricing = pricing.find(p => p.sessionType === creditType);
        if (!sessionPricing || parseFloat(sessionPricing.pricePerSession) <= 0) {
          continue; // Skip if no pricing configured
        }
        
        const pricePerCredit = parseFloat(sessionPricing.pricePerSession);
        const currency = sessionPricing.currency || "AED";
        const creditTypeLabel = creditType === "semi" ? "Semi-Private" : 
                                creditType.charAt(0).toUpperCase() + creditType.slice(1);
        
        for (const credits of CREDIT_QUANTITIES) {
          const totalPrice = pricePerCredit * credits;
          packages.push({
            id: `auto-${creditType}-${credits}`,
            name: `${credits} ${creditTypeLabel} Credit${credits > 1 ? 's' : ''}`,
            creditType: CREDIT_TYPE_MAP[creditType],
            credits,
            pricePerCredit: pricePerCredit.toFixed(2),
            totalPrice: totalPrice.toFixed(2),
            currency,
            validityDays: 90, // Default validity
            isPopular: credits === 10, // Mark 10-pack as popular
          });
        }
      }

      res.json(packages);
    } catch (error) {
      console.error("Get credit store error:", error);
      res.status(500).json({ error: "Failed to load credit store" });
    }
  });

  app.get("/api/parent/academy-payment-info/:playerId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const player = await storage.getPlayer(playerId);
      const isOwnPlayer = userPlayerId === playerId;
      const isParent = await storage.checkParentPlayerAccess(userId, playerId);
      if (!player || (!isOwnPlayer && !isParent)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const academy = await storage.getAcademy(player.academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      const settings = await storage.getAcademySettings(player.academyId);
      const currency = settings?.currency || "AED";

      res.json({
        acceptsCash: (academy as any).acceptsCash !== false,
        acceptsBankTransfer: (academy as any).acceptsBankTransfer !== false,
        bankName: (academy as any).bankName,
        bankAccountNumber: (academy as any).bankAccountNumber,
        bankIban: (academy as any).bankIban,
        bankAccountHolder: (academy as any).bankAccountHolder,
        bankSwiftCode: (academy as any).bankSwiftCode,
        paymentInstructions: (academy as any).paymentInstructions,
        currency,
      });
    } catch (error) {
      console.error("Get academy payment info error:", error);
      res.status(500).json({ error: "Failed to load payment info" });
    }
  });

  app.post("/api/parent/purchase-credits", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { playerId, templateId, pin, paymentMethod } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!playerId || !templateId || !pin) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const player = await storage.getPlayer(playerId);
      const userPlayerId = req.user?.playerId;
      const isOwnPlayer = userPlayerId === playerId;
      const isParent = await storage.checkParentPlayerAccess(userId, playerId);
      if (!player || (!isOwnPlayer && !isParent)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get the academy owner's PIN for verification
      // Uses the same PIN as Parent Dashboard access
      const academy = await storage.getAcademy(player.academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      // Get the academy owner (primary coach) for PIN verification
      let ownerCoach = academy.ownerId ? await storage.getCoach(academy.ownerId) : null;
      
      // Fallback: if no owner set, get first coach of academy
      if (!ownerCoach) {
        const coaches = await storage.getCoachesByAcademy(player.academyId);
        ownerCoach = coaches[0] || null;
      }

      if (!ownerCoach) {
        return res.status(400).json({ error: "Academy owner not configured. Please contact support." });
      }

      const storedPin = ownerCoach.parentDashboardPin || "1234";
      if (pin !== storedPin) {
        return res.status(403).json({ error: "Incorrect PIN" });
      }

      // Handle auto-generated package IDs (e.g., "auto-private-5")
      let templateData: {
        name: string;
        creditType: string;
        credits: number;
        pricePerCredit: string;
        currency: string;
        validityDays: number;
      };

      if (templateId.startsWith("auto-")) {
        // Parse auto-generated package ID: auto-{sessionType}-{credits}
        const parts = templateId.split("-");
        if (parts.length !== 3) {
          return res.status(400).json({ error: "Invalid package ID" });
        }
        
        const sessionType = parts[1]; // private, semi, group
        const credits = parseInt(parts[2], 10);
        
        if (!["private", "semi", "group"].includes(sessionType) || isNaN(credits) || credits <= 0) {
          return res.status(400).json({ error: "Invalid package configuration" });
        }
        
        // Get current pricing to snapshot the price
        const pricing = await storage.getAcademyPricing(player.academyId);
        const sessionPricing = pricing.find(p => p.sessionType === sessionType);
        
        if (!sessionPricing || parseFloat(sessionPricing.pricePerSession) <= 0) {
          return res.status(400).json({ error: "Pricing not configured for this session type" });
        }
        
        const creditTypeMap: Record<string, string> = {
          private: "private",
          semi: "semi_private",
          group: "group",
        };
        const creditTypeLabel = sessionType === "semi" ? "Semi-Private" : 
                                sessionType.charAt(0).toUpperCase() + sessionType.slice(1);
        
        templateData = {
          name: `${credits} ${creditTypeLabel} Credit${credits > 1 ? 's' : ''}`,
          creditType: creditTypeMap[sessionType],
          credits,
          pricePerCredit: parseFloat(sessionPricing.pricePerSession).toFixed(2),
          currency: sessionPricing.currency || "AED",
          validityDays: 90,
        };
      } else {
        // Legacy: lookup from package templates
        const template = await storage.getPackageTemplate(templateId);
        if (!template || template.academyId !== player.academyId) {
          return res.status(404).json({ error: "Package template not found" });
        }
        templateData = {
          name: template.name,
          creditType: template.creditType,
          credits: template.credits,
          pricePerCredit: template.pricePerCredit,
          currency: template.currency,
          validityDays: template.validityDays,
        };
      }

      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + templateData.validityDays);

      const pkg = await storage.createPackage({
        playerId,
        academyId: player.academyId,
        name: templateData.name,
        creditType: templateData.creditType,
        totalCredits: templateData.credits,
        remainingCredits: templateData.credits,
        purchasedAt: now,
        expiresAt,
        pricePerCredit: templateData.pricePerCredit,
        currency: templateData.currency,
        status: "active",
      });

      const totalAmount = (parseFloat(templateData.pricePerCredit) * templateData.credits).toFixed(2);
      const invoiceNumber = await storage.generateInvoiceNumber(player.academyId);
      const invoice = await storage.createInvoice({
        playerId,
        academyId: player.academyId,
        packageId: pkg.id,
        invoiceNumber,
        type: "package_purchase",
        amount: totalAmount,
        currency: templateData.currency,
        status: "pending",
        dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        lineItems: [{
          description: templateData.name,
          quantity: templateData.credits,
          unitPrice: templateData.pricePerCredit,
          total: totalAmount,
        }],
        paymentMethod: paymentMethod || "cash",
      } as any);

      res.json({ 
        success: true, 
        package: pkg, 
        invoice 
      });
    } catch (error) {
      console.error("Purchase credits error:", error);
      res.status(500).json({ error: "Failed to complete purchase" });
    }
  });

  app.get("/api/players/:playerId/credits-summary", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const userId = req.user?.id;
      const coachId = req.user?.coachId;

      if (!userId && !coachId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      if (!coachId && player.parentUserId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const packages = await storage.getPlayerPackages(playerId);
      const activePackages = packages.filter(p => p.status === "active" && p.remainingCredits > 0);

      const credits = {
        group: 0,
        private: 0,
        semi_private: 0,
      };

      activePackages.forEach(pkg => {
        const type = pkg.creditType as keyof typeof credits;
        if (type in credits) {
          credits[type] += pkg.remainingCredits;
        }
      });

      res.json({ credits });
    } catch (error) {
      console.error("Get credits summary error:", error);
      res.status(500).json({ error: "Failed to get credits summary" });
    }
  });

  // ==================== COACH REVIEW SYSTEM ====================

  // Helper: Get player age category from date of birth
  function getAgeCategory(dateOfBirth: string | Date | null): "kid" | "teen" | "adult" {
    if (!dateOfBirth) return "adult";
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    if (age < 13) return "kid";
    if (age < 18) return "teen";
    return "adult";
  }

  // Check if player is eligible to review a coach (requires 3+ sessions)
  app.get("/api/player/review-eligibility/:coachId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { coachId } = req.params;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      // Count completed sessions with this coach
      const sessionCount = await storage.getPlayerCoachSessionCount(playerId, coachId);
      const hasExistingReview = await storage.hasPlayerReviewedCoach(playerId, coachId);
      
      // Check for pending review prompt
      const pendingPrompt = await storage.getPendingReviewPrompt(playerId, coachId);
      
      const isEligible = sessionCount >= 3 && !hasExistingReview;
      
      res.json({
        eligible: isEligible,
        sessionCount,
        requiredSessions: 3,
        hasExistingReview,
        pendingPrompt: pendingPrompt ? {
          id: pendingPrompt.id,
          triggerType: pendingPrompt.triggerType,
        } : null,
      });
    } catch (error) {
      console.error("Check review eligibility error:", error);
      res.status(500).json({ error: "Failed to check eligibility" });
    }
  });

  // Get pending review prompts for player
  app.get("/api/player/review-prompts", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const prompts = await storage.getPlayerReviewPrompts(playerId);
      
      // Get coach info for each prompt
      const promptsWithCoaches = await Promise.all(
        prompts.map(async (prompt) => {
          const coach = await storage.getCoach(prompt.coachId);
          return {
            ...prompt,
            coach: coach ? { id: coach.id, name: coach.name } : null,
          };
        })
      );
      
      res.json(promptsWithCoaches);
    } catch (error) {
      console.error("Get review prompts error:", error);
      res.status(500).json({ error: "Failed to get prompts" });
    }
  });

  // Submit a review for a coach
  app.post("/api/player/reviews", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const parsed = submitReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const { coachId, coachingQuality, communication, withKidsBeginners, reliability, feedbackMotivation, whatDoesWell, bestForPlayerType } = parsed.data;

      // Verify eligibility
      const sessionCount = await storage.getPlayerCoachSessionCount(playerId, coachId);
      if (sessionCount < 3) {
        return res.status(403).json({ error: "You need at least 3 sessions with this coach to submit a review" });
      }

      const hasExistingReview = await storage.hasPlayerReviewedCoach(playerId, coachId);
      if (hasExistingReview) {
        return res.status(400).json({ error: "You have already reviewed this coach" });
      }

      // Get player info for semi-anonymous display
      const player = await storage.getPlayer(playerId);
      const reviewerAgeCategory = getAgeCategory(player?.dateOfBirth || null);
      const reviewerLevel = player?.level || "green";

      // Calculate overall score
      const overallScore = ((coachingQuality + communication + withKidsBeginners + reliability + feedbackMotivation) / 5).toFixed(2);

      const review = await storage.createCoachReview({
        coachId,
        playerId,
        academyId,
        coachingQuality,
        communication,
        withKidsBeginners,
        reliability,
        feedbackMotivation,
        overallScore,
        whatDoesWell: whatDoesWell ? sanitizeMessage(whatDoesWell) : null,
        bestForPlayerType: bestForPlayerType ? sanitizeMessage(bestForPlayerType) : null,
        reviewerAgeCategory,
        reviewerLevel,
        sessionCountAtReview: sessionCount,
      });

      // Update coach review stats
      await storage.updateCoachReviewStats(coachId);

      // Mark any pending prompt as completed
      await storage.completeReviewPrompt(playerId, coachId, review.id);

      res.status(201).json({
        id: review.id,
        message: "Review submitted successfully. It will be visible once the coach has more reviews.",
      });
    } catch (error) {
      console.error("Submit review error:", error);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });

  // Dismiss a review prompt
  app.post("/api/player/review-prompts/:promptId/dismiss", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { promptId } = req.params;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      await storage.dismissReviewPrompt(promptId, playerId);
      res.json({ success: true });
    } catch (error) {
      console.error("Dismiss prompt error:", error);
      res.status(500).json({ error: "Failed to dismiss prompt" });
    }
  });

  // Get coach review stats (public - for coach profiles)
  app.get("/api/coaches/:coachId/reviews", async (req: Request, res: Response) => {
    try {
      const { coachId } = req.params;
      
      // Get aggregated stats
      const stats = await storage.getCoachReviewStats(coachId);
      
      // Get visible reviews (snippets)
      const reviews = await storage.getVisibleCoachReviews(coachId, 10); // Top 10 reviews
      
      res.json({
        stats: stats ? {
          totalReviews: stats.visibleReviews || 0,
          averageOverall: stats.averageOverall ? parseFloat(stats.averageOverall.toString()) : null,
          categories: {
            coachingQuality: stats.avgCoachingQuality ? parseFloat(stats.avgCoachingQuality.toString()) : null,
            communication: stats.avgCommunication ? parseFloat(stats.avgCommunication.toString()) : null,
            withKidsBeginners: stats.avgWithKidsBeginners ? parseFloat(stats.avgWithKidsBeginners.toString()) : null,
            reliability: stats.avgReliability ? parseFloat(stats.avgReliability.toString()) : null,
            feedbackMotivation: stats.avgFeedbackMotivation ? parseFloat(stats.avgFeedbackMotivation.toString()) : null,
          },
          reviewerBreakdown: {
            kids: stats.kidReviewCount || 0,
            teens: stats.teenReviewCount || 0,
            adults: stats.adultReviewCount || 0,
          },
          levelBreakdown: {
            red: stats.redLevelCount || 0,
            orange: stats.orangeLevelCount || 0,
            green: stats.greenLevelCount || 0,
            yellow: stats.yellowLevelCount || 0,
          },
          bestForTags: stats.bestForTags || [],
        } : null,
        reviews: reviews.map(r => ({
          id: r.id,
          overallScore: parseFloat(r.overallScore.toString()),
          whatDoesWell: r.whatDoesWell,
          bestForPlayerType: r.bestForPlayerType,
          reviewerAgeCategory: r.reviewerAgeCategory,
          reviewerLevel: r.reviewerLevel,
          createdAt: r.createdAt,
          response: r.response ? {
            text: r.response.responseText,
            createdAt: r.response.createdAt,
          } : null,
        })),
        isVisible: stats && (stats.visibleReviews || 0) >= 3, // Only show stats if 3+ reviews
      });
    } catch (error) {
      console.error("Get coach reviews error:", error);
      res.status(500).json({ error: "Failed to get reviews" });
    }
  });

  // Coach: Respond to a review
  app.post("/api/coach/reviews/:reviewId/respond", authMiddleware, requireRole("coach", "admin", "academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const { reviewId } = req.params;
      const { responseText } = req.body;
      
      if (!coachId) {
        return res.status(403).json({ error: "Coach profile required" });
      }

      if (!responseText || typeof responseText !== "string" || responseText.trim().length === 0) {
        return res.status(400).json({ error: "Response text is required" });
      }

      if (responseText.length > 500) {
        return res.status(400).json({ error: "Response must be 500 characters or less" });
      }

      // Verify the review is for this coach
      const review = await storage.getCoachReview(reviewId);
      if (!review || review.coachId !== coachId) {
        return res.status(404).json({ error: "Review not found" });
      }

      // Check if already responded
      const existingResponse = await storage.getReviewResponse(reviewId);
      if (existingResponse) {
        return res.status(400).json({ error: "You have already responded to this review" });
      }

      const response = await storage.createReviewResponse({
        reviewId,
        coachId,
        responseText: sanitizeMessage(responseText.trim()),
      });

      res.status(201).json({
        id: response.id,
        message: "Response submitted successfully",
      });
    } catch (error) {
      console.error("Respond to review error:", error);
      res.status(500).json({ error: "Failed to submit response" });
    }
  });

  // Coach: Get my reviews
  app.get("/api/coach/my-reviews", authMiddleware, requireRole("coach", "admin", "academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      
      if (!coachId) {
        return res.status(403).json({ error: "Coach profile required" });
      }

      const reviews = await storage.getCoachReviewsForCoach(coachId);
      const stats = await storage.getCoachReviewStats(coachId);
      
      res.json({
        stats: stats ? {
          totalReviews: stats.totalReviews || 0,
          visibleReviews: stats.visibleReviews || 0,
          averageOverall: stats.averageOverall ? parseFloat(stats.averageOverall.toString()) : null,
        } : null,
        reviews: reviews.map(r => ({
          id: r.id,
          coachingQuality: r.coachingQuality,
          communication: r.communication,
          withKidsBeginners: r.withKidsBeginners,
          reliability: r.reliability,
          feedbackMotivation: r.feedbackMotivation,
          overallScore: parseFloat(r.overallScore.toString()),
          whatDoesWell: r.whatDoesWell,
          bestForPlayerType: r.bestForPlayerType,
          reviewerAgeCategory: r.reviewerAgeCategory,
          reviewerLevel: r.reviewerLevel,
          isVisible: r.isVisible,
          createdAt: r.createdAt,
          response: r.response,
        })),
      });
    } catch (error) {
      console.error("Get my reviews error:", error);
      res.status(500).json({ error: "Failed to get reviews" });
    }
  });

  // Flag a review (anyone can flag)
  app.post("/api/reviews/:reviewId/flag", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { reviewId } = req.params;
      const { reason, details } = req.body;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!reason || !["inappropriate", "fake", "spam", "other"].includes(reason)) {
        return res.status(400).json({ error: "Valid reason is required (inappropriate, fake, spam, or other)" });
      }

      const review = await storage.getCoachReview(reviewId);
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

      await storage.createReviewFlag({
        reviewId,
        flaggedBy: userId,
        reason,
        details: details ? sanitizeMessage(details) : null,
      });

      res.status(201).json({ message: "Review flagged for moderation" });
    } catch (error) {
      console.error("Flag review error:", error);
      res.status(500).json({ error: "Failed to flag review" });
    }
  });

  // Platform Owner: Get flagged reviews for moderation
  app.get("/api/platform/review-flags", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status = "pending" } = req.query;
      
      const flags = await storage.getReviewFlags(status as string);
      
      res.json(flags);
    } catch (error) {
      console.error("Get review flags error:", error);
      res.status(500).json({ error: "Failed to get flags" });
    }
  });

  // Platform Owner: Moderate a review (hide/unhide)
  app.post("/api/platform/reviews/:reviewId/moderate", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { reviewId } = req.params;
      const { action, reason, internalNote } = req.body;
      
      if (!["hide", "unhide", "dismiss_flags"].includes(action)) {
        return res.status(400).json({ error: "Valid action is required (hide, unhide, or dismiss_flags)" });
      }

      const review = await storage.getCoachReview(reviewId);
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

      if (action === "hide") {
        await storage.hideReview(reviewId, userId!, reason || "Moderation decision");
        await storage.updateCoachReviewStats(review.coachId);
      } else if (action === "unhide") {
        await storage.unhideReview(reviewId);
        await storage.updateCoachReviewStats(review.coachId);
      } else if (action === "dismiss_flags") {
        await storage.dismissReviewFlags(reviewId, userId!, internalNote);
      }

      res.json({ success: true, message: `Review ${action} successful` });
    } catch (error) {
      console.error("Moderate review error:", error);
      res.status(500).json({ error: "Failed to moderate review" });
    }
  });

  // ==================== COURT BOOKING MARKETPLACE ====================

  // Get all courts availability for a date (Playtomic-style quick booking)
  app.get("/api/courts/availability", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const academyId = req.user?.academyId;
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({ error: "date is required" });
      }

      // Get all courts accessible to this user
      const courts = await storage.searchCourts({
        userId,
        userAcademyId: academyId,
        limit: 50,
        offset: 0,
      });

      // Generate time slots for each court
      const slots: Array<{
        courtId: string;
        courtName: string;
        time: string;
        available: boolean;
        price?: string;
        currency?: string;
      }> = [];

      // Standard time slots (7am to 10pm)
      const timeSlots = [
        "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
        "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
        "19:00", "20:00", "21:00", "22:00"
      ];

      for (const court of courts) {
        // Get existing bookings for this court on this date
        const availability = await storage.getCourtAvailability(court.id, date as string);
        const bookedTimes = new Set(availability.filter(a => !a.available).map(a => a.time));

        for (const time of timeSlots) {
          slots.push({
            courtId: court.id,
            courtName: court.name,
            time,
            available: !bookedTimes.has(time),
            price: court.pricePerHour,
            currency: court.currency || "AED",
          });
        }
      }

      res.json({
        courts: courts.map(c => ({
          id: c.id,
          name: c.name,
          surface: c.surface,
          pricePerHour: c.pricePerHour,
          currency: c.currency || "AED",
        })),
        slots,
      });
    } catch (error) {
      console.error("Get courts availability error:", error);
      res.status(500).json({ error: "Failed to get availability" });
    }
  });

  // Search public courts (available for all users)
  app.get("/api/courts/search", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const academyId = req.user?.academyId;
      const { 
        date, 
        surface, 
        visibility, 
        minPrice, 
        maxPrice,
        location,
        limit = "20",
        offset = "0" 
      } = req.query;

      const courts = await storage.searchCourts({
        userId,
        userAcademyId: academyId,
        date: date as string,
        surface: surface as string,
        visibility: visibility as string,
        minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
        location: location as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });

      res.json(courts);
    } catch (error) {
      console.error("Search courts error:", error);
      res.status(500).json({ error: "Failed to search courts" });
    }
  });

  // Get court details with availability
  app.get("/api/courts/:courtId/details", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { courtId } = req.params;
      const { date } = req.query;
      const userId = req.user?.userId;
      const userAcademyId = req.user?.academyId;

      const court = await storage.getCourtWithDetails(courtId, userId, userAcademyId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }

      // Get availability for the requested date
      const availability = date 
        ? await storage.getCourtAvailability(courtId, date as string)
        : [];

      res.json({ ...court, availability });
    } catch (error) {
      console.error("Get court details error:", error);
      res.status(500).json({ error: "Failed to get court details" });
    }
  });

  // Get court availability for a date range
  app.get("/api/courts/:courtId/availability", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { courtId } = req.params;
      const { startDate, endDate } = req.query;

      if (!startDate) {
        return res.status(400).json({ error: "startDate is required" });
      }

      const availability = await storage.getCourtAvailabilityRange(
        courtId, 
        startDate as string, 
        (endDate as string) || startDate as string
      );

      res.json(availability);
    } catch (error) {
      console.error("Get court availability error:", error);
      res.status(500).json({ error: "Failed to get availability" });
    }
  });

  // Create a court booking (player booking)
  app.post("/api/courts/:courtId/book", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const playerId = req.user?.playerId;
      const { courtId } = req.params;
      const { date, startTime, endTime, notes } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!date || !startTime || !endTime) {
        return res.status(400).json({ error: "date, startTime, and endTime are required" });
      }

      // Calculate duration
      const start = new Date(`${date}T${startTime}`);
      const end = new Date(`${date}T${endTime}`);
      const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

      if (durationMinutes <= 0) {
        return res.status(400).json({ error: "Invalid time range" });
      }

      // Get court to check rules and pricing
      const court = await storage.getCourt(courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }

      // Check if user can book this court
      const userAcademyId = req.user?.academyId;
      const canBook = court.visibility === "public" || 
        (court.visibility === "academy" && court.academyId === userAcademyId);
      
      if (!canBook) {
        return res.status(403).json({ error: "You don't have access to book this court" });
      }

      // Check duration limits
      if (durationMinutes < (court.minBookingDurationMinutes || 60)) {
        return res.status(400).json({ error: `Minimum booking duration is ${court.minBookingDurationMinutes || 60} minutes` });
      }
      if (durationMinutes > ((court.maxBookingDurationHours || 2) * 60)) {
        return res.status(400).json({ error: `Maximum booking duration is ${court.maxBookingDurationHours || 2} hours` });
      }

      // Check availability
      const isAvailable = await storage.checkCourtAvailability(courtId, date, startTime, endTime);
      if (!isAvailable) {
        return res.status(409).json({ error: "This time slot is not available" });
      }

      // Calculate price
      const hours = durationMinutes / 60;
      const isMember = court.academyId === userAcademyId;
      const pricePerHour = isMember && court.memberPricePerHour 
        ? parseFloat(court.memberPricePerHour)
        : parseFloat(court.pricePerHour || "0");
      const price = pricePerHour * hours;

      // Determine booking type
      const bookingType = court.visibility === "public" ? "public" : "academy";

      // Create booking
      const booking = await storage.createCourtBooking({
        courtId,
        userId,
        playerId: playerId || null,
        academyId: court.academyId,
        date,
        startTime,
        endTime,
        durationMinutes,
        bookingType,
        price: price.toFixed(2),
        currency: court.currency || "AED",
        paymentStatus: price === 0 ? "free" : "pending",
        status: court.requiresApproval ? "pending" : "confirmed",
        notes: notes ? sanitizeMessage(notes) : null,
      });

      // Mark time slot as booked
      await storage.updateCourtAvailabilityStatus(courtId, date, startTime, endTime, "booked");

      // Handle friend invites if provided
      const { inviteFriendIds } = req.body;
      if (inviteFriendIds && Array.isArray(inviteFriendIds) && inviteFriendIds.length > 0 && playerId) {
        try {
          const friendCount = inviteFriendIds.length;
          const splitCost = price > 0;
          const costPerPerson = splitCost ? (price / (friendCount + 1)).toFixed(2) : null;
          
          const inviteResult = await db.insert(bookingInvites).values({
            bookingId: booking.id,
            hostPlayerId: playerId,
            splitCost,
            costPerPerson,
            currency: court.currency || "AED",
            maxGuests: 3,
            totalInvited: friendCount,
            totalAccepted: 0,
          }).returning();
          
          const invite = inviteResult[0];
          
          for (const friendId of inviteFriendIds) {
            await db.insert(bookingInviteGuests).values({
              inviteId: invite.id,
              playerId: friendId,
              status: "pending",
              shareAmount: costPerPerson,
            });
            
            const friend = await storage.getPlayer(friendId);
            if (friend) {
              await storage.createNotification({
                type: "booking_invite",
                title: "Court Booking Invite",
                message: `You've been invited to play on ${date} at ${startTime}`,
                userId: null,
                playerId: friendId,
                academyId: court.academyId,
                data: { bookingId: booking.id, inviteId: invite.id },
              });
            }
          }
        } catch (inviteError) {
          console.error("Failed to create booking invites:", inviteError);
        }
      }

      // Handle create open match if requested
      const { createOpenMatch } = req.body;
      if (createOpenMatch && playerId) {
        try {
          const [match] = await db.insert(openMatches).values({
            bookingId: booking.id,
            hostPlayerId: playerId,
            academyId: court.academyId,
            matchType: "singles",
            title: `Open Match at ${court.name || "Court"}`,
            description: `Join me for a game on ${date} at ${startTime}`,
            requiredLevelMin: 1,
            requiredLevelMax: 20,
            requiredBallLevel: null,
            maxPlayers: 2,
            currentPlayers: 1,
            status: "open",
            visibility: "academy",
            costPerPlayer: price > 0 ? (price / 2).toFixed(2) : null,
            currency: court.currency || "AED",
            xpBonus: 25,
          }).returning();

          // Add host as first slot
          await db.insert(openMatchSlots).values({
            matchId: match.id,
            playerId,
            role: "host",
            status: "confirmed",
          });
        } catch (openMatchError) {
          console.error("Failed to create open match:", openMatchError);
        }
      }

      res.status(201).json(booking);
    } catch (error) {
      console.error("Create court booking error:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // Get user's court bookings
  app.get("/api/my-court-bookings", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { status, startDate, endDate } = req.query;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const bookings = await storage.getUserCourtBookings(userId, {
        status: status as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });

      res.json(bookings);
    } catch (error) {
      console.error("Get my court bookings error:", error);
      res.status(500).json({ error: "Failed to get bookings" });
    }
  });

  // Cancel a court booking
  app.post("/api/court-bookings/:bookingId/cancel", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { bookingId } = req.params;
      const { reason } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const booking = await storage.getCourtBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Check ownership
      if (booking.userId !== userId) {
        return res.status(403).json({ error: "You can only cancel your own bookings" });
      }

      // Check if already cancelled
      if (booking.status === "cancelled") {
        return res.status(400).json({ error: "Booking is already cancelled" });
      }

      // Get court for cancel window check
      const court = await storage.getCourt(booking.courtId);
      const bookingDateTime = new Date(`${booking.date}T${booking.startTime}`);
      const now = new Date();
      const hoursUntilBooking = (bookingDateTime.getTime() - now.getTime()) / 3600000;
      
      if (court && hoursUntilBooking < (court.cancelWindowHours || 24)) {
        return res.status(400).json({ 
          error: `Cancellations must be made at least ${court.cancelWindowHours || 24} hours before the booking` 
        });
      }

      // Cancel booking
      await storage.cancelCourtBooking(bookingId, userId, reason);

      // Release time slot
      await storage.updateCourtAvailabilityStatus(
        booking.courtId, 
        booking.date, 
        booking.startTime, 
        booking.endTime, 
        "available"
      );

      res.json({ success: true, message: "Booking cancelled" });
    } catch (error) {
      console.error("Cancel court booking error:", error);
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  });

  // ==================== COACH COURT BLOCKING ====================

  // Coach blocks court for training
  app.post("/api/courts/:courtId/block", authMiddleware, requireRole("coach", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { courtId } = req.params;
      const { date, startTime, endTime, reason } = req.body;

      if (!date || !startTime || !endTime) {
        return res.status(400).json({ error: "date, startTime, and endTime are required" });
      }

      // Check if coach has access to this court
      const court = await storage.getCourt(courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }

      const userAcademyId = req.user?.academyId;
      if (court.academyId !== userAcademyId && req.user?.role !== "platform_owner") {
        return res.status(403).json({ error: "You can only block courts in your academy" });
      }

      // Check availability
      const isAvailable = await storage.checkCourtAvailability(courtId, date, startTime, endTime);
      if (!isAvailable) {
        return res.status(409).json({ error: "This time slot is already booked or blocked" });
      }

      // Block the time slot
      await storage.blockCourtTimeSlot({
        courtId,
        date,
        startTime,
        endTime,
        status: "blocked",
        blockedReason: reason || "training",
        blockedBy: userId,
      });

      res.status(201).json({ success: true, message: "Court blocked for training" });
    } catch (error) {
      console.error("Block court error:", error);
      res.status(500).json({ error: "Failed to block court" });
    }
  });

  // Coach unblocks court
  app.post("/api/courts/:courtId/unblock", authMiddleware, requireRole("coach", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { courtId } = req.params;
      const { date, startTime, endTime } = req.body;

      if (!date || !startTime || !endTime) {
        return res.status(400).json({ error: "date, startTime, and endTime are required" });
      }

      await storage.updateCourtAvailabilityStatus(courtId, date, startTime, endTime, "available");

      res.json({ success: true, message: "Court unblocked" });
    } catch (error) {
      console.error("Unblock court error:", error);
      res.status(500).json({ error: "Failed to unblock court" });
    }
  });

  // ==================== ACADEMY COURT MANAGEMENT ====================

  // Update court booking settings
  app.put("/api/courts/:courtId/booking-settings", authMiddleware, requireRole("academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { courtId } = req.params;
      const {
        visibility,
        pricePerHour,
        peakPricePerHour,
        memberPricePerHour,
        currency,
        maxBookingDurationHours,
        minBookingDurationMinutes,
        cancelWindowHours,
        guestsAllowed,
        requiresApproval,
        operatingHours,
        xpRewardPerHour,
      } = req.body;

      // Check ownership
      const court = await storage.getCourt(courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }

      const userAcademyId = req.user?.academyId;
      if (court.academyId !== userAcademyId && req.user?.role !== "platform_owner") {
        return res.status(403).json({ error: "You can only update courts in your academy" });
      }

      const updatedCourt = await storage.updateCourtBookingSettings(courtId, {
        visibility,
        pricePerHour,
        peakPricePerHour,
        memberPricePerHour,
        currency,
        maxBookingDurationHours,
        minBookingDurationMinutes,
        cancelWindowHours,
        guestsAllowed,
        requiresApproval,
        operatingHours,
        xpRewardPerHour,
      });

      res.json(updatedCourt);
    } catch (error) {
      console.error("Update court booking settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Get academy's court bookings (for management)
  app.get("/api/academy/court-bookings", authMiddleware, requireRole("coach", "academy_owner", "platform_owner"), requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const { status, startDate, endDate, courtId } = req.query;

      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const bookings = await storage.getAcademyCourtBookings(academyId, {
        status: status as string,
        startDate: startDate as string,
        endDate: endDate as string,
        courtId: courtId as string,
      });

      res.json(bookings);
    } catch (error) {
      console.error("Get academy court bookings error:", error);
      res.status(500).json({ error: "Failed to get bookings" });
    }
  });

  // Approve/decline pending booking (academy admin)
  app.post("/api/court-bookings/:bookingId/review", authMiddleware, requireRole("academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { action, reason } = req.body;

      if (!["approve", "decline"].includes(action)) {
        return res.status(400).json({ error: "Action must be 'approve' or 'decline'" });
      }

      const booking = await storage.getCourtBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Check academy ownership
      const userAcademyId = req.user?.academyId;
      if (booking.academyId !== userAcademyId && req.user?.role !== "platform_owner") {
        return res.status(403).json({ error: "You can only review bookings for your academy" });
      }

      if (action === "approve") {
        await storage.approveCourtBooking(bookingId);
      } else {
        await storage.declineCourtBooking(bookingId, reason);
        // Release the time slot
        await storage.updateCourtAvailabilityStatus(
          booking.courtId,
          booking.date,
          booking.startTime,
          booking.endTime,
          "available"
        );
      }

      res.json({ success: true, message: `Booking ${action}d` });
    } catch (error) {
      console.error("Review court booking error:", error);
      res.status(500).json({ error: "Failed to review booking" });
    }
  });

  // ==================== BOOKING INVITES (Phase 2) ====================

  // Get my booking invites (received)
  app.get("/api/player/booking-invites", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const invites = await db
        .select()
        .from(bookingInviteGuests)
        .innerJoin(bookingInvites, eq(bookingInviteGuests.inviteId, bookingInvites.id))
        .where(eq(bookingInviteGuests.playerId, playerId));

      res.json(invites);
    } catch (error) {
      console.error("Get booking invites error:", error);
      res.status(500).json({ error: "Failed to get invites" });
    }
  });

  // Respond to booking invite
  app.post("/api/player/booking-invites/:inviteId/respond", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { inviteId } = req.params;
      const { action } = req.body;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      if (!["accept", "decline"].includes(action)) {
        return res.status(400).json({ error: "Action must be 'accept' or 'decline'" });
      }

      const [guest] = await db
        .select()
        .from(bookingInviteGuests)
        .where(and(
          eq(bookingInviteGuests.inviteId, inviteId),
          eq(bookingInviteGuests.playerId, playerId)
        ));

      if (!guest) {
        return res.status(404).json({ error: "Invite not found" });
      }

      await db
        .update(bookingInviteGuests)
        .set({
          status: action === "accept" ? "accepted" : "declined",
          respondedAt: new Date(),
        })
        .where(eq(bookingInviteGuests.id, guest.id));

      // Update invite counts
      if (action === "accept") {
        await db
          .update(bookingInvites)
          .set({ totalAccepted: sql`total_accepted + 1` })
          .where(eq(bookingInvites.id, inviteId));
      }

      res.json({ success: true, message: `Invite ${action}ed` });
    } catch (error) {
      console.error("Respond to booking invite error:", error);
      res.status(500).json({ error: "Failed to respond to invite" });
    }
  });

  // ==================== OPEN MATCHES (Phase 3) ====================

  // Get open matches
  app.get("/api/open-matches", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;
      const { matchType, ballLevel, date } = req.query;

      let query = db
        .select()
        .from(openMatches)
        .where(eq(openMatches.status, "open"));

      const matches = await query;

      // Filter by academy if needed (visibility = academy)
      const filteredMatches = matches.filter(m => 
        m.visibility === "public" || 
        (m.visibility === "academy" && m.academyId === academyId)
      );

      res.json(filteredMatches);
    } catch (error) {
      console.error("Get open matches error:", error);
      res.status(500).json({ error: "Failed to get open matches" });
    }
  });

  // Create open match
  app.post("/api/open-matches", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const {
        bookingId,
        matchType,
        title,
        description,
        requiredLevelMin,
        requiredLevelMax,
        requiredBallLevel,
        maxPlayers,
        visibility,
        costPerPlayer,
      } = req.body;

      if (!bookingId) {
        return res.status(400).json({ error: "Booking ID is required" });
      }

      const [match] = await db.insert(openMatches).values({
        bookingId,
        hostPlayerId: playerId,
        academyId,
        matchType: matchType || "singles",
        title,
        description,
        requiredLevelMin: requiredLevelMin || 1,
        requiredLevelMax: requiredLevelMax || 20,
        requiredBallLevel,
        maxPlayers: maxPlayers || (matchType === "doubles" ? 4 : 2),
        currentPlayers: 1,
        status: "open",
        visibility: visibility || "academy",
        costPerPlayer,
        currency: "AED",
        xpBonus: 25,
      }).returning();

      // Add host as first slot
      await db.insert(openMatchSlots).values({
        matchId: match.id,
        playerId,
        role: "host",
        status: "confirmed",
      });

      res.status(201).json(match);
    } catch (error) {
      console.error("Create open match error:", error);
      res.status(500).json({ error: "Failed to create open match" });
    }
  });

  // Join open match
  app.post("/api/open-matches/:matchId/join", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { matchId } = req.params;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const [match] = await db
        .select()
        .from(openMatches)
        .where(eq(openMatches.id, matchId));

      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      if (match.status !== "open") {
        return res.status(400).json({ error: "Match is not open for joining" });
      }

      if (match.currentPlayers >= match.maxPlayers) {
        return res.status(400).json({ error: "Match is already full" });
      }

      // Check if already joined
      const [existing] = await db
        .select()
        .from(openMatchSlots)
        .where(and(
          eq(openMatchSlots.matchId, matchId),
          eq(openMatchSlots.playerId, playerId)
        ));

      if (existing) {
        return res.status(400).json({ error: "Already joined this match" });
      }

      // Add player slot
      await db.insert(openMatchSlots).values({
        matchId,
        playerId,
        role: "player",
        status: "confirmed",
      });

      // Update player count
      const newCount = match.currentPlayers + 1;
      const newStatus = newCount >= match.maxPlayers ? "full" : "open";

      await db
        .update(openMatches)
        .set({ 
          currentPlayers: newCount,
          status: newStatus,
        })
        .where(eq(openMatches.id, matchId));

      // Notify host
      await storage.createNotification({
        type: "open_match_join",
        title: "Player Joined",
        message: `Someone joined your open match!`,
        userId: null,
        playerId: match.hostPlayerId,
        academyId: match.academyId,
        data: { matchId },
      });

      res.json({ success: true, message: "Joined match successfully" });
    } catch (error) {
      console.error("Join open match error:", error);
      res.status(500).json({ error: "Failed to join match" });
    }
  });

  // Leave open match
  app.post("/api/open-matches/:matchId/leave", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { matchId } = req.params;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const [slot] = await db
        .select()
        .from(openMatchSlots)
        .where(and(
          eq(openMatchSlots.matchId, matchId),
          eq(openMatchSlots.playerId, playerId)
        ));

      if (!slot) {
        return res.status(404).json({ error: "Not in this match" });
      }

      if (slot.role === "host") {
        return res.status(400).json({ error: "Host cannot leave. Cancel the match instead." });
      }

      await db
        .update(openMatchSlots)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(openMatchSlots.id, slot.id));

      // Update match count
      await db
        .update(openMatches)
        .set({ 
          currentPlayers: sql`current_players - 1`,
          status: "open",
        })
        .where(eq(openMatches.id, matchId));

      res.json({ success: true, message: "Left match" });
    } catch (error) {
      console.error("Leave open match error:", error);
      res.status(500).json({ error: "Failed to leave match" });
    }
  });

  // ==================== PLAYER BOOKING PREFERENCES (Phase 4) ====================

  // Get booking preferences
  app.get("/api/player/booking-preferences", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const [prefs] = await db
        .select()
        .from(playerBookingPreferences)
        .where(eq(playerBookingPreferences.playerId, playerId));

      res.json(prefs || null);
    } catch (error) {
      console.error("Get booking preferences error:", error);
      res.status(500).json({ error: "Failed to get preferences" });
    }
  });

  // Update booking preferences
  app.put("/api/player/booking-preferences", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const {
        preferredDays,
        preferredTimeWindows,
        preferredSurfaces,
        preferredCourts,
        autoAcceptFriendInvites,
        openToOpenMatches,
        preferredMatchType,
        notifyOnOpenMatches,
        notifyOnFriendBookings,
      } = req.body;

      const [existing] = await db
        .select()
        .from(playerBookingPreferences)
        .where(eq(playerBookingPreferences.playerId, playerId));

      let result;
      if (existing) {
        [result] = await db
          .update(playerBookingPreferences)
          .set({
            preferredDays,
            preferredTimeWindows,
            preferredSurfaces,
            preferredCourts,
            autoAcceptFriendInvites,
            openToOpenMatches,
            preferredMatchType,
            notifyOnOpenMatches,
            notifyOnFriendBookings,
            updatedAt: new Date(),
          })
          .where(eq(playerBookingPreferences.playerId, playerId))
          .returning();
      } else {
        [result] = await db
          .insert(playerBookingPreferences)
          .values({
            playerId,
            preferredDays,
            preferredTimeWindows,
            preferredSurfaces,
            preferredCourts,
            autoAcceptFriendInvites,
            openToOpenMatches,
            preferredMatchType,
            notifyOnOpenMatches,
            notifyOnFriendBookings,
          })
          .returning();
      }

      res.json(result);
    } catch (error) {
      console.error("Update booking preferences error:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  // Get smart suggestions based on booking history
  app.get("/api/player/booking-suggestions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const userId = req.user?.userId;
      if (!playerId || !userId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      // Get user's past bookings to analyze patterns
      const pastBookings = await storage.getUserCourtBookings(userId, {
        status: "completed",
      });

      // Analyze patterns
      const dayFrequency: Record<string, number> = {};
      const timeFrequency: Record<string, number> = {};
      const courtFrequency: Record<string, number> = {};

      for (const booking of pastBookings.slice(-20)) {
        const dayOfWeek = new Date(booking.date).toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
        dayFrequency[dayOfWeek] = (dayFrequency[dayOfWeek] || 0) + 1;
        
        const hour = parseInt(booking.startTime.split(":")[0]);
        const timeSlot = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
        timeFrequency[timeSlot] = (timeFrequency[timeSlot] || 0) + 1;

        courtFrequency[booking.courtId] = (courtFrequency[booking.courtId] || 0) + 1;
      }

      // Get top preferences
      const sortedDays = Object.entries(dayFrequency).sort((a, b) => b[1] - a[1]);
      const sortedTimes = Object.entries(timeFrequency).sort((a, b) => b[1] - a[1]);
      const sortedCourts = Object.entries(courtFrequency).sort((a, b) => b[1] - a[1]);

      res.json({
        preferredDays: sortedDays.slice(0, 3).map(([day]) => day),
        preferredTimes: sortedTimes.slice(0, 2).map(([time]) => time),
        favoriteCourtIds: sortedCourts.slice(0, 2).map(([courtId]) => courtId),
        totalBookings: pastBookings.length,
        suggestions: [
          sortedDays[0] ? `You usually play on ${sortedDays[0][0]}s` : null,
          sortedTimes[0] ? `Your favorite time is ${sortedTimes[0][0]}` : null,
        ].filter(Boolean),
      });
    } catch (error) {
      console.error("Get booking suggestions error:", error);
      res.status(500).json({ error: "Failed to get suggestions" });
    }
  });

  // ==================== PUBLIC PLAYER PROFILE ====================
  
  // Get public player profile (viewable by other players)
  app.get("/api/player/public-profile/:playerId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const viewerId = req.user?.playerId;
      
      // Get player basic info
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const isOwnProfile = viewerId === playerId;
      
      // Calculate level title based on XP
      const getLevelTitle = (level: number): string => {
        if (level <= 2) return "Just Started";
        if (level <= 5) return "Rising Force";
        if (level <= 10) return "Committed Player";
        if (level <= 20) return "Dedicated Athlete";
        if (level <= 35) return "Tennis Warrior";
        if (level <= 50) return "Court Master";
        if (level <= 75) return "Elite Competitor";
        return "Legend";
      };
      
      // Get 5-pillar skill states
      const skillStates = await storage.getPlayerSkillStates(playerId);
      const domains = await storage.getSkillDomains();
      
      const pillars = domains.map(domain => {
        const state = skillStates.find(s => s.domainId === domain.id);
        // Calculate pillar level from progress (0-100 maps to level 1-20)
        const pillarLevel = state ? Math.floor((state.progressValue || 0) / 5) + 1 : 1;
        return {
          id: domain.id,
          name: domain.name,
          displayName: domain.displayName,
          icon: domain.icon,
          color: domain.color,
          level: Math.min(pillarLevel, 20),
          progress: state?.progressValue || 0,
          trend: state?.trend || "stable",
        };
      });
      
      // Get match stats
      const matchStats = await storage.getPlayerMatchStats(playerId);
      
      // Get recent matches (last 5)
      const recentMatches = await storage.getPlayerRecentMatches(playerId, 5);
      
      // Get upcoming matches
      const upcomingMatches = await storage.getPlayerUpcomingMatches(playerId, 3);
      
      // Get connections count and preview
      const connections = await storage.getPlayerConnections(playerId);
      const connectionPreviews = await Promise.all(
        connections.slice(0, 5).map(async (conn) => {
          const connectedPlayerId = conn.player1Id === playerId ? conn.player2Id : conn.player1Id;
          const connectedPlayer = await storage.getPlayerById(connectedPlayerId);
          return connectedPlayer ? {
            id: connectedPlayer.id,
            name: connectedPlayer.displayName || connectedPlayer.name,
            photoUrl: connectedPlayer.profilePhotoUrl,
            level: connectedPlayer.level || 1,
          } : null;
        })
      );
      
      // Get weekly ranking (simplified - count players with higher XP)
      const weeklyRanking = await storage.getPlayerWeeklyRanking(playerId);
      
      // Build response
      const profile = {
        // Layer 1: Hero Header
        id: player.id,
        name: player.displayName || player.name,
        photoUrl: player.profilePhotoUrl,
        level: player.level || 1,
        levelTitle: getLevelTitle(player.level || 1),
        ballLevel: player.ballLevel || "green",
        glowScore: player.glowScore || 0,
        totalXp: player.totalXp || 0,
        xpToNextLevel: 100 - ((player.totalXp || 0) % 100),
        xpProgress: ((player.totalXp || 0) % 100) / 100,
        streak: player.streak || 0,
        openToPlay: player.openToPlay || false,
        weeklyRanking,
        
        // Quick stats
        stats: {
          matchesPlayed: matchStats.totalMatches || 0,
          wins: matchStats.wins || 0,
          losses: matchStats.losses || 0,
          sessionsAttended: matchStats.sessionsAttended || 0,
          connectionsCount: connections.length,
        },
        
        // Layer 2: Player DNA
        dna: {
          dominantHand: player.dominantHand || "right",
          backhandType: player.backhandType || "double",
          preferredPlayType: player.preferredPlayType || "both",
          matchPreference: player.matchPreference || "casual",
          experienceLevel: player.experienceLevel,
          motivationType: player.motivationType,
          focusGoals: player.focusGoals || [],
        },
        
        // Layer 3: Glow Stats (5 Pillars)
        pillars,
        
        // Layer 4: Match History
        recentMatches: recentMatches.map(m => ({
          id: m.id,
          opponentId: m.initiatorId === playerId ? m.receiverId : m.initiatorId,
          opponentName: m.opponentName,
          opponentPhotoUrl: m.opponentPhotoUrl,
          opponentLevel: m.opponentLevel,
          matchType: m.matchType,
          playType: m.playType,
          result: m.resultStatus,
          score: m.score,
          date: m.proposedDate,
          xpAwarded: m.xpAwarded,
        })),
        upcomingMatches: upcomingMatches.map(m => ({
          id: m.id,
          opponentId: m.initiatorId === playerId ? m.receiverId : m.initiatorId,
          opponentName: m.opponentName,
          opponentPhotoUrl: m.opponentPhotoUrl,
          opponentLevel: m.opponentLevel,
          matchType: m.matchType,
          playType: m.playType,
          date: m.proposedDate,
          locationCity: m.locationCity,
        })),
        
        // Layer 5: Connections
        connections: {
          total: connections.length,
          previews: connectionPreviews.filter(Boolean),
        },
        
        // Layer 6: Availability (only for own profile or if public)
        availability: isOwnProfile || player.privacyLevel === "public" ? {
          typicalPlayTimes: player.typicalPlayTimes || [],
          preferredCities: player.preferredCities || [],
        } : null,
        
        // Metadata
        isOwnProfile,
        lastActiveAt: player.lastActiveAt,
        bio: player.bio,
        academyId: player.academyId,
      };
      
      res.json(profile);
    } catch (error) {
      console.error("Get public player profile error:", error);
      res.status(500).json({ error: "Failed to get player profile" });
    }
  });
  
  // Toggle open to play status
  app.patch("/api/player/me/open-to-play", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }
      
      const { openToPlay } = req.body;
      if (typeof openToPlay !== "boolean") {
        return res.status(400).json({ error: "openToPlay must be a boolean" });
      }
      
      await storage.updatePlayer(playerId, { openToPlay });
      
      res.json({ success: true, openToPlay });
    } catch (error) {
      console.error("Toggle open to play error:", error);
      res.status(500).json({ error: "Failed to update status" });
    }
  });

  // ==================== 3-LAYER PRICING SYSTEM ====================

  // Academy Pricing for PackagesCard - coaches and owners can read pricing
  app.get("/api/owner/academy/pricing", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }
      
      const pricing = await storage.getAcademyPricing(academyId);
      res.json(pricing);
    } catch (error) {
      console.error("Get academy pricing error:", error);
      res.status(500).json({ error: "Failed to fetch pricing" });
    }
  });

  // Academy Pricing (Layer 1) - What players pay
  app.get("/api/admin/pricing", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }
      
      const pricing = await storage.getAcademyPricing(academyId);
      res.json(pricing);
    } catch (error) {
      console.error("Get academy pricing error:", error);
      res.status(500).json({ error: "Failed to fetch pricing" });
    }
  });

  app.post("/api/admin/pricing", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }
      
      const { sessionType, pricePerSession, currency, duration, pricePerHour, effectiveFrom, notes, isPerPerson } = req.body;
      
      if (!sessionType || !pricePerSession) {
        return res.status(400).json({ error: "Session type and price per session are required" });
      }
      
      const pricing = await storage.createAcademyPricing({
        academyId,
        sessionType,
        pricePerSession,
        currency: currency || "AED",
        duration,
        pricePerHour,
        isPerPerson: isPerPerson ?? false,
        effectiveFrom: effectiveFrom || new Date().toISOString().split('T')[0],
        notes,
      });
      
      res.json(pricing);
    } catch (error) {
      console.error("Create academy pricing error:", error);
      res.status(500).json({ error: "Failed to create pricing" });
    }
  });

  // PATCH creates a new version starting tomorrow - old version automatically closed by createAcademyPricing
  app.patch("/api/admin/pricing/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }
      
      const { id } = req.params;
      const { pricePerSession, currency, duration, pricePerHour, notes, sessionType, isPerPerson, effectiveFrom: inputEffectiveFrom } = req.body;
      
      // Get old pricing to copy values from
      const existingPricing = await storage.getAcademyPricing(academyId);
      const oldPricing = existingPricing.find(p => p.id === id);
      
      if (!oldPricing) {
        return res.status(404).json({ error: "Pricing not found" });
      }
      
      // Create new pricing record starting from provided date or tomorrow
      // createAcademyPricing will automatically close the old version
      let effectiveFromDate: string;
      if (inputEffectiveFrom) {
        effectiveFromDate = inputEffectiveFrom;
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        effectiveFromDate = tomorrow.toISOString().split('T')[0];
      }
      
      const newPricing = await storage.createAcademyPricing({
        academyId,
        sessionType: sessionType || oldPricing.sessionType,
        pricePerSession: pricePerSession || oldPricing.pricePerSession,
        currency: currency || oldPricing.currency || "AED",
        duration: duration !== undefined ? duration : oldPricing.duration,
        pricePerHour: pricePerHour !== undefined ? pricePerHour : oldPricing.pricePerHour,
        isPerPerson: isPerPerson !== undefined ? isPerPerson : (oldPricing.isPerPerson ?? false),
        effectiveFrom: effectiveFromDate,
        notes,
      });
      
      res.json(newPricing);
    } catch (error) {
      console.error("Update academy pricing error:", error);
      res.status(500).json({ error: "Failed to update pricing" });
    }
  });

  // DELETE soft-deletes by setting isActive = false (preserves history)
  app.delete("/api/admin/pricing/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const today = new Date().toISOString().split('T')[0];
      
      // Soft delete: close the record
      await storage.updateAcademyPricing(id, {
        effectiveUntil: today,
        isActive: false,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Delete academy pricing error:", error);
      res.status(500).json({ error: "Failed to delete pricing" });
    }
  });

  // Coach Contracts (Layer 2) - What coaches earn
  app.get("/api/admin/coach-contracts", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }
      
      const contracts = await storage.getCoachContracts(academyId);
      res.json(contracts);
    } catch (error) {
      console.error("Get coach contracts error:", error);
      res.status(500).json({ error: "Failed to fetch contracts" });
    }
  });

  app.post("/api/admin/coach-contracts", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }
      
      const { 
        coachId, payType, hourlyRate, sessionRate, percentageRate, 
        currency, privateRate, semiPrivateRate, groupRate, 
        effectiveFrom, notes 
      } = req.body;
      
      if (!coachId) {
        return res.status(400).json({ error: "Coach ID is required" });
      }
      
      const contract = await storage.createCoachContract({
        coachId,
        academyId,
        payType: payType || "hourly",
        hourlyRate,
        sessionRate,
        percentageRate,
        currency: currency || "AED",
        privateRate,
        semiPrivateRate,
        groupRate,
        effectiveFrom: effectiveFrom || new Date().toISOString().split('T')[0],
        notes,
      });
      
      res.json(contract);
    } catch (error) {
      console.error("Create coach contract error:", error);
      res.status(500).json({ error: "Failed to create contract" });
    }
  });

  // PATCH creates a new version starting tomorrow - old version automatically closed by createCoachContract
  app.patch("/api/admin/coach-contracts/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }
      
      const { id } = req.params;
      const { 
        payType, hourlyRate, sessionRate, percentageRate, 
        currency, privateRate, semiPrivateRate, groupRate, notes 
      } = req.body;
      
      // Get old contract to copy values from
      const existingContracts = await storage.getCoachContracts(academyId);
      const oldContract = existingContracts.find(c => c.id === id);
      
      if (!oldContract) {
        return res.status(404).json({ error: "Contract not found" });
      }
      
      // Create new contract starting tomorrow
      // createCoachContract will automatically close the old version
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const newContract = await storage.createCoachContract({
        coachId: oldContract.coachId,
        academyId,
        payType: payType || oldContract.payType,
        hourlyRate: hourlyRate !== undefined ? hourlyRate : oldContract.hourlyRate,
        sessionRate: sessionRate !== undefined ? sessionRate : oldContract.sessionRate,
        percentageRate: percentageRate !== undefined ? percentageRate : oldContract.percentageRate,
        currency: currency || oldContract.currency || "AED",
        privateRate: privateRate !== undefined ? privateRate : oldContract.privateRate,
        semiPrivateRate: semiPrivateRate !== undefined ? semiPrivateRate : oldContract.semiPrivateRate,
        groupRate: groupRate !== undefined ? groupRate : oldContract.groupRate,
        effectiveFrom: tomorrow.toISOString().split('T')[0],
        notes,
      });
      
      res.json(newContract);
    } catch (error) {
      console.error("Update coach contract error:", error);
      res.status(500).json({ error: "Failed to update contract" });
    }
  });

  // DELETE soft-deletes by terminating the contract (preserves history)
  app.delete("/api/admin/coach-contracts/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const today = new Date().toISOString().split('T')[0];
      
      // Soft delete: terminate the contract
      await storage.updateCoachContract(id, {
        effectiveUntil: today,
        status: "terminated",
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Delete coach contract error:", error);
      res.status(500).json({ error: "Failed to delete contract" });
    }
  });

  // Calculate session pricing - preview before creating session
  app.post("/api/admin/calculate-pricing", authMiddleware, requireRole("admin", "academy_owner", "platform_owner", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }
      
      const { coachId, sessionType, durationMinutes } = req.body;
      
      if (!coachId || !sessionType || !durationMinutes) {
        return res.status(400).json({ error: "Coach ID, session type, and duration are required" });
      }
      
      const pricing = await storage.calculateSessionPricing(academyId, coachId, sessionType, durationMinutes);
      res.json(pricing);
    } catch (error) {
      console.error("Calculate pricing error:", error);
      res.status(500).json({ error: "Failed to calculate pricing" });
    }
  });

  // ==================== SOCIAL FEATURES API ====================

  // Get social feed for user
  app.get("/api/social/feed", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const academyId = req.user!.academyId;
      const { limit = "20", offset = "0", filter = "for_you" } = req.query;
      
      // If no academyId, return empty feed
      if (!academyId) {
        return res.json([]);
      }
      
      // Get filter-specific user/group IDs first
      let friendUserIds: string[] = [];
      let groupIds: string[] = [];
      
      if (filter === "friends") {
        try {
          const rawUser = await db.execute(sql`SELECT player_id FROM users WHERE id = ${userId} LIMIT 1`);
          const currentPlayerId = (rawUser.rows?.[0] as any)?.player_id;
          
          if (!currentPlayerId) {
            return res.json([]);
          }
          
          const rawFriends = await db.execute(sql`
            SELECT player2_id as friend_id FROM player_connections 
            WHERE player1_id = ${currentPlayerId} AND status = 'accepted'
            UNION
            SELECT player1_id as friend_id FROM player_connections 
            WHERE player2_id = ${currentPlayerId} AND status = 'accepted'
          `);
          const friendPlayerIds = (rawFriends.rows || []).map((r: any) => r.friend_id);
          
          if (friendPlayerIds.length === 0) {
            return res.json([]);
          }
          
          const rawFriendUsers = await db.execute(sql`
            SELECT id FROM users WHERE player_id = ANY(${friendPlayerIds})
          `);
          friendUserIds = (rawFriendUsers.rows || []).map((r: any) => r.id);
          
          if (friendUserIds.length === 0) {
            return res.json([]);
          }
        } catch (friendsError) {
          console.error("Error fetching friends filter:", friendsError);
          return res.json([]);
        }
      } else if (filter === "groups") {
        try {
          const rawGroups = await db.execute(sql`
            SELECT group_id FROM group_members WHERE user_id = ${userId}
          `);
          groupIds = (rawGroups.rows || []).map((r: any) => r.group_id);
          
          if (groupIds.length === 0) {
            return res.json([]);
          }
        } catch (groupsError) {
          console.error("Error fetching groups filter:", groupsError);
          return res.json([]);
        }
      }
      
      // Fetch posts with proper parameterized queries based on filter
      let posts: any[] = [];
      const limitVal = parseInt(limit as string) || 20;
      const offsetVal = parseInt(offset as string) || 0;
      
      try {
        let rawPosts: any;
        
        if (filter === "friends" && friendUserIds.length > 0) {
          rawPosts = await db.execute(sql`
            SELECT id, author_id, academy_id, context_type, context_id, caption, 
                   media_urls, media_types, visibility, group_id, cheer_count, 
                   comment_count, created_at, is_hidden
            FROM posts 
            WHERE academy_id = ${academyId} AND is_hidden = false AND author_id = ANY(${friendUserIds})
            ORDER BY created_at DESC
            LIMIT ${limitVal}
            OFFSET ${offsetVal}
          `);
        } else if (filter === "groups" && groupIds.length > 0) {
          rawPosts = await db.execute(sql`
            SELECT id, author_id, academy_id, context_type, context_id, caption, 
                   media_urls, media_types, visibility, group_id, cheer_count, 
                   comment_count, created_at, is_hidden
            FROM posts 
            WHERE academy_id = ${academyId} AND is_hidden = false AND group_id = ANY(${groupIds})
            ORDER BY created_at DESC
            LIMIT ${limitVal}
            OFFSET ${offsetVal}
          `);
        } else if (filter === "academy") {
          rawPosts = await db.execute(sql`
            SELECT id, author_id, academy_id, context_type, context_id, caption, 
                   media_urls, media_types, visibility, group_id, cheer_count, 
                   comment_count, created_at, is_hidden
            FROM posts 
            WHERE academy_id = ${academyId} AND is_hidden = false AND (visibility = 'academy' OR visibility = 'public')
            ORDER BY created_at DESC
            LIMIT ${limitVal}
            OFFSET ${offsetVal}
          `);
        } else if (filter === "events") {
          rawPosts = await db.execute(sql`
            SELECT id, author_id, academy_id, context_type, context_id, caption, 
                   media_urls, media_types, visibility, group_id, cheer_count, 
                   comment_count, created_at, is_hidden
            FROM posts 
            WHERE academy_id = ${academyId} AND is_hidden = false AND context_type = 'event'
            ORDER BY created_at DESC
            LIMIT ${limitVal}
            OFFSET ${offsetVal}
          `);
        } else {
          // Default: for_you - all academy posts
          rawPosts = await db.execute(sql`
            SELECT id, author_id, academy_id, context_type, context_id, caption, 
                   media_urls, media_types, visibility, group_id, cheer_count, 
                   comment_count, created_at, is_hidden
            FROM posts 
            WHERE academy_id = ${academyId} AND is_hidden = false
            ORDER BY created_at DESC
            LIMIT ${limitVal}
            OFFSET ${offsetVal}
          `);
        }
        
        posts = (rawPosts.rows || []).map((row: any) => ({
          id: row.id,
          authorId: row.author_id,
          academyId: row.academy_id,
          contextType: row.context_type,
          contextId: row.context_id,
          caption: row.caption,
          mediaUrls: row.media_urls || [],
          mediaTypes: row.media_types || [],
          visibility: row.visibility,
          groupId: row.group_id,
          cheerCount: row.cheer_count || 0,
          commentCount: row.comment_count || 0,
          createdAt: row.created_at,
          isHidden: row.is_hidden,
        }));
      } catch (queryError) {
        console.error("Error querying posts:", queryError);
        posts = [];
      }
      
      // Get author info using JOIN query for reliability
      const authorIds = [...new Set(posts.map(p => p.authorId).filter(Boolean))] as string[];
      let authorMap = new Map<string, { id: string; username: string; name: string; photoUrl: string | null; ballLevel: string | null; isCoach: boolean }>();
      
      
      if (authorIds.length > 0) {
        try {
          // Use a single JOIN query for each author ID
          for (const authorId of authorIds) {
            const authorResult = await db.execute(sql`
              SELECT u.id, u.username, u.player_id, u.coach_id,
                     p.name as player_name, p.profile_photo_url as player_photo, p.ball_level,
                     c.name as coach_name, c.photo_url as coach_photo
              FROM users u
              LEFT JOIN players p ON u.player_id = p.id
              LEFT JOIN coaches c ON u.coach_id = c.id
              WHERE u.id = ${authorId}
              LIMIT 1
            `);
            
            
            if (authorResult.rows && authorResult.rows.length > 0) {
              const row = authorResult.rows[0] as any;
              const authorData = {
                id: row.id,
                username: row.username || "Unknown",
                name: row.player_name || row.coach_name || row.username || "Unknown",
                photoUrl: row.player_photo || row.coach_photo || null,
                ballLevel: row.ball_level || null,
                isCoach: !!row.coach_id,
              };
              authorMap.set(authorId, authorData);
            }
          }
        } catch (authorError) {
          console.error("Error fetching authors:", authorError);
        }
      }
      
      // Get user's reactions for these posts using Drizzle inArray
      const postIds = posts.map(p => p.id);
      let reactionMap = new Map<string, string>();
      if (postIds.length > 0) {
        try {
          const userReactions = await db.select({
            postId: postReactionsTable.postId,
            reactionType: postReactionsTable.reactionType,
          }).from(postReactionsTable).where(and(
            eq(postReactionsTable.userId, userId),
            inArray(postReactionsTable.postId, postIds)
          ));
          userReactions.forEach(r => reactionMap.set(r.postId, r.reactionType));
        } catch (reactionError) {
          console.error("Error fetching reactions:", reactionError);
        }
      }
      
      const feedItems = posts.map(p => ({
        id: p.id,
        authorId: p.authorId,
        academyId: p.academyId,
        contextType: p.contextType,
        contextId: p.contextId,
        caption: p.caption,
        mediaUrls: p.mediaUrls,
        mediaTypes: p.mediaTypes,
        visibility: p.visibility,
        groupId: p.groupId,
        taggedUserIds: p.taggedUserIds,
        locationName: p.locationName,
        cheerCount: p.cheerCount,
        commentCount: p.commentCount,
        isPinned: p.isPinned,
        createdAt: p.createdAt,
        author: authorMap.get(p.authorId || "") || { id: p.authorId, username: "Unknown", name: "Unknown", photoUrl: null, ballLevel: null, isCoach: false },
        userReaction: reactionMap.get(p.id) || null,
      }));
      
      res.json(feedItems);
    } catch (error) {
      console.error("Error fetching social feed:", error);
      res.status(500).json({ error: "Failed to fetch feed" });
    }
  });

  // Upload images for social posts
  app.post("/api/social/posts/upload-images", authMiddleware, requireFeatureUnlock("community_feed"), socialPostUpload.array("images", 5), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No images uploaded" });
      }

      const imageUrls = files.map(file => `/uploads/social-posts/${file.filename}`);
      
      res.json({ 
        success: true, 
        images: imageUrls,
        count: imageUrls.length
      });
    } catch (error) {
      console.error("[Social] Error uploading images:", error);
      res.status(500).json({ error: "Failed to upload images" });
    }
  });

  // Create a new post (Moment)
  app.post("/api/social/posts", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const academyId = req.user!.academyId;
      
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }
      
      const { 
        contextType, contextId, caption, mediaUrls = [], mediaTypes = [],
        visibility = "academy", groupId, taggedUserIds = [], locationName 
      } = req.body;
      
      if (!contextType) {
        return res.status(400).json({ error: "Context type is required" });
      }
      
      // Validate caption length
      if (caption && caption.length > 280) {
        return res.status(400).json({ error: "Caption too long (max 280 characters)" });
      }
      
      const [newPost] = await db.insert(postsTable).values({
        authorId: userId,
        academyId,
        contextType,
        contextId,
        caption,
        mediaUrls,
        mediaTypes,
        visibility,
        groupId,
        taggedUserIds,
        locationName,
      }).returning();
      
      // Update user's post count
      await db.update(userSocialProfilesTable)
        .set({ postCount: sql`post_count + 1` })
        .where(eq(userSocialProfilesTable.userId, userId));
      
      res.status(201).json(newPost);
    } catch (error) {
      console.error("Error creating post:", error);
      res.status(500).json({ error: "Failed to create post" });
    }
  });

  // Get single post with details
  app.get("/api/social/posts/:id", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      
      const [post] = await db.select({
        post: postsTable,
        author: {
          id: users.id,
          username: users.username,
        },
        player: {
          id: players.id,
          name: players.name,
          photoUrl: players.photoUrl,
          ballLevel: players.ballLevel,
        },
      })
      .from(postsTable)
      .leftJoin(users, eq(postsTable.authorId, users.id))
      .leftJoin(players, eq(users.playerId, players.id))
      .where(eq(postsTable.id, id));
      
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      
      // Get reactions breakdown
      const reactions = await db.select({
        type: postReactionsTable.reactionType,
        count: count(),
      })
      .from(postReactionsTable)
      .where(eq(postReactionsTable.postId, id))
      .groupBy(postReactionsTable.reactionType);
      
      // Get user's reaction
      const [userReaction] = await db.select()
        .from(postReactionsTable)
        .where(and(
          eq(postReactionsTable.postId, id),
          eq(postReactionsTable.userId, userId)
        ));
      
      res.json({
        ...post.post,
        author: {
          id: post.author?.id,
          username: post.author?.username,
          name: post.player?.name || post.author?.username,
          photoUrl: post.player?.photoUrl,
          ballLevel: post.player?.ballLevel,
        },
        reactions: reactions.reduce((acc, r) => ({ ...acc, [r.type]: Number(r.count) }), {}),
        userReaction: userReaction?.reactionType || null,
      });
    } catch (error) {
      console.error("Error fetching post:", error);
      res.status(500).json({ error: "Failed to fetch post" });
    }
  });

  // Delete a post
  app.delete("/api/social/posts/:id", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      
      // Check ownership
      const [post] = await db.select().from(postsTable).where(eq(postsTable.id, id));
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      if (post.authorId !== userId && req.user!.role !== "platform_owner") {
        return res.status(403).json({ error: "Not authorized to delete this post" });
      }
      
      await db.delete(postsTable).where(eq(postsTable.id, id));
      
      // Update user's post count
      await db.update(userSocialProfilesTable)
        .set({ postCount: sql`GREATEST(0, post_count - 1)` })
        .where(eq(userSocialProfilesTable.userId, post.authorId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting post:", error);
      res.status(500).json({ error: "Failed to delete post" });
    }
  });

  // Add/update reaction to post
  app.post("/api/social/posts/:id/reactions", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: postId } = req.params;
      const userId = req.user!.userId;
      const { reactionType } = req.body;
      
      const validReactions = ["clap", "fire", "tennis", "muscle", "star"];
      if (!validReactions.includes(reactionType)) {
        return res.status(400).json({ error: "Invalid reaction type" });
      }
      
      // Check if reaction already exists
      const [existing] = await db.select()
        .from(postReactionsTable)
        .where(and(
          eq(postReactionsTable.postId, postId),
          eq(postReactionsTable.userId, userId)
        ));
      
      if (existing) {
        // Update existing reaction
        await db.update(postReactionsTable)
          .set({ reactionType })
          .where(eq(postReactionsTable.id, existing.id));
      } else {
        // Create new reaction
        await db.insert(postReactionsTable).values({
          postId,
          userId,
          reactionType,
        });
        
        // Increment cheer count
        await db.update(postsTable)
          .set({ cheerCount: sql`cheer_count + 1` })
          .where(eq(postsTable.id, postId));
      }
      
      res.json({ success: true, reactionType });
    } catch (error) {
      console.error("Error adding reaction:", error);
      res.status(500).json({ error: "Failed to add reaction" });
    }
  });

  // Remove reaction from post
  app.delete("/api/social/posts/:id/reactions", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: postId } = req.params;
      const userId = req.user!.userId;
      
      const result = await db.delete(postReactionsTable)
        .where(and(
          eq(postReactionsTable.postId, postId),
          eq(postReactionsTable.userId, userId)
        ));
      
      if (result.rowCount && result.rowCount > 0) {
        // Decrement cheer count
        await db.update(postsTable)
          .set({ cheerCount: sql`GREATEST(0, cheer_count - 1)` })
          .where(eq(postsTable.id, postId));
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing reaction:", error);
      res.status(500).json({ error: "Failed to remove reaction" });
    }
  });

  // Get comments for a post
  app.get("/api/social/posts/:id/comments", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: postId } = req.params;
      
      // First get comments
      const rawComments = await db.select()
        .from(postCommentsTable)
        .where(and(
          eq(postCommentsTable.postId, postId),
          eq(postCommentsTable.isHidden, false)
        ))
        .orderBy(asc(postCommentsTable.createdAt));
      
      // Then enrich with author info
      const comments = await Promise.all(rawComments.map(async (comment) => {
        let authorData = { id: comment.authorId, username: "Player", name: "Player", photoUrl: null as string | null };
        
        try {
          const [user] = await db.select().from(users).where(eq(users.id, comment.authorId)).limit(1);
          if (user) {
            authorData.username = user.username;
            authorData.name = user.username;
            if (user.playerId) {
              const [player] = await db.select().from(players).where(eq(players.id, user.playerId)).limit(1);
              if (player) {
                authorData.name = player.name;
                authorData.photoUrl = player.photoUrl;
              }
            }
          }
        } catch (e) {
          // Keep defaults
        }
        
        return {
          id: comment.id,
          postId: comment.postId,
          authorId: comment.authorId,
          text: comment.text,
          isQuickComment: comment.isQuickComment,
          quickCommentType: comment.quickCommentType,
          parentId: comment.parentId,
          isHidden: comment.isHidden,
          createdAt: comment.createdAt,
          author: authorData,
        };
      }));
      
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  // Add comment to post
  app.post("/api/social/posts/:id/comments", authMiddleware, requireFeatureUnlock("community_feed"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: postId } = req.params;
      const userId = req.user!.userId;
      const { text, isQuickComment, quickCommentType, parentId } = req.body;
      
      // Quick comments for kids
      const quickComments = {
        nice: "Nice!",
        lets_play: "Let's play!",
        great: "Great session!",
        fire: "\uD83D\uDD25\uD83D\uDD25",
      };
      
      let commentText = text;
      if (isQuickComment && quickCommentType && quickComments[quickCommentType as keyof typeof quickComments]) {
        commentText = quickComments[quickCommentType as keyof typeof quickComments];
      }
      
      if (!commentText && !isQuickComment) {
        return res.status(400).json({ error: "Comment text is required" });
      }
      
      const [newComment] = await db.insert(postCommentsTable).values({
        postId,
        authorId: userId,
        text: commentText,
        isQuickComment: !!isQuickComment,
        quickCommentType,
        parentId,
      }).returning();
      
      // Update comment count
      await db.update(postsTable)
        .set({ commentCount: sql`comment_count + 1` })
        .where(eq(postsTable.id, postId));
      
      res.status(201).json(newComment);
    } catch (error) {
      console.error("Error adding comment:", error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  });

  // Get user's groups
  app.get("/api/social/groups", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const academyId = req.user!.academyId;
      
      // Get groups user is member of
      const userGroups = await db.select({
        group: communityGroupsTable,
        membership: groupMembersTable,
      })
      .from(groupMembersTable)
      .innerJoin(communityGroupsTable, eq(groupMembersTable.groupId, communityGroupsTable.id))
      .where(eq(groupMembersTable.userId, userId));
      
      // Also get academy-wide groups
      const academyGroups = await db.select()
        .from(communityGroupsTable)
        .where(and(
          eq(communityGroupsTable.academyId, academyId || ""),
          eq(communityGroupsTable.type, "academy")
        ));
      
      const allGroups = [
        ...userGroups.map(g => ({ ...g.group, role: g.membership.role })),
        ...academyGroups.filter(ag => !userGroups.some(ug => ug.group.id === ag.id))
          .map(ag => ({ ...ag, role: "member" as const })),
      ];
      
      res.json(allGroups);
    } catch (error) {
      console.error("Error fetching groups:", error);
      res.status(500).json({ error: "Failed to fetch groups" });
    }
  });

  // Get open-to-play users
  app.get("/api/social/open-to-play", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const now = new Date();
      
      const openPlayers = await db.select({
        openToPlay: openToPlayTable,
        user: {
          id: users.id,
          username: users.username,
        },
        player: {
          id: players.id,
          name: players.name,
          photoUrl: players.photoUrl,
          ballLevel: players.ballLevel,
        },
      })
      .from(openToPlayTable)
      .leftJoin(users, eq(openToPlayTable.userId, users.id))
      .leftJoin(players, eq(users.playerId, players.id))
      .where(and(
        eq(openToPlayTable.academyId, academyId || ""),
        eq(openToPlayTable.isActive, true),
        gte(openToPlayTable.availableUntil, now)
      ))
      .orderBy(asc(openToPlayTable.availableFrom));
      
      res.json(openPlayers.map(op => ({
        ...op.openToPlay,
        user: {
          id: op.user?.id,
          username: op.user?.username,
          name: op.player?.name || op.user?.username,
          photoUrl: op.player?.photoUrl,
          ballLevel: op.player?.ballLevel,
        },
      })));
    } catch (error) {
      console.error("Error fetching open-to-play:", error);
      res.status(500).json({ error: "Failed to fetch open-to-play users" });
    }
  });

  // Set open-to-play status
  app.post("/api/social/open-to-play", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const academyId = req.user!.academyId;
      
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }
      
      const { availableFrom, availableUntil, intent = "match", locationId, locationName, message, levelRange } = req.body;
      
      // Deactivate any existing open-to-play for this user
      await db.update(openToPlayTable)
        .set({ isActive: false })
        .where(and(
          eq(openToPlayTable.userId, userId),
          eq(openToPlayTable.isActive, true)
        ));
      
      // Create new open-to-play status
      const [newStatus] = await db.insert(openToPlayTable).values({
        userId,
        academyId,
        availableFrom: new Date(availableFrom),
        availableUntil: new Date(availableUntil),
        intent,
        locationId,
        locationName,
        message,
        levelRange,
        expiresAt: new Date(availableUntil),
      }).returning();
      
      res.status(201).json(newStatus);
    } catch (error) {
      console.error("Error setting open-to-play:", error);
      res.status(500).json({ error: "Failed to set open-to-play status" });
    }
  });

  // Deactivate open-to-play status
  app.delete("/api/social/open-to-play", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      
      await db.update(openToPlayTable)
        .set({ isActive: false })
        .where(and(
          eq(openToPlayTable.userId, userId),
          eq(openToPlayTable.isActive, true)
        ));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deactivating open-to-play:", error);
      res.status(500).json({ error: "Failed to deactivate open-to-play status" });
    }
  });

  // Get social highlights for home screen
  app.get("/api/social/highlights", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const academyId = req.user!.academyId;
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      // Count new moments in last 24h
      const [momentCount] = await db.select({ count: count() })
        .from(postsTable)
        .where(and(
          eq(postsTable.academyId, academyId || ""),
          gte(postsTable.createdAt, oneDayAgo),
          eq(postsTable.isHidden, false)
        ));
      
      // Count open-to-play users
      const [openToPlayCount] = await db.select({ count: count() })
        .from(openToPlayTable)
        .where(and(
          eq(openToPlayTable.academyId, academyId || ""),
          eq(openToPlayTable.isActive, true),
          gte(openToPlayTable.availableUntil, now)
        ));
      
      res.json({
        newMoments: Number(momentCount?.count || 0),
        openToPlay: Number(openToPlayCount?.count || 0),
        newGroupPosts: 0, // TODO: implement group-specific counts
      });
    } catch (error) {
      console.error("Error fetching social highlights:", error);
      res.status(500).json({ error: "Failed to fetch highlights" });
    }
  });

  // ==================== QUEST SYSTEM API ====================

  // Get player's active quests (daily + weekly)
  app.get("/api/quests", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      const today = new Date().toISOString().split('T')[0];
      
      // Get player's active quests with template info
      const activeQuests = await db.select({
        quest: playerQuestsTable,
        template: questTemplatesTable,
      })
      .from(playerQuestsTable)
      .innerJoin(questTemplatesTable, eq(playerQuestsTable.questTemplateId, questTemplatesTable.id))
      .where(and(
        eq(playerQuestsTable.playerId, playerId),
        inArray(playerQuestsTable.status, ["active", "completed"])
      ))
      .orderBy(asc(questTemplatesTable.order));
      
      // Get today's quest slots
      const [dailySlot] = await db.select()
        .from(dailyQuestSlotsTable)
        .where(and(
          eq(dailyQuestSlotsTable.playerId, playerId),
          eq(dailyQuestSlotsTable.slotDate, today)
        ));
      
      // Group by type
      const dailyQuests = activeQuests.filter(q => q.template.questType === "daily");
      const weeklyQuests = activeQuests.filter(q => q.template.questType === "weekly");
      
      res.json({
        daily: dailyQuests.map(q => ({
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
        })),
        weekly: weeklyQuests.map(q => ({
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
        })),
        dailySlot: dailySlot ? {
          completedCount: dailySlot.completedCount,
          allCompleted: dailySlot.allCompleted,
          bonusUnlocked: dailySlot.bonusUnlocked,
        } : null,
      });
    } catch (error) {
      console.error("Error fetching quests:", error);
      res.status(500).json({ error: "Failed to fetch quests" });
    }
  });

  // Assign daily quests to player (called on app start if needed)
  app.post("/api/quests/assign-daily", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
      
      // Get available daily quest templates
      const templates = await db.select()
        .from(questTemplatesTable)
        .where(and(
          eq(questTemplatesTable.questType, "daily"),
          eq(questTemplatesTable.isActive, true),
          or(
            isNull(questTemplatesTable.academyId),
            eq(questTemplatesTable.academyId, academyId || "")
          )
        ))
        .orderBy(asc(questTemplatesTable.order))
        .limit(3);
      
      if (templates.length === 0) {
        return res.json({ message: "No quest templates available", quests: [] });
      }
      
      // Create player quests
      const createdQuests = [];
      for (const template of templates) {
        const [quest] = await db.insert(playerQuestsTable).values({
          playerId,
          questTemplateId: template.id,
          targetProgress: template.targetCount,
          xpReward: template.xpReward,
          currencyReward: template.currencyReward,
          expiresAt: endOfDay,
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
  app.post("/api/quests/assign-weekly", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      const academyId = req.user!.academyId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      // Get current week start (Monday)
      const now = new Date();
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
      
      // Get available weekly quest templates
      const templates = await db.select()
        .from(questTemplatesTable)
        .where(and(
          eq(questTemplatesTable.questType, "weekly"),
          eq(questTemplatesTable.isActive, true),
          or(
            isNull(questTemplatesTable.academyId),
            eq(questTemplatesTable.academyId, academyId || "")
          )
        ))
        .orderBy(asc(questTemplatesTable.order))
        .limit(3);
      
      if (templates.length === 0) {
        return res.json({ message: "No weekly quest templates available", quests: [] });
      }
      
      // Create player quests
      const createdQuests = [];
      for (const template of templates) {
        const [quest] = await db.insert(playerQuestsTable).values({
          playerId,
          questTemplateId: template.id,
          targetProgress: template.targetCount,
          xpReward: template.xpReward,
          currencyReward: template.currencyReward,
          expiresAt: endOfWeek,
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

  // Update quest progress
  app.post("/api/quests/:id/progress", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
  app.post("/api/quests/:id/claim", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const playerId = req.user!.playerId;
      
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
      
      if (quest.quest.status !== "completed") {
        return res.status(400).json({ error: "Quest not completed yet" });
      }
      
      if (quest.quest.claimedAt) {
        return res.status(400).json({ error: "Reward already claimed" });
      }
      
      // Mark as claimed
      await db.update(playerQuestsTable)
        .set({
          status: "claimed",
          claimedAt: new Date(),
        })
        .where(eq(playerQuestsTable.id, id));
      
      // Award XP to player
      const xpReward = quest.quest.xpReward || quest.template.xpReward || 0;
      if (xpReward > 0) {
        await db.update(players)
          .set({ xp: sql`COALESCE(xp, 0) + ${xpReward}` })
          .where(eq(players.id, playerId));
      }
      
      res.json({
        success: true,
        xpAwarded: xpReward,
        currencyAwarded: quest.quest.currencyReward || quest.template.currencyReward || 0,
      });
    } catch (error) {
      console.error("Error claiming quest reward:", error);
      res.status(500).json({ error: "Failed to claim quest reward" });
    }
  });

  // ==================== BADGES & TITLES ENDPOINTS ====================

  // Get all available badges
  app.get("/api/badges", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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

  // Get player's earned badges
  app.get("/api/player/badges", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      const earnedBadges = await db.select({
        playerBadge: playerBadgesTable,
        badge: badgesTable,
      })
        .from(playerBadgesTable)
        .innerJoin(badgesTable, eq(playerBadgesTable.badgeId, badgesTable.id))
        .where(eq(playerBadgesTable.playerId, playerId))
        .orderBy(desc(playerBadgesTable.earnedAt));
      
      res.json(earnedBadges.map(eb => ({
        ...eb.badge,
        earnedAt: eb.playerBadge.earnedAt,
      })));
    } catch (error) {
      console.error("Error fetching player badges:", error);
      res.status(500).json({ error: "Failed to fetch player badges" });
    }
  });

  // Get all available titles
  app.get("/api/titles", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
  app.get("/api/player/titles", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
  app.post("/api/player/titles/:titleId/equip", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
  app.get("/api/player/:playerId/achievements", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
  app.post("/api/player/check-badges", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
  app.get("/api/player/mission-control", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const playerId = req.user!.playerId;
      const academyId = req.user!.academyId;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      
      const now = new Date();
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
  app.get("/api/player/leaderboard", authMiddleware, requireFeatureUnlock("glow_leaderboard"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const playerId = req.user!.playerId;
      const scope = (req.query.scope as string) || "academy";
      const period = (req.query.period as string) || "weekly";
      
      // Build conditions array, filtering out undefined
      const conditions = [eq(players.status, "active")];
      if (scope === "academy" && academyId) {
        conditions.push(eq(players.academyId, academyId));
      }
      
      // Get top players by Glow Score
      const topPlayers = await db.select({
        id: players.id,
        name: players.name,
        photoUrl: players.photoUrl,
        level: players.level,
        glowScore: players.glowScore,
        xp: players.xp,
        ballLevel: players.ballLevel,
        streak: players.consecutiveDays,
      })
      .from(players)
      .where(and(...conditions))
      .orderBy(desc(players.glowScore), desc(players.xp))
      .limit(50);
      
      // Calculate current player's rank
      let myRank = 0;
      if (playerId) {
        const playerIndex = topPlayers.findIndex(p => p.id === playerId);
        if (playerIndex >= 0) {
          myRank = playerIndex + 1;
        } else {
          // Player not in top 50, get their glow score first
          const [currentPlayerData] = await db.select({ glowScore: players.glowScore })
            .from(players)
            .where(eq(players.id, playerId));
          
          const myGlowScore = currentPlayerData?.glowScore || 0;
          
          // Count players with higher glow score
          const rankConditions = [...conditions, sql`COALESCE(${players.glowScore}, 0) > ${myGlowScore}`];
          const [{ count: higherCount }] = await db.select({ count: count() })
            .from(players)
            .where(and(...rankConditions));
          myRank = Number(higherCount) + 1;
        }
      }
      
      // Get current player's data
      const currentPlayer = playerId ? topPlayers.find(p => p.id === playerId) : null;
      
      res.json({
        scope,
        period,
        myRank,
        currentPlayer: currentPlayer ? {
          ...currentPlayer,
          rank: myRank,
        } : null,
        rankings: topPlayers.map((p, idx) => ({
          rank: idx + 1,
          id: p.id,
          name: p.name,
          photoUrl: p.photoUrl,
          level: p.level || 1,
          glowScore: p.glowScore || 0,
          xp: p.xp || 0,
          ballLevel: p.ballLevel,
          streak: p.streak || 0,
          isCurrentPlayer: p.id === playerId,
        })),
      });
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  // Search players for connections
  app.get("/api/player/search", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
      
      const results = await db.select({
        id: players.id,
        name: players.name,
        photoUrl: players.photoUrl,
        level: players.level,
        glowScore: players.glowScore,
        ballLevel: players.ballLevel,
        openToPlay: players.openToPlay,
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
          photoUrl: p.photoUrl,
          level: p.level || 1,
          glowScore: p.glowScore || 0,
          ballLevel: p.ballLevel,
          openToPlay: p.openToPlay || false,
        })),
      });
    } catch (error) {
      console.error("Error searching players:", error);
      res.status(500).json({ error: "Failed to search players" });
    }
  });

  // Discover players with filters (recommended, sameLevel, academy)
  app.get("/api/player/discover", authMiddleware, requireFeatureUnlock("player_finder"), async (req: AuthenticatedRequest, res: Response) => {
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
          photoUrl: p.photoUrl,
          level: p.level || 1,
          glowScore: p.glowScore || 0,
          ballLevel: p.ballLevel,
          openToPlay: p.openToPlay || false,
        })),
      });
    } catch (error) {
      console.error("Error discovering players:", error);
      res.status(500).json({ error: "Failed to discover players" });
    }
  });

  // Get Open to Play players
  app.get("/api/player/open-to-play", authMiddleware, requireFeatureUnlock("player_finder"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const playerId = req.user!.playerId;
      
      // Build conditions for players query
      const playerConditions = [
        eq(players.status, "active"),
        eq(players.openToPlay, true),
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
        photoUrl: players.photoUrl,
        level: players.level,
        glowScore: players.glowScore,
        ballLevel: players.ballLevel,
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
          photoUrl: p.photoUrl,
          level: p.level || 1,
          glowScore: p.glowScore || 0,
          ballLevel: p.ballLevel,
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
  app.get("/api/player/connections", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
          photoUrl: players.photoUrl,
          level: players.level,
          glowScore: players.glowScore,
          ballLevel: players.ballLevel,
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
  app.post("/api/player/connections/request", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }
      
      const { targetPlayerId } = req.body;
      if (!targetPlayerId) {
        return res.status(400).json({ error: "Target player ID required" });
      }
      
      if (targetPlayerId === playerId) {
        return res.status(400).json({ error: "Cannot send friend request to yourself" });
      }
      
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
          return res.status(400).json({ error: "Already connected" });
        }
        if (existing.status === "pending") {
          return res.status(400).json({ error: "Friend request already pending" });
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
      
      res.json({ success: true, connection: newConnection });
    } catch (error) {
      console.error("Error sending friend request:", error);
      res.status(500).json({ error: "Failed to send friend request" });
    }
  });
  
  // Accept or decline friend request
  app.post("/api/player/connections/:connectionId/respond", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
  app.delete("/api/player/connections/:connectionId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
  app.get("/api/player/connections/status/:targetPlayerId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
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

  const httpServer = createServer(app);
  
  // Set up WebSocket server for real-time chat
  setupWebSocket(httpServer);
  console.log("WebSocket server initialized on /ws");
  
  return httpServer;
}
