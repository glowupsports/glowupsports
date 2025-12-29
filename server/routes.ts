import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { setupWebSocket, broadcastNewMessage } from "./websocket";
import { 
  hashPassword, 
  verifyPassword, 
  generateToken, 
  authMiddlewareWithFreshData as authMiddleware,
  requireRole, 
  requireAcademy,
  setFreshUserStorage,
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
} from "@shared/schema";
import crypto from "crypto";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import { sanitizeNote, sanitizeMessage, sanitizeTemplateName, sanitizeTemplateContent } from "./utils/sanitize";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
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

  // Validate invite token (for checking before showing registration form)
  app.get("/auth/invite/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const invite = await storage.getInviteByToken(token);

      if (!invite) {
        return res.status(404).json({ error: "Invite not found" });
      }

      if (invite.usedAt) {
        return res.status(400).json({ error: "This invite has already been used" });
      }

      if (new Date() > new Date(invite.expiresAt)) {
        return res.status(400).json({ error: "This invite has expired" });
      }

      // Get academy info
      const academy = await storage.getAcademy(invite.academyId);

      res.json({
        valid: true,
        role: invite.role,
        academyName: academy?.name || "Unknown Academy",
        invitedEmail: invite.invitedEmail,
        expiresAt: invite.expiresAt,
      });
    } catch (error) {
      console.error("Invite validation error:", error);
      res.status(500).json({ error: "Failed to validate invite" });
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
      const academyId = req.user!.academyId;
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
      const academyId = req.user!.academyId;
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

  // Browse available academies (for players to find and join)
  app.get("/api/academies/browse", async (req: Request, res: Response) => {
    try {
      const academies = await storage.getAllAcademies();
      
      // Return public info only
      const publicAcademies = await Promise.all(
        academies.map(async (academy) => {
          const coaches = await storage.getCoachesByAcademy(academy.id);
          const players = await storage.getPlayersByAcademy(academy.id);
          return {
            id: academy.id,
            name: academy.name,
            slug: academy.slug,
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
      
      // Fetch players for each session using efficient join query
      const sessionsWithPlayers = await Promise.all(
        ownSessions.map(async (session) => {
          const players = await storage.getSessionPlayersWithDetails(session.id, academyId ?? undefined);
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

      // Get courts - filtered by academy
      const courts = await storage.getAllCourts(academyId ?? undefined);
      const locations = await storage.getAllLocations(academyId ?? undefined);

      res.json({
        ownSessions: sessionsWithPlayers,
        blockedSessions: blockedSessionsMinimal,
        courts,
        locations,
        dateRange: { start: startDate, end: endDate },
      });
    } catch (error) {
      console.error("Error fetching calendar:", error);
      res.status(500).json({ error: "Failed to fetch calendar" });
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

      // Check coach conflict
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

      // Check conflicts
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

      for (let week = 0; week < sessionsToCreate; week++) {
        const weekStart = new Date(start.getTime() + week * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + duration * 60000);

        // Check conflicts for each week
        const weekCoachConflict = await storage.checkCoachConflict(coachId, weekStart, weekEnd, undefined, academyId ?? undefined);
        const weekCourtConflict = await storage.checkCourtConflict(courtId, weekStart, weekEnd, undefined, academyId ?? undefined);
        
        if (weekCoachConflict || weekCourtConflict) {
          skippedWeeks.push(week + 1);
          continue;
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
        });

        // Add players if provided
        if (playerIds && Array.isArray(playerIds)) {
          for (const playerId of playerIds) {
            await storage.addPlayerToSession({
              sessionId: session.id,
              playerId,
            });
          }
        }

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

      await storage.createAuditLog({
        entityType: "session",
        entityId: id,
        action: "update",
        performedBy: coachId!,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  // Cancel session
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

      const cancelled = await storage.cancelSession(id);

      await storage.createAuditLog({
        entityType: "session",
        entityId: id,
        action: "cancel",
        performedBy: coachId!,
      });

      res.json(cancelled);
    } catch (error) {
      console.error("Error cancelling session:", error);
      res.status(500).json({ error: "Failed to cancel session" });
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
      const { playerId, isGuest } = req.body;
      const academyId = req.user!.academyId;

      const { valid: sessionValid } = await validateSessionOwnership(id, academyId, storage);
      if (!sessionValid) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Validate player belongs to same academy (unless guest)
      if (playerId && !isGuest) {
        const { valid: playerValid } = await validatePlayerOwnership(playerId, academyId, storage);
        if (!playerValid) {
          return res.status(404).json({ error: "Player not found" });
        }
      }

      const sessionPlayer = await storage.addPlayerToSession({
        sessionId: id,
        playerId,
        isGuest: isGuest || false,
      });

      res.status(201).json(sessionPlayer);
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

      const { valid: sessionValid } = await validateSessionOwnership(id, academyId, storage);
      if (!sessionValid) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Validate player belongs to same academy
      const { valid: playerValid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!playerValid) {
        return res.status(404).json({ error: "Player not found" });
      }

      await storage.removePlayerFromSession(id, playerId);

      res.status(204).send();
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
      res.json(playersWithDetails);
    } catch (error) {
      console.error("Error fetching players:", error);
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  // Save attendance (offline-safe)
  app.post("/api/coach/sessions/:id/attendance", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { playerId, status, lateMinutes, absenceReason } = req.body;
      const academyId = req.user!.academyId;

      const { valid } = await validateSessionOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Session not found" });
      }

      const updated = await storage.updateAttendance(
        id,
        playerId,
        status,
        lateMinutes,
        absenceReason
      );

      res.json(updated);
    } catch (error) {
      console.error("Error saving attendance:", error);
      res.status(500).json({ error: "Failed to save attendance" });
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
          
          // Update player total XP
          const player = await storage.getPlayer(sp.playerId);
          if (player) {
            const newTotalXp = (player.totalXp || 0) + playerXp;
            await storage.updatePlayer(sp.playerId, { totalXp: newTotalXp });
          }
          
          // Auto-deduct credit from player's active package
          const creditResult = await storage.autoDeductPlayerCredit(sp.playerId, academyId || undefined);
          creditResults.push({
            playerId: sp.playerId,
            success: creditResult.success,
            reason: creditResult.reason,
          });
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
        } : null,
        academy: academy ? {
          id: academy.id,
          name: academy.name,
          slug: academy.slug,
        } : null,
      });
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.status(500).json({ error: "Failed to fetch current user" });
    }
  });

  // ==================== ADMIN/SETUP ENDPOINTS ====================

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
      const coach = await storage.createCoach({ ...req.body, academyId });
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
      const court = await storage.createCourt({ ...req.body, academyId });
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

  // Get all players with last lesson date (supports optional pagination)
  app.get("/api/players", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const role = req.user?.role;
      const academyId = req.user?.academyId;
      
      if (role !== "platform_owner" && !academyId) {
        return res.status(403).json({ error: "Academy membership required" });
      }
      
      const effectiveAcademyId = role === "platform_owner" ? undefined : academyId;
      const { search, paginated } = req.query;
      const usePagination = paginated === 'true';
      
      let playerList;
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
      res.status(201).json(player);
    } catch (error) {
      console.error("Error creating player:", error);
      res.status(500).json({ error: "Failed to create player" });
    }
  });

  // Get squad members (other players in same academy for private chat)
  app.get("/api/players/squad-members", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const playerId = req.user?.playerId;
      
      if (!academyId) {
        return res.status(403).json({ error: "Academy membership required" });
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

  // Delete player
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

  // ===================== PACKAGES / CREDITS =====================
  app.get("/api/players/:playerId/packages", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const pkgs = await storage.getPlayerPackages(playerId);
      res.json(pkgs);
    } catch (error) {
      console.error("Error fetching packages:", error);
      res.status(500).json({ error: "Failed to fetch packages" });
    }
  });

  app.get("/api/players/:playerId/packages/active", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const pkgs = await storage.getActivePlayerPackages(playerId);
      res.json(pkgs);
    } catch (error) {
      console.error("Error fetching active packages:", error);
      res.status(500).json({ error: "Failed to fetch active packages" });
    }
  });

  app.post("/api/packages", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId, totalCredits, remainingCredits, expiryDate } = req.body;
      const academyId = req.user!.academyId;
      
      if (!playerId || totalCredits === undefined) {
        return res.status(400).json({ error: "playerId and totalCredits are required" });
      }
      
      const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const pkg = await storage.createPackage({
        playerId,
        totalCredits,
        remainingCredits: remainingCredits ?? totalCredits,
        expiryDate: expiryDate || null,
      });
      res.status(201).json(pkg);
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
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePackageOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Package not found" });
      }
      
      await storage.deletePackage(id, academyId ?? undefined);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting package:", error);
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
      
      // Check for conflicts for all weeks
      const startDate = new Date(seriesStartDate);
      const [hours, minutes] = startTime.split(':').map(Number);
      
      for (let week = 0; week < weekCount; week++) {
        const sessionDate = new Date(startDate);
        sessionDate.setDate(sessionDate.getDate() + (week * 7));
        
        const currentDay = sessionDate.getDay();
        const daysToAdd = dayOfWeek - currentDay;
        sessionDate.setDate(sessionDate.getDate() + daysToAdd);
        
        const sessionStartTime = new Date(sessionDate);
        sessionStartTime.setHours(hours, minutes, 0, 0);
        
        const sessionEndTime = new Date(sessionStartTime);
        sessionEndTime.setMinutes(sessionEndTime.getMinutes() + duration);
        
        // Check coach conflict (pass undefined for excludeSessionId, academyId for tenant isolation)
        const coachConflict = await storage.checkCoachConflict(coachId, sessionStartTime, sessionEndTime, undefined, academyId || undefined);
        if (coachConflict) {
          return res.status(409).json({ 
            error: `Coach has a conflicting session on week ${week + 1}`,
            conflictWeek: week + 1,
            conflictDate: sessionDate.toISOString()
          });
        }
        
        // Check court conflict if courtId provided
        if (courtId) {
          const courtConflict = await storage.checkCourtConflict(courtId, sessionStartTime, sessionEndTime, undefined, academyId || undefined);
          if (courtConflict) {
            return res.status(409).json({ 
              error: `Court has a conflicting booking on week ${week + 1}`,
              conflictWeek: week + 1,
              conflictDate: sessionDate.toISOString()
            });
          }
        }
      }
      
      // Calculate end date
      const endDate = new Date(startDate);
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
      
      // Add players to all non-skipped sessions if playerIds provided
      if (playerIds && Array.isArray(playerIds) && playerIds.length > 0) {
        for (const session of sessionInstances) {
          if (!session.isSkipped) {
            for (const playerId of playerIds) {
              await storage.addPlayerToSession({
                sessionId: session.id,
                playerId,
              });
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
      res.json(settings);
    } catch (error) {
      console.error("Error fetching academy settings:", error);
      res.status(500).json({ error: "Failed to fetch academy settings" });
    }
  });

  app.patch("/api/academy/settings", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const settings = await storage.upsertAcademySettings(academyId, req.body);
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
            academy: academy ? { id: academy.id, name: academy.name, slug: academy.slug } : null,
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
      const { token, platform, deviceName } = req.body;

      if (!token || !platform) {
        return res.status(400).json({ error: "Token and platform are required" });
      }

      const deviceToken = await storage.registerPushToken({
        userId,
        coachId,
        token,
        platform,
        deviceName,
      });

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
  app.get("/api/owner/profile", authMiddleware, requireRole("owner", "academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
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
  app.post("/api/owner/profile", authMiddleware, requireRole("owner", "academy_owner"), async (req: AuthenticatedRequest, res: Response) => {
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
      });
    } catch (error) {
      console.error("Platform stats error:", error);
      res.status(500).json({ error: "Failed to fetch platform stats" });
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

      const upcomingSessions = sessionsThisWeek.slice(0, 10).map((s: any) => ({
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

  // Admin - Get detailed player stats with payments
  app.get("/api/admin/players/:playerId/stats", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user?.academyId;
      
      const player = await storage.getPlayer(playerId);
      if (!player || (academyId && player.academyId !== academyId)) {
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
  
  // Get player dashboard data
  app.get("/api/player/me/dashboard", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Return empty data for users without player profile
      if (!req.user!.playerId) {
        // Check if this is a player role needing onboarding
        const isPlayerNeedingOnboarding = req.user!.role === "player";
        return res.json({
          needsOnboarding: isPlayerNeedingOnboarding,
          player: null,
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
      
      // Get next upcoming session using player-specific query
      const now = new Date();
      const future = new Date();
      future.setDate(future.getDate() + 30);
      
      let nextSession = null;
      const upcomingSessions = await storage.getPlayerSessionsWithDetails(playerId, now, future);
      if (upcomingSessions.length > 0) {
        const session = upcomingSessions[0];
        const court = session.courtId ? await storage.getCourt(session.courtId) : null;
        nextSession = {
          id: session.id,
          date: session.startTime,
          type: session.sessionType,
          courtName: court?.name,
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
      
      // Get XP and level data
      const xpData = await storage.getPlayerXpTotal(playerId);
      const totalXp = xpData.totalXp || player.totalXp || 0;
      const level = xpData.level || player.level || 1;
      const glowScore = Math.min(100, Math.round((totalXp / (level * 500)) * 100));
      
      res.json({
        player: {
          id: player.id,
          name: player.name,
          level,
          xp: totalXp,
          glowScore,
          ballLevel: player.ballLevel,
          streak,
          onboardingCompleted: player.onboardingCompleted ?? false,
        },
        coach: coach ? {
          id: coach.id,
          name: coach.name,
          avatar: null,
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
      });
    } catch (error) {
      console.error("Error fetching player dashboard:", error);
      res.status(500).json({ error: "Failed to fetch player dashboard" });
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
      
      // Enrich with court names
      const playerSessions = await Promise.all(
        sessions.map(async (session) => {
          const court = session.courtId ? await storage.getCourt(session.courtId) : null;
          return {
            id: session.id,
            startTime: session.startTime,
            endTime: session.endTime,
            sessionType: session.sessionType,
            courtName: court?.name,
            attended: session.attended === "present",
            status: session.status,
          };
        })
      );
      
      res.json(playerSessions);
    } catch (error) {
      console.error("Error fetching player sessions:", error);
      res.status(500).json({ error: "Failed to fetch player sessions" });
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
      const nextLevel = player.ballLevel === 'red1' ? 'red2' : 
                        player.ballLevel === 'red2' ? 'red3' :
                        player.ballLevel === 'red3' ? 'orange1' :
                        player.ballLevel === 'orange1' ? 'orange2' :
                        player.ballLevel === 'orange2' ? 'orange3' :
                        player.ballLevel === 'orange3' ? 'green1' :
                        player.ballLevel === 'green1' ? 'green2' :
                        player.ballLevel === 'green2' ? 'green3' :
                        player.ballLevel === 'green3' ? 'yellow1' :
                        player.ballLevel === 'yellow1' ? 'yellow2' :
                        player.ballLevel === 'yellow2' ? 'yellow3' :
                        player.ballLevel === 'yellow3' ? 'glow' : 'glow';
      
      let levelReadiness = null;
      try {
        levelReadiness = await storage.calculatePlayerLevelReadiness(playerId, nextLevel);
      } catch (e) {
        // Silently fail - readiness is optional
      }
      
      res.json({
        level,
        xp: totalXp,
        xpForNextLevel: (level + 1) * 500,
        glowScore,
        ballLevel: player.ballLevel,
        nextBallLevel: nextLevel,
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
      });
    } catch (error) {
      console.error("Error fetching player progress:", error);
      res.status(500).json({ error: "Failed to fetch player progress" });
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
      });
    } catch (error) {
      console.error("Error fetching player profile:", error);
      res.status(500).json({ error: "Failed to fetch player profile" });
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
  
  // Save player onboarding data
  app.post("/api/player/me/onboarding", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      let playerId = req.user!.playerId;
      let newPlayerCreated = false;
      const { motivationType, dateOfBirth, dominantHand, backhandType, experienceLevel, enjoymentTags, focusGoals, selfConfidenceFlags } = req.body;

      // If no player profile exists, create one during onboarding
      if (!playerId) {
        if (req.user!.role !== "player") {
          return res.status(403).json({ error: "Player account required" });
        }
        
        // Create a new player profile for this user
        const user = await storage.getUser(req.user!.id);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }
        
        // Create player with minimal required fields (name is the only required field)
        const newPlayer = await storage.createPlayer({
          name: user.email.split("@")[0] || "Player",
          email: user.email,
          ballLevel: "green",
          academyId: null, // Will be assigned when they join an academy
          coachId: null,
        });
        
        playerId = newPlayer.id;
        newPlayerCreated = true;
        
        // Link the player to the user account
        await storage.updateUser(user.id, { playerId: newPlayer.id });
      }

      const updatedPlayer = await storage.updatePlayer(playerId, {
        onboardingCompleted: true,
        motivationType,
        dateOfBirth,
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
      
      const sessions = await storage.getPlayerSessionsWithDetails(
        playerId,
        new Date(0),
        new Date()
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

  // Academy Owner - Get schedule/operations data
  app.get("/api/owner/operations", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      
      let dbCourts: any[] = [];
      if (academyId) {
        dbCourts = await storage.getAllCourts(academyId);
      }

      const courtSchedule = dbCourts.length > 0 
        ? dbCourts.map(court => ({
            name: court.name,
            sessions: [],
          }))
        : [];

      res.json({
        courts: courtSchedule,
        insights: {
          peakHours: "N/A",
          utilization: 0,
          conflicts: 0,
        },
      });
    } catch (error) {
      console.error("Owner operations error:", error);
      res.status(500).json({ error: "Failed to fetch operations data" });
    }
  });

  // Academy Owner - Get finance data
  app.get("/api/owner/finance", authMiddleware, requireRole("owner", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      
      let payments: any[] = [];
      // Payments endpoint - currently no data until payments feature is implemented

      const collected = payments.filter(p => p.status === "paid").reduce((sum, p) => sum + (p.amount || 0), 0);
      const pending = payments.filter(p => p.status === "pending").reduce((sum, p) => sum + (p.amount || 0), 0);
      const overdue = payments.filter(p => p.status === "overdue").reduce((sum, p) => sum + (p.amount || 0), 0);

      res.json({
        revenue: {
          thisWeek: 0,
          thisMonth: 0,
          weekChange: 0,
          monthChange: 0,
          weekSessions: 0,
          monthSessions: 0,
        },
        summary: {
          collected,
          pending,
          overdue,
        },
        payments: payments.map(p => ({
          id: p.id,
          playerName: p.playerName || "Unknown",
          package: p.packageName || "Session",
          amount: p.amount || 0,
          status: p.status || "pending",
          dueDate: p.dueDate,
        })),
        subscriptions: {
          total: 0,
          monthlyRevenue: 0,
          breakdown: [],
        },
      });
    } catch (error) {
      console.error("Owner finance error:", error);
      res.status(500).json({ error: "Failed to fetch finance data" });
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
          return {
            id: coach.id,
            name: coach.name,
            role: coach.role || "Coach",
            status: coach.isActive !== false ? "active" : "paused",
            stats: [
              { label: "Sessions/wk", value: String(coach.weeklySessionCount || 0) },
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

  const httpServer = createServer(app);
  
  // Set up WebSocket server for real-time chat
  setupWebSocket(httpServer);
  console.log("WebSocket server initialized on /ws");
  
  return httpServer;
}
