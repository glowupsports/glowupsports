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
    submitReviewSchema, familyInviteCodes,
  } from "@shared/schema";
  import { hashPassword, generateToken } from "../auth";
  const router = Router();
  
    // ==================== PLAYER API ====================

  // Set holiday
  router.post(
    "/api/player/holidays",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // ==================== AUTH/ME ENDPOINTS ====================

  // Get current user with coach and academy context (authenticated)
  router.get(
    "/api/me",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      res.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      );
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      try {
        const tokenUser = req.user!;

        // Fetch fresh user data from database to get current coachId/academyId
        const freshUser = await storage.getUserById(tokenUser.userId);
        if (!freshUser) {
          return res.status(401).json({ error: "User not found" });
        }

        // Fire-and-forget: update last_login_at at most once per hour per user
        db.execute(
          sql`UPDATE users SET last_login_at = NOW() WHERE id = ${tokenUser.userId} AND (last_login_at IS NULL OR last_login_at < NOW() - INTERVAL '1 hour')`
        ).catch((err: unknown) => {
          console.error("Failed to update last_login_at:", err);
        });

        const isImpersonating =
          freshUser.role === "platform_owner" &&
          tokenUser.role === "academy_owner";

        let coach = null;
        let academy = null;

        if (isImpersonating) {
          const impersonatedCoachId = tokenUser.coachId;
          const impersonatedAcademyId = tokenUser.academyId;
          const impersonatedPlayerId = tokenUser.playerId;

          if (impersonatedCoachId) {
            coach = await storage.getCoach(impersonatedCoachId);
          }
          if (impersonatedAcademyId) {
            academy = await storage.getAcademy(impersonatedAcademyId);
          }

          res.json({
            user: {
              id: freshUser.id,
              email: freshUser.email,
              role: "academy_owner",
              academyId: impersonatedAcademyId,
              coachId: impersonatedCoachId,
              playerId: impersonatedPlayerId,
            },
            coach: coach
              ? {
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
                }
              : null,
            academy: academy
              ? {
                  id: academy.id,
                  name: academy.name,
                  slug: academy.slug,
                  timezone: academy.timezone || "Asia/Dubai",
                }
              : null,
          });
        } else {
          // When a family-switch synthetic token is used, tokenUser.playerId holds
          // the child's playerId while freshUser.playerId belongs to the parent.
          // Use the token's playerId so the session is scoped to the correct player.
          const effectivePlayerId =
            tokenUser.playerId && tokenUser.playerId !== freshUser.playerId
              ? tokenUser.playerId
              : freshUser.playerId;

          const effectiveAcademyId =
            tokenUser.playerId && tokenUser.playerId !== freshUser.playerId
              ? (tokenUser.academyId ?? freshUser.academyId)
              : freshUser.academyId;

          if (freshUser.coachId) {
            coach = await storage.getCoach(freshUser.coachId);
          }
          if (effectiveAcademyId) {
            academy = await storage.getAcademy(effectiveAcademyId);
          }

          res.json({
            user: {
              id: freshUser.id,
              email: freshUser.email,
              role: freshUser.role,
              academyId: effectiveAcademyId,
              coachId: freshUser.coachId,
              playerId: effectivePlayerId,
            },
            coach: coach
              ? {
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
                }
              : null,
            academy: academy
              ? {
                  id: academy.id,
                  name: academy.name,
                  slug: academy.slug,
                  timezone: academy.timezone || "Asia/Dubai",
                }
              : null,
          });
        }
      } catch (error) {
        console.error("Error fetching current user:", error);
        res.status(500).json({ error: "Failed to fetch current user" });
      }
    },
  );

  // ==================== FAMILY LOBBY ENDPOINTS ====================

  // Get family status - returns all players linked by same email address
  router.get(
    "/api/family/status",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tokenUser = req.user!;

        // Get the users player record
        const freshUser = await storage.getUserById(tokenUser.userId);
        if (!freshUser || !freshUser.playerId) {
          return res.json({ isFamily: false });
        }

        const player = await storage.getPlayer(freshUser.playerId);
        if (!player || !player.email) {
          return res.json({ isFamily: false });
        }

        // Find all players in the same family:
        // 1) Players sharing the same email address (original behaviour)
        // 2) Players whose parentEmail matches this player's email (linked via Add Child flow)
        const byEmail = await db
          .select()
          .from(players)
          .where(eq(players.email, player.email));

        const byParentEmail = await db
          .select()
          .from(players)
          .where(eq(players.parentEmail, player.email));

        // Merge and deduplicate
        const seen = new Set<string>();
        const familyMembers: typeof players.$inferSelect[] = [];
        for (const m of [...byEmail, ...byParentEmail]) {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            familyMembers.push(m);
          }
        }

        // Also include players whose parentEmail is the email of any member we already have
        // (i.e. this player is a child, and siblings share the same parent)
        if (player.parentEmail) {
          const siblings = await db
            .select()
            .from(players)
            .where(eq(players.parentEmail, player.parentEmail));
          for (const m of siblings) {
            if (!seen.has(m.id)) {
              seen.add(m.id);
              familyMembers.push(m);
            }
          }
          // Also get the parent player (whose email === this player's parentEmail)
          const parentPlayers = await db
            .select()
            .from(players)
            .where(eq(players.email, player.parentEmail));
          for (const m of parentPlayers) {
            if (!seen.has(m.id)) {
              seen.add(m.id);
              familyMembers.push(m);
            }
          }
        }

        // For an unlinked child (no parentEmail, no linked members), return no family
        // For a parent account (no parentEmail), always return family data so they can add children
        if (familyMembers.length <= 1 && player.parentEmail) {
          return res.json({ isFamily: false });
        }
        // If caller is a parent with no children yet, still expose family (single-member)
        // so the Family Lobby Add Child flow is accessible

        // Get outstanding balances for each player
        const memberData = await Promise.all(
          familyMembers.map(async (member) => {
            // Get next session - skip for now to get basic functionality working
            // TODO: Implement proper session query after fixing SQL template issues
            const nextSessionResult: any[] = [];

            const nextSession = nextSessionResult[0]
              ? {
                  date: nextSessionResult[0].date,
                  type: nextSessionResult[0].sessionType || "training",
                }
              : null;

            // Task #681 Phase 3 — outstanding balance from V2 signed balance.
            // `player_credit_balance.credits` is signed: negative => owed.
            const balanceRows = await db.execute(sql`
              SELECT COALESCE(SUM(LEAST(credits::numeric, 0)), 0)::numeric AS net_neg
              FROM player_credit_balance
              WHERE player_id = ${member.id}
            `);
            const netNeg = Number((balanceRows.rows?.[0] as any)?.net_neg || 0);
            const outstandingBalance = netNeg < 0 ? Math.abs(netNeg) : 0;

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
              chatEnabled: member.chatEnabled ?? null,
              communityEnabled: member.communityEnabled ?? null,
            };
          }),
        );

        const outstandingTotal = memberData.reduce(
          (sum, m) => sum + m.outstandingBalance,
          0,
        );

        // Determine the canonical parent email for this family
        // If caller is a child (has parentEmail set), use that; otherwise use their own email
        const familyParentEmail = player.parentEmail || player.email;

        res.json({
          isFamily: true,
          family: {
            email: familyParentEmail,
            parentEmail: familyParentEmail,
            members: memberData,
            outstandingTotal,
            isCallerParent: !player.parentEmail,
          },
        });
      } catch (error) {
        console.error("Error fetching family status:", error);
        res.status(500).json({ error: "Failed to fetch family status" });
      }
    },
  );

  router.put(
    "/api/family/parental-controls/:playerId",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tokenUser = req.user!;
        const { playerId } = req.params;
        const { chatEnabled, communityEnabled } = req.body;

        const freshUser = await storage.getUserById(tokenUser.userId);
        if (!freshUser || !freshUser.playerId) {
          return res.status(403).json({ error: "Player profile required" });
        }

        const parentPlayer = await storage.getPlayer(freshUser.playerId);
        if (!parentPlayer || !parentPlayer.email) {
          return res.status(403).json({ error: "Account not found" });
        }

        // Only parent accounts (not children themselves) can set parental controls
        if (parentPlayer.parentEmail) {
          return res.status(403).json({ error: "Only parent accounts can manage parental controls." });
        }

        const targetPlayer = await storage.getPlayer(playerId);
        // Target must be a child of the caller:
        // - new-style: linked via parentEmail pointing to caller's email
        // - legacy-style: shares caller's email but is a different player (different id)
        // Must not be the caller modifying themselves.
        const isLinkedChild =
          targetPlayer &&
          targetPlayer.id !== parentPlayer.id &&
          (targetPlayer.parentEmail === parentPlayer.email ||
            targetPlayer.email === parentPlayer.email);
        if (!isLinkedChild) {
          return res
            .status(403)
            .json({ error: "You can only manage parental controls for your linked children" });
        }

        const updates: Record<string, any> = {};
        if (typeof chatEnabled === "boolean") updates.chatEnabled = chatEnabled;
        if (typeof communityEnabled === "boolean")
          updates.communityEnabled = communityEnabled;

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ error: "No valid settings provided" });
        }

        await db.update(players).set(updates).where(eq(players.id, playerId));

        res.json({ success: true, ...updates });
      } catch (error) {
        console.error("Error updating parental controls:", error);
        res.status(500).json({ error: "Failed to update parental controls" });
      }
    },
  );

  // Bulk payment for family
  router.post(
    "/api/billing/pay-bulk",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { playerIds } = req.body;

        if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
          return res.status(400).json({ error: "playerIds array is required" });
        }

        // Task #681 Phase 3 — total owed across the family from V2.
        // Sum negative `player_credit_balance.credits` rows.
        const owedRows = await db.execute(sql`
          SELECT COALESCE(SUM(LEAST(credits::numeric, 0)), 0)::numeric AS net_neg
          FROM player_credit_balance
          WHERE player_id = ANY(${playerIds}::text[])
        `);
        const familyNetNeg = Number((owedRows.rows?.[0] as any)?.net_neg || 0);
        const totalOwed = familyNetNeg < 0 ? Math.abs(familyNetNeg) : 0;

        if (totalOwed === 0) {
          return res.json({
            success: true,
            message: "No outstanding balances to pay",
            paid: 0,
          });
        }

        // TODO: Integrate with actual payment processing
        // For now, return success with the calculated amount
        const totalPaid = totalOwed;

        res.json({
          success: true,
          message: `Paid outstanding balance of ${totalPaid}`,
          paid: totalPaid,
          count: playerIds.length,
        });
      } catch (error) {
        console.error("Error processing bulk payment:", error);
        res.status(500).json({ error: "Failed to process payment" });
      }
    },
  );

  // ==================== FAMILY ADD CHILD ENDPOINTS ====================

  // Helper to generate a random invite code
  function generateInviteCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
    let code = "";
    for (let i = 0; i < 7; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  // Add child by email
  router.post(
    "/api/family/add-child",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tokenUser = req.user!;
        const { email } = req.body;

        if (!email || typeof email !== "string") {
          return res.status(400).json({ error: "Email is required" });
        }

        const freshUser = await storage.getUserById(tokenUser.userId);
        if (!freshUser || !freshUser.playerId) {
          return res.status(403).json({ error: "Player profile required" });
        }

        const parentPlayer = await storage.getPlayer(freshUser.playerId);
        if (!parentPlayer || !parentPlayer.email) {
          return res.status(403).json({ error: "Account not found" });
        }

        // Only players who are not themselves a child can add children
        // (i.e., their parentEmail must be null — they are a parent account)
        if (parentPlayer.parentEmail) {
          return res.status(403).json({ error: "Only parent accounts can add children. Join a family via Settings instead." });
        }

        // Find child player by email (exact, case-insensitive — no wildcard operators)
        const normalizedEmail = email.trim().toLowerCase();
        const childPlayers = await db
          .select()
          .from(players)
          .where(sql`lower(${players.email}) = ${normalizedEmail}`);

        if (childPlayers.length === 0) {
          return res.status(404).json({ error: "No player found with that email" });
        }

        const childPlayer = childPlayers[0];

        // Cannot link yourself
        if (childPlayer.id === parentPlayer.id) {
          return res.status(400).json({ error: "You cannot add yourself as a child" });
        }

        // Check if already in this family
        if (
          childPlayer.email === parentPlayer.email ||
          childPlayer.parentEmail === parentPlayer.email
        ) {
          return res.status(409).json({ error: "This player is already in your family" });
        }

        // Prevent reassigning a child who already belongs to a different family
        if (childPlayer.parentEmail && childPlayer.parentEmail !== parentPlayer.email) {
          return res.status(409).json({ error: "This player is already linked to another family" });
        }

        // Check same academy
        if (childPlayer.academyId && parentPlayer.academyId && childPlayer.academyId !== parentPlayer.academyId) {
          return res.status(400).json({ error: "This player belongs to a different academy" });
        }

        // Link the child
        await db
          .update(players)
          .set({ parentEmail: parentPlayer.email })
          .where(eq(players.id, childPlayer.id));

        res.json({
          success: true,
          child: {
            id: childPlayer.id,
            name: childPlayer.name,
            email: childPlayer.email,
          },
        });
      } catch (error) {
        console.error("Error adding child:", error);
        res.status(500).json({ error: "Failed to add child" });
      }
    },
  );

  // Generate / refresh family invite code
  router.post(
    "/api/family/invite-code",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tokenUser = req.user!;

        const freshUser = await storage.getUserById(tokenUser.userId);
        if (!freshUser || !freshUser.playerId) {
          return res.status(403).json({ error: "Player profile required" });
        }

        const parentPlayer = await storage.getPlayer(freshUser.playerId);
        if (!parentPlayer) {
          return res.status(403).json({ error: "Account not found" });
        }

        // Only parent accounts (not children themselves) can generate invite codes
        if (parentPlayer.parentEmail) {
          return res.status(403).json({ error: "Only parent accounts can generate invite codes." });
        }

        // Invalidate any existing unused codes for this parent
        await db
          .update(familyInviteCodes)
          .set({ usedAt: new Date() })
          .where(
            and(
              eq(familyInviteCodes.parentPlayerId, parentPlayer.id),
              isNull(familyInviteCodes.usedAt),
            ),
          );

        // Generate a unique code
        let code = generateInviteCode();
        let attempts = 0;
        while (attempts < 10) {
          const existing = await db
            .select()
            .from(familyInviteCodes)
            .where(eq(familyInviteCodes.code, code))
            .limit(1);
          if (existing.length === 0) break;
          code = generateInviteCode();
          attempts++;
        }

        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

        await db.insert(familyInviteCodes).values({
          code,
          parentPlayerId: parentPlayer.id,
          expiresAt,
        });

        res.json({ code, expiresAt: expiresAt.toISOString() });
      } catch (error) {
        console.error("Error generating invite code:", error);
        res.status(500).json({ error: "Failed to generate invite code" });
      }
    },
  );

  // Create a new player profile as a family member (no login credentials)
  router.post(
    "/api/family/create-member",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tokenUser = req.user!;

        const freshUser = await storage.getUserById(tokenUser.userId);
        if (!freshUser || !freshUser.playerId) {
          return res.status(403).json({ error: "Player profile required" });
        }

        const parentPlayer = await storage.getPlayer(freshUser.playerId);
        if (!parentPlayer || !parentPlayer.email) {
          return res.status(403).json({ error: "Account not found" });
        }


        // Allowed values matching the CreateFamilyMemberFlow UI
        const VALID_DOMINANT_HANDS = ["right", "left"];
        const VALID_BACKHAND_TYPES = ["single", "double"];
        const VALID_EXPERIENCE_LEVELS = ["new", "6-12months", "1-3years", "3-5years", "5-10years", "10-20years"];
        const VALID_MOTIVATION_TYPES = ["fun", "improve", "compete", "unsure"];

        const {
          firstName,
          lastName,
          dateOfBirth,
          dominantHand,
          backhandType,
          experienceLevel,
          motivationType,
          enjoymentTags,
          focusGoals,
          selfConfidenceFlags,
        } = req.body;

        if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
          return res.status(400).json({ error: "First name is required" });
        }
        if (!lastName || typeof lastName !== "string" || !lastName.trim()) {
          return res.status(400).json({ error: "Last name is required" });
        }

        // Validate enum fields if provided
        if (dominantHand && !VALID_DOMINANT_HANDS.includes(dominantHand)) {
          return res.status(400).json({ error: "Invalid dominant hand value" });
        }
        if (backhandType && !VALID_BACKHAND_TYPES.includes(backhandType)) {
          return res.status(400).json({ error: "Invalid backhand type value" });
        }
        if (experienceLevel && !VALID_EXPERIENCE_LEVELS.includes(experienceLevel)) {
          return res.status(400).json({ error: "Invalid experience level value" });
        }
        if (motivationType && !VALID_MOTIVATION_TYPES.includes(motivationType)) {
          return res.status(400).json({ error: "Invalid motivation type value" });
        }

        const memberName = `${firstName.trim()} ${lastName.trim()}`;

        // Compute age from dateOfBirth if provided
        let age: number | null = null;
        if (dateOfBirth && typeof dateOfBirth === "string") {
          const birthDate = new Date(dateOfBirth);
          if (isNaN(birthDate.getTime())) {
            return res.status(400).json({ error: "Invalid date of birth" });
          }
          const today = new Date();
          age = today.getFullYear() - birthDate.getFullYear();
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
        }

        // Always use parent's academyId — never trust client-provided academyId
        const resolvedAcademyId = parentPlayer.academyId || null;

        // Create the player record (no user/auth record — under parent account)
        const [newPlayer] = await db.insert(players).values({
          name: memberName,
          email: parentPlayer.email, // share parent email so family grouping works
          parentEmail: parentPlayer.email, // explicit link to parent
          academyId: resolvedAcademyId,
          dateOfBirth: dateOfBirth || null,
          age,
          dominantHand: dominantHand || null,
          backhandType: backhandType || null,
          experienceLevel: experienceLevel || null,
          motivationType: motivationType || null,
          enjoymentTags: Array.isArray(enjoymentTags) ? enjoymentTags : [],
          focusGoals: Array.isArray(focusGoals) ? focusGoals : [],
          selfConfidenceFlags: Array.isArray(selfConfidenceFlags) ? selfConfidenceFlags : [],
          onboardingCompleted: true,
          level: 1,
          totalXp: 0,
          glowScore: 0,
          streak: 0,
        }).returning();

        res.status(201).json({
          success: true,
          player: {
            id: newPlayer.id,
            name: newPlayer.name,
            email: newPlayer.email,
            parentEmail: newPlayer.parentEmail,
          },
        });
      } catch (error) {
        console.error("Error creating family member:", error);
        res.status(500).json({ error: "Failed to create family member" });
      }
    },
  );

  // Join family with invite code (child calls this)
  router.post(
    "/api/family/join",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tokenUser = req.user!;
        const { code } = req.body;

        if (!code || typeof code !== "string") {
          return res.status(400).json({ error: "Invite code is required" });
        }

        const freshUser = await storage.getUserById(tokenUser.userId);
        if (!freshUser || !freshUser.playerId) {
          return res.status(403).json({ error: "Player profile required" });
        }

        const childPlayer = await storage.getPlayer(freshUser.playerId);
        if (!childPlayer) {
          return res.status(403).json({ error: "Account not found" });
        }

        // Find the invite code
        const inviteCodes = await db
          .select()
          .from(familyInviteCodes)
          .where(eq(familyInviteCodes.code, code.toUpperCase().trim()))
          .limit(1);

        if (inviteCodes.length === 0) {
          return res.status(404).json({ error: "Invalid invite code" });
        }

        const inviteCode = inviteCodes[0];

        // Check not already used
        if (inviteCode.usedAt) {
          return res.status(400).json({ error: "This invite code has already been used" });
        }

        // Check not expired
        if (new Date() > new Date(inviteCode.expiresAt)) {
          return res.status(400).json({ error: "This invite code has expired" });
        }

        // Get parent player
        const parentPlayer = await storage.getPlayer(inviteCode.parentPlayerId);
        if (!parentPlayer || !parentPlayer.email) {
          return res.status(404).json({ error: "Parent account not found" });
        }

        // Check if child is already in this family
        if (
          childPlayer.email === parentPlayer.email ||
          childPlayer.parentEmail === parentPlayer.email
        ) {
          return res.status(409).json({ error: "You are already in this family" });
        }

        // Cannot join your own family code
        if (childPlayer.id === parentPlayer.id) {
          return res.status(400).json({ error: "You cannot join your own family code" });
        }

        // Prevent reassigning a child who already belongs to a different family
        if (childPlayer.parentEmail && childPlayer.parentEmail !== parentPlayer.email) {
          return res.status(409).json({ error: "You are already linked to a different family" });
        }

        // Enforce same academy boundary
        if (childPlayer.academyId && parentPlayer.academyId && childPlayer.academyId !== parentPlayer.academyId) {
          return res.status(400).json({ error: "You cannot join a family from a different academy" });
        }

        // Atomically claim the invite code (WHERE used_at IS NULL prevents double-use in races)
        const claimResult = await db
          .update(familyInviteCodes)
          .set({ usedAt: new Date(), usedByPlayerId: childPlayer.id })
          .where(and(eq(familyInviteCodes.id, inviteCode.id), isNull(familyInviteCodes.usedAt)))
          .returning({ id: familyInviteCodes.id });

        if (claimResult.length === 0) {
          // Another request beat us to it — code was already consumed
          return res.status(409).json({ error: "This invite code has already been used" });
        }

        // Link child to parent
        await db
          .update(players)
          .set({ parentEmail: parentPlayer.email })
          .where(eq(players.id, childPlayer.id));

        res.json({
          success: true,
          parentName: parentPlayer.name,
          parentEmail: parentPlayer.email,
        });
      } catch (error) {
        console.error("Error joining family:", error);
        res.status(500).json({ error: "Failed to join family" });
      }
    },
  );

