import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { storage } from "../storage";
import {
  players, coaches, users, sessions, packages, coachingSeries, seriesPlayers,
  creditTransactions, invoices, payments, sessionPlayers,
  locationTravelTimes, coachSettings, coachAvailability, availabilityExceptions,
  coachTimeBlocks, courtAvailability, courtAvailabilitySnapshots,
  bookingInvites, bookingInviteGuests, openMatches, openMatchSlots,
  matchRequests, playerBookingPreferences,
  submitReviewSchema,
} from "@shared/schema";
import { eq, sql, desc, and, ne, gt, gte, asc, inArray, lte, or, count } from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  requireAcademy,
  requireFeatureUnlock,
  type JWTPayload,
} from "../auth";
import { fromZodError } from "zod-validation-error";
import { sanitizeMessage } from "../utils/sanitize";

const router = Router();

interface AuthRequest extends Request {
  user?: JWTPayload;
}

function toDubaiTime(utcDate: Date): Date {
  const dubaiOffset = 4 * 60;
  const utcTime = utcDate.getTime();
  return new Date(utcTime + dubaiOffset * 60 * 1000);
}

  // ==================== PLAYER BOOKING SYSTEM ====================

  // Get available time slots for booking
  router.get("/api/player/availability", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const { coachId, locationId, startDate, endDate, duration } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }

      const player = await storage.getPlayer(playerId, req.user?.academyId || "");
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      console.log("[Availability] Fetching slots for player:", playerId, "dates:", startDate, "-", endDate, "academyId:", player.academyId);
      const slots = await storage.getAvailableSlots({
        academyId: player.academyId || "",
        coachId: coachId as string | undefined,
        locationId: locationId as string | undefined,
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        duration: parseInt(duration as string) || 60,
      });
      // Enrich slots with coach, location, and court names
      const enrichedSlots = await Promise.all(slots.map(async (slot) => {
        const [coach, location, court] = await Promise.all([
          slot.coachId ? storage.getCoach(slot.coachId) : null,
          slot.locationId ? storage.getLocation(slot.locationId) : null,
          slot.courtId ? storage.getCourt(slot.courtId) : null,
        ]);
        
        return {
          ...slot,
          coachName: coach?.name || "Available Coach",
          coachPhotoUrl: coach?.profilePhotoUrl || null,
          locationId: slot.locationId,
          locationName: location?.name || "Any Location",
          courtId: slot.courtId,
          courtName: court?.name || "Any Court",
          duration: parseInt(duration as string) || 60,
        };
      }));

      console.log("[Availability] Returning", enrichedSlots.length, "slots");
      res.json(enrichedSlots);
    } catch (error) {
      console.error("Player availability error:", error);
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  // Get player's booking requests
  // Get all coaches from player's academy for booking wizard (with extended details)
  router.get("/api/player/academy-coaches", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;
      
      if (!playerId || !academyId) {
        return res.status(403).json({ error: "Player access required" });
      }

      // Get all coaches from this academy with extended details for booking
      const academyCoaches = await storage.getAcademyCoachesForBooking(academyId);
      
      res.json({ coaches: academyCoaches });
    } catch (error) {
      console.error("Get academy coaches error:", error);
      res.status(500).json({ error: "Failed to fetch academy coaches" });
    }
  });

  router.get("/api/player/booking-requests", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const status = req.query.status as string | undefined;
      const requests = await storage.getBookingRequests({ playerId, status });

      res.json(requests);
    } catch (error) {
      console.error("Player booking requests error:", error);
      res.status(500).json({ error: "Failed to fetch booking requests" });
    }
  });

  // Create a booking request (new session OR join existing session)
  router.post("/api/player/booking-requests", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const player = await storage.getPlayer(playerId, req.user?.academyId || "");
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const { coachId, locationId, courtId, requestedStart, requestedEnd, duration, sessionType, playerNote, sessionId, isJoinRequest } = req.body;

      if (!requestedStart || !requestedEnd || !duration || !sessionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // For join requests, validate the session exists and has spots
      if (isJoinRequest && sessionId) {
        const session = await storage.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }
        
        // Check if session belongs to player's academy
        if (session.academyId !== player.academyId) {
          return res.status(403).json({ error: "Session not in your academy" });
        }
        
        // Check if session has available spots
        const sessionPlayers = await storage.getSessionPlayers(sessionId);
        const maxPlayers = session.maxPlayers || 6;
        if (sessionPlayers.length >= maxPlayers) {
          return res.status(400).json({ error: "Session is full" });
        }
        
        // Check if player is already in the session
        if (sessionPlayers.some((sp: any) => sp.id === playerId)) {
          return res.status(400).json({ error: "Already enrolled in this session" });
        }
      }

      const request = await storage.createBookingRequest({
        academyId: player.academyId,
        playerId,
        coachId: coachId || null,
        locationId: locationId || null,
        courtId: courtId || null,
        sessionId: isJoinRequest ? sessionId : null,
        requestedStart: new Date(requestedStart),
        requestedEnd: new Date(requestedEnd),
        duration,
        sessionType,
        playerNote: playerNote || null,
        status: "pending",
      });

      await storage.createAuditLog({
        academyId: player.academyId,
        entityType: "booking_request",
        entityId: request.id,
        action: isJoinRequest ? "join_request" : "create",
        performedBy: playerId,
        performedByRole: "player",
      });

      res.status(201).json(request);
    } catch (error) {
      console.error("Create booking request error:", error);
      res.status(500).json({ error: "Failed to create booking request" });
    }
  });

  // Get joinable sessions for player (open groups with spots in their academy)
  router.get("/api/player/joinable-sessions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;
      
      if (!playerId || !academyId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const player = await storage.getPlayer(playerId, academyId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const { date, sessionType } = req.query;
      
      // Get all future sessions for the academy
      const allSessions = await storage.getSessionsByAcademy(academyId);
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      
      // Filter joinable sessions
      const joinable = await Promise.all(
        allSessions.filter((s: any) => {
          const sessionStart = new Date(s.startTime);
          const isFuture = sessionStart > now;
          const matchesType = !sessionType || s.sessionType === sessionType;
          const matchesDate = !date || sessionStart.toISOString().split('T')[0] === date;
          const isGroupType = s.sessionType === "group" || s.sessionType === "semi_private" || s.sessionType === "open_play";
          return isFuture && matchesType && matchesDate && isGroupType;
        }).map(async (s: any) => {
          const players = await storage.getSessionPlayers(s.id);
          const maxPlayers = s.maxPlayers || 6;
          const hasSpots = players.length < maxPlayers;
          const isEnrolled = players.some((p: any) => p.id === playerId);
          
          if (!hasSpots || isEnrolled) return null;
          
          return {
            id: s.id,
            sessionType: s.sessionType,
            startTime: s.startTime,
            endTime: s.endTime,
            duration: s.duration,
            coachId: s.coachId,
            coachName: s.coachName || "Coach",
            courtName: s.courtName || "Court",
            locationName: s.locationName || s.location || "Location",
            maxPlayers,
            currentPlayers: players.length,
            players: players.map((p: any) => ({ id: p.id, name: p.name })),
            ballLevel: s.ballLevel,
            skillLevel: s.skillLevel,
          };
        })
      );
      
      res.json(joinable.filter(Boolean));
    } catch (error) {
      console.error("Player joinable sessions error:", error);
      res.status(500).json({ error: "Failed to fetch joinable sessions" });
    }
  });

  // Cancel a booking request
  router.post("/api/player/booking-requests/:id/cancel", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { id } = req.params;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const request = await storage.getBookingRequest(id);
      if (!request || request.playerId !== playerId) {
        return res.status(404).json({ error: "Booking request not found" });
      }

      if (request.status !== "pending") {
        return res.status(400).json({ error: "Only pending requests can be cancelled" });
      }

      const updated = await storage.updateBookingRequest(id, { status: "cancelled" });

      res.json(updated);
    } catch (error) {
      console.error("Cancel booking request error:", error);
      res.status(500).json({ error: "Failed to cancel booking request" });
    }
  });

  // ==================== PLAY SCREEN (MMO STYLE) ====================

  // Get available sessions for Play screen
  router.get("/api/play/sessions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      // Get player's academyId from database (more reliable than req.user.academyId)
      const currentPlayer = await storage.getPlayer(playerId);
      const academyId = currentPlayer?.academyId;
      console.log("[PlaySessions] Player:", playerId, "Academy:", academyId);

      // Get upcoming group/semi sessions from player's academy + public sessions
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 14); // Next 2 weeks

      const sessions = await db.query.sessions.findMany({
        where: (s, { and, or, eq, gte, lte, inArray }) => and(
          or(
            eq(s.academyId, academyId || ""),
            eq(s.academyId, null as any) // Public sessions
          ),
          inArray(s.sessionType, ["group", "semi_private"]),
          eq(s.status, "scheduled"),
          gte(s.startTime, now),
          lte(s.startTime, futureDate)
        ),
        orderBy: (s, { asc }) => [asc(s.startTime)],
        
      });

      // Enrich sessions with player count and player info
      const enrichedSessions = await Promise.all(sessions.map(async (session) => {
        // Get players in this session - first check session_players
        const sessionPlayerRecords = await db.query.sessionPlayers.findMany({
          where: (sp, { eq }) => eq(sp.sessionId, session.id),
        });
        
        let playerIds = sessionPlayerRecords.map(sp => sp.playerId).filter(Boolean) as string[];
        
        // If no session_players and session has a series, check series_players (for recurring sessions)
        if (playerIds.length === 0 && session.seriesId) {
          const seriesPlayers = await storage.getSeriesPlayers(session.seriesId);
          playerIds = seriesPlayers
            .filter(sp => sp.status === 'active')
            .map(sp => sp.playerId)
            .filter(Boolean) as string[];
        }
        
        const players = playerIds.length > 0 
          ? await db.query.players.findMany({
              where: (p, { inArray }) => inArray(p.id, playerIds),
            })
          : [];

        // Get coach info
        let coachName = null;
        if (session.coachId) {
          const coach = await storage.getCoach(session.coachId);
          coachName = coach?.name || null;
        }
        // Get court info first (needed for location fallback)
        let courtName = null;
        let courtLocationId: string | null = null;
        if (session.courtId) {
          const court = await storage.getCourt(session.courtId);
          courtName = court?.name || null;
          courtLocationId = court?.locationId || null;
        }

        // Get location info - check session first, then series, then court
        let locationName = "Location TBD";
        let locationId = session.locationId;
        
        // If session doesnt have locationId but has a series, get location from series
        if (!locationId && session.seriesId) {
          const series = await db.query.coachingSeries.findFirst({
            where: (s, { eq }) => eq(s.id, session.seriesId!),
          });
          if (series?.locationId) {
            locationId = series.locationId;
          }
        }
        
        // If still no locationId, get from court
        if (!locationId && courtLocationId) {
          locationId = courtLocationId;
        }
        
        if (locationId) {
          const location = await storage.getLocation(locationId);
          locationName = location?.name || "Location TBD";
        }

        // Check waitlist
        const waitlistRecords = await db.query.sessionWaitlist.findMany({
          where: (w, { and, eq }) => and(
            eq(w.sessionId, session.id),
            eq(w.status, "waiting")
          ),
        });

        const maxPlayers = session.maxPlayers || 6;
        const currentPlayers = players.length;
        let status: "open" | "almost_full" | "full" = "open";
        if (currentPlayers >= maxPlayers) status = "full";
        else if (maxPlayers - currentPlayers === 1) status = "almost_full";

        // Check if current player is enrolled in this session
        const isEnrolled = playerIds.includes(playerId);

        return {
          id: session.id,
          title: session.title || `${session.sessionType === "group" ? "Group" : "Semi"} Training`,
          sessionType: session.sessionType,
          startTime: session.startTime.toISOString(),
          endTime: session.endTime.toISOString(),
          locationName,
          courtName,
          coachName,
          coachId: session.coachId,
          ballLevel: session.ballLevel,
          vibe: session.vibe || "casual",
          minLevel: session.minLevel,
          maxLevel: session.maxLevel,
          xpReward: session.xpReward || 20,
          maxPlayers,
          currentPlayers,
          players: players.map(p => ({
            id: p.id,
            name: p.name,
            level: p.level || 1,
            ballLevel: p.ballLevel,
            avatarUrl: p.profilePhotoUrl,
          })),
          waitlistCount: waitlistRecords.length,
          status,
        };
      }));

      res.json(enrichedSessions);
    } catch (error) {
      console.error("Play sessions error:", error);
      res.status(500).json({ error: "Failed to fetch play sessions" });
    }
  });

  // Get nearby players for Play screen
  router.get("/api/play/nearby-players", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { filter } = req.query;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      // Get current player's info for filtering
      const currentPlayer = await db.query.players.findFirst({
        where: (p, { eq }) => eq(p.id, playerId),
      });
      
      const academyId = currentPlayer?.academyId;
      console.log(`[NearbyPlayers] Player ${playerId} academyId: ${academyId}`);

      // Get players from the same academy (or public players)
      const players = await db.query.players.findMany({
        where: (p, { and, eq, ne }) => and(
          eq(p.academyId, academyId || ""),
          ne(p.id, playerId)
        ),
        
      });

      // Build enriched players with mutual session counts and openToPlay status
      const enrichedPlayers = await Promise.all(players.map(async (player) => {
        let mutualCount = 0;
        
        // Only query mutual sessions if both player IDs are valid
        if (playerId && player.id) {
          try {
            const mutualSessions = await db.execute(
              sql`SELECT COUNT(DISTINCT sp1.session_id)::int as count
                  FROM session_players sp1
                  INNER JOIN session_players sp2 ON sp1.session_id = sp2.session_id
                  WHERE sp1.player_id = ${playerId}
                    AND sp2.player_id = ${player.id}`
            );
            mutualCount = Number(mutualSessions.rows[0]?.count || 0);
          } catch (e) {
            console.error("Mutual sessions query failed:", e);
          }
        }
        
        // Check if player is "open to play" (from player field or openToPlay table)
        let isOpenToPlay = (player as any).openToPlay || false;
        try {
          const otpRecord = await db.execute(
            sql`SELECT id FROM open_to_play 
                WHERE user_id = (SELECT id FROM users WHERE player_id = ${player.id} LIMIT 1)
                  AND is_active = true 
                  AND available_until > NOW()
                LIMIT 1`
          );
          if (otpRecord.rows.length > 0) {
            isOpenToPlay = true;
          }
        } catch (e) {
          // Table might not exist or query failed, use player field
        }

        return {
          privacyLevel: (player as any).privacyLevel || "platform",
          id: player.id,
          name: player.name,
          level: player.level || 1,
          avatarUrl: player.profilePhotoUrl,
          vibe: player.preferredPlayType || "casual",
          mutualSessions: mutualCount,
          preferredTime: player.preferredTime || undefined,
          ballLevel: player.ballLevel || undefined,
          skillLevel: player.skillLevel || undefined,
          openToPlay: isOpenToPlay,
        };
      }));

      // Apply privacy filter first - hidden players are never visible
      let filteredPlayers = enrichedPlayers.filter(p => {
        if (p.privacyLevel === "hidden") return false;
        // Academy-only players only visible to same-academy members
        if (p.privacyLevel === "academy" && currentPlayer?.academyId !== academyId) return false;
        return true;
      });

      // Apply discovery filter if provided
      
      if (filter === "recommended") {
        // Sort by mutual sessions (players who train with you)
        filteredPlayers.sort((a, b) => b.mutualSessions - a.mutualSessions);
      } else if (filter === "sameLevel") {
        // Filter to players at same ball level
        const currentBallLevel = currentPlayer?.ballLevel?.toLowerCase().split(/[\s_-]/)[0] || "";
        filteredPlayers = filteredPlayers.filter(p => {
          const pLevel = p.ballLevel?.toLowerCase().split(/[\s_-]/)[0] || "";
          return pLevel === currentBallLevel && currentBallLevel !== "";
        });
      } else if (filter === "openToPlay") {
        // Only show players who are open to play
        filteredPlayers = filteredPlayers.filter(p => p.openToPlay);
      } else {
        // Default: sort by mutual sessions first, then by level proximity
        filteredPlayers.sort((a, b) => b.mutualSessions - a.mutualSessions);
      }

      res.json(filteredPlayers);
    } catch (error) {
      console.error("Nearby players error:", error);
      res.status(500).json({ error: "Failed to fetch nearby players" });
    }
  });

  // Join a session
  router.post("/api/play/sessions/:sessionId/join", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { sessionId } = req.params;
      const { useMakeUpCredit } = req.body || {};
      
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check if already joined
      const existingPlayer = await db.query.sessionPlayers.findFirst({
        where: (sp, { and, eq }) => and(
          eq(sp.sessionId, sessionId),
          eq(sp.playerId, playerId)
        ),
      });

      if (existingPlayer) {
        return res.status(400).json({ error: "Already joined this session" });
      }

      // Check capacity
      const currentPlayers = await db.query.sessionPlayers.findMany({
        where: (sp, { eq }) => eq(sp.sessionId, sessionId),
      });

      const maxPlayers = session.maxPlayers || 6;
      if (currentPlayers.length >= maxPlayers) {
        return res.status(400).json({ error: "Session is full. Join the waitlist instead." });
      }

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Add player to session first
      await db.insert(sessionPlayers).values({
        sessionId,
        playerId,
      });
      // REFACTORED: Player join creates pending session_player only
      // Credits are processed when coach marks attendance (present/late)
      // This prevents premature credit deduction and enables proper refund handling
      const sessionType = session.sessionType || "group";
      
      // Get current credit info for display (no deduction)
      const activePackages = await storage.getActivePlayerPackages(playerId, session.academyId || player.academyId);
      const remainingCredits = activePackages.reduce((sum, pkg) => sum + pkg.remainingCredits, 0);
      const matchingPackage = activePackages.find(p => p.creditType === sessionType);
      
      res.json({ 
        success: true, 
        message: `Joined session! Credit will be deducted when attendance is marked.`,
        creditsDeducted: 0,
        remainingCredits,
        creditType: matchingPackage?.creditType || sessionType,
        attendancePending: true,
      });

    } catch (error) {
      console.error("Join session error:", error);
      res.status(500).json({ error: "Failed to join session" });
    }
  });

  // Leave a play session (frees up slot and notifies waitlist/make-up credit holders)
  router.post("/api/play/sessions/:sessionId/leave", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { sessionId } = req.params;
      const { reason } = req.body;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check if player is in this session
      const sessionPlayer = await db.query.sessionPlayers.findFirst({
        where: (sp, { and: spAnd, eq: spEq }) => spAnd(
          spEq(sp.sessionId, sessionId),
          spEq(sp.playerId, playerId)
        ),
      });

      if (!sessionPlayer) {
        return res.status(400).json({ error: "You are not in this session" });
      }

      // Calculate hours until session for cancellation policy
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const sessionStart = new Date(session.startTime);
      const hoursUntilSession = (sessionStart.getTime() - now.getTime()) / (1000 * 60 * 60);
      const isLateCancel = hoursUntilSession < 24;

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Check the original join transaction to determine which credit type was used
      const originalTransactions = await storage.getCreditTransactionsBySession(sessionId);
      const playerJoinTx = originalTransactions.find(
        tx => tx.playerId === playerId && (tx.reason === "session_join" || tx.reason === "make_up_lesson_used")
      );
      
      // Determine if make-up credit was used based on transaction reason or metadata
      let usedMakeUpCredit = false;
      if (playerJoinTx) {
        if (playerJoinTx.reason === "make_up_lesson_used") {
          usedMakeUpCredit = true;
        } else if (playerJoinTx.metadata) {
          try {
            const metadata = typeof playerJoinTx.metadata === "string" 
              ? JSON.parse(playerJoinTx.metadata) 
              : playerJoinTx.metadata;
            usedMakeUpCredit = metadata.makeUpUsed === true;
          } catch {
            usedMakeUpCredit = false;
          }
        }
      }

      // Remove player from session
      await db.delete(sessionPlayers).where(
        and(
          eq(sessionPlayers.sessionId, sessionId),
          eq(sessionPlayers.playerId, playerId)
        )
      );

      // Log the cancellation
      await storage.createPlayerSessionCancellation({
        sessionType: session.sessionType,
        playerId,
        sessionId,
        reason: reason || "player_left_session",
        hoursBeforeSession: Math.round(Math.max(0, hoursUntilSession)),
        isLateNotice: isLateCancel,
        makeUpEligibility: isLateCancel ? "not_eligible" : "eligible",
      });

      let creditRefunded = false;
      let makeUpRefunded = false;
      
      // Early cancel: refund the correct credit type
      // Only refund if we found a valid join transaction (prevents double refunds and errors)
      if (!isLateCancel && playerJoinTx) {
        if (usedMakeUpCredit) {
          // Refund make-up credit
          await storage.updatePlayer(playerId, {
            makeUpCredits: (player.makeUpCredits || 0) + 1,
          });
          makeUpRefunded = true;

          await storage.createCreditTransaction({
            playerId,
            academyId: session.academyId || player.academyId,
            type: "refund",
            amount: 0,
            reason: "make_up_credit_refund",
            sessionId,
            metadata: JSON.stringify({
              hoursBeforeSession: Math.round(hoursUntilSession),
              originalPaymentMethod: "make_up_credit",
              originalTransactionId: playerJoinTx.id,
            }),
          });
        } else {
          // Refund regular credit - use the amount from the original transaction
          const originalAmount = Math.abs(playerJoinTx.amount || 1);
          await storage.updatePlayer(playerId, {
            credits: (player.credits || 0) + originalAmount,
          });
          creditRefunded = true;

          await storage.createCreditTransaction({
            playerId,
            academyId: session.academyId || player.academyId,
            type: "refund",
            amount: originalAmount,
            reason: "session_cancel_early",
            sessionId,
            metadata: JSON.stringify({
              hoursBeforeSession: Math.round(hoursUntilSession),
              originalPaymentMethod: "credits",
              originalTransactionId: playerJoinTx.id,
              originalAmount: originalAmount,
            }),
          });
        }
      } else if (!isLateCancel && !playerJoinTx) {
        // No transaction found - log warning but don't refund to prevent abuse
        console.warn(`[Leave Session] No join transaction found for player ${playerId} session ${sessionId}. No refund issued.`);
      }

      // Notify and promote first player on waitlist
      const waitlistPlayers = await db.query.sessionWaitlist.findMany({
        where: (wl, { and: wlAnd, eq: wlEq }) => wlAnd(
          wlEq(wl.sessionId, sessionId),
          wlEq(wl.status, "waiting")
        ),
        orderBy: (wl, { asc: wlAsc }) => wlAsc(wl.joinedAt),
      });

      let waitlistPromoted = false;
      const sessionCredits = session.sessionType === "private" ? 2 : 1;
      
      // Promote first eligible waitlist player to the session (with credit deduction)
      // Loop through waitlist until we find someone who can pay
      for (const waitlistEntry of waitlistPlayers) {
        if (waitlistPromoted) break; // Stop once someone is promoted
        
        const waitlistPlayer = await storage.getPlayer(waitlistEntry.playerId);
        if (!waitlistPlayer) continue;
        
        const playerCredits = waitlistPlayer.credits || 0;
        const playerMakeUpCredits = waitlistPlayer.makeUpCredits || 0;
        
        let canPromote = false;
        let useMakeUp = false;
        
        // Prefer make-up credits, then regular credits
        if (playerMakeUpCredits > 0) {
          canPromote = true;
          useMakeUp = true;
        } else if (playerCredits >= sessionCredits) {
          canPromote = true;
          useMakeUp = false;
        }
        
        if (canPromote) {
          try {
            // Use database transaction for atomicity - all or nothing
            await db.transaction(async (tx) => {
              // Step 1: Atomically deduct credits with guard to prevent negative balance
              // Uses raw SQL column references for concurrency safety
              if (useMakeUp) {
                const result = await tx.update(players)
                  .set({ makeUpCredits: sql`GREATEST(0, COALESCE(make_up_credits, 0) - 1)` })
                  
          .where(and(
                    eq(players.id, waitlistPlayer.id),
                    sql`COALESCE(make_up_credits, 0) > 0`
                  ))
                  .returning({ id: players.id });
                
                if (result.length === 0) {
                  throw new Error("Insufficient make-up credits (concurrent deduction)");
                }
              } else {
                const result = await tx.update(players)
                  .set({ credits: sql`GREATEST(0, COALESCE(credits, 0) - ${sessionCredits})` })
                  
          .where(and(
                    eq(players.id, waitlistPlayer.id),
                    sql`COALESCE(credits, 0) >= ${sessionCredits}`
                  ))
                  .returning({ id: players.id });
                
                if (result.length === 0) {
                  throw new Error("Insufficient credits (concurrent deduction)");
                }
              }
              
              // Step 2: Add player to session
              await tx.insert(sessionPlayers).values({
                sessionId,
                playerId: waitlistPlayer.id,
              });
              
              // Step 3: Log the credit transaction
              await tx.insert(creditTransactions).values({
                playerId: waitlistPlayer.id,
                academyId: session.academyId || waitlistPlayer.academyId,
                type: "debit",
                amount: useMakeUp ? 0 : -sessionCredits,
                reason: useMakeUp ? "make_up_lesson_used" : "session_join",
                sessionId,
                metadata: JSON.stringify({
                  sessionType: session.sessionType,
                  paymentMethod: useMakeUp ? "make_up_credit" : "credits",
                  makeUpUsed: useMakeUp,
                  promotedFromWaitlist: true,
                }),
              });
              
              // Step 4: Update waitlist status to promoted
              await tx.update(sessionWaitlist)
                .set({ status: "promoted" })
                .where(eq(sessionWaitlist.id, waitlistEntry.id));
            });
            
            // Transaction succeeded - mark as promoted
            waitlistPromoted = true;
            
            // Step 5: Notify the promoted player (outside transaction, non-critical)
            if (waitlistPlayer.userId) {
              await storage.createScheduledNotification({
                userId: waitlistPlayer.userId,
                playerId: waitlistPlayer.id,
                title: "You're In!",
                body: useMakeUp 
                  ? `You've been promoted from the waitlist! Make-up credit used.`
                  : `You've been promoted from the waitlist! ${sessionCredits} credit(s) deducted.`,
                type: "waitlist_promoted",
                metadata: JSON.stringify({
                  sessionId,
                  sessionType: session.sessionType,
                  startTime: session.startTime,
                  creditsUsed: useMakeUp ? 0 : sessionCredits,
                  makeUpUsed: useMakeUp,
                }),
                scheduledFor: new Date(),
              });
            }
          } catch (promotionError) {
            // Transaction rolled back - try next waitlist player
            console.error(`[Waitlist] Promotion transaction failed for player ${waitlistPlayer.id}:`, promotionError);
            continue;
          }
        } else {
          // Player doesn't have enough credits - notify and continue to next
          if (waitlistPlayer.userId) {
            await storage.createScheduledNotification({
              userId: waitlistPlayer.userId,
              playerId: waitlistPlayer.id,
              title: "Spot Available - Credits Needed",
              body: `A spot opened up but you need ${sessionCredits} credit(s) to join.`,
              type: "waitlist_credits_needed",
              metadata: JSON.stringify({
                sessionId,
                sessionType: session.sessionType,
                creditsNeeded: sessionCredits,
              }),
              scheduledFor: new Date(),
            });
          }
          // Update waitlist status to show they were notified but continue loop
          await db.update(sessionWaitlist)
            .set({ status: "insufficient_credits" })
            .where(eq(sessionWaitlist.id, waitlistEntry.id));
        }
      }

      // Only notify make-up credit holders if no waitlist promotion happened (spot is still open)
      const academyId = session.academyId || player.academyId;
      if (academyId && !waitlistPromoted) {
        const playersWithMakeUp = await db.query.players.findMany({
          where: (p, { and: pAnd, eq: pEq, gt: pGt }) => pAnd(
            pEq(p.academyId, academyId),
            pGt(p.makeUpCredits, 0)
          ),
        });

        // Filter out the player who left and limit notifications
        const eligiblePlayers = playersWithMakeUp
          .filter(p => p.id !== playerId && p.userId)
          .slice(0, 5);

        for (const makeUpPlayer of eligiblePlayers) {
          await storage.createScheduledNotification({
            userId: makeUpPlayer.userId!,
            playerId: makeUpPlayer.id,
            title: "Spot Available!",
            body: `A spot opened up in a ${session.sessionType} session. Use your make-up credit!`,
            type: "make_up_opportunity",
            metadata: JSON.stringify({
              sessionId,
              sessionType: session.sessionType,
              startTime: session.startTime,
              locationName: session.locationName || session.location,
            }),
            scheduledFor: new Date(),
          });
        }
      }

      const refundMessage = makeUpRefunded 
        ? "Make-up credit refunded." 
        : creditRefunded 
          ? "Credit refunded." 
          : "No refund (late cancellation).";

      res.json({ 
        success: true, 
        message: `You've left the session. ${refundMessage}${waitlistPromoted ? " Waitlist player promoted to your spot." : ""}`,
        creditRefunded,
        makeUpRefunded,
        hoursBeforeSession: Math.round(hoursUntilSession),
        waitlistPromoted,
        waitlistCount: waitlistPlayers.length,
      });
    } catch (error) {
      console.error("Leave session error:", error);
      res.status(500).json({ error: "Failed to leave session" });
    }
  });

  // Join session waitlist
  router.post("/api/play/sessions/:sessionId/waitlist", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { sessionId } = req.params;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      // Check if already on waitlist
      const existingWaitlist = await db.query.sessionWaitlist.findFirst({
        where: (w, { and, eq }) => and(
          eq(w.sessionId, sessionId),
          eq(w.playerId, playerId),
          eq(w.status, "waiting")
        ),
      });

      if (existingWaitlist) {
        return res.status(400).json({ error: "Already on the waitlist" });
      }

      // Get current position
      const waitlistCount = await db.query.sessionWaitlist.findMany({
        where: (w, { and, eq }) => and(
          eq(w.sessionId, sessionId),
          eq(w.status, "waiting")
        ),
      });

      const position = waitlistCount.length + 1;

      await db.insert(sessionWaitlist).values({
        sessionId,
        playerId,
        position,
        xpBonusOnJoin: 5,
        status: "waiting",
      });

      res.json({ 
        success: true, 
        position,
        message: `You're #${position} on the waitlist. +5 XP if you get in!` 
      });
    } catch (error) {
      console.error("Join waitlist error:", error);
      res.status(500).json({ error: "Failed to join waitlist" });
    }
  });

  // ==================== COACH BOOKING REQUESTS ====================

  // Get coach's booking requests
  router.get("/api/coach/booking-requests", authMiddleware, requireAcademy, async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      
      if (!coachId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const status = req.query.status as string | undefined;
      const requests = await storage.getBookingRequests({ coachId, academyId: academyId || undefined, status });

      res.json(requests);
    } catch (error) {
      console.error("Coach booking requests error:", error);
      res.status(500).json({ error: "Failed to fetch booking requests" });
    }
  });

  // Approve a booking request
  router.post("/api/coach/booking-requests/:id/approve", authMiddleware, requireAcademy, async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      const { id } = req.params;
      
      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const request = await storage.getBookingRequest(id);
      if (!request) {
        return res.status(404).json({ error: "Booking request not found" });
      }

      if (request.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized to access this request" });
      }

      if (request.coachId && request.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to approve this request" });
      }

      if (request.status !== "pending") {
        return res.status(400).json({ error: "Only pending requests can be approved" });
      }

      const result = await storage.approveBookingRequest(id, coachId);

      await storage.createAuditLog({
        academyId: request.academyId,
        entityType: "booking_request",
        entityId: id,
        action: "approve",
        performedBy: coachId,
        performedByRole: "coach",
      });

      res.json(result);
    } catch (error) {
      console.error("Approve booking request error:", error);
      res.status(500).json({ error: "Failed to approve booking request" });
    }
  });

  // Decline a booking request
  router.post("/api/coach/booking-requests/:id/decline", authMiddleware, requireAcademy, async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      const { id } = req.params;
      const { reason } = req.body;
      
      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const request = await storage.getBookingRequest(id);
      if (!request) {
        return res.status(404).json({ error: "Booking request not found" });
      }

      if (request.academyId !== academyId) {
        return res.status(403).json({ error: "Not authorized to access this request" });
      }

      if (request.coachId && request.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to decline this request" });
      }

      if (request.status !== "pending") {
        return res.status(400).json({ error: "Only pending requests can be declined" });
      }

      const updated = await storage.updateBookingRequest(id, {
        status: "declined",
        respondedBy: coachId,
        respondedAt: new Date(),
        responseNote: reason || null,
      });

      await storage.createAuditLog({
        academyId: request.academyId,
        entityType: "booking_request",
        entityId: id,
        action: "decline",
        performedBy: coachId,
        performedByRole: "coach",
      });

      res.json(updated);
    } catch (error) {
      console.error("Decline booking request error:", error);
      res.status(500).json({ error: "Failed to decline booking request" });
    }
  });

  // ==================== COACH AVAILABILITY MANAGEMENT ====================

  // Get coach's availability
  router.get("/api/coach/availability", authMiddleware, requireAcademy, async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      
      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const savedAvailability = await storage.getCoachAvailability(coachId, academyId);

      res.json(savedAvailability);
    } catch (error) {
      console.error("Coach availability error:", error);
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  // Create availability slot
  router.post("/api/coach/availability", authMiddleware, requireAcademy, async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      
      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const { weekday, startTime, endTime, locationId, courtId, sessionTypes, slotDuration } = req.body;

      if (weekday === undefined || !startTime || !endTime) {
        return res.status(400).json({ error: "weekday, startTime, and endTime are required" });
      }

      const slot = await storage.createCoachAvailability({
        academyId,
        coachId,
        weekday,
        startTime,
        endTime,
        locationId: locationId || null,
        courtId: courtId || null,
        sessionTypes: sessionTypes || null,
        slotDuration: slotDuration || 60,
        isActive: true,
      });

      res.status(201).json(slot);
    } catch (error) {
      console.error("Create availability error:", error);
      res.status(500).json({ error: "Failed to create availability" });
    }
  });

  // Update availability slot
  router.patch("/api/coach/availability/:id", authMiddleware, requireAcademy, async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const { id } = req.params;
      
      if (!coachId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const updated = await storage.updateCoachAvailability(id, req.body);

      res.json(updated);
    } catch (error) {
      console.error("Update availability error:", error);
      res.status(500).json({ error: "Failed to update availability" });
    }
  });

  // Delete availability slot
  router.delete("/api/coach/availability/:id", authMiddleware, requireAcademy, async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const { id } = req.params;
      
      if (!coachId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      await storage.deleteCoachAvailability(id);

      res.json({ success: true });
    } catch (error) {
      console.error("Delete availability error:", error);
      res.status(500).json({ error: "Failed to delete availability" });
    }
  });
  // ==================== COACH AVAILABILITY BY ID (Frontend expects these routes) ====================

  // Get coach availability by coach ID
  router.get("/api/coaches/:coachId/availability", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      const academyId = req.user?.academyId || "default-academy";
      
      const savedAvailability = await storage.getCoachAvailability(coachId, academyId);
      res.json(savedAvailability);
    } catch (error) {
      console.error("Coach availability error:", error);
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  });

  // Update/save coach availability (full replacement)
  router.put("/api/coaches/:coachId/availability", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      const academyId = req.user?.academyId || "default-academy";
      const { availability, settings } = req.body;
      const isActive = settings?.availabilityPaused !== undefined ? !settings.availabilityPaused : undefined;
      
      // Delete existing availability for this coach
      await db.delete(coachAvailability).where(eq(coachAvailability.coachId, coachId));
      
      // Create new availability slots from weekly schedule
      if (availability && Array.isArray(availability)) {
        for (const day of availability) {
          if (day.isAvailable && day.timeBlocks?.length > 0) {
            for (const block of day.timeBlocks) {
              await db.insert(coachAvailability).values({
                id: crypto.randomUUID(),
                coachId,
                academyId,
                weekday: day.weekday,
                startTime: block.startTime,
                isActive: true,
                endTime: block.endTime,
                createdAt: new Date(),
              });
            }
          }
        }
      }
      
      // Update settings if isActive was provided
      if (isActive !== undefined) {
        const [existing] = await db.select().from(coachSettings).where(eq(coachSettings.coachId, coachId));
        if (existing) {
          await db.update(coachSettings)
            .set({ availabilityPaused: !isActive, updatedAt: new Date() })
            .where(eq(coachSettings.coachId, coachId));
        } else {
          await db.insert(coachSettings).values({
            id: crypto.randomUUID(),
            coachId,
            minSessionLength: 60,
            bufferBetweenSessions: 0,
            availabilityPaused: !isActive,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
      
      const savedAvailability = await storage.getCoachAvailability(coachId, academyId);
      res.json(savedAvailability);
    } catch (error) {
      console.error("Update availability error:", error);
      res.status(500).json({ error: "Failed to update availability" });
    }
  });

  // Get coach settings (Smart Rules)
  router.get("/api/coaches/:coachId/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      
      const [settings] = await db.select().from(coachSettings).where(eq(coachSettings.coachId, coachId));
      
      if (!settings) {
        return res.json({
          minSessionLength: 60,
          bufferBetweenSessions: 0,
          availabilityPaused: false,
        });
      }
      
      res.json({
        minSessionLength: settings.minSessionLength || 60,
        bufferBetweenSessions: settings.bufferBetweenSessions || 0,
        availabilityPaused: settings.availabilityPaused || false,
      });
    } catch (error) {
      console.error("Coach settings error:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Update coach settings (Smart Rules)
  router.put("/api/coaches/:coachId/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      const { minSessionLength, bufferBetweenSessions, availabilityPaused } = req.body;
      
      const [existing] = await db.select().from(coachSettings).where(eq(coachSettings.coachId, coachId));
      
      if (existing) {
        await db.update(coachSettings)
          .set({
            minSessionLength: minSessionLength ?? existing.minSessionLength,
            bufferBetweenSessions: bufferBetweenSessions ?? existing.bufferBetweenSessions,
            availabilityPaused: availabilityPaused ?? existing.availabilityPaused,
            updatedAt: new Date(),
          })
          .where(eq(coachSettings.coachId, coachId));
      } else {
        await db.insert(coachSettings).values({
          id: crypto.randomUUID(),
          coachId,
          minSessionLength: minSessionLength ?? 60,
          bufferBetweenSessions: bufferBetweenSessions ?? 0,
          availabilityPaused: availabilityPaused ?? false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Get availability exceptions
  router.get("/api/coaches/:coachId/availability-exceptions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      
      const exceptions = await db.select()
        .from(availabilityExceptions)
        .where(eq(availabilityExceptions.coachId, coachId))
        .orderBy(desc(availabilityExceptions.startDate));
      
      res.json(exceptions);
    } catch (error) {
      console.error("Availability exceptions error:", error);
      res.status(500).json({ error: "Failed to fetch exceptions" });
    }
  });

  // Create availability exception
  router.post("/api/coaches/:coachId/availability-exceptions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      const { startDate, endDate, reason } = req.body;
      
      if (!startDate) {
        return res.status(400).json({ error: "startDate is required" });
      }
      
      const exception = await db.insert(availabilityExceptions).values({
        id: crypto.randomUUID(),
        coachId,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : new Date(startDate),
        reason: reason || "Not available",
        createdAt: new Date(),
      }).returning();
      
      res.json(exception[0]);
    } catch (error) {
      console.error("Create exception error:", error);
      res.status(500).json({ error: "Failed to create exception" });
    }
  });

  // Delete availability exception
  router.delete("/api/coaches/:coachId/availability-exceptions/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      await db.delete(availabilityExceptions).where(eq(availabilityExceptions.id, id));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Delete exception error:", error);
      res.status(500).json({ error: "Failed to delete exception" });
    }
  });
  // ==================== LOCATION TRAVEL TIMES ====================

  // Get all travel times for coach
  router.get("/api/coach/travel-times", authMiddleware, requireAcademy, async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      
      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const travelTimes = await db
        .select()
        .from(locationTravelTimes)
        
          .where(and(
          eq(locationTravelTimes.coachId, coachId),
          eq(locationTravelTimes.academyId, academyId)
        ));

      res.json(travelTimes);
    } catch (error) {
      console.error("Get travel times error:", error);
      res.status(500).json({ error: "Failed to get travel times" });
    }
  });

  // Create or update travel time between locations
  router.post("/api/coach/travel-times", authMiddleware, requireAcademy, async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      
      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const { fromLocationId, toLocationId, travelTimeMinutes } = req.body;

      if (!fromLocationId || !toLocationId || typeof travelTimeMinutes !== 'number') {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (fromLocationId === toLocationId) {
        return res.status(400).json({ error: "Cannot set travel time to same location" });
      }

      // Create bidirectional travel times (A→B and B→A)
      const directions = [
        { from: fromLocationId, to: toLocationId },
        { from: toLocationId, to: fromLocationId }, // Reverse direction
      ];
      
      const results = [];
      
      for (const dir of directions) {
        const existing = await db
          .select()
          .from(locationTravelTimes)
          
          .where(and(
            eq(locationTravelTimes.coachId, coachId),
            eq(locationTravelTimes.academyId, academyId),
            eq(locationTravelTimes.fromLocationId, dir.from),
            eq(locationTravelTimes.toLocationId, dir.to)
          ))
          .limit(1);

        let result;
        if (existing.length > 0) {
          // Update existing
          [result] = await db
            .update(locationTravelTimes)
            .set({ 
              travelTimeMinutes,
              updatedAt: new Date()
            })
            .where(eq(locationTravelTimes.id, existing[0].id))
            .returning();
        } else {
          // Create new
          [result] = await db
            .insert(locationTravelTimes)
            .values({
              coachId,
              academyId,
              fromLocationId: dir.from,
              toLocationId: dir.to,
              travelTimeMinutes,
            })
            .returning();
        }
        results.push(result);
      }

      res.json({ created: results, bidirectional: true });
    } catch (error) {
      console.error("Create travel time error:", error);
      res.status(500).json({ error: "Failed to create travel time" });
    }
  });

  // Delete travel time
  router.delete("/api/coach/travel-times/:id", authMiddleware, requireAcademy, async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const { id } = req.params;
      
      if (!coachId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      await db
        .delete(locationTravelTimes)
        
          .where(and(
          eq(locationTravelTimes.id, id),
          eq(locationTravelTimes.coachId, coachId)
        ));

      res.json({ success: true });
    } catch (error) {
      console.error("Delete travel time error:", error);
      res.status(500).json({ error: "Failed to delete travel time" });
    }
  });

  // ==================== PARENT PORTAL API ====================

  // Get parent's linked children
  router.get("/api/parent/children", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const playerId = req.user?.playerId;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // If user is a player, return their own info as a single child
      if (playerId) {
        const player = await storage.getPlayer(playerId);
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }
        return res.json({ 
          children: [{
            id: player.id,
            name: player.name,
            academyId: player.academyId,
            relationship: "self",
          }]
        });
      }

      // Otherwise fetch linked children
      const children = await storage.getParentChildren(userId);
      res.json({ children });
    } catch (error) {
      console.error("Get parent children error:", error);
      res.status(500).json({ error: "Failed to get children" });
    }
  });

  // Get invoices for a player (parent view)
  router.get("/api/parent/invoices/:playerId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check access: either the player themselves or a linked parent
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(userId, playerId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const invoices = await storage.getPlayerInvoices(playerId);
      
      // Get academy names for each invoice
      const invoicesWithAcademy = await Promise.all(invoices.map(async (inv) => {
        if (!inv.academyId) return { ...inv, academyName: null };
        const academy = await storage.getAcademy(inv.academyId);
        return { ...inv, academyName: academy?.name || null };
      }));

      res.json({ invoices: invoicesWithAcademy });
    } catch (error) {
      console.error("Get player invoices error:", error);
      res.status(500).json({ error: "Failed to get invoices" });
    }
  });

  // Get single invoice with details (parent view)
  router.get("/api/parent/invoices/:playerId/:invoiceId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId, invoiceId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check access
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(userId, playerId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || invoice.playerId !== playerId) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const academy = invoice.academyId ? await storage.getAcademy(invoice.academyId) : null;
      
      res.json({ 
        invoice: { 
          ...invoice, 
          academyName: academy?.name || null 
        } 
      });
    } catch (error) {
      console.error("Get invoice error:", error);
      res.status(500).json({ error: "Failed to get invoice" });
    }
  });

  // Get payments for a player (parent view)
  router.get("/api/parent/payments/:playerId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check access
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(userId, playerId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const payments = await storage.getPlayerPayments(playerId);
      res.json({ payments });
    } catch (error) {
      console.error("Get player payments error:", error);
      res.status(500).json({ error: "Failed to get payments" });
    }
  });

  // Get lesson overview for a player (parent view)
  router.get("/api/parent/lessons/:playerId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;
      const { month, year } = req.query;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check access
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(userId, playerId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const targetMonth = month ? parseInt(month as string) : new Date().getMonth() + 1;
      const targetYear = year ? parseInt(year as string) : new Date().getFullYear();

      const lessonSummary = await storage.getPlayerLessonSummary(playerId, targetMonth, targetYear);
      res.json({ summary: lessonSummary });
    } catch (error) {
      console.error("Get lesson summary error:", error);
      res.status(500).json({ error: "Failed to get lesson summary" });
    }
  });

  // Get parent settings
  router.get("/api/parent/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      let settings = await storage.getParentSettings(userId);
      
      // Create default settings if not exists
      if (!settings) {
        settings = await storage.createParentSettings({ userId });
      }

      res.json({ settings });
    } catch (error) {
      console.error("Get parent settings error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // Update parent settings
  router.patch("/api/parent/settings", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const updates = req.body;
      const settings = await storage.updateParentSettings(userId, updates);

      res.json({ settings });
    } catch (error) {
      console.error("Update parent settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Get parent dashboard summary
  router.get("/api/parent/dashboard/:playerId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check access
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(userId, playerId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const academy = player.academyId ? await storage.getAcademy(player.academyId) : null;
      
      // Get pending and overdue invoices
      const invoices = await storage.getPlayerInvoices(playerId);
      const pendingInvoices = invoices.filter(inv => inv.status === "pending");
      const overdueInvoices = invoices.filter(inv => inv.status === "pending" && inv.dueDate && new Date(inv.dueDate) < new Date());
      
      // Get current month lesson summary
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const lessonSummary = await storage.getPlayerLessonSummary(playerId, now.getMonth() + 1, now.getFullYear());
      
      // Get session-based billing (attended sessions with prices)
      const sessionBilling = await storage.getPlayerSessionBilling(playerId);

      res.json({
        player: {
          id: player.id,
          name: player.name,
        },
        academy: academy ? { id: academy.id, name: academy.name } : null,
        invoiceSummary: {
          pending: pendingInvoices.length + sessionBilling.unpaidCount,
          overdue: overdueInvoices.length,
          totalPending: pendingInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount || "0"), 0) + sessionBilling.unpaidTotal,
        },
        pendingInvoices: pendingInvoices.map(inv => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amount: parseFloat(inv.amount || "0"),
          dueDate: inv.dueDate,
          status: inv.status,
          description: inv.description,
        })),
        sessionBilling: {
          unpaidCount: sessionBilling.unpaidCount,
          unpaidTotal: sessionBilling.unpaidTotal,
          paidCount: sessionBilling.paidCount,
          paidTotal: sessionBilling.paidTotal,
        },
        lessonSummary,
      });
    } catch (error) {
      console.error("Get parent dashboard error:", error);
      res.status(500).json({ error: "Failed to get dashboard" });
    }
  });

  router.get("/api/parent/packages/:playerId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(userId, playerId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const packages = await storage.getPlayerPackages(playerId);
      const activePackages = packages.filter(pkg => 
        pkg.status === 'active' && pkg.remainingCredits > 0
      );
      
      const totalCredits = activePackages.reduce((sum, pkg) => sum + pkg.remainingCredits, 0);
      
      res.json({
        packages: packages.map(pkg => ({
          id: pkg.id,
          name: pkg.name || 'Package',
          totalCredits: pkg.totalCredits,
          remainingCredits: pkg.remainingCredits,
          expiryDate: pkg.expiryDate,
          status: pkg.status,
          purchaseDate: pkg.purchaseDate,
        })),
        summary: {
          activePackages: activePackages.length,
          totalCreditsRemaining: totalCredits,
        },
      });
    } catch (error) {
      console.error("Get parent packages error:", error);
      res.status(500).json({ error: "Failed to get packages" });
    }
  });

  router.get("/api/parent/invoices/:playerId/:invoiceId/html", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId, invoiceId } = req.params;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(userId, playerId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || invoice.playerId !== playerId) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const player = await storage.getPlayer(playerId);
      const academy = invoice.academyId ? await storage.getAcademy(invoice.academyId) : null;
      const settings = invoice.academyId ? await storage.getAcademySettings(invoice.academyId) : null;
      
      const lineItems = parseLineItems(invoice.lineItems);
      const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
      
      const invoiceData = {
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.createdAt?.toISOString() || new Date().toISOString(),
        dueDate: invoice.dueDate || new Date().toISOString(),
        academy: {
          name: academy?.name || 'Academy',
          email: settings?.contactEmail || undefined,
          phone: settings?.contactPhone || undefined,
        },
        player: {
          name: player?.name || 'Customer',
          email: player?.email || undefined,
          phone: player?.phone || undefined,
        },
        lineItems: lineItems.length > 0 ? lineItems : [{
          description: 'Tennis Lessons',
          quantity: 1,
          unitPrice: parseFloat(invoice.amount || '0'),
          total: parseFloat(invoice.amount || '0'),
        }],
        subtotal: subtotal || parseFloat(invoice.amount || '0'),
        total: parseFloat(invoice.amount || '0'),
        currency: invoice.currency || 'AED',
        notes: invoice.notes || undefined,
        status: invoice.status as 'pending' | 'paid' | 'overdue' | 'cancelled',
        paidAt: invoice.paidAt?.toISOString(),
      };
      
      const html = generateInvoiceHtml(invoiceData);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      console.error("Get parent invoice HTML error:", error);
      res.status(500).json({ error: "Failed to generate invoice" });
    }
  });

  // ==================== PARENT CREDIT STORE ====================

  router.get("/api/parent/credit-store/:playerId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const player = await storage.getPlayer(playerId);
      const isOwnPlayer = userPlayerId === playerId;
      const isParent = await storage.checkParentPlayerAccess(userId, playerId);
      if (!player || (!isOwnPlayer && !isParent)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Generate auto-priced packages from academy session pricing
      const CREDIT_QUANTITIES = [1, 5, 10, 20];
      const CREDIT_TYPES = ["private", "semi", "group"] as const;
      const CREDIT_TYPE_MAP: Record<string, string> = {
        private: "private",
        semi: "semi_private", 
        group: "group",
      };
      
      // Court Credits pricing: 1 credit = 5 AED (fixed)
      const COURT_CREDIT_VALUE_AED = 5;
      const COURT_CREDIT_QUANTITIES = [10, 25, 50, 100];
      
      const pricing = await storage.getAcademyPricing(player.academyId);
      
      const packages: Array<{
        id: string;
        name: string;
        creditType: string;
        credits: number;
        pricePerCredit: string;
        totalPrice: string;
        currency: string;
        validityDays: number;
        description?: string;
        isPopular?: boolean;
      }> = [];
      
      for (const creditType of CREDIT_TYPES) {
        const sessionPricing = pricing.find(p => p.sessionType === creditType);
        if (!sessionPricing || parseFloat(sessionPricing.pricePerSession) <= 0) {
          continue; // Skip if no pricing configured
        }
        
        const pricePerCredit = parseFloat(sessionPricing.pricePerSession);
        const currency = sessionPricing.currency || "AED";
        const creditTypeLabel = creditType === "semi" ? "Semi-Private" : 
                                creditType.charAt(0).toUpperCase() + creditType.slice(1);
        
        for (const credits of CREDIT_QUANTITIES) {
          const totalPrice = pricePerCredit * credits;
          packages.push({
            id: `auto-${creditType}-${credits}`,
            name: `${credits} ${creditTypeLabel} Credit${credits > 1 ? "s" : ""}`,
            creditType: CREDIT_TYPE_MAP[creditType],
            credits,
            pricePerCredit: pricePerCredit.toFixed(2),
            totalPrice: totalPrice.toFixed(2),
            currency,
            validityDays: 90,
            isPopular: credits === 10,
          });
        }
      }
      
      // Add Court Credits packages (1 credit = 5 AED, for court bookings)
      for (const credits of COURT_CREDIT_QUANTITIES) {
        const totalPrice = COURT_CREDIT_VALUE_AED * credits;
        packages.push({
          id: `auto-court-${credits}`,
          name: `${credits} Court Credit${credits > 1 ? "s" : ""}`,
          creditType: "court",
          credits,
          pricePerCredit: COURT_CREDIT_VALUE_AED.toFixed(2),
          totalPrice: totalPrice.toFixed(2),
          currency: "AED",
          validityDays: 180,
          description: "Use for court bookings",
          isPopular: credits === 50,
        });
      }

      res.json(packages);
    } catch (error) {
      console.error("Get credit store error:", error);
      res.status(500).json({ error: "Failed to load credit store" });
    }
  });

  router.get("/api/parent/academy-payment-info/:playerId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const player = await storage.getPlayer(playerId);
      const isOwnPlayer = userPlayerId === playerId;
      const isParent = await storage.checkParentPlayerAccess(userId, playerId);
      if (!player || (!isOwnPlayer && !isParent)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const academy = await storage.getAcademy(player.academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      const settings = await storage.getAcademySettings(player.academyId);
      const currency = settings?.currency || "AED";

      res.json({
        acceptsCash: (academy as any).acceptsCash !== false,
        acceptsBankTransfer: (academy as any).acceptsBankTransfer !== false,
        bankName: (academy as any).bankName,
        bankAccountNumber: (academy as any).bankAccountNumber,
        bankIban: (academy as any).bankIban,
        bankAccountHolder: (academy as any).bankAccountHolder,
        bankSwiftCode: (academy as any).bankSwiftCode,
        paymentInstructions: (academy as any).paymentInstructions,
        currency,
      });
    } catch (error) {
      console.error("Get academy payment info error:", error);
      res.status(500).json({ error: "Failed to load payment info" });
    }
  });

  router.post("/api/parent/purchase-credits", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { playerId, templateId, pin, paymentMethod } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!playerId || !templateId || !pin) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const player = await storage.getPlayer(playerId);
      const userPlayerId = req.user?.playerId;
      const isOwnPlayer = userPlayerId === playerId;
      const isParent = await storage.checkParentPlayerAccess(userId, playerId);
      if (!player || (!isOwnPlayer && !isParent)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get the academy owner's PIN for verification
      // Uses the same PIN as Parent Dashboard access
      const academy = await storage.getAcademy(player.academyId);
      if (!academy) {
        return res.status(404).json({ error: "Academy not found" });
      }

      // Get the academy owner (primary coach) for PIN verification
      let ownerCoach = academy.ownerId ? await storage.getCoach(academy.ownerId) : null;
      
      // Fallback: if no owner set, get first coach of academy
      if (!ownerCoach) {
        const coaches = await storage.getCoachesByAcademy(player.academyId);
        ownerCoach = coaches[0] || null;
      }

      if (!ownerCoach) {
        return res.status(400).json({ error: "Academy owner not configured. Please contact support." });
      }

      const storedPin = ownerCoach.parentDashboardPin || "1234";
      if (pin !== storedPin) {
        return res.status(403).json({ error: "Incorrect PIN" });
      }

      // Handle auto-generated package IDs (e.g., "auto-private-5")
      let templateData: {
        name: string;
        creditType: string;
        credits: number;
        pricePerCredit: string;
        currency: string;
        validityDays: number;
      };

      if (templateId.startsWith("auto-")) {
        // Parse auto-generated package ID: auto-{sessionType}-{credits}
        const parts = templateId.split("-");
        if (parts.length !== 3) {
          return res.status(400).json({ error: "Invalid package ID" });
        }
        
        const sessionType = parts[1]; // private, semi, group
        const credits = parseInt(parts[2], 10);
        
        if (!["private", "semi", "group", "court"].includes(sessionType) || isNaN(credits) || credits <= 0) {
          return res.status(400).json({ error: "Invalid package configuration" });
        }
        
        // Handle court credits specially with fixed pricing
        let pricePerCredit: string;
        let currency: string = "AED";
        
        if (sessionType === "court") {
          // Court credits use fixed pricing (5 AED per credit)
          pricePerCredit = "5.00";
        } else {
          // Get current pricing from academy for session types
          const pricing = await storage.getAcademyPricing(player.academyId);
          const sessionPricing = pricing.find(p => p.sessionType === sessionType);
          
          if (!sessionPricing || parseFloat(sessionPricing.pricePerSession) <= 0) {
            return res.status(400).json({ error: "Pricing not configured for this session type" });
          }
          pricePerCredit = parseFloat(sessionPricing.pricePerSession).toFixed(2);
          currency = sessionPricing.currency || "AED";
        }
        
        
        const creditTypeMap: Record<string, string> = {
          private: "private",
          semi: "semi_private",
          group: "group",
          court: "court",
        };
        const creditTypeLabel = sessionType === "semi" ? "Semi-Private" : 
                                sessionType.charAt(0).toUpperCase() + sessionType.slice(1);
        
        templateData = {
          name: `${credits} ${creditTypeLabel} Credit${credits > 1 ? 's' : ''}`,
          creditType: creditTypeMap[sessionType],
          credits,
          pricePerCredit: pricePerCredit,
          currency: currency,
          validityDays: 90,
        };
      } else {
        // Legacy: lookup from package templates
        const template = await storage.getPackageTemplate(templateId);
        if (!template || template.academyId !== player.academyId) {
          return res.status(404).json({ error: "Package template not found" });
        }
        templateData = {
          name: template.name,
          creditType: template.creditType,
          credits: template.credits,
          pricePerCredit: template.pricePerCredit,
          currency: template.currency,
          validityDays: template.validityDays,
        };
      }

      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + templateData.validityDays);

      const pkg = await storage.createPackage({
        playerId,
        academyId: player.academyId,
        name: templateData.name,
        creditType: templateData.creditType,
        totalCredits: templateData.credits,
        remainingCredits: templateData.credits,
        purchasedAt: now,
        expiresAt,
        pricePerCredit: templateData.pricePerCredit,
        currency: templateData.currency,
        status: "active",
      });

      // Settle any outstanding debts for this player
      const playerPkgDebtSettlement = await storage.settlePlayerDebts(playerId, templateData.creditType, pkg.id);
      if (playerPkgDebtSettlement.settledCount > 0) {
        console.log(`[PlayerPackage] Settled ${playerPkgDebtSettlement.settledCount} debts for player ${playerId}`);
      }

      const totalAmount = (parseFloat(templateData.pricePerCredit) * templateData.credits).toFixed(2);
      const invoiceNumber = await storage.generateInvoiceNumber(player.academyId);
      const invoice = await storage.createInvoice({
        playerId,
        academyId: player.academyId,
        packageId: pkg.id,
        invoiceNumber,
        type: "package_purchase",
        amount: totalAmount,
        currency: templateData.currency,
        status: "pending",
        dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        lineItems: [{
          description: templateData.name,
          quantity: templateData.credits,
          unitPrice: templateData.pricePerCredit,
          total: totalAmount,
        }],
        paymentMethod: paymentMethod || "cash",
      } as any);

      res.json({ 
        success: true, 
        package: pkg, 
        invoice 
      });
    } catch (error) {
      console.error("Purchase credits error:", error);
      res.status(500).json({ error: "Failed to complete purchase" });
    }
  });

  router.get("/api/players/:playerId/credits-summary", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const userId = req.user?.id;
      const coachId = req.user?.coachId;

      if (!userId && !coachId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      if (!coachId && player.parentUserId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const packages = await storage.getPlayerPackages(playerId);
      const activePackages = packages.filter(p => p.status === "active" && p.remainingCredits > 0);

      const credits: Record<string, number> = {
        group: 0,
        court: 0,
        private: 0,
        semi_private: 0,
      };

      activePackages.forEach(pkg => {
        const type = pkg.creditType as keyof typeof credits;
        if (type in credits) {
          credits[type] += pkg.remainingCredits;
        }
      });

      res.json({ credits });
    } catch (error) {
      console.error("Get credits summary error:", error);
      res.status(500).json({ error: "Failed to get credits summary" });
    }
  });

  // ==================== COACH REVIEW SYSTEM ====================

  // Helper: Get player age category from date of birth
  function getAgeCategory(dateOfBirth: string | Date | null): "kid" | "teen" | "adult" {
    if (!dateOfBirth) return "adult";
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    if (age < 13) return "kid";
    if (age < 18) return "teen";
    return "adult";
  }

  // Check if player is eligible to review a coach (requires 3+ sessions)
  router.get("/api/player/review-eligibility/:coachId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { coachId } = req.params;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      // Count completed sessions with this coach
      const sessionCount = await storage.getPlayerCoachSessionCount(playerId, coachId);
      const hasExistingReview = await storage.hasPlayerReviewedCoach(playerId, coachId);
      
      // Check for pending review prompt
      const pendingPrompt = await storage.getPendingReviewPrompt(playerId, coachId);
      
      const isEligible = sessionCount >= 3 && !hasExistingReview;
      
      res.json({
        eligible: isEligible,
        sessionCount,
        requiredSessions: 3,
        hasExistingReview,
        pendingPrompt: pendingPrompt ? {
          id: pendingPrompt.id,
          triggerType: pendingPrompt.triggerType,
        } : null,
      });
    } catch (error) {
      console.error("Check review eligibility error:", error);
      res.status(500).json({ error: "Failed to check eligibility" });
    }
  });

  // Get pending review prompts for player
  router.get("/api/player/review-prompts", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const prompts = await storage.getPlayerReviewPrompts(playerId);
      
      // Get coach info for each prompt
      const promptsWithCoaches = await Promise.all(
        prompts.map(async (prompt) => {
          const coach = await storage.getCoach(prompt.coachId);
          return {
            ...prompt,
            coach: coach ? { id: coach.id, name: coach.name } : null,
          };
        })
      );
      
      res.json(promptsWithCoaches);
    } catch (error) {
      console.error("Get review prompts error:", error);
      res.status(500).json({ error: "Failed to get prompts" });
    }
  });

  // Submit a review for a coach
  router.post("/api/player/reviews", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const parsed = submitReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const { coachId, coachingQuality, communication, withKidsBeginners, reliability, feedbackMotivation, whatDoesWell, bestForPlayerType } = parsed.data;

      // Verify eligibility
      const sessionCount = await storage.getPlayerCoachSessionCount(playerId, coachId);
      if (sessionCount < 3) {
        return res.status(403).json({ error: "You need at least 3 sessions with this coach to submit a review" });
      }

      const hasExistingReview = await storage.hasPlayerReviewedCoach(playerId, coachId);
      if (hasExistingReview) {
        return res.status(400).json({ error: "You have already reviewed this coach" });
      }

      // Get player info for semi-anonymous display
      const player = await storage.getPlayer(playerId);
      const reviewerAgeCategory = getAgeCategory(player?.dateOfBirth || null);
      const reviewerLevel = player?.level || "green";

      // Calculate overall score
      const overallScore = ((coachingQuality + communication + withKidsBeginners + reliability + feedbackMotivation) / 5).toFixed(2);

      const review = await storage.createCoachReview({
        coachId,
        playerId,
        academyId,
        coachingQuality,
        communication,
        withKidsBeginners,
        reliability,
        feedbackMotivation,
        overallScore,
        whatDoesWell: whatDoesWell ? sanitizeMessage(whatDoesWell) : null,
        bestForPlayerType: bestForPlayerType ? sanitizeMessage(bestForPlayerType) : null,
        reviewerAgeCategory,
        reviewerLevel,
        sessionCountAtReview: sessionCount,
      });

      // Update coach review stats
      await storage.updateCoachReviewStats(coachId);

      // Mark any pending prompt as completed
      await storage.completeReviewPrompt(playerId, coachId, review.id);

      res.status(201).json({
        id: review.id,
        message: "Review submitted successfully. It will be visible once the coach has more reviews.",
      });
    } catch (error) {
      console.error("Submit review error:", error);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });

  // Dismiss a review prompt
  router.post("/api/player/review-prompts/:promptId/dismiss", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { promptId } = req.params;
      
      if (!playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      await storage.dismissReviewPrompt(promptId, playerId);
      res.json({ success: true });
    } catch (error) {
      console.error("Dismiss prompt error:", error);
      res.status(500).json({ error: "Failed to dismiss prompt" });
    }
  });

  // Get coach review stats (public - for coach profiles)
  router.get("/api/coaches/:coachId/reviews", async (req: Request, res: Response) => {
    try {
      const { coachId } = req.params;
      
      // Get aggregated stats
      const stats = await storage.getCoachReviewStats(coachId);
      
      // Get visible reviews (snippets)
      const reviews = await storage.getVisibleCoachReviews(coachId, 10); // Top 10 reviews
      
      res.json({
        stats: stats ? {
          totalReviews: stats.visibleReviews || 0,
          averageOverall: stats.averageOverall ? parseFloat(stats.averageOverall.toString()) : null,
          categories: {
            coachingQuality: stats.avgCoachingQuality ? parseFloat(stats.avgCoachingQuality.toString()) : null,
            communication: stats.avgCommunication ? parseFloat(stats.avgCommunication.toString()) : null,
            withKidsBeginners: stats.avgWithKidsBeginners ? parseFloat(stats.avgWithKidsBeginners.toString()) : null,
            reliability: stats.avgReliability ? parseFloat(stats.avgReliability.toString()) : null,
            feedbackMotivation: stats.avgFeedbackMotivation ? parseFloat(stats.avgFeedbackMotivation.toString()) : null,
          },
          reviewerBreakdown: {
            kids: stats.kidReviewCount || 0,
            teens: stats.teenReviewCount || 0,
            adults: stats.adultReviewCount || 0,
          },
          levelBreakdown: {
            red: stats.redLevelCount || 0,
            orange: stats.orangeLevelCount || 0,
            green: stats.greenLevelCount || 0,
            yellow: stats.yellowLevelCount || 0,
          },
          bestForTags: stats.bestForTags || [],
        } : null,
        reviews: reviews.map(r => ({
          id: r.id,
          overallScore: parseFloat(r.overallScore.toString()),
          whatDoesWell: r.whatDoesWell,
          bestForPlayerType: r.bestForPlayerType,
          reviewerAgeCategory: r.reviewerAgeCategory,
          reviewerLevel: r.reviewerLevel,
          createdAt: r.createdAt,
          response: r.response ? {
            text: r.response.responseText,
            createdAt: r.response.createdAt,
          } : null,
        })),
        isVisible: stats && (stats.visibleReviews || 0) >= 3, // Only show stats if 3+ reviews
      });
    } catch (error) {
      console.error("Get coach reviews error:", error);
      res.status(500).json({ error: "Failed to get reviews" });
    }
  });

  // Coach: Respond to a review
  router.post("/api/coach/reviews/:reviewId/respond", authMiddleware, requireRole("coach", "admin", "academy_owner"), async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const { reviewId } = req.params;
      const { responseText } = req.body;
      
      if (!coachId) {
        return res.status(403).json({ error: "Coach profile required" });
      }

      if (!responseText || typeof responseText !== "string" || responseText.trim().length === 0) {
        return res.status(400).json({ error: "Response text is required" });
      }

      if (responseText.length > 500) {
        return res.status(400).json({ error: "Response must be 500 characters or less" });
      }

      // Verify the review is for this coach
      const review = await storage.getCoachReview(reviewId);
      if (!review || review.coachId !== coachId) {
        return res.status(404).json({ error: "Review not found" });
      }

      // Check if already responded
      const existingResponse = await storage.getReviewResponse(reviewId);
      if (existingResponse) {
        return res.status(400).json({ error: "You have already responded to this review" });
      }

      const response = await storage.createReviewResponse({
        reviewId,
        coachId,
        responseText: sanitizeMessage(responseText.trim()),
      });

      res.status(201).json({
        id: response.id,
        message: "Response submitted successfully",
      });
    } catch (error) {
      console.error("Respond to review error:", error);
      res.status(500).json({ error: "Failed to submit response" });
    }
  });

  // Coach: Get my reviews
  router.get("/api/coach/my-reviews", authMiddleware, requireRole("coach", "admin", "academy_owner"), async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      
      if (!coachId) {
        return res.status(403).json({ error: "Coach profile required" });
      }

      const reviews = await storage.getCoachReviewsForCoach(coachId);
      const stats = await storage.getCoachReviewStats(coachId);
      
      res.json({
        stats: stats ? {
          totalReviews: stats.totalReviews || 0,
          visibleReviews: stats.visibleReviews || 0,
          averageOverall: stats.averageOverall ? parseFloat(stats.averageOverall.toString()) : null,
        } : null,
        reviews: reviews.map(r => ({
          id: r.id,
          coachingQuality: r.coachingQuality,
          communication: r.communication,
          withKidsBeginners: r.withKidsBeginners,
          reliability: r.reliability,
          feedbackMotivation: r.feedbackMotivation,
          overallScore: parseFloat(r.overallScore.toString()),
          whatDoesWell: r.whatDoesWell,
          bestForPlayerType: r.bestForPlayerType,
          reviewerAgeCategory: r.reviewerAgeCategory,
          reviewerLevel: r.reviewerLevel,
          isVisible: r.isVisible,
          createdAt: r.createdAt,
          response: r.response,
        })),
      });
    } catch (error) {
      console.error("Get my reviews error:", error);
      res.status(500).json({ error: "Failed to get reviews" });
    }
  });

  // Flag a review (anyone can flag)
  router.post("/api/reviews/:reviewId/flag", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { reviewId } = req.params;
      const { reason, details } = req.body;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!reason || !["inappropriate", "fake", "spam", "other"].includes(reason)) {
        return res.status(400).json({ error: "Valid reason is required (inappropriate, fake, spam, or other)" });
      }

      const review = await storage.getCoachReview(reviewId);
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

      await storage.createReviewFlag({
        reviewId,
        flaggedBy: userId,
        reason,
        details: details ? sanitizeMessage(details) : null,
      });

      res.status(201).json({ message: "Review flagged for moderation" });
    } catch (error) {
      console.error("Flag review error:", error);
      res.status(500).json({ error: "Failed to flag review" });
    }
  });

  // Platform Owner: Get flagged reviews for moderation
  router.get("/api/platform/review-flags", authMiddleware, requireRole("platform_owner"), async (req: AuthRequest, res: Response) => {
    try {
      const { status = "pending" } = req.query;
      
      const flags = await storage.getReviewFlags(status as string);
      
      res.json(flags);
    } catch (error) {
      console.error("Get review flags error:", error);
      res.status(500).json({ error: "Failed to get flags" });
    }
  });

  // Platform Owner: Moderate a review (hide/unhide)
  router.post("/api/platform/reviews/:reviewId/moderate", authMiddleware, requireRole("platform_owner"), async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { reviewId } = req.params;
      const { action, reason, internalNote } = req.body;
      
      if (!["hide", "unhide", "dismiss_flags"].includes(action)) {
        return res.status(400).json({ error: "Valid action is required (hide, unhide, or dismiss_flags)" });
      }

      const review = await storage.getCoachReview(reviewId);
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

      if (action === "hide") {
        await storage.hideReview(reviewId, userId!, reason || "Moderation decision");
        await storage.updateCoachReviewStats(review.coachId);
      } else if (action === "unhide") {
        await storage.unhideReview(reviewId);
        await storage.updateCoachReviewStats(review.coachId);
      } else if (action === "dismiss_flags") {
        await storage.dismissReviewFlags(reviewId, userId!, internalNote);
      }

      res.json({ success: true, message: `Review ${action} successful` });
    } catch (error) {
      console.error("Moderate review error:", error);
      res.status(500).json({ error: "Failed to moderate review" });
    }
  });

  // ==================== COURT BOOKING MARKETPLACE ====================

  // Get all courts availability for a date (Playtomic-style quick booking)
  router.get("/api/courts/availability", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const academyId = req.user?.academyId;
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({ error: "date is required" });
      }

      // Get all courts accessible to this user
      const courts = await storage.searchCourts({
        userId,
        userAcademyId: academyId,
        limit: 50,
        offset: 0,
      });

      // Generate time slots for each court
      const slots: Array<{
        courtId: string;
        courtName: string;
        time: string;
        available: boolean;
        coachBusy: boolean;
        price?: string;
        currency?: string;
      }> = [];

      const timeSlots: string[] = [];
      for (let h = 6; h < 22; h++) {
        timeSlots.push(`${String(h).padStart(2, '0')}:00`);
        timeSlots.push(`${String(h).padStart(2, '0')}:30`);
      }
      timeSlots.push("22:00");

      const allSessions = academyId ? await storage.getSessionsByAcademy(academyId) : [];
      const dateStr = date as string;

      const coachIdToCheck = (req.query.coachId as string) || req.user!.coachId;

      const dateSessionsMap = new Map<string, Set<string>>();
      const coachBusySlots = new Set<string>();

      for (const session of allSessions) {
        if (session.status === "cancelled") continue;
        const sessionDateUTC = new Date(session.startTime);
        const sessionDateDubai = toDubaiTime(sessionDateUTC);
        const sessionDateStr = sessionDateDubai.toISOString().split('T')[0];
        if (sessionDateStr !== dateStr) continue;

        const startH = sessionDateDubai.getUTCHours();
        const startM = sessionDateDubai.getUTCMinutes();
        const endDateDubai = session.endTime ? toDubaiTime(new Date(session.endTime)) : null;
        const endTotalMins = endDateDubai
          ? endDateDubai.getUTCHours() * 60 + endDateDubai.getUTCMinutes()
          : startH * 60 + startM + 60;

        const sessionSlots: string[] = [];
        let m = startH * 60 + startM;
        while (m < endTotalMins) {
          const hh = Math.floor(m / 60);
          const mm = m % 60;
          sessionSlots.push(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
          m += 30;
        }

        if (session.courtId) {
          if (!dateSessionsMap.has(session.courtId)) {
            dateSessionsMap.set(session.courtId, new Set());
          }
          for (const slot of sessionSlots) {
            dateSessionsMap.get(session.courtId)!.add(slot);
          }
        }

        if (coachIdToCheck && session.coachId === coachIdToCheck) {
          for (const slot of sessionSlots) {
            coachBusySlots.add(slot);
          }
        }
      }

      for (const court of courts) {
        const availability = await storage.getCourtAvailability(court.id, date as string);
        const bookedTimes = new Set(availability.filter(a => !a.available).map(a => a.time));
        const sessionBookedSlots = dateSessionsMap.get(court.id) || new Set<string>();

        for (const time of timeSlots) {
          const isBlockedBySession = sessionBookedSlots.has(time);
          const isBlockedByAvailability = bookedTimes.has(time);

          slots.push({
            courtId: court.id,
            courtName: court.name,
            time,
            available: !isBlockedBySession && !isBlockedByAvailability,
            coachBusy: coachBusySlots.has(time),
            price: court.pricePerHour,
            currency: court.currency || "AED",
          });
        }
      }

      res.json({
        courts: courts.map(c => ({
          id: c.id,
          name: c.name,
          surface: c.surface,
          pricePerHour: c.pricePerHour,
          currency: c.currency || "AED",
        })),
        slots,
      });
    } catch (error) {
      console.error("Get courts availability error:", error);
      res.status(500).json({ error: "Failed to get availability" });
    }
  });

  // Search public courts (available for all users)
  router.get("/api/courts/search", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const academyId = req.user?.academyId;
      const { 
        date, 
        surface, 
        visibility, 
        minPrice, 
        maxPrice,
        location,
        limit = "20",
        offset = "0" 
      } = req.query;

      const searchDate = (date as string) || new Date().toISOString().split("T")[0];

      const courts = await storage.searchCourts({
        userId,
        userAcademyId: academyId,
        date: searchDate,
        surface: surface as string,
        visibility: visibility as string,
        minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
        location: location as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });

      // Get blocked slots for each court and calculate available time slots
      const TIME_SLOTS = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"];
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const nowTime = dubaiNow.toISOString().slice(11, 16);
      const dubaiDateStr = dubaiNow.toISOString().split("T")[0]; const isToday = searchDate === dubaiDateStr;

      const courtsWithAvailability = await Promise.all(courts.map(async (court) => {
        const blockedSlots = await storage.getCourtBlockedSlots(court.id, searchDate);
        
        // Calculate available slots
        const availableSlots: string[] = [];
        for (const slot of TIME_SLOTS) {
          // Skip past slots if today
          if (isToday && slot <= nowTime) continue;
          
          // Check if slot is blocked
          const isBlocked = blockedSlots.some(blocked => {
            return blocked.startTime <= slot && blocked.endTime > slot;
          });
          
          if (!isBlocked) {
            availableSlots.push(slot);
          }
        }
        
        // Get next 3 available slots for preview
        const nextAvailableSlots = availableSlots.slice(0, 3);
        const totalAvailable = availableSlots.length;
        
        return {
          ...court,
          nextAvailableSlots,
          totalAvailableSlots: totalAvailable,
          hasAvailability: totalAvailable > 0,
        };
      }));

      res.json(courtsWithAvailability);
    } catch (error) {
      console.error("Search courts error:", error);
      res.status(500).json({ error: "Failed to search courts" });
    }
  });

  // Get court details with availability
  router.get("/api/courts/:courtId/details", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { courtId } = req.params;
      const { date } = req.query;
      const userId = req.user?.userId;
      const userAcademyId = req.user?.academyId;

      const court = await storage.getCourtWithDetails(courtId, userId, userAcademyId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }

      // Get blocked slots (includes sessions, bookings, and manual blocks)
      const blockedSlots = date 
        ? await storage.getCourtBlockedSlots(courtId, date as string)
        : [];
      
      // Transform to availability format expected by frontend
      const availability = blockedSlots.map(slot => ({
        id: `${courtId}-${slot.startTime}`,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: slot.status,
        reason: slot.reason,
      }));

      res.json({ ...court, availability });
    } catch (error) {
      console.error("Get court details error:", error);
      res.status(500).json({ error: "Failed to get court details" });
    }
  });

  // Get court availability for a date range
  router.get("/api/courts/:courtId/availability", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { courtId } = req.params;
      const { startDate, endDate } = req.query;

      if (!startDate) {
        return res.status(400).json({ error: "startDate is required" });
      }

      const availability = await storage.getCourtAvailabilityRange(
        courtId, 
        startDate as string, 
        (endDate as string) || startDate as string
      );

      res.json(savedAvailability);
    } catch (error) {
      console.error("Get court availability error:", error);
      res.status(500).json({ error: "Failed to get availability" });
    }
  });

  // Create a court booking (player booking)
  router.post("/api/courts/:courtId/book", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const playerId = req.user?.playerId;
      const { courtId } = req.params;
      const { date, startTime, endTime, notes } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!date || !startTime || !endTime) {
        return res.status(400).json({ error: "date, startTime, and endTime are required" });
      }

      // Calculate duration
      const start = new Date(`${date}T${startTime}`);
      const end = new Date(`${date}T${endTime}`);
      const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

      if (durationMinutes <= 0) {
        return res.status(400).json({ error: "Invalid time range" });
      }

      // Get court to check rules and pricing
      const court = await storage.getCourt(courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }

      // Check if user can book this court
      const userAcademyId = req.user?.academyId;
      const canBook = court.visibility === "public" || 
        (court.visibility === "academy" && court.academyId === userAcademyId);
      
      if (!canBook) {
        return res.status(403).json({ error: "You don't have access to book this court" });
      }

      // Check duration limits
      if (durationMinutes < (court.minBookingDurationMinutes || 60)) {
        return res.status(400).json({ error: `Minimum booking duration is ${court.minBookingDurationMinutes || 60} minutes` });
      }
      if (durationMinutes > ((court.maxBookingDurationHours || 2) * 60)) {
        return res.status(400).json({ error: `Maximum booking duration is ${court.maxBookingDurationHours || 2} hours` });
      }

      // Check availability
      const isAvailable = await storage.checkCourtAvailability(courtId, date, startTime, endTime);
      if (!isAvailable) {
        return res.status(409).json({ error: "This time slot is not available" });
      }

      // Calculate price
      const hours = durationMinutes / 60;
      const isMember = court.academyId === userAcademyId;
      const pricePerHour = isMember && court.memberPricePerHour 
        ? parseFloat(court.memberPricePerHour)
        : parseFloat(court.pricePerHour || "0");
      const price = pricePerHour * hours;

      // Determine booking type
      const bookingType = court.visibility === "public" ? "public" : "academy";

      // Create booking
      const booking = await storage.createCourtBooking({
        courtId,
        userId,
        playerId: playerId || null,
        academyId: court.academyId,
        date,
        startTime,
        endTime,
        durationMinutes,
        bookingType,
        price: price.toFixed(2),
        currency: court.currency || "AED",
        paymentStatus: price === 0 ? "free" : "pending",
        status: court.requiresApproval ? "pending" : "confirmed",
        notes: notes ? sanitizeMessage(notes) : null,
      });

      // Mark time slot as booked
      await storage.updateCourtAvailabilityStatus(courtId, date, startTime, endTime, "booked");

      // Handle friend invites if provided
      const { inviteFriendIds } = req.body;
      if (inviteFriendIds && Array.isArray(inviteFriendIds) && inviteFriendIds.length > 0 && playerId) {
        try {
          const friendCount = inviteFriendIds.length;
          const splitCost = price > 0;
          const costPerPerson = splitCost ? (price / (friendCount + 1)).toFixed(2) : null;
          
          const inviteResult = await db.insert(bookingInvites).values({
            bookingId: booking.id,
            hostPlayerId: playerId,
            splitCost,
            costPerPerson,
            currency: court.currency || "AED",
            maxGuests: 3,
            totalInvited: friendCount,
            totalAccepted: 0,
          }).returning();
          
          const invite = inviteResult[0];
          
          for (const friendId of inviteFriendIds) {
            await db.insert(bookingInviteGuests).values({
              inviteId: invite.id,
              playerId: friendId,
              status: "pending",
              shareAmount: costPerPerson,
            });
            
            const friend = await storage.getPlayer(friendId);
            if (friend) {
              await storage.createNotification({
                type: "booking_invite",
                title: "Court Booking Invite",
                message: `You've been invited to play on ${date} at ${startTime}`,
                userId: null,
                playerId: friendId,
                academyId: court.academyId,
                data: { bookingId: booking.id, inviteId: invite.id },
              });
            }
          }
        } catch (inviteError) {
          console.error("Failed to create booking invites:", inviteError);
        }
      }

      // Handle create open match if requested
      const { createOpenMatch } = req.body;
      if (createOpenMatch && playerId) {
        try {
          const [match] = await db.insert(openMatches).values({
            bookingId: booking.id,
            hostPlayerId: playerId,
            academyId: court.academyId,
            matchType: "singles",
            title: `Open Match at ${court.name || "Court"}`,
            description: `Join me for a game on ${date} at ${startTime}`,
            requiredLevelMin: 1,
            requiredLevelMax: 20,
            requiredBallLevel: null,
            maxPlayers: 2,
            currentPlayers: 1,
            invitedPlayerId: invitedPlayerId || null,
        status: invitedPlayerId ? "pending_invite" : "open",
        matchIntent: matchIntent || "friendly",
            visibility: "academy",
            costPerPlayer: price > 0 ? (price / 2).toFixed(2) : null,
            currency: court.currency || "AED",
            xpBonus: 25,
          }).returning();

          // Add host as first slot
          await db.insert(openMatchSlots).values({
            matchId: match.id,
            playerId,
            role: "host",
            status: "confirmed",
          });
        } catch (openMatchError) {
          console.error("Failed to create open match:", openMatchError);
        }
      }

      res.status(201).json(booking);
    } catch (error) {
      console.error("Create court booking error:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // Get user's court bookings
  router.get("/api/my-court-bookings", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { status, startDate, endDate } = req.query;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const bookings = await storage.getUserCourtBookings(userId, {
        status: status as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });

      res.json(bookings);
    } catch (error) {
      console.error("Get my court bookings error:", error);
      res.status(500).json({ error: "Failed to get bookings" });
    }
  });

  // Cancel a court booking
  router.post("/api/court-bookings/:bookingId/cancel", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { bookingId } = req.params;
      const { reason } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const booking = await storage.getCourtBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Check ownership
      if (booking.userId !== userId) {
        return res.status(403).json({ error: "You can only cancel your own bookings" });
      }

      // Check if already cancelled
      if (booking.status === "cancelled") {
        return res.status(400).json({ error: "Booking is already cancelled" });
      }

      // Get court for cancel window check
      const court = await storage.getCourt(booking.courtId);
      const bookingDateTime = new Date(`${booking.date}T${booking.startTime}`);
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const hoursUntilBooking = (bookingDateTime.getTime() - now.getTime()) / 3600000;
      
      if (court && hoursUntilBooking < (court.cancelWindowHours || 24)) {
        return res.status(400).json({ 
          error: `Cancellations must be made at least ${court.cancelWindowHours || 24} hours before the booking` 
        });
      }

      // Cancel booking
      await storage.cancelCourtBooking(bookingId, userId, reason);

      // Release time slot
      await storage.updateCourtAvailabilityStatus(
        booking.courtId, 
        booking.date, 
        booking.startTime, 
        booking.endTime, 
        "available"
      );

      res.json({ success: true, message: "Booking cancelled" });
    } catch (error) {
      console.error("Cancel court booking error:", error);
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  });

  // ==================== COACH COURT BLOCKING ====================

  // Coach blocks court for training
  router.post("/api/courts/:courtId/block", authMiddleware, requireRole("coach", "academy_owner", "platform_owner"), async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { courtId } = req.params;
      const { date, startTime, endTime, reason } = req.body;

      if (!date || !startTime || !endTime) {
        return res.status(400).json({ error: "date, startTime, and endTime are required" });
      }

      // Check if coach has access to this court
      const court = await storage.getCourt(courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }

      const userAcademyId = req.user?.academyId;
      if (court.academyId !== userAcademyId && req.user?.role !== "platform_owner") {
        return res.status(403).json({ error: "You can only block courts in your academy" });
      }

      // Check availability
      const isAvailable = await storage.checkCourtAvailability(courtId, date, startTime, endTime);
      if (!isAvailable) {
        return res.status(409).json({ error: "This time slot is already booked or blocked" });
      }

      // Block the time slot
      await storage.blockCourtTimeSlot({
        courtId,
        date,
        startTime,
        endTime,
        status: "blocked",
        blockedReason: reason || "training",
        blockedBy: userId,
      });

      res.status(201).json({ success: true, message: "Court blocked for training" });
    } catch (error) {
      console.error("Block court error:", error);
      res.status(500).json({ error: "Failed to block court" });
    }
  });

  // Coach unblocks court
  router.post("/api/courts/:courtId/unblock", authMiddleware, requireRole("coach", "academy_owner", "platform_owner"), async (req: AuthRequest, res: Response) => {
    try {
      const { courtId } = req.params;
      const { date, startTime, endTime } = req.body;

      if (!date || !startTime || !endTime) {
        return res.status(400).json({ error: "date, startTime, and endTime are required" });
      }

      await storage.updateCourtAvailabilityStatus(courtId, date, startTime, endTime, "available");

      res.json({ success: true, message: "Court unblocked" });
    } catch (error) {
      console.error("Unblock court error:", error);
      res.status(500).json({ error: "Failed to unblock court" });
    }
  });

  // Coach personal time block - block coach availability (not court)
  router.post("/api/coach/time-blocks", authMiddleware, requireRole("coach", "academy_owner", "platform_owner"), async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      if (!coachId) return res.status(400).json({ error: "Coach ID required" });

      const { startDate, endDate, weekdays, startTime, endTime, reason } = req.body;
      
      if (!startDate || !endDate || !startTime || !endTime) {
        return res.status(400).json({ error: "startDate, endDate, startTime, endTime are required" });
      }
      if (!weekdays || !Array.isArray(weekdays) || weekdays.length === 0) {
        return res.status(400).json({ error: "weekdays array is required (0=Sun, 1=Mon, ..., 6=Sat)" });
      }

      // Generate all dates in range matching selected weekdays
      const start = new Date(startDate);
      const end = new Date(endDate);
      const blocksToCreate: any[] = [];
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (weekdays.includes(dayOfWeek)) {
          const dateStr = d.toISOString().split('T')[0];
          blocksToCreate.push({
            coachId,
            sourceType: "blocked",
            sourceAcademyId: academyId || null,
            date: dateStr,
            startTime,
            endTime,
            status: "confirmed",
            isPrivate: false,
            blockReason: reason || "personal",
          });
        }
      }

      if (blocksToCreate.length === 0) {
        return res.status(400).json({ error: "No matching dates found for selected weekdays" });
      }

      // Insert all blocks
      await db.insert(coachTimeBlocks).values(blocksToCreate);

      res.status(201).json({ 
        success: true, 
        message: `Created ${blocksToCreate.length} time blocks`,
        count: blocksToCreate.length,
      });
    } catch (error) {
      console.error("Create coach time block error:", error);
      res.status(500).json({ error: "Failed to create time blocks" });
    }
  });

  // Delete coach personal time block
  router.delete("/api/coach/time-blocks/:blockId", authMiddleware, requireRole("coach", "academy_owner", "platform_owner"), async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const { blockId } = req.params;
      const realId = blockId.replace('coach-block-', '');
      
      await db.delete(coachTimeBlocks).where(and(
        eq(coachTimeBlocks.id, realId),
        eq(coachTimeBlocks.coachId, coachId!)
      ));

      res.json({ success: true });
    } catch (error) {
      console.error("Delete coach time block error:", error);
      res.status(500).json({ error: "Failed to delete time block" });
    }
  });

    // ==================== ACADEMY COURT MANAGEMENT ====================

  // Update court booking settings
  router.put("/api/courts/:courtId/booking-settings", authMiddleware, requireRole("academy_owner", "platform_owner"), async (req: AuthRequest, res: Response) => {
    try {
      const { courtId } = req.params;
      const {
        visibility,
        pricePerHour,
        peakPricePerHour,
        memberPricePerHour,
        currency,
        maxBookingDurationHours,
        minBookingDurationMinutes,
        cancelWindowHours,
        guestsAllowed,
        requiresApproval,
        operatingHours,
        xpRewardPerHour,
      } = req.body;

      // Check ownership
      const court = await storage.getCourt(courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }

      const userAcademyId = req.user?.academyId;
      if (court.academyId !== userAcademyId && req.user?.role !== "platform_owner") {
        return res.status(403).json({ error: "You can only update courts in your academy" });
      }

      const updatedCourt = await storage.updateCourtBookingSettings(courtId, {
        visibility,
        pricePerHour,
        peakPricePerHour,
        memberPricePerHour,
        currency,
        maxBookingDurationHours,
        minBookingDurationMinutes,
        cancelWindowHours,
        guestsAllowed,
        requiresApproval,
        operatingHours,
        xpRewardPerHour,
      });

      res.json(updatedCourt);
    } catch (error) {
      console.error("Update court booking settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Get academy's court bookings (for management)
  router.get("/api/academy/court-bookings", authMiddleware, requireRole("coach", "academy_owner", "platform_owner"), requireAcademy, async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const { status, startDate, endDate, courtId } = req.query;

      if (!academyId) {
        return res.status(400).json({ error: "Academy ID required" });
      }

      const bookings = await storage.getAcademyCourtBookings(academyId, {
        status: status as string,
        startDate: startDate as string,
        endDate: endDate as string,
        courtId: courtId as string,
      });

      res.json(bookings);
    } catch (error) {
      console.error("Get academy court bookings error:", error);
      res.status(500).json({ error: "Failed to get bookings" });
    }
  });

  // Approve/decline pending booking (academy admin)
  router.post("/api/court-bookings/:bookingId/review", authMiddleware, requireRole("academy_owner", "platform_owner"), async (req: AuthRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { action, reason } = req.body;

      if (!["approve", "decline"].includes(action)) {
        return res.status(400).json({ error: "Action must be 'approve' or 'decline'" });
      }

      const booking = await storage.getCourtBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Check academy ownership
      const userAcademyId = req.user?.academyId;
      if (booking.academyId !== userAcademyId && req.user?.role !== "platform_owner") {
        return res.status(403).json({ error: "You can only review bookings for your academy" });
      }

      if (action === "approve") {
        await storage.approveCourtBooking(bookingId);
      } else {
        await storage.declineCourtBooking(bookingId, reason);
        // Release the time slot
        await storage.updateCourtAvailabilityStatus(
          booking.courtId,
          booking.date,
          booking.startTime,
          booking.endTime,
          "available"
        );
      }

      res.json({ success: true, message: `Booking ${action}d` });
    } catch (error) {
      console.error("Review court booking error:", error);
      res.status(500).json({ error: "Failed to review booking" });
    }
  });

  // ==================== BOOKING INVITES (Phase 2) ====================

  // Get my booking invites (received)
  router.get("/api/player/booking-invites", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const invites = await db
        .select()
        .from(bookingInviteGuests)
        .innerJoin(bookingInvites, eq(bookingInviteGuests.inviteId, bookingInvites.id))
        .where(eq(bookingInviteGuests.playerId, playerId));

      res.json(invites);
    } catch (error) {
      console.error("Get booking invites error:", error);
      res.status(500).json({ error: "Failed to get invites" });
    }
  });

  // Respond to booking invite
  router.post("/api/player/booking-invites/:inviteId/respond", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { inviteId } = req.params;
      const { action } = req.body;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      if (!["accept", "decline"].includes(action)) {
        return res.status(400).json({ error: "Action must be 'accept' or 'decline'" });
      }

      const [guest] = await db
        .select()
        .from(bookingInviteGuests)
        
          .where(and(
          eq(bookingInviteGuests.inviteId, inviteId),
          eq(bookingInviteGuests.playerId, playerId)
        ));

      if (!guest) {
        return res.status(404).json({ error: "Invite not found" });
      }

      await db
        .update(bookingInviteGuests)
        .set({
          status: action === "accept" ? "accepted" : "declined",
          respondedAt: new Date(),
        })
        .where(eq(bookingInviteGuests.id, guest.id));

      // Update invite counts
      if (action === "accept") {
        await db
          .update(bookingInvites)
          .set({ totalAccepted: sql`total_accepted + 1` })
          .where(eq(bookingInvites.id, inviteId));
      }

      res.json({ success: true, message: `Invite ${action}ed` });
    } catch (error) {
      console.error("Respond to booking invite error:", error);
      res.status(500).json({ error: "Failed to respond to invite" });
    }
  });

  // ==================== OPEN MATCHES (Phase 3) ====================

  // Get open matches (queries match_requests table from Find a Match wizard)
  router.get("/api/open-matches", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;
      const { matchType, ballLevel, date } = req.query;

      // Query from match_requests table (where matches are created via Find a Match wizard)
      const matches = await db
        .select({
          id: matchRequests.id,
          playerId: matchRequests.playerId,
          academyId: matchRequests.academyId,
          matchType: matchRequests.matchType,
          title: matchRequests.title,
          description: matchRequests.description,
          preferredDate: matchRequests.preferredDate,
          preferredTime: matchRequests.preferredTime,
          requiredLevelMin: matchRequests.requiredLevelMin,
          requiredLevelMax: matchRequests.requiredLevelMax,
          requiredBallLevel: matchRequests.requiredBallLevel,
          isAdult: matchRequests.isAdult,
          maxPlayers: matchRequests.maxPlayers,
          status: matchRequests.status,
          createdAt: matchRequests.createdAt,
          playerName: players.name,
            hostBallLevel: players.ballLevel,
          playerLevel: players.skillLevel,
          playerBallLevel: players.ballLevel,
        })
        .from(matchRequests)
        .leftJoin(players, eq(matchRequests.playerId, players.id))
        .where(eq(matchRequests.status, "open"));

      // Apply filters
      let filteredMatches = matches;
      
      if (matchType && matchType !== 'all') {
        filteredMatches = filteredMatches.filter(m => m.matchType === matchType);
      }
      
      if (ballLevel) {
        filteredMatches = filteredMatches.filter(m => m.requiredBallLevel === ballLevel);
      }
      
      if (date) {
        filteredMatches = filteredMatches.filter(m => m.preferredDate === date);
      }

      // Filter by academy - show matches from same academy or public ones
      filteredMatches = filteredMatches.filter(m => 
        !m.academyId || m.academyId === academyId
      );

      // Filter out past matches - only show future or today's matches that haven't started
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filteredMatches = filteredMatches.filter(m => {
        if (!m.preferredDate) return true;
        const matchDate = new Date(m.preferredDate);
        matchDate.setHours(0, 0, 0, 0);
        if (matchDate < today) return false;
        // If today, check if the match time has passed
        if (matchDate.getTime() === today.getTime() && m.preferredTime) {
          const [hours, minutes] = m.preferredTime.split(':').map(Number);
          const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date();
          const matchTime = new Date();
          matchTime.setHours(hours || 0, minutes || 0, 0, 0);
          return matchTime > now;
        }
        return true;
      });

      // Transform to format expected by frontend
      const transformedMatches = filteredMatches.map(m => {
        let scheduledTime: string | null = null;
        if (m.preferredDate && m.preferredTime) {
          const [hours, minutes] = m.preferredTime.split(':').map(Number);
          const date = new Date(m.preferredDate);
          date.setHours(hours || 0, minutes || 0, 0, 0);
          scheduledTime = date.toISOString();
        }
        return {
          id: m.id,
          bookingId: "",
          hostPlayerId: m.playerId,
          academyId: m.academyId,
          matchType: m.matchType || "singles",
          title: m.title,
          description: m.description,
          requiredLevelMin: m.requiredLevelMin || 1,
          requiredLevelMax: m.requiredLevelMax || 9,
          requiredBallLevel: m.requiredBallLevel || m.playerBallLevel,
          ballLevel: m.requiredBallLevel || m.playerBallLevel,
          maxPlayers: m.maxPlayers || (m.matchType === "doubles" ? 4 : 2),
          currentPlayers: 1,
          status: m.status || "open",
          visibility: "public",
          costPerPlayer: null,
          currency: "AED",
          xpBonus: 25,
          createdAt: m.createdAt?.toISOString() || new Date().toISOString(),
          scheduledTime,
          preferredDate: m.preferredDate,
          preferredTime: m.preferredTime,
          courtName: null,
          locationName: null,
          host: {
            id: m.playerId,
            name: m.playerName || "Unknown Player",
            photoUrl: m.playerAvatar,
            level: m.playerLevel || 1,
            ballLevel: m.requiredBallLevel || m.playerBallLevel,
          },
          players: [{
            id: m.playerId,
            name: m.playerName || "Unknown Player",
            photoUrl: m.playerAvatar,
          }],
        };
      });

      res.json(transformedMatches);
    } catch (error) {
      console.error("Get open matches error:", error);
      res.status(500).json({ error: "Failed to get open matches" });
    }
  });

  // Get single open match by ID
  router.get("/api/open-matches/:matchId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      
      // First try to find in matchRequests table
      const [matchRequest] = await db
        .select({
          id: matchRequests.id,
          playerId: matchRequests.playerId,
          academyId: matchRequests.academyId,
          matchType: matchRequests.matchType,
          title: matchRequests.title,
          description: matchRequests.description,
          preferredDate: matchRequests.preferredDate,
          preferredTime: matchRequests.preferredTime,
          requiredLevelMin: matchRequests.requiredLevelMin,
          requiredLevelMax: matchRequests.requiredLevelMax,
          requiredBallLevel: matchRequests.requiredBallLevel,
          maxPlayers: matchRequests.maxPlayers,
          status: matchRequests.status,
          createdAt: matchRequests.createdAt,
          playerName: players.name,
            hostBallLevel: players.ballLevel,
          playerAvatar: players.profilePhotoUrl,
          playerLevel: players.skillLevel,
          playerBallLevel: players.ballLevel,
        })
        .from(matchRequests)
        .leftJoin(players, eq(matchRequests.playerId, players.id))
        .where(eq(matchRequests.id, matchId));
      
      if (!matchRequest) {
        return res.status(404).json({ error: "Match not found" });
      }
      
      // Transform to expected format
      let scheduledTime = null;
      if (matchRequest.preferredDate) {
        const date = new Date(matchRequest.preferredDate);
        if (matchRequest.preferredTime) {
          const [hours, minutes] = matchRequest.preferredTime.split(':').map(Number);
          date.setHours(hours, minutes, 0, 0);
        }
        scheduledTime = date.toISOString();
      }
      
      const transformedMatch = {
        id: matchRequest.id,
        bookingId: null,
        hostPlayerId: matchRequest.playerId,
        academyId: matchRequest.academyId,
        matchType: matchRequest.matchType || "singles",
        title: matchRequest.title,
        description: matchRequest.description,
        ballLevel: matchRequest.requiredBallLevel,
        skillLevel: matchRequest.requiredLevelMin,
        requiredLevelMin: matchRequest.requiredLevelMin || 1,
        requiredLevelMax: matchRequest.requiredLevelMax || 9,
        requiredBallLevel: matchRequest.requiredBallLevel,
        maxPlayers: matchRequest.maxPlayers || (matchRequest.matchType === "doubles" ? 4 : 2),
        currentPlayers: 1,
        status: matchRequest.status || "open",
        visibility: "public",
        costPerPlayer: null,
        currency: "AED",
        xpBonus: 25,
        createdAt: matchRequest.createdAt?.toISOString() || new Date().toISOString(),
        scheduledTime,
        courtName: null,
        locationName: null,
        host: {
          id: matchRequest.playerId,
          name: matchRequest.playerName || "Unknown Player",
          photoUrl: matchRequest.playerAvatar,
          level: matchRequest.playerLevel || 1,
          ballLevel: matchRequest.requiredBallLevel,
        },
        players: [{
          id: matchRequest.playerId,
          name: matchRequest.playerName || "Unknown Player",
          photoUrl: matchRequest.playerAvatar,
        }],
      };
      
      res.json(transformedMatch);
    } catch (error) {
      console.error("Get open match error:", error);
      res.status(500).json({ error: "Failed to get match" });
    }
  });

  // Delete/Cancel open match
  router.delete("/api/open-matches/:matchId", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      const playerId = req.user?.playerId;
      
      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }
      
      // Find the match
      const [matchRequest] = await db
        .select()
        .from(matchRequests)
        .where(eq(matchRequests.id, matchId));
      
      if (!matchRequest) {
        return res.status(404).json({ error: "Match not found" });
      }
      
      // Check ownership
      if (matchRequest.playerId !== playerId) {
        return res.status(403).json({ error: "You can only cancel your own matches" });
      }
      
      // Update status to cancelled
      await db
        .update(matchRequests)
        .set({ status: "cancelled" })
        .where(eq(matchRequests.id, matchId));
      
      res.json({ success: true, message: "Match cancelled successfully" });
    } catch (error) {
      console.error("Cancel open match error:", error);
      res.status(500).json({ error: "Failed to cancel match" });
    }
  });
  // Create open match
  router.post("/api/open-matches", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const {
        bookingId,
        matchType,
        title,
        description,
        requiredLevelMin,
        requiredLevelMax,
        requiredBallLevel,
        maxPlayers,
        visibility,
        costPerPlayer,
      } = req.body;

      if (!bookingId) {
        return res.status(400).json({ error: "Booking ID is required" });
      }

      const [match] = await db.insert(openMatches).values({
        bookingId,
        hostPlayerId: playerId,
        academyId,
        matchType: matchType || "singles",
        title,
        description,
        requiredLevelMin: requiredLevelMin || 1,
        requiredLevelMax: requiredLevelMax || 20,
        requiredBallLevel,
        maxPlayers: maxPlayers || (matchType === "doubles" ? 4 : 2),
        currentPlayers: 1,
        invitedPlayerId: invitedPlayerId || null,
        status: invitedPlayerId ? "pending_invite" : "open",
        matchIntent: matchIntent || "friendly",
        visibility: visibility || "academy",
        costPerPlayer,
        currency: "AED",
        xpBonus: 25,
      }).returning();

      // Add host as first slot
      await db.insert(openMatchSlots).values({
        matchId: match.id,
        playerId,
        role: "host",
        status: "confirmed",
      });

      res.status(201).json(match);
    } catch (error) {
      console.error("Create open match error:", error);
      res.status(500).json({ error: "Failed to create open match" });
    }
  });

  // Join open match
  router.post("/api/open-matches/:matchId/join", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { matchId } = req.params;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const [match] = await db
        .select()
        .from(openMatches)
        .where(eq(openMatches.id, matchId));

      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      if (match.status !== "open") {
        return res.status(400).json({ error: "Match is not open for joining" });
      }

      if (match.currentPlayers >= match.maxPlayers) {
        return res.status(400).json({ error: "Match is already full" });
      }

      // Check if already joined
      const [existing] = await db
        .select()
        .from(openMatchSlots)
        
          .where(and(
          eq(openMatchSlots.matchId, matchId),
          eq(openMatchSlots.playerId, playerId)
        ));

      if (existing) {
        return res.status(400).json({ error: "Already joined this match" });
      }

      // Add player slot
      await db.insert(openMatchSlots).values({
        matchId,
        playerId,
        role: "player",
        status: "confirmed",
      });

      // Update player count
      const newCount = match.currentPlayers + 1;
      const newStatus = newCount >= match.maxPlayers ? "full" : "open";

      await db
        .update(openMatches)
        .set({ 
          currentPlayers: newCount,
          status: newStatus,
        })
        .where(eq(openMatches.id, matchId));

      // Notify host
      await storage.createNotification({
        type: "open_match_join",
        title: "Player Joined",
        message: `Someone joined your open match!`,
        userId: null,
        playerId: match.hostPlayerId,
        academyId: match.academyId,
        data: { matchId },
      });

      res.json({ success: true, message: "Joined match successfully" });
    } catch (error) {
      console.error("Join open match error:", error);
      res.status(500).json({ error: "Failed to join match" });
    }
  });

  // Leave open match
  router.post("/api/open-matches/:matchId/leave", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { matchId } = req.params;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const [slot] = await db
        .select()
        .from(openMatchSlots)
        
          .where(and(
          eq(openMatchSlots.matchId, matchId),
          eq(openMatchSlots.playerId, playerId)
        ));

      if (!slot) {
        return res.status(404).json({ error: "Not in this match" });
      }

      if (slot.role === "host") {
        return res.status(400).json({ error: "Host cannot leave. Cancel the match instead." });
      }

      await db
        .update(openMatchSlots)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(openMatchSlots.id, slot.id));

      // Update match count
      await db
        .update(openMatches)
        .set({ currentPlayers: sql`current_players - 1` })
        .where(eq(openMatches.id, matchId));

      res.json({ success: true, message: "Left match" });
    } catch (error) {
      console.error("Leave open match error:", error);
      res.status(500).json({ error: "Failed to leave match" });
    }
  });
  // Invite friend to open match
  router.post("/api/open-matches/:matchId/invite", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const hostPlayerId = req.user?.playerId;
      const { matchId } = req.params;
      const { playerId } = req.body;

      if (!hostPlayerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      if (!playerId) {
        return res.status(400).json({ error: "Player ID required" });
      }

      // Verify host owns this match
      const [match] = await db
        .select()
        .from(openMatches)
        .where(eq(openMatches.id, matchId));

      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      if (match.hostPlayerId !== hostPlayerId) {
        return res.status(403).json({ error: "Only the host can invite players" });
      }

      if (match.currentPlayers >= match.maxPlayers) {
        return res.status(400).json({ error: "Match is already full" });
      }

      // Check if player is already in the match
      const [existingSlot] = await db
        .select()
        .from(openMatchSlots)
        
          .where(and(
          eq(openMatchSlots.matchId, matchId),
          eq(openMatchSlots.playerId, playerId),
          eq(openMatchSlots.status, "confirmed")
        ));

      if (existingSlot) {
        return res.status(400).json({ error: "Player is already in this match" });
      }

      // Get invited player info
      const invitedPlayer = await storage.getPlayer(playerId);
      if (!invitedPlayer) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Get host player info
      const hostPlayer = await storage.getPlayer(hostPlayerId);

      // Create a notification for the invited player
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        userId: playerId,
        type: "match_invite",
        title: "Match Invitation",
        message: `${hostPlayer?.name || "A player"} invited you to join their ${match.matchType} match`,
        data: { matchId, hostPlayerId, matchType: match.matchType },
        read: false,
        createdAt: new Date(),
      });

      res.json({ success: true, message: "Invite sent successfully" });
    } catch (error) {
      console.error("Invite to open match error:", error);
      res.status(500).json({ error: "Failed to send invite" });
    }
  });

  // ==================== MATCH REQUESTS (Tinder-style Match Finding) ====================

  // Create a match request
  router.post("/api/play/create-match-request", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const {
        matchType,
        title,
        description,
        preferredDate,
        preferredTime,
        requiredLevelMin,
        requiredLevelMax,
        requiredBallLevel,
        maxPlayers,
      } = req.body;

      const [request] = await db.insert(matchRequests).values({
        playerId,
        academyId,
        matchType: matchType || "singles",
        title: title || `Looking for ${matchType || "singles"} partner`,
        description,
        preferredDate,
        preferredTime,
        requiredLevelMin: requiredLevelMin || 1,
        requiredLevelMax: requiredLevelMax || 9,
        requiredBallLevel,
        maxPlayers: maxPlayers || (matchType === "doubles" ? 4 : 2),
        invitedPlayerId: invitedPlayerId || null,
        status: invitedPlayerId ? "pending_invite" : "open",
        matchIntent: matchIntent || "friendly",
      }).returning();

      console.log("[MatchRequest] Created:", request.id, "by player:", playerId);
      res.status(201).json(request);
    } catch (error) {
      console.error("Create match request error:", error);
      res.status(500).json({ error: "Failed to create match request" });
    }
  });

  // Get all open match requests
  router.get("/api/play/match-requests", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user?.academyId;
      const playerId = req.user?.playerId;

      const requests = await db
        .select()
        .from(matchRequests)
        .where(
          and(
            eq(matchRequests.status, "open"),
            eq(players.ballLevel, player.ballLevel),
            academyId ? eq(matchRequests.academyId, academyId) : undefined,
            playerId ? ne(matchRequests.playerId, playerId) : undefined
          )
        )
        .orderBy(desc(matchRequests.createdAt));

      // Enrich with player info
      const enrichedRequests = await Promise.all(requests.map(async (request) => {
        const [player] = await db.select().from(players).where(eq(players.id, request.playerId));
        return {
          ...request,
          player: player ? {
            id: player.id,
            name: player.name,
            profilePhotoUrl: player.profilePhotoUrl,
            ballLevel: player.ballLevel,
          } : null,
        };
      }));

      res.json(enrichedRequests);
    } catch (error) {
      console.error("Get match requests error:", error);
      res.status(500).json({ error: "Failed to get match requests" });
    }
  });

  // Get my match requests
  router.get("/api/play/my-match-requests", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const requests = await db
        .select()
        .from(matchRequests)
        .where(eq(matchRequests.playerId, playerId))
        .orderBy(desc(matchRequests.createdAt));

      res.json(requests);
    } catch (error) {
      console.error("Get my match requests error:", error);
      res.status(500).json({ error: "Failed to get match requests" });
    }
  });

  // Cancel a match request
  router.post("/api/play/match-requests/:requestId/cancel", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { requestId } = req.params;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const [request] = await db
        .select()
        .from(matchRequests)
        
          .where(and(
          eq(matchRequests.id, requestId),
          eq(matchRequests.playerId, playerId)
        ));

      if (!request) {
        return res.status(404).json({ error: "Match request not found" });
      }

      await db
        .update(matchRequests)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(matchRequests.id, requestId));

      res.json({ success: true, message: "Match request cancelled" });
    } catch (error) {
      console.error("Cancel match request error:", error);
      res.status(500).json({ error: "Failed to cancel match request" });
    }
  });

  // ==================== PLAYER BOOKING PREFERENCES (Phase 4) ====================

  // Get booking preferences
  router.get("/api/player/booking-preferences", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const [prefs] = await db
        .select()
        .from(playerBookingPreferences)
        .where(eq(playerBookingPreferences.playerId, playerId));

      res.json(prefs || null);
    } catch (error) {
      console.error("Get booking preferences error:", error);
      res.status(500).json({ error: "Failed to get preferences" });
    }
  });

  // Update booking preferences
  router.put("/api/player/booking-preferences", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const {
        preferredDays,
        preferredTimeWindows,
        preferredSurfaces,
        preferredCourts,
        autoAcceptFriendInvites,
        openToOpenMatches,
        preferredMatchType,
        notifyOnOpenMatches,
        notifyOnFriendBookings,
      } = req.body;

      const [existing] = await db
        .select()
        .from(playerBookingPreferences)
        .where(eq(playerBookingPreferences.playerId, playerId));

      let result;
      if (existing) {
        [result] = await db
          .update(playerBookingPreferences)
          .set({
            preferredDays,
            preferredTimeWindows,
            preferredSurfaces,
            preferredCourts,
            autoAcceptFriendInvites,
            openToOpenMatches,
            preferredMatchType,
            notifyOnOpenMatches,
            notifyOnFriendBookings,
            updatedAt: new Date(),
          })
          .where(eq(playerBookingPreferences.playerId, playerId))
          .returning();
      } else {
        [result] = await db
          .insert(playerBookingPreferences)
          .values({
            playerId,
            preferredDays,
            preferredTimeWindows,
            preferredSurfaces,
            preferredCourts,
            autoAcceptFriendInvites,
            openToOpenMatches,
            preferredMatchType,
            notifyOnOpenMatches,
            notifyOnFriendBookings,
          })
          .returning();
      }

      res.json(result);
    } catch (error) {
      console.error("Update booking preferences error:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  // Get smart suggestions based on booking history
  router.get("/api/player/booking-suggestions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const userId = req.user?.userId;
      if (!playerId || !userId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      // Get user's past bookings to analyze patterns
      const pastBookings = await storage.getUserCourtBookings(userId, {
        status: "completed",
      });

      // Analyze patterns
      const dayFrequency: Record<string, number> = {};
      const timeFrequency: Record<string, number> = {};
      const courtFrequency: Record<string, number> = {};

      for (const booking of pastBookings.slice(-20)) {
        const dayOfWeek = new Date(booking.date).toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
        dayFrequency[dayOfWeek] = (dayFrequency[dayOfWeek] || 0) + 1;
        
        const hour = parseInt(booking.startTime.split(":")[0]);
        const timeSlot = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
        timeFrequency[timeSlot] = (timeFrequency[timeSlot] || 0) + 1;

        courtFrequency[booking.courtId] = (courtFrequency[booking.courtId] || 0) + 1;
      }

      // Get top preferences
      const sortedDays = Object.entries(dayFrequency).sort((a, b) => b[1] - a[1]);
      const sortedTimes = Object.entries(timeFrequency).sort((a, b) => b[1] - a[1]);
      const sortedCourts = Object.entries(courtFrequency).sort((a, b) => b[1] - a[1]);

      res.json({
        preferredDays: sortedDays.slice(0, 3).map(([day]) => day),
        preferredTimes: sortedTimes.slice(0, 2).map(([time]) => time),
        favoriteCourtIds: sortedCourts.slice(0, 2).map(([courtId]) => courtId),
        totalBookings: pastBookings.length,
        suggestions: [
          sortedDays[0] ? `You usually play on ${sortedDays[0][0]}s` : null,
          sortedTimes[0] ? `Your favorite time is ${sortedTimes[0][0]}` : null,
        ].filter(Boolean),
      });
    } catch (error) {
      console.error("Get booking suggestions error:", error);
      res.status(500).json({ error: "Failed to get suggestions" });
    }
  });


export default router;
