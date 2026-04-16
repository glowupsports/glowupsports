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
    sessionAiSummaries, playerAiInsights,
    glowSkills, playerSkillScores,
    playerSessionReflections,
    playerMonthlyAssessments,
    matchReflections,
    matches,
    aiCoachConversations,
    playerAiTrainingPlans,
    deepAssessmentPillarSummaries,
  } from "@shared/schema";
  import { sendFeedbackNotification, sendXPGainNotification, sendBadgeEarnedNotification, sendLevelUpNotification, getPlayerPushTokens } from "../pushNotifications";
  import { awardXP } from "../services/xp-service";
  import { aiQuotaMiddleware, logAiCall } from "../middleware/aiQuotaMiddleware";
  const router = Router();
  
    // ==================== PLAYER PROGRESS ====================

  // Get progress history for a player
  router.get(
    "/api/players/:id/progress",
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

        const progress = await storage.getPlayerProgress(
          id,
          academyId || undefined,
        );
        res.json(progress);
      } catch (error) {
        console.error("Error fetching player progress:", error);
        res.status(500).json({ error: "Failed to fetch progress" });
      }
    },
  );

  // Get progress summary for a player (aggregated by skill area)
  router.get(
    "/api/players/:id/progress/summary",
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

        const summary = await storage.getProgressSummary(
          id,
          academyId || undefined,
        );
        res.json(summary);
      } catch (error) {
        console.error("Error fetching progress summary:", error);
        res.status(500).json({ error: "Failed to fetch progress summary" });
      }
    },
  );

  // Generate progress report PDF for a player
  router.get(
    "/api/players/:id/progress-report",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;
        const coachId = req.user!.coachId;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const { generateProgressReportHtml, ProgressReportData } = await import(
          "./services/progressReportPdf"
        );

        const player = await storage.getPlayer(id);
        const academy = academyId ? await storage.getAcademy(academyId) : null;
        const coach = coachId ? await storage.getCoach(coachId) : null;
        const progressRecords = await storage.getPlayerProgress(
          id,
          academyId || undefined,
        );
        const summary = await storage.getProgressSummary(
          id,
          academyId || undefined,
        );

        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        const threeMonthsAgo = new Date(
          now.getFullYear(),
          now.getMonth() - 3,
          1,
        );

        const allSessions = await storage.getSessionsByAcademy(academyId || "");
        const playerSessions = await Promise.all(
          allSessions.map(async (session) => {
            const players = await storage.getSessionPlayers(session.id);
            const playerRecord = players.find((p) => p.playerId === id);
            return playerRecord ? { session, playerRecord } : null;
          }),
        ).then(
          (results) =>
            results.filter(Boolean) as Array<{
              session: any;
              playerRecord: any;
            }>,
        );

        const recentSessions = playerSessions.filter((ps) => {
          const sessionDate = new Date(ps.session.date);
          return sessionDate >= threeMonthsAgo && sessionDate <= now && ps.session.status !== "cancelled" && ps.playerRecord.attendanceStatus !== "cancelled";
        });

        const attendedSessionsAll = sessions.filter(
          (s: any) =>
            (s.attendanceStatus === "present" || s.status === "completed") &&
            new Date(s.startTime) <= dubaiNow,
        );
        const attendedSessions = recentSessions.filter(
          (ps) =>
            ps.playerRecord.attendanceStatus === "present" ||
            ps.playerRecord.attendanceStatus === "late",
        );

        const totalMinutes = attendedSessions.reduce(
          (sum, ps) => sum + (ps.session.duration || 60),
          0,
        );
        const attendanceRate =
          recentSessions.length > 0
            ? Math.round(
                (attendedSessions.length / recentSessions.length) * 100,
              )
            : 0;

        const pillars = (
          (summary as Array<{
            skillArea: string;
            latestRating: number;
            trend: string;
          }>) || []
        ).map((s) => ({
          name: s.skillArea || "General",
          score: s.latestRating || 0,
          maxScore: 10,
          trend: (s.trend as "up" | "down" | "stable") || "stable",
        }));

        const defaultPillars = [
          "Technique",
          "Tactical",
          "Physical",
          "Mental",
          "Social",
          "Match",
        ];
        const existingPillarNames = pillars.map((p) => p.name);
        const missingPillars = defaultPillars.filter(
          (p) => !existingPillarNames.includes(p),
        );
        missingPillars.forEach((name) => {
          pillars.push({
            name,
            score: 0,
            maxScore: 10,
            trend: "stable" as const,
          });
        });

        const reportData: typeof ProgressReportData = {
          reportDate: now.toISOString(),
          period: {
            from: threeMonthsAgo.toISOString(),
            to: now.toISOString(),
          },
          academy: {
            name: academy?.name || "Tennis Academy",
          },
          coach: {
            name: coach?.name || "Coach",
            title: coach?.specialty || undefined,
          },
          player: {
            name: player?.name || "Player",
            age: player?.age || undefined,
            ballLevel: player?.ballLevel || "RED_1",
            xpLevel: player?.level || 1,
            totalXp: player?.totalXp || 0,
          },
          pillars,
          skills: [],
          sessionsSummary: {
            totalSessions: recentSessions.length,
            attendedSessions: attendedSessions.length,
            attendanceRate,
            totalMinutes,
          },
          achievements: [],
          recommendations: [
            "Continue with regular practice sessions",
            "Focus on developing identified improvement areas",
            "Participate in match play opportunities when available",
          ],
        };

        const html = generateProgressReportHtml(reportData as any);

        res.setHeader("Content-Type", "text/html");
        res.send(html);
      } catch (error) {
        console.error("Error generating progress report:", error);
        res.status(500).json({ error: "Failed to generate progress report" });
      }
    },
  );

  // Generate attendance report PDF for a player
  router.get(
    "/api/players/:id/attendance-report",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user?.academyId;
        const coachId = req.user?.coachId;
        const userRole = req.user?.role;

        // Get the player first
        const player = await storage.getPlayer(id);
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Allow access if user is from same academy, assigned coach, or platform owner
        const isFromSameAcademy = academyId && player.academyId === academyId;
        const isAssignedCoach = coachId && player.coachId === coachId;
        const isPlatformOwner = userRole === "platform_owner";

        if (!isFromSameAcademy && !isAssignedCoach && !isPlatformOwner) {
          return res.status(404).json({ error: "Player not found" });
        }
        const { generateAttendanceReportHtml, AttendanceReportData } =
          await import("../services/attendanceReportPdf");

        const academy = academyId ? await storage.getAcademy(academyId) : null;

        // Get attendance history (past sessions only)
        const playerRecords = await db
          .select({
            sessionId: sessionPlayers.sessionId,
            attendanceStatus: sessionPlayers.attendanceStatus,
            lateMinutes: sessionPlayers.lateMinutes,
            creditDeductedAt: sessionPlayers.creditDeductedAt,
            creditTransactionId: sessionPlayers.creditTransactionId,
          })
          .from(sessionPlayers)
          .where(eq(sessionPlayers.playerId, id));

        const sessionIds = playerRecords
          .map((r) => r.sessionId)
          .filter(Boolean);
        let sessionMap: Record<
          string,
          {
            startTime: Date;
            endTime: Date;
            sessionType: string;
            status: string;
            seriesId: string | null;
          }
        > = {};

        if (sessionIds.length > 0) {
          const sessionDetails = await db
            .select({
              id: sessions.id,
              startTime: sessions.startTime,
              endTime: sessions.endTime,
              sessionType: sessions.sessionType,
              status: sessions.status,
              seriesId: sessions.seriesId,
            })
            .from(sessions)
            .where(inArray(sessions.id, sessionIds));

          sessionMap = sessionDetails.reduce(
            (acc, s) => {
              acc[s.id] = {
                startTime: s.startTime,
                endTime: s.endTime,
                sessionType: s.sessionType,
                status: s.status,
                seriesId: s.seriesId,
              };
              return acc;
            },
            {} as Record<
              string,
              {
                startTime: Date;
                endTime: Date;
                sessionType: string;
                status: string;
                seriesId: string | null;
              }
            >,
          );
        }

        // Fetch series info for all unique seriesIds
        const uniqueSeriesIds = [
          ...new Set(
            Object.values(sessionMap)
              .map((s) => s.seriesId)
              .filter(Boolean),
          ),
        ] as string[];
        let seriesMap: Record<
          string,
          {
            title: string;
            dayOfWeek: number;
            startTime: string;
            sessionType: string;
          }
        > = {};

        if (uniqueSeriesIds.length > 0) {
          const seriesDetails = await db
            .select({
              id: coachingSeries.id,
              title: coachingSeries.title,
              dayOfWeek: coachingSeries.dayOfWeek,
              startTime: coachingSeries.startTime,
              sessionType: coachingSeries.sessionType,
            })
            .from(coachingSeries)
            .where(inArray(coachingSeries.id, uniqueSeriesIds));

          seriesMap = seriesDetails.reduce(
            (acc, s) => {
              acc[s.id] = {
                title: s.title || "",
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                sessionType: s.sessionType,
              };
              return acc;
            },
            {} as Record<
              string,
              {
                title: string;
                dayOfWeek: number;
                startTime: string;
                sessionType: string;
              }
            >,
          );
        }

        // Filter out future sessions - compare directly in UTC
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        console.log(
          "[AttendanceReport] Current time (UTC):",
          now.toISOString(),
        );

        // Look up ALL credit transactions for this player's sessions to determine payment
        // This covers all paths: direct package deductions, settled debts, retrospective settlements
        const allSessionIds = playerRecords
          .map((r) => r.sessionId)
          .filter(Boolean) as string[];
        const paidSessionIdSet = new Set<string>();

        if (allSessionIds.length > 0) {
          const sessionTxs = await db
            .select({
              sessionId: creditTransactions.sessionId,
              reason: creditTransactions.reason,
              packageId: creditTransactions.packageId,
              metadata: creditTransactions.metadata,
            })
            .from(creditTransactions)
            .where(
              and(
                eq(creditTransactions.playerId, id),
                inArray(creditTransactions.sessionId, allSessionIds),
                eq(creditTransactions.type, "debit"),
              ),
            );

          for (const tx of sessionTxs) {
            if (!tx.sessionId) continue;
            const isDebtReason =
              tx.reason === "session_debt" ||
              tx.reason === "session_join_debt" ||
              tx.reason === "session_unpaid";

            if (!isDebtReason && tx.packageId) {
              paidSessionIdSet.add(tx.sessionId);
            } else if (isDebtReason) {
              const meta = tx.metadata as Record<string, any> | null;
              if (meta?.settled === true || meta?.settledByPackage) {
                paidSessionIdSet.add(tx.sessionId);
              }
            }
          }
        }

        const records = playerRecords
          .map((record) => {
            const sessionInfo = record.sessionId
              ? sessionMap[record.sessionId]
              : null;
            if (!sessionInfo) return null;

            const sessionTime = new Date(sessionInfo.startTime);
            if (sessionTime > now) return null;

            const isCancelled = sessionInfo.status === "cancelled";
            const isNoCharge =
              record.attendanceStatus === "vacation" ||
              record.attendanceStatus === "holiday";
            const isPaid =
              record.sessionId && paidSessionIdSet.has(record.sessionId);

            return {
              sessionId: record.sessionId,
              date: sessionInfo.startTime.toISOString().split("T")[0],
              startTime: sessionInfo.startTime.toISOString(),
              endTime: sessionInfo.endTime.toISOString(),
              sessionType: sessionInfo.sessionType,
              status: isCancelled
                ? "cancelled"
                : record.attendanceStatus || null,
              lateMinutes: record.lateMinutes,
              seriesId: sessionInfo.seriesId,
              paymentStatus: isCancelled
                ? "cancelled"
                : isNoCharge
                  ? "no_charge"
                  : isPaid
                    ? "paid"
                    : "pending",
            };
          })
          .filter(Boolean)
          .sort(
            (a: any, b: any) =>
              new Date(b!.date).getTime() - new Date(a!.date).getTime(),
          ) as any[];

        console.log(
          "[AttendanceReport] Total records after filtering:",
          records.length,
        );

        // Exclude cancelled, vacation, and holiday from lesson count and stats
        const nonCancelledRecords = records.filter(
          (r) => r.status !== "cancelled" && r.status !== "vacation" && r.status !== "holiday",
        );
        const presentCount = nonCancelledRecords.filter(
          (r) => r.status === "present",
        ).length;
        const absentCount = nonCancelledRecords.filter((r) => r.status === "absent").length;

        const seriesSummaries = uniqueSeriesIds
          .map((seriesId) => {
            const seriesRecords = nonCancelledRecords.filter(
              (r) => r.seriesId === seriesId,
            );
            const seriesPresent = seriesRecords.filter(
              (r) => r.status === "present",
            ).length;
            const seriesAbsent = seriesRecords.filter(
              (r) => r.status === "absent",
            ).length;
            const seriesInfo = seriesMap[seriesId];

            return {
              series: {
                id: seriesId,
                title: seriesInfo?.title || "Unknown",
                dayOfWeek: seriesInfo?.dayOfWeek || 0,
                startTime: seriesInfo?.startTime || "",
                sessionType: seriesInfo?.sessionType || "group",
              },
              totalSessions: seriesRecords.length,
              presentCount: seriesPresent,
              absentCount: seriesAbsent,
              attendanceRate:
                seriesRecords.length > 0
                  ? Math.round((seriesPresent / seriesRecords.length) * 100)
                  : 0,
            };
          })
          .sort((a, b) => a.series.dayOfWeek - b.series.dayOfWeek);

        const reportData = {
          reportDate: now.toISOString(),
          academy: {
            name: academy?.name || "Tennis Academy",
          },
          player: {
            name: player?.name || "Player",
            ballLevel: player?.ballLevel || undefined,
          },
          summary: {
            totalSessions: nonCancelledRecords.length,
            presentCount,
            absentCount,
            attendanceRate:
              nonCancelledRecords.length > 0
                ? Math.round((presentCount / nonCancelledRecords.length) * 100)
                : 0,
          },
          records,
          seriesMap: Object.fromEntries(
            Object.entries(seriesMap).map(([id, info]) => [
              id,
              { id, ...info },
            ]),
          ),
          seriesSummaries,
        };

        const html = generateAttendanceReportHtml(reportData);

        res.setHeader("Content-Type", "text/html");
        res.send(html);
      } catch (error) {
        console.error("Error generating attendance report:", error);
        res.status(500).json({ error: "Failed to generate attendance report" });
      }
    },
  );
  // Add progress entry for a player
  router.post(
    "/api/players/:id/progress",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Get all players with their progress summary (for coaching dashboard)
  router.get(
    "/api/coach/players/progress",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const allPlayers = await storage.getAllPlayers();
        const playersWithProgress = await Promise.all(
          allPlayers.map(async (player) => {
            const summary = await storage.getProgressSummary(
              player.id,
              player.academyId || undefined,
            );
            const notes = await storage.getPlayerNotes(
              player.id,
              player.academyId || undefined,
            );
            const totalXp = await storage.getPlayerTotalXp(
              player.id,
              player.academyId || undefined,
            );
            const pinnedNotes = notes.filter((n) => n.isPinned);
            const recentNote = notes[0];
            return {
              ...player,
              progressSummary: summary,
              pinnedNotes,
              recentNote,
              totalNotes: notes.length,
              totalXp,
            };
          }),
        );
        res.json(playersWithProgress);
      } catch (error) {
        console.error("Error fetching players with progress:", error);
        res
          .status(500)
          .json({ error: "Failed to fetch players with progress" });
      }
    },
  );

  // Get player attendance summary (for player profile)
  router.get(
    "/api/coach/players/:playerId/attendance-summary",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { playerId } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(
          playerId,
          academyId,
          storage,
        );
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Get all session_players records for this player with session status
        const sessionPlayerRecords = await db
          .select({
            sessionId: sessionPlayers.sessionId,
            attendanceStatus: sessionPlayers.attendanceStatus,
            lateMinutes: sessionPlayers.lateMinutes,
            sessionStatus: sessions.status,
            startTime: sessions.startTime,
            sessionType: sessions.sessionType,
          })
          .from(sessionPlayers)
          .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
          .where(eq(sessionPlayers.playerId, playerId));

        // Also find completed sessions from series the player belongs to that are missing sessionPlayers records
        // This handles cases where "Add Extra Lesson" created sessions without proper sessionPlayers records
        // CRITICAL: Only include sessions that happened AFTER the player joined the series
        const playerSeriesData = await db
          .select({
            seriesId: seriesPlayers.seriesId,
            joinedAt: seriesPlayers.joinedAt,
            createdAt: seriesPlayers.createdAt,
            leftAt: seriesPlayers.leftAt,
          })
          .from(seriesPlayers)
          .where(
            and(
              eq(seriesPlayers.playerId, playerId),
              inArray(seriesPlayers.status, ["active", "paused", "left"]),
            ),
          );

        const seriesIdList = playerSeriesData
          .map((s) => s.seriesId)
          .filter(Boolean) as string[];
        const seriesJoinDates = new Map(
          playerSeriesData.map((s) => [s.seriesId, s.joinedAt ?? s.createdAt]),
        );
        const seriesLeftDates = new Map(
          playerSeriesData.map((s) => [s.seriesId, s.leftAt]),
        );
        const existingSessionIds = new Set(
          sessionPlayerRecords.map((r) => r.sessionId),
        );

        let orphanedCompletedSessions: {
          sessionId: string;
          sessionStatus: string;
          startTime: Date | null;
          sessionType: string | null;
        }[] = [];
        if (seriesIdList.length > 0) {
          const seriesSessions = await db
            .select({
              id: sessions.id,
              status: sessions.status,
              seriesId: sessions.seriesId,
              startTime: sessions.startTime,
              sessionType: sessions.sessionType,
            })
            .from(sessions)
            .where(
              and(
                inArray(sessions.seriesId, seriesIdList),
                eq(sessions.status, "completed"),
              ),
            );
          orphanedCompletedSessions = seriesSessions
            .filter((s) => {
              if (existingSessionIds.has(s.id)) return false;
              const joinDate = s.seriesId
                ? seriesJoinDates.get(s.seriesId)
                : null;
              if (joinDate && s.startTime) {
                const sessionTime = new Date(s.startTime);
                if (sessionTime < new Date(joinDate)) return false;
                const leftDate = s.seriesId ? seriesLeftDates.get(s.seriesId) : null;
                const upperBound = leftDate ? new Date(leftDate) : new Date();
                if (sessionTime > upperBound) return false;
                return true;
              }
              return false;
            })
            .map((s) => ({ sessionId: s.id, sessionStatus: s.status, startTime: s.startTime, sessionType: s.sessionType }));
        }

        // Combine: all sessionPlayers records + orphaned completed sessions (treated as present)
        const allRecords = [
          ...sessionPlayerRecords,
          ...orphanedCompletedSessions.map((s) => ({
            sessionId: s.sessionId,
            attendanceStatus: null as string | null,
            lateMinutes: null as number | null,
            sessionStatus: s.sessionStatus,
            startTime: s.startTime,
            sessionType: s.sessionType,
          })),
        ];

        // Count by attendance status (excluding cancelled sessions, holidays, and vacation)
        const nonCancelledRecords = allRecords.filter(
          (r) => r.sessionStatus !== "cancelled" && r.attendanceStatus !== "holiday" && r.attendanceStatus !== "vacation",
        );

        const now = new Date();

        // A session "happened" = completed, OR has attendance marked, OR start time is in the past
        const isSessionInPast = (r: { sessionStatus: string; startTime: Date | null; attendanceStatus: string | null; sessionType: string | null }) =>
          r.sessionStatus === "completed" ||
          r.attendanceStatus !== null ||
          (r.startTime !== null && new Date(r.startTime) < now);

        // Only count sessions that have actually happened (exclude future scheduled ones)
        const happenedRecords = nonCancelledRecords.filter(isSessionInPast);

        const totalLessons = happenedRecords.length;
        const presentCount = happenedRecords.filter(
          (r) => r.attendanceStatus === "present",
        ).length;
        const absentCount = happenedRecords.filter(
          (r) => r.attendanceStatus === "absent",
        ).length;
        const lateCount = happenedRecords.filter(
          (r) => r.lateMinutes && r.lateMinutes > 0,
        ).length;

        const isPrivateType = (type: string | null) =>
          type === "private" || type === "private_adjusted";
        const isSemiPrivateType = (type: string | null) =>
          type === "semi" || type === "semi_private";

        // attendedCount excludes:
        // - private sessions where the player was absent (a missed 1-on-1 didn't happen)
        // - semi-private sessions where the player was absent (the session auto-converts
        //   to private_adjusted for the other player, so absent player effectively didn't have it)
        const privateAbsentCount = happenedRecords.filter(
          (r) => isPrivateType(r.sessionType) && r.attendanceStatus === "absent",
        ).length;
        const semiPrivateAbsentCount = happenedRecords.filter(
          (r) =>
            isSemiPrivateType(r.sessionType) && r.attendanceStatus === "absent",
        ).length;
        const attendedCount =
          totalLessons - privateAbsentCount - semiPrivateAbsentCount;

        // For percentage: treat sessions without explicit attendance (but in the past/completed) as "present"
        // Exclude semi-private absent records from the denominator so the percentage isn't skewed
        // by sessions that don't count toward the player's totals.
        const effectivePresentCount =
          presentCount +
          happenedRecords.filter(
            (r) => !r.attendanceStatus || (r.sessionStatus === "completed" && !r.attendanceStatus),
          ).length;

        const percentageDenominator = totalLessons - semiPrivateAbsentCount;
        const actuallyAttendedCount = effectivePresentCount + lateCount;
        const attendancePercentage =
          percentageDenominator > 0
            ? Math.round((effectivePresentCount / percentageDenominator) * 100)
            : 0;

        if (orphanedCompletedSessions.length > 0) {
          console.log(
            "[AttendanceSummary] Player:",
            playerId,
            "Found",
            orphanedCompletedSessions.length,
            "orphaned completed sessions without sessionPlayers records",
          );
        }
        console.log(
          "[AttendanceSummary] Player:",
          playerId,
          "Attended:",
          attendedCount,
          "Present:",
          presentCount,
          "Absent:",
          absentCount,
          "Percentage:",
          attendancePercentage,
          "%",
        );
        res.json({
          totalLessons,
          attendedCount,
          actuallyAttendedCount,
          presentCount,
          absentCount,
          attendancePercentage,
          lateCount,
        });
      } catch (error) {
        console.error("Error fetching player attendance summary:", error);
        res.status(500).json({ error: "Failed to fetch attendance summary" });
      }
    },
  );

  // Get all feedback given to a player by this coach
  router.get(
    "/api/coach/players/:playerId/feedback-history",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { playerId } = req.params;
        const academyId = req.user!.academyId;
        const coachUserId = req.user!.userId;

        const { valid } = await validatePlayerOwnership(
          playerId,
          academyId,
          storage,
        );
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const feedback = await db
          .select({
            id: inSessionFeedback.id,
            feedbackType: inSessionFeedback.feedbackType,
            message: inSessionFeedback.message,
            xpAwarded: inSessionFeedback.xpAwarded,
            visibility: inSessionFeedback.visibility,
            createdAt: inSessionFeedback.createdAt,
            sessionId: inSessionFeedback.sessionId,
            sessionDate: sessions.startTime,
            sessionTitle: sessions.title,
          })
          .from(inSessionFeedback)
          .leftJoin(sessions, eq(inSessionFeedback.sessionId, sessions.id))
          .where(
            and(
              eq(inSessionFeedback.playerId, playerId),
              eq(inSessionFeedback.coachId, coachUserId),
            ),
          )
          .orderBy(desc(inSessionFeedback.createdAt))
          .limit(100);

        res.json({ feedback });
      } catch (error) {
        console.error("Error fetching player feedback history:", error);
        res.status(500).json({ error: "Failed to fetch feedback history" });
      }
    },
  );

  // Get player's active quests (for coach view)
  router.get(
    "/api/coach/players/:playerId/quests",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { playerId } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const activeQuests = await db
          .select({
            id: playerQuestsTable.id,
            name: questTemplatesTable.name,
            description: questTemplatesTable.description,
            iconName: questTemplatesTable.iconName,
            iconColor: questTemplatesTable.iconColor,
            category: questTemplatesTable.category,
            questType: questTemplatesTable.questType,
            currentProgress: playerQuestsTable.currentProgress,
            targetProgress: playerQuestsTable.targetProgress,
            status: playerQuestsTable.status,
            xpReward: playerQuestsTable.xpReward,
            expiresAt: playerQuestsTable.expiresAt,
            personalisedBy: playerQuestsTable.personalisedBy,
          })
          .from(playerQuestsTable)
          .innerJoin(questTemplatesTable, eq(playerQuestsTable.questTemplateId, questTemplatesTable.id))
          .where(
            and(
              eq(playerQuestsTable.playerId, playerId),
              inArray(playerQuestsTable.status, ["active", "completed"])
            )
          )
          .orderBy(asc(questTemplatesTable.order));

        res.json({ quests: activeQuests });
      } catch (error) {
        console.error("Error fetching player quests for coach:", error);
        res.status(500).json({ error: "Failed to fetch player quests" });
      }
    }
  );

  // Get player full attendance history with session details
  router.get(
    "/api/coach/players/:playerId/attendance-history",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { playerId } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(
          playerId,
          academyId,
          storage,
        );
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Step 1: Get all session_players records for this player
        const playerRecords = await db
          .select({
            sessionId: sessionPlayers.sessionId,
            attendanceStatus: sessionPlayers.attendanceStatus,
            lateMinutes: sessionPlayers.lateMinutes,
          })
          .from(sessionPlayers)
          .where(eq(sessionPlayers.playerId, playerId));

        // Step 1.5: Find orphaned completed sessions (in player's series but no sessionPlayers record)
        // CRITICAL: Only include sessions that happened AFTER the player joined the series (and before they left)
        const playerSeriesForHistory = await db
          .select({
            seriesId: seriesPlayers.seriesId,
            joinedAt: seriesPlayers.joinedAt,
            createdAt: seriesPlayers.createdAt,
            leftAt: seriesPlayers.leftAt,
          })
          .from(seriesPlayers)
          .where(
            and(
              eq(seriesPlayers.playerId, playerId),
              inArray(seriesPlayers.status, ["active", "paused", "left"]),
            ),
          );
        const seriesIdsForHistory = playerSeriesForHistory
          .map((s) => s.seriesId)
          .filter(Boolean) as string[];
        const seriesJoinDatesForHistory = new Map(
          playerSeriesForHistory.map((s) => [s.seriesId, s.joinedAt ?? s.createdAt]),
        );
        const seriesLeftDatesForHistory = new Map(
          playerSeriesForHistory.map((s) => [s.seriesId, s.leftAt]),
        );
        const existingSessionIdsForHistory = new Set(
          playerRecords.map((r) => r.sessionId),
        );

        if (seriesIdsForHistory.length > 0) {
          const orphanedSessions = await db
            .select({
              id: sessions.id,
              status: sessions.status,
              seriesId: sessions.seriesId,
              startTime: sessions.startTime,
            })
            .from(sessions)
            .where(
              and(
                inArray(sessions.seriesId, seriesIdsForHistory),
                eq(sessions.status, "completed"),
              ),
            );
          const orphaned = orphanedSessions.filter((s) => {
            if (existingSessionIdsForHistory.has(s.id)) return false;
            const joinDate = s.seriesId
              ? seriesJoinDatesForHistory.get(s.seriesId)
              : null;
            if (joinDate && s.startTime) {
              const sessionTime = new Date(s.startTime);
              if (sessionTime < new Date(joinDate)) return false;
              const leftDate = s.seriesId ? seriesLeftDatesForHistory.get(s.seriesId) : null;
              const upperBound = leftDate ? new Date(leftDate) : new Date();
              if (sessionTime > upperBound) return false;
              return true;
            }
            return false;
          });
          for (const s of orphaned) {
            playerRecords.push({
              sessionId: s.id,
              attendanceStatus: null,
              lateMinutes: null,
            });
          }
          if (orphaned.length > 0) {
            console.log(
              `[AttendanceHistory] Found ${orphaned.length} orphaned completed sessions for player ${playerId} (filtered by join/left date window)`,
            );
          }
        }

        // Step 2: Get session details separately to avoid Drizzle LEFT JOIN issues
        const sessionIds = playerRecords
          .map((r) => r.sessionId)
          .filter(Boolean);
        let sessionMap: Record<
          string,
          {
            startTime: Date;
            endTime: Date;
            sessionType: string;
            status: string;
            seriesId: string | null;
          }
        > = {};

        if (sessionIds.length > 0) {
          const sessionDetails = await db
            .select({
              id: sessions.id,
              startTime: sessions.startTime,
              endTime: sessions.endTime,
              sessionType: sessions.sessionType,
              status: sessions.status,
              seriesId: sessions.seriesId,
            })
            .from(sessions)
            .where(inArray(sessions.id, sessionIds));

          sessionMap = sessionDetails.reduce(
            (acc, s) => {
              acc[s.id] = {
                startTime: s.startTime,
                endTime: s.endTime,
                sessionType: s.sessionType,
                status: s.status,
                seriesId: s.seriesId,
              };
              return acc;
            },
            {} as Record<
              string,
              {
                startTime: Date;
                endTime: Date;
                sessionType: string;
                status: string;
                seriesId: string | null;
              }
            >,
          );
        }

        // Step 2.5: Fetch series info for grouping
        const uniqueSeriesIds = [
          ...new Set(
            Object.values(sessionMap)
              .map((s) => s.seriesId)
              .filter(Boolean),
          ),
        ] as string[];
        let seriesMap: Record<
          string,
          {
            title: string;
            dayOfWeek: number;
            startTime: string;
            sessionType: string;
          }
        > = {};

        if (uniqueSeriesIds.length > 0) {
          const seriesDetails = await db
            .select({
              id: coachingSeries.id,
              title: coachingSeries.title,
              dayOfWeek: coachingSeries.dayOfWeek,
              startTime: coachingSeries.startTime,
              sessionType: coachingSeries.sessionType,
            })
            .from(coachingSeries)
            .where(inArray(coachingSeries.id, uniqueSeriesIds));

          seriesMap = seriesDetails.reduce(
            (acc, s) => {
              acc[s.id] = {
                title: s.title || "",
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                sessionType: s.sessionType,
              };
              return acc;
            },
            {} as Record<
              string,
              {
                title: string;
                dayOfWeek: number;
                startTime: string;
                sessionType: string;
              }
            >,
          );
        }

        // Step 3: Combine and sort
        const combinedRecords = playerRecords.map((record) => {
          const sessionInfo = record.sessionId
            ? sessionMap[record.sessionId]
            : null;
          return {
            sessionId: record.sessionId,
            attendanceStatus: record.attendanceStatus,
            lateMinutes: record.lateMinutes,
            sessionStartTime: sessionInfo?.startTime || null,
            sessionEndTime: sessionInfo?.endTime || null,
            sessionType: sessionInfo?.sessionType || null,
            sessionStatus: sessionInfo?.status || null,
            seriesId: sessionInfo?.seriesId || null,
          };
        });

        // Filter out future sessions - only show history (past sessions)
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        const isSemiPrivateType = (type: string | null) =>
          type === "semi" || type === "semi_private";
        const pastRecords = combinedRecords.filter((record) => {
          if (!record.sessionStartTime) return false;
          const status = record.attendanceStatus;
          if (status === "holiday" || status === "vacation") return false;
          // For semi-private sessions, hide absent and cancelled rows so the
          // history list matches the "sessions had" total (those sessions don't
          // count for the player — they auto-convert to private_adjusted for the
          // remaining player).
          if (isSemiPrivateType(record.sessionType)) {
            if (record.sessionStatus === "cancelled") return false;
            if (status === "absent") return false;
          }
          return new Date(record.sessionStartTime) < now;
        });

        // Sort by session start time (newest first)
        const sortedRecords = pastRecords.sort((a, b) => {
          const dateA = a.sessionStartTime
            ? new Date(a.sessionStartTime)
            : new Date(0);
          const dateB = b.sessionStartTime
            ? new Date(b.sessionStartTime)
            : new Date(0);
          return dateB.getTime() - dateA.getTime();
        });

        // Format for frontend - include records even if session details are missing
        const history = sortedRecords.map((record) => {
          const seriesInfo = record.seriesId
            ? seriesMap[record.seriesId]
            : null;
          return {
            sessionId: record.sessionId,
            date: record.sessionStartTime
              ? new Date(record.sessionStartTime).toISOString().split("T")[0]
              : null,
            startTime: record.sessionStartTime || null,
            endTime: record.sessionEndTime || null,
            sessionType: record.sessionType || "group",
            status:
              record.sessionStatus === "cancelled"
                ? "cancelled"
                : record.attendanceStatus ||
                  (record.sessionStatus === "completed" ? "present" : null),
            lateMinutes: record.lateMinutes,
            sessionStatus: record.sessionStatus || "completed",
            seriesId: record.seriesId,
            seriesDayOfWeek: seriesInfo?.dayOfWeek ?? null,
            seriesTitle: seriesInfo?.title || null,
          };
        });

        const nonCancelledHistory = history.filter((r) => r.status !== "cancelled");
        const seriesSummaries = uniqueSeriesIds
          .map((seriesId) => {
            const seriesRecords = nonCancelledHistory.filter(
              (r) => r.seriesId === seriesId,
            );
            const presentCount = seriesRecords.filter(
              (r) => r.status === "present",
            ).length;
            const absentCount = seriesRecords.filter(
              (r) => r.status === "absent",
            ).length;
            const seriesInfo = seriesMap[seriesId];
            const total = seriesRecords.length;

            return {
              seriesId,
              dayOfWeek: seriesInfo?.dayOfWeek ?? 0,
              dayName: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                seriesInfo?.dayOfWeek ?? 0
              ],
              startTime: seriesInfo?.startTime || "",
              title: seriesInfo?.title || "",
              totalSessions: total,
              presentCount,
              absentCount,
              attendanceRate:
                total > 0 ? Math.round((presentCount / total) * 100) : 0,
            };
          })
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek);

        res.json({ history, seriesSummaries });
      } catch (error) {
        console.error("Error fetching player attendance history:", error);
        res.status(500).json({ error: "Failed to fetch attendance history" });
      }
    },
  );

  // Coach-accessible credit repair for their players
  router.post(
    "/api/coach/players/:playerId/repair-credits",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { playerId } = req.params;
        const academyId = req.user!.academyId;

        // Validate player ownership
        const { valid } = await validatePlayerOwnership(
          playerId,
          academyId,
          storage,
        );
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const player = await storage.getPlayer(playerId);
        const result = await storage.repairPlayerCredits(playerId);

        if (result.success) {
          console.log(
            `[CreditRepair] Coach repaired credits for ${player?.name || playerId}: consumed=${result.consumed}, debts=${result.debts}`,
          );
          res.json({
            message: `Repaired credits for ${player?.name || playerId}`,
            ...result,
          });
        } else {
          res.status(500).json({
            error: "Repair failed",
            ...result,
          });
        }
      } catch (error) {
        console.error("Credit repair error:", error);
        res.status(500).json({ error: "Failed to repair credits" });
      }
    },
  );

  // Update player attendance status with credit adjustment
  router.patch(
    "/api/coach/players/:playerId/sessions/:sessionId/attendance",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { playerId, sessionId } = req.params;
        const { newStatus } = req.body; // present, absent, late, holiday
        const academyId = req.user!.academyId;

        if (!["present", "absent", "late", "holiday"].includes(newStatus)) {
          return res
            .status(400)
            .json({
              error:
                "Invalid status. Must be: present, absent, late, or holiday",
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

        // Get the session player record
        const [spRecord] = await db
          .select()
          .from(sessionPlayers)
          .where(
            and(
              eq(sessionPlayers.playerId, playerId),
              eq(sessionPlayers.sessionId, sessionId),
            ),
          )
          .limit(1);

        if (!spRecord) {
          return res
            .status(404)
            .json({ error: "Session enrollment not found" });
        }

        const oldStatus = spRecord.attendanceStatus;

        // Get session info for credit type
        const [sessionInfo] = await db
          .select({
            sessionType: sessions.sessionType,
          })
          .from(sessions)
          .where(eq(sessions.id, sessionId))
          .limit(1);

        if (!sessionInfo) {
          return res.status(404).json({ error: "Session not found" });
        }

        const creditType = sessionInfo.sessionType.includes("semi")
          ? "semi_private"
          : sessionInfo.sessionType.includes("group")
            ? "group"
            : "private";

        // Determine credit adjustment needed
        const wasCharged = oldStatus === "present" || oldStatus === "late";
        const willBeCharged = newStatus === "present" || newStatus === "late";

        let creditAdjustment = 0;
        let adjustmentReason = "";

        if (wasCharged && !willBeCharged) {
          // Refund credit (changing from present/late to absent/holiday)
          creditAdjustment = 1;
          adjustmentReason = "attendance_correction_refund";
        } else if (!wasCharged && willBeCharged) {
          // Deduct credit (changing from absent/holiday to present/late)
          creditAdjustment = -1;
          adjustmentReason = "attendance_correction_deduct";
        }

        // Update the attendance status
        await db
          .update(sessionPlayers)
          .set({
            attendanceStatus: newStatus,
            creditDeductedAt: willBeCharged
              ? spRecord.creditDeductedAt || new Date()
              : null,
          })
          .where(eq(sessionPlayers.id, spRecord.id));

        // Record credit transaction and update package balance if there is an adjustment
        if (creditAdjustment !== 0) {
          const transactionId = `attendance-correction-${sessionId}-${playerId}-${Date.now()}`;

          if (creditAdjustment > 0) {
            // Refund: check if original charge was a debt — if so, cancel the debt instead
            const cancelResult = await storage.cancelSessionDebt(playerId, sessionId);
            if (!cancelResult.cancelled) {
              await db.insert(creditTransactions).values({
                id: transactionId,
                playerId: playerId,
                sessionId: sessionId,
                type: "refund",
                amount: creditAdjustment,
                reason: adjustmentReason,
                creditType: creditType,
                metadata: {
                  oldStatus,
                  newStatus,
                  correctedBy: req.user!.coachId || req.user!.id,
                  correctedAt: new Date().toISOString(),
                },
              });

              // Atomic increment — no read-modify-write race condition
              const refundResult = await db.execute(sql`
                UPDATE packages
                SET remaining_credits = remaining_credits + 1,
                    status = 'active'
                WHERE player_id = ${playerId}
                  AND credit_type = ${creditType}
                  AND status = 'active'
                RETURNING id, remaining_credits
              `);
              if (refundResult.rows.length > 0) {
                const r = refundResult.rows[0] as any;
                console.log(
                  `[AttendanceCorrection] Refunded 1 ${creditType} credit to package ${r.id} (new remaining: ${r.remaining_credits})`,
                );
              }
            } else {
              console.log(
                `[AttendanceCorrection] Cancelled debt for player ${playerId} session ${sessionId} (amount: ${cancelResult.amount})`,
              );
            }
          } else {
            await db.insert(creditTransactions).values({
              id: transactionId,
              playerId: playerId,
              sessionId: sessionId,
              type: "debit",
              amount: creditAdjustment,
              reason: adjustmentReason,
              creditType: creditType,
              metadata: {
                oldStatus,
                newStatus,
                correctedBy: req.user!.coachId || req.user!.id,
                correctedAt: new Date().toISOString(),
              },
            });

            // Atomic decrement — no read-modify-write race condition
            const deductResult = await db.execute(sql`
              UPDATE packages
              SET remaining_credits = GREATEST(0, remaining_credits - 1),
                  status = CASE WHEN remaining_credits - 1 <= 0 THEN 'depleted' ELSE status END
              WHERE player_id = ${playerId}
                AND credit_type = ${creditType}
                AND status = 'active'
                AND remaining_credits > 0
              RETURNING id, remaining_credits
            `);
            if (deductResult.rows.length > 0) {
              const r = deductResult.rows[0] as any;
              console.log(
                `[AttendanceCorrection] Deducted 1 ${creditType} credit from package ${r.id} (new remaining: ${r.remaining_credits})`,
              );
            }
          }

          console.log(
            `[AttendanceCorrection] Player ${playerId} session ${sessionId}: ${oldStatus} -> ${newStatus}, credit adjustment: ${creditAdjustment}`,
          );
        }

        // Get player info for response
        const player = await storage.getPlayer(playerId);

        res.json({
          success: true,
          message: `Attendance updated from ${oldStatus || "none"} to ${newStatus}`,
          creditAdjustment,
          oldStatus,
          newStatus,
          playerName: player?.name,
        });
      } catch (error) {
        console.error("Update attendance error:", error);
        res.status(500).json({ error: "Failed to update attendance" });
      }
    },
  );

  // ==================== RECURRING SESSIONS API ====================

  // Get all recurring series for a coach
  router.get(
    "/api/coach/recurring-series",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId;

        if (!coachId) {
          return res.status(400).json({ error: "coachId is required" });
        }

        const series = await storage.getRecurringSeriesForCoach(
          coachId,
          academyId || undefined,
        );
        res.json(series);
      } catch (error) {
        console.error("Error fetching recurring series:", error);
        res.status(500).json({ error: "Failed to fetch recurring series" });
      }
    },
  );

  // Get a single recurring series
  router.get(
    "/api/coach/recurring-series/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const series = await storage.getRecurringSeries(
          id,
          academyId || undefined,
        );
        if (!series) {
          return res.status(404).json({ error: "Recurring series not found" });
        }

        // Get all sessions in this series
        const sessionInstances = await storage.getSessionsByRecurringGroupId(
          id,
          academyId || undefined,
        );

        res.json({ ...series, sessions: sessionInstances });
      } catch (error) {
        console.error("Error fetching recurring series:", error);
        res.status(500).json({ error: "Failed to fetch recurring series" });
      }
    },
  );

  // Create a recurring series with session instances
  router.post(
    "/api/coach/recurring-series",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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

        if (
          !coachId ||
          dayOfWeek === undefined ||
          !startTime ||
          !duration ||
          !sessionType ||
          !weekCount ||
          !seriesStartDate
        ) {
          return res
            .status(400)
            .json({
              error:
                "dayOfWeek, startTime, duration, sessionType, weekCount, and seriesStartDate are required",
            });
        }

        // Validate players belong to academy
        if (
          playerIds &&
          Array.isArray(playerIds) &&
          playerIds.length > 0 &&
          academyId
        ) {
          for (const playerId of playerIds) {
            const { valid } = await validatePlayerOwnership(
              playerId,
              academyId,
              storage,
            );
            if (!valid) {
              return res
                .status(400)
                .json({
                  error: `Player ${playerId} not found or not authorized`,
                });
            }
          }
        }

        // Get academy timezone for proper time handling
        const academyData = await storage.getAcademy(academyId!);
        const academyTimezone = academyData?.timezone || "Europe/Amsterdam";

        // Validate that the start time is resolvable in the academy timezone using consolidated helper
        const initialResolution = ensureResolvableLocalTime(
          seriesStartDate,
          startTime,
          academyTimezone,
        );
        if (!initialResolution.ok) {
          return res.status(400).json({ error: initialResolution.error });
        }
        // Note: ambiguity is acceptable - first occurrence used (standard calendar behavior)

        // Calculate the first session date using timezone-aware helper
        const firstRecurringResult = getFirstSessionDate(
          seriesStartDate,
          dayOfWeek,
          startTime,
          academyTimezone,
        );

        if (firstRecurringResult.status === "error") {
          return res.status(400).json({
            error: {
              code: "TIME_UNRESOLVABLE",
              message: firstRecurringResult.message,
            },
          });
        }
        if (firstRecurringResult.status === "gap") {
          return res.status(400).json({
            error: {
              code: "TIME_UNRESOLVABLE",
              requestedTime: startTime,
              suggestedNext: firstRecurringResult.suggestedTime,
              date: firstRecurringResult.dateStr,
              message: `The time ${startTime} does not exist on ${firstRecurringResult.dateStr} in timezone ${academyTimezone} (DST transition). Please use ${firstRecurringResult.suggestedTime} instead.`,
            },
          });
        }

        const { dateStr: firstRecurringDateStr, utcDate: firstRecurringDate } =
          firstRecurringResult;

        // Check for conflicts for all weeks
        for (let week = 0; week < weekCount; week++) {
          // Calculate session date for this week
          const sessionDateStr = addDaysToLocalDate(
            firstRecurringDateStr,
            week * 7,
          );

          // Validate each session date for DST transitions using consolidated helper
          const weekResolution = ensureResolvableLocalTime(
            sessionDateStr,
            startTime,
            academyTimezone,
          );
          if (!weekResolution.ok) {
            return res.status(400).json({
              error: {
                ...weekResolution.error,
                week: week + 1,
                message: `Week ${week + 1}: ${weekResolution.error.message}`,
              },
            });
          }

          const sessionStartTime = weekResolution.utcDate;
          const sessionEndTime = new Date(
            sessionStartTime.getTime() + duration * 60000,
          );

          // Check coach conflict (pass undefined for excludeSessionId, academyId for tenant isolation)
          const coachConflict = await storage.checkCoachConflict(
            coachId,
            sessionStartTime,
            sessionEndTime,
            undefined,
            academyId || undefined,
          );
          if (coachConflict) {
            return res.status(409).json({
              error: `Coach has a conflicting session on week ${week + 1}`,
              conflictWeek: week + 1,
              conflictDate: sessionStartTime.toISOString(),
            });
          }

          // Check court conflict if courtId provided
          if (courtId) {
            const courtConflict = await storage.checkCourtConflict(
              courtId,
              sessionStartTime,
              sessionEndTime,
              undefined,
              academyId || undefined,
            );
            if (courtConflict) {
              return res.status(409).json({
                error: `Court has a conflicting booking on week ${week + 1}`,
                conflictWeek: week + 1,
                conflictDate: sessionStartTime.toISOString(),
              });
            }
          }
        }

        // Calculate end date
        const endDate = new Date(firstRecurringDate);
        endDate.setDate(endDate.getDate() + (weekCount - 1) * 7);

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
          seriesEndDate: endDate.toISOString().split("T")[0],
          price: price || null,
        });

        // Create all session instances (with auto-skip for player holidays)
        const { sessions: sessionInstances, skippedSessions } =
          await storage.createRecurringSessionInstances(
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
              paymentStatus: "unpaid",
              price: price || null,
              status: "scheduled",
              duration,
            },
            firstRecurringDate,
            weekCount,
            dayOfWeek,
            startTime,
            duration,
            playerIds && Array.isArray(playerIds) ? playerIds : undefined,
            academyId || undefined,
          );

        // Add players to all non-skipped sessions with credit deduction
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
          message:
            skippedSessions.length > 0
              ? `${skippedSessions.length} session(s) auto-skipped due to player holidays`
              : undefined,
        });
      } catch (error) {
        console.error("Error creating recurring series:", error);
        res.status(500).json({ error: "Failed to create recurring series" });
      }
    },
  );

  // Update a recurring series (future instances only)
  router.patch(
    "/api/coach/recurring-series/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;
        const { courtId, locationId, price, isActive } = req.body;

        const series = await storage.getRecurringSeries(
          id,
          academyId || undefined,
        );
        if (!series) {
          return res.status(404).json({ error: "Recurring series not found" });
        }

        const updateData: Record<string, any> = {};
        if (courtId !== undefined) updateData.courtId = courtId;
        if (locationId !== undefined) updateData.locationId = locationId;
        if (price !== undefined) updateData.price = price;
        if (isActive !== undefined) updateData.isActive = isActive;

        const updatedSeries = await storage.updateRecurringSeries(
          id,
          updateData,
          academyId || undefined,
        );
        res.json(updatedSeries);
      } catch (error) {
        console.error("Error updating recurring series:", error);
        res.status(500).json({ error: "Failed to update recurring series" });
      }
    },
  );

  // Delete a recurring series (cancels future sessions)
  router.delete(
    "/api/coach/recurring-series/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;
        const { cancelFutureSessions } = req.query;

        const series = await storage.getRecurringSeries(
          id,
          academyId || undefined,
        );
        if (!series) {
          return res.status(404).json({ error: "Recurring series not found" });
        }

        // Mark series as inactive
        await storage.deleteRecurringSeries(id, academyId || undefined);

        // Cancel future sessions if requested
        if (cancelFutureSessions === "true") {
          await storage.deleteRecurringSessionInstances(
            id,
            new Date(),
            academyId || undefined,
          );

          // Broadcast session update via WebSocket so players see the change immediately
          if (academyId) {
            broadcastSessionUpdate(academyId, {
              sessionId: id,
              type: "cancelled",
            });
          }
        }

        res.json({ success: true, message: "Recurring series deleted" });
      } catch (error) {
        console.error("Error deleting recurring series:", error);
        res.status(500).json({ error: "Failed to delete recurring series" });
      }
    },
  );

  // Skip a recurring session instance
  router.post(
    "/api/coach/sessions/:id/skip",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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

        // Broadcast session cancellation via WebSocket
        if (academyId) {
          broadcastSessionUpdate(academyId, {
            sessionId: id,
            type: "cancelled",
          });
        }

        res.json(updated);
      } catch (error) {
        console.error("Error skipping session:", error);
        res.status(500).json({ error: "Failed to skip session" });
      }
    },
  );

  // Unskip a recurring session instance
  router.post(
    "/api/coach/sessions/:id/unskip",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Edit single session (break from series)
  router.patch(
    "/api/coach/sessions/:id/edit-single",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Edit all future sessions in series
  router.patch(
    "/api/coach/sessions/:id/edit-series",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;
        const { duration, courtId, locationId, price } = req.body;

        const session = await storage.getSession(id);
        if (!session || (academyId && session.academyId !== academyId)) {
          return res.status(404).json({ error: "Session not found" });
        }

        if (!session.recurringGroupId) {
          return res
            .status(400)
            .json({ error: "Session is not part of a recurring series" });
        }

        // Get all future sessions in the series (not modified individually)
        const allSessions = await storage.getSessionsByRecurringGroupId(
          session.recurringGroupId,
          academyId || undefined,
        );
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        const futureSessions = allSessions.filter(
          (s) => new Date(s.startTime) >= now && !s.isModifiedFromSeries,
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
          await storage.updateRecurringSeries(
            session.recurringGroupId,
            updateData,
            academyId || undefined,
          );
        }

        res.json({
          updated: updatedSessions.length,
          sessions: updatedSessions,
        });
      } catch (error) {
        console.error("Error editing series:", error);
        res.status(500).json({ error: "Failed to edit series" });
      }
    },
  );

  // Get player holidays for a list of players
  router.post(
    "/api/coach/player-holidays/check",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { playerIds, startDate, endDate } = req.body;
        const academyId = req.user!.academyId;

        if (!playerIds || !Array.isArray(playerIds) || !startDate || !endDate) {
          return res
            .status(400)
            .json({ error: "playerIds, startDate, and endDate are required" });
        }

        const holidays: Record<string, any[]> = {};
        for (const playerId of playerIds) {
          const playerHolidays = await storage.getPlayerHolidays(
            playerId,
            academyId || undefined,
          );
          const start = new Date(startDate);
          const end = new Date(endDate);

          holidays[playerId] = playerHolidays.filter((h) => {
            const hStart = new Date(h.startDate);
            const hEnd = new Date(h.endDate);
            return hStart <= end && hEnd >= start;
          });
        }

        res.json(holidays);
      } catch (error) {
        console.error("Error checking holidays:", error);
        res.status(500).json({ error: "Failed to check holidays" });
      }
    },
  );

  // Preview recurring sessions before creation
  router.post(
    "/api/coach/recurring-series/preview",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const {
          startDate,
          weekCount,
          dayOfWeek,
          startTime,
          duration,
          playerIds,
          courtId,
        } = req.body;
        const academyId = req.user!.academyId;
        const coachId = req.user!.coachId;

        if (
          !startDate ||
          !weekCount ||
          dayOfWeek === undefined ||
          !startTime ||
          !duration
        ) {
          return res
            .status(400)
            .json({
              error:
                "startDate, weekCount, dayOfWeek, startTime, and duration are required",
            });
        }

        const [hours, minutes] = startTime.split(":").map(Number);
        const start = new Date(startDate);
        const previewSessions = [];

        // Get player holidays if players specified
        const playerHolidaysMap: Record<string, any[]> = {};
        if (playerIds && Array.isArray(playerIds)) {
          for (const playerId of playerIds) {
            playerHolidaysMap[playerId] = await storage.getPlayerHolidays(
              playerId,
              academyId || undefined,
            );
          }
        }

        // Get existing sessions for conflict detection
        const existingSessions = coachId
          ? await storage.getAllSessionsByCoach(coachId, academyId || undefined)
          : [];

        for (let week = 0; week < weekCount; week++) {
          const sessionDate = new Date(start);
          sessionDate.setDate(sessionDate.getDate() + week * 7);

          // Adjust to correct day of week
          const currentDay = sessionDate.getDay();
          const daysToAdd = dayOfWeek - currentDay;
          sessionDate.setDate(sessionDate.getDate() + daysToAdd);

          const sessionStart = new Date(sessionDate);
          sessionStart.setHours(hours, minutes, 0, 0);

          const sessionEnd = new Date(sessionStart);
          sessionEnd.setMinutes(sessionEnd.getMinutes() + duration);

          // Check for conflicts
          const hasConflict = existingSessions.some((existing) => {
            if (courtId && existing.courtId !== courtId) return false;
            const exStart = new Date(existing.startTime);
            const exEnd = new Date(existing.endTime);
            return sessionStart < exEnd && sessionEnd > exStart;
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
          willCreate: previewSessions.filter((s) => !s.willBeSkipped).length,
          willSkip: previewSessions.filter((s) => s.willBeSkipped).length,
          sessions: previewSessions,
        });
      } catch (error) {
        console.error("Error previewing recurring series:", error);
        res.status(500).json({ error: "Failed to preview recurring series" });
      }
    },
  );

  // ==================== SESSION TEMPLATES API ====================

  // Get all session templates for a coach
  router.get(
    "/api/coach/templates",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
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
    },
  );

  // Create a session template
  router.post(
    "/api/coach/templates",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        const {
          name,
          sessionType,
          duration,
          ballLevel,
          skillLevel,
          defaultPlayerIds,
          notes,
        } = req.body;

        if (!coachId || !name || !sessionType || !duration) {
          return res
            .status(400)
            .json({ error: "name, sessionType, and duration are required" });
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
    },
  );

  // Delete a session template
  router.delete(
    "/api/coach/templates/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        await storage.deleteSessionTemplate(id);
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting template:", error);
        res.status(500).json({ error: "Failed to delete template" });
      }
    },
  );

  // ==================== AI PLAYER PROGRESS ENGINE ====================

  // Helper: fetch pillar score history from detailed baseline skill assessments.
  // Queries player_baseline_skill_scores (deep per-skill scores, not the quick rating fields
  // on player_baselines itself), grouped by baseline assessment date.
  async function fetchPillarHistory(playerId: string): Promise<Array<{ date: string; TECHNIQUE: number | null; TACTICAL: number | null; PHYSICAL: number | null; MENTAL: number | null }>> {
    try {
      const rows = await db.execute(sql`
        SELECT
          pb.id AS baseline_id,
          pb.created_at AS date,
          pbss.pillar,
          AVG(pbss.rating)::float AS avg_rating
        FROM player_baselines pb
        JOIN player_baseline_skill_scores pbss ON pbss.baseline_id = pb.id
        WHERE pb.player_id = ${playerId} AND pbss.rating IS NOT NULL
        GROUP BY pb.id, pb.created_at, pbss.pillar
        ORDER BY pb.created_at ASC
      `);
      const byBaseline: Record<string, { date: string; scores: Record<string, number> }> = {};
      for (const row of rows.rows as Array<{ baseline_id: string; date: Date; pillar: string; avg_rating: number }>) {
        const key = row.baseline_id;
        if (!byBaseline[key]) {
          byBaseline[key] = { date: new Date(row.date).toISOString(), scores: {} };
        }
        byBaseline[key].scores[row.pillar.toUpperCase()] = Number(row.avg_rating);
      }
      return Object.values(byBaseline).map(({ date, scores }) => ({
        date,
        TECHNIQUE: scores["TECHNIQUE"] ?? null,
        TACTICAL: scores["TACTICAL"] ?? null,
        PHYSICAL: scores["PHYSICAL"] ?? null,
        MENTAL: scores["MENTAL"] ?? null,
      }));
    } catch (err) {
      console.error("[AIInsights] fetchPillarHistory failed:", err);
      return [];
    }
  }

  // GET /api/player/me/ai-insights — player viewing own AI insights
  router.get(
    "/api/player/me/ai-insights",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId) {
          return res.status(403).json({ error: "Not a player account" });
        }

        const [latestNarrative] = await db
          .select()
          .from(playerAiInsights)
          .where(eq(playerAiInsights.playerId, playerId))
          .orderBy(desc(playerAiInsights.generatedAt))
          .limit(1);

        const recentDigests = await db
          .select()
          .from(sessionAiSummaries)
          .where(eq(sessionAiSummaries.playerId, playerId))
          .orderBy(desc(sessionAiSummaries.generatedAt))
          .limit(5);

        const pillarHistory = await fetchPillarHistory(playerId);

        res.json({
          playerId,
          narrative: latestNarrative || null,
          sessionDigests: recentDigests,
          pillarHistory,
        });
      } catch (error) {
        console.error("[AIInsights] Error fetching player me AI insights:", error);
        res.status(500).json({ error: "Failed to fetch AI insights" });
      }
    }
  );

  // GET /api/players/:id/ai-insights — latest cached narrative + last 5 session digests
  router.get(
    "/api/players/:id/ai-insights",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;
        const userRole = req.user!.role;
        const userPlayerId = req.user!.playerId;

        // Allow coach/academy roles OR the player themselves
        const isPlayerSelf = userRole === "player" && userPlayerId === id;
        const isCoachRole = ["coach", "assistant", "academy_owner", "platform_owner"].includes(userRole);

        if (!isPlayerSelf && !isCoachRole) {
          return res.status(403).json({ error: "Access denied" });
        }

        // If coach, validate player belongs to their academy
        if (isCoachRole && academyId) {
          const { valid } = await validatePlayerOwnership(id, academyId, storage);
          if (!valid) {
            return res.status(404).json({ error: "Player not found" });
          }
        }

        const [latestNarrative] = await db
          .select()
          .from(playerAiInsights)
          .where(eq(playerAiInsights.playerId, id))
          .orderBy(desc(playerAiInsights.generatedAt))
          .limit(1);

        const recentDigests = await db
          .select()
          .from(sessionAiSummaries)
          .where(eq(sessionAiSummaries.playerId, id))
          .orderBy(desc(sessionAiSummaries.generatedAt))
          .limit(5);

        const pillarHistory = await fetchPillarHistory(id);

        res.json({
          playerId: id,
          narrative: latestNarrative || null,
          sessionDigests: recentDigests,
          pillarHistory,
        });
      } catch (error) {
        console.error("[AIInsights] Error fetching AI insights:", error);
        res.status(500).json({ error: "Failed to fetch AI insights" });
      }
    }
  );

  // POST /api/players/:id/ai-insights/generate — trigger fresh narrative generation
  router.post(
    "/api/players/:id/ai-insights/generate",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId || "";
        const userRole = req.user!.role;
        const userPlayerId = req.user!.playerId;
        const days = parseInt(req.query.days as string) || 30;

        const isPlayerSelf = userRole === "player" && userPlayerId === id;
        const isCoachRole = ["coach", "assistant", "academy_owner", "platform_owner"].includes(userRole);

        if (!isPlayerSelf && !isCoachRole) {
          return res.status(403).json({ error: "Access denied" });
        }

        if (isCoachRole && academyId) {
          const { valid } = await validatePlayerOwnership(id, academyId, storage);
          if (!valid) {
            return res.status(404).json({ error: "Player not found" });
          }
        }

        const { generateProgressNarrative } = await import("../services/ai-progress-engine");

        const result = await generateProgressNarrative(id, academyId, days);
        if (!result) {
          return res.json({ narrative: null, focusAreas: [] });
        }

        const [saved] = await db
          .insert(playerAiInsights)
          .values({
            playerId: id,
            narrativeText: result.narrative,
            focusAreas: result.focusAreas,
            periodDays: days,
          })
          .returning();

        res.json({
          narrative: saved,
          focusAreas: result.focusAreas,
        });
      } catch (error) {
        console.error("[AIInsights] Error generating narrative:", error);
        res.status(500).json({ error: "Failed to generate AI insights" });
      }
    }
  );

  // ==================== AI COACHING CHAT ====================

  type AiChatMessage = { role: "user" | "assistant"; content: string };

  async function assertCoachSessionPlayerAccess(
    req: AuthenticatedRequest,
    res: Response,
    sessionId: string,
    playerId: string
  ): Promise<{ coachId: string; userId: string } | null> {
    const coachId = req.user!.coachId || "";
    const userId = req.user!.userId;
    const academyId = req.user!.academyId || "";
    const userRole = req.user!.role;

    const isCoachRole = ["coach", "assistant", "academy_owner", "platform_owner"].includes(userRole);
    if (!isCoachRole || !coachId) {
      res.status(403).json({ error: "Coach access required" });
      return null;
    }

    // Validate player belongs to coach's academy
    const { valid: playerValid } = await validatePlayerOwnership(playerId, academyId, storage);
    if (!playerValid) {
      res.status(404).json({ error: "Player not found" });
      return null;
    }

    // Validate session belongs to coach's academy
    const { valid: sessionValid } = await validateSessionOwnership(sessionId, academyId, storage);
    if (!sessionValid) {
      res.status(404).json({ error: "Session not found" });
      return null;
    }

    return { coachId, userId };
  }

  // GET /api/sessions/:sessionId/players/:playerId/ai-chat/context
  router.get(
    "/api/sessions/:sessionId/players/:playerId/ai-chat/context",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { sessionId, playerId } = req.params;
        const auth = await assertCoachSessionPlayerAccess(req, res, sessionId, playerId);
        if (!auth) return;

        const { buildPlayerAIContext } = await import("../services/ai-progress-engine");
        const ctx = await buildPlayerAIContext(playerId, sessionId, auth.coachId);
        if (!ctx) return res.status(404).json({ error: "Player or session not found" });
        res.json(ctx);
      } catch (error) {
        console.error("[AIChat] Error building context:", error);
        res.status(500).json({ error: "Failed to build context" });
      }
    }
  );

  // POST /api/sessions/:sessionId/players/:playerId/ai-chat
  router.post(
    "/api/sessions/:sessionId/players/:playerId/ai-chat",
    authMiddleware,
    aiQuotaMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { sessionId, playerId } = req.params;
        const auth = await assertCoachSessionPlayerAccess(req, res, sessionId, playerId);
        if (!auth) return;

        const { messages } = req.body as { messages: AiChatMessage[] };
        const safeMessages: AiChatMessage[] = (messages || []).filter(
          (m) => m.role === "user" || m.role === "assistant"
        );

        // Fetch last 10 exchanges for this coach-player pair for context injection
        const historyRows = await db
          .select({ role: aiCoachConversations.role, content: aiCoachConversations.content })
          .from(aiCoachConversations)
          .where(
            and(
              eq(aiCoachConversations.coachId, auth.coachId),
              eq(aiCoachConversations.playerId, playerId),
              eq(aiCoachConversations.contextType, "coach_session")
            )
          )
          .orderBy(desc(aiCoachConversations.createdAt))
          .limit(10);
        const history = historyRows.reverse();

        const { buildPlayerAIContext, buildCoachingSystemPrompt } = await import("../services/ai-progress-engine");
        const ctx = await buildPlayerAIContext(playerId, sessionId, auth.coachId);
        if (!ctx) return res.status(404).json({ error: "Player or session not found" });

        let systemPrompt = buildCoachingSystemPrompt(ctx);

        // Inject previous conversation history into the system prompt
        if (history.length > 0) {
          const historyBlock = history
            .map((m) => `${m.role === "user" ? "Coach" : "AI"}: ${m.content}`)
            .join("\n");
          systemPrompt = `${systemPrompt}\n\nPrevious coaching exchanges (for context — reference these naturally when relevant):\n${historyBlock}`;
        }

        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });

        const coachAcademyId = req.user!.academyId ?? null;
        const { getAcademyBudgetState } = await import("../services/aiBudgetService");
        const budgetState = coachAcademyId ? await getAcademyBudgetState(coachAcademyId) : null;
        if (budgetState === "exhausted") {
          return res.status(200).json({ reply: "AI coaching is temporarily paused while your academy's monthly usage is being reviewed. Your coach will be in touch shortly." });
        }

        let reply: string | null = null;
        try {
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              ...safeMessages,
            ],
            max_tokens: budgetState === "warning" ? 400 : 600,
            temperature: 0.6,
          });
          reply = response.choices?.[0]?.message?.content || null;
          logAiCall({
            userId: req.user!.userId,
            featureType: "chat",
            model: "gpt-4o-mini",
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            totalTokens: response.usage?.total_tokens ?? 0,
            academyId: coachAcademyId,
          }).catch(() => {});
        } catch (err) {
          console.error("[AIChat] OpenAI call failed:", err);
        }

        // Persist this exchange to conversation memory
        if (reply) {
          const lastUserMsg = safeMessages.filter((m) => m.role === "user").pop();
          if (lastUserMsg) {
            await db.insert(aiCoachConversations).values([
              { coachId: auth.coachId, playerId, role: "user", content: lastUserMsg.content, contextType: "coach_session" },
              { coachId: auth.coachId, playerId, role: "assistant", content: reply, contextType: "coach_session" },
            ]).catch((err) => console.error("[AIChat] Failed to persist conversation:", err));
          }
        }

        res.json({ reply: reply ?? null });
      } catch (error) {
        console.error("[AIChat] Error processing chat turn:", error);
        res.status(500).json({ error: "Failed to process chat" });
      }
    }
  );

  // POST /api/sessions/:sessionId/players/:playerId/ai-chat/commit
  router.post(
    "/api/sessions/:sessionId/players/:playerId/ai-chat/commit",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { sessionId, playerId } = req.params;
        const auth = await assertCoachSessionPlayerAccess(req, res, sessionId, playerId);
        if (!auth) return;

        const { coachId } = auth;
        const {
          structured,
        }: {
          structured: {
            sessionNote: string;
            overall: string;
            effort: number;
            execution: number;
            understanding: number;
            techniquePillar?: number;
            tacticalPillar?: number;
            physicalPillar?: number;
            mentalPillar?: number;
            socialPillar?: number;
            matchPillar?: number;
            skillRatings: { skillId?: string; skillName?: string; score: number }[];
            levelUpFlag: boolean;
            levelUpMessage: string;
          };
        } = req.body;

        // 2. Write to in_session_feedback (AI session note) — idempotent upsert.
        // A partial unique index (in_session_feedback_ai_note_unique) ensures at most one
        // ai_session_note per (session, player). Non-AI types remain unconstrained.
        // Strategy: try INSERT; on unique-violation (23505) UPDATE the existing row.
        if (structured.sessionNote) {
          try {
            await db.insert(inSessionFeedback).values({
              sessionId,
              playerId,
              coachId: req.user!.userId,
              feedbackType: "ai_session_note",
              message: structured.sessionNote,
              visibility: "private",
            });
          } catch (insertErr: any) {
            if (insertErr?.code === "23505") {
              // Row already exists — update in place
              await db
                .update(inSessionFeedback)
                .set({ message: structured.sessionNote })
                .where(
                  and(
                    eq(inSessionFeedback.sessionId, sessionId),
                    eq(inSessionFeedback.playerId, playerId),
                    eq(inSessionFeedback.feedbackType, "ai_session_note")
                  )
                );
            } else {
              throw insertErr;
            }
          }
        }

        // 3. Write to session_skill_feedback (upsert so re-save always updates)
        const clamp = (v: number | undefined, fallback = 1) => Math.min(2, Math.max(0, v ?? fallback));
        const overallValue = (["improved", "stable", "declined"].includes(structured.overall) ? structured.overall : "stable") as "improved" | "stable" | "declined";
        const skillFeedbackValues = {
          sessionId,
          playerId,
          coachId,
          effort: clamp(structured.effort),
          execution: clamp(structured.execution),
          understanding: clamp(structured.understanding),
          overall: overallValue,
          note: structured.sessionNote,
          techniquePillar: structured.techniquePillar !== undefined ? clamp(structured.techniquePillar) : null,
          tacticalPillar: structured.tacticalPillar !== undefined ? clamp(structured.tacticalPillar) : null,
          physicalPillar: structured.physicalPillar !== undefined ? clamp(structured.physicalPillar) : null,
          mentalPillar: structured.mentalPillar !== undefined ? clamp(structured.mentalPillar) : null,
          socialPillar: structured.socialPillar !== undefined ? clamp(structured.socialPillar) : null,
          matchPillar: structured.matchPillar !== undefined ? clamp(structured.matchPillar) : null,
        };
        await db.insert(sessionSkillFeedback).values(skillFeedbackValues).onConflictDoUpdate({
          target: [sessionSkillFeedback.sessionId, sessionSkillFeedback.playerId],
          set: {
            effort: skillFeedbackValues.effort,
            execution: skillFeedbackValues.execution,
            understanding: skillFeedbackValues.understanding,
            overall: skillFeedbackValues.overall,
            note: skillFeedbackValues.note,
            techniquePillar: skillFeedbackValues.techniquePillar,
            tacticalPillar: skillFeedbackValues.tacticalPillar,
            physicalPillar: skillFeedbackValues.physicalPillar,
            mentalPillar: skillFeedbackValues.mentalPillar,
            socialPillar: skillFeedbackValues.socialPillar,
            matchPillar: skillFeedbackValues.matchPillar,
          },
        });

        // 4. Write individual playerSkillScores (EMA upsert — accumulates over sessions)
        if (structured.skillRatings && structured.skillRatings.length > 0) {
          const alpha = 0.3;
          for (const sr of structured.skillRatings) {
            // Resolve skillId: prefer direct ID field (validated against DB), fall back to case-insensitive name match
            let resolvedSkillId: string | null = null;
            if (sr.skillId) {
              const [validated] = await db
                .select({ id: glowSkills.id })
                .from(glowSkills)
                .where(eq(glowSkills.id, sr.skillId))
                .limit(1);
              resolvedSkillId = validated?.id ?? null;
            } else if (sr.skillName) {
              const [byName] = await db
                .select({ id: glowSkills.id })
                .from(glowSkills)
                .where(ilike(glowSkills.name, sr.skillName))
                .limit(1);
              resolvedSkillId = byName?.id ?? null;
            }
            if (!resolvedSkillId) continue;

            const newScore = Math.min(2, Math.max(0, sr.score));

            const [existing] = await db
              .select({ id: playerSkillScores.id, movingAverage: playerSkillScores.movingAverage, score: playerSkillScores.score, observationCount: playerSkillScores.observationCount })
              .from(playerSkillScores)
              .where(and(eq(playerSkillScores.playerId, playerId), eq(playerSkillScores.skillId, resolvedSkillId)))
              .orderBy(desc(playerSkillScores.createdAt))
              .limit(1);

            if (existing) {
              const oldAvg = Number(existing.movingAverage ?? existing.score ?? newScore);
              const newAvg = alpha * newScore + (1 - alpha) * oldAvg;
              const wasFirstMastery = oldAvg < 2 && newScore >= 2;
              await db.update(playerSkillScores)
                .set({
                  score: newScore,
                  movingAverage: newAvg.toFixed(2),
                  observationCount: (existing.observationCount ?? 1) + 1,
                  sessionId,
                  coachId,
                })
                .where(eq(playerSkillScores.id, existing.id));
              if (wasFirstMastery) {
                await awardXP(playerId, "skill_validation", "skill", resolvedSkillId);
              }
            } else {
              await db.insert(playerSkillScores).values({
                playerId,
                skillId: resolvedSkillId,
                score: newScore,
                sessionId,
                coachId,
                movingAverage: String(newScore),
                observationCount: 1,
              });
              if (newScore >= 2) {
                await awardXP(playerId, "skill_validation", "skill", resolvedSkillId);
              }
            }
          }
        }

        // 5. Update pillar progress bars via EMA
        try {
          const { updatePillarProgress } = await import("../utils/pillarProgress");
          await updatePillarProgress(playerId, sessionId, {
            effort: clamp(structured.effort),
            execution: clamp(structured.execution),
            understanding: clamp(structured.understanding),
            overall: overallValue,
            pillarRatings: {
              TECHNIQUE: structured.techniquePillar !== undefined ? clamp(structured.techniquePillar) : undefined,
              TACTICAL:  structured.tacticalPillar  !== undefined ? clamp(structured.tacticalPillar)  : undefined,
              PHYSICAL:  structured.physicalPillar  !== undefined ? clamp(structured.physicalPillar)  : undefined,
              MENTAL:    structured.mentalPillar    !== undefined ? clamp(structured.mentalPillar)    : undefined,
              SOCIAL:    structured.socialPillar    !== undefined ? clamp(structured.socialPillar)    : undefined,
              MATCH:     structured.matchPillar     !== undefined ? clamp(structured.matchPillar)     : undefined,
            },
          });
        } catch (pillarErr) {
          console.error("[AIChat] Pillar progress update failed (non-critical):", pillarErr);
        }

        // 6. Update deep_assessment_pillar_summaries from AI pillar scores (best-effort)
        try {
          const pillarFields: Array<{ key: keyof typeof structured; pillar: string }> = [
            { key: "techniquePillar", pillar: "TECHNIQUE" },
            { key: "tacticalPillar",  pillar: "TACTICAL"  },
            { key: "physicalPillar",  pillar: "PHYSICAL"  },
            { key: "mentalPillar",    pillar: "MENTAL"    },
            { key: "socialPillar",    pillar: "SOCIAL"    },
            { key: "matchPillar",     pillar: "MATCH"     },
          ];
          const alpha = 0.3;
          const now = new Date();
          for (const { key, pillar } of pillarFields) {
            const raw = structured[key];
            if (raw === undefined || raw === null) continue;
            const aiScore = clamp(raw as number);
            const [existing] = await db
              .select({ id: deepAssessmentPillarSummaries.id, averageScore: deepAssessmentPillarSummaries.averageScore })
              .from(deepAssessmentPillarSummaries)
              .where(and(
                eq(deepAssessmentPillarSummaries.playerId, playerId),
                eq(deepAssessmentPillarSummaries.pillar, pillar),
              ))
              .limit(1);
            if (existing) {
              const oldAvg = Number(existing.averageScore ?? aiScore);
              const newAvg = (alpha * aiScore + (1 - alpha) * oldAvg).toFixed(2);
              await db.update(deepAssessmentPillarSummaries)
                .set({ averageScore: newAvg, lastAssessedAt: now, updatedAt: now })
                .where(eq(deepAssessmentPillarSummaries.id, existing.id));
            } else {
              await db.insert(deepAssessmentPillarSummaries).values({
                playerId,
                pillar,
                averageScore: String(aiScore),
                assessedSkills: 0,
                totalSkills: 0,
                score0Count: 0,
                score1Count: 0,
                score2Count: 0,
                score3Count: 0,
                lowConfidenceCount: 0,
                mediumConfidenceCount: 0,
                highConfidenceCount: 0,
                lastAssessedAt: now,
                createdAt: now,
                updatedAt: now,
              });
            }
          }
        } catch (deepErr) {
          console.error("[AIChat] Deep assessment pillar update failed (non-critical):", deepErr);
        }

        // 7. Persist Glow Score to players table (non-critical, fire-and-forget)
        setImmediate(async () => {
          try {
            const { calculateGlowRank } = await import("../services/glow-rank-engine");
            const rank = await calculateGlowRank(playerId);
            if (rank && rank.glowScore !== undefined) {
              await db.update(players)
                .set({ glowScore: rank.glowScore })
                .where(eq(players.id, playerId));
            }
          } catch (glowErr) {
            console.error("[AIChat] Glow Score persistence failed (non-critical):", glowErr);
          }
        });

        // 8. Trigger level readiness when AI flags it
        let levelReadiness = null;
        if (structured.levelUpFlag) {
          try {
            const [playerRow] = await db
              .select({ ballLevel: players.ballLevel })
              .from(players)
              .where(eq(players.id, playerId))
              .limit(1);
            if (playerRow?.ballLevel) {
              const [levelRow] = await db
                .select({ promotionToLevelId: ballLevels.promotionToLevelId })
                .from(ballLevels)
                .where(eq(ballLevels.id, playerRow.ballLevel))
                .limit(1);
              const targetLevel = levelRow?.promotionToLevelId ?? playerRow.ballLevel;
              levelReadiness = await storage.calculatePlayerLevelReadiness(playerId, targetLevel);
            }
          } catch (err) {
            console.error("[AIChat] Level readiness check failed (non-critical):", err);
          }
        }

        // 9. Trigger session digest (fire-and-forget)
        const _sid = sessionId;
        const _pid = playerId;
        setImmediate(async () => {
          try {
            const { generateSessionDigest } = await import("../services/ai-progress-engine");
            await generateSessionDigest(_sid, _pid);
          } catch { /* non-critical */ }
        });

        res.json({ success: true, levelUpFlag: structured.levelUpFlag, levelReadiness });
      } catch (error) {
        console.error("[AIChat] Error committing chat:", error);
        res.status(500).json({ error: "Failed to commit session" });
      }
    }
  );

  // GET /api/player/me/ai-coach/context — player fetching data maturity info
  router.get(
    "/api/player/me/ai-coach/context",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId) {
          return res.status(403).json({ error: "Not a player account" });
        }
        const { buildPlayerSelfAIContext } = await import("../services/ai-progress-engine");
        const ctx = await buildPlayerSelfAIContext(playerId);
        if (!ctx) return res.status(404).json({ error: "Player not found" });

        // Check if this player has any prior conversation history
        const historyCount = await db
          .select({ count: count() })
          .from(aiCoachConversations)
          .where(
            and(
              eq(aiCoachConversations.playerId, playerId),
              eq(aiCoachConversations.contextType, "player_self")
            )
          );
        const hasHistory = (historyCount[0]?.count ?? 0) > 0;

        res.json({ dataMaturity: ctx.dataMaturity, glowMirrorLayers: ctx.glowMirrorLayers, hasHistory });
      } catch (error) {
        console.error("[PlayerAICoach] Error fetching context:", error);
        res.status(500).json({ error: "Failed to fetch context" });
      }
    }
  );

  // POST /api/player/me/ai-coach/chat — player chatting with their personal AI coach
  router.post(
    "/api/player/me/ai-coach/chat",
    authMiddleware,
    aiQuotaMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId) {
          return res.status(403).json({ error: "Not a player account" });
        }

        // AI Pro quota check for players
        const { checkAiQuota, incrementAiCallCount } = await import("../services/aiProSubscription");
        const userId = req.user!.userId;
        const role = req.user!.role;
        const quota = await checkAiQuota(userId, role);
        if (!quota.allowed) {
          const resetDate = new Date();
          resetDate.setMonth(resetDate.getMonth() + 1, 1);
          resetDate.setHours(0, 0, 0, 0);
          const resetStr = resetDate.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
          const message = quota.isPro
            ? `You've used all ${quota.limit} messages this month — resets on ${resetStr}`
            : `You've used all ${quota.limit} free messages this month. Upgrade to AI Pro for 200 messages/month.`;
          return res.status(402).json({
            error: "ai_quota_exceeded",
            message,
            callCount: quota.callCount,
            limit: quota.limit,
            isPro: quota.isPro,
          });
        }
        await incrementAiCallCount(userId);

        const { messages } = req.body as { messages: AiChatMessage[] };
        const safeMessages: AiChatMessage[] = (messages || []).filter(
          (m) => m.role === "user" || m.role === "assistant"
        );

        // Fetch last 10 exchanges for this player's self-coaching history
        const historyRows = await db
          .select({ role: aiCoachConversations.role, content: aiCoachConversations.content })
          .from(aiCoachConversations)
          .where(
            and(
              eq(aiCoachConversations.playerId, playerId),
              eq(aiCoachConversations.contextType, "player_self")
            )
          )
          .orderBy(desc(aiCoachConversations.createdAt))
          .limit(10);
        const history = historyRows.reverse();

        const { buildPlayerSelfAIContext, buildPlayerSelfSystemPrompt } = await import(
          "../services/ai-progress-engine"
        );
        const ctx = await buildPlayerSelfAIContext(playerId);
        if (!ctx) return res.status(404).json({ error: "Player not found" });

        let systemPrompt = buildPlayerSelfSystemPrompt(ctx);

        // Inject previous conversation history into the system prompt
        if (history.length > 0) {
          const historyBlock = history
            .map((m) => `${m.role === "user" ? "Player" : "AI Coach"}: ${m.content}`)
            .join("\n");
          systemPrompt = `${systemPrompt}\n\nPrevious coaching exchanges (for context — reference these naturally when relevant, e.g. "Last time we talked about..."):\n${historyBlock}`;
        }

        const playerAcademyId = req.user!.academyId ?? null;
        const { getAcademyBudgetState: getPlayerBudgetState } = await import("../services/aiBudgetService");
        const playerBudgetState = playerAcademyId ? await getPlayerBudgetState(playerAcademyId) : null;
        if (playerBudgetState === "exhausted") {
          return res.status(200).json({ reply: "AI coaching is temporarily paused for your academy this month. Please check back soon." });
        }

        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            ...safeMessages,
          ],
          max_tokens: playerBudgetState === "warning" ? 280 : 400,
          temperature: 0.7,
        });

        const reply = completion.choices[0]?.message?.content ?? "";
        const usage = completion.usage;

        logAiCall({
          userId: req.user!.userId,
          featureType: "chat",
          model: "gpt-4o-mini",
          promptTokens: usage?.prompt_tokens ?? 0,
          completionTokens: usage?.completion_tokens ?? 0,
          totalTokens: usage?.total_tokens ?? 0,
          academyId: playerAcademyId,
        }).catch(() => {});

        // Persist this exchange to conversation memory
        if (reply) {
          const lastUserMsg = safeMessages.filter((m) => m.role === "user").pop();
          if (lastUserMsg) {
            await db.insert(aiCoachConversations).values([
              { coachId: null, playerId, role: "user", content: lastUserMsg.content, contextType: "player_self" },
              { coachId: null, playerId, role: "assistant", content: reply, contextType: "player_self" },
            ]).catch((err) => console.error("[PlayerAICoach] Failed to persist conversation:", err));
          }
        }

        return res.json({ reply });
      } catch (error) {
        console.error("[PlayerAICoach] Error processing chat turn:", error);
        res.status(500).json({ error: "Failed to process chat" });
      }
    }
  );

  // POST /api/sessions/:sessionId/ai-plan
  // Generates an AI session plan for a group/semi_private session (coach only)
  // Body: { save?: boolean } — when save=true, persists plan to sessionPlans.coachNotes
  router.post(
    "/api/sessions/:sessionId/ai-plan",
    authMiddleware,
    aiQuotaMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { sessionId } = req.params;
        const coachId = req.user!.coachId || "";
        const academyId = req.user!.academyId || "";
        const userRole = req.user!.role;
        const { save, plan: providedPlan } = req.body as { save?: boolean; plan?: { theme: string; rationale: string; playerBreakdown: { name: string; focus: string; flag?: string }[]; drills: { title: string; description: string }[]; flags: string[] } };

        const isCoachRole = ["coach", "assistant", "academy_owner", "platform_owner"].includes(userRole);
        if (!isCoachRole || !coachId) {
          return res.status(403).json({ error: "Coach access required" });
        }

        const { valid: sessionValid } = await validateSessionOwnership(sessionId, academyId, storage);
        if (!sessionValid) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Enforce group/semi_private only
        const [sessionRow] = await db.select({ sessionType: sessions.sessionType }).from(sessions).where(eq(sessions.id, sessionId));
        if (!sessionRow || !["group", "semi_private"].includes(sessionRow.sessionType)) {
          return res.status(422).json({ error: "AI session planning is only available for group and semi-private sessions" });
        }

        // If save=true and a plan payload was provided, skip AI generation and just persist
        let plan: { theme: string; rationale: string; playerBreakdown: { name: string; focus: string; flag?: string }[]; drills: { title: string; description: string }[]; flags: string[] } | null = null;

        if (save && providedPlan) {
          plan = providedPlan;
        } else {
          const { buildGroupSessionAIContext, generateGroupSessionPlan } = await import("../services/ai-progress-engine");
          const ctx = await buildGroupSessionAIContext(sessionId);
          if (!ctx) {
            return res.status(422).json({ error: "Session must have at least 2 registered players to generate a plan" });
          }

          plan = await generateGroupSessionPlan(ctx);
          if (!plan) {
            return res.status(500).json({ error: "AI plan generation failed" });
          }
        }

        // Persist to session_plans.coachNotes when save=true
        if (save && plan) {
          const planText = [
            `AI SESSION PLAN — ${plan.theme}`,
            ``,
            `Rationale: ${plan.rationale}`,
            ``,
            `Player Focus:`,
            ...plan.playerBreakdown.map((p) => `• ${p.name}: ${p.focus}${p.flag ? ` [${p.flag}]` : ""}`),
            ``,
            `Drills:`,
            ...plan.drills.map((d, i) => `${i + 1}. ${d.title} — ${d.description}`),
            ...(plan.flags.length > 0 ? [``, `Notes:`, ...plan.flags.map((f) => `• ${f}`)] : []),
          ].join("\n");

          // Upsert into sessionPlans using coachNotes field
          const [existingPlan] = await db
            .select({ id: sessionPlans.id })
            .from(sessionPlans)
            .where(eq(sessionPlans.sessionId, sessionId));

          if (existingPlan) {
            await db
              .update(sessionPlans)
              .set({ coachNotes: planText, updatedAt: new Date() })
              .where(eq(sessionPlans.id, existingPlan.id));
          } else {
            // Convert drills to blocks for sessionPlans schema
            const blocks = plan.drills.map((d, i) => ({
              id: `AI_BLOCK_${i + 1}`,
              name: d.title,
              blockType: "drill",
              durationMinutes: Math.floor((ctx.durationMinutes - 10) / plan.drills.length),
              orderIndex: i,
              skillIds: [],
              status: "pending",
              coachInstructions: d.description,
            }));

            await db.insert(sessionPlans).values({
              sessionId,
              status: "draft",
              blocks,
              coachNotes: planText,
              generatedBy: coachId,
            });
          }
        }

        // For save-only requests (plan provided by client), just return saved status
        if (save && providedPlan) {
          return res.json({ saved: true });
        }
        res.json({ plan, generatedAt: new Date().toISOString(), saved: !!save });
      } catch (error) {
        console.error("[AISessionPlan] Error:", error);
        res.status(500).json({ error: "Failed to generate session plan" });
      }
    }
  );