// POST /api/family/switch/:playerId — switch into a family member's account
router.post(
  "/api/family/switch/:playerId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const targetPlayerId = req.params.playerId;

      // Get caller's player record
      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser || !freshUser.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const callerPlayer = await storage.getPlayer(freshUser.playerId);
      if (!callerPlayer || !callerPlayer.email) {
        return res.status(403).json({ error: "Account not found" });
      }

      // Build caller's family member IDs (same logic as /api/family/status)
      const byEmail = await db
        .select({ id: players.id })
        .from(players)
        .where(eq(players.email, callerPlayer.email));

      const byParentEmail = await db
        .select({ id: players.id })
        .from(players)
        .where(eq(players.parentEmail, callerPlayer.email));

      const familyIds = new Set<string>([
        ...byEmail.map(p => p.id),
        ...byParentEmail.map(p => p.id),
      ]);

      // Also add siblings if caller is a child
      if (callerPlayer.parentEmail) {
        const siblings = await db
          .select({ id: players.id })
          .from(players)
          .where(eq(players.parentEmail, callerPlayer.parentEmail!));
        for (const s of siblings) familyIds.add(s.id);

        const parentPlayers = await db
          .select({ id: players.id })
          .from(players)
          .where(eq(players.email, callerPlayer.parentEmail));
        for (const p of parentPlayers) familyIds.add(p.id);
      }

      // Always include the caller's own ID
      familyIds.add(freshUser.playerId);

      if (!familyIds.has(targetPlayerId)) {
        return res.status(403).json({ error: "Player is not in your family" });
      }

      // Get target player info
      const targetPlayer = await storage.getPlayer(targetPlayerId);
      if (!targetPlayer) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Check if target player has their own user account
      const [targetUser] = await db
        .select({ id: users.id, role: users.role, playerId: users.playerId, coachId: users.coachId })
        .from(users)
        .where(and(eq(users.playerId, targetPlayerId), eq(users.deleted, false)))
        .limit(1);

      if (targetUser) {
        // Issue a real token for this user account
        const token = generateToken({
          userId: targetUser.id,
          role: targetUser.role || "player",
          playerId: targetUser.playerId,
          coachId: targetUser.coachId,
          academyId: targetPlayer.academyId,
        });

        return res.json({
          token,
          playerName: targetPlayer.name,
          hasOwnAccount: true,
        });
      }

      // No dedicated user account — generate a player-scoped token using the
      // caller's user record but bound to the target player.  This lets the
      // client do a full clean-login instead of using the X-Active-Player-Id
      // header override, giving the family member a proper independent session.
      // The familySwitch marker tells authMiddlewareWithFreshData to honour the
      // token's playerId instead of falling back to the user's stored playerId.
      const syntheticToken = generateToken({
        userId: tokenUser.userId,
        role: "player",
        playerId: targetPlayerId,
        coachId: null,
        academyId: targetPlayer.academyId,
        familySwitch: true,
      });

      return res.json({
        token: syntheticToken,
        playerName: targetPlayer.name,
        hasOwnAccount: true,
      });
    } catch (error) {
      console.error("Error switching family account:", error);
      res.status(500).json({ error: "Failed to switch account" });
    }
  },
);

export default router;
