import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { storage } from "../storage";
import { db } from "../db";
import {
  sessions, sessionPlayers, sessionFeedback, creditTransactions, players,
  matchRequests, posts as postsTable, users, coaches, courtBookings, academies,
  sessionRatings, coachReviews, coachReviewStats,
} from "@shared/schema";
import { sendReflectionReminderForSession } from "../pushNotifications";
import { eq, sql, desc, and, ne, asc, inArray, isNull, isNotNull, or, gte } from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  requireAcademy,
  requireFeatureUnlock,
  generateToken,
  type AuthenticatedRequest,
} from "../auth";
import { apiCache, CACHE_KEYS, CACHE_TTL } from "../cache";
import { awardXP } from "../services/xp-service";
import crypto from "crypto";
import { generateShortInviteCode } from "../utils/inviteCode";

const router = Router();

function requirePlayerOrOwner(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.user.role === "platform_owner" || req.user.role === "academy_owner" || req.user.role === "owner" || req.user.role === "admin") {
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

  // ==================== ADMIN SERIES MANAGEMENT ====================
  // Admin can view and manage all series for all coaches in the academy

  // Get all coaching series for the academy (with optional coach filter)
  router.get("/api/admin/series", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.currentAcademyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const { coachId, status } = req.query;

      // Get all series for the academy, optionally filtered by coach
      let allSeries: any[] = [];
      if (coachId && typeof coachId === "string") {
        if (status === "active") {
          allSeries = await storage.getActiveCoachingSeries(coachId, academyId);
        } else {
          allSeries = await storage.getCoachingSeries(coachId, academyId);
        }
      } else {
        // Get all coaches in the academy and fetch their series
        const academyCoaches = await storage.getCoachesByAcademy(academyId);
        for (const coach of academyCoaches) {
          const coachSeries = status === "active"
            ? await storage.getActiveCoachingSeries(coach.id, academyId)
            : await storage.getCoachingSeries(coach.id, academyId);
          allSeries.push(...coachSeries);
        }
      }

      // Enrich each series with player count, coach name, and sessions completed
      const academyCoaches = await storage.getCoachesByAcademy(academyId);
      const coachMap = new Map(academyCoaches.map(c => [c.id, c]));

      const enrichedSeries = await Promise.all(allSeries.map(async (s) => {
        const seriesPlayersWithDetails = await storage.getSeriesPlayersWithDetails(s.id);
        const activePlayers = seriesPlayersWithDetails.filter(p => p.status === "active");

        const sessionsForSeries = await db
          .select()
          .from(sessions)
          
          .where(and(
            eq(sessions.seriesId, s.id),
            eq(sessions.status, "completed")
          ));

        const completedSessionIds = sessionsForSeries.map(sess => sess.id);
        let pendingFeedback = 0;
        if (completedSessionIds.length > 0) {
          const feedbackCount = await db
            .select({ count: sql<number>`count(distinct ${sessionFeedback.sessionId})` })
            .from(sessionFeedback)
            .where(inArray(sessionFeedback.sessionId, completedSessionIds));
          pendingFeedback = sessionsForSeries.length - (feedbackCount[0]?.count || 0);
        }

        const coach = coachMap.get(s.coachId);

        return {
          ...s,
          coachName: coach?.name || "Unknown Coach",
          playerCount: activePlayers.length,
          playerNames: activePlayers.map(p => p.playerName || "Unknown").slice(0, 4),
          sessionsCompleted: sessionsForSeries.length,
          pendingFeedback: Math.max(0, pendingFeedback),
        };
      }));
      
      // If filtering by a specific coach, also include their orphan sessions (transferred from other coaches)
      const virtualFlexibleSeries: any[] = [];
      if (coachId && typeof coachId === "string") {
        const ownSeriesIds = allSeries.map(s => s.id);
        const orphanSessions = await db
          .select()
          .from(sessions)
          
          .where(and(
            eq(sessions.coachId, coachId),
            eq(sessions.academyId, academyId), // Filter by academy to ensure correct data
            or(
              ownSeriesIds.length > 0 
                ? and(isNotNull(sessions.seriesId), notInArray(sessions.seriesId, ownSeriesIds))
                : isNotNull(sessions.seriesId),
              isNull(sessions.seriesId)
            )
          ))
          .orderBy(asc(sessions.startTime));
        
        console.log(`[AdminSeries] Coach ${coachId} orphan sessions found: ${orphanSessions.length}`);
        
        if (orphanSessions.length > 0) {
          const groupedBySeriesId = orphanSessions.reduce((acc, session) => {
            const key = session.seriesId || 'standalone';
            if (!acc[key]) acc[key] = [];
            acc[key].push(session);
            return acc;
          }, {} as Record<string, typeof orphanSessions>);
          
          for (const [seriesKey, sessionsGroup] of Object.entries(groupedBySeriesId)) {
            const firstSession = sessionsGroup[0];
            const completedCount = sessionsGroup.filter(s => s.status === 'completed').length;
            const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
            const nextSession = sessionsGroup.find(s => s.status === 'scheduled' && new Date(s.startTime) > now);
            
            const sessionPlayersList = await db
              .select()
              .from(sessionPlayers)
              .where(eq(sessionPlayers.sessionId, firstSession.id));
            
            const playerDetails = await Promise.all(sessionPlayersList.slice(0, 4).map(async (sp) => {
              const player = await storage.getPlayer(sp.playerId);
              return { id: sp.playerId, name: player?.name || 'Unknown' };
            }));
            
            const coach = coachMap.get(coachId);
            
            virtualFlexibleSeries.push({
              id: `virtual-${seriesKey}`,
              title: firstSession.title || 'Transferred Session',
              status: 'active',
              sessionType: firstSession.sessionType,
              dayOfWeek: -1,
              startTime: firstSession.startTime,
              duration: firstSession.duration,
              coachId: coachId,
              coachName: coach?.name || 'Unknown Coach',
              academyId: academyId,
              maxPlayers: firstSession.maxPlayers || 1,
              ballLevel: firstSession.ballLevel,
              weekCount: sessionsGroup.length,
              isTransferred: true,
              originalSeriesId: seriesKey !== 'standalone' ? seriesKey : null,
              playerCount: sessionPlayersList.length,
              playerNames: playerDetails.map(p => p.name),
              sessionsCompleted: completedCount,
              pendingFeedback: 0,
              transferredSessionIds: sessionsGroup.map(s => s.id),
            });
          }
        }
      }
      
      const finalSeries = [...enrichedSeries, ...virtualFlexibleSeries];
      res.json(finalSeries);
    } catch (error) {
      console.error("Error fetching admin series:", error);
      res.status(500).json({ error: "Failed to fetch series" });
    }
  });

  // Get a single coaching series by ID (admin can view any series in their academy)
  router.get("/api/admin/series/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      let { id } = req.params;
      const academyId = req.user?.currentAcademyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      // Handle virtual/transferred series (prefixed with "virtual-")
      const isVirtual = id.startsWith("virtual-");
      const realSeriesId = isVirtual ? id.replace("virtual-", "") : id;

      const series = await storage.getCoachingSeriesById(realSeriesId);

      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      // Verify academy ownership
      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized to view this series" });
      }

      // Get coach info
      const coach = await storage.getCoach(series.coachId);

      // Get players in this series
      const seriesPlayers = await storage.getSeriesPlayers(id);

      // Get credit balances for all players
      const playerIds = seriesPlayers.map(sp => sp.playerId);
      const creditBalances = await storage.getPlayersCreditBalances(playerIds);

      const playerDetails = await Promise.all(seriesPlayers.map(async (sp) => {
        const player = await storage.getPlayer(sp.playerId);
        const credits = creditBalances[sp.playerId] || { group: 0, semi_private: 0, private: 0, totalDebt: 0, hasDebt: false };
        return {
          id: sp.playerId,
          name: player?.name || "Unknown Player",
          ballLevel: player?.ballLevel || null,
          status: sp.status,
          sessionsAttended: sp.sessionsAttended || 0,
          totalXpEarned: sp.totalXpEarned || 0,
          joinedAt: sp.joinedAt?.toISOString() || null,
          leftAt: sp.leftAt?.toISOString() || null,
          pauseFrom: sp.pauseFrom || null,
          pauseUntil: sp.pauseUntil || null,
          pauseReason: sp.pauseReason || null,
          linkedPackageId: sp.linkedPackageId || null,
          credits,
        };
      }));

      // Get all sessions for this series
      const seriesSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.seriesId, id))
        .orderBy(asc(sessions.startTime));

      // Get location and court names
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

      let courtName = null;
      if (series.courtId) {
        const court = await storage.getCourt(series.courtId);
        courtName = court?.name;
      }

      res.json({
        ...series,
        coachName: coach?.name || "Unknown Coach",
        locationName,
        locationAddress,
        locationLat,
        locationLng,
        courtName,
        players: playerDetails,
        sessions: seriesSessions,
        stats: {
          totalSessions: series.weekCount || seriesSessions.length,
          completedSessions: seriesSessions.filter(s => s.status === "completed").length,
          upcomingSessions: seriesSessions.filter(s => s.status === "scheduled" && new Date(s.startTime) > new Date()).length,
          cancelledSessions: seriesSessions.filter(s => s.status === "cancelled").length,
        },
      });
    } catch (error) {
      console.error("Error fetching admin series details:", error);
      res.status(500).json({ error: "Failed to fetch series details" });
    }
  });

  // Create a new coaching series (admin can create for any coach)
  router.post("/api/admin/series", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.currentAcademyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const {
        coachId,
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
        sport,
      } = req.body;

      if (!coachId) {
        return res.status(400).json({ error: "coachId is required for admin series creation" });
      }

      if (!title || dayOfWeek === undefined || !startTime || !duration || !sessionType || !seriesStartDate) {
        return res.status(400).json({ error: "title, dayOfWeek, startTime, duration, sessionType, and seriesStartDate are required" });
      }

      // Verify coach belongs to this academy
      const coach = await storage.getCoach(coachId);
      if (!coach) {
        return res.status(404).json({ error: "Coach not found" });
      }

      // Enforce location selection when academy has multiple active locations
      const allLocations = await storage.getAllLocations(academyId);
      const activeLocationCount = allLocations.filter((l) => l.isActive !== false).length;
      let resolvedLocationId: string | null = locationId || null;
      if (activeLocationCount > 1) {
        if (!resolvedLocationId) {
          if (courtId) {
            // Auto-resolve location from court
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

      const VALID_SPORTS = ["tennis", "padel", "pickleball"];
      const validatedSport = sport && VALID_SPORTS.includes(sport) ? sport : "tennis";

      // Create the series
      const series = await storage.createCoachingSeries({
        academyId,
        coachId,
        courtId: courtId || null,
        locationId: resolvedLocationId,
        title: sanitizeTemplateName(title),
        dayOfWeek,
        startTime,
        duration,
        sessionType,
        ballLevel,
        skillLevel,
        maxPlayers: maxPlayers || 6,
        weekCount: weekCount || null,
        seriesStartDate,
        seriesEndDate: seriesEndDate || null,
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

      // Generate session instances (same logic as coach endpoint)
      const createdSessions: any[] = [];
      const skippedWeeks: { week: number; reason: string }[] = [];

      const academy = await storage.getAcademy(academyId);
      const academyTimezone = academy?.timezone || "Europe/Amsterdam";

      const initialResolution = ensureResolvableLocalTime(seriesStartDate, startTime, academyTimezone);
      if (!initialResolution.ok) {
        return res.status(400).json({ error: initialResolution.error });
      }

      const firstSessionResult = getFirstSessionDate(
        seriesStartDate,
        dayOfWeek,
        startTime,
        academyTimezone
      );

      if (firstSessionResult.status === "error") {
        return res.status(400).json({
          error: { code: "TIME_UNRESOLVABLE", message: firstSessionResult.message }
        });
      }
      if (firstSessionResult.status === "gap") {
        return res.status(400).json({
          error: {
            code: "TIME_UNRESOLVABLE",
            requestedTime: startTime,
            suggestedNext: firstSessionResult.suggestedTime,
            date: firstSessionResult.dateStr,
            message: `The time ${startTime} does not exist on ${firstSessionResult.dateStr} in timezone ${academyTimezone} (DST transition). Please use ${firstSessionResult.suggestedTime} instead.`
          }
        });
      }

      const { dateStr: firstDateStr, utcDate: firstSessionDate } = firstSessionResult;
      let currentLocalDateStr = firstDateStr;

      let seriesEnd: Date | null = null;
      if (seriesEndDate) {
        const endResolution = ensureResolvableLocalTime(seriesEndDate, "23:59", academyTimezone);
        if (endResolution.ok) {
          seriesEnd = endResolution.utcDate;
        }
      }

      let calculatedMaxWeeks = weekCount || 52;
      if (seriesEnd) {
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const weeksBetween = Math.floor((seriesEnd.getTime() - firstSessionDate.getTime()) / msPerWeek) + 1;
        calculatedMaxWeeks = Math.min(calculatedMaxWeeks, Math.max(0, weeksBetween));
      }

      const maxSessions = weekCount ? Math.min(weekCount, calculatedMaxWeeks) : calculatedMaxWeeks;

      for (let weekIndex = 0; weekIndex < maxSessions; weekIndex++) {
        const sessionDateStr = addDaysToLocalDate(currentLocalDateStr, weekIndex * 7);

        const weekResolution = ensureResolvableLocalTime(sessionDateStr, startTime, academyTimezone);
        if (!weekResolution.ok) {
          skippedWeeks.push({
            week: weekIndex + 1,
            reason: weekResolution.error.message
          });
          continue;
        }

        const sessionDate = weekResolution.utcDate;

        if (seriesEnd && sessionDate.getTime() > seriesEnd.getTime()) {
          break;
        }

        const weekNumber = weekIndex + 1;
        const sessionEndTime = new Date(sessionDate.getTime() + duration * 60000);

        const coachConflict = await storage.checkCoachConflict(coachId, sessionDate, sessionEndTime, undefined, academyId);
        const courtConflict = courtId ? await storage.checkCourtConflict(courtId, sessionDate, sessionEndTime, undefined, academyId) : false;

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

        let pricingSnapshot: { academyPrice?: string; coachPayout?: string; academyMargin?: string } = {};
        if (academyId && coachId) {
          try {
            const pricing = await storage.calculateSessionPricing(academyId, coachId, sessionType, duration);
            pricingSnapshot = {
              academyPrice: String(pricing.academyPrice),
              coachPayout: String(pricing.coachPayout),
              academyMargin: String(pricing.academyMargin),
            };
          } catch (err: any) {
            return res.status(422).json({
              error: "Pricing error",
              message: err.message || "Could not calculate session pricing"
            });
          }
        }

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
          recurringGroupId: series.id,
          weekCount: maxSessions,
          seriesId: series.id,
          weekNumber,
          travelTime: 0,
          paymentStatus: "unpaid",
          status: "scheduled",
          sport: validatedSport,
          ...pricingSnapshot,
        });

        createdSessions.push(session);
      }

      res.status(201).json({
        series,
        sessionsCreated: createdSessions.length,
        skippedWeeks,
      });
    } catch (error) {
      console.error("Error creating admin series:", error);
      res.status(500).json({ error: "Failed to create series" });
    }
  });

  // Update a coaching series (admin)
  router.patch("/api/admin/series/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.currentAcademyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized to update this series" });
      }

      const updates = req.body;
      const updatedSeries = await storage.updateCoachingSeries(id, updates);

      res.json(updatedSeries);
    } catch (error) {
      console.error("Error updating admin series:", error);
      res.status(500).json({ error: "Failed to update series" });
    }
  });

  // Delete a coaching series (admin)
  router.delete("/api/admin/series/:id", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userRole = req.user?.role;
      const academyId = req.user?.currentAcademyId || req.header("X-Academy-Id");

      // Handle virtual series (orphan/transferred sessions grouped under virtual-{seriesKey})
      if (id.startsWith("virtual-")) {
        const originalSeriesKey = id.replace("virtual-", "");
        console.log(`[Series DELETE] Deleting virtual series: ${id}, original key: ${originalSeriesKey}`);

        // First, find the ORIGINAL series to know the original coach
        const originalSeries = originalSeriesKey !== "standalone" 
          ? await storage.getCoachingSeriesById(originalSeriesKey) 
          : null;
        const originalCoachId = originalSeries?.coachId;

        // Find sessions matching this series key
        let allMatchingSessions;
        if (originalSeriesKey === "standalone") {
          allMatchingSessions = await db.select().from(sessions)
            .where(isNull(sessions.seriesId));
        } else {
          allMatchingSessions = await db.select().from(sessions)
            .where(eq(sessions.seriesId, originalSeriesKey));
        }

        // CRITICAL: Only target sessions that are NOT owned by the original coach
        // Virtual/transferred sessions are ones that belong to a DIFFERENT coach than the series owner
        let orphanSessions;
        if (originalCoachId) {
          orphanSessions = allMatchingSessions.filter(s => s.coachId !== originalCoachId);
          console.log(`[Series DELETE] Original coach: ${originalCoachId}, total sessions: ${allMatchingSessions.length}, orphan/transferred: ${orphanSessions.length}`);
        } else {
          orphanSessions = allMatchingSessions;
          console.log(`[Series DELETE] No original series found, targeting all ${allMatchingSessions.length} sessions`);
        }

        if (orphanSessions.length === 0) {
          return res.status(404).json({ error: "No transferred/orphan sessions found for this virtual series" });
        }

        const sessionIds = orphanSessions.map(s => s.id);
        const orphanCoachId = orphanSessions[0]?.coachId;

        // Use a transaction to ensure all-or-nothing deletion
        await db.transaction(async (tx) => {
          await tx.delete(xpTransactions).where(inArray(xpTransactions.sessionId, sessionIds));
          await tx.delete(coachXpTransactions).where(inArray(coachXpTransactions.sessionId, sessionIds));
          await tx.delete(creditTransactions).where(inArray(creditTransactions.sessionId, sessionIds));
          await tx.delete(sessionPlayers).where(inArray(sessionPlayers.sessionId, sessionIds));
          await tx.delete(sessions).where(inArray(sessions.id, sessionIds));
        });

        console.log(`[Series DELETE] Deleted ${sessionIds.length} orphan sessions for virtual series ${id}`);

        if (orphanCoachId) {
          apiCache.invalidate(`series:${orphanCoachId}`);
          apiCache.invalidate(`earnings:${orphanCoachId}`);
          apiCache.invalidate(`calendar:${orphanCoachId}`);
        }

        return res.json({ success: true, deletedSessions: sessionIds.length });
      }

      // Handle regular series
      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (userRole !== "platform_owner") {
        if (!academyId) {
          return res.status(400).json({ error: "Academy context required" });
        }
        if (series.academyId !== academyId) {
          return res.status(403).json({ error: "Not authorized to delete this series" });
        }
      }

      const seriesCoachId = series.coachId;
      await storage.deleteCoachingSeries(id);
      
      if (seriesCoachId) {
        apiCache.invalidate(`series:${seriesCoachId}`);
        apiCache.invalidate(`earnings:${seriesCoachId}`);
        apiCache.invalidate(`calendar:${seriesCoachId}`);
        console.log("[Series DELETE] Cache invalidated for coach:", seriesCoachId);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting admin series:", error);
      res.status(500).json({ error: "Failed to delete series" });
    }
  });

  // Add player to series (admin)
  router.post("/api/admin/series/:id/players", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.currentAcademyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const addPlayerSchema = z.object({
        playerId: z.string().min(1),
        packageId: z.string().optional().nullable(),
        effectiveDate: z.string().datetime({ offset: true }).optional().nullable(),
      });
      const parsedAddPlayer = addPlayerSchema.safeParse(req.body);
      if (!parsedAddPlayer.success) return res.status(400).json({ error: fromZodError(parsedAddPlayer.error).message });
      const { playerId, packageId, effectiveDate } = parsedAddPlayer.data;

      if (!playerId) {
        return res.status(400).json({ error: "playerId is required" });
      }

      const existingPlayer = await storage.getSeriesPlayer(id, playerId);
      if (existingPlayer && existingPlayer.status === "active") {
        return res.status(400).json({ error: "Player is already in this series" });
      }

      if (existingPlayer) {
        await storage.updateSeriesPlayer(id, playerId, {
          status: "active",
          leftAt: null,
          pauseFrom: null,
          pauseUntil: null,
          pauseReason: null,
          linkedPackageId: packageId || null,
        });
      } else {
        await storage.addPlayerToSeries({
          seriesId: id,
        courtId: existing.courtId || undefined,
          playerId,
          status: "active",
          linkedPackageId: packageId || null,
          joinedAt: effectiveDate ? new Date(effectiveDate) : new Date(),
        });
      }

      const updatedSeries = await storage.getCoachingSeriesById(id);
      const seriesPlayers = await storage.getSeriesPlayers(id);

      res.json({ success: true, players: seriesPlayers });
    } catch (error) {
      console.error("Error adding player to admin series:", error);
      res.status(500).json({ error: "Failed to add player" });
    }
  });

  // Remove player from series (admin)
  router.delete("/api/admin/series/:id/players/:playerId", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const academyId = req.user?.currentAcademyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await storage.removePlayerFromSeries(id, playerId);

      res.json({ success: true });
    } catch (error) {
      console.error("Error removing player from admin series:", error);
      res.status(500).json({ error: "Failed to remove player" });
    }
  });

  // Pause player in series (admin)
  router.post("/api/admin/series/:id/players/:playerId/pause", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const academyId = req.user?.currentAcademyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { pauseFrom, pauseUntil, pauseReason } = req.body;

      await storage.updateSeriesPlayer(id, playerId, {
        status: "paused",
        pauseFrom: pauseFrom || null,
        pauseUntil: pauseUntil || null,
        pauseReason: pauseReason || null,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error pausing player in admin series:", error);
      res.status(500).json({ error: "Failed to pause player" });
    }
  });

  // Unpause player in series (admin)
  router.post("/api/admin/series/:id/players/:playerId/unpause", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const academyId = req.user?.currentAcademyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await storage.updateSeriesPlayer(id, playerId, {
        status: "active",
        pauseFrom: null,
        pauseUntil: null,
        pauseReason: null,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error unpausing player in admin series:", error);
      res.status(500).json({ error: "Failed to unpause player" });
    }
  });

  // Get series feedback (admin)
  router.get("/api/admin/series/:id/feedback", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.currentAcademyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const seriesSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.seriesId, id));

      const sessionIds = seriesSessions.map(s => s.id);

      if (sessionIds.length === 0) {
        return res.json({ friends: [], pendingRequests: [] });
      }

      const feedback = await db
        .select()
        .from(sessionFeedback)
        .where(inArray(sessionFeedback.sessionId, sessionIds))
        .orderBy(desc(sessionFeedback.createdAt));

      const enrichedFeedback = await Promise.all(feedback.map(async (f) => {
        const player = await storage.getPlayer(f.playerId);
        const session = seriesSessions.find(s => s.id === f.sessionId);
        return {
          ...f,
          playerName: player?.name || "Unknown",
          sessionDate: session?.startTime,
        };
      }));

      res.json(enrichedFeedback);
    } catch (error) {
      console.error("Error fetching admin series feedback:", error);
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });

  // Get series progress (admin)
  router.get("/api/admin/series/:id/progress", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.currentAcademyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const seriesPlayers = await storage.getSeriesPlayers(id);

      const playerProgress = await Promise.all(seriesPlayers.map(async (sp) => {
        const player = await storage.getPlayer(sp.playerId);
        const xpTransactions = await storage.getPlayerXPTransactions(sp.playerId, 30);
        const recentXP = xpTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

        return {
          playerId: sp.playerId,
          playerName: player?.name || "Unknown",
          sessionsAttended: sp.sessionsAttended || 0,
          totalXpEarned: sp.totalXpEarned || 0,
          recentXP,
          status: sp.status,
        };
      }));

      res.json(playerProgress);
    } catch (error) {
      console.error("Error fetching admin series progress:", error);
      res.status(500).json({ error: "Failed to fetch progress" });
    }
  });

  // Get series timeline (admin)
  router.get("/api/admin/series/:id/timeline", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.currentAcademyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const series = await storage.getCoachingSeriesById(id);
      if (!series) {
        return res.status(404).json({ error: "Series not found" });
      }

      if (series.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const seriesSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.seriesId, id))
        .orderBy(asc(sessions.startTime));

      const timeline = seriesSessions.map((s, index) => ({
        id: s.id,
        weekNumber: s.weekNumber || index + 1,
        date: s.startTime,
        status: s.status,
        duration: s.duration,
      }));

      res.json(timeline);
    } catch (error) {
      console.error("Error fetching admin series timeline:", error);
      res.status(500).json({ error: "Failed to fetch timeline" });
    }
  });

  // Get session attendance (admin)
  router.get("/api/admin/sessions/:id/attendance", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.currentAcademyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const session = await storage.getSession(id);
      if (!session || session.academyId !== academyId) {
        return res.status(404).json({ error: "Session not found" });
      }

      const sessionPlayers = await storage.getSessionPlayersWithPlayerInfo(id);
      const attendance = sessionPlayers.map(sp => ({
        playerId: sp.playerId,
        playerName: sp.playerName || "Unknown",
        status: sp.attendanceStatus,
        lateMinutes: sp.lateMinutes,
        absentReason: sp.absentReason,
      }));

      res.json(attendance);
    } catch (error) {
      console.error("Error fetching session attendance:", error);
      res.status(500).json({ error: "Failed to fetch attendance" });
    }
  });

  // Save session attendance (admin)
  router.post("/api/admin/sessions/:id/attendance", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user?.currentAcademyId;

      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const session = await storage.getSession(id);
      if (!session || session.academyId !== academyId) {
        return res.status(404).json({ error: "Session not found" });
      }

      const { attendance } = req.body;
      if (!attendance || !Array.isArray(attendance)) {
        return res.status(400).json({ error: "attendance array required" });
      }

      const results = [];
      for (const record of attendance) {
        const updated = await storage.updateAttendance(
          id,
          record.playerId,
          record.status,
          record.lateMinutes,
          record.absentReason
        );
        results.push(updated);
          
          // When attendance changes to holiday/vacation, cancel any debt for this session
          // Note: updateAttendance() now also handles this internally — this is a safety net
          if (record.status === "vacation" || record.status === "holiday") {
            const cancelReason = record.status === "vacation" ? "attendance_changed_to_vacation" : "attendance_changed_to_holiday";
            const cancelResult = await storage.cancelSessionDebt(record.playerId, id, cancelReason);
            if (cancelResult.cancelled) {
              console.log(`[Attendance] Cancelled ${cancelResult.amount} credits of debt for player ${record.playerId} due to ${record.status} status`);
            }
          }
      }

      // Mark session as completed if all attendance is marked
      const allSessionPlayers = await storage.getSessionPlayersWithPlayerInfo(id);
      const allMarked = allSessionPlayers.every(sp => sp.attendanceStatus && sp.attendanceStatus !== "pending");
      
      if (allMarked && session.status === "scheduled") {
        await storage.updateSession(id, { status: "completed" });
        
        // Award XP to players marked present or late via canonical session_attendance XP rule
        const presentPlayers = attendance.filter((a: { status: string }) => a.status === "present" || a.status === "late");
        
        for (const presentPlayer of presentPlayers) {
          try {
            const xpResult = await awardXP(presentPlayer.playerId, "session_attendance", "session", id);
            if (xpResult.success) {
              console.log(`[XP] Awarded ${xpResult.xpAwarded} XP to player ${presentPlayer.playerId} for session ${id} (session_attendance)`);
            }
          } catch (xpError) {
            console.error(`[XP] Error awarding XP to player ${presentPlayer.playerId}:`, xpError);
          }
        }

        // Send reflection reminder push notification to present/late players
        // Use authoritative DB records (allSessionPlayers) rather than the request payload to avoid
        // partial-update edge cases where some players may not be included in this request.
        const eligiblePlayerIds = allSessionPlayers
          .filter((sp) => sp.attendanceStatus === "present" || sp.attendanceStatus === "late")
          .map((sp) => sp.playerId)
          .filter(Boolean) as string[];
        if (eligiblePlayerIds.length > 0) {
          sendReflectionReminderForSession(id, eligiblePlayerIds).catch((err) =>
            console.error(`[ReflectionReminder] Error sending reminders for session ${id}:`, err)
          );
        }
      }

      res.json({ success: true, updated: results.length });
    } catch (error) {
      console.error("Error saving session attendance:", error);
      res.status(500).json({ error: "Failed to save attendance" });
    }
  });

  // Admin create session (for any coach in the academy)
  router.post("/api/admin/sessions", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.currentAcademyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const {
        coachId,
        courtId,
        locationId,
        startTime,
        duration,
        sessionType,
        ballLevel,
        skillLevel,
        weekCount,
        travelTime,
        playerIds,
        maxPlayers,
        isRecurring,
        visibleToPlayers,
        enableWaitlist,
        isOpen,
        sport,
      } = req.body;

      if (!coachId || !courtId || !startTime || !duration || !sessionType) {
        return res.status(400).json({ error: "Missing required fields: coachId, courtId, startTime, duration, sessionType" });
      }

      const VALID_SPORTS = ["tennis", "padel", "pickleball"];
      const validatedSport = sport && VALID_SPORTS.includes(sport) ? sport : "tennis";

      // Verify coach belongs to this academy
      const coach = await storage.getCoach(coachId, academyId);
      if (!coach) {
        return res.status(404).json({ error: "Coach not found in this academy" });
      }

      const start = new Date(startTime);
      const end = new Date(start.getTime() + duration * 60000);
      const dateStr = start.toISOString().split('T')[0];
      const startTimeStr = start.toISOString().split('T')[1].slice(0, 5);
      const endTimeStr = end.toISOString().split('T')[1].slice(0, 5);

      // Check unified time block conflict
      const unifiedConflict = await storage.checkUnifiedCoachConflict(coachId, dateStr, startTimeStr, endTimeStr, undefined, academyId);
      if (unifiedConflict.hasConflict && !unifiedConflict.isOwnAcademy) {
        return res.status(409).json({ 
          error: "Coach conflict", 
          level: 3,
          message: "Coach is already booked at another academy for this time slot" 
        });
      }

      const coachConflict = await storage.checkCoachConflict(coachId, start, end, undefined, academyId, courtId);
      if (coachConflict) {
        return res.status(409).json({ 
          error: "Coach conflict", 
          level: 3,
          message: "Coach is already booked for this time slot" 
        });
      }

      const courtConflict = await storage.checkCourtConflict(courtId, start, end, undefined, academyId);
      if (courtConflict) {
        return res.status(409).json({ 
          error: "Court conflict", 
          level: 3,
          message: "Court is already booked for this time slot" 
        });
      }

      // Create sessions (single or recurring)
      const sessionsToCreate = isRecurring && weekCount && weekCount > 1 ? weekCount : 1;
      const recurringGroupId = sessionsToCreate > 1 ? crypto.randomUUID() : null;
      const createdSessions = [];
      const skippedWeeks: number[] = [];

      // If recurring, create a coaching series
      let seriesId: string | null = null;
      if (sessionsToCreate > 1) {
        const dayOfWeek = start.getDay();
        const localTime = startTimeStr;

        const newSeries = await storage.createCoachingSeries({
          academyId,
          coachId,
          title: `${sessionType.charAt(0).toUpperCase() + sessionType.slice(1).replace('_', ' ')} - ${coach.name}`,
          dayOfWeek,
          startTime: localTime,
          duration,
          sessionType,
          status: "active",
          maxPlayers: maxPlayers || (sessionType === "private" ? 1 : sessionType === "semi_private" ? 2 : 6),
          xpPerSession: 100,
          seriesStartDate: dateStr,
          weekCount: sessionsToCreate,
          sport: validatedSport,
        });
        seriesId = newSeries.id;
      }

      for (let week = 0; week < sessionsToCreate; week++) {
        const weekStart = new Date(start.getTime() + week * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + duration * 60000);
        const weekDateStr = weekStart.toISOString().split('T')[0];
        const weekStartTimeStr = weekStart.toISOString().split('T')[1].slice(0, 5);
        const weekEndTimeStr = weekEnd.toISOString().split('T')[1].slice(0, 5);

        const weekUnifiedConflict = await storage.checkUnifiedCoachConflict(coachId, weekDateStr, weekStartTimeStr, weekEndTimeStr, undefined, academyId);
        const weekCoachConflict = await storage.checkCoachConflict(coachId, weekStart, weekEnd, undefined, academyId);
        const weekCourtConflict = await storage.checkCourtConflict(courtId, weekStart, weekEnd, undefined, academyId);
        
        if ((weekUnifiedConflict.hasConflict && !weekUnifiedConflict.isOwnAcademy) || weekCoachConflict || weekCourtConflict) {
          skippedWeeks.push(week + 1);
          continue;
        }

        let pricingSnapshot: { academyPrice?: string; coachPayout?: string; academyMargin?: string } = {};
        try {
          const pricing = await storage.calculateSessionPricing(academyId, coachId, sessionType, duration);
          pricingSnapshot = {
            academyPrice: String(pricing.academyPrice),
            coachPayout: String(pricing.coachPayout),
            academyMargin: String(pricing.academyMargin),
          };
        } catch (err: any) {
          return res.status(422).json({ 
            error: "Pricing error", 
            message: err.message || "Could not calculate session pricing"
          });
        }

        const session = await storage.createSession({
        duration: duration || 60,
          academyId,
          coachId,
          courtId,
          locationId,
          startTime: weekStart,
          endTime: weekEnd,
          duration,
          sessionType,
          ballLevel,
          skillLevel,
          isRecurring: sessionsToCreate > 1,
          recurringGroupId,
          weekCount: sessionsToCreate,
          weekNumber: week + 1,
          seriesId,
          travelTime: travelTime || 0,
          paymentStatus: "unpaid",
          status: "scheduled",
          maxPlayers: maxPlayers || (sessionType === "private" ? 1 : sessionType === "semi_private" ? 2 : 6),
          visibleToPlayers,
          enableWaitlist,
          isOpen,
          sport: validatedSport,
          ...pricingSnapshot,
        });

        await storage.createCoachTimeBlock({
          coachId,
          sourceType: 'session',
          sourceAcademyId: academyId,
          sourceSessionId: session.id,
          date: weekDateStr,
          startTime: weekStartTimeStr,
          endTime: weekEndTimeStr,
          isPrivate: true,
        });

        // Add players if provided (with credit deduction and notifications)
        if (playerIds && Array.isArray(playerIds)) {
          for (const playerId of playerIds) {
            const player = await storage.getPlayer(playerId, academyId);
            
            await storage.addPlayerToSession({ sessionId: session.id, playerId });
            
            // Also add to series if it exists
            if (seriesId && week === 0) {
              await storage.addPlayerToSeries({ seriesId, playerId });
            }
          }
        }

        createdSessions.push(session);
      }

      if (createdSessions.length === 0) {
        return res.status(409).json({
          error: "All sessions had conflicts",
          skippedWeeks 
        });
      }

      res.status(201).json({
        sessions: createdSessions,
        seriesId,
        skippedWeeks: skippedWeeks.length > 0 ? skippedWeeks : undefined,
        message: skippedWeeks.length > 0 
          ? `Created ${createdSessions.length} sessions, skipped weeks ${skippedWeeks.join(", ")} due to conflicts`
          : `Created ${createdSessions.length} session(s) successfully`
      });
    } catch (error) {
      console.error("Error creating admin session:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // Admin bulk create sessions (flexible schedule)
  router.post("/api/admin/sessions/bulk", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.currentAcademyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }
      
      const {
        coachId,
        courtId,
        duration,
        sessionType,
        ballLevel,
        skillLevel,
        notes,
        playerIds,
        maxPlayers,
        isOpen,
        visibleToPlayers,
        flexibleSessions,
        sport,
      } = req.body;
      
      if (!coachId || !courtId || !flexibleSessions || !Array.isArray(flexibleSessions) || flexibleSessions.length === 0) {
        return res.status(400).json({ error: "Missing required fields: coachId, courtId, and flexibleSessions are required" });
      }

      const VALID_SPORTS = ["tennis", "padel", "pickleball"];
      const validatedSport = sport && VALID_SPORTS.includes(sport) ? sport : "tennis";
      
      const createdSessions: any[] = [];
      const skippedDates: string[] = [];
      
      // Get pricing snapshot once for all sessions
      let pricingSnapshot: { academyPrice?: string; coachPayout?: string; academyMargin?: string } = {};
      try {
        const pricing = await storage.calculateSessionPricing(academyId, coachId, sessionType, duration);
        pricingSnapshot = {
          academyPrice: String(pricing.academyPrice),
          coachPayout: String(pricing.coachPayout),
          academyMargin: String(pricing.academyMargin),
        };
      } catch (err: any) {
        return res.status(422).json({ 
          error: "Pricing error", 
          message: err.message || "Could not calculate session pricing"
        });
      }
      
      // Determine series to use: find existing or create new flexible series
      let seriesId: string | null = null;
      const sortedDates = [...flexibleSessions].sort((a: any, b: any) => a.date.localeCompare(b.date));
      const firstDate = sortedDates[0]?.date;
      const lastDate = sortedDates[sortedDates.length - 1]?.date;
      
      // If players provided, try to find their existing active series with this coach
      if (playerIds && playerIds.length > 0) {
        const firstPlayerId = playerIds[0];
        const playerSeries = await storage.getPlayerSeries(firstPlayerId);
        
        console.log("[BulkSessions DEBUG] Looking for existing series:");
        console.log("[BulkSessions DEBUG] - coachId from request:", coachId);
        console.log("[BulkSessions DEBUG] - sessionType from request:", sessionType);
        console.log("[BulkSessions DEBUG] - playerIds:", playerIds);
        console.log("[BulkSessions DEBUG] - Player series found:", playerSeries.length);
        playerSeries.forEach((s: any) => {
          console.log("[BulkSessions DEBUG]   Series:", s.id, "title:", s.title, "coachId:", s.coachId, "sessionType:", s.sessionType, "status:", s.status);
          console.log("[BulkSessions DEBUG]   Match check: coachId match=", s.coachId === coachId, "sessionType match=", s.sessionType === sessionType, "status match=", s.status === "active");
        });
        
        const existingSeries = playerSeries.find((s: any) => 
          s.coachId === coachId && 
          s.sessionType === sessionType && 
          s.status === "active"
        );
        if (existingSeries) {
          seriesId = existingSeries.id;
          console.log("[BulkSessions DEBUG] FOUND existing series:", existingSeries.id, existingSeries.title);
        } else {
          console.log("[BulkSessions DEBUG] NO existing series found - will create new one");
        }
      }
      // If no existing series, create a flexible series
      if (!seriesId) {
        let seriesTitle = `Flexible ${sessionType === 'private' ? 'Private' : sessionType === 'semi_private' ? 'Semi-Private' : 'Group'}`;
        if (playerIds && playerIds.length > 0) {
          const playerNames: string[] = [];
          for (const pid of playerIds.slice(0, 2)) {
            const p = await storage.getPlayer(pid, academyId);
            if (p) playerNames.push(p.name.split(' ')[0]);
          }
          if (playerNames.length > 0) {
            seriesTitle = `${playerNames.join(' & ')}${playerIds.length > 2 ? ` +${playerIds.length - 2}` : ''} - Flexible`;
          }
        }
        
        const newSeries = await storage.createCoachingSeries({
          academyId,
          coachId,
          courtId: courtId || null,
          title: seriesTitle,
          dayOfWeek: -1,
          startTime: "00:00",
          duration,
          sessionType,
          ballLevel: ballLevel || null,
          skillLevel: skillLevel || null,
          maxPlayers: sessionType === "private" ? 1 : sessionType === "semi_private" ? 2 : maxPlayers || 6,
          weekCount: flexibleSessions.length,
          seriesStartDate: firstDate,
          seriesEndDate: lastDate,
          status: "active",
          sport: validatedSport,
        });
        seriesId = newSeries.id;
        
        if (playerIds && Array.isArray(playerIds)) {
          for (const playerId of playerIds) {
            await storage.addPlayerToSeries({
              seriesId: newSeries.id,
              playerId,
              status: "active",
            });
          }
        }
      }
      
      for (const fs of flexibleSessions) {
        const start = new Date(fs.startTime);
        const end = new Date(fs.endTime);
        const dateStr = fs.date;
        const startTimeStr = fs.time;
        const endTimeStr = end.toISOString().split('T')[1].slice(0, 5);
        
        // Check for conflicts
        const coachConflict = await storage.checkCoachConflict(coachId, start, end, undefined, academyId, courtId);
        const courtConflict = await storage.checkCourtConflict(courtId, start, end, undefined, academyId);
        
        if (coachConflict || courtConflict) {
          skippedDates.push(dateStr);
          continue;
        }
        
        // Create the session linked to series
        const session = await storage.createSession({
        duration: duration || 60,
          coachId,
          courtId,
          academyId,
          startTime: start,
          endTime: end,
          duration,
          sessionType,
          status: "scheduled",
          name: notes || null,
          ballLevel: ballLevel || null,
          skillLevel: skillLevel || null,
          maxPlayers: sessionType === "private" ? 1 : sessionType === "semi_private" ? 2 : maxPlayers || 6,
          recurringGroupId: null,
          seriesId: seriesId || undefined,
          visibleToPlayers,
          isOpen,
          sport: validatedSport,
          ...pricingSnapshot,
        });
        
        // Create unified coach time block
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
        
        // Add players with credit deduction and notifications
        if (playerIds && Array.isArray(playerIds)) {
          for (const playerId of playerIds) {
            const player = await storage.getPlayer(playerId, academyId);
            await storage.addPlayerToSession({ sessionId: session.id, playerId });
          }
        }
        
        createdSessions.push(session);
      }
      
      if (createdSessions.length === 0) {
        return res.status(409).json({ 
          error: "All sessions had conflicts", 
          skippedDates 
        });
      }
      
      // Audit log
      await storage.createAuditLog({
        entityType: "session",
        entityId: createdSessions[0].id,
        action: `admin_bulk_create_${createdSessions.length}`,
        performedBy: req.user?.id || "admin",
      });
      
      res.status(201).json({
        sessions: createdSessions,
        seriesId,
        summary: {
          requested: flexibleSessions.length,
          created: createdSessions.length,
          skippedDates,
        },
        message: skippedDates.length > 0 
          ? `Created ${createdSessions.length} sessions, skipped ${skippedDates.length} due to conflicts`
          : `Created ${createdSessions.length} sessions successfully`
      });
    } catch (error) {
      console.error("Error creating admin bulk sessions:", error);
      res.status(500).json({ error: "Failed to create sessions" });
    }
  });


  // Admin Dashboard Enhanced - World-class dashboard with all premium features
  router.get("/api/admin/dashboard/enhanced", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.currentAcademyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const academy = await storage.getAcademy(academyId);
      const settings = await storage.getAcademySettings(academyId);
      const players = await storage.getPlayersByAcademy(academyId);
      const coaches = await storage.getCoachesByAcademy(academyId);
      const allSessions = await storage.getSessionsByAcademy(academyId);

      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date();
      const DUBAI_OFFSET = 4;
      
      // Today's date in Dubai timezone
      const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const todayStart = new Date(dubaiNow);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(dubaiNow);
      todayEnd.setHours(23, 59, 59, 999);

      // Week boundaries
      const startOfWeek = new Date(dubaiNow);
      startOfWeek.setDate(dubaiNow.getDate() - dubaiNow.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      // Today's sessions
      const todaySessions = allSessions.filter((s: any) => {
        const sessionDate = new Date(s.startTime);
        return sessionDate >= todayStart && sessionDate <= todayEnd;
      });

      const completedToday = todaySessions.filter((s: any) => s.status === "completed").length;
      const inProgressToday = todaySessions.filter((s: any) => s.status === "in_progress").length;
      const upcomingToday = todaySessions.filter((s: any) => {
        const sessionStart = new Date(s.startTime);
        return s.status !== "completed" && s.status !== "in_progress" && sessionStart > now;
      }).length;

      // Week sessions for heatmap
      const weekData: { date: string; sessionCount: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setDate(startOfWeek.getDate() + i);
        const dayStart = new Date(dayDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayDate);
        dayEnd.setHours(23, 59, 59, 999);

        const daySessions = allSessions.filter((s: any) => {
          const sessionDate = new Date(s.startTime);
          return sessionDate >= dayStart && sessionDate <= dayEnd;
        });

        weekData.push({
          date: dayDate.toISOString(),
          sessionCount: daySessions.length,
        });
      }

      // Active coaches (who have sessions today or are marked active)
      const activeCoachIds = new Set(todaySessions.map((s: any) => s.coachId));
      const activeCoaches = coaches.filter((c: any) => c.isActive !== false);
      const activeCoachesNow = coaches.filter((c: any) => activeCoachIds.has(c.id)).length;

      // Coach performance data
      const coachPerformance = coaches
        .filter((c: any) => c.isActive !== false)
        .map((coach: any) => {
          const coachSessions = todaySessions.filter((s: any) => s.coachId === coach.id);
          const completedCoachSessions = coachSessions.filter((s: any) => s.status === "completed").length;
          const coachPlayers = players.filter((p: any) => p.coachId === coach.id);
          
          return {
            id: coach.id,
            name: coach.name,
            sessionsToday: coachSessions.length,
            completedSessions: completedCoachSessions,
            playersTrainedToday: coachPlayers.length,
            earningsToday: coachSessions.length * (coach.hourlyRate || 100),
            rating: coach.rating || 4.5,
            isActive: activeCoachIds.has(coach.id),
          };
        });

      // Recent activity - simulated based on sessions and events
      const recentActivity: any[] = [];
      
      // Add recent session starts/completions
      const recentCompletedSessions = todaySessions
        .filter((s: any) => s.status === "completed")
        .slice(0, 3);
      
      recentCompletedSessions.forEach((s: any) => {
        const coach = coaches.find((c: any) => c.id === s.coachId);
        recentActivity.push({
          id: `session-${s.id}`,
          type: "session_end",
          title: `${coach?.name || "Coach"} completed session`,
          subtitle: s.title || "Training Session",
          timestamp: s.endTime || s.startTime,
        });
      });

      // Add check-ins (simulated from today's sessions)
      todaySessions.slice(0, 2).forEach((s: any, idx: number) => {
        recentActivity.push({
          id: `checkin-${s.id}`,
          type: "check_in",
          title: "Player checked in",
          subtitle: s.title || "Session",
          timestamp: new Date(new Date(s.startTime).getTime() - (idx + 1) * 30 * 60000).toISOString(),
        });
      });

      // Sort by timestamp
      recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Smart insights
      const insights: any[] = [];
      
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);
      const recentSessions = allSessions.filter((s: any) => new Date(s.startTime) >= thirtyDaysAgo && s.status !== "cancelled");
      const completedSessions = recentSessions.filter((s: any) => s.status === "completed");
      const attendanceRate = recentSessions.length > 0 
        ? Math.round((completedSessions.length / recentSessions.length) * 100) 
        : 0;

      // Revenue insight
      const monthlyRevenue = players.reduce((sum: number, p: any) => sum + (p.monthlyRate || 0), 0);
      const revenueTarget = 50000; // Default target
      
      if (monthlyRevenue >= revenueTarget * 0.9) {
        insights.push({
          id: "revenue-good",
          type: "trend_up",
          title: "Revenue on Track",
          description: "You're at " + Math.round((monthlyRevenue / revenueTarget) * 100) + "% of your monthly target",
          change: Math.round((monthlyRevenue / revenueTarget) * 100) - 100,
        });
      }

      // Attendance insight
      if (attendanceRate < 75) {
        insights.push({
          id: "attendance-low",
          type: "alert",
          title: "Attendance Needs Attention",
          description: "Overall attendance is at " + attendanceRate + "%. Consider follow-ups with low-attendance players.",
        });
      } else if (attendanceRate >= 90) {
        insights.push({
          id: "attendance-great",
          type: "achievement",
          title: "Excellent Attendance",
          description: "Your academy has " + attendanceRate + "% attendance rate. Great work!",
          change: attendanceRate - 75,
        });
      }

      // Player growth insight
      const activePlayers = players.filter((p: any) => p.isActive !== false);
      if (activePlayers.length > 50) {
        insights.push({
          id: "players-milestone",
          type: "achievement",
          title: "Growing Strong",
          description: "You have " + activePlayers.length + " active players in your academy!",
        });
      }

      // Outstanding payments
      const outstandingPayments = players
        .filter((p: any) => (p.balanceDue || 0) > 0)
        .reduce((sum: number, p: any) => sum + (p.balanceDue || 0), 0);

      if (outstandingPayments > 5000) {
        insights.push({
          id: "payments-overdue",
          type: "alert",
          title: "Outstanding Payments",
          description: (settings?.currency || "AED") + " " + outstandingPayments.toLocaleString() + " in pending payments. Consider sending reminders.",
        });
      }

      // Alerts for dashboard
      const alerts: any[] = [];
      const unpaidPlayers = players.filter((p: any) => (p.balanceDue || 0) > 0);
      unpaidPlayers.slice(0, 5).forEach((p: any) => {
        alerts.push({
          id: `unpaid-${p.id}`,
          type: "error",
          category: "payment",
          title: "Payment Overdue",
          description: `${p.name} has ${settings?.currency || "AED"} ${p.balanceDue || 0} outstanding`,
        });
      });

      const currency = settings?.currency || "AED";

      res.json({
        academy: academy ? {
          id: academy.id,
          name: academy.name,
          currency,
          timezone: settings?.timezone || "Asia/Dubai",
        } : null,
        kpis: {
          activePlayers: activePlayers.length,
          activeCoaches: activeCoaches.length,
          sessionsThisWeek: weekData.reduce((sum, d) => sum + d.sessionCount, 0),
          attendanceRate,
          outstandingPayments,
          monthlyRevenue,
          revenueTarget,
          currency,
        },
        todayOperations: {
          totalSessions: todaySessions.length,
          completedSessions: completedToday,
          inProgressSessions: inProgressToday,
          upcomingSessions: upcomingToday,
          playersCheckedIn: Math.min(todaySessions.length * 2, activePlayers.length),
          activeCoachesNow,
        },
        coachPerformance,
        weekData,
        recentActivity: recentActivity.slice(0, 10),
        insights,
        alerts,
      });
    } catch (error) {
      console.error("Enhanced admin dashboard error:", error);
      res.status(500).json({ error: "Failed to fetch enhanced dashboard data" });
    }
  });
  // Admin Dashboard - Comprehensive stats and alerts for academy admins
  router.get("/api/admin/dashboard", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.currentAcademyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy context required" });
      }

      const academy = await storage.getAcademy(academyId);
      const settings = await storage.getAcademySettings(academyId);
      const players = await storage.getPlayersByAcademy(academyId);
      const coaches = await storage.getCoachesByAcademy(academyId);
      const allSessions = await storage.getSessionsByAcademy(academyId);

      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

      const sessionsThisWeek = allSessions.filter((s: any) => {
        const sessionDate = new Date(s.startTime);
        return sessionDate >= startOfWeek && sessionDate < endOfWeek;
      });

      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);

      const recentSessions = allSessions.filter((s: any) => {
        const sessionDate = new Date(s.startTime);
        return sessionDate >= thirtyDaysAgo && sessionDate <= now && s.status !== "cancelled";
      });

      const completedSessions = recentSessions.filter((s: any) => s.status === "completed");
      const attendanceRate = recentSessions.length > 0 
        ? Math.round((completedSessions.length / recentSessions.length) * 100) 
        : 0;

      const activePlayers = players.filter((p: any) => p.isActive !== false);
      const activeCoaches = coaches.filter((c: any) => c.isActive !== false);

      const currency = settings?.currency || "AED";
      
      const monthlyRevenue = players.reduce((sum: number, p: any) => {
        return sum + (p.monthlyRate || 0);
      }, 0);

      const outstandingPayments = players.filter((p: any) => {
        return (p.balanceDue || 0) > 0;
      }).reduce((sum: number, p: any) => sum + (p.balanceDue || 0), 0);

      const alerts: any[] = [];

      const unpaidPlayers = players.filter((p: any) => (p.balanceDue || 0) > 0);
      unpaidPlayers.slice(0, 5).forEach((p: any) => {
        alerts.push({
          id: `unpaid-${p.id}`,
          type: "error",
          category: "payment",
          title: "Payment Overdue",
          description: `${p.name} has ${currency} ${p.balanceDue || 0} outstanding`,
          playerId: p.id,
          playerName: p.name,
          amount: p.balanceDue || 0,
        });
      });

      const lowAttendancePlayers = players.filter((p: any) => {
        const attendancePercent = p.attendanceRate || 100;
        return attendancePercent < 70;
      });
      lowAttendancePlayers.slice(0, 3).forEach((p: any) => {
        alerts.push({
          id: `attendance-${p.id}`,
          type: "warning",
          category: "attendance",
          title: "Low Attendance",
          description: `${p.name} attendance at ${p.attendanceRate || 0}%`,
          playerId: p.id,
          playerName: p.name,
        });
      });

      const inactiveCoaches = coaches.filter((c: any) => {
        const lastActive = c.lastActiveAt ? new Date(c.lastActiveAt) : null;
        if (!lastActive) return false;
        const daysSinceActive = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceActive > 7;
      });
      inactiveCoaches.slice(0, 3).forEach((c: any) => {
        alerts.push({
          id: `inactive-coach-${c.id}`,
          type: "warning",
          category: "coach",
          title: "Coach Inactive",
          description: `${c.name} hasn't logged activity recently`,
          coachId: c.id,
          coachName: c.name,
        });
      });

      const upcomingSessions = sessionsThisWeek
        .filter((s: any) => new Date(s.startTime) >= now)
        .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, 10)
        .map((s: any) => ({
          id: s.id,
          title: s.title || "Session",
          startTime: s.startTime,
          endTime: s.endTime,
          coachId: s.coachId,
          coachName: coaches.find((c: any) => c.id === s.coachId)?.name || "Unassigned",
          status: s.status,
        }));

      res.json({
        academy: academy ? {
          id: academy.id,
          name: academy.name,
          currency,
          timezone: settings?.timezone || "Asia/Dubai",
        } : null,
        kpis: {
          activePlayers: activePlayers.length,
          activeCoaches: activeCoaches.length,
          sessionsThisWeek: sessionsThisWeek.length,
          attendanceRate,
          outstandingPayments,
          monthlyRevenue,
          currency,
        },
        alerts: alerts.sort((a, b) => {
          const priority = { error: 0, warning: 1, info: 2 };
          return (priority[a.type as keyof typeof priority] || 2) - (priority[b.type as keyof typeof priority] || 2);
        }),
        upcomingSessions,
        quickStats: {
          totalPlayers: players.length,
          totalCoaches: coaches.length,
          completedSessionsThisMonth: completedSessions.length,
          unpaidPlayerCount: unpaidPlayers.length,
        },
      });
    } catch (error) {
      console.error("Admin dashboard error:", error);
      res.status(500).json({ error: "Failed to fetch admin dashboard data" });
    }
  });

  // Admin - Get detailed coach stats with finance
  router.get("/api/admin/coaches/:coachId/stats", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      const academyId = req.user?.currentAcademyId;
      
      const coach = await storage.getCoach(coachId);
      if (!coach || (academyId && coach.academyId !== academyId)) {
        return res.status(404).json({ error: "Coach not found" });
      }

      const sessions = await storage.getAllSessionsByCoach(coachId);
      const players = await storage.getPlayersByCoach(coachId);
      
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);
      
      const sessionsThisMonth = sessions.filter((s: any) => {
        const sessionDate = new Date(s.startTime);
        return sessionDate >= thirtyDaysAgo;
      });

      const completedSessions = sessionsThisMonth.filter((s: any) => s.status === "completed");

      const feedbackCount = await storage.getFeedbackCountByCoach(coachId, thirtyDaysAgo, now);
      const feedbackCompletionRate = completedSessions.length > 0 
        ? Math.round((feedbackCount / completedSessions.length) * 100) 
        : 0;

      const hourlyRate = coach.hourlyRate || 100;
      const totalHours = sessionsThisMonth.reduce((sum: number, s: any) => {
        const start = new Date(s.startTime);
        const end = new Date(s.endTime);
        return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      }, 0);

      const monthlyHours = await storage.getCoachMonthlyHoursSummary(coachId, academyId);
      const payoutRecords = await storage.getCoachPayouts(coachId, 12);
      
      const monthlyPaymentHistory = monthlyHours.map(mh => {
        const payoutRecord = payoutRecords.find(
          (p: any) => p.month === mh.month && p.year === mh.year
        );
        const rate = Number(payoutRecord?.hourlyRate || hourlyRate);
        const grossAmount = payoutRecord 
          ? Number(payoutRecord.grossAmount) 
          : Math.round(mh.hoursWorked * rate);
        
        return {
          month: mh.month,
          year: mh.year,
          hoursWorked: mh.hoursWorked,
          sessionsCount: mh.sessionsCount,
          hourlyRate: rate,
          grossAmount,
          status: payoutRecord?.status || "pending",
          paidAt: payoutRecord?.paidAt || null,
          paymentMethod: payoutRecord?.paymentMethod || null,
          paymentReference: payoutRecord?.paymentReference || null,
          declineReason: payoutRecord?.declineReason || null,
          payoutId: payoutRecord?.id || null,
        };
      });

      res.json({
        coach: {
          id: coach.id,
          name: coach.name,
          email: coach.email,
          phone: coach.phone,
          specialty: coach.specialty,
          bio: coach.bio,
          yearsExperience: coach.yearsExperience,
          role: coach.role || "coach",
        },
        performance: {
          sessionsThisMonth: sessionsThisMonth.length,
          completedSessions: completedSessions.length,
          activePlayers: players.length,
          feedbackCompletionRate,
          attendanceAccuracy: 95,
        },
        finance: {
          hourlyRate,
          totalHours: Math.round(totalHours * 10) / 10,
          amountOwed: Math.round(totalHours * hourlyRate),
          amountPaid: coach.amountPaid || 0,
          monthlyHistory: monthlyPaymentHistory,
        },
      });
    } catch (error) {
      console.error("Coach stats error:", error);
      res.status(500).json({ error: "Failed to fetch coach stats" });
    }
  });

  // Admin - Mark coach payout as paid
  router.post("/api/admin/coaches/:coachId/payouts/:month/:year/pay", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { coachId, month, year } = req.params;
      const payoutPaySchema = z.object({
        paymentMethod: z.string().min(1).max(64).optional(),
        paymentReference: z.string().max(256).optional(),
        notes: z.string().max(1024).optional(),
      });
      const parsedPayout = payoutPaySchema.safeParse(req.body);
      if (!parsedPayout.success) return res.status(400).json({ error: fromZodError(parsedPayout.error).message });
      const { paymentMethod, paymentReference, notes } = parsedPayout.data;
      const academyId = req.user?.currentAcademyId;
      const adminId = req.user?.coachId || req.user?.id;

      const coach = await storage.getCoach(coachId);
      if (!coach || (academyId && coach.academyId !== academyId)) {
        return res.status(404).json({ error: "Coach not found" });
      }

      let payout = await storage.getCoachPayoutByMonthYear(coachId, parseInt(month), parseInt(year));
      
      if (!payout) {
        const monthlyHours = await storage.getCoachMonthlyHoursSummary(coachId, academyId);
        const monthData = monthlyHours.find(m => m.month === parseInt(month) && m.year === parseInt(year));
        const hoursWorked = monthData?.hoursWorked || 0;
        const hourlyRate = Number(coach.hourlyRate || 100);
        
        payout = await storage.createCoachPayout({
          academyId: academyId!,
          coachId,
          month: parseInt(month),
          year: parseInt(year),
          hoursWorked: String(hoursWorked),
          hourlyRate: String(hourlyRate),
          grossAmount: String(Math.round(hoursWorked * hourlyRate)),
          status: "pending",
          notes,
        });
      }

      const updatedPayout = await storage.markCoachPayoutPaid(
        payout.id, 
        adminId!, 
        paymentMethod || "bank_transfer",
        paymentReference
      );

      res.json({ success: true, payout: updatedPayout });
    } catch (error) {
      console.error("Mark payout paid error:", error);
      res.status(500).json({ error: "Failed to mark payout as paid" });
    }
  });

  // Admin - Decline coach payout
  router.post("/api/admin/coaches/:coachId/payouts/:month/:year/decline", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { coachId, month, year } = req.params;
      const { reason, notes } = req.body;
      const academyId = req.user?.currentAcademyId;

      const coach = await storage.getCoach(coachId);
      if (!coach || (academyId && coach.academyId !== academyId)) {
        return res.status(404).json({ error: "Coach not found" });
      }

      let payout = await storage.getCoachPayoutByMonthYear(coachId, parseInt(month), parseInt(year));
      
      if (!payout) {
        const monthlyHours = await storage.getCoachMonthlyHoursSummary(coachId, academyId);
        const monthData = monthlyHours.find(m => m.month === parseInt(month) && m.year === parseInt(year));
        const hoursWorked = monthData?.hoursWorked || 0;
        const hourlyRate = Number(coach.hourlyRate || 100);
        
        payout = await storage.createCoachPayout({
          academyId: academyId!,
          coachId,
          month: parseInt(month),
          year: parseInt(year),
          hoursWorked: String(hoursWorked),
          hourlyRate: String(hourlyRate),
          grossAmount: String(Math.round(hoursWorked * hourlyRate)),
          status: "pending",
          notes,
        });
      }

      const updatedPayout = await storage.declineCoachPayout(payout.id, reason || "No reason provided");

      res.json({ success: true, payout: updatedPayout });
    } catch (error) {
      console.error("Decline payout error:", error);
      res.status(500).json({ error: "Failed to decline payout" });
    }
  });

  // Admin - Get revenue report by month
  router.get("/api/admin/revenue", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user?.currentAcademyId;
      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();

      const revenue = await storage.getAdminRevenueByMonth(academyId, year, month);

      const players = await storage.getPlayersByAcademy(academyId);
      const activePlayers = players.filter(p => p.status === 'active').length;
      const playerLifetimeValue = activePlayers > 0 
        ? Math.round((revenue.totalRevenue * 12) / activePlayers) 
        : 0;

      res.json({
        month,
        year,
        monthName: new Date(year, month - 1).toLocaleString('default', { month: 'long' }),
        ...revenue,
        activePlayers,
        playerLifetimeValue,
      });
    } catch (error) {
      console.error("Admin revenue error:", error);
      res.status(500).json({ error: "Failed to fetch revenue data" });
    }
  });

  // Get next invoice number for creating invoices
  router.get("/api/admin/next-invoice-number", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const invoiceNumber = await storage.generateInvoiceNumber(academyId);
      res.json({ invoiceNumber });
    } catch (error) {
      console.error("Error generating invoice number:", error);
      res.status(500).json({ error: "Failed to generate invoice number" });
    }
  });

  // Get academy details with bank information for invoices
  router.get("/api/admin/academy", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }
      res.json({
        id: academy.id,
        name: academy.name,
        address: academy.address,
        email: academy.email,
        phone: academy.phone,
        logo: academy.logo,
        bankName: academy.bankName,
        bankAccountNumber: academy.bankAccountNumber,
        bankIban: academy.bankIban,
        bankAccountHolder: academy.bankAccountHolder,
        bankSwiftCode: academy.bankSwiftCode,
      });
    } catch (error) {
      console.error("Error fetching academy:", error);
      res.status(500).json({ error: "Failed to fetch academy" });
    }
  });

  // Admin - Get detailed player stats with payments (also accessible by coaches for their assigned players)
  router.get("/api/admin/players/:playerId/stats", authMiddleware, requireRole("admin", "academy_owner", "platform_owner", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user?.currentAcademyId;
      const userRole = req.user?.role;
      
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Platform owners can view any player; others must match academy
      const isPlatformOwner = userRole === "platform_owner";
      if (!isPlatformOwner && academyId && player.academyId && player.academyId !== academyId) {
        return res.status(404).json({ error: "Player not found" });
      }

      const coach = player.coachId ? await storage.getCoach(player.coachId) : null;
      const xpData = await storage.getPlayerXpTotal(playerId);
      const milestones = await storage.getPlayerMilestones(playerId);

      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);

      const farPast = new Date(2020, 0, 1);
      const farFuture = new Date(2030, 11, 31);
      const sessions = await storage.getPlayerSessionsWithDetails(playerId, farPast, farFuture);
      const recentSessions = sessions.filter((s: any) => {
        const sessionDate = new Date(s.startTime);
        return sessionDate >= thirtyDaysAgo && s.status !== "cancelled" && s.attendanceStatus !== "cancelled";
      });

      const attendedSessionsAll = sessions.filter((s: any) => 
        (s.attendanceStatus === "present" || s.status === "completed") && new Date(s.startTime) <= dubaiNow
      );
      const attendedSessions = recentSessions.filter((s: any) => 
        s.attendanceStatus === "present" || s.status === "completed"
      );
      const attendanceRate = recentSessions.length > 0 
        ? Math.round((attendedSessions.length / recentSessions.length) * 100)
        : 100;

      const currentLevel = xpData.level || player.level || 1;
      const xpProgress = xpData.totalXp || 0;
      const xpToNext = xpData.xpToNextLevel || 500;
      

      // Get active packages — single source of truth for credit summary
      const playerPackages = await storage.getPlayerPackages(playerId, player.academyId ?? undefined);

      // Compute credit summary FROM the packages list so it is always consistent with the card display
      const _normalizeType = (type: string | undefined | null): "group" | "semi_private" | "private" => {
        if (!type) return "group";
        const n = type.toLowerCase().replace(/-/g, "_").replace(/ /g, "_");
        if (n === "semi" || n === "semi_private" || n === "semi_private_adjusted") return "semi_private";
        if (n === "private" || n === "private_adjusted") return "private";
        return "group";
      };
      const activePlayerPackages = playerPackages.filter((p: any) => p.status === "active");
      const computedCredits = { group: 0, semi_private: 0, private: 0 };
      for (const pkg of activePlayerPackages) {
        const t = _normalizeType(pkg.creditType);
        computedCredits[t] += Number(pkg.remainingCredits);
      }
      const totalCredits = computedCredits.group + computedCredits.semi_private + computedCredits.private;

      // Fetch debt separately (does not affect the credit summary above)
      const creditBalance = await storage.getPlayerCreditBalanceByType(playerId);

      // Calculate payments from packages
      const unpaidPackages = playerPackages.filter((p: any) => !p.isPaid);
      const paidPackages = playerPackages.filter((p: any) => p.isPaid);
      
      const pkgTotalOwed = unpaidPackages.reduce((sum: number, pkg: any) => {
        const pkgPrice = Number(pkg.price) || (Number(pkg.pricePerCredit || 0) * (pkg.totalCredits || 0));
        return sum + pkgPrice;
      }, 0);
      
      const totalPaid = paidPackages.reduce((sum: number, pkg: any) => {
        const pkgPrice = Number(pkg.price) || (Number(pkg.pricePerCredit || 0) * (pkg.totalCredits || 0));
        return sum + pkgPrice;
      }, 0);

      // Get player invoices
      const playerAcademyId = player.academyId || "";
      const allInvoices = playerAcademyId ? await storage.getInvoices(playerAcademyId) : [];
      const playerInvoices = allInvoices.filter((inv: any) => inv.playerId === playerId);
      const pendingInvoices = playerInvoices.filter((inv: any) => inv.status === "pending" || inv.status === "sent");
      const invoiceTotalOwed = pendingInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.amount) || 0), 0);

      const totalOwed = pkgTotalOwed + invoiceTotalOwed;
      
      let paymentStatus: "paid" | "partial" | "overdue" = "paid";
      if (totalOwed > 0) {
        const hasOverdueInvoice = pendingInvoices.some((inv: any) => inv.dueDate && new Date(inv.dueDate) < new Date());
        if (hasOverdueInvoice) {
          paymentStatus = "overdue";
        } else {
          paymentStatus = totalPaid > 0 ? "partial" : "overdue";
        }
      }

      res.json({
        player: {
          id: player.id,
          name: player.name,
          email: player.email,
          phone: player.phone,
          ballLevel: player.ballLevel,
          level: currentLevel,
          totalXp: xpProgress,
          glowScore: player.glowScore || 0,
          coachName: coach?.name || "Unassigned",
          parentName: player.parentName,
          parentPhone: player.parentPhone,
          parentEmail: player.parentEmail,
          medicalNotes: player.medicalNotes,
          dateOfBirth: player.dateOfBirth,
        },
        attendance: {
          totalSessions: sessions.length,
          attended: attendedSessionsAll.length,
          missed: recentSessions.length - attendedSessions.length,
          rate: attendanceRate,
          streak: player.currentStreak || 0,
        },
        progress: {
          level: currentLevel,
          xp: xpProgress,
          xpToNextLevel: xpToNext,
          skills: {
            technical: player.technicalScore || 50,
            tactical: player.tacticalScore || 50,
            physical: player.physicalScore || 50,
            mental: player.mentalScore || 50,
            social: player.socialScore || 50,
          },
          recentMilestones: milestones.slice(0, 5).map((m: any) => m.title || m.type),
        },
        payments: {
          totalOwed,
          totalPaid,
          lastPaymentDate: player.lastPaymentDate,
          status: paymentStatus,
          currency: "AED",
          invoices: playerInvoices.map((inv: any) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            amount: Number(inv.amount) || 0,
            currency: inv.currency || "AED",
            status: inv.status,
            dueDate: inv.dueDate,
            paidAt: inv.paidAt,
            createdAt: inv.createdAt,
            notes: inv.notes,
            isOverdue: inv.status === "pending" && inv.dueDate && new Date(inv.dueDate) < new Date(),
          })),
        },
        credits: {
          total: totalCredits,
          group: computedCredits.group,
          semiPrivate: computedCredits.semi_private,
          private: computedCredits.private,
          activePackages: activePlayerPackages.length,
          totalDebt: creditBalance.totalDebt,
          hasDebt: creditBalance.hasDebt,
        },
        packages: playerPackages.map((pkg: any) => ({
          // Each package shows its OWN remaining credits
          id: pkg.id,
          creditType: pkg.creditType || "group",
          totalCredits: pkg.totalCredits,
          remainingCredits: pkg.remainingCredits, // Package's own remaining
          status: pkg.status,
          expiryDate: pkg.expiryDate,
          createdAt: pkg.createdAt,
          pricePerCredit: pkg.pricePerCredit || 0,
          isPaid: pkg.isPaid || false,
          price: pkg.price || 0,
        })),
        sessions: await Promise.all(sessions.slice(0, 50).map(async (s: any) => {
          // Calculate effective session type based on attendance
          let effectiveType = s.sessionType;
          if (s.sessionType === 'semi_private' || s.sessionType === 'group') {
            try {
              const allAttendees = await storage.getSessionPlayers(s.id);
              const presentCount = allAttendees.filter((a: any) => a.attendanceStatus === 'present').length;
              if (presentCount === 1) {
                effectiveType = 'private';
              } else if (presentCount === 2 && s.sessionType === 'group') {
                effectiveType = 'semi_private';
              }
            } catch (e) {
              // Fall back to original type
            }
          }
          // Look up series name if session has a seriesId
          let seriesName = null;
          if (s.seriesId) {
            try {
              const series = await storage.getCoachingSeries(s.seriesId);
              seriesName = series?.name || null;
            } catch (e) {
              // Fall back to null
            }
          }
          
          return {
            id: s.id,
            sessionId: s.sessionId,
            startTime: s.startTime,
            endTime: s.endTime,
            sessionType: effectiveType,
            attended: s.attendanceStatus || s.attended,
            attendanceStatus: s.attendanceStatus || null,
            status: s.status || null,
            courtId: s.courtId || null,
            creditsUsed: s.creditsUsed || 0,
            isPaid: (s.creditsUsed || 0) > 0,
            seriesId: s.seriesId || null,
            seriesName: seriesName,
          };
        })),
      });
    } catch (error) {
      console.error("Player stats error:", error);
      res.status(500).json({ error: "Failed to fetch player stats" });
    }
  });

  // Admin - Fix unpaid sessions for a player (record debt for sessions with attended=true but no credit deducted)
  router.post("/api/admin/players/:playerId/fix-unpaid-sessions", authMiddleware, requireRole("admin", "academy_owner", "platform_owner", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user?.currentAcademyId;
      
      const player = await storage.getPlayer(playerId, academyId ?? undefined);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Find all sessions where player has attended but no credit was deducted
      const unpaidSessions = await db.select({
        sessionPlayerId: sessionPlayers.id,
        sessionId: sessionPlayers.sessionId,
        playerId: sessionPlayers.playerId,
        
        attendanceStatus: sessionPlayers.attendanceStatus,
        creditDeductedAt: sessionPlayers.creditDeductedAt,
        sessionType: sessions.sessionType,
        startTime: sessions.startTime,
      })
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(and(
        eq(sessionPlayers.playerId, playerId),
        or(
          
          eq(sessionPlayers.attendanceStatus, "present")
        ),
        isNull(sessionPlayers.creditDeductedAt)
      ));
      
      if (unpaidSessions.length === 0) {
        return res.json({ 
          message: "No unpaid sessions found", 
          fixed: 0,
          totalSessions: 0 
        });
      }
      
      let fixedCount = 0;
      
      for (const session of unpaidSessions) {
        // Record debt transaction
        const debtId = `debt-fix-${session.sessionId}-${session.playerId}`;
        
        // Check if debt already recorded
        const existingDebt = await db.select().from(creditTransactions)
          .where(eq(creditTransactions.id, debtId))
          .limit(1);
        
        if (existingDebt.length === 0) {
          const creditType = session.sessionType.includes("semi") ? "semi_private" : 
                             session.sessionType.includes("group") ? "group" : "private";
          
          await db.insert(creditTransactions).values({
            id: debtId,
            playerId: session.playerId,
            packageId: null,
            type: "debit",
            amount: -1,
            reason: "session_debt",
            creditType: creditType,
            sessionId: session.sessionId,
            metadata: { 
              isDebt: true, 
              fixedManually: true,
              sessionType: session.sessionType,
              originalDate: session.startTime
            },
          });
          
          // Mark creditDeductedAt to prevent re-processing
          await db.update(sessionPlayers)
            .set({ creditDeductedAt: new Date() })
            .where(eq(sessionPlayers.id, session.sessionPlayerId));
          
          fixedCount++;
        }
      }
      
      res.json({
        message: `Fixed ${fixedCount} unpaid sessions`,
        fixed: fixedCount,
        totalSessions: unpaidSessions.length,
      });
      
    } catch (error) {
      console.error("Fix unpaid sessions error:", error);
    }
  });

  // View player credit transactions (for debugging/auditing)
  router.get("/api/admin/players/:playerId/credit-transactions", authMiddleware, requireRole("admin", "academy_owner", "platform_owner", "coach"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user?.currentAcademyId;
      
      const player = await storage.getPlayer(playerId, academyId ?? undefined);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const transactions = await storage.getCreditTransactionsByPlayer(playerId);
      const creditBalance = await storage.getPlayerCreditBalanceByType(playerId);
      const playerPackages = await storage.getPlayerPackages(playerId, player.academyId ?? undefined);
      
      const summary = {
        group: { credits: 0, debts: 0, balance: creditBalance.group },
        semi_private: { credits: 0, debts: 0, balance: creditBalance.semi_private },
        private: { credits: 0, debts: 0, balance: creditBalance.private },
      };
      
      for (const tx of transactions) {
        const type = tx.creditType as keyof typeof summary || "group";
        if (type in summary) {
          if (tx.amount > 0) {
            summary[type].credits += tx.amount;
          } else {
            summary[type].debts += Math.abs(tx.amount);
          }
        }
      }
      
      res.json({
        player: { id: player.id, name: player.name, email: player.email },
        creditBalance,
        summary,
        packages: playerPackages.map(p => ({ 
          id: p.id, 
          name: p.name, 
          creditType: p.creditType, 
          totalCredits: p.totalCredits, 
          remainingCredits: p.remainingCredits,
          isPaid: p.isPaid,
          isDeleted: p.status === 'deleted'
        })),
        transactions: transactions.slice(0, 100),
        totalTransactions: transactions.length,
      });
    } catch (error) {
      console.error("Get credit transactions error:", error);
      res.status(500).json({ error: "Failed to get credit transactions" });
    }
  });

  // Manually add debt for a player (for fixing credit mismatches)
  router.post("/api/admin/players/:playerId/add-debt", authMiddleware, requireRole("admin", "academy_owner", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user?.currentAcademyId;
      const addDebtSchema = z.object({
        amount: z.number().positive(),
        creditType: z.enum(["group", "semi_private", "private"]),
        reason: z.string().max(512).optional(),
      });
      const parsedDebt = addDebtSchema.safeParse(req.body);
      if (!parsedDebt.success) return res.status(400).json({ error: fromZodError(parsedDebt.error).message });
      const { amount, creditType, reason } = parsedDebt.data;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Amount must be a positive number" });
      }
      if (!creditType || !["group", "semi_private", "private"].includes(creditType)) {
        return res.status(400).json({ error: "Credit type must be group, semi_private, or private" });
      }
      
      const player = await storage.getPlayer(playerId, academyId ?? undefined);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const debtId = `manual-debt-${Date.now()}-${playerId}`;
      
      await db.insert(creditTransactions).values({
        id: debtId,
        playerId: playerId,
        packageId: null,
        type: "debit",
        amount: -amount,
        reason: reason || "manual_debt_correction",
        creditType: creditType,
        sessionId: null,
        metadata: { 
          isDebt: true, 
          addedManually: true,
          addedBy: req.user?.id,
          addedAt: new Date().toISOString(),
        },
      });
      
      const newBalance = await storage.getPlayerCreditBalanceByType(playerId);
      
      console.log(`[ManualDebt] Added ${amount} ${creditType} debt for player ${playerId} by ${req.user?.id}`);
      
      res.json({
        success: true,
        message: `Added ${amount} ${creditType} debt for ${player.name}`,
        newBalance,
        debtId,
      });
    } catch (error) {
      console.error("Add debt error:", error);
      res.status(500).json({ error: "Failed to add debt" });
    }
  });

  // Audit all players for credit mismatches
  router.get("/api/admin/audit-credits", authMiddleware, requireRole("admin", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log("[CreditAudit] Starting full credit audit...");
      
      const allPlayers = await db.select({
        id: players.id,
        name: players.name,
        email: players.email,
      }).from(players);
      
      const mismatches = [];
      
      for (const player of allPlayers) {
        const attendedSessions = await db.select({
          sessionType: sessions.sessionType,
        })
        .from(sessionPlayers)
        .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
        .where(and(
          eq(sessionPlayers.playerId, player.id),
          eq(sessionPlayers.attendanceStatus, "present")
        ));
        
        const sessionsByType = { group: 0, semi_private: 0, private: 0 };
        for (const s of attendedSessions) {
          if (s.sessionType.includes("semi")) sessionsByType.semi_private++;
          else if (s.sessionType.includes("group")) sessionsByType.group++;
          else sessionsByType.private++;
        }
        
        const transactions = await storage.getCreditTransactionsByPlayer(player.id);
        const creditBalance = await storage.getPlayerCreditBalanceByType(player.id);
        
        const txByType = { group: { credits: 0, debts: 0 }, semi_private: { credits: 0, debts: 0 }, private: { credits: 0, debts: 0 } };
        
        for (const tx of transactions) {
          const type = tx.creditType || "group";
          if (type in txByType) {
            if (tx.amount > 0) txByType[type].credits += tx.amount;
            else txByType[type].debts += Math.abs(tx.amount);
          }
        }
        
        const totalSessions = attendedSessions.length;
        const totalCreditsFromPackages = txByType.group.credits + txByType.semi_private.credits + txByType.private.credits;
        const netBalance = creditBalance.group + creditBalance.semi_private + creditBalance.private;
        
        if (totalSessions > 0 && totalCreditsFromPackages === 0 && netBalance >= 0) {
          mismatches.push({
            playerId: player.id,
            playerName: player.name || "Unknown",
            email: player.email || "",
            sessionsAttended: totalSessions,
            netBalance,
            expectedDebt: -totalSessions,
            mismatch: totalSessions + netBalance,
            byType: {
              group: { sessions: sessionsByType.group, balance: creditBalance.group, ...txByType.group },
              semi_private: { sessions: sessionsByType.semi_private, balance: creditBalance.semi_private, ...txByType.semi_private },
              private: { sessions: sessionsByType.private, balance: creditBalance.private, ...txByType.private },
            }
          });
        }
      }
      
      console.log(`[CreditAudit] Found ${mismatches.length} players with potential credit mismatches`);
      
      res.json({
        totalPlayers: allPlayers.length,
        mismatchCount: mismatches.length,
        mismatches: mismatches.sort((a, b) => b.mismatch - a.mismatch),
      });
    } catch (error) {
      console.error("Credit audit error:", error);
      res.status(500).json({ error: "Failed to audit credits" });
    }
  });

  // Platform Owner - Enhanced Dashboard
  router.get("/api/platform/dashboard/enhanced", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const allAcademies = await db.select().from(academies);
      const allPlayers = await db.select({
        id: players.id,
        academyId: players.academyId,
        createdAt: players.createdAt,
      }).from(players);
      const allCoaches = await db.select({
        id: coaches.id,
        academyId: coaches.academyId,
      }).from(coaches);
      const allUsers = await db.select({
        id: users.id,
        createdAt: users.createdAt,
      }).from(users);

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const newSignups = allUsers.filter(u => u.createdAt && new Date(u.createdAt) > thirtyDaysAgo).length;

      const academyList = allAcademies.map(a => {
        const academyPlayers = allPlayers.filter(p => p.academyId === a.id).length;
        const academyCoaches = allCoaches.filter(c => c.academyId === a.id).length;
        return {
          id: a.id,
          name: a.name,
          players: academyPlayers,
          coaches: academyCoaches,
          mrr: 0,
          healthScore: Math.min(100, academyPlayers * 5 + academyCoaches * 10),
          status: "healthy" as const,
        };
      });

      res.json({
        platform: {
          name: "Glow Up Sports",
          currency: "AED",
        },
        metrics: {
          activeAcademies: allAcademies.length,
          totalCoaches: allCoaches.length,
          totalPlayers: allPlayers.length,
          mrr: 0,
          newSignups,
          churnRate: 0,
          trialAcademies: 0,
          pausedAcademies: 0,
        },
        subscriptions: {
          activeCount: allAcademies.length,
          trialCount: 0,
          pausedCount: 0,
          churnedThisMonth: 0,
          conversionRate: allAcademies.length > 0 ? 75 : 0,
        },
        academies: academyList,
        weekActivity: [
          { day: "M", intensity: 3 },
          { day: "T", intensity: 4 },
          { day: "W", intensity: 5 },
          { day: "T", intensity: 4 },
          { day: "F", intensity: 6 },
          { day: "S", intensity: 3 },
          { day: "S", intensity: 2 },
        ],
        insights: [],
        alerts: [],
      });
    } catch (error) {
      console.error("Platform dashboard error:", error);
      res.status(500).json({ error: "Failed to load platform dashboard" });
    }
  });

  // Platform Owner - Get single academy details
  router.get("/api/platform/academies/:id", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.params.id;
      const academy = await storage.getAcademy(academyId);
      
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      const coaches = await storage.getCoachesByAcademy(academyId);
      const players = await storage.getPlayersByAcademy(academyId);
      const settings = await storage.getAcademySettings(academyId);

      res.json({
        id: academy.id,
        name: academy.name,
        currency: settings?.currency || "AED",
        timezone: settings?.timezone || "Asia/Dubai",
        createdAt: academy.createdAt,
        coaches: coaches.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email || "",
        })),
        players: players.map(p => ({
          id: p.id,
          name: p.name,
          ballLevel: p.ballLevel || "red",
        })),
      });
    } catch (error) {
      console.error("Get academy detail error:", error);
      res.status(500).json({ error: "Failed to fetch academy details" });
    }
  });

  // Platform Owner - Update academy
  router.patch("/api/platform/academies/:id", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.params.id;
      const { name, currency, timezone } = req.body;

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      // Update academy name if provided
      if (name) {
        await storage.updateAcademy(academyId, { name });
      }

      // Update settings (currency, timezone) if provided
      if (currency || timezone) {
        await storage.upsertAcademySettings(academyId, {
          academyId,
          currency: currency || undefined,
          timezone: timezone || undefined,
        });
      }

      const updatedAcademy = await storage.getAcademy(academyId);
      res.json({ success: true, academy: updatedAcademy });
    } catch (error) {
      console.error("Update academy error:", error);
      res.status(500).json({ error: "Failed to update academy" });
    }
  });

  // Platform Owner - Delete academy
  router.delete("/api/platform/academies/:id", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.params.id;

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      // Delete the academy (this should cascade to related data)
      await storage.deleteAcademy(academyId);

      res.json({ success: true, message: "Academy deleted successfully" });
    } catch (error) {
      console.error("Delete academy error:", error);
      res.status(500).json({ error: "Failed to delete academy" });
    }
  });

  // Platform Owner - Create invite for specific academy
  router.post("/api/platform/academies/:id/invites", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.params.id;
      const { role = "academy_owner", email, expiresInDays = 7 } = req.body;
      const invitedBy = req.user!.userId;

      const validRoles = ["academy_owner", "coach"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be 'academy_owner' or 'coach'" });
      }

      const validExpiry = Math.min(Math.max(1, expiresInDays), 30);

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const shortCode = generateShortInviteCode();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + validExpiry);

      const invite = await storage.createInvite({
        token,
        shortCode,
        role,
        academyId,
        invitedEmail: email?.toLowerCase() || null,
        invitedBy,
        expiresAt,
      });

      res.status(201).json({
        invite: {
          id: invite.id,
          token: invite.token,
          shortCode: invite.shortCode,
          role: invite.role,
          invitedEmail: invite.invitedEmail,
          expiresAt: invite.expiresAt,
          createdAt: invite.createdAt,
        },
        inviteUrl: `/join/${invite.token}`,
      });
    } catch (error) {
      console.error("Create academy invite error:", error);
      res.status(500).json({ error: "Failed to create invite" });
    }
  });

  // Platform Owner - Get invites for specific academy
  router.get("/api/platform/academies/:id/invites", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.params.id;

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      const invitesList = await storage.getInvitesByAcademy(academyId);
      res.json({ invites: invitesList });
    } catch (error) {
      console.error("Get academy invites error:", error);
      res.status(500).json({ error: "Failed to get invites" });
    }
  });

  // Platform Owner - List all users available to add to academies
  router.get("/api/platform/users", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      
      // Return users with basic info for selection
      const userList = allUsers.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        academyId: user.academyId,
        coachId: user.coachId,
        playerId: user.playerId,
        createdAt: user.createdAt,
      }));
      
      res.json({ users: userList });
    } catch (error) {
      console.error("Get all users error:", error);
      res.status(500).json({ error: "Failed to get users" });
    }
  });

  // Platform Owner - Add existing user to academy as coach/owner
  router.post("/api/platform/academies/:id/members", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.params.id;
      const { userId, role } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      if (!role || !["academy_owner", "coach", "assistant"].includes(role)) {
        return res.status(400).json({ error: "Valid role (academy_owner, coach, assistant) is required" });
      }

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if user already has a coach profile, if not create one
      let coachId = user.coachId;
      if (!coachId) {
        // Create a coach profile for the user
        const newCoach = await storage.createCoach({
          name: user.username,
          email: user.email,
          academyId: academyId,
          status: "active",
        });
        coachId = newCoach.id;
        
        // Update user with coach reference
        await storage.updateUser(userId, { 
          coachId: coachId,
          role: role,
          academyId: academyId,
        });
      }

      // Check if membership already exists
      const existingMembership = await storage.getCoachAcademyMembership(coachId, academyId);
      if (existingMembership) {
        // Update existing membership
        await storage.updateCoachAcademyMembership(existingMembership.id, {
          role,
          isActive: true,
        });
      } else {
        // Create new membership
        await storage.createCoachAcademyMembership({
          coachId,
          academyId,
          role,
          isActive: true,
          isPrimary: !user.academyId, // Make primary if user has no academy
        });
      }

      // Update user's default academy if not set
      if (!user.academyId) {
        await storage.updateUser(userId, { academyId });
      }

      res.status(201).json({ 
        success: true,
        message: `User added to academy as ${role}`,
        membership: { userId, coachId, academyId, role }
      });
    } catch (error) {
      console.error("Add member to academy error:", error);
      res.status(500).json({ error: "Failed to add member to academy" });
    }
  });

  // Platform Owner - Create new user account for academy
  router.post("/api/platform/academies/:id/users", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.params.id;
      const { username, email, password, role, name } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      if (!role || !["academy_owner", "coach", "assistant", "player"].includes(role)) {
        return res.status(400).json({ error: "Valid role is required" });
      }

      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username.toLowerCase());
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Hash password
      const bcrypt = await import("bcrypt");
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create the user
      const newUser = await storage.createUser({
        username: username.toLowerCase(),
        email: email || `${username.toLowerCase()}@glow.local`,
        password: hashedPassword,
        role: role,
        status: "active",
        academyId: academyId,
      });

      // If role is coach/owner/assistant, create a coach profile and membership
      if (["academy_owner", "coach", "assistant"].includes(role)) {
        const newCoach = await storage.createCoach({
          name: name || username,
          email: newUser.email,
          academyId: academyId,
          status: "active",
        });

        // Update user with coach reference
        await storage.updateUser(newUser.id, { coachId: newCoach.id });

        // Create academy membership
        await storage.createCoachAcademyMembership({
          coachId: newCoach.id,
          academyId,
          role,
          isActive: true,
          isPrimary: true,
        });
      }

      // If role is player, create a player profile
      if (role === "player") {
        const newPlayer = await storage.createPlayer({
          name: name || username,
          academyId: academyId,
          status: "active",
          ballLevel: ballLevel || "green",
        });

        await storage.updateUser(newUser.id, { playerId: newPlayer.id });
      }

      res.status(201).json({
        success: true,
        message: `New ${role} account created`,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
        }
      });
    } catch (error) {
      console.error("Create user for academy error:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // Platform Owner - Impersonate academy owner
  router.post("/api/platform/impersonate/:academyId", authMiddleware, requireRole("platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { academyId } = req.params;

      // Verify academy exists
      const academy = await storage.getAcademy(academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      // Find the academy owner user
      const ownerUsers = await db.select().from(users).where(and(eq(users.role, "academy_owner"), eq(users.academyId, academyId))).limit(1);
      
      let targetCoachId: string | null = null;
      let targetPlayerId: string | null = null;

      if (ownerUsers.length > 0) {
        // If academy owner user exists, use their coach and player IDs
        const ownerUser = ownerUsers[0];
        targetCoachId = ownerUser.coachId;
        targetPlayerId = ownerUser.playerId;
      } else {
        // If no academy owner user, get first coach and player from academy
        const coaches = await storage.getCoachesByAcademy(academyId);
        const players = await storage.getPlayersByAcademy(academyId);
        
        targetCoachId = coaches.length > 0 ? coaches[0].id : null;
        targetPlayerId = players.length > 0 ? players[0].id : null;
      }

      // Generate impersonation token
      const impersonationToken = generateToken({
        userId: req.user!.userId,
        email: req.user!.email || "platform@glowupsports.com",
        role: "academy_owner",
        academyId: academyId,
        coachId: targetCoachId,
        playerId: targetPlayerId,
      });

      // Log the impersonation for audit
      console.log(`[Impersonation] Platform owner ${req.user!.userId} impersonating academy ${academyId} (${academy.name})`);

      res.json({
        success: true,
        token: impersonationToken,
        academy: { id: academy.id, name: academy.name },
        coachId: targetCoachId,
        playerId: targetPlayerId,
      });
    } catch (error) {
      console.error("Impersonate academy error:", error);
      res.status(500).json({ error: "Failed to create impersonation token" });
    }
  });
  
  // Get player dashboard data
  router.get("/api/player/me/dashboard", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Return empty data for users without player profile
      if (!req.user!.playerId) {
        // Check if this is a player role needing onboarding
        const isPlayerNeedingOnboarding = req.user!.role === "player";
        return res.json({
          isOnboarding: isPlayerNeedingOnboarding,
          player: isPlayerNeedingOnboarding ? { onboardingCompleted: false } : null,
          coach: null,
          academy: null,
          nextSession: null,
          lastFeedback: null,
          recentXpGains: [],
        });
      }
      const playerId = req.user!.playerId!;
      
      // Get player data
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
      
      // Get next upcoming OR currently active session using player-specific query
      // Look back 3 hours to catch sessions that are currently in progress
      const threeHoursAgo = new Date();
      threeHoursAgo.setHours(threeHoursAgo.getHours() - 3);
      const future = new Date();
      future.setDate(future.getDate() + 30);
      
      let nextSession = null;
      const dateParam = req.query.date as string | undefined;
      // All session startTime/endTime values are stored as UTC in the database.
      // new Date() returns UTC epoch milliseconds, so comparisons are timezone-consistent.
      const now = dateParam ? new Date(dateParam) : new Date();
      const upcomingSessions = await storage.getPlayerSessionsWithDetails(playerId, threeHoursAgo, future);
      
      // Find the most relevant session: either currently active, or next upcoming
      // Sort by: 1) currently active sessions first, 2) then by start time
      // Both s.startTime and s.endTime are UTC Date objects from PostgreSQL; now is also UTC.
      const sortedSessions = upcomingSessions
        .map(s => ({
          ...s,
          isActive: s.startTime <= now && s.endTime > now,
          isUpcoming: s.startTime > now,
        }))
        .sort((a, b) => {
          // Active sessions first
          if (a.isActive && !b.isActive) return -1;
          if (!a.isActive && b.isActive) return 1;
          // Then by start time (earliest first)
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });
      
      if (sortedSessions.length > 0) {
        // Get first active session, or first upcoming if none active
        const session = sortedSessions.find(s => s.isActive) || sortedSessions.find(s => s.isUpcoming) || sortedSessions[0];
        const court = session.courtId ? await storage.getCourt(session.courtId) : null;
        const sessionCoach = session.coachId ? await storage.getCoach(session.coachId) : null;
        const durationMinutes = session.startTime && session.endTime
          ? Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / (1000 * 60))
          : null;
        const sessionPlayerRecord = await storage.getSessionPlayer(session.id, playerId);
        const playerCheckedIn = sessionPlayerRecord
          ? (!!(sessionPlayerRecord as any).checkedInAt || sessionPlayerRecord.attendanceStatus === "present" || sessionPlayerRecord.attendanceStatus === "late")
          : false;
        nextSession = {
          id: session.id,
          date: session.startTime,
          endTime: session.endTime,
          type: session.sessionType,
          courtName: court?.name,
          coachName: sessionCoach?.name || null,
          isLive: session.isActive,
          duration: durationMinutes,
          playerCheckedIn,
        };
      }
      
      // Get last feedback from coach notes
      let lastFeedback = null;
      const feedbackList = await storage.getPlayerFeedbackNotes(playerId, 1);
      if (feedbackList.length > 0) {
        lastFeedback = {
          message: feedbackList[0].content,
          date: feedbackList[0].createdAt,
        };
      }
      
      // Calculate streak (sessions attended in the past 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const pastSessions = await storage.getPlayerSessionsWithDetails(playerId, thirtyDaysAgo, now);
      const attendedSessions = pastSessions.filter(s => s.attendanceStatus === "present");
      const streak = attendedSessions.length;
      
      // Get player credits by type
      const playerPackages = await storage.getPlayerPackages(playerId, player.academyId ?? undefined);

      // Calculate payments from packages
      const unpaidPackages = playerPackages.filter((p: any) => !p.isPaid);
      const paidPackages = playerPackages.filter((p: any) => p.isPaid);
      
      const totalOwed = unpaidPackages.reduce((sum: number, pkg: any) => {
        const pkgPrice = Number(pkg.price) || (Number(pkg.pricePerCredit || 0) * (pkg.totalCredits || 0));
        return sum + pkgPrice;
      }, 0);
      
      const totalPaid = paidPackages.reduce((sum: number, pkg: any) => {
        const pkgPrice = Number(pkg.price) || (Number(pkg.pricePerCredit || 0) * (pkg.totalCredits || 0));
        return sum + pkgPrice;
      }, 0);
      
      let paymentStatus: "paid" | "partial" | "overdue" = "paid";
      if (totalOwed > 0) {
        paymentStatus = totalPaid > 0 ? "partial" : "overdue";
      }
      const creditsByType = { group: 0, private: 0, semi_private: 0 };
      let totalCredits = 0;
      for (const pkg of playerPackages) {
        const type = (pkg.creditType || "group") as "group" | "private" | "semi_private";
        creditsByType[type] += pkg.remainingCredits;
        totalCredits += pkg.remainingCredits;
      }
      
      // Get XP and level data
      const xpData = await storage.getPlayerXpTotal(playerId);
      const totalXp = xpData.totalXp || player.totalXp || 0;
      const level = xpData.level || player.level || 1;
      const glowScore = Math.min(100, Math.round((totalXp / (level * 500)) * 100));
      
      const onboardingCompleted = player.onboardingCompleted ?? false;
      const needsOnboarding = !onboardingCompleted;
      
      // Get most recent active / recently-declined booking request for home card
      let pendingRequest = null;
      try {
        const reqs = await storage.getBookingRequests({ playerId });
        // Priority: counter-proposed awaiting reply → plain pending → recently declined (< 24h)
        const active =
          reqs.find(r =>
            r.status === "awaiting_player_reply" ||
            (r.status === "pending" && r.counterProposedStart && r.counterProposalStatus === "pending")
          ) ||
          reqs.find(r => r.status === "pending") ||
          reqs.find(r => {
            if (r.status !== "declined") return false;
            const t = r.respondedAt ? new Date(r.respondedAt).getTime() : 0;
            return t > 0 && Date.now() - t < 24 * 60 * 60 * 1000;
          });
        if (active) {
          const reqCoach = active.coachId ? await storage.getCoach(active.coachId) : null;
          pendingRequest = {
            id: active.id,
            status: active.status as "pending" | "awaiting_player_reply" | "declined",
            sessionType: active.sessionType,
            requestedStart: active.requestedStart,
            requestedEnd: active.requestedEnd,
            coachName: reqCoach?.name || null,
            expiresAt: active.expiresAt || null,
            counterProposedStart: active.counterProposedStart || null,
            counterProposedEnd: active.counterProposedEnd || null,
            responseNote: active.responseNote || null,
            declineReason: active.declineReason || null,
          };
        }
      } catch (pendingReqErr) {
        console.error("[Dashboard] Failed to load pending booking request (non-fatal):", pendingReqErr);
      }

      res.json({
        isOnboarding: needsOnboarding,
        isFreePlayer: !player.academyId,
        pendingRequest,
        player: {
          id: player.id,
          name: player.name,
          level,
          xp: totalXp,
          glowScore,
          ballLevel: player.ballLevel,
          streak,
          onboardingCompleted,
          academyId: player.academyId,
          dateOfBirth: player.dateOfBirth,
          profilePhotoUrl: (player as any).profilePhotoUrl || null,
          playStyle: (player as any).playStyle || null,
        },
        coach: coach ? {
          id: coach.id,
          name: coach.name,
          photoUrl: coach.photoUrl || null,
          yearsExperience: coach.yearsExperience,
          philosophyTags: coach.philosophyTags || [],
          publicQuote: coach.bioStatus === "approved" ? coach.publicQuote : null,
          bioApproved: coach.bioStatus === "approved",
        } : null,
        academy: academy ? {
          id: academy.id,
          name: academy.name,
        } : null,
        nextSession,
        lastFeedback: lastFeedback ? {
          ...lastFeedback,
          coachName: coach?.name || "Coach",
        } : null,
        recentXpGains: [],
        credits: {
          total: totalCredits,
          group: creditsByType.group,
          private: creditsByType.private,
          semi_private: creditsByType.semi_private,
        },
      });
    } catch (error) {
      console.error("Error fetching player dashboard:", error);
      res.status(500).json({ error: "Failed to fetch player dashboard" });
    }
  });

  // Get available group sessions for player to browse and join
  router.get("/api/player/available-group-sessions", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(400).json({ error: "Player ID required" });
      }
      
      const player = await storage.getPlayer(playerId);
      if (!player || !player.academyId) {
        return res.json({ sessions: [] });
      }
      
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const academySessions = await storage.getSessionsByAcademy(player.academyId);
      
      // Filter for upcoming group sessions
      const groupSessions = academySessions.filter(s => {
        if (new Date(s.startTime) <= now) return false;
        if (s.sessionType !== "group") return false;
        return true;
      });
      
      // Get details for each session
      const sessionsWithDetails = await Promise.all(groupSessions.map(async (session) => {
        const coach = session.coachId ? await storage.getCoach(session.coachId) : null;
        const court = session.courtId ? await storage.getCourt(session.courtId) : null;
        let locationName = null;
        if (court && (court).locationId) {
          const location = await storage.getLocation((court).locationId);
          locationName = location?.name || null;
        }
        const startTime = new Date(session.startTime);
        const endTime = new Date(session.endTime);
        
        // Check if player is already enrolled
        const sessionPlayers = await storage.getSessionPlayers(session.id);
        const currentPlayers = sessionPlayers.length;
        const maxPlayers = (session as any).maxPlayers || 8;
        const spotsLeft = Math.max(0, maxPlayers - currentPlayers);
        const isEnrolled = sessionPlayers.some(sp => sp.playerId === playerId);
        // Get participant details
        const participants = await Promise.all(sessionPlayers.slice(0, 10).map(async (sp) => {
          const p = await storage.getPlayer(sp.playerId);
          return p ? {
            id: p.id,
            name: p.name || "Player",
            profilePhotoUrl: (p as any).profilePhotoUrl || null,
            level: p.level || 1,
            ballLevel: p.ballLevel || null,
          } : null;
        }));
        const validParticipants = participants.filter(Boolean);

        return {
          id: session.id,
          type: session.sessionType || "group",
          date: startTime.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
          time: `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`,
          endTime: `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`,
          spotsLeft,
          maxPlayers,
          currentPlayers,
          coachName: coach?.name || null,
          coachId: session.coachId,
          courtName: court?.name || null,
          ballLevel: ((session as any).targetBallLevel || (session as any).ballLevel || "").toUpperCase() || null,
          isEnrolled,
          locationName,
          participants: validParticipants,
        };
      }));
      
      // Sort by date/time
      sessionsWithDetails.sort((a, b) => {
        const dateA = new Date(`${a.date} ${a.time}`);
        const dateB = new Date(`${b.date} ${b.time}`);
        return dateA.getTime() - dateB.getTime();
      });
      
      res.json({ sessions: sessionsWithDetails });
    } catch (error) {
      console.error("Error fetching available group sessions:", error);
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // Enroll player in a group session
  router.post("/api/player/sessions/:sessionId/enroll", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      const { sessionId } = req.params;
      
      if (!playerId) {
        return res.status(400).json({ error: "Player ID required" });
      }
      
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Check if session is in the future
      if (new Date(session.startTime) <= new Date()) {
        return res.status(400).json({ error: "Cannot enroll in past sessions" });
      }
      
      // Check if already enrolled
      const sessionPlayers = await storage.getSessionPlayers(sessionId);
      if (sessionPlayers.some(sp => sp.playerId === playerId)) {
        return res.status(400).json({ error: "Already enrolled in this session" });
      }
      
      // Check if session is full
      const maxPlayers = session.maxPlayers || 6;
      if (sessionPlayers.length >= maxPlayers) {
        return res.status(400).json({ error: "Session is full" });
      }
      
      // Check if player has group credits
      const credits = await storage.getPlayerCreditBalanceByType(playerId);
      if (credits.group <= 0) {
        return res.status(400).json({ error: "No group credits available. Please purchase a package." });
      }
      
      // Add player to session
      await storage.addPlayerToSession({ sessionId, playerId });
      
      // Deduct 1 group credit
      await storage.deductPlayerCredit(playerId, "group", 1, session.academyId || undefined);
      
      res.json({ success: true, message: "Successfully enrolled in session" });
    } catch (error) {
      console.error("Error enrolling in session:", error);
      res.status(500).json({ error: "Failed to enroll in session" });
    }
  });

  // Get player social and availability data for the new 5-zone Player Home
  // Get player's friends list (only from playerConnections with status=accepted)
  router.get("/api/player/me/friends", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user!.playerId) {
        return res.json({ friends: [], pendingRequests: [] });
      }
      const playerId = req.user!.playerId!;

      const { playerConnections: pc } = await import("@shared/schema");

      // Accepted connections where player is requester (player1) or receiver (player2)
      const acceptedConnections = await db
        .select()
        .from(pc)
        .where(
          and(
            eq(pc.status, "accepted"),
            or(
              eq(pc.player1Id, playerId),
              eq(pc.player2Id, playerId)
            )
          )
        );

      // Pending requests received (player is player2)
      const pendingReceived = await db
        .select()
        .from(pc)
        .where(
          and(
            eq(pc.status, "pending"),
            eq(pc.player2Id, playerId)
          )
        );

      const friendPlayerIds = acceptedConnections.map((c) =>
        c.player1Id === playerId ? c.player2Id : c.player1Id
      );
      const pendingPlayerIds = pendingReceived.map((c) => c.player1Id);

      const fetchPlayerInfo = async (pid: string) => {
        const p = await storage.getPlayer(pid);
        if (!p) return null;
        return {
          id: p.id,
          name: p.name || p.displayName || 'Player',
          photoUrl: p.profilePhotoUrl || null,
          ballLevel: p.ballLevel || null,
          skillLevel: p.level || null,
          openToPlay: false,
        };
      };

      const friends = (await Promise.all(friendPlayerIds.map(fetchPlayerInfo))).filter(Boolean);
      const pendingRequests = (await Promise.all(pendingPlayerIds.map(fetchPlayerInfo))).filter(Boolean);

      res.json({ friends, pendingRequests });
    } catch (error) {
      console.error("Error fetching player friends:", error);
      res.status(500).json({ error: "Failed to fetch friends" });
    }
  });

  // Generate invite link for the current player
  router.get("/api/player/me/invite-link", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(400).json({ error: "Player context required" });
      }
      const baseUrl = process.env.EXPO_PUBLIC_DOMAIN
        ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
        : "https://glowuptennis.app";
      const link = `${baseUrl}/join?ref=${playerId}`;
      res.json({ link, playerId });
    } catch (error) {
      console.error("Error generating invite link:", error);
      res.status(500).json({ error: "Failed to generate invite link" });
    }
  });

  // Squad preview for onboarding - shows players at same level
  router.get("/api/player/squad-preview", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { academyId, ballLevel, limit = "8" } = req.query as { academyId?: string; ballLevel?: string; limit?: string };
      
      if (!academyId || !ballLevel) {
        return res.json({ friends: [], pendingRequests: [] });
      }

      // Find players at the same ball level in this academy
      const similarPlayers = await db
        .select({
          id: players.id,
          displayName: players.displayName,
          profilePhotoUrl: players.profilePhotoUrl,
          currentLevel: players.currentLevel,
        })
        .from(players)
        .where(
          and(
            eq(players.academyId, academyId),
            eq(players.status, "active"),
            eq(players.currentLevel, ballLevel),
            req.user?.playerId ? ne(players.id, req.user.playerId) : sql`1=1`
          )
        )
        .limit(parseInt(limit))
        .orderBy(sql`RANDOM()`);

      res.json(similarPlayers);
    } catch (error) {
      console.error("Squad preview error:", error);
      res.json([]);
    }
  });

  router.get("/api/player/me/social", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user!.playerId) {
        return res.json({
          nearbyPlayers: [],
          openSessions: [],
          communityEvents: [],
          skillTrends: [],
          availability: { groupSessions: 0, privateLessons: 0, courtsAvailable: 0 },
        });
      }
      const playerId = req.user!.playerId!;
      const player = await storage.getPlayer(playerId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Haversine distance calculation (returns km)
      function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }

      const currentPlayerBallLevel = (player.ballLevel || "glow").toLowerCase();
      const myLat = player.lastLatitude;
      const myLon = player.lastLongitude;
      const nearbyPlayers: Array<{id: string; name: string; level: string; status: string; playedTogether: number; profilePhotoUrl?: string; playerLevel?: number; ballLevel?: string; skillLevel?: number; distanceKm?: number}> = [];
      if (player.academyId) {
        const academyPlayers = await storage.getPlayersByAcademy(player.academyId);

        // Bulk-fetch which players have activated their account (lastLoginAt IS NOT NULL)
        const allPlayerIds = academyPlayers.map(p => p.id);
        const activatedUsers = allPlayerIds.length > 0
          ? await db
              .select({ playerId: users.playerId })
              .from(users)
              .where(and(
                inArray(users.playerId, allPlayerIds),
                isNotNull(users.lastLoginAt)
              ))
          : [];
        const activatedPlayerIds = new Set(activatedUsers.map(u => u.playerId).filter(Boolean) as string[]);

        const sameLevelPlayers = academyPlayers.filter(p => {
          if (p.id === playerId) return false;
          // Only show players who have actually signed in and are using the app
          if (!activatedPlayerIds.has(p.id)) return false;
          const pBallLevel = (p.ballLevel || "").toLowerCase();
          if (pBallLevel !== currentPlayerBallLevel) return false;
          const privacyLevel = (p as any).privacyLevel || "platform";
          if (privacyLevel === "hidden") return false;
          return true;
        });

        const playersWithDistance = sameLevelPlayers.map(p => {
          const pLat = p.lastLatitude;
          const pLon = p.lastLongitude;
          let distanceKm: number | undefined;
          if (myLat != null && myLon != null && pLat != null && pLon != null) {
            distanceKm = Math.round(haversineKm(myLat, myLon, pLat, pLon) * 10) / 10;
          }
          return { player: p, distanceKm };
        });

        playersWithDistance.sort((a, b) => {
          if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
          if (a.distanceKm != null) return -1;
          if (b.distanceKm != null) return 1;
          return 0;
        });

        for (const { player: p, distanceKm } of playersWithDistance.slice(0, 20)) {
          nearbyPlayers.push({
            id: p.id,
            name: p.name || "Player",
            level: p.ballLevel || "green",
            status: "available",
            playedTogether: Math.floor(Math.random() * 5),
            profilePhotoUrl: (p as any).profilePhotoUrl || null,
            playerLevel: p.level || 1,
            ballLevel: p.ballLevel || undefined,
            skillLevel: p.skillLevel || undefined,
            distanceKm,
          });
        }
      }

      // Get open sessions for the player's academy - LEVEL-FILTERED
      // Players only see sessions matching their ball level (RED sees RED, ORANGE sees ORANGE, etc.)
      const playerBallLevel = (player.ballLevel || "green").toLowerCase();
      
      // Optional filters from query params
      const sportFilterParam = (req.query.sport as string | undefined)?.toLowerCase();
      const typeFilterParam = (req.query.type as string | undefined)?.toLowerCase();
      const offsetParam = Math.max(0, parseInt((req.query.offset as string) || "0", 10) || 0);
      const limitParam = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || "20", 10) || 20));
      
      const openSessions: Array<{
        id: string; 
        type: string; 
        time: string; 
        spotsLeft: number; 
        maxPlayers: number;
        coachName?: string;
        ballLevel: string;
        participants: Array<{id: string; name: string; profilePhotoUrl?: string; level: number}>;
        price?: number;
        sport?: string;
        locationName?: string;
        distanceKm?: number;
      }> = [];
      // Track total filtered session count for correct open-match pagination (set inside sessions block below)
      let totalSessionCount = 0;
      
      if (player.academyId) {
        const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
        
        const academySessions = await storage.getSessionsByAcademy(player.academyId);
        
        // Build a map of seriesId -> ballLevel + price for proper level filtering
        const seriesLevelMap = new Map<string, string>();
        const seriesPriceMap = new Map<string, number>();
        const seriesSportMap = new Map<string, string>();
        const seriesIds = [...new Set(academySessions.map(s => (s as any).seriesId).filter(Boolean))];
        for (const sid of seriesIds) {
          try {
            const series = await storage.getCoachingSeriesById(sid);
            if (series?.ballLevel) {
              seriesLevelMap.set(sid, series.ballLevel.toLowerCase());
            }
            if ((series as any)?.sessionPrice) {
              seriesPriceMap.set(sid, Number((series as any).sessionPrice));
            }
            if ((series as any)?.sport) {
              seriesSportMap.set(sid, ((series as any).sport as string).toLowerCase());
            }
          } catch (e) {}
        }

        const levelFilteredSessions = academySessions.filter(s => {
          if (new Date(s.startTime) <= now) return false;
          
          const sessionBallLevel = ((s as any).ballLevel || "").toLowerCase();
          const seriesLevel = (s as any).seriesId ? seriesLevelMap.get((s as any).seriesId) || "" : "";
          const effectiveLevel = sessionBallLevel || seriesLevel;
          
          if (!effectiveLevel) return false;
          if (effectiveLevel !== playerBallLevel) return false;
          
          // Apply type filter
          if (typeFilterParam && typeFilterParam !== "all") {
            const sessionType = (s.sessionType || "group").toLowerCase();
            if (sessionType !== typeFilterParam) return false;
          }
          
          // Apply sport filter — exclude sessions with no sport when filter is active
          if (sportFilterParam && sportFilterParam !== "all") {
            const rawSessionSport: string = ((s as any).sport as string | undefined) ?? "";
            const rawSeriesSport: string = ((s as any).seriesId ? (seriesSportMap.get((s as any).seriesId) ?? "") : "");
            const effectiveSport = (rawSessionSport || rawSeriesSport).toLowerCase();
            if (!effectiveSport || effectiveSport !== sportFilterParam) return false;
          }
          
          return true;
        });
        
        // Sort by start time, then apply pagination
        // Save total count BEFORE slicing so open-match pagination can be computed correctly
        const sortedSessions = levelFilteredSessions.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        totalSessionCount = sortedSessions.length;
        const upcomingSessions = sortedSessions.slice(offsetParam, offsetParam + limitParam);
        
        for (const session of upcomingSessions) {
          const coach = session.coachId ? await storage.getCoach(session.coachId) : null;
          const time = new Date(session.startTime);
          const maxPlayers = session.maxPlayers || 6;
          const currentPlayers = session.currentPlayers || 0;
          
          // Get participants from session_players table (not from session object)
          let participants: Array<{id: string; name: string; profilePhotoUrl?: string; level: number}> = [];
          let isEnrolled = false;
          
          // Check session_players first, then series_players for recurring sessions
          const sessionPlayerRecords = await storage.getSessionPlayers(session.id);
          let playerIds = sessionPlayerRecords.map(sp => sp.playerId);
          
          // If no session_players and session has seriesId, check series_players
          if (playerIds.length === 0 && (session as any).seriesId) {
            const seriesPlayers = await storage.getSeriesPlayers((session as any).seriesId);
            playerIds = seriesPlayers.map(sp => sp.playerId);
          }
          
          // Check if current player is enrolled
          isEnrolled = playerIds.includes(playerId);
          
          // Get participant details
          for (const pid of playerIds.slice(0, 6)) {
            const p = await storage.getPlayer(pid);
            if (p) {
              participants.push({
                id: p.id,
                name: p.name || "Player",
                profilePhotoUrl: (p as any).profilePhotoUrl || null,
                level: p.level || 1,
              });
            }
          }
          
          // Recalculate spots based on actual enrolled players
          const actualCurrentPlayers = playerIds.length;
          
          // Format time in Dubai timezone (UTC+4)
          const dubaiTimeFormatter = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Dubai",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          const dubaiTimeStr = dubaiTimeFormatter.format(time);
          
          
          // Get location name and coordinates for distance calculation
          let locationName = "Academy Courts";
          let locationLat: number | undefined;
          let locationLng: number | undefined;
          if ((session as any).locationId) {
            const location = await storage.getLocationById((session as any).locationId);
            if (location) {
              locationName = location.name;
              locationLat = (location as any).lat ?? undefined;
              locationLng = (location as any).lng ?? undefined;
            }
          } else if ((session as any).courtId) {
            const court = await storage.getCourtById((session as any).courtId);
            if (court) locationName = court.name;
          }

          // Compute distance from player to session location (if coordinates available)
          let sessionDistanceKm: number | undefined;
          if (myLat != null && myLon != null && locationLat != null && locationLng != null) {
            sessionDistanceKm = Math.round(haversineKm(myLat, myLon, locationLat, locationLng) * 10) / 10;
          }

          const effectiveBallLevel = ((session as any).ballLevel || ((session as any).seriesId ? seriesLevelMap.get((session as any).seriesId) : "") || "").toLowerCase();
          const rawSessionPrice: number | undefined = (session as any).price != null ? Number((session as any).price) : undefined;
          const rawSeriesPrice: number | undefined = (session as any).seriesId ? seriesPriceMap.get((session as any).seriesId) : undefined;
          const sessionPrice: number | undefined = rawSessionPrice ?? rawSeriesPrice;
          const rawSessionSportVal: string | undefined = (session as any).sport as string | undefined;
          const rawSeriesSportVal: string | undefined = (session as any).seriesId ? seriesSportMap.get((session as any).seriesId) : undefined;
          const sessionSport: string | undefined = rawSessionSportVal ?? rawSeriesSportVal;
          openSessions.push({
            id: session.id,
            type: session.sessionType || "group",
            time: dubaiTimeStr,
            date: session.startTime.toISOString(),
            spotsLeft: Math.max(0, maxPlayers - actualCurrentPlayers),
            maxPlayers,
            coachName: coach?.name,
            ballLevel: effectiveBallLevel || null,
            participants,
            isEnrolled,
            locationName,
            locationLat: locationLat ?? null,
            locationLng: locationLng ?? null,
            price: sessionPrice,
            sport: sessionSport,
            distanceKm: sessionDistanceKm,
          });
        }
      }

      // Add open matches from match_requests table
      // Skip if type filter excludes open_match, or if a specific sport filter is active
      // (open_match records do not carry a sport field, so they cannot be sport-filtered)
      const includeOpenMatches = (!typeFilterParam || typeFilterParam === "all" || typeFilterParam === "open_match")
        && (!sportFilterParam || sportFilterParam === "all");
      if (player.academyId && includeOpenMatches) {
        // Open-match pagination: use the total filtered session count (before slicing)
        // so that offset skips through sessions correctly even when few are returned.
        const matchOffset = Math.max(0, offsetParam - totalSessionCount);
        const matchLimit = Math.max(0, limitParam - openSessions.length);

        const openMatchRequests = matchLimit > 0 ? await db
          .select({
            id: matchRequests.id,
            playerId: matchRequests.playerId,
            matchType: matchRequests.matchType,
            title: matchRequests.title,
            preferredDate: matchRequests.preferredDate,
            preferredTime: matchRequests.preferredTime,
            requiredLevelMin: matchRequests.requiredLevelMin,
            requiredLevelMax: matchRequests.requiredLevelMax,
            maxPlayers: matchRequests.maxPlayers,
            status: matchRequests.status,
            createdAt: matchRequests.createdAt,
            playerName: players.name,
            hostBallLevel: players.ballLevel,
            playerAvatar: players.profilePhotoUrl,
          })
          .from(matchRequests)
          .leftJoin(players, eq(matchRequests.playerId, players.id))
          .where(and(
            eq(matchRequests.status, "open"),
            eq(players.ballLevel, player.ballLevel),
            or(
              eq(matchRequests.academyId, player.academyId),
              isNull(matchRequests.academyId)
            )
          ))
          .offset(matchOffset)
          .limit(matchLimit) : [];

        for (const match of openMatchRequests) {
          const timeStr = match.preferredTime || "TBD";
          const dateStr = match.preferredDate || new Date().toISOString().split("T")[0];
          
          openSessions.push({
            id: match.id,
            type: "open_match",
            time: timeStr,
            date: dateStr,
            spotsLeft: (match.maxPlayers || 4) - 1,
            maxPlayers: match.maxPlayers || 4,
            matchType: match.matchType || "singles",
            title: match.title || (match.matchType === "doubles" ? "Looking for doubles partner" : "Looking for singles match"),
            requiredLevelMin: match.requiredLevelMin || 1,
            requiredLevelMax: match.requiredLevelMax || 9,
            participants: [{
              id: match.playerId,
              name: match.playerName || "Player",
              profilePhotoUrl: match.playerAvatar || null,
              level: 1,
            }],
            isEnrolled: match.playerId === playerId,
            ballLevel: (match.hostBallLevel || "green").toUpperCase(),
            locationName: "TBD",
          });
        }
      }

      // Get community events (recent posts/announcements)
      const communityEvents: Array<{id: string; type: string; title: string; time: string}> = [];
      if (player.academyId) {
        // Get recent community posts
        const recentPosts = await db.select().from(postsTable)
          .where(eq(postsTable.academyId, player.academyId))
          .orderBy(desc(postsTable.createdAt))
          .limit(3);
        
        for (const post of recentPosts) {
          const created = new Date(post.createdAt);
          const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
          const diffHours = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60));
          const timeStr = diffHours < 24 ? `${diffHours}h ago` : `${Math.floor(diffHours / 24)}d ago`;
          
          const content = post.content || "";
          communityEvents.push({
            id: post.id,
            type: "new_group",
            title: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
            time: timeStr,
          });
        }
      }

      // Get skill trends based on recent feedback
      const skillTrends: Array<{skill: string; trend: string; label: string}> = [
        { skill: "Forehand", trend: "stable", label: "consistent" },
        { skill: "Backhand", trend: "stable", label: "developing" },
        { skill: "Footwork", trend: "up", label: "improving" },
      ];

      // Get session availability counts
      let groupSessions = 0;
      let privateLessons = 0;
      let courtsAvailable = 0;
      
      if (player.academyId) {
        const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
        
        const allSessions = await storage.getSessionsByAcademy(player.academyId);
        const upcomingAll = allSessions.filter(s => new Date(s.startTime) > now);
        groupSessions = upcomingAll.filter(s => s.sessionType === "group").length;
        privateLessons = upcomingAll.filter(s => s.sessionType === "private").length;
        
        const courts = await storage.getAllCourts(player.academyId);
        courtsAvailable = courts.length;
      }

      res.json({
        nearbyPlayers,
        openSessions,
        communityEvents,
        skillTrends,
        availability: {
          groupSessions,
          privateLessons,
          courtsAvailable,
        },
      });
    } catch (error) {
      console.error("Error fetching player social data:", error);
      res.status(500).json({ error: "Failed to fetch player social data" });
    }
  });

  // Update player social/privacy settings
  router.patch("/api/player/me/social", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user!.playerId) {
        return res.status(400).json({ error: "No player profile found" });
      }
      
      const playerId = req.user!.playerId!;
      const { privacyLevel, openToPlay, displayName, bio } = req.body;
      
      // Update privacy level if provided
      if (privacyLevel !== undefined) {
        const validLevels = ["everyone", "platform", "academy", "hidden"];
        if (!validLevels.includes(privacyLevel)) {
          return res.status(400).json({ error: "Invalid privacy level" });
        }
        await db.execute(sql`UPDATE players SET privacy_level = ${privacyLevel} WHERE id = ${playerId}`);
      }
      
      // Update open to play status if provided
      if (typeof openToPlay === "boolean") {
        await db.execute(sql`UPDATE players SET open_to_play = ${openToPlay} WHERE id = ${playerId}`);
      }
      
      // Update display name if provided
      if (displayName !== undefined) {
        await db.execute(sql`UPDATE players SET display_name = ${displayName} WHERE id = ${playerId}`);
      }
      
      // Update bio if provided
      if (bio !== undefined) {
        await db.execute(sql`UPDATE players SET bio = ${bio} WHERE id = ${playerId}`);
      }
      
      res.json({ success: true, message: "Social settings updated" });
    } catch (error) {
      console.error("Error updating player social settings:", error);
      res.status(500).json({ error: "Failed to update social settings" });
    }
  });

  router.patch("/api/player/me/location", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user!.playerId) {
        return res.status(400).json({ error: "No player profile found" });
      }
      const playerId = req.user!.playerId!;
      const { latitude, longitude } = req.body;
      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return res.status(400).json({ error: "latitude and longitude are required as numbers" });
      }
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }
      await db.execute(sql`UPDATE players SET last_latitude = ${latitude}, last_longitude = ${longitude}, location_updated_at = NOW() WHERE id = ${playerId}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating player location:", error);
      res.status(500).json({ error: "Failed to update location" });
    }
  });

  // News RSS aggregator - cached per sport for 15 minutes
  const newsCaches: Record<string, { articles: any[]; fetchedAt: number } | null> = {
    tennis: null,
    padel: null,
    pickleball: null,
  };
  const NEWS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  const SPORT_FEEDS: Record<string, Array<{ url: string; source: string }>> = {
    tennis: [
      { url: "https://www.atptour.com/en/media/rss-feed/xml-feed", source: "ATP Tour" },
      { url: "https://feeds.bbci.co.uk/sport/tennis/rss.xml", source: "BBC Sport" },
      { url: "https://www.espn.com/espn/rss/tennis/news", source: "ESPN" },
      { url: "https://www.theguardian.com/sport/tennis/rss", source: "Guardian" },
      { url: "https://www.skysports.com/rss/12040", source: "Sky Sports" },
    ],
    padel: [
      { url: "https://www.worldpadeltour.com/en/rss/", source: "World Padel Tour" },
      { url: "https://www.padel-magazine.com/feed/", source: "Padel Magazine" },
      { url: "https://www.padeladdict.com/en/feed/", source: "Padel Addict" },
    ],
    pickleball: [
      { url: "https://thepickler.com/blogs/pickleball-blog.atom", source: "The Pickler" },
      { url: "https://www.ppatour.com/feed/", source: "PPA Tour" },
      { url: "https://pickleballcentral.com/blogs/news.atom", source: "PickleballCentral" },
    ],
  };

  const SPORT_FALLBACKS: Array<{ id: string; title: string; link: string; source: string; publishedAt: string }> = [
    { id: "tf1", title: "Australian Open 2026: Draw Announced", link: "#", source: "ATP Tour", publishedAt: new Date().toISOString() },
    { id: "tf2", title: "Sinner Leads ATP Rankings After Strong Start", link: "#", source: "ATP Tour", publishedAt: new Date().toISOString() },
    { id: "tf3", title: "Swiatek Eyes Fourth Grand Slam Title", link: "#", source: "WTA", publishedAt: new Date().toISOString() },
    { id: "tf4", title: "Alcaraz Working on New Serve Technique", link: "#", source: "ESPN", publishedAt: new Date().toISOString() },
    { id: "tf5", title: "Djokovic Confirms Melbourne Participation", link: "#", source: "BBC Sport", publishedAt: new Date().toISOString() },
    { id: "tf6", title: "Young Stars Rising in ATP Next Gen Finals", link: "#", source: "ATP Tour", publishedAt: new Date().toISOString() },
    { id: "tf7", title: "WTA Finals: Key Matchups to Watch", link: "#", source: "WTA", publishedAt: new Date().toISOString() },
    { id: "tf8", title: "Tennis Technology: New Hawkeye Updates", link: "#", source: "Tennis", publishedAt: new Date().toISOString() },
    { id: "tf9", title: "Roland Garros Clay Court Renovations Complete", link: "#", source: "Tennis", publishedAt: new Date().toISOString() },
    { id: "tf10", title: "Doubles Specialists Dominate Miami Open", link: "#", source: "ATP Tour", publishedAt: new Date().toISOString() },
  ];

  router.get("/api/player/news", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sport = (typeof req.query.sport === "string" && ["tennis", "padel", "pickleball"].includes(req.query.sport))
        ? req.query.sport
        : "tennis";

      const now = Date.now();
      const cache = newsCaches[sport];

      // Return cached data if still fresh
      if (cache && (now - cache.fetchedAt) < NEWS_CACHE_TTL) {
        return res.json({ articles: cache.articles, cached: true });
      }
      
      // Fetch fresh news from RSS feeds
      const RSSParser = (await import("rss-parser")).default;
      const Parser = RSSParser;
      const parser = new Parser({
        timeout: 5000,
        headers: { "User-Agent": "GlowUpSports/1.0" },
        customFields: {
          item: [
            ["media:content", "mediaContent", { keepArray: false }],
            ["media:thumbnail", "mediaThumbnail", { keepArray: false }],
            ["enclosure", "enclosure"],
            ["content:encoded", "contentEncoded"],
          ],
        },
      });
      
      const feeds = SPORT_FEEDS[sport] || SPORT_FEEDS.tennis;
      
      const articles: Array<{
        id: string;
        title: string;
        link: string;
        source: string;
        publishedAt: string;
        thumbnail?: string;
      }> = [];
      
      // 48 hours ago cutoff
      const cutoffTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
      
      // Try to fetch from each feed, gracefully handle failures
      for (const feed of feeds) {
        try {
          const parsedFeed = await parser.parseURL(feed.url);
          const feedItems = (parsedFeed.items || []).slice(0, 20); // Get 20 items per feed
          
          for (const item of feedItems) {
            const publishedDate = item.pubDate ? new Date(item.pubDate) : new Date();
            
            // Filter out articles older than 48 hours
            if (publishedDate < cutoffTime) {
              continue;
            }
            
            // Shorten title for ticker display (max 80 chars)
            let title = (item.title || "").trim();
            if (title.length > 80) {
              title = title.slice(0, 77) + "...";
            }
            
            // Extract thumbnail from various RSS formats
            let thumbnail: string | undefined;
            
            // Try enclosure (standard RSS)
            if (item.enclosure?.url && item.enclosure.type?.startsWith("image/")) {
              thumbnail = item.enclosure.url;
            }
            // Try media:content (common in media RSS)
            if (!thumbnail && item.mediaContent) {
              const mc = item.mediaContent;
              thumbnail = mc.$ ? mc.$.url : (typeof mc === "string" ? mc : mc.url);
            }
            // Try media:thumbnail
            if (!thumbnail && item.mediaThumbnail) {
              const mt = item.mediaThumbnail;
              thumbnail = mt.$ ? mt.$.url : (typeof mt === "string" ? mt : mt.url);
            }
            // Try to extract from content:encoded (HTML content)
            if (!thumbnail && item.contentEncoded) {
              const imgMatch = item.contentEncoded.match(/<img[^>]+src=["']([^"']+)["']/i);
              if (imgMatch && imgMatch[1]) {
                thumbnail = imgMatch[1];
              }
            }
            // Try to extract from content (some feeds put HTML here)
            if (!thumbnail && item.content) {
              const imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
              if (imgMatch && imgMatch[1]) {
                thumbnail = imgMatch[1];
              }
            }
            
            articles.push({
              id: item.guid || item.link || `${feed.source}-${Date.now()}-${Math.random()}`,
              title,
              link: item.link || "",
              source: feed.source,
              publishedAt: item.pubDate || new Date().toISOString(),
              thumbnail,
            });
          }
        } catch (feedError) {
          console.log(`[News] Failed to fetch ${feed.source}:`, (feedError as Error).message);
        }
      }
      
      // Sort by date (newest first) and limit to 50 articles for continuous scrolling
      articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      const limitedArticles = articles.slice(0, 50);
      
      // For tennis only: if no RSS feeds worked or too few articles, add fallback headlines
      // For padel/pickleball: return empty array if feeds are unavailable (per sport design)
      if (sport === "tennis" && limitedArticles.length < 10) {
        const existingIds = new Set(limitedArticles.map((a) => a.id));
        for (const fb of SPORT_FALLBACKS) {
          if (!existingIds.has(fb.id) && limitedArticles.length < 25) {
            limitedArticles.push(fb);
          }
        }
      }
      
      // Cache the results per sport
      newsCaches[sport] = { articles: limitedArticles, fetchedAt: now };
      
      res.json({ articles: limitedArticles, cached: false });
    } catch (error) {
      console.error("Error fetching news:", error);
      res.status(500).json({ error: "Failed to fetch news", articles: [] });
    }
  });

  // Get coach profile for player
  router.get("/api/player/coach/:coachId", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      const coach = await storage.getCoach(coachId);
      
      if (!coach) {
        return res.status(404).json({ error: "Coach not found" });
      }
      
      // Get coach review stats
      const reviewStats = await storage.getCoachReviewStats(coachId);
      
      // Get number of active players for this coach
      const playersList = await storage.getPlayersByCoach(coachId);
      const activePlayers = playersList.length;

      // Get academy info
      let academyId: string | null = coach.academyId || null;
      let academyName: string | null = null;
      let academyLogoUrl: string | null = null;
      let academyCity: string | null = null;
      if (academyId) {
        const academyRows = await db.select({ id: academies.id, name: academies.name, logoUrl: academies.logoUrl, city: academies.city })
          .from(academies).where(eq(academies.id, academyId)).limit(1);
        if (academyRows[0]) {
          academyName = academyRows[0].name || null;
          academyLogoUrl = academyRows[0].logoUrl || null;
          academyCity = academyRows[0].city || null;
        }
      }

      // Get upcoming public sessions (next 5, group type, from this coach's series)
      const now = new Date();
      const upcomingPublicSessions = await db.select({
        id: sessions.id,
        title: sessions.title,
        startTime: sessions.startTime,
        endTime: sessions.endTime,
        maxPlayers: sessions.maxPlayers,
        ballLevel: sessions.ballLevel,
        sessionType: sessions.sessionType,
        price: sessions.price,
        academyPrice: sessions.academyPrice,
      })
        .from(sessions)
        .where(and(
          eq(sessions.coachId, coachId),
          eq(sessions.status, "scheduled"),
          inArray(sessions.sessionType, ["group", "semi_private"]),
          gte(sessions.startTime, now)
        ))
        .orderBy(asc(sessions.startTime))
        .limit(5);

      // For each upcoming session, compute spots left
      const upcomingSessionsEnriched = await Promise.all(upcomingPublicSessions.map(async (s) => {
        const enrolled = await db.select({ count: sql<number>`count(*)` }).from(sessionPlayers).where(eq(sessionPlayers.sessionId, s.id));
        const currentPlayers = Number(enrolled[0]?.count || 0);
        const maxP = s.maxPlayers || 6;
        const spotsLeft = Math.max(0, maxP - currentPlayers);
        const publicDropInPrice = s.academyPrice != null ? parseFloat(s.academyPrice.toString()) : (s.price != null ? parseFloat(s.price.toString()) : null);
        return {
          id: s.id,
          title: s.title,
          startTime: s.startTime.toISOString(),
          endTime: s.endTime.toISOString(),
          ballLevel: s.ballLevel,
          sessionType: s.sessionType,
          maxPlayers: maxP,
          currentPlayers,
          spotsLeft,
          publicDropInPrice,
        };
      }));

      // Get last 5 visible coach reviews with player first name
      const recentReviewRows = await db.select({
        id: coachReviews.id,
        overallScore: coachReviews.overallScore,
        whatDoesWell: coachReviews.whatDoesWell,
        reviewerAgeCategory: coachReviews.reviewerAgeCategory,
        reviewerLevel: coachReviews.reviewerLevel,
        createdAt: coachReviews.createdAt,
        playerId: coachReviews.playerId,
      })
        .from(coachReviews)
        .where(and(
          eq(coachReviews.coachId, coachId),
          eq(coachReviews.isHidden, false),
          eq(coachReviews.isVisible, true)
        ))
        .orderBy(desc(coachReviews.createdAt))
        .limit(5);

      // Fetch player first names for reviews
      const reviewPlayerIds = recentReviewRows.map(r => r.playerId).filter(Boolean) as string[];
      const reviewPlayers = reviewPlayerIds.length > 0
        ? await db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, reviewPlayerIds))
        : [];
      const playerNameMap = new Map(reviewPlayers.map(p => [p.id, p.name?.split(" ")[0] || "Player"]));

      const reviewsFormatted = recentReviewRows.map(r => ({
        id: r.id,
        overallScore: r.overallScore ? parseFloat(r.overallScore.toString()) : null,
        comment: r.whatDoesWell || null,
        playerFirstName: playerNameMap.get(r.playerId) || "Player",
        reviewerLevel: r.reviewerLevel,
        createdAt: r.createdAt?.toISOString() || null,
      }));


      res.json({
        id: coach.id,
        name: coach.name,
        email: coach.user?.email || null,
        phone: coach.phone || null,
        bio: coach.bio || null,
        yearsExperience: coach.yearsExperience || 0,
        specializations: coach.specializations || [],
        certifications: coach.certifications || [],
        playersCount: activePlayers,
        averageRating: reviewStats?.averageOverall ? parseFloat(reviewStats.averageOverall.toString()) : null,
        reviewsCount: reviewStats?.totalReviews || 0,
        profilePhotoUrl: coach.photoUrl || null,
        academyId,
        academyName,
        academyLogoUrl,
        academyCity,
        upcomingPublicSessions: upcomingSessionsEnriched,
        recentReviews: reviewsFormatted,
      });
    } catch (error) {
      console.error("Error fetching coach profile:", error);
      res.status(500).json({ error: "Failed to fetch coach profile" });
    }
  });
  
  // Get player sessions
  router.get("/api/player/me/sessions", authMiddleware, requirePlayerOrOwner, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Return empty sessions for users without player profile
      if (!req.user!.playerId) {
        return res.json({ friends: [], pendingRequests: [] });
      }
      const playerId = req.user!.playerId!;
      
      // Get sessions for the past 90 days and next 30 days
      const past = new Date();
      past.setDate(past.getDate() - 90);
      const future = new Date();
      future.setDate(future.getDate() + 30);
      
      const sessions = await storage.getPlayerSessionsWithDetails(playerId, past, future);
      
      // Batch fetch coaches and courts for efficiency
      const coachIds = [...new Set(sessions.map(s => s.coachId).filter((id): id is string => !!id))];
      const courtIds = [...new Set(sessions.map(s => s.courtId).filter((id): id is string => !!id))];
      const directLocationIds = [...new Set(sessions.map(s => s.locationId).filter((id): id is string => !!id))];
      
      // Fetch all coaches and their user info
      const coachMap: Record<string, string> = {};
      for (const coachId of coachIds) {
        const coach = await storage.getCoach(coachId);
        if (coach) {
          const coachUser = await storage.getUserById(coach.userId);
          coachMap[coachId] = coachUser?.name || coach.name || "Coach";
        }
      }
      
      // Pre-fetch location data (shared by court lookup and direct session.locationId)
      type LocationInfo = { name: string; address: string | null; lat: number | null; lng: number | null };
      const locationInfoMap: Record<string, LocationInfo> = {};
      const allLocationIdsToFetch = new Set<string>();

      // Fetch all courts and their location info
      const courtMap: Record<string, string> = {};
      const courtToLocationId: Record<string, string> = {};
      for (const courtId of courtIds) {
        const court = await storage.getCourt(courtId);
        if (court) {
          courtMap[courtId] = court.name;
          if (court.locationId) {
            courtToLocationId[courtId] = court.locationId;
            allLocationIdsToFetch.add(court.locationId);
          }
        }
      }
      // Also ensure direct session locationIds are fetched
      for (const locId of directLocationIds) {
        allLocationIdsToFetch.add(locId);
      }
      // Fetch all needed locations
      for (const locId of allLocationIdsToFetch) {
        const loc = await storage.getLocation(locId);
        if (loc) {
          locationInfoMap[locId] = {
            name: loc.name,
            address: loc.address ?? null,
            lat: loc.lat ?? null,
            lng: loc.lng ?? null,
          };
        }
      }
      // Build court->location map using fetched data
      const courtLocationMap: Record<string, LocationInfo> = {};
      for (const courtId of courtIds) {
        const locId = courtToLocationId[courtId];
        if (locId && locationInfoMap[locId]) {
          courtLocationMap[courtId] = locationInfoMap[locId];
        }
      }
      
      // Generate session title based on type
      const getSessionTitle = (type: string | null) => {
        switch (type) {
          case "private": return "Private Training";
          case "semi": return "Semi-Private Session";
          case "group": return "Group Session";
          case "physical": return "Physical Training";
          case "activity": return "Activity Session";
          default: return "Training Session";
        }
      };
      
      // Filter out future sessions where player cancelled
      const activeSessions = sessions.filter((session) => {
        if (session.attendanceStatus === "absent") {
          const sessionTime = new Date(session.startTime);
          if (sessionTime > new Date()) return false;
        }
        if (session.sessionStatus === "cancelled") return false;
        return true;
      });

      // Build response - let Express JSON serialize dates to ISO strings
      const playerSessions = activeSessions.map((session) => {
        let displaySessionType = session.sessionType;
        if (session.sessionType === "private_adjusted" && (session.attendanceStatus || "").toLowerCase() === "absent") {
          displaySessionType = "semi_private";
        }
        return {
          id: session.sessionPlayerId,
          sessionId: session.id,
          attendanceStatus: session.attendanceStatus || "pending",
          session: {
            id: session.id,
            startTime: session.startTime,
            endTime: session.endTime,
            sessionType: displaySessionType,
            courtName: session.courtId ? courtMap[session.courtId] || null : null,
            title: getSessionTitle(displaySessionType),
            locationId: (() => {
              const fromCourt = session.courtId ? courtToLocationId[session.courtId] : undefined;
              return fromCourt ?? session.locationId ?? null;
            })(),
            locationName: (() => {
              const fromCourt = session.courtId ? courtLocationMap[session.courtId]?.name : undefined;
              const fromDirect = session.locationId ? locationInfoMap[session.locationId]?.name : undefined;
              return fromCourt ?? fromDirect ?? null;
            })(),
            locationAddress: (() => {
              const fromCourt = session.courtId ? courtLocationMap[session.courtId]?.address : undefined;
              const fromDirect = session.locationId ? locationInfoMap[session.locationId]?.address : undefined;
              return fromCourt ?? fromDirect ?? null;
            })(),
            locationLat: (() => {
              const fromCourt = session.courtId ? courtLocationMap[session.courtId]?.lat : undefined;
              const fromDirect = session.locationId ? locationInfoMap[session.locationId]?.lat : undefined;
              return fromCourt ?? fromDirect ?? null;
            })(),
            locationLng: (() => {
              const fromCourt = session.courtId ? courtLocationMap[session.courtId]?.lng : undefined;
              const fromDirect = session.locationId ? locationInfoMap[session.locationId]?.lng : undefined;
              return fromCourt ?? fromDirect ?? null;
            })(),
          },
          coachName: session.coachId ? coachMap[session.coachId] || null : null,
        };
      });
      
      res.json(playerSessions);
    } catch (error) {
      console.error("Error fetching player sessions:", error);
      res.status(500).json({ error: "Failed to fetch player sessions" });
    }
  });

  // Get player court bookings
  router.get("/api/player/me/court-bookings", authMiddleware, requirePlayerOrOwner, requireFeatureUnlock("court_booking"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const playerId = req.user!.playerId;
      
      if (!userId) {
        return res.json({ friends: [], pendingRequests: [] });
      }
      
      // Get court bookings for this user (by userId or playerId)
      const bookings = await storage.getPlayerCourtBookings(userId, playerId);
      
      // Enrich with court names
      const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
        const court = await storage.getCourt(booking.courtId);
        return {
          id: booking.id,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          durationMinutes: booking.durationMinutes,
          courtName: court?.name || "Court",
          courtLocation: court?.location || null,
          status: booking.status,
          bookingType: booking.bookingType,
          price: booking.price,
          currency: booking.currency,
          paymentStatus: booking.paymentStatus,
        };
      }));
      
      res.json(enrichedBookings);
    } catch (error) {
      console.error("Error fetching player court bookings:", error);
      res.status(500).json({ error: "Failed to fetch court bookings" });
    }
  });

export default router;
