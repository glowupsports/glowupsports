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

        // Find all players with the same email address (same family)
        const familyMembers = await db
          .select()
          .from(players)
          .where(eq(players.email, player.email));

        if (familyMembers.length <= 1) {
          return res.json({ isFamily: false });
        }

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
              chatEnabled: member.chatEnabled ?? null,
              communityEnabled: member.communityEnabled ?? null,
            };
          }),
        );

        const outstandingTotal = memberData.reduce(
          (sum, m) => sum + m.outstandingBalance,
          0,
        );

        res.json({
          isFamily: true,
          family: {
            email: player.email,
            members: memberData,
            outstandingTotal,
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

        const targetPlayer = await storage.getPlayer(playerId);
        if (!targetPlayer || targetPlayer.email !== parentPlayer.email) {
          return res
            .status(403)
            .json({ error: "You can only manage family members" });
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

        // Get all debit transactions for these players
        // Note: Using 'type' field which contains 'debit' for negative balance transactions
        const debitTransactions = await db
          .select()
          .from(creditTransactions)
          .where(
            and(
              inArray(creditTransactions.playerId, playerIds),
              eq(creditTransactions.type, "debit"),
            ),
          );

        // Calculate outstanding balance (negative amounts represent debits)
        const totalOwed = debitTransactions.reduce((sum, tx) => {
          const amount = Number(tx.amount) || 0;
          return sum + (amount < 0 ? Math.abs(amount) : 0);
        }, 0);

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
          message: `Paid ${debitTransactions.length} outstanding items`,
          paid: totalPaid,
          count: debitTransactions.length,
        });
      } catch (error) {
        console.error("Error processing bulk payment:", error);
        res.status(500).json({ error: "Failed to process payment" });
      }
    },
  );

export default router;
