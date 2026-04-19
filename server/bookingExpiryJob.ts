import { db } from "./db";
import {
  bookingRequests,
  courtAvailability,
  sessions,
  sessionPlayers,
  sessionWaitlist,
  players,
  coaches,
  coachNotifications,
  playerNotifications,
} from "@shared/schema";
import { eq, and, lt, gte, lte, isNotNull, isNull, or } from "drizzle-orm";
import {
  sendPushNotification,
  getPlayerPushTokens,
  getCoachPushTokens,
} from "./pushNotifications";
import { enrollPlayerInGroupSession } from "./sessionEnrolment";

const EXPIRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface ExpiredRequest {
  id: string;
  academyId: string | null;
  playerId: string;
  coachId: string | null;
  courtId: string | null;
  sessionId: string | null;
  sessionType: string;
  requestedStart: Date | string;
  requestedEnd: Date | string;
}

type StaleOutcome =
  | { kind: "auto_accepted"; reason: "auto_accepted_on_timeout" }
  | { kind: "declined"; reason: "spot_filled" | "level_mismatch" | "response_timeout" };

/**
 * Decide what to do with a stale GROUP join request at the moment it expires.
 * Returns either auto_accepted (the player should be enrolled now) or declined
 * with a specific reason.
 */
async function classifyStaleGroupJoinRequest(req: ExpiredRequest): Promise<StaleOutcome> {
  if (!req.sessionId) {
    return { kind: "declined", reason: "response_timeout" };
  }

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, req.sessionId))
    .limit(1);

  if (!session) {
    return { kind: "declined", reason: "response_timeout" };
  }

  // Don't auto-accept into a cancelled or already-started session.
  if (session.status === "cancelled") {
    return { kind: "declined", reason: "spot_filled" };
  }
  if (session.startTime && new Date(session.startTime).getTime() <= Date.now()) {
    return { kind: "declined", reason: "response_timeout" };
  }

  // Spot availability: count active enrolments + offered waitlist seats.
  const enrolled = await db
    .select({ id: sessionPlayers.id, playerId: sessionPlayers.playerId })
    .from(sessionPlayers)
    .where(eq(sessionPlayers.sessionId, req.sessionId));

  // If the player is already in the session (e.g. enrolled by some other path),
  // treat as auto-accepted — we just need to flip the request status.
  if (enrolled.some((sp) => sp.playerId === req.playerId)) {
    return { kind: "auto_accepted", reason: "auto_accepted_on_timeout" };
  }

  const offered = await db
    .select({ id: sessionWaitlist.id })
    .from(sessionWaitlist)
    .where(
      and(
        eq(sessionWaitlist.sessionId, req.sessionId),
        eq(sessionWaitlist.status, "offered")
      )
    );

  const maxPlayers = session.maxPlayers ?? 6;
  const effectiveCount = enrolled.length + offered.length;
  if (effectiveCount >= maxPlayers) {
    return { kind: "declined", reason: "spot_filled" };
  }

  // Level eligibility check vs. session min/max level.
  const { minLevel, maxLevel } = session;
  if (minLevel != null || maxLevel != null) {
    const [player] = await db
      .select({ level: players.level })
      .from(players)
      .where(eq(players.id, req.playerId))
      .limit(1);
    const playerLevel = player?.level ?? 1;
    if (minLevel != null && playerLevel < minLevel) {
      return { kind: "declined", reason: "level_mismatch" };
    }
    if (maxLevel != null && playerLevel > maxLevel) {
      return { kind: "declined", reason: "level_mismatch" };
    }
  }

  return { kind: "auto_accepted", reason: "auto_accepted_on_timeout" };
}

/**
 * Auto-accept a stale group join request: enrol the player using the same
 * shared enrolment helper as the manual `/api/play/sessions/:id/join` route,
 * then mark the booking_request as approved. Returns false if the spot was
 * lost in a race (caller should fall back to declining as spot_filled).
 */
