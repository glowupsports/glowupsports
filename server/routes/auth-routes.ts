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
  } from "@shared/schema";
  import { calculateAgeFromDOB, getBallLevelFromAge, isValidDOB } from "@shared/ballLevel";
  import { authLimiter, inviteLimiter } from "../rateLimiter";
  import { hashPassword, verifyPassword, generateToken, generateRefreshToken, validatePassword, JWT_SECRET, refreshAuthMiddleware } from "../auth";
  import { sendWelcomeEmail, sendPlayerInviteEmail, sendCoachInviteEmail, sendOTPEmail, verifyOTPCode, hasValidOTP, markEmailVerified, isEmailVerified, clearEmailVerified, sendPasswordResetEmail } from "../emailService";
  import crypto from "crypto";
  import { verifyAppleIdentityToken } from "../utils/appleAuth";

  // Per-identifier rate limit for password-reset endpoints. The IP-based
  // `authLimiter` already applies; this adds defence-in-depth so that a
  // single account can't be used to flood email or burn reset codes from
  // many IPs.
  const passwordResetByIdentifier = new Map<string, { count: number; resetAt: number }>();
  function checkPasswordResetIdentifierLimit(identifier: string, max = 5, windowMs = 15 * 60 * 1000): boolean {
    const key = identifier.toLowerCase();
    const now = Date.now();
    const entry = passwordResetByIdentifier.get(key);
    if (!entry || entry.resetAt < now) {
      passwordResetByIdentifier.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count += 1;
    return true;
  }
  const router = Router();
  function generateShortInviteCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      const randomByte = crypto.randomInt(0, chars.length);
      code += chars[randomByte];
    }
    return code;
  }
    // ==================== AUTH ENDPOINTS ====================
  // Registration routes are role-specific:
  // - /auth/register/player - Open player self-registration
  // - /auth/register/coach - Invite-only coach registration (requires valid invite token)
  // - /auth/apply/academy - Academy owner application (requires platform owner approval)
  // The legacy /auth/register endpoint has been removed for security.

  // Check username availability (for real-time validation during registration)
  router.get(
    "/api/auth/check-username/:username",
    async (req: Request, res: Response) => {
      try {
        const { username: rawUsername } = req.params;

        // Normalize to lowercase for consistent checking
        const username = rawUsername.toLowerCase();

        if (!username || username.length < 3) {
          return res
            .status(400)
            .json({
              available: false,
              error: "Username must be at least 3 characters",
            });
        }

        if (!/^[a-z0-9_]+$/.test(username)) {
          return res
            .status(400)
            .json({
              available: false,
              error: "Only letters, numbers, and underscores allowed",
            });
        }

        const exists = await storage.checkUsernameExists(username);
        res.json({ available: !exists });
      } catch (error) {
        console.error("Username check error:", error);
        res.status(500).json({ available: false, error: "Check failed" });
      }
    },
  );

  router.post("/auth/login", authLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: fromZodError(parsed.error).message });
      }

      const { username, password } = parsed.data;

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (user.deleted === true) {
        return res.status(401).json({ error: "ACCOUNT_DELETED", message: "This account has been deleted." });
      }

      const validPassword = await verifyPassword(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      await storage.updateUserLastLogin(user.id);

      // Get profile photo URL and additional data based on role
      let profilePhotoUrl: string | null = null;
      let displayName = user.username;
      let effectiveAcademyId = user.academyId;

      if (user.coachId) {
        const coach = await storage.getCoach(user.coachId);
        if (coach) {
          profilePhotoUrl = coach.profilePhotoUrl || null;
          displayName = coach.name || user.username;
        }
      } else if (user.playerId) {
        // For players, get academyId from player record (not user record)
        const player = await storage.getPlayer(user.playerId);
        if (player) {
          profilePhotoUrl = (player as any).profilePhotoUrl || null;
          displayName = player.name || user.username;
          // Use player's academyId - this is where players are linked to academies
          effectiveAcademyId = player.academyId || user.academyId;
        }
      }

      const jwtPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        academyId: effectiveAcademyId,
        coachId: user.coachId,
        playerId: user.playerId,
      };
      const token = generateToken(jwtPayload);
      const refreshToken = generateRefreshToken(jwtPayload);

      res.json({
        token,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          academyId: effectiveAcademyId,
          coachId: user.coachId,
          playerId: user.playerId,
          profilePhotoUrl,
          displayName,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // ==================== APPLE SIGN-IN AUTH ====================

  router.post("/auth/apple/login", authLimiter, async (req: Request, res: Response) => {
    try {
      const { identityToken, user: appleUser } = req.body;

      if (!identityToken || !appleUser) {
        return res.status(400).json({ error: "Apple identity token and user identifier are required" });
      }

      // CRITICAL (Task #750): verify the identity token against Apple's JWKS
      // before trusting *any* of its contents. The body's `appleUser` field is
      // only accepted if it matches the verified `sub` claim — otherwise an
      // attacker could submit any Apple user id to pivot into another account.
      let claims;
      try {
        claims = await verifyAppleIdentityToken(identityToken);
      } catch (err) {
        console.warn("[AppleLogin] Identity token verification failed:", (err as Error).message);
        return res.status(401).json({ error: "Apple identity token is invalid or expired" });
      }
      if (claims.sub !== appleUser) {
        console.warn(`[AppleLogin] sub mismatch: token=${claims.sub} body=${appleUser}`);
        return res.status(401).json({ error: "Apple identity token does not match user" });
      }

      // Use the email from the verified JWT only — never from the request body.
      // Apple only includes `email` on the very first sign-in for an app.
      const verifiedEmail = typeof claims.email === "string" ? claims.email.toLowerCase().trim() : null;
      const emailVerified = claims.email_verified === true || claims.email_verified === "true";

      let existingUser = await storage.getUserByAppleId(appleUser);
      let linkedToExisting = false;
      if (!existingUser && verifiedEmail && emailVerified) {
        // Reject Apple's privaterelay addresses (per-app, can never match an
        // existing user) and our own `@appleid.local` stub used by
        // /auth/apple/register, both of which would create false-positive links.
        const isStub = verifiedEmail.endsWith("@appleid.local");
        const isPrivateRelay = verifiedEmail.endsWith("@privaterelay.appleid.com");
        if (!isStub && !isPrivateRelay) {
          // Email is non-unique in this schema (families share emails). Only
          // auto-link when EXACTLY one eligible (non-deleted, no existing
          // Apple ID) account matches; otherwise fall through to APPLE_NOT_LINKED
          // so the user disambiguates by signing in with username first.
          const matches = await storage.getUsersByEmail(verifiedEmail);
          const eligible = matches.filter((u) => u.deleted !== true && !u.appleId);
          if (eligible.length === 1) {
            const candidate = eligible[0];
            await storage.linkAppleId(candidate.id, appleUser);
            existingUser = { ...candidate, appleId: appleUser } as typeof candidate;
            linkedToExisting = true;
            console.log(`[AppleLogin] Auto-linked Apple ID to existing user ${candidate.id} via verified email match`);
          } else if (eligible.length > 1) {
            console.log(`[AppleLogin] Skipping auto-link: ${eligible.length} accounts share email; require username sign-in first`);
          }
        }
      }

      if (!existingUser) {
        return res.status(404).json({
          error: "No account linked to this Apple ID",
          code: "APPLE_NOT_LINKED",
          message: "Please log in with your username first and link your Apple ID in Settings."
        });
      }

      if (existingUser.deleted === true) {
        return res.status(401).json({ error: "ACCOUNT_DELETED", message: "This account has been deleted." });
      }

      await storage.updateUserLastLogin(existingUser.id);

      let profilePhotoUrl: string | null = null;
      let displayName = existingUser.username;
      let effectiveAcademyId = existingUser.academyId;

      if (existingUser.coachId) {
        const coach = await storage.getCoach(existingUser.coachId);
        if (coach) {
          profilePhotoUrl = coach.profilePhotoUrl || null;
          displayName = coach.name || existingUser.username;
        }
      } else if (existingUser.playerId) {
        const player = await storage.getPlayer(existingUser.playerId);
        if (player) {
          profilePhotoUrl = (player as any).profilePhotoUrl || null;
          displayName = player.name || existingUser.username;
          effectiveAcademyId = player.academyId || existingUser.academyId;
        }
      }

      const appleJwtPayload = {
        userId: existingUser.id,
        email: existingUser.email,
        role: existingUser.role,
        academyId: effectiveAcademyId,
        coachId: existingUser.coachId,
        playerId: existingUser.playerId,
      };
      const token = generateToken(appleJwtPayload);
      const refreshToken = generateRefreshToken(appleJwtPayload);

      res.json({
        token,
        refreshToken,
        linkedToExisting,
        user: {
          id: existingUser.id,
          username: existingUser.username,
          email: existingUser.email,
          role: existingUser.role,
          academyId: effectiveAcademyId,
          coachId: existingUser.coachId,
          playerId: existingUser.playerId,
          profilePhotoUrl,
          displayName,
        },
      });
    } catch (error) {
      console.error("Apple login error:", error);
      res.status(500).json({ error: "Apple Sign-In failed" });
    }
  });

  // Apple Sign-In registration: creates a new player account when no user is
  // linked to the Apple ID yet. We require date of birth so we can assign the
  // correct ball level from day one (Task #642).
  router.post("/auth/apple/register", authLimiter, async (req: Request, res: Response) => {
    try {
      const appleRegisterSchema = z.object({
        identityToken: z.string().min(1),
        user: z.string().min(1),
        email: z.string().email().optional().nullable(),
        firstName: z.string().trim().max(80).optional().nullable(),
        lastName: z.string().trim().max(80).optional().nullable(),
        dateOfBirth: z.string().min(1),
      });
      const parsed = appleRegisterSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { user: appleUser, email: appleEmail, firstName, lastName, dateOfBirth } = parsed.data;

      const dobValidation = isValidDOB(dateOfBirth);
      if (!dobValidation.valid) {
        return res.status(400).json({ error: dobValidation.error || "Invalid date of birth" });
      }

      const existingUser = await storage.getUserByAppleId(appleUser);
      if (existingUser) {
        return res.status(409).json({
          error: "An account is already linked to this Apple ID. Please sign in instead.",
          code: "APPLE_ALREADY_LINKED",
        });
      }

      const age = calculateAgeFromDOB(dateOfBirth);
      const initialBallLevel = getBallLevelFromAge(age);

      // Build a display name from whatever Apple shared on first sign-in.
      const trimmedFirst = (firstName || "").trim();
      const trimmedLast = (lastName || "").trim();
      const displayName = [trimmedFirst, trimmedLast].filter(Boolean).join(" ") || "New Player";

      // Generate a unique username. Apple does not provide one, so derive a
      // short opaque handle and fall back to retries on the (extremely rare)
      // collision.
      const generateAppleUsername = () => {
        const suffix = crypto.randomBytes(4).toString("hex");
        return `apple_${suffix}`;
      };
      let username = generateAppleUsername();
      for (let i = 0; i < 5; i++) {
        const taken = await storage.checkUsernameExists(username);
        if (!taken) break;
        username = generateAppleUsername();
      }

      // Apple Sign-In replaces password-based auth, so we store an unusable
      // random hash that nobody can sign in with.
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const hashedPassword = await hashPassword(randomPassword);

      const safeEmail = (appleEmail || `${appleUser.replace(/[^A-Za-z0-9]/g, "")}@appleid.local`).toLowerCase();

      const player = await storage.createPlayer({
        name: displayName,
        email: safeEmail,
        phone: null,
        tshirtSize: null,
        height: null,
        age,
        dateOfBirth,
        ballLevel: initialBallLevel,
        academyId: null,
        coachId: null,
      });

      const newUser = await storage.createUser({
        username,
        email: safeEmail,
        password: hashedPassword,
        role: "player",
        academyId: null,
        coachId: null,
      });

      await storage.updateUser(newUser.id, { playerId: player.id });
      await storage.linkAppleId(newUser.id, appleUser);

      const jwtPayload = {
        userId: newUser.id,
        email: newUser.email,
        role: newUser.role,
        academyId: newUser.academyId,
        coachId: newUser.coachId,
        playerId: player.id,
      };
      const token = generateToken(jwtPayload);
      const refreshToken = generateRefreshToken(jwtPayload);

      res.status(201).json({
        token,
        refreshToken,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          academyId: newUser.academyId,
          playerId: player.id,
          displayName,
          profilePhotoUrl: null,
        },
        message: "Account created successfully.",
      });
    } catch (error) {
      console.error("Apple registration error:", error);
      res.status(500).json({ error: "Apple Sign-In registration failed" });
    }
  });

  // Allow a freshly registered Apple Sign-In user to replace their generated
  // `apple_<hex>` handle with a real, user-chosen username (Task #687).
  // Only callable while the current username still matches the auto-generated
  // pattern, so existing users who already picked a name can never be silently
  // renamed.
  router.post("/auth/apple/choose-username", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const schema = z.object({
        username: z.string().trim().min(3).max(30),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const username = parsed.data.username.toLowerCase();
      if (!/^[a-z0-9_]+$/.test(username)) {
        return res.status(400).json({ error: "Only letters, numbers, and underscores allowed" });
      }
      if (/^apple_[a-f0-9]+$/.test(username)) {
        return res.status(400).json({ error: "Please pick a friendlier username" });
      }

      const currentUser = await storage.getUserById(userId);
      if (!currentUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Guard: only auto-generated Apple handles may be renamed via this route.
      if (!/^apple_[a-f0-9]+$/.test(currentUser.username)) {
        return res.status(409).json({
          error: "Username has already been chosen",
          code: "USERNAME_ALREADY_SET",
        });
      }

      // If the user is just re-submitting the same name they already have we
      // should still treat it as a no-op success — but guarded above already.
      const taken = await storage.checkUsernameExists(username);
      if (taken) {
        return res.status(409).json({ error: "Username already taken. Please choose a different one." });
      }

      const updated = await storage.updateUser(userId, { username });
      if (!updated) {
        return res.status(500).json({ error: "Failed to update username" });
      }

      res.json({
        success: true,
        user: {
          id: updated.id,
          username: updated.username,
          email: updated.email,
          role: updated.role,
        },
      });
    } catch (error) {
      console.error("Apple choose-username error:", error);
      res.status(500).json({ error: "Failed to update username" });
    }
  });

  router.post("/auth/apple/link", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { identityToken, user: appleUser } = req.body;
      if (!identityToken || !appleUser) {
        return res.status(400).json({ error: "Apple identity token and user identifier are required" });
      }

      const existingLink = await storage.getUserByAppleId(appleUser);
      if (existingLink) {
        if (existingLink.id === userId) {
          return res.status(400).json({ error: "This Apple ID is already linked to your account" });
        }
        return res.status(409).json({ error: "This Apple ID is already linked to another account" });
      }

      const currentUser = await storage.getUserById(userId);
      if (currentUser?.appleId) {
        return res.status(400).json({ error: "Your account already has an Apple ID linked. Unlink it first." });
      }

      await storage.linkAppleId(userId, appleUser);

      res.json({ success: true, message: "Apple ID linked successfully" });
    } catch (error) {
      console.error("Apple link error:", error);
      res.status(500).json({ error: "Failed to link Apple ID" });
    }
  });

  router.post("/auth/apple/unlink", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const currentUser = await storage.getUserById(userId);
      if (!currentUser?.appleId) {
        return res.status(400).json({ error: "No Apple ID is linked to your account" });
      }

      await storage.unlinkAppleId(userId);

      res.json({ success: true, message: "Apple ID unlinked successfully" });
    } catch (error) {
      console.error("Apple unlink error:", error);
      res.status(500).json({ error: "Failed to unlink Apple ID" });
    }
  });

  // ==================== FORGOT PASSWORD (Task #750) ====================
  // Two endpoints:
  //  1. POST /auth/forgot-password { identifier } — always returns 200 to avoid
  //     leaking whether the username/email exists. If a user is found, a
  //     6-digit code is generated, hashed and stored, and emailed to them.
  //  2. POST /auth/reset-password { identifier, code, newPassword } — verifies
  //     the code (max 5 attempts), updates the password, marks the code used.
  router.post("/auth/forgot-password", authLimiter, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        identifier: z.string().trim().min(3).max(120),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const identifier = parsed.data.identifier.toLowerCase();

      // Per-identifier throttle (5 / 15 min) on top of IP-based authLimiter so
      // an attacker can't burn email quota or codes by rotating IPs.
      if (!checkPasswordResetIdentifierLimit(identifier)) {
        // Still opaque — never leak whether the identifier exists.
        return res.json({ success: true, message: "If an account matches, a reset code has been sent." });
      }

      // Try username first, fall back to email lookup. Email is non-unique in
      // this schema (families share emails); if the email matches more than
      // one account we cannot safely pick one, so treat it as a non-match
      // (opaque success — same response as "no account").
      let user = await storage.getUserByUsername(identifier);
      const identifierIsEmail = identifier.includes("@");
      if (!user && identifierIsEmail) {
        const matches = await storage.getUsersByEmail(identifier);
        const eligible = matches.filter((u) => u.deleted !== true && !!u.email);
        if (eligible.length === 1) {
          user = eligible[0];
        } else if (eligible.length > 1) {
          console.log(`[ForgotPassword] Email matches ${eligible.length} accounts; refusing to disambiguate (opaque response)`);
          // Leave `user` undefined so the next branch returns the opaque success.
        }
      }

      // For username lookups (not email), we can safely surface the
      // "account exists but has no email on file" case so the player knows
      // to contact their coach/admin. We never do this for email lookups —
      // that would leak whether the email is registered.
      if (user && user.deleted !== true && !identifierIsEmail) {
        const isAppleStub = user.email?.endsWith("@appleid.local") ?? false;
        if (!user.email || isAppleStub) {
          return res.json({
            success: true,
            noEmail: true,
            message: "This account doesn't have an email on file. Please contact your coach or academy admin to reset your password.",
          });
        }
      }

      // Always pretend we sent the email — never leak account existence
      if (!user || user.deleted === true || !user.email) {
        return res.json({ success: true, message: "If an account matches, a reset code has been sent." });
      }

      // Apple-only accounts shouldn't get reset codes (they have no real password)
      if (user.email.endsWith("@appleid.local")) {
        return res.json({ success: true, message: "If an account matches, a reset code has been sent." });
      }

      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      const codeHash = await hashPassword(code);
      // Deep-link token (32 bytes, base64url) — the user clicks the email
      // link and we look the row up by hash; the raw token never sits in DB.
      const token = crypto.randomBytes(32).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min
      await storage.createPasswordResetCode(user.id, codeHash, expiresAt, tokenHash);

      const baseUrl = process.env.EXPO_PUBLIC_DOMAIN || process.env.APP_BASE_URL || "https://glowupsports.replit.app";
      const resetLink = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;

      // Resolve a friendly display name for the email greeting
      let displayName: string | undefined;
      if (user.coachId) {
        const coach = await storage.getCoach(user.coachId);
        displayName = coach?.name || user.username;
      } else if (user.playerId) {
        const player = await storage.getPlayer(user.playerId);
        displayName = player?.name || user.username;
      } else {
        displayName = user.username;
      }

      const result = await sendPasswordResetEmail({ to: user.email, code, displayName, resetLink });
      if (!result.success) {
        console.error("[ForgotPassword] Email send failed:", result.error);
        // Still return success — caller can retry; we already created the code
      }
      console.log(`[ForgotPassword] Reset code issued for user ${user.id}`);
      return res.json({ success: true, message: "If an account matches, a reset code has been sent." });
    } catch (error) {
      console.error("Forgot password error:", error);
      // Same opaque response on errors so attackers can't probe
      return res.json({ success: true, message: "If an account matches, a reset code has been sent." });
    }
  });

  router.post("/auth/reset-password", authLimiter, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        identifier: z.string().trim().min(3).max(120),
        code: z.string().trim().regex(/^\d{6}$/, "Code must be 6 digits"),
        newPassword: z.string().min(8).max(128),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { code, newPassword } = parsed.data;
      const identifier = parsed.data.identifier.toLowerCase();

      if (!checkPasswordResetIdentifierLimit(identifier, 10, 15 * 60 * 1000)) {
        return res.status(429).json({ error: "Too many attempts. Please try again later." });
      }

      const passwordCheck = validatePassword(newPassword);
      if (!passwordCheck.valid) {
        return res.status(400).json({ error: passwordCheck.errors.join(". ") });
      }

      // Same disambiguation as /auth/forgot-password: emails are non-unique
      // (families share emails) so multiple matches must NOT be reset
      // — refuse and tell the user to use their username instead.
      let user = await storage.getUserByUsername(identifier);
      if (!user && identifier.includes("@")) {
        const matches = await storage.getUsersByEmail(identifier);
        const eligible = matches.filter((u) => u.deleted !== true);
        if (eligible.length === 1) {
          user = eligible[0];
        } else if (eligible.length > 1) {
          return res.status(400).json({
            error: "This email is shared by multiple accounts. Please sign in with your username and try again.",
          });
        }
      }
      if (!user || user.deleted === true) {
        return res.status(400).json({ error: "Invalid or expired code." });
      }

      const active = await storage.getActivePasswordResetCode(user.id);
      if (!active) {
        return res.status(400).json({ error: "Invalid or expired code." });
      }
      if (active.attemptCount >= 5) {
        return res.status(429).json({ error: "Too many attempts. Please request a new code." });
      }

      const matches = await verifyPassword(code, active.codeHash);
      if (!matches) {
        await storage.incrementPasswordResetAttempt(active.id);
        return res.status(400).json({ error: "Invalid or expired code." });
      }

      const hashed = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashed);
      await storage.markPasswordResetCodeUsed(active.id);
      console.log(`[ResetPassword] Password reset for user ${user.id}`);

      return res.json({ success: true, message: "Password reset. You can now sign in with your new password." });
    } catch (error) {
      console.error("Reset password error:", error);
      return res.status(500).json({ error: "Failed to reset password." });
    }
  });

  // Deep-link token reset (Task #750). The user clicks the link in their
  // email; the app deep-links to /reset-password?token=... and POSTs here
  // with the new password. No identifier or code required — the token
  // identifies the row directly and is single-use.
  router.post("/auth/reset-password-token", authLimiter, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        token: z.string().trim().min(20).max(200),
        newPassword: z.string().min(8).max(128),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const { token, newPassword } = parsed.data;

      const passwordCheck = validatePassword(newPassword);
      if (!passwordCheck.valid) {
        return res.status(400).json({ error: passwordCheck.errors.join(". ") });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const row = await storage.getPasswordResetCodeByTokenHash(tokenHash);
      if (!row) {
        return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
      }

      const user = await storage.getUserById(row.userId);
      if (!user || user.deleted === true) {
        return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
      }

      const hashed = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashed);
      await storage.markPasswordResetCodeUsed(row.id);
      console.log(`[ResetPasswordToken] Password reset for user ${user.id}`);

      return res.json({ success: true, message: "Password reset. You can now sign in with your new password." });
    } catch (error) {
      console.error("Reset password (token) error:", error);
      return res.status(500).json({ error: "Failed to reset password." });
    }
  });

  router.get("/auth/apple/status", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const currentUser = await storage.getUserById(userId);
      res.json({ linked: !!currentUser?.appleId });
    } catch (error) {
      console.error("Apple status error:", error);
      res.status(500).json({ error: "Failed to check Apple ID status" });
    }
  });

  // Email OTP verification endpoints
  router.post(
    "/auth/otp/send",
    authLimiter,
    async (req: Request, res: Response) => {
      try {
        const otpSendSchema = z.object({ email: z.string().email() });
        const parsedOtp = otpSendSchema.safeParse(req.body);
        if (!parsedOtp.success) return res.status(400).json({ error: fromZodError(parsedOtp.error).message });
        const { email } = parsedOtp.data;

        const result = await sendOTPEmail(email);

        if (result.success) {
          res.json({
            success: true,
            message: "Verification code sent to your email",
          });
        } else {
          res
            .status(500)
            .json({
              error: result.error || "Failed to send verification code",
            });
        }
      } catch (error) {
        console.error("OTP send error:", error);
        res.status(500).json({ error: "Failed to send verification code" });
      }
    },
  );

  router.post(
    "/auth/otp/verify",
    authLimiter,
    async (req: Request, res: Response) => {
      try {
        const otpVerifySchema = z.object({ email: z.string().email(), code: z.string().min(4).max(8) });
        const parsedOtpVerify = otpVerifySchema.safeParse(req.body);
        if (!parsedOtpVerify.success) return res.status(400).json({ error: fromZodError(parsedOtpVerify.error).message });
        const { email, code } = parsedOtpVerify.data;

        const result = verifyOTPCode(email, code);

        if (result.valid) {
          markEmailVerified(email);
          res.json({ success: true, verified: true });
        } else {
          res.status(400).json({ error: result.error, verified: false });
        }
      } catch (error) {
        console.error("OTP verify error:", error);
        res.status(500).json({ error: "Failed to verify code" });
      }
    },
  );

  // Check if email is new (for OTP requirement)
  router.post(
    "/auth/check-email",
    authLimiter,
    async (req: Request, res: Response) => {
      try {
        const checkEmailSchema = z.object({ email: z.string().email() });
        const parsedCheckEmail = checkEmailSchema.safeParse(req.body);
        if (!parsedCheckEmail.success) return res.status(400).json({ error: fromZodError(parsedCheckEmail.error).message });
        const { email } = parsedCheckEmail.data;

        // Check if any user exists with this email
        const existingUser = await storage.getUserByEmail(email.toLowerCase());

        res.json({
          isNewEmail: !existingUser,
          requiresOTP: !existingUser, // Only new emails require OTP verification
        });
      } catch (error) {
        console.error("Check email error:", error);
        res.status(500).json({ error: "Failed to check email" });
      }
    },
  );

  // Player self-registration (open, no academy required)
  router.post(
    "/auth/register/player",
    authLimiter,
    async (req: Request, res: Response) => {
      try {
        const parsed = playerRegisterSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: fromZodError(parsed.error).message });
        }

        const {
          username: rawUsername,
          firstName,
          lastName,
          dateOfBirth,
          email,
          phone,
          password,
          tshirtSize,
          height,
        } = parsed.data;

        // Validate password strength
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
          return res
            .status(400)
            .json({ error: passwordValidation.errors.join(". ") });
        }

        // Normalize username to lowercase for consistent storage

        // Check if email is new and requires OTP verification
        const existingEmailUser = await storage.getUserByEmail(
          email.toLowerCase(),
        );
        if (!existingEmailUser) {
          // New email - require OTP verification
          // First check if the email was already verified via the /auth/otp/verify endpoint
          if (isEmailVerified(email)) {
            // Already verified in this session — skip re-checking the OTP
          } else {
            const { otpCode } = req.body;
            if (!otpCode) {
              return res.status(400).json({
                error: "Email verification required for new accounts",
                requiresOTP: true,
              });
            }

            const otpResult = verifyOTPCode(email, otpCode);
            if (!otpResult.valid) {
              return res.status(400).json({
                error: otpResult.error || "Invalid verification code",
                requiresOTP: true,
              });
            }
          }
        }

        const username = rawUsername.toLowerCase();

        // Calculate age + initial ball level from date of birth so the player
        // gets the correct level from day 1 (Task #634).
        let age: number | null = null;
        let initialBallLevel: string | null = null;
        if (dateOfBirth) {
          const dobValidation = isValidDOB(dateOfBirth);
          if (!dobValidation.valid) {
            return res.status(400).json({ error: dobValidation.error || "Invalid date of birth" });
          }
          age = calculateAgeFromDOB(dateOfBirth);
          initialBallLevel = getBallLevelFromAge(age);
        }

        // Check if username is already taken (globally unique)
        const usernameExists = await storage.checkUsernameExists(username);
        if (usernameExists) {
          return res
            .status(409)
            .json({
              error: "Username already taken. Please choose a different one.",
            });
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
          ballLevel: initialBallLevel,
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

        const playerRegJwtPayload = {
          userId: user.id,
          email: user.email,
          role: user.role,
          academyId: user.academyId,
          coachId: user.coachId,
          playerId: player.id,
        };
        const token = generateToken(playerRegJwtPayload);
        const refreshToken = generateRefreshToken(playerRegJwtPayload);

        // Clear the verified-email flag now that registration is complete
        clearEmailVerified(email);

        res.status(201).json({
          token,
          refreshToken,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            academyId: user.academyId,
            playerId: player.id,
          },
          message:
            "Account created successfully. Join an academy to start training!",
        });
      } catch (error) {
        console.error("Player registration error:", error);
        res.status(500).json({ error: "Registration failed" });
      }
    },
  );

  // Coach registration via invite token
  router.post(
    "/auth/register/coach",
    authLimiter,
    async (req: Request, res: Response) => {
      try {
        const parsed = coachInviteRegisterSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: fromZodError(parsed.error).message });
        }

        const {
          token,
          username: rawUsername,
          name,
          email,
          password,
          phone,
          specialty,
          tshirtSize,
        } = parsed.data;

        // Validate password strength
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
          return res
            .status(400)
            .json({ error: passwordValidation.errors.join(". ") });
        }

        // Normalize username to lowercase for consistent storage
        const username = rawUsername.toLowerCase();

        // Check if username is already taken
        const usernameExists = await storage.checkUsernameExists(username);
        if (usernameExists) {
          return res
            .status(409)
            .json({
              error: "Username already taken. Please choose a different one.",
            });
        }

        // Validate invite token
        const invite = await storage.getInviteByToken(token);
        if (!invite) {
          return res
            .status(400)
            .json({ error: "Invalid or expired invite link" });
        }

        if (invite.usedAt) {
          return res
            .status(400)
            .json({ error: "This invite has already been used" });
        }

        if (new Date() > new Date(invite.expiresAt)) {
          return res.status(400).json({ error: "This invite has expired" });
        }

        // Check if email matches invite (if pre-set)
        if (
          invite.invitedEmail &&
          invite.invitedEmail.toLowerCase() !== email.toLowerCase()
        ) {
          return res
            .status(400)
            .json({ error: "Email does not match the invite" });
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

        const coachRegJwtPayload = {
          userId: user.id,
          email: user.email,
          role: user.role,
          academyId: user.academyId,
          coachId: user.coachId,
          playerId: user.playerId,
        };
        const authToken = generateToken(coachRegJwtPayload);
        const refreshToken = generateRefreshToken(coachRegJwtPayload);

        res.status(201).json({
          token: authToken,
          refreshToken,
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
    },
  );

  // Check if username is available (for real-time validation)
  router.get(
    "/auth/check-username/:username",
    async (req: Request, res: Response) => {
      try {
        const { username } = req.params;
        const normalizedUsername = username.toLowerCase().trim();

        if (normalizedUsername.length < 3) {
          return res.json({
            available: false,
            error: "Username must be at least 3 characters",
            suggestions: [],
          });
        }

        if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
          return res.json({
            available: false,
            error: "Only letters, numbers, and underscores allowed",
            suggestions: [],
          });
        }

        const existingUser =
          await storage.getUserByUsername(normalizedUsername);

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
            suggestions,
          });
        }

        res.json({ available: true, suggestions: [] });
      } catch (error) {
        console.error("Username check error:", error);
        res
          .status(500)
          .json({
            available: false,
            error: "Failed to check username",
            suggestions: [],
          });
      }
    },
  );

  // Validate invite token (for checking before showing registration form)
  // Supports both general invites (academy owner, coach) and player invites
  router.get("/auth/invite/:token", inviteLimiter, async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      // First, try to find a general invite (academy owner, coach)
      const invite = await storage.getInviteByToken(token);

      if (invite) {
        if (invite.usedAt) {
          return res
            .status(400)
            .json({ error: "This invite has already been used" });
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
          return res
            .status(400)
            .json({ error: "This invite has already been claimed or expired" });
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
          playerDateOfBirth: player?.dateOfBirth || null,
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
  router.post(
    "/auth/register/invite",
    authLimiter,
    async (req: Request, res: Response) => {
      try {
        const { token, username, email, firstName, lastName, password, phone } =
          req.body;

        console.log(
          "[InviteRegister] Attempting registration for username:",
          username,
          "email:",
          email,
        );

        if (
          !token ||
          !username ||
          !email ||
          !firstName ||
          !lastName ||
          !password
        ) {
          console.log(
            "[InviteRegister] Missing fields - token:",
            !!token,
            "username:",
            !!username,
            "email:",
            !!email,
            "firstName:",
            !!firstName,
            "lastName:",
            !!lastName,
            "password:",
            !!password,
          );
          return res.status(400).json({ error: "Missing required fields" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ error: "Invalid email address" });
        }

        const normalizedUsername = username.toLowerCase();

        if (normalizedUsername.length < 3) {
          return res
            .status(400)
            .json({ error: "Username must be at least 3 characters" });
        }

        if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
          return res
            .status(400)
            .json({
              error:
                "Username can only contain letters, numbers, and underscores",
            });
        }

        // Validate password strength
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
          return res
            .status(400)
            .json({ error: passwordValidation.errors.join(". ") });
        }

        // Validate invite
        const invite = await storage.getInviteByToken(token);
        if (!invite) {
          return res.status(400).json({ error: "Invalid invite code" });
        }

        if (invite.usedAt) {
          return res
            .status(400)
            .json({ error: "This invite has already been used" });
        }

        if (new Date() > new Date(invite.expiresAt)) {
          return res.status(400).json({ error: "This invite has expired" });
        }

        // Check if username is taken
        const existingUser =
          await storage.getUserByUsername(normalizedUsername);
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
          const fullName = `${firstName} ${lastName}`;

          // Create coach profile for owner (they are also a head coach)
          const coach = await storage.createCoach({
            name: fullName,
            email: userEmail,
            phone: phone || null,
            academyId: invite.academyId,
            role: "head_coach",
            level: 1,
            totalXp: 0,
          });

          // Create player profile for owner (they can also play)
          const player = await storage.createPlayer({
            name: fullName,
            email: userEmail,
            phone: phone || null,
            academyId: invite.academyId,
            coachId: coach.id,
          });

          // Create user as academy owner with coach and player links
          const user = await storage.createUser({
            username: normalizedUsername,
            email: userEmail,
            password: hashedPassword,
            role: "academy_owner",
            academyId: invite.academyId,
            coachId: coach.id,
            playerId: player.id,
          });

          // Update academy ownerId to link to the coach
          await storage.updateAcademy(invite.academyId, { ownerId: coach.id });

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
    },
  );

  // Register user via player invite (for players invited by academy)
  router.post(
    "/auth/register/player-invite",
    authLimiter,
    async (req: Request, res: Response) => {
      try {
        const {
          token,
          username,
          email,
          firstName,
          lastName,
          password,
          phone,
          playerId,
          dateOfBirth,
        } = req.body;

        console.log(
          "[PlayerInviteRegister] Attempting registration for username:",
          username,
          "playerId:",
          playerId,
        );

        if (
          !token ||
          !username ||
          !email ||
          !firstName ||
          !lastName ||
          !password ||
          !playerId
        ) {
          console.log("[PlayerInviteRegister] Missing fields");
          return res.status(400).json({ error: "Missing required fields" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ error: "Invalid email address" });
        }

        const normalizedUsername = username.toLowerCase();

        if (normalizedUsername.length < 3) {
          return res
            .status(400)
            .json({ error: "Username must be at least 3 characters" });
        }

        if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
          return res
            .status(400)
            .json({
              error:
                "Username can only contain letters, numbers, and underscores",
            });
        }

        // Validate password strength
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
          return res
            .status(400)
            .json({ error: passwordValidation.errors.join(". ") });
        }

        // Validate player invite
        const playerInvite = await storage.getPlayerInvite(token);
        if (!playerInvite) {
          return res.status(400).json({ error: "Invalid invite code" });
        }

        if (playerInvite.status !== "pending") {
          return res
            .status(400)
            .json({ error: "This invite has already been claimed or expired" });
        }

        if (playerInvite.playerId !== playerId) {
          return res.status(400).json({ error: "Invalid player invite" });
        }

        // Check if username is taken
        const existingUser =
          await storage.getUserByUsername(normalizedUsername);
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

        // Update player with user info — include academyId so the player is
        // visible in the academy immediately after registration.
        // IMPORTANT: compose full name here — players table has a single `name`
        // column, not separate firstName/lastName columns, so we must join them.
        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

        // Determine the effective DOB. If the coach already filled it in for
        // this player profile, prefer that. Otherwise accept whatever the user
        // provided in the signup form (Task #634).
        const effectiveDOB: string | null =
          player.dateOfBirth || (dateOfBirth ? String(dateOfBirth) : null);

        let computedAge: number | null = player.age ?? null;
        let computedBallLevel: string | null = player.ballLevel ?? null;

        if (effectiveDOB) {
          const dobValidation = isValidDOB(effectiveDOB);
          if (!dobValidation.valid) {
            return res.status(400).json({ error: dobValidation.error || "Invalid date of birth" });
          }
          computedAge = calculateAgeFromDOB(effectiveDOB);
          // Only assign a ball level if there is no real one on file yet, or
          // if the existing one is "blue" (default placeholder).
          if (!computedBallLevel || computedBallLevel === "blue") {
            computedBallLevel = getBallLevelFromAge(computedAge);
          }
        }

        await storage.updatePlayer(
          playerId,
          {
            name: fullName,
            email: email.toLowerCase().trim(),
            phone: phone || undefined,
            academyId: playerInvite.academyId,
            ...(effectiveDOB ? { dateOfBirth: effectiveDOB } : {}),
            ...(computedAge !== null ? { age: computedAge } : {}),
            ...(computedBallLevel ? { ballLevel: computedBallLevel } : {}),
          },
        );

        // Mark invite as claimed
        await storage.claimPlayerInvite(token, user.id);

        console.log(
          "[PlayerInviteRegister] Successfully created user for player:",
          playerId,
        );

        // Generate JWT token for immediate authentication
        const playerInviteJwtPayload = {
          userId: user.id,
          email: user.email,
          role: user.role,
          academyId: user.academyId,
          coachId: null,
          playerId: playerId,
        };
        const jwtToken = generateToken(playerInviteJwtPayload);
        const refreshToken = generateRefreshToken(playerInviteJwtPayload);

        res.status(201).json({
          success: true,
          message: "Welcome to the team!",
          token: jwtToken,
          refreshToken,
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
    },
  );

  // Academy application (submit for platform owner approval)
  router.post(
    "/auth/apply/academy",
    authLimiter,
    async (req: Request, res: Response) => {
      try {
        const parsed = academyApplicationInputSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: fromZodError(parsed.error).message });
        }

        const {
          academyName,
          country,
          contactPerson,
          email,
          phone,
          description,
        } = parsed.data;

        // Check for existing pending application
        const existingApplication =
          await storage.getAcademyApplicationByEmail(email);
        if (existingApplication) {
          return res
            .status(409)
            .json({ error: "You already have a pending application" });
        }

        // Check if academy name slug exists
        const slug = academyName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        const existingAcademy = await storage.getAcademyBySlug(slug);
        if (existingAcademy) {
          return res
            .status(409)
            .json({ error: "An academy with this name already exists" });
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
          message:
            "Application submitted successfully. You will be notified once reviewed.",
        });
      } catch (error) {
        console.error("Academy application error:", error);
        res.status(500).json({ error: "Application submission failed" });
      }
    },
  );

  router.post(
    "/auth/logout",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      res.json({ success: true, message: "Logged out successfully" });
    },
  );

  router.post(
    "/auth/refresh",
    refreshAuthMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.user!;
        const payload = {
          userId: user.userId,
          email: user.email,
          role: user.role,
          academyId: user.academyId,
          coachId: user.coachId,
          playerId: user.playerId,
        };
        const token = generateToken(payload);
        const refreshToken = generateRefreshToken(payload);
        res.json({ token, refreshToken });

        // Update lastLoginAt throttled to once per hour to keep app-open time fresh
        // without excessive DB writes on every background token refresh
        try {
          const dbUser = await storage.getUserById(user.userId);
          if (dbUser) {
            const lastLogin = dbUser.lastLoginAt ? new Date(dbUser.lastLoginAt).getTime() : 0;
            const oneHourAgo = Date.now() - 60 * 60 * 1000;
            if (lastLogin < oneHourAgo) {
              await storage.updateUserLastLogin(user.userId);
            }
          }
        } catch (updateErr) {
          console.error("Failed to update lastLoginAt on token refresh:", updateErr);
        }
      } catch (error) {
        console.error("Token refresh error:", error);
        res.status(500).json({ error: "Token refresh failed" });
      }
    },
  );

