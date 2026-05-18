import { Router, type Request, type Response } from "express";
import { db, pool } from "../db";
import { authMiddlewareWithFreshData as authMiddleware, type JWTPayload } from "../auth";
import { courtBookings, courts, players, users } from "@shared/schema";
import { eq, and, gte, lte, inArray, or, lt, gt } from "drizzle-orm";
import { z } from "zod";
import { sendPushNotification, getPlayerPushTokens } from "../pushNotifications";

const router = Router();

interface AuthRequest extends Request {
  user?: JWTPayload;
}

function requireOwnerOrAdmin(req: AuthRequest, res: Response, next: () => void): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (user.role === "academy_owner" || user.role === "admin" || user.role === "platform_owner") {
    next();
    return;
  }
  res.status(403).json({ error: "Academy owner or admin access required" });
}

const blockSlotSchema = z.object({
  courtId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.enum(["maintenance", "event", "private", "other"]).default("other"),
  note: z.string().max(500).optional().nullable(),
});

const bookForPlayerSchema = z.object({
  courtId: z.string().min(1),
  playerId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().positive(),
  notes: z.string().max(500).optional().nullable(),
});

/**
 * Returns true if two [startA, endA) and [startB, endB) time ranges overlap.
 * Times are "HH:MM" strings.
 */
function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return toMin(startA) < toMin(endB) && toMin(endA) > toMin(startB);
}

// GET /api/admin/court-bookings
// Returns all bookings (player bookings, coaching sessions, admin blocks) for given date range
router.get(
  "/api/admin/court-bookings",
  authMiddleware,
  requireOwnerOrAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(403).json({ error: "Academy context required" });
      }

      const { date, endDate } = req.query;
      if (!date || typeof date !== "string") {
        return res.status(400).json({ error: "date (YYYY-MM-DD) is required" });
      }
      const rangeEnd = typeof endDate === "string" ? endDate : date;

      // Fetch all courts for this academy
      const academyCourts = await db
        .select()
        .from(courts)
        .where(eq(courts.academyId, academyId));

      const courtIds = academyCourts.map((c) => c.id);
      if (courtIds.length === 0) {
        return res.json({ courts: [], bookings: [], blocks: [], sessions: [] });
      }

      // Fetch court bookings in date range (confirmed, pending, or blocked)
      const bookings = await db
        .select({
          id: courtBookings.id,
          courtId: courtBookings.courtId,
          userId: courtBookings.userId,
          playerId: courtBookings.playerId,
          date: courtBookings.date,
          startTime: courtBookings.startTime,
          endTime: courtBookings.endTime,
          durationMinutes: courtBookings.durationMinutes,
          bookingType: courtBookings.bookingType,
          status: courtBookings.status,
          notes: courtBookings.notes,
          price: courtBookings.price,
          createdAt: courtBookings.createdAt,
        })
        .from(courtBookings)
        .where(
          and(
            inArray(courtBookings.courtId, courtIds),
            gte(courtBookings.date, date),
            lte(courtBookings.date, rangeEnd),
            or(
              eq(courtBookings.status, "confirmed"),
              eq(courtBookings.status, "pending"),
            )
          )
        );

      // Enrich with player names (players.name is a single text field)
      const playerIds = bookings
        .map((b) => b.playerId)
        .filter(Boolean) as string[];
      const playerRows =
        playerIds.length > 0
          ? await db
              .select({ id: players.id, name: players.name })
              .from(players)
              .where(inArray(players.id, playerIds))
          : [];
      const playerMap = new Map(playerRows.map((p) => [p.id, p.name]));

      // Fetch coaching sessions that use courts in this date range
      const sessionRows = await pool.query(
        `SELECT s.id, s.court_id, s.start_time, s.end_time, s.title, s.status
         FROM sessions s
         WHERE s.court_id = ANY($1::text[])
           AND DATE(s.start_time) >= $2
           AND DATE(s.start_time) <= $3
           AND s.status NOT IN ('cancelled')`,
        [courtIds, date, rangeEnd]
      );

      const enrichedBookings = bookings.map((b) => ({
        ...b,
        playerName: b.playerId ? (playerMap.get(b.playerId) ?? "Unknown Player") : null,
        displayType:
          b.bookingType === "blocked"
            ? "blocked"
            : b.bookingType === "training" || b.bookingType === "academy"
            ? "coaching"
            : "player",
        colorCode:
          b.bookingType === "blocked"
            ? "#FF4136"
            : b.bookingType === "training" || b.bookingType === "academy"
            ? "#0074D9"
            : "#2ECC40",
      }));

      const enrichedSessions = (sessionRows.rows as any[]).map((s) => ({
        id: s.id,
        courtId: s.court_id,
        startTime: s.start_time,
        endTime: s.end_time,
        title: s.title,
        status: s.status,
        displayType: "coaching",
        colorCode: "#0074D9",
      }));

      res.json({
        courts: academyCourts,
        bookings: enrichedBookings,
        sessions: enrichedSessions,
      });
    } catch (error) {
      console.error("[AdminCourtBookings] GET error:", error);
      res.status(500).json({ error: "Failed to fetch court bookings" });
    }
  }
);