// ==================== PARENT REPORTING ====================

// Preview: generate AI parent letter without sending
router.post(
  "/api/players/:id/parent-report/preview",
  authMiddleware,
  requireRole("coach", "academy_owner", "assistant", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;

      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }

      const player = await storage.getPlayer(id);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const { generateParentProgressLetter } = await import("../services/ai-progress-engine");
      const now = new Date();
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const monthLabel = prevMonthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      const letter = await generateParentProgressLetter(id, monthLabel);

      if (!letter) {
        return res.status(500).json({ error: "Failed to generate parent letter" });
      }

      res.json({
        letter,
        playerName: player.name,
        parentEmail: player.parentEmail || null,
        monthLabel,
      });
    } catch (error) {
      console.error("[ParentReport] Preview error:", error);
      res.status(500).json({ error: "Failed to generate preview" });
    }
  }
);

// Send: generate and send the parent letter via email
router.post(
  "/api/players/:id/parent-report/send",
  authMiddleware,
  requireRole("coach", "academy_owner", "assistant", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const { letter: providedLetter } = req.body;

      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }

      const player = await storage.getPlayer(id);
      if (!player) return res.status(404).json({ error: "Player not found" });

      if (!player.parentEmail) {
        return res.status(400).json({ error: "No parent email on file for this player" });
      }

      const { generateParentProgressLetter } = await import("../services/ai-progress-engine");
      const { sendEmail } = await import("../emailService");

      const now = new Date();
      const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      const firstName = player.name.split(" ")[0];

      const letter = providedLetter || await generateParentProgressLetter(id, monthLabel);
      if (!letter) {
        return res.status(500).json({ error: "Failed to generate parent letter" });
      }

      const academy = academyId ? await storage.getAcademy(academyId) : null;
      const academyName = academy?.name || "the Academy";
      const subject = `${firstName}'s Tennis Progress — ${monthLabel}`;

      const paragraphs = letter
        .split(/\n\n+/)
        .filter(Boolean)
        .map((p: string) => `<p style="color:#cccccc;line-height:1.7;margin-bottom:16px;">${p.replace(/\n/g, "<br>")}</p>`)
        .join("");

      const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 16px; padding: 40px; }
    .header { text-align: center; margin-bottom: 32px; border-bottom: 1px solid #333; padding-bottom: 24px; }
    .header h1 { color: #2ECC40; margin: 0 0 8px; font-size: 24px; }
    .header p { color: #666; margin: 0; font-size: 14px; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #333; text-align: center; color: #555; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${academyName}</h1>
      <p>${firstName}'s Monthly Progress Update &mdash; ${monthLabel}</p>
    </div>
    ${paragraphs}
    <div class="footer">
      <p>This letter was generated by ${academyName} using Glow Up Sports.</p>
    </div>
  </div>
</body>
</html>`;

      const result = await sendEmail({
        to: player.parentEmail,
        subject,
        html,
        text: letter,
      });

      if (!result.success) {
        return res.status(500).json({ error: result.error || "Failed to send email" });
      }

      res.json({ success: true, sentTo: player.parentEmail });
    } catch (error) {
      console.error("[ParentReport] Send error:", error);
      res.status(500).json({ error: "Failed to send parent report" });
    }
  }
);

// Toggle parent reporting on/off for a player
router.patch(
  "/api/players/:id/parent-reporting",
  authMiddleware,
  requireRole("coach", "academy_owner", "assistant", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const { parentReporting, parentEmail } = req.body;

      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }

      const updates: Record<string, unknown> = {};
      if (typeof parentReporting === "boolean") updates.parentReporting = parentReporting;
      if (parentEmail !== undefined) updates.parentEmail = parentEmail || null;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "Nothing to update" });
      }

      await db.update(players).set(updates).where(eq(players.id, id));

      const updated = await storage.getPlayer(id);
      res.json({
        parentReporting: updated?.parentReporting ?? false,
        parentEmail: updated?.parentEmail ?? null,
      });
    } catch (error) {
      console.error("[ParentReport] Toggle error:", error);
      res.status(500).json({ error: "Failed to update parent reporting settings" });
    }
  }
);

// ==================== GLOW MIRROR — MATCH REFLECTIONS (AUTH-PROTECTED) ====================

// Helper: verify match belongs to the authenticated player
async function verifyMatchOwnership(matchId: string, playerId: string): Promise<boolean> {
  const [match] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.id, matchId), eq(matches.playerId, playerId)))
    .limit(1);
  return !!match;
}

// GET match reflection for authenticated player
router.get(
  "/api/player/me/matches/:matchId/reflection",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player only" });

      const [reflection] = await db
        .select()
        .from(matchReflections)
        .where(
          and(
            eq(matchReflections.matchId, matchId),
            eq(matchReflections.playerId, playerId)
          )
        )
        .limit(1);

      res.json(reflection || null);
    } catch (error) {
      console.error("[MatchReflection] GET error:", error);
      res.status(500).json({ error: "Failed to fetch match reflection" });
    }
  }
);

const preReflectionSchema = z.object({
  preMatchMood: z.string().max(50).nullable().optional(),
  preMatchConfidence: z.number().int().min(1).max(10).nullable().optional(),
  preMatchGoal: z.string().max(80).nullable().optional(),
});

const postReflectionSchema = z.object({
  whatWorked: z.array(z.string().max(100)).max(20).optional(),
  whatDidntWork: z.array(z.string().max(100)).max(20).optional(),
  biggestChallenge: z.string().max(100).nullable().optional(),
  postMatchEnergy: z.string().max(50).nullable().optional(),
  postMatchMood: z.string().max(50).nullable().optional(),
  postMatchConfidence: z.number().int().min(1).max(10).nullable().optional(),
  keyTakeaway: z.string().max(100).nullable().optional(),
});

const combinedReflectionSchema = preReflectionSchema.merge(postReflectionSchema);

// POST pre-match reflection (capture mindset before a match)
router.post(
  "/api/player/me/matches/:matchId/pre-reflection",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player only" });

      const isOwner = await verifyMatchOwnership(matchId, playerId);
      if (!isOwner) return res.status(403).json({ error: "Match not found or not yours" });

      const parsed = preReflectionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });
      const { preMatchMood, preMatchConfidence, preMatchGoal } = parsed.data;

      const [existing] = await db
        .select({ id: matchReflections.id, preMatchMood: matchReflections.preMatchMood, preMatchConfidence: matchReflections.preMatchConfidence, preMatchGoal: matchReflections.preMatchGoal })
        .from(matchReflections)
        .where(and(eq(matchReflections.matchId, matchId), eq(matchReflections.playerId, playerId)))
        .limit(1);

      let reflection;
      if (existing) {
        [reflection] = await db
          .update(matchReflections)
          .set({
            preMatchMood: preMatchMood ?? existing.preMatchMood,
            preMatchConfidence: preMatchConfidence ?? existing.preMatchConfidence,
            preMatchGoal: preMatchGoal !== undefined ? (preMatchGoal?.slice(0, 80) || null) : existing.preMatchGoal,
          })
          .where(and(eq(matchReflections.matchId, matchId), eq(matchReflections.playerId, playerId)))
          .returning();
      } else {
        [reflection] = await db
          .insert(matchReflections)
          .values({
            matchId,
            playerId,
            preMatchMood: preMatchMood || null,
            preMatchConfidence: preMatchConfidence || null,
            preMatchGoal: preMatchGoal?.slice(0, 80) || null,
          })
          .returning();
      }

      res.status(existing ? 200 : 201).json(reflection);
    } catch (error) {
      console.error("[MatchPreReflection] POST error:", error);
      res.status(500).json({ error: "Failed to save pre-match reflection" });
    }
  }
);

// PUT post-match reflection (record what happened after the match)
router.put(
  "/api/player/me/matches/:matchId/post-reflection",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player only" });

      const isOwner = await verifyMatchOwnership(matchId, playerId);
      if (!isOwner) return res.status(403).json({ error: "Match not found or not yours" });

      const parsedPost = postReflectionSchema.safeParse(req.body);
      if (!parsedPost.success) return res.status(400).json({ error: fromZodError(parsedPost.error).message });
      const { whatWorked, whatDidntWork, biggestChallenge, postMatchEnergy, postMatchMood, postMatchConfidence, keyTakeaway } = parsedPost.data;

      const [existing] = await db
        .select({ id: matchReflections.id })
        .from(matchReflections)
        .where(and(eq(matchReflections.matchId, matchId), eq(matchReflections.playerId, playerId)))
        .limit(1);

      let reflection;
      if (existing) {
        const updates: Record<string, unknown> = {};
        if (whatWorked !== undefined) updates.whatWorked = whatWorked;
        if (whatDidntWork !== undefined) updates.whatDidntWork = whatDidntWork;
        if (biggestChallenge !== undefined) updates.biggestChallenge = biggestChallenge;
        if (postMatchEnergy !== undefined) updates.postMatchEnergy = postMatchEnergy;
        if (postMatchMood !== undefined) updates.postMatchMood = postMatchMood;
        if (postMatchConfidence !== undefined) updates.postMatchConfidence = postMatchConfidence;
        if (keyTakeaway !== undefined) updates.keyTakeaway = keyTakeaway?.slice(0, 100);

        [reflection] = await db
          .update(matchReflections)
          .set(updates)
          .where(and(eq(matchReflections.matchId, matchId), eq(matchReflections.playerId, playerId)))
          .returning();
      } else {
        [reflection] = await db
          .insert(matchReflections)
          .values({
            matchId,
            playerId,
            whatWorked: whatWorked || [],
            whatDidntWork: whatDidntWork || [],
            biggestChallenge: biggestChallenge || null,
            postMatchEnergy: postMatchEnergy || null,
            postMatchMood: postMatchMood || null,
            postMatchConfidence: postMatchConfidence || null,
            keyTakeaway: keyTakeaway?.slice(0, 100) || null,
          })
          .returning();

        // Award XP for first post-match reflection
        try {
          await awardXP(playerId, "match_reflection", "match", matchId);
        } catch (xpErr) {
          console.error("[MatchPostReflection] XP award failed (non-fatal):", xpErr);
        }
      }

      res.status(existing ? 200 : 201).json(reflection);
    } catch (error) {
      console.error("[MatchPostReflection] PUT error:", error);
      res.status(500).json({ error: "Failed to save post-match reflection" });
    }
  }
);

// POST combined reflection (convenience endpoint for saving all fields at once)
router.post(
  "/api/player/me/matches/:matchId/reflection",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player only" });

      const isOwner = await verifyMatchOwnership(matchId, playerId);
      if (!isOwner) return res.status(403).json({ error: "Match not found or not yours" });

      const parsedCombined = combinedReflectionSchema.safeParse(req.body);
      if (!parsedCombined.success) return res.status(400).json({ error: fromZodError(parsedCombined.error).message });
      const {
        preMatchMood, preMatchConfidence, preMatchGoal,
        whatWorked, whatDidntWork, biggestChallenge,
        postMatchEnergy, postMatchMood, postMatchConfidence, keyTakeaway,
      } = parsedCombined.data;

      const [existing] = await db
        .select({ id: matchReflections.id })
        .from(matchReflections)
        .where(and(eq(matchReflections.matchId, matchId), eq(matchReflections.playerId, playerId)))
        .limit(1);

      let reflection;
      if (existing) {
        const updates: Record<string, unknown> = {};
        if (preMatchMood !== undefined) updates.preMatchMood = preMatchMood;
        if (preMatchConfidence !== undefined) updates.preMatchConfidence = preMatchConfidence;
        if (preMatchGoal !== undefined) updates.preMatchGoal = preMatchGoal?.slice(0, 80) || null;
        if (whatWorked !== undefined) updates.whatWorked = whatWorked;
        if (whatDidntWork !== undefined) updates.whatDidntWork = whatDidntWork;
        if (biggestChallenge !== undefined) updates.biggestChallenge = biggestChallenge;
        if (postMatchEnergy !== undefined) updates.postMatchEnergy = postMatchEnergy;
        if (postMatchMood !== undefined) updates.postMatchMood = postMatchMood;
        if (postMatchConfidence !== undefined) updates.postMatchConfidence = postMatchConfidence;
        if (keyTakeaway !== undefined) updates.keyTakeaway = keyTakeaway?.slice(0, 100);

        [reflection] = await db
          .update(matchReflections)
          .set(updates)
          .where(and(eq(matchReflections.matchId, matchId), eq(matchReflections.playerId, playerId)))
          .returning();
      } else {
        [reflection] = await db
          .insert(matchReflections)
          .values({
            matchId, playerId,
            preMatchMood: preMatchMood || null,
            preMatchConfidence: preMatchConfidence || null,
            preMatchGoal: preMatchGoal?.slice(0, 80) || null,
            whatWorked: whatWorked || [],
            whatDidntWork: whatDidntWork || [],
            biggestChallenge: biggestChallenge || null,
            postMatchEnergy: postMatchEnergy || null,
            postMatchMood: postMatchMood || null,
            postMatchConfidence: postMatchConfidence || null,
            keyTakeaway: keyTakeaway?.slice(0, 100) || null,
          })
          .returning();

        try {
          await awardXP(playerId, "match_reflection", "match", matchId);
        } catch (xpErr) {
          console.error("[MatchReflection] XP award failed (non-fatal):", xpErr);
        }
      }

      res.status(existing ? 200 : 201).json(reflection);
    } catch (error) {
      console.error("[MatchReflection] POST error:", error);
      res.status(500).json({ error: "Failed to save match reflection" });
    }
  }
);

// ==================== GLOW MIRROR — SESSION REFLECTIONS ====================

// Shared validation schema for session reflection body
const sessionReflectionSchema = z.object({
  energyLevel: z.number().int().min(1).max(5).nullable().optional(),
  overallFeeling: z.number().int().min(1).max(5).nullable().optional(),
  hardestPart: z.string().max(200).nullable().optional(),
  keyLearning: z.string().max(200).nullable().optional(),
  nextFocus: z.string().max(200).nullable().optional(),
});

// Shared handler for saving a session reflection (upsert)
async function saveSessionReflection(
  playerId: string,
  academyId: string | null | undefined,
  sessionId: string,
  body: unknown,
  res: Response
) {
  // Validate input
  const parsed = sessionReflectionSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ error: fromZodError(parsed.error).message });
  }
  const { energyLevel, hardestPart, keyLearning, nextFocus, overallFeeling } = parsed.data;

  // Verify the player is part of this session
  const sessionPlayerRecord = await db
    .select({ id: sessionPlayers.id })
    .from(sessionPlayers)
    .where(and(eq(sessionPlayers.sessionId, sessionId), eq(sessionPlayers.playerId, playerId)))
    .limit(1);

  if (sessionPlayerRecord.length === 0) {
    return res.status(403).json({ error: "Player is not part of this session" });
  }

  // Build AI summary
  const parts: string[] = [];
  if (energyLevel) parts.push(`Energy: ${energyLevel}/5`);
  if (overallFeeling) parts.push(`Overall feeling: ${overallFeeling}/5`);
  if (hardestPart) parts.push(`Hardest part: ${hardestPart}`);
  if (keyLearning) parts.push(`Key learning: ${keyLearning}`);
  if (nextFocus) parts.push(`Next focus: ${nextFocus}`);
  const aiSummary = parts.join(". ");

  // Check first-time for XP eligibility
  const [existing] = await db
    .select({ id: playerSessionReflections.id })
    .from(playerSessionReflections)
    .where(and(eq(playerSessionReflections.sessionId, sessionId), eq(playerSessionReflections.playerId, playerId)))
    .limit(1);

  const isFirstReflection = !existing;

  // Upsert: delete then insert (unique index on player+session)
  await db
    .delete(playerSessionReflections)
    .where(and(eq(playerSessionReflections.sessionId, sessionId), eq(playerSessionReflections.playerId, playerId)));

  const [reflection] = await db
    .insert(playerSessionReflections)
    .values({
      playerId,
      sessionId,
      academyId: academyId || null,
      energyLevel: energyLevel ?? null,
      hardestPart: hardestPart || null,
      keyLearning: keyLearning || null,
      nextFocus: nextFocus || null,
      overallFeeling: overallFeeling ?? null,
      aiSummary,
    })
    .returning();

  if (isFirstReflection) {
    try {
      await awardXP(playerId, "session_reflection", "session", sessionId);
    } catch (xpErr) {
      console.error("[SessionReflection] XP award failed (non-fatal):", xpErr);
    }
  }

  return res.status(isFirstReflection ? 201 : 200).json(reflection);
}

// GET /api/player/sessions/:sessionId/reflection — fetch session reflection
router.get(
  "/api/player/sessions/:sessionId/reflection",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player only" });

      const [reflection] = await db
        .select()
        .from(playerSessionReflections)
        .where(and(eq(playerSessionReflections.sessionId, sessionId), eq(playerSessionReflections.playerId, playerId)))
        .limit(1);

      res.json(reflection || null);
    } catch (error) {
      console.error("[SessionReflection] GET error:", error);
      res.status(500).json({ error: "Failed to fetch reflection" });
    }
  }
);

// POST /api/player/sessions/:sessionId/reflection — save session reflection
router.post(
  "/api/player/sessions/:sessionId/reflection",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player only" });
      await saveSessionReflection(playerId, req.user!.academyId, req.params.sessionId, req.body, res);
    } catch (error) {
      console.error("[SessionReflection] POST error:", error);
      res.status(500).json({ error: "Failed to save reflection" });
    }
  }
);

// GET /api/player/me/session-reflection/:sessionId — alias (path-based sessionId)
router.get(
  "/api/player/me/session-reflection/:sessionId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player only" });

      const [reflection] = await db
        .select()
        .from(playerSessionReflections)
        .where(and(eq(playerSessionReflections.sessionId, sessionId), eq(playerSessionReflections.playerId, playerId)))
        .limit(1);

      res.json(reflection || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reflection" });
    }
  }
);

// POST /api/player/me/session-reflection/:sessionId — alias (path-based sessionId)
router.post(
  "/api/player/me/session-reflection/:sessionId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player only" });
      await saveSessionReflection(playerId, req.user!.academyId, req.params.sessionId, req.body, res);
    } catch (error) {
      res.status(500).json({ error: "Failed to save reflection" });
    }
  }
);

// POST /api/player/me/session-reflection — body-based sessionId (required by spec)
router.post(
  "/api/player/me/session-reflection",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player only" });

      const { sessionId } = req.body;
      if (!sessionId || typeof sessionId !== "string") {
        return res.status(400).json({ error: "sessionId is required in request body" });
      }

      await saveSessionReflection(playerId, req.user!.academyId, sessionId, req.body, res);
    } catch (error) {
      console.error("[SessionReflection] POST (body) error:", error);
      res.status(500).json({ error: "Failed to save reflection" });
    }
  }
);

// ==================== GLOW MIRROR LAYER 2 — MONTHLY SELF-ASSESSMENT ====================

function getCurrentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// GET /api/player/me/monthly-assessment/current — get this month's assessment (or null if not started)
router.get(
  "/api/player/me/monthly-assessment/current",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player only" });

      const monthYear = getCurrentMonthYear();

      const [assessment] = await db
        .select()
        .from(playerMonthlyAssessments)
        .where(
          and(
            eq(playerMonthlyAssessments.playerId, playerId),
            eq(playerMonthlyAssessments.monthYear, monthYear)
          )
        )
        .limit(1);

      return res.json({
        assessment: assessment ?? null,
        monthYear,
        available: true,
      });
    } catch (error) {
      console.error("[MonthlyAssessment] GET current error:", error);
      res.status(500).json({ error: "Failed to fetch monthly assessment" });
    }
  }
);

// POST /api/player/me/monthly-assessment — create or update (partial save or complete)
router.post(
  "/api/player/me/monthly-assessment",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player only" });

      const {
        strengthsAnswer,
        challengesAnswer,
        progressFeelAnswer,
        mindsetAnswer,
        nextFocusAnswer,
        pillarSelfRatings,
        complete,
      } = req.body;

      const monthYear = getCurrentMonthYear();
      const academyId = req.user!.academyId ?? null;

      // Check if one already exists
      const [existing] = await db
        .select()
        .from(playerMonthlyAssessments)
        .where(
          and(
            eq(playerMonthlyAssessments.playerId, playerId),
            eq(playerMonthlyAssessments.monthYear, monthYear)
          )
        )
        .limit(1);

      const updates: Partial<typeof playerMonthlyAssessments.$inferInsert> = {};
      if (strengthsAnswer !== undefined) updates.strengthsAnswer = strengthsAnswer;
      if (challengesAnswer !== undefined) updates.challengesAnswer = challengesAnswer;
      if (progressFeelAnswer !== undefined) updates.progressFeelAnswer = progressFeelAnswer;
      if (mindsetAnswer !== undefined) updates.mindsetAnswer = mindsetAnswer;
      if (nextFocusAnswer !== undefined) updates.nextFocusAnswer = nextFocusAnswer;
      if (pillarSelfRatings !== undefined) updates.pillarSelfRatings = pillarSelfRatings;

      let aiSummary: string | null = null;

      // Generate AI summary when completing
      if (complete) {
        const answersForAI = {
          strengths: strengthsAnswer || existing?.strengthsAnswer,
          challenges: challengesAnswer || existing?.challengesAnswer,
          progressFeel: progressFeelAnswer || existing?.progressFeelAnswer,
          mindset: mindsetAnswer || existing?.mindsetAnswer,
          nextFocus: nextFocusAnswer || existing?.nextFocusAnswer,
          pillars: pillarSelfRatings || existing?.pillarSelfRatings,
        };

        try {
          const { generateObject } = await import("ai");
          const { openai } = await import("@ai-sdk/openai");
          const { z } = await import("zod");

          const result = await generateObject({
            model: openai("gpt-4o-mini"),
            schema: z.object({ summary: z.string() }),
            prompt: `You are summarizing a tennis player's monthly self-assessment for their coach.
Player answers:
- What's going well: "${answersForAI.strengths || "not answered"}"
- Biggest challenge: "${answersForAI.challenges || "not answered"}"
- How they feel about progress: "${answersForAI.progressFeel || "not answered"}"
- Mindset / motivation: "${answersForAI.mindset || "not answered"}"
- Focus for next month: "${answersForAI.nextFocus || "not answered"}"
${answersForAI.pillars ? `- Pillar self-ratings (1–10): ${JSON.stringify(answersForAI.pillars)}` : ""}

Write a 2–3 sentence neutral summary that captures the player's self-perception and key focus area. Use third-person ("The player..."). Be concise and factual.`,
          });

          aiSummary = result.object.summary;
          updates.aiSummary = aiSummary;
        } catch (aiErr) {
          console.error("[MonthlyAssessment] AI summary generation failed (non-critical):", aiErr);
        }

        updates.status = "completed";
        updates.completedAt = new Date();
      }

      let assessment;
      if (existing) {
        [assessment] = await db
          .update(playerMonthlyAssessments)
          .set(updates)
          .where(eq(playerMonthlyAssessments.id, existing.id))
          .returning();
      } else {
        [assessment] = await db
          .insert(playerMonthlyAssessments)
          .values({
            playerId,
            academyId,
            monthYear,
            status: complete ? "completed" : "in_progress",
            strengthsAnswer: strengthsAnswer ?? null,
            challengesAnswer: challengesAnswer ?? null,
            progressFeelAnswer: progressFeelAnswer ?? null,
            mindsetAnswer: mindsetAnswer ?? null,
            nextFocusAnswer: nextFocusAnswer ?? null,
            pillarSelfRatings: pillarSelfRatings ?? null,
            aiSummary: aiSummary ?? null,
            completedAt: complete ? new Date() : null,
          })
          .returning();
      }

      return res.json({ assessment });
    } catch (error) {
      console.error("[MonthlyAssessment] POST error:", error);
      res.status(500).json({ error: "Failed to save monthly assessment" });
    }
  }
);