async function autoAcceptGroupJoin(req: ExpiredRequest, now: Date): Promise<boolean> {
  if (!req.sessionId) return false;

  // Enrol + flip the booking_request to approved in a SINGLE transaction.
  // If either side fails, both roll back — we can never end up in a state
  // where the player is enrolled but the request is still pending/declined.
  const result = await enrollPlayerInGroupSession(
    req.sessionId,
    req.playerId,
    async (tx) => {
      await tx
        .update(bookingRequests)
        .set({
          status: "approved",
          sessionId: req.sessionId!,
          respondedAt: now,
          responseNote: "Auto-accepted on timeout — spot was still open",
          updatedAt: now,
        })
        .where(eq(bookingRequests.id, req.id));
    },
  );

  if (!result.ok) {
    console.log(
      `[BookingExpiry] Auto-accept enrolment for request ${req.id} not possible (${result.reason})`,
    );
    return false;
  }
  return true;
}

const DECLINE_REASON_COPY: Record<string, { title: string; body: string }> = {
  spot_filled: {
    title: "Booking request declined",
    body: "Your join request expired and the session filled up before the coach could respond. Try another session.",
  },
  level_mismatch: {
    title: "Booking request declined",
    body: "Your join request expired and the session no longer matches your level. Try another session.",
  },
  response_timeout: {
    title: "Booking request expired",
    body: "Your lesson request wasn't confirmed in time. Try booking again.",
  },
};

async function notifyPlayerOfDecline(
  req: ExpiredRequest,
  reason: "spot_filled" | "level_mismatch" | "response_timeout"
): Promise<void> {
  const copy = DECLINE_REASON_COPY[reason] ?? DECLINE_REASON_COPY.response_timeout;
  try {
    await db.insert(playerNotifications).values({
      playerId: req.playerId,
      title: copy.title,
      body: copy.body,
      type: "booking_declined",
      data: {
        bookingRequestId: req.id,
        declineReason: reason,
        sessionId: req.sessionId,
      },
    });
  } catch (err) {
    console.error(`[BookingExpiry] Failed to write player in-app decline notification for ${req.id}:`, err);
  }

  try {
    const tokens = await getPlayerPushTokens(req.playerId);
    if (tokens.length === 0) {
      console.log(`[BookingExpiry] Player ${req.playerId} has 0 push tokens — decline notify in-app only (request ${req.id})`);
      return;
    }
    await sendPushNotification(
      tokens,
      copy.title,
      copy.body,
      { type: "booking_declined", bookingRequestId: req.id, declineReason: reason },
      undefined
    );
  } catch (err) {
    console.error(`[BookingExpiry] Failed to push decline to player for request ${req.id}:`, err);
  }
}

async function notifyAutoAccept(req: ExpiredRequest): Promise<void> {
  // Coach name (best effort) for the player-facing copy.
  let coachName = "your coach";
  if (req.coachId) {
    try {
      const [c] = await db
        .select({ name: coaches.name })
        .from(coaches)
        .where(eq(coaches.id, req.coachId))
        .limit(1);
      if (c?.name) coachName = c.name;
    } catch { /* non-fatal */ }
  }

  let playerName = "Player";
  try {
    const [p] = await db
      .select({ name: players.name })
      .from(players)
      .where(eq(players.id, req.playerId))
      .limit(1);
    if (p?.name) playerName = p.name;
  } catch { /* non-fatal */ }

  const sessionStart = new Date(req.requestedStart as string | Date);
  const dateStr = sessionStart.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const timeStr = sessionStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  // ----- Player notification -----
  const playerTitle = "You're in";
  const playerBody = `${coachName} didn't respond in time and the spot was still open, so we auto-accepted your join request for ${dateStr} at ${timeStr}.`;
  try {
    await db.insert(playerNotifications).values({
      playerId: req.playerId,
      title: playerTitle,
      body: playerBody,
      type: "booking_auto_accepted",
      data: {
        bookingRequestId: req.id,
        sessionId: req.sessionId,
        autoAccepted: true,
      },
    });
  } catch (err) {
    console.error(`[BookingExpiry] Failed to write player auto-accept in-app notification for ${req.id}:`, err);
  }
  try {
    const tokens = await getPlayerPushTokens(req.playerId);
    if (tokens.length > 0) {
      await sendPushNotification(
        tokens,
        playerTitle,
        playerBody,
        { type: "booking_auto_accepted", bookingRequestId: req.id, sessionId: req.sessionId },
        undefined
      );
    } else {
      console.log(`[BookingExpiry] Player ${req.playerId} has 0 push tokens — auto-accept notify in-app only (request ${req.id})`);
    }
  } catch (err) {
    console.error(`[BookingExpiry] Failed to push auto-accept to player for request ${req.id}:`, err);
  }

  // ----- Coach notification -----
  if (req.coachId) {
    const coachTitle = "Auto-accepted on timeout";
    const coachBody = `${playerName} was auto-enrolled into your group session on ${dateStr} at ${timeStr} because the response window expired with a spot still free.`;
    try {
      await db.insert(coachNotifications).values({
        coachId: req.coachId,
        type: "booking_request",
        title: coachTitle,
        message: coachBody,
        priority: "medium",
        actionUrl: `/coach/booking-requests/${req.id}`,
        metadata: {
          bookingRequestId: req.id,
          sessionId: req.sessionId,
          playerId: req.playerId,
          autoAccepted: true,
        },
      });
    } catch (err) {
      console.error(`[BookingExpiry] Failed to write coach in-app auto-accept notification for ${req.id}:`, err);
    }
    try {
      const coachTokens = await getCoachPushTokens(req.coachId);
      if (coachTokens.length > 0) {
        await sendPushNotification(
          coachTokens,
          coachTitle,
          coachBody,
          { type: "booking_auto_accepted_coach", bookingRequestId: req.id, sessionId: req.sessionId },
          undefined
        );
      } else {
        console.log(`[BookingExpiry] Coach ${req.coachId} has 0 push tokens — auto-accept notify in-app only (request ${req.id})`);
      }
    } catch (err) {
      console.error(`[BookingExpiry] Failed to push auto-accept to coach for request ${req.id}:`, err);
    }
  }
}

