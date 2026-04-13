import { db } from "./db";
import { bookingRequests, courtAvailability } from "@shared/schema";
import { eq, and, lt, gte, lte, isNotNull, isNull, or } from "drizzle-orm";
import { sendPushNotification, getPlayerPushTokens, getCoachPushTokens } from "./pushNotifications";

const EXPIRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function processExpiredBookings(): Promise<void> {
  try {
    const now = new Date();

    // Find pending or awaiting-reply requests where expiresAt < now
    const expired = await db
      .select()
      .from(bookingRequests)
      .where(
        and(
          or(
            eq(bookingRequests.status, "pending"),
            eq(bookingRequests.status, "awaiting_player_reply")
          ),
          lt(bookingRequests.expiresAt, now)
        )
      );

    for (const req of expired) {
      try {
        // Mark as declined with reason response_timeout
        await db
          .update(bookingRequests)
          .set({
            status: "declined",
            declineReason: "response_timeout",
            responseNote: "Coach did not respond within the booking window",
            respondedAt: now,
          })
          .where(eq(bookingRequests.id, req.id));

        // Unblock court if blocked
        if (req.courtId) {
          try {
            await db
              .delete(courtAvailability)
              .where(
                and(
                  eq(courtAvailability.courtId, req.courtId),
                  eq(courtAvailability.blockedReason, `booking_request:${req.id}`)
                )
              );
          } catch { /* non-fatal */ }
        }

        // Notify player that request expired
        try {
          const playerTokens = await getPlayerPushTokens(req.playerId);
          if (playerTokens.length > 0) {
            await sendPushNotification(
              playerTokens,
              "Booking request expired",
              "Your lesson request wasn't confirmed in time. Try booking again.",
              { type: "booking_expired", bookingRequestId: req.id },
              req.playerId
            );
          }
        } catch { /* non-fatal */ }

        console.log(`[BookingExpiry] Expired booking request ${req.id}`);
      } catch (reqErr) {
        console.error(`[BookingExpiry] Failed to process request ${req.id}:`, reqErr);
      }
    }
  } catch (err) {
    console.error("[BookingExpiry] Job failed:", err);
  }
}

/**
 * Send 24h pre-lesson reminders for approved sessions.
 * Uses preLessonReminderSentAt for deduplication — only fires once per booking.
 * Finds approved bookings starting in [23h, 25h] from now that haven't been reminded yet.
 */
async function processPreLessonReminders(): Promise<void> {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000); // 23h from now
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);   // 25h from now

    // Find approved booking requests in the window that haven't been reminded yet
    const upcoming = await db
      .select()
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.status, "approved"),
          isNotNull(bookingRequests.sessionId),
          gte(bookingRequests.requestedStart, windowStart),
          lte(bookingRequests.requestedStart, windowEnd),
          isNull(bookingRequests.preLessonReminderSentAt)
        )
      );

    for (const req of upcoming) {
      if (!req.playerId) continue;
      try {
        // Mark as sent immediately to prevent duplicate sends even if pushes fail
        await db
          .update(bookingRequests)
          .set({ preLessonReminderSentAt: now })
          .where(eq(bookingRequests.id, req.id));

        const sessionStart = new Date(req.requestedStart as string | Date);
        const sessionDate = sessionStart.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
        const sessionTime = sessionStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        const sessionTypeLabel =
          req.sessionType === "private" ? "Private Lesson" :
          req.sessionType === "semi_private" ? "Semi-Private" :
          req.sessionType === "group" ? "Group Session" : "Session";

        // Player push: session reminder with warm-up tip hint
        const playerTokens = await getPlayerPushTokens(req.playerId);
        if (playerTokens.length > 0) {
          const focusTip = req.playerNote ? `Focus: ${req.playerNote.substring(0, 60)}.` : "Warm up and arrive 10 min early.";
          await sendPushNotification(
            playerTokens,
            "Lesson tomorrow",
            `Your ${sessionTypeLabel} is tomorrow, ${sessionDate} at ${sessionTime}. ${focusTip}`,
            { type: "lesson_reminder_24h", bookingRequestId: req.id, sessionId: req.sessionId },
            req.playerId
          );
        }

        // Coach push: session recap with player note context
        if (req.coachId) {
          const coachTokens = await getCoachPushTokens(req.coachId);
          if (coachTokens.length > 0) {
            const recap = req.playerNote ? `Player note: "${req.playerNote.substring(0, 60)}"` : "Review your session plan.";
            await sendPushNotification(
              coachTokens,
              "Session tomorrow",
              `${sessionTypeLabel} — ${sessionDate} at ${sessionTime}. ${recap}`,
              { type: "coach_lesson_reminder_24h", bookingRequestId: req.id, sessionId: req.sessionId }
            );
          }
        }

        console.log(`[PreLessonReminder] Sent 24h reminder for booking ${req.id}`);
      } catch (remErr) {
        console.error(`[PreLessonReminder] Failed for booking ${req.id}:`, remErr);
      }
    }
  } catch (err) {
    console.error("[PreLessonReminder] Job failed:", err);
  }
}

async function runAllJobs(): Promise<void> {
  await processExpiredBookings();
  await processPreLessonReminders();
}

export function startBookingExpiryJob(): void {
  console.log("[BookingExpiry] Starting expiry + pre-lesson reminder job (every 5 min)");
  // Delay initial run by 30s to allow DB migrations to complete first
  setTimeout(() => {
    runAllJobs();
    setInterval(runAllJobs, EXPIRY_INTERVAL_MS);
  }, 30_000);
}