// GET /api/players/:playerId/weekly-digest — latest ai_weekly_digest for a player (accessible by coach or the player themselves)
router.get(
  "/api/players/:playerId/weekly-digest",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const userRole = req.user!.role;
      const userPlayerId = req.user!.playerId;
      const academyId = req.user!.academyId;

      const isPlatformOwner = userRole === "platform_owner";
      const isScopedCoach = ["coach", "assistant", "academy_owner"].includes(userRole);
      const isOwnPlayer = userPlayerId === playerId;

      if (!isPlatformOwner && !isScopedCoach && !isOwnPlayer) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (isScopedCoach) {
        if (!academyId) {
          return res.status(403).json({ error: "Academy scope required" });
        }
        const [player] = await db.select({ id: players.id, academyId: players.academyId }).from(players).where(eq(players.id, playerId)).limit(1);
        if (!player || player.academyId !== academyId) {
          return res.status(404).json({ error: "Player not found" });
        }
      }

      const [digest] = await db
        .select()
        .from(playerNotifications)
        .where(
          and(
            eq(playerNotifications.playerId, playerId),
            eq(playerNotifications.type, "ai_weekly_digest"),
          ),
        )
        .orderBy(desc(playerNotifications.createdAt))
        .limit(1);

      if (!digest) return res.json(null);

      return res.json(digest);
    } catch (error) {
      console.error("Error fetching player weekly digest:", error);
      res.status(500).json({ error: "Failed to fetch weekly digest" });
    }
  },
);

