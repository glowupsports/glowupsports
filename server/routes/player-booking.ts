import { Router, Request, Response, NextFunction } from "express";
import { db, pool } from "../db";
import { storage } from "../storage";
import https from "https";
import {
  players,
  coaches,
  users,
  sessions,
  packages,
  coachingSeries,
  seriesPlayers,
  creditTransactions,
  invoices,
  payments,
  sessionPlayers,
  sessionWaitlist,
  leaderboardSnapshots,
  locationTravelTimes,
  coachSettings,
  coachAvailability,
  availabilityExceptions,
  coachTimeBlocks,
  courtAvailability,
  courtAvailabilitySnapshots,
  courts,
  bookingInvites,
  bookingInviteGuests,
  openMatches,
  openMatchSlots,
  matchRequests,
  playerBookingPreferences,
  bookingRequests,
  academyPricing,
  submitReviewSchema,
  inSessionFeedback,
  sessionSkillObservations,
  xpTransactions,
  playerSkillScores,
  glowSkills,
  sessionRatings,
  sessionRatingInputSchema,
  academies,
  coachReviewStats,
  locations,
  type Coach,
  type InsertInvoice,
  type InsertPayment,
} from "@shared/schema";
import {
  eq,
  sql,
  desc,
  and,
  ne,
  gt,
  gte,
  asc,
  inArray,
  lte,
  or,
  count,
  isNull,
  isNotNull,
  not,
} from "drizzle-orm";
import { HIDDEN_PLAYER_IDS } from "../config/hiddenPlayers";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  requireAcademy,
  requireFeatureUnlock,
  type JWTPayload,
} from "../auth";
import { fromZodError } from "zod-validation-error";
import { z } from "zod";
import { sanitizeMessage } from "../utils/sanitize";
import { localHHMMToUtc, utcToLocalTime } from "../utils/timezone";
import { playerNotifications, coachNotifications } from "@shared/schema";
import {
  sendPushNotification,
  getPlayerPushTokens,
  getCoachPushTokens,
} from "../pushNotifications";
import { enrollPlayerInGroupSession } from "../sessionEnrolment";
import { broadcastToPlayerIds } from "../websocket";
import { invalidateHomeDataCache } from "./coach-home";
import { buildFriendStatusMap } from "../services/friendStatus";
import { paymentProofUpload } from "../upload-middleware";
import {
  uploadToSupabaseWithPath,
  isSupabaseConfigured,
} from "../utils/supabaseStorage";
import * as fsSync from "fs";
import * as pathLib from "path";

async function getEffectivePlayerCount(sessionId: string): Promise<number> {
  const [enrolledRows, offeredRows] = await Promise.all([
    db.query.sessionPlayers.findMany({
      where: (sp, { eq }) => eq(sp.sessionId, sessionId),
    }),
    db.query.sessionWaitlist.findMany({
      where: (w, { and, eq }) =>
        and(eq(w.sessionId, sessionId), eq(w.status, "offered")),
    }),
  ]);
  return enrolledRows.length + offeredRows.length;
}

async function notifyWaitlistPlayerSpotOffered(
  playerId: string,
  sessionId: string,
  claimWindowMinutes: number,
  offeredAt: Date,
): Promise<void> {
  try {
    // Always create in-app notification
    await db.insert(playerNotifications).values({
      playerId,
      title: "Spot Available!",
      body: `A spot opened up in your waitlisted session. You have ${claimWindowMinutes} minutes to claim it!`,
      type: "waitlist_spot_offered",
      data: {
        sessionId,
        claimWindowMinutes,
        offeredAt: offeredAt.toISOString(),
      },
    });
    // Also push if tokens available
    const tokens = await getPlayerPushTokens(playerId);
    if (tokens.length > 0) {
      await sendPushNotification(
        tokens,
        "Spot Available!",
        `A spot opened up in your waitlisted session. You have ${claimWindowMinutes} minutes to claim it!`,
        { type: "waitlist_spot_offered", sessionId },
        playerId,
      );
    }
  } catch (err) {
    console.error("[Waitlist] Failed to send spot-offered notification:", err);
  }
}

const bookingRequestSchema = z.object({
  coachId: z.string().min(1).nullish(),
  locationId: z.string().nullish(),
  courtId: z.string().nullish(),
  requestedStart: z.string().min(1),
  requestedEnd: z.string().min(1),
  duration: z.number().int().positive(),
  sessionType: z
    .enum(["private", "semi_private", "group", "play", "open_play"])
    .transform((v) => (v === "open_play" ? "play" : v)),
  playerNote: z.string().max(500).optional().nullable(),
  sessionId: z.string().uuid().optional().nullable(),
  isJoinRequest: z.boolean().optional(),
  courtBookingStatus: z
    .enum(["academy_court", "external_booked", "external_pending"])
    .optional()
    .nullable(),
  courtBookingNote: z.string().max(500).optional().nullable(),
  courtBookingUrl: z.string().max(500).optional().nullable(),
  // Task #1093 — How the player intends to pay if/when the coach approves
  // the request. Card payments don't go through this endpoint (they
  // materialise via Stripe webhook).
  paymentIntent: z.enum(["credits", "pay_later"]).optional().nullable(),
});

const bookingDeclineSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
  declineReason: z
    .enum([
      "schedule_conflict",
      "skill_mismatch",
      "court_unavailable",
      "personal",
      "response_timeout",
    ])
    .optional()
    .nullable(),
});

const bookingApproveSchema = z.object({
  coachWelcomeMessage: z.string().max(500).optional().nullable(),
});

const counterProposeSchema = z.object({
  counterProposedStart: z.string().min(1),
  counterProposedEnd: z.string().min(1),
});

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
router.get(
  "/api/player/availability",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const {
        coachId,
        locationId,
        courtId,
        date,
        startDate,
        endDate,
        duration,
      } = req.query;

      // Support either `date` (date string, preferred) or `startDate`/`endDate` (legacy ISO timestamps)
      let rangeStart: Date;
      let rangeEnd: Date;
      if (date) {
        // Validate YYYY-MM-DD format before constructing Date objects
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date as string)) {
          return res
            .status(400)
            .json({ error: "date must be in YYYY-MM-DD format" });
        }
        // Parse as a calendar day in UTC to avoid timezone shifts
        rangeStart = new Date(`${date as string}T00:00:00.000Z`);
        rangeEnd = new Date(`${date as string}T23:59:59.999Z`);
        if (isNaN(rangeStart.getTime())) {
          return res.status(400).json({ error: "Invalid date value" });
        }
      } else if (startDate && endDate) {
        rangeStart = new Date(startDate as string);
        rangeEnd = new Date(endDate as string);
      } else {
        return res
          .status(400)
          .json({ error: "date (or startDate and endDate) is required" });
      }

      const player = await storage.getPlayer(
        playerId,
        req.user?.academyId || "",
      );
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Task #1037: If the player is booking a public coach from another
      // academy, look up that coach's availability under THEIR academy
      // (not the player's). The coach must have publicProfileEnabled=true.
      let scopedAcademyId = player.academyId || "";
      if (coachId) {
        const targetCoach = await storage.getCoach(coachId as string);
        if (
          targetCoach &&
          targetCoach.academyId &&
          targetCoach.academyId !== scopedAcademyId &&
          targetCoach.publicProfileEnabled !== false
        ) {
          scopedAcademyId = targetCoach.academyId;
        }
      }

      console.log(
        "[Availability] Fetching slots for player:",
        playerId,
        "date:",
        date || `${startDate} - ${endDate}`,
        "academyId:",
        scopedAcademyId,
      );
      const slots = await storage.getAvailableSlots({
        academyId: scopedAcademyId,
        coachId: coachId as string | undefined,
        locationId: locationId as string | undefined,
        courtId: courtId as string | undefined,
        startDate: rangeStart,
        endDate: rangeEnd,
        duration: parseInt(duration as string) || 60,
        requestingPlayerId: playerId,
      });
      // Enrich slots with coach, location, and court names
      const enrichedSlots = await Promise.all(
        slots.map(async (slot) => {
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
        }),
      );

      console.log("[Availability] Returning", enrichedSlots.length, "slots");
      res.json(enrichedSlots);
    } catch (error) {
      console.error("Player availability error:", error);
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  },
);

// Get player's booking requests
// Get all coaches from player's academy for booking wizard (with extended details)
router.get(
  "/api/player/academy-coaches",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;

      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      // Task #1037: Public Coach Profiles. When the wizard is opened from a
      // public coach profile, the player may want to book a coach who is not
      // in their own academy. We accept ?coachId=... and inject that coach
      // into the list (provided the coach has publicProfileEnabled=true) so
      // the wizard can lock onto them even cross-academy.
      const requestedCoachId =
        (req.query.coachId as string | undefined) || undefined;

      const academyCoaches = academyId
        ? await storage.getAcademyCoachesForBooking(academyId)
        : [];

      let coaches = academyCoaches;

      if (
        requestedCoachId &&
        !academyCoaches.some((c: any) => c.id === requestedCoachId)
      ) {
        const externalCoach = await storage.getCoach(requestedCoachId);
        if (externalCoach && externalCoach.publicProfileEnabled !== false) {
          coaches = [
            ...academyCoaches,
            {
              id: externalCoach.id,
              name: externalCoach.name,
              profilePhotoUrl: externalCoach.photoUrl,
              specialty: externalCoach.specialty,
              yearsExperience: externalCoach.yearsExperience,
              specializations: externalCoach.specializations,
              bio: externalCoach.publicQuote,
              certifications: externalCoach.certifications,
              languages: externalCoach.languages,
              hourlyRate: externalCoach.hourlyRate,
              totalSessions: 0,
              rating: null,
              totalReviews: 0,
              availableForPrivate: true,
              availableForGroup: true,
              isExternalPublicCoach: true,
            },
          ];
        }
      }

      res.json({ coaches });
    } catch (error) {
      console.error("Get academy coaches error:", error);
      res.status(500).json({ error: "Failed to fetch academy coaches" });
    }
  },
);

router.get(
  "/api/player/booking-requests",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
  },
);

// Get available courts for a location+time window (filters out blocked/booked courts)
router.get(
  "/api/player/available-courts",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;

      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const { locationId, startTime, endTime } = req.query;
      if (!startTime || !endTime) {
        return res
          .status(400)
          .json({ error: "startTime and endTime are required" });
      }

      const start = new Date(startTime as string);
      const end = new Date(endTime as string);
      const dateStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
      const startTimeStr = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
      const endTimeStr = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;

      // Get courts for the location/academy
      let allCourts: any[];
      if (locationId) {
        allCourts = await storage.getCourtsByLocation(
          locationId as string,
          academyId,
        );
      } else if (academyId) {
        allCourts = await storage.getAllCourts(academyId);
      } else {
        return res.json([]);
      }

      // Filter to active bookable courts
      allCourts = allCourts.filter((c) => c.isActive !== false);

      // Fetch blocks for this date and time range
      const courtIds = allCourts.map((c: any) => c.id);
      if (courtIds.length === 0) return res.json([]);

      const conflictingBlocks = await db
        .select({ courtId: courtAvailability.courtId })
        .from(courtAvailability)
        .where(
          and(
            inArray(courtAvailability.courtId, courtIds),
            eq(courtAvailability.date, dateStr),
            sql`${courtAvailability.startTime} < ${endTimeStr}`,
            sql`${courtAvailability.endTime} > ${startTimeStr}`,
            sql`${courtAvailability.status} IN ('blocked', 'booked')`,
          ),
        );

      // Also check sessions that overlap this window and use these courts
      const conflictingSessions = await db
        .select({ courtId: sessions.courtId })
        .from(sessions)
        .where(
          and(
            inArray(sessions.courtId, courtIds),
            ne(sessions.status, "cancelled"),
            sql`${sessions.startTime} < ${end.toISOString()}::timestamp`,
            sql`${sessions.endTime} > ${start.toISOString()}::timestamp`,
          ),
        );

      // Also check pending booking requests that already claimed a court (may not have a courtAvailability row yet)
      const conflictingPendingRequests = await db
        .select({ courtId: bookingRequests.courtId })
        .from(bookingRequests)
        .where(
          and(
            inArray(bookingRequests.courtId, courtIds),
            sql`${bookingRequests.status} IN ('pending', 'approved')`,
            sql`${bookingRequests.requestedStart} < ${end.toISOString()}::timestamp`,
            sql`${bookingRequests.requestedEnd} > ${start.toISOString()}::timestamp`,
          ),
        );

      const blockedCourtIds = new Set([
        ...conflictingBlocks.map((b: any) => b.courtId),
        ...conflictingSessions.map((s: any) => s.courtId).filter(Boolean),
        ...conflictingPendingRequests
          .map((r: any) => r.courtId)
          .filter(Boolean),
      ]);

      // Return only courts that are actually available (not blocked/booked)
      const availableCourts = allCourts
        .filter((court: any) => !blockedCourtIds.has(court.id))
        .map((court: any) => ({
          id: court.id,
          name: court.name,
          locationId: court.locationId,
          surface: court.surface,
        }));

      res.json(availableCourts);
    } catch (error) {
      console.error("Available courts error:", error);
      res.status(500).json({ error: "Failed to fetch available courts" });
    }
  },
);

// List all bookable courts in player's academy (used by Choose Court browse mode)
router.get(
  "/api/player/academy-courts",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }
      if (!academyId) {
        return res.json([]);
      }

      const allCourts = await storage.getAllCourts(academyId);
      const allLocations = await storage.getAllLocations(academyId);
      const locationMap = new Map(allLocations.map((l: any) => [l.id, l]));

      const result = allCourts
        .filter((c: any) => c.isActive !== false)
        .map((c: any) => {
          const loc: any = c.locationId ? locationMap.get(c.locationId) : null;
          return {
            id: c.id,
            name: c.name,
            surface: c.surface ?? null,
            locationId: c.locationId ?? null,
            locationName: loc?.name ?? null,
          };
        });

      res.json(result);
    } catch (error) {
      console.error("Academy courts error:", error);
      res.status(500).json({ error: "Failed to fetch academy courts" });
    }
  },
);

// Reserve a slot (5-min temporary hold to prevent double-booking race conditions)
router.post(
  "/api/player/reserve-slot",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId)
        return res.status(403).json({ error: "Player access required" });

      const { coachId, startTime, endTime } = req.body;
      if (!coachId || !startTime || !endTime) {
        return res
          .status(400)
          .json({ error: "coachId, startTime, endTime are required" });
      }

      const start = new Date(startTime);
      const end = new Date(endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: "Invalid startTime or endTime" });
      }

      // Look up the player's academyId from their profile
      const player = await storage.getPlayer(
        playerId,
        req.user?.academyId || "",
      );
      if (!player?.academyId) {
        return res.status(404).json({ error: "Player or academy not found" });
      }
      let academyId = player.academyId;

      // Task #1037: cross-academy public coach. The slot reservation must be
      // scoped to the coach's academy so it doesn't conflict with — and is
      // visible to — the coach's own bookings.
      const coachRecord = await storage.getCoach(coachId);
      if (
        coachRecord &&
        coachRecord.academyId &&
        coachRecord.academyId !== academyId &&
        coachRecord.publicProfileEnabled !== false
      ) {
        academyId = coachRecord.academyId;
      }

      // Atomically: clean up expired reservations for this slot, then try to claim it
      const result = await pool.query(
        `
        WITH cleanup AS (
          DELETE FROM slot_reservations
          WHERE coach_id = $1
            AND start_time = $2
            AND expires_at < NOW()
        )
        INSERT INTO slot_reservations (id, academy_id, coach_id, player_id, start_time, end_time, expires_at)
        VALUES (gen_random_uuid(), $3, $1, $4, $2, $5, NOW() + INTERVAL '5 minutes')
        ON CONFLICT (coach_id, start_time) DO NOTHING
        RETURNING id, expires_at AS "expiresAt"
      `,
        [coachId, start.toISOString(), academyId, playerId, end.toISOString()],
      );

      if (result.rows.length === 0) {
        return res.status(409).json({
          error: "slot_taken",
          message: "This slot was just reserved by someone else",
        });
      }

      const { id: reservationId, expiresAt } = result.rows[0];
      return res.json({ reservationId, expiresAt });
    } catch (error) {
      console.error("Reserve slot error:", error);
      res.status(500).json({ error: "Failed to reserve slot" });
    }
  },
);

// Release a slot reservation (called when player cancels or booking is confirmed)
router.delete(
  "/api/player/reserve-slot/:id",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId)
        return res.status(403).json({ error: "Player access required" });

      const { id } = req.params;
      await pool.query(
        "DELETE FROM slot_reservations WHERE id = $1 AND player_id = $2",
        [id, playerId],
      );
      return res.json({ success: true });
    } catch (error) {
      console.error("Release slot error:", error);
      res.status(500).json({ error: "Failed to release slot reservation" });
    }
  },
);

// Create a booking request (new session OR join existing session)
router.post(
  "/api/player/booking-requests",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const player = await storage.getPlayer(
        playerId,
        req.user?.academyId || "",
      );
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const parsedBooking = bookingRequestSchema.safeParse(req.body);
      if (!parsedBooking.success) {
        return res
          .status(400)
          .json({ error: fromZodError(parsedBooking.error).message });
      }
      const {
        coachId,
        locationId,
        courtId,
        requestedStart,
        requestedEnd,
        duration,
        sessionType,
        playerNote,
        sessionId,
        isJoinRequest,
        courtBookingStatus,
        courtBookingNote,
        courtBookingUrl,
        paymentIntent,
      } = parsedBooking.data;

      // Task #1037: Public Coach Profiles. If the player is booking a public
      // coach from another academy, route the booking through the coach's
      // academy so the coach can see/manage it.
      let bookingAcademyId = player.academyId;
      if (coachId) {
        const coachRecord = await storage.getCoach(coachId);
        if (
          coachRecord &&
          coachRecord.academyId &&
          coachRecord.academyId !== player.academyId &&
          coachRecord.publicProfileEnabled !== false
        ) {
          bookingAcademyId = coachRecord.academyId;
        }
      }

      // For join requests, validate the session exists and has spots
      if (isJoinRequest && sessionId) {
        const session = await storage.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Same-academy joins keep the existing rule. Cross-academy joins
        // (Task #1037 — Public Coach Profiles) are allowed ONLY when the
        // session is owned by the very public coach the player picked,
        // so a player cannot join arbitrary sessions in another academy
        // just by knowing their IDs.
        if (session.academyId !== player.academyId) {
          const isCrossAcademyPublicCoachJoin =
            !!coachId &&
            session.academyId === bookingAcademyId &&
            session.coachId === coachId;
          if (!isCrossAcademyPublicCoachJoin) {
            return res.status(403).json({ error: "Session not accessible" });
          }
        }

        // Check if session has available spots
        const sessionPlayers = await storage.getSessionPlayers(sessionId);
        const maxPlayers = session.maxPlayers || 6;
        // Count offered waitlist entries as reserved seats
        const effectiveCount = await getEffectivePlayerCount(sessionId);
        if (effectiveCount >= maxPlayers) {
          return res.status(400).json({ error: "Session is full" });
        }

        // Check if player is already in the session
        if (sessionPlayers.some((sp: any) => sp.id === playerId)) {
          return res
            .status(400)
            .json({ error: "Already enrolled in this session" });
        }
      }

      // Create booking request + court block atomically in a single transaction
      // This prevents race conditions where two concurrent requests could book the same court
      let request: any;

      try {
        await db.transaction(async (tx) => {
          // 1. Insert the booking request
          // Compute expiresAt from coach's response window setting
          let expiresAt: Date | null = null;
          if (coachId) {
            try {
              const [cSetting] = await tx
                .select({
                  bookingResponseWindowMinutes:
                    coachSettings.bookingResponseWindowMinutes,
                })
                .from(coachSettings)
                .where(eq(coachSettings.coachId, coachId))
                .limit(1);
              const windowMins = cSetting?.bookingResponseWindowMinutes ?? 120;
              expiresAt = new Date(Date.now() + windowMins * 60 * 1000);
            } catch {
              expiresAt = new Date(Date.now() + 120 * 60 * 1000);
            }
          }

          const newRequests = await tx
            .insert(bookingRequests)
            .values({
              academyId: bookingAcademyId,
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
              expiresAt: expiresAt || undefined,
              courtBookingStatus: courtBookingStatus || null,
              courtBookingNote: courtBookingNote || null,
              courtBookingUrl: courtBookingUrl || null,
              paymentIntent: paymentIntent || null,
            })
            .returning();

          request = newRequests[0];

          // 2. If a court was requested, check for conflicts and block it within the same transaction
          if (courtId && !isJoinRequest) {
            const startDate = new Date(requestedStart);
            const endDate = new Date(requestedEnd);
            const dateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
            const startTimeStr = `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`;
            const endTimeStr = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;

            // Check for conflicting court blocks or sessions within the transaction
            const existingBlocks = await tx
              .select({ id: courtAvailability.id })
              .from(courtAvailability)
              .where(
                and(
                  eq(courtAvailability.courtId, courtId),
                  eq(courtAvailability.date, dateStr),
                  sql`${courtAvailability.startTime} < ${endTimeStr}`,
                  sql`${courtAvailability.endTime} > ${startTimeStr}`,
                  sql`${courtAvailability.status} IN ('blocked', 'booked')`,
                ),
              )
              .limit(1);

            if (existingBlocks.length > 0) {
              // Throw to roll back the entire transaction (booking request won't be created)
              throw new Error("COURT_CONFLICT");
            }

            // Also check for overlapping sessions using this court (handles cases without courtAvailability rows)
            const overlappingSessions = await tx
              .select({ id: sessions.id })
              .from(sessions)
              .where(
                and(
                  eq(sessions.courtId, courtId),
                  ne(sessions.status, "cancelled"),
                  sql`${sessions.startTime} < ${new Date(requestedEnd).toISOString()}::timestamp`,
                  sql`${sessions.endTime} > ${new Date(requestedStart).toISOString()}::timestamp`,
                ),
              )
              .limit(1);

            if (overlappingSessions.length > 0) {
              throw new Error("COURT_CONFLICT");
            }

            // Block the court - this is now inside the transaction
            await tx.insert(courtAvailability).values({
              courtId,
              date: dateStr,
              startTime: startTimeStr,
              endTime: endTimeStr,
              status: "blocked",
              blockedReason: `booking_request:${request.id}`,
            });
          }
        });
      } catch (txError: any) {
        if (txError?.message === "COURT_CONFLICT") {
          return res.status(409).json({
            error:
              "This court is no longer available for the requested time slot. Please choose another slot.",
          });
        }
        throw txError; // Re-throw to outer catch
      }

      if (!request) {
        return res
          .status(500)
          .json({ error: "Failed to create booking request" });
      }

      await storage.createAuditLog({
        academyId: player.academyId,
        entityType: "booking_request",
        entityId: request.id,
        action: isJoinRequest ? "join_request" : "create",
        performedBy: playerId,
        performedByRole: "player",
      });

      // Check auto-approve rules (non-blocking, best-effort)
      if (coachId && !isJoinRequest) {
        try {
          const [cSetting] = await db
            .select({
              autoApproveReturningPlayers:
                coachSettings.autoApproveReturningPlayers,
              autoApproveAdvancedBookings:
                coachSettings.autoApproveAdvancedBookings,
            })
            .from(coachSettings)
            .where(eq(coachSettings.coachId, coachId))
            .limit(1);

          let shouldAutoApprove = false;

          if (cSetting?.autoApproveReturningPlayers) {
            // Check if player has had prior completed sessions with this coach
            const priorSessions = await db
              .select({ cnt: count(sessionPlayers.sessionId) })
              .from(sessionPlayers)
              .innerJoin(sessions, eq(sessions.id, sessionPlayers.sessionId))
              .where(
                and(
                  eq(sessionPlayers.playerId, playerId),
                  eq(sessions.coachId, coachId),
                  sql`${sessions.status} = 'completed'`,
                ),
              );
            if (Number(priorSessions[0]?.cnt ?? 0) > 0)
              shouldAutoApprove = true;
          }

          if (!shouldAutoApprove && cSetting?.autoApproveAdvancedBookings) {
            // Check if booking is 48h+ in advance
            const hoursUntilSession =
              (new Date(requestedStart).getTime() - Date.now()) /
              (1000 * 60 * 60);
            if (hoursUntilSession >= 48) shouldAutoApprove = true;
          }

          if (shouldAutoApprove) {
            await storage.approveBookingRequest(request.id, coachId);
            request = { ...request, status: "approved" };
            // Send immediate confirmation push to player
            try {
              const playerTokens = await getPlayerPushTokens(playerId);
              if (playerTokens.length > 0) {
                const autoDate = new Date(requestedStart).toLocaleDateString(
                  "en-GB",
                  { weekday: "short", day: "numeric", month: "short" },
                );
                const autoTime = new Date(requestedStart).toLocaleTimeString(
                  "en-GB",
                  { hour: "2-digit", minute: "2-digit" },
                );
                await sendPushNotification(
                  playerTokens,
                  "Booking confirmed",
                  `Your session on ${autoDate} at ${autoTime} has been automatically approved.`,
                  { type: "booking_approved", bookingRequestId: request.id },
                  playerId,
                );
              }
            } catch {
              /* non-fatal */
            }
          }
        } catch (autoApproveErr) {
          console.error(
            "[Booking] Auto-approve check failed (non-fatal):",
            autoApproveErr,
          );
        }
      }

      // Notify coach (in-app + push). The in-app row is ALWAYS written so the
      // coach sees the request even if push delivery fails (no tokens, stale
      // tokens, transport error, etc.). Push is best-effort and logged.
      if (coachId) {
        const sessionTypeLabel =
          sessionType === "private"
            ? "Private Lesson"
            : sessionType === "semi_private"
              ? "Semi-Private Lesson"
              : sessionType === "group"
                ? "Group Session"
                : "Open Play";
        const requestedDate = new Date(requestedStart).toLocaleDateString(
          "en-GB",
          {
            weekday: "short",
            day: "numeric",
            month: "short",
          },
        );
        const notifTitle = isJoinRequest
          ? "New Join Request"
          : "New Lesson Request";
        const notifBody = `${player.name} wants a ${duration}-min ${sessionTypeLabel} on ${requestedDate}`;

        // 1) Always write the in-app coach notification row.
        try {
          await db.insert(coachNotifications).values({
            coachId,
            type: "booking_request",
            title: notifTitle,
            message: notifBody,
            priority: "high",
            actionUrl: `/coach/booking-requests/${request.id}`,
            metadata: {
              bookingRequestId: request.id,
              playerId,
              isJoinRequest: !!isJoinRequest,
              sessionId: isJoinRequest ? sessionId : null,
            },
          });
        } catch (inAppErr) {
          console.error(
            `[Booking] Failed to write in-app coach notification for request ${request.id}:`,
            inAppErr,
          );
        }

        // 2) Best-effort push to all of the coach's registered devices.
        try {
          const coachTokens = await getCoachPushTokens(coachId);
          console.log(
            `[Booking] coach ${coachId} push notify for request ${request.id}: ${coachTokens.length} active token(s) (isJoinRequest=${!!isJoinRequest})`,
          );
          if (coachTokens.length === 0) {
            console.warn(
              `[Booking] coach ${coachId} has 0 active push tokens — request ${request.id} will only show in-app`,
            );
          } else {
            const tickets = await sendPushNotification(
              coachTokens,
              notifTitle,
              notifBody,
              { type: "booking_request", bookingRequestId: request.id },
              undefined,
            );
            const okCount = tickets.filter((t) => t.status === "ok").length;
            const errCount = tickets.length - okCount;
            console.log(
              `[Booking] push delivery for request ${request.id} → ${okCount} ok, ${errCount} error of ${tickets.length} ticket(s)`,
            );
            if (errCount > 0) {
              for (const t of tickets) {
                if (t.status !== "ok") {
                  console.error(
                    `[Booking] push ticket error for request ${request.id}: ${t.message || ""} (${t.details?.error || "unknown"})`,
                  );
                }
              }
            }
          }
        } catch (notifErr) {
          console.error(
            `[Booking] Failed to send coach push for request ${request.id}:`,
            notifErr,
          );
        }
      }

      res.status(201).json(request);
    } catch (error) {
      console.error("Create booking request error:", error);
      res.status(500).json({ error: "Failed to create booking request" });
    }
  },
);