// POST /api/admin/court-bookings
// Book a court slot on behalf of a player
router.post(
  "/api/admin/court-bookings",
  authMiddleware,
  requireOwnerOrAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(403).json({ error: "Academy context required" });
      }

      const parsed = bookForPlayerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
      }
      const { courtId, playerId, date, startTime, endTime, durationMinutes, notes } = parsed.data;

      // Verify court belongs to academy
      const court = await db
        .select()
        .from(courts)
        .where(and(eq(courts.id, courtId), eq(courts.academyId, academyId)))
        .limit(1);
      if (court.length === 0) {
        return res.status(404).json({ error: "Court not found in your academy" });
      }

      // Verify player exists AND belongs to this academy (cross-tenant guard)
      const player = await db
        .select({ id: players.id, name: players.name, academyId: players.academyId })
        .from(players)
        .where(and(eq(players.id, playerId), eq(players.academyId, academyId)))
        .limit(1);
      if (player.length === 0) {
        return res.status(404).json({ error: "Player not found in your academy" });
      }

      // Check for time-overlap conflicts on this court + date
      const existingBookings = await db
        .select({
          id: courtBookings.id,
          startTime: courtBookings.startTime,
          endTime: courtBookings.endTime,
        })
        .from(courtBookings)
        .where(
          and(
            eq(courtBookings.courtId, courtId),
            eq(courtBookings.date, date),
            or(
              eq(courtBookings.status, "confirmed"),
              eq(courtBookings.status, "pending"),
            )
          )
        );

      const hasConflict = existingBookings.some((b) =>
        timesOverlap(startTime, endTime, b.startTime, b.endTime)
      );

      if (hasConflict) {
        return res.status(409).json({
          error: "This time slot conflicts with an existing booking. Please choose a different time.",
        });
      }

      // Also check coaching sessions for overlap
      const sessionConflict = await pool.query(
        `SELECT 1 FROM sessions s
         WHERE s.court_id = $1
           AND DATE(s.start_time) = $2
           AND s.status NOT IN ('cancelled')
           AND TO_CHAR(s.start_time, 'HH24:MI') < $4
           AND TO_CHAR(s.end_time, 'HH24:MI') > $3
         LIMIT 1`,
        [courtId, date, startTime, endTime]
      );
      if ((sessionConflict.rows?.length ?? 0) > 0) {
        return res.status(409).json({
          error: "This time slot conflicts with a scheduled coaching session.",
        });
      }

      // Get admin user id for booking
      const adminUserId = req.user!.userId;

      // Find the player's user id
      const playerUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.playerId, playerId))
        .limit(1);
      const bookingUserId = playerUser[0]?.id ?? adminUserId;

      const [newBooking] = await db
        .insert(courtBookings)
        .values({
          courtId,
          userId: bookingUserId,
          playerId,
          academyId,
          date,
          startTime,
          endTime,
          durationMinutes,
          bookingType: "public",
          status: "confirmed",
          notes: notes ?? null,
          price: "0",
          currency: "AED",
          paymentStatus: "free",
        })
        .returning();

      // Notify the player
      try {
        const tokens = await getPlayerPushTokens(playerId);
        if (tokens.length > 0) {
          await sendPushNotification(
            tokens,
            "Court Booked",
            `A court has been booked for you on ${date} at ${startTime}.`,
            { type: "court_booking", bookingId: newBooking.id },
            playerId
          );
        }
      } catch (notifErr) {
        console.warn("[AdminCourtBookings] Failed to notify player:", notifErr);
      }

      res.status(201).json({ success: true, booking: newBooking });
    } catch (error) {
      console.error("[AdminCourtBookings] POST error:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  }
);

// POST /api/admin/court-bookings/block
// Block a court slot (maintenance, event, private, other)
router.post(
  "/api/admin/court-bookings/block",
  authMiddleware,
  requireOwnerOrAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(403).json({ error: "Academy context required" });
      }

      const parsed = blockSlotSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
      }
      const { courtId, date, startTime, endTime, reason, note } = parsed.data;

      // Verify court belongs to academy
      const court = await db
        .select()
        .from(courts)
        .where(and(eq(courts.id, courtId), eq(courts.academyId, academyId)))
        .limit(1);
      if (court.length === 0) {
        return res.status(404).json({ error: "Court not found in your academy" });
      }

      const adminUserId = req.user!.userId;

      // Check for conflicting existing bookings on this slot — cancel them and notify players
      const conflictingBookings = await db
        .select({
          id: courtBookings.id,
          playerId: courtBookings.playerId,
          startTime: courtBookings.startTime,
          endTime: courtBookings.endTime,
        })
        .from(courtBookings)
        .where(
          and(
            eq(courtBookings.courtId, courtId),
            eq(courtBookings.date, date),
            or(
              eq(courtBookings.status, "confirmed"),
              eq(courtBookings.status, "pending"),
            )
          )
        );

      const overlappingBookings = conflictingBookings.filter((b) =>
        timesOverlap(startTime, endTime, b.startTime, b.endTime)
      );

      // Cancel overlapping bookings and notify affected players
      for (const overlap of overlappingBookings) {
        await db
          .update(courtBookings)
          .set({
            status: "cancelled",
            cancelledAt: new Date(),
            cancelReason: `Admin blocked slot (${reason})`,
            cancelledBy: adminUserId,
          })
          .where(eq(courtBookings.id, overlap.id));

        if (overlap.playerId) {
          try {
            const tokens = await getPlayerPushTokens(overlap.playerId);
            if (tokens.length > 0) {
              await sendPushNotification(
                tokens,
                "Booking Cancelled",
                `Your court booking on ${date} at ${overlap.startTime} has been cancelled — the slot has been blocked by the academy (${reason}).`,
                { type: "court_booking_cancelled", bookingId: overlap.id },
                overlap.playerId
              );
            }
          } catch (notifErr) {
            console.warn("[AdminCourtBookings] Failed to notify player of block cancellation:", notifErr);
          }
        }
      }

      // Calculate duration
      const [startH, startM] = startTime.split(":").map(Number);
      const [endH, endM] = endTime.split(":").map(Number);
      const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);

      const reasonLabel =
        reason === "maintenance" ? "Blocked — Maintenance" :
        reason === "event" ? "Blocked — Event" :
        reason === "private" ? "Blocked — Private" :
        "Blocked";

      const [block] = await db
        .insert(courtBookings)
        .values({
          courtId,
          userId: adminUserId,
          playerId: null,
          academyId,
          date,
          startTime,
          endTime,
          durationMinutes: durationMinutes > 0 ? durationMinutes : 60,
          bookingType: "blocked",
          status: "confirmed",
          notes: note ? `${reasonLabel}: ${note}` : reasonLabel,
          price: "0",
          currency: "AED",
          paymentStatus: "free",
        })
        .returning();

      res.status(201).json({
        success: true,
        block,
        cancelledCount: overlappingBookings.length,
      });
    } catch (error) {
      console.error("[AdminCourtBookings] BLOCK error:", error);
      res.status(500).json({ error: "Failed to block slot" });
    }
  }
);

