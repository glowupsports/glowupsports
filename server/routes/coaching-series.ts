import crypto from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
  import { db } from "../db";
  import { storage, getSessionTypeByPlayerCount, updateSeriesSessionType, recalculateSeriesCredits } from "../storage";
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
  import { sendSessionConfirmedNotification, sendSessionCancelledNotification, sendFeedbackNotification, getPlayerPushTokens, sendPushNotification } from "../pushNotifications";
  import { awardXP } from "../services/xp-service";
  import { broadcastNewSession, broadcastSessionUpdate } from "../websocket";
  import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "../googleCalendarService";
  const router = Router();

  function toDubaiTime(utcDate: Date): Date {
    const dubaiOffset = 4 * 60; // minutes
    const utcTime = utcDate.getTime();
    return new Date(utcTime + dubaiOffset * 60 * 1000);
  }
  
  
    // ==================== COACHING SERIES API ====================
  // Series-first approach: coaches manage training blocks, not individual sessions

  // Get all coaching series for the logged-in coach
  router.get(
    "/api/coach/series",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId;

        if (!coachId) {
          return res.status(400).json({ error: "Coach ID required" });
        }

        const { status } = req.query;

        // Check cache first
        const cacheKey = CACHE_KEYS.COACH_SERIES(
          coachId,
          (status as string) || "all",
        );
        const cached = apiCache.get(cacheKey);
        if (cached) {
          console.log("[Series PERF] Cache HIT for coach:", coachId);
          return res.json(cached);
        }
        const _perfStart = Date.now();

        let series;
        if (status === "active") {
          series = await storage.getActiveCoachingSeries(
            coachId,
            academyId || undefined,
          );
        } else {
          series = await storage.getCoachingSeries(
            coachId,
            academyId || undefined,
          );
        }

        // OPTIMIZED: Batch fetch all data upfront to avoid N+1 queries
        const seriesIds = series.map((s) => s.id);

        // Parallel batch fetch all related data
        const [allSeriesPlayers, allPausedPlayers, allCompletedSessions, allNextSessions] =
          await Promise.all([
            // Batch fetch all active players for all series
            seriesIds.length > 0
              ? db
                  .select({
                    seriesId: seriesPlayers.seriesId,
                    playerId: seriesPlayers.playerId,
                    status: seriesPlayers.status,
                    playerName: players.name,
                    hostBallLevel: players.ballLevel,
                    playerBallLevel: players.ballLevel,
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

            // Batch fetch paused player counts for all series
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
                      eq(seriesPlayers.status, "paused"),
                    ),
                  )
                  .groupBy(seriesPlayers.seriesId)
              : Promise.resolve([]),

            // Batch fetch all completed sessions for all series
            seriesIds.length > 0
              ? db
                  .select({
                    seriesId: sessions.seriesId,
                    id: sessions.id,
                  })
                  .from(sessions)
                  .where(
                    and(
                      inArray(sessions.seriesId, seriesIds),
                      eq(sessions.status, "completed"),
                    ),
                  )
              : Promise.resolve([]),

            // Batch fetch next scheduled session for each series (use subquery approach)
            seriesIds.length > 0
              ? db
                  .select({
                    seriesId: sessions.seriesId,
                    startTime: sql<Date>`MIN(${sessions.startTime})`,
                  })
                  .from(sessions)

                  .where(
                    and(
                      inArray(sessions.seriesId, seriesIds),
                      eq(sessions.status, "scheduled"),
                      gte(sessions.startTime, new Date()),
                    ),
                  )
                  .groupBy(sessions.seriesId)
              : Promise.resolve([]),
          ]);

        // Get feedback counts for all completed sessions
        const allCompletedSessionIds = allCompletedSessions.map((s) => s.id);
        const feedbackCounts =
          allCompletedSessionIds.length > 0
            ? await db
                .select({
                  sessionId: sessionFeedback.sessionId,
                })
                .from(sessionFeedback)
                .where(
                  inArray(sessionFeedback.sessionId, allCompletedSessionIds),
                )
            : [];

        // Create paused count map
        const pausedCountMap = new Map<string, number>();
        for (const p of allPausedPlayers) {
          if (p.seriesId) pausedCountMap.set(p.seriesId, p.count);
        }

        // Create lookup maps for O(1) access
        const playersBySeriesMap = new Map<string, typeof allSeriesPlayers>();
        for (const p of allSeriesPlayers) {
          if (!p.seriesId) continue;
          if (!playersBySeriesMap.has(p.seriesId))
            playersBySeriesMap.set(p.seriesId, []);
          playersBySeriesMap.get(p.seriesId)!.push(p);
        }

        const completedCountMap = new Map<string, number>();
        const completedSessionIdsBySeriesMap = new Map<string, string[]>();
        for (const s of allCompletedSessions) {
          if (!s.seriesId) continue;
          completedCountMap.set(
            s.seriesId,
            (completedCountMap.get(s.seriesId) || 0) + 1,
          );
          if (!completedSessionIdsBySeriesMap.has(s.seriesId))
            completedSessionIdsBySeriesMap.set(s.seriesId, []);
          completedSessionIdsBySeriesMap.get(s.seriesId)!.push(s.id);
        }

        const nextSessionMap = new Map<string, Date>();
        for (const s of allNextSessions) {
          if (s.seriesId && s.startTime)
            nextSessionMap.set(s.seriesId, s.startTime);
        }

        const feedbackSessionIds = new Set(
          feedbackCounts.map((f) => f.sessionId),
        );

        // Process all series using cached data (no await in loop)
        const enrichedSeries = series.map((s) => {
          const activePlayers = playersBySeriesMap.get(s.id) || [];
          const sessionsCompleted = completedCountMap.get(s.id) || 0;
          const completedSessionIds =
            completedSessionIdsBySeriesMap.get(s.id) || [];
          const sessionsWithFeedback = completedSessionIds.filter((id) =>
            feedbackSessionIds.has(id),
          ).length;
          const pendingFeedback = Math.max(
            0,
            sessionsCompleted - sessionsWithFeedback,
          );
          const nextSessionDate = nextSessionMap.get(s.id) || null;

          const playerPreview = activePlayers.map((p) => ({
            id: p.playerId,
            name: p.playerName || "Unknown",
            ballLevel: p.playerBallLevel || null,
          }));

          // Get primary ball level (most common among players)
          const ballLevelCounts: Record<string, number> = {};
          activePlayers.forEach((p) => {
            const level = p.playerBallLevel;
            if (level) {
              ballLevelCounts[level] = (ballLevelCounts[level] || 0) + 1;
            }
          });
          const primaryBallLevel =
            Object.entries(ballLevelCounts).sort(
              (a, b) => b[1] - a[1],
            )[0]?.[0] || null;

          return {
            ...s,
            playerCount: activePlayers.length,
            pausedCount: pausedCountMap.get(s.id) || 0,
            playerNames: activePlayers
              .map((p) => p.playerName || "Unknown")
              .slice(0, 4),
            sessionsCompleted,
            pendingFeedback,
            playerPreview,
            primaryBallLevel,
            nextSessionDate,
          };
        });

        // Find orphan sessions: sessions assigned to this coach but belonging to another coach's series
        // These are transferred sessions that should appear as "virtual flexible" entries
        const ownSeriesIds = series.map((s) => s.id);
        const orphanSessions = await db
          .select()
          .from(sessions)

          .where(
            and(
              eq(sessions.coachId, coachId),
              or(
                // Sessions with a seriesId not in this coach's series
                ownSeriesIds.length > 0
                  ? and(
                      isNotNull(sessions.seriesId),
                      notInArray(sessions.seriesId, ownSeriesIds),
                    )
                  : isNotNull(sessions.seriesId),
                // Sessions without a seriesId (standalone transferred sessions)
                isNull(sessions.seriesId),
              ),
            ),
          )
          .orderBy(asc(sessions.startTime));

        // Group orphan sessions into virtual "flexible" series entries
        const virtualFlexibleSeries: any[] = [];
        if (orphanSessions.length > 0) {
          // Group by original seriesId to create one virtual entry per transferred block
          const groupedBySeriesId = orphanSessions.reduce(
            (acc, session) => {
              const key = session.seriesId || "standalone";
              if (!acc[key]) acc[key] = [];
              acc[key].push(session);
              return acc;
            },
            {} as Record<string, typeof orphanSessions>,
          );

          for (const [seriesKey, sessionsGroup] of Object.entries(
            groupedBySeriesId,
          )) {
            const firstSession = sessionsGroup[0];
            const completedCount = sessionsGroup.filter(
              (s) => s.status === "completed",
            ).length;
            const dateParam = req.query.date as string | undefined;
            const now = dateParam ? new Date(dateParam) : new Date();
            const DUBAI_OFFSET = 4;
            const dubaiNow = new Date(
              now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
            );
            const nextSession = sessionsGroup.find(
              (s) => s.status === "scheduled" && new Date(s.startTime) > now,
            );

            // Get players from first session
            const sessionPlayersList = await db
              .select()
              .from(sessionPlayers)
              .where(eq(sessionPlayers.sessionId, firstSession.id));

            const playerDetails = await Promise.all(
              sessionPlayersList.slice(0, 4).map(async (sp) => {
                const player = await storage.getPlayer(sp.playerId);
                return {
                  id: sp.playerId,
                  name: player?.name || "Unknown",
                  ballLevel: player?.ballLevel || null,
                };
              }),
            );

            virtualFlexibleSeries.push({
              id: `virtual-${seriesKey}`,
              title: firstSession.title || "Transferred Session",
              status: "active",
              sessionType: firstSession.sessionType,
              dayOfWeek: -1, // Flexible indicator
              startTime: firstSession.startTime,
              duration: firstSession.duration,
              coachId: coachId,
              academyId: academyId,
              maxPlayers: firstSession.maxPlayers || 1,
              ballLevel: firstSession.ballLevel,
              weekCount: sessionsGroup.length,
              xpPerSession: firstSession.xpPerSession || 25,
              createdAt: firstSession.createdAt,
              isTransferred: true, // Mark as transferred sessions
              originalSeriesId: seriesKey !== "standalone" ? seriesKey : null,
              playerCount: sessionPlayersList.length,
              playerNames: playerDetails.map((p) => p.name),
              sessionsCompleted: completedCount,
              pendingFeedback: 0,
              playerPreview: playerDetails,
              primaryBallLevel: firstSession.ballLevel,
              nextSessionDate: nextSession?.startTime || null,
              // Include actual session IDs for timeline/detail views
              transferredSessionIds: sessionsGroup.map((s) => s.id),
            });
          }
        }

        // Combine regular series with virtual flexible entries
        const allSeries = [...enrichedSeries, ...virtualFlexibleSeries];

        // Cache the response for 5 minutes
        apiCache.set(cacheKey, allSeries, CACHE_TTL.COACH_SERIES);
        console.log(
          "[Series PERF] Cache SET for coach:",
          coachId,
          "Total time:",
          Date.now() - _perfStart,
          "ms",
        );

        res.json(allSeries);
      } catch (error) {
        console.error("Error fetching coaching series:", error);
        res.status(500).json({ error: "Failed to fetch coaching series" });
      }
    },
  );

  // Get a single coaching series by ID with full details
  router.get(
    "/api/coach/series/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;

        const series = await storage.getCoachingSeriesById(id);

        if (!series) {
          return res.status(404).json({ error: "Series not found" });
        }

        // Verify ownership
        if (series.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to view this series" });
        }

        // Get players in this series
        const seriesPlayersList = await storage.getSeriesPlayers(id);

        // Get credit balances for all players in batch (efficient)
        const playerIds = seriesPlayersList.map((sp) => sp.playerId);
        const creditBalances =
          await storage.getPlayersCreditBalances(playerIds);

        // Get real attendance counts aggregated from sessionPlayers (source of truth)
        const attendanceSummary =
          await storage.getSeriesPlayerAttendanceSummary(id);

        // Get player details with full membership data for frontend consumption
        const playerDetails = await Promise.all(
          seriesPlayersList.map(async (sp) => {
            const player = await storage.getPlayer(sp.playerId);
            const credits = creditBalances[sp.playerId] || {
              group: 0,
              semi_private: 0,
              private: 0,
              totalDebt: 0,
              groupDebt: 0,
              semiPrivateDebt: 0,
              privateDebt: 0,
              hasDebt: false,
            };
            const realAttendanceCount = attendanceSummary.get(sp.playerId) || 0;
            return {
              id: sp.playerId,
              name: player?.name || "Unknown Player",
              ballLevel: player?.ballLevel || null,
              status: sp.status,
              sessionsAttended: realAttendanceCount,
              totalXpEarned: sp.totalXpEarned || 0,
              joinedAt: sp.joinedAt?.toISOString() || null,
              leftAt: sp.leftAt?.toISOString() || null,
              pauseFrom: sp.pauseFrom || null,
              pauseUntil: sp.pauseUntil || null,
              pauseReason: sp.pauseReason || null,
              linkedPackageId: sp.linkedPackageId || null,
              isGuest: sp.isGuest || false,
              guestUntil: sp.guestUntil || null,
              credits,
            };
          }),
        );

        // Get all sessions for this series (only those still assigned to this coach)
        const seriesSessions = await db
          .select()
          .from(sessions)
          .where(and(eq(sessions.seriesId, id), eq(sessions.coachId, coachId)))
          .orderBy(asc(sessions.startTime));

        // Auto-heal: ensure all active series players are enrolled in every session
        if (seriesSessions.length > 0 && playerIds.length > 0) {
          const activePlayerIds = seriesPlayersList
            .filter((sp) => sp.status === "active")
            .map((sp) => sp.playerId);

          if (activePlayerIds.length > 0) {
            try {
              const sessionIds = seriesSessions.map((s) => s.id);
              const existingEnrollments = await db
                .select({
                  sessionId: sessionPlayers.sessionId,
                  playerId: sessionPlayers.playerId,
                })
                .from(sessionPlayers)
                .where(inArray(sessionPlayers.sessionId, sessionIds));

              const enrolledSet = new Set(
                existingEnrollments.map((e) => `${e.sessionId}:${e.playerId}`),
              );

              const healPlayerHolidays = await db.select({
                playerId: playerHolidays.playerId,
                startDate: playerHolidays.startDate,
                endDate: playerHolidays.endDate,
              }).from(playerHolidays).where(inArray(playerHolidays.playerId, activePlayerIds));
              const holidaysByPlayer = new Map<string, { startDate: string; endDate: string }[]>();
              for (const h of healPlayerHolidays) {
                if (!h.playerId) continue;
                if (!holidaysByPlayer.has(h.playerId)) holidaysByPlayer.set(h.playerId, []);
                holidaysByPlayer.get(h.playerId)!.push({ startDate: h.startDate, endDate: h.endDate });
              }

              const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
              let healed = 0;
              for (const session of seriesSessions) {
                if (session.status === "cancelled" || session.status === "skipped") continue;
                const isCompleted = session.status === "completed";
                // Sessions older than 7 days must NOT be auto-marked present or charged.
                // Leave attendance null so the coach can review them manually.
                const isOldSession = new Date(session.endTime) < sevenDaysAgo;
                for (const playerId of activePlayerIds) {
                  const key = `${session.id}:${playerId}`;
                  if (!enrolledSet.has(key)) {
                    const sp = seriesPlayersList.find((sp) => sp.playerId === playerId);
                    const joinedAt = sp?.joinedAt;
                    if (joinedAt && new Date(session.startTime) < new Date(joinedAt)) continue;
                    if (sp?.isGuest && sp?.guestUntil) {
                      const guestEnd = new Date(sp.guestUntil + "T23:59:59Z");
                      if (new Date(session.startTime) > guestEnd) continue;
                    }
                    const holidays = holidaysByPlayer.get(playerId) || [];
                    const sessionDateStr = new Date(session.startTime).toISOString().substring(0, 10);
                    const isOnHoliday = holidays.some(h => {
                      return sessionDateStr >= h.startDate && sessionDateStr <= h.endDate;
                    });
                    if (isOnHoliday) continue;
                    const newRecord = await storage.addPlayerToSession({
                      sessionId: session.id,
                      playerId,
                      // Old completed sessions (> 7 days): leave null for coach review.
                      // Recent completed sessions: mark present so credits are processed.
                      attendanceStatus: isCompleted && !isOldSession ? "present" : null,
                    });
                    healed++;
                    // Only charge credits for recent sessions (≤ 7 days old).
                    if (isCompleted && !isOldSession && newRecord?.id) {
                      try {
                        const { ensureCreditProcessed } = await import("../storage");
                        await ensureCreditProcessed(newRecord.id);
                      } catch (creditErr) {
                        console.error(`[Series Auto-Heal] Credit processing failed for player ${playerId}:`, creditErr);
                      }
                    }
                  }
                }
              }
              if (healed > 0) {
                console.log(`[Series Auto-Heal] Fixed ${healed} missing session_players for series ${id}`);
              }
            } catch (healErr) {
              console.error("[Series Auto-Heal] Error:", healErr);
            }
          }
        }

        // Get location name if applicable
        let locationName = null;
        let locationAddress = null;
        let locationLat: number | null = null;
        let locationLng: number | null = null;
        if (series.locationId) {
          const location = await storage.getLocationById(series.locationId);
          locationName = location?.name || null;
          locationAddress = location?.address || null;
          locationLat = location?.lat ?? null;
          locationLng = location?.lng ?? null;
        }

        // Get court name if applicable
        let courtName = null;
        if (series.courtId) {
          const court = await storage.getCourt(series.courtId);
          courtName = court?.name;
        }

        // Count sessions older than 7 days that have null/pending attendance (need coach review)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const completedSessionIds = seriesSessions
          .filter((s) => s.status === "completed" && new Date(s.endTime) < sevenDaysAgo)
          .map((s) => s.id);
        let sessionsNeedingReview = 0;
        if (completedSessionIds.length > 0) {
          const spData = await db.select({
            sessionId: sessionPlayers.sessionId,
            attendanceStatus: sessionPlayers.attendanceStatus,
          })
          .from(sessionPlayers)
          .where(inArray(sessionPlayers.sessionId, completedSessionIds));

          const sessionsWithPlayers = new Set(spData.map((r) => r.sessionId));
          const sessionsWithNullAttendance = new Set(
            spData.filter((r) => r.attendanceStatus === null || r.attendanceStatus === "pending").map((r) => r.sessionId)
          );
          for (const sid of completedSessionIds) {
            if (!sessionsWithPlayers.has(sid) || sessionsWithNullAttendance.has(sid)) {
              sessionsNeedingReview++;
            }
          }
        }

        res.json({
          ...series,
          locationName,
          locationAddress,
          locationLat,
          locationLng,
          courtName,
          players: playerDetails,
          sessions: seriesSessions,
          stats: {
            totalSessions: series.weekCount || seriesSessions.length,
            completedSessions: seriesSessions.filter(
              (s) => s.status === "completed",
            ).length,
            upcomingSessions: seriesSessions.filter(
              (s) =>
                s.status === "scheduled" && new Date(s.startTime) > new Date(),
            ).length,
            cancelledSessions: seriesSessions.filter(
              (s) => s.status === "cancelled",
            ).length,
            sessionsNeedingReview,
          },
        });
      } catch (error) {
        console.error("Error fetching coaching series details:", error);
        res.status(500).json({ error: "Failed to fetch series details" });
      }
    },
  );

  // Create a new coaching series
  router.post(
    "/api/coach/series",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId;

        if (!coachId || !academyId) {
          return res.status(400).json({ error: "Coach and academy required" });
        }

        const {
          title,
          dayOfWeek,
          startTime,
          duration,
          sessionType,
          ballLevel,
          skillLevel,
          maxPlayers,
          weekCount,
          seriesStartDate,
          seriesEndDate,
          xpPerSession,
          vibe,
          price,
          courtId,
          locationId,
          playerIds,
          isFlexible,
          flexibleDates,
          sport,
        } = req.body;

        // Flexible series: dayOfWeek = -1, sessions from flexibleDates array
        const FLEXIBLE_DAY = -1;
        const effectiveDayOfWeek = isFlexible ? FLEXIBLE_DAY : dayOfWeek;

        // Validation differs for flexible vs regular series
        if (isFlexible) {
          if (!title || !startTime || !duration || !sessionType) {
            return res
              .status(400)
              .json({
                error:
                  "title, startTime, duration, and sessionType are required",
              });
          }
          if (
            !flexibleDates ||
            !Array.isArray(flexibleDates) ||
            flexibleDates.length === 0
          ) {
            return res
              .status(400)
              .json({
                error: "flexibleDates array is required for flexible series",
              });
          }
        } else {
          if (
            !title ||
            dayOfWeek === undefined ||
            !startTime ||
            !duration ||
            !sessionType ||
            !seriesStartDate
          ) {
            return res
              .status(400)
              .json({
                error:
                  "title, dayOfWeek, startTime, duration, sessionType, and seriesStartDate are required",
              });
          }
        }

        // Enforce location selection when academy has multiple active locations
        const allLocations = await storage.getAllLocations(academyId);
        const activeLocationCount = allLocations.filter((l) => l.isActive !== false).length;
        let resolvedLocationId: string | null = locationId || null;
        if (activeLocationCount > 1) {
          if (!resolvedLocationId) {
            if (courtId) {
              // Auto-resolve location from court so series always stores a non-null locationId
              const assignedCourt = await storage.getCourt(courtId);
              if (!assignedCourt?.locationId) {
                return res.status(400).json({ error: "The selected court must be assigned to a location when the academy has multiple locations" });
              }
              resolvedLocationId = assignedCourt.locationId;
            } else {
              return res.status(400).json({ error: "Location is required when the academy has multiple locations" });
            }
          }
        }

        // For flexible series, derive start/end dates from flexibleDates
        let effectiveSeriesStartDate = seriesStartDate;
        let effectiveSeriesEndDate = seriesEndDate;
        let effectiveWeekCount = weekCount;

        if (isFlexible && flexibleDates && flexibleDates.length > 0) {
          // Sort dates and use first/last
          const sortedDates = [...flexibleDates].sort(
            (a: any, b: any) =>
              new Date(a.date).getTime() - new Date(b.date).getTime(),
          );
          effectiveSeriesStartDate = sortedDates[0].date;
          effectiveSeriesEndDate = sortedDates[sortedDates.length - 1].date;
          effectiveWeekCount = flexibleDates.length;
        }

        const VALID_SPORTS = ["tennis", "padel", "pickleball"];
        const validatedSport = sport && VALID_SPORTS.includes(sport) ? sport : "tennis";

        // Create the series
        const series = await storage.createCoachingSeries({
          academyId,
          coachId,
          courtId: courtId || null,
          locationId: resolvedLocationId,
          title: sanitizeTemplateName(title),
          dayOfWeek: effectiveDayOfWeek,
          startTime,
          duration,
          sessionType,
          ballLevel,
          skillLevel,
          maxPlayers: maxPlayers || 6,
          weekCount: effectiveWeekCount || null,
          seriesStartDate: effectiveSeriesStartDate,
          seriesEndDate: effectiveSeriesEndDate || null,
          xpPerSession: xpPerSession || 20,
          vibe: vibe || "casual",
          price: price || null,
          status: "active",
          sport: validatedSport,
        });

        // Add players if provided
        if (playerIds && Array.isArray(playerIds) && playerIds.length > 0) {
          for (const playerId of playerIds) {
            await storage.addPlayerToSeries({
              seriesId: series.id,
              playerId,
              status: "active",
            });
          }
        }

        // Derive session instances from the series
        const createdSessions: any[] = [];
        const skippedWeeks: { week: number; reason: string }[] = [];

        // Get academy timezone for proper time handling
        const academy = await storage.getAcademy(academyId);
        const academyTimezone = academy?.timezone || "Europe/Amsterdam";

        // FLEXIBLE SERIES: Create sessions for each date in flexibleDates
        if (isFlexible && flexibleDates && flexibleDates.length > 0) {
          const sortedDates = [...flexibleDates].sort(
            (a: any, b: any) =>
              new Date(a.date).getTime() - new Date(b.date).getTime(),
          );

          for (
            let sessionIndex = 0;
            sessionIndex < sortedDates.length;
            sessionIndex++
          ) {
            const flexDate = sortedDates[sessionIndex];
            const sessionDateStr = flexDate.date; // YYYY-MM-DD format

            // Validate and convert to UTC
            const resolution = ensureResolvableLocalTime(
              sessionDateStr,
              startTime,
              academyTimezone,
            );
            if (!resolution.ok) {
              skippedWeeks.push({
                week: sessionIndex + 1,
                reason: resolution.error.message,
              });
              continue;
            }

            const sessionDate = resolution.utcDate;
            const sessionEndTime = new Date(
              sessionDate.getTime() + duration * 60000,
            );

            // Convert to local for display
            const localSession = utcToLocalTime(sessionDate, academyTimezone);
            const localEndSession = utcToLocalTime(
              sessionEndTime,
              academyTimezone,
            );
            const dateStr = localSession.date;
            const startTimeStr = localSession.time;
            const endTimeStr = localEndSession.time;

            // Check for conflicts
            const coachConflict = await storage.checkCoachConflict(
              coachId,
              sessionDate,
              sessionEndTime,
              undefined,
              academyId,
            );
            const courtConflict = courtId
              ? await storage.checkCourtConflict(
                  courtId,
                  sessionDate,
                  sessionEndTime,
                  undefined,
                  academyId,
                )
              : false;

            if (coachConflict || courtConflict) {
              const reasons: string[] = [];
              if (coachConflict) reasons.push("Coach already booked");
              if (courtConflict) reasons.push("Court already booked");
              skippedWeeks.push({
                week: sessionIndex + 1,
                reason: reasons.join(" and "),
              });
              continue;
            }

            // Snapshot pricing
            let pricingSnapshot: {
              academyPrice?: string;
              coachPayout?: string;
              academyMargin?: string;
            } = {};
            if (academyId && coachId) {
              try {
                const pricing = await storage.calculateSessionPricing(
                  academyId,
                  coachId,
                  sessionType,
                  duration,
                );
                pricingSnapshot = {
                  academyPrice: String(pricing.academyPrice),
                  coachPayout: String(pricing.coachPayout),
                  academyMargin: String(pricing.academyMargin),
                };
              } catch (err: any) {
                return res.status(422).json({
                  error: "Pricing error",
                  message: err.message || "Could not calculate session pricing",
                });
              }
            }

            // Create session for this flexible date
            const session = await storage.createSession({
              duration: duration || 60,
              academyId,
              coachId,
              courtId: courtId || null,
              locationId: locationId || null,
              startTime: sessionDate,
              endTime: sessionEndTime,
              duration,
              sessionType,
              ballLevel,
              skillLevel,
              isRecurring: false, // Flexible sessions are not weekly recurring
              recurringGroupId: series.id,
              weekCount: sortedDates.length,
              seriesId: series.id,
              weekNumber: sessionIndex + 1,
              travelTime: 0,
              paymentStatus: "unpaid",
              status: "scheduled",
              sport: validatedSport,
              ...pricingSnapshot,
            });

            // Create time block
            await storage.createCoachTimeBlock({
              coachId,
              sourceType: "session",
              sourceAcademyId: academyId,
              sourceSessionId: session.id,
              date: dateStr,
              startTime: startTimeStr,
              endTime: endTimeStr,
              isPrivate: true,
            });

            // Add players
            if (playerIds && Array.isArray(playerIds)) {
              for (const playerId of playerIds) {
                await storage.addPlayerToSession({
                  sessionId: session.id,
                  playerId,
                  status: "confirmed",
                });
              }
            }

            createdSessions.push({
              ...session,
              startTime:
                session.startTime instanceof Date
                  ? session.startTime.toISOString()
                  : session.startTime,
              endTime:
                session.endTime instanceof Date
                  ? session.endTime.toISOString()
                  : session.endTime,
              weekNumber: sessionIndex + 1,
            });
          }

          // Build enriched response for flexible series (skip to response section)
          const enrichedPlayers =
            playerIds && Array.isArray(playerIds)
              ? await Promise.all(
                  playerIds.map(async (playerId: string) => {
                    const player = await storage.getPlayer(playerId);
                    return {
                      id: playerId,
                      name: player?.name || "Unknown Player",
                      ballLevel: player?.ballLevel || null,
                      status: "active",
                      sessionsAttended: 0,
                      totalXpEarned: 0,
                    };
                  }),
                )
              : [];

          let locationName = null;
          let locationAddress = null;
          let locationLat: number | null = null;
          let locationLng: number | null = null;
          let courtName = null;
          if (locationId) {
            const location = await storage.getLocationById(locationId);
            locationName = location?.name || null;
            locationAddress = location?.address || null;
            locationLat = location?.lat ?? null;
            locationLng = location?.lng ?? null;
          }
          if (courtId) {
            const court = await storage.getCourtById(courtId);
            courtName = court?.name || null;
          }

          return res.status(201).json({
            series: {
              ...series,
              seriesStartDate:
                series.seriesStartDate instanceof Date
                  ? series.seriesStartDate.toISOString()
                  : series.seriesStartDate,
              seriesEndDate:
                series.seriesEndDate instanceof Date
                  ? series.seriesEndDate?.toISOString()
                  : series.seriesEndDate,
              createdAt:
                series.createdAt instanceof Date
                  ? series.createdAt.toISOString()
                  : series.createdAt,
              locationName,
              locationAddress,
              locationLat,
              locationLng,
              courtName,
              players: enrichedPlayers,
              sessions: createdSessions,
              sessionsCount: createdSessions.length,
              isFlexible: true,
            },
            sessions: createdSessions,
            skippedWeeks,
          });
        }

        // REGULAR RECURRING SERIES: Weekly pattern
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
        const firstSessionResult = getFirstSessionDate(
          seriesStartDate,
          dayOfWeek,
          startTime,
          academyTimezone,
        );

        if (firstSessionResult.status === "error") {
          return res.status(400).json({
            error: {
              code: "TIME_UNRESOLVABLE",
              message: firstSessionResult.message,
            },
          });
        }
        if (firstSessionResult.status === "gap") {
          return res.status(400).json({
            error: {
              code: "TIME_UNRESOLVABLE",
              requestedTime: startTime,
              suggestedNext: firstSessionResult.suggestedTime,
              date: firstSessionResult.dateStr,
              message: `The time ${startTime} does not exist on ${firstSessionResult.dateStr} in timezone ${academyTimezone} (DST transition). Please use ${firstSessionResult.suggestedTime} instead.`,
            },
          });
        }

        const { dateStr: firstDateStr, utcDate: firstSessionDate } =
          firstSessionResult;

        // Track current local date for week iteration
        let currentLocalDateStr = firstDateStr;

        // Parse series end date if provided using consolidated helper
        let seriesEnd: Date | null = null;
        if (seriesEndDate) {
          const endResolution = ensureResolvableLocalTime(
            seriesEndDate,
            "23:59",
            academyTimezone,
          );
          if (endResolution.ok) {
            seriesEnd = endResolution.utcDate;
          }
          // If gap, we simply don't set seriesEnd - sessions will be bounded by weekCount instead
        }

        // Calculate maximum number of sessions considering both weekCount and seriesEndDate
        let calculatedMaxWeeks = weekCount || 52; // Default to 52 weeks if not specified

        if (seriesEnd) {
          // Calculate how many weeks fit between first session and series end
          const msPerWeek = 7 * 24 * 60 * 60 * 1000;
          const weeksBetween =
            Math.floor(
              (seriesEnd.getTime() - firstSessionDate.getTime()) / msPerWeek,
            ) + 1;
          calculatedMaxWeeks = Math.min(
            calculatedMaxWeeks,
            Math.max(0, weeksBetween),
          );
        }

        // Cap at provided weekCount if specified
        const maxSessions = weekCount
          ? Math.min(weekCount, calculatedMaxWeeks)
          : calculatedMaxWeeks;

        // Generate sessions for each week
        for (let weekIndex = 0; weekIndex < maxSessions; weekIndex++) {
          // Calculate the local date for this session (add weeks to first session)
          const sessionDateStr = addDaysToLocalDate(
            currentLocalDateStr,
            weekIndex * 7,
          );

          // Validate and convert to UTC using academy timezone with consolidated helper
          const weekResolution = ensureResolvableLocalTime(
            sessionDateStr,
            startTime,
            academyTimezone,
          );
          if (!weekResolution.ok) {
            // Skip weeks with DST gaps but track them
            skippedWeeks.push({
              week: weekIndex + 1,
              reason: weekResolution.error.message,
            });
            continue;
          }

          const sessionDate = weekResolution.utcDate;

          // Check if this session would be after the series end date
          if (seriesEnd && sessionDate.getTime() > seriesEnd.getTime()) {
            break;
          }

          const weekNumber = weekIndex + 1; // 1-indexed week number

          const sessionEndTime = new Date(
            sessionDate.getTime() + duration * 60000,
          );

          // For display purposes, convert back to local time
          const localSession = utcToLocalTime(sessionDate, academyTimezone);
          const localEndSession = utcToLocalTime(
            sessionEndTime,
            academyTimezone,
          );
          const dateStr = localSession.date;
          const startTimeStr = localSession.time;
          const endTimeStr = localEndSession.time;

          // Check for conflicts - track both types
          const coachConflict = await storage.checkCoachConflict(
            coachId,
            sessionDate,
            sessionEndTime,
            undefined,
            academyId,
          );
          const courtConflict = courtId
            ? await storage.checkCourtConflict(
                courtId,
                sessionDate,
                sessionEndTime,
                undefined,
                academyId,
              )
            : false;

          if (coachConflict || courtConflict) {
            const reasons: string[] = [];
            if (coachConflict) reasons.push("Coach already booked");
            if (courtConflict) reasons.push("Court already booked");

            skippedWeeks.push({
              week: weekNumber,
              reason: reasons.join(" and "),
            });
            continue;
          }

          // Snapshot pricing at booking time (Layer 3)
          let pricingSnapshot: {
            academyPrice?: string;
            coachPayout?: string;
            academyMargin?: string;
          } = {};
          if (academyId && coachId) {
            try {
              const pricing = await storage.calculateSessionPricing(
                academyId,
                coachId,
                sessionType,
                duration,
              );
              pricingSnapshot = {
                academyPrice: String(pricing.academyPrice),
                coachPayout: String(pricing.coachPayout),
                academyMargin: String(pricing.academyMargin),
              };
            } catch (err: any) {
              // Currency mismatch and other critical errors must block series creation
              return res.status(422).json({
                error: "Pricing error",
                message: err.message || "Could not calculate session pricing",
              });
            }
          }

          // Create the session linked to this series
          const session = await storage.createSession({
            duration: duration || 60,
            academyId,
            coachId,
            courtId: courtId || null,
            locationId: locationId || null,
            startTime: sessionDate,
            endTime: sessionEndTime,
            duration,
            sessionType,
            ballLevel,
            skillLevel,
            isRecurring: true,
            recurringGroupId: series.id, // Use series ID as the recurring group
            weekCount: maxSessions,
            seriesId: series.id,
            weekNumber,
            travelTime: 0,
            paymentStatus: "unpaid",
            status: "scheduled",
            sport: validatedSport,
            ...pricingSnapshot,
          });

          // Create unified time block
          await storage.createCoachTimeBlock({
            coachId,
            sourceType: "session",
            sourceAcademyId: academyId,
            sourceSessionId: session.id,
            date: dateStr,
            startTime: startTimeStr,
            endTime: endTimeStr,
            isPrivate: true,
          });

          // Add players to the session
          if (playerIds && Array.isArray(playerIds)) {
            for (const playerId of playerIds) {
              await storage.addPlayerToSession({
                sessionId: session.id,
                playerId,
                status: "confirmed",
              });
            }
          }

          // Serialize session with ISO strings for frontend consumption
          createdSessions.push({
            ...session,
            startTime:
              session.startTime instanceof Date
                ? session.startTime.toISOString()
                : session.startTime,
            endTime:
              session.endTime instanceof Date
                ? session.endTime.toISOString()
                : session.endTime,
            weekNumber,
          });
        }

        // Build enriched player list for response
        const enrichedPlayers =
          playerIds && Array.isArray(playerIds)
            ? await Promise.all(
                playerIds.map(async (playerId: string) => {
                  const player = await storage.getPlayer(playerId);
                  return {
                    id: playerId,
                    name: player?.name || "Unknown Player",
                    ballLevel: player?.ballLevel || null,
                    status: "active",
                    sessionsAttended: 0,
                    totalXpEarned: 0,
                  };
                }),
              )
            : [];

        // Get location and court names
        let locationName = null;
        let locationAddress = null;
        let locationLat: number | null = null;
        let locationLng: number | null = null;
        let courtName = null;
        if (locationId) {
          const location = await storage.getLocationById(locationId);
          locationName = location?.name || null;
          locationAddress = location?.address || null;
          locationLat = location?.lat ?? null;
          locationLng = location?.lng ?? null;
        }
        if (courtId) {
          const court = await storage.getCourtById(courtId);
          courtName = court?.name || null;
        }

        // Return fully enriched series matching GET /api/coach/series/:id structure
        res.status(201).json({
          series: {
            ...series,
            locationName,
            locationAddress,
            locationLat,
            locationLng,
            courtName,
            players: enrichedPlayers,
            sessions: createdSessions,
            stats: {
              totalSessions: maxSessions,
              completedSessions: 0,
              upcomingSessions: createdSessions.length,
              cancelledSessions: 0,
            },
          },
          createdSessions,
          skippedWeeks,
        });
      } catch (error) {
        console.error("Error creating coaching series:", error);
        res.status(500).json({ error: "Failed to create coaching series" });
      }
    },
  );

  // Update a coaching series
  router.patch(
    "/api/coach/series/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;

        const existing = await storage.getCoachingSeriesById(id);
        if (!existing) {
          return res.status(404).json({ error: "Series not found" });
        }

        if (existing.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to update this series" });
        }

        const updates: any = {};
        const allowedFields = [
          "title",
          "courtId",
          "locationId",
          "startTime",
          "duration",
          "ballLevel",
          "skillLevel",
          "maxPlayers",
          "sessionType",
          "xpPerSession",
          "vibe",
          "price",
          "seriesEndDate",
          "isPublic",
          "publicDropInPrice",
        ];

        const validSessionTypes = ["private", "semi_private", "group", "physical", "activity"];

        for (const field of allowedFields) {
          if (req.body[field] !== undefined) {
            if (field === "sessionType" && !validSessionTypes.includes(req.body[field])) {
              return res.status(400).json({ error: "Invalid sessionType value" });
            }
            if (field === "publicDropInPrice" && req.body[field] !== null) {
              const raw = String(req.body[field]).trim();
              const price = Number(raw);
              if (!/^\d+(\.\d+)?$/.test(raw) || isNaN(price) || price < 0) {
                return res.status(400).json({ error: "publicDropInPrice must be a non-negative number or null" });
              }
              // Normalize to string representation of the valid numeric value
              updates["publicDropInPrice"] = String(price);
              continue;
            }
            updates[field] =
              field === "title"
                ? sanitizeTemplateName(req.body[field])
                : req.body[field];
          }
        }

        // Guard: changing session_type AWAY from 'group' requires explicit coach confirmation.
        // Group sessions should never be silently reclassified.
        if (
          updates.sessionType &&
          existing.sessionType === "group" &&
          updates.sessionType !== "group"
        ) {
          const activeCountResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(seriesPlayers)
            .where(
              and(
                eq(seriesPlayers.seriesId, id),
                eq(seriesPlayers.status, "active")
              )
            );
          const activeCount = activeCountResult[0]?.count ?? 0;
          console.warn(
            `[SeriesUpdate] WARN: series ${id} session_type changing from group → ${updates.sessionType} with ${activeCount} active player(s)`
          );
          if (!req.body.confirmTypeChange) {
            return res.status(409).json({
              error:
                "Changing session type away from Group requires explicit confirmation",
              requiresConfirmation: true,
              activePlayerCount: activeCount,
              code: "CONFIRM_GROUP_TYPE_CHANGE",
            });
          }
        }

        const updated = await storage.updateCoachingSeries(id, updates);

        if (updates.courtId) {
          const seriesSessions = await db
            .select({ id: sessions.id })
            .from(sessions)
            .where(eq(sessions.seriesId, id));
          if (seriesSessions.length > 0) {
            await db
              .update(sessions)
              .set({ courtId: updates.courtId })
              .where(eq(sessions.seriesId, id));
            console.log(
              `[SeriesUpdate] Updated court for ${seriesSessions.length} sessions in series ${id}`,
            );
          }
        }

        res.json(updated);
      } catch (error) {
        console.error("Error updating coaching series:", error);
        res.status(500).json({ error: "Failed to update coaching series" });
      }
    },
  );

  // Pause a coaching series
  router.post(
    "/api/coach/series/:id/pause",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;

        const existing = await storage.getCoachingSeriesById(id);
        if (!existing) {
          return res.status(404).json({ error: "Series not found" });
        }

        if (existing.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to pause this series" });
        }

        const paused = await storage.pauseCoachingSeries(id);
        res.json(paused);
      } catch (error) {
        console.error("Error pausing coaching series:", error);
        res.status(500).json({ error: "Failed to pause series" });
      }
    },
  );

  // Resume a paused coaching series
  router.post(
    "/api/coach/series/:id/resume",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;

        const existing = await storage.getCoachingSeriesById(id);
        if (!existing) {
          return res.status(404).json({ error: "Series not found" });
        }

        if (existing.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to resume this series" });
        }

        const resumed = await storage.resumeCoachingSeries(id);
        res.json(resumed);
      } catch (error) {
        console.error("Error resuming coaching series:", error);
        res.status(500).json({ error: "Failed to resume series" });
      }
    },
  );

  // End a coaching series
  router.post(
    "/api/coach/series/:id/end",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;

        const existing = await storage.getCoachingSeriesById(id);
        if (!existing) {
          return res.status(404).json({ error: "Series not found" });
        }

        if (existing.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to end this series" });
        }

        const ended = await storage.endCoachingSeries(id);

        // Invalidate caches for this coach
        apiCache.invalidate(`series:${coachId}`);
        apiCache.invalidate(`earnings:${coachId}`);
        apiCache.invalidate(`calendar:${coachId}`);
        res.json(ended);
      } catch (error) {
        console.error("Error ending coaching series:", error);
        res.status(500).json({ error: "Failed to end series" });
      }
    },
  );

  // Delete a coaching series (PERMANENT - no soft delete)
  router.delete(
    "/api/coach/series/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;

        const existing = await storage.getCoachingSeriesById(id);
        if (!existing) {
          return res.status(404).json({ error: "Series not found" });
        }

        if (existing.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to delete this series" });
        }

        await storage.deleteCoachingSeries(id);

        // Invalidate cache after deletion so list refreshes properly
        apiCache.invalidate(`series:${coachId}`);
        apiCache.invalidate(`earnings:${coachId}`);
        apiCache.invalidate(`calendar:${coachId}`);
        console.log("[Series DELETE] Cache invalidated for coach:", coachId);
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting coaching series:", error);
        res.status(500).json({ error: "Failed to delete series" });
      }
    },
  );

  // Extend a coaching series with additional weeks
  // Background task processor for extend series
  async function processExtendSeriesBackground(
    seriesId: string,
    weeks: number,
    coachId: string,
    academyId: string,
    existing: any,
    lastSession: any,
    activeMembers: any[],
    maxWeekNumber: number,
  ) {
    const startTime = Date.now();
    console.log(
      `[ExtendBG] Starting background extend for series ${seriesId}, ${weeks} weeks`,
    );

    try {
      // Step 1: Calculate all new session dates upfront
      const sessionDates: {
        startTime: Date;
        endTime: Date;
        weekIndex: number;
      }[] = [];
      for (let weekIndex = 1; weekIndex <= weeks; weekIndex++) {
        const newSessionDate = new Date(
          new Date(lastSession.startTime).getTime() +
            weekIndex * 7 * 24 * 60 * 60 * 1000,
        );
        const sessionEndTime = new Date(
          newSessionDate.getTime() + (existing.duration || 60) * 60000,
        );
        sessionDates.push({
          startTime: newSessionDate,
          endTime: sessionEndTime,
          weekIndex,
        });
      }

      // Step 2: Batch conflict checking - check all dates in parallel
      const conflictResults = await Promise.all(
        sessionDates.map(async (sd) => {
          const [coachConflict, courtConflict] = await Promise.all([
            storage.checkCoachConflict(
              coachId,
              sd.startTime,
              sd.endTime,
              undefined,
              academyId,
            ),
            existing.courtId
              ? storage.checkCourtConflict(
                  existing.courtId,
                  sd.startTime,
                  sd.endTime,
                  undefined,
                  academyId,
                )
              : Promise.resolve(false),
          ]);
          return {
            ...sd,
            coachConflict,
            courtConflict,
            hasConflict: coachConflict || courtConflict,
          };
        }),
      );

      const validSessions = conflictResults.filter((r) => !r.hasConflict);
      const skippedCount = conflictResults.filter((r) => r.hasConflict).length;

      console.log(
        `[ExtendBG] Conflict check done: ${validSessions.length} valid, ${skippedCount} skipped (${Date.now() - startTime}ms)`,
      );

      if (validSessions.length === 0) {
        console.log(`[ExtendBG] No valid sessions to create`);
        return;
      }

      // Step 3: Calculate pricing once (same for all sessions)
      let pricingSnapshot: {
        academyPrice?: string;
        coachPayout?: string;
        academyMargin?: string;
      } = {};
      try {
        const pricing = await storage.calculateSessionPricing(
          academyId,
          coachId,
          existing.sessionType,
          existing.duration || 60,
        );
        pricingSnapshot = {
          academyPrice: String(pricing.academyPrice),
          coachPayout: String(pricing.coachPayout),
          academyMargin: String(pricing.academyMargin),
        };
      } catch (e) {}

      // Step 4: Batch insert all sessions using raw SQL for speed
      const sessionInserts = validSessions.map((vs) => ({
        id: crypto.randomUUID(),
        seriesId,
        coachId,
        academyId,
        courtId: existing.courtId,
        sessionType: existing.sessionType,
        startTime: vs.startTime,
        endTime: vs.endTime,
        duration: existing.duration || 60,
        status: "scheduled" as const,
        maxPlayers: existing.maxPlayers,
        xpPerSession: existing.xpPerSession || existing.xpValue || 20,
        ballLevel: existing.ballLevel,
        title: existing.title,
        weekNumber: maxWeekNumber + vs.weekIndex,
        ...pricingSnapshot,
      }));

      // Insert sessions in parallel batches of 5
      const createdSessions: any[] = [];
      const batchSize = 5;
      for (let i = 0; i < sessionInserts.length; i += batchSize) {
        const batch = sessionInserts.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((s) => storage.createSession(s)),
        );
        createdSessions.push(...results);
      }

      console.log(
        `[ExtendBG] Created ${createdSessions.length} sessions (${Date.now() - startTime}ms)`,
      );

      // Step 5: Batch add players to all sessions in parallel
      if (activeMembers.length > 0) {
        const playerAssignments: Promise<any>[] = [];
        for (const session of createdSessions) {
          for (const member of activeMembers) {
            playerAssignments.push(
              storage
                .addPlayerToSession({
                  sessionId: session.id,
                  playerId: member.playerId,
                })
                .catch(() => null),
            );
          }
        }
        await Promise.all(playerAssignments);
        console.log(
          `[ExtendBG] Added ${activeMembers.length} players to ${createdSessions.length} sessions (${Date.now() - startTime}ms)`,
        );
      }

      // Step 6: Invalidate cache
      apiCache.invalidate(`series:${coachId}`);
      apiCache.invalidate(`earnings:${coachId}`);

      console.log(
        `[ExtendBG] Complete! ${createdSessions.length} sessions created in ${Date.now() - startTime}ms`,
      );
    } catch (error) {
      console.error("[ExtendBG] Background extend failed:", error);
    }
  }

  router.post(
    "/api/coach/series/:id/extend",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { weeks } = req.body;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;

        if (!weeks || weeks < 1 || weeks > 52) {
          return res
            .status(400)
            .json({ error: "Weeks must be between 1 and 52" });
        }

        // Quick validation - these are fast cached queries
        const existing = await storage.getCoachingSeriesById(id);
        if (!existing) {
          return res.status(404).json({ error: "Series not found" });
        }

        if (existing.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to extend this series" });
        }

        // Get last session quickly
        const allSessions = await db
          .select()
          .from(sessions)
          .where(eq(sessions.seriesId, id))
          .orderBy(desc(sessions.startTime))
          .limit(1);
        if (allSessions.length === 0) {
          return res.status(400).json({ error: "No sessions found in series" });
        }

        const lastSession = allSessions[0];

        // Get the highest weekNumber from existing sessions in this series
        const maxWeekResult = await db
          .select({
            maxWeek: sql<number>`COALESCE(MAX(${sessions.weekNumber}), 0)`,
          })
          .from(sessions)
          .where(eq(sessions.seriesId, id));
        const maxWeekNumber = maxWeekResult[0]?.maxWeek || 0;
        // Get active members
        const seriesMembers = await storage.getSeriesPlayers(id);
        const activeMembers = seriesMembers.filter(
          (m) => m.status === "active",
        );

        // INSTANT RESPONSE - Fire and forget the background processing
        res.json({
          success: true,
          sessionsCreated: weeks, // Optimistic - actual may differ due to conflicts
          skippedWeeks: [],
          message: `Extending series with ${weeks} new sessions...`,
          processing: true,
        });

        // Process in background (non-blocking)
        setImmediate(() => {
          processExtendSeriesBackground(
            id,
            weeks,
            coachId!,
            academyId,
            existing,
            lastSession,
            activeMembers,
            maxWeekNumber,
          );
        });
      } catch (error) {
        console.error("Error extending coaching series:", error);
        res.status(500).json({ error: "Failed to extend series" });
      }
    },
  );

  // Sync all coaching series - regenerate missing sessions

  // Add extra lesson to a series (one-time session outside regular schedule)
  router.post(
    "/api/coach/series/:id/extra-lesson",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { startTime, duration, courtId } = req.body;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId;

        if (!coachId || !academyId) {
          return res.status(400).json({ error: "Coach and academy required" });
        }

        // Get the series
        const series = await storage.getCoachingSeriesById(id);
        if (!series) {
          return res.status(404).json({ error: "Series not found" });
        }

        if (series.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to modify this series" });
        }

        // Block extra lessons on ended/deleted/completed series
        if (series.status === "ended" || series.status === "deleted" || series.status === "completed") {
          return res.status(400).json({
            error: "This series has ended. Please create a new series to add lessons.",
          });
        }

        // Parse the start time
        const sessionStart = new Date(startTime);
        const sessionEnd = new Date(
          sessionStart.getTime() + (duration || 60) * 60 * 1000,
        );

        // Get players from the series
        const seriesPlayers = await storage.getSeriesPlayers(id);
        const activePlayerIds = seriesPlayers
          .filter((sp) => sp.status === "active")
          .map((sp) => sp.playerId);

        // Create the session
        const session = await storage.createSession({
          duration: duration || 60,
          academyId,
          coachId,
          startTime: sessionStart,
          endTime: sessionEnd,
          sessionType: series.sessionType || "group",
          status: "scheduled",
          seriesId: id,
          courtId: courtId || series.courtId || undefined,
          maxPlayers: series.maxPlayers || 6,
        });

        // Create sessionPlayers records for all active players in the series
        let playersAdded = 0;
        for (const playerId of activePlayerIds) {
          try {
            await storage.addPlayerToSession({
              sessionId: session.id,
              playerId,
              attendanceStatus: null,
              isGuest: false,
            });
            playersAdded++;
          } catch (err) {
            console.error(
              `[Extra Lesson] Error adding player ${playerId} to session ${session.id}:`,
              err,
            );
          }
        }

        apiCache.invalidate(`series:${coachId}`);
        apiCache.invalidate(`earnings:${coachId}`);
        apiCache.invalidate(`calendar:${coachId}`);

        console.log(
          "[Extra Lesson] Created session:",
          session.id,
          "for series:",
          id,
          "with",
          playersAdded,
          "players",
        );

        res.json({
          success: true,
          session,
          playersAdded,
        });
      } catch (error) {
        console.error("Error adding extra lesson:", error);
        res.status(500).json({ error: "Failed to add extra lesson" });
      }
    },
  );
  router.post(
    "/api/coach/series/sync-all",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId;

        if (!coachId || !academyId) {
          return res.status(400).json({ error: "Coach and academy required" });
        }

        // Get academy timezone
        const academy = await storage.getAcademy(academyId);
        const academyTimezone = academy?.timezone || "Europe/Amsterdam";

        // Get all active series for this coach
        const allSeries = await storage.getCoachingSeriesByCoach(
          coachId,
          academyId,
        );
        const activeSeries = allSeries.filter((s) => s.status === "active");

        const syncResults: {
          seriesId: string;
          title: string;
          sessionsCreated: number;
          errors: string[];
        }[] = [];

        for (const series of activeSeries) {
          const result = {
            seriesId: series.id,
            title: series.title,
            sessionsCreated: 0,
            errors: [] as string[],
          };

          // Get existing sessions for this series
          const existingSessions = await storage.getSessionsBySeriesId(
            series.id,
          );
          const existingDates = new Set(
            existingSessions.map((s) => {
              const d = new Date(s.startTime);
              return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
            }),
          );

          // Calculate which sessions should exist
          const FLEXIBLE_DAY = -1;
          const isFlexible = series.dayOfWeek === FLEXIBLE_DAY;

          if (isFlexible) {
            // Flexible series - sessions should already exist from creation
            // Just verify they exist
            result.errors.push("Flexible series - no auto-sync needed");
          } else {
            // Regular recurring series - check weekly pattern
            if (!series.seriesStartDate) {
              result.errors.push("Missing seriesStartDate");
              syncResults.push(result);
              continue;
            }

            // Calculate expected session dates
            const startDate = new Date(series.seriesStartDate);
            const endDate = series.seriesEndDate
              ? new Date(series.seriesEndDate)
              : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
            const today = new Date();

            // Find first occurrence of dayOfWeek on or after start date
            let currentDate = new Date(startDate);
            while (currentDate.getDay() !== series.dayOfWeek) {
              currentDate.setDate(currentDate.getDate() + 1);
            }

            // Generate sessions week by week up to endDate or 52 weeks
            let weekCount = 0;
            const maxWeeks = series.weekCount || 52;

            while (currentDate <= endDate && weekCount < maxWeeks) {
              const dateStr = currentDate.toISOString().split("T")[0];

              // Only create sessions for dates that should have happened or are upcoming (within 4 weeks)
              const fourWeeksAhead = new Date(
                today.getTime() + 28 * 24 * 60 * 60 * 1000,
              );
              if (currentDate <= fourWeeksAhead) {
                // Check if session exists for this date
                const sessionExists = existingSessions.some((s) => {
                  const sDate = new Date(s.startTime);
                  // Convert to local date in academy timezone for comparison
                  const localDate = utcToLocalTime(sDate, academyTimezone);
                  return localDate.date === dateStr;
                });

                if (!sessionExists) {
                  // Create the missing session
                  try {
                    const resolution = ensureResolvableLocalTime(
                      dateStr,
                      series.startTime,
                      academyTimezone,
                    );
                    if (resolution.ok) {
                      const sessionDate = resolution.utcDate;
                      const sessionEndTime = new Date(
                        sessionDate.getTime() + series.duration * 60000,
                      );

                      // Check for conflicts before creating
                      const coachConflict = await storage.checkCoachConflict(
                        coachId,
                        sessionDate,
                        sessionEndTime,
                        undefined,
                        academyId,
                      );
                      const courtConflict = series.courtId
                        ? await storage.checkCourtConflict(
                            series.courtId,
                            sessionDate,
                            sessionEndTime,
                            undefined,
                            academyId,
                          )
                        : false;

                      if (!coachConflict && !courtConflict) {
                        // Get pricing
                        let pricingSnapshot: {
                          academyPrice?: string;
                          coachPayout?: string;
                          academyMargin?: string;
                        } = {};
                        try {
                          const pricing = await storage.calculateSessionPricing(
                            academyId,
                            coachId,
                            series.sessionType,
                            series.duration,
                          );
                          pricingSnapshot = {
                            academyPrice: String(pricing.academyPrice),
                            coachPayout: String(pricing.coachPayout),
                            academyMargin: String(pricing.academyMargin),
                          };
                        } catch {}

                        const session = await storage.createSession({
                          duration: duration || 60,
                          academyId,
                          coachId,
                          courtId: series.courtId || null,
                          locationId: series.locationId || null,
                          startTime: sessionDate,
                          endTime: sessionEndTime,
                          duration: series.duration,
                          sessionType: series.sessionType,
                          ballLevel: series.ballLevel,
                          skillLevel: series.skillLevel,
                          isRecurring: true,
                          recurringGroupId: series.id,
                          weekCount: maxWeeks,
                          seriesId: series.id,
                          weekNumber: weekCount + 1,
                          travelTime: 0,
                          paymentStatus: "unpaid",
                          status:
                            currentDate < today ? "completed" : "scheduled",
                          ...pricingSnapshot,
                        });

                        // Add players from series to session
                        const seriesPlayers = await storage.getSeriesPlayers(
                          series.id,
                        );
                        for (const sp of seriesPlayers) {
                          if (sp.status === "active") {
                            await storage.addPlayerToSession({
                              sessionId: session.id,
                              playerId: sp.playerId,
                              status: "confirmed",
                            });
                          }
                        }

                        result.sessionsCreated++;
                      } else {
                        result.errors.push(`${dateStr}: conflict`);
                      }
                    } else {
                      result.errors.push(`${dateStr}: time unresolvable`);
                    }
                  } catch (err: any) {
                    result.errors.push(`${dateStr}: ${err.message}`);
                  }
                }
              }

              // Move to next week
              currentDate.setDate(currentDate.getDate() + 7);
              weekCount++;
            }
          }

          syncResults.push(result);
        }

        const totalCreated = syncResults.reduce(
          (sum, r) => sum + r.sessionsCreated,
          0,
        );

        res.json({
          success: true,
          seriesSynced: activeSeries.length,
          totalSessionsCreated: totalCreated,
          results: syncResults,
        });
      } catch (error: any) {
        console.error("Error syncing coaching series:", error);
        res
          .status(500)
          .json({ error: "Failed to sync series", message: error.message });
      }
    },
  );

  // Add a player to a class (with optional joinedAt date for backdating, package linking, and attendance backfill)
  router.post(
    "/api/coach/series/:id/players",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const {
          playerId,
          joinDate,
          joinedAt,
          packageId,
          packageTemplateId,
          creditPackage,
          attendedSessionIds = [],
          isGuest = false,
          guestUntil,
        } = req.body;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;

        // Support both joinDate (new) and joinedAt (legacy) parameter names
        const effectiveJoinDate = joinDate || joinedAt;

        // If packageTemplateId provided, assign package to player first and get the package ID
        let assignedPackageId = packageId || null;
        if (packageTemplateId && !assignedPackageId) {
          try {
            const player = await storage.getPlayer(playerId);
            if (player) {
              const template = await storage.getPackageTemplate(
                packageTemplateId,
                academyId,
              );
              if (template) {
                const expiryDate = new Date();
                expiryDate.setDate(
                  expiryDate.getDate() + (template.validityDays || 90),
                );

                const pkg = await storage.createPackage({
                  academyId,
                  playerId,
                  templateId: packageTemplateId,
                  name: template.name,
                  totalCredits: template.credits,
                  remainingCredits: template.credits,
                  price: template.price,
                  currency: template.currency || "AED",
                  expiryDate: expiryDate.toISOString().split("T")[0],
                  status: "active",
                });
                assignedPackageId = pkg.id;
                console.log(
                  `[AddPlayer] Assigned package ${pkg.id} (${template.name}) to player ${playerId}`,
                );

                // Settle any outstanding debts for this player
                const addPlayerCreditType = template.sessionType || "group";
                const addPlayerDebtSettlement = await storage.settlePlayerDebts(
                  playerId,
                  addPlayerCreditType,
                  pkg.id,
                );
                if (addPlayerDebtSettlement.settledCount > 0) {
                  console.log(
                    `[AddPlayer] Settled ${addPlayerDebtSettlement.settledCount} debt(s) for player ${playerId}`,
                  );
                }

                // Settle sessions where credit_deducted_at IS NULL and no debt transaction exists.
                const addPlayerUnpaidSettlement = await storage.settleUnpaidSessions(
                  playerId,
                  addPlayerCreditType,
                  pkg.id,
                  academyId,
                );
                if (addPlayerUnpaidSettlement.settledCount > 0) {
                  console.log(
                    `[AddPlayer] Settled ${addPlayerUnpaidSettlement.settledCount} unpaid session(s) for player ${playerId}, deducted ${addPlayerUnpaidSettlement.totalDeducted} credit(s) from package ${pkg.id}`,
                  );
                }
              }
            }
          } catch (pkgError) {
            console.error("[AddPlayer] Failed to assign package:", pkgError);
            // Continue without package - don't fail the enrollment
          }
        }

        // If creditPackage provided (from accordion selector), create a package from credit packages
        if (creditPackage && !assignedPackageId) {
          try {
            const { creditType, credits } = creditPackage;
            // Map credit type to session type for pricing lookup
            const sessionTypeMap: Record<string, string> = {
              private: "private",
              semi: "semi_private",
              group: "group",
            };
            const sessionType = sessionTypeMap[creditType] || creditType;

            // Get pricing for this credit type
            const pricing = await storage.getAcademyPricing(academyId);
            const pricingItem = pricing.find(
              (p) => p.sessionType === sessionType && p.isActive,
            );
            const pricePerCredit = pricingItem
              ? parseFloat(pricingItem.pricePerSession)
              : 0;
            const totalPrice = pricePerCredit * credits;
            const currency = pricingItem?.currency || "AED";

            // Create package with 12 month validity
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + 12);

            const pkg = await storage.createPackage({
              academyId,
              playerId,
              creditType: sessionType,
              name: `${credits} ${creditType.charAt(0).toUpperCase() + creditType.slice(1)} Credits`,
              totalCredits: credits,
              remainingCredits: credits,
              price: totalPrice.toString(),
              currency,
              expiryDate: expiryDate.toISOString().split("T")[0],
              status: "active",
            });
            assignedPackageId = pkg.id;
            console.log(
              `[AddPlayer] Created credit package ${pkg.id} (${credits} ${creditType} credits) for player ${playerId}`,
            );

            // Settle any outstanding debts for this player
            const creditPkgDebtSettlement = await storage.settlePlayerDebts(
              playerId,
              sessionType,
              pkg.id,
            );

            if (creditPkgDebtSettlement.settledCount > 0) {
              console.log(
                `[AddPlayer] Settled ${creditPkgDebtSettlement.settledCount} debts from credit package for player ${playerId}`,
              );
            }
          } catch (pkgError) {
            console.error(
              "[AddPlayer] Failed to create credit package:",
              pkgError,
            );
            // Continue without package - don't fail the enrollment
          }
        }

        if (!playerId) {
          return res.status(400).json({ error: "playerId is required" });
        }

        const existing = await storage.getCoachingSeriesById(id);
        if (!existing) {
          return res.status(404).json({ error: "Class not found" });
        }

        if (existing.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to add players to this class" });
        }

        // Check if player already in class (including former players)
        const currentPlayers = await storage.getSeriesPlayers(id);
        const existingMembership = currentPlayers.find(
          (p) => p.playerId === playerId,
        );

        if (existingMembership) {
          // If player previously left, allow re-adding by updating status
          if (existingMembership.status === "left") {
            const reactivated = await storage.updateSeriesPlayer(id, playerId, {
              status: "active",
              joinedAt: effectiveJoinDate
                ? new Date(effectiveJoinDate)
                : new Date(),
              leftAt: null,
              linkedPackageId: assignedPackageId,
              isGuest: isGuest || false,
              guestUntil: guestUntil || null,
            });

            // Backfill attendance for specified sessions
            if (attendedSessionIds && attendedSessionIds.length > 0) {
              for (const sessionId of attendedSessionIds) {
                try {
                  // Get session to determine type for credit matching
                  const session = await storage.getSession(sessionId);
                  const sessionType =
                    session?.sessionType || existing.sessionType || "group";

                  // First add player to session if not already
                  const sessionPlayersList =
                    await storage.getSessionPlayers(sessionId);
                  if (!sessionPlayersList.some((p) => p.id === playerId)) {
                    await storage.addPlayerToSession({ sessionId, playerId });
                  }

                  // Mark as attended - returns object with isNewAttendance flag
                  const attendanceResult = await storage.markAttendance(
                    sessionId,
                    playerId,
                    true,
                    academyId,
                  );
                  if (attendanceResult && attendanceResult.isNewAttendance) {
                    const { ensureCreditProcessed } = await import("../storage");
                    await ensureCreditProcessed(attendanceResult.record.id);
                    if (session) {
                      const xpAmount = session.xpValue || 20;
                      await storage.addPlayerXP(
                        playerId,
                        xpAmount,
                        sessionId,
                        "session_attendance",
                      );
                    }
                  }
                } catch (e) {
                  console.error(
                    `Failed to backfill attendance for session ${sessionId}:`,
                    e,
                  );
                }
              }
            }

            // Add player to future session instances.
            // IMPORTANT: addPlayerToSession creates a session_players row with NULL
            // attendance_status. ensureCreditProcessed treats NULL attendance as
            // "not_attended" and will NOT charge credits — credits are only charged
            // when attendance is explicitly marked (present/late/absent) during the
            // normal session completion flow. No session-type recalculation is
            // triggered here (that path is only reached for brand-new series players
            // below, not for reactivated-from-left players).
            const allSeriesSessions = await db
              .select()
              .from(sessions)
              .where(eq(sessions.seriesId, id));
            const dateParam = req.query.date as string | undefined;
            const now = dateParam ? new Date(dateParam) : new Date();
            const DUBAI_OFFSET = 4;
            const dubaiNow = new Date(
              now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
            );
            const guestUntilDate = guestUntil ? new Date(guestUntil + "T23:59:59Z") : null;
            const futureSessions = allSeriesSessions.filter(
              (s) => {
                const sessionTime = new Date(s.startTime);
                if (sessionTime <= now) return false;
                if (guestUntilDate && sessionTime > guestUntilDate) return false;
                return true;
              },
            );
            for (const futureSession of futureSessions) {
              try {
                const existingPlayers = await storage.getSessionPlayers(
                  futureSession.id,
                );
                if (!existingPlayers.some((p) => p.id === playerId)) {
                  await storage.addPlayerToSession({
                    sessionId: futureSession.id,
                    playerId,
                  });
                }
              } catch (e) {
                console.error(
                  `Failed to add player to future session ${futureSession.id}:`,
                  e,
                );
              }
            }

            // Return with linkedPackageId explicitly included
            return res.status(200).json({
              ...reactivated,
              linkedPackageId: assignedPackageId,
              packageAssigned: !!assignedPackageId,
            });
          }
          return res
            .status(400)
            .json({ error: "Player already in this class" });
        }

        // Check max players (only active players count)
        if (
          existing.maxPlayers &&
          currentPlayers.filter((p) => p.status === "active").length >=
            existing.maxPlayers
        ) {
          return res
            .status(400)
            .json({ error: "Class is at maximum capacity" });
        }

        const seriesPlayer = await storage.addPlayerToSeries({
          seriesId: id,
          courtId: existing.courtId || undefined,
          playerId,
          status: "active",
          joinedAt: effectiveJoinDate
            ? new Date(effectiveJoinDate)
            : new Date(),
          linkedPackageId: assignedPackageId,
          isGuest: isGuest || false,
          guestUntil: guestUntil || null,
        });

        // Backfill attendance for specified sessions (for new players)
        if (attendedSessionIds && attendedSessionIds.length > 0) {
          for (const sessionId of attendedSessionIds) {
            try {
              // Get session to determine type for credit matching
              const session = await storage.getSession(sessionId);
              const sessionType =
                session?.sessionType || existing.sessionType || "group";

              // First add player to session if not already
              const sessionPlayersList =
                await storage.getSessionPlayers(sessionId);
              if (!sessionPlayersList.some((p) => p.id === playerId)) {
                await storage.addPlayerToSession({ sessionId, playerId });
              }
              // Mark as attended - returns object with isNewAttendance flag
              const attendanceResult = await storage.markAttendance(
                sessionId,
                playerId,
                true,
                academyId,
              );
              if (attendanceResult && attendanceResult.isNewAttendance) {
                const { ensureCreditProcessed } = await import("../storage");
                await ensureCreditProcessed(attendanceResult.record.id);
                if (session) {
                  const xpAmount = session.xpValue || 20;
                  await storage.addPlayerXP(
                    playerId,
                    xpAmount,
                    sessionId,
                    "session_attendance",
                  );
                }
              }
            } catch (e) {
              console.error(
                `Failed to backfill attendance for session ${sessionId}:`,
                e,
              );
            }
          }
        }

        // Add player to future session instances
        const newPlayerSeriesSessions = await db
          .select()
          .from(sessions)
          .where(eq(sessions.seriesId, id));
        const nowTime = new Date();
        const newGuestUntilDate = guestUntil ? new Date(guestUntil + "T23:59:59Z") : null;
        const newPlayerFutureSessions = newPlayerSeriesSessions.filter(
          (s) => {
            const sessionTime = new Date(s.startTime);
            if (sessionTime <= nowTime) return false;
            if (newGuestUntilDate && sessionTime > newGuestUntilDate) return false;
            return true;
          },
        );
        for (const futureSession of newPlayerFutureSessions) {
          try {
            const existingPlayers = await storage.getSessionPlayers(
              futureSession.id,
            );
            if (!existingPlayers.some((p) => p.id === playerId)) {
              await storage.addPlayerToSession({
                sessionId: futureSession.id,
                playerId,
              });
            }
          } catch (e) {
            console.error(
              `Failed to add player to future session ${futureSession.id}:`,
              e,
            );
          }
        }

        // === DYNAMIC SESSION TYPE CONVERSION ===
        // Check if adding this player changes the session type
        const updatedPlayers = await storage.getSeriesPlayers(id);
        const activePlayerCount = updatedPlayers.filter(
          (p) => p.status === "active",
        ).length;
        const newSessionType = getSessionTypeByPlayerCount(activePlayerCount);
        const currentSessionType = existing.sessionType || "group";

        let sessionTypeChanged = false;
        if (newSessionType !== currentSessionType) {
          // Update series and all future sessions to new type
          await updateSeriesSessionType(id, newSessionType);

          // recalculateSeriesCredits only runs on a genuine session-type change
          // (guarded by the check above). It creates zero-amount informational
          // transactions — it does NOT deduct credits from any player's balance.
          // This block is unreachable for reactivated-from-left players (they
          // return early before this point).
          await recalculateSeriesCredits(
            id,
            currentSessionType,
            newSessionType,
            academyId,
          );

          sessionTypeChanged = true;
          console.log(
            `[AddPlayer] Session type changed: ${currentSessionType} -> ${newSessionType} (now ${activePlayerCount} players)`,
          );
        }

        // Return the series player with linkedPackageId explicitly included
        res.status(201).json({
          ...seriesPlayer,
          linkedPackageId: assignedPackageId,
          packageAssigned: !!assignedPackageId,
          sessionTypeChanged,
          newSessionType: sessionTypeChanged ? newSessionType : undefined,
          previousSessionType: sessionTypeChanged
            ? currentSessionType
            : undefined,
          activePlayerCount,
        });
      } catch (error) {
        console.error("Error adding player to class:", error);
        res.status(500).json({ error: "Failed to add player to class" });
      }
    },
  );

  // Remove a player from a series (permanent delete - use leave endpoint for history preservation)
  router.delete(
    "/api/coach/series/:id/players/:playerId",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id, playerId } = req.params;
        const coachId = req.user!.coachId;

        const existing = await storage.getCoachingSeriesById(id);
        if (!existing) {
          return res.status(404).json({ error: "Series not found" });
        }

        if (existing.coachId !== coachId) {
          return res
            .status(403)
            .json({
              error: "Not authorized to remove players from this series",
            });
        }

        await storage.removePlayerFromSeries(id, playerId);

        // === REMOVE FROM ALL FUTURE SESSIONS OF THIS SERIES ===
        const effectiveDate = new Date();
        const removedFromSessions =
          await storage.removePlayerFromFutureSeriesSessions(
            id,
            playerId,
            effectiveDate,
            req.user!.academyId!,
          );
        console.log(
          `[RemovePlayer] Removed player ${playerId} from ${removedFromSessions} future sessions of series ${id}`,
        );

        // === DYNAMIC SESSION TYPE CONVERSION after player removal ===
        const remainingPlayers = await storage.getSeriesPlayers(id);
        const activePlayerCount = remainingPlayers.filter(
          (p) => p.status === "active",
        ).length;
        const newSessionType = getSessionTypeByPlayerCount(activePlayerCount);
        const currentSessionType = existing.sessionType || "group";

        let sessionTypeChanged = false;
        if (newSessionType !== currentSessionType) {
          await updateSeriesSessionType(id, newSessionType);
          await recalculateSeriesCredits(
            id,
            currentSessionType,
            newSessionType,
            req.user!.academyId!,
          );
          sessionTypeChanged = true;
          console.log(
            `[RemovePlayer] Session type changed: ${currentSessionType} -> ${newSessionType} (now ${activePlayerCount} players)`,
          );
        }

        apiCache.invalidate(`series:${coachId}`);

        res.json({
          success: true,
          sessionTypeChanged,
          newSessionType: sessionTypeChanged ? newSessionType : undefined,
          activePlayerCount,
        });
      } catch (error) {
        console.error("Error removing player from series:", error);
        res.status(500).json({ error: "Failed to remove player from series" });
      }
    },
  );

  // Mark a player as left (keeps history - preferred over delete)
  router.post(
    "/api/coach/series/:id/players/:playerId/leave",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id, playerId } = req.params;
        const { leftAt } = req.body;
        const coachId = req.user!.coachId;

        const existing = await storage.getCoachingSeriesById(id);
        if (!existing) {
          return res.status(404).json({ error: "Class not found" });
        }

        if (existing.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to manage this class" });
        }

        const leftAtDate = leftAt ? new Date(leftAt) : undefined;
        const updated = await storage.markPlayerLeftSeries(
          id,
          playerId,
          leftAtDate,
        );
        if (!updated) {
          return res
            .status(404)
            .json({ error: "Player not found in this class" });
        }

        // === REMOVE FROM ALL FUTURE SESSIONS OF THIS SERIES ===
        const effectiveDate = leftAtDate || new Date();
        const removedFromSessions =
          await storage.removePlayerFromFutureSeriesSessions(
            id,
            playerId,
            effectiveDate,
            req.user!.academyId!,
          );
        console.log(
          `[LeavePlayer] Removed player ${playerId} from ${removedFromSessions} future sessions of series ${id}`,
        );

        // === DYNAMIC SESSION TYPE CONVERSION after player leaves ===
        const remainingPlayers = await storage.getSeriesPlayers(id);
        const activePlayerCount = remainingPlayers.filter(
          (p) => p.status === "active",
        ).length;
        const newSessionType = getSessionTypeByPlayerCount(activePlayerCount);
        const currentSessionType = existing.sessionType || "group";

        let sessionTypeChanged = false;
        if (newSessionType !== currentSessionType) {
          await updateSeriesSessionType(id, newSessionType);
          await recalculateSeriesCredits(
            id,
            currentSessionType,
            newSessionType,
            req.user!.academyId!,
          );
          sessionTypeChanged = true;
          console.log(
            `[LeavePlayer] Session type changed: ${currentSessionType} -> ${newSessionType} (now ${activePlayerCount} players)`,
          );
        }

        apiCache.invalidate(`series:${coachId}`);

        res.json({
          ...updated,
          sessionTypeChanged,
          newSessionType: sessionTypeChanged ? newSessionType : undefined,
          activePlayerCount,
        });
      } catch (error) {
        console.error("Error marking player as left:", error);
        res.status(500).json({ error: "Failed to update player status" });
      }
    },
  );

  // Pause a player's membership (vacation/injury)
  router.post(
    "/api/coach/series/:id/players/:playerId/pause",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id, playerId } = req.params;
        const { pauseFrom, pauseUntil, reason } = req.body;
        const coachId = req.user!.coachId;

        if (!pauseFrom || !pauseUntil) {
          return res
            .status(400)
            .json({ error: "pauseFrom and pauseUntil dates are required" });
        }

        const existing = await storage.getCoachingSeriesById(id);
        if (!existing) {
          return res.status(404).json({ error: "Class not found" });
        }

        if (existing.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to manage this class" });
        }

        const updated = await storage.pauseSeriesPlayer(
          id,
          playerId,
          new Date(pauseFrom),
          new Date(pauseUntil),
          reason,
        );

        if (!updated) {
          return res
            .status(404)
            .json({ error: "Player not found in this class" });
        }

        try {
          // Only remove session_player records for FUTURE (scheduled, not yet completed) sessions
          // during the pause window. Never remove completed sessions — those have credit
          // transactions already processed, and deleting them creates orphaned debt.
          const affectedSessions = await db
            .select({ id: sessions.id })
            .from(sessions)
            .where(
              and(
                eq(sessions.seriesId, id),
                eq(sessions.status, "scheduled"),
                gte(sql`${sessions.startTime}::date`, sql`${pauseFrom}::date`),
                lte(sql`${sessions.startTime}::date`, sql`${pauseUntil}::date`),
              )
            );
          if (affectedSessions.length > 0) {
            const sessionIds = affectedSessions.map(s => s.id);
            await db
              .delete(sessionPlayers)
              .where(
                and(
                  eq(sessionPlayers.playerId, playerId),
                  inArray(sessionPlayers.sessionId, sessionIds),
                )
              );
            console.log(`[Pause] Removed session_player records for player ${playerId} from ${affectedSessions.length} future sessions during pause ${pauseFrom} to ${pauseUntil}`);
          }
        } catch (cleanupErr) {
          console.error("[Pause] Error removing future session_players:", cleanupErr);
        }

        apiCache.invalidate(`series:${coachId}`);
        res.json(updated);
      } catch (error) {
        console.error("Error pausing player membership:", error);
        res.status(500).json({ error: "Failed to pause membership" });
      }
    },
  );

  // Unpause a player's membership (early return from vacation)
  router.post(
    "/api/coach/series/:id/players/:playerId/unpause",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id, playerId } = req.params;
        const coachId = req.user!.coachId;

        const existing = await storage.getCoachingSeriesById(id);
        if (!existing) {
          return res.status(404).json({ error: "Class not found" });
        }

        if (existing.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to manage this class" });
        }

        const updated = await storage.unpauseSeriesPlayer(id, playerId);
        if (!updated) {
          return res
            .status(404)
            .json({ error: "Player not found in this class" });
        }

        // Re-add player to all future sessions they were removed from during the pause.
        // No credit processing is triggered here — credits are only charged when a session
        // is attended/completed, which happens separately.
        try {
          const allSeriesSessions = await db
            .select()
            .from(sessions)
            .where(eq(sessions.seriesId, id));
          const now = new Date();
          const futureSessions = allSeriesSessions.filter(
            (s) => new Date(s.startTime) > now,
          );
          let insertedCount = 0;
          for (const futureSession of futureSessions) {
            try {
              const existingPlayers = await storage.getSessionPlayers(futureSession.id);
              if (!existingPlayers.some((p) => p.id === playerId)) {
                await storage.addPlayerToSession({
                  sessionId: futureSession.id,
                  playerId,
                });
                insertedCount++;
              }
            } catch (sessionErr) {
              console.error(
                `[Unpause] Failed to re-add player ${playerId} to session ${futureSession.id}:`,
                sessionErr,
              );
            }
          }
          console.log(`[Unpause] Re-added player ${playerId} to ${insertedCount}/${futureSessions.length} future sessions in series ${id}`);
        } catch (refillErr) {
          console.error("[Unpause] Error re-adding player to future sessions:", refillErr);
        }

        apiCache.invalidate(`series:${coachId}`);
        res.json(updated);
      } catch (error) {
        console.error("Error unpausing player membership:", error);
        res.status(500).json({ error: "Failed to unpause membership" });
      }
    },
  );

  // Smart merge suggestions - find available players from other groups to fill spots
  router.get(
    "/api/coach/series/:id/merge-suggestions",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;

        const targetSeries = await storage.getCoachingSeriesById(id);
        if (!targetSeries) {
          return res.status(404).json({ error: "Class not found" });
        }
        if (targetSeries.coachId !== coachId) {
          return res.status(403).json({ error: "Not authorized" });
        }

        const targetPlayers = await storage.getSeriesPlayers(id);
        const activeCount = targetPlayers.filter(p => p.status === "active").length;
        const maxPlayers = targetSeries.maxPlayers || 6;
        const openSlots = maxPlayers - activeCount;

        if (openSlots <= 0) {
          return res.json({ suggestions: [], openSlots: 0 });
        }

        const allCoachSeries = await db
          .select()
          .from(coachingSeries)
          .where(and(
            eq(coachingSeries.coachId, coachId),
            eq(coachingSeries.status, "active"),
            sql`${coachingSeries.id} != ${id}`
          ));

        const seriesIds = allCoachSeries.map(s => s.id);
        if (seriesIds.length === 0) {
          return res.json({ suggestions: [], openSlots });
        }

        const allSeriesPlayers = await storage.getSeriesPlayersBatch(seriesIds);
        const pausedPlayers = allSeriesPlayers.filter(sp => sp.status === "paused");

        const targetPlayerIds = new Set(targetPlayers.map(p => p.playerId));
        const suggestions: any[] = [];

        for (const sp of pausedPlayers) {
          if (targetPlayerIds.has(sp.playerId)) continue;

          const player = await storage.getPlayer(sp.playerId);
          if (!player) continue;

          const homeSeries = allCoachSeries.find(s => s.id === sp.seriesId);

          suggestions.push({
            playerId: sp.playerId,
            name: player.name || "Unknown",
            ballLevel: player.ballLevel || null,
            homeSeriesId: sp.seriesId,
            homeSeriesName: homeSeries?.title || "Unknown Group",
            homeSeriesDay: homeSeries?.dayOfWeek,
            pauseFrom: sp.pauseFrom || null,
            pauseUntil: sp.pauseUntil || null,
            pauseReason: sp.pauseReason || null,
          });
        }

        res.json({ suggestions, openSlots });
      } catch (error) {
        console.error("Error getting merge suggestions:", error);
        res.status(500).json({ error: "Failed to get suggestions" });
      }
    },
  );

  // Update a player's join date
  router.patch(
    "/api/coach/series/:id/players/:playerId/join-date",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id, playerId } = req.params;
        const { joinDate } = req.body;
        const coachId = req.user!.coachId;

        if (!joinDate) {
          return res.status(400).json({ error: "joinDate is required" });
        }

        const existing = await storage.getCoachingSeriesById(id);
        if (!existing) {
          return res.status(404).json({ error: "Class not found" });
        }

        if (existing.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to manage this class" });
        }

        // Update the player's join date directly in the database
        const updated = await db
          .update(seriesPlayers)
          .set({ joinedAt: new Date(joinDate) })

          .where(
            and(
              eq(seriesPlayers.seriesId, id),
              eq(seriesPlayers.playerId, playerId),
            ),
          )
          .returning();

        if (!updated.length) {
          return res
            .status(404)
            .json({ error: "Player not found in this class" });
        }

        res.json(updated[0]);
      } catch (error) {
        console.error("Error updating player join date:", error);
        res.status(500).json({ error: "Failed to update join date" });
      }
    },
  );

  // Link a package to a player's class membership (for credit consumption)
  router.post(
    "/api/coach/series/:id/players/:playerId/link-package",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id, playerId } = req.params;
        const { packageId } = req.body;
        const coachId = req.user!.coachId;

        if (!packageId) {
          return res.status(400).json({ error: "packageId is required" });
        }

        const existing = await storage.getCoachingSeriesById(id);
        if (!existing) {
          return res.status(404).json({ error: "Class not found" });
        }

        if (existing.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to manage this class" });
        }

        const updated = await storage.linkPackageToMembership(
          id,
          playerId,
          packageId,
        );
        if (!updated) {
          return res
            .status(404)
            .json({ error: "Player not found in this class" });
        }

        res.json(updated);
      } catch (error) {
        console.error("Error linking package to membership:", error);
        res.status(500).json({ error: "Failed to link package" });
      }
    },
  );

  // Get active players for a specific session date (excludes paused players)
  router.get(
    "/api/coach/series/:id/active-players",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { date } = req.query;
        const coachId = req.user!.coachId;

        const existing = await storage.getCoachingSeriesById(id);
        if (!existing) {
          return res.status(404).json({ error: "Class not found" });
        }

        if (existing.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to view this class" });
        }

        const sessionDate = date ? new Date(date as string) : new Date();
        const activePlayers = await storage.getActiveSeriesPlayersForDate(
          id,
          sessionDate,
        );

        // Enrich with player details
        const playerDetails = await Promise.all(
          activePlayers.map(async (sp) => {
            const player = await storage.getPlayer(sp.playerId);
            return { ...sp, player };
          }),
        );

        res.json(playerDetails);
      } catch (error) {
        console.error("Error getting active players:", error);
        res.status(500).json({ error: "Failed to get active players" });
      }
    },
  );

  // Get series feedback (aggregated from all sessions)
  router.get(
    "/api/coach/series/:id/feedback",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;

        const series = await storage.getCoachingSeriesById(id);
        if (!series) {
          return res.status(404).json({ error: "Series not found" });
        }

        if (series.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to view this series" });
        }

        // Get all sessions for this series
        const seriesSessions = await db
          .select()
          .from(sessions)
          .where(eq(sessions.seriesId, id));

        const sessionIds = seriesSessions.map((s) => s.id);

        if (sessionIds.length === 0) {
          return res.json({
            feedback: [],
            summary: { total: 0, withFeedback: 0, intensity: {} },
          });
        }

        // Get all feedback for these sessions
        const feedbackList = await db
          .select()
          .from(sessionFeedback)
          .where(inArray(sessionFeedback.sessionId, sessionIds));

        // Get player feedback for these sessions
        const playerFeedbackList = await db
          .select()
          .from(inSessionFeedback)
          .where(inArray(inSessionFeedback.sessionId, sessionIds));

        // Calculate summary stats
        const intensityCounts: Record<string, number> = {};
        feedbackList.forEach((f) => {
          if (f.intensity) {
            intensityCounts[f.intensity] =
              (intensityCounts[f.intensity] || 0) + 1;
          }
        });

        res.json({
          feedback: feedbackList.map((f) => ({
            ...f,
            sessionDate: seriesSessions.find((s) => s.id === f.sessionId)
              ?.startTime,
          })),
          playerFeedback: playerFeedbackList,
          summary: {
            total: seriesSessions.length,
            withFeedback: feedbackList.length,
            intensity: intensityCounts,
          },
        });
      } catch (error) {
        console.error("Error fetching series feedback:", error);
        res.status(500).json({ error: "Failed to fetch feedback" });
      }
    },
  );

  // Get series progress (XP and skill data for all players)
  router.get(
    "/api/coach/series/:id/progress",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;

        const series = await storage.getCoachingSeriesById(id);
        if (!series) {
          return res.status(404).json({ error: "Series not found" });
        }

        if (series.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to view this series" });
        }

        // Get all sessions for this series
        const seriesSessions = await db
          .select()
          .from(sessions)
          .where(eq(sessions.seriesId, id));

        const sessionIds = seriesSessions.map((s) => s.id);

        // Get players in this series
        const seriesPlayersData = await storage.getSeriesPlayers(id);
        const playerIds = seriesPlayersData.map((sp) => sp.playerId);

        if (playerIds.length === 0 || sessionIds.length === 0) {
          return res.json({ players: [], totalXp: 0 });
        }

        // Get XP transactions for these sessions
        const xpData = await db
          .select()
          .from(xpTransactions)

          .where(
            and(
              inArray(xpTransactions.playerId, playerIds),
              inArray(xpTransactions.sessionId, sessionIds),
            ),
          );

        // Aggregate XP by player
        const playerXpMap: Record<string, number> = {};
        xpData.forEach((tx) => {
          playerXpMap[tx.playerId] =
            (playerXpMap[tx.playerId] || 0) + tx.xpAmount;
        });

        // Get per-player attendance from sessionPlayers table
        const completedSessionIds = seriesSessions
          .filter((s) => s.status === "completed")
          .map((s) => s.id);

        let playerAttendanceMap: Record<string, number> = {};
        if (completedSessionIds.length > 0) {
          // Count players with attendanceStatus of "present" or "late" (both count as attended)
          // Also count if attendanceStatus is null but they're enrolled (legacy data)
          const attendanceData = await db
            .select({
              playerId: sessionPlayers.playerId,
              sessionCount: sql<number>`count(*)::int`,
            })
            .from(sessionPlayers)

            .where(
              and(
                inArray(sessionPlayers.playerId, playerIds),
                inArray(sessionPlayers.sessionId, completedSessionIds),
                or(
                  inArray(sessionPlayers.attendanceStatus, [
                    "present",
                    "late",
                    "absent",
                  ]),
                  isNull(sessionPlayers.attendanceStatus), // Legacy data without attendance tracking
                ),
              ),
            )
            .groupBy(sessionPlayers.playerId);

          attendanceData.forEach((att) => {
            if (att.playerId) {
              playerAttendanceMap[att.playerId] = att.sessionCount;
            }
          });
        }

        // Get player details
        const playerDetails = await Promise.all(
          playerIds.map(async (playerId) => {
            const player = await storage.getPlayer(playerId);
            return {
              id: playerId,
              name: player?.name || "Unknown",
              xpEarned: playerXpMap[playerId] || 0,
              sessionsAttended: playerAttendanceMap[playerId] || 0,
            };
          }),
        );

        res.json({
          players: playerDetails.sort((a, b) => b.xpEarned - a.xpEarned),
          totalXp: Object.values(playerXpMap).reduce((sum, xp) => sum + xp, 0),
          sessionsCompleted: seriesSessions.filter(
            (s) => s.status === "completed",
          ).length,
          totalSessions: seriesSessions.length,
        });
      } catch (error) {
        console.error("Error fetching series progress:", error);
        res.status(500).json({ error: "Failed to fetch progress" });
      }
    },
  );

  // Get series timeline (weekly breakdown)
  router.get(
    "/api/coach/series/:id/timeline",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;

        const series = await storage.getCoachingSeriesById(id);
        if (!series) {
          return res.status(404).json({ error: "Series not found" });
        }

        if (series.coachId !== coachId) {
          return res
            .status(403)
            .json({ error: "Not authorized to view this series" });
        }

        // Get all sessions for this series (only those still assigned to this coach)
        const seriesSessions = await db
          .select()
          .from(sessions)
          .where(and(eq(sessions.seriesId, id), eq(sessions.coachId, coachId)))
          .orderBy(asc(sessions.weekNumber), asc(sessions.startTime));

        // Get feedback for these sessions
        const sessionIds = seriesSessions.map((s) => s.id);
        let feedbackMap: Record<string, boolean> = {};

        if (sessionIds.length > 0) {
          const feedback = await db
            .select({ sessionId: sessionFeedback.sessionId })
            .from(sessionFeedback)
            .where(inArray(sessionFeedback.sessionId, sessionIds));

          feedback.forEach((f) => {
            if (f.sessionId) feedbackMap[f.sessionId] = true;
          });
        }

        // Build timeline
        const timeline = seriesSessions.map((session) => {
          const dateParam = req.query.date as string | undefined;
          const now = dateParam ? new Date(dateParam) : new Date();
          const DUBAI_OFFSET = 4;
          const dubaiNow = new Date(
            now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000,
          );
          const sessionDateUTC = new Date(session.startTime);
          const sessionDateDubai = toDubaiTime(sessionDateUTC);
          const isToday = sessionDate.toDateString() === now.toDateString();
          const isPast = sessionDate < now;
          const hasFeedback = feedbackMap[session.id] || false;

          let status:
            | "completed"
            | "needs_feedback"
            | "today"
            | "upcoming"
            | "skipped"
            | "cancelled" = "upcoming";

          if (session.status === "cancelled") {
            status = "cancelled";
          } else if (session.isSkipped) {
            status = "skipped";
          } else if (isToday) {
            status = "today";
          } else if (session.status === "completed") {
            status = hasFeedback ? "completed" : "needs_feedback";
          } else if (isPast) {
            status = hasFeedback ? "completed" : "needs_feedback";
          }

          return {
            sessionId: session.id,
            weekNumber: session.weekNumber || 1,
            date: session.startTime,
            status,
            hasFeedback,
          };
        });

        res.json(timeline);
      } catch (error) {
        console.error("Error fetching series timeline:", error);
        res.status(500).json({ error: "Failed to fetch timeline" });
      }
    },
  );

  // Migrate existing recurring sessions to series format
  router.post(
    "/api/coach/series/migrate",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId;

        if (!coachId) {
          return res.status(400).json({ error: "Coach ID required" });
        }

        // Find all unique recurring_group_ids for this coach that haven't been migrated
        const recurringGroups = await db
          .select({
            recurringGroupId: sessions.recurringGroupId,
          })
          .from(sessions)

          .where(
            and(
              eq(sessions.coachId, coachId),
              eq(sessions.isRecurring, true),
              isNotNull(sessions.recurringGroupId),
              isNull(sessions.seriesId),
            ),
          )
          .groupBy(sessions.recurringGroupId);

        if (recurringGroups.length === 0) {
          return res.json({
            message: "No recurring sessions to migrate",
            migratedCount: 0,
            seriesCreated: [],
          });
        }

        const migratedSeries: any[] = [];

        for (const group of recurringGroups) {
          if (!group.recurringGroupId) continue;

          // Get all sessions in this group
          const groupSessions = await db
            .select()
            .from(sessions)
            .where(eq(sessions.recurringGroupId, group.recurringGroupId))
            .orderBy(asc(sessions.startTime));

          if (groupSessions.length === 0) continue;

          const firstSession = groupSessions[0];
          const lastSession = groupSessions[groupSessions.length - 1];

          // Derive series properties from first session using UTC-safe calculation
          const startDate = new Date(firstSession.startTime);
          const endDate = new Date(lastSession.startTime);

          // Use UTC day to avoid timezone shift issues
          const dayOfWeek = startDate.getUTCDay();

          // Extract time as HH:mm from the stored timestamp (sessions store local time in the timestamp)
          const hours = startDate.getHours();
          const minutes = startDate.getMinutes();
          const startTimeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
          const duration = firstSession.duration || 60;

          // Generate title from session type
          const sessionTypeLabels: Record<string, string> = {
            private: "Private Lesson",
            semi_private: "Semi-Private",
            group: "Group Session",
            squad: "Squad Training",
            clinic: "Clinic",
            camp: "Camp",
          };
          const title = `${sessionTypeLabels[firstSession.sessionType || "group"] || "Training"} - ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayOfWeek]} ${startTimeStr}`;

          // Create the series
          const newSeries = await storage.createCoachingSeries({
            coachId: firstSession.coachId,
            academyId: firstSession.academyId || academyId || "default-academy",
            title,
            sessionType: firstSession.sessionType || "group",
            dayOfWeek,
            startTime: startTimeStr,
            duration,
            maxSessions: groupSessions.length,
            seriesStartDate: startDate,
            seriesEndDate: endDate,
            courtId: firstSession.courtId || null,
            locationId: firstSession.locationId || null,
            ballLevel: firstSession.ballLevel || null,
            skillLevel: firstSession.skillLevel || null,
            maxPlayers: firstSession.maxPlayers || 6,
            xpPerSession: firstSession.xpReward || 100,
            vibe: firstSession.vibe || null,
            price: firstSession.price ? String(firstSession.price) : null,
            status: "active",
          });

          // Update all sessions with proper week number based on actual week offsets
          // Calculate week numbers based on difference from first session
          const firstWeekStart = new Date(startDate);
          firstWeekStart.setUTCHours(0, 0, 0, 0);

          for (const session of groupSessions) {
            const sessionDateUTC = new Date(session.startTime);
            const sessionDateDubai = toDubaiTime(sessionDateUTC);
            sessionDate.setUTCHours(0, 0, 0, 0);

            // Calculate weeks elapsed since first session
            const msPerWeek = 7 * 24 * 60 * 60 * 1000;
            const weeksElapsed = Math.round(
              (sessionDate.getTime() - firstWeekStart.getTime()) / msPerWeek,
            );
            const weekNumber = weeksElapsed + 1; // Week 1 is the first week

            await db
              .update(sessions)
              .set({
                seriesId: newSeries.id,
                weekNumber,
              })
              .where(eq(sessions.id, session.id));
          }

          // Gather all unique players from ALL sessions in the group (not just first)
          const allSessionIds = groupSessions.map((s) => s.id);
          const allSessionPlayers = await db
            .select({ playerId: sessionPlayers.playerId })
            .from(sessionPlayers)
            .where(inArray(sessionPlayers.sessionId, allSessionIds));

          // Deduplicate player IDs
          const uniquePlayerIds = [
            ...new Set(
              allSessionPlayers.map((sp) => sp.playerId).filter(Boolean),
            ),
          ];

          for (const playerId of uniquePlayerIds) {
            if (playerId && newSeries.id) {
              await storage.addPlayerToSeries({
                seriesId: newSeries.id,
                playerId: playerId,
                status: "active",
              });
            }
          }

          migratedSeries.push({
            seriesId: newSeries.id,
            title: newSeries.title,
            sessionCount: groupSessions.length,
            playerCount: uniquePlayerIds.length,
          });
        }

        res.json({
          message: `Successfully migrated ${migratedSeries.length} recurring session groups to series`,
          migratedCount: migratedSeries.length,
          seriesCreated: migratedSeries,
        });
      } catch (error) {
        console.error("Error migrating recurring sessions:", error);
        res.status(500).json({ error: "Failed to migrate recurring sessions" });
      }
    },
  );

export default router;
