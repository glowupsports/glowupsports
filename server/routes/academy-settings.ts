import crypto from "crypto";
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
    playerBookingPreferences,
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
  import { sendPushNotification, getPlayerPushTokens, getCoachPushTokens } from "../pushNotifications";
  import { generateInvoiceHtml, parseLineItems, parseInvoiceMetadata } from "../services/invoicePdf";
  import { getCurrencyForCountry } from "@shared/countries";
  import { awardXP } from "../services/xp-service";
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
  
  
    // ==================== PHASE 3: ACADEMY SETTINGS ====================

  // Theme — read the active academy's theme. Auth-required because we look up
  // the academy via req.user.academyId. Returns { theme: null } when the user
  // has no academy or the academy hasn't customised its theme — the client
  // then falls back to the built-in defaults.
  router.get(
    "/api/academy/theme",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        // Platform owners may target any academy via ?academyId=...
        const overrideAcademyId =
          req.user?.role === "platform_owner" && typeof req.query.academyId === "string"
            ? (req.query.academyId as string)
            : undefined;
        const academyId = overrideAcademyId ?? req.user?.academyId;
        if (!academyId) return res.json({ theme: null, logoUrl: null });
        const academy = await storage.getAcademy(academyId);
        res.json({
          theme: (academy as any)?.theme ?? null,
          logoUrl: (academy as any)?.logoUrl ?? null,
        });
      } catch (error) {
        console.error("Get academy theme error:", error);
        res.status(500).json({ error: "Failed to fetch theme" });
      }
    },
  );

  // Upload an academy logo. Owner-only. Stored inline as a data URI on the
  // academy record so the existing theme endpoint can serve it without an
  // extra static-file route. Limited to ~512KB after base64 encoding to keep
  // requests reasonable.
  router.post(
    "/api/academy/logo",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    (req: Request, res: Response, next: NextFunction) => {
      // Lazy-load to avoid circular import at module init.
      const { academyLogoUpload, wrapUploadHandler } = require("../upload-middleware");
      return wrapUploadHandler(academyLogoUpload.single("logo"), {
        context: "AcademyLogo",
        maxBytes: 2 * 1024 * 1024,
      })(req, res, next);
    },
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const overrideAcademyId =
          req.user?.role === "platform_owner" &&
          (typeof req.body?.academyId === "string" || typeof req.query.academyId === "string")
            ? ((req.body?.academyId ?? req.query.academyId) as string)
            : undefined;
        const academyId = overrideAcademyId ?? req.user?.academyId;
        if (!academyId) return res.status(400).json({ error: "Academy ID required", code: "NO_ACADEMY" });
        if (!req.file) return res.status(400).json({ error: "No logo uploaded", code: "NO_FILE" });

        const mimeType = req.file.mimetype || "image/png";
        const base64Data = req.file.buffer.toString("base64");
        const logoUrl = `data:${mimeType};base64,${base64Data}`;

        await storage.updateAcademy(academyId, { logoUrl } as any);
        res.json({ success: true, logoUrl });
      } catch (error) {
        console.error("[AcademyLogo] Upload academy logo error:", error);
        res.status(500).json({ error: "Failed to upload logo", code: "UPLOAD_FAILED" });
      }
    },
  );

  // Remove the academy logo.
  router.delete(
    "/api/academy/logo",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const overrideAcademyId =
          req.user?.role === "platform_owner" && typeof req.query.academyId === "string"
            ? (req.query.academyId as string)
            : undefined;
        const academyId = overrideAcademyId ?? req.user?.academyId;
        if (!academyId) return res.status(400).json({ error: "Academy ID required" });
        await storage.updateAcademy(academyId, { logoUrl: null } as any);
        res.json({ success: true, logoUrl: null });
      } catch (error) {
        console.error("Delete academy logo error:", error);
        res.status(500).json({ error: "Failed to remove logo" });
      }
    },
  );

  // Update the active academy's theme. Owner / academy_owner / platform_owner
  // only — admin/coach/player must not change branding.
  router.patch(
    "/api/academy/theme",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const overrideAcademyId =
          req.user?.role === "platform_owner" && typeof req.body?.academyId === "string"
            ? (req.body.academyId as string)
            : undefined;
        const academyId = overrideAcademyId ?? req.user?.academyId;
        if (!academyId) return res.status(400).json({ error: "Academy ID required" });
        const { theme } = req.body ?? {};
        let parsed: any = null;
        if (theme !== null && theme !== undefined) {
          try {
            const { academyThemeSchema } = await import("@shared/theme");
            parsed = academyThemeSchema.parse(theme);
          } catch (err: any) {
            return res
              .status(400)
              .json({ error: "Invalid theme", details: err?.message ?? String(err) });
          }
        }
        const updated = await storage.updateAcademy(academyId, { theme: parsed } as any);
        res.json({ theme: (updated as any)?.theme ?? null });
      } catch (error) {
        console.error("Update academy theme error:", error);
        res.status(500).json({ error: "Failed to update theme" });
      }
    },
  );

  router.get(
    "/api/academy/info",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const academy = await storage.getAcademy(academyId);
        if (!academy) {
          return res.status(404).json({ error: "Academy not found" });
        }
        res.json({
          id: academy.id,
          name: academy.name,
          country: academy.country || null,
          city: academy.city || null,
          address: academy.address || null,
        });
      } catch (error) {
        console.error("Error fetching academy info:", error);
        res.status(500).json({ error: "Failed to fetch academy info" });
      }
    },
  );

  router.get(
    "/api/academy/settings",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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
          // Task #1131: openJoin lives on the academies table.
          openJoin: academy?.openJoin !== false,
        };

        res.json(response);
      } catch (error) {
        console.error("Error fetching academy settings:", error);
        res.status(500).json({ error: "Failed to fetch academy settings" });
      }
    },
  );

  router.patch(
    "/api/academy/settings",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;

        const {
          bankName,
          bankAccountNumber,
          bankIban,
          bankAccountHolder,
          bankSwiftCode,
          paymentInstructions,
          acceptsCash,
          acceptsBankTransfer,
          // Task #1131: openJoin lives on the academies table, not the
          // academy_settings table — extract and persist alongside bank fields.
          openJoin,
          ...settingsData
        } = req.body;

        const bankFields = {
          bankName,
          bankAccountNumber,
          bankIban,
          bankAccountHolder,
          bankSwiftCode,
          paymentInstructions,
          acceptsCash,
          acceptsBankTransfer,
        };
        const hasBankFields = Object.values(bankFields).some(
          (v) => v !== undefined,
        );

        if (hasBankFields) {
          await storage.updateAcademy(academyId, bankFields);
        }

        if (openJoin !== undefined) {
          await storage.updateAcademy(academyId, { openJoin: !!openJoin });
        }

        const settings = await storage.upsertAcademySettings(
          academyId,
          settingsData,
        );
        res.json(settings);
      } catch (error) {
        console.error("Error updating academy settings:", error);
        res.status(500).json({ error: "Failed to update academy settings" });
      }
    },
  );

  // ==================== PHASE 3: ACADEMY INVITES ====================

  router.get(
    "/api/academy/invites",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const invites = await storage.getAcademyInvites(academyId);
        res.json(invites);
      } catch (error) {
        console.error("Error fetching invites:", error);
        res.status(500).json({ error: "Failed to fetch invites" });
      }
    },
  );

  router.post(
    "/api/academy/invites",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const coachId = req.user!.coachId!;
        const { email, role = "coach" } = req.body;

        if (!email) {
          return res.status(400).json({ error: "Email is required" });
        }

        // Generate invite code
        const inviteCode = generateShortInviteCode();

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
    },
  );

  router.post(
    "/api/academy/invites/:code/accept",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { code } = req.params;
        const userId = req.user!.userId;
        const userEmail = req.user!.email;

        const invite = await storage.getAcademyInviteByCode(code);
        if (!invite) {
          return res.status(404).json({ error: "Invite not found" });
        }

        // Verify email matches if invite has email specified
        if (
          invite.email &&
          invite.email.toLowerCase() !== userEmail?.toLowerCase()
        ) {
          return res
            .status(403)
            .json({
              error: "This invite was sent to a different email address",
            });
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
            name: user?.email?.split("@")[0] || "New Coach",
            email: user?.email,
            academyId: invite.academyId,
            role: invite.role || "coach",
          });
          coachId = coach.id;
          await storage.updateUser(userId, {
            coachId: coach.id,
            academyId: invite.academyId,
          });
        }

        // Check if membership already exists
        const existingMemberships = await storage.getCoachMemberships(coachId);
        const alreadyMember = existingMemberships.some(
          (m) => m.academyId === invite.academyId,
        );

        if (!alreadyMember) {
          // Create membership
          await storage.createCoachMembership({
            coachId,
            academyId: invite.academyId,
            role: invite.role || "coach",
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
    },
  );

  router.delete(
    "/api/academy/invites/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // ==================== PHASE 3: ACADEMY MEMBERS ====================

  router.get(
    "/api/academy/members",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const memberships = await storage.getAcademyMembers(academyId);

        // Get coach details for each membership
        const members = await Promise.all(
          memberships.map(async (m) => {
            const coach = await storage.getCoach(m.coachId);
            return {
              ...m,
              coach: coach
                ? {
                    id: coach.id,
                    name: coach.name,
                    email: coach.email,
                    role: coach.role,
                  }
                : null,
            };
          }),
        );

        res.json(members);
      } catch (error) {
        console.error("Error fetching members:", error);
        res.status(500).json({ error: "Failed to fetch members" });
      }
    },
  );

  router.patch(
    "/api/academy/members/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const { id } = req.params;
        const { role, isActive } = req.body;

        // Verify membership belongs to this academy
        const members = await storage.getAcademyMembers(academyId);
        const targetMember = members.find((m) => m.id === id);
        if (!targetMember) {
          return res.status(404).json({ error: "Member not found" });
        }

        const membership = await storage.updateCoachMembership(id, {
          role,
          isActive,
        });
        res.json(membership);
      } catch (error) {
        console.error("Error updating member:", error);
        res.status(500).json({ error: "Failed to update member" });
      }
    },
  );

  // ==================== PHASE 3: COACH ACADEMIES (SWITCHER) ====================

  router.get(
    "/api/coach/academies",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        if (!coachId) {
          return res.json({ friends: [], pendingRequests: [] });
        }

        const memberships = await storage.getCoachMemberships(coachId);

        // Get academy details for each
        const academiesData = await Promise.all(
          memberships.map(async (m) => {
            const academy = await storage.getAcademy(m.academyId);
            return {
              ...m,
              academy: academy
                ? {
                    id: academy.id,
                    name: academy.name,
                    slug: academy.slug,
                    isFreelance: academy.isFreelance,
                  }
                : null,
            };
          }),
        );

        res.json(academiesData);
      } catch (error) {
        console.error("Error fetching coach academies:", error);
        res.status(500).json({ error: "Failed to fetch academies" });
      }
    },
  );

  router.post(
    "/api/coach/switch-academy",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        const userId = req.user!.userId;
        const { academyId } = req.body;

        if (!coachId) {
          return res.status(400).json({ error: "No coach profile found" });
        }

        // Verify membership
        const memberships = await storage.getCoachMemberships(coachId);
        const membership = memberships.find((m) => m.academyId === academyId);

        if (!membership) {
          return res
            .status(403)
            .json({ error: "Not a member of this academy" });
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
    },
  );

  // ==================== PHASE 3: PUSH NOTIFICATIONS ====================

  router.post(
    "/api/push/register",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.userId;
        const coachId = req.user!.coachId;
        const playerId = req.user!.playerId;
        const { token, platform, deviceName } = req.body;

        if (!token || !platform) {
          return res
            .status(400)
            .json({ error: "Token and platform are required" });
        }

        const deviceToken = await storage.registerPushToken({
          userId,
          coachId: coachId || null,
          playerId: playerId || null,
          token,
          platform,
          deviceName,
        });

        console.log(
          `[PushNotifications] Registered token for user ${userId} (coach: ${coachId}, player: ${playerId})`,
        );
        res.json(deviceToken);
      } catch (error) {
        console.error("Error registering push token:", error);
        res.status(500).json({ error: "Failed to register push token" });
      }
    },
  );

  router.delete(
    "/api/push/unregister",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  router.get(
    "/api/push/preferences",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        if (!coachId) {
          return res.json(null);
        }

        const prefs = await storage.getNotificationPreferences(coachId);
        res.json(
          prefs || {
            sessionReminders: true,
            feedbackRequests: true,
            packageExpiry: true,
            loadWarnings: true,
            chatMessages: true,
            reminderMinutesBefore: 30,
          },
        );
      } catch (error) {
        console.error("Error fetching notification preferences:", error);
        res.status(500).json({ error: "Failed to fetch preferences" });
      }
    },
  );

  router.patch(
    "/api/push/preferences",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        if (!coachId) {
          return res.status(400).json({ error: "No coach profile found" });
        }

        const prefs = await storage.upsertNotificationPreferences(
          coachId,
          req.body,
        );
        res.json(prefs);
      } catch (error) {
        console.error("Error updating notification preferences:", error);
        res.status(500).json({ error: "Failed to update preferences" });
      }
    },
  );

  router.post(
    "/api/push/test",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.userId;
        const { sendPushNotification, getUserPushTokens } = await import(
          "../pushNotifications"
        );

        const tokens = await getUserPushTokens(userId);

        if (tokens.length === 0) {
          return res.status(400).json({
            error: "No push tokens registered",
            message:
              "Open the app on your phone with notifications enabled first",
          });
        }

        const result = await sendPushNotification(
          tokens,
          "Test Notification",
          "Push notifications are working! This is a test from Glow Up Sports.",
          { type: "test", timestamp: new Date().toISOString() },
        );

        console.log(
          `[PushTest] Sent test notification to user ${userId}, ${tokens.length} devices`,
        );
        res.json({ success: true, devicesNotified: tokens.length, result });
      } catch (error) {
        console.error("Error sending test push:", error);
        res.status(500).json({ error: "Failed to send test notification" });
      }
    },
  );

  router.post(
    "/api/push/test-direct",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { token } = req.body;
        if (!token) {
          return res
            .status(400)
            .json({ error: "Token is required in request body" });
        }

        const { isFCMToken } = await import("../fcm");
        const tokenType = token.startsWith("ExponentPushToken[")
          ? "expo"
          : isFCMToken(token)
            ? "fcm"
            : "unknown";

        console.log(
          `[PushTestDirect] Testing ${tokenType} token: ${token.substring(0, 40)}...`,
        );

        if (tokenType === "fcm") {
          const { isFirebaseInitialized, sendFCMNotification } = await import(
            "../fcm"
          );
          if (!isFirebaseInitialized()) {
            return res
              .status(500)
              .json({
                error:
                  "Firebase not initialized - check FIREBASE_SERVICE_ACCOUNT_KEY",
              });
          }
          const results = await sendFCMNotification(
            [token],
            "Glow Up Sports - FCM Test",
            "Push notifications via FCM are working on your Play Store app!",
            { type: "test", timestamp: new Date().toISOString() },
          );
          return res.json({ success: true, tokenType, results });
        } else {
          const { sendPushNotification } = await import("../pushNotifications");
          const results = await sendPushNotification(
            [token],
            "Glow Up Sports - Test",
            "Push notifications are working!",
            { type: "test", timestamp: new Date().toISOString() },
          );
          return res.json({ success: true, tokenType, results });
        }
      } catch (error) {
        console.error("Error in direct push test:", error);
        res.status(500).json({ error: "Failed to send test notification" });
      }
    },
  );

  router.post(
    "/api/push/test-all-tokens",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.userId;
        const allTokens = await db
          .select()
          .from(pushDeviceTokens)
          .where(
            and(
              eq(pushDeviceTokens.userId, userId),
              eq(pushDeviceTokens.isActive, true),
            ),
          );

        if (allTokens.length === 0) {
          return res.status(400).json({
            error: "No active tokens",
            message:
              "Your Play Store app hasn't registered a push token yet. Make sure you've opened the app and allowed notifications.",
          });
        }

        const results = [];
        const { sendPushNotification } = await import("../pushNotifications");
        const { isFCMToken, isFirebaseInitialized: isFirebaseInit } =
          await import("../fcm");

        for (const t of allTokens) {
          const tokenType = t.token.startsWith("ExponentPushToken[")
            ? "expo"
            : isFCMToken(t.token)
              ? "fcm"
              : "unknown";
          console.log(
            `[PushTestAll] Testing ${tokenType} token on ${t.platform} (${t.deviceName}): ${t.token.substring(0, 30)}...`,
          );

          const result = await sendPushNotification(
            [t.token],
            "Glow Up Sports - Push Test",
            `Testing ${tokenType.toUpperCase()} on ${t.deviceName || t.platform}`,
            { type: "test", timestamp: new Date().toISOString() },
          );

          results.push({
            tokenType,
            platform: t.platform,
            deviceName: t.deviceName,
            tokenPreview: t.token.substring(0, 30) + "...",
            result,
          });
        }

        res.json({
          success: true,
          firebaseInitialized: isFirebaseInit(),
          totalTokensTested: allTokens.length,
          results,
        });
      } catch (error) {
        console.error("Error in test-all-tokens:", error);
        res.status(500).json({ error: "Failed to send test notifications" });
      }
    },
  );

  router.get(
    "/api/push/debug",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.userId;
        const coachId = req.user!.coachId;
        const playerId = req.user!.playerId;

        const allTokens = await db
          .select()
          .from(pushDeviceTokens)
          .where(eq(pushDeviceTokens.userId, userId));

        const activeTokens = allTokens.filter((t) => t.isActive);

        const tokenSummary = activeTokens.map((t) => ({
          id: t.id,
          platform: t.platform,
          deviceName: t.deviceName,
          tokenType: t.token.startsWith("ExponentPushToken[") ? "expo" : "fcm",
          tokenPreview: t.token.substring(0, 30) + "...",
          coachId: t.coachId,
          playerId: t.playerId,
          lastUsedAt: t.lastUsedAt,
          createdAt: t.createdAt,
        }));

        const { isFirebaseInitialized } = await import("../fcm");

        res.json({
          userId,
          coachId,
          playerId,
          totalTokens: allTokens.length,
          activeTokens: activeTokens.length,
          inactiveTokens: allTokens.length - activeTokens.length,
          tokens: tokenSummary,
          firebaseInitialized: isFirebaseInitialized(),
          diagnostics: {
            hasActiveExpoTokens: activeTokens.some((t) =>
              t.token.startsWith("ExponentPushToken["),
            ),
            hasActiveFCMTokens: activeTokens.some(
              (t) =>
                !t.token.startsWith("ExponentPushToken[") &&
                t.token.length > 100,
            ),
            coachTokensLinked: activeTokens.some((t) => t.coachId === coachId),
            playerTokensLinked: activeTokens.some(
              (t) => t.playerId === playerId,
            ),
          },
        });
      } catch (error) {
        console.error("Error in push debug:", error);
        res.status(500).json({ error: "Failed to get push debug info" });
      }
    },
  );

  // COMPREHENSIVE TEST: Send ALL notification types to the logged-in user
  router.post(
    "/api/push/test-all-types",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.userId;
        const playerId = req.user!.playerId;
        const coachId = req.user!.coachId;
        const {
          sendPushNotification,
          getUserPushTokens,
          getPlayerPushTokens,
          getCoachPushTokens,
        } = await import("../pushNotifications");
        const { isFirebaseInitialized } = await import("../fcm");

        // Collect ALL tokens for this user across all roles
        const tokenSets: { source: string; tokens: string[] }[] = [];

        const userTokens = await getUserPushTokens(userId);
        tokenSets.push({ source: "userId", tokens: userTokens });

        if (playerId) {
          const playerTokens = await getPlayerPushTokens(playerId);
          tokenSets.push({ source: "playerId", tokens: playerTokens });
        }
        if (coachId) {
          const coachTokens = await getCoachPushTokens(coachId);
          tokenSets.push({ source: "coachId", tokens: coachTokens });
        }

        // Deduplicate all tokens
        const allTokens = [...new Set(tokenSets.flatMap((ts) => ts.tokens))];

        if (allTokens.length === 0) {
          return res.status(400).json({
            error: "No push tokens found for your account",
            userId,
            playerId,
            coachId,
            firebaseInitialized: isFirebaseInitialized(),
            tokenSets: tokenSets.map((ts) => ({
              source: ts.source,
              count: ts.tokens.length,
            })),
            hint: "Open the app on your phone, make sure notifications are enabled, then close and reopen the app. The app must register its push token with the server first.",
          });
        }

        console.log(
          `[TestAllTypes] Sending ALL notification types to ${allTokens.length} devices for user ${userId}`,
        );

        const notificationTypes = [
          {
            type: "basic_test",
            title: "Glow Up Sports",
            body: "Push notifications are working! Your device is connected.",
            data: { type: "test" },
            delay: 0,
          },
          {
            type: "feedback_received",
            title: "New Coach Feedback",
            body: 'Coach Ahmad has added feedback for your session "Tuesday Group Training"',
            data: { type: "feedback_received", screen: "CoachFeedbackHistory" },
            delay: 2000,
          },
          {
            type: "xp_gained",
            title: "XP Earned! +15 XP",
            body: "Great effort today! You earned 15 XP from coach feedback.",
            data: { type: "xp_gained", screen: "XPHistory" },
            delay: 4000,
          },
          {
            type: "level_up",
            title: "LEVEL UP!",
            body: "Congratulations! You've reached Level 5 - Challenger! New features unlocked.",
            data: { type: "level_up", screen: "LevelUpHistory" },
            delay: 6000,
          },
          {
            type: "badge_earned",
            title: "Badge Earned!",
            body: 'You earned the "First Serve" badge: Complete your first training session!',
            data: { type: "badge_earned", screen: "Collection" },
            delay: 8000,
          },
          {
            type: "session_reminder",
            title: "Session Starting Soon",
            body: "Your Group Training with Coach Ahmad starts in 30 minutes at Court 1.",
            data: { type: "session_reminder", screen: "Schedule" },
            delay: 10000,
          },
          {
            type: "session_booked",
            title: "Session Confirmed",
            body: "You've been added to Private Training on Thursday 6:00 PM with Coach Sara.",
            data: { type: "session_booked", screen: "Schedule" },
            delay: 12000,
          },
          {
            type: "new_message",
            title: "New Message from Coach Ahmad",
            body: "Great work today! Keep practicing your backhand.",
            data: { type: "new_message", screen: "Messages" },
            delay: 14000,
          },
          {
            type: "credits_low",
            title: "Credits Running Low",
            body: "You have only 2 group credits remaining. Time to top up!",
            data: { type: "credits_low" },
            delay: 16000,
          },
        ];

        const results = [];

        for (const notif of notificationTypes) {
          await new Promise((resolve) =>
            setTimeout(resolve, notif.delay > 0 ? 2000 : 0),
          );
          try {
            const result = await sendPushNotification(
              allTokens,
              notif.title,
              notif.body,
              notif.data,
            );
            results.push({ type: notif.type, success: true, result });
            console.log(`[TestAllTypes] Sent: ${notif.type}`);
          } catch (err: any) {
            results.push({
              type: notif.type,
              success: false,
              error: err?.message,
            });
            console.error(`[TestAllTypes] Failed: ${notif.type}`, err?.message);
          }
        }

        res.json({
          success: true,
          userId,
          playerId,
          coachId,
          devicesNotified: allTokens.length,
          firebaseInitialized: isFirebaseInitialized(),
          tokenSets: tokenSets.map((ts) => ({
            source: ts.source,
            count: ts.tokens.length,
          })),
          notificationsSent: results.length,
          results,
        });
      } catch (error: any) {
        console.error("Error in test-all-types:", error);
        res
          .status(500)
          .json({
            error: "Failed to send test notifications",
            details: error?.message,
          });
      }
    },
  );

  router.post(
    "/api/platform/test/academy-signup",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userRole = req.user!.role;
        if (userRole !== "platform_owner") {
          return res
            .status(403)
            .json({ error: "Platform owner access required" });
        }

        const userId = req.user!.userId;
        const { sendPushNotification, getUserPushTokens } = await import(
          "../pushNotifications"
        );

        const tokens = await getUserPushTokens(userId);

        const testAcademyName = `Test Academy ${Date.now().toString().slice(-4)}`;
        const testOwnerName = "John Doe";
        const testEmail = "john.doe@example.com";

        if (tokens.length > 0) {
          await sendPushNotification(
            tokens,
            "New Academy Sign-up Request",
            `${testOwnerName} (${testEmail}) wants to create "${testAcademyName}"`,
            {
              type: "academy_signup_request",
              academyName: testAcademyName,
              ownerName: testOwnerName,
            },
          );
        }

        console.log(
          `[PlatformTest] Simulated academy sign-up for user ${userId}`,
        );
        res.json({
          success: true,
          simulation: {
            academyName: testAcademyName,
            ownerName: testOwnerName,
            email: testEmail,
            notificationSent: tokens.length > 0,
          },
        });
      } catch (error) {
        console.error("Error simulating academy sign-up:", error);
        res.status(500).json({ error: "Failed to simulate academy sign-up" });
      }
    },
  );

  // Test endpoint: Player receives simulated coach feedback
  router.post(
    "/api/player/test/feedback",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.userId;
        const { sendPushNotification, getUserPushTokens } = await import(
          "../pushNotifications"
        );

        const tokens = await getUserPushTokens(userId);

        const testCoachName = "Coach Sarah";
        const testFeedbackType = "Great session today!";
        const testXpGained = 25;

        if (tokens.length > 0) {
          await sendPushNotification(
            tokens,
            "New Feedback from Coach",
            `${testCoachName} left feedback: "${testFeedbackType}" (+${testXpGained} XP)`,
            {
              type: "feedback_received",
              coachName: testCoachName,
              xpGained: testXpGained,
            },
          );
        }

        console.log(
          `[PlayerTest] Simulated feedback notification for user ${userId}`,
        );
        res.json({
          success: true,
          simulation: {
            coachName: testCoachName,
            feedbackType: testFeedbackType,
            xpGained: testXpGained,
            notificationSent: tokens.length > 0,
          },
        });
      } catch (error) {
        console.error("Error simulating player feedback:", error);
        res.status(500).json({ error: "Failed to simulate feedback" });
      }
    },
  );

  // Test endpoint: Coach receives simulated booking request
  router.post(
    "/api/coach/test/booking-request",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userRole = req.user!.role;
        if (
          userRole !== "coach" &&
          userRole !== "academy_owner" &&
          userRole !== "admin" &&
          userRole !== "platform_owner"
        ) {
          return res
            .status(403)
            .json({ error: "Coach, Admin or Owner access required" });
        }

        const userId = req.user!.userId;
        const { sendPushNotification, getUserPushTokens } = await import(
          "../pushNotifications"
        );

        const tokens = await getUserPushTokens(userId);

        const testPlayerName = "Emma Johnson";
        const testSessionType = "Private Lesson";
        const testDate = new Date(
          Date.now() + 3 * 24 * 60 * 60 * 1000,
        ).toLocaleDateString();

        if (tokens.length > 0) {
          await sendPushNotification(
            tokens,
            "New Booking Request",
            `${testPlayerName} requested a ${testSessionType} on ${testDate}`,
            {
              type: "booking_request",
              playerName: testPlayerName,
              sessionType: testSessionType,
            },
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
          },
        });
      } catch (error) {
        console.error("Error simulating booking request:", error);
        res.status(500).json({ error: "Failed to simulate booking request" });
      }
    },
  );

  // Test endpoint: Admin receives simulated coach invite acceptance
  router.post(
    "/api/admin/test/coach-invite",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userRole = req.user!.role;
        if (
          userRole !== "admin" &&
          userRole !== "academy_owner" &&
          userRole !== "platform_owner"
        ) {
          return res
            .status(403)
            .json({ error: "Admin or Owner access required" });
        }

        const userId = req.user!.userId;
        const { sendPushNotification, getUserPushTokens } = await import(
          "../pushNotifications"
        );

        const tokens = await getUserPushTokens(userId);

        const testCoachName = "Michael Chen";
        const testCoachEmail = "m.chen@example.com";
        const testSpecialization = "Junior Development";

        if (tokens.length > 0) {
          await sendPushNotification(
            tokens,
            "Coach Invite Accepted",
            `${testCoachName} (${testCoachEmail}) has joined your academy as a ${testSpecialization} coach!`,
            {
              type: "coach_invite_accepted",
              coachName: testCoachName,
              email: testCoachEmail,
            },
          );
        }

        console.log(
          `[AdminTest] Simulated coach invite acceptance for user ${userId}`,
        );
        res.json({
          success: true,
          simulation: {
            coachName: testCoachName,
            email: testCoachEmail,
            specialization: testSpecialization,
            notificationSent: tokens.length > 0,
          },
        });
      } catch (error) {
        console.error("Error simulating coach invite:", error);
        res.status(500).json({ error: "Failed to simulate coach invite" });
      }
    },
  );

  // ==================== PHASE 3: BILLING ====================

  router.get(
    "/api/billing/account",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  router.patch(
    "/api/billing/account",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const account = await storage.updateBillingAccount(academyId, req.body);
        res.json(account);
      } catch (error) {
        console.error("Error updating billing account:", error);
        res.status(500).json({ error: "Failed to update billing account" });
      }
    },
  );

  router.get("/api/billing/plans", async (req: Request, res: Response) => {
    try {
      const plans = await storage.getSubscriptionPlans();
      res.json(plans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });

  router.get(
    "/api/billing/subscription",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const subscription = await storage.getSubscription(academyId);
        res.json(subscription || null);
      } catch (error) {
        console.error("Error fetching subscription:", error);
        res.status(500).json({ error: "Failed to fetch subscription" });
      }
    },
  );

  // ==================== PACKAGE TEMPLATES ====================

  // Auto-priced credit packages based on academy session pricing
  // Returns available packages for each session type with fixed quantities (1, 5, 10, 20)
  router.get(
    "/api/billing/credit-packages",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const CREDIT_QUANTITIES = [1, 5, 10, 20];
        const CREDIT_TYPES = ["private", "semi", "group"] as const;

        // Get active pricing for all session types
        const pricing = await storage.getAcademyPricing(academyId);

        // Build auto-priced packages
        const packages: {
          creditType: string;
          credits: number;
          pricePerCredit: string;
          totalPrice: string;
          currency: string;
          label: string;
          hasPricing: boolean;
        }[] = [];

        for (const creditType of CREDIT_TYPES) {
          const sessionPricing = pricing.find(
            (p) => p.sessionType === creditType,
          );
          const pricePerCredit = sessionPricing
            ? parseFloat(sessionPricing.pricePerSession)
            : 0;
          const currency = sessionPricing?.currency || "AED";
          const hasPricing = !!sessionPricing && pricePerCredit > 0;

          for (const credits of CREDIT_QUANTITIES) {
            const totalPrice = pricePerCredit * credits;
            const creditTypeLabel =
              creditType === "semi"
                ? "Semi-Private"
                : creditType.charAt(0).toUpperCase() + creditType.slice(1);
            packages.push({
              creditType,
              credits,
              pricePerCredit: pricePerCredit.toFixed(2),
              totalPrice: totalPrice.toFixed(2),
              currency,
              label: `${credits} ${creditTypeLabel} Credit${credits > 1 ? "s" : ""}`,
              hasPricing,
            });
          }
        }

        res.json(packages);
      } catch (error) {
        console.error("Error fetching credit packages:", error);
        res.status(500).json({ error: "Failed to fetch credit packages" });
      }
    },
  );

  // Legacy: Manual package templates (for backward compatibility)
  router.get(
    "/api/billing/package-templates",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const templates = await storage.getPackageTemplates(academyId);
        // Add frontend compatibility fields
        const normalizedTemplates = templates.map((t) => ({
          ...t,
          creditType: t.sessionType,
          pricePerCredit:
            t.credits > 0 ? (parseFloat(t.price) / t.credits).toFixed(2) : "0",
        }));
        res.json(normalizedTemplates);
      } catch (error) {
        console.error("Error fetching package templates:", error);
        res.status(500).json({ error: "Failed to fetch package templates" });
      }
    },
  );

  router.post(
    "/api/billing/package-templates",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const {
          name,
          description,
          credits,
          price,
          pricePerCredit,
          currency,
          validityDays,
          sessionType,
          creditType,
        } = req.body;

        if (!name || typeof credits !== "number" || credits <= 0) {
          return res
            .status(400)
            .json({ error: "Name and positive credits required" });
        }

        // Support both price (total) and pricePerCredit (per unit)
        let finalPrice: number;
        if (pricePerCredit !== undefined && pricePerCredit !== null) {
          const parsedPricePerCredit = parseFloat(String(pricePerCredit));
          if (!isFinite(parsedPricePerCredit) || parsedPricePerCredit <= 0) {
            return res
              .status(400)
              .json({ error: "Price per credit must be a positive number" });
          }
          finalPrice = parsedPricePerCredit * credits;
        } else if (typeof price === "number" && isFinite(price) && price > 0) {
          finalPrice = price;
        } else {
          return res
            .status(400)
            .json({ error: "Price must be a positive number" });
        }

        const template = await storage.createPackageTemplate({
          academyId,
          name,
          description,
          credits,
          price: String(finalPrice),
          currency: currency || "AED",
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
    },
  );

  router.patch(
    "/api/billing/package-templates/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const { id } = req.params;

        const template = await storage.updatePackageTemplate(
          id,
          req.body,
          academyId,
        );
        if (!template) {
          return res.status(404).json({ error: "Package template not found" });
        }
        res.json(template);
      } catch (error) {
        console.error("Error updating package template:", error);
        res.status(500).json({ error: "Failed to update package template" });
      }
    },
  );

  router.delete(
    "/api/billing/package-templates/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Assign package to player (creates package instance + invoice)
  router.post(
    "/api/billing/assign-package",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const { playerId, templateId, customPrice, notes } = req.body;

        // Validate player
        const player = await storage.getPlayer(playerId);
        if (!player || player.academyId !== academyId) {
          return res
            .status(400)
            .json({ error: "Player not found in this academy" });
        }

        // Validate template
        const template = await storage.getPackageTemplate(
          templateId,
          academyId,
        );
        if (!template) {
          return res.status(400).json({ error: "Package template not found" });
        }

        // Calculate expiry date
        const expiryDate = new Date();
        expiryDate.setDate(
          expiryDate.getDate() + (template.validityDays || 90),
        );

        // Create package for player
        const pkg = await storage.createPackage({
          academyId,
          playerId,
          templateId,
          name: template.name,
          totalCredits: template.credits,
          remainingCredits: template.credits,
          price: customPrice ? String(customPrice) : template.price,
          currency: template.currency || "AED",
          expiryDate: expiryDate.toISOString().split("T")[0],
          status: "active",
        });

        // Settle any outstanding debts for this player
        const pkgCreditType = template.sessionType || "group";
        const pkgDebtSettlement = await storage.settlePlayerDebts(
          playerId,
          pkgCreditType,
          pkg.id,
        );

        if (pkgDebtSettlement.settledCount > 0) {
          console.log(
            `[AssignPackage] Settled ${pkgDebtSettlement.settledCount} debt(s) for player ${playerId}`,
          );
        }

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
          invoiceType: "package",
          amount: customPrice ? String(customPrice) : template.price,
          currency: template.currency || "AED",
          dueDate: dueDate.toISOString().split("T")[0],
          lineItems: JSON.stringify([
            {
              description: template.name,
              quantity: 1,
              unitPrice: customPrice || parseFloat(template.price),
              total: customPrice || parseFloat(template.price),
            },
          ]),
          notes,
          status: "pending",
        });

        res.status(201).json({ package: pkg, invoice });
      } catch (error) {
        console.error("Error assigning package:", error);
        res.status(500).json({ error: "Failed to assign package" });
      }
    },
  );

  router.get(
    "/api/billing/invoices",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const invoicesList = await storage.getInvoices(academyId);
        res.json(invoicesList);
      } catch (error) {
        console.error("Error fetching invoices:", error);
        res.status(500).json({ error: "Failed to fetch invoices" });
      }
    },
  );

  router.post(
    "/api/billing/invoices",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const {
          playerId,
          packageId,
          amount,
          currency,
          dueDate,
          lineItems,
          notes,
          discount,
          taxRate,
          taxAmount,
          subtotal,
          billToName,
          billToEmail,
        } = req.body;

        // Validate required fields
        if (typeof amount !== "number" || amount <= 0) {
          return res
            .status(400)
            .json({ error: "Amount must be a positive number" });
        }

        // Validate player belongs to academy if provided
        if (playerId) {
          const player = await storage.getPlayer(playerId);
          if (!player || player.academyId !== academyId) {
            return res
              .status(400)
              .json({ error: "Player not found in this academy" });
          }
        }

        // Validate package belongs to academy if provided
        if (packageId) {
          const pkg = await storage.getPackage(packageId);
          if (!pkg || pkg.academyId !== academyId) {
            return res
              .status(400)
              .json({ error: "Package not found in this academy" });
          }
        }

        const invoiceNumber = await storage.generateInvoiceNumber(academyId);

        const enrichedLineItems = {
          items: lineItems || [],
          ...(discount ? { discount: Number(discount) } : {}),
          ...(taxRate ? { taxRate: Number(taxRate) } : {}),
          ...(taxAmount ? { taxAmount: Number(taxAmount) } : {}),
          ...(subtotal ? { subtotal: Number(subtotal) } : {}),
        };

        const invoice = await storage.createInvoice({
          academyId,
          playerId,
          packageId,
          invoiceNumber,
          amount,
          currency: currency || "AED",
          dueDate,
          lineItems: enrichedLineItems,
          notes,
          billToName: billToName || null,
          billToEmail: billToEmail || null,
        });

        res.status(201).json(invoice);
      } catch (error) {
        console.error("Error creating invoice:", error);
        res.status(500).json({ error: "Failed to create invoice" });
      }
    },
  );

  router.patch(
    "/api/billing/invoices/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner", "coach"),
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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

        if (updates.paidAt && typeof updates.paidAt === 'string') {
          updates.paidAt = new Date(updates.paidAt);
        }

        const invoice = await storage.updateInvoice(id, updates);
        res.json(invoice);
      } catch (error) {
        console.error("Error updating invoice:", error);
        res.status(500).json({ error: "Failed to update invoice" });
      }
    },
  );

  // Task #1005 — hard-delete an invoice. Coach asked for "wipe it" semantics:
  // the row goes, and any rows referencing it are either deleted (the
  // payment_reminders FK is NOT NULL) or have their invoice_id cleared so the
  // player's Owed/Paid totals + the global Billing list reflect reality
  // immediately.
  router.delete(
    "/api/billing/invoices/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner", "coach"),
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const { id } = req.params;

        const existing = await storage.getInvoice(id);
        if (!existing || existing.academyId !== academyId) {
          return res.status(404).json({ error: "Invoice not found" });
        }

        const ok = await storage.deleteInvoice(id);
        if (!ok) {
          return res.status(404).json({ error: "Invoice not found" });
        }
        res.json({ ok: true });
      } catch (error) {
        console.error("Error deleting invoice:", error);
        res.status(500).json({ error: "Failed to delete invoice" });
      }
    },
  );

  router.get(
    "/api/billing/invoices/:id/html",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const { id } = req.params;

        const invoice = await storage.getInvoice(id);
        if (!invoice || invoice.academyId !== academyId) {
          return res.status(404).json({ error: "Invoice not found" });
        }

        const academy = await storage.getAcademy(academyId);
        const settings = await storage.getAcademySettings(academyId);
        const player = invoice.playerId
          ? await storage.getPlayer(invoice.playerId)
          : null;

        const lineItems = parseLineItems(invoice.lineItems);
        const metadata = parseInvoiceMetadata(invoice.lineItems);
        const subtotal = metadata.subtotal || lineItems.reduce((sum, item) => sum + item.total, 0);

        const invoiceData = {
          invoiceNumber: invoice.invoiceNumber,
          issueDate:
            invoice.createdAt?.toISOString() || new Date().toISOString(),
          dueDate: invoice.dueDate || new Date().toISOString(),
          academy: {
            name: academy?.name || "Academy",
            email: settings?.contactEmail || undefined,
            phone: settings?.contactPhone || undefined,
            logo: (academy as any)?.logoUrl || undefined,
            vatRegistrationNumber: (settings as any)?.vatRegistrationNumber || undefined,
          },
          player: {
            name: invoice.billToName || player?.name || "Customer",
            email: invoice.billToEmail || player?.email || undefined,
            phone: player?.phone || undefined,
          },
          lineItems:
            lineItems.length > 0
              ? lineItems
              : [
                  {
                    description: "Tennis Lessons",
                    quantity: 1,
                    unitPrice: parseFloat(invoice.amount || "0"),
                    total: parseFloat(invoice.amount || "0"),
                  },
                ],
          subtotal: subtotal || parseFloat(invoice.amount || "0"),
          taxRate: metadata.taxRate,
          taxAmount: metadata.taxAmount,
          discount: metadata.discount,
          total: parseFloat(invoice.amount || "0"),
          currency: invoice.currency || "AED",
          notes: invoice.notes || undefined,
          status: invoice.status as
            | "pending"
            | "paid"
            | "overdue"
            | "cancelled",
          paidAt: invoice.paidAt?.toISOString(),
          theme: academy?.theme ?? null,
        };

        const html = generateInvoiceHtml(invoiceData);
        res.setHeader("Content-Type", "text/html");
        res.send(html);
      } catch (error) {
        console.error("Error generating invoice HTML:", error);
        res.status(500).json({ error: "Failed to generate invoice" });
      }
    },
  );

  router.post(
    "/api/billing/payments",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const { invoiceId, amount, currency, paymentMethod } = req.body;

        // Validate amount
        if (typeof amount !== "number" || amount <= 0) {
          return res
            .status(400)
            .json({ error: "Amount must be a positive number" });
        }

        // Validate invoice belongs to academy if provided
        if (invoiceId) {
          const invoice = await storage.getInvoice(invoiceId);
          if (!invoice || invoice.academyId !== academyId) {
            return res
              .status(400)
              .json({ error: "Invoice not found in this academy" });
          }
        }

        const payment = await storage.createPayment({
          academyId,
          invoiceId,
          amount,
          currency: currency || "AED",
          paymentMethod: paymentMethod || "cash",
          status: "succeeded",
        });

        // Update invoice status if invoice was provided
        if (invoiceId) {
          await storage.updateInvoice(invoiceId, {
            status: "paid",
            paidAt: new Date(),
          });
        }

        res.status(201).json(payment);
      } catch (error) {
        console.error("Error creating payment:", error);
        res.status(500).json({ error: "Failed to create payment" });
      }
    },
  );

  router.get(
    "/api/billing/payments",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const paymentsList = await storage.getPayments(academyId);
        res.json(paymentsList);
      } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).json({ error: "Failed to fetch payments" });
      }
    },
  );

  router.post(
    "/api/billing/refunds",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const coachId = req.user!.coachId;
        const { paymentId, amount, reason, notes } = req.body;

        // Validate required fields
        if (!paymentId) {
          return res.status(400).json({ error: "Payment ID is required" });
        }

        if (typeof amount !== "number" || amount <= 0) {
          return res
            .status(400)
            .json({ error: "Amount must be a positive number" });
        }

        // Validate payment belongs to academy
        const payments = await storage.getPayments(academyId);
        const payment = payments.find((p) => p.id === paymentId);
        if (!payment) {
          return res
            .status(400)
            .json({ error: "Payment not found in this academy" });
        }

        // Validate refund amount doesn't exceed payment
        if (amount > payment.amount) {
          return res
            .status(400)
            .json({ error: "Refund amount cannot exceed payment amount" });
        }

        const refund = await storage.createRefund({
          paymentId,
          amount,
          reason,
          notes,
          processedBy: coachId,
          status: "succeeded",
        });

        // Update payment status
        await storage.updatePayment(paymentId, { status: "refunded" });

        res.status(201).json(refund);
      } catch (error) {
        console.error("Error creating refund:", error);
        res.status(500).json({ error: "Failed to create refund" });
      }
    },
  );

export default router;
