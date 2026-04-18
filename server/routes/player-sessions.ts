import crypto from "crypto";
import rateLimit from "express-rate-limit";
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
    generateRefreshToken,
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
    groupEvents as groupEventsTable, groupEventRsvps as groupEventRsvpsTable,
    openToPlay as openToPlayTable, userSocialProfiles as userSocialProfilesTable,
    questTemplates as questTemplatesTable, playerQuests as playerQuestsTable,
    dailyQuestSlots as dailyQuestSlotsTable, playerConnections,
    badges as badgesTable, playerBadges as playerBadgesTable,
    titles as titlesTable, playerTitles as playerTitlesTable,
    sessionPlans, providerInvites, serviceProviders, platformConfig, pushDeviceTokens,
    loginSchema, registerSchema, playerRegisterSchema, coachInviteRegisterSchema,
    academyApplicationInputSchema, insertSessionSchema, insertPlayerSchema, updatePlayerSchema, playerSelfUpdateSchema,
    insertPackageSchema, insertPlayerNoteSchema, insertMessageSchema, insertMessageReactionSchema,
    submitReviewSchema,
  } from "@shared/schema";
  import { sendSessionCancelledNotification, sendFeedbackNotification, sendPushNotification, getPlayerPushTokens } from "../pushNotifications";
  import { awardXP } from "../services/xp-service";
  import { broadcastSessionUpdate, broadcastFeedbackReceived } from "../websocket";
  import { generateInvoiceHtml, parseLineItems, parseInvoiceMetadata } from "../services/invoicePdf";
  import { getCurrencyForCountry } from "@shared/countries";
  import { profilePhotoUpload, courtPhotoUpload, socialPostUpload } from "../upload-middleware";