// Get joinable sessions for player (open groups with spots in their academy)
router.get(
  "/api/player/joinable-sessions",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;

      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const { date, sessionType, sport } = req.query;
      const requestedCoachId =
        (req.query.coachId as string | undefined) || undefined;

      // Task #1037: when the player is browsing a public coach (possibly from
      // another academy), look up that coach's academy and pull joinable
      // sessions from there as well. The coach must be publicly bookable.
      let scopedAcademyId = academyId || "";
      if (requestedCoachId) {
        const targetCoach = await storage.getCoach(requestedCoachId);
        if (
          targetCoach &&
          targetCoach.publicProfileEnabled !== false &&
          targetCoach.academyId
        ) {
          scopedAcademyId = targetCoach.academyId;
        }
      }

      if (!scopedAcademyId) {
        return res.json([]);
      }

      const player = await storage.getPlayer(playerId, academyId || "");
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Get all future sessions for the resolved academy
      const allSessions = await storage.getSessionsByAcademy(scopedAcademyId);
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date();
      const DUBAI_OFFSET = 4;
      const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);

      // Filter joinable sessions
      const joinable = await Promise.all(
        allSessions
          .filter((s: any) => {
            const sessionStart = new Date(s.startTime);
            const isFuture = sessionStart > now;
            const matchesType = !sessionType || s.sessionType === sessionType;
            const matchesDate =
              !date || sessionStart.toISOString().split("T")[0] === date;
            const matchesSport = !sport || s.sport === sport;
            const isGroupType =
              s.sessionType === "group" ||
              s.sessionType === "semi_private" ||
              s.sessionType === "open_play";
            return (
              isFuture &&
              matchesType &&
              matchesDate &&
              matchesSport &&
              isGroupType
            );
          })
          .map(async (s: any) => {
            const players = await storage.getSessionPlayers(s.id);
            const maxPlayers = s.maxPlayers || 6;
            // Count offered waitlist entries as reserved to prevent double-booking
            const effectiveBookingCount = await getEffectivePlayerCount(s.id);
            const hasSpots = effectiveBookingCount < maxPlayers;
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
              courtId: s.courtId || null,
              courtName: s.courtName || "Court",
              locationName: s.locationName || s.location || "Location",
              maxPlayers,
              currentPlayers: players.length,
              players: players.map((p: any) => ({ id: p.id, name: p.name })),
              ballLevel: s.ballLevel,
              skillLevel: s.skillLevel,
            };
          }),
      );

      res.json(joinable.filter(Boolean));
    } catch (error) {
      console.error("Player joinable sessions error:", error);
      res.status(500).json({ error: "Failed to fetch joinable sessions" });
    }
  },
);

// Cancel a booking request
router.post(
  "/api/player/booking-requests/:id/cancel",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
        return res
          .status(400)
          .json({ error: "Only pending requests can be cancelled" });
      }

      const updated = await storage.updateBookingRequest(id, {
        status: "cancelled",
      });

      // Unblock court if there was a court blocked for this request
      if (request.courtId) {
        try {
          await db
            .delete(courtAvailability)
            .where(
              and(
                eq(courtAvailability.courtId, request.courtId),
                eq(courtAvailability.blockedReason, `booking_request:${id}`),
              ),
            );
        } catch (courtUnblockError) {
          console.error("Court unblock error (non-fatal):", courtUnblockError);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Cancel booking request error:", error);
      res.status(500).json({ error: "Failed to cancel booking request" });
    }
  },
);

// ==================== AI BOOKING FOCUS SUGGESTIONS ====================

// Get AI-powered session focus suggestions based on player history
router.post(
  "/api/player/booking-ai-focus",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const player = await storage.getPlayer(
        playerId,
        req.user?.academyId || "",
      );
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Fetch last 5 session coach feedback (public only)
      const recentFeedback = await db
        .select({
          feedbackType: inSessionFeedback.feedbackType,
          message: inSessionFeedback.message,
          createdAt: inSessionFeedback.createdAt,
        })
        .from(inSessionFeedback)
        .where(
          and(
            eq(inSessionFeedback.playerId, playerId),
            eq(inSessionFeedback.visibility, "public"),
          ),
        )
        .orderBy(desc(inSessionFeedback.createdAt))
        .limit(5);

      // Fetch last 10 skill observations
      const recentSkillObs = await db
        .select({
          direction: sessionSkillObservations.direction,
          note: sessionSkillObservations.note,
          appliedDelta: sessionSkillObservations.appliedDelta,
          domainId: sessionSkillObservations.domainId,
          createdAt: sessionSkillObservations.createdAt,
        })
        .from(sessionSkillObservations)
        .where(eq(sessionSkillObservations.playerId, playerId))
        .orderBy(desc(sessionSkillObservations.createdAt))
        .limit(10);

      // Fetch recent XP transactions
      const recentXp = await db
        .select({
          xpAmount: xpTransactions.xpAmount,
          source: xpTransactions.source,
          description: xpTransactions.description,
          createdAt: xpTransactions.createdAt,
        })
        .from(xpTransactions)
        .where(eq(xpTransactions.playerId, playerId))
        .orderBy(desc(xpTransactions.createdAt))
        .limit(10);

      // Fetch Glow Score weak areas - skills with lowest moving average scores
      const weakGlowAreas = await db
        .select({
          skillName: glowSkills.name,
          pillar: glowSkills.pillar,
          movingAverage: playerSkillScores.movingAverage,
          observationCount: playerSkillScores.observationCount,
        })
        .from(playerSkillScores)
        .innerJoin(glowSkills, eq(playerSkillScores.skillId, glowSkills.id))
        .where(eq(playerSkillScores.playerId, playerId))
        .orderBy(asc(playerSkillScores.movingAverage))
        .limit(5);

      // Build context summary for AI
      const feedbackSummary =
        recentFeedback.length > 0
          ? recentFeedback
              .map((f) => `[${f.feedbackType}] ${f.message}`)
              .join("\n")
          : "No recent coach feedback available.";

      const skillSummary =
        recentSkillObs.length > 0
          ? recentSkillObs
              .map((o) => `${o.direction} trend${o.note ? `: ${o.note}` : ""}`)
              .join("\n")
          : "No recent skill observations available.";

      const xpSummary =
        recentXp.length > 0
          ? recentXp
              .map(
                (x) =>
                  `${x.xpAmount > 0 ? "+" : ""}${x.xpAmount} XP (${x.source})${x.description ? ": " + x.description : ""}`,
              )
              .join("\n")
          : "No recent XP history.";

      const glowWeakSummary =
        weakGlowAreas.length > 0
          ? weakGlowAreas
              .map(
                (w) =>
                  `${w.skillName} (${w.pillar} pillar, avg score: ${w.movingAverage ?? "new"})`,
              )
              .join("\n")
          : "No Glow Score skill data yet.";

      const playerName = player.name || "this player";
      const ballLevel = player.ballLevel || "intermediate";

      const prompt = `You are a tennis coaching AI assistant. Based on the player data below, suggest 3 specific, actionable session focus areas for their upcoming lesson. Prioritize their weakest Glow Score skills first. Return ONLY a JSON array of short focus phrases (3-7 words each), no explanations.

Player: ${playerName} (Ball Level: ${ballLevel})

Glow Score Weak Areas (prioritize these):
${glowWeakSummary}

Recent Coach Feedback:
${feedbackSummary}

Recent Skill Observations:
${skillSummary}

Recent XP Activity:
${xpSummary}

Return format example: ["Backhand slice consistency", "Net approach footwork", "Serve second ball placement"]
Return only the JSON array, nothing else.`;

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      let suggestions: string[] = [];
      const bookingAcademyId = (req as any).user?.academyId ?? null;
      try {
        const { getAcademyBudgetState } = await import(
          "../services/aiBudgetService"
        );
        let budgetExhausted = false;
        if (bookingAcademyId) {
          const budgetState = await getAcademyBudgetState(
            bookingAcademyId,
          ).catch(() => null);
          if (budgetState?.status === "exhausted") {
            budgetExhausted = true;
          }
        }
        if (!budgetExhausted) {
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 200,
            temperature: 0.7,
          });
          const content =
            response.choices?.[0]?.message?.content?.trim() || "[]";
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            suggestions = parsed.slice(0, 3);
          }
          const { logAiCall } = await import("../middleware/aiQuotaMiddleware");
          logAiCall({
            userId: (req as any).user?.id ?? null,
            featureType: "other",
            model: "gpt-4o-mini",
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            totalTokens: response.usage?.total_tokens ?? 0,
            academyId: bookingAcademyId,
          }).catch(() => {});
        }
      } catch {
        suggestions = [];
      }

      if (suggestions.length === 0) {
        // Build suggestions from Glow Score weak areas first, then ball level fallbacks
        if (weakGlowAreas.length > 0) {
          for (const area of weakGlowAreas.slice(0, 3)) {
            suggestions.push(`Improve ${area.skillName.toLowerCase()}`);
          }
        }
        if (suggestions.length < 3) {
          const fallbacks: Record<string, string[]> = {
            red: [
              "Basic rally consistency",
              "Forehand groundstroke",
              "Court positioning",
            ],
            orange: [
              "Cross-court rallying",
              "Volley technique",
              "Serve placement",
            ],
            green: [
              "Backhand slice",
              "Net approach footwork",
              "Serve consistency",
            ],
            yellow: [
              "Topspin rally depth",
              "Approach shot patterns",
              "Return of serve",
            ],
            default: [
              "Technique refinement",
              "Match tactics",
              "Footwork & movement",
            ],
          };
          const level = (ballLevel || "default").toLowerCase();
          const levelFallbacks = fallbacks[level] || fallbacks.default;
          for (const s of levelFallbacks) {
            if (suggestions.length >= 3) break;
            if (!suggestions.includes(s)) suggestions.push(s);
          }
        }
      }

      res.json({ suggestions: suggestions.slice(0, 3) });
    } catch (error) {
      console.error("AI focus suggestions error:", error);
      res.json({
        suggestions: ["Technique refinement", "Match consistency", "Footwork"],
      });
    }
  },
);

// ==================== PLAY SCREEN (MMO STYLE) ====================

// Get available sessions for Play screen
router.get(
  "/api/play/sessions",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;

      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      // Get player's academyId from database (more reliable than req.user.academyId)
      const currentPlayer = await storage.getPlayer(playerId);
      const academyId = currentPlayer?.academyId;
      console.log("[PlaySessions] Player:", playerId, "Academy:", academyId);

      // scope param: 'mine' (default) = own academy only, 'all' = cross-academy
      const scope = (req.query.scope as string) || "mine";

      // Get upcoming group/semi sessions from player's academy + public sessions
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date();
      const DUBAI_OFFSET = 4;
      const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 14); // Next 2 weeks

      // Always fetch own-academy sessions (or sessions with no academy if player has no academy)
      const ownAcademySessions = await db.query.sessions.findMany({
        where: (s, { and, or, eq, gte, lte, inArray }) =>
          and(
            academyId
              ? eq(s.academyId, academyId)
              : eq(s.academyId, null as any),
            inArray(s.sessionType, ["group", "semi_private"]),
            eq(s.status, "scheduled"),
            gte(s.startTime, now),
            lte(s.startTime, futureDate),
          ),
        orderBy: (s, { asc }) => [asc(s.startTime)],
      });

      // Always fetch cross-academy public sessions (coaching_series.isPublic = true)
      // regardless of scope — public lessons from any academy are always shown
      let publicCrossSessions: typeof ownAcademySessions = [];
      try {
        const publicSessionRows = await db.execute(
          sql`SELECT s.* FROM sessions s
              INNER JOIN coaching_series cs ON s.series_id = cs.id
              WHERE cs.is_public = true
                AND s.session_type IN ('group', 'semi_private')
                AND s.status = 'scheduled'
                AND s.start_time >= ${now}
                AND s.start_time <= ${futureDate}
                ${academyId ? sql`AND s.academy_id != ${academyId}` : sql``}
              ORDER BY s.start_time ASC`,
        );
        publicCrossSessions = publicSessionRows.rows.map((row: any) => ({
          id: row.id,
          title: row.title,
          sessionType: row.session_type,
          startTime: new Date(row.start_time),
          endTime: new Date(row.end_time),
          status: row.status,
          academyId: row.academy_id,
          coachId: row.coach_id,
          locationId: row.location_id,
          courtId: row.court_id,
          seriesId: row.series_id,
          ballLevel: row.ball_level,
          price: row.price,
          academyPrice: row.academy_price,
          maxPlayers: row.max_players,
          vibe: row.vibe,
          minLevel: row.min_level,
          maxLevel: row.max_level,
          xpReward: row.xp_reward,
        })) as any[];
      } catch (e) {
        console.error(
          "[PlaySessions] Error fetching public cross-academy sessions:",
          e,
        );
      }

      // Merge and deduplicate by session ID (own-academy sessions take priority)
      const ownIds = new Set(ownAcademySessions.map((s) => s.id));
      const mergedSessions = [
        ...ownAcademySessions,
        ...publicCrossSessions.filter((s) => !ownIds.has(s.id)),
      ].sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );

      const sessions = mergedSessions;

      // Task #736 — bulk-fetch academy names for cross-academy sessions
      // (was N+1: one storage.getAcademy call per unique academy).
      const academyNameCache = new Map<string, string>();
      {
        const uniqueAcademyIds = [
          ...new Set(
            sessions.map((s) => s.academyId).filter(Boolean) as string[],
          ),
        ];
        if (uniqueAcademyIds.length > 0) {
          try {
            const rows = await db
              .select({ id: academies.id, name: academies.name })
              .from(academies)
              .where(inArray(academies.id, uniqueAcademyIds));
            for (const row of rows) {
              if (row.name) academyNameCache.set(row.id, row.name);
            }
          } catch (e) {}
        }
      }

      // Determine which level(s) to show based on optional ?level= query param
      // level=all -> skip level filter entirely
      // level=<specific> -> filter to that level
      // absent -> default to player's own ball level
      const levelParam = (req.query.level as string | undefined)?.toLowerCase();
      const playerBallLevel = (
        currentPlayer?.ballLevel || "green"
      ).toLowerCase();
      const targetLevel = levelParam ?? playerBallLevel;

      // Task #736 — bulk-fetch series rows in a single query (was N+1: one
      // storage.getCoachingSeriesById call per unique series).
      const seriesIds = [
        ...new Set(sessions.map((s) => s.seriesId).filter(Boolean)),
      ] as string[];
      const seriesLevelMap = new Map<string, string>();
      const seriesDropInMap = new Map<
        string,
        { isPublic: boolean; publicDropInPrice: number | null }
      >();
      const seriesLocationMap = new Map<string, string>();
      if (seriesIds.length > 0) {
        try {
          const seriesRows = await db
            .select()
            .from(coachingSeries)
            .where(inArray(coachingSeries.id, seriesIds));
          for (const series of seriesRows) {
            if (series.ballLevel)
              seriesLevelMap.set(series.id, series.ballLevel.toLowerCase());
            seriesDropInMap.set(series.id, {
              isPublic: series.isPublic ?? false,
              publicDropInPrice: series.publicDropInPrice
                ? parseFloat(series.publicDropInPrice.toString())
                : null,
            });
            if (series.locationId)
              seriesLocationMap.set(series.id, series.locationId);
          }
        } catch (e) {}
      }
      const levelFilteredSessions =
        targetLevel === "all"
          ? sessions
          : sessions.filter((s) => {
              const sessionBallLevel = (s.ballLevel || "").toLowerCase();
              const seriesLevel = s.seriesId
                ? seriesLevelMap.get(s.seriesId) || ""
                : "";
              const effectiveLevel = sessionBallLevel || seriesLevel;
              if (!effectiveLevel) return false;
              return effectiveLevel === targetLevel;
            });

      // Task #736 — replaced per-session enrichment N+1 (8-10 queries per
      // session) with batched prefetches keyed by Map for O(1) lookup.
      const filteredSessionIds = levelFilteredSessions
        .map((s) => s.id)
        .filter(Boolean) as string[];

      // 1. session_players for ALL filtered sessions
      const sessionPlayersBySessionId = new Map<
        string,
        { playerId: string | null }[]
      >();
      if (filteredSessionIds.length > 0) {
        const rows = await db
          .select({
            sessionId: sessionPlayers.sessionId,
            playerId: sessionPlayers.playerId,
          })
          .from(sessionPlayers)
          .where(inArray(sessionPlayers.sessionId, filteredSessionIds));
        for (const row of rows) {
          if (!row.sessionId) continue;
          const list = sessionPlayersBySessionId.get(row.sessionId) || [];
          list.push({ playerId: row.playerId });
          sessionPlayersBySessionId.set(row.sessionId, list);
        }
      }

      // 2. series_players for sessions whose session_players list is empty
      const seriesIdsNeedingPlayers = [
        ...new Set(
          levelFilteredSessions
            .filter(
              (s) =>
                s.seriesId &&
                (sessionPlayersBySessionId.get(s.id) || []).filter(
                  (sp) => sp.playerId,
                ).length === 0,
            )
            .map((s) => s.seriesId!),
        ),
      ];
      const seriesPlayersBySeriesId = new Map<string, string[]>();
      if (seriesIdsNeedingPlayers.length > 0) {
        const rows = await db
          .select({
            seriesId: seriesPlayers.seriesId,
            playerId: seriesPlayers.playerId,
            status: seriesPlayers.status,
          })
          .from(seriesPlayers)
          .where(inArray(seriesPlayers.seriesId, seriesIdsNeedingPlayers));
        for (const row of rows) {
          if (!row.seriesId || row.status !== "active" || !row.playerId)
            continue;
          const list = seriesPlayersBySeriesId.get(row.seriesId) || [];
          list.push(row.playerId);
          seriesPlayersBySeriesId.set(row.seriesId, list);
        }
      }

      // 3. Resolve all unique playerIds across both sources, fetch them once
      const allPlayerIds = new Set<string>();
      for (const s of levelFilteredSessions) {
        const direct = (sessionPlayersBySessionId.get(s.id) || [])
          .map((sp) => sp.playerId)
          .filter(Boolean) as string[];
        if (direct.length > 0) {
          direct.forEach((id) => allPlayerIds.add(id));
        } else if (s.seriesId) {
          (seriesPlayersBySeriesId.get(s.seriesId) || []).forEach((id) =>
            allPlayerIds.add(id),
          );
        }
      }
      const playerById = new Map<string, any>();
      if (allPlayerIds.size > 0) {
        const rows = await db
          .select()
          .from(players)
          .where(inArray(players.id, [...allPlayerIds]));
        for (const p of rows) playerById.set(p.id, p);
      }

      // 4. Coaches + coach review stats (bulk)
      const coachIds = [
        ...new Set(
          levelFilteredSessions
            .map((s) => s.coachId)
            .filter(Boolean) as string[],
        ),
      ];
      const coachById = new Map<string, any>();
      const coachStatsByCoachId = new Map<
        string,
        { averageOverall: number | null; totalReviews: number }
      >();
      if (coachIds.length > 0) {
        const [coachRows, statRows] = await Promise.all([
          db.select().from(coaches).where(inArray(coaches.id, coachIds)),
          db
            .select()
            .from(coachReviewStats)
            .where(inArray(coachReviewStats.coachId, coachIds)),
        ]);
        for (const c of coachRows) coachById.set(c.id, c);
        for (const s of statRows) {
          if (s.coachId) {
            coachStatsByCoachId.set(s.coachId, {
              averageOverall: s.averageOverall
                ? parseFloat(s.averageOverall.toString())
                : null,
              totalReviews: s.totalReviews || 0,
            });
          }
        }
      }

      // 5. Courts (bulk)
      const courtIds = [
        ...new Set(
          levelFilteredSessions
            .map((s) => s.courtId)
            .filter(Boolean) as string[],
        ),
      ];
      const courtById = new Map<string, any>();
      if (courtIds.length > 0) {
        const rows = await db
          .select()
          .from(courts)
          .where(inArray(courts.id, courtIds));
        for (const c of rows) courtById.set(c.id, c);
      }

      // 6. Academies (bulk) - resolved by session.academyId OR coach.academyId
      const academyIdSet = new Set<string>();
      for (const s of levelFilteredSessions) {
        if (s.academyId) academyIdSet.add(s.academyId);
        const coach = s.coachId ? coachById.get(s.coachId) : null;
        if (coach?.academyId) academyIdSet.add(coach.academyId);
      }
      const academyById = new Map<string, any>();
      if (academyIdSet.size > 0) {
        const rows = await db
          .select()
          .from(academies)
          .where(inArray(academies.id, [...academyIdSet]));
        for (const a of rows) academyById.set(a.id, a);
      }

      // 7. Resolve location IDs (session > series > court chain), then bulk-fetch
      const locationIdSet = new Set<string>();
      const resolvedLocationIdBySession = new Map<string, string | null>();
      for (const s of levelFilteredSessions) {
        let locId = (s.locationId as string | null) || null;
        if (!locId && s.seriesId)
          locId = seriesLocationMap.get(s.seriesId) || null;
        if (!locId && s.courtId)
          locId =
            (courtById.get(s.courtId)?.locationId as string | null) || null;
        resolvedLocationIdBySession.set(s.id, locId);
        if (locId) locationIdSet.add(locId);
      }
      const locationById = new Map<string, any>();
      if (locationIdSet.size > 0) {
        const rows = await db
          .select()
          .from(locations)
          .where(inArray(locations.id, [...locationIdSet]));
        for (const l of rows) locationById.set(l.id, l);
      }

      // 8. Waitlist for ALL filtered sessions
      const waitlistBySessionId = new Map<
        string,
        {
          playerId: string | null;
          status: string;
          offeredAt: Date | null;
          claimWindowMinutes: number | null;
          createdAt: Date | null;
        }[]
      >();
      if (filteredSessionIds.length > 0) {
        const rows = await db.query.sessionWaitlist.findMany({
          where: (w, { and, inArray, inArray: ia }) =>
            and(
              inArray(w.sessionId, filteredSessionIds),
              ia(w.status, ["waiting", "offered"]),
            ),
          orderBy: (w, { asc }) => asc(w.createdAt),
        });
        for (const w of rows) {
          if (!w.sessionId) continue;
          const list = waitlistBySessionId.get(w.sessionId) || [];
          list.push({
            playerId: w.playerId,
            status: w.status,
            offeredAt: w.offeredAt,
            claimWindowMinutes: w.claimWindowMinutes,
            createdAt: w.createdAt,
          });
          waitlistBySessionId.set(w.sessionId, list);
        }
      }

      const enrichedSessions = levelFilteredSessions.map((session) => {
        // Resolve players for this session (session_players first, then series_players)
        const directSessionPlayers =
          sessionPlayersBySessionId.get(session.id) || [];
        let playerIds = directSessionPlayers
          .map((sp) => sp.playerId)
          .filter(Boolean) as string[];
        if (playerIds.length === 0 && session.seriesId) {
          playerIds = seriesPlayersBySeriesId.get(session.seriesId) || [];
        }
        const players = playerIds
          .map((id) => playerById.get(id))
          .filter(Boolean);

        // Coach + rating stats
        const coach = session.coachId ? coachById.get(session.coachId) : null;
        const coachName: string | null = coach?.name || null;
        const coachPhotoUrl: string | null = coach?.photoUrl || null;
        const stats = session.coachId
          ? coachStatsByCoachId.get(session.coachId)
          : null;
        const coachAverageRating: number | null = stats?.averageOverall ?? null;
        const coachTotalRatings: number = stats?.totalReviews ?? 0;

        // Academy (session.academyId || coach.academyId)
        const resolvedAcademyId = session.academyId || coach?.academyId || null;
        const academy = resolvedAcademyId
          ? academyById.get(resolvedAcademyId)
          : null;
        const sessionAcademyId: string | null =
          academy?.id ?? resolvedAcademyId ?? null;
        const academyName: string | null = academy?.name ?? null;
        const academyLogoUrl: string | null = academy?.logoUrl ?? null;
        const academyCity: string | null = academy?.city ?? null;

        // Court name
        const court = session.courtId ? courtById.get(session.courtId) : null;
        const courtName: string | null = court?.name || null;

        // Location
        const locationId = resolvedLocationIdBySession.get(session.id) || null;
        const location = locationId ? locationById.get(locationId) : null;
        const locationName: string = location?.name || "Location TBD";
        const locationLat: number | null = location?.lat ?? null;
        const locationLng: number | null = location?.lng ?? null;
        const locationGooglePlaceId: string | null =
          location?.googlePlaceId ?? null;

        // Waitlist
        const waitlistRecords = waitlistBySessionId.get(session.id) || [];

        const maxPlayers = session.maxPlayers || 6;
        const currentPlayers = players.length;
        // Count offered waitlist entries as reserved seats for accurate status
        const offeredCount = waitlistRecords.filter(
          (w) => w.status === "offered",
        ).length;
        const effectiveCount = currentPlayers + offeredCount;
        let status: "open" | "almost_full" | "full" = "open";
        if (effectiveCount >= maxPlayers) status = "full";
        else if (maxPlayers - effectiveCount === 1) status = "almost_full";

        // Check if current player is enrolled in this session
        const isEnrolled = playerIds.includes(playerId);

        // Check if current player is on waitlist
        const myWaitlistEntry = waitlistRecords.find(
          (w) => w.playerId === playerId,
        );
        const isOnWaitlist = !!myWaitlistEntry;
        // Position counts ALL active entries (waiting + offered) ahead in queue order
        const waitlistPosition = myWaitlistEntry
          ? waitlistRecords.findIndex((w) => w.playerId === playerId) + 1
          : null;
        const waitlistStatus = myWaitlistEntry?.status || null;
        const offeredAt = myWaitlistEntry?.offeredAt?.toISOString() || null;
        const claimWindowMinutes = myWaitlistEntry?.claimWindowMinutes || 30;

        // Calculate publicDropInPrice: only expose when coaching_series.isPublic = true
        // Use series.publicDropInPrice as the authoritative price for drop-in players
        const seriesDropIn = session.seriesId
          ? seriesDropInMap.get(session.seriesId)
          : null;
        const isPublicSeries = seriesDropIn?.isPublic ?? false;
        const publicDropInPrice = isPublicSeries
          ? (seriesDropIn?.publicDropInPrice ??
            (session.academyPrice
              ? parseFloat(session.academyPrice.toString())
              : null) ??
            (session.price ? parseFloat(session.price.toString()) : null))
          : null;

        return {
          id: session.id,
          title:
            session.title ||
            `${session.sessionType === "group" ? "Group" : "Semi"} Training`,
          sessionType: session.sessionType,
          startTime: session.startTime.toISOString(),
          endTime: session.endTime.toISOString(),
          locationName,
          locationLat,
          locationLng,
          locationGooglePlaceId,
          courtName,
          coachName,
          coachId: session.coachId,
          coachPhotoUrl,
          coachAverageRating,
          coachTotalRatings,
          academyId: sessionAcademyId,
          academyName,
          academyLogoUrl,
          academyCity,
          publicDropInPrice,
          ballLevel: session.ballLevel,
          vibe: session.vibe || "casual",
          minLevel: session.minLevel,
          maxLevel: session.maxLevel,
          xpReward: session.xpReward || 20,
          maxPlayers,
          currentPlayers: effectiveCount,
          enrolledCount: currentPlayers,
          players: players.map((p) => ({
            id: p.id,
            name: p.name,
            level: p.level || 1,
            ballLevel: p.ballLevel,
            avatarUrl: p.profilePhotoUrl,
          })),
          waitlistCount: waitlistRecords.filter((w) => w.status === "waiting")
            .length,
          status,
          isEnrolled,
          isOnWaitlist,
          waitlistPosition,
          waitlistStatus,
          offeredAt,
          claimWindowMinutes,
          sessionAcademyId: session.academyId || null,
          sessionAcademyName: session.academyId
            ? academyNameCache.get(session.academyId) || null
            : null,
        };
      });

      res.json(enrichedSessions);
    } catch (error) {
      console.error("Play sessions error:", error);
      res.status(500).json({ error: "Failed to fetch play sessions" });
    }
  },
);

