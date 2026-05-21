// Court Booking Reminder Job — Task #1712 (rev 2), Task #1990 (24h no-upload pass)
//
// Runs hourly. Fires reminders at 08:00 academy local time (once per local
// calendar day per academy), targeting sessions 14, 7, and 3 days out.
//
// Group filtering: if courtReminderGroupIds is set on the series, only players
// who are active members of at least one of those lesson groups receive a
// reminder. This uses the lesson_group_members table (not player IDs).
//
// Idempotency: each sent notification stores
//   data.reminderKey = "<sessionId>:<playerId>:<daysOut>"
// and we check playerNotifications before sending.
//
// Confirmation-aware: players who already have status='confirmed' are skipped.

import { db } from "./db";
import {
  academies,
  coachingSeries,
  seriesPlayers,
  sessions,
  players,
  playerNotifications,
  courtBookingConfirmations,
  lessonGroupMembers,
} from "@shared/schema";
import { eq, and, gte, lte, isNotNull, inArray } from "drizzle-orm";
import {
  sendPushNotification,
  getPlayerPushTokens,
} from "./pushNotifications";

const TICK_INTERVAL_MS = 60 * 60 * 1000; // hourly
let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Per-academy idempotency: academyKey → local-date string for the last run. */
const lastRunByAcademy = new Map<string, string>();

const REMINDER_DAYS = [14, 7, 3] as const;

/** Returns the current hour (0–23) in the given IANA timezone. */
function localHour(timezone: string): number {
  try {
    const h = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).format(new Date());
    const n = parseInt(h, 10);
    return isNaN(n) ? new Date().getUTCHours() : n;
  } catch {
    return new Date().getUTCHours();
  }
}