import path from "path";
import fs from "fs";
  const router = Router();

  function requirePlayerOrOwner(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): void {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (
      req.user.role === "platform_owner" ||
      req.user.role === "academy_owner" ||
      req.user.role === "owner" ||
      req.user.role === "admin"
    ) {
      next();
      return;
    }
    if (req.user.role === "coach" && req.user.coachId) {
      next();
      return;
    }
    if (req.user.role === "player") {
      next();
      return;
    }
    res.status(403).json({ error: "Player account required" });
  }
  
  
    // ==================== PLAYER SESSION ACTIONS ====================

  // Cancel session as player (private/semi-private only)
  router.post(
    "/api/player/me/sessions/:sessionId/cancel",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
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
          return res
            .status(400)
            .json({
              error:
                "Group sessions cannot be cancelled. Use 'Mark as unavailable' instead.",
            });
        }

        // Verify player is part of this session
        const sessionPlayer = await storage.getSessionPlayer(
          sessionId,
          playerId,
        );
        if (!sessionPlayer) {
          return res
            .status(403)
            .json({ error: "You are not part of this session" });
        }

        // Check if session is in the future
        const sessionTime = new Date(session.startTime);
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        if (sessionTime < now) {
          return res
            .status(400)
            .json({ error: "Cannot cancel a past session" });
        }

        // Get player and academy info
        const player = await storage.getPlayer(playerId);
        const academy = player?.academyId
          ? await storage.getAcademy(player.academyId)
          : null;
        const cancellationWindowHours = academy?.cancelHoursBeforeFree || 24;

        // Calculate if this is a late cancellation
        const hoursUntilSession =
          (sessionTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        const isLateCancellation = hoursUntilSession < cancellationWindowHours;

        // Determine billing status based on timing
        const billingStatus = isLateCancellation ? "charged" : "not_charged";
        const makeUpEligibility = isLateCancellation
          ? "not_eligible"
          : "eligible";

        // Update session player to cancelled/absent
        await storage.updateSessionPlayer(sessionPlayer.id, {
          attendanceStatus: "absent",
          absenceReason: reason,
          notes: `Cancelled: ${reason}${reasonText ? ` - ${reasonText}` : ""} (${Math.round(hoursUntilSession)}h notice)`,
        });

        // Create cancellation record
        await storage.createPlayerSessionCancellation({
          sessionType: session.sessionType,
          sessionId,
          playerId,
          academyId: player?.academyId,
          cancellationType: "cancel",
          reason,
          reasonText: reasonText || null,
          sessionDate: sessionTime,
          billingStatus,
          makeUpEligibility,
          notifiedCoach: true,
          coachNotifiedAt: new Date(),
        });

        // LATE CANCELLATION: Deduct credits and apply XP penalties
        if (isLateCancellation) {
          const creditType = session.sessionType.includes("semi")
            ? "semi_private"
            : session.sessionType.includes("group")
              ? "group"
              : "private";

          // Determine penalty tier based on hours until session
          let creditsToDeduct = 0;
          let xpPenalty = 0;
          let penaltyTier = "";

          if (hoursUntilSession < 2) {
            creditsToDeduct = 1;
            xpPenalty = -50;
            penaltyTier = "critical";
          } else if (hoursUntilSession < 24) {
            creditsToDeduct = 1;
            xpPenalty = -25;
            penaltyTier = "late";
          }

          if (creditsToDeduct > 0) {
            const transactionId = `late-cancel-${sessionId}-${playerId}-${Date.now()}`;

            // Task #676 Phase 2 — V1 write gate.
            const { v1WritesAllowed } = await import("../services/credit-feature-flag");
            const v1Ok = await v1WritesAllowed(session.academyId);
            if (v1Ok) {
              await db.insert(creditTransactions).values({
                id: transactionId,
                playerId: playerId,
                sessionId: sessionId,
                type: "debit",
                amount: -creditsToDeduct,
                reason: "late_cancellation",
                creditType: creditType,
                metadata: {
                  hoursNotice: Math.round(hoursUntilSession),
                  penaltyTier,
                  sessionType: session.sessionType,
                  cancelledAt: new Date().toISOString(),
                },
              });

              // Only mark "charged" + ledger linkage when a V1 ledger row was
              // actually written. For V2 academies the V2 engine owns the
              // debit; marking "charged" here without a ledger row would
              // silently desync the wallet — log a warning instead so the
              // unwired late-cancel V2 path surfaces in Phase 3 work.
              await db
                .update(sessionPlayers)
                .set({
                  creditDeductedAt: new Date(),
                  creditTransactionId: transactionId,
                  billingStatus: "charged",
                })
                .where(eq(sessionPlayers.id, sessionPlayer.id));

              console.log(
                `[LateCancellation] Player ${playerId} charged ${creditsToDeduct} ${creditType} credit(s) for late cancellation (${Math.round(hoursUntilSession)}h notice, tier: ${penaltyTier})`,
              );
            } else {
              console.warn(
                `[LateCancellation][V2] Player ${playerId} late-cancelled session ${sessionId} (academy ${session.academyId}) — V1 write blocked, V2 late-cancel debit path not yet wired (Task #684 Phase 3). Skipping billingStatus/creditTransactionId update to avoid wallet desync.`,
              );
            }
          }

          if (xpPenalty !== 0) {
            await storage.addPlayerXP(
              playerId,
              xpPenalty,
              sessionId,
              `Late cancellation penalty (${Math.round(hoursUntilSession)}h notice)`,
            );
            console.log(
              `[LateCancellation] Player ${playerId} XP penalty: ${xpPenalty} (tier: ${penaltyTier})`,
            );
          }
        }

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
          const remainingPlayers = allPlayers.filter(
            (p) =>
              p.playerId !== playerId &&
              p.playerId !== null &&
              (p.attendanceStatus === null ||
                p.attendanceStatus === "present" ||
                p.attendanceStatus === "late"),
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
                message:
                  "Your semi-private session has been upgraded to a private lesson because the other player is unavailable.",
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
            title: semiPrivateUpgraded
              ? "Semi-Private Upgraded"
              : "Session Cancelled",
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

        // Send push notification to coach about player cancellation (non-blocking)
        if (session.coachId) {
          const tokens = await getCoachPushTokens(session.coachId);
          if (tokens.length > 0) {
            sendPushNotification(
              tokens,
              semiPrivateUpgraded
                ? "Semi-Private Upgraded"
                : "Session Cancelled",
              `${player?.name || "A player"} has cancelled${isLateCancellation ? " (late cancellation)" : ""}`,
              { screen: "Session", sessionId },
            ).catch((err) =>
              console.error(
                "[PushNotification] Failed to send cancellation notification to coach:",
                err,
              ),
            );
          }
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
    },
  );

  // Mark as unavailable for group sessions (lesson still counts)
  router.post(
    "/api/player/me/sessions/:sessionId/mark-unavailable",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
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
          return res
            .status(400)
            .json({ error: "Please provide an explanation for your absence" });
        }

        // Get the session
        const session = await storage.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Verify this is a group session
        if (session.sessionType !== "group") {
          return res
            .status(400)
            .json({
              error:
                "Mark as unavailable is only for group sessions. Use cancel for private/semi-private.",
            });
        }

        // Verify player is part of this session
        const sessionPlayer = await storage.getSessionPlayer(
          sessionId,
          playerId,
        );
        if (!sessionPlayer) {
          return res
            .status(403)
            .json({ error: "You are not part of this session" });
        }

        // Check if session is in the future
        const sessionTime = new Date(session.startTime);
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        if (sessionTime < now) {
          return res
            .status(400)
            .json({ error: "Cannot mark unavailable for a past session" });
        }

        // Calculate hours before session
        const hoursBeforeSession = Math.round(
          (sessionTime.getTime() - now.getTime()) / (1000 * 60 * 60),
        );

        // Get player and academy info
        const player = await storage.getPlayer(playerId);
        const academy = player?.academyId
          ? await storage.getAcademy(player.academyId)
          : null;
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
          sessionType: session.sessionType,
          sessionId,
          playerId,
          academyId: player?.academyId,
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
    },
  );

  // Notify coach that player is running late
  router.post(
    "/api/player/me/sessions/:sessionId/late",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { sessionId } = req.params;
        const { minutes, message } = req.body; // 5, 10, 15, 20, 30
        const playerId = req.user!.playerId;

        if (!playerId) {
          return res.status(400).json({ error: "Player profile required" });
        }

        if (!minutes || minutes < 1 || minutes > 60) {
          return res
            .status(400)
            .json({ error: "Please specify valid delay in minutes (1-60)" });
        }

        // Get the session
        const session = await storage.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Verify player is part of this session
        const sessionPlayer = await storage.getSessionPlayer(
          sessionId,
          playerId,
        );
        if (!sessionPlayer) {
          return res
            .status(403)
            .json({ error: "You are not part of this session" });
        }

        // Check if session is today or in the near future
        const sessionTime = new Date(session.startTime);
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        const hoursUntilSession =
          (sessionTime.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (hoursUntilSession < -2) {
          return res.status(400).json({ error: "Session has already passed" });
        }

        if (hoursUntilSession > 24) {
          return res
            .status(400)
            .json({
              error:
                "You can only send late notifications within 24 hours of the session",
            });
        }

        // Update session player with late status
        const wasCharged = sessionPlayer.attendanceStatus === "present" || sessionPlayer.attendanceStatus === "late";
        await storage.updateSessionPlayer(sessionPlayer.id, {
          attendanceStatus: "late",
          lateMinutes: minutes,
          notes: message || `Running ${minutes} min late`,
        });
        if (!wasCharged && !sessionPlayer.creditDeductedAt) {
          try {
            const { ensureCreditProcessed } = await import("../storage");
            await ensureCreditProcessed(sessionPlayer.id);
          } catch (creditErr) {
            console.error(`[Late] Credit processing failed for player ${playerId}:`, creditErr);
          }
        }

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
            console.log(
              `[Late] Push notification to coach ${session.coachId}: ${player?.name} is ${minutes} min late`,
            );
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
    },
  );

  // Player early check-in for session
  router.post(
    "/api/player/me/sessions/:sessionId/check-in",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { sessionId } = req.params;
        const playerId = req.user!.playerId;

        if (!playerId) {
          return res.status(400).json({ error: "Player profile required" });
        }

        const session = await storage.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Try to update session_players attendance
        const sp = await storage.getSessionPlayer(sessionId, playerId);
        if (sp) {
          const wasCharged = sp.attendanceStatus === "present" || sp.attendanceStatus === "late";
          await storage.updateSessionPlayer(sp.id, {
            attendanceStatus: "present",
            checkedInAt: new Date(),
          });
          if (!wasCharged && !sp.creditDeductedAt) {
            try {
              const { ensureCreditProcessed } = await import("../storage");
              await ensureCreditProcessed(sp.id);
            } catch (creditErr) {
              console.error(`[CheckIn] Credit processing failed for player ${playerId}:`, creditErr);
            }
          }
        }

        // Award XP for early check-in
        let xpAwarded = 25;
        try {
          await storage.addXP(
            playerId,
            xpAwarded,
            "early_check_in",
            "Early check-in for session",
          );
        } catch (xpErr) {
          console.error("Error awarding check-in XP:", xpErr);
          xpAwarded = 0;
        }

        // Notify coach about player check-in
        if (session.coachId) {
          const player = await storage.getPlayer(playerId);
          await storage.createNotification({
            coachId: session.coachId,
            type: "player_checked_in",
            title: "Player Checked In",
            message: `${player?.name || "A player"} checked in early for the session`,
            metadata: JSON.stringify({
              sessionId,
              playerId,
              playerName: player?.name,
            }),
          });
        }

        res.json({
          success: true,
          xpAwarded,
          message: "Checked in successfully!",
        });
      } catch (error) {
        console.error("Error checking in:", error);
        res.status(500).json({ error: "Failed to check in" });
      }
    },
  );

  // Report an issue with a session (equipment, court, safety, coach, other)
  router.post(
    "/api/player/me/sessions/:sessionId/report-issue",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { sessionId } = req.params;
        const { issueType, description } = req.body;
        const playerId = req.user!.playerId;

        if (!playerId) {
          return res.status(400).json({ error: "Player profile required" });
        }

        const validIssueTypes = [
          "equipment",
          "court",
          "safety",
          "coach",
          "other",
        ];
        if (!issueType || !validIssueTypes.includes(issueType)) {
          return res
            .status(400)
            .json({ error: "Please select a valid issue type" });
        }

        // Get the session
        const session = await storage.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Check if player is part of this session (via session_players or series_players)
        const sessionPlayer = await storage.getSessionPlayer(
          sessionId,
          playerId,
        );
        // Don't block report even if player isn't in session_players - they may be linked via series

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
          errorId: crypto.randomUUID(),
          userId: req.user!.id,
          academyId: session.academyId ?? undefined,
          userRole: "player",
          severity: issueType === "safety" ? "critical" : "error",
          message: description || `Player reported a ${issueType} issue`,
          screen: "LiveSession",
          context: {
            sessionId,
            playerId,
            playerName: player?.name,
            issueType,
            issueLabel: issueLabels[issueType],
            sessionDate: session.startTime,
            coachId: session.coachId,
            academyId: session.academyId,
          },
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
          console.log(
            `[SAFETY ALERT] Player ${player?.name} reported safety concern for session ${sessionId}`,
          );

          // Create additional critical-level diagnostic for immediate visibility
          await storage.createDiagnosticReport({
            errorId: crypto.randomUUID(),
            userId: req.user!.id,
            academyId: session.academyId ?? undefined,
            userRole: "player",
            severity: "critical",
            message: `URGENT - Player reported safety concern: ${description || "No details provided"}`,
            screen: "LiveSession",
            userComment: description || undefined,
            context: {
              sessionId,
              playerId,
              playerName: player?.name,
              issueType: "safety",
              sessionDate: session.startTime,
              coachId: session.coachId,
              academyId: session.academyId,
              urgent: true,
            },
            status: "new",
          });
        }

        res.json({
          success: true,
          message:
            "Your report has been submitted. Thank you for helping us improve.",
          ticketCreated: true,
        });
      } catch (error) {
        console.error("Error reporting issue:", error);
        res.status(500).json({ error: "Failed to submit report" });
      }
    },
  );

  // Get player vacation status
  router.get(
    "/api/player/me/vacation",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;

        if (!playerId) {
          return res.json({ active: false, holidays: [] });
        }

        const holidays = await storage.getPlayerHolidays(playerId);
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );

        // Find active vacation
        const activeVacation = holidays.find((h) => {
          const start = new Date(h.startDate);
          const end = new Date(h.endDate);
          return now >= start && now <= end;
        });

        // Find upcoming vacation
        const upcomingVacation = holidays.find((h) => {
          const start = new Date(h.startDate);
          return start > now;
        });

        res.json({
          active: !!activeVacation,
          currentVacation: activeVacation
            ? {
                id: activeVacation.id,
                startDate: activeVacation.startDate,
                endDate: activeVacation.endDate,
              }
            : null,
          upcomingVacation: upcomingVacation
            ? {
                id: upcomingVacation.id,
                startDate: upcomingVacation.startDate,
                endDate: upcomingVacation.endDate,
              }
            : null,
          holidays: holidays.map((h) => ({
            id: h.id,
            startDate: h.startDate,
            endDate: h.endDate,
          })),
        });
      } catch (error) {
        console.error("Error fetching vacation status:", error);
        res.status(500).json({ error: "Failed to fetch vacation status" });
      }
    },
  );

  // Set player vacation
  router.post(
    "/api/player/me/vacation",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { startDate, endDate } = req.body;
        const playerId = req.user!.playerId;

        if (!playerId) {
          return res.status(400).json({ error: "Player profile required" });
        }

        if (!startDate || !endDate) {
          return res
            .status(400)
            .json({ error: "Start and end dates are required" });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (end < start) {
          return res
            .status(400)
            .json({ error: "End date must be after start date" });
        }

        // Check for maximum vacation length (e.g., 90 days)
        const daysDiff =
          (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 90) {
          return res
            .status(400)
            .json({ error: "Vacation cannot exceed 90 days" });
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
    },
  );

  // Cancel/delete player vacation
  router.delete(
    "/api/player/me/vacation/:id",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const playerId = req.user!.playerId;

        if (!playerId) {
          return res.status(400).json({ error: "Player profile required" });
        }

        // Verify this vacation belongs to the player
        const holidays = await storage.getPlayerHolidays(playerId);
        const holiday = holidays.find((h) => h.id === id);

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
    },
  );

  // Get player progress data (skill domains, XP, level)
  router.get(
    "/api/player/me/progress",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        // Return empty progress for users without player profile
        if (!req.user!.playerId) {
          return res.json({
            level: 1,
            xp: 0,
            xpForNextLevel: 500,
            glowScore: 0,
            ballLevel: "red1",
            displayName: null,
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
        const requestedSport = (req.query.sport as string) || "tennis";

        const player = await storage.getPlayer(playerId);
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Get skill domains metadata
        const domains = await storage.listSkillDomains();

        // Get player skill states for all domains
        const skillStates = await storage.getPlayerSkillStates(playerId);

        // Get domain XP summary from observations, scoped to the requested sport
        const domainXpSummary =
          await storage.getPlayerDomainXpSummary(playerId, requestedSport);

        // Get XP data
        const xpData = await storage.getPlayerXpTotal(playerId);
        const totalXp = xpData.totalXp || player.totalXp || 0;
        const level = xpData.level || player.level || 1;

        // Build skill radar data with domain insights
        const skillRadarPromises = domains.map(async (domain) => {
          const skillState = skillStates.find((s) => s.domainId === domain.id);
          const xpInfo = domainXpSummary.find((x) => x.domainId === domain.id);
          const insights = await storage.getPlayerDomainInsights(
            playerId,
            domain.id,
          );

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
        const avgProgress =
          skillRadar.length > 0
            ? skillRadar.reduce((sum, s) => sum + s.progress, 0) /
              skillRadar.length
            : 0;
        const glowScore = Math.min(100, Math.round(avgProgress));

        // Aggregate overall strengths and focus areas from all domains
        const allHighlights = skillRadar
          .flatMap((s) => s.insights.recentHighlights)
          .slice(0, 5);
        const allFocusAreas = skillRadar
          .flatMap((s) => s.insights.focusAreas)
          .slice(0, 5);

        // Calculate level readiness for next level
        // For non-tennis sports, use sport-specific ballLevel from sportProfiles if available
        type SportProfile = { ballLevel?: string | null; skillLevel?: number | null };
        const sportProfiles = (player as { sportProfiles?: Record<string, SportProfile> | null }).sportProfiles ?? null;
        const sportSpecificBallLevel = requestedSport !== "tennis" && sportProfiles?.[requestedSport]?.ballLevel;
        const currentBallLevel = sportSpecificBallLevel || player.ballLevel || "red";
        const currentSkillLevel = player.skillLevel || 1;

        // Determine next level based on current ball level and skill level
        // Returns normalized underscore format: BALL_SUBLEVEL (e.g., GREEN_2)
        const getNextLevel = (
          ball: string,
          skill: number,
        ): { composite: string; ballLevel: string; subLevel: number } => {
          // Normalize input: extract ball color and skill number
          const ballColor = ball.replace(/\d+$/, "").toLowerCase();
          const currentSub = ball.match(/\d$/)
            ? parseInt(ball.slice(-1))
            : skill;

          const ballOrder = ["red", "orange", "green", "yellow"];

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
          return { composite: "GLOW", ballLevel: "glow", subLevel: 0 };
        };

        const nextLevel = getNextLevel(currentBallLevel, currentSkillLevel);

        let levelReadiness = null;
        try {
          levelReadiness = await storage.calculatePlayerLevelReadiness(
            playerId,
            nextLevel.composite,
          );
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
            pillarScores[domainLower as keyof typeof pillarScores] =
              skill.progress;
          }
        });

        const battlePower = Object.values(pillarScores).reduce(
          (sum, score) => sum + score,
          0,
        );
        const maxBattlePower = 600;
        const battlePowerPercentage = Math.round(
          (battlePower / maxBattlePower) * 100,
        );

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
        const normalizedBallLevel = currentBallLevel
          .replace(/\d+$/, "")
          .toLowerCase();
        const normalizedSkillLevel = currentBallLevel.match(/\d$/)
          ? parseInt(currentBallLevel.slice(-1))
          : currentSkillLevel;
        const compositeLevel = `${normalizedBallLevel.toUpperCase()}_${normalizedSkillLevel}`;

        // Resolve display_name_player from ball_levels table using composite level ID
        let ballLevelDisplayName: string | null = null;
        try {
          const ballLevelRow = await db
            .select({ displayNamePlayer: ballLevels.displayNamePlayer })
            .from(ballLevels)
            .where(eq(ballLevels.id, compositeLevel))
            .limit(1);
          ballLevelDisplayName = ballLevelRow[0]?.displayNamePlayer ?? null;
        } catch (_e) {
          // Non-critical; fallback to null (client uses translateLevelLabel)
        }

        res.json({
          sport: requestedSport,
          level,
          xp: totalXp,
          xpForNextLevel: (level + 1) * 500,
          glowScore,
          ballLevel: compositeLevel, // Always use composite format: GREEN_2
          displayName: ballLevelDisplayName, // Human-readable from ball_levels table e.g. "Glow 2"
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
          levelReadiness: levelReadiness
            ? {
                isReady: levelReadiness.isReady,
                requirements: levelReadiness.requirements,
                sessionCount: levelReadiness.sessionCount,
                minSessionsRequired: levelReadiness.minSessionsRequired,
                coachApprovalRequired: true,
                coachApprovalStatus: "pending",
              }
            : null,
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
            battlePower: {
              total: battlePower,
              level: powerInfo.level,
              tier: powerInfo.tier,
            },
          },
        });
      } catch (error) {
        console.error("Error fetching player progress:", error);
        res.status(500).json({ error: "Failed to fetch player progress" });
      }
    },
  );

  // Get player pillar progress summary (player-auth version of coach endpoint)
  router.get(
    "/api/player/me/pillar-progress",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        if (!req.user!.playerId) {
          return res.json({
            pillars: [],
            overallReadiness: 0,
            trialGateReady: false,
            recentFeedbackCount: 0,
          });
        }
        const playerId = req.user!.playerId!;
        const summary = await storage.getPlayerPillarProgressSummary(playerId);
        res.json(summary);
      } catch (error) {
        console.error("Error fetching player pillar progress:", error);
        res.status(500).json({ error: "Failed to fetch pillar progress" });
      }
    },
  );

  // Get player attendance summary per series/class
  router.get(
    "/api/player/me/attendance",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        if (!req.user!.playerId) {
          return res.json({
            classes: [],
            summary: { totalPresent: 0, totalSessions: 0, attendanceRate: 0 },
          });
        }
        const playerId = req.user!.playerId!;
        const attendanceSport = typeof req.query.sport === "string" ? req.query.sport : null;

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
          return res.json({
            classes: [],
            summary: { totalPresent: 0, totalSessions: 0, attendanceRate: 0 },
          });
        }

        const seriesIds = playerSeriesRecords.map((r) => r.seriesId);

        // Get series details, optionally filtered by sport
        const seriesDetails = await db
          .select()
          .from(coachingSeries)
          .where(
            and(
              inArray(coachingSeries.id, seriesIds),
              attendanceSport ? eq(coachingSeries.sport, attendanceSport) : undefined,
            ),
          );

        // Get attendance counts per series
        const classes = await Promise.all(
          seriesDetails.map(async (series) => {
            const seriesRecord = playerSeriesRecords.find(
              (r) => r.seriesId === series.id,
            );

            // Get all sessions for this series
            const seriesSessions = await db
              .select({ id: sessions.id, startTime: sessions.startTime })
              .from(sessions)
              .where(eq(sessions.seriesId, series.id));

            const sessionIds = seriesSessions.map((s) => s.id);

            // Count attendance by status
            const attendanceRecords =
              sessionIds.length > 0
                ? await db
                    .select({
                      status: sessionPlayers.attendanceStatus,
                      count: count(),
                    })
                    .from(sessionPlayers)

                    .where(
                      and(
                        inArray(sessionPlayers.sessionId, sessionIds),
                        eq(sessionPlayers.playerId, playerId),
                      ),
                    )
                    .groupBy(sessionPlayers.attendanceStatus)
                : [];

            const presentOnTimeCount = Number(
              attendanceRecords.find((r) => r.status === "present")?.count || 0,
            );
            const lateCount = Number(
              attendanceRecords.find((r) => r.status === "late")?.count || 0,
            );
            const presentCount = presentOnTimeCount + lateCount;
            const vacationCount = Number(
              attendanceRecords.find((r) => r.status === "vacation")?.count ||
                0,
            );
            const absentCount = Number(
              attendanceRecords.find((r) => r.status === "absent")?.count || 0,
            );
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
                rate:
                  totalRecorded > 0
                    ? Math.round((Number(presentCount) / totalRecorded) * 100)
                    : 0,
              },
            };
          }),
        );

        // Calculate overall summary
        const totalPresent = classes.reduce(
          (sum, c) => sum + c.attendance.present,
          0,
        );
        const totalSessions = classes.reduce(
          (sum, c) => sum + c.attendance.total,
          0,
        );
        const overallRate =
          totalSessions > 0
            ? Math.round((totalPresent / totalSessions) * 100)
            : 0;

        res.json({
          classes: classes.sort((a, b) =>
            (a.dayOfWeek ?? "").localeCompare(b.dayOfWeek ?? ""),
          ),
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
    },
  );

  // Get player journey (milestones, badges, achievements)
  router.get(
    "/api/player/me/journey",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
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
        const formattedMilestones = milestones.map((m) => ({
          id: m.id,
          type: m.type,
          title: m.title,
          description:
            m.type === "skill_improvement"
              ? "Great progress on skills"
              : "XP achievement",
          date: m.date?.toISOString() || new Date().toISOString(),
          icon: m.type === "skill_improvement" ? "trending-up" : "award",
          color: m.type === "skill_improvement" ? "#2ECC40" : "#FFD700",
        }));

        // Add XP history items as timeline entries
        const xpMilestones = xpHistory.map((xp) => ({
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
          .sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          )
          .slice(0, 30);

        res.json({
          milestones: allMilestones,
          badges: [],
          badgesAvailable: false,
          badgeMessage:
            "Badges coming soon! Keep training to unlock achievements.",
          totalMilestones: allMilestones.length,
          totalBadges: 0,
          xpHistory: xpHistory.map((xp) => ({
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
    },
  );

  // Get player profile data
  router.get(
    "/api/player/me/profile",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
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
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );

        const playerSessions = await storage.getPlayerSessionsWithDetails(
          playerId,
          ninety,
          now,
        );
        const totalSessions = playerSessions.length;
        const sessionsAttended = playerSessions.filter(
          (s) => s.attended === "present",
        ).length;

        // Task #671 — Profile stat alignment. Recompute "charged vs uncharged"
        // using the credit-engine rule so the SESSIONS stat doesn't silently
        // contradict the wallet balance for V2 academies. We resolve
        // `private_adjusted` the same way `consumeCredit` does: prefer the
        // series.session_type when there is one, fall back to "1 attendee = was
        // private" otherwise.
        let sessionsCharged = 0;
        let sessionsUncharged = 0;
        const unchargedReasons: { reason: string; count: number }[] = [];
        try {
          const { shouldChargeForAttendance } = await import(
            "../services/credit-engine"
          );

          // Pre-fetch the inputs needed to resolve `private_adjusted` for any
          // such sessions in this player's window — one query, not N.
          const adjustedSessionIds = playerSessions
            .filter((s) => (s.sessionType || "") === "private_adjusted")
            .map((s) => s.id);
          const seriesTypeBySession = new Map<string, string | null>();
          const playerCountBySession = new Map<string, number>();
          if (adjustedSessionIds.length > 0) {
            const enriched = await db.execute(sql`
              SELECT
                s.id          AS session_id,
                cs.session_type AS series_session_type,
                (SELECT COUNT(*)::int FROM session_players sp WHERE sp.session_id = s.id) AS sp_count
              FROM sessions s
              LEFT JOIN coaching_series cs ON cs.id = s.series_id
              WHERE s.id = ANY(${adjustedSessionIds}::text[])
            `);
            for (const raw of enriched.rows) {
              const r = raw as {
                session_id: string;
                series_session_type: string | null;
                sp_count: number | string;
              };
              seriesTypeBySession.set(r.session_id, r.series_session_type);
              playerCountBySession.set(r.session_id, Number(r.sp_count));
            }
          }

          const reasonCounts = new Map<string, number>();
          for (const s of playerSessions) {
            const status = (s.attendanceStatus || "").toLowerCase();
            const sessionType: string = s.sessionType || "";
            // Only count sessions that have started; future ones are noise.
            const startTime = s.startTime instanceof Date ? s.startTime : new Date(s.startTime);
            if (startTime > now) continue;
            let isOriginallyPrivate = sessionType === "private";
            if (sessionType === "private_adjusted") {
              if (s.seriesId) {
                const seriesType = seriesTypeBySession.get(s.id);
                isOriginallyPrivate = seriesType !== "semi_private";
              } else {
                isOriginallyPrivate = (playerCountBySession.get(s.id) ?? 0) <= 1;
              }
            }
            const chargeable = shouldChargeForAttendance({
              sessionType,
              attendanceStatus: status,
              isOriginallyPrivate,
            });
            if (chargeable) {
              sessionsCharged += 1;
            } else if (status) {
              sessionsUncharged += 1;
              const reasonKey =
                status === "absent" && sessionType.includes("semi")
                  ? "absent_semi_private"
                  : status === "absent"
                    ? "absent"
                    : status === "holiday"
                      ? "holiday"
                      : status;
              reasonCounts.set(reasonKey, (reasonCounts.get(reasonKey) || 0) + 1);
            }
          }
          for (const [reason, count] of Array.from(reasonCounts.entries())) {
            unchargedReasons.push({ reason, count });
          }
        } catch (e) {
          console.error("[Profile] charge-rule split failed:", e);
        }

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

        console.log(
          "[Profile API] Returning player with profilePhotoUrl:",
          (player as any).profilePhotoUrl,
        );
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
            phone: player.phone || null,
            dateOfBirth: player.dateOfBirth || null,
            dominantHand: (player as any).dominantHand || null,
            backhandType: (player as any).backhandType || null,
            tshirtSize: (player as any).tshirtSize || null,
            height: (player as any).height || null,
            bio: (player as any).bio || null,
            medicalNotes: (player as any).medicalNotes || null,
            parentEmail: (player as any).parentEmail || null,
            isAdult: (player as any).isAdult ?? false,
            preferredPlayType: (player as any).preferredPlayType || null,
            openToPlay: (player as any).openToPlay || false,
            typicalPlayTimes: (player as any).typicalPlayTimes || null,
            preferredCities: (player as any).preferredCities || null,
            matchPreference: (player as any).matchPreference || null,
            displayName: (player as any).displayName || null,
            profilePhotoUrl: (player as any).profilePhotoUrl || null,
            playStyle: (player as any).playStyle || null,
            tennisIdol: (player as any).tennisIdol || null,
            enjoymentTags: (player as any).enjoymentTags || null,
            shortTermGoal: (player as any).shortTermGoal || null,
            longTermDream: (player as any).longTermDream || null,
            quizScore: (player as any).quizScore ?? null,
            sportProfiles: (player as any).sportProfiles || null,
            homeAddress: player.homeAddress || null,
            homeLat: player.homeLat ?? null,
            homeLng: player.homeLng ?? null,
            city: (player as any).city || null,
            country: (player as any).country || null,
          },
          coach: coach
            ? {
                id: coach.id,
                name: coach.name,
                email: coach.email,
              }
            : null,
          academy: academy
            ? {
                id: academy.id,
                name: academy.name,
              }
            : null,
          stats: {
            sessionsAttended,
            sessionsTotal: totalSessions,
            sessionsCharged,
            sessionsUncharged,
            unchargedReasons,
            attendanceRate:
              totalSessions > 0
                ? Math.round((sessionsAttended / totalSessions) * 100)
                : 0,
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
    },
  );

  // Update player social profile
  router.patch(
    "/api/player/me/profile",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      if (!req.user!.playerId) {
        return res.status(400).json({ error: "No player profile found" });
      }

      try {
        const playerId = req.user!.playerId!;
        const {
          openToPlay,
          dominantHand,
          preferredPlayType,
          typicalPlayTimes,
          preferredCities,
          matchPreference,
          bio,
          displayName,
          privacyLevel,
          city,
          country,
        } = req.body;

        // Use parameterized updates for each field individually for safety
        if (typeof openToPlay === "boolean") {
          await db.execute(
            sql`UPDATE players SET open_to_play = ${openToPlay} WHERE id = ${playerId}`,
          );
        }
        if (dominantHand !== undefined) {
          await db.execute(
            sql`UPDATE players SET dominant_hand = ${dominantHand} WHERE id = ${playerId}`,
          );
        }
        if (preferredPlayType !== undefined) {
          await db.execute(
            sql`UPDATE players SET preferred_play_type = ${preferredPlayType} WHERE id = ${playerId}`,
          );
        }
        if (typicalPlayTimes !== undefined) {
          await db.execute(
            sql`UPDATE players SET typical_play_times = ${typicalPlayTimes} WHERE id = ${playerId}`,
          );
        }
        if (preferredCities !== undefined) {
          await db.execute(
            sql`UPDATE players SET preferred_cities = ${preferredCities} WHERE id = ${playerId}`,
          );
        }
        if (matchPreference !== undefined) {
          await db.execute(
            sql`UPDATE players SET match_preference = ${matchPreference} WHERE id = ${playerId}`,
          );
        }
        if (bio !== undefined) {
          await db.execute(
            sql`UPDATE players SET bio = ${bio} WHERE id = ${playerId}`,
          );
        }
        if (displayName !== undefined) {
          await db.execute(
            sql`UPDATE players SET display_name = ${displayName} WHERE id = ${playerId}`,
          );
        }
        if (privacyLevel !== undefined) {
          await db.execute(
            sql`UPDATE players SET privacy_level = ${privacyLevel} WHERE id = ${playerId}`,
          );
        }
        if (req.body.playStyle !== undefined) {
          const VALID_PLAY_STYLES = ["baseline_warrior", "net_ninja", "serve_machine", "all_court_ace", "counter_puncher", "tactical_mastermind"];
          const playStyleValue = req.body.playStyle;
          if (playStyleValue !== null && !VALID_PLAY_STYLES.includes(playStyleValue)) {
            return res.status(400).json({ error: "Invalid play style value" });
          }
          await db.execute(
            sql`UPDATE players SET play_style = ${playStyleValue} WHERE id = ${playerId}`,
          );
        }
        if (req.body.sportProfiles !== undefined) {
          const sportProfilesJson = JSON.stringify(req.body.sportProfiles);
          await db.execute(
            sql`UPDATE players SET sport_profiles = ${sportProfilesJson}::jsonb WHERE id = ${playerId}`,
          );
        }
        if (req.body.homeAddress !== undefined || req.body.homeLat !== undefined || req.body.homeLng !== undefined) {
          const homeAddress = req.body.homeAddress ?? null;
          const homeLat = req.body.homeLat ?? null;
          const homeLng = req.body.homeLng ?? null;
          await db.execute(
            sql`UPDATE players SET home_address = ${homeAddress}, home_lat = ${homeLat}, home_lng = ${homeLng} WHERE id = ${playerId}`,
          );
        }
        if (city !== undefined) {
          await db.execute(
            sql`UPDATE players SET city = ${city} WHERE id = ${playerId}`,
          );
        }
        if (country !== undefined) {
          await db.execute(
            sql`UPDATE players SET country = ${country} WHERE id = ${playerId}`,
          );
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Error updating player profile:", error);
        res.status(500).json({ error: "Failed to update player profile" });
      }
    },
  );

  // Update player personal info (self-service)
  router.patch(
    "/api/player/me/info",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      if (!req.user!.playerId) {
        return res.status(400).json({ error: "No player profile found" });
      }
      try {
        const playerId = req.user!.playerId!;
        const parseResult = playerSelfUpdateSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "Validation failed",
            details: fromZodError(parseResult.error).message,
          });
        }
        const updateData: typeof parseResult.data & { age?: number | null } = { ...parseResult.data };
        // Check nickname uniqueness using exact case-insensitive match (no wildcard risk)
        if (updateData.nickname) {
          const existingNickname = await db
            .select({ id: players.id })
            .from(players)
            .where(and(
              sql`lower(${players.nickname}) = lower(${updateData.nickname})`,
              ne(players.id, playerId),
            ))
            .limit(1);
          if (existingNickname.length > 0) {
            return res.status(409).json({
              error: "nickname_taken",
              message: "This nickname is already taken. Please choose a different one.",
            });
          }
        }
        // Recalculate age from dateOfBirth so subsequent session logic uses the correct age group
        if (updateData.dateOfBirth) {
          const birth = new Date(updateData.dateOfBirth);
          const now = new Date();
          let calculatedAge = now.getFullYear() - birth.getFullYear();
          const m = now.getMonth() - birth.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) calculatedAge--;
          updateData.age = calculatedAge >= 0 ? calculatedAge : null;
        } else if (updateData.dateOfBirth === null) {
          // DOB explicitly cleared — clear derived age too to avoid stale values
          updateData.age = null;
        }
        const updated = await storage.updatePlayer(playerId, updateData);
        // parentEmail is not in updatePlayerSchema — handle separately via raw SQL
        if (req.body.parentEmail !== undefined) {
          const parentEmailVal = req.body.parentEmail || null;
          await db.execute(
            sql`UPDATE players SET parent_email = ${parentEmailVal} WHERE id = ${playerId}`,
          );
        }
        res.json(updated);
      } catch (error) {
        console.error("Error updating player info:", error);
        res.status(500).json({ error: "Failed to update profile" });
      }
    },
  );

  // Upload player profile photo
  router.post(
    "/api/player/me/photo",
    authMiddleware,
    requirePlayerOrOwner,
    profilePhotoUpload.single("photo"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId) {
          return res.status(400).json({ error: "Player profile not found" });
        }

        if (!req.file) {
          return res.status(400).json({ error: "No photo uploaded" });
        }

        if (!req.file.buffer || req.file.buffer.length === 0) {
          return res.status(400).json({ error: "Uploaded file is empty. Please try a different photo." });
        }

        const mimeType = req.file.mimetype || "image/jpeg";
        const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
        const storagePath = `profile-photos/${playerId}-${Date.now()}.${ext}`;

        const { uploadToSupabaseWithPath } = await import("../utils/supabaseStorage");
        const photoUrl = await uploadToSupabaseWithPath(req.file.buffer, storagePath, mimeType);

        await db.execute(
          sql`UPDATE players SET profile_photo_url = ${photoUrl} WHERE id = ${playerId}`,
        );

        res.json({
          success: true,
          profilePhotoUrl: photoUrl,
          message: "Profile photo updated successfully",
        });
      } catch (error) {
        console.error("Error uploading player profile photo:", error);
        res.status(500).json({ error: "Failed to upload profile photo" });
      }
    },
  );

  // Get academy peers (other players in same academy for safe comparison)
  // Get player achievements for For You section
  router.get(
    "/api/player/me/achievements",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId) {
          return res.json({ achievements: [] });
        }

        const achievements: Array<{
          id: string;
          type: string;
          title: string;
          description: string;
          date: string;
          icon: string;
          color: string;
          value?: string;
        }> = [];

        // 1. Get earned badges from playerBadges
        const earnedBadgesResult = await db.execute(sql`
        SELECT pb.*, b.name as badge_name, b.description as badge_description, b.category as badge_icon, b.color as badge_color
        FROM player_badges pb
        LEFT JOIN badges b ON pb.badge_id = b.id
        WHERE pb.player_id = ${playerId}
        ORDER BY pb.earned_at DESC
        LIMIT 10
      `);

        for (const badge of earnedBadgesResult.rows) {
          achievements.push({
            id: `badge-${badge.id}`,
            type: "badge",
            title: String(badge.badge_name || "Badge Earned!"),
            description: String(
              badge.badge_description || "You earned a new badge",
            ),
            date: String(badge.earned_at || new Date().toISOString()),
            icon: String(badge.badge_icon || "ribbon"),
            color: String(badge.badge_color || "#E040FB"),
            value: "Badge",
          });
        }

        // 2. Get recent match wins from adultGlowMatches
        const matchWinsResult = await db.execute(sql`
        SELECT agm.*, 
               p.first_name as opponent_first, 
               p.last_name as opponent_last
        FROM adult_glow_matches agm
        LEFT JOIN players p ON agm.opponent_id = p.id
        WHERE agm.player_id = ${playerId} AND agm.did_win = true
        ORDER BY agm.match_date DESC
        LIMIT 5
      `);

        for (const match of matchWinsResult.rows) {
          const opponentName = match.opponent_first
            ? `${match.opponent_first} ${match.opponent_last?.toString().charAt(0) || ""}.`
            : "Opponent";
          const setScore = match.set_score || "Victory";
          achievements.push({
            id: `win-${match.id}`,
            type: "match_won",
            title: "Match Victory!",
            description: `Defeated ${opponentName} ${setScore}`,
            date: String(
              match.match_date || match.created_at || new Date().toISOString(),
            ),
            icon: "trophy",
            color: "#FFD700",
            value: String(setScore),
          });
        }

        // 3. Get rating changes (MMR increases)
        const ratingChangesResult = await db.execute(sql`
        SELECT agm.*, agm.mmr_change
        FROM adult_glow_matches agm
        WHERE agm.player_id = ${playerId} AND agm.mmr_change > 10
        ORDER BY agm.match_date DESC
        LIMIT 3
      `);

        for (const match of ratingChangesResult.rows) {
          const mmrChange = Number(match.mmr_change) || 0;
          if (mmrChange > 10) {
            achievements.push({
              id: `rating-${match.id}`,
              type: "rating_up",
              title: "Rating Boost!",
              description: `Your Glow Rating increased by ${Math.round(mmrChange)} points`,
              date: String(
                match.match_date ||
                  match.created_at ||
                  new Date().toISOString(),
              ),
              icon: "trending-up",
              color: "#00E5FF",
              value: `+${Math.round(mmrChange)}`,
            });
          }
        }

        // 4. Get session milestones (count of completed sessions)
        const sessionCountResult = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM session_players sp
        JOIN sessions s ON sp.session_id = s.id
        WHERE sp.player_id = ${playerId} 
        AND s.status = 'completed'
      `);

        const sessionCount = Number(sessionCountResult.rows[0]?.count) || 0;
        const milestones = [5, 10, 25, 50, 100, 200];
        for (const milestone of milestones) {
          if (sessionCount >= milestone) {
            achievements.push({
              id: `sessions-${milestone}`,
              type: "streak",
              title: `${milestone} Sessions Complete!`,
              description: `You have completed ${milestone} training sessions`,
              date: new Date().toISOString(),
              icon: "flame",
              color: "#FF6B35",
              value: `${milestone} Sessions`,
            });
          }
        }

        // 5. Get player level info
        const playerResult = await db.execute(sql`
        SELECT xp_level FROM players WHERE id = ${playerId}
      `);

        const playerLevel = Number(playerResult.rows[0]?.xp_level) || 1;
        if (playerLevel > 1) {
          achievements.push({
            id: `level-${playerLevel}`,
            type: "level_up",
            title: `Level ${playerLevel} Achieved!`,
            description: `You have reached Level ${playerLevel} - Keep climbing!`,
            date: new Date().toISOString(),
            icon: "arrow-up-circle",
            color: "#C8FF3D",
            value: `Level ${playerLevel}`,
          });
        }

        // Sort by date (newest first) and dedupe by id
        const seen = new Set<string>();
        const uniqueAchievements = achievements.filter((a) => {
          if (seen.has(a.id)) return false;
          seen.add(a.id);
          return true;
        });

        uniqueAchievements.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );

        res.json({ achievements: uniqueAchievements.slice(0, 20) });
      } catch (error) {
        console.error("Error fetching player achievements:", error);
        res.json({ achievements: [] });
      }
    },
  );

  router.get(
    "/api/player/me/peers",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
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
          .filter((p) => p.id !== playerId)
          .map((p) => ({
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
        peers.forEach((peer) => {
          const level = peer.ballLevel || "unknown";
          if (!peersByLevel[level]) peersByLevel[level] = [];
          peersByLevel[level].push(peer);
        });

        // Get players at same level for comparison
        const sameLevelPeers = peers.filter(
          (p) => p.ballLevel === player.ballLevel,
        );

        res.json({
          totalPeers: peers.length,
          peers: peers,
          sameLevelPeers: sameLevelPeers,
          peersByLevel,
          myRankAtLevel:
            sameLevelPeers.length > 0
              ? sameLevelPeers.filter(
                  (p) => (p.glowScore || 0) > (player.glowScore || 0),
                ).length + 1
              : 1,
          totalAtLevel: sameLevelPeers.length + 1,
        });
      } catch (error) {
        console.error("Error fetching peers:", error);
        res.status(500).json({ error: "Failed to fetch peers" });
      }
    },
  );

  // ============================================
  // GROUPS API - Player Social Groups System
  // ============================================

  // Get all groups for player
  router.get(
    "/api/player/groups",
    authMiddleware,
    requirePlayerOrOwner,
    requireFeatureUnlock("groups"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId!;
        const player = await storage.getPlayer(playerId);
        if (!player || !player.academyId) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Get groups player is a member of
        const memberRows = await db
          .select()
          .from(groupMembersTable)
          .where(eq(groupMembersTable.userId, req.user!.userId!));

        const myGroupIds = memberRows.map((m) => m.groupId);

        // Get academy groups (public ones player can join), optionally filtered by sport
        const groupsSport = typeof req.query.sport === "string" ? req.query.sport : null;

        const academyGroupRows = await db
          .select({
            group: communityGroupsTable,
            seriesSport: coachingSeries.sport,
          })
          .from(communityGroupsTable)
          .leftJoin(coachingSeries, eq(coachingSeries.id, communityGroupsTable.seriesId))
          .where(eq(communityGroupsTable.academyId, player.academyId));

        const filteredGroupRows = groupsSport
          ? academyGroupRows.filter(
              (row) => row.seriesSport === null || row.seriesSport === undefined || row.seriesSport === groupsSport,
            )
          : academyGroupRows;

        const groups = filteredGroupRows.map((row) => ({
          ...row.group,
          isMember: myGroupIds.includes(row.group.id),
          role: memberRows.find((m) => m.groupId === row.group.id)?.role || null,
        }));

        res.json({
          myGroups: groups.filter((g) => g.isMember),
          discover: groups.filter((g) => !g.isMember && !g.isPrivate),
        });
      } catch (error) {
        console.error("Error fetching groups:", error);
        res.status(500).json({ error: "Failed to fetch groups" });
      }
    },
  );

  // Get single group details with members
  router.get(
    "/api/player/groups/:groupId",
    authMiddleware,
    requirePlayerOrOwner,
    requireFeatureUnlock("groups"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { groupId } = req.params;
        const userId = req.user!.userId!;
        const playerId = req.user!.playerId!;

        // Get player's academy for authorization
        const player = await storage.getPlayer(playerId);
        if (!player || !player.academyId) {
          return res
            .status(403)
            .json({ error: "Player must be in an academy" });
        }

        const [group] = await db
          .select()
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
        const [membership] = await db
          .select()
          .from(groupMembersTable)

          .where(
            and(
              eq(groupMembersTable.groupId, groupId),
              eq(groupMembersTable.userId, userId),
            ),
          );

        // For private groups, only members can see details
        if (group.isPrivate && !membership) {
          return res.status(403).json({ error: "This is a private group" });
        }

        // Get all members with user details + player profile photo
        const membersData = await db
          .select({
            member: groupMembersTable,
            user: users,
            playerPhoto: players.profilePhotoUrl,
            playerName: players.name,
          })
          .from(groupMembersTable)
          .leftJoin(users, eq(groupMembersTable.userId, users.id))
          .leftJoin(players, eq(players.id, users.playerId))
          .where(eq(groupMembersTable.groupId, groupId));

        const members = membersData.map((m) => ({
          id: m.member.id,
          userId: m.member.userId,
          name: m.playerName || m.user?.email?.split("@")[0] || "Unknown",
          role: m.member.role,
          joinedAt: m.member.joinedAt,
          avatarUrl: m.playerPhoto || null,
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
    },
  );

  // Get group feed (posts within group)
  router.get(
    "/api/player/groups/:groupId/feed",
    authMiddleware,
    requirePlayerOrOwner,
    requireFeatureUnlock("groups"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { groupId } = req.params;
        const userId = req.user!.userId!;

        // Verify membership
        const [membership] = await db
          .select()
          .from(groupMembersTable)

          .where(
            and(
              eq(groupMembersTable.groupId, groupId),
              eq(groupMembersTable.userId, userId),
            ),
          );

        if (!membership) {
          return res.status(403).json({ error: "Not a member of this group" });
        }

        // Get posts in this group
        const groupPosts = await db
          .select()
          .from(postsTable)
          .where(eq(postsTable.groupId, groupId))
          .orderBy(desc(postsTable.createdAt))
          .limit(50);

        // Add author info + per-user reaction state
        const postsWithAuthor = await Promise.all(
          groupPosts.map(async (post) => {
            const [author] = await db
              .select()
              .from(users)
              .where(eq(users.id, post.authorId));
            let authorName = author?.email?.split("@")[0] || "Unknown";
            if (author?.playerId) {
              const [player] = await db
                .select({ name: players.name })
                .from(players)
                .where(eq(players.id, author.playerId));
              if (player?.name) authorName = player.name;
            }
            const [myReaction] = await db
              .select({ reactionType: postReactionsTable.reactionType })
              .from(postReactionsTable)
              .where(
                and(
                  eq(postReactionsTable.postId, post.id),
                  eq(postReactionsTable.userId, userId),
                ),
              );
            return {
              ...post,
              authorName,
              userReaction: myReaction?.reactionType || null,
            };
          }),
        );

        res.json({ posts: postsWithAuthor });
      } catch (error) {
        console.error("Error fetching group feed:", error);
        res.status(500).json({ error: "Failed to fetch group feed" });
      }
    },
  );

  // Join a group
  router.post(
    "/api/player/groups/:groupId/join",
    authMiddleware,
    requirePlayerOrOwner,
    requireFeatureUnlock("groups"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { groupId } = req.params;
        const userId = req.user!.userId!;
        const playerId = req.user!.playerId!;

        // Get player's academy for authorization
        const player = await storage.getPlayer(playerId);
        if (!player || !player.academyId) {
          return res
            .status(403)
            .json({ error: "Player must be in an academy" });
        }

        const [group] = await db
          .select()
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
          return res
            .status(403)
            .json({
              error: "This is a private group. You need an invitation to join.",
            });
        }

        // Check if already a member
        const [existing] = await db
          .select()
          .from(groupMembersTable)

          .where(
            and(
              eq(groupMembersTable.groupId, groupId),
              eq(groupMembersTable.userId, userId),
            ),
          );

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
        await db
          .update(communityGroupsTable)
          .set({ memberCount: sql`${communityGroupsTable.memberCount} + 1` })
          .where(eq(communityGroupsTable.id, groupId));

        res.json({ success: true, message: "Joined group" });
      } catch (error) {
        console.error("Error joining group:", error);
        res.status(500).json({ error: "Failed to join group" });
      }
    },
  );

  // Leave a group
  router.post(
    "/api/player/groups/:groupId/leave",
    authMiddleware,
    requirePlayerOrOwner,
    requireFeatureUnlock("groups"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { groupId } = req.params;
        const userId = req.user!.userId!;

        // Check if member
        const [membership] = await db
          .select()
          .from(groupMembersTable)

          .where(
            and(
              eq(groupMembersTable.groupId, groupId),
              eq(groupMembersTable.userId, userId),
            ),
          );

        if (!membership) {
          return res.status(400).json({ error: "Not a member" });
        }

        // Admin cannot leave (must transfer ownership first)
        if (membership.role === "admin") {
          return res
            .status(400)
            .json({ error: "Admins must transfer ownership before leaving" });
        }

        // Leave the group
        await db
          .delete(groupMembersTable)

          .where(
            and(
              eq(groupMembersTable.groupId, groupId),
              eq(groupMembersTable.userId, userId),
            ),
          );

        // Update member count
        await db
          .update(communityGroupsTable)
          .set({ memberCount: sql`${communityGroupsTable.memberCount} - 1` })
          .where(eq(communityGroupsTable.id, groupId));

        res.json({ success: true, message: "Left group" });
      } catch (error) {
        console.error("Error leaving group:", error);
        res.status(500).json({ error: "Failed to leave group" });
      }
    },
  );

  // Get member-add suggestions (academy players + friends not already in group)
  router.get(
    "/api/player/groups/:groupId/member-suggestions",
    authMiddleware,
    requirePlayerOrOwner,
    requireFeatureUnlock("groups"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { groupId } = req.params;
        const userId = req.user!.userId!;
        const playerId = req.user!.playerId!;

        // Must be admin of the group
        const [membership] = await db
          .select()
          .from(groupMembersTable)
          .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)));
        if (!membership || membership.role !== "admin") {
          return res.status(403).json({ error: "Only group admins can view member suggestions" });
        }

        const player = await storage.getPlayer(playerId);
        if (!player || !player.academyId) {
          return res.status(400).json({ error: "Player must be in an academy" });
        }

        // Get all current member userIds for exclusion
        const currentMembers = await db
          .select({ userId: groupMembersTable.userId })
          .from(groupMembersTable)
          .where(eq(groupMembersTable.groupId, groupId));
        const memberUserIds = currentMembers.map((m) => m.userId);

        // Get accepted friend connections for this player
        const friendConns = await db
          .select({
            player1Id: playerConnections.player1Id,
            player2Id: playerConnections.player2Id,
          })
          .from(playerConnections)
          .where(
            and(
              eq(playerConnections.status, "accepted"),
              or(
                eq(playerConnections.player1Id, playerId),
                eq(playerConnections.player2Id, playerId),
              ),
            ),
          );
        const friendPlayerIds = friendConns.map((c) =>
          c.player1Id === playerId ? c.player2Id : c.player1Id,
        );

        // Resolve friend playerIds → users (who are not already members)
        const friendUsers = friendPlayerIds.length > 0
          ? await db
              .select({
                userId: users.id,
                name: players.name,
                avatarUrl: players.profilePhotoUrl,
              })
              .from(players)
              .innerJoin(users, eq(users.playerId, players.id))
              .where(inArray(players.id, friendPlayerIds))
          : [];

        // Academy players not already members (excluding self)
        const academyUsers = await db
          .select({
            userId: users.id,
            name: players.name,
            avatarUrl: players.profilePhotoUrl,
          })
          .from(players)
          .innerJoin(users, eq(users.playerId, players.id))
          .where(
            and(
              eq(players.academyId, player.academyId),
              ne(players.id, playerId),
            ),
          )
          .limit(60);

        // Filter out existing members and cap total to 50 (friends have priority)
        const notMember = (u: { userId: string }) => !memberUserIds.includes(u.userId);
        const friends = friendUsers.filter(notMember).slice(0, 50);
        const friendUserIds = new Set(friends.map((f) => f.userId));
        const academy = academyUsers
          .filter((u) => notMember(u) && !friendUserIds.has(u.userId))
          .slice(0, 50 - friends.length);

        res.json({ friends, academy });
      } catch (error) {
        console.error("Error fetching member suggestions:", error);
        res.status(500).json({ error: "Failed to fetch suggestions" });
      }
    },
  );

  // Admin adds a player to the group directly
  router.post(
    "/api/player/groups/:groupId/members",
    authMiddleware,
    requirePlayerOrOwner,
    requireFeatureUnlock("groups"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { groupId } = req.params;
        const { userId: targetUserId } = req.body;
        const userId = req.user!.userId!;

        if (!targetUserId) {
          return res.status(400).json({ error: "userId is required" });
        }

        // Must be admin
        const [membership] = await db
          .select()
          .from(groupMembersTable)
          .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)));
        if (!membership || membership.role !== "admin") {
          return res.status(403).json({ error: "Only group admins can add members" });
        }

        // Fetch the group to validate academy membership
        const [group] = await db
          .select()
          .from(communityGroupsTable)
          .where(eq(communityGroupsTable.id, groupId));
        if (!group) {
          return res.status(404).json({ error: "Group not found" });
        }

        // Validate target user belongs to the same academy
        const [adminPlayer] = await db
          .select({ academyId: players.academyId })
          .from(players)
          .innerJoin(users, eq(users.playerId, players.id))
          .where(eq(users.id, userId));

        const [targetPlayer] = await db
          .select({ academyId: players.academyId })
          .from(players)
          .innerJoin(users, eq(users.playerId, players.id))
          .where(eq(users.id, targetUserId));

        if (!targetPlayer || targetPlayer.academyId !== group.academyId) {
          return res.status(400).json({ error: "Player is not in the same academy as this group" });
        }

        // Check if target already a member
        const [existing] = await db
          .select()
          .from(groupMembersTable)
          .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, targetUserId)));
        if (existing) {
          return res.status(409).json({ error: "Player is already a member" });
        }

        await db.insert(groupMembersTable).values({
          groupId,
          userId: targetUserId,
          role: "member",
        });

        await db
          .update(communityGroupsTable)
          .set({ memberCount: sql`${communityGroupsTable.memberCount} + 1` })
          .where(eq(communityGroupsTable.id, groupId));

        res.json({ success: true });
      } catch (error) {
        console.error("Error adding group member:", error);
        res.status(500).json({ error: "Failed to add member" });
      }
    },
  );

  // Create a new group (player-created groups)
  router.post(
    "/api/player/groups",
    authMiddleware,
    requirePlayerOrOwner,
    requireFeatureUnlock("groups"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.userId!;
        const playerId = req.user!.playerId!;
        const player = await storage.getPlayer(playerId);

        if (!player || !player.academyId) {
          return res
            .status(400)
            .json({ error: "Player must be in an academy to create groups" });
        }

        const {
          name,
          description,
          type = "friends",
          isPrivate = false,
        } = req.body;

        if (!name || name.trim().length < 2) {
          return res
            .status(400)
            .json({ error: "Group name must be at least 2 characters" });
        }

        const [newGroup] = await db
          .insert(communityGroupsTable)
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
    },
  );

  // ============ GROUP EVENTS API ============

  // Get events for a group
  router.get(
    "/api/player/groups/:groupId/events",
    authMiddleware,
    requirePlayerOrOwner,
    requireFeatureUnlock("groups"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { groupId } = req.params;
        const userId = req.user!.userId!;

        // Verify membership
        const [membership] = await db.select().from(groupMembersTable)
          .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)));

        if (!membership) {
          return res.status(403).json({ error: "Not a member of this group" });
        }

        const events = await db.select().from(groupEventsTable)
          .where(eq(groupEventsTable.groupId, groupId))
          .orderBy(asc(groupEventsTable.eventDate));

        // Enrich with RSVP counts and going-avatars
        const enriched = await Promise.all(events.map(async (event) => {
          const rsvps = await db.select({
            userId: groupEventRsvpsTable.userId,
            status: groupEventRsvpsTable.status,
          }).from(groupEventRsvpsTable)
            .where(eq(groupEventRsvpsTable.eventId, event.id));

          const goingCount = rsvps.filter(r => r.status === "going").length;
          const maybeCount = rsvps.filter(r => r.status === "maybe").length;
          const notGoingCount = rsvps.filter(r => r.status === "not_going").length;

          const myRsvp = rsvps.find(r => r.userId === userId);

          // Get avatars of going users (up to 5)
          const goingUserIds = rsvps.filter(r => r.status === "going").slice(0, 5).map(r => r.userId);
          const goingAvatars = await Promise.all(goingUserIds.map(async (uid) => {
            const [userData] = await db.select({ name: players.name, photo: players.profilePhotoUrl })
              .from(users).leftJoin(players, eq(users.playerId, players.id)).where(eq(users.id, uid));
            return { name: userData?.name || "?", avatarUrl: userData?.photo || null };
          }));

          return {
            ...event,
            goingCount,
            maybeCount,
            notGoingCount,
            myRsvpStatus: myRsvp?.status || null,
            goingAvatars,
          };
        }));

        res.json(enriched);
      } catch (error) {
        console.error("Error fetching group events:", error);
        res.status(500).json({ error: "Failed to fetch events" });
      }
    },
  );

  // Create a group event
  router.post(
    "/api/player/groups/:groupId/events",
    authMiddleware,
    requirePlayerOrOwner,
    requireFeatureUnlock("groups"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { groupId } = req.params;
        const userId = req.user!.userId!;
        const playerId = req.user!.playerId!;

        // Verify membership
        const [membership] = await db.select().from(groupMembersTable)
          .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)));

        if (!membership) {
          return res.status(403).json({ error: "Not a member of this group" });
        }

        const { eventType, title, description, location, sport, eventDate, maxPlayers, opponentUserId, wager, wagerCurrency } = req.body;

        if (!title || !eventDate) {
          return res.status(400).json({ error: "title and eventDate are required" });
        }

        if (wager !== undefined && wager !== null) {
          const wagerNum = Number(wager);
          if (isNaN(wagerNum) || wagerNum < 0 || wagerNum > 1000000) {
            return res.status(400).json({ error: "wager must be a non-negative number up to 1,000,000" });
          }
        }

        // Match events always require an opponent — challenge is auto-created
        if (eventType === "match" && !opponentUserId) {
          return res.status(400).json({ error: "opponentUserId is required for match events" });
        }

        let matchChallengeId: string | null = null;

        // For match type: auto-create a match challenge (opponent guaranteed by check above)
        if (eventType === "match" && opponentUserId) {
          // Validate opponent is a member of this group
          const [opponentMembership] = await db.select().from(groupMembersTable)
            .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, opponentUserId)));
          if (!opponentMembership) {
            return res.status(400).json({ error: "Opponent must be a member of this group" });
          }
          try {
            const player = await storage.getPlayer(playerId);
            const [opponentUser] = await db.select({ playerId: users.playerId }).from(users).where(eq(users.id, opponentUserId));
            if (opponentUser?.playerId && player) {
              const insertResult = await db.execute(
                sql`INSERT INTO match_challenges (id, challenger_id, opponent_id, academy_id, match_type, match_format, match_date, match_time, status, created_at, updated_at)
                    VALUES (gen_random_uuid(), ${playerId}, ${opponentUser.playerId}, ${player.academyId}, 'singles', 'friendly', ${eventDate.split("T")[0]}, ${eventDate.split("T")[1]?.substring(0, 5) || "10:00"}, 'pending', NOW(), NOW())
                    RETURNING id`
              );
              const row = insertResult.rows[0];
              matchChallengeId = (row && typeof row === "object" && "id" in row) ? String(row.id) : null;
            }
          } catch (mcErr) {
            console.error("[GroupEvent] Failed to create match challenge (non-fatal):", mcErr);
          }
        }

        const [newEvent] = await db.insert(groupEventsTable).values({
          groupId,
          creatorId: userId,
          eventType: eventType || "social",
          title: title.trim(),
          description: description?.trim() || null,
          location: location?.trim() || null,
          sport: sport || null,
          eventDate: new Date(eventDate),
          maxPlayers: maxPlayers || null,
          opponentUserId: opponentUserId || null,
          matchChallengeId,
          wager: wager != null ? String(Number(wager)) : null,
          wagerCurrency: wagerCurrency || "AED",
        }).returning();

        // Auto-RSVP creator as going
        await db.insert(groupEventRsvpsTable).values({
          eventId: newEvent.id,
          userId,
          status: "going",
        }).onConflictDoNothing();

        // Notify all group members
        try {
          const allMembers = await db.select().from(groupMembersTable)
            .where(eq(groupMembersTable.groupId, groupId));
          const otherMemberUserIds = allMembers.filter(m => m.userId !== userId).map(m => m.userId);

          for (const memberUserId of otherMemberUserIds) {
            const [memberUser] = await db.select().from(users).where(eq(users.id, memberUserId));
            if (memberUser?.playerId) {
              await db.insert(playerNotifications).values({
                playerId: memberUser.playerId,
                title: "New Event in Your Group",
                body: `${title.trim()} — tap to RSVP`,
                type: "group_event",
                data: { groupId, eventId: newEvent.id },
              }).catch(() => {});

              const tokens = await getPlayerPushTokens(memberUser.playerId);
              if (tokens.length > 0) {
                await sendPushNotification(tokens, "New Event in Your Group", `${title.trim()} — tap to RSVP`, { type: "group_event", groupId, eventId: newEvent.id }, memberUser.playerId).catch(() => {});
              }
            }
          }
        } catch (notifErr) {
          console.error("[GroupEvent] Failed to send member notifications:", notifErr);
        }

        res.status(201).json(newEvent);
      } catch (error) {
        console.error("Error creating group event:", error);
        res.status(500).json({ error: "Failed to create event" });
      }
    },
  );

  // RSVP to a group event (upsert)
  router.post(
    "/api/player/groups/:groupId/events/:eventId/rsvp",
    authMiddleware,
    requirePlayerOrOwner,
    requireFeatureUnlock("groups"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { groupId, eventId } = req.params;
        const userId = req.user!.userId!;
        const playerId = req.user!.playerId!;
        const { status } = req.body;

        if (!["going", "maybe", "not_going"].includes(status)) {
          return res.status(400).json({ error: "status must be going, maybe, or not_going" });
        }

        // Verify membership
        const [membership] = await db.select().from(groupMembersTable)
          .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)));

        if (!membership) {
          return res.status(403).json({ error: "Not a member of this group" });
        }

        // Verify event belongs to this group (IDOR protection)
        const [event] = await db.select().from(groupEventsTable)
          .where(and(eq(groupEventsTable.id, eventId), eq(groupEventsTable.groupId, groupId)));
        if (!event) {
          return res.status(404).json({ error: "Event not found in this group" });
        }

        // Upsert RSVP
        const [rsvp] = await db.insert(groupEventRsvpsTable).values({
          eventId,
          userId,
          status,
        }).onConflictDoUpdate({
          target: [groupEventRsvpsTable.eventId, groupEventRsvpsTable.userId],
          set: { status, updatedAt: new Date() },
        }).returning();

        // Notify event creator (in-app + push) on any RSVP status change
        try {
          if (event.creatorId !== userId) {
            const [creatorUser] = await db.select().from(users).where(eq(users.id, event.creatorId));
            if (creatorUser?.playerId) {
              const [player] = await db.select({ name: players.name }).from(players).where(eq(players.id, playerId));
              const playerName = player?.name || "Someone";
              const notifTitle = status === "going" ? "Someone is coming!"
                : status === "maybe" ? "Maybe attending"
                : "RSVP update";
              const notifBody = status === "going"
                ? `${playerName} is going to your event: ${event.title}`
                : status === "maybe"
                ? `${playerName} might attend your event: ${event.title}`
                : `${playerName} can't make it to your event: ${event.title}`;
              await db.insert(playerNotifications).values({
                playerId: creatorUser.playerId,
                title: notifTitle,
                body: notifBody,
                type: "group_event_rsvp",
                data: { groupId, eventId },
              }).catch(() => {});
              const tokens = await getPlayerPushTokens(creatorUser.playerId);
              if (tokens.length > 0) {
                sendPushNotification(tokens, notifTitle, notifBody, { screen: "GroupDetail", groupId }).catch(() => {});
              }
            }
          }
        } catch (notifErr) {
          console.error("[GroupEvent] RSVP notification error:", notifErr);
        }

        res.json(rsvp);
      } catch (error) {
        console.error("Error RSVPing to group event:", error);
        res.status(500).json({ error: "Failed to RSVP" });
      }
    },
  );

  // Get attendees for a group event (all RSVPs with user details)
  router.get(
    "/api/player/groups/:groupId/events/:eventId/attendees",
    authMiddleware,
    requirePlayerOrOwner,
    requireFeatureUnlock("groups"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { groupId, eventId } = req.params;
        const userId = req.user!.userId!;

        // Verify membership
        const [membership] = await db.select().from(groupMembersTable)
          .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)));
        if (!membership) {
          return res.status(403).json({ error: "Not a member of this group" });
        }

        // Verify event belongs to group
        const [event] = await db.select().from(groupEventsTable)
          .where(and(eq(groupEventsTable.id, eventId), eq(groupEventsTable.groupId, groupId)));
        if (!event) {
          return res.status(404).json({ error: "Event not found" });
        }

        // Get all RSVPs with user info in a single joined query
        const rsvpsWithUsers = await db
          .select({
            userId: groupEventRsvpsTable.userId,
            status: groupEventRsvpsTable.status,
            name: players.name,
            photo: players.profilePhotoUrl,
          })
          .from(groupEventRsvpsTable)
          .leftJoin(users, eq(groupEventRsvpsTable.userId, users.id))
          .leftJoin(players, eq(users.playerId, players.id))
          .where(eq(groupEventRsvpsTable.eventId, eventId));

        const enriched = rsvpsWithUsers.map(r => ({
          userId: r.userId,
          status: r.status,
          name: r.name || "Unknown",
          avatarUrl: r.photo || null,
        }));

        res.json({
          going: enriched.filter(a => a.status === "going"),
          maybe: enriched.filter(a => a.status === "maybe"),
          notGoing: enriched.filter(a => a.status === "not_going"),
        });
      } catch (error) {
        console.error("Error fetching event attendees:", error);
        res.status(500).json({ error: "Failed to fetch attendees" });
      }
    },
  );

  // Update a group event (creator or admin only)
  router.patch(
    "/api/player/groups/:groupId/events/:eventId",
    authMiddleware,
    requirePlayerOrOwner,
    requireFeatureUnlock("groups"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { groupId, eventId } = req.params;
        const userId = req.user!.userId!;

        // Verify event belongs to this group (IDOR protection)
        const [event] = await db.select().from(groupEventsTable)
          .where(and(eq(groupEventsTable.id, eventId), eq(groupEventsTable.groupId, groupId)));
        if (!event) return res.status(404).json({ error: "Event not found in this group" });

        const [membership] = await db.select().from(groupMembersTable)
          .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)));
        if (!membership || (event.creatorId !== userId && membership.role !== "admin")) {
          return res.status(403).json({ error: "Not authorized to edit this event" });
        }

        const { title, description, location, sport, eventDate, maxPlayers, wager, wagerCurrency } = req.body;

        if (wager !== undefined && wager !== null) {
          const wagerNum = Number(wager);
          if (isNaN(wagerNum) || wagerNum < 0 || wagerNum > 1000000) {
            return res.status(400).json({ error: "wager must be a non-negative number up to 1,000,000" });
          }
        }

        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (title !== undefined) updates.title = title.trim();
        if (description !== undefined) updates.description = description?.trim() || null;
        if (location !== undefined) updates.location = location?.trim() || null;
        if (sport !== undefined) updates.sport = sport || null;
        if (eventDate !== undefined) updates.eventDate = new Date(eventDate);
        if (maxPlayers !== undefined) updates.maxPlayers = maxPlayers || null;
        if (wager !== undefined) updates.wager = wager != null ? String(Number(wager)) : null;
        if (wagerCurrency !== undefined) updates.wagerCurrency = wagerCurrency || "AED";

        const [updated] = await db.update(groupEventsTable)
          .set(updates)
          .where(eq(groupEventsTable.id, eventId))
          .returning();

        res.json(updated);
      } catch (error) {
        console.error("Error updating group event:", error);
        res.status(500).json({ error: "Failed to update event" });
      }
    },
  );

  // Delete a group event (creator or admin only)
  router.delete(
    "/api/player/groups/:groupId/events/:eventId",
    authMiddleware,
    requirePlayerOrOwner,
    requireFeatureUnlock("groups"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { groupId, eventId } = req.params;
        const userId = req.user!.userId!;

        // Verify event belongs to this group (IDOR protection)
        const [event] = await db.select().from(groupEventsTable)
          .where(and(eq(groupEventsTable.id, eventId), eq(groupEventsTable.groupId, groupId)));
        if (!event) return res.status(404).json({ error: "Event not found in this group" });

        const [membership] = await db.select().from(groupMembersTable)
          .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)));

        if (!membership || (event.creatorId !== userId && membership.role !== "admin")) {
          return res.status(403).json({ error: "Not authorized to delete this event" });
        }

        await db.delete(groupEventRsvpsTable).where(eq(groupEventRsvpsTable.eventId, eventId));
        await db.delete(groupEventsTable).where(eq(groupEventsTable.id, eventId));

        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting group event:", error);
        res.status(500).json({ error: "Failed to delete event" });
      }
    },
  );

  // ============ END GROUP EVENTS API ============

  // Get courts for player's academy (used in match wizard court picker)
  router.get(
    "/api/player/courts",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        if (!academyId) {
          return res.json([]);
        }
        const allCourts = await storage.getAllCourts(academyId);
        const activeCourts = allCourts.filter((c) => c.isActive !== false);
        res.json(activeCourts);
      } catch (error) {
        console.error("Error fetching player courts:", error);
        res.status(500).json({ error: "Failed to fetch courts" });
      }
    },
  );

  // Save player onboarding data
  router.post(
    "/api/player/me/onboarding",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        let playerId = req.user!.playerId;
        let newPlayerCreated = false;
        const {
          academyId,
          motivationType,
          dateOfBirth,
          ballLevel,
          height,
          tshirtSize,
          dominantHand,
          backhandType,
          experienceLevel,
          enjoymentTags,
          focusGoals,
          selfConfidenceFlags,
          gender,
          parentEmail,
          typicalPlayTimes,
          tennisIdol,
          shortTermGoal,
          longTermDream,
          quizScore,
        } = req.body;

        // Academy selection is now optional - players can skip it
        let selectedAcademyId = academyId || null;

        // If academyId provided, verify it exists
        if (selectedAcademyId) {
          const academy = await storage.getAcademy(selectedAcademyId);
          if (!academy) {
            return res
              .status(400)
              .json({ error: "Selected academy not found" });
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
            ballLevel: ballLevel || "green",
            academyId: selectedAcademyId,
            coachId: null,
          });

          playerId = newPlayer.id;
          newPlayerCreated = true;

          // Link the player to the user account and update their academy
          await storage.updateUser(user.id, {
            playerId: newPlayer.id,
            academyId: selectedAcademyId,
          });
        }

        // Build sportProfiles from onboarding: merge selected sports + ball level for tennis
        type SportProfileEntry = { ballLevel?: string | null; skillLevel?: number | null };
        type SportProfilesMap = Record<string, SportProfileEntry>;
        const existingPlayer = await storage.getPlayer(playerId);
        const existingSportProfiles: SportProfilesMap = (existingPlayer as { sportProfiles?: SportProfilesMap | null })?.sportProfiles ?? {};
        // Start with selected sports from request body (e.g. tennis, padel, pickleball)
        const rawBodyProfiles = req.body.sportProfiles;
        const selectedSports: SportProfilesMap = (rawBodyProfiles && typeof rawBodyProfiles === "object" && !Array.isArray(rawBodyProfiles))
          ? (rawBodyProfiles as SportProfilesMap)
          : {};
        const mergedSportProfiles: SportProfilesMap = { ...existingSportProfiles, ...selectedSports };
        // Only inject ballLevel into tennis profile when tennis is among the user's selected sports
        const userSelectedTennis = "tennis" in mergedSportProfiles;
        const updatedSportProfiles = (ballLevel && userSelectedTennis)
          ? { ...mergedSportProfiles, tennis: { ...(mergedSportProfiles.tennis || {}), ballLevel } }
          : mergedSportProfiles;

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
          ballLevel,
          selfConfidenceFlags,
          gender: gender || null,
          parentEmail: parentEmail || null,
          typicalPlayTimes: Array.isArray(typicalPlayTimes) ? typicalPlayTimes : undefined,
          tennisIdol: tennisIdol || null,
          shortTermGoal: shortTermGoal || null,
          longTermDream: longTermDream || null,
          quizScore: typeof quizScore === "number" ? quizScore : undefined,
          sportProfiles: Object.keys(updatedSportProfiles).length > 0 ? updatedSportProfiles : undefined,
          playStyle: (() => {
            const VALID_PLAY_STYLES = ["baseline_warrior", "net_ninja", "serve_machine", "all_court_ace", "counter_puncher", "tactical_mastermind"];
            const ps = req.body.playStyle;
            return ps && VALID_PLAY_STYLES.includes(ps) ? ps : null;
          })(),
        });

        // If a new player was created, generate a fresh token with the new playerId
        // This ensures the frontend can immediately use the new playerId without re-login
        let token: string | undefined;
        let refreshToken: string | undefined;
        if (newPlayerCreated) {
          const user = await storage.getUser(req.user!.id);
          if (user) {
            const onboardingJwtPayload = {
              userId: user.id,
              email: user.email,
              role: user.role,
              academyId: user.academyId,
              coachId: user.coachId,
              playerId: playerId,
            };
            token = generateToken(onboardingJwtPayload);
            refreshToken = generateRefreshToken(onboardingJwtPayload);
          }
        }

        res.json({
          success: true,
          player: updatedPlayer,
          playerId,
          token, // Include fresh token if player was just created
          refreshToken,
        });
      } catch (error) {
        console.error("Error saving onboarding:", error);
        res.status(500).json({ error: "Failed to save onboarding data" });
      }
    },
  );

  // Save coach onboarding data
  router.post(
    "/api/coach/me/onboarding",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        if (!coachId) {
          return res.status(403).json({ error: "Coach account required" });
        }

        const {
          yearsExperience,
          backgroundTags,
          philosophyTags,
          acknowledgements,
          publicQuote,
        } = req.body;

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
    },
  );

  // Get coach profile (for onboarding status)
  router.get(
    "/api/coach/me/profile",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Get pending coach bios for review (Platform Owner only)
  router.get(
    "/api/platform/pending-bios",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const allCoaches = await storage.getAllCoaches();
        const pendingBios = allCoaches.filter(
          (coach: any) => coach.bioStatus === "pending_approval",
        );

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
          }),
        );

        res.json({ pendingBios: enrichedBios });
      } catch (error) {
        console.error("Error fetching pending bios:", error);
        res.status(500).json({ error: "Failed to fetch pending bios" });
      }
    },
  );

  // Approve or reject coach bio (Platform Owner only)
  router.post(
    "/api/platform/review-bio/:coachId",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { coachId } = req.params;
        const { action, rejectionReason } = req.body;

        if (!["approve", "reject"].includes(action)) {
          return res
            .status(400)
            .json({ error: "Invalid action. Use 'approve' or 'reject'" });
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
    },
  );

  // Get player recognition (badges, achievements, validations)
  router.get(
    "/api/player/me/recognition",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
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
          new Date(),
        );

        const attendedSessions = sessions.filter(
          (s) => s.attended === "present",
        ).length;

        // Calculate achievements
        const achievements = [
          {
            id: "first_session",
            name: "First Steps",
            description: "Complete your first training session",
            icon: "footsteps",
            color: "#2ECC40",
            earned: attendedSessions >= 1,
            earnedAt:
              attendedSessions >= 1
                ? sessions[0]?.startTime?.toISOString()
                : null,
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
            earnedAt:
              (player.level || 1) >= 5 ? new Date().toISOString() : null,
          },
          {
            id: "level_10",
            name: "Advanced Player",
            description: "Reach level 10",
            icon: "diamond",
            color: "#E040FB",
            earned: (player.level || 1) >= 10,
            earnedAt:
              (player.level || 1) >= 10 ? new Date().toISOString() : null,
          },
        ];

        // Domain mastery badges
        const domainBadges = domains.map((domain) => {
          const state = skillStates.find((s) => s.domainId === domain.id);
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
          .filter(
            (s) =>
              s.assessmentStatus === "meets" || s.assessmentStatus === "above",
          )
          .map((s) => {
            const domain = domains.find((d) => d.id === s.domainId);
            return {
              id: `validation_${s.domainId}`,
              type: "coach_validation",
              domain: domain?.displayName || "Skill",
              status: s.assessmentStatus,
              validatedAt: s.updatedAt,
            };
          });

        const earnedAchievements = achievements.filter((a) => a.earned);
        const earnedDomainBadges = domainBadges.filter((b) => b.earned);

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
    },
  );

  // Get player training history for training tab
  router.get(
    "/api/player/training-history",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        // Return empty training history for users without player profile
        if (!req.user!.playerId) {
          return res.json({ friends: [], pendingRequests: [] });
        }
        const playerId = req.user!.playerId!;

        const sessions = await storage.getPlayerSessionsWithDetails(
          playerId,
          new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          new Date(),
        );

        const trainingHistory = sessions
          .filter((s) => s.attendanceStatus === "present" || s.attendanceStatus === "late" || s.attendanceStatus === null)
          .map((s) => {
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
          .sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          );

        res.json(trainingHistory);
      } catch (error) {
        console.error("Error fetching training history:", error);
        res.status(500).json({ error: "Failed to fetch training history" });
      }
    },
  );

  // Get single training session detail
  router.get(
    "/api/player/training/:sessionId",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
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
          futureDate,
        );

        const sessionData = sessions.find((s) => s.id === sessionId);
        if (!sessionData) {
          return res.status(404).json({ error: "Session not found" });
        }

        const domains = await storage.listSkillDomains();

        let trainingType = sessionData.sessionType || "training";
        if (
          sessionData.sessionType === "private_adjusted" &&
          (sessionData.attendanceStatus || "").toLowerCase() === "absent"
        ) {
          trainingType = "semi_private";
        }
        res.json({
          id: sessionData.id,
          date: sessionData.startTime,
          type: trainingType,
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
    },
  );

  // Get skill details for a specific domain
  router.get(
    "/api/player/skills/:domain",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        // Return not found for users without player profile
        if (!req.user!.playerId) {
          return res.status(404).json({ error: "No player profile found" });
        }
        const playerId = req.user!.playerId!;
        const { domain: domainId } = req.params;

        const domains = await storage.listSkillDomains();
        const targetDomain = domains.find((d) => d.id === domainId);
        if (!targetDomain) {
          return res.status(404).json({ error: "Domain not found" });
        }

        const skillStates = await storage.getPlayerSkillStates(playerId);
        const domainState = skillStates.find((s) => s.domainId === domainId);

        const allTrends = await storage.getPlayerObservationTrends(
          playerId,
          30,
        );
        const domainTrend = allTrends.find((t) => t.domainId === domainId);
        const historyItems = domainTrend?.history || [];

        const skills = [
          {
            id: `${domainId}_1`,
            name: `${targetDomain.displayName} Fundamentals`,
            progress: domainState?.progressValue || 50,
            status:
              domainState?.momentum === "improving" ? "improving" : "stable",
            recentImpact: historyItems.slice(0, 3).map((h) => ({
              session: "Training Session",
              change: h.delta || 0,
              date: h.date || "Recent",
            })),
            suggestions: [
              "Complete more sessions in this domain",
              "Focus on consistent practice",
            ],
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
    },
  );

  // Get peer journey snapshot
  router.get(
    "/api/player/peers/:peerId/journey",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
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

        const domainComparison = domains.map((d) => {
          const peerState = peerSkillStates.find((s) => s.domainId === d.id);
          const myState = mySkillStates.find((s) => s.domainId === d.id);
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
            {
              id: "1",
              type: "level_up",
              title: `Reached Level ${peer.level || 1}`,
              date: "Recently",
            },
          ],
          domains: domainComparison,
        });
      } catch (error) {
        console.error("Error fetching peer journey:", error);
        res.status(500).json({ error: "Failed to fetch peer journey" });
      }
    },
  );

  // Get group challenges (V2 placeholder)
  router.get(
    "/api/player/challenges",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        // Return empty challenges for users without player profile
        if (!req.user!.playerId) {
          return res.json({ friends: [], pendingRequests: [] });
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
    },
  );

  // Player Chat routes - extracted to server/routes/player-chat.ts
  // Academy Owner - Get schedule/operations data
  router.get(
    "/api/owner/operations",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        const period = (req.query.period as string) || "day";

        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        // Calculate date range based on period
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
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
        } else {
          // month
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          endDate.setHours(23, 59, 59, 999);
        }

        // Get courts
        const dbCourts = await storage.getAllCourts(academyId);

        // Get sessions for the period
        const allSessions = await storage.getAllSessions(academyId);
        const periodSessions = allSessions.filter((session) => {
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
        const courtSchedule = dbCourts.map((court) => {
          const sessions = courtSessionsMap[court.id] || [];
          return {
            name: court.name,
            sessions: sessions.map((s) => ({
              time: s.time || "TBD",
              coach: s.coachName || "Unassigned",
              status:
                s.status === "cancelled" ? "conflict" : ("booked" as const),
              date: s.date,
            })),
          };
        });

        // Add unassigned court sessions if any
        if (courtSessionsMap["unassigned"]?.length > 0) {
          courtSchedule.push({
            name: "No Court Assigned",
            sessions: courtSessionsMap["unassigned"].map((s) => ({
              time: s.time || "TBD",
              coach: s.coachName || "Unassigned",
              status: "conflict" as const,
              date: s.date,
            })),
          });
        }

        // Calculate insights
        const totalSessions = periodSessions.length;
        const conflicts = periodSessions.filter(
          (s) => s.status === "cancelled" || !s.courtId,
        ).length;

        // Find peak hours
        const hourCounts: Record<number, number> = {};
        for (const session of periodSessions) {
          if (session.time) {
            const hour = parseInt(session.time.split(":")[0]) || 0;
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
          }
        }
        const peakHour = Object.entries(hourCounts).sort(
          (a, b) => b[1] - a[1],
        )[0];
        const peakHoursLabel = peakHour ? `${peakHour[0]}:00` : "N/A";

        // Calculate utilization (sessions per court per day)
        const daysInPeriod =
          Math.ceil(
            (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
          ) + 1;
        const maxPossibleSessions = dbCourts.length * daysInPeriod * 12; // Assume 12 slots per court per day
        const utilization =
          maxPossibleSessions > 0
            ? Math.round((totalSessions / maxPossibleSessions) * 100)
            : 0;

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
    },
  );

  // Academy Owner - Get finance data with 3 clear sections: Collected, Pending, Estimated
  router.get(
    "/api/owner/finance",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        // Get real payment data
        const allPayments = await storage.getPayments(academyId);
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        const thisWeekStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - now.getDay(),
        );
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1,
        );
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

        // Filter by payment date
        const thisWeekPayments = allPayments.filter(
          (p) =>
            p.status === "confirmed" &&
            p.paymentDate &&
            new Date(p.paymentDate) >= thisWeekStart,
        );
        const thisMonthPayments = allPayments.filter(
          (p) =>
            p.status === "confirmed" &&
            p.paymentDate &&
            new Date(p.paymentDate) >= thisMonthStart,
        );
        const lastMonthPayments = allPayments.filter(
          (p) =>
            p.status === "confirmed" &&
            p.paymentDate &&
            new Date(p.paymentDate) >= lastMonthStart &&
            new Date(p.paymentDate) <= lastMonthEnd,
        );

        // Calculate collected revenue (confirmed payments only)
        const collectedThisWeek = thisWeekPayments.reduce(
          (sum, p) => sum + Number(p.amount || 0),
          0,
        );
        const collectedThisMonth = thisMonthPayments.reduce(
          (sum, p) => sum + Number(p.amount || 0),
          0,
        );
        const collectedLastMonth = lastMonthPayments.reduce(
          (sum, p) => sum + Number(p.amount || 0),
          0,
        );

        // Pending revenue (pending manual payments)
        const pendingPayments = allPayments.filter(
          (p) => p.status === "pending",
        );
        const pendingAmount = pendingPayments.reduce(
          (sum, p) => sum + Number(p.amount || 0),
          0,
        );

        // Get active player subscriptions for estimated revenue
        const activeSubscriptions =
          await storage.getActivePlayerSubscriptions(academyId);

        // Calculate estimated monthly revenue from subscriptions
        let estimatedMonthlyRevenue = 0;
        const subscriptionBreakdown: Record<
          string,
          { count: number; total: number }
        > = {};

        for (const sub of activeSubscriptions) {
          const price = Number(sub.price || 0);
          const monthlyEquivalent =
            sub.billingPeriod === "weekly" ? price * 4 : price;
          estimatedMonthlyRevenue += monthlyEquivalent;

          if (!subscriptionBreakdown[sub.planName]) {
            subscriptionBreakdown[sub.planName] = { count: 0, total: 0 };
          }
          subscriptionBreakdown[sub.planName].count++;
          subscriptionBreakdown[sub.planName].total += monthlyEquivalent;
        }

        // Cash vs Bank breakdown for this month
        const cashTotal = thisMonthPayments
          .filter((p) => p.paymentMethod === "cash")
          .reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const bankTotal = thisMonthPayments
          .filter((p) => p.paymentMethod === "bank_transfer")
          .reduce((sum, p) => sum + Number(p.amount || 0), 0);

        // Month-over-month change
        const monthChange =
          collectedLastMonth > 0
            ? Math.round(
                ((collectedThisMonth - collectedLastMonth) /
                  collectedLastMonth) *
                  100,
              )
            : 0;

        // Get recent payments with player names
        const recentPayments = allPayments.slice(0, 10);
        const paymentsWithPlayers = await Promise.all(
          recentPayments.map(async (payment) => {
            const player = payment.playerId
              ? await storage.getPlayerById(payment.playerId)
              : null;
            return {
              id: payment.id,
              playerName: payment.payerName || player?.name || "Unknown",
              package: "Manual Payment",
              amount: Number(payment.amount || 0),
              status:
                payment.status === "confirmed"
                  ? "paid"
                  : payment.status || "pending",
              paymentMethod: payment.paymentMethod,
              date: payment.paymentDate,
            };
          }),
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
            tooltip:
              "Confirmed payments only. This is money you have actually received.",
          },
          // Section 2: Pending Revenue (expected but not confirmed)
          pending: {
            amount: pendingAmount,
            count: pendingPayments.length,
            tooltip:
              "Pending payments awaiting confirmation. These have been recorded but not yet verified.",
          },
          // Section 3: Estimated Revenue (forecast from subscriptions)
          estimated: {
            monthlyForecast: estimatedMonthlyRevenue,
            activeSubscriptions: activeSubscriptions.length,
            breakdown: Object.entries(subscriptionBreakdown).map(
              ([planName, data]) => ({
                planName,
                count: data.count,
                monthlyTotal: data.total,
              }),
            ),
            tooltip:
              "Estimated revenue based on active player subscriptions. This is a forecast, not actual collected money.",
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
            breakdown: Object.entries(subscriptionBreakdown).map(
              ([type, data]) => ({
                type,
                count: data.count,
              }),
            ),
          },
        });
      } catch (error) {
        console.error("Owner finance error:", error);
        res.status(500).json({ error: "Failed to fetch finance data" });
      }
    },
  );

  // Academy Owner - Get public listings (coaching series with isPublic=true) with drop-in stats
  router.get(
    "/api/owner/public-listings",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const scope = (req.query.scope as string) || "mine";

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Get all active coaching series - scoped to this academy or all (platform-wide public)
        const allSeries = await db
          .select()
          .from(coachingSeries)
          .where(
            scope === "all"
              ? and(eq(coachingSeries.isPublic, true), ne(coachingSeries.status, "ended"))
              : and(eq(coachingSeries.academyId, academyId), ne(coachingSeries.status, "ended"))
          )
          .orderBy(asc(coachingSeries.dayOfWeek), asc(coachingSeries.startTime));

        // For each series, get player count and drop-in bookings this month
        const seriesIds = allSeries.map(s => s.id);

        const [playerCounts, dropInThisMonth] = await Promise.all([
          seriesIds.length > 0
            ? db
                .select({
                  seriesId: seriesPlayers.seriesId,
                  count: sql<number>`count(*)::int`,
                })
                .from(seriesPlayers)
                .where(
                  and(
                    inArray(seriesPlayers.seriesId, seriesIds),
                    eq(seriesPlayers.status, "active"),
                  )
                )
                .groupBy(seriesPlayers.seriesId)
            : Promise.resolve([]),

          seriesIds.length > 0
            ? db
                .select({
                  seriesId: sessions.seriesId,
                  count: sql<number>`count(${sessionPlayers.id})::int`,
                })
                .from(sessionPlayers)
                .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
                .where(
                  and(
                    inArray(sessions.seriesId, seriesIds),
                    eq(sessionPlayers.joinType, "drop_in"),
                    gte(sessionPlayers.creditDeductedAt, startOfMonth),
                  )
                )
                .groupBy(sessions.seriesId)
            : Promise.resolve([]),
        ]);

        const playerCountMap = new Map(playerCounts.map(p => [p.seriesId, p.count]));
        const dropInMap = new Map(dropInThisMonth.map(d => [d.seriesId, d.count]));

        const settings = await storage.getAcademySettings(academyId);
        const currency = settings?.currency || "AED";

        // Aggregate summary
        const totalPublic = allSeries.filter(s => s.isPublic).length;
        const totalDropInThisMonth = Array.from(dropInMap.values()).reduce((a, b) => a + b, 0);
        const totalDropInRevenue = allSeries
          .filter(s => s.isPublic)
          .reduce((sum, s) => {
            const count = dropInMap.get(s.id) || 0;
            return sum + count * Number(s.price || 0);
          }, 0);

        const listings = allSeries.map(s => ({
          id: s.id,
          title: s.title,
          isPublic: s.isPublic ?? false,
          status: s.status,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          maxPlayers: s.maxPlayers,
          price: s.price ? Number(s.price) : null,
          sport: s.sport,
          playerCount: playerCountMap.get(s.id) || 0,
          dropInThisMonth: dropInMap.get(s.id) || 0,
          dropInRevenueThisMonth: (dropInMap.get(s.id) || 0) * Number(s.price || 0),
        }));

        res.json({
          currency,
          listings,
          summary: {
            totalPublic,
            totalPrivate: allSeries.length - totalPublic,
            dropInBookingsThisMonth: totalDropInThisMonth,
            dropInRevenueThisMonth: totalDropInRevenue,
          },
        });
      } catch (error) {
        console.error("Owner public listings error:", error);
        res.status(500).json({ error: "Failed to fetch public listings" });
      }
    },
  );

  // Academy Owner - Toggle isPublic for a coaching series (academy-scoped, no coachId check)
  router.patch(
    "/api/owner/series/:id/visibility",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }
        const { id } = req.params;
        const { isPublic } = req.body;
        if (typeof isPublic !== "boolean") {
          return res.status(400).json({ error: "isPublic must be a boolean" });
        }

        const existing = await db
          .select()
          .from(coachingSeries)
          .where(and(eq(coachingSeries.id, id), eq(coachingSeries.academyId, academyId)))
          .limit(1);

        if (!existing[0]) {
          return res.status(404).json({ error: "Series not found or not in your academy" });
        }

        const updated = await db
          .update(coachingSeries)
          .set({ isPublic })
          .where(eq(coachingSeries.id, id))
          .returning();

        res.json(updated[0]);
      } catch (error) {
        console.error("Owner series visibility toggle error:", error);
        res.status(500).json({ error: "Failed to update series visibility" });
      }
    },
  );

  // ==================== ACADEMY SETTINGS & EXPORTS ====================

  // Get academy settings (for settings screen)
  router.get(
    "/api/owner/academy-settings",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }
        // Get extended academy settings for welcomeVideoUrl
        const extendedSettings = await storage.getAcademySettings(academyId);
        const academy = await storage.getAcademy(academyId);
        if (!academy) {
          return res.status(404).json({ error: "Academy not found" });
        }

        res.json({
          defaultSessionLength: (academy as any).defaultSessionLength || 60,
          xpVisibleToPlayers: (academy as any).xpVisibleToPlayers ?? true,
          notificationsEnabled: (academy as any).notificationsEnabled ?? true,
          welcomeVideoUrl: extendedSettings?.welcomeVideoUrl || "",
          sports: (academy as any).sports || ["tennis"],
        });
      } catch (error) {
        console.error("Get academy settings error:", error);
        res.status(500).json({ error: "Failed to fetch academy settings" });
      }
    },
  );

  // Update academy settings
  router.patch(
    "/api/owner/academy-settings",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        // Whitelist allowed settings fields — never allow id, ownerId, or other privileged fields
        const { defaultSessionLength, xpVisibleToPlayers, notificationsEnabled, welcomeVideoUrl, sports } = req.body;
        const updates: Record<string, any> = {};
        if (defaultSessionLength !== undefined) updates.defaultSessionLength = defaultSessionLength;
        if (xpVisibleToPlayers !== undefined) updates.xpVisibleToPlayers = xpVisibleToPlayers;
        if (notificationsEnabled !== undefined) updates.notificationsEnabled = notificationsEnabled;
        if (sports !== undefined && Array.isArray(sports) && sports.length > 0) {
          const VALID_SPORTS = ["tennis", "padel", "pickleball"];
          const validatedSports = sports.filter((s: unknown) => typeof s === "string" && VALID_SPORTS.includes(s));
          if (validatedSports.length > 0) updates.sports = validatedSports;
        }

        // Handle welcomeVideoUrl separately in academy_settings table
        if (welcomeVideoUrl !== undefined) {
          await storage.upsertAcademySettings(academyId, { welcomeVideoUrl });
        }

        if (Object.keys(updates).length > 0) {
          await storage.updateAcademy(academyId, updates);
        }

        res.json({ success: true, defaultSessionLength, xpVisibleToPlayers, notificationsEnabled, welcomeVideoUrl, sports });
      } catch (error) {
        console.error("Update academy settings error:", error);
        res.status(500).json({ error: "Failed to update academy settings" });
      }
    },
  );

  // Export players as CSV (returns JSON with CSV data for cross-platform compatibility)
  router.get(
    "/api/owner/export/players",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const players = await storage.getPlayersByAcademy(academyId);

        const csvHeader = "Name,Email,Phone,Ball Level,Status,Created At\n";
        const csvRows = players
          .map(
            (p) =>
              `"${p.name || ""}","${p.email || ""}","${p.phone || ""}","${p.ballLevel || ""}","${p.isActive ? "Active" : "Inactive"}","${p.createdAt || ""}"`,
          )
          .join("\n");

        const csv = csvHeader + csvRows;

        res.json({ csv, filename: "players.csv" });
      } catch (error) {
        console.error("Export players error:", error);
        res.status(500).json({ error: "Failed to export players" });
      }
    },
  );

  // Export sessions as CSV (returns JSON with CSV data for cross-platform compatibility)
  router.get(
    "/api/owner/export/sessions",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const sessions = await storage.getAllSessions(academyId);

        const csvHeader = "Date,Time,Coach,Type,Status,Players,Duration\n";
        const csvRows = sessions
          .map(
            (s) =>
              `"${s.date || ""}","${s.time || ""}","${s.coachName || ""}","${s.sessionType || ""}","${s.status || ""}","${s.playerName || ""}","${s.duration || 60} min"`,
          )
          .join("\n");

        const csv = csvHeader + csvRows;

        res.json({ csv, filename: "sessions.csv" });
      } catch (error) {
        console.error("Export sessions error:", error);
        res.status(500).json({ error: "Failed to export sessions" });
      }
    },
  );

  // ==================== ACADEMY PROFILE & SETTINGS ====================

  // Get academy profile
  router.get(
    "/api/owner/academy",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const academy = await storage.getAcademy(academyId);
        if (!academy) {
          return res.status(404).json({ error: "Academy not found" });
        }

        res.json({ academy });
      } catch (error) {
        console.error("Get academy error:", error);
        res.status(500).json({ error: "Failed to fetch academy" });
      }
    },
  );

  // Update academy profile
  router.patch(
    "/api/owner/academy",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const {
          name,
          description,
          email,
          phone,
          address,
          website,
          logoUrl,
          primaryColor,
          secondaryColor,
          bankName,
          bankAccountHolder,
          bankAccountNumber,
          bankIban,
        } = req.body;

        // Build update object with only provided properties to support partial updates
        // Empty strings are valid values (user intentionally clearing a field)
        const updates: Record<string, any> = {};
        if (name !== undefined && name !== null) updates.name = name;
        if (description !== undefined && description !== null)
          updates.description = description;
        if (email !== undefined && email !== null) updates.email = email;
        if (phone !== undefined && phone !== null) updates.phone = phone;
        if (address !== undefined && address !== null)
          updates.address = address;
        if (website !== undefined && website !== null)
          updates.website = website;
        if (logoUrl !== undefined && logoUrl !== null)
          updates.logoUrl = logoUrl;
        if (primaryColor !== undefined && primaryColor !== null)
          updates.primaryColor = primaryColor;
        if (secondaryColor !== undefined && secondaryColor !== null)
          updates.secondaryColor = secondaryColor;
        if (bankName !== undefined && bankName !== null)
          updates.bankName = bankName;
        if (bankAccountHolder !== undefined && bankAccountHolder !== null)
          updates.bankAccountHolder = bankAccountHolder;
        if (bankAccountNumber !== undefined && bankAccountNumber !== null)
          updates.bankAccountNumber = bankAccountNumber;
        if (bankIban !== undefined && bankIban !== null)
          updates.bankIban = bankIban;

        const updated = await storage.updateAcademy(academyId, updates);

        res.json(updated);
      } catch (error) {
        console.error("Update academy error:", error);
        res.status(500).json({ error: "Failed to update academy" });
      }
    },
  );

  // Get academy settings
  router.get(
    "/api/owner/settings",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Update academy settings
  router.patch(
    "/api/owner/settings",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Academy Owner - Get coaches and players for People screen
  router.get(
    "/api/owner/people",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
            const dateParam = req.query.date as string | undefined;
            const now = dateParam ? new Date(dateParam) : new Date();
            const DUBAI_OFFSET = 4;
            const dubaiNow = new Date(
              now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
            );
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            weekStart.setHours(0, 0, 0, 0);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 7);

            const sessions = await storage.getSessionsByCoach(
              coach.id,
              weekStart,
              weekEnd,
              academyId,
            );
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
          }),
        );

        const playerData = await Promise.all(
          players.map(async (player) => {
            const xpData = await storage.getPlayerXpTotal(player.id);
            return {
              id: player.id,
              name: player.name,
              role: player.ballLevel
                ? `${player.ballLevel.charAt(0).toUpperCase() + player.ballLevel.slice(1)} Ball`
                : "Green Ball",
              status: player.isActive !== false ? "active" : "paused",
              stats: [
                {
                  label: "Attendance",
                  value: `${player.attendanceRate || 0}%`,
                },
                { label: "Streak", value: String(player.streak || 0) },
                {
                  label: "Level",
                  value: String(xpData.level || player.level || 1),
                },
              ],
              coachId: player.coachId,
            };
          }),
        );

        res.json({
          coaches: coachData,
          players: playerData,
        });
      } catch (error) {
        console.error("Owner people error:", error);
        res.status(500).json({ error: "Failed to fetch people data" });
      }
    },
  );

  // Get coach's upcoming sessions (for reassignment before deletion)
  router.get(
    "/api/owner/coaches/:id/sessions",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId || req.header("X-Academy-Id");
        const coachId = req.params.id;

        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const sessions = await storage.getCoachUpcomingSessions(
          coachId,
          academyId,
        );
        res.json({ sessions, count: sessions.length });
      } catch (error) {
        console.error("Get coach sessions error:", error);
        res.status(500).json({ error: "Failed to fetch coach sessions" });
      }
    },
  );

  // Reassign coach's sessions to another coach
  router.post(
    "/api/owner/coaches/:id/reassign-sessions",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
          return res
            .status(404)
            .json({ error: "Target coach not found in this academy" });
        }

        const count = await storage.reassignCoachSessions(
          fromCoachId,
          toCoachId,
          academyId,
        );
        res.json({
          success: true,
          reassignedCount: count,
          message: `${count} sessions reassigned`,
        });
      } catch (error) {
        console.error("Reassign sessions error:", error);
        res.status(500).json({ error: "Failed to reassign sessions" });
      }
    },
  );

  // Soft remove coach from academy (marks as inactive, keeps record)
  router.delete(
    "/api/owner/coaches/:id",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId || req.header("X-Academy-Id");
        const coachId = req.params.id;

        if (!academyId) {
          console.error(
            "Coach deletion failed: No academyId in token or header. User:",
            JSON.stringify(req.user),
          );
          return res
            .status(400)
            .json({
              error:
                "Academy ID required. Please re-login or select an academy.",
            });
        }

        console.log(`Removing coach ${coachId} from academy ${academyId}`);
        const removed = await storage.removeCoachFromAcademy(
          coachId,
          academyId,
        );
        if (!removed) {
          return res
            .status(404)
            .json({ error: "Coach not found in this academy" });
        }

        res.json({ success: true, message: "Coach removed from academy" });
      } catch (error: any) {
        console.error("Remove coach error:", error);
        res
          .status(500)
          .json({ error: error.message || "Failed to remove coach" });
      }
    },
  );

  // Fully delete coach (permanent deletion after session reassignment)
  router.delete(
    "/api/owner/coaches/:id/permanent",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId || req.header("X-Academy-Id");
        const coachId = req.params.id;

        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        // Check for upcoming sessions
        const upcomingSessions = await storage.getCoachUpcomingSessions(
          coachId,
          academyId,
        );
        if (upcomingSessions.length > 0) {
          return res.status(400).json({
            error:
              "Coach has upcoming sessions that must be reassigned or cancelled first",
            upcomingSessionCount: upcomingSessions.length,
          });
        }

        console.log(
          `Permanently deleting coach ${coachId} from academy ${academyId}`,
        );
        const deleted = await storage.fullyDeleteCoach(coachId, academyId);
        if (!deleted) {
          return res
            .status(404)
            .json({ error: "Coach not found in this academy" });
        }

        res.json({ success: true, message: "Coach permanently deleted" });
      } catch (error: any) {
        console.error("Permanent delete coach error:", error);
        res
          .status(500)
          .json({
            error: error.message || "Failed to permanently delete coach",
          });
      }
    },
  );

  // Permanently delete player from academy (academy owner)
  router.delete(
    "/api/owner/players/:id",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
          return res
            .status(404)
            .json({ error: "Player not found in this academy" });
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
    },
  );

  // Get coach details (academy owner)
  router.get(
    "/api/owner/coaches/:id",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        const sessions = await storage.getSessionsByCoach(coachId, academyId);
        const weekSessions = sessions.filter((s) => {
          const sessionDate = new Date(s.date);
          return sessionDate >= weekStart && sessionDate < weekEnd;
        });

        res.json({
          ...coach,
          playerCount: players.length,
          weeklySessionCount: weekSessions.length,
          players: players
            .slice(0, 10)
            .map((p) => ({ id: p.id, name: p.name, ballLevel: p.ballLevel })),
        });
      } catch (error) {
        console.error("Get coach details error:", error);
        res.status(500).json({ error: "Failed to fetch coach details" });
      }
    },
  );

  // Get player details (academy owner)
  router.get(
    "/api/owner/players/:id",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
        const sessions = await storage.getSessionsForPlayer(
          playerId,
          academyId,
        );

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
    },
  );

  // ==================== ACADEMY ADMIN MANAGEMENT (Academy Owner only) ====================

  // Get all admins for the academy
  router.get(
    "/api/owner/admins",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Promote a coach to admin role
  router.post(
    "/api/owner/admins",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
          return res
            .status(404)
            .json({ error: "Coach not found in this academy" });
        }

        // Update coach academy membership to admin role
        await storage.promoteToAdmin(coachId, academyId);

        res.json({ success: true, message: `${coach.name} promoted to admin` });
      } catch (error) {
        console.error("Promote to admin error:", error);
        res.status(500).json({ error: "Failed to promote coach to admin" });
      }
    },
  );

  // Demote an admin back to coach role
  router.delete(
    "/api/owner/admins/:coachId",
    authMiddleware,
    requireRole("owner", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        const { coachId } = req.params;

        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        // Verify the coach is currently an admin in this academy
        const admins = await storage.getAcademyAdmins(academyId);
        const isAdmin = admins.some((a) => a.id === coachId);

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
    },
  );

  // ==================== ADMIN COACH MANAGEMENT ====================

  // Delete coach (admin) - removes coach from academy
  router.delete(
    "/api/admin/coaches/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId || req.user?.userId;
        const { id } = req.params;

        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const removed = await storage.removeCoachFromAcademy(id, academyId);
        if (!removed) {
          return res
            .status(404)
            .json({ error: "Coach not found in this academy" });
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
    },
  );

  // Delete player (admin) - removes player from academy
  router.delete(
    "/api/admin/players/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId || req.user?.userId;
        const { id } = req.params;

        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const deleted = await storage.deletePlayer(id, academyId);
        if (!deleted) {
          return res
            .status(404)
            .json({ error: "Player not found in this academy" });
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
    },
  );

  // ==================== ADMIN PAYMENTS (MANUAL PAYMENTS MVP) ====================

  // Get all payments with filters
  router.get(
    "/api/admin/payments",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const filters: any = {};
        if (req.query.status) filters.status = req.query.status as string;
        if (req.query.paymentMethod)
          filters.paymentMethod = req.query.paymentMethod as string;
        if (req.query.playerId) filters.playerId = req.query.playerId as string;
        if (req.query.receivedBy)
          filters.receivedBy = req.query.receivedBy as string;
        if (req.query.startDate)
          filters.startDate = new Date(req.query.startDate as string);
        if (req.query.endDate)
          filters.endDate = new Date(req.query.endDate as string);

        const payments = await storage.getPaymentsWithFilters(
          academyId,
          filters,
        );

        const paymentsWithDetails = await Promise.all(
          payments.map(async (p) => {
            const player = p.playerId
              ? await storage.getPlayer(p.playerId)
              : null;
            const receiver = p.receivedBy
              ? await storage.getCoach(p.receivedBy)
              : null;
            return {
              ...p,
              playerName: player?.name || p.payerName || "Unknown",
              receiverName: receiver?.name || "Unknown",
            };
          }),
        );

        res.json(paymentsWithDetails);
      } catch (error) {
        console.error("Admin payments error:", error);
        res.status(500).json({ error: "Failed to fetch payments" });
      }
    },
  );

  // Create a new payment (admin only)
  router.post(
    "/api/admin/payments",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const {
          playerId,
          payerName,
          amount,
          currency,
          paymentMethod,
          paymentDate,
          receivedBy,
          proofUrl,
          notes,
          status,
        } = req.body;

        if (!amount || !paymentMethod) {
          return res
            .status(400)
            .json({ error: "Amount and payment method are required" });
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
    },
  );

  // Update a payment
  router.put(
    "/api/admin/payments/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId;

        const existingPayment = await storage.getPayment(id);
        if (
          !existingPayment ||
          (academyId && existingPayment.academyId !== academyId)
        ) {
          return res.status(404).json({ error: "Payment not found" });
        }

        if (existingPayment.status === "confirmed") {
          return res
            .status(400)
            .json({ error: "Cannot edit confirmed payments" });
        }

        const {
          playerId,
          payerName,
          amount,
          currency,
          paymentMethod,
          paymentDate,
          receivedBy,
          proofUrl,
          notes,
        } = req.body;

        const updatedPayment = await storage.updatePayment(id, {
          playerId:
            playerId !== undefined ? playerId : existingPayment.playerId,
          payerName:
            payerName !== undefined ? payerName : existingPayment.payerName,
          amount:
            amount !== undefined ? String(amount) : existingPayment.amount,
          currency:
            currency !== undefined ? currency : existingPayment.currency,
          paymentMethod:
            paymentMethod !== undefined
              ? paymentMethod
              : existingPayment.paymentMethod,
          paymentDate: paymentDate
            ? new Date(paymentDate)
            : existingPayment.paymentDate,
          receivedBy:
            receivedBy !== undefined ? receivedBy : existingPayment.receivedBy,
          proofUrl:
            proofUrl !== undefined ? proofUrl : existingPayment.proofUrl,
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
    },
  );

  // Confirm a payment (admin only)
  router.post(
    "/api/admin/payments/:id/confirm",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId;

        const existingPayment = await storage.getPayment(id);
        if (
          !existingPayment ||
          (academyId && existingPayment.academyId !== academyId)
        ) {
          return res.status(404).json({ error: "Payment not found" });
        }

        if (existingPayment.status !== "pending") {
          return res
            .status(400)
            .json({ error: "Only pending payments can be confirmed" });
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
    },
  );

  // Reject a payment (admin only)
  router.post(
    "/api/admin/payments/:id/reject",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { reason } = req.body;
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId;

        const existingPayment = await storage.getPayment(id);
        if (
          !existingPayment ||
          (academyId && existingPayment.academyId !== academyId)
        ) {
          return res.status(404).json({ error: "Payment not found" });
        }

        if (existingPayment.status !== "pending") {
          return res
            .status(400)
            .json({ error: "Only pending payments can be rejected" });
        }

        const rejectedPayment = await storage.rejectPayment(
          id,
          userId || "",
          reason || "No reason provided",
        );

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
    },
  );

  // Delete a payment (admin only, only pending/rejected)
  router.delete(
    "/api/admin/payments/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId;

        const existingPayment = await storage.getPayment(id);
        if (
          !existingPayment ||
          (academyId && existingPayment.academyId !== academyId)
        ) {
          return res.status(404).json({ error: "Payment not found" });
        }

        if (existingPayment.status === "confirmed") {
          return res
            .status(400)
            .json({ error: "Cannot delete confirmed payments" });
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
    },
  );

  // Coach payment registration (pending only)
  router.post(
    "/api/coach/payments",
    authMiddleware,
    requireRole("coach", "admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        const coachId = req.user?.coachId;
        if (!academyId || !coachId) {
          return res
            .status(400)
            .json({ error: "Academy and coach ID required" });
        }

        const {
          playerId,
          payerName,
          amount,
          currency,
          paymentMethod,
          paymentDate,
          proofUrl,
          notes,
        } = req.body;

        if (!amount || !paymentMethod) {
          return res
            .status(400)
            .json({ error: "Amount and payment method are required" });
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
    },
  );

  // ==================== ADMIN COURTS MANAGEMENT ====================

  router.get(
    "/api/admin/courts",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner", "coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const courts = await storage.getAllCourts(academyId);
        const locations = await storage.getAllLocations(academyId);

        const courtsWithLocations = courts.map((court) => {
          const location = locations.find((l) => l.id === court.locationId);
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
    },
  );

  router.post(
    "/api/admin/courts",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner", "coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const { name, locationId, color, isActive, bookingEnabled, pricePerHour } = req.body;
        if (!name || !name.trim()) {
          return res.status(400).json({ error: "Court name is required" });
        }

        // Enforce location selection when academy has multiple active locations
        const allAcademyLocations = await storage.getAllLocations(academyId);
        const activeLocations = allAcademyLocations.filter((l) => l.isActive !== false);
        if (activeLocations.length > 1 && !locationId) {
          return res.status(400).json({ error: "Location is required when the academy has multiple locations" });
        }

        // Check for duplicate court name within academy
        const existingCourt = await storage.getCourtByName(
          name.trim(),
          academyId,
        );
        if (existingCourt) {
          return res
            .status(409)
            .json({ error: `A court named "${name.trim()}" already exists` });
        }

        const court = await storage.createCourt({
          academyId,
          name: name.trim(),
          locationId: locationId || null,
          color: color || "#2ECC40",
          isActive: isActive !== false,
          bookingEnabled: bookingEnabled !== false,
          ...(pricePerHour ? { pricePerHour: String(pricePerHour) } : {}),
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
    },
  );

  router.put(
    "/api/admin/courts/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner", "coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId;

        const existingCourt = await storage.getCourt(
          id,
          academyId || undefined,
        );
        if (!existingCourt) {
          return res.status(404).json({ error: "Court not found" });
        }

        const { name, locationId, color, isActive, bookingEnabled, pricePerHour } = req.body;

        const updatedCourt = await storage.updateCourt(
          id,
          {
            name: name !== undefined ? name : existingCourt.name,
            locationId:
              locationId !== undefined ? locationId : existingCourt.locationId,
            color: color !== undefined ? color : existingCourt.color,
            isActive:
              isActive !== undefined ? isActive : existingCourt.isActive,
            bookingEnabled:
              bookingEnabled !== undefined ? bookingEnabled : existingCourt.bookingEnabled,
            pricePerHour:
              pricePerHour !== undefined ? (pricePerHour ? String(pricePerHour) : null) : existingCourt.pricePerHour,
          },
          academyId || undefined,
        );

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
    },
  );

  router.delete(
    "/api/admin/courts/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner", "coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId;

        const existingCourt = await storage.getCourt(
          id,
          academyId || undefined,
        );
        if (!existingCourt) {
          return res.status(404).json({ error: "Court not found" });
        }

        // Soft delete - deactivate instead of hard delete to preserve references
        await storage.updateCourt(
          id,
          { isActive: false },
          academyId || undefined,
        );

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
            error:
              "Cannot delete court with existing bookings. Please reassign or cancel bookings first.",
          });
        }
        res.status(500).json({ error: "Failed to delete court" });
      }
    },
  );

  // Court photo upload endpoint
  router.post(
    "/api/upload/court-photo",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner", "coach"),
    courtPhotoUpload.single("photo"),
    async (req: AuthenticatedRequest, res: Response) => {
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
        const updatedCourt = await storage.updateCourt(
          courtId,
          { photoUrl },
          academyId || undefined,
        );

        // Delete old photo if it exists and is different
        if (court.photoUrl && court.photoUrl !== photoUrl) {
          const oldPhotoPath = path.join(
            process.cwd(),
            court.photoUrl.replace(/^\//, ""),
          );
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
    },
  );

  // ==================== ADMIN LOCATIONS MANAGEMENT ====================

  router.get(
    "/api/admin/locations",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const locations = await storage.getAllLocations(academyId);
        const courts = await storage.getAllCourts(academyId);
        const allSessions = await storage.getSessionsByAcademy(academyId);

        const locationsWithCounts = locations.map((loc) => {
          const courtsAtLocation = courts.filter((c) => c.locationId === loc.id);
          const courtIds = courtsAtLocation.map(c => c.id);
          const sessionCount = allSessions.filter(s => {
            // Count sessions via court->location mapping
            if (s.courtId && courtIds.includes(s.courtId)) return true;
            // Also count sessions assigned directly to this location (no court)
            if (s.locationId === loc.id) return true;
            return false;
          }).length;
          return {
            ...loc,
            courtCount: courtsAtLocation.length,
            sessionCount,
          };
        });

        res.json(locationsWithCounts);
      } catch (error) {
        console.error("Admin locations error:", error);
        res.status(500).json({ error: "Failed to fetch locations" });
      }
    },
  );

  router.post(
    "/api/admin/locations",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const { name, timezone, address, lat, lng, isActive, googlePlaceId } = req.body;
        if (!name) {
          return res.status(400).json({ error: "Location name is required" });
        }

        const parseCoord = (v: any, min: number, max: number): number | null => {
          if (v === null || v === undefined || v === "") return null;
          const n = Number(v);
          if (isNaN(n) || n < min || n > max) return null;
          return n;
        };

        const parsedLat = parseCoord(lat, -90, 90);
        const parsedLng = parseCoord(lng, -180, 180);
        if ((lat !== undefined && lat !== null && lat !== "") && parsedLat === null) {
          return res.status(400).json({ error: "Invalid latitude (must be between -90 and 90)" });
        }
        if ((lng !== undefined && lng !== null && lng !== "") && parsedLng === null) {
          return res.status(400).json({ error: "Invalid longitude (must be between -180 and 180)" });
        }

        const location = await storage.createLocation({
          academyId,
          name,
          timezone: timezone || "Asia/Dubai",
          address: address || null,
          lat: parsedLat,
          lng: parsedLng,
          isActive: isActive !== false,
          googlePlaceId: googlePlaceId || null,
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
    },
  );

  router.put(
    "/api/admin/locations/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId;

        const existingLocation = await storage.getLocation(
          id,
          academyId || undefined,
        );
        if (!existingLocation) {
          return res.status(404).json({ error: "Location not found" });
        }

        const { name, timezone, address, lat, lng, isActive, googlePlaceId } = req.body;

        const parseCoordUpdate = (v: any, min: number, max: number): number | null => {
          if (v === null || v === undefined || v === "") return null;
          const n = Number(v);
          if (isNaN(n) || n < min || n > max) return null;
          return n;
        };

        const parsedLatUpdate = lat !== undefined ? parseCoordUpdate(lat, -90, 90) : undefined;
        const parsedLngUpdate = lng !== undefined ? parseCoordUpdate(lng, -180, 180) : undefined;
        if (lat !== undefined && lat !== null && lat !== "" && parsedLatUpdate === null) {
          return res.status(400).json({ error: "Invalid latitude (must be between -90 and 90)" });
        }
        if (lng !== undefined && lng !== null && lng !== "" && parsedLngUpdate === null) {
          return res.status(400).json({ error: "Invalid longitude (must be between -180 and 180)" });
        }

        const updatedLocation = await storage.updateLocation(
          id,
          {
            name: name !== undefined ? name : existingLocation.name,
            timezone: timezone !== undefined ? timezone : existingLocation.timezone,
            address: address !== undefined ? (address || null) : existingLocation.address,
            lat: parsedLatUpdate !== undefined ? parsedLatUpdate : existingLocation.lat,
            lng: parsedLngUpdate !== undefined ? parsedLngUpdate : existingLocation.lng,
            isActive: isActive !== undefined ? isActive : existingLocation.isActive,
            googlePlaceId: googlePlaceId !== undefined ? (googlePlaceId || null) : existingLocation.googlePlaceId,
          },
          academyId || undefined,
        );

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
    },
  );

  router.delete(
    "/api/admin/locations/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId;

        const existingLocation = await storage.getLocation(
          id,
          academyId || undefined,
        );
        if (!existingLocation) {
          return res.status(404).json({ error: "Location not found" });
        }

        const courts = await storage.getCourtsByLocation(
          id,
          academyId || undefined,
        );
        if (courts.length > 0) {
          return res
            .status(400)
            .json({
              error:
                "Cannot delete location with courts. Move or delete courts first.",
            });
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
    },
  );

  // ==================== ADMIN PLAYER SUBSCRIPTIONS (CONTRACTS) ====================

  router.get(
    "/api/admin/player-subscriptions",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const subscriptions = await storage.getPlayerSubscriptions(academyId);

        const subscriptionsWithPlayers = await Promise.all(
          subscriptions.map(async (sub) => {
            const player = await storage.getPlayerById(sub.playerId);
            return {
              ...sub,
              playerName: player?.name || "Unknown Player",
            };
          }),
        );

        res.json(subscriptionsWithPlayers);
      } catch (error) {
        console.error("Admin get player subscriptions error:", error);
        res.status(500).json({ error: "Failed to fetch player subscriptions" });
      }
    },
  );

  router.post(
    "/api/admin/player-subscriptions",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const {
          playerId,
          planName,
          price,
          currency,
          billingPeriod,
          sessionsPerPeriod,
          startDate,
          notes,
        } = req.body;

        if (!playerId || !planName || !price || !startDate) {
          return res
            .status(400)
            .json({
              error: "playerId, planName, price, and startDate are required",
            });
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
    },
  );

  router.put(
    "/api/admin/player-subscriptions/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId;

        const existingSubscription =
          await storage.getPlayerSubscriptionById(id);
        if (
          !existingSubscription ||
          existingSubscription.academyId !== academyId
        ) {
          return res.status(404).json({ error: "Subscription not found" });
        }

        const {
          planName,
          price,
          currency,
          billingPeriod,
          sessionsPerPeriod,
          status,
          startDate,
          endDate,
          notes,
        } = req.body;

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
    },
  );

  router.delete(
    "/api/admin/player-subscriptions/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user?.academyId;
        const userId = req.user?.coachId;

        const existingSubscription =
          await storage.getPlayerSubscriptionById(id);
        if (
          !existingSubscription ||
          existingSubscription.academyId !== academyId
        ) {
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
    },
  );

  // ==================== ADMIN AUDIT LOGS ====================

  router.get(
    "/api/admin/audit-logs",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const filters: any = {};
        if (req.query.entityType)
          filters.entityType = req.query.entityType as string;
        if (req.query.startDate)
          filters.startDate = new Date(req.query.startDate as string);
        if (req.query.endDate)
          filters.endDate = new Date(req.query.endDate as string);
        if (req.query.limit)
          filters.limit = parseInt(req.query.limit as string);

        const logs = await storage.getAuditLogsByAcademy(academyId, filters);

        res.json(logs);
      } catch (error) {
        console.error("Admin audit logs error:", error);
        res.status(500).json({ error: "Failed to fetch audit logs" });
      }
    },
  );

  // Player Booking & Court routes - extracted to server/routes/player-booking.ts

  // ==================== PUBLIC PLAYER PROFILE ====================

  // Get public player profile (viewable by other players)
  router.get(
    "/api/player/public-profile/:playerId",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { playerId } = req.params;
        const viewerId = req.user?.playerId;

        console.log("[PublicProfile] Fetching profile for playerId:", playerId, "viewer:", viewerId);

        // Get player basic info
        const player = await storage.getPlayer(playerId);
        if (!player) {
          console.log("[PublicProfile] Player not found for id:", playerId);
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

        const pillars = domains.map((domain) => {
          const state = skillStates.find((s) => s.domainId === domain.id);
          // Calculate pillar level from progress (0-100 maps to level 1-20)
          const pillarLevel = state
            ? Math.floor((state.progressValue || 0) / 5) + 1
            : 1;
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
        const upcomingMatches = await storage.getPlayerUpcomingMatches(
          playerId,
          3,
        );

        // Get connections count and preview
        const connections = await storage.getPlayerConnections(playerId);
        const connectionPreviews = await Promise.all(
          connections.slice(0, 5).map(async (conn) => {
            const connectedPlayerId =
              conn.player1Id === playerId ? conn.player2Id : conn.player1Id;
            const connectedPlayer =
              await storage.getPlayerById(connectedPlayerId);
            return connectedPlayer
              ? {
                  id: connectedPlayer.id,
                  name: connectedPlayer.displayName || connectedPlayer.name,
                  photoUrl: connectedPlayer.profilePhotoUrl,
                  level: connectedPlayer.level || 1,
                }
              : null;
          }),
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
          recentMatches: recentMatches.map((m) => ({
            id: m.id,
            opponentId:
              m.initiatorId === playerId ? m.receiverId : m.initiatorId,
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
          upcomingMatches: upcomingMatches.map((m) => ({
            id: m.id,
            opponentId:
              m.initiatorId === playerId ? m.receiverId : m.initiatorId,
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
          availability:
            isOwnProfile || player.privacyLevel === "public"
              ? {
                  typicalPlayTimes: player.typicalPlayTimes || [],
                  preferredCities: player.preferredCities || [],
                }
              : null,

          // Metadata
          isOwnProfile,
          lastActiveAt: player.lastActiveAt,
          bio: player.bio,
          academyId: player.academyId,
        };

        res.json(profile);
      } catch (error) {
        const { playerId } = req.params;
        console.error("[PublicProfile] Error for playerId:", playerId, error);
        res.status(500).json({ error: "Failed to get player profile" });
      }
    },
  );

  // Toggle open to play status
  router.patch(
    "/api/player/me/open-to-play",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user?.playerId;
        if (!playerId) {
          return res.status(403).json({ error: "Player profile required" });
        }

        const { openToPlay } = req.body;
        if (typeof openToPlay !== "boolean") {
          return res
            .status(400)
            .json({ error: "openToPlay must be a boolean" });
        }

        await storage.updatePlayer(playerId, { openToPlay });

        res.json({ success: true, openToPlay });
      } catch (error) {
        console.error("Toggle open to play error:", error);
        res.status(500).json({ error: "Failed to update status" });
      }
    },
  );

  // ==================== 3-LAYER PRICING SYSTEM ====================

  // Academy Pricing for PackagesCard - coaches and owners can read pricing
  router.get(
    "/api/owner/academy/pricing",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Academy Pricing (Layer 1) - What players pay
  router.get(
    "/api/admin/pricing",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  router.post(
    "/api/admin/pricing",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy context required" });
        }

        const {
          sessionType,
          pricePerSession,
          currency,
          duration,
          pricePerHour,
          effectiveFrom,
          notes,
          isPerPerson,
        } = req.body;

        if (!sessionType || !pricePerSession) {
          return res
            .status(400)
            .json({ error: "Session type and price per session are required" });
        }

        const pricing = await storage.createAcademyPricing({
          academyId,
          sessionType,
          pricePerSession,
          currency: currency || "AED",
          duration,
          pricePerHour,
          isPerPerson: isPerPerson ?? false,
          effectiveFrom:
            effectiveFrom || new Date().toISOString().split("T")[0],
          notes,
        });

        res.json(pricing);
      } catch (error) {
        console.error("Create academy pricing error:", error);
        res.status(500).json({ error: "Failed to create pricing" });
      }
    },
  );

  // PATCH creates a new version starting tomorrow - old version automatically closed by createAcademyPricing
  router.patch(
    "/api/admin/pricing/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy context required" });
        }

        const { id } = req.params;
        const {
          pricePerSession,
          currency,
          duration,
          pricePerHour,
          notes,
          sessionType,
          isPerPerson,
          effectiveFrom: inputEffectiveFrom,
        } = req.body;

        // Get old pricing to copy values from
        const existingPricing = await storage.getAcademyPricing(academyId);
        const oldPricing = existingPricing.find((p) => p.id === id);

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
          effectiveFromDate = tomorrow.toISOString().split("T")[0];
        }

        const newPricing = await storage.createAcademyPricing({
          academyId,
          sessionType: sessionType || oldPricing.sessionType,
          pricePerSession: pricePerSession || oldPricing.pricePerSession,
          currency: currency || oldPricing.currency || "AED",
          duration: duration !== undefined ? duration : oldPricing.duration,
          pricePerHour:
            pricePerHour !== undefined ? pricePerHour : oldPricing.pricePerHour,
          isPerPerson:
            isPerPerson !== undefined
              ? isPerPerson
              : (oldPricing.isPerPerson ?? false),
          effectiveFrom: effectiveFromDate,
          notes,
        });

        res.json(newPricing);
      } catch (error) {
        console.error("Update academy pricing error:", error);
        res.status(500).json({ error: "Failed to update pricing" });
      }
    },
  );

  // DELETE soft-deletes by setting isActive = false (preserves history)
  router.delete(
    "/api/admin/pricing/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const today = new Date().toISOString().split("T")[0];

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
    },
  );

  // Coach Contracts (Layer 2) - What coaches earn
  router.get(
    "/api/admin/coach-contracts",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  router.post(
    "/api/admin/coach-contracts",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy context required" });
        }

        const {
          coachId,
          payType,
          hourlyRate,
          sessionRate,
          percentageRate,
          currency,
          privateRate,
          semiPrivateRate,
          groupRate,
          effectiveFrom,
          notes,
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
          effectiveFrom:
            effectiveFrom || new Date().toISOString().split("T")[0],
          notes,
        });

        res.json(contract);
      } catch (error) {
        console.error("Create coach contract error:", error);
        res.status(500).json({ error: "Failed to create contract" });
      }
    },
  );

  // PATCH creates a new version starting tomorrow - old version automatically closed by createCoachContract
  router.patch(
    "/api/admin/coach-contracts/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy context required" });
        }

        const { id } = req.params;
        const {
          payType,
          hourlyRate,
          sessionRate,
          percentageRate,
          currency,
          privateRate,
          semiPrivateRate,
          groupRate,
          notes,
        } = req.body;

        // Get old contract to copy values from
        const existingContracts = await storage.getCoachContracts(academyId);
        const oldContract = existingContracts.find((c) => c.id === id);

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
          hourlyRate:
            hourlyRate !== undefined ? hourlyRate : oldContract.hourlyRate,
          sessionRate:
            sessionRate !== undefined ? sessionRate : oldContract.sessionRate,
          percentageRate:
            percentageRate !== undefined
              ? percentageRate
              : oldContract.percentageRate,
          currency: currency || oldContract.currency || "AED",
          privateRate:
            privateRate !== undefined ? privateRate : oldContract.privateRate,
          semiPrivateRate:
            semiPrivateRate !== undefined
              ? semiPrivateRate
              : oldContract.semiPrivateRate,
          groupRate:
            groupRate !== undefined ? groupRate : oldContract.groupRate,
          effectiveFrom: tomorrow.toISOString().split("T")[0],
          notes,
        });

        res.json(newContract);
      } catch (error) {
        console.error("Update coach contract error:", error);
        res.status(500).json({ error: "Failed to update contract" });
      }
    },
  );

  // DELETE soft-deletes by terminating the contract (preserves history)
  router.delete(
    "/api/admin/coach-contracts/:id",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const today = new Date().toISOString().split("T")[0];

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
    },
  );

  // Calculate session pricing - preview before creating session
  router.post(
    "/api/admin/calculate-pricing",
    authMiddleware,
    requireRole("admin", "academy_owner", "platform_owner", "coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy context required" });
        }

        const { coachId, sessionType, durationMinutes } = req.body;

        if (!coachId || !sessionType || !durationMinutes) {
          return res
            .status(400)
            .json({
              error: "Coach ID, session type, and duration are required",
            });
        }

        const pricing = await storage.calculateSessionPricing(
          academyId,
          coachId,
          sessionType,
          durationMinutes,
        );
        res.json(pricing);
      } catch (error) {
        console.error("Calculate pricing error:", error);
        res.status(500).json({ error: "Failed to calculate pricing" });
      }
    },
  );

  // Social Features routes - extracted to server/routes/social-features.ts

  // Player Social (quests, badges, friends, spotlight) - extracted to server/routes/player-social.ts

  router.post("/api/support/contact", async (req: Request, res: Response) => {
    try {
      const { name, email, subject, message } = req.body;

      if (!name || !email || !message) {
        return res.status(400).json({ error: "Name, email, and message are required" });
      }

      const { sendEmail } = await import("../emailService");

      await sendEmail({
        to: "support@glowupsports.com",
        subject: `[Support] ${subject || "General"}: ${name}`,
        html: `
          <h2>New Support Request</h2>
          <p><strong>From:</strong> ${name} (${email})</p>
          <p><strong>Subject:</strong> ${subject || "General"}</p>
          <hr />
          <p>${message.replace(/\n/g, "<br>")}</p>
          <hr />
          <p style="color: #888; font-size: 12px;">Sent from Glow Up Sports Support Form</p>
        `,
      });

      await sendEmail({
        to: email,
        subject: "We received your message - Glow Up Sports",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #00d4aa;">Thanks for reaching out, ${name}!</h2>
            <p>We've received your message and will get back to you within 24 hours.</p>
            <p><strong>Your message:</strong></p>
            <blockquote style="border-left: 3px solid #00d4aa; padding-left: 12px; color: #555;">${message.replace(/\n/g, "<br>")}</blockquote>
            <p>Best regards,<br>The Glow Up Sports Team</p>
          </div>
        `,
      });

      res.json({ success: true, message: "Your message has been sent successfully" });
    } catch (error) {
      console.error("Support contact error:", error);
      res.json({ success: true, message: "Your message has been received" });
    }
  });

  // ==================== PUBLIC ATTENDANCE SHARE LINK ====================

  // Public endpoint - no auth required (with optional player name slug for nice URLs)
  router.get("/public/attendance/:token/:playerSlug", async (req: Request, res: Response) => {
    return handlePublicAttendance(req, res);
  });
  router.get("/public/attendance/:token", async (req: Request, res: Response) => {
    return handlePublicAttendance(req, res);
  });

  async function handlePublicAttendance(req: Request, res: Response) {
    try {
      const { token } = req.params;
      if (!token || token.length < 8) {
        return res.status(404).send("<h1>Report not found</h1>");
      }

      // Look up the player by their share token
      const [player] = await db
        .select()
        .from(players)
        .where(eq(players.attendanceShareToken, token))
        .limit(1);

      if (!player) {
        return res.status(404).send("<h1>Report not found</h1>");
      }

      const { generateAttendanceReportHtml } = await import("../services/attendanceReportPdf");

      const academyId = player.academyId;
      const academy = academyId ? await storage.getAcademy(academyId) : null;

      const playerRecords = await db
        .select({
          sessionId: sessionPlayers.sessionId,
          attendanceStatus: sessionPlayers.attendanceStatus,
          lateMinutes: sessionPlayers.lateMinutes,
          creditDeductedAt: sessionPlayers.creditDeductedAt,
          creditTransactionId: sessionPlayers.creditTransactionId,
        })
        .from(sessionPlayers)
        .where(eq(sessionPlayers.playerId, player.id));

      const sessionIds = playerRecords.map((r) => r.sessionId).filter(Boolean);
      let sessionMap: Record<string, { startTime: Date; endTime: Date; sessionType: string; status: string; seriesId: string | null }> = {};

      if (sessionIds.length > 0) {
        const sessionDetails = await db
          .select({ id: sessions.id, startTime: sessions.startTime, endTime: sessions.endTime, sessionType: sessions.sessionType, status: sessions.status, seriesId: sessions.seriesId })
          .from(sessions)
          .where(inArray(sessions.id, sessionIds));

        sessionMap = sessionDetails.reduce((acc, s) => {
          acc[s.id] = { startTime: s.startTime, endTime: s.endTime, sessionType: s.sessionType, status: s.status, seriesId: s.seriesId };
          return acc;
        }, {} as typeof sessionMap);
      }

      const uniqueSeriesIds = [...new Set(Object.values(sessionMap).map((s) => s.seriesId).filter(Boolean))] as string[];
      let seriesMap: Record<string, { title: string; dayOfWeek: number; startTime: string; sessionType: string }> = {};

      if (uniqueSeriesIds.length > 0) {
        const seriesDetails = await db
          .select({ id: coachingSeries.id, title: coachingSeries.title, dayOfWeek: coachingSeries.dayOfWeek, startTime: coachingSeries.startTime, sessionType: coachingSeries.sessionType })
          .from(coachingSeries)
          .where(inArray(coachingSeries.id, uniqueSeriesIds));

        seriesMap = seriesDetails.reduce((acc, s) => {
          acc[s.id] = { title: s.title || "", dayOfWeek: s.dayOfWeek, startTime: s.startTime, sessionType: s.sessionType };
          return acc;
        }, {} as typeof seriesMap);
      }

      const now = new Date();
      const allSessionIds = playerRecords.map((r) => r.sessionId).filter(Boolean) as string[];
      const paidSessionIdSet = new Set<string>();

      if (allSessionIds.length > 0) {
        // Task #681 Phase 3 — derive "paid" from V2 ledger.
        // A session is paid when there is a `consume` row with a lot_id
        // attached (covered by an active credit lot, not an uncovered debt).
        const paidRows = await db.execute(sql`
          SELECT DISTINCT session_id
          FROM credit_ledger_v2
          WHERE player_id = ${player.id}
            AND reason = 'consume'
            AND lot_id IS NOT NULL
            AND session_id = ANY(${allSessionIds}::text[])
        `);
        type PaidSessionRow = { session_id: string | null };
        for (const row of paidRows.rows as PaidSessionRow[]) {
          if (row.session_id) paidSessionIdSet.add(row.session_id);
        }
      }

      type PublicAttendanceRecord = {
        sessionId: string | null;
        date: string;
        startTime: string;
        endTime: string;
        sessionType: string;
        status: string | null;
        lateMinutes: number | null;
        seriesId: string | null;
        paymentStatus: "paid" | "pending" | "cancelled" | "no_charge";
      };

      const records: PublicAttendanceRecord[] = playerRecords
        .map((record) => {
          const sessionInfo = record.sessionId ? sessionMap[record.sessionId] : null;
          if (!sessionInfo) return null;
          const sessionTime = new Date(sessionInfo.startTime);
          if (sessionTime > now) return null;
          const isCancelled = sessionInfo.status === "cancelled";
          const isNoCharge = record.attendanceStatus === "vacation" || record.attendanceStatus === "holiday";
          const isPaid = record.sessionId != null && paidSessionIdSet.has(record.sessionId);
          return {
            sessionId: record.sessionId,
            date: sessionInfo.startTime.toISOString().split("T")[0],
            startTime: sessionInfo.startTime.toISOString(),
            endTime: sessionInfo.endTime.toISOString(),
            sessionType: sessionInfo.sessionType,
            status: isCancelled ? "cancelled" : record.attendanceStatus || null,
            lateMinutes: record.lateMinutes,
            seriesId: sessionInfo.seriesId,
            paymentStatus: (isCancelled ? "cancelled" : isNoCharge ? "no_charge" : isPaid ? "paid" : "pending") as "paid" | "pending" | "cancelled" | "no_charge",
          };
        })
        .filter((r): r is PublicAttendanceRecord => r !== null)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Exclude cancelled, vacation, and holiday from lesson count and stats
      const nonCancelledRecords = records.filter(
        (r) => r.status !== "cancelled" && r.status !== "vacation" && r.status !== "holiday",
      );
      const presentCount = nonCancelledRecords.filter((r) => r.status === "present").length;
      const absentCount = nonCancelledRecords.filter((r) => r.status === "absent").length;

      const seriesSummaries = uniqueSeriesIds.map((seriesId) => {
        const seriesRecords = nonCancelledRecords.filter((r) => r.seriesId === seriesId);
        const seriesPresent = seriesRecords.filter((r) => r.status === "present").length;
        const seriesAbsent = seriesRecords.filter((r) => r.status === "absent").length;
        const seriesInfo = seriesMap[seriesId];
        return {
          series: { id: seriesId, title: seriesInfo?.title || "Unknown", dayOfWeek: seriesInfo?.dayOfWeek || 0, startTime: seriesInfo?.startTime || "", sessionType: seriesInfo?.sessionType || "group" },
          totalSessions: seriesRecords.length,
          presentCount: seriesPresent,
          absentCount: seriesAbsent,
          attendanceRate: seriesRecords.length > 0 ? Math.round((seriesPresent / seriesRecords.length) * 100) : 0,
        };
      }).sort((a, b) => a.series.dayOfWeek - b.series.dayOfWeek);

      const reportData = {
        reportDate: now.toISOString(),
        academy: { name: academy?.name || "Tennis Academy" },
        player: { name: player.name, ballLevel: player.ballLevel || undefined },
        summary: {
          totalSessions: nonCancelledRecords.length,
          presentCount,
          absentCount,
          attendanceRate: nonCancelledRecords.length > 0 ? Math.round((presentCount / nonCancelledRecords.length) * 100) : 0,
        },
        records,
        seriesMap: Object.fromEntries(Object.entries(seriesMap).map(([id, info]) => [id, { id, ...info }])),
        seriesSummaries,
      };

      const html = generateAttendanceReportHtml(reportData);
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error) {
      console.error("Error generating public attendance report:", error);
      res.status(500).send("<h1>Failed to generate report</h1>");
    }
  }

  // Generate (or return existing) attendance share token — auth required
  router.post(
    "/api/players/:id/attendance-share-token",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user?.academyId;
        const coachId = req.user?.coachId;
        const userRole = req.user?.role;

        const player = await storage.getPlayer(id);
        if (!player) return res.status(404).json({ error: "Player not found" });

        // Only coaches, assistants, academy owners and platform owners may generate share tokens
        const allowedRoles = ["coach", "assistant", "academy_owner", "platform_owner"];
        if (!allowedRoles.includes(userRole || "")) {
          return res.status(403).json({ error: "Access denied" });
        }

        const isPlatformOwner = userRole === "platform_owner";
        const isFromSameAcademy = academyId && player.academyId === academyId;
        const isAssignedCoach = coachId && player.coachId === coachId;

        if (!isPlatformOwner && !isFromSameAcademy && !isAssignedCoach) {
          return res.status(403).json({ error: "Access denied" });
        }

        let token = player.attendanceShareToken;
        if (!token || token.length > 15) {
          token = crypto.randomBytes(8).toString("base64url");
          await db.update(players).set({ attendanceShareToken: token }).where(eq(players.id, id));
        }

        const baseUrl = (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : `${req.protocol}://${req.get("host")}`);
        const playerSlug = player.name.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');
        const shareUrl = `${baseUrl}/public/attendance/${token}/${playerSlug}`;
        res.json({ token, shareUrl });
      } catch (error) {
        console.error("Error generating attendance share token:", error);
        res.status(500).json({ error: "Failed to generate share token" });
      }
    },
  );

  // ==================== BETA FEEDBACK ====================

  const betaFeedbackRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: { error: "Too many feedback submissions. Please wait before submitting again." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.post(
    "/api/beta-feedback",
    betaFeedbackRateLimiter,
    async (req: Request, res: Response) => {
      try {
        const { playerId, playerName, category, message } = req.body;

        if (!playerName || !category || !message) {
          return res.status(400).json({ error: "playerName, category and message are required" });
        }

        if (!["bug", "idea", "compliment"].includes(category)) {
          return res.status(400).json({ error: "Invalid category. Use: bug, idea, or compliment" });
        }

        if (message.length > 2000) {
          return res.status(400).json({ error: "Message too long (max 2000 characters)" });
        }

        const { betaFeedback: betaFeedbackTable } = await import("@shared/schema");

        const [inserted] = await db.insert(betaFeedbackTable).values({
          playerId: playerId || null,
          playerName: playerName.trim(),
          category,
          message: message.trim(),
        }).returning();

        res.status(201).json({ success: true, id: inserted.id });
      } catch (error) {
        console.error("[BetaFeedback] Error:", error);
        res.status(500).json({ error: "Failed to save feedback" });
      }
    },
  );

  router.get(
    "/api/beta-feedback",
    authMiddleware,
    requireRole("platform_owner"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { betaFeedback: betaFeedbackTable } = await import("@shared/schema");
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const offset = parseInt(req.query.offset as string) || 0;

        const items = await db
          .select()
          .from(betaFeedbackTable)
          .orderBy(desc(betaFeedbackTable.createdAt))
          .limit(limit)
          .offset(offset);

        const [{ total }] = await db
          .select({ total: count() })
          .from(betaFeedbackTable);

        res.json({ items, total: Number(total) });
      } catch (error) {
        console.error("[BetaFeedback] GET error:", error);
        res.status(500).json({ error: "Failed to fetch feedback" });
      }
    },
  );

// ==================== ICS CALENDAR FEED ====================

router.get(
  "/api/player/me/calendar-token",
  authMiddleware,
  requirePlayerOrOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(400).json({ error: "Player profile required" });
      }
      const secret = process.env.SESSION_SECRET || "fallback-secret";
      const token = crypto.createHmac("sha256", secret).update(playerId).digest("hex").slice(0, 32);
      res.json({ token });
    } catch (error) {
      console.error("[ICS] Token generation error:", error);
      res.status(500).json({ error: "Failed to generate token" });
    }
  },
);