// ==================== DEV PREVIEW AUTO-LOGIN (development only) ====================
router.get("/dev-preview", async (req: Request, res: Response) => {
  const isDev = process.env.NODE_ENV !== "production";
  if (!isDev) {
    return res.status(404).json({ error: "Not found" });
  }

  const role = (req.query.role as string) || "coach";

  try {
    let previewUser: {
      userId: string; email: string; role: string;
      academyId: string | null; coachId: string | null; playerId: string | null;
      username: string; displayName: string;
    } | null = null;

    if (role === "coach") {
      previewUser = {
        userId: "3750b8a8-f35b-49c6-ac87-7fd3e6d56db1",
        email: "ltvjeugd@gmail.com",
        role: "platform_owner",
        academyId: "default-academy",
        coachId: "coach-thelaw-001",
        playerId: "player-thelaw-001",
        username: "thelaw",
        displayName: "The Law",
      };
    } else if (role === "player") {
      const playerUser = await db.select().from(users).where(
        and(isNotNull(users.playerId), eq(users.role, "player"))
      ).limit(1);
      if (playerUser.length > 0) {
        const u = playerUser[0];
        previewUser = {
          userId: u.id, email: u.email || "", role: u.role,
          academyId: u.academyId || null, coachId: u.coachId || null,
          playerId: u.playerId || null, username: u.username,
          displayName: u.username,
        };
      }
    }

    if (!previewUser) {
      return res.status(404).json({ error: "No preview user found for role: " + role });
    }

    const payload = {
      userId: previewUser.userId, email: previewUser.email, role: previewUser.role,
      academyId: previewUser.academyId, coachId: previewUser.coachId, playerId: previewUser.playerId,
    };
    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const authUser = JSON.stringify({
      id: previewUser.userId, username: previewUser.username, email: previewUser.email,
      role: previewUser.role, academyId: previewUser.academyId, coachId: previewUser.coachId,
      playerId: previewUser.playerId, displayName: previewUser.displayName,
    });

    const appMode = role === "player" ? "player" : "coach";
    const redirectPath = "/";

    res.send(`<!DOCTYPE html>
<html>
<head><title>Loading Glow Up Sports...</title>
<style>body{background:#000;color:#C8FF3D;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px}
.dot{width:10px;height:10px;border-radius:50%;background:#C8FF3D;display:inline-block;animation:bounce 1.2s infinite}.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}
@keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}</style></head>
<body>
<p style="font-size:20px;font-weight:700;letter-spacing:2px">GLOW UP</p>
<div><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
<script>
  try {
    localStorage.setItem('@auth_token', ${JSON.stringify(token)});
    localStorage.setItem('@refresh_token', ${JSON.stringify(refreshToken)});
    localStorage.setItem('@auth_user', ${JSON.stringify(authUser)});
    localStorage.setItem('@current_academy_id', ${JSON.stringify(previewUser.academyId || "default-academy")});
    localStorage.setItem('@app_mode', ${JSON.stringify(appMode)});
  } catch(e) { console.error('localStorage error', e); }
  setTimeout(function() { window.location.replace(${JSON.stringify(redirectPath)}); }, 100);
</script>
</body></html>`);
  } catch (error) {
    console.error("Dev preview error:", error);
    res.status(500).json({ error: "Dev preview failed" });
  }
});

export default router;