// Get nearby players for Play screen
router.get(
  "/api/play/nearby-players",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { filter, travelTime, scope: scopeParam } = req.query;
      const useTravelTime = travelTime === "true";
      // Task #1070 — extra discovery flags used by the Play tab carousels.
      // recentlyActive=true → only players who logged in within the last 24h
      //                       (worldwide, capped to a small batch for the row).
      // suggested=true     → "Players you might know": rank by shared sport +
      //                       same ball-level bucket + same country (worldwide).
      const recentlyActive = req.query.recentlyActive === "true";
      const suggested = req.query.suggested === "true";
      // Task #1070 — when the Play tab passes ?sport=padel/tennis/etc we
      // narrow candidates to players who have a profile in that sport so
      // the carousels match the chip the player picked.
      const sportFilter = ((req.query.sport as string) || "").trim().toLowerCase() || null;
      const limitParam = parseInt((req.query.limit as string) || "0", 10);
      const limit = Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 50)
        : null;
      // Both special modes default to worldwide so the carousel feels global,
      // unless the caller explicitly provides a scope.
      const scope = (scopeParam as string) || (recentlyActive || suggested ? "all" : "mine");

      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      // Get current player's info for filtering
      const currentPlayer = await db.query.players.findFirst({
        where: (p, { eq }) => eq(p.id, playerId),
      });

      const academyId = currentPlayer?.academyId;
      console.log(
        `[NearbyPlayers] Player ${playerId} academyId: ${academyId} scope: ${scope}`,
      );

      // Subquery: player IDs that belong to an active (verified) user account
      const activePlayerIdSubquery = db
        .select({ id: users.playerId })
        .from(users)
        .where(and(eq(users.status, "active"), isNotNull(users.playerId)));

      // Task #1033 — discovery scope filter. The chip in the player UI lets
      // users narrow Players to "My academy" / "My country" / "Worldwide".
      // Hidden + academy-only privacy is still enforced after enrichment.
      const callerCountry = (currentPlayer?.country || "").trim().toLowerCase();
      const scopeConditions: any[] = [
        ne(players.id, playerId),
        inArray(players.id, activePlayerIdSubquery),
        not(inArray(players.id, HIDDEN_PLAYER_IDS)),
      ];
      if (scope === "mine" && academyId) {
        scopeConditions.push(eq(players.academyId, academyId));
      } else if (scope === "country" && callerCountry) {
        // Case-insensitive country match — players' country column is free text
        scopeConditions.push(sql`LOWER(${players.country}) = ${callerCountry}`);
      }
      const activePlayers = await db
        .select()
        .from(players)
        .where(and(...scopeConditions));

      // Bulk-fetch last_login_at for all active players to avoid N+1
      const playerIds = activePlayers.map((p) => p.id);
      const userLoginRows =
        playerIds.length > 0
          ? await db
              .select({
                playerId: users.playerId,
                lastLoginAt: users.lastLoginAt,
              })
              .from(users)
              .where(inArray(users.playerId, playerIds))
          : [];
      const lastLoginByPlayerId: Record<string, Date | null> =
        Object.fromEntries(
          userLoginRows.map((u) => [u.playerId!, u.lastLoginAt ?? null]),
        );

      // Task #736 — batch mutual-session counts and open-to-play lookups in
      // 2 set-based queries instead of 2 per candidate.
      const mutualByPlayerId = new Map<string, number>();
      const openToPlaySet = new Set<string>();
      if (playerId && playerIds.length > 0) {
        try {
          const mutualRows = await db.execute(sql`
            SELECT sp2.player_id AS player_id, COUNT(DISTINCT sp1.session_id)::int AS count
            FROM session_players sp1
            INNER JOIN session_players sp2 ON sp1.session_id = sp2.session_id
            WHERE sp1.player_id = ${playerId}
              AND sp2.player_id IN (${sql.join(
                playerIds.map((id: string) => sql`${id}`),
                sql`, `,
              )})
            GROUP BY sp2.player_id
          `);
          for (const row of mutualRows.rows as {
            player_id: string;
            count: number;
          }[]) {
            mutualByPlayerId.set(row.player_id, Number(row.count));
          }
        } catch (e) {
          console.error("Mutual sessions batch query failed:", e);
        }
        try {
          const otpRows = await db.execute(sql`
            SELECT u.player_id AS player_id
            FROM open_to_play o
            INNER JOIN users u ON u.id = o.user_id
            WHERE u.player_id IN (${sql.join(
              playerIds.map((id: string) => sql`${id}`),
              sql`, `,
            )})
              AND o.is_active = true
              AND o.available_until > NOW()
          `);
          for (const row of otpRows.rows as { player_id: string }[]) {
            if (row.player_id) openToPlaySet.add(row.player_id);
          }
        } catch (e) {
          // Table might not exist; fall back to player field below
        }
      }

      const enrichedPlayers = activePlayers.map((player) => {
        const mutualCount = mutualByPlayerId.get(player.id) ?? 0;
        const isOpenToPlay =
          openToPlaySet.has(player.id) || (player as any).openToPlay || false;

        return {
          privacyLevel: (player as any).privacyLevel || "platform",
          candidateAcademyId: player.academyId || null, // used for privacy check, stripped before response
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
          hasHomeAddress: !!(
            player.homeAddress &&
            player.homeLat != null &&
            player.homeLng != null
          ),
          lastLatitude: player.lastLatitude ?? null,
          lastLongitude: player.lastLongitude ?? null,
          lastOnlineAt: lastLoginByPlayerId[player.id]?.toISOString() ?? null,
          // Task #1033 — flag + city on player cards across scopes.
          city: player.city ?? null,
          country: player.country ?? null,
          // Task #1070 — sport overlap signal for the suggested branch. Stripped
          // from the response shape later (privacy + payload size).
          sportProfiles: (player.sportProfiles ?? null) as Record<string, unknown> | null,
        };
      });

      // Apply privacy filter first - hidden players are never visible
      let filteredPlayers = enrichedPlayers.filter((p) => {
        if (p.privacyLevel === "hidden") return false;
        // Academy-only players only visible to players from their own academy
        if (p.privacyLevel === "academy" && p.candidateAcademyId !== academyId)
          return false;
        // Task #1070 — sport chip: keep players who have a profile in the
        // requested sport, or whose default sport (tennis) matches when the
        // candidate has no sportProfiles set yet.
        if (sportFilter) {
          const profiles = p.sportProfiles && typeof p.sportProfiles === "object"
            ? Object.keys(p.sportProfiles).map((s) => s.toLowerCase())
            : [];
          const effective = profiles.length > 0 ? profiles : ["tennis"];
          if (!effective.includes(sportFilter)) return false;
        }
        return true;
      });

      // Task #1070 — recentlyActive: filter to logins within the last 24h.
      if (recentlyActive) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        filteredPlayers = filteredPlayers.filter((p) => {
          if (!p.lastOnlineAt) return false;
          const t = new Date(p.lastOnlineAt).getTime();
          return Number.isFinite(t) && t >= cutoff;
        });
        // Most recently active first.
        filteredPlayers.sort((a, b) => {
          const at = a.lastOnlineAt ? new Date(a.lastOnlineAt).getTime() : 0;
          const bt = b.lastOnlineAt ? new Date(b.lastOnlineAt).getTime() : 0;
          return bt - at;
        });
      }

      // Task #1070 — suggested: "Players you might know" — score by shared
      // sport (sportProfiles), same ball-level bucket, same country.
      if (suggested) {
        const callerBallBucket = (currentPlayer?.ballLevel || "")
          .toLowerCase()
          .split(/[\s_-]/)[0];
        const callerCountryNorm = (currentPlayer?.country || "")
          .trim()
          .toLowerCase();
        const callerSports = new Set<string>();
        const callerSportProfiles =
          currentPlayer?.sportProfiles &&
          typeof currentPlayer.sportProfiles === "object"
            ? Object.keys(currentPlayer.sportProfiles)
            : [];
        for (const s of callerSportProfiles) {
          if (s) callerSports.add(s.toLowerCase());
        }
        // Always count tennis (the schema default) so single-sport players
        // still get matched on level + country.
        if (callerSports.size === 0) callerSports.add("tennis");

        type Candidate = typeof filteredPlayers[number];
        const scoreFor = (p: Candidate): number => {
          let score = 0;
          // Same ball-level bucket (e.g. "intermediate", "advanced").
          const pBucket = (p.ballLevel || "").toLowerCase().split(/[\s_-]/)[0];
          if (pBucket && callerBallBucket && pBucket === callerBallBucket) score += 3;
          // Same country.
          const pCountry = (p.country || "").trim().toLowerCase();
          if (pCountry && callerCountryNorm && pCountry === callerCountryNorm) score += 2;
          // Shared sport(s) — +2 per overlapping sport profile, capped.
          const candidateSports = p.sportProfiles && typeof p.sportProfiles === "object"
            ? Object.keys(p.sportProfiles)
            : [];
          let sportOverlap = 0;
          for (const s of candidateSports) {
            if (s && callerSports.has(s.toLowerCase())) sportOverlap += 1;
          }
          score += Math.min(sportOverlap, 3) * 2;
          // Mutual-sessions tiebreaker — small bump for people you've
          // actually played with.
          score += Math.min(p.mutualSessions || 0, 3);
          return score;
        };
        type Scored = { item: Candidate; score: number };
        const scored: Scored[] = filteredPlayers
          .map((item) => ({ item, score: scoreFor(item) }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score);
        filteredPlayers = scored.map((s) => s.item);
      }

      // Apply discovery filter if provided

      if (filter === "recommended") {
        // Sort by mutual sessions (players who train with you)
        filteredPlayers.sort((a, b) => b.mutualSessions - a.mutualSessions);
      } else if (filter === "sameLevel") {
        // Filter to players at same ball level
        const currentBallLevel =
          currentPlayer?.ballLevel?.toLowerCase().split(/[\s_-]/)[0] || "";
        filteredPlayers = filteredPlayers.filter((p) => {
          const pLevel = p.ballLevel?.toLowerCase().split(/[\s_-]/)[0] || "";
          return pLevel === currentBallLevel && currentBallLevel !== "";
        });
      } else if (filter === "openToPlay") {
        // Only show players who are open to play
        filteredPlayers = filteredPlayers.filter((p) => p.openToPlay);
      } else {
        // Default: sort by mutual sessions first, then by level proximity
        filteredPlayers.sort((a, b) => b.mutualSessions - a.mutualSessions);
      }

      // Enrich with drive times if requested and player has GPS coordinates
      const myLat = currentPlayer?.lastLatitude;
      const myLng = currentPlayer?.lastLongitude;
      if (useTravelTime && myLat != null && myLng != null) {
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (apiKey) {
          // Find players with location data (batch them for efficiency)
          const playersWithLocation = filteredPlayers.filter(
            (p) => p.lastLatitude != null && p.lastLongitude != null,
          );
          if (playersWithLocation.length > 0) {
            try {
              const destinationStr = playersWithLocation
                .map((p) => `${p.lastLatitude},${p.lastLongitude}`)
                .join("|");
              const origin = `${myLat},${myLng}`;
              const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destinationStr)}&mode=driving&departure_time=now&key=${apiKey}`;
              const dmRes = await fetch(url);
              if (dmRes.ok) {
                const dmData = (await dmRes.json()) as any;
                const elements = dmData.rows?.[0]?.elements || [];
                const travelMap = new Map<
                  string,
                  { durationMinutes: number; durationText: string }
                >();
                playersWithLocation.forEach((p, i) => {
                  const el = elements[i];
                  const dur = el?.duration_in_traffic || el?.duration;
                  if (dur?.value) {
                    travelMap.set(p.id, {
                      durationMinutes: Math.round(dur.value / 60),
                      durationText: dur.text,
                    });
                  }
                });
                // Attach drive times and sort by drive time
                filteredPlayers = filteredPlayers.map((p) => {
                  const travel = travelMap.get(p.id);
                  return travel
                    ? {
                        ...p,
                        driveTimeMinutes: travel.durationMinutes,
                        driveTimeText: travel.durationText,
                      }
                    : p;
                });
                filteredPlayers.sort((a, b) => {
                  const aMin = (a as any).driveTimeMinutes ?? Infinity;
                  const bMin = (b as any).driveTimeMinutes ?? Infinity;
                  return aMin - bMin;
                });
              }
            } catch (err) {
              console.error("[NearbyPlayers] Distance matrix error:", err);
            }
          }
        }
      }

      // Batch-fetch friend connection statuses between current player and every candidate.
      // Helper handles deterministic conflict resolution
      // (accepted > pending_received > pending_sent) and swallows DB errors so
      // a friend-table outage never blocks the players list.
      const friendStatusByPlayerId = await buildFriendStatusMap(
        playerId,
        filteredPlayers.map((p) => p.id),
      );

      // Task #1070 — apply optional limit (used by carousel rows).
      if (limit != null) {
        filteredPlayers = filteredPlayers.slice(0, limit);
      }

      // Strip internal fields from response (location data + server-only privacy fields).
      // Attach friendStatus + connectionId so the player card can render the right pill.
      const responseData = filteredPlayers.map(
        ({
          lastLatitude,
          lastLongitude,
          candidateAcademyId,
          privacyLevel,
          sportProfiles,
          ...rest
        }) => {
          const fs = friendStatusByPlayerId.get(rest.id);
          return {
            ...rest,
            friendStatus: fs?.status ?? "none",
            friendConnectionId: fs?.connectionId ?? null,
          };
        },
      );
      res.json(responseData);
    } catch (error) {
      console.error("Nearby players error:", error);
      res.status(500).json({ error: "Failed to fetch nearby players" });
    }
  },
);

// Join a session
router.post(
  "/api/play/sessions/:sessionId/join",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Enrol via the shared canonical helper (atomic capacity re-check + insert).
      // The same helper is used by the booking-expiry auto-accept path so both
      // flows stay in sync on capacity rules and statuses.
      const enrol = await enrollPlayerInGroupSession(sessionId, playerId);
      if (!enrol.ok) {
        if (enrol.reason === "full") {
          return res
            .status(400)
            .json({ error: "Session is full. Join the waitlist instead." });
        }
        if (enrol.reason === "session_cancelled") {
          return res.status(400).json({ error: "Session has been cancelled" });
        }
        return res.status(404).json({ error: "Session not found" });
      }
      if (enrol.alreadyIn) {
        return res.status(400).json({ error: "Already joined this session" });
      }

      // REFACTORED: Player join creates pending session_player only
      // Credits are processed when coach marks attendance (present/late)
      // This prevents premature credit deduction and enables proper refund handling
      const sessionType = session.sessionType || "group";

      // Get current credit info for display (no deduction)
      const activePackages = await storage.getActivePlayerPackages(
        playerId,
        session.academyId || player.academyId,
      );
      const remainingCredits = activePackages.reduce(
        (sum, pkg) => sum + pkg.remainingCredits,
        0,
      );
      const matchingPackage = activePackages.find(
        (p) => p.creditType === sessionType,
      );

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
  },
);

// Drop-in booking for public sessions — creates a Stripe Checkout session and returns URL
router.post(
  "/api/play/sessions/:sessionId/drop-in-book",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { sessionId } = req.params;

      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check if already joined
      const existingPlayer = await db.query.sessionPlayers.findFirst({
        where: (sp, { and, eq }) =>
          and(eq(sp.sessionId, sessionId), eq(sp.playerId, playerId)),
      });
      if (existingPlayer) {
        return res.status(400).json({ error: "Already joined this session" });
      }

      // Check capacity
      const maxPlayers = session.maxPlayers || 6;
      const effectiveJoinCount = await getEffectivePlayerCount(sessionId);
      if (effectiveJoinCount >= maxPlayers) {
        return res
          .status(400)
          .json({ error: "Session is full. Join the waitlist instead." });
      }

      // Get coaching series to determine isPublic + publicDropInPrice
      let seriesPublicDropInPrice: number | null = null;
      if (session.seriesId) {
        const series = await storage.getCoachingSeriesById(session.seriesId);
        if (!series?.isPublic) {
          return res
            .status(400)
            .json({ error: "This session is not open for drop-in bookings." });
        }
        if (series.publicDropInPrice) {
          seriesPublicDropInPrice = parseFloat(
            series.publicDropInPrice.toString(),
          );
        }
      }

      // Determine price (fall back to session academyPrice / price)
      const dropInPrice =
        seriesPublicDropInPrice ??
        (session.academyPrice
          ? parseFloat(session.academyPrice.toString())
          : null) ??
        (session.price ? parseFloat(session.price.toString()) : null);

      if (!dropInPrice || dropInPrice <= 0) {
        return res
          .status(400)
          .json({ error: "This session has no drop-in price configured." });
      }

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Players from the same academy use the normal credit flow (join endpoint)
      if (
        player.academyId &&
        session.academyId &&
        player.academyId === session.academyId
      ) {
        return res
          .status(400)
          .json({ error: "Academy members should use the regular join flow." });
      }

      // Create Stripe Checkout session
      const { getUncachableStripeClient } = await import("../stripeClient");
      const stripe = await getUncachableStripeClient();

      const forwardedProto =
        req.header("x-forwarded-proto") || req.protocol || "https";
      const forwardedHost =
        req.header("x-forwarded-host") || req.get("host") || "localhost";
      const baseUrl = `${forwardedProto}://${forwardedHost}`;

      const sessionTitle = session.title || `Group Session Drop-In`;
      const priceInHalalas = Math.round(dropInPrice * 100); // AED smallest unit

      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "aed",
              product_data: { name: sessionTitle },
              unit_amount: priceInHalalas,
            },
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/?drop_in_success=true&session_id=${sessionId}`,
        cancel_url: `${baseUrl}/?drop_in_cancelled=true`,
        metadata: {
          type: "drop_in_session",
          sessionId,
          playerId,
        },
        customer_email: player.email || undefined,
      });

      return res.json({
        checkoutUrl: checkoutSession.url,
        sessionId,
        price: dropInPrice,
      });
    } catch (error) {
      console.error("Drop-in book error:", error);
      res.status(500).json({ error: "Failed to create drop-in booking" });
    }
  },
);

// ==================== Task #1093: Academy Pricing Lookup ====================
// Returns the active academy_pricing row for a (academyId, sessionType) pair
// in a shape the booking wizard's Confirm step can render. Returns 404 with
// `{ available: false }` when the academy hasn't configured pricing for the
// requested type — the wizard hides the "Pay online with card" option in
// that case.
router.get(
  "/api/player/academy-pricing/:academyId/:sessionType",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }
      const { academyId, sessionType } = req.params;
      const allowed = ["private", "semi_private", "group"];
      if (!allowed.includes(sessionType)) {
        return res.status(400).json({ error: "Invalid session type" });
      }
      const pricingRow = await storage.getAcademyPricingByType(
        academyId,
        sessionType,
      );
      if (!pricingRow) {
        return res.status(404).json({ available: false });
      }
      const flat = pricingRow.pricePerSession
        ? parseFloat(pricingRow.pricePerSession.toString())
        : 0;
      const perHour = pricingRow.pricePerHour
        ? parseFloat(pricingRow.pricePerHour.toString())
        : 0;
      return res.json({
        available: true,
        sessionType,
        currency: pricingRow.currency || "AED",
        pricePerSession: flat || null,
        pricePerHour: perHour || null,
        isPerPerson: !!pricingRow.isPerPerson,
      });
    } catch (error) {
      console.error("[AcademyPricing] lookup error:", error);
      res.status(500).json({ error: "Failed to load pricing" });
    }
  },
);

// ==================== Task #1052: Drop-in Lesson Checkout ====================
// Creates a Stripe Checkout session for a non-academy player to book a
// brand-new private lesson with a public coach from another academy. The
// session, court block, and roster entry are NOT created here — they are
// materialised by the checkout.session.completed webhook in
// server/webhookHandlers.ts after the payment is captured.
router.post(
  "/api/player/drop-in-lesson/checkout",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const checkoutSchema = z.object({
        coachId: z.string().min(1),
        locationId: z.string().min(1).nullish(),
        courtId: z.string().min(1).nullish(),
        requestedStart: z.string().min(1),
        requestedEnd: z.string().min(1),
        duration: z.number().int().positive(),
        // Task #1093 — internal academy bookings can also be paid by card,
        // so the type is no longer restricted to "private". The pricing
        // source differs based on bookingType (see below).
        sessionType: z
          .enum(["private", "semi_private", "group"])
          .default("private"),
        playerNote: z.string().max(500).optional().nullable(),
        // Task #1093 — distinguishes a cross-academy "drop-in" lesson with
        // a public coach (price from coach.hourlyRate) from a same-academy
        // "internal_lesson" booking (price from academyPricing).
        bookingType: z.enum(["drop_in", "internal_lesson"]).default("drop_in"),
      });

      const parsed = checkoutSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      const {
        coachId, locationId, courtId, requestedStart, requestedEnd,
        duration, sessionType, playerNote, bookingType,
      } = parsed.data;

      const player = await storage.getPlayer(playerId, req.user?.academyId || "");
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const coach = await storage.getCoach(coachId);
      if (!coach || coach.publicProfileEnabled === false) {
        return res.status(404).json({ error: "Coach is not publicly bookable." });
      }
      if (!coach.academyId) {
        return res.status(400).json({ error: "This coach has no academy and cannot host drop-in lessons yet." });
      }

      // Task #1093 — Cross-academy drop-ins keep their original guard.
      // Internal lessons (same-academy) are now also allowed via this
      // endpoint when the player picked "Pay online with card" in the
      // wizard — pricing comes from academy_pricing instead of the coach's
      // hourly rate.
      const isInternalLesson = bookingType === "internal_lesson";
      const isSameAcademy =
        player.academyId && player.academyId === coach.academyId;
      if (isInternalLesson && !isSameAcademy) {
        return res.status(400).json({ error: "Internal lesson bookings require the player and coach to share an academy." });
      }
      if (!isInternalLesson && isSameAcademy) {
        return res.status(400).json({ error: "Use the regular booking flow for coaches in your academy." });
      }

      const startDate = new Date(requestedStart);
      const endDate = new Date(requestedEnd);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
        return res.status(400).json({ error: "Invalid time range." });
      }
      if (startDate.getTime() <= Date.now()) {
        return res.status(400).json({ error: "Pick a future time slot." });
      }

      // Task #1093 — Pricing source forks based on bookingType:
      //  - drop_in (cross-academy):  coach.hourlyRate (legacy behaviour)
      //  - internal_lesson:          academy_pricing for the requested
      //                              session_type (same source the future
      //                              admin pricing UI will edit, see #1094).
      let price: number;
      let currency = "AED";
      if (isInternalLesson) {
        const pricingRow = await storage.getAcademyPricingByType(
          coach.academyId,
          sessionType,
        );
        if (!pricingRow) {
          return res.status(400).json({
            error:
              "Online card payments are not enabled by your academy yet. Please pick another payment method.",
          });
        }
        const pricingCurrency = pricingRow.currency || "AED";
        const flatPrice = pricingRow.pricePerSession
          ? parseFloat(pricingRow.pricePerSession.toString())
          : 0;
        const perHour = pricingRow.pricePerHour
          ? parseFloat(pricingRow.pricePerHour.toString())
          : 0;
        const computed =
          perHour > 0
            ? Math.round(perHour * (duration / 60) * 100) / 100
            : Math.round(flatPrice * 100) / 100;
        if (!computed || computed <= 0) {
          return res.status(400).json({ error: "Price could not be computed." });
        }
        price = computed;
        currency = pricingCurrency;
      } else {
        const hourlyRate = coach.hourlyRate ? parseFloat(coach.hourlyRate.toString()) : 0;
        if (!hourlyRate || hourlyRate <= 0) {
          return res.status(400).json({ error: "This coach hasn't set a price for drop-in lessons yet." });
        }
        const computed = Math.round((hourlyRate * (duration / 60)) * 100) / 100;
        if (!computed || computed <= 0) {
          return res.status(400).json({ error: "Price could not be computed." });
        }
        price = computed;
      }

      // Authoritative slot validation — re-resolve against the coach's
      // published availability windows so a client cannot pay for a time the
      // coach never exposed. We ask for the slots the coach is offering on
      // the same calendar day (in UTC, matching the slot generator) at the
      // requested duration, and require the requested start to land on one
      // of them (with the same end). This is the same source of truth the
      // booking wizard uses, so legitimate selections always pass.
      const dayStart = new Date(Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate(),
        0, 0, 0, 0,
      ));
      const dayEnd = new Date(Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate(),
        23, 59, 59, 999,
      ));
      const offeredSlots = await storage.getAvailableSlots({
        academyId: coach.academyId,
        coachId,
        locationId: locationId || undefined,
        courtId: courtId || undefined,
        startDate: dayStart,
        endDate: dayEnd,
        duration,
        requestingPlayerId: playerId,
      });
      const matchesOfferedSlot = offeredSlots.some((slot) => {
        const slotStart = new Date(slot.startTime).getTime();
        const slotEnd = new Date(slot.endTime).getTime();
        // Allow the requested window to fit anywhere inside an offered slot
        // (offered slots may be longer than the requested lesson length).
        return slotStart <= startDate.getTime() && slotEnd >= endDate.getTime();
      });
      if (!matchesOfferedSlot) {
        return res.status(409).json({ error: "That slot is no longer available. Please pick another time." });
      }

      // Light-weight pre-check for an obvious session conflict so we don't
      // send the player to checkout for a slot the coach already has booked.
      // The webhook re-runs this atomically before inserting.
      const conflicts = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(
            eq(sessions.coachId, coachId),
            ne(sessions.status, "cancelled"),
            sql`${sessions.startTime} < ${endDate.toISOString()}::timestamp`,
            sql`${sessions.endTime} > ${startDate.toISOString()}::timestamp`,
          ),
        )
        .limit(1);
      if (conflicts.length > 0) {
        return res.status(409).json({ error: "That slot is no longer available. Please pick another time." });
      }

      const { getUncachableStripeClient } = await import("../stripeClient");
      const stripe = await getUncachableStripeClient();

      const forwardedProto = req.header("x-forwarded-proto") || req.protocol || "https";
      const forwardedHost = req.header("x-forwarded-host") || req.get("host") || "localhost";
      const baseUrl = `${forwardedProto}://${forwardedHost}`;

      const lessonTitleType =
        sessionType === "semi_private"
          ? "Semi-Private Lesson"
          : sessionType === "group"
          ? "Group Session"
          : "Private Lesson";
      const lessonTitle = `${lessonTitleType} with ${coach.name}`;
      const priceMinor = Math.round(price * 100);

      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: lessonTitle,
                description: `${duration} minutes · ${startDate.toUTCString()}`,
              },
              unit_amount: priceMinor,
            },
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/?drop_in_lesson_success=true&coach_id=${coachId}`,
        cancel_url: `${baseUrl}/?drop_in_lesson_cancelled=true`,
        customer_email: player.email || undefined,
        metadata: {
          // Same metadata `type` keeps webhook handler signatures unchanged
          // — `bookingType` distinguishes the two flows on materialisation.
          type: "drop_in_lesson",
          bookingType,
          playerId,
          coachId,
          academyId: coach.academyId,
          locationId: locationId || "",
          courtId: courtId || "",
          requestedStart: startDate.toISOString(),
          requestedEnd: endDate.toISOString(),
          duration: String(duration),
          sessionType,
          // Stripe metadata values must be <= 500 chars.
          playerNote: (playerNote || "").slice(0, 500),
          price: String(price),
          currency,
        },
      });

      return res.json({
        checkoutUrl: checkoutSession.url,
        price,
        currency,
      });
    } catch (error) {
      console.error("[DropInLesson] Checkout error:", error);
      res.status(500).json({ error: "Failed to start payment" });
    }
  },
);

// Leave a play session (frees up slot and notifies waitlist/make-up credit holders)
router.post(
  "/api/play/sessions/:sessionId/leave",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
        where: (sp, { and: spAnd, eq: spEq }) =>
          spAnd(spEq(sp.sessionId, sessionId), spEq(sp.playerId, playerId)),
      });

      if (!sessionPlayer) {
        return res.status(400).json({ error: "You are not in this session" });
      }

      // Calculate hours until session for cancellation policy
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date();
      const DUBAI_OFFSET = 4;
      const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const sessionStart = new Date(session.startTime);
      const hoursUntilSession =
        (sessionStart.getTime() - now.getTime()) / (1000 * 60 * 60);
      const isLateCancel = hoursUntilSession < 24;

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Check the original join transaction to determine which credit type was used
      const originalTransactions =
        await storage.getCreditTransactionsBySession(sessionId);
      const playerJoinTx = originalTransactions.find(
        (tx) =>
          tx.playerId === playerId &&
          (tx.reason === "session_join" || tx.reason === "make_up_lesson_used"),
      );

      // Determine if make-up credit was used based on transaction reason or metadata
      let usedMakeUpCredit = false;
      if (playerJoinTx) {
        if (playerJoinTx.reason === "make_up_lesson_used") {
          usedMakeUpCredit = true;
        } else if (playerJoinTx.metadata) {
          try {
            const metadata =
              typeof playerJoinTx.metadata === "string"
                ? JSON.parse(playerJoinTx.metadata)
                : playerJoinTx.metadata;
            usedMakeUpCredit = metadata.makeUpUsed === true;
          } catch {
            usedMakeUpCredit = false;
          }
        }
      }

      // Remove player from session
      await db
        .delete(sessionPlayers)
        .where(
          and(
            eq(sessionPlayers.sessionId, sessionId),
            eq(sessionPlayers.playerId, playerId),
          ),
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
        console.warn(
          `[Leave Session] No join transaction found for player ${playerId} session ${sessionId}. No refund issued.`,
        );
      }

      // Offer the spot to the first player on waitlist (time-limited window to claim)
      const waitlistPlayers = await db.query.sessionWaitlist.findMany({
        where: (wl, { and: wlAnd, eq: wlEq }) =>
          wlAnd(wlEq(wl.sessionId, sessionId), wlEq(wl.status, "waiting")),
        orderBy: (wl, { asc: wlAsc }) => wlAsc(wl.createdAt),
      });

      let waitlistPromoted = false;

      // Offer spot to first player on waitlist (they must claim within the window)
      if (waitlistPlayers.length > 0) {
        const firstWaitlistEntry = waitlistPlayers[0];
        const waitlistPlayer = await storage.getPlayer(
          firstWaitlistEntry.playerId,
        );

        if (waitlistPlayer) {
          const claimWindowMinutes =
            firstWaitlistEntry.claimWindowMinutes || 30;
          const offeredAt = new Date();

          // Mark spot as offered
          await db
            .update(sessionWaitlist)
            .set({ status: "offered", offeredAt })
            .where(eq(sessionWaitlist.id, firstWaitlistEntry.id));

          waitlistPromoted = true;

          // Notify the player that a spot is available (push + in-app)
          await notifyWaitlistPlayerSpotOffered(
            waitlistPlayer.id,
            sessionId,
            claimWindowMinutes,
            offeredAt,
          );
        }
      }

      // Only notify make-up credit holders if no waitlist promotion happened (spot is still open)
      const academyId = session.academyId || player.academyId;
      if (academyId && !waitlistPromoted) {
        const playersWithMakeUp = await db.query.players.findMany({
          where: (p, { and: pAnd, eq: pEq, gt: pGt }) =>
            pAnd(pEq(p.academyId, academyId), pGt(p.makeUpCredits, 0)),
        });

        // Filter out the player who left and limit notifications
        const eligiblePlayers = playersWithMakeUp
          .filter((p) => p.id !== playerId && p.userId)
          .slice(0, 5);

        for (const makeUpPlayer of eligiblePlayers) {
          // In-app notification for make-up opportunity
          await db.insert(playerNotifications).values({
            playerId: makeUpPlayer.id,
            title: "Spot Available!",
            body: `A spot opened up in a ${session.sessionType} session. Use your make-up credit!`,
            type: "make_up_opportunity",
            data: {
              sessionId,
              sessionType: session.sessionType,
              startTime: session.startTime,
              locationName: session.locationName,
            },
          });
          // Also push if tokens available
          const makeUpTokens = await getPlayerPushTokens(makeUpPlayer.id);
          if (makeUpTokens.length > 0) {
            await sendPushNotification(
              makeUpTokens,
              "Spot Available!",
              `A spot opened up in a ${session.sessionType} session. Use your make-up credit!`,
              { type: "make_up_opportunity", sessionId },
              makeUpPlayer.id,
            );
          }
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
  },
);

// Join session waitlist
router.post(
  "/api/play/sessions/:sessionId/waitlist",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { sessionId } = req.params;

      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      // Validate the session exists and is actually full
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check if player is already enrolled in the session
      const existingEnrollment = await db.query.sessionPlayers.findFirst({
        where: (sp, { and: spAnd, eq: spEq }) =>
          spAnd(spEq(sp.sessionId, sessionId), spEq(sp.playerId, playerId)),
      });
      if (existingEnrollment) {
        return res
          .status(400)
          .json({ error: "Already enrolled in this session" });
      }

      // Check session capacity — only allow waitlist when session is effectively full
      // (include offered entries as reserved seats)
      const maxPlayers = session.maxPlayers || 6;
      const effectiveWaitlistCount = await getEffectivePlayerCount(sessionId);
      if (effectiveWaitlistCount < maxPlayers) {
        return res.status(400).json({
          error: "Session is not full. Join the session directly instead.",
        });
      }

      // Check if player already has an active waitlist entry (waiting or offered)
      const existingWaitlist = await db.query.sessionWaitlist.findFirst({
        where: (w, { and, eq, inArray }) =>
          and(
            eq(w.sessionId, sessionId),
            eq(w.playerId, playerId),
            inArray(w.status, ["waiting", "offered"]),
          ),
      });

      if (existingWaitlist) {
        const msg =
          existingWaitlist.status === "offered"
            ? "You already have an offered spot — claim it before it expires!"
            : "Already on the waitlist";
        return res.status(400).json({ error: msg });
      }

      // Count only "waiting" entries for queue position (offered ones are ahead)
      const waitingCount = await db.query.sessionWaitlist.findMany({
        where: (w, { and, eq }) =>
          and(eq(w.sessionId, sessionId), eq(w.status, "waiting")),
      });

      const position = waitingCount.length + 1;

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
        message: `You're #${position} on the waitlist. +5 XP if you get in!`,
      });
    } catch (error) {
      console.error("Join waitlist error:", error);
      res.status(500).json({ error: "Failed to join waitlist" });
    }
  },
);

