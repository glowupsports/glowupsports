import { Router, type Request, type Response, type NextFunction } from "express";
  import { db } from "../db";
  import { storage } from "../storage";
  import { fireQuestEvent } from "../services/quest-events";
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
    deepAssessmentPillarSummaries,
    glowSkills, levelSkills, playerSkillScores,
    sessionAiBriefs, sessionRatings,
    loginSchema, registerSchema, playerRegisterSchema, coachInviteRegisterSchema,
    academyApplicationInputSchema, insertSessionSchema, insertPlayerSchema, updatePlayerSchema,
    insertPackageSchema, insertPlayerNoteSchema, insertMessageSchema, insertMessageReactionSchema,
    submitReviewSchema,
  } from "@shared/schema";
  import { sendFeedbackNotification, sendXPGainNotification, sendBadgeEarnedNotification, sendLevelUpNotification, getPlayerPushTokens } from "../pushNotifications";
  import { awardXP } from "../services/xp-service";
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
  
  
    // ==================== COACH CALENDAR API ====================

  // Get calendar for a date range
  router.get(
    "/api/coach/calendar",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { date, view = "day", coachId: queryCoachId } = req.query;
        const academyId = req.user!.academyId;

        // In admin mode, allow querying another coach's calendar via query param
        // Otherwise fall back to logged-in user's coachId
        const isAdmin =
          req.user!.role === "platform_owner" ||
          req.user!.role === "academy_owner";
        const coachId =
          isAdmin && queryCoachId
            ? (queryCoachId as string)
            : req.user!.coachId;

        if (!date || !coachId) {
          return res.status(400).json({ error: "date is required" });
        }

        // Parse date string as UTC to avoid timezone issues
        const dateStr = date as string;
        const [year, month, day] = dateStr.split("-").map(Number);
        const targetDate = new Date(Date.UTC(year, month - 1, day));
        let startDate: Date;
        let endDate: Date;

        switch (view) {
          case "week":
            const dayOfWeek = targetDate.getUTCDay();
            const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            startDate = new Date(targetDate);
            startDate.setUTCDate(targetDate.getUTCDate() - mondayOffset);
            startDate.setUTCHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setUTCDate(startDate.getUTCDate() + 6);
            endDate.setUTCHours(23, 59, 59, 999);
            break;
          case "month":
            startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
            endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
            break;
          default: // day
            startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
            endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
        }

        // Get own sessions (full data) - filtered by academy
        let ownSessions = await storage.getSessionsByCoach(
          coachId as string,
          startDate,
          endDate,
          academyId ?? undefined,
        );

        // Also include auto-cancelled sessions (all players on holiday) so they show in calendar
        const holidayCancelledSessions = await db
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.coachId, coachId as string),
              eq(sessions.status, "cancelled"),
              eq(sessions.skipReason, "all_players_on_holiday"),
              gte(sessions.startTime, startDate),
              lte(sessions.startTime, endDate),
              academyId ? eq(sessions.academyId, academyId) : undefined,
            ),
          );
        if (holidayCancelledSessions.length > 0) {
          const existingIds = new Set(ownSessions.map((s) => s.id));
          for (const s of holidayCancelledSessions) {
            if (!existingIds.has(s.id)) ownSessions.push(s);
          }
        }

        // Filter out future sessions from ended/completed series
        const allSeriesIdsForFilter = [
          ...new Set(ownSessions.map((s) => s.seriesId).filter(Boolean)),
        ] as string[];
        if (allSeriesIdsForFilter.length > 0) {
          const endedSeriesRows = await db
            .select({ id: coachingSeries.id })
            .from(coachingSeries)
            .where(
              and(
                inArray(coachingSeries.id, allSeriesIdsForFilter),
                eq(coachingSeries.status, "ended"),
              ),
            );
          const endedSeriesIds = new Set(endedSeriesRows.map((s) => s.id));
          if (endedSeriesIds.size > 0) {
            const now = new Date();
            ownSessions = ownSessions.filter((s) => {
              if (!s.seriesId || !endedSeriesIds.has(s.seriesId)) return true;
              // Keep past sessions from ended series (historical), filter out future ones
              return new Date(s.startTime) < now;
            });
          }
        }

        // OPTIMIZED: Batch fetch all session and series players at once
        const sessionIds = ownSessions.map((s) => s.id);
        const seriesIds = [
          ...new Set(ownSessions.map((s) => s.seriesId).filter(Boolean)),
        ] as string[];

        // Parallel fetch session players and series players
        const [allSessionPlayers, allSeriesPlayers] = await Promise.all([
          sessionIds.length > 0
            ? db
                .select({
                  sessionId: sessionPlayers.sessionId,
                  playerId: sessionPlayers.playerId,

                  attendanceStatus: sessionPlayers.attendanceStatus,
                  isGuest: sessionPlayers.isGuest,
                  playerName: players.name,
                  hostBallLevel: players.ballLevel,
                  playerBallLevel: players.ballLevel,
                  profilePhotoUrl: players.profilePhotoUrl,
                })
                .from(sessionPlayers)
                .leftJoin(players, eq(sessionPlayers.playerId, players.id))
                .where(inArray(sessionPlayers.sessionId, sessionIds))
            : Promise.resolve([]),
          seriesIds.length > 0
            ? db
                .select({
                  seriesId: seriesPlayers.seriesId,
                  playerId: seriesPlayers.playerId,
                  status: seriesPlayers.status,
                  playerName: players.name,
                  hostBallLevel: players.ballLevel,
                  playerBallLevel: players.ballLevel,
                  profilePhotoUrl: players.profilePhotoUrl,
                })
                .from(seriesPlayers)
                .leftJoin(players, eq(seriesPlayers.playerId, players.id))
                .where(
                  and(
                    inArray(seriesPlayers.seriesId, seriesIds),
                    eq(seriesPlayers.status, "active"),
                  ),
                )
            : Promise.resolve([]),
        ]);

        const [leftSeriesPlayers, pausedSeriesPlayers] = await Promise.all([
          seriesIds.length > 0
            ? db
                .select({
                  seriesId: seriesPlayers.seriesId,
                  playerId: seriesPlayers.playerId,
                  leftAt: seriesPlayers.leftAt,
                })
                .from(seriesPlayers)
                .where(
                  and(
                    inArray(seriesPlayers.seriesId, seriesIds),
                    eq(seriesPlayers.status, "left"),
                  ),
                )
            : Promise.resolve([]),
          seriesIds.length > 0
            ? db
                .select({
                  seriesId: seriesPlayers.seriesId,
                  playerId: seriesPlayers.playerId,
                  pauseFrom: seriesPlayers.pauseFrom,
                  pauseUntil: seriesPlayers.pauseUntil,
                })
                .from(seriesPlayers)
                .where(
                  and(
                    inArray(seriesPlayers.seriesId, seriesIds),
                    eq(seriesPlayers.status, "paused"),
                    isNotNull(seriesPlayers.pauseFrom),
                    isNotNull(seriesPlayers.pauseUntil),
                  ),
                )
            : Promise.resolve([]),
        ]);

        const leftPlayersBySeriesMap = new Map<string, { playerId: string; leftAt: Date | null }[]>();
        for (const lp of leftSeriesPlayers) {
          if (!lp.seriesId) continue;
          if (!leftPlayersBySeriesMap.has(lp.seriesId))
            leftPlayersBySeriesMap.set(lp.seriesId, []);
          leftPlayersBySeriesMap.get(lp.seriesId)!.push({ playerId: lp.playerId, leftAt: lp.leftAt });
        }

        const pausedPlayersBySeriesMap = new Map<string, { playerId: string; pauseFrom: string; pauseUntil: string }[]>();
        for (const pp of pausedSeriesPlayers) {
          if (!pp.seriesId) continue;
          if (!pausedPlayersBySeriesMap.has(pp.seriesId))
            pausedPlayersBySeriesMap.set(pp.seriesId, []);
          const pFrom = typeof pp.pauseFrom === 'string' ? pp.pauseFrom : pp.pauseFrom!.toISOString().split('T')[0];
          const pUntil = typeof pp.pauseUntil === 'string' ? pp.pauseUntil : pp.pauseUntil!.toISOString().split('T')[0];
          pausedPlayersBySeriesMap.get(pp.seriesId)!.push({ playerId: pp.playerId, pauseFrom: pFrom, pauseUntil: pUntil });
        }

        // Create lookup maps
        const sessionPlayersMap = new Map<string, typeof allSessionPlayers>();
        for (const p of allSessionPlayers) {
          if (!sessionPlayersMap.has(p.sessionId))
            sessionPlayersMap.set(p.sessionId, []);
          sessionPlayersMap.get(p.sessionId)!.push(p);
        }

        const seriesPlayersMap = new Map<string, typeof allSeriesPlayers>();
        for (const p of allSeriesPlayers) {
          if (!p.seriesId) continue;
          if (!seriesPlayersMap.has(p.seriesId))
            seriesPlayersMap.set(p.seriesId, []);
          seriesPlayersMap.get(p.seriesId)!.push(p);
        }

        // Build roster for each session using cached data (no await in loop)
        const sessionsWithPlayers = ownSessions.map((session) => {
          const sessionSpecificPlayers =
            sessionPlayersMap.get(session.id) || [];
          const baseSeriesPlayers = session.seriesId
            ? seriesPlayersMap.get(session.seriesId) || []
            : [];

          const isCompleted = session.status === "completed";
          const leftPlayers = session.seriesId
            ? leftPlayersBySeriesMap.get(session.seriesId) || []
            : [];

          const sessionStartTime = new Date(session.startTime);
          const sessionDate = sessionStartTime.toISOString().split('T')[0];
          const leftPlayerIdsForSession = new Set(
            leftPlayers
              .filter(lp => !lp.leftAt || new Date(lp.leftAt) <= sessionStartTime)
              .map(lp => lp.playerId)
          );

          const pausedPlayersForSeries = session.seriesId
            ? pausedPlayersBySeriesMap.get(session.seriesId) || []
            : [];
          const pausedPlayerIdsForSession = new Set(
            pausedPlayersForSeries
              .filter((pp) => sessionDate >= pp.pauseFrom && sessionDate <= pp.pauseUntil)
              .map((pp) => pp.playerId)
          );

          const sessionPlayerIds = new Set(
            sessionSpecificPlayers.map((p) => p.playerId),
          );
          const filteredSessionPlayers = sessionSpecificPlayers.filter((p) => {
            if (pausedPlayerIdsForSession.has(p.playerId)) return false;
            if (isCompleted) return true;
            if (p.isGuest) return true;
            if (leftPlayerIdsForSession.has(p.playerId)) return false;
            return true;
          });

          const combinedPlayers = [
            ...filteredSessionPlayers.map((p) => ({
              id: p.playerId,
              name: p.playerName || "Unknown",
              ballLevel: p.playerBallLevel || null,
              profilePhotoUrl: p.profilePhotoUrl || null,
              status: p.attendanceStatus || "active",
              attendanceStatus: p.attendanceStatus,
              isGuest: p.isGuest,
            })),
            ...baseSeriesPlayers
              .filter((p) => !sessionPlayerIds.has(p.playerId))
              .map((p) => ({
                id: p.playerId,
                name: p.playerName || "Unknown",
                ballLevel: p.playerBallLevel || null,
                profilePhotoUrl: p.profilePhotoUrl || null,
                status: p.attendanceStatus || "active",
                attendanceStatus: null,
                isGuest: false,
              })),
          ];

          return {
            ...session,
            players: combinedPlayers,
          };
        });

        // Get blocked sessions (other coaches, no details) - filtered by academy
        const blockedSessions = await storage.getBlockedSessions(
          coachId as string,
          startDate,
          endDate,
          academyId ?? undefined,
        );
        const blockedSessionsMinimal = blockedSessions.map((s) => ({
          id: s.id,
          courtId: s.courtId,
          startTime: s.startTime,
          endTime: s.endTime,
          blocked: true,
        }));

        // Get external time blocks (this coach at OTHER academies - show as "Busy")
        // Use single range query for efficiency
        let externalBlocks: {
          startTime: Date;
          endTime: Date;
          isExternal: true;
          label: string;
        }[] = [];
        if (academyId) {
          const rawBlocks = await storage.getCoachExternalBlocksForRange(
            coachId as string,
            startDate,
            endDate,
            academyId,
          );
          externalBlocks = rawBlocks.map((block: any) => {
            // Convert date + time to full Date objects
            const [blockYear, blockMonth, blockDay] = block.date
              .split("-")
              .map(Number);
            const [startHour, startMin] = block.start_time
              .split(":")
              .map(Number);
            const [endHour, endMin] = block.end_time.split(":").map(Number);

            const blockStart = new Date(
              Date.UTC(
                blockYear,
                blockMonth - 1,
                blockDay,
                startHour,
                startMin,
                0,
                0,
              ),
            );
            const blockEnd = new Date(
              Date.UTC(
                blockYear,
                blockMonth - 1,
                blockDay,
                endHour,
                endMin,
                0,
                0,
              ),
            );

            return {
              startTime: blockStart,
              endTime: blockEnd,
              isExternal: true as const,
              label: "Busy",
            };
          });
        }

        // Get court availability blocks (manually blocked courts)
        const dateStrForQuery = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
        let courtBlockedSlots: any[] = [];
        if (view === "day") {
          courtBlockedSlots = await db
            .select()
            .from(courtAvailability)
            .where(
              and(
                eq(courtAvailability.date, dateStrForQuery),
                eq(courtAvailability.status, "blocked"),
              ),
            );
        } else if (view === "week") {
          const weekStartStr = `${startDate.getUTCFullYear()}-${(startDate.getUTCMonth() + 1).toString().padStart(2, "0")}-${startDate.getUTCDate().toString().padStart(2, "0")}`;
          const weekEndStr = `${endDate.getUTCFullYear()}-${(endDate.getUTCMonth() + 1).toString().padStart(2, "0")}-${endDate.getUTCDate().toString().padStart(2, "0")}`;
          courtBlockedSlots = await db
            .select()
            .from(courtAvailability)
            .where(
              and(
                gte(courtAvailability.date, weekStartStr),
                lte(courtAvailability.date, weekEndStr),
                eq(courtAvailability.status, "blocked"),
              ),
            );
        }
        const courtBlockedForResponse = courtBlockedSlots.map((slot: any) => {
          const [slotYear, slotMonth, slotDay] = slot.date
            .split("-")
            .map(Number);
          const [startH, startM] = (slot.startTime || "00:00")
            .split(":")
            .map(Number);
          const [endH, endM] = (slot.endTime || "01:00").split(":").map(Number);
          return {
            id: `court-block-${slot.id}`,
            courtId: slot.courtId,
            startTime: new Date(
              Date.UTC(slotYear, slotMonth - 1, slotDay, startH, startM, 0, 0),
            ),
            endTime: new Date(
              Date.UTC(slotYear, slotMonth - 1, slotDay, endH, endM, 0, 0),
            ),
            blocked: true as const,
            blockedReason: slot.blockedReason || "blocked",
            isCourtBlock: true,
          };
        });

        // Get coach personal time blocks (coach unavailability)
        let coachPersonalBlocks: any[] = [];
        try {
          const cbStartStr = `${startDate.getUTCFullYear()}-${(startDate.getUTCMonth() + 1).toString().padStart(2, "0")}-${startDate.getUTCDate().toString().padStart(2, "0")}`;
          const cbEndStr = `${endDate.getUTCFullYear()}-${(endDate.getUTCMonth() + 1).toString().padStart(2, "0")}-${endDate.getUTCDate().toString().padStart(2, "0")}`;
          const rawCoachBlocks = await db
            .select()
            .from(coachTimeBlocks)
            .where(
              and(
                eq(coachTimeBlocks.coachId, coachId as string),
                eq(coachTimeBlocks.sourceType, "blocked"),
                eq(coachTimeBlocks.status, "confirmed"),
                gte(coachTimeBlocks.date, cbStartStr),
                lte(coachTimeBlocks.date, cbEndStr),
              ),
            );
          coachPersonalBlocks = rawCoachBlocks.map((block: any) => {
            const [bY, bM, bD] = block.date.split("-").map(Number);
            const [sH, sM] = (block.startTime || "00:00")
              .split(":")
              .map(Number);
            const [eH, eM] = (block.endTime || "01:00").split(":").map(Number);
            return {
              id: `coach-block-${block.id}`,
              startTime: new Date(Date.UTC(bY, bM - 1, bD, sH, sM, 0, 0)),
              endTime: new Date(Date.UTC(bY, bM - 1, bD, eH, eM, 0, 0)),
              blockReason: block.blockReason || "personal",
              isCoachBlock: true,
            };
          });
        } catch (e) {
          // Table might not exist yet
        }

        // Get courts - filtered by academy
        const courts = await storage.getAllCourts(academyId ?? undefined);
        const locations = await storage.getAllLocations(academyId ?? undefined);
        res.json({
          ownSessions: sessionsWithPlayers,
          blockedSessions: [
            ...blockedSessionsMinimal,
            ...courtBlockedForResponse,
          ],
          externalBlocks,
          coachBlocks: coachPersonalBlocks,
          courts,
          locations,
          dateRange: { start: startDate, end: endDate },
        });
      } catch (error) {
        console.error("Error fetching calendar:", error);
        res.status(500).json({ error: "Failed to fetch calendar" });
      }
    },
  );

  // Get today's sessions for Coach HQ
  router.get(
    "/api/coach/sessions/today",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId;

        if (!coachId) {
          return res.status(400).json({ error: "Coach ID required" });
        }

        const today = new Date();
        const startOfDay = new Date(
          Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            today.getUTCDate(),
            0,
            0,
            0,
            0,
          ),
        );
        const endOfDay = new Date(
          Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            today.getUTCDate(),
            23,
            59,
            59,
            999,
          ),
        );

        const todaySessions = await storage.getSessionsByCoach(
          coachId,
          startOfDay,
          endOfDay,
          academyId ?? undefined,
        );

        const sessionsWithDetails = await Promise.all(
          todaySessions.map(async (session) => {
            const players = await storage.getSessionRoster(
              session.id,
              session.seriesId || null,
              academyId ?? undefined,
            );

            const [plan] = await db
              .select({ id: sessionPlans.id, status: sessionPlans.status })
              .from(sessionPlans)
              .where(eq(sessionPlans.sessionId, session.id));

            const firstPlayer = players[0];

            // Resolve location via court or direct session.locationId
            let resolvedLocationId: string | null = null;
            let locationName: string | null = null;
            let locationAddress: string | null = null;
            if (session.courtId) {
              const court = await storage.getCourt(session.courtId);
              if (court?.locationId) {
                resolvedLocationId = court.locationId;
                const loc = await storage.getLocation(court.locationId);
                locationName = loc?.name ?? null;
                locationAddress = loc?.address ?? null;
              }
            }
            if (!locationName && session.locationId) {
              resolvedLocationId = session.locationId;
              const loc = await storage.getLocation(session.locationId);
              locationName = loc?.name ?? null;
              locationAddress = loc?.address ?? null;
            }

            return {
              id: session.id,
              playerId: firstPlayer?.id || null,
              playerName: firstPlayer
                ? `${firstPlayer.firstName} ${firstPlayer.lastName}`
                : "No Player",
              playerLevel: firstPlayer?.ballLevel || "RED_3",
              startTime: session.startTime,
              endTime: session.endTime,
              type: session.type || "private",
              status:
                session.status === "completed"
                  ? "completed"
                  : session.status === "in_progress"
                    ? "in_progress"
                    : "scheduled",
              sessionPlanId: plan?.id || null,
              locationId: resolvedLocationId,
              locationName,
              locationAddress,
            };
          }),
        );

        res.json(sessionsWithDetails);
      } catch (error) {
        console.error("Error fetching today's sessions:", error);
        res.status(500).json({ error: "Failed to fetch today's sessions" });
      }
    },
  );

  // Get today's player birthdays for coaches

  // ==================== IN-SESSION PLAYER FEEDBACK ====================

  // Get in-session feedback for a session
  router.get(
    "/api/coach/sessions/:id/in-session-feedback",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validateSessionOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid) {
          return res.status(404).json({ error: "Session not found" });
        }

        const feedback = await db
          .select()
          .from(inSessionFeedback)
          .leftJoin(players, eq(inSessionFeedback.playerId, players.id))
          .where(eq(inSessionFeedback.sessionId, id))
          .orderBy(desc(inSessionFeedback.createdAt));

        res.json(
          feedback.map((f) => ({
            ...f.in_session_feedback,
            player: f.players
              ? { id: f.players.id, name: f.players.name }
              : null,
          })),
        );
      } catch (error) {
        console.error("Error fetching in-session feedback:", error);
        res.status(500).json({ error: "Failed to fetch feedback" });
      }
    },
  );

  // Create in-session feedback for a player
  router.post(
    "/api/coach/sessions/:id/in-session-feedback",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { playerId, feedbackType, message, visibility, pillarId } =
          req.body;
        const coachUserId = req.user!.userId;
        const academyId = req.user!.academyId;

        const { valid, session } = await validateSessionOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid || !session) {
          return res.status(404).json({ error: "Session not found" });
        }

        if (!playerId || !feedbackType || !message) {
          return res
            .status(400)
            .json({
              error: "Missing required fields: playerId, feedbackType, message",
            });
        }

        // Validate visibility
        const feedbackVisibility =
          visibility === "public" ? "public" : "private";

        // Calculate XP for positive public feedback
        let xpAwarded = 0;
        const POSITIVE_FEEDBACK_TYPES = [
          "praise",
          "effort",
          "technique",
          "improvement",
        ];
        if (
          feedbackVisibility === "public" &&
          POSITIVE_FEEDBACK_TYPES.includes(feedbackType)
        ) {
          xpAwarded =
            feedbackType === "praise" ? 15 : feedbackType === "effort" ? 10 : 5;

          // Award XP to player
          await storage.createXpTransaction({
            playerId,
            xpAmount: xpAwarded,
            source: "in_session_feedback",
            description: `Coach feedback: ${feedbackType}`,
            sessionId: id,
          });

          // Update player total XP
          const player = await storage.getPlayer(playerId);
          if (player) {
            const newTotalXp = (player.totalXp || 0) + xpAwarded;
            await storage.updatePlayer(playerId, { totalXp: newTotalXp });
          }
        }

        // Create feedback record
        const [feedback] = await db
          .insert(inSessionFeedback)
          .values({
            sessionId: id,
            playerId,
            coachId: coachUserId,
            feedbackType,
            message,
            visibility: feedbackVisibility,
            xpAwarded,
            pillarId: pillarId || null,
          })
          .returning();

        // Send push notification to player about new feedback
        try {
          const coachUser = await storage.getUserById(coachUserId);
          const coachName = coachUser?.fullName || "Your coach";
          const sessionName = session.name || "Training session";
          await sendFeedbackNotification(playerId, coachName, sessionName);

          if (xpAwarded > 0) {
            await sendXPGainNotification(
              playerId,
              xpAwarded,
              `Coach feedback: ${feedbackType}`,
            );
          }
        } catch (notifErr) {
          console.error("Error sending feedback notification:", notifErr);
        }

        res.json({ success: true, feedback, xpAwarded });
      } catch (error) {
        console.error("Error creating in-session feedback:", error);
        res.status(500).json({ error: "Failed to create feedback" });
      }
    },
  );

  // Get player profile data including dateOfBirth for PlayerContext
  router.get(
    "/api/player/me",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tokenUser = req.user!;

        // Get fresh user data
        const freshUser = await storage.getUserById(tokenUser.userId);
        if (!freshUser || !freshUser.playerId) {
          return res.status(400).json({ error: "Player not found" });
        }

        const player = await storage.getPlayer(freshUser.playerId);
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Get coach info if assigned
        let coach = null;
        if (player.coachId) {
          const coachData = await storage.getCoach(player.coachId);
          if (coachData) {
            coach = {
              id: coachData.id,
              name: coachData.name,
              username: coachData.name,
              photoUrl: coachData.photoUrl,
            };
          }
        }

        // Get academy info if assigned
        let academy = null;
        if (player.academyId) {
          const academyData = await storage.getAcademy(player.academyId);
          if (academyData) {
            academy = {
              id: academyData.id,
              name: academyData.name,
            };
          }
        }

        res.json({
          player: {
            id: player.id,
            name: player.name,
            displayName: player.displayName,
            email: player.email,
            ballLevel: player.ballLevel,
            level: player.level || 1,
            xp: player.totalXp || 0,
            glowScore: player.glowScore || 0,
            dateOfBirth: player.dateOfBirth,
            academyId: player.academyId,
            coachId: player.coachId,
            profilePhotoUrl: player.profilePhotoUrl,
            isAdult: player.isAdult || false,
            glowMmr: player.glowMmr || 1000,
            glowRank: player.glowRank || 9,
            totalMatchesPlayed: player.totalMatchesPlayed || 0,
            chatEnabled: player.chatEnabled ?? null,
            communityEnabled: player.communityEnabled ?? null,
            lastLatitude: player.lastLatitude ?? null,
            lastLongitude: player.lastLongitude ?? null,
            attendanceStreak: (player as any).attendanceStreak ?? null,
          },
          coach,
          academy,
        });
      } catch (error) {
        console.error("Error fetching player profile:", error);
        res.status(500).json({ error: "Failed to fetch player profile" });
      }
    },
  );

  // Get player's public feedback (for player app)
  router.get(
    "/api/player/me/feedback",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId) {
          return res.status(400).json({ error: "Player not found" });
        }

        const sport = typeof req.query.sport === "string" ? req.query.sport : null;

        const feedbackQuery = db
          .select({
            id: inSessionFeedback.id,
            feedbackType: inSessionFeedback.feedbackType,
            message: inSessionFeedback.message,
            xpAwarded: inSessionFeedback.xpAwarded,
            createdAt: inSessionFeedback.createdAt,
            sessionId: inSessionFeedback.sessionId,
          })
          .from(inSessionFeedback)
          .leftJoin(sessions, eq(sessions.id, inSessionFeedback.sessionId))
          .where(
            and(
              eq(inSessionFeedback.playerId, playerId),
              eq(inSessionFeedback.visibility, "public"),
              sport ? eq(sessions.sport, sport) : undefined,
            ),
          )
          .orderBy(desc(inSessionFeedback.createdAt))
          .limit(50);

        const feedback = await feedbackQuery;
        if (feedback.length > 0) {
          fireQuestEvent(playerId, "read_coach_feedback").catch(() => {});
        }
        res.json(feedback);
      } catch (error) {
        console.error("Error fetching player feedback:", error);
        res.status(500).json({ error: "Failed to fetch feedback" });
      }
    },
  );

  router.get(
    "/api/player/me/skill-assessments",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId) {
          return res.status(400).json({ error: "Player not found" });
        }

        const assessments = await db
          .select({
            id: deepAssessmentPillarSummaries.id,
            pillar: deepAssessmentPillarSummaries.pillar,
            pillarName: deepAssessmentPillarSummaries.pillar,
            averageScore: deepAssessmentPillarSummaries.averageScore,
            assessedSkills: deepAssessmentPillarSummaries.assessedSkills,
            totalSkills: deepAssessmentPillarSummaries.totalSkills,
            lastAssessedAt: deepAssessmentPillarSummaries.lastAssessedAt,
            createdAt: deepAssessmentPillarSummaries.updatedAt,
          })
          .from(deepAssessmentPillarSummaries)
          .where(eq(deepAssessmentPillarSummaries.playerId, playerId))
          .orderBy(desc(deepAssessmentPillarSummaries.updatedAt))
          .limit(100);

        res.json(assessments);
      } catch (error) {
        console.error("Error fetching skill assessments:", error);
        res.status(500).json({ error: "Failed to fetch skill assessments" });
      }
    },
  );

  const BALL_LEVEL_ENTRY_MAP: Record<string, string> = {
    blue: "BLUE_3",
    red: "RED_3",
    orange: "ORANGE_3",
    green: "GREEN_3",
    yellow: "YELLOW_3",
    glow: "YELLOW_1",
  };

  router.get(
    "/api/player/me/skill-scores",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId) {
          return res.status(400).json({ error: "Player not found" });
        }

        const PILLAR_ALIAS_MAP: Record<string, string> = {
          technical: "TECHNIQUE",
          technique: "TECHNIQUE",
          tactical: "TACTICAL",
          physical: "PHYSICAL",
          mental: "MENTAL",
          social: "SOCIAL",
          competition: "MATCH",
          match: "MATCH",
          TECHNIQUE: "TECHNIQUE",
          TACTICAL: "TACTICAL",
          PHYSICAL: "PHYSICAL",
          MENTAL: "MENTAL",
          SOCIAL: "SOCIAL",
          MATCH: "MATCH",
          COMPETITION: "MATCH",
        };

        const rawPillar = req.query.pillar as string | undefined;
        const pillarFilter = rawPillar
          ? (PILLAR_ALIAS_MAP[rawPillar] ?? rawPillar.toUpperCase())
          : undefined;

        const playerRow = await db
          .select({ ballLevel: players.ballLevel })
          .from(players)
          .where(eq(players.id, playerId))
          .limit(1);

        if (!playerRow.length) {
          return res.status(404).json({ error: "Player not found" });
        }

        const ballLevel = playerRow[0].ballLevel?.toLowerCase() || "red";
        const levelId = BALL_LEVEL_ENTRY_MAP[ballLevel] || "RED_3";

        const latestScoresSq = db
          .selectDistinctOn([playerSkillScores.skillId], {
            skillId: playerSkillScores.skillId,
            score: playerSkillScores.score,
          })
          .from(playerSkillScores)
          .where(eq(playerSkillScores.playerId, playerId))
          .orderBy(playerSkillScores.skillId, desc(playerSkillScores.createdAt))
          .as("latest_scores");

        const conditions = [eq(levelSkills.levelId, levelId)];
        if (pillarFilter) {
          conditions.push(eq(glowSkills.pillar, pillarFilter));
        }

        const skills = await db
          .select({
            skillId: levelSkills.skillId,
            name: glowSkills.name,
            pillar: glowSkills.pillar,
            description: glowSkills.description,
            targetScore: levelSkills.targetScore,
            isRequired: levelSkills.isRequired,
            playerScore: sql<number>`COALESCE(${latestScoresSq.score}, 0)`,
            levelId: levelSkills.levelId,
          })
          .from(levelSkills)
          .innerJoin(glowSkills, eq(glowSkills.id, levelSkills.skillId))
          .leftJoin(latestScoresSq, eq(latestScoresSq.skillId, levelSkills.skillId))
          .where(and(...conditions))
          .orderBy(glowSkills.pillar, glowSkills.name);

        res.json(skills);
      } catch (error) {
        console.error("Error fetching player skill scores:", error);
        res.status(500).json({ error: "Failed to fetch skill scores" });
      }
    },
  );

  router.get(
    "/api/player/me/session-feedback",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId) {
          return res.status(400).json({ error: "Player not found" });
        }

        const feedback = await db
          .select({
            id: inSessionFeedback.id,
            sessionId: inSessionFeedback.sessionId,
            sessionDate: sessions.startTime,
            sessionType: sessions.sessionType,
            feedbackType: inSessionFeedback.feedbackType,
            message: inSessionFeedback.message,
            xpAwarded: inSessionFeedback.xpAwarded,
            visibility: inSessionFeedback.visibility,
            pillarId: inSessionFeedback.pillarId,
            coachId: inSessionFeedback.coachId,
            coachName: coaches.name,
            createdAt: inSessionFeedback.createdAt,
          })
          .from(inSessionFeedback)
          .leftJoin(sessions, eq(sessions.id, inSessionFeedback.sessionId))
          .leftJoin(coaches, eq(coaches.id, inSessionFeedback.coachId))
          .where(
            and(
              eq(inSessionFeedback.playerId, playerId),
              eq(inSessionFeedback.visibility, "public"),
            ),
          )
          .orderBy(desc(inSessionFeedback.createdAt))
          .limit(100);

        res.json(feedback);
      } catch (error) {
        console.error("Error fetching session feedback:", error);
        res.status(500).json({ error: "Failed to fetch session feedback" });
      }
    },
  );

  // GET /api/player/me/stroke-feedback - Get player's stroke feedback timeline
  router.get(
    "/api/player/me/stroke-feedback",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId) {
          return res.status(400).json({ error: "Player not found" });
        }

        const strokeSport = typeof req.query.sport === "string" ? req.query.sport : null;

        const feedbackRows = await db
          .select({
            id: sessionSkillFeedback.id,
            sessionId: sessionSkillFeedback.sessionId,
            strokeFeedback: sessionSkillFeedback.strokeFeedback,
            lessonIntensity: sessionSkillFeedback.lessonIntensity,
            playerNote: sessionSkillFeedback.playerNote,
            overall: sessionSkillFeedback.overall,
            effort: sessionSkillFeedback.effort,
            createdAt: sessionSkillFeedback.createdAt,
          })
          .from(sessionSkillFeedback)
          .leftJoin(sessions, eq(sessions.id, sessionSkillFeedback.sessionId))
          .where(
            and(
              eq(sessionSkillFeedback.playerId, playerId),
              strokeSport ? eq(sessions.sport, strokeSport) : undefined,
            ),
          )
          .orderBy(desc(sessionSkillFeedback.createdAt))
          .limit(50);

        res.json(feedbackRows);
      } catch (error) {
        console.error("Error fetching player stroke feedback:", error);
        res.status(500).json({ error: "Failed to fetch stroke feedback" });
      }
    },
  );

  // GET /api/player/me/glow-ratings - Get player's glow session ratings (effort/execution/understanding from coaches)
  router.get(
    "/api/player/me/glow-ratings",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId) {
          return res.status(400).json({ error: "Player not found" });
        }

        const ratings = await db
          .select({
            id: sessionSkillFeedback.id,
            sessionId: sessionSkillFeedback.sessionId,
            effort: sessionSkillFeedback.effort,
            execution: sessionSkillFeedback.execution,
            understanding: sessionSkillFeedback.understanding,
            overall: sessionSkillFeedback.overall,
            note: sessionSkillFeedback.note,
            createdAt: sessionSkillFeedback.createdAt,
            sessionDate: sessions.startTime,
            coachName: coaches.name,
            techniquePillar: sessionSkillFeedback.techniquePillar,
            tacticalPillar: sessionSkillFeedback.tacticalPillar,
            physicalPillar: sessionSkillFeedback.physicalPillar,
            mentalPillar: sessionSkillFeedback.mentalPillar,
            socialPillar: sessionSkillFeedback.socialPillar,
            matchPillar: sessionSkillFeedback.matchPillar,
            aiNote: sql<string | null>`(
              SELECT message FROM in_session_feedback
              WHERE session_id = ${sessionSkillFeedback.sessionId}
                AND player_id = ${sessionSkillFeedback.playerId}
                AND feedback_type = 'ai_session_note'
              ORDER BY created_at DESC
              LIMIT 1
            )`,
          })
          .from(sessionSkillFeedback)
          .leftJoin(sessions, eq(sessions.id, sessionSkillFeedback.sessionId))
          .leftJoin(coaches, eq(coaches.id, sessionSkillFeedback.coachId))
          .where(eq(sessionSkillFeedback.playerId, playerId))
          .orderBy(desc(sessionSkillFeedback.createdAt))
          .limit(50);

        res.json(ratings);
      } catch (error) {
        console.error("Error fetching player glow ratings:", error);
        res.status(500).json({ error: "Failed to fetch glow ratings" });
      }
    },
  );

  // ==================== PLAYER NOTIFICATIONS ====================

  // GET /api/player/me/notifications - Get player's notifications
  router.get(
    "/api/player/me/notifications",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId)
          return res.status(400).json({ error: "Player not found" });

        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const offset = parseInt(req.query.offset as string) || 0;
        const notifications = await db
          .select()
          .from(playerNotifications)
          .where(eq(playerNotifications.playerId, playerId))
          .orderBy(desc(playerNotifications.createdAt))
          .limit(limit)
          .offset(offset);

        res.json(notifications);
      } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ error: "Failed to fetch notifications" });
      }
    },
  );

  // GET /api/player/me/notifications/unread-count
  router.get(
    "/api/player/me/notifications/unread-count",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId)
          return res.status(400).json({ error: "Player not found" });

        const [result] = await db
          .select({ count: count() })
          .from(playerNotifications)
          .where(
            and(
              eq(playerNotifications.playerId, playerId),
              eq(playerNotifications.read, false),
            ),
          );

        res.json({ count: result?.count || 0 });
      } catch (error) {
        console.error("Error fetching unread count:", error);
        res.status(500).json({ error: "Failed to fetch unread count" });
      }
    },
  );

  // POST /api/player/me/notifications/mark-read
  router.post(
    "/api/player/me/notifications/mark-read",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId)
          return res.status(400).json({ error: "Player not found" });

        const markReadSchema = z.object({ notificationIds: z.array(z.number().int().positive()).optional() });
        const parsedMarkRead = markReadSchema.safeParse(req.body);
        if (!parsedMarkRead.success) return res.status(400).json({ error: fromZodError(parsedMarkRead.error).message });
        const { notificationIds } = parsedMarkRead.data;

        if (notificationIds && Array.isArray(notificationIds)) {
          await db
            .update(playerNotifications)
            .set({ read: true, readAt: new Date() })
            .where(
              and(
                eq(playerNotifications.playerId, playerId),
                inArray(playerNotifications.id, notificationIds),
              ),
            );
        } else {
          // Mark all as read
          await db
            .update(playerNotifications)
            .set({ read: true, readAt: new Date() })
            .where(
              and(
                eq(playerNotifications.playerId, playerId),
                eq(playerNotifications.read, false),
              ),
            );
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Error marking notifications read:", error);
        res.status(500).json({ error: "Failed to mark notifications read" });
      }
    },
  );

  // GET /api/player/me/weekly-digest - Get the latest ai_weekly_digest notification
  router.get(
    "/api/player/me/weekly-digest",
    authMiddleware,
    requirePlayerOrOwner,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const playerId = req.user!.playerId;
        if (!playerId) return res.status(400).json({ error: "Player not found" });

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

        res.json(digest);
      } catch (error) {
        console.error("Error fetching weekly digest:", error);
        res.status(500).json({ error: "Failed to fetch weekly digest" });
      }
    },
  );

  // ==================== SESSION CANCELLATION ====================

  // Cancel session by coach (no charge, with reason)
  router.post(
    "/api/coach/sessions/:id/cancel",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { reason } = req.body;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId;

        // Validate session ownership
        const { valid, session } = await validateSessionOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid || !session) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Check if session is already cancelled or completed
        if (session.status === "cancelled" || session.status === "completed") {
          return res
            .status(400)
            .json({ error: `Session is already ${session.status}` });
        }

        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );

        // Update session with cancellation details (no charge for coach-initiated cancellations)
        const updates: Record<string, unknown> = {
          status: "cancelled",
          cancelledAt: now,
          cancelledBy: coachId,
          cancellationReason: reason || "Cancelled by coach",
          isLastMinuteCancellation: false,
          cancellationCharged: false,
          cancellationChargeAmount: null,
        };

        await storage.updateSession(id, updates);

        // Delete the unified time block to free up this time slot
        await storage.deleteCoachTimeBlockBySession(id);

        // Refund credits for any players who had credits deducted for this session
        const sessionPlayersForRefund = await storage.getSessionPlayers(id);
        const refundResults: {
          playerId: string;
          playerName?: string;
          success: boolean;
          reason?: string;
        }[] = [];

        for (const sp of sessionPlayersForRefund) {
          // Only refund if credits were actually deducted (creditDeductedAt is set)
          if (sp.creditDeductedAt) {
            const refundResult = await storage.refundCreditsForSession(
              sp.playerId,
              id,
              academyId,
            );
            const player = await storage.getPlayer(sp.playerId, academyId);
            refundResults.push({
              playerId: sp.playerId,
              playerName: player?.name,
              success: refundResult.success,
              reason: refundResult.reason,
            });

            if (refundResult.success) {
              console.log(
                `[Cancel] Refunded ${refundResult.creditType} credit to player ${player?.name || sp.playerId}`,
              );
            }
          }
        }

        // Cancel ghost debt for players who attended without an active package
        // (creditDeductedAt is null = no package credit was consumed = potential debt transaction)
        for (const sp of sessionPlayersForRefund) {
          if (!sp.creditDeductedAt) {
            const debtResult = await storage.cancelSessionDebt(sp.playerId, id);
            if (debtResult.cancelled) {
              console.log(`[Cancel] Cancelled ghost debt for player ${sp.playerId}, session ${id}`);
            }
          }
        }

        // Audit log
        await storage.createAuditLog({
          entityType: "session",
          entityId: id,
          action: "cancelled",
          performedBy: coachId || req.user!.userId,
          details: JSON.stringify({
            reason: reason || "Cancelled by coach",
            cancelledBy: "coach",
            noCharge: true,
            creditsRefunded: refundResults.filter((r) => r.success).length,
          }),
          academyId: academyId!,
        });

        if (coachId) {
          apiCache.invalidate(`calendar:${coachId}`);
        }

        // Broadcast session cancellation via WebSocket
        if (academyId) {
          broadcastSessionUpdate(academyId, {
            sessionId: id,
            type: "cancelled",
          });
        }

        const refundedCount = refundResults.filter((r) => r.success).length;
        res.json({
          success: true,
          message:
            refundedCount > 0
              ? `Session cancelled. ${refundedCount} credit(s) refunded to players.`
              : "Session has been cancelled successfully.",
          creditsRefunded: refundResults,
        });
      } catch (error) {
        console.error("Error cancelling session:", error);
        res.status(500).json({ error: "Failed to cancel session" });
      }
    },
  );

  // Mark session as last-minute cancelled with policy enforcement (legacy - for student cancellations)
  router.post(
    "/api/coach/sessions/:id/last-minute-cancel",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId;

        // Validate session ownership
        const { valid, session } = await validateSessionOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid || !session) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Check if session is already cancelled or completed
        if (session.status === "cancelled" || session.status === "completed") {
          return res
            .status(400)
            .json({ error: `Session is already ${session.status}` });
        }

        // Get academy cancellation policy settings
        const settings = await storage.getAcademySettings(academyId!);
        const policyEnabled = settings?.cancellationPolicyEnabled !== false;
        const windowHours = settings?.cancellationWindowHours || 24;
        const chargePercent = settings?.cancellationChargePercent || 100;

        // Calculate hours until session
        const dateParam = req.query.date as string | undefined;
        const now = dateParam ? new Date(dateParam) : new Date();
        const DUBAI_OFFSET = 4;
        const dubaiNow = new Date(
          now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
        );
        const sessionStart = new Date(session.startTime);
        const hoursUntilSession =
          (sessionStart.getTime() - now.getTime()) / (1000 * 60 * 60);

        // Determine if this is a chargeable last-minute cancellation
        const isLastMinute = hoursUntilSession <= windowHours;
        const shouldCharge = policyEnabled && isLastMinute && chargePercent > 0;

        // Calculate charge amount
        let chargeAmount = 0;
        if (shouldCharge && session.price) {
          const sessionPrice = parseFloat(session.price.toString());
          chargeAmount = (sessionPrice * chargePercent) / 100;
        }

        // Update session with cancellation details
        const updates: Record<string, unknown> = {
          status: "cancelled",
          cancelledAt: now,
          cancelledBy: coachId,
          isLastMinuteCancellation: isLastMinute,
          cancellationCharged: shouldCharge,
          cancellationChargeAmount: shouldCharge
            ? chargeAmount.toString()
            : null,
        };

        await storage.updateSession(id, updates);

        // Delete the unified time block to free up this time slot
        await storage.deleteCoachTimeBlockBySession(id);

        // If charged, create an invoice for the cancellation fee
        if (shouldCharge && chargeAmount > 0) {
          const sessionPlayers = await storage.getSessionPlayers(id);
          for (const sp of sessionPlayers) {
            if (sp.playerId) {
              const player = await storage.getPlayer(sp.playerId);
              if (player) {
                await storage.createInvoice({
                  academyId: academyId!,
                  playerId: sp.playerId,
                  invoiceNumber: `CANCEL-${Date.now()}-${sp.playerId.slice(-4)}`,
                  amount: chargeAmount.toString(),
                  currency: settings?.currency || "AED",
                  status: "pending",
                  dueDate: new Date(
                    Date.now() +
                      (settings?.invoiceDueDays || 14) * 24 * 60 * 60 * 1000,
                  ).toISOString(),
                  notes: `Late cancellation fee for session on ${sessionStart.toLocaleDateString()}`,
                  lineItems: JSON.stringify([
                    {
                      description: `Late Cancellation Fee (${chargePercent}% of lesson)`,
                      quantity: 1,
                      unitPrice: chargeAmount,
                      total: chargeAmount,
                    },
                  ]),
                });
              }
            }
          }
        }

        // Cancel ghost debt for players who attended without an active package
        const lastMinutePlayers = await storage.getSessionPlayers(id);
        for (const sp of lastMinutePlayers) {
          if (!sp.creditDeductedAt) {
            const debtResult = await storage.cancelSessionDebt(sp.playerId, id);
            if (debtResult.cancelled) {
              console.log(`[LastMinuteCancel] Cancelled ghost debt for player ${sp.playerId}, session ${id}`);
            }
          }
        }

        // Audit log
        await storage.createAuditLog({
          entityType: "session",
          entityId: id,
          action: isLastMinute ? "last_minute_cancel" : "cancel",
          performedBy: coachId || undefined,
          metadata: JSON.stringify({
            hoursUntilSession: hoursUntilSession.toFixed(1),
            charged: shouldCharge,
            chargeAmount,
          }),
        });

        if (coachId) {
          apiCache.invalidate(`calendar:${coachId}`);
        }

        // Broadcast session cancellation via WebSocket
        if (academyId) {
          broadcastSessionUpdate(academyId, {
            sessionId: id,
            type: "cancelled",
          });
        }

        res.json({
          success: true,
          isLastMinute,
          charged: shouldCharge,
          chargeAmount,
          chargePercent: shouldCharge ? chargePercent : 0,
          message: shouldCharge
            ? `Session cancelled. ${chargePercent}% cancellation fee applied.`
            : isLastMinute
              ? "Session cancelled (no charge - policy disabled)"
              : "Session cancelled within policy window (no charge)",
        });
      } catch (error) {
        console.error("Error cancelling session:", error);
        res.status(500).json({ error: "Failed to cancel session" });
      }
    },
  );

  // ==================== COACH PIN PROTECTION ====================

  // Verify PIN for Parent Dashboard access
  router.post(
    "/api/coach/pin/verify",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        const pinVerifySchema = z.object({ pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits") });
        const parsedPin = pinVerifySchema.safeParse(req.body);
        if (!parsedPin.success) return res.status(400).json({ error: fromZodError(parsedPin.error).message });
        const { pin } = parsedPin.data;

        if (!coachId) {
          return res.status(400).json({ error: "Coach ID required" });
        }

        if (
          !pin ||
          typeof pin !== "string" ||
          pin.length !== 4 ||
          !/^\d{4}$/.test(pin)
        ) {
          return res
            .status(400)
            .json({ error: "PIN must be exactly 4 digits" });
        }

        const coach = await storage.getCoach(coachId);
        if (!coach) {
          return res.status(404).json({ error: "Coach not found" });
        }

        const storedPin = coach.parentDashboardPin || "1234";
        const isValid = pin === storedPin;
        const requiresChange = !coach.pinChangedAt; // Never changed from default

        res.json({
          valid: isValid,
          requiresChange: isValid ? requiresChange : false,
        });
      } catch (error) {
        console.error("Error verifying PIN:", error);
        res.status(500).json({ error: "Failed to verify PIN" });
      }
    },
  );

  // Change PIN
  router.post(
    "/api/coach/pin/change",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        const pinChangeSchema = z.object({
          currentPin: z.string().regex(/^\d{4}$/).optional(),
          newPin: z.string().regex(/^\d{4}$/, "New PIN must be exactly 4 digits"),
        });
        const parsedPinChange = pinChangeSchema.safeParse(req.body);
        if (!parsedPinChange.success) return res.status(400).json({ error: fromZodError(parsedPinChange.error).message });
        const { currentPin, newPin } = parsedPinChange.data;

        if (!coachId) {
          return res.status(400).json({ error: "Coach ID required" });
        }

        if (
          !newPin ||
          typeof newPin !== "string" ||
          newPin.length !== 4 ||
          !/^\d{4}$/.test(newPin)
        ) {
          return res
            .status(400)
            .json({ error: "New PIN must be exactly 4 digits" });
        }

        const coach = await storage.getCoach(coachId);
        if (!coach) {
          return res.status(404).json({ error: "Coach not found" });
        }

        const storedPin = coach.parentDashboardPin || "1234";

        // If PIN was never changed, allow any currentPin (first-time setup)
        if (coach.pinChangedAt && currentPin !== storedPin) {
          return res.status(401).json({ error: "Current PIN is incorrect" });
        }

        await storage.updateCoach(coachId, {
          parentDashboardPin: newPin,
          pinChangedAt: new Date(),
        });

        res.json({ success: true, message: "PIN changed successfully" });
      } catch (error) {
        console.error("Error changing PIN:", error);
        res.status(500).json({ error: "Failed to change PIN" });
      }
    },
  );

  // Platform Owner: Reset coach PIN to default
  router.post(
    "/api/platform/coaches/:coachId/reset-pin",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.user!;

        // Only platform owners can reset PINs
        if (user.role !== "platform_owner") {
          return res
            .status(403)
            .json({ error: "Only platform owners can reset PINs" });
        }

        const { coachId } = req.params;

        const coach = await storage.getCoach(coachId);
        if (!coach) {
          return res.status(404).json({ error: "Coach not found" });
        }

        await storage.updateCoach(coachId, {
          parentDashboardPin: "1234",
          pinChangedAt: null,
        });

        // Audit log
        await storage.createAuditLog({
          entityType: "coach",
          entityId: coachId,
          action: "pin_reset",
          performedBy: user.coachId || undefined,
          metadata: JSON.stringify({ resetTo: "default" }),
        });

        res.json({
          success: true,
          message: `PIN for ${coach.name} reset to 1234`,
        });
      } catch (error) {
        console.error("Error resetting PIN:", error);
        res.status(500).json({ error: "Failed to reset PIN" });
      }
    },
  );

  // Offline sync
  router.post(
    "/api/coach/offline/sync",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        const { actions } = req.body;

        const results = [];
        for (const action of actions) {
          try {
            // Process each offline action
            switch (action.type) {
              case "attendance": {
                const spRecord = await storage.updateAttendance(
                  action.sessionId,
                  action.playerId,
                  action.status,
                  action.lateMinutes,
                  action.absenceReason,
                );
                const isChargeable = action.status === "present" || action.status === "late";
                if (isChargeable && spRecord && !spRecord.creditDeductedAt) {
                  try {
                    const { ensureCreditProcessed } = await import("../storage");
                    await ensureCreditProcessed(spRecord.id);
                  } catch (creditErr) {
                    console.error(`[OfflineSync] Credit processing failed for player ${action.playerId}:`, creditErr);
                  }
                }
                // Note: holiday/vacation debt cancellation is handled inside updateAttendance()
                break;
              }
              case "feedback":
                await storage.createSessionFeedback({
                  sessionId: action.sessionId,
                  intensity: action.intensity,
                  mood: action.mood,
                  focusTags: action.focusTags,
                  coachNotes: action.coachNotes,
                });
                break;
            }
            results.push({ id: action.id, success: true });
          } catch (err) {
            results.push({
              id: action.id,
              success: false,
              error: (err as Error).message,
            });
          }
        }

        res.json({ synced: results });
      } catch (error) {
        console.error("Error syncing offline actions:", error);
        res.status(500).json({ error: "Failed to sync" });
      }
    },
  );