// GET /api/player/me/monthly-assessment/history — past assessments (last 6 months)
router.get(
  "/api/player/me/monthly-assessment/history",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player only" });

      const history = await db
        .select()
        .from(playerMonthlyAssessments)
        .where(eq(playerMonthlyAssessments.playerId, playerId))
        .orderBy(desc(playerMonthlyAssessments.createdAt))
        .limit(6);

      return res.json(history);
    } catch (error) {
      console.error("[MonthlyAssessment] GET history error:", error);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  }
);

// ==================== GLOW PLANS — WEEKLY TRAINING PLANS ====================

// GET /api/player/me/weekly-plan — current week's active plan for the player
router.get(
  "/api/player/me/weekly-plan",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player only" });

      // Get current Monday
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      const weekStartDate = monday.toISOString().split("T")[0];

      const [plan] = await db
        .select()
        .from(playerAiTrainingPlans)
        .where(and(
          eq(playerAiTrainingPlans.playerId, playerId),
          eq(playerAiTrainingPlans.weekStartDate, weekStartDate)
        ))
        .limit(1);

      if (!plan) {
        // Also try to get the most recent plan if this week has none yet
        const [latestPlan] = await db
          .select()
          .from(playerAiTrainingPlans)
          .where(eq(playerAiTrainingPlans.playerId, playerId))
          .orderBy(desc(playerAiTrainingPlans.weekStartDate))
          .limit(1);
        return res.json(latestPlan || null);
      }

      return res.json(plan);
    } catch (error) {
      console.error("[GlowPlans] GET player weekly-plan error:", error);
      res.status(500).json({ error: "Failed to fetch weekly plan" });
    }
  }
);