// Leave session waitlist
router.delete(
  "/api/play/sessions/:sessionId/waitlist",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { sessionId } = req.params;

      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const existingEntry = await db.query.sessionWaitlist.findFirst({
        where: (w, { and, eq, inArray }) =>
          and(
            eq(w.sessionId, sessionId),
            eq(w.playerId, playerId),
            inArray(w.status, ["waiting", "offered"]),
          ),
      });

      if (!existingEntry) {
        return res
          .status(404)
          .json({ error: "You are not on the waitlist for this session" });
      }

      await db
        .update(sessionWaitlist)
        .set({ status: "cancelled" })
        .where(eq(sessionWaitlist.id, existingEntry.id));

      // If they were the offered player, offer to next in line
      if (existingEntry.status === "offered") {
        const nextWaiting = await db.query.sessionWaitlist.findFirst({
          where: (w, { and, eq }) =>
            and(eq(w.sessionId, sessionId), eq(w.status, "waiting")),
          orderBy: (w, { asc }) => asc(w.createdAt),
        });

        if (nextWaiting) {
          const nextPlayer = await storage.getPlayer(nextWaiting.playerId);
          if (nextPlayer) {
            const claimWindowMinutes = nextWaiting.claimWindowMinutes || 30;
            const offeredAt = new Date();

            await db
              .update(sessionWaitlist)
              .set({ status: "offered", offeredAt })
              .where(eq(sessionWaitlist.id, nextWaiting.id));

            // Notify next player (push + in-app)
            await notifyWaitlistPlayerSpotOffered(
              nextPlayer.id,
              sessionId,
              claimWindowMinutes,
              offeredAt,
            );
          }
        }
      }

      res.json({
        success: true,
        message: "You've been removed from the waitlist",
      });
    } catch (error) {
      console.error("Leave waitlist error:", error);
      res.status(500).json({ error: "Failed to leave waitlist" });
    }
  },
);

// Claim an offered waitlist spot
router.post(
  "/api/play/sessions/:sessionId/waitlist/claim",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { sessionId } = req.params;

      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const offeredEntry = await db.query.sessionWaitlist.findFirst({
        where: (w, { and, eq }) =>
          and(
            eq(w.sessionId, sessionId),
            eq(w.playerId, playerId),
            eq(w.status, "offered"),
          ),
      });

      if (!offeredEntry) {
        return res
          .status(404)
          .json({ error: "No offered spot found. The spot may have expired." });
      }

      // Check if claim window has expired
      if (offeredEntry.offeredAt) {
        const claimWindowMs =
          (offeredEntry.claimWindowMinutes || 30) * 60 * 1000;
        const expiryTime = new Date(
          offeredEntry.offeredAt.getTime() + claimWindowMs,
        );
        if (new Date() > expiryTime) {
          // Expire this entry and offer to next
          await db
            .update(sessionWaitlist)
            .set({ status: "expired" })
            .where(eq(sessionWaitlist.id, offeredEntry.id));

          // Offer to next in line
          const nextWaiting = await db.query.sessionWaitlist.findFirst({
            where: (w, { and, eq }) =>
              and(eq(w.sessionId, sessionId), eq(w.status, "waiting")),
            orderBy: (w, { asc }) => asc(w.createdAt),
          });

          if (nextWaiting) {
            const nextPlayer = await storage.getPlayer(nextWaiting.playerId);
            if (nextPlayer) {
              const claimWindowMinutes = nextWaiting.claimWindowMinutes || 30;
              const newOfferedAt = new Date();

              await db
                .update(sessionWaitlist)
                .set({ status: "offered", offeredAt: newOfferedAt })
                .where(eq(sessionWaitlist.id, nextWaiting.id));

              // Notify next player (push + in-app)
              await notifyWaitlistPlayerSpotOffered(
                nextPlayer.id,
                sessionId,
                claimWindowMinutes,
                newOfferedAt,
              );
            }
          }

          return res.status(400).json({
            error:
              "The claim window has expired. The spot has been offered to the next player.",
          });
        }
      }

      // Check if session still has a spot
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check capacity: exclude THIS player's offered entry from effective count
      // (the offered entry IS the reserved seat for this player)
      const currentSessionPlayers = await db.query.sessionPlayers.findMany({
        where: (sp, { eq: spEq }) => spEq(sp.sessionId, sessionId),
      });
      const maxPlayers = session.maxPlayers || 6;
      if (currentSessionPlayers.length >= maxPlayers) {
        return res
          .status(400)
          .json({ error: "Session is no longer available" });
      }

      const waitlistPlayer = await storage.getPlayer(playerId);
      if (!waitlistPlayer) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Atomically claim the spot — credits deducted at attendance time (same as normal join)
      await db.transaction(async (tx) => {
        await tx.insert(sessionPlayers).values({
          sessionId,
          playerId,
        });

        await tx
          .update(sessionWaitlist)
          .set({ status: "claimed", promotedAt: new Date() })
          .where(eq(sessionWaitlist.id, offeredEntry.id));
      });

      res.json({
        success: true,
        message:
          "Spot claimed! Credit will be deducted when attendance is marked.",
        attendancePending: true,
      });
    } catch (error) {
      console.error("Claim waitlist spot error:", error);
      res.status(500).json({ error: "Failed to claim waitlist spot" });
    }
  },
);

// Get waitlist for a session (coach/admin view)
router.get(
  "/api/coach/sessions/:sessionId/waitlist",
  authMiddleware,
  requireRole("coach", "admin", "academy_owner", "platform_owner"),
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      const { sessionId } = req.params;

      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Verify the requester belongs to the same academy as the session
      const sessionAcademyId = session.academyId;
      if (
        coachId &&
        session.coachId !== coachId &&
        session.academyId !== academyId
      ) {
        return res
          .status(403)
          .json({ error: "Not authorized to view this session's waitlist" });
      }
      if (!coachId && academyId && sessionAcademyId !== academyId) {
        return res
          .status(403)
          .json({ error: "Not authorized to view this session's waitlist" });
      }

      const waitlistEntries = await db.query.sessionWaitlist.findMany({
        where: (w, { and, eq, inArray }) =>
          and(
            eq(w.sessionId, sessionId),
            inArray(w.status, ["waiting", "offered"]),
          ),
        orderBy: (w, { asc }) => asc(w.createdAt),
      });

      const enrichedWaitlist = await Promise.all(
        waitlistEntries.map(async (entry, index) => {
          const player = await storage.getPlayer(entry.playerId);
          return {
            id: entry.id,
            position: index + 1,
            status: entry.status,
            offeredAt: entry.offeredAt?.toISOString() || null,
            claimWindowMinutes: entry.claimWindowMinutes || 30,
            joinedAt: entry.createdAt?.toISOString(),
            player: player
              ? {
                  id: player.id,
                  name: player.name,
                  level: player.level || 1,
                  ballLevel: player.ballLevel,
                  avatarUrl: player.profilePhotoUrl,
                  credits: player.credits || 0,
                }
              : null,
          };
        }),
      );

      res.json({
        sessionId,
        waitlist: enrichedWaitlist,
        count: enrichedWaitlist.length,
      });
    } catch (error) {
      console.error("Get session waitlist error:", error);
      res.status(500).json({ error: "Failed to fetch session waitlist" });
    }
  },
);

// ==================== COACH BOOKING REQUESTS ====================

// Get coach's booking requests
router.get(
  "/api/coach/booking-requests",
  authMiddleware,
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;

      if (!coachId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const status = req.query.status as string | undefined;
      const requests = await storage.getBookingRequests({
        coachId,
        academyId: academyId || undefined,
        status,
      });

      res.json(requests);
    } catch (error) {
      console.error("Coach booking requests error:", error);
      res.status(500).json({ error: "Failed to fetch booking requests" });
    }
  },
);

// Approve a booking request
router.post(
  "/api/coach/booking-requests/:id/approve",
  authMiddleware,
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
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
        return res
          .status(403)
          .json({ error: "Not authorized to access this request" });
      }

      if (request.coachId && request.coachId !== coachId) {
        return res
          .status(403)
          .json({ error: "Not authorized to approve this request" });
      }

      if (request.status !== "pending") {
        return res
          .status(400)
          .json({ error: "Only pending requests can be approved" });
      }

      // Optional welcome message
      const parsedApprove = bookingApproveSchema.safeParse(req.body);
      const coachWelcomeMessage = parsedApprove.success
        ? parsedApprove.data.coachWelcomeMessage || null
        : null;

      if (coachWelcomeMessage) {
        await db
          .update(bookingRequests)
          .set({ coachWelcomeMessage })
          .where(eq(bookingRequests.id, id));
      }

      const result = await storage.approveBookingRequest(id, coachId);
      invalidateHomeDataCache(coachId);

      // Update court availability from "blocked" to "booked" when approved
      if (request.courtId) {
        try {
          await db
            .update(courtAvailability)
            .set({ status: "booked" })
            .where(
              and(
                eq(courtAvailability.courtId, request.courtId),
                eq(courtAvailability.blockedReason, `booking_request:${id}`),
              ),
            );
        } catch (courtUpdateError) {
          console.error(
            "Court status update on approve error (non-fatal):",
            courtUpdateError,
          );
        }
      }

      await storage.createAuditLog({
        academyId: request.academyId,
        entityType: "booking_request",
        entityId: id,
        action: "approve",
        performedBy: coachId,
        performedByRole: "coach",
      });

      // 24h pre-lesson reminders are handled by the polling job (bookingExpiryJob.ts)

      res.json(result);
    } catch (error) {
      console.error("Approve booking request error:", error);
      res.status(500).json({ error: "Failed to approve booking request" });
    }
  },
);

// Decline a booking request
router.post(
  "/api/coach/booking-requests/:id/decline",
  authMiddleware,
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      const { id } = req.params;
      const parsedDecline = bookingDeclineSchema.safeParse(req.body);
      if (!parsedDecline.success) {
        return res
          .status(400)
          .json({ error: fromZodError(parsedDecline.error).message });
      }
      const { reason, declineReason } = parsedDecline.data;

      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const request = await storage.getBookingRequest(id);
      if (!request) {
        return res.status(404).json({ error: "Booking request not found" });
      }

      if (request.academyId !== academyId) {
        return res
          .status(403)
          .json({ error: "Not authorized to access this request" });
      }

      if (request.coachId && request.coachId !== coachId) {
        return res
          .status(403)
          .json({ error: "Not authorized to decline this request" });
      }

      if (request.status !== "pending") {
        return res
          .status(400)
          .json({ error: "Only pending requests can be declined" });
      }

      const updated = await storage.updateBookingRequest(id, {
        status: "declined",
        respondedBy: coachId,
        respondedAt: new Date(),
        responseNote: reason || null,
        declineReason: declineReason || null,
      });
      invalidateHomeDataCache(coachId);

      // Notify player of decline (push + in-app)
      const DECLINE_LABELS: Record<string, string> = {
        schedule_conflict: "Schedule conflict",
        skill_mismatch: "Skill level mismatch",
        court_unavailable: "Court unavailable",
        personal: "Personal reason",
        response_timeout: "Response timeout",
      };
      try {
        const [coachProfile, playerTokens] = await Promise.all([
          storage.getCoach(coachId),
          getPlayerPushTokens(request.playerId),
        ]);
        const coachName = coachProfile?.name || "Your coach";
        const declineDetail = reason
          ? ` Reason: ${reason}`
          : declineReason
            ? ` Reason: ${DECLINE_LABELS[declineReason] ?? declineReason}`
            : "";
        const pushBody = `${coachName} declined your lesson request.${declineDetail}`;
        if (playerTokens.length > 0) {
          await sendPushNotification(
            playerTokens,
            "Lesson request declined",
            pushBody,
            { type: "booking_declined", bookingRequestId: id },
            request.playerId,
          );
        }
        await db.insert(playerNotifications).values({
          playerId: request.playerId,
          title: "Lesson request declined",
          body: pushBody,
          type: "booking_declined",
          data: {
            bookingRequestId: id,
            declineReason: declineReason || null,
            responseNote: reason || null,
          },
        });
      } catch (notifyErr) {
        console.error(
          "[Booking] Failed to notify player of decline (non-fatal):",
          notifyErr,
        );
      }

      // Unblock court if there was a court blocked for this request
      if (request.courtId) {
        try {
          await db
            .delete(courtAvailability)
            .where(
              and(
                eq(courtAvailability.courtId, request.courtId),
                eq(courtAvailability.blockedReason, `booking_request:${id}`),
              ),
            );
        } catch (courtUnblockError) {
          console.error(
            "Court unblock on decline error (non-fatal):",
            courtUnblockError,
          );
        }
      }

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
  },
);

// ==================== BOOKING APPROVAL FLOW - NEW ENDPOINTS ====================

// Send a pre-confirm message to the player before approving
router.post(
  "/api/coach/booking-requests/:id/message",
  authMiddleware,
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const { id } = req.params;
      const { message } = req.body;
      if (!coachId)
        return res.status(403).json({ error: "Coach access required" });
      if (!message || typeof message !== "string")
        return res.status(400).json({ error: "message is required" });

      const request = await storage.getBookingRequest(id);
      if (!request || request.coachId !== coachId)
        return res.status(404).json({ error: "Booking request not found" });
      if (
        request.status !== "pending" &&
        request.status !== "awaiting_player_reply"
      )
        return res
          .status(400)
          .json({ error: "Cannot message on this request" });

      const updated = await storage.updateBookingRequest(id, {
        coachPreConfirmMessage: message.substring(0, 500),
        status: "awaiting_player_reply",
      });

      // Notify player
      try {
        const playerTokens = await getPlayerPushTokens(request.playerId);
        if (playerTokens.length > 0) {
          await sendPushNotification(
            playerTokens,
            "Your coach has a question",
            message.substring(0, 100),
            { type: "booking_message", bookingRequestId: id },
            request.playerId,
          );
        }
      } catch {
        /* non-fatal */
      }

      res.json(updated);
    } catch (error) {
      console.error("Booking message error:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  },
);

// Player replies to coach pre-confirm message
router.post(
  "/api/player/booking-requests/:id/reply",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { id } = req.params;
      const { reply } = req.body;
      if (!playerId)
        return res.status(403).json({ error: "Player access required" });
      if (!reply || typeof reply !== "string")
        return res.status(400).json({ error: "reply is required" });

      const request = await storage.getBookingRequest(id);
      if (!request || request.playerId !== playerId)
        return res.status(404).json({ error: "Booking request not found" });
      if (request.status !== "awaiting_player_reply")
        return res.status(400).json({ error: "No message to reply to" });

      const updated = await storage.updateBookingRequest(id, {
        playerPreConfirmReply: reply.substring(0, 500),
        status: "pending",
      });

      // Notify coach
      try {
        if (request.coachId) {
          const coachTokens = await getCoachPushTokens(request.coachId);
          if (coachTokens.length > 0) {
            await sendPushNotification(
              coachTokens,
              "Player replied to your message",
              reply.substring(0, 100),
              { type: "booking_player_reply", bookingRequestId: id },
            );
          }
        }
      } catch {
        /* non-fatal */
      }

      res.json(updated);
    } catch (error) {
      console.error("Player reply error:", error);
      res.status(500).json({ error: "Failed to send reply" });
    }
  },
);

// Get available 30-min slots for coach on a given date (for counter-proposal slot picker)
router.get(
  "/api/coach/booking-requests/:id/available-slots",
  authMiddleware,
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      const { id } = req.params;
      const dateParam = req.query.date as string;
      const sessionDurationStr = req.query.duration as string | undefined;

      if (!coachId || !academyId)
        return res.status(403).json({ error: "Coach access required" });
      if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return res
          .status(400)
          .json({ error: "date query param required (YYYY-MM-DD)" });
      }

      const request = await storage.getBookingRequest(id);
      if (!request || request.coachId !== coachId)
        return res.status(404).json({ error: "Booking request not found" });

      const sessionDurationMinutes = sessionDurationStr
        ? Math.max(30, parseInt(sessionDurationStr, 10) || 30)
        : Math.round(
            (new Date(request.requestedEnd).getTime() -
              new Date(request.requestedStart).getTime()) /
              60000,
          ) || 60;

      // Get academy timezone (default to UTC)
      const academyRow = await db
        .select({ timezone: academies.timezone })
        .from(academies)
        .where(eq(academies.id, academyId))
        .limit(1);
      const academyTimezone: string =
        (academyRow[0]?.timezone as string) ?? "UTC";

      // Build UTC day boundaries for the local date in the academy's timezone
      const [yyyy, mm, dd] = dateParam.split("-").map(Number);
      const dayStartUtc = localHHMMToUtc(
        yyyy,
        mm - 1,
        dd,
        0,
        0,
        academyTimezone,
      );
      const dayEndUtc = localHHMMToUtc(
        yyyy,
        mm - 1,
        dd,
        23,
        59,
        academyTimezone,
      );

      // Fetch existing non-cancelled sessions for this coach that overlap the local day
      const existingSessions = await storage.getSessionsByCoach(
        coachId,
        dayStartUtc,
        dayEndUtc,
      );

      // Fetch time blocks for coach on this local date
      const timeBlocks = await storage.getCoachTimeBlocksForDate(
        coachId,
        dateParam,
        academyId,
      );

      // Build busy intervals as UTC milliseconds
      const busyMs: { start: number; end: number }[] = [];

      // The pending booking request itself has NOT been confirmed as a session yet.
      // Exclude any session whose times exactly match the pending request's requested
      // window so the coach can counter-propose that same slot if it is otherwise free.
      const requestStartMs = new Date(request.requestedStart).getTime();
      const requestEndMs = new Date(request.requestedEnd).getTime();

      for (const session of existingSessions) {
        const sessStart = new Date(session.startTime).getTime();
        const sessEnd = new Date(session.endTime).getTime();
        if (sessStart === requestStartMs && sessEnd === requestEndMs) continue;
        busyMs.push({ start: sessStart, end: sessEnd });
      }

      // Time blocks store HH:MM in the academy's local timezone → convert to UTC
      for (const block of timeBlocks) {
        const [bsh, bsm] = (block.start_time as string).split(":").map(Number);
        const [beh, bem] = (block.end_time as string).split(":").map(Number);
        const blockStartUtc = localHHMMToUtc(
          yyyy,
          mm - 1,
          dd,
          bsh,
          bsm,
          academyTimezone,
        );
        const blockEndUtc = localHHMMToUtc(
          yyyy,
          mm - 1,
          dd,
          beh,
          bem,
          academyTimezone,
        );
        busyMs.push({
          start: blockStartUtc.getTime(),
          end: blockEndUtc.getTime(),
        });
      }

      const now = Date.now();
      const SLOT_START_HOUR = 7;
      const SLOT_END_HOUR = 22;
      const SLOT_STEP = 30; // minutes between start slots
      const slots: {
        time: string;
        startIso: string;
        endIso: string;
        available: boolean;
      }[] = [];

      for (let h = SLOT_START_HOUR; h < SLOT_END_HOUR; h++) {
        for (let m = 0; m < 60; m += SLOT_STEP) {
          const slotStartUtc = localHHMMToUtc(
            yyyy,
            mm - 1,
            dd,
            h,
            m,
            academyTimezone,
          );
          const slotEndUtc = new Date(
            slotStartUtc.getTime() + sessionDurationMinutes * 60000,
          );
          const slotStartMs = slotStartUtc.getTime();
          const slotEndMs = slotEndUtc.getTime();

          // Skip if full session extends past 22:00 local (check end hour)
          const endLocal = utcToLocalTime(slotEndUtc, academyTimezone);
          const endTotalMin =
            parseInt(endLocal.time.split(":")[0]) * 60 +
            parseInt(endLocal.time.split(":")[1]);
          if (endTotalMin > SLOT_END_HOUR * 60) continue;

          const isPast = slotStartMs <= now;
          // Check if the full session window overlaps ANY busy interval
          const isBusy = busyMs.some(
            (b) => slotStartMs < b.end && slotEndMs > b.start,
          );

          const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          slots.push({
            time: timeStr,
            startIso: slotStartUtc.toISOString(),
            endIso: slotEndUtc.toISOString(),
            available: !isPast && !isBusy,
          });
        }
      }

      res.json({ slots });
    } catch (error) {
      console.error("Available slots error:", error);
      res.status(500).json({ error: "Failed to fetch available slots" });
    }
  },
);

// Coach proposes an alternative time slot
router.post(
  "/api/coach/booking-requests/:id/counter-propose",
  authMiddleware,
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const { id } = req.params;
      if (!coachId)
        return res.status(403).json({ error: "Coach access required" });

      const parsed = counterProposeSchema.safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({ error: fromZodError(parsed.error).message });
      const { counterProposedStart, counterProposedEnd } = parsed.data;

      const request = await storage.getBookingRequest(id);
      if (!request || request.coachId !== coachId)
        return res.status(404).json({ error: "Booking request not found" });
      if (request.status !== "pending")
        return res
          .status(400)
          .json({ error: "Can only counter-propose on pending requests" });

      const updated = await storage.updateBookingRequest(id, {
        counterProposedStart: new Date(counterProposedStart),
        counterProposedEnd: new Date(counterProposedEnd),
        counterProposedAt: new Date(),
        counterProposalStatus: "pending",
        status: "pending",
      });

      // Notify player of counter-proposal
      try {
        const [playerTokens, coachProfile] = await Promise.all([
          getPlayerPushTokens(request.playerId),
          storage.getCoach(coachId),
        ]);
        if (playerTokens.length > 0) {
          const coachName = coachProfile?.name || "Your coach";
          const altDate = new Date(counterProposedStart).toLocaleDateString(
            "en-GB",
            { weekday: "short", day: "numeric", month: "short" },
          );
          const altTime = new Date(counterProposedStart).toLocaleTimeString(
            "en-GB",
            { hour: "2-digit", minute: "2-digit" },
          );
          await sendPushNotification(
            playerTokens,
            `${coachName} suggested a new time`,
            `New slot: ${altDate} at ${altTime} — open the app to accept or decline.`,
            { type: "counter_proposal", bookingRequestId: id },
            request.playerId,
          );
        }
      } catch {
        /* non-fatal */
      }

      res.json(updated);
    } catch (error) {
      console.error("Counter-propose error:", error);
      res.status(500).json({ error: "Failed to submit counter-proposal" });
    }
  },
);

