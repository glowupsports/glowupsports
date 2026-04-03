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
    sessionAiSummaries, playerAiInsights, sessionAiChats,
    glowSkills, playerSkillScores,
  } from "@shared/schema";
  import { sendFeedbackNotification, sendXPGainNotification, sendBadgeEarnedNotification, sendLevelUpNotification, getPlayerPushTokens } from "../pushNotifications";
  import { awardXP } from "../services/xp-service";
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
            joinedAt: seriesPlayers.createdAt,
          })
          .from(seriesPlayers)
          .where(
            and(
              eq(seriesPlayers.playerId, playerId),
              eq(seriesPlayers.status, "active"),
            ),
          );

        const seriesIdList = playerSeriesData
          .map((s) => s.seriesId)
          .filter(Boolean) as string[];
        const seriesJoinDates = new Map(
          playerSeriesData.map((s) => [s.seriesId, s.joinedAt]),
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
                return new Date(s.startTime) >= new Date(joinDate);
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

        // attendedCount excludes private sessions where the player was absent
        // (a missed 1-on-1 session didn't happen for the player)
        const privateAbsentCount = happenedRecords.filter(
          (r) => isPrivateType(r.sessionType) && r.attendanceStatus === "absent",
        ).length;
        const attendedCount = totalLessons - privateAbsentCount;

        // For percentage: treat sessions without explicit attendance (but in the past/completed) as "present"
        const effectivePresentCount =
          presentCount +
          happenedRecords.filter(
            (r) => !r.attendanceStatus || (r.sessionStatus === "completed" && !r.attendanceStatus),
          ).length;

        const actuallyAttendedCount = effectivePresentCount + lateCount;
        const attendancePercentage =
          totalLessons > 0
            ? Math.round((effectivePresentCount / totalLessons) * 100)
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
        // CRITICAL: Only include sessions that happened AFTER the player joined the series
        const playerSeriesForHistory = await db
          .select({
            seriesId: seriesPlayers.seriesId,
            joinedAt: seriesPlayers.createdAt,
          })
          .from(seriesPlayers)
          .where(
            and(
              eq(seriesPlayers.playerId, playerId),
              eq(seriesPlayers.status, "active"),
            ),
          );
        const seriesIdsForHistory = playerSeriesForHistory
          .map((s) => s.seriesId)
          .filter(Boolean) as string[];
        const seriesJoinDatesForHistory = new Map(
          playerSeriesForHistory.map((s) => [s.seriesId, s.joinedAt]),
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
              return new Date(s.startTime) >= new Date(joinDate);
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
              `[AttendanceHistory] Found ${orphaned.length} orphaned completed sessions for player ${playerId} (filtered by join date)`,
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
        const pastRecords = combinedRecords.filter((record) => {
          if (!record.sessionStartTime) return false;
          const status = record.attendanceStatus;
          if (status === "holiday" || status === "vacation") return false;
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
    const userId = req.user!.id;
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
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { sessionId, playerId } = req.params;
        const auth = await assertCoachSessionPlayerAccess(req, res, sessionId, playerId);
        if (!auth) return;

        const { messages } = req.body as { messages: AiChatMessage[] };
        const safeMessages: AiChatMessage[] = (messages || []).filter(
          (m) => m.role === "user" || m.role === "assistant"
        );

        const { buildPlayerAIContext, buildCoachingSystemPrompt } = await import("../services/ai-progress-engine");
        const ctx = await buildPlayerAIContext(playerId, sessionId, auth.coachId);
        if (!ctx) return res.status(404).json({ error: "Player or session not found" });

        const systemPrompt = buildCoachingSystemPrompt(ctx);

        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });

        let reply: string | null = null;
        try {
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              ...safeMessages,
            ],
            max_tokens: 400,
            temperature: 0.6,
          });
          reply = response.choices?.[0]?.message?.content || null;
        } catch (err) {
          console.error("[AIChat] OpenAI call failed:", err);
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

        const { coachId, userId } = auth;
        const {
          messages,
          structured,
        }: {
          messages: AiChatMessage[];
          structured: {
            sessionNote: string;
            overall: string;
            effort: number;
            execution: number;
            understanding: number;
            skillRatings: { skillName: string; score: number }[];
            levelUpFlag: boolean;
            levelUpMessage: string;
          };
        } = req.body;

        const safeMessages: AiChatMessage[] = (messages || []).filter(
          (m): m is AiChatMessage => m.role === "user" || m.role === "assistant"
        );

        // 1. Save conversation to session_ai_chats
        await db.insert(sessionAiChats).values({
          sessionId,
          playerId,
          coachId,
          messages: safeMessages,
          committed: true,
        });

        // 2. Write to in_session_feedback (session note)
        if (structured.sessionNote) {
          await db.insert(inSessionFeedback).values({
            sessionId,
            playerId,
            coachId: coachId,
            feedbackType: "technique",
            message: structured.sessionNote,
            visibility: "private",
          });
        }

        // 3. Write to session_skill_feedback
        await db.insert(sessionSkillFeedback).values({
          sessionId,
          playerId,
          coachId,
          effort: Math.min(2, Math.max(0, structured.effort ?? 1)),
          execution: Math.min(2, Math.max(0, structured.execution ?? 1)),
          understanding: Math.min(2, Math.max(0, structured.understanding ?? 1)),
          overall: (["improved", "stable", "declined"].includes(structured.overall) ? structured.overall : "stable") as "improved" | "stable" | "declined",
          note: structured.sessionNote,
        }).onConflictDoNothing();

        // 4. Write individual playerSkillScores for each skill rating
        if (structured.skillRatings && structured.skillRatings.length > 0) {
          for (const sr of structured.skillRatings) {
            const [skill] = await db
              .select({ id: glowSkills.id })
              .from(glowSkills)
              .where(eq(glowSkills.name, sr.skillName))
              .limit(1);
            if (skill) {
              await db.insert(playerSkillScores).values({
                playerId,
                skillId: skill.id,
                score: Math.min(2, Math.max(0, sr.score)),
                sessionId,
                coachId,
                movingAverage: String(sr.score),
              });
            }
          }
        }

        // 5. Log level-up readiness (full level-up system managed separately)
        if (structured.levelUpFlag) {
          console.log(`[AIChat] Level-up readiness flagged for player ${playerId}: ${structured.levelUpMessage}`);
        }

        // 6. Trigger session digest (fire-and-forget)
        const _sid = sessionId;
        const _pid = playerId;
        setImmediate(async () => {
          try {
            const { generateSessionDigest } = await import("../services/ai-progress-engine");
            await generateSessionDigest(_sid, _pid);
          } catch { /* non-critical */ }
        });

        res.json({ success: true, levelUpFlag: structured.levelUpFlag });
      } catch (error) {
        console.error("[AIChat] Error committing chat:", error);
        res.status(500).json({ error: "Failed to commit session" });
      }
    }
  );

export default router;
