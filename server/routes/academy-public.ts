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
  import { hashPassword, verifyPassword, generateToken, generateRefreshToken, validatePassword } from "../auth";
  import { sendCoachInviteEmail, sendWelcomeEmail } from "../emailService";
  import { sendSessionConfirmedNotification } from "../pushNotifications";
  import { getCurrencyForCountry } from "@shared/countries";
  import crypto from "crypto";
  import { generateShortInviteCode } from "../utils/inviteCode";
  const router = Router();
    // ==================== COACH INVITES (Academy Owner/Admin) ====================

  // Create coach invite
  router.post(
    "/api/invites",
    authMiddleware,
    requireRole("academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const inviteSchema = z.object({
          role: z.enum(["coach", "player", "academy_owner", "service_provider"]).optional().default("coach"),
          email: z.string().email().optional(),
          expiresInDays: z.number().int().positive().max(365).optional().default(7),
        });
        const parsedInvite = inviteSchema.safeParse(req.body);
        if (!parsedInvite.success) return res.status(400).json({ error: fromZodError(parsedInvite.error).message });
        const { role = "coach", email, expiresInDays = 7 } = parsedInvite.data;
        // Use currentAcademyId (from X-Academy-Id header) for multi-academy support
        const academyId = req.user!.currentAcademyId || req.user!.academyId;
        const invitedBy = req.user!.coachId || req.user!.userId;

        if (!academyId) {
          return res.status(400).json({ error: "Academy ID is required" });
        }

        if (!invitedBy) {
          return res.status(400).json({ error: "User ID is required" });
        }

        // Generate secure token and short code
        const token = crypto.randomBytes(32).toString("hex");
        const shortCode = generateShortInviteCode();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);

        const invite = await storage.createInvite({
          token,
          shortCode,
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
            shortCode: invite.shortCode,
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
    },
  );

  // List invites for academy
  router.get(
    "/api/invites",
    authMiddleware,
    requireRole("academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Verify invite token (public endpoint for registration)
  router.get("/api/invites/verify/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const invite = await storage.getInviteByToken(token);

      if (!invite) {
        return res
          .status(404)
          .json({ valid: false, message: "Invite not found" });
      }

      if (invite.usedAt) {
        return res
          .status(400)
          .json({ valid: false, message: "Invite has already been used" });
      }

      if (new Date(invite.expiresAt) < new Date()) {
        return res
          .status(400)
          .json({ valid: false, message: "Invite has expired" });
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
      res
        .status(500)
        .json({ valid: false, message: "Failed to verify invite" });
    }
  });

  // ==================== PROVIDER INVITES ====================

  // Create a provider invite link (platform_owner only)
  router.post(
    "/api/provider-invites",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { email, name, expiresInDays = 7 } = req.body;
        const createdBy = req.user!.userId;
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + Math.min(Number(expiresInDays) || 7, 30));

        const [invite] = await db.insert(providerInvites).values({
          token,
          invitedEmail: email ? email.toLowerCase() : null,
          invitedName: name || null,
          createdBy,
          expiresAt,
        }).returning();

        res.status(201).json({ invite });
      } catch (error) {
        console.error("[ProviderInvite] Create error:", error);
        res.status(500).json({ error: "Failed to create invite" });
      }
    },
  );

  // List provider invites (platform_owner only)
  router.get(
    "/api/provider-invites",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const invites = await db.select().from(providerInvites)
          .where(eq(providerInvites.createdBy, req.user!.userId))
          .orderBy(desc(providerInvites.createdAt));
        res.json({ invites });
      } catch (error) {
        console.error("[ProviderInvite] List error:", error);
        res.status(500).json({ error: "Failed to list invites" });
      }
    },
  );

  // Verify a provider invite token (public)
  router.get("/api/provider-invites/verify/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const [invite] = await db.select().from(providerInvites)
        .where(eq(providerInvites.token, token)).limit(1);

      if (!invite) return res.status(404).json({ valid: false, message: "Invite not found" });
      if (invite.usedAt) return res.status(400).json({ valid: false, message: "Invite has already been used" });
      if (new Date(invite.expiresAt) < new Date()) return res.status(400).json({ valid: false, message: "Invite has expired" });

      res.json({
        valid: true,
        invitedEmail: invite.invitedEmail,
        invitedName: invite.invitedName,
        expiresAt: invite.expiresAt,
      });
    } catch (error) {
      console.error("[ProviderInvite] Verify error:", error);
      res.status(500).json({ valid: false, message: "Failed to verify invite" });
    }
  });

  // Revoke a provider invite (platform_owner only)
  router.delete(
    "/api/provider-invites/:id",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        await db.delete(providerInvites)
          .where(and(eq(providerInvites.id, id), eq(providerInvites.createdBy, req.user!.userId)));
        res.json({ success: true });
      } catch (error) {
        console.error("[ProviderInvite] Delete error:", error);
        res.status(500).json({ error: "Failed to revoke invite" });
      }
    },
  );

  // Create provider account directly (platform_owner sends credentials via email)
  router.post(
    "/api/provider-invites/create-direct",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { email, name } = req.body;
        if (!email || !name) return res.status(400).json({ error: "email and name are required" });

        const emailLower = email.toLowerCase();
        const existing = await db.select().from(users).where(eq(users.email, emailLower)).limit(1);
        if (existing[0]) return res.status(409).json({ error: "A user with this email already exists" });

        // Generate credentials
        const baseUsername = name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "").slice(0, 20);
        const username = `${baseUsername}.${Date.now().toString(36)}`;
        const tempPassword = crypto.randomBytes(6).toString("hex").toUpperCase();
        const hashedPassword = await hashPassword(tempPassword);

        // Resolve academy: prefer the creating platform_owner's academy, fall back to the first academy
        const [ownerRecord] = await db.select({ academyId: users.academyId }).from(users).where(eq(users.id, req.user!.userId)).limit(1);
        let resolvedAcademyId: string | null = ownerRecord?.academyId || null;
        if (!resolvedAcademyId) {
          const [firstAcademy] = await db.select({ id: academies.id }).from(academies).limit(1);
          resolvedAcademyId = firstAcademy?.id || null;
        }

        // Create user
        const [newUser] = await db.insert(users).values({
          username,
          email: emailLower,
          password: hashedPassword,
          role: "service_provider",
          academyId: resolvedAcademyId,
        }).returning();

        // Create provider profile
        await db.insert(serviceProviders).values({
          userId: newUser.id,
          academyId: resolvedAcademyId!,
          displayName: name,
          isActive: true,
          isOnboarded: false,
        });

        // Send welcome email with credentials
        const { sendEmail } = await import("../emailService");
        await sendEmail({
          to: emailLower,
          subject: "Your Glow Up Sports Provider Account",
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 16px; padding: 40px; }
                .logo h1 { color: #2ECC40; margin: 0; font-size: 28px; }
                h2 { color: #ffffff; }
                p { color: #a0a0a0; line-height: 1.6; }
                .cred-box { background: #252525; border-radius: 12px; padding: 24px; margin: 20px 0; }
                .cred-label { color: #666; font-size: 12px; margin-bottom: 4px; }
                .cred-value { color: #2ECC40; font-size: 18px; font-weight: 700; }
                .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; text-align: center; color: #666; font-size: 12px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="logo"><h1>Glow Up Sports</h1></div>
                <h2>Welcome, ${name}!</h2>
                <p>Your provider account has been created. Use the credentials below to log in to the Glow Up Sports app.</p>
                <div class="cred-box">
                  <div class="cred-label">USERNAME</div>
                  <div class="cred-value">${username}</div>
                </div>
                <div class="cred-box">
                  <div class="cred-label">TEMPORARY PASSWORD</div>
                  <div class="cred-value">${tempPassword}</div>
                </div>
                <p>Please change your password after your first login.</p>
                <div class="footer"><p>Glow Up Sports - Level Up Your Game</p></div>
              </div>
            </body>
            </html>
          `,
          text: `Welcome ${name}! Your provider account: username: ${username}, temporary password: ${tempPassword}. Please change your password after first login.`,
        });

        res.status(201).json({ success: true, username, message: "Account created and credentials sent via email" });
      } catch (error) {
        console.error("[ProviderInvite] Create-direct error:", error);
        res.status(500).json({ error: "Failed to create provider account" });
      }
    },
  );

  // Register via provider invite token (public)
  router.post(
    "/auth/register/provider",
    authLimiter,
    async (req: Request, res: Response) => {
      try {
        const { token, username: rawUsername, name, email, password } = req.body;

        if (!token || !rawUsername || !name || !email || !password) {
          return res.status(400).json({ error: "token, username, name, email, and password are required" });
        }

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
          return res.status(400).json({ error: passwordValidation.errors.join(". ") });
        }

        const username = rawUsername.trim().toLowerCase();
        if (username.length < 3 || !/^[a-z0-9_]+$/.test(username)) {
          return res.status(400).json({ error: "Username must be at least 3 characters (letters, numbers, underscores only)" });
        }

        const usernameExists = await storage.checkUsernameExists(username);
        if (usernameExists) return res.status(409).json({ error: "Username already taken" });

        const emailExists = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
        if (emailExists[0]) return res.status(409).json({ error: "An account with this email already exists" });

        // Validate invite token
        const [invite] = await db.select().from(providerInvites)
          .where(eq(providerInvites.token, token)).limit(1);

        if (!invite) return res.status(400).json({ error: "Invalid or expired invite link" });
        if (invite.usedAt) return res.status(400).json({ error: "This invite has already been used" });
        if (new Date() > new Date(invite.expiresAt)) return res.status(400).json({ error: "This invite has expired" });

        // Check email matches if pre-set
        if (invite.invitedEmail && invite.invitedEmail.toLowerCase() !== email.toLowerCase()) {
          return res.status(400).json({ error: "Email does not match the invite" });
        }

        const hashedPassword = await hashPassword(password);

        // Resolve academy: prefer the invite creator's academy, fall back to the first academy
        const [inviteCreator] = await db.select({ academyId: users.academyId }).from(users).where(eq(users.id, invite.createdBy)).limit(1);
        let resolvedAcademyId: string | null = inviteCreator?.academyId || null;
        if (!resolvedAcademyId) {
          const [firstAcademy] = await db.select({ id: academies.id }).from(academies).limit(1);
          resolvedAcademyId = firstAcademy?.id || null;
        }

        // Create user
        const [newUser] = await db.insert(users).values({
          username,
          email: email.toLowerCase(),
          password: hashedPassword,
          role: "service_provider",
          academyId: resolvedAcademyId,
        }).returning();

        // Create provider profile
        await db.insert(serviceProviders).values({
          userId: newUser.id,
          academyId: resolvedAcademyId!,
          displayName: name.trim(),
          isActive: true,
          isOnboarded: false,
        });

        // Mark invite as used
        await db.update(providerInvites)
          .set({ usedBy: newUser.id, usedAt: new Date() })
          .where(eq(providerInvites.id, invite.id));

        const providerJwtPayload = {
          userId: newUser.id,
          email: newUser.email,
          role: newUser.role,
          academyId: newUser.academyId,
          coachId: null,
          playerId: null,
        };
        const authToken = generateToken(providerJwtPayload);
        const refreshToken = generateRefreshToken(providerJwtPayload);

        res.status(201).json({
          token: authToken,
          refreshToken,
          user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            role: newUser.role,
            academyId: newUser.academyId,
          },
          message: "Welcome to Glow Up Sports!",
        });
      } catch (error) {
        console.error("[ProviderInvite] Register error:", error);
        res.status(500).json({ error: "Registration failed" });
      }
    },
  );

  // ==================== ACADEMY BROWSING (Public/Player) ====================

  // Look up academy by join code (for quick onboarding)
  router.get(
    "/api/academies/join-code/:code",
    async (req: Request, res: Response) => {
      try {
        const { code } = req.params;

        if (!code || code.length < 4) {
          return res.status(400).json({ error: "Invalid join code" });
        }

        const academy = await storage.getAcademyByJoinCode(code.toUpperCase());

        if (!academy) {
          return res
            .status(404)
            .json({
              error: "Academy not found. Please check the code and try again.",
            });
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
          },
        });
      } catch (error) {
        console.error("Join code lookup error:", error);
        res.status(500).json({ error: "Failed to look up academy" });
      }
    },
  );

  // Get countries (and cities per country) that have at least one academy — used for location filter UI
  router.get("/api/academies/browse/countries", async (req: Request, res: Response) => {
    try {
      const academies = await storage.getAllAcademies();
      const countryMap = new Map<string, Set<string>>();
      for (const a of academies) {
        if (!a.country) continue;
        if (!countryMap.has(a.country)) countryMap.set(a.country, new Set());
        if (a.city) countryMap.get(a.country)!.add(a.city);
      }
      const countries = Array.from(countryMap.entries()).map(([country, cities]) => ({
        country,
        cities: Array.from(cities).sort(),
      })).sort((a, b) => a.country.localeCompare(b.country));
      res.json({ countries });
    } catch (error) {
      console.error("Browse countries error:", error);
      res.status(500).json({ error: "Failed to browse countries" });
    }
  });

  // Browse available academies (for players to find and join)
  router.get("/api/academies/browse", async (req: Request, res: Response) => {
    try {
      const { search, city, country } = req.query;
      let academies = await storage.getAllAcademies();

      // Filter by search term
      if (search && typeof search === "string") {
        const searchLower = search.toLowerCase();
        academies = academies.filter(
          (a) =>
            a.name.toLowerCase().includes(searchLower) ||
            a.city?.toLowerCase().includes(searchLower) ||
            a.country?.toLowerCase().includes(searchLower),
        );
      }

      // Filter by city
      if (city && typeof city === "string") {
        academies = academies.filter(
          (a) => a.city?.toLowerCase() === city.toLowerCase(),
        );
      }

      // Filter by country
      if (country && typeof country === "string") {
        academies = academies.filter(
          (a) => a.country?.toLowerCase() === country.toLowerCase(),
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
            logoUrl: academy.logoUrl,
            averageRating: academy.averageRating ? Number(academy.averageRating) : null,
            sports: academy.sports ?? ["tennis"],
            coachCount: coaches.length,
            playerCount: players.length,
          };
        }),
      );

      res.json({ academies: publicAcademies });
    } catch (error) {
      console.error("Browse academies error:", error);
      res.status(500).json({ error: "Failed to browse academies" });
    }
  });

  // Get academy join code (for coaches/owners to share with players)
  router.get(
    "/api/academy/join-code",
    authMiddleware,
    requireRole("academy_owner", "coach", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
          academyName: academy.name,
        });
      } catch (error) {
        console.error("Get join code error:", error);
        res.status(500).json({ error: "Failed to get join code" });
      }
    },
  );

  // Regenerate academy join code (for coaches/owners)
  router.post(
    "/api/academy/join-code/regenerate",
    authMiddleware,
    requireRole("academy_owner", "coach", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
          message: "Join code regenerated successfully",
        });
      } catch (error) {
        console.error("Regenerate join code error:", error);
        res.status(500).json({ error: "Failed to regenerate join code" });
      }
    },
  );

  // Reset academy data (selective data wipe) - owners and platform owners only
  router.post(
    "/api/academy/reset",
    authMiddleware,
    requireRole("academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy not found" });
        }

        const resetSchema = z.object({
          confirmationCode: z.literal("RESET"),
          resetTypes: z.record(z.string(), z.boolean()),
        });
        const parsedReset = resetSchema.safeParse(req.body);
        if (!parsedReset.success) return res.status(400).json({ error: fromZodError(parsedReset.error).message });
        const { resetTypes, confirmationCode } = parsedReset.data;

        // Require confirmation code for safety
        if (confirmationCode !== "RESET") {
          return res
            .status(400)
            .json({
              error: "Invalid confirmation code. Please type RESET to confirm.",
            });
        }

        if (!resetTypes || typeof resetTypes !== "object") {
          return res
            .status(400)
            .json({ error: "Please specify which data types to reset" });
        }

        const validTypes = [
          "sessions",
          "attendance",
          "payments",
          "progress",
          "feedback",
          "packages",
          "invoices",
          "players",
        ];
        const selectedTypes = Object.keys(resetTypes).filter(
          (key) => resetTypes[key] && validTypes.includes(key),
        );

        if (selectedTypes.length === 0) {
          return res
            .status(400)
            .json({ error: "Please select at least one data type to reset" });
        }

        const result = await storage.resetAcademyData(academyId, resetTypes);

        // Log the reset action
        console.log(
          `[Academy Reset] Academy ${academyId} reset: ${selectedTypes.join(", ")}`,
          result.deleted,
        );

        res.json({
          success: true,
          message: `Academy data reset successfully`,
          deletedCounts: result.deleted,
        });
      } catch (error) {
        console.error("Academy reset error:", error);
        res.status(500).json({ error: "Failed to reset academy data" });
      }
    },
  );

  // Get academy reset counts (for showing in the reset modal)
  router.get(
    "/api/academy/reset-counts",
    authMiddleware,
    requireRole("academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // ==================== ACADEMY PUBLIC PROFILE ====================

  // Get academy public profile (detailed view with coaches)
  router.get("/api/academies/:id/profile", async (req: Request, res: Response) => {
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
  router.put(
    "/api/academy/profile",
    authMiddleware,
    requireRole("academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy not found" });
        }

        const {
          name,
          website,
          phone,
          email,
          facilities,
          courtCount,
          ageGroups,
          programs,
          priceRange,
          profileVisibility,
          country,
          city,
          address,
        } = req.body;

        const updated = await storage.updateAcademy(academyId, {
          ...(name !== undefined && { name }),
          website,
          phone,
          email,
          facilities,
          courtCount,
          ageGroups,
          programs,
          priceRange,
          profileVisibility,
          ...(country !== undefined && { country }),
          ...(city !== undefined && { city }),
          ...(address !== undefined && { address }),
        });

        res.json({ academy: updated });
      } catch (error) {
        console.error("Update academy profile error:", error);
        res.status(500).json({ error: "Failed to update academy profile" });
      }
    },
  );

  // ==================== COACH DIRECTORY ====================

  // Browse coaches across the platform
  router.get("/api/coaches/directory", async (req: Request, res: Response) => {
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
  router.get("/api/coaches/:id/profile", async (req: Request, res: Response) => {
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
  router.put(
    "/api/coach/directory-settings",
    authMiddleware,
    requireRole("coach", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        if (!coachId) {
          return res.status(400).json({ error: "Coach profile not found" });
        }

        const {
          showInDirectory,
          openToOpportunities,
          specializations,
          languages,
        } = req.body;

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
    },
  );

  // ==================== FREELANCE LICENSE ====================

  // Get coach freelance profile
  router.get(
    "/api/coach/freelance-profile",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Activate freelance license (creates freelance academy + profile)
  router.post(
    "/api/coach/freelance-license",
    authMiddleware,
    requireRole("coach", "academy_owner", "admin", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        const coach = await storage.getCoach(coachId!);

        if (!coach) {
          return res.status(400).json({ error: "Coach profile not found" });
        }

        // Check if already has freelance profile
        const existingProfile = await storage.getCoachFreelanceProfile(
          coachId!,
        );
        if (existingProfile?.isActive) {
          return res
            .status(400)
            .json({ error: "Freelance license already active" });
        }

        const { businessName, tagline, contactEmail, contactPhone } = req.body;

        if (!businessName || businessName.trim().length < 2) {
          return res
            .status(400)
            .json({
              error: "Business name is required (at least 2 characters)",
            });
        }

        // Generate slug from business name
        const baseSlug = businessName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
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
          message: "Freelance license activated successfully!",
        });
      } catch (error) {
        console.error("Activate freelance license error:", error);
        res.status(500).json({ error: "Failed to activate freelance license" });
      }
    },
  );

  // Update freelance profile
  router.put(
    "/api/coach/freelance-profile",
    authMiddleware,
    requireRole("coach", "academy_owner", "admin", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        if (!coachId) {
          return res.status(400).json({ error: "Coach profile not found" });
        }

        const profile = await storage.getCoachFreelanceProfile(coachId);
        if (!profile) {
          return res
            .status(404)
            .json({
              error:
                "Freelance profile not found. Activate your license first.",
            });
        }

        const {
          businessName,
          tagline,
          bio,
          primaryColor,
          contactEmail,
          contactPhone,
          website,
          socialLinks,
          serviceAreas,
          travelRadius,
          specialties,
          ageGroupsServed,
          showPricing,
          hourlyRateMin,
          hourlyRateMax,
          currency,
        } = req.body;

        const updated = await storage.updateCoachFreelanceProfile(coachId, {
          businessName,
          tagline,
          bio,
          primaryColor,
          contactEmail,
          contactPhone,
          website,
          socialLinks,
          serviceAreas,
          travelRadius,
          specialties,
          ageGroupsServed,
          showPricing,
          hourlyRateMin,
          hourlyRateMax,
          currency,
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
    },
  );
  // ==================== PLAYER LESSON REQUESTS ====================

  // Player requests a group or semi-private lesson
  router.post(
    "/api/player/request-group-lesson",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user?.playerId;
        const academyId = req.user?.academyId;

        if (!playerId) {
          return res.status(401).json({ error: "Player profile required" });
        }

        const { ballLevel, sessionType, invitedFriendIds } = req.body;

        // Get player details
        const player = await db
          .select()
          .from(players)
          .where(eq(players.id, playerId))
          .limit(1);
        const playerName = player[0]?.name || "A player";

        // Get academy coaches to notify
        const academyCoaches = academyId
          ? await db
              .select()
              .from(coaches)
              .where(eq(coaches.academyId, academyId))
          : [];

        // Create notification for coaches
        for (const coach of academyCoaches) {
          await db.insert(notifications).values({
            id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            userId: coach.userId,
            type: "lesson_request",
            title: "New Lesson Request",
            message: `${playerName} has requested a ${sessionType || "group"} lesson at ${ballLevel || "their"} level.`,
            data: JSON.stringify({
              playerId,
              ballLevel,
              sessionType,
              invitedFriendIds,
            }),
            createdAt: new Date(),
          });
        }

        console.log(
          `[LessonRequest] Player ${playerId} requested ${sessionType} lesson at ${ballLevel} level`,
        );
        res.json({ success: true, message: "Request sent to coaches" });
      } catch (error) {
        console.error("Request group lesson error:", error);
        res.status(500).json({ error: "Failed to send request" });
      }
    },
  );
  // ==================== ACADEMY TRANSFER REQUESTS ====================

  // Player requests to transfer to another academy
  router.post(
    "/api/player/transfer-request",
    authMiddleware,
    requireRole("player"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        const fromAcademyId = req.user!.academyId;

        if (!playerId) {
          return res.status(400).json({ error: "Player profile not found" });
        }

        if (!fromAcademyId) {
          return res
            .status(400)
            .json({
              error: "You must be a member of an academy to request a transfer",
            });
        }

        const { toAcademyId, reason } = req.body;

        if (!toAcademyId) {
          return res
            .status(400)
            .json({ error: "Destination academy is required" });
        }

        if (toAcademyId === fromAcademyId) {
          return res
            .status(400)
            .json({ error: "You are already a member of this academy" });
        }

        // Check if there's already a pending transfer
        const existing = await storage.getPlayerTransferRequests(playerId);
        const hasPending = existing.some((r) => r.status === "pending");
        if (hasPending) {
          return res
            .status(400)
            .json({ error: "You already have a pending transfer request" });
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
    },
  );

  // Get player's transfer requests
  router.get(
    "/api/player/transfer-requests",
    authMiddleware,
    requireRole("player"),
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Coach/Owner: Get incoming transfer requests (players wanting to join)
  router.get(
    "/api/coach/transfer-requests/incoming",
    authMiddleware,
    requireRole("coach", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy not found" });
        }

        const requests = await storage.getAcademyIncomingTransfers(academyId);

        // Enrich with player and academy names
        const enriched = await Promise.all(
          requests.map(async (r) => {
            const player = await storage.getPlayer(r.playerId);
            const fromAcademy = await storage.getAcademy(r.fromAcademyId);
            return {
              ...r,
              playerName: player?.name,
              fromAcademyName: fromAcademy?.name,
            };
          }),
        );

        res.json({ requests: enriched });
      } catch (error) {
        console.error("Get incoming transfers error:", error);
        res.status(500).json({ error: "Failed to get transfer requests" });
      }
    },
  );

  // Coach/Owner: Get outgoing transfer requests (players wanting to leave)
  router.get(
    "/api/coach/transfer-requests/outgoing",
    authMiddleware,
    requireRole("coach", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy not found" });
        }

        const requests = await storage.getAcademyOutgoingTransfers(academyId);

        // Enrich with player and academy names
        const enriched = await Promise.all(
          requests.map(async (r) => {
            const player = await storage.getPlayer(r.playerId);
            const toAcademy = await storage.getAcademy(r.toAcademyId);
            return {
              ...r,
              playerName: player?.name,
              toAcademyName: toAcademy?.name,
            };
          }),
        );

        res.json({ requests: enriched });
      } catch (error) {
        console.error("Get outgoing transfers error:", error);
        res.status(500).json({ error: "Failed to get transfer requests" });
      }
    },
  );

  // Coach/Owner: Approve or reject transfer request (from their side)
  router.post(
    "/api/coach/transfer-requests/:id/respond",
    authMiddleware,
    requireRole("coach", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
          return res
            .status(403)
            .json({
              error: "You are not authorized to respond to this request",
            });
        }

        const updateData: Record<string, any> = {};
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );

        if (isFromAcademy) {
          updateData.fromAcademyStatus =
            decision === "approve" ? "approved" : "rejected";
          updateData.fromAcademyReviewedBy = coachId;
          updateData.fromAcademyReviewedAt = now;
          updateData.fromAcademyNote = note;
        } else {
          updateData.toAcademyStatus =
            decision === "approve" ? "approved" : "rejected";
          updateData.toAcademyReviewedBy = coachId;
          updateData.toAcademyReviewedAt = now;
          updateData.toAcademyNote = note;
        }

        // Get updated request to check if both sides have approved
        const updatedRequest = await storage.updateTransferRequest(
          id,
          updateData,
        );

        // If either side rejected, mark overall as rejected
        if (
          updatedRequest?.fromAcademyStatus === "rejected" ||
          updatedRequest?.toAcademyStatus === "rejected"
        ) {
          await storage.updateTransferRequest(id, { status: "rejected" });
        }
        // If both sides approved, complete the transfer
        else if (
          updatedRequest?.fromAcademyStatus === "approved" &&
          updatedRequest?.toAcademyStatus === "approved"
        ) {
          // Execute the transfer
          await storage.updatePlayer(request.playerId, {
            academyId: request.toAcademyId,
          });
          await storage.updateTransferRequest(id, {
            status: "approved",
            completedAt: now,
          });
        }

        res.json({ request: updatedRequest });
      } catch (error) {
        console.error("Respond to transfer error:", error);
        res
          .status(500)
          .json({ error: "Failed to respond to transfer request" });
      }
    },
  );

  // ==================== COACH INVITATIONS ====================

  // Academy owner invites a coach
  router.post(
    "/api/coach-invitations",
    authMiddleware,
    requireRole("academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
        const existing = await storage.getCoachInvitationByEmail(
          email,
          academyId,
        );
        if (existing) {
          return res
            .status(400)
            .json({ error: "This email has already been invited" });
        }

        // Check if the coach already exists on the platform (via user table)
        const existingUser = await storage.getUserByEmail(email);
        const existingCoach = existingUser?.coachId
          ? await storage.getCoach(existingUser.coachId)
          : null;

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
    },
  );

  // Get academy's coach invitations
  router.get(
    "/api/coach-invitations",
    authMiddleware,
    requireRole("academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Get coach's pending invitations (from other academies)
  router.get(
    "/api/coach/pending-invitations",
    authMiddleware,
    requireRole("coach", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        if (!coachId) {
          return res.status(400).json({ error: "Coach profile not found" });
        }

        const invitations = await storage.getCoachPendingInvitations(coachId);

        // Enrich with academy names
        const enriched = await Promise.all(
          invitations.map(async (inv) => {
            const academy = await storage.getAcademy(inv.academyId);
            return {
              ...inv,
              academyName: academy?.name,
              academyCity: academy?.city,
            };
          }),
        );

        res.json({ invitations: enriched });
      } catch (error) {
        console.error("Get pending invitations error:", error);
        res.status(500).json({ error: "Failed to get invitations" });
      }
    },
  );

  // Coach accepts or declines invitation
  router.post(
    "/api/coach-invitations/:id/respond",
    authMiddleware,
    requireRole("coach", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
          return res
            .status(403)
            .json({ error: "This invitation is not for you" });
        }

        if (invitation.status !== "pending") {
          return res
            .status(400)
            .json({ error: "This invitation has already been responded to" });
        }

        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );

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
            acceptedAt: now,
          });
        } else {
          await storage.updateCoachInvitation(id, {
            status: "declined",
            declinedAt: now,
          });
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Respond to invitation error:", error);
        res.status(500).json({ error: "Failed to respond to invitation" });
      }
    },
  );

  // Delete coach invitation
  router.delete(
    "/api/coach-invitations/:id",
    authMiddleware,
    requireRole("academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const invitation = await storage.getCoachInvitation(id);
        if (!invitation) {
          return res.status(404).json({ error: "Invitation not found" });
        }

        if (invitation.academyId !== academyId) {
          return res
            .status(403)
            .json({
              error: "You can only delete invitations from your academy",
            });
        }

        await storage.deleteCoachInvitation(id);
        res.json({ success: true });
      } catch (error) {
        console.error("Delete invitation error:", error);
        res.status(500).json({ error: "Failed to delete invitation" });
      }
    },
  );

  // ==================== PLAYER JOIN REQUESTS ====================

  // Submit join request (player)
  router.post(
    "/api/join-requests",
    authMiddleware,
    requireRole("player"),
    async (req: AuthenticatedRequest, res: Response) => {
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
        const existingRequest = await storage.getJoinRequestByPlayerAndAcademy(
          playerId,
          academyId,
        );
        if (existingRequest) {
          if (existingRequest.status === "pending") {
            return res
              .status(400)
              .json({
                error: "You already have a pending request to this academy",
              });
          }
          if (existingRequest.status === "approved") {
            return res
              .status(400)
              .json({ error: "You are already a member of this academy" });
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
    },
  );

  // Get player's own join requests
  router.get(
    "/api/join-requests/my",
    authMiddleware,
    requireRole("player"),
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Get join requests for academy (owner/coach)
  router.get(
    "/api/join-requests",
    authMiddleware,
    requireRole("academy_owner", "coach", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID is required" });
        }

        const { status } = req.query;
        const requests = await storage.getJoinRequestsByAcademy(
          academyId,
          status as string | undefined,
        );
        res.json({ requests });
      } catch (error) {
        console.error("Get join requests error:", error);
        res.status(500).json({ error: "Failed to get join requests" });
      }
    },
  );

  // Approve join request (owner/coach)
  router.post(
    "/api/join-requests/:id/approve",
    authMiddleware,
    requireRole("academy_owner", "coach", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const reviewedBy = req.user!.coachId;
        const academyId = req.user!.academyId;

        const joinRequest = await storage.getJoinRequest(id);
        if (!joinRequest) {
          return res.status(404).json({ error: "Join request not found" });
        }

        if (joinRequest.academyId !== academyId) {
          return res
            .status(403)
            .json({ error: "Not authorized to approve this request" });
        }

        if (joinRequest.status !== "pending") {
          return res
            .status(400)
            .json({ error: "Request has already been processed" });
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
    },
  );

  // Reject join request (owner/coach)
  router.post(
    "/api/join-requests/:id/reject",
    authMiddleware,
    requireRole("academy_owner", "coach", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
          return res
            .status(403)
            .json({ error: "Not authorized to reject this request" });
        }

        if (joinRequest.status !== "pending") {
          return res
            .status(400)
            .json({ error: "Request has already been processed" });
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
    },
  );

  // ==================== ACADEMY APPLICATIONS (Platform Owner Only) ====================

  // List all academy applications
  router.get(
    "/api/platform/applications",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { status } = req.query;
        const applications = await storage.getAllAcademyApplications(
          status as string | undefined,
        );
        res.json({ applications });
      } catch (error) {
        console.error("Get applications error:", error);
        res.status(500).json({ error: "Failed to get applications" });
      }
    },
  );

  // Get single application
  router.get(
    "/api/platform/applications/:id",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Approve academy application
  router.post(
    "/api/platform/applications/:id/approve",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const reviewedBy = req.user!.userId;

        const application = await storage.getAcademyApplication(id);
        if (!application) {
          return res.status(404).json({ error: "Application not found" });
        }

        if (application.status !== "pending") {
          return res
            .status(400)
            .json({ error: "Application has already been processed" });
        }

        // Create the academy
        const slug = application.academyName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
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
    },
  );

  // Reject academy application
  router.post(
    "/api/platform/applications/:id/reject",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { reason } = req.body;
        const reviewedBy = req.user!.userId;

        const application = await storage.getAcademyApplication(id);
        if (!application) {
          return res.status(404).json({ error: "Application not found" });
        }

        if (application.status !== "pending") {
          return res
            .status(400)
            .json({ error: "Application has already been processed" });
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
    },
  );

export default router;