// Task #1100 — Coach marks a 'pay later' booking as paid.
// Records a confirmed payments row (mirrors the credit-pack / drop-in
// money-side plumbing) and flips booking_requests.payment_intent from
// 'pay_later' → 'paid' so the "Awaiting payment" pill on the coach's
// BookingRequestCard disappears. Idempotent on the booking request id —
// re-posting returns the existing payment without inserting a duplicate.
router.post(
  "/api/coach/booking-requests/:id/mark-paid",
  authMiddleware,
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      const { id } = req.params;

      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const methodSchema = z.object({
        method: z.enum(["cash", "bank_transfer"]).optional(),
      });
      const parsed = methodSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: fromZodError(parsed.error).message });
      }
      const method = parsed.data.method || "cash";

      const request = await storage.getBookingRequest(id);
      if (!request) {
        return res.status(404).json({ error: "Booking request not found" });
      }
      if (request.academyId !== academyId) {
        return res
          .status(403)
          .json({ error: "Not authorized to access this request" });
      }
      if (request.coachId && request.coachId !== coachId) {
        return res
          .status(403)
          .json({ error: "Not authorized to mark this request paid" });
      }
      if (request.paymentIntent !== "pay_later" && request.paymentIntent !== "paid") {
        return res
          .status(400)
          .json({ error: "Only pay-later bookings can be marked paid" });
      }

      // Idempotency — if a payment row was already recorded for this
      // booking request, return it without inserting a second one. Keeps
      // the action safe to double-tap and against retried requests.
      const existing = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.academyId, academyId),
            sql`${payments.metadata}->>'bookingRequestId' = ${id}`,
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        // Make sure the request reflects the paid state even if a previous
        // call recorded the payment but failed to flip the intent.
        if (request.paymentIntent !== "paid") {
          await storage.updateBookingRequest(id, { paymentIntent: "paid" });
        }
        invalidateHomeDataCache(coachId);
        return res.json({
          payment: existing[0],
          request: { ...request, paymentIntent: "paid" },
          alreadyRecorded: true,
        });
      }

      // Drizzle's `timestamp` columns deserialize to `Date`, but the
      // returned union also includes `string` in some configurations — so
      // normalize defensively without resorting to an `any` cast.
      const toDate = (v: Date | string | null | undefined): Date | null => {
        if (!v) return null;
        const d = v instanceof Date ? v : new Date(v);
        return Number.isNaN(d.getTime()) ? null : d;
      };
      const startDate = toDate(request.requestedStart);
      const endDate = toDate(request.requestedEnd);

      // Compute the lesson amount — mirrors the player wizard rule:
      // pricePerHour wins when set, else the flat pricePerSession. If the
      // academy hasn't configured pricing for this session type we still
      // record a zero-amount payment row so the pill clears (the coach can
      // reconcile the actual cash amount externally).
      let amount = 0;
      let currency = "AED";
      try {
        const pricingRow = await storage.getAcademyPricingByType(
          academyId,
          request.sessionType,
        );
        if (pricingRow) {
          currency = pricingRow.currency || "AED";
          const perHour = pricingRow.pricePerHour
            ? parseFloat(pricingRow.pricePerHour.toString())
            : 0;
          const flat = pricingRow.pricePerSession
            ? parseFloat(pricingRow.pricePerSession.toString())
            : 0;
          const durationMinutes = startDate && endDate
            ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 60000))
            : 60;
          if (perHour > 0) {
            amount = Math.round(perHour * (durationMinutes / 60) * 100) / 100;
          } else if (flat > 0) {
            amount = Math.round(flat * 100) / 100;
          }
        }
      } catch (priceErr) {
        console.warn(
          "[mark-paid] pricing lookup failed — recording zero amount:",
          priceErr,
        );
      }

      const paymentInput: InsertPayment = {
        academyId,
        playerId: request.playerId,
        amount: String(amount),
        currency,
        status: "confirmed",
        paymentMethod: method,
        paymentDate: new Date(),
        receivedBy: coachId,
        confirmedBy: coachId,
        confirmedAt: new Date(),
        source: "coach_mark_paid",
        recordedByUserId: req.user!.userId,
        notes: `Pay-later lesson booking marked paid (request ${id})`,
        metadata: {
          bookingRequestId: id,
          sessionId: request.sessionId || null,
          sessionType: request.sessionType,
          requestedStart: startDate ? startDate.toISOString() : null,
          requestedEnd: endDate ? endDate.toISOString() : null,
        },
      };

      // Hard idempotency — a partial unique index on
      // payments(metadata->>'bookingRequestId') (migration 0031) means
      // concurrent "Mark paid" taps cannot ever insert two rows for the
      // same booking. If the insert trips the constraint we fall back to
      // returning the row that won the race.
      let payment;
      try {
        payment = await storage.createPayment(paymentInput);
      } catch (insertErr: unknown) {
        const errObj: { code?: unknown; message?: unknown } =
          typeof insertErr === "object" && insertErr !== null ? (insertErr as Record<string, unknown>) : {};
        const errCode = typeof errObj.code === "string" ? errObj.code : "";
        const errMessage = typeof errObj.message === "string" ? errObj.message : "";
        const isUniqueViolation =
          errCode === "23505" ||
          /payments_booking_request_id_unique|duplicate key/i.test(errMessage);
        if (!isUniqueViolation) throw insertErr;
        const raced = await db
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.academyId, academyId),
              sql`${payments.metadata}->>'bookingRequestId' = ${id}`,
            ),
          )
          .limit(1);
        if (raced.length === 0) throw insertErr;
        payment = raced[0];
      }

      const updated = await storage.updateBookingRequest(id, {
        paymentIntent: "paid",
      });

      try {
        await storage.createAuditLog({
          academyId,
          entityType: "booking_request",
          entityId: id,
          action: "mark_paid",
          performedBy: coachId,
          performedByRole: "coach",
        });
      } catch (auditErr) {
        // non-fatal — money side already recorded
        console.warn("[mark-paid] audit log failed:", auditErr);
      }

      invalidateHomeDataCache(coachId);

      res.json({ payment, request: updated });
    } catch (error) {
      console.error("Mark booking paid error:", error);
      res.status(500).json({ error: "Failed to mark booking as paid" });
    }
  },
);

// Player accepts or declines a counter-proposal
router.post(
  "/api/player/booking-requests/:id/counter-response",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { id } = req.params;
      const { accept } = req.body;
      if (!playerId)
        return res.status(403).json({ error: "Player access required" });
      if (typeof accept !== "boolean")
        return res.status(400).json({ error: "accept (boolean) is required" });

      const request = await storage.getBookingRequest(id);
      if (!request || request.playerId !== playerId)
        return res.status(404).json({ error: "Booking request not found" });
      if (!request.counterProposedStart)
        return res
          .status(400)
          .json({ error: "No counter-proposal to respond to" });
      if (request.counterProposalStatus !== "pending")
        return res
          .status(400)
          .json({ error: "Counter-proposal already responded to" });

      if (accept) {
        // Accept: immediately approve — create a session at the counter-proposed times
        if (!request.counterProposedStart || !request.counterProposedEnd) {
          return res
            .status(400)
            .json({ error: "Counter-proposed times are missing" });
        }

        // Shift requested times to the counter-proposed times, then call approveBookingRequest
        await storage.updateBookingRequest(id, {
          requestedStart: request.counterProposedStart,
          requestedEnd: request.counterProposedEnd,
          counterProposalStatus: "accepted",
        });

        // Get the coach ID (may be null for academy-wide requests)
        const effectiveCoachId = request.coachId || "";
        const result = await storage.approveBookingRequest(
          id,
          effectiveCoachId,
        );
        if (effectiveCoachId) invalidateHomeDataCache(effectiveCoachId);

        // 24h pre-lesson reminders are handled by the polling job (bookingExpiryJob.ts)

        // Notify coach their counter-proposal was accepted and session is confirmed
        if (request.coachId) {
          try {
            const coachTokens = await getCoachPushTokens(request.coachId);
            if (coachTokens.length > 0) {
              await sendPushNotification(
                coachTokens,
                "Booking confirmed",
                "Player accepted your proposed time. Session is now scheduled.",
                { type: "counter_accepted_approved", bookingRequestId: id },
                request.coachId,
              );
            }
          } catch {
            /* non-fatal */
          }
        }
        res.json(result);
      } else {
        // Decline: cancel the request
        const updated = await storage.updateBookingRequest(id, {
          counterProposalStatus: "declined",
          status: "cancelled",
        });
        // Unblock court
        if (request.courtId) {
          try {
            await db
              .delete(courtAvailability)
              .where(
                and(
                  eq(courtAvailability.courtId, request.courtId),
                  eq(courtAvailability.blockedReason, `booking_request:${id}`),
                ),
              );
          } catch {
            /* non-fatal */
          }
        }
        res.json(updated);
      }
    } catch (error) {
      console.error("Counter-response error:", error);
      res.status(500).json({ error: "Failed to respond to counter-proposal" });
    }
  },
);

// ==================== COACH AVAILABILITY MANAGEMENT ====================

// Get coach's availability
router.get(
  "/api/coach/availability",
  authMiddleware,
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;

      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const savedAvailability = await storage.getCoachAvailability(
        coachId,
        academyId,
      );

      res.json(savedAvailability);
    } catch (error) {
      console.error("Coach availability error:", error);
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  },
);

// Create availability slot
router.post(
  "/api/coach/availability",
  authMiddleware,
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;

      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const {
        weekday,
        startTime,
        endTime,
        locationId,
        courtId,
        sessionTypes,
        slotDuration,
      } = req.body;

      if (weekday === undefined || !startTime || !endTime) {
        return res
          .status(400)
          .json({ error: "weekday, startTime, and endTime are required" });
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
  },
);

// Update availability slot
router.patch(
  "/api/coach/availability/:id",
  authMiddleware,
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
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
  },
);

// Delete availability slot
router.delete(
  "/api/coach/availability/:id",
  authMiddleware,
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
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
  },
);
// ==================== COACH AVAILABILITY BY ID (Frontend expects these routes) ====================

// Get coach availability by coach ID
router.get(
  "/api/coaches/:coachId/availability",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      const academyId = req.user?.academyId || "default-academy";

      const savedAvailability = await storage.getCoachAvailability(
        coachId,
        academyId,
      );
      res.json(savedAvailability);
    } catch (error) {
      console.error("Coach availability error:", error);
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  },
);

// Update/save coach availability (full replacement)
router.put(
  "/api/coaches/:coachId/availability",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      const academyId = req.user?.academyId || "default-academy";
      const { availability, settings } = req.body;
      const isActive =
        settings?.availabilityPaused !== undefined
          ? !settings.availabilityPaused
          : undefined;

      // Delete existing availability for this coach
      await db
        .delete(coachAvailability)
        .where(eq(coachAvailability.coachId, coachId));

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
        const [existing] = await db
          .select()
          .from(coachSettings)
          .where(eq(coachSettings.coachId, coachId));
        if (existing) {
          await db
            .update(coachSettings)
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

      const savedAvailability = await storage.getCoachAvailability(
        coachId,
        academyId,
      );
      res.json(savedAvailability);
    } catch (error) {
      console.error("Update availability error:", error);
      res.status(500).json({ error: "Failed to update availability" });
    }
  },
);

// Get coach settings (Smart Rules)
router.get(
  "/api/coaches/:coachId/settings",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      const callerCoachId = req.user?.coachId;
      const callerRole = req.user?.role;
      if (
        callerCoachId !== coachId &&
        callerRole !== "admin" &&
        callerRole !== "platform_owner" &&
        callerRole !== "academy_owner"
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const [settings] = await db
        .select()
        .from(coachSettings)
        .where(eq(coachSettings.coachId, coachId));

      if (!settings) {
        return res.json({
          minSessionLength: 60,
          bufferBetweenSessions: 0,
          availabilityPaused: false,
          bookingResponseWindowMinutes: 120,
          autoApproveReturningPlayers: false,
          autoApproveAdvancedBookings: false,
        });
      }

      res.json({
        minSessionLength: settings.minSessionLength || 60,
        bufferBetweenSessions: settings.bufferBetweenSessions || 0,
        availabilityPaused: settings.availabilityPaused || false,
        bookingResponseWindowMinutes:
          settings.bookingResponseWindowMinutes ?? 120,
        autoApproveReturningPlayers:
          settings.autoApproveReturningPlayers ?? false,
        autoApproveAdvancedBookings:
          settings.autoApproveAdvancedBookings ?? false,
      });
    } catch (error) {
      console.error("Coach settings error:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  },
);

// Update coach settings (Smart Rules)
router.put(
  "/api/coaches/:coachId/settings",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      const callerCoachId = req.user?.coachId;
      const callerRole = req.user?.role;
      if (
        callerCoachId !== coachId &&
        callerRole !== "admin" &&
        callerRole !== "platform_owner" &&
        callerRole !== "academy_owner"
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const {
        minSessionLength,
        bufferBetweenSessions,
        availabilityPaused,
        bookingResponseWindowMinutes,
        autoApproveReturningPlayers,
        autoApproveAdvancedBookings,
      } = req.body;

      const [existing] = await db
        .select()
        .from(coachSettings)
        .where(eq(coachSettings.coachId, coachId));

      if (existing) {
        await db
          .update(coachSettings)
          .set({
            minSessionLength: minSessionLength ?? existing.minSessionLength,
            bufferBetweenSessions:
              bufferBetweenSessions ?? existing.bufferBetweenSessions,
            availabilityPaused:
              availabilityPaused ?? existing.availabilityPaused,
            bookingResponseWindowMinutes:
              bookingResponseWindowMinutes ??
              existing.bookingResponseWindowMinutes,
            autoApproveReturningPlayers:
              autoApproveReturningPlayers ??
              existing.autoApproveReturningPlayers,
            autoApproveAdvancedBookings:
              autoApproveAdvancedBookings ??
              existing.autoApproveAdvancedBookings,
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
          bookingResponseWindowMinutes: bookingResponseWindowMinutes ?? 120,
          autoApproveReturningPlayers: autoApproveReturningPlayers ?? false,
          autoApproveAdvancedBookings: autoApproveAdvancedBookings ?? false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  },
);

// Get availability exceptions
router.get(
  "/api/coaches/:coachId/availability-exceptions",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { coachId } = req.params;

      const exceptions = await db
        .select()
        .from(availabilityExceptions)
        .where(eq(availabilityExceptions.coachId, coachId))
        .orderBy(desc(availabilityExceptions.startDate));

      res.json(exceptions);
    } catch (error) {
      console.error("Availability exceptions error:", error);
      res.status(500).json({ error: "Failed to fetch exceptions" });
    }
  },
);

// Create availability exception
router.post(
  "/api/coaches/:coachId/availability-exceptions",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { coachId } = req.params;
      const { startDate, endDate, reason } = req.body;

      if (!startDate) {
        return res.status(400).json({ error: "startDate is required" });
      }

      const exception = await db
        .insert(availabilityExceptions)
        .values({
          id: crypto.randomUUID(),
          coachId,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : new Date(startDate),
          reason: reason || "Not available",
          createdAt: new Date(),
        })
        .returning();

      res.json(exception[0]);
    } catch (error) {
      console.error("Create exception error:", error);
      res.status(500).json({ error: "Failed to create exception" });
    }
  },
);

// Delete availability exception
router.delete(
  "/api/coaches/:coachId/availability-exceptions/:id",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      await db
        .delete(availabilityExceptions)
        .where(eq(availabilityExceptions.id, id));

      res.json({ success: true });
    } catch (error) {
      console.error("Delete exception error:", error);
      res.status(500).json({ error: "Failed to delete exception" });
    }
  },
);
// ==================== LOCATION TRAVEL TIMES ====================

// Get all travel times for coach
router.get(
  "/api/coach/travel-times",
  authMiddleware,
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;

      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const travelTimes = await db
        .select()
        .from(locationTravelTimes)

        .where(
          and(
            eq(locationTravelTimes.coachId, coachId),
            eq(locationTravelTimes.academyId, academyId),
          ),
        );

      res.json(travelTimes);
    } catch (error) {
      console.error("Get travel times error:", error);
      res.status(500).json({ error: "Failed to get travel times" });
    }
  },
);

// Create or update travel time between locations
router.post(
  "/api/coach/travel-times",
  authMiddleware,
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;

      if (!coachId || !academyId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      const { fromLocationId, toLocationId, travelTimeMinutes } = req.body;

      if (
        !fromLocationId ||
        !toLocationId ||
        typeof travelTimeMinutes !== "number"
      ) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (fromLocationId === toLocationId) {
        return res
          .status(400)
          .json({ error: "Cannot set travel time to same location" });
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

          .where(
            and(
              eq(locationTravelTimes.coachId, coachId),
              eq(locationTravelTimes.academyId, academyId),
              eq(locationTravelTimes.fromLocationId, dir.from),
              eq(locationTravelTimes.toLocationId, dir.to),
            ),
          )
          .limit(1);

        let result;
        if (existing.length > 0) {
          // Update existing
          [result] = await db
            .update(locationTravelTimes)
            .set({
              travelTimeMinutes,
              updatedAt: new Date(),
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
  },
);

// Delete travel time
router.delete(
  "/api/coach/travel-times/:id",
  authMiddleware,
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const { id } = req.params;

      if (!coachId) {
        return res.status(403).json({ error: "Coach access required" });
      }

      await db
        .delete(locationTravelTimes)

        .where(
          and(
            eq(locationTravelTimes.id, id),
            eq(locationTravelTimes.coachId, coachId),
          ),
        );

      res.json({ success: true });
    } catch (error) {
      console.error("Delete travel time error:", error);
      res.status(500).json({ error: "Failed to delete travel time" });
    }
  },
);

// ==================== PARENT PORTAL API ====================

// Get parent's linked children
router.get(
  "/api/parent/children",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
          children: [
            {
              id: player.id,
              name: player.name,
              academyId: player.academyId,
              relationship: "self",
            },
          ],
        });
      }

      // Otherwise fetch linked children
      const children = await storage.getParentChildren(userId);
      res.json({ children });
    } catch (error) {
      console.error("Get parent children error:", error);
      res.status(500).json({ error: "Failed to get children" });
    }
  },
);

// Get invoices for a player (parent view)
router.get(
  "/api/parent/invoices/:playerId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check access: either the player themselves or a linked parent
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(
          userId,
          playerId,
        );
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const invoices = await storage.getPlayerInvoices(playerId);

      // Get academy names for each invoice
      const invoicesWithAcademy = await Promise.all(
        invoices.map(async (inv) => {
          if (!inv.academyId) return { ...inv, academyName: null };
          const academy = await storage.getAcademy(inv.academyId);
          return { ...inv, academyName: academy?.name || null };
        }),
      );

      res.json({ invoices: invoicesWithAcademy });
    } catch (error) {
      console.error("Get player invoices error:", error);
      res.status(500).json({ error: "Failed to get invoices" });
    }
  },
);

// Get single invoice with details (parent view)
router.get(
  "/api/parent/invoices/:playerId/:invoiceId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId, invoiceId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check access
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(
          userId,
          playerId,
        );
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || invoice.playerId !== playerId) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const academy = invoice.academyId
        ? await storage.getAcademy(invoice.academyId)
        : null;

      res.json({
        invoice: {
          ...invoice,
          academyName: academy?.name || null,
        },
      });
    } catch (error) {
      console.error("Get invoice error:", error);
      res.status(500).json({ error: "Failed to get invoice" });
    }
  },
);

// Get payments for a player (parent view)
router.get(
  "/api/parent/payments/:playerId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check access
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(
          userId,
          playerId,
        );
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const payments = await storage.getPlayerPayments(playerId);

      // Task #975 — for coach/academy-recorded rows, resolve the actor's
      // display name so the player UI can show "Recorded by <name>".
      const actorIds = Array.from(
        new Set(
          payments
            .map((p) => p.recordedByUserId)
            .filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            ),
        ),
      );
      const nameById: Record<string, string> = {};
      if (actorIds.length > 0) {
        const rows = await db
          .select({
            userId: users.id,
            username: users.username,
            coachName: coaches.name,
          })
          .from(users)
          .leftJoin(coaches, eq(coaches.id, users.coachId))
          .where(inArray(users.id, actorIds));
        for (const r of rows) {
          nameById[r.userId] = r.coachName || r.username || "";
        }
      }
      const enriched = payments.map((p) => ({
        ...p,
        recordedByName: p.recordedByUserId
          ? nameById[p.recordedByUserId] || null
          : null,
      }));
      res.json({ payments: enriched });
    } catch (error) {
      console.error("Get player payments error:", error);
      res.status(500).json({ error: "Failed to get payments" });
    }
  },
);

// Player/parent submits a manual payment with optional proof image upload.
// Creates a `pending` payment record visible to the academy admin for review.
router.post(
  "/api/parent/payments/:playerId",
  authMiddleware,
  paymentProofUpload.single("proof"),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(
          userId,
          playerId,
        );
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const player = await storage.getPlayer(playerId);
      if (!player || !player.academyId) {
        return res.status(404).json({ error: "Player or academy not found" });
      }

      const amountRaw = req.body?.amount;
      const paymentMethod = (req.body?.paymentMethod || "cash") as string;
      const paymentDate = req.body?.paymentDate
        ? new Date(req.body.paymentDate)
        : new Date();
      const notes = (req.body?.notes || "").toString().slice(0, 1000) || null;
      const academySettings = await storage.getAcademySettings(
        player.academyId,
      );
      const currency = academySettings?.currency || "AED";

      const amountNum = parseFloat(amountRaw);
      if (!amountRaw || Number.isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
      }
      if (!["cash", "bank_transfer"].includes(paymentMethod)) {
        return res.status(400).json({ error: "Invalid payment method" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Proof of payment is required" });
      }
      let proofUrl: string | null = null;
      {
        if (!req.file.buffer || req.file.buffer.length === 0) {
          return res
            .status(400)
            .json({ error: "Uploaded proof file is empty" });
        }
        const mimeType = req.file.mimetype || "image/jpeg";
        const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
        const storagePath = `payment-proofs/${playerId}-${Date.now()}.${ext}`;
        try {
          if (isSupabaseConfigured()) {
            proofUrl = await uploadToSupabaseWithPath(
              req.file.buffer,
              storagePath,
              mimeType,
            );
          } else {
            const dir = pathLib.join(
              process.cwd(),
              "uploads",
              "payment-proofs",
            );
            fsSync.mkdirSync(dir, { recursive: true });
            const fileName = `${playerId}-${Date.now()}.${ext}`;
            fsSync.writeFileSync(pathLib.join(dir, fileName), req.file.buffer);
            proofUrl = `/uploads/payment-proofs/${fileName}`;
          }
        } catch (err) {
          console.error("[PaymentProof] upload failed:", err);
          return res
            .status(502)
            .json({ error: "Failed to upload proof image" });
        }
      }

      const payment = await storage.createPayment({
        academyId: player.academyId,
        playerId,
        payerName: player.name || null,
        amount: String(amountNum),
        currency,
        paymentMethod,
        paymentDate,
        receivedBy: null,
        proofUrl,
        notes,
        status: "pending",
      });

      res.status(201).json({ payment });
    } catch (error) {
      console.error("Submit player payment error:", error);
      res.status(500).json({ error: "Failed to submit payment" });
    }
  },
);

// Get lesson overview for a player (parent view)
router.get(
  "/api/parent/lessons/:playerId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
        const hasAccess = await storage.checkParentPlayerAccess(
          userId,
          playerId,
        );
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const targetMonth = month
        ? parseInt(month as string)
        : new Date().getMonth() + 1;
      const targetYear = year
        ? parseInt(year as string)
        : new Date().getFullYear();

      const lessonSummary = await storage.getPlayerLessonSummary(
        playerId,
        targetMonth,
        targetYear,
      );
      res.json({ summary: lessonSummary });
    } catch (error) {
      console.error("Get lesson summary error:", error);
      res.status(500).json({ error: "Failed to get lesson summary" });
    }
  },
);

// Get parent settings
router.get(
  "/api/parent/settings",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
  },
);

// Update parent settings
router.patch(
  "/api/parent/settings",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
  },
);

// Get parent dashboard summary
router.get(
  "/api/parent/dashboard/:playerId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      // Check access
      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(
          userId,
          playerId,
        );
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const academy = player.academyId
        ? await storage.getAcademy(player.academyId)
        : null;

      // Get pending and overdue invoices
      const invoices = await storage.getPlayerInvoices(playerId);
      const pendingInvoices = invoices.filter(
        (inv) => inv.status === "pending",
      );
      const overdueInvoices = invoices.filter(
        (inv) =>
          inv.status === "pending" &&
          inv.dueDate &&
          new Date(inv.dueDate) < new Date(),
      );

      // Get current month lesson summary
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date();
      const DUBAI_OFFSET = 4;
      const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const lessonSummary = await storage.getPlayerLessonSummary(
        playerId,
        now.getMonth() + 1,
        now.getFullYear(),
      );

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
          totalPending:
            pendingInvoices.reduce(
              (sum, inv) => sum + parseFloat(inv.amount || "0"),
              0,
            ) + sessionBilling.unpaidTotal,
        },
        pendingInvoices: pendingInvoices.map((inv) => ({
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
  },
);

router.get(
  "/api/parent/packages/:playerId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(
          userId,
          playerId,
        );
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      // Task #958 — V2-only credit read. The legacy V1 packages list (with
      // `remainingCredits`) has been replaced by V2 credit lots. The summary
      // total is the V2 wallet balance via `getPlayerCreditBalanceByType` so
      // it stays consistent with Home, Schedule, and the Credit Store.
      const balance = await storage.getPlayerCreditBalanceByType(playerId);
      const lotsRes = await db.execute(sql`
        SELECT id, type, qty_total, qty_remaining, expires_at, status, created_at
        FROM credit_lots
        WHERE player_id = ${playerId}
        ORDER BY
          CASE status WHEN 'active' THEN 0 WHEN 'depleted' THEN 1 ELSE 2 END,
          expires_at NULLS LAST,
          created_at DESC
      `);
      const lots = lotsRes.rows as {
        id: string;
        type: string;
        qty_total: string | number;
        qty_remaining: string | number;
        expires_at: string | null;
        status: string;
        created_at: string;
      }[];
      const totalCredits =
        Math.max(0, balance.group) +
        Math.max(0, balance.semi_private) +
        Math.max(0, balance.private);
      const activeLotCount = lots.filter(
        (l) => l.status === "active" && Number(l.qty_remaining) > 0,
      ).length;

      res.json({
        packages: lots.map((lot) => ({
          id: lot.id,
          name: `${lot.type.replace(/_/g, " ")} credits`,
          totalCredits: Number(lot.qty_total),
          remainingCredits: Number(lot.qty_remaining),
          expiryDate: lot.expires_at,
          status: lot.status,
          purchaseDate: lot.created_at,
        })),
        summary: {
          activePackages: activeLotCount,
          totalCreditsRemaining: totalCredits,
        },
      });
    } catch (error) {
      console.error("Get parent packages error:", error);
      res.status(500).json({ error: "Failed to get packages" });
    }
  },
);

router.get(
  "/api/parent/invoices/:playerId/:invoiceId/html",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userPlayerId = req.user?.playerId;
      const { playerId, invoiceId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      if (userPlayerId !== playerId) {
        const hasAccess = await storage.checkParentPlayerAccess(
          userId,
          playerId,
        );
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || invoice.playerId !== playerId) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const player = await storage.getPlayer(playerId);
      const academy = invoice.academyId
        ? await storage.getAcademy(invoice.academyId)
        : null;
      const settings = invoice.academyId
        ? await storage.getAcademySettings(invoice.academyId)
        : null;

      const lineItems = parseLineItems(invoice.lineItems);
      const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);

      const invoiceData = {
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.createdAt?.toISOString() || new Date().toISOString(),
        dueDate: invoice.dueDate || new Date().toISOString(),
        academy: {
          name: academy?.name || "Academy",
          email: settings?.contactEmail || undefined,
          phone: settings?.contactPhone || undefined,
          logo: (academy as any)?.logoUrl || undefined,
          vatRegistrationNumber:
            (settings as any)?.vatRegistrationNumber || undefined,
        },
        player: {
          name: player?.name || "Customer",
          email: player?.email || undefined,
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
        total: parseFloat(invoice.amount || "0"),
        currency: invoice.currency || "AED",
        notes: invoice.notes || undefined,
        status: invoice.status as "pending" | "paid" | "overdue" | "cancelled",
        paidAt: invoice.paidAt?.toISOString(),
        theme: academy?.theme ?? null,
      };

      const html = generateInvoiceHtml(invoiceData);
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error) {
      console.error("Get parent invoice HTML error:", error);
      res.status(500).json({ error: "Failed to generate invoice" });
    }
  },
);

// ==================== PARENT CREDIT STORE ====================

router.get(
  "/api/parent/credit-store/:playerId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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

      const packages: {
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
      }[] = [];

      for (const creditType of CREDIT_TYPES) {
        const sessionPricing = pricing.find(
          (p) => p.sessionType === creditType,
        );
        if (
          !sessionPricing ||
          parseFloat(sessionPricing.pricePerSession) <= 0
        ) {
          continue; // Skip if no pricing configured
        }

        const pricePerCredit = parseFloat(sessionPricing.pricePerSession);
        const currency = sessionPricing.currency || "AED";
        const creditTypeLabel =
          creditType === "semi"
            ? "Semi-Private"
            : creditType.charAt(0).toUpperCase() + creditType.slice(1);

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
  },
);

router.get(
  "/api/parent/academy-payment-info/:playerId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
      const defaultLessonPrice = settings?.defaultLessonPrice
        ? parseFloat(settings.defaultLessonPrice)
        : 100;

      // Task #933: return per-(sessionType) pricing matrix from academy_pricing
      // so the debt sheet can price each session by its real type instead of
      // the flat defaultLessonPrice fallback. Mirrors the batch query used in
      // server/routes/coach-earnings.ts.
      const today = new Date().toISOString().split("T")[0];
      const pricingRows = await db
        .select()
        .from(academyPricing)
        .where(
          and(
            eq(academyPricing.academyId, player.academyId),
            eq(academyPricing.isActive, true),
            lte(academyPricing.effectiveFrom, today),
            or(
              isNull(academyPricing.effectiveUntil),
              gte(academyPricing.effectiveUntil, today),
            ),
          ),
        )
        .orderBy(desc(academyPricing.effectiveFrom));
      // Normalize sessionType keys so client lookups by the canonical type
      // (private/semi_private/group/...) hit even when the academy stores
      // adjusted variants (e.g. private_adjusted).
      const normalizePricingType = (raw: string): string => {
        const cleaned = (raw || "").toLowerCase().replace(/-/g, "_").trim();
        if (cleaned === "semi" || cleaned === "semi_private_adjusted")
          return "semi_private";
        if (cleaned === "private_adjusted") return "private";
        if (cleaned === "group_adjusted") return "group";
        return cleaned;
      };
      const pricing: Record<string, { amount: number; currency: string }> = {};
      for (const row of pricingRows) {
        const key = normalizePricingType(row.sessionType);
        if (!key) continue;
        // Most-recent effectiveFrom wins per (normalized) sessionType.
        if (pricing[key]) continue;
        const amt = parseFloat(String(row.pricePerSession));
        if (!Number.isFinite(amt)) continue;
        pricing[key] = {
          amount: amt,
          currency: row.currency || currency,
        };
      }

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
        defaultLessonPrice,
        pricing,
      });
    } catch (error) {
      console.error("Get academy payment info error:", error);
      res.status(500).json({ error: "Failed to load payment info" });
    }
  },
);

