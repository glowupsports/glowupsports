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
    playerMonthlyAssessments,
    loginSchema, registerSchema, playerRegisterSchema, coachInviteRegisterSchema,
    academyApplicationInputSchema, insertSessionSchema, insertPlayerSchema, updatePlayerSchema,
    insertPackageSchema, insertPlayerNoteSchema, insertMessageSchema, insertMessageReactionSchema,
    submitReviewSchema,
  } from "@shared/schema";
  import { sendCreditsLowNotification, getPlayerPushTokens } from "../pushNotifications";
  import { awardXP } from "../services/xp-service";
  const router = Router();
  
    // ===================== PACKAGES / CREDITS =====================
  router.get(
    "/api/players/:playerId/packages",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
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

        const pkgs =
          await storage.getPlayerPackagesWithCalculatedRemaining(playerId);

        // PATCH B: Removed lazy settle completely
        // Settlement now only happens at package creation time via POST /api/packages
        // This prevents response-only updates that don't persist to DB
        // Each package shows its OWN stored remainingCredits from the database
        res.json(pkgs);
      } catch (error) {
        console.error("Error fetching packages:", error);
        res.status(500).json({ error: "Failed to fetch packages" });
      }
    },
  );

  router.get(
    "/api/players/:playerId/packages/active",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Get player credit balance by type, including debts (negative values = debt)
  router.get(
    "/api/players/:playerId/credit-balance",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Get player pillar progress summary for Glow Leveling OS
  router.get(
    "/api/players/:playerId/pillar-progress",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { playerId } = req.params;

        const player = await storage.getPlayer(playerId);
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }

        const pillarProgress =
          await storage.getPlayerPillarProgressSummary(playerId);

        // Fetch latest monthly self-assessment for perception gap display
        const latestAssessmentRows = await db
          .select({
            monthYear: playerMonthlyAssessments.monthYear,
            pillarSelfRatings: playerMonthlyAssessments.pillarSelfRatings,
            aiSummary: playerMonthlyAssessments.aiSummary,
          })
          .from(playerMonthlyAssessments)
          .where(
            and(
              eq(playerMonthlyAssessments.playerId, playerId),
              eq(playerMonthlyAssessments.status, "completed"),
            ),
          )
          .orderBy(desc(playerMonthlyAssessments.completedAt))
          .limit(1);

        const latestAssessment = latestAssessmentRows[0] ?? null;
        res.json({
          ...pillarProgress,
          playerSelfRatings: (latestAssessment?.pillarSelfRatings as Record<string, number>) ?? null,
          latestAssessmentMonth: latestAssessment?.monthYear ?? null,
          latestAssessmentSummary: latestAssessment?.aiSummary ?? null,
        });
      } catch (error) {
        console.error("Error fetching pillar progress:", error);
        res.status(500).json({ error: "Failed to fetch pillar progress" });
      }
    },
  );

  router.post(
    "/api/packages",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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
          return res
            .status(400)
            .json({ error: "playerId and totalCredits are required" });
        }

        // Validate credit type
        const validCreditTypes = ["group", "private", "semi_private"];
        if (!validCreditTypes.includes(creditType)) {
          return res
            .status(400)
            .json({
              error:
                "Invalid creditType. Must be group, private, or semi_private",
            });
        }

        const { valid } = await validatePlayerOwnership(
          playerId,
          academyId,
          storage,
        );
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Look up academy pricing for this credit type
        const pricing = await storage.getAcademyPricingByType(
          academyId!,
          creditType,
        );
        const pricePerCredit = pricing ? Number(pricing.pricePerSession) : 0;
        const currency = pricing?.currency || "AED";
        const totalPrice = pricePerCredit * totalCredits;

        // Calculate purchase date and expiry
        const purchaseDate = purchasedAt ? new Date(purchasedAt) : new Date();
        let finalExpiryDate = expiryDate;
        if (!finalExpiryDate && expiryMonths) {
          const expiry = new Date(purchaseDate);
          expiry.setMonth(expiry.getMonth() + expiryMonths);
          finalExpiryDate = expiry.toISOString().split("T")[0];
        }

        // Generate invoice number
        const invoiceNumber = await storage.generateInvoiceNumber(academyId!);

        // Get player info for invoice
        const player = await storage.getPlayer(playerId);

        // Create invoice first
        // If purchasedAt is provided, mark as paid; otherwise mark as pending
        const isPaid = !!purchasedAt;
        const dueDate = !isPaid
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0]
          : null; // 7 days from now

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
          lineItems: [
            {
              description: `${totalCredits} ${creditType.replace("_", " ")} lesson credits`,
              quantity: totalCredits,
              unitPrice: pricePerCredit,
              total: totalPrice,
              creditType,
            },
          ],
          notes: `Credit package purchase - ${creditType.replace("_", " ")} lessons`,
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
          name: `${totalCredits} ${creditType.replace("_", " ")} credits`,
          isPaid: false,
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

        // Settle any outstanding debts for this player and credit type.
        // The settlement function is internally guarded so it can never deduct
        // more credits than the package has remaining (hard cap in storage layer).
        console.log(`[Package] Running debt settlement for player ${playerId}, creditType=${creditType}, packageCredits=${totalCredits}`);
        const debtSettlement = await storage.settlePlayerDebts(
          playerId,
          creditType,
          pkg.id,
        );

        if (debtSettlement.settledCount > 0) {
          // Sanity check: settled debts should never exceed package credits
          if (debtSettlement.totalDeducted > totalCredits) {
            console.error(
              `[Package] SETTLEMENT OVERFLOW: deducted ${debtSettlement.totalDeducted} credits but package only has ${totalCredits} — investigate immediately`
            );
          } else {
            console.log(
              `[Package] Settled ${debtSettlement.settledCount} debt(s) for player ${playerId}, deducted ${debtSettlement.totalDeducted}/${totalCredits} credits from package ${pkg.id}`,
            );
          }
        } else {
          console.log(`[Package] No outstanding debts to settle for player ${playerId} (${creditType})`);
        }


        // Audit log
        if (coachId) {
          await storage.createAuditLog({
            entityType: "package",
            entityId: pkg.id,
            action: "create",
            performedBy: coachId,
            metadata: {
              creditType,
              totalCredits,
              totalPrice,
              invoiceId: invoice.id,
            },
          });
        }

        res.status(201).json({ ...pkg, invoice });
      } catch (error) {
        console.error("Error creating package:", error);
        res.status(500).json({ error: "Failed to create package" });
      }
    },
  );

  router.patch(
    "/api/packages/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePackageOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid) {
          return res.status(404).json({ error: "Package not found" });
        }

        const pkg = await storage.updatePackage(
          id,
          req.body,
          academyId ?? undefined,
        );
        if (!pkg) {
          return res.status(404).json({ error: "Package not found" });
        }
        res.json(pkg);
      } catch (error) {
        console.error("Error updating package:", error);
        res.status(500).json({ error: "Failed to update package" });
      }
    },
  );

  router.delete(
    "/api/packages/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { force } = req.query;
        const academyId = req.user!.academyId;

        console.log(
          `[PackageDelete] Attempting to delete package ${id} for academy ${academyId}, force=${force}`,
        );

        const { valid } = await validatePackageOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid) {
          console.log(
            `[PackageDelete] Package ${id} not found or not owned by academy ${academyId}`,
          );
          return res.status(404).json({ error: "Package not found" });
        }

        const result = await storage.deletePackage(
          id,
          academyId ?? undefined,
          force === "true",
        );
        console.log(`[PackageDelete] Delete result:`, result);

        if (!result.success) {
          return res.status(400).json({
            error: result.error,
            creditsUsed: result.creditsUsed,
          });
        }

        res.json({ success: true });
      } catch (error) {
        console.error("[PackageDelete] Error deleting package:", error);
        res.status(500).json({ error: "Failed to delete package" });
      }
    },
  );

  router.post(
    "/api/packages/:id/use",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePackageOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid) {
          return res.status(404).json({ error: "Package not found" });
        }

        const pkg = await storage.usePackageCredit(id, academyId ?? undefined);
        if (!pkg) {
          return res
            .status(400)
            .json({ error: "No credits remaining or package not found" });
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
    },
  );

  // Get single session with players
  router.get(
    "/api/coach/sessions/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid, session } = await validateSessionOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid || !session) {
          return res.status(404).json({ error: "Session not found" });
        }

        const players = await storage.getSessionPlayers(id);
        res.json({ ...session, players });
      } catch (error) {
        console.error("Error fetching session:", error);
        res.status(500).json({ error: "Failed to fetch session" });
      }
    },
  );

  // Update session (for drag-and-drop reschedule)
  router.patch(
    "/api/sessions/:sessionId",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { sessionId } = req.params;
        const { startTime, endTime, courtId, checkConflicts } = req.body;
        const academyId = req.user!.academyId;

        const { valid, session } = await validateSessionOwnership(
          sessionId,
          academyId,
          storage,
        );
        if (!valid || !session) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Determine new times
        const newStartTime = startTime
          ? new Date(startTime)
          : session.startTime;
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
              academyId || undefined,
            );
            if (coachConflict) {
              return res.status(409).json({
                error: "Coach has a conflicting session at this time",
                conflictType: "coach",
                conflictingSession: coachConflict,
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
              academyId || undefined,
            );
            if (courtConflict) {
              return res.status(409).json({
                error: "Court is already booked at this time",
                conflictType: "court",
                conflictingSession: courtConflict,
              });
            }
          }

          // Check player conflicts
          const playersInSession = await storage.getSessionPlayersWithDetails(
            sessionId,
            academyId || undefined,
          );
          for (const player of playersInSession) {
            const playerConflict = await storage.checkPlayerConflict(
              player.id,
              newStartTime,
              newEndTime,
              sessionId,
              academyId || undefined,
            );
            if (playerConflict) {
              return res.status(409).json({
                error: `Player ${player.name} has a conflicting session at this time`,
                conflictType: "player",
                playerId: player.id,
                playerName: player.name,
                conflictingSession: playerConflict,
              });
            }
          }
        }

        const updateData: Record<string, any> = {};
        if (startTime) updateData.startTime = newStartTime;
        if (endTime) updateData.endTime = newEndTime;
        if (courtId !== undefined) updateData.courtId = newCourtId;

        const updatedSession = await storage.updateSession(
          sessionId,
          updateData,
        );

        // Recreate time block for rescheduled session (delete old, create new)
        if (
          session.coachId &&
          session.status !== "cancelled" &&
          (startTime || endTime)
        ) {
          await storage.deleteCoachTimeBlockBySession(sessionId);
          const sessionDate = newStartTime.toISOString().split("T")[0];
          const startTimeStr = newStartTime
            .toISOString()
            .split("T")[1]
            .substring(0, 5);
          const endTimeStr = newEndTime
            .toISOString()
            .split("T")[1]
            .substring(0, 5);
          await storage.createCoachTimeBlock({
            coachId: session.coachId,
            sourceType: "session",
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
    },
  );

  // ==================== PLAYER NOTES (COACH MEMORY HUB) ====================

  // Get notes for a player
  router.get(
    "/api/players/:id/notes",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Add a note for a player
  router.post(
    "/api/players/:id/notes",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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
          return res
            .status(400)
            .json({ error: "Content is required after sanitization" });
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
    },
  );

  // Delete a player note
  router.delete(
    "/api/players/:playerId/notes/:noteId",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { playerId, noteId } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(
          playerId,
          academyId,
          storage,
        );
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        await storage.deletePlayerNote(noteId);
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting player note:", error);
        res.status(500).json({ error: "Failed to delete note" });
      }
    },
  );

  // Toggle note pin
  router.patch(
    "/api/players/:playerId/notes/:noteId/pin",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { playerId, noteId } = req.params;
        const { isPinned } = req.body;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(
          playerId,
          academyId,
          storage,
        );
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const note = await storage.toggleNotePin(noteId, isPinned);
        res.json(note);
      } catch (error) {
        console.error("Error toggling note pin:", error);
        res.status(500).json({ error: "Failed to toggle pin" });
      }
    },
  );

export default router;