// GET /api/coach/players/weekly-plans — all players' plans for the current week (coach view)
router.get(
  "/api/coach/players/weekly-plans",
  authMiddleware,
  requireRole("coach", "assistant", "academy_owner", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) return res.status(403).json({ error: "Coach only" });

      // Get current Monday
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      const weekStartDate = monday.toISOString().split("T")[0];

      const plans = await db
        .select({
          id: playerAiTrainingPlans.id,
          playerId: playerAiTrainingPlans.playerId,
          playerName: players.name,
          coachId: playerAiTrainingPlans.coachId,
          academyId: playerAiTrainingPlans.academyId,
          weekStartDate: playerAiTrainingPlans.weekStartDate,
          planJson: playerAiTrainingPlans.planJson,
          status: playerAiTrainingPlans.status,
          coachNotes: playerAiTrainingPlans.coachNotes,
          generatedAt: playerAiTrainingPlans.generatedAt,
          approvedAt: playerAiTrainingPlans.approvedAt,
        })
        .from(playerAiTrainingPlans)
        .innerJoin(players, eq(players.id, playerAiTrainingPlans.playerId))
        .where(and(
          eq(playerAiTrainingPlans.coachId, coachId),
          eq(playerAiTrainingPlans.weekStartDate, weekStartDate)
        ))
        .orderBy(desc(playerAiTrainingPlans.generatedAt));

      return res.json(plans);
    } catch (error) {
      console.error("[GlowPlans] GET coach weekly-plans error:", error);
      res.status(500).json({ error: "Failed to fetch weekly plans" });
    }
  }
);