function generateIcsToken(playerId: string): string {
  const secret = process.env.SESSION_SECRET || "fallback-secret";
  return crypto.createHmac("sha256", secret).update(playerId).digest("hex").slice(0, 32);
}

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcs(str: string): string {
  return (str || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

router.get(
  "/api/player/calendar/:playerId/sessions.ics",
  async (req: Request, res: Response) => {
    try {
      const { playerId } = req.params;
      const { token } = req.query;

      if (!token || token !== generateIcsToken(playerId)) {
        return res.status(401).send("Unauthorized");
      }

      const now = new Date();
      const rows = await db
        .select({
          sessionId: sessions.id,
          title: sessions.title,
          startTime: sessions.startTime,
          endTime: sessions.endTime,
          sessionType: sessions.sessionType,
          courtName: sessions.courtName,
          coachId: sessions.coachId,
        })
        .from(sessionPlayers)
        .innerJoin(sessions, eq(sessions.id, sessionPlayers.sessionId))
        .where(
          and(
            eq(sessionPlayers.playerId, playerId),
            gt(sessions.startTime, now),
            ne(sessions.status, "cancelled"),
          ),
        )
        .orderBy(asc(sessions.startTime));

      const coachIds = [...new Set(rows.map((r) => r.coachId).filter(Boolean))] as string[];
      const coachMap = new Map<string, string>();
      if (coachIds.length > 0) {
        const coachRows = await db
          .select({ id: coaches.id, name: coaches.name })
          .from(coaches)
          .where(inArray(coaches.id, coachIds));
        for (const c of coachRows) {
          if (c.name) coachMap.set(c.id, c.name);
        }
      }

      const lines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//GlowUp//Player Sessions//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:My Sessions",
        "X-WR-TIMEZONE:UTC",
      ];

      for (const row of rows) {
        const start = new Date(row.startTime);
        const end = row.endTime ? new Date(row.endTime) : new Date(start.getTime() + 60 * 60 * 1000);
        const coachName = row.coachId ? coachMap.get(row.coachId) : null;
        const description = coachName ? `Coach: ${coachName}` : "";
        const location = row.courtName || "";
        const title = row.title || row.sessionType || "Session";

        lines.push("BEGIN:VEVENT");
        lines.push(`UID:session-${row.sessionId}@glowup`);
        lines.push(`DTSTART:${formatIcsDate(start)}`);
        lines.push(`DTEND:${formatIcsDate(end)}`);
        lines.push(`SUMMARY:${escapeIcs(title)}`);
        if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`);
        if (location) lines.push(`LOCATION:${escapeIcs(location)}`);
        lines.push(`DTSTAMP:${formatIcsDate(new Date())}`);
        lines.push("END:VEVENT");
      }

      lines.push("END:VCALENDAR");

      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="sessions.ics"`);
      res.send(lines.join("\r\n"));
    } catch (error) {
      console.error("[ICS] Error generating calendar feed:", error);
      res.status(500).send("Failed to generate calendar");
    }
  },
);

export { generateIcsToken };
export default router;