router.post(
  "/api/parent/purchase-credits",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
      let ownerCoach = academy.ownerId
        ? await storage.getCoach(academy.ownerId)
        : null;

      // Fallback: if no owner set, get first coach of academy
      if (!ownerCoach) {
        const coaches = await storage.getCoachesByAcademy(player.academyId);
        ownerCoach = coaches[0] || null;
      }

      if (!ownerCoach) {
        return res.status(400).json({
          error: "Academy owner not configured. Please contact support.",
        });
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

        if (
          !["private", "semi", "group", "court"].includes(sessionType) ||
          isNaN(credits) ||
          credits <= 0
        ) {
          return res
            .status(400)
            .json({ error: "Invalid package configuration" });
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
          const sessionPricing = pricing.find(
            (p) => p.sessionType === sessionType,
          );

          if (
            !sessionPricing ||
            parseFloat(sessionPricing.pricePerSession) <= 0
          ) {
            return res
              .status(400)
              .json({ error: "Pricing not configured for this session type" });
          }
          pricePerCredit = parseFloat(sessionPricing.pricePerSession).toFixed(
            2,
          );
          currency = sessionPricing.currency || "AED";
        }

        const creditTypeMap: Record<string, string> = {
          private: "private",
          semi: "semi_private",
          group: "group",
          court: "court",
        };
        const creditTypeLabel =
          sessionType === "semi"
            ? "Semi-Private"
            : sessionType.charAt(0).toUpperCase() + sessionType.slice(1);

        templateData = {
          name: `${credits} ${creditTypeLabel} Credit${credits > 1 ? "s" : ""}`,
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
      const now = dateParam ? new Date(dateParam) : new Date();
      const DUBAI_OFFSET = 4;
      const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
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
      const playerPkgDebtSettlement = await storage.settlePlayerDebts(
        playerId,
        templateData.creditType,
        pkg.id,
      );
      if (playerPkgDebtSettlement.settledCount > 0) {
        console.log(
          `[PlayerPackage] Settled ${playerPkgDebtSettlement.settledCount} debts for player ${playerId}`,
        );
      }

      const totalAmount = (
        parseFloat(templateData.pricePerCredit) * templateData.credits
      ).toFixed(2);
      const invoiceNumber = await storage.generateInvoiceNumber(
        player.academyId,
      );
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
        lineItems: [
          {
            description: templateData.name,
            quantity: templateData.credits,
            unitPrice: templateData.pricePerCredit,
            total: totalAmount,
          },
        ],
        paymentMethod: paymentMethod || "cash",
      } as any);

      res.json({
        success: true,
        package: pkg,
        invoice,
      });
    } catch (error) {
      console.error("Purchase credits error:", error);
      res.status(500).json({ error: "Failed to complete purchase" });
    }
  },
);

// Reconciliation: replay the V2 deposit bridge for an already-paid invoice.
// Used when storage.updateInvoice's credit-engine.purchasePackage call failed
// (logged but not surfaced) so an admin can retry without manual SQL. The
// engine is idempotent on event_key `purchase:inv:<invoiceId>`, so re-runs
// are safe — duplicate calls return the existing lot.
router.post(
  "/api/admin/invoices/:invoiceId/replay-v2-deposit",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const role = req.user?.role;
      if (
        !role ||
        !["academy_owner", "admin", "platform_owner"].includes(role)
      ) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const { invoiceId } = req.params;
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      // Academy scoping: platform_owner can replay any invoice; everyone else
      // must belong to the same academy as the invoice.
      if (
        role !== "platform_owner" &&
        req.user?.academyId !== invoice.academyId
      ) {
        return res
          .status(403)
          .json({ error: "Cannot replay invoice from another academy" });
      }
      if (invoice.status !== "paid") {
        return res.status(400).json({ error: "Invoice is not paid" });
      }
      if (!invoice.packageId) {
        return res
          .status(400)
          .json({ error: "Invoice has no packageId — nothing to deposit" });
      }
      const academy = await storage.getAcademy(invoice.academyId);
      if (!academy?.useNewCreditSystem) {
        return res
          .status(400)
          .json({ error: "Academy is not on V2 credit engine" });
      }
      const pkg = await storage.getPackage(invoice.packageId);
      if (!pkg) return res.status(404).json({ error: "Package not found" });

      const { purchasePackage, normalizeSessionTypeToCreditType } =
        await import("../services/credit-engine");
      const type = normalizeSessionTypeToCreditType(pkg.creditType);
      const result = await purchasePackage({
        playerId: pkg.playerId,
        academyId: pkg.academyId,
        type,
        qty: Number(pkg.totalCredits),
        pricePerCredit: parseFloat(String(pkg.pricePerCredit ?? "0")),
        currency: pkg.currency ?? "AED",
        invoiceId: invoice.id,
        sourcePackageId: pkg.id,
        purchasedAt: pkg.purchasedAt ?? new Date(),
        expiresAt: pkg.expiresAt ?? null,
        actorRole: "system",
      });
      res.json({ success: true, lotId: result.lotId });
    } catch (error: any) {
      console.error("[ReplayV2Deposit] error:", error);
      res.status(500).json({ error: error?.message || "Replay failed" });
    }
  },
);

// Coach-initiated credit purchase for a player. Mirrors the parent purchase
// flow (creates a package + pending invoice) but is gated by coach role +
// academy membership instead of the parent PIN. When the academy is on the
// V2 credit engine, mark-paid on the resulting invoice deposits a lot via
// the same path used by player self-purchase.
router.post(
  "/api/coach/players/:playerId/purchase-credits",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const role = req.user?.role;
      const coachId = req.user?.coachId;
      if (
        !role ||
        !["coach", "academy_owner", "admin", "platform_owner"].includes(role)
      ) {
        return res.status(403).json({ error: "Coach role required" });
      }

      // Only billing-authorized roles may override price-per-credit OR
      // immediately mark the invoice paid. Coaches must always use academy
      // pricing and create a *pending* invoice that an admin confirms.
      const isBillingAuthorized = [
        "academy_owner",
        "admin",
        "platform_owner",
      ].includes(role);

      const { playerId } = req.params;
      const { creditType, credits, pricePerCredit, currency, paymentMethod } =
        req.body || {};

      if (
        !isBillingAuthorized &&
        pricePerCredit !== undefined &&
        pricePerCredit !== null &&
        pricePerCredit !== ""
      ) {
        return res
          .status(403)
          .json({ error: "Only academy admins/owners may override price" });
      }
      if (!isBillingAuthorized && paymentMethod === "already_paid") {
        return res
          .status(403)
          .json({ error: "Only academy admins/owners may mark invoices paid" });
      }

      if (!playerId || !creditType || !credits || credits <= 0) {
        return res
          .status(400)
          .json({ error: "playerId, creditType and credits are required" });
      }
      if (!["group", "semi_private", "private", "court"].includes(creditType)) {
        return res.status(400).json({ error: "Invalid creditType" });
      }

      const player = await storage.getPlayer(playerId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      // Academy access: staff must belong to player's academy (direct or
      // multi-academy membership).
      const reqAcademyId = req.user?.academyId;
      let allowed =
        role === "platform_owner" || reqAcademyId === player.academyId;
      if (!allowed && coachId) {
        const coachesInAcademy: Coach[] = await storage
          .getCoachesByAcademy(player.academyId)
          .catch(() => [] as Coach[]);
        allowed = coachesInAcademy.some((c) => c.id === coachId);
      }
      if (!allowed) return res.status(403).json({ error: "Access denied" });

      // Resolve price: allow override, else look up academy pricing.
      let resolvedPrice: string;
      let resolvedCurrency: string = currency || "AED";
      if (
        pricePerCredit !== undefined &&
        pricePerCredit !== null &&
        pricePerCredit !== ""
      ) {
        const p = parseFloat(String(pricePerCredit));
        if (!Number.isFinite(p) || p < 0) {
          return res.status(400).json({ error: "Invalid pricePerCredit" });
        }
        resolvedPrice = p.toFixed(2);
      } else if (creditType === "court") {
        resolvedPrice = "5.00";
      } else {
        const lookupType = creditType === "semi_private" ? "semi" : creditType;
        const pricing = await storage.getAcademyPricing(player.academyId);
        const sessionPricing = pricing.find(
          (p) => p.sessionType === lookupType,
        );
        if (
          !sessionPricing ||
          parseFloat(sessionPricing.pricePerSession) <= 0
        ) {
          return res
            .status(400)
            .json({ error: "Pricing not configured for this session type" });
        }
        resolvedPrice = parseFloat(sessionPricing.pricePerSession).toFixed(2);
        resolvedCurrency = sessionPricing.currency || resolvedCurrency;
      }

      const creditsInt = parseInt(String(credits), 10);
      if (!Number.isFinite(creditsInt) || creditsInt <= 0) {
        return res.status(400).json({ error: "Invalid credits" });
      }

      const typeLabel =
        creditType === "semi_private"
          ? "Semi-Private"
          : creditType.charAt(0).toUpperCase() + creditType.slice(1);
      const packageName = `${creditsInt} ${typeLabel} Credit${creditsInt > 1 ? "s" : ""}`;

      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 90);

      const pkg = await storage.createPackage({
        playerId,
        academyId: player.academyId,
        name: packageName,
        creditType,
        totalCredits: creditsInt,
        remainingCredits: creditsInt,
        purchasedAt: now,
        expiresAt,
        pricePerCredit: resolvedPrice,
        currency: resolvedCurrency,
        status: "active",
      });

      const settle = await storage.settlePlayerDebts(
        playerId,
        creditType,
        pkg.id,
      );
      if (settle?.settledCount > 0) {
        console.log(
          `[CoachPurchase] Settled ${settle.settledCount} debts for player ${playerId}`,
        );
      }

      const totalAmount = (parseFloat(resolvedPrice) * creditsInt).toFixed(2);
      const invoiceNumber = await storage.generateInvoiceNumber(
        player.academyId,
      );

      const alreadyPaid = paymentMethod === "already_paid";
      const normalizedPaymentMethod = alreadyPaid
        ? "cash"
        : paymentMethod === "bank_transfer"
          ? "bank_transfer"
          : "cash";

      // Always create the invoice as pending first. If alreadyPaid, we then
      // record the payment and flip status to paid in sequence — if any step
      // fails, the invoice remains pending so an admin can resolve it from
      // billing without phantom "paid" state.
      const invoiceInput: InsertInvoice = {
        playerId,
        academyId: player.academyId,
        packageId: pkg.id,
        invoiceNumber,
        type: "package_purchase",
        amount: totalAmount,
        currency: resolvedCurrency,
        status: "pending",
        dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        paidAt: null,
        lineItems: [
          {
            description: packageName,
            quantity: creditsInt,
            unitPrice: resolvedPrice,
            total: totalAmount,
          },
        ],
        paymentMethod: normalizedPaymentMethod,
      };
      const invoice = await storage.createInvoice(invoiceInput);

      // For "already paid": record payment, then flip invoice to paid (which
      // triggers the V2 lot-deposit bridge inside storage.updateInvoice).
      // Fail loudly if either step fails so operators know the invoice is
      // still pending.
      let finalInvoice = invoice;
      if (alreadyPaid) {
        try {
          // Task #993 — populate playerId, set status='confirmed' (player UI
          // filters by player_id and only renders pending/confirmed/rejected),
          // and stamp source/recordedByUserId/packageId so the row both
          // shows up in the player Payments tab and is deduplicated by the
          // partial unique index from migration 0026.
          const paymentInput: InsertPayment = {
            academyId: player.academyId,
            playerId,
            invoiceId: invoice.id,
            packageId: pkg.id,
            amount: totalAmount,
            currency: resolvedCurrency,
            paymentMethod: normalizedPaymentMethod,
            status: "confirmed",
            source: "coach_package_purchase",
            recordedByUserId: req.user!.userId,
            paymentDate: now,
          };
          try {
            await storage.createPayment(paymentInput);
          } catch (payErr: unknown) {
            const code =
              typeof payErr === "object" && payErr !== null && "code" in payErr
                ? (payErr as { code?: unknown }).code
                : undefined;
            if (code !== "23505") {
              throw payErr;
            }
          }
          const updated = await storage.updateInvoice(invoice.id, {
            status: "paid",
            paidAt: now,
          });
          if (updated) finalInvoice = updated;
        } catch (markErr) {
          console.error(
            `[CoachPurchase] mark-paid failed for ${invoice.id}:`,
            markErr,
          );
          return res.status(500).json({
            error:
              "Package created but payment recording failed. Invoice is still pending — please mark it paid from billing.",
            packageId: pkg.id,
            invoiceId: invoice.id,
          });
        }
      }

      res.json({ success: true, package: pkg, invoice: finalInvoice });
    } catch (error) {
      console.error("[CoachPurchase] error:", error);
      res.status(500).json({ error: "Failed to create purchase" });
    }
  },
);

router.get(
  "/api/players/:playerId/credits-summary",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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

      // Task #958 — V2-only credit read. Source of truth is
      // `player_credit_balance` via `getPlayerCreditBalanceByType`. The legacy
      // V1 reduce over `packages.remainingCredits` was retired so this endpoint
      // matches Home, Schedule, and the Credit Store.
      const balance = await storage.getPlayerCreditBalanceByType(playerId);
      const credits: Record<string, number> = {
        group: Math.max(0, balance.group),
        court: 0,
        private: Math.max(0, balance.private),
        semi_private: Math.max(0, balance.semi_private),
      };

      res.json({ credits });
    } catch (error) {
      console.error("Get credits summary error:", error);
      res.status(500).json({ error: "Failed to get credits summary" });
    }
  },
);

// ==================== COACH REVIEW SYSTEM ====================

// Helper: Get player age category from date of birth
function getAgeCategory(
  dateOfBirth: string | Date | null,
): "kid" | "teen" | "adult" {
  if (!dateOfBirth) return "adult";
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();
  if (age < 13) return "kid";
  if (age < 18) return "teen";
  return "adult";
}

// Check if player is eligible to review a coach (requires 3+ sessions)
router.get(
  "/api/player/review-eligibility/:coachId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { coachId } = req.params;

      if (!playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      // Count completed sessions with this coach
      const sessionCount = await storage.getPlayerCoachSessionCount(
        playerId,
        coachId,
      );
      const hasExistingReview = await storage.hasPlayerReviewedCoach(
        playerId,
        coachId,
      );

      // Check for pending review prompt
      const pendingPrompt = await storage.getPendingReviewPrompt(
        playerId,
        coachId,
      );

      const isEligible = sessionCount >= 3 && !hasExistingReview;

      res.json({
        eligible: isEligible,
        sessionCount,
        requiredSessions: 3,
        hasExistingReview,
        pendingPrompt: pendingPrompt
          ? {
              id: pendingPrompt.id,
              triggerType: pendingPrompt.triggerType,
            }
          : null,
      });
    } catch (error) {
      console.error("Check review eligibility error:", error);
      res.status(500).json({ error: "Failed to check eligibility" });
    }
  },
);

// Get pending review prompts for player
router.get(
  "/api/player/review-prompts",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
        }),
      );

      res.json(promptsWithCoaches);
    } catch (error) {
      console.error("Get review prompts error:", error);
      res.status(500).json({ error: "Failed to get prompts" });
    }
  },
);

// Submit a review for a coach
router.post(
  "/api/player/reviews",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;

      if (!playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const parsed = submitReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: fromZodError(parsed.error).message });
      }

      const {
        coachId,
        coachingQuality,
        communication,
        withKidsBeginners,
        reliability,
        feedbackMotivation,
        whatDoesWell,
        bestForPlayerType,
      } = parsed.data;

      // Verify eligibility
      const sessionCount = await storage.getPlayerCoachSessionCount(
        playerId,
        coachId,
      );
      if (sessionCount < 3) {
        return res.status(403).json({
          error:
            "You need at least 3 sessions with this coach to submit a review",
        });
      }

      const hasExistingReview = await storage.hasPlayerReviewedCoach(
        playerId,
        coachId,
      );
      if (hasExistingReview) {
        return res
          .status(400)
          .json({ error: "You have already reviewed this coach" });
      }

      // Get player info for semi-anonymous display
      const player = await storage.getPlayer(playerId);
      const reviewerAgeCategory = getAgeCategory(player?.dateOfBirth || null);
      const reviewerLevel = player?.level || "green";

      // Calculate overall score
      const overallScore = (
        (coachingQuality +
          communication +
          withKidsBeginners +
          reliability +
          feedbackMotivation) /
        5
      ).toFixed(2);

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
        bestForPlayerType: bestForPlayerType
          ? sanitizeMessage(bestForPlayerType)
          : null,
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
        message:
          "Review submitted successfully. It will be visible once the coach has more reviews.",
      });
    } catch (error) {
      console.error("Submit review error:", error);
      res.status(500).json({ error: "Failed to submit review" });
    }
  },
);

// Dismiss a review prompt
router.post(
  "/api/player/review-prompts/:promptId/dismiss",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
  },
);