// DELETE /api/admin/court-bookings/:id
// Cancel a booking or remove a block
router.delete(
  "/api/admin/court-bookings/:id",
  authMiddleware,
  requireOwnerOrAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      if (!academyId) {
        return res.status(403).json({ error: "Academy context required" });
      }

      const { id } = req.params;

      // Verify booking belongs to this academy
      const [existing] = await db
        .select()
        .from(courtBookings)
        .where(and(eq(courtBookings.id, id), eq(courtBookings.academyId, academyId)));

      if (!existing) {
        return res.status(404).json({ error: "Booking not found" });
      }

      await db
        .update(courtBookings)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: "Cancelled by admin",
          cancelledBy: req.user!.userId,
        })
        .where(eq(courtBookings.id, id));

      // Notify the player if applicable
      if (existing.playerId && existing.bookingType !== "blocked") {
        try {
          const tokens = await getPlayerPushTokens(existing.playerId);
          if (tokens.length > 0) {
            await sendPushNotification(
              tokens,
              "Booking Cancelled",
              `Your court booking on ${existing.date} at ${existing.startTime} has been cancelled by the academy.`,
              { type: "court_booking_cancelled", bookingId: id },
              existing.playerId
            );
          }
        } catch (notifErr) {
          console.warn("[AdminCourtBookings] Failed to notify player of cancellation:", notifErr);
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("[AdminCourtBookings] DELETE error:", error);
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  }
);

export default router;