async function declineExpiredRequest(
  req: ExpiredRequest,
  now: Date,
  reason: "spot_filled" | "level_mismatch" | "response_timeout"
): Promise<void> {
  const noteByReason: Record<string, string> = {
    spot_filled: "Auto-declined on timeout — session filled up",
    level_mismatch: "Auto-declined on timeout — player no longer meets the session level",
    response_timeout: "Coach did not respond within the booking window",
  };

  await db
    .update(bookingRequests)
    .set({
      status: "declined",
      declineReason: reason,
      responseNote: noteByReason[reason],
      respondedAt: now,
      updatedAt: now,
    })
    .where(eq(bookingRequests.id, req.id));

  // Unblock court if blocked (only relevant for non-join requests, but safe to run).
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

  await notifyPlayerOfDecline(req, reason);
}

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

    if (expired.length > 0) {
      console.log(`[BookingExpiry] Processing ${expired.length} expired request(s)`);
    }

    for (const row of expired) {
      const req: ExpiredRequest = {
        id: row.id,
        academyId: row.academyId,
        playerId: row.playerId,
        coachId: row.coachId,
        courtId: row.courtId,
        sessionId: row.sessionId,
        sessionType: row.sessionType,
        requestedStart: row.requestedStart,
        requestedEnd: row.requestedEnd,
      };

      try {
        const isGroupJoinRequest = !!req.sessionId && req.sessionType === "group";

        if (isGroupJoinRequest) {
          const outcome = await classifyStaleGroupJoinRequest(req);
          if (outcome.kind === "auto_accepted") {
            const ok = await autoAcceptGroupJoin(req, now);
            if (ok) {
              console.log(
                `[BookingExpiry] Auto-accepted group join request ${req.id} (player ${req.playerId} → session ${req.sessionId})`
              );
              await notifyAutoAccept(req);
              continue;
            }
            // Race: spot just filled. Fall through to decline.
            console.log(`[BookingExpiry] Auto-accept lost the race for request ${req.id} — declining as spot_filled`);
            await declineExpiredRequest(req, now, "spot_filled");
            continue;
          }
          await declineExpiredRequest(req, now, outcome.reason);
          console.log(`[BookingExpiry] Declined stale group join request ${req.id} (${outcome.reason})`);
          continue;
        }

        // Non-group-join requests: keep the existing behavior — decline on timeout.
        await declineExpiredRequest(req, now, "response_timeout");
        console.log(`[BookingExpiry] Declined stale request ${req.id} (response_timeout, sessionType=${req.sessionType})`);
      } catch (reqErr) {
        console.error(`[BookingExpiry] Failed to process request ${row.id}:`, reqErr);
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