// Get coach review stats (public - for coach profiles)
router.get(
  "/api/coaches/:coachId/reviews",
  async (req: Request, res: Response) => {
    try {
      const { coachId } = req.params;

      // Get aggregated stats
      const stats = await storage.getCoachReviewStats(coachId);

      // Get visible reviews (snippets)
      const reviews = await storage.getVisibleCoachReviews(coachId, 10); // Top 10 reviews

      res.json({
        stats: stats
          ? {
              totalReviews: stats.visibleReviews || 0,
              averageOverall: stats.averageOverall
                ? parseFloat(stats.averageOverall.toString())
                : null,
              categories: {
                coachingQuality: stats.avgCoachingQuality
                  ? parseFloat(stats.avgCoachingQuality.toString())
                  : null,
                communication: stats.avgCommunication
                  ? parseFloat(stats.avgCommunication.toString())
                  : null,
                withKidsBeginners: stats.avgWithKidsBeginners
                  ? parseFloat(stats.avgWithKidsBeginners.toString())
                  : null,
                reliability: stats.avgReliability
                  ? parseFloat(stats.avgReliability.toString())
                  : null,
                feedbackMotivation: stats.avgFeedbackMotivation
                  ? parseFloat(stats.avgFeedbackMotivation.toString())
                  : null,
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
            }
          : null,
        reviews: reviews.map((r) => ({
          id: r.id,
          overallScore: parseFloat(r.overallScore.toString()),
          whatDoesWell: r.whatDoesWell,
          bestForPlayerType: r.bestForPlayerType,
          reviewerAgeCategory: r.reviewerAgeCategory,
          reviewerLevel: r.reviewerLevel,
          createdAt: r.createdAt,
          response: r.response
            ? {
                text: r.response.responseText,
                createdAt: r.response.createdAt,
              }
            : null,
        })),
        isVisible: stats && (stats.visibleReviews || 0) >= 3, // Only show stats if 3+ reviews
      });
    } catch (error) {
      console.error("Get coach reviews error:", error);
      res.status(500).json({ error: "Failed to get reviews" });
    }
  },
);

// Coach: Respond to a review
router.post(
  "/api/coach/reviews/:reviewId/respond",
  authMiddleware,
  requireRole("coach", "admin", "academy_owner", "platform_owner"),
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const { reviewId } = req.params;
      const { responseText } = req.body;

      if (!coachId) {
        return res.status(403).json({ error: "Coach profile required" });
      }

      if (
        !responseText ||
        typeof responseText !== "string" ||
        responseText.trim().length === 0
      ) {
        return res.status(400).json({ error: "Response text is required" });
      }

      if (responseText.length > 500) {
        return res
          .status(400)
          .json({ error: "Response must be 500 characters or less" });
      }

      // Verify the review is for this coach
      const review = await storage.getCoachReview(reviewId);
      if (!review || review.coachId !== coachId) {
        return res.status(404).json({ error: "Review not found" });
      }

      // Check if already responded
      const existingResponse = await storage.getReviewResponse(reviewId);
      if (existingResponse) {
        return res
          .status(400)
          .json({ error: "You have already responded to this review" });
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
  },
);

// Coach: Get my reviews
router.get(
  "/api/coach/my-reviews",
  authMiddleware,
  requireRole("coach", "admin", "academy_owner", "platform_owner"),
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;

      if (!coachId) {
        return res.status(403).json({ error: "Coach profile required" });
      }

      const reviews = await storage.getCoachReviewsForCoach(coachId);
      const stats = await storage.getCoachReviewStats(coachId);

      res.json({
        stats: stats
          ? {
              totalReviews: stats.totalReviews || 0,
              visibleReviews: stats.visibleReviews || 0,
              averageOverall: stats.averageOverall
                ? parseFloat(stats.averageOverall.toString())
                : null,
            }
          : null,
        reviews: reviews.map((r) => ({
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
  },
);

// Flag a review (anyone can flag)
router.post(
  "/api/reviews/:reviewId/flag",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { reviewId } = req.params;
      const { reason, details } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (
        !reason ||
        !["inappropriate", "fake", "spam", "other"].includes(reason)
      ) {
        return res.status(400).json({
          error:
            "Valid reason is required (inappropriate, fake, spam, or other)",
        });
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
  },
);

// Platform Owner: Get flagged reviews for moderation
router.get(
  "/api/platform/review-flags",
  authMiddleware,
  requireRole("platform_owner"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { status = "pending" } = req.query;

      const flags = await storage.getReviewFlags(status as string);

      res.json(flags);
    } catch (error) {
      console.error("Get review flags error:", error);
      res.status(500).json({ error: "Failed to get flags" });
    }
  },
);

// Platform Owner: Moderate a review (hide/unhide)
router.post(
  "/api/platform/reviews/:reviewId/moderate",
  authMiddleware,
  requireRole("platform_owner"),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { reviewId } = req.params;
      const { action, reason, internalNote } = req.body;

      if (!["hide", "unhide", "dismiss_flags"].includes(action)) {
        return res.status(400).json({
          error: "Valid action is required (hide, unhide, or dismiss_flags)",
        });
      }

      const review = await storage.getCoachReview(reviewId);
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

      if (action === "hide") {
        await storage.hideReview(
          reviewId,
          userId!,
          reason || "Moderation decision",
        );
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
  },
);

// ==================== COURT BOOKING MARKETPLACE ====================

// Get all courts availability for a date (Playtomic-style quick booking)
router.get(
  "/api/courts/availability",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
      const slots: {
        courtId: string;
        courtName: string;
        time: string;
        available: boolean;
        coachBusy: boolean;
        price?: string;
        currency?: string;
      }[] = [];

      const timeSlots: string[] = [];
      for (let h = 6; h < 22; h++) {
        timeSlots.push(`${String(h).padStart(2, "0")}:00`);
        timeSlots.push(`${String(h).padStart(2, "0")}:30`);
      }
      timeSlots.push("22:00");

      const dateStr = date as string;
      const coachIdToCheck = (req.query.coachId as string) || req.user!.coachId;

      // Get academy timezone for proper date filtering
      let academyTimezone = "Europe/Amsterdam";
      if (academyId) {
        try {
          const academy = await storage.getAcademy(academyId);
          if (academy?.timezone) academyTimezone = academy.timezone;
        } catch {}
      }

      // Use SQL with AT TIME ZONE to correctly filter sessions by local date
      const dateSessionsResult = academyId
        ? await pool.query(
            `
        SELECT id, start_time, end_time, court_id, coach_id, duration
        FROM sessions
        WHERE academy_id = $1
          AND status != 'cancelled'
          AND (start_time AT TIME ZONE 'UTC' AT TIME ZONE $2)::date = $3::date
      `,
            [academyId, academyTimezone, dateStr],
          )
        : { rows: [] };

      const dateSessionsMap = new Map<string, Set<string>>();
      const coachBusySlots = new Set<string>();

      for (const session of dateSessionsResult.rows) {
        // Extract local time components using Intl formatter
        const startUTC = new Date(session.start_time);
        const localParts = new Intl.DateTimeFormat("en-GB", {
          timeZone: academyTimezone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).formatToParts(startUTC);
        const startH = parseInt(
          localParts.find((p: any) => p.type === "hour")?.value || "0",
        );
        const startM = parseInt(
          localParts.find((p: any) => p.type === "minute")?.value || "0",
        );

        let endTotalMins: number;
        if (session.end_time) {
          const endUTC = new Date(session.end_time);
          const endParts = new Intl.DateTimeFormat("en-GB", {
            timeZone: academyTimezone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).formatToParts(endUTC);
          const endH = parseInt(
            endParts.find((p: any) => p.type === "hour")?.value || "0",
          );
          const endM = parseInt(
            endParts.find((p: any) => p.type === "minute")?.value || "0",
          );
          endTotalMins = endH * 60 + endM;
        } else {
          endTotalMins = startH * 60 + startM + (session.duration || 60);
        }

        const sessionSlots: string[] = [];
        let m = startH * 60 + startM;
        while (m < endTotalMins) {
          const hh = Math.floor(m / 60);
          const mm = m % 60;
          sessionSlots.push(
            `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
          );
          m += 30;
        }

        if (session.court_id) {
          if (!dateSessionsMap.has(session.court_id)) {
            dateSessionsMap.set(session.court_id, new Set());
          }
          for (const slot of sessionSlots) {
            dateSessionsMap.get(session.court_id)!.add(slot);
          }
        }

        if (coachIdToCheck && session.coach_id === coachIdToCheck) {
          for (const slot of sessionSlots) {
            coachBusySlots.add(slot);
          }
        }
      }

      for (const court of courts) {
        const availability = await storage.getCourtAvailability(
          court.id,
          date as string,
        );
        const bookedTimes = new Set(
          availability.filter((a) => !a.available).map((a) => a.time),
        );
        const sessionBookedSlots =
          dateSessionsMap.get(court.id) || new Set<string>();

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
        courts: courts.map((c) => ({
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
  },
);

// Search public courts (available for all users)
router.get(
  "/api/courts/search",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
        offset = "0",
      } = req.query;

      const searchDate =
        (date as string) || new Date().toISOString().split("T")[0];

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
      const TIME_SLOTS = [
        "07:00",
        "08:00",
        "09:00",
        "10:00",
        "11:00",
        "12:00",
        "13:00",
        "14:00",
        "15:00",
        "16:00",
        "17:00",
        "18:00",
        "19:00",
        "20:00",
        "21:00",
      ];
      const now = new Date();
      const DUBAI_OFFSET = 4;
      const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const nowTime = dubaiNow.toISOString().slice(11, 16);
      const dubaiDateStr = dubaiNow.toISOString().split("T")[0];
      const isToday = searchDate === dubaiDateStr;

      const courtsWithAvailability = await Promise.all(
        courts.map(async (court) => {
          const blockedSlots = await storage.getCourtBlockedSlots(
            court.id,
            searchDate,
          );

          // Calculate available slots
          const availableSlots: string[] = [];
          for (const slot of TIME_SLOTS) {
            // Skip past slots if today
            if (isToday && slot <= nowTime) continue;

            // Check if slot is blocked
            const isBlocked = blockedSlots.some((blocked) => {
              return blocked.startTime <= slot && blocked.endTime > slot;
            });

            if (!isBlocked) {
              availableSlots.push(slot);
            }
          }

          const totalAvailable = availableSlots.length;

          return {
            ...court,
            bookingEnabled: court.bookingEnabled !== false,
            nextAvailableSlots: availableSlots,
            totalAvailableSlots: totalAvailable,
            hasAvailability: totalAvailable > 0,
          };
        }),
      );

      res.json(courtsWithAvailability);
    } catch (error) {
      console.error("Search courts error:", error);
      res.status(500).json({ error: "Failed to search courts" });
    }
  },
);

// Get court details with availability
router.get(
  "/api/courts/:courtId/details",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { courtId } = req.params;
      const { date } = req.query;
      const userId = req.user?.userId;
      const userAcademyId = req.user?.academyId;

      const court = await storage.getCourtWithDetails(
        courtId,
        userId,
        userAcademyId,
      );
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }

      // Get blocked slots (includes sessions, bookings, and manual blocks)
      const blockedSlots = date
        ? await storage.getCourtBlockedSlots(courtId, date as string)
        : [];

      // Transform to availability format expected by frontend
      const availability = blockedSlots.map((slot) => ({
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
  },
);

// Get court availability for a date range
router.get(
  "/api/courts/:courtId/availability",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { courtId } = req.params;
      const { startDate, endDate } = req.query;

      if (!startDate) {
        return res.status(400).json({ error: "startDate is required" });
      }

      const availability = await storage.getCourtAvailabilityRange(
        courtId,
        startDate as string,
        (endDate as string) || (startDate as string),
      );

      res.json(savedAvailability);
    } catch (error) {
      console.error("Get court availability error:", error);
      res.status(500).json({ error: "Failed to get availability" });
    }
  },
);

// Create a court booking (player booking)
router.post(
  "/api/courts/:courtId/book",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const playerId = req.user?.playerId;
      const { courtId } = req.params;
      const { date, startTime, endTime, notes } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!date || !startTime || !endTime) {
        return res
          .status(400)
          .json({ error: "date, startTime, and endTime are required" });
      }

      // Calculate duration
      const start = new Date(`${date}T${startTime}`);
      const end = new Date(`${date}T${endTime}`);
      const durationMinutes = Math.round(
        (end.getTime() - start.getTime()) / 60000,
      );

      if (durationMinutes <= 0) {
        return res.status(400).json({ error: "Invalid time range" });
      }

      // Get court to check rules and pricing
      const court = await storage.getCourt(courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }

      if (court.bookingEnabled === false) {
        return res.status(403).json({
          error:
            "This court is community-only and not available for direct booking",
        });
      }

      // Check if user can book this court
      const userAcademyId = req.user?.academyId;
      const canBook =
        court.visibility === "public" ||
        (court.visibility === "academy" && court.academyId === userAcademyId);

      if (!canBook) {
        return res
          .status(403)
          .json({ error: "You don't have access to book this court" });
      }

      // Check duration limits
      if (durationMinutes < (court.minBookingDurationMinutes || 60)) {
        return res.status(400).json({
          error: `Minimum booking duration is ${court.minBookingDurationMinutes || 60} minutes`,
        });
      }
      if (durationMinutes > (court.maxBookingDurationHours || 2) * 60) {
        return res.status(400).json({
          error: `Maximum booking duration is ${court.maxBookingDurationHours || 2} hours`,
        });
      }

      // Check availability
      const isAvailable = await storage.checkCourtAvailability(
        courtId,
        date,
        startTime,
        endTime,
      );
      if (!isAvailable) {
        return res
          .status(409)
          .json({ error: "This time slot is not available" });
      }

      // Calculate price
      const hours = durationMinutes / 60;
      const isMember = court.academyId === userAcademyId;
      const pricePerHour =
        isMember && court.memberPricePerHour
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
      await storage.updateCourtAvailabilityStatus(
        courtId,
        date,
        startTime,
        endTime,
        "booked",
      );

      // Handle friend invites if provided
      const { inviteFriendIds } = req.body;
      if (
        inviteFriendIds &&
        Array.isArray(inviteFriendIds) &&
        inviteFriendIds.length > 0 &&
        playerId
      ) {
        try {
          const friendCount = inviteFriendIds.length;
          const splitCost = price > 0;
          const costPerPerson = splitCost
            ? (price / (friendCount + 1)).toFixed(2)
            : null;

          const inviteResult = await db
            .insert(bookingInvites)
            .values({
              bookingId: booking.id,
              hostPlayerId: playerId,
              splitCost,
              costPerPerson,
              currency: court.currency || "AED",
              maxGuests: 3,
              totalInvited: friendCount,
              totalAccepted: 0,
            })
            .returning();

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
      const {
        createOpenMatch,
        courtBookingStatus: omCourtBookingStatus,
        courtBookingNote: omCourtBookingNote,
        courtBookingUrl: omCourtBookingUrl,
      } = req.body;
      if (createOpenMatch && playerId) {
        try {
          const [match] = await db
            .insert(openMatches)
            .values({
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
              // Court was just booked through our system → academy_court by default,
              // but allow client to override (e.g. external_booked when the picker
              // was used in a non-academy context).
              courtBookingStatus: omCourtBookingStatus || "academy_court",
              courtBookingNote: omCourtBookingNote || null,
              courtBookingUrl: omCourtBookingUrl || null,
            })
            .returning();

          // Add host as first slot
          await db.insert(openMatchSlots).values({
            matchId: match.id,
            playerId,
            role: "host",
            status: "confirmed",
          });

          if (match?.id) {
            const { publishOpenMatch } = await import("../services/feed-publisher");
            publishOpenMatch(match.id).catch(() => {});
          }
        } catch (openMatchError) {
          console.error("Failed to create open match:", openMatchError);
        }
      }

      res.status(201).json(booking);
    } catch (error) {
      console.error("Create court booking error:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  },
);

// Get user's court bookings
router.get(
  "/api/my-court-bookings",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
  },
);

// Cancel a court booking
router.post(
  "/api/court-bookings/:bookingId/cancel",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
        return res
          .status(403)
          .json({ error: "You can only cancel your own bookings" });
      }

      // Check if already cancelled
      if (booking.status === "cancelled") {
        return res.status(400).json({ error: "Booking is already cancelled" });
      }

      // Get court for cancel window check
      const court = await storage.getCourt(booking.courtId);
      const bookingDateTime = new Date(`${booking.date}T${booking.startTime}`);
      const dateParam = req.query.date as string | undefined;
      const now = dateParam ? new Date(dateParam) : new Date();
      const DUBAI_OFFSET = 4;
      const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
      const hoursUntilBooking =
        (bookingDateTime.getTime() - now.getTime()) / 3600000;

      if (court && hoursUntilBooking < (court.cancelWindowHours || 24)) {
        return res.status(400).json({
          error: `Cancellations must be made at least ${court.cancelWindowHours || 24} hours before the booking`,
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
        "available",
      );

      res.json({ success: true, message: "Booking cancelled" });
    } catch (error) {
      console.error("Cancel court booking error:", error);
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  },
);

// ==================== COACH COURT BLOCKING ====================

// Coach blocks court for training
router.post(
  "/api/courts/:courtId/block",
  authMiddleware,
  requireRole("coach", "academy_owner", "platform_owner"),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { courtId } = req.params;
      const { date, startTime, endTime, reason } = req.body;

      if (!date || !startTime || !endTime) {
        return res
          .status(400)
          .json({ error: "date, startTime, and endTime are required" });
      }

      // Check if coach has access to this court
      const court = await storage.getCourt(courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }

      const userAcademyId = req.user?.academyId;
      if (
        court.academyId !== userAcademyId &&
        req.user?.role !== "platform_owner"
      ) {
        return res
          .status(403)
          .json({ error: "You can only block courts in your academy" });
      }

      // Check availability
      const isAvailable = await storage.checkCourtAvailability(
        courtId,
        date,
        startTime,
        endTime,
      );
      if (!isAvailable) {
        return res
          .status(409)
          .json({ error: "This time slot is already booked or blocked" });
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

      res
        .status(201)
        .json({ success: true, message: "Court blocked for training" });
    } catch (error) {
      console.error("Block court error:", error);
      res.status(500).json({ error: "Failed to block court" });
    }
  },
);

// Coach unblocks court
router.post(
  "/api/courts/:courtId/unblock",
  authMiddleware,
  requireRole("coach", "academy_owner", "platform_owner"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { courtId } = req.params;
      const { date, startTime, endTime } = req.body;

      if (!date || !startTime || !endTime) {
        return res
          .status(400)
          .json({ error: "date, startTime, and endTime are required" });
      }

      await storage.updateCourtAvailabilityStatus(
        courtId,
        date,
        startTime,
        endTime,
        "available",
      );

      res.json({ success: true, message: "Court unblocked" });
    } catch (error) {
      console.error("Unblock court error:", error);
      res.status(500).json({ error: "Failed to unblock court" });
    }
  },
);

// Coach personal time block - block coach availability (not court)
router.post(
  "/api/coach/time-blocks",
  authMiddleware,
  requireRole("coach", "academy_owner", "platform_owner"),
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const academyId = req.user?.academyId;
      if (!coachId) return res.status(400).json({ error: "Coach ID required" });

      const { startDate, endDate, weekdays, startTime, endTime, reason } =
        req.body;

      if (!startDate || !endDate || !startTime || !endTime) {
        return res.status(400).json({
          error: "startDate, endDate, startTime, endTime are required",
        });
      }
      if (!weekdays || !Array.isArray(weekdays) || weekdays.length === 0) {
        return res.status(400).json({
          error: "weekdays array is required (0=Sun, 1=Mon, ..., 6=Sat)",
        });
      }

      // Generate all dates in range matching selected weekdays
      const start = new Date(startDate);
      const end = new Date(endDate);
      const blocksToCreate: any[] = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (weekdays.includes(dayOfWeek)) {
          const dateStr = d.toISOString().split("T")[0];
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
        return res
          .status(400)
          .json({ error: "No matching dates found for selected weekdays" });
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
  },
);

// Delete coach personal time block
router.delete(
  "/api/coach/time-blocks/:blockId",
  authMiddleware,
  requireRole("coach", "academy_owner", "platform_owner"),
  async (req: AuthRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      const { blockId } = req.params;
      const realId = blockId.replace("coach-block-", "");

      await db
        .delete(coachTimeBlocks)
        .where(
          and(
            eq(coachTimeBlocks.id, realId),
            eq(coachTimeBlocks.coachId, coachId!),
          ),
        );

      res.json({ success: true });
    } catch (error) {
      console.error("Delete coach time block error:", error);
      res.status(500).json({ error: "Failed to delete time block" });
    }
  },
);

// ==================== ACADEMY COURT MANAGEMENT ====================

// Update court booking settings
router.put(
  "/api/courts/:courtId/booking-settings",
  authMiddleware,
  requireRole("academy_owner", "platform_owner"),
  async (req: AuthRequest, res: Response) => {
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
      if (
        court.academyId !== userAcademyId &&
        req.user?.role !== "platform_owner"
      ) {
        return res
          .status(403)
          .json({ error: "You can only update courts in your academy" });
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
  },
);

// Get academy's court bookings (for management)
router.get(
  "/api/academy/court-bookings",
  authMiddleware,
  requireRole("coach", "academy_owner", "platform_owner"),
  requireAcademy,
  async (req: AuthRequest, res: Response) => {
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
  },
);

// Approve/decline pending booking (academy admin)
router.post(
  "/api/court-bookings/:bookingId/review",
  authMiddleware,
  requireRole("academy_owner", "platform_owner"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { bookingId } = req.params;
      const { action, reason } = req.body;

      if (!["approve", "decline"].includes(action)) {
        return res
          .status(400)
          .json({ error: "Action must be 'approve' or 'decline'" });
      }

      const booking = await storage.getCourtBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Check academy ownership
      const userAcademyId = req.user?.academyId;
      if (
        booking.academyId !== userAcademyId &&
        req.user?.role !== "platform_owner"
      ) {
        return res
          .status(403)
          .json({ error: "You can only review bookings for your academy" });
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
          "available",
        );
      }

      res.json({ success: true, message: `Booking ${action}d` });
    } catch (error) {
      console.error("Review court booking error:", error);
      res.status(500).json({ error: "Failed to review booking" });
    }
  },
);

// ==================== BOOKING INVITES (Phase 2) ====================

// Get my booking invites (received)
router.get(
  "/api/player/booking-invites",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const invites = await db
        .select()
        .from(bookingInviteGuests)
        .innerJoin(
          bookingInvites,
          eq(bookingInviteGuests.inviteId, bookingInvites.id),
        )
        .where(eq(bookingInviteGuests.playerId, playerId));

      res.json(invites);
    } catch (error) {
      console.error("Get booking invites error:", error);
      res.status(500).json({ error: "Failed to get invites" });
    }
  },
);

// Respond to booking invite
router.post(
  "/api/player/booking-invites/:inviteId/respond",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { inviteId } = req.params;
      const { action } = req.body;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      if (!["accept", "decline"].includes(action)) {
        return res
          .status(400)
          .json({ error: "Action must be 'accept' or 'decline'" });
      }

      const [guest] = await db
        .select()
        .from(bookingInviteGuests)

        .where(
          and(
            eq(bookingInviteGuests.inviteId, inviteId),
            eq(bookingInviteGuests.playerId, playerId),
          ),
        );

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
  },
);

// ==================== OPEN MATCHES (Phase 3) ====================

// Get open matches (queries match_requests table from Find a Match wizard)
router.get(
  "/api/open-matches",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const academyId = req.user?.academyId;
      const { matchType, ballLevel, date } = req.query;
      const includeAllLevels =
        String(req.query.includeAllLevels || "") === "true";
      const includeMine = String(req.query.includeMine || "") === "true";
      // Task #1033 — discovery scope chip parity with Players row.
      // mine = same academy (default if academy member), country = caller's
      // country, all = worldwide (everyone). Free players default to "country".
      const matchScope =
        (req.query.scope as string) || (academyId ? "mine" : "country");

      // Look up caller's own ball level for default filtering
      let callerBallLevel: string | null = null;
      if (playerId) {
        const [callerRow] = await db
          .select({ ballLevel: players.ballLevel })
          .from(players)
          .where(eq(players.id, playerId))
          .limit(1);
        callerBallLevel = (callerRow?.ballLevel || "").toLowerCase() || null;
      }

      // Ball-level taxonomy (ascending competence)
      const BALL_LEVEL_ORDER = [
        "blue",
        "red",
        "orange",
        "green",
        "yellow",
        "glow",
      ];

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
          playerAvatar: players.profilePhotoUrl,
          playerLevel: players.skillLevel,
          playerBallLevel: players.ballLevel,
        })
        .from(matchRequests)
        .leftJoin(players, eq(matchRequests.playerId, players.id))
        .where(eq(matchRequests.status, "open"));

      // Apply filters
      let filteredMatches = matches;

      if (matchType && matchType !== "all") {
        filteredMatches = filteredMatches.filter(
          (m) => m.matchType === matchType,
        );
      }

      if (date) {
        filteredMatches = filteredMatches.filter(
          (m) => m.preferredDate === date,
        );
      }

      // Exclude caller's own matches unless explicitly requested
      if (playerId && !includeMine) {
        filteredMatches = filteredMatches.filter(
          (m) => m.playerId !== playerId,
        );
      }

      // Task #1033 — apply discovery scope chip:
      //   mine     → same academy (or matches with no academy)
      //   country  → match host's country == caller's country
      //   all      → worldwide, no geographic restriction
      if (matchScope === "mine") {
        filteredMatches = filteredMatches.filter(
          (m) => !m.academyId || m.academyId === academyId,
        );
      } else if (matchScope === "country" && playerId) {
        const [callerRow] = await db
          .select({ country: players.country })
          .from(players)
          .where(eq(players.id, playerId))
          .limit(1);
        const callerCountry = (callerRow?.country || "").trim().toLowerCase();
        if (callerCountry) {
          // Bulk-fetch host countries for the candidate matches.
          const hostIds = Array.from(
            new Set(
              filteredMatches
                .map((m) => m.playerId)
                .filter(Boolean) as string[],
            ),
          );
          const hostCountryRows =
            hostIds.length > 0
              ? await db
                  .select({ id: players.id, country: players.country })
                  .from(players)
                  .where(inArray(players.id, hostIds))
              : [];
          const countryByHost = new Map(
            hostCountryRows.map((r) => [
              r.id,
              (r.country || "").trim().toLowerCase(),
            ]),
          );
          filteredMatches = filteredMatches.filter(
            (m) => countryByHost.get(m.playerId!) === callerCountry,
          );
        }
      }
      // matchScope === "all" → no academy/country restriction (worldwide)

      // Filter out past matches - only show future or today's matches that haven't started
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const now = new Date();
      filteredMatches = filteredMatches.filter((m) => {
        if (!m.preferredDate) return true;
        const matchDate = new Date(m.preferredDate);
        matchDate.setHours(0, 0, 0, 0);
        if (matchDate < today) return false;
        if (matchDate.getTime() === today.getTime() && m.preferredTime) {
          const [hours, minutes] = m.preferredTime.split(":").map(Number);
          const matchTime = new Date();
          matchTime.setHours(hours || 0, minutes || 0, 0, 0);
          return matchTime > now;
        }
        return true;
      });

      // Compute effective ball-level filter
      const norm = (v?: string | null) => (v || "").toLowerCase();
      const matchBallLevel = (m: (typeof filteredMatches)[number]) =>
        norm(m.requiredBallLevel || m.playerBallLevel);

      let exactMatches: typeof filteredMatches = filteredMatches;
      let adjacentMatches: typeof filteredMatches = [];

      if (ballLevel) {
        // Explicit override — exact filter, no fallback
        const wanted = norm(ballLevel as string);
        exactMatches = filteredMatches.filter(
          (m) => matchBallLevel(m) === wanted,
        );
        adjacentMatches = [];
      } else if (!includeAllLevels && callerBallLevel) {
        // Default: filter by caller's bucket; if <3 exact, fall back to ONE
        // adjacent bucket — prefer easier (idx-1) first, then harder (idx+1).
        const idx = BALL_LEVEL_ORDER.indexOf(callerBallLevel);
        exactMatches = filteredMatches.filter(
          (m) => matchBallLevel(m) === callerBallLevel,
        );
        if (exactMatches.length < 3 && idx !== -1) {
          const easierLevel = idx - 1 >= 0 ? BALL_LEVEL_ORDER[idx - 1] : null;
          const harderLevel =
            idx + 1 < BALL_LEVEL_ORDER.length
              ? BALL_LEVEL_ORDER[idx + 1]
              : null;
          let adjacent: typeof filteredMatches = [];
          if (easierLevel) {
            adjacent = filteredMatches.filter(
              (m) => matchBallLevel(m) === easierLevel,
            );
          }
          if (adjacent.length === 0 && harderLevel) {
            adjacent = filteredMatches.filter(
              (m) => matchBallLevel(m) === harderLevel,
            );
          }
          adjacentMatches = adjacent;
        }
      }

      // Helper: stable sort by scheduled time asc (matches without a time go last)
      const scheduledMs = (m: (typeof filteredMatches)[number]): number => {
        if (!m.preferredDate || !m.preferredTime)
          return Number.MAX_SAFE_INTEGER;
        const [h, mi] = m.preferredTime.split(":").map(Number);
        const d = new Date(m.preferredDate);
        d.setHours(h || 0, mi || 0, 0, 0);
        return d.getTime();
      };
      exactMatches = [...exactMatches].sort(
        (a, b) => scheduledMs(a) - scheduledMs(b),
      );
      adjacentMatches = [...adjacentMatches].sort(
        (a, b) => scheduledMs(a) - scheduledMs(b),
      );

      const ordered = [
        ...exactMatches.map((m) => ({ m, levelMatch: "exact" as const })),
        ...adjacentMatches.map((m) => ({ m, levelMatch: "adjacent" as const })),
      ];

      // Transform to format expected by frontend
      const transformedMatches = ordered.map(({ m, levelMatch }) => {
        let scheduledTime: string | null = null;
        if (m.preferredDate && m.preferredTime) {
          const [hours, minutes] = m.preferredTime.split(":").map(Number);
          const date = new Date(m.preferredDate);
          date.setHours(hours || 0, minutes || 0, 0, 0);
          scheduledTime = date.toISOString();
        }
        const effectiveBallLevel =
          norm(m.requiredBallLevel || m.playerBallLevel) || null;
        let levelDirection: "higher" | "lower" | null = null;
        if (
          levelMatch === "adjacent" &&
          callerBallLevel &&
          effectiveBallLevel
        ) {
          const callerIdx = BALL_LEVEL_ORDER.indexOf(callerBallLevel);
          const matchIdx = BALL_LEVEL_ORDER.indexOf(effectiveBallLevel);
          if (callerIdx !== -1 && matchIdx !== -1) {
            levelDirection =
              matchIdx > callerIdx
                ? "higher"
                : matchIdx < callerIdx
                  ? "lower"
                  : null;
          }
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
          levelMatch,
          levelDirection,
          host: {
            id: m.playerId,
            name: m.playerName || "Unknown Player",
            photoUrl: m.playerAvatar,
            level: m.playerLevel || 1,
            ballLevel: m.requiredBallLevel || m.playerBallLevel,
          },
          players: [
            {
              id: m.playerId,
              name: m.playerName || "Unknown Player",
              photoUrl: m.playerAvatar,
            },
          ],
        };
      });

      res.json(transformedMatches);
    } catch (error) {
      console.error("Get open matches error:", error);
      res.status(500).json({ error: "Failed to get open matches" });
    }
  },
);

// Helper: notify all participants (host + confirmed slots) + any extra playerIds
// (e.g. a freshly kicked player) that an open match changed, so subscribed
// clients can refetch via WebSocket.
async function emitOpenMatchUpdate(
  matchId: string,
  extraPlayerIds: string[] = [],
  reason?: string,
) {
  try {
    const [m] = await db
      .select({ hostPlayerId: openMatches.hostPlayerId })
      .from(openMatches)
      .where(eq(openMatches.id, matchId));
    const slots = await db
      .select({ playerId: openMatchSlots.playerId })
      .from(openMatchSlots)
      .where(
        and(
          eq(openMatchSlots.matchId, matchId),
          eq(openMatchSlots.status, "confirmed"),
        ),
      );
    const ids = new Set<string>();
    if (m?.hostPlayerId) ids.add(m.hostPlayerId);
    for (const s of slots) if (s.playerId) ids.add(s.playerId);
    for (const p of extraPlayerIds) if (p) ids.add(p);
    broadcastToPlayerIds(Array.from(ids), {
      type: "open_match.updated",
      payload: { matchId, reason },
    });
  } catch (err) {
    console.error("[OpenMatch] emitOpenMatchUpdate failed:", err);
  }
}

// Get single open match by ID
router.get(
  "/api/open-matches/:matchId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { matchId } = req.params;

      // Prefer the openMatches/openMatchSlots source of truth (where /join, /leave,
      // /invite and /kick all write). Fall back to matchRequests for legacy matches
      // created via the old "Find a Match" wizard.
      const [openMatch] = await db
        .select({
          id: openMatches.id,
          bookingId: openMatches.bookingId,
          hostPlayerId: openMatches.hostPlayerId,
          academyId: openMatches.academyId,
          matchType: openMatches.matchType,
          title: openMatches.title,
          description: openMatches.description,
          requiredLevelMin: openMatches.requiredLevelMin,
          requiredLevelMax: openMatches.requiredLevelMax,
          requiredBallLevel: openMatches.requiredBallLevel,
          maxPlayers: openMatches.maxPlayers,
          currentPlayers: openMatches.currentPlayers,
          status: openMatches.status,
          visibility: openMatches.visibility,
          costPerPlayer: openMatches.costPerPlayer,
          currency: openMatches.currency,
          xpBonus: openMatches.xpBonus,
          courtBookingStatus: openMatches.courtBookingStatus,
          courtBookingNote: openMatches.courtBookingNote,
          courtBookingUrl: openMatches.courtBookingUrl,
          createdAt: openMatches.createdAt,
          hostName: players.name,
          hostAvatar: players.profilePhotoUrl,
          hostLevel: players.skillLevel,
          hostBallLevel: players.ballLevel,
        })
        .from(openMatches)
        .leftJoin(players, eq(openMatches.hostPlayerId, players.id))
        .where(eq(openMatches.id, matchId));

      if (openMatch) {
        const slotRows = await db
          .select({
            playerId: openMatchSlots.playerId,
            role: openMatchSlots.role,
            status: openMatchSlots.status,
            name: players.name,
            photoUrl: players.profilePhotoUrl,
          })
          .from(openMatchSlots)
          .leftJoin(players, eq(openMatchSlots.playerId, players.id))
          .where(
            and(
              eq(openMatchSlots.matchId, matchId),
              eq(openMatchSlots.status, "confirmed"),
            ),
          );

        const playersList = slotRows.map((s) => ({
          id: s.playerId,
          name: s.name || "Player",
          photoUrl: s.photoUrl,
          role: s.role,
          isHost: s.playerId === openMatch.hostPlayerId,
        }));

        return res.json({
          id: openMatch.id,
          bookingId: openMatch.bookingId,
          hostPlayerId: openMatch.hostPlayerId,
          academyId: openMatch.academyId,
          matchType: openMatch.matchType || "singles",
          title: openMatch.title,
          description: openMatch.description,
          ballLevel: openMatch.requiredBallLevel,
          skillLevel: openMatch.requiredLevelMin,
          requiredLevelMin: openMatch.requiredLevelMin || 1,
          requiredLevelMax: openMatch.requiredLevelMax || 9,
          requiredBallLevel: openMatch.requiredBallLevel,
          maxPlayers: openMatch.maxPlayers || 2,
          currentPlayers: openMatch.currentPlayers || playersList.length,
          status: openMatch.status || "open",
          visibility: openMatch.visibility || "academy",
          costPerPlayer: openMatch.costPerPlayer,
          currency: openMatch.currency || "AED",
          xpBonus: openMatch.xpBonus ?? 25,
          createdAt:
            openMatch.createdAt?.toISOString() || new Date().toISOString(),
          scheduledTime: null,
          courtName: null,
          locationName: null,
          courtBookingStatus: openMatch.courtBookingStatus,
          courtBookingNote: openMatch.courtBookingNote,
          courtBookingUrl: openMatch.courtBookingUrl,
          host: {
            id: openMatch.hostPlayerId,
            name: openMatch.hostName || "Host",
            photoUrl: openMatch.hostAvatar,
            level: openMatch.hostLevel || 1,
            ballLevel: openMatch.hostBallLevel || openMatch.requiredBallLevel,
          },
          players: playersList,
        });
      }

      // Legacy fallback: matchRequests table
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
          courtBookingStatus: matchRequests.courtBookingStatus,
          courtBookingNote: matchRequests.courtBookingNote,
          courtBookingUrl: matchRequests.courtBookingUrl,
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
          const [hours, minutes] = matchRequest.preferredTime
            .split(":")
            .map(Number);
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
        maxPlayers:
          matchRequest.maxPlayers ||
          (matchRequest.matchType === "doubles" ? 4 : 2),
        currentPlayers: 1,
        status: matchRequest.status || "open",
        visibility: "public",
        costPerPlayer: null,
        currency: "AED",
        xpBonus: 25,
        createdAt:
          matchRequest.createdAt?.toISOString() || new Date().toISOString(),
        scheduledTime,
        courtName: null,
        locationName: null,
        courtBookingStatus: matchRequest.courtBookingStatus ?? null,
        courtBookingNote: matchRequest.courtBookingNote ?? null,
        courtBookingUrl: matchRequest.courtBookingUrl ?? null,
        host: {
          id: matchRequest.playerId,
          name: matchRequest.playerName || "Unknown Player",
          photoUrl: matchRequest.playerAvatar,
          level: matchRequest.playerLevel || 1,
          ballLevel: matchRequest.requiredBallLevel,
        },
        players: [
          {
            id: matchRequest.playerId,
            name: matchRequest.playerName || "Unknown Player",
            photoUrl: matchRequest.playerAvatar,
          },
        ],
      };

      res.json(transformedMatch);
    } catch (error) {
      console.error("Get open match error:", error);
      res.status(500).json({ error: "Failed to get match" });
    }
  },
);

// Delete/Cancel open match
router.delete(
  "/api/open-matches/:matchId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
        return res
          .status(403)
          .json({ error: "You can only cancel your own matches" });
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
  },
);
// Create open match
router.post(
  "/api/open-matches",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
        courtBookingStatus,
        courtBookingNote,
        courtBookingUrl,
      } = req.body;

      if (!bookingId) {
        return res.status(400).json({ error: "Booking ID is required" });
      }

      const [match] = await db
        .insert(openMatches)
        .values({
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
          courtBookingStatus: courtBookingStatus || "academy_court",
          courtBookingNote: courtBookingNote || null,
          courtBookingUrl: courtBookingUrl || null,
        })
        .returning();

      // Add host as first slot
      await db.insert(openMatchSlots).values({
        matchId: match.id,
        playerId,
        role: "host",
        status: "confirmed",
      });

      if (match?.id) {
        const { publishOpenMatch } = await import("../services/feed-publisher");
        publishOpenMatch(match.id).catch(() => {});
      }

      res.status(201).json(match);
    } catch (error) {
      console.error("Create open match error:", error);
      res.status(500).json({ error: "Failed to create open match" });
    }
  },
);

// Join open match
router.post(
  "/api/open-matches/:matchId/join",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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

        .where(
          and(
            eq(openMatchSlots.matchId, matchId),
            eq(openMatchSlots.playerId, playerId),
          ),
        );

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

      // Real-time push to all participants so any open ManageMatch /
      // OpenMatchFeed screen refreshes immediately.
      await emitOpenMatchUpdate(matchId, [], "join");

      res.json({ success: true, message: "Joined match successfully" });
    } catch (error) {
      console.error("Join open match error:", error);
      res.status(500).json({ error: "Failed to join match" });
    }
  },
);

// Leave open match
router.post(
  "/api/open-matches/:matchId/leave",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { matchId } = req.params;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const [slot] = await db
        .select()
        .from(openMatchSlots)

        .where(
          and(
            eq(openMatchSlots.matchId, matchId),
            eq(openMatchSlots.playerId, playerId),
          ),
        );

      if (!slot) {
        return res.status(404).json({ error: "Not in this match" });
      }

      if (slot.role === "host") {
        return res
          .status(400)
          .json({ error: "Host cannot leave. Cancel the match instead." });
      }

      await db
        .update(openMatchSlots)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(openMatchSlots.id, slot.id));

      // Update match count and re-open the match if it was previously full
      await db
        .update(openMatches)
        .set({
          currentPlayers: sql`current_players - 1`,
          status: sql`CASE WHEN status = 'full' THEN 'open' ELSE status END`,
        })
        .where(eq(openMatches.id, matchId));

      // Real-time push so the host (and other participants) see the slot free up.
      // We pass the leaving player's id as `extra` so their own client also refetches.
      await emitOpenMatchUpdate(matchId, [playerId], "leave");

      res.json({ success: true, message: "Left match" });
    } catch (error) {
      console.error("Leave open match error:", error);
      res.status(500).json({ error: "Failed to leave match" });
    }
  },
);
// Invite friend to open match
router.post(
  "/api/open-matches/:matchId/invite",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
        return res
          .status(403)
          .json({ error: "Only the host can invite players" });
      }

      if (match.currentPlayers >= match.maxPlayers) {
        return res.status(400).json({ error: "Match is already full" });
      }

      // Check if player is already in the match
      const [existingSlot] = await db
        .select()
        .from(openMatchSlots)

        .where(
          and(
            eq(openMatchSlots.matchId, matchId),
            eq(openMatchSlots.playerId, playerId),
            eq(openMatchSlots.status, "confirmed"),
          ),
        );

      if (existingSlot) {
        return res
          .status(400)
          .json({ error: "Player is already in this match" });
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

      // Real-time push to participants (so the host's own ManageMatch screen
      // doesn't have to wait for a refetch to reflect any side-effects).
      await emitOpenMatchUpdate(matchId, [playerId], "invite");

      res.json({ success: true, message: "Invite sent successfully" });
    } catch (error) {
      console.error("Invite to open match error:", error);
      res.status(500).json({ error: "Failed to send invite" });
    }
  },
);

// Kick (remove) a player from an open match — host only.
router.post(
  "/api/open-matches/:matchId/kick",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const hostPlayerId = req.user?.playerId;
      const { matchId } = req.params;
      const { playerId: targetPlayerId } = req.body || {};

      if (!hostPlayerId) {
        return res.status(401).json({ error: "Player profile required" });
      }
      if (!targetPlayerId) {
        return res.status(400).json({ error: "Player ID required" });
      }
      if (targetPlayerId === hostPlayerId) {
        return res.status(400).json({
          error: "Host cannot kick themselves. Cancel the match instead.",
        });
      }

      const [match] = await db
        .select()
        .from(openMatches)
        .where(eq(openMatches.id, matchId));

      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }
      if (match.hostPlayerId !== hostPlayerId) {
        return res
          .status(403)
          .json({ error: "Only the host can remove players" });
      }

      const [slot] = await db
        .select()
        .from(openMatchSlots)
        .where(
          and(
            eq(openMatchSlots.matchId, matchId),
            eq(openMatchSlots.playerId, targetPlayerId),
            eq(openMatchSlots.status, "confirmed"),
          ),
        );

      if (!slot) {
        return res.status(404).json({ error: "Player is not in this match" });
      }
      if (slot.role === "host") {
        return res.status(400).json({ error: "Cannot remove the host" });
      }

      await db
        .update(openMatchSlots)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(openMatchSlots.id, slot.id));

      await db
        .update(openMatches)
        .set({
          currentPlayers: sql`GREATEST(current_players - 1, 0)`,
          status: sql`CASE WHEN status = 'full' THEN 'open' ELSE status END`,
        })
        .where(eq(openMatches.id, matchId));

      // Notify the kicked player (push + in-app).
      const hostPlayer = await storage.getPlayer(hostPlayerId);
      const hostName = hostPlayer?.name || "The host";
      try {
        await storage.createNotification({
          type: "open_match_kick",
          title: "Removed from match",
          message: `${hostName} removed you from the open match.`,
          userId: null,
          playerId: targetPlayerId,
          academyId: match.academyId,
          data: { matchId },
        });
      } catch (notifyErr) {
        console.error("[OpenMatch] kick notification failed:", notifyErr);
      }

      // Real-time push to participants AND the kicked player so all open
      // screens refresh immediately.
      await emitOpenMatchUpdate(matchId, [targetPlayerId], "kick");

      res.json({ success: true, message: "Player removed" });
    } catch (error) {
      console.error("Kick open match player error:", error);
      res.status(500).json({ error: "Failed to remove player" });
    }
  },
);

// ==================== MATCH REQUESTS (Tinder-style Match Finding) ====================

// Create a match request
router.post(
  "/api/play/create-match-request",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
        sport,
        invitedPlayerId,
        matchIntent,
        courtBookingStatus,
        courtBookingNote,
        courtBookingUrl,
        bookingId,
      } = req.body;

      // When the picker is attached to a real court booking, persist on the
      // new openMatches table (which is the canonical source for match
      // detail/list views) so booking-status context is not lost. Falls
      // through to the legacy matchRequests insert otherwise.
      if (bookingId) {
        const [openMatch] = await db
          .insert(openMatches)
          .values({
            bookingId,
            hostPlayerId: playerId,
            academyId,
            matchType: matchType || "singles",
            title: title || `Looking for ${matchType || "singles"} partner`,
            description,
            requiredLevelMin: requiredLevelMin || 1,
            requiredLevelMax: requiredLevelMax || 20,
            requiredBallLevel,
            maxPlayers: maxPlayers || (matchType === "doubles" ? 4 : 2),
            currentPlayers: 1,
            invitedPlayerId: invitedPlayerId || null,
            status: invitedPlayerId ? "pending_invite" : "open",
            matchIntent: matchIntent || "friendly",
            visibility: "academy",
            // A bookingId implies a real court booking attached, so default
            // to academy_court (matches the other openMatches creation paths).
            courtBookingStatus: courtBookingStatus || "academy_court",
            courtBookingNote: courtBookingNote || null,
            courtBookingUrl: courtBookingUrl || null,
          })
          .returning();

        await db.insert(openMatchSlots).values({
          matchId: openMatch.id,
          playerId,
          role: "host",
          status: "confirmed",
        });

        if (openMatch?.id) {
          const { publishOpenMatch } = await import("../services/feed-publisher");
          publishOpenMatch(openMatch.id).catch(() => {});
        }

        console.log(
          "[OpenMatch] Created via create-match-request:",
          openMatch.id,
          "booking:",
          bookingId,
        );
        return res.status(201).json(openMatch);
      }

      const [request] = await db
        .insert(matchRequests)
        .values({
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
          sport: sport || "tennis",
          courtBookingStatus: courtBookingStatus || null,
          courtBookingNote: courtBookingNote || null,
          courtBookingUrl: courtBookingUrl || null,
        })
        .returning();

      console.log(
        "[MatchRequest] Created:",
        request.id,
        "by player:",
        playerId,
      );
      res.status(201).json(request);
    } catch (error) {
      console.error("Create match request error:", error);
      res.status(500).json({ error: "Failed to create match request" });
    }
  },
);

// Get all open match requests
router.get(
  "/api/play/match-requests",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
            playerId ? ne(matchRequests.playerId, playerId) : undefined,
          ),
        )
        .orderBy(desc(matchRequests.createdAt));

      // Enrich with player info
      const enrichedRequests = await Promise.all(
        requests.map(async (request) => {
          const [player] = await db
            .select()
            .from(players)
            .where(eq(players.id, request.playerId));
          return {
            ...request,
            player: player
              ? {
                  id: player.id,
                  name: player.name,
                  profilePhotoUrl: player.profilePhotoUrl,
                  ballLevel: player.ballLevel,
                }
              : null,
          };
        }),
      );

      res.json(enrichedRequests);
    } catch (error) {
      console.error("Get match requests error:", error);
      res.status(500).json({ error: "Failed to get match requests" });
    }
  },
);

// Get my match requests
router.get(
  "/api/play/my-match-requests",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
  },
);

// Join (accept) an open match request
router.post(
  "/api/play/match-requests/:requestId/join",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { requestId } = req.params;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      // Load the joining player's profile for eligibility checks
      const joiningPlayer = await storage.getPlayer(playerId);
      if (!joiningPlayer) {
        return res.status(403).json({ error: "Player profile not found" });
      }

      const [request] = await db
        .select()
        .from(matchRequests)
        .where(eq(matchRequests.id, requestId));

      if (!request) {
        return res.status(404).json({ error: "Match request not found" });
      }
      if (request.status !== "open") {
        return res
          .status(400)
          .json({ error: "This match request is no longer available" });
      }
      if (request.playerId === playerId) {
        return res
          .status(400)
          .json({ error: "You created this match request" });
      }
      if (request.invitedPlayerId) {
        return res
          .status(400)
          .json({ error: "This match request already has a challenger" });
      }

      // Enforce academy scoping: if the request is academy-scoped, the joiner MUST belong to the same academy
      const requestAcademyId = request.academyId;
      const joinerAcademyId = (joiningPlayer as any).academyId as
        | string
        | undefined;
      if (requestAcademyId && joinerAcademyId !== requestAcademyId) {
        return res.status(403).json({
          error: "This match request is not available at your academy",
        });
      }

      // Enforce ball-level compatibility (same level matching as the discovery listing)
      const requestCreator = await storage.getPlayer(request.playerId);
      const creatorBallLevel = requestCreator?.ballLevel;
      const joinerBallLevel = joiningPlayer.ballLevel;
      if (
        creatorBallLevel &&
        joinerBallLevel &&
        creatorBallLevel !== joinerBallLevel
      ) {
        return res.status(403).json({
          error: "Your skill level does not match this match request",
        });
      }

      // Atomic update: only succeeds if the request is still open and unclaimed
      const updated = await db
        .update(matchRequests)
        .set({
          invitedPlayerId: playerId,
          status: "matched",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(matchRequests.id, requestId),
            eq(matchRequests.status, "open"),
            isNull(matchRequests.invitedPlayerId),
          ),
        )
        .returning();

      if (updated.length === 0) {
        return res.status(409).json({
          error: "This match request was just claimed by someone else",
        });
      }

      res.json({
        success: true,
        message: "Successfully joined the match request",
      });
    } catch (error) {
      console.error("Join match request error:", error);
      res.status(500).json({ error: "Failed to join match request" });
    }
  },
);

router.post(
  "/api/play/match-requests/:requestId/cancel",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      const { requestId } = req.params;

      if (!playerId) {
        return res.status(401).json({ error: "Player profile required" });
      }

      const [request] = await db
        .select()
        .from(matchRequests)

        .where(
          and(
            eq(matchRequests.id, requestId),
            eq(matchRequests.playerId, playerId),
          ),
        );

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
  },
);

// ==================== PLAYER BOOKING PREFERENCES (Phase 4) ====================

// Get booking preferences
router.get(
  "/api/player/booking-preferences",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
  },
);

// Update booking preferences
router.put(
  "/api/player/booking-preferences",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
  },
);

// Get smart suggestions based on booking history
router.get(
  "/api/player/booking-suggestions",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
        const dayOfWeek = new Date(booking.date)
          .toLocaleDateString("en-US", { weekday: "long" })
          .toLowerCase();
        dayFrequency[dayOfWeek] = (dayFrequency[dayOfWeek] || 0) + 1;

        const hour = parseInt(booking.startTime.split(":")[0]);
        const timeSlot =
          hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
        timeFrequency[timeSlot] = (timeFrequency[timeSlot] || 0) + 1;

        courtFrequency[booking.courtId] =
          (courtFrequency[booking.courtId] || 0) + 1;
      }

      // Get top preferences
      const sortedDays = Object.entries(dayFrequency).sort(
        (a, b) => b[1] - a[1],
      );
      const sortedTimes = Object.entries(timeFrequency).sort(
        (a, b) => b[1] - a[1],
      );
      const sortedCourts = Object.entries(courtFrequency).sort(
        (a, b) => b[1] - a[1],
      );

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
  },
);

// POST /api/player/sessions/:sessionId/rate — submit a lesson rating (one per session/player)
router.post(
  "/api/player/sessions/:sessionId/rate",
  authMiddleware,
  requireRole("player"),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(403).json({ error: "Player access required" });
      const { sessionId } = req.params;

      const parseResult = sessionRatingInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid rating data",
          details: parseResult.error.flatten(),
        });
      }
      const { rating, comment } = parseResult.data;

      // Resolve playerId from userId
      const playerRow = await db.query.players.findFirst({
        where: eq(players.userId, userId),
      });
      if (!playerRow)
        return res.status(404).json({ error: "Player not found" });
      const playerId = playerRow.id;

      // Validate session exists and is completed (endTime has passed or status is completed)
      const sessionRow = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
      });
      if (!sessionRow)
        return res.status(404).json({ error: "Session not found" });

      if (sessionRow.status === "cancelled") {
        return res
          .status(400)
          .json({ error: "Cannot rate a cancelled session" });
      }
      const sessionEnded =
        sessionRow.status === "completed" ||
        new Date(sessionRow.endTime) <= new Date();
      if (!sessionEnded) {
        return res.status(400).json({ error: "Session has not ended yet" });
      }

      // Verify the player was enrolled in this session
      const enrollment = await db.query.sessionPlayers.findFirst({
        where: and(
          eq(sessionPlayers.sessionId, sessionId),
          eq(sessionPlayers.playerId, playerId),
        ),
      });
      if (!enrollment) {
        return res
          .status(403)
          .json({ error: "You were not enrolled in this session" });
      }

      // Enforce attendance eligibility: only allow rating if player actually attended
      if (
        enrollment.attendanceStatus &&
        !["present", "late"].includes(enrollment.attendanceStatus)
      ) {
        return res
          .status(403)
          .json({ error: "You can only rate sessions you attended" });
      }

      // Check duplicate
      const existing = await db.query.sessionRatings.findFirst({
        where: and(
          eq(sessionRatings.sessionId, sessionId),
          eq(sessionRatings.playerId, playerId),
        ),
      });
      if (existing) {
        return res
          .status(409)
          .json({ error: "You have already rated this session" });
      }

      const [created] = await db
        .insert(sessionRatings)
        .values({
          sessionId,
          playerId,
          coachId: sessionRow.coachId ?? null,
          academyId: sessionRow.academyId ?? null,
          rating,
          comment: comment ?? null,
        })
        .returning();

      // Update coach aggregate rating from session ratings
      if (created.coachId) {
        await storage.updateCoachSessionRatingStats(created.coachId);
      }
      // Update academy aggregate rating from session ratings
      if (created.academyId) {
        await storage.updateAcademyRatingStats(created.academyId);
      }

      return res.status(201).json({ success: true, rating: created });
    } catch (error: unknown) {
      // Catch DB-level unique constraint violation as a 409 (race-condition protection)
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: unknown }).code === "23505"
      ) {
        return res
          .status(409)
          .json({ error: "You have already rated this session" });
      }
      console.error("[API] Error submitting session rating:", error);
      return res.status(500).json({ error: "Failed to submit rating" });
    }
  },
);

// GET /api/player/sessions/:sessionId/my-rating — check if player already rated
router.get(
  "/api/player/sessions/:sessionId/my-rating",
  authMiddleware,
  requireRole("player"),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(403).json({ error: "Player access required" });
      const { sessionId } = req.params;

      const playerRow = await db.query.players.findFirst({
        where: eq(players.userId, userId),
      });
      if (!playerRow)
        return res.status(404).json({ error: "Player not found" });

      const existing = await db.query.sessionRatings.findFirst({
        where: and(
          eq(sessionRatings.sessionId, sessionId),
          eq(sessionRatings.playerId, playerRow.id),
        ),
      });

      return res.json({ rating: existing ?? null });
    } catch (error) {
      console.error("[API] Error fetching session rating:", error);
      return res.status(500).json({ error: "Failed to fetch rating" });
    }
  },
);

// GET /api/player/sessions/pending-rating — server-driven: first unrated completed session for the player
router.get(
  "/api/player/sessions/pending-rating",
  authMiddleware,
  requireRole("player"),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId)
        return res.status(403).json({ error: "Player access required" });

      const playerRow = await db.query.players.findFirst({
        where: eq(players.userId, userId),
      });
      if (!playerRow)
        return res.status(404).json({ error: "Player not found" });
      const playerId = playerRow.id;

      // Find the most recent completed session the player attended but hasn't rated yet.
      // Uses a LEFT JOIN to avoid an arbitrary session cap.
      const now = new Date();
      const [pending] = await db
        .select({
          sessionId: sessionPlayers.sessionId,
        })
        .from(sessionPlayers)
        .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
        .leftJoin(
          sessionRatings,
          and(
            eq(sessionRatings.sessionId, sessionPlayers.sessionId),
            eq(sessionRatings.playerId, playerId),
          ),
        )
        .where(
          and(
            eq(sessionPlayers.playerId, playerId),
            lte(sessions.endTime, now),
            ne(sessions.status, "cancelled"),
            isNull(sessionRatings.id), // no rating yet
            // Only prompt players who actually attended (or attendance not yet recorded)
            or(
              isNull(sessionPlayers.attendanceStatus),
              eq(sessionPlayers.attendanceStatus, "present"),
              eq(sessionPlayers.attendanceStatus, "late"),
            ),
          ),
        )
        .orderBy(desc(sessions.endTime))
        .limit(1);

      return res.json({ sessionId: pending?.sessionId ?? null });
    } catch (error) {
      console.error("[API] Error fetching pending rating session:", error);
      return res.status(500).json({ error: "Failed to fetch pending rating" });
    }
  },
);

// ==================== COUNTRY LEADERBOARDS PER SPORT (Task #1035) ====================

const SUPPORTED_LEADERBOARD_SPORTS = ["tennis", "padel", "pickleball"] as const;
type LeaderboardSport = (typeof SUPPORTED_LEADERBOARD_SPORTS)[number];
type LeaderboardScope = "country" | "global";

interface LeaderboardRow {
  id: string;
  name: string;
  photoUrl: string | null;
  city: string | null;
  country: string | null;
  ballLevel: string | null;
  glowMmr: number;
  glowRank: number | null;
  isAdult: boolean;
}

interface CachedLeaderboard {
  rows: LeaderboardRow[];
  fetchedAt: number;
}

const LEADERBOARD_TTL_MS = 15 * 60 * 1000;
const LEADERBOARD_TOP_N = 50;
const leaderboardCache = new Map<string, CachedLeaderboard>();

function leaderboardCacheKey(
  sport: LeaderboardSport,
  scope: LeaderboardScope,
  country: string | null,
): string {
  return `${sport}:${scope}:${(country ?? "").toLowerCase()}`;
}

function isoWeekMonday(date: Date = new Date()): string {
  // Returns YYYY-MM-DD for the Monday of the ISO week of `date` (UTC).
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay() || 7; // Sun=0 → 7
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

function previousIsoWeekMonday(date: Date = new Date()): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 7);
  return isoWeekMonday(d);
}

function formatDssRating(mmr: number | null | undefined): string | null {
  if (!mmr) return null;
  return (((mmr - 1000) / 1000) * 3 + 3).toFixed(1);
}

async function loadLeaderboardRows(
  sport: LeaderboardSport,
  scope: LeaderboardScope,
  country: string | null,
): Promise<LeaderboardRow[]> {
  const conditions: any[] = [
    eq(players.status, "active"),
    sql`${players.privacyLevel} != 'hidden'`,
    eq(users.status, "active"),
    sql`COALESCE(${users.deleted}, false) = false`,
    sql`COALESCE(${players.glowMmr}, 0) > 0`,
    // Sport filter: academy plays this sport OR the player has it in their sportProfiles
    or(
      sql`${academies.sports} @> ${JSON.stringify([sport])}::jsonb`,
      sql`${players.sportProfiles} ? ${sport}`,
    )!,
  ];

  if (scope === "country" && country) {
    conditions.push(
      or(
        sql`LOWER(${players.country}) = LOWER(${country})`,
        sql`LOWER(${academies.country}) = LOWER(${country})`,
      )!,
    );
  }

  const rows = await db
    .select({
      id: players.id,
      name: players.name,
      photoUrl: players.profilePhotoUrl,
      playerCity: players.city,
      playerCountry: players.country,
      academyCity: academies.city,
      academyCountry: academies.country,
      ballLevel: players.ballLevel,
      glowMmr: players.glowMmr,
      glowRank: players.glowRank,
      isAdult: players.isAdult,
    })
    .from(players)
    .innerJoin(users, eq(users.playerId, players.id))
    .leftJoin(academies, eq(players.academyId, academies.id))
    .where(and(...conditions))
    .orderBy(desc(players.glowMmr))
    .limit(LEADERBOARD_TOP_N);

  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    photoUrl: r.photoUrl ?? null,
    city: r.playerCity ?? r.academyCity ?? null,
    country: r.playerCountry ?? r.academyCountry ?? null,
    ballLevel: r.ballLevel ?? null,
    glowMmr: r.glowMmr ?? 0,
    glowRank: r.glowRank ?? null,
    isAdult: !!r.isAdult,
  }));
}

async function getCachedLeaderboard(
  sport: LeaderboardSport,
  scope: LeaderboardScope,
  country: string | null,
): Promise<LeaderboardRow[]> {
  const key = leaderboardCacheKey(sport, scope, country);
  const cached = leaderboardCache.get(key);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < LEADERBOARD_TTL_MS) {
    return cached.rows;
  }
  const rows = await loadLeaderboardRows(sport, scope, country);
  leaderboardCache.set(key, { rows, fetchedAt: now });
  // Persist a weekly snapshot in the background; idempotent via unique index.
  void persistWeeklySnapshot(sport, scope, country, rows).catch((err) => {
    console.error("[Leaderboard] snapshot insert failed", err);
  });
  return rows;
}

async function persistWeeklySnapshot(
  sport: LeaderboardSport,
  scope: LeaderboardScope,
  country: string | null,
  rows: LeaderboardRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const week = isoWeekMonday();
  const countryKey = scope === "country" ? (country ?? "").toLowerCase() : "";
  const values = rows.map((r, idx) => ({
    sport,
    scope,
    country: countryKey,
    playerId: r.id,
    rank: idx + 1,
    snapshotWeek: week,
  }));
  await db.insert(leaderboardSnapshots).values(values).onConflictDoNothing();
}

async function fetchPreviousRanks(
  sport: LeaderboardSport,
  scope: LeaderboardScope,
  country: string | null,
  playerIds: string[],
): Promise<Map<string, number>> {
  if (playerIds.length === 0) return new Map();
  const previousWeek = previousIsoWeekMonday();
  const countryKey = scope === "country" ? (country ?? "").toLowerCase() : "";
  const rows = await db
    .select({
      playerId: leaderboardSnapshots.playerId,
      rank: leaderboardSnapshots.rank,
    })
    .from(leaderboardSnapshots)
    .where(
      and(
        eq(leaderboardSnapshots.sport, sport),
        eq(leaderboardSnapshots.scope, scope),
        eq(leaderboardSnapshots.country, countryKey),
        eq(leaderboardSnapshots.snapshotWeek, previousWeek),
        inArray(leaderboardSnapshots.playerId, playerIds),
      ),
    );
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.playerId, r.rank);
  return map;
}

router.get(
  "/api/player/country-leaderboard",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const playerId = req.user?.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player access required" });
      }

      const sportParam =
        (req.query.sport as string | undefined)?.toLowerCase() || "tennis";
      if (
        !SUPPORTED_LEADERBOARD_SPORTS.includes(sportParam as LeaderboardSport)
      ) {
        return res.status(400).json({ error: "Unsupported sport" });
      }
      const sport = sportParam as LeaderboardSport;

      const scopeParam = (req.query.scope as string | undefined) || "country";
      const scope: LeaderboardScope =
        scopeParam === "global" ? "global" : "country";

      const player = await storage.getPlayer(
        playerId,
        req.user?.academyId || "",
      );
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      let country: string | null = null;
      if (scope === "country") {
        const requested = (req.query.country as string | undefined)?.trim();
        country =
          (requested && requested.length > 0
            ? requested
            : (player as any).country) ?? null;
        if (!country) {
          return res.json({
            sport,
            scope,
            country: null,
            rankings: [],
            currentPlayer: null,
            myRank: 0,
            message:
              "Set your country in your profile to see country rankings.",
          });
        }
      }

      const rows = await getCachedLeaderboard(sport, scope, country);

      // Determine the current player's rank. If they're in the top-N, use their
      // index. Otherwise, count how many qualifying players have a higher MMR.
      const meIndex = rows.findIndex((r) => r.id === playerId);
      let myRank = 0;
      let currentPlayerRow: LeaderboardRow | null = null;

      if (meIndex >= 0) {
        myRank = meIndex + 1;
        currentPlayerRow = rows[meIndex];
      } else {
        // Fetch the current player's qualifying row directly (using the same filters).
        const meConditions: any[] = [
          eq(players.id, playerId),
          eq(players.status, "active"),
          sql`${players.privacyLevel} != 'hidden'`,
          eq(users.status, "active"),
          sql`COALESCE(${users.deleted}, false) = false`,
          sql`COALESCE(${players.glowMmr}, 0) > 0`,
          or(
            sql`${academies.sports} @> ${JSON.stringify([sport])}::jsonb`,
            sql`${players.sportProfiles} ? ${sport}`,
          )!,
        ];
        if (scope === "country" && country) {
          meConditions.push(
            or(
              sql`LOWER(${players.country}) = LOWER(${country})`,
              sql`LOWER(${academies.country}) = LOWER(${country})`,
            )!,
          );
        }
        const meRows = await db
          .select({
            id: players.id,
            name: players.name,
            photoUrl: players.profilePhotoUrl,
            playerCity: players.city,
            playerCountry: players.country,
            academyCity: academies.city,
            academyCountry: academies.country,
            ballLevel: players.ballLevel,
            glowMmr: players.glowMmr,
            glowRank: players.glowRank,
            isAdult: players.isAdult,
          })
          .from(players)
          .innerJoin(users, eq(users.playerId, players.id))
          .leftJoin(academies, eq(players.academyId, academies.id))
          .where(and(...meConditions))
          .limit(1);

        if (meRows[0]) {
          const me = meRows[0] as any;
          currentPlayerRow = {
            id: me.id,
            name: me.name,
            photoUrl: me.photoUrl ?? null,
            city: me.playerCity ?? me.academyCity ?? null,
            country: me.playerCountry ?? me.academyCountry ?? null,
            ballLevel: me.ballLevel ?? null,
            glowMmr: me.glowMmr ?? 0,
            glowRank: me.glowRank ?? null,
            isAdult: !!me.isAdult,
          };
          const meMmr = currentPlayerRow.glowMmr;
          const above = await db
            .select({ count: count() })
            .from(players)
            .innerJoin(users, eq(users.playerId, players.id))
            .leftJoin(academies, eq(players.academyId, academies.id))
            .where(
              and(
                eq(players.status, "active"),
                sql`${players.privacyLevel} != 'hidden'`,
                eq(users.status, "active"),
                sql`COALESCE(${users.deleted}, false) = false`,
                sql`COALESCE(${players.glowMmr}, 0) > ${meMmr}`,
                or(
                  sql`${academies.sports} @> ${JSON.stringify([sport])}::jsonb`,
                  sql`${players.sportProfiles} ? ${sport}`,
                )!,
                ...(scope === "country" && country
                  ? [
                      or(
                        sql`LOWER(${players.country}) = LOWER(${country})`,
                        sql`LOWER(${academies.country}) = LOWER(${country})`,
                      )!,
                    ]
                  : []),
              ),
            );
          myRank = (above[0]?.count ?? 0) + 1;
        }
      }

      // Look up last week's ranks for everyone we're returning + current player.
      const idsToCheck = new Set<string>(rows.map((r) => r.id));
      if (currentPlayerRow) idsToCheck.add(currentPlayerRow.id);
      const previousRanks = await fetchPreviousRanks(
        sport,
        scope,
        country,
        Array.from(idsToCheck),
      );

      const formatRow = (r: LeaderboardRow, rank: number) => {
        const prevRank = previousRanks.get(r.id);
        const delta = prevRank != null ? prevRank - rank : null; // positive = moved up
        return {
          rank,
          id: r.id,
          name: r.name,
          photoUrl: r.photoUrl,
          city: r.city,
          country: r.country,
          ballLevel: r.ballLevel,
          glowMmr: r.glowMmr,
          glowRank: r.glowRank,
          isAdult: r.isAdult,
          dssRating: formatDssRating(r.glowMmr),
          rankDelta: delta,
          isCurrentPlayer: r.id === playerId,
        };
      };

      const rankings = rows.map((r, idx) => formatRow(r, idx + 1));

      res.json({
        sport,
        scope,
        country,
        myRank,
        currentPlayer: currentPlayerRow
          ? formatRow(currentPlayerRow, myRank)
          : null,
        rankings,
        cachedTtlSeconds: Math.floor(LEADERBOARD_TTL_MS / 1000),
      });
    } catch (error) {
      console.error("[Leaderboard] country-leaderboard error", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  },
);

export default router;