// PATCH /api/coach/players/:id/weekly-plan — approve or update plan (coach)
router.patch(
  "/api/coach/players/:id/weekly-plan",
  authMiddleware,
  requireRole("coach", "assistant", "academy_owner", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) return res.status(403).json({ error: "Coach only" });

      const planId = req.params.id;
      const { status, coachNotes, planJson } = req.body;

      // Verify the coach owns this plan
      const [existing] = await db
        .select({ id: playerAiTrainingPlans.id, coachId: playerAiTrainingPlans.coachId })
        .from(playerAiTrainingPlans)
        .where(eq(playerAiTrainingPlans.id, planId))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Plan not found" });
      if (existing.coachId !== coachId) return res.status(403).json({ error: "Not your plan" });

      const updateData: Record<string, unknown> = {};
      if (status !== undefined) updateData.status = status;
      if (coachNotes !== undefined) updateData.coachNotes = coachNotes;
      if (planJson !== undefined) updateData.planJson = planJson;
      if (status === "active") updateData.approvedAt = new Date();

      await db
        .update(playerAiTrainingPlans)
        .set(updateData)
        .where(eq(playerAiTrainingPlans.id, planId));

      const [updated] = await db
        .select()
        .from(playerAiTrainingPlans)
        .where(eq(playerAiTrainingPlans.id, planId))
        .limit(1);

      return res.json(updated);
    } catch (error) {
      console.error("[GlowPlans] PATCH coach weekly-plan error:", error);
      res.status(500).json({ error: "Failed to update plan" });
    }
  }
);