/** Returns "YYYY-MM-DD" in the given IANA timezone. */
function localDateKey(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Returns a set of reminder keys already sent for this player. */
async function getSentReminderKeys(playerId: string): Promise<Set<string>> {
  const rows = await db
    .select({ data: playerNotifications.data })
    .from(playerNotifications)
    .where(
      and(
        eq(playerNotifications.playerId, playerId),
        eq(playerNotifications.type, "court_booking_reminder")
      )
    );
  const keys = new Set<string>();
  for (const row of rows) {
    const d = row.data as { reminderKey?: string } | null;
    if (d?.reminderKey) keys.add(d.reminderKey);
  }
  return keys;
}

/** Returns true when the player already has status='confirmed' for this session. */
async function isPlayerConfirmedForSession(
  playerId: string,
  sessionId: string
): Promise<boolean> {
  const [conf] = await db
    .select({ id: courtBookingConfirmations.id })
    .from(courtBookingConfirmations)
    .where(
      and(
        eq(courtBookingConfirmations.playerId, playerId),
        eq(courtBookingConfirmations.sessionId, sessionId),
        eq(courtBookingConfirmations.status, "confirmed")
      )
    )
    .limit(1);
  return !!conf;
}

type SeriesRow = {
  id: string;
  academyId: string | null;
  courtLocation: string | null;
  title: string;
  courtReminderGroupIds: string[] | null;
  academyTimezone: string | null;
};

async function processSeriesReminders(series: SeriesRow): Promise<number> {
  let sent = 0;
  const now = new Date();
  if (!series.courtLocation) return 0;

  for (const daysOut of REMINDER_DAYS) {
    const targetDate = new Date(now);
    targetDate.setUTCDate(targetDate.getUTCDate() + daysOut);
    const dayStart = new Date(targetDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const daySessions = await db
      .select({ id: sessions.id, startTime: sessions.startTime })
      .from(sessions)
      .where(
        and(
          eq(sessions.seriesId, series.id),
          eq(sessions.status, "scheduled"),
          gte(sessions.startTime, dayStart),
          lte(sessions.startTime, dayEnd)
        )
      );

    for (const session of daySessions) {
      const enrolled = await db
        .select({ playerId: seriesPlayers.playerId, playerName: players.name })
        .from(seriesPlayers)
        .innerJoin(players, eq(players.id, seriesPlayers.playerId))
        .where(
          and(
            eq(seriesPlayers.seriesId, series.id),
            eq(seriesPlayers.status, "active")
          )
        );

      // Group filtering: courtReminderGroupIds stores lesson group IDs.
      // Only enrolled players who are active in at least one of those groups
      // receive a reminder. Null/empty = all enrolled players.
      const groupFilter = series.courtReminderGroupIds;
      let targetEnrolled = enrolled;
      if (groupFilter && groupFilter.length > 0) {
        const members = await db
          .select({ playerId: lessonGroupMembers.playerId })
          .from(lessonGroupMembers)
          .where(
            and(
              inArray(lessonGroupMembers.groupId, groupFilter),
              eq(lessonGroupMembers.status, "active")
            )
          );
        const allowedIds = new Set(members.map((m) => m.playerId));
        targetEnrolled = enrolled.filter((e) => allowedIds.has(e.playerId));
      }

      for (const enrollment of targetEnrolled) {
        const alreadyConfirmed = await isPlayerConfirmedForSession(
          enrollment.playerId,
          session.id
        );
        if (alreadyConfirmed) continue;

        const reminderKey = `${session.id}:${enrollment.playerId}:${daysOut}`;
        const sentKeys = await getSentReminderKeys(enrollment.playerId);
        if (sentKeys.has(reminderKey)) continue;

        const dayLabel =
          daysOut === 3 ? "in 3 days" : daysOut === 7 ? "in 1 week" : `in ${daysOut} days`;
        const title = "Court Booking Reminder";
        const body = `Your lesson at ${series.courtLocation} is ${dayLabel}. Please confirm your court booking.`;

        await db.insert(playerNotifications).values({
          playerId: enrollment.playerId,
          type: "court_booking_reminder",
          title,
          body,
          data: {
            type: "court_booking_reminder",
            reminderKey,
            sessionId: session.id,
            seriesId: series.id,
            courtLocation: series.courtLocation,
            daysOut,
            screen: "CourtBookingConfirmation",
          },
        });

        const tokens = await getPlayerPushTokens(enrollment.playerId);
        if (tokens.length > 0) {
          await sendPushNotification(tokens, title, body, {
            type: "court_booking_reminder",
            screen: "CourtBookingConfirmation",
            sessionId: session.id,
          });
        }

        sent++;
      }
    }
  }

  return sent;
}

/**
 * Task #1990 — 24 h "nobody uploaded" last-chance pass.
 *
 * Runs on every hourly tick (not time-of-day gated).
 * Finds sessions whose courtLocation is set and that start 23–25 h from now.
 * If ZERO players have any courtBookingConfirmation row for that session,
 * sends one push per enrolled player (idempotent via reminderKey
 * `court_booking_24h_noshow:{sessionId}:{playerId}`).
 */
async function processNoUploadReminders(): Promise<number> {
  let sent = 0;
  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  // Find scheduled sessions in the 23–25 h window whose series has a courtLocation
  const upcomingSessions = await db
    .select({
      sessionId: sessions.id,
      seriesId: sessions.seriesId,
      startTime: sessions.startTime,
      courtLocation: coachingSeries.courtLocation,
      seriesTitle: coachingSeries.title,
      courtReminderGroupIds: coachingSeries.courtReminderGroupIds,
    })
    .from(sessions)
    .innerJoin(coachingSeries, eq(coachingSeries.id, sessions.seriesId))
    .where(
      and(
        eq(sessions.status, "scheduled"),
        isNotNull(coachingSeries.courtLocation),
        gte(sessions.startTime, windowStart),
        lte(sessions.startTime, windowEnd)
      )
    );

  for (const session of upcomingSessions) {
    if (!session.courtLocation) continue;

    // Check if anyone has uploaded for this session
    const [anyUpload] = await db
      .select({ id: courtBookingConfirmations.id })
      .from(courtBookingConfirmations)
      .where(eq(courtBookingConfirmations.sessionId, session.sessionId))
      .limit(1);

    if (anyUpload) continue; // someone already uploaded — skip

    // Get enrolled players
    const enrolled = await db
      .select({ playerId: seriesPlayers.playerId })
      .from(seriesPlayers)
      .where(
        and(
          eq(seriesPlayers.seriesId, session.seriesId!),
          eq(seriesPlayers.status, "active")
        )
      );

    // Apply group filter if configured
    const groupFilter = session.courtReminderGroupIds;
    let targetPlayers = enrolled;
    if (groupFilter && groupFilter.length > 0) {
      const members = await db
        .select({ playerId: lessonGroupMembers.playerId })
        .from(lessonGroupMembers)
        .where(
          and(
            inArray(lessonGroupMembers.groupId, groupFilter),
            eq(lessonGroupMembers.status, "active")
          )
        );
      const allowedIds = new Set(members.map((m) => m.playerId));
      targetPlayers = enrolled.filter((e) => allowedIds.has(e.playerId));
    }

    const title = "Court Booking — Last Chance";
    const body = `Nobody has confirmed the court at ${session.courtLocation} yet. Your session starts in ~24 h — please upload your booking screenshot now.`;

    for (const { playerId } of targetPlayers) {
      const reminderKey = `court_booking_24h_noshow:${session.sessionId}:${playerId}`;

      // Idempotency — reuse the same getSentReminderKeys helper used by the regular pass
      const sentKeys = await getSentReminderKeys(playerId);
      if (sentKeys.has(reminderKey)) continue;

      await db.insert(playerNotifications).values({
        playerId,
        type: "court_booking_reminder",
        title,
        body,
        data: {
          type: "court_booking_reminder",
          reminderKey,
          sessionId: session.sessionId,
          seriesId: session.seriesId,
          courtLocation: session.courtLocation,
          screen: "CourtBookingConfirmation",
        },
      });

      const tokens = await getPlayerPushTokens(playerId);
      if (tokens.length > 0) {
        await sendPushNotification(tokens, title, body, {
          type: "court_booking_reminder",
          screen: "CourtBookingConfirmation",
          sessionId: session.sessionId,
        });
      }

      sent++;
    }
  }

  return sent;
}

export async function processCourtBookingReminders(): Promise<{
  processed: number;
  sent: number;
}> {
  let processed = 0;
  let sent = 0;

  // Load all active series with court_location configured, joined with academy timezone
  const allSeries = await db
    .select({
      id: coachingSeries.id,
      academyId: coachingSeries.academyId,
      courtLocation: coachingSeries.courtLocation,
      title: coachingSeries.title,
      courtReminderGroupIds: coachingSeries.courtReminderGroupIds,
      academyTimezone: academies.timezone,
    })
    .from(coachingSeries)
    .leftJoin(academies, eq(academies.id, coachingSeries.academyId))
    .where(
      and(
        eq(coachingSeries.status, "active"),
        isNotNull(coachingSeries.courtLocation)
      )
    );

  // Group series by academy so we only do one timezone check per academy
  const byAcademy = new Map<string, typeof allSeries>();
  for (const s of allSeries) {
    const key = s.academyId ?? s.id;
    if (!byAcademy.has(key)) byAcademy.set(key, []);
    byAcademy.get(key)!.push(s);
  }

  for (const [academyKey, seriesList] of byAcademy) {
    const timezone = seriesList[0].academyTimezone ?? "UTC";

    // Only fire at 08:00 local time
    if (localHour(timezone) !== 8) continue;

    // Once per local calendar day per academy
    const dateKey = localDateKey(timezone);
    if (lastRunByAcademy.get(academyKey) === dateKey) continue;

    for (const series of seriesList) {
      processed++;
      const seriesSent = await processSeriesReminders(series);
      sent += seriesSent;
    }

    lastRunByAcademy.set(academyKey, dateKey);
    console.log(
      `[CourtBookingReminder] ${academyKey} (${timezone}) — ${dateKey}: sent=${sent}`
    );
  }

  // 24h no-upload pass — runs every tick, not time-gated
  try {
    const noUploadSent = await processNoUploadReminders();
    if (noUploadSent > 0) {
      console.log(`[CourtBookingReminder] 24h no-upload pass: sent=${noUploadSent}`);
      sent += noUploadSent;
    }
  } catch (err) {
    console.error("[CourtBookingReminder] 24h no-upload pass failed:", err);
  }

  return { processed, sent };
}

export function startCourtBookingReminderJob(): void {
  if (intervalHandle) {
    console.log("[CourtBookingReminder] Scheduler already running");
    return;
  }
  console.log(
    "[CourtBookingReminder] Starting — fires at 08:00 academy local time (hourly tick)"
  );

  const tick = async () => {
    try {
      await processCourtBookingReminders();
    } catch (err) {
      console.error("[CourtBookingReminder] tick failed:", err);
    }
  };

  // Initial tick after 5 s (catches 08:xx window on server restarts)
  setTimeout(() => void tick(), 5_000);
  intervalHandle = setInterval(() => void tick(), TICK_INTERVAL_MS);
}

export function stopCourtBookingReminderJob(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[CourtBookingReminder] Scheduler stopped");
  }
}
