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
  import { getBallLevelFromAge } from "@shared/ballLevel";
  import { resolveOrCreateFamilyForCaller, addPlayerToFamily, findFamilyForPlayer } from "../lib/family-groups";
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
    submitReviewSchema, familyInviteCodes, familyGroups, familyMembers,
  } from "@shared/schema";
  import { hashPassword, generateToken, generateRefreshToken } from "../auth";
  import { verifyAccountPin, playerHasPin } from "./account-pin";
  import { writeAuditLog, getAccountLockState } from "../lib/account-audit";
  import * as Sentry from "@sentry/node";
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
          console.log("[family/status] no playerId on user", { userId: tokenUser.userId });
          return res.json({ isFamily: false, isCallerParent: false });
        }

        const player = await storage.getPlayer(freshUser.playerId);
        if (!player) {
          console.log("[family/status] player record not found", { playerId: freshUser.playerId });
          return res.json({ isFamily: false, isCallerParent: false });
        }

        // Normalize caller emails (case-insensitive, trimmed) so data inconsistencies
        // (mixed casing, leading/trailing whitespace) don't cause an empty family lobby.
        // Fallback to the linked user's email when the player row's email is missing —
        // a missing player.email should never demote a real parent account to "no family".
        const rawCallerEmail = (player.email && player.email.trim()) || (freshUser.email && freshUser.email.trim()) || "";
        if (!rawCallerEmail) {
          console.log("[family/status] no usable email for caller", { playerId: player.id, userId: freshUser.id });
          return res.json({ isFamily: false });
        }
        const callerEmail = rawCallerEmail.toLowerCase();
        const callerParentEmail = player.parentEmail?.trim().toLowerCase() || null;

        // Find all players in the same family:
        // 1) Players sharing the same email address (original behaviour)
        // 2) Players whose parentEmail matches this player's email (linked via Add Child flow)
        const byEmail = await db
          .select()
          .from(players)
          .where(sql`LOWER(TRIM(${players.email})) = ${callerEmail}`);

        const byParentEmail = await db
          .select()
          .from(players)
          .where(sql`LOWER(TRIM(${players.parentEmail})) = ${callerEmail}`);

        // Also find all users that share this email and pull in their linked
        // player profiles. This catches family members whose `players.email`
        // field doesn't match (e.g. the player row has a different email but
        // the user account they sign in with shares the family email).
        const usersByEmail = await db
          .select()
          .from(users)
          .where(sql`LOWER(TRIM(${users.email})) = ${callerEmail}`);

        const linkedPlayerIds = usersByEmail
          .map((u) => u.playerId)
          .filter((id): id is string => !!id);

        const playersFromUsers = linkedPlayerIds.length
          ? await db
              .select()
              .from(players)
              .where(inArray(players.id, linkedPlayerIds))
          : [];

        // Merge and deduplicate
        const seen = new Set<string>();
        const familyMembers: typeof players.$inferSelect[] = [];
        for (const m of [...byEmail, ...byParentEmail, ...playersFromUsers]) {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            familyMembers.push(m);
          }
        }

        let siblingsCount = 0;
        let parentPlayersCount = 0;

        // Also include players whose parentEmail is the email of any member we already have
        // (i.e. this player is a child, and siblings share the same parent)
        if (callerParentEmail) {
          const siblings = await db
            .select()
            .from(players)
            .where(sql`LOWER(TRIM(${players.parentEmail})) = ${callerParentEmail}`);
          siblingsCount = siblings.length;
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
            .where(sql`LOWER(TRIM(${players.email})) = ${callerParentEmail}`);
          parentPlayersCount = parentPlayers.length;
          for (const m of parentPlayers) {
            if (!seen.has(m.id)) {
              seen.add(m.id);
              familyMembers.push(m);
            }
          }
        }

        const isCallerParent = !callerParentEmail;

        console.log("[family/status] resolved", {
          callerEmail,
          callerParentEmail,
          isCallerParent,
          byEmailCount: byEmail.length,
          byParentEmailCount: byParentEmail.length,
          usersSharingEmail: usersByEmail.length,
          playersFromUsersCount: playersFromUsers.length,
          siblingsCount,
          parentPlayersCount,
          totalMembers: familyMembers.length,
        });

        // Ensure the caller is always present in the result set (defensive — should
        // already be in byEmail, but covers any edge case where the caller's own
        // email row didn't match due to upstream data weirdness).
        if (!seen.has(player.id)) {
          seen.add(player.id);
          familyMembers.push(player);
        }

        // For an unlinked child (has parentEmail but no siblings/parent linked), return no family.
        // For a parent account (no parentEmail), always return family data so they can add children
        // via the Family Lobby — even when no children are linked yet.
        if (!isCallerParent && familyMembers.length <= 1) {
          console.log("[family/status] returning isFamily:false — child with no linked family", {
            callerEmail,
          });
          return res.json({ isFamily: false, isCallerParent: false });
        }

        // Task #736 — batch outstanding-balance lookup for all family members
        // in a single grouped query (was N+1: one query per member).
        const memberIds = familyMembers.map((m) => m.id);
        const outstandingByPlayerId = new Map<string, number>();
        if (memberIds.length > 0) {
          type NetNegRow = { player_id: string; net_neg: string | number | null };
          const balanceRows = await db.execute(sql`
            SELECT player_id, COALESCE(SUM(LEAST(credits::numeric, 0)), 0)::numeric AS net_neg
            FROM player_credit_balance
            WHERE player_id IN (${sql.join(memberIds.map((id) => sql`${id}`), sql`, `)})
            GROUP BY player_id
          `);
          for (const row of balanceRows.rows as NetNegRow[]) {
            const netNeg = Number(row.net_neg ?? 0);
            outstandingByPlayerId.set(row.player_id, netNeg < 0 ? Math.abs(netNeg) : 0);
          }
        }

        const memberData = familyMembers.map((member) => ({
          id: member.id,
          name: member.name,
          avatarUrl: member.profilePhotoUrl,
          level: member.level || 1,
          xp: member.totalXp || 0,
          ballLevel: member.ballLevel,
          nextSession: null,
          outstandingBalance: outstandingByPlayerId.get(member.id) ?? 0,
          lastActiveAt: member.lastActiveAt?.toISOString() || null,
          chatEnabled: member.chatEnabled ?? null,
          communityEnabled: member.communityEnabled ?? null,
        }));

        const outstandingTotal = memberData.reduce(
          (sum, m) => sum + m.outstandingBalance,
          0,
        );

        // Determine the canonical parent email for this family.
        // If caller is a child (has parentEmail set), use that; otherwise use the
        // resolved caller email (which falls back to user.email when player.email
        // is missing) so the UI never receives null/undefined family metadata.
        const familyParentEmail = callerParentEmail || rawCallerEmail;

        res.json({
          isFamily: true,
          isCallerParent,
          family: {
            email: familyParentEmail,
            parentEmail: familyParentEmail,
            members: memberData,
            outstandingTotal,
            isCallerParent,
          },
        });
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === "42846") {
          console.error("[FamilyStatus] DB_CAST_ERROR", error);
        } else {
          console.error("Error fetching family status:", error);
        }
        try {
          Sentry.captureException(error, {
            tags: { route: "family/status", pgCode: code ?? "unknown" },
          });
        } catch {
          // Sentry must never break the response path
        }
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
        type FamilyNetNegRow = { net_neg: string | number | null };
        const owedRows = await db.execute(sql`
          SELECT COALESCE(SUM(LEAST(credits::numeric, 0)), 0)::numeric AS net_neg
          FROM player_credit_balance
          WHERE player_id IN (${sql.join(playerIds.map((id: string) => sql`${id}`), sql`, `)})
        `);
        const owedRow = (owedRows.rows as FamilyNetNegRow[])[0];
        const familyNetNeg = Number(owedRow?.net_neg ?? 0);
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

        const { sanitizeName: _sanitizeName } = await import("../../shared/textSanitize");
        const memberName = _sanitizeName(`${firstName} ${lastName}`);
        if (!memberName) {
          return res.status(400).json({ error: "Name cannot be empty" });
        }

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

        // Auto-derive ball level from age so kids don't need a manual picker.
        // Mirrors the behaviour of the standard signup paths (Task #1018).
        const derivedBallLevel = age !== null ? getBallLevelFromAge(age) : null;

        // The new member joins the SAME family as the caller (symmetric
        // model — siblings, not child-of-sibling). The parentEmail link
        // points at the family creator so the legacy email-based code paths
        // keep working.
        const callerFamilyId = await resolveOrCreateFamilyForCaller(parentPlayer.id);
        const [creatorRow] = await db
          .select({ creatorPlayerId: familyGroups.createdByPlayerId })
          .from(familyGroups)
          .where(eq(familyGroups.id, callerFamilyId));
        const creatorPlayerForLink = creatorRow?.creatorPlayerId
          ? await storage.getPlayer(creatorRow.creatorPlayerId)
          : parentPlayer;
        const linkParentEmail = creatorPlayerForLink?.email || parentPlayer.email;

        // Create the player record (no user/auth record — under parent account)
        const [newPlayer] = await db.insert(players).values({
          name: memberName,
          email: linkParentEmail, // share family creator's email for grouping
          parentEmail: linkParentEmail, // explicit link to family creator
          academyId: resolvedAcademyId,
          dateOfBirth: dateOfBirth || null,
          age,
          ballLevel: derivedBallLevel,
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

        // Mirror the new sibling into family_members. If this throws we let
        // the route handler return 500 so the inconsistency is surfaced
        // rather than silently swallowed; the orphan player will be picked
        // up by the lazy-create path on the next /api/family/me/group call.
        await addPlayerToFamily(callerFamilyId, newPlayer.id, {
          addedByPlayerId: parentPlayer.id,
          addedWithPin: false,
        });

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

        // Link child to parent (legacy email path, kept for backward compat)
        await db
          .update(players)
          .set({ parentEmail: parentPlayer.email })
          .where(eq(players.id, childPlayer.id));

        // Mirror the symmetric family_members link.
        const familyId = await resolveOrCreateFamilyForCaller(parentPlayer.id);
        await addPlayerToFamily(familyId, childPlayer.id, {
          addedByPlayerId: parentPlayer.id,
          addedWithPin: false,
        });

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
//
// Family B: now PIN-aware. If the target has a PIN set, the caller must
// provide it in the body OR be within the 60-second grace window from a
// recent switch into a target they were just on. Brute-force is throttled
// inside verifyAccountPin (5-attempt lockout).
//
// Grace tracking is in-memory keyed by the caller's userId — survives within
// a single server process, which is enough for the "switch out + back in"
// muscle-memory case described in the task.
const SWITCH_GRACE_MS = 60 * 1000;
type SwitchHistoryEntry = { fromPlayerId: string; toPlayerId: string; at: number };
const switchHistoryByUser = new Map<string, SwitchHistoryEntry>();

router.post(
  "/api/family/switch/:playerId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const targetPlayerId = req.params.playerId;
      const submittedPin: string | undefined =
        typeof req.body?.pin === "string" ? req.body.pin : undefined;

      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser || !freshUser.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const callerPlayer = await storage.getPlayer(freshUser.playerId);
      if (!callerPlayer) {
        return res.status(403).json({ error: "Account not found" });
      }

      // Build caller's family using BOTH the symmetric family_groups model
      // (canonical) AND the legacy email/parentEmail edges (for accounts that
      // haven't migrated yet).
      const familyIds = new Set<string>();
      familyIds.add(freshUser.playerId);

      const callerGroups = await db
        .select({ familyGroupId: familyMembers.familyGroupId })
        .from(familyMembers)
        .where(eq(familyMembers.playerId, freshUser.playerId));
      if (callerGroups.length > 0) {
        const groupIds = callerGroups.map((g) => g.familyGroupId);
        const peers = await db
          .select({ playerId: familyMembers.playerId })
          .from(familyMembers)
          .where(inArray(familyMembers.familyGroupId, groupIds));
        for (const p of peers) familyIds.add(p.playerId);
      }

      if (callerPlayer.email) {
        const byEmail = await db
          .select({ id: players.id })
          .from(players)
          .where(eq(players.email, callerPlayer.email));
        const byParentEmail = await db
          .select({ id: players.id })
          .from(players)
          .where(eq(players.parentEmail, callerPlayer.email));
        for (const p of byEmail) familyIds.add(p.id);
        for (const p of byParentEmail) familyIds.add(p.id);
      }

      if (callerPlayer.parentEmail) {
        const siblings = await db
          .select({ id: players.id })
          .from(players)
          .where(eq(players.parentEmail, callerPlayer.parentEmail));
        for (const s of siblings) familyIds.add(s.id);
        const parentPlayers = await db
          .select({ id: players.id })
          .from(players)
          .where(eq(players.email, callerPlayer.parentEmail));
        for (const p of parentPlayers) familyIds.add(p.id);
      }

      if (!familyIds.has(targetPlayerId)) {
        return res.status(403).json({ error: "Player is not in your family" });
      }

      const targetPlayer = await storage.getPlayer(targetPlayerId);
      if (!targetPlayer) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Family F — screen-time lock gate. If the target account is currently
      // locked, refuse to mint a token for it. The audit middleware will catch
      // existing sessions on the next request, but blocking the switch here
      // gives a clearer UX path ("Tennis Bla is taking a break — back at HH:MM").
      const lockState = await getAccountLockState(targetPlayerId);
      if (lockState.locked) {
        return res.status(403).json({
          error: "ACCOUNT_LOCKED",
          locked: true,
          lockedUntil: lockState.lockedUntil?.toISOString() ?? null,
          lockedByPlayerId: lockState.lockedByPlayerId,
          reason: lockState.reason,
          message: `${targetPlayer.name ?? "This account"} is taking a break.`,
        });
      }

      // PIN gate: only required if (a) target has a PIN AND (b) the caller is
      // not within the 60-second grace window of a switch they just made
      // out of this same target.
      const targetHasPin = await playerHasPin(targetPlayerId);
      let usedGrace = false;
      if (targetHasPin && targetPlayerId !== freshUser.playerId) {
        const lastSwitch = switchHistoryByUser.get(tokenUser.userId);
        const inGrace =
          !!lastSwitch &&
          lastSwitch.toPlayerId === freshUser.playerId &&
          lastSwitch.fromPlayerId === targetPlayerId &&
          Date.now() - lastSwitch.at < SWITCH_GRACE_MS;

        if (inGrace) {
          usedGrace = true;
        } else {
          if (!submittedPin) {
            return res.status(401).json({ error: "PIN required", pinRequired: true });
          }
          const verify = await verifyAccountPin(targetPlayerId, submittedPin);
          if (!verify.ok) {
            if ("locked" in verify && verify.locked) {
              return res.status(429).json({
                error: "Too many wrong attempts. Try again in a few minutes.",
                retryAfter: verify.retryAfter,
                locked: true,
              });
            }
            return res.status(401).json({
              error: "Incorrect PIN",
              pinRequired: true,
              attemptsLeft: "attemptsLeft" in verify ? verify.attemptsLeft : 0,
            });
          }
        }
      }

      // Find the target's user account (real or none).
      const [targetUser] = await db
        .select({ id: users.id, role: users.role, playerId: users.playerId, coachId: users.coachId })
        .from(users)
        .where(and(eq(users.playerId, targetPlayerId), eq(users.deleted, false)))
        .limit(1);

      let token: string;
      let refreshToken: string;
      let userPayload: any;
      if (targetUser) {
        const payload = {
          userId: targetUser.id,
          email: targetPlayer.email || "",
          role: targetUser.role || "player",
          playerId: targetUser.playerId,
          coachId: targetUser.coachId,
          academyId: targetPlayer.academyId,
        };
        token = generateToken(payload);
        refreshToken = generateRefreshToken(payload);
        userPayload = {
          id: targetUser.id,
          email: targetPlayer.email || "",
          role: targetUser.role || "player",
          playerId: targetUser.playerId,
          coachId: targetUser.coachId,
          academyId: targetPlayer.academyId,
        };
      } else {
        // No dedicated user account — synthetic token bound to target playerId
        // (familySwitch marker tells auth middleware to honour playerId).
        const payload = {
          userId: tokenUser.userId,
          email: callerPlayer.email || "",
          role: "player",
          playerId: targetPlayerId,
          coachId: null,
          academyId: targetPlayer.academyId,
          familySwitch: true,
        };
        token = generateToken(payload);
        refreshToken = generateRefreshToken(payload);
        userPayload = {
          id: tokenUser.userId,
          email: callerPlayer.email || "",
          role: "player",
          playerId: targetPlayerId,
          coachId: null,
          academyId: targetPlayer.academyId,
        };
      }

      // Record the switch so the reverse direction can use the 60s grace.
      switchHistoryByUser.set(tokenUser.userId, {
        fromPlayerId: freshUser.playerId,
        toPlayerId: targetPlayerId,
        at: Date.now(),
      });
      // Also record under the (potentially new) userId for the target so it
      // works regardless of which userId the next request is authenticated as.
      const targetUserId = targetUser?.id || tokenUser.userId;
      switchHistoryByUser.set(targetUserId, {
        fromPlayerId: freshUser.playerId,
        toPlayerId: targetPlayerId,
        at: Date.now(),
      });

      // Family F — audit row on the TARGET account's log so the family can
      // see "X switched into me at HH:MM". The actor is the original caller.
      writeAuditLog({
        playerId: targetPlayerId,
        actorPlayerId: freshUser.playerId,
        action: "profile_switch_in",
        metadata: {
          fromPlayerId: freshUser.playerId,
          fromName: callerPlayer.name ?? null,
          usedGrace,
          requiredPin: targetHasPin && !usedGrace,
        },
      }).catch(() => {});

      return res.json({
        token,
        refreshToken,
        user: userPayload,
        playerName: targetPlayer.name,
        hasOwnAccount: true,
        usedGrace,
      });
    } catch (error) {
      console.error("Error switching family account:", error);
      res.status(500).json({ error: "Failed to switch account" });
    }
  },
);

export default router;