// GET /api/coach/sessions/:sessionId/brief — returns AI coaching brief for a session
router.get(
  "/api/coach/sessions/:sessionId/brief",
  authMiddleware,
  requireAcademy,
  requireRole(["coach", "assistant", "academy_owner", "platform_owner"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const academyId = req.user!.academyId;

      // Verify the requester belongs to the same academy as the session
      const { valid } = await validateSessionOwnership(sessionId, academyId, storage);
      if (!valid) {
        return res.status(403).json({ error: "Not authorized to view this session brief" });
      }

      const [brief] = await db
        .select()
        .from(sessionAiBriefs)
        .where(eq(sessionAiBriefs.sessionId, sessionId))
        .limit(1);

      if (!brief) {
        return res.status(404).json({ error: "No brief available for this session" });
      }

      return res.json(brief);
    } catch (error) {
      console.error("[API] Error fetching session brief:", error);
      return res.status(500).json({ error: "Failed to fetch session brief" });
    }
  }
);

// GET /api/coach/players/:playerId/session-ratings — fetch all ratings for a player (keyed by sessionId)
router.get(
  "/api/coach/players/:playerId/session-ratings",
  authMiddleware,
  requireRole("coach"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const coachAcademyId = req.user?.academyId;
      const coachId = req.user?.coachId;
      if (!coachAcademyId && !coachId) return res.status(403).json({ error: "Coach scope required" });

      // Scoped to the coach's academy or, for non-academy coaches, to their own sessions
      const whereClause = coachAcademyId
        ? and(eq(sessionRatings.playerId, playerId), eq(sessionRatings.academyId, coachAcademyId))
        : and(eq(sessionRatings.playerId, playerId), eq(sessionRatings.coachId, coachId!));

      const ratings = await db
        .select({
          sessionId: sessionRatings.sessionId,
          rating: sessionRatings.rating,
          comment: sessionRatings.comment,
          createdAt: sessionRatings.createdAt,
        })
        .from(sessionRatings)
        .where(whereClause)
        .orderBy(desc(sessionRatings.createdAt));

      // Return as a map keyed by sessionId for easy lookup
      const ratingMap: Record<string, { rating: number; comment: string | null; createdAt: Date | null }> = {};
      for (const r of ratings) {
        ratingMap[r.sessionId] = { rating: r.rating, comment: r.comment, createdAt: r.createdAt };
      }
      return res.json({ ratings: ratingMap });
    } catch (error) {
      console.error("[API] Error fetching player session ratings:", error);
      return res.status(500).json({ error: "Failed to fetch ratings" });
    }
  }
);