// POST /api/coach/players/:playerId/weekly-plan/generate — manually trigger generation for a player
router.post(
  "/api/coach/players/:playerId/weekly-plan/generate",
  authMiddleware,
  requireRole("coach", "assistant", "academy_owner", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) return res.status(403).json({ error: "Coach only" });

      const { playerId } = req.params;

      // Get current Monday
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      const weekStartDate = monday.toISOString().split("T")[0];

      // Check if plan already exists
      const [existing] = await db
        .select({ id: playerAiTrainingPlans.id })
        .from(playerAiTrainingPlans)
        .where(and(
          eq(playerAiTrainingPlans.playerId, playerId),
          eq(playerAiTrainingPlans.weekStartDate, weekStartDate)
        ))
        .limit(1);

      if (existing) {
        return res.status(409).json({ error: "Plan already exists for this week", planId: existing.id });
      }

      const { generateWeeklyTrainingPlan } = await import("../services/ai-progress-engine");
      const plan = await generateWeeklyTrainingPlan(playerId, weekStartDate);

      if (!plan) {
        return res.status(500).json({ error: "Failed to generate plan — not enough player data" });
      }

      const [playerRow] = await db.select({ academyId: players.academyId }).from(players).where(eq(players.id, playerId)).limit(1);

      const [inserted] = await db
        .insert(playerAiTrainingPlans)
        .values({
          playerId,
          coachId,
          academyId: playerRow?.academyId || null,
          weekStartDate,
          planJson: plan,
          status: "draft",
        })
        .returning();

      return res.json(inserted);
    } catch (error) {
      console.error("[GlowPlans] POST generate weekly-plan error:", error);
      res.status(500).json({ error: "Failed to generate plan" });
    }
  }
);

export default router;
