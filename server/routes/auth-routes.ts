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
  import { authLimiter, inviteLimiter } from "../rateLimiter";
  import { hashPassword, verifyPassword, generateToken, generateRefreshToken, validatePassword, JWT_SECRET, refreshAuthMiddleware } from "../auth";
  import { sendWelcomeEmail, sendPlayerInviteEmail, sendCoachInviteEmail, sendOTPEmail, verifyOTPCode, hasValidOTP, markEmailVerified, isEmailVerified, clearEmailVerified } from "../emailService";
  import crypto from "crypto";
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

      const existingUser = await storage.getUserByAppleId(appleUser);
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

        // Calculate age from date of birth
        let age: number | null = null;
        if (dateOfBirth) {
          const birthDate = new Date(dateOfBirth);
          const today = new Date();
          age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (
            monthDiff < 0 ||
            (monthDiff === 0 && today.getDate() < birthDate.getDate())
          ) {
            age--;
          }
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
        await storage.updatePlayer(
          playerId,
          {
            name: fullName,
            email: email.toLowerCase().trim(),
            phone: phone || undefined,
            academyId: playerInvite.academyId,
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
      } catch (error) {
        console.error("Token refresh error:", error);
        res.status(500).json({ error: "Token refresh failed" });
      }
    },
  );

export default router;