// GET /api/coach/sessions/:sessionId/ratings — fetch player ratings for a session
router.get(
  "/api/coach/sessions/:sessionId/ratings",
  authMiddleware,
  requireRole("coach"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const coachAcademyId = req.user?.academyId;
      const coachId = req.user?.coachId;
      if (!coachAcademyId && !coachId) return res.status(403).json({ error: "Coach scope required" });

      // Verify session belongs to this coach's academy (or this coach directly)
      const sessionRow = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
      });
      if (!sessionRow) return res.status(404).json({ error: "Session not found" });
      if (coachAcademyId && sessionRow.academyId !== coachAcademyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (!coachAcademyId && coachId && sessionRow.coachId !== coachId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const ratings = await db
        .select({
          id: sessionRatings.id,
          playerId: sessionRatings.playerId,
          rating: sessionRatings.rating,
          comment: sessionRatings.comment,
          createdAt: sessionRatings.createdAt,
          playerName: players.name,
        })
        .from(sessionRatings)
        .leftJoin(players, eq(sessionRatings.playerId, players.id))
        .where(eq(sessionRatings.sessionId, sessionId))
        .orderBy(desc(sessionRatings.createdAt));

      const averageRating =
        ratings.length > 0
          ? Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length) * 10) / 10
          : null;

      return res.json({ ratings, averageRating, count: ratings.length });
    } catch (error) {
      console.error("[API] Error fetching session ratings:", error);
      return res.status(500).json({ error: "Failed to fetch ratings" });
    }
  }
);

export default router;
