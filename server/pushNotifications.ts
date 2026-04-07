import { db, pool } from "./db";
import { eq, and, gte, lte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { pushDeviceTokens, notificationPreferences, users, players, coaches, sessions, sessionPlayers, seriesPlayers, coachXpTransactions, creditTransactions, coachNotifications, sessionWaitlist, playerNotifications, locations, locationTravelTimes, tournaments, tournamentMatches, tournamentParticipants, playerSessionReflections } from "@shared/schema";
import { storage, ensureCreditProcessed } from "./storage";
import { sendSessionReminderEmail, sendOnboardingDay3Email, sendOnboardingDay7Email } from "./emailService";
import { initializeFirebase, isFirebaseInitialized, isFCMToken, sendFCMNotification, getChannelIdForNotificationType } from "./fcm";

// Initialize Firebase on module load
initializeFirebase();

function formatSessionDateTime(startTime: Date | string, timezone: string): { date: string; time: string } {
  const dt = typeof startTime === "string" ? new Date(startTime) : startTime;
  const date = dt.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  });
  const time = dt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  });
  return { date, time };
}

function formatSessionType(type: string): string {
  switch (type) {
    case "private": return "Private";
    case "semi_private": return "Semi-Private";
    case "group": return "Group";
    case "private_adjusted": return "Private";
    default: return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
  }
}

async function getAcademyTimezone(academyId?: string | null): Promise<string> {
  if (!academyId) return "UTC";
  try {
    const academy = await storage.getAcademy(academyId);
    return academy?.timezone || "UTC";
  } catch {
    return "UTC";
  }
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Send push notification via Expo Push API (for Expo Go and iOS)
async function sendExpoPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<ExpoPushTicket[]> {
  if (tokens.length === 0) return [];

  const notificationType = data?.type as string | undefined;
  const channelId = getChannelIdForNotificationType(notificationType);

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token,
    title,
    body,
    data,
    sound: "default",
    priority: "high",
    channelId,
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    const tickets: ExpoPushTicket[] = result.data || [];

    console.log(`[ExpoPush] Sent ${messages.length} messages, got ${tickets.length} tickets`);

    for (let i = 0; i < tickets.length; i++) {
      if (tickets[i].status === "error") {
        console.error(`[ExpoPush] Error for token ${tokens[i]?.substring(0, 30)}...: ${tickets[i].message} (${tickets[i].details?.error})`);
        if (tickets[i].details?.error === "DeviceNotRegistered") {
          deactivateStaleToken(tokens[i]);
        }
      }
    }

    const ticketIds = tickets.filter(t => t.status === "ok" && t.id).map(t => t.id!);
    if (ticketIds.length > 0) {
      setTimeout(() => checkExpoReceipts(ticketIds, tokens), 30000);
    }

    return tickets;
  } catch (error) {
    console.error("Failed to send Expo push notification:", error);
    return [];
  }
}

async function deactivateStaleToken(token: string): Promise<void> {
  try {
    await db.update(pushDeviceTokens)
      .set({ isActive: false })
      .where(eq(pushDeviceTokens.token, token));
    console.log(`[ExpoPush] Deactivated stale token: ${token.substring(0, 30)}...`);
  } catch (error) {
    console.error("[ExpoPush] Failed to deactivate stale token:", error);
  }
}

async function checkExpoReceipts(ticketIds: string[], tokens: string[]): Promise<void> {
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: ticketIds }),
    });

    const result = await response.json();
    const receipts = result.data || {};

    for (const [id, receipt] of Object.entries(receipts) as [string, any][]) {
      if (receipt.status === "error") {
        console.error(`[ExpoPush] Receipt error for ${id}: ${receipt.message} (${receipt.details?.error})`);
        if (receipt.details?.error === "DeviceNotRegistered") {
          const ticketIndex = ticketIds.indexOf(id);
          if (ticketIndex >= 0 && tokens[ticketIndex]) {
            deactivateStaleToken(tokens[ticketIndex]);
          }
        }
      }
    }
  } catch (error) {
    console.error("[ExpoPush] Failed to check receipts:", error);
  }
}

// Unified push notification function - routes to Expo or FCM based on token type
export async function sendPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  playerId?: string
): Promise<ExpoPushTicket[]> {
  if (tokens.length === 0) return [];

  // Separate tokens by type
  const expoTokens: string[] = [];
  const fcmTokens: string[] = [];

  for (const token of tokens) {
    if (isFCMToken(token)) {
      fcmTokens.push(token);
    } else {
      expoTokens.push(token);
    }
  }

  const results: ExpoPushTicket[] = [];

  // Send to Expo Push API
  if (expoTokens.length > 0) {
    const expoResults = await sendExpoPushNotification(expoTokens, title, body, data);
    results.push(...expoResults);
  }

  // Send to FCM (if Firebase is initialized)
  if (fcmTokens.length > 0 && isFirebaseInitialized()) {
    const notificationType = data?.type as string | undefined;
    const channelId = getChannelIdForNotificationType(notificationType);
    const fcmResults = await sendFCMNotification(fcmTokens, title, body, data, channelId);
    // Convert FCM results to ExpoPushTicket format
    for (const result of fcmResults) {
      results.push({
        status: result.success ? "ok" : "error",
        id: result.messageId,
        message: result.error,
      });
    }
  } else if (fcmTokens.length > 0) {
    // FCM tokens but Firebase not initialized - log warning
    console.warn(`[Push] ${fcmTokens.length} FCM tokens but Firebase not initialized`);
  }

  // Store notification in playerNotifications table
  try {
    const { playerNotifications } = await import("../shared/schema");
    if (playerId) {
      await db.insert(playerNotifications).values({
        playerId,
        title: title || "",
        body: body || "",
        type: (data?.type as string) || "general",
        data: data || {},
      });
    }
  } catch (storeErr) {
    console.error("[Push] Failed to store notification:", storeErr);
  }

  return results;
}

export async function getUserPushTokens(userId: string): Promise<string[]> {
  const tokens = await db
    .select({ token: pushDeviceTokens.token })
    .from(pushDeviceTokens)
    .where(
      and(
        eq(pushDeviceTokens.userId, userId),
        eq(pushDeviceTokens.isActive, true)
      )
    );
  return tokens.map((t) => t.token);
}

export async function getCoachPushTokens(coachId: string): Promise<string[]> {
  const tokens = await db
    .select({ token: pushDeviceTokens.token })
    .from(pushDeviceTokens)
    .where(
      and(
        eq(pushDeviceTokens.coachId, coachId),
        eq(pushDeviceTokens.isActive, true)
      )
    );
  return tokens.map((t) => t.token);
}

export async function getPlayerPushTokens(playerId: string): Promise<string[]> {
  if (!playerId) {
    console.warn("[PushNotification] getPlayerPushTokens called with empty playerId");
    return [];
  }
  const tokens = await db
    .select({ token: pushDeviceTokens.token })
    .from(pushDeviceTokens)
    .where(
      and(
        eq(pushDeviceTokens.playerId, playerId),
        eq(pushDeviceTokens.isActive, true)
      )
    );
  
  if (tokens.length > 0) {
    return tokens.map((t) => t.token);
  }
  
  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.playerId, playerId))
    .limit(1);

  if (user.length === 0) return [];

  return getUserPushTokens(user[0].id);
}

export async function sendSessionReminder(
  playerId: string,
  sessionType: string,
  startTime: Date,
  coachName: string,
  location?: string,
  academyId?: string | null,
  reminderType: "1h" | "30m" = "1h"
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  const timezone = await getAcademyTimezone(academyId);
  const { time } = formatSessionDateTime(startTime, timezone);
  const typeLabel = formatSessionType(sessionType);
  const locationStr = location ? ` at ${location}` : "";
  const timeLabel = reminderType === "1h" ? "1 Hour" : "30 Minutes";

  await sendPushNotification(
    tokens,
    `Session in ${timeLabel}`,
    `${typeLabel} at ${time} with ${coachName}${locationStr}. See you on court!`,
    { type: "session_reminder", playerId },
    playerId
  );
}

export async function sendFeedbackNotification(
  playerId: string,
  coachName: string,
  sessionName: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "New Feedback Received",
    `${coachName} has added feedback for your session "${sessionName}"`,
    { type: "feedback_received", playerId },
    playerId
  );
}

export async function sendBadgeEarnedNotification(
  playerId: string,
  badgeName: string,
  badgeDescription: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "Badge Earned!",
    `Congratulations! You earned the "${badgeName}" badge: ${badgeDescription}`,
    { type: "badge_earned", playerId, badgeName },
    playerId
  );
}

export async function sendLevelUpNotification(
  playerId: string,
  newLevel: number,
  levelName: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "Level Up!",
    `Congratulations! You've reached Level ${newLevel} - ${levelName}!`,
    { type: "level_up", playerId, newLevel },
    playerId
  );
}

export async function sendXPGainNotification(
  playerId: string,
  xpAmount: number,
  reason: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    `+${xpAmount} XP`,
    reason,
    { type: "xp_gain", playerId, xpAmount },
    playerId
  );
}

export async function sendCoachNotification(
  coachId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const tokens = await getCoachPushTokens(coachId);
  if (tokens.length === 0) return;

  await sendPushNotification(tokens, title, body, data);
}

export async function sendSessionReminderToCoach(
  coachId: string,
  sessionType: string,
  startTime: Date,
  playerNames: string[],
  location?: string,
  academyId?: string | null
): Promise<void> {
  const tokens = await getCoachPushTokens(coachId);
  if (tokens.length === 0) return;

  const timezone = await getAcademyTimezone(academyId);
  const { time } = formatSessionDateTime(startTime, timezone);
  const typeLabel = formatSessionType(sessionType);
  
  const displayNames = playerNames.slice(0, 3).join(", ");
  const extraCount = playerNames.length > 3 ? ` +${playerNames.length - 3}` : "";
  const playersStr = playerNames.length > 0 ? `${displayNames}${extraCount}` : "No players assigned";
  
  const locationStr = location ? ` at ${location}` : "";

  await sendPushNotification(
    tokens,
    `Session in 1 Hour`,
    `${typeLabel} at ${time}${locationStr} - ${playersStr}`,
    { type: "session_reminder_coach", coachId }
  );
}

async function getSessionPlayersForReminder(session: any) {
  let sessionPlayersList = await db
    .select()
    .from(sessionPlayers)
    .where(eq(sessionPlayers.sessionId, session.id));

  if (sessionPlayersList.length === 0 && session.seriesId) {
    const seriesPlayersList = await db
      .select()
      .from(seriesPlayers)
      .where(eq(seriesPlayers.seriesId, session.seriesId));
    
    sessionPlayersList = seriesPlayersList.map(sp => ({
      id: sp.id,
      sessionId: session.id,
      playerId: sp.playerId,
      status: 'enrolled' as const,
      bookingSource: 'series' as const,
      createdAt: sp.enrolledAt,
    }));
  }
  return sessionPlayersList;
}

async function sendRemindersForSession(
  session: any,
  reminderType: "1h" | "30m"
): Promise<void> {
  const sessionPlayersList = await getSessionPlayersForReminder(session);

  const coach = session.coachId ? await db
    .select()
    .from(coaches)
    .where(eq(coaches.id, session.coachId))
    .limit(1) : [];

  const coachName = coach[0]?.name || "Your coach";
  const sessionName = `${formatSessionType(session.sessionType)} session`;
  const timeLabel = reminderType === "1h" ? "1 hour" : "30 minutes";

  let playerNotificationsSent = 0;
  let playersWithNoTokens = 0;

  for (const sp of sessionPlayersList) {
    if (sp.playerId) {
      const tokens = await getPlayerPushTokens(sp.playerId);
      if (tokens.length === 0) {
        playersWithNoTokens++;
        console.log(`[SessionReminders] Player ${sp.playerId} has 0 push tokens - skipping ${reminderType} reminder`);
      } else {
        const tokenTypes = tokens.map(t => t.startsWith("ExponentPushToken") ? "expo" : "fcm");
        console.log(`[SessionReminders] Sending ${reminderType} to player ${sp.playerId} via ${tokens.length} token(s) [${tokenTypes.join(",")}]`);
        sendSessionReminder(
          sp.playerId,
          session.sessionType,
          session.startTime,
          coachName,
          undefined,
          session.academyId,
          reminderType
        ).catch(err => console.error(`[SessionReminders] Failed to send player ${reminderType} reminder to ${sp.playerId}:`, err));
        playerNotificationsSent++;
      }
    }
  }

  if (playersWithNoTokens > 0) {
    console.log(`[SessionReminders] ${playersWithNoTokens} player(s) have no push tokens for ${sessionName}`);
  }

  if (session.coachId) {
    const coachTokens = await getCoachPushTokens(session.coachId);
    if (coachTokens.length === 0) {
      console.log(`[SessionReminders] Coach ${session.coachId} has 0 push tokens - skipping ${reminderType} reminder`);
    } else {
      const playerNames: string[] = [];
      for (const sp of sessionPlayersList) {
        if (sp.playerId) {
          const playerData = await db.select().from(players).where(eq(players.id, sp.playerId)).limit(1);
          if (playerData[0]?.name) {
            playerNames.push(playerData[0].name.split(' ')[0]);
          }
        }
      }
      
      const timezone = await getAcademyTimezone(session.academyId);
      const { time } = formatSessionDateTime(session.startTime, timezone);
      const typeLabel = formatSessionType(session.sessionType);
      const displayNames = playerNames.slice(0, 3).join(", ");
      const extraCount = playerNames.length > 3 ? ` +${playerNames.length - 3}` : "";
      const playersStr = playerNames.length > 0 ? `${displayNames}${extraCount}` : "No players assigned";

      await sendPushNotification(
        coachTokens,
        `Session in ${timeLabel}`,
        `${typeLabel} at ${time} - ${playersStr}`,
        { type: "session_reminder_coach", coachId: session.coachId }
      );

      try {
        await db.insert(coachNotifications).values({
          coachId: session.coachId,
          type: "reminder",
          title: `Session in ${timeLabel}`,
          message: `${typeLabel} at ${time} - ${playersStr}`,
          priority: reminderType === "30m" ? "high" : "medium",
          metadata: { sessionId: session.id, reminderType },
        });
      } catch (err) {
        console.error("[SessionReminders] Failed to create in-app notification:", err);
      }
    }
  }

  if (reminderType === "1h") {
    await db.update(sessions)
      .set({ reminder1hSent: true })
      .where(eq(sessions.id, session.id));
  } else {
    await db.update(sessions)
      .set({ reminder30mSent: true })
      .where(eq(sessions.id, session.id));
  }

  console.log(`[SessionReminders] ${reminderType} reminder for "${sessionName}" - ${playerNotificationsSent} player push sent, ${playersWithNoTokens} without tokens, coach notified`);
}

export async function processExpiredWaitlistSpots(): Promise<void> {
  const now = new Date();
  try {
    // Find all offered waitlist entries where the claim window has passed
    const offeredEntries = await db.query.sessionWaitlist.findMany({
      where: (w, { and: wAnd, eq: wEq, isNotNull: wIsNotNull }) => wAnd(
        wEq(w.status, "offered"),
        wIsNotNull(w.offeredAt)
      ),
    });

    for (const entry of offeredEntries) {
      if (!entry.offeredAt) continue;
      const claimWindowMs = (entry.claimWindowMinutes || 30) * 60 * 1000;
      const expiryTime = new Date(entry.offeredAt.getTime() + claimWindowMs);
      
      if (now > expiryTime) {
        // Mark as expired
        await db.update(sessionWaitlist)
          .set({ status: "expired" })
          .where(eq(sessionWaitlist.id, entry.id));

        console.log(`[Waitlist] Expired offered spot for player ${entry.playerId} in session ${entry.sessionId}`);

        // Notify the expired player that their window closed
        await db.insert(playerNotifications).values({
          playerId: entry.playerId,
          title: "Spot Offer Expired",
          body: "Your waitlist spot offer has expired. The next player will be offered the spot.",
          type: "waitlist_spot_expired",
          data: { sessionId: entry.sessionId },
        });
        const expiredPlayerTokens = await getPlayerPushTokens(entry.playerId);
        if (expiredPlayerTokens.length > 0) {
          await sendPushNotification(
            expiredPlayerTokens,
            "Spot Offer Expired",
            "Your waitlist spot offer has expired. The next player will be offered the spot.",
            { type: "waitlist_spot_expired", sessionId: entry.sessionId },
            entry.playerId
          );
        }

        // Offer to the next player in line
        const nextWaiting = await db.query.sessionWaitlist.findFirst({
          where: (w, { and: wAnd, eq: wEq }) => wAnd(
            wEq(w.sessionId, entry.sessionId),
            wEq(w.status, "waiting")
          ),
          orderBy: (w, { asc }) => asc(w.createdAt),
        });

        if (nextWaiting) {
          const nextPlayer = await storage.getPlayer(nextWaiting.playerId);
          if (nextPlayer) {
            const claimWindowMinutes = nextWaiting.claimWindowMinutes || 30;
            const offeredAt = new Date();

            await db.update(sessionWaitlist)
              .set({ status: "offered", offeredAt })
              .where(eq(sessionWaitlist.id, nextWaiting.id));

            console.log(`[Waitlist] Offered spot to next player ${nextPlayer.id} in session ${entry.sessionId}`);

            // Always create in-app notification, then push if tokens available
            await db.insert(playerNotifications).values({
              playerId: nextPlayer.id,
              title: "Spot Available!",
              body: `A spot opened up in your waitlisted session. You have ${claimWindowMinutes} minutes to claim it!`,
              type: "waitlist_spot_offered",
              data: {
                sessionId: entry.sessionId,
                claimWindowMinutes,
                offeredAt: offeredAt.toISOString(),
              },
            });
            const playerTokens = await getPlayerPushTokens(nextPlayer.id);
            if (playerTokens.length > 0) {
              await sendPushNotification(
                playerTokens,
                "Spot Available!",
                `A spot opened up in your waitlisted session. You have ${claimWindowMinutes} minutes to claim it!`,
                { type: "waitlist_spot_offered", sessionId: entry.sessionId },
                nextPlayer.id
              );
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("[Waitlist] Error processing expired waitlist spots:", error);
  }
}

export async function processScheduledReminders(): Promise<void> {
  const now = new Date();
  const sixtyFiveMinutesFromNow = new Date(now.getTime() + 65 * 60 * 1000);

  try {
    // sessions.start_time is a naive UTC timestamp column; use explicit UTC-aware
    // AT TIME ZONE conversion to force comparison in UTC regardless of DB session timezone
    const nowUtc = now.toISOString();
    const futureUtc = sixtyFiveMinutesFromNow.toISOString();
    console.log(`[SessionReminders] Checking window: ${nowUtc} to ${futureUtc}`);

    const rawResult = await pool.query(
      `SELECT s.*, a.timezone AS academy_timezone
       FROM sessions s
       LEFT JOIN academies a ON s.academy_id = a.id
       WHERE (s.start_time AT TIME ZONE 'UTC') >= $1::timestamptz
         AND (s.start_time AT TIME ZONE 'UTC') <= $2::timestamptz
         AND s.status = 'scheduled'`,
      [nowUtc, futureUtc]
    );
    const upcomingSessions = rawResult.rows;

    console.log(`[SessionReminders] Found ${upcomingSessions.length} sessions in window`);
    for (const s of upcomingSessions) {
      const startTime = s.start_time ? new Date(s.start_time) : s.startTime;
      const minutesUntilPreview = (startTime.getTime() - now.getTime()) / (60 * 1000);
      const academyTz = s.academy_timezone || "Europe/Amsterdam";
      console.log(`[SessionReminders]   - ${s.id} start_time(UTC)=${startTime.toISOString()} academy_tz=${academyTz} minutesUntil=${minutesUntilPreview.toFixed(1)} type=${s.session_type || s.sessionType} level=${s.ball_level || s.ballLevel}`);
    }

    let sent1h = 0;
    let sent30m = 0;

    for (const raw of upcomingSessions) {
      const session = {
        id: raw.id,
        startTime: new Date(raw.start_time || raw.startTime),
        endTime: new Date(raw.end_time || raw.endTime),
        sessionType: raw.session_type || raw.sessionType,
        coachId: raw.coach_id || raw.coachId,
        academyId: raw.academy_id || raw.academyId,
        ballLevel: raw.ball_level || raw.ballLevel,
        reminder1hSent: raw.reminder_1h_sent ?? raw.reminder1hSent,
        reminder30mSent: raw.reminder_30m_sent ?? raw.reminder30mSent,
        seriesId: raw.series_id || raw.seriesId,
        maxPlayers: raw.max_players || raw.maxPlayers,
        status: raw.status,
      };
      const minutesUntil = (session.startTime.getTime() - now.getTime()) / (60 * 1000);
      const academyTz = raw.academy_timezone || "Europe/Amsterdam";
      console.log(`[SessionReminders] Processing session ${session.id}: start_time(UTC)=${session.startTime.toISOString()} academy_tz=${academyTz} minutesUntil=${minutesUntil.toFixed(1)} 1hSent=${session.reminder1hSent} 30mSent=${session.reminder30mSent}`);

      if (minutesUntil <= 65 && minutesUntil > 35 && !session.reminder1hSent) {
        await sendRemindersForSession(session, "1h");
        sent1h++;
      }

      if (minutesUntil <= 35 && !session.reminder30mSent) {
        await sendRemindersForSession(session, "30m");
        sent30m++;
      }
    }

    if (upcomingSessions.length > 0 || sent1h > 0 || sent30m > 0) {
      console.log(`[SessionReminders] Checked ${upcomingSessions.length} upcoming sessions, sent ${sent1h} 1h reminders, ${sent30m} 30m reminders`);
    } else {
      console.log(`[SessionReminders] No upcoming sessions in next 65 minutes`);
    }
  } catch (error) {
    console.error("[SessionReminders] Error processing reminders:", error);
  }
}

let reminderInterval: ReturnType<typeof setInterval> | null = null;

// In-memory set to avoid spamming departure notifications within the same scheduler run
const departureNotifiedSessions = new Set<string>();

interface DepartureDistanceMatrixElement {
  status: string;
  duration_in_traffic?: { value: number; text: string };
  duration?: { value: number; text: string };
}

interface DepartureDistanceMatrixRow {
  elements?: DepartureDistanceMatrixElement[];
}

interface DepartureDistanceMatrixResponse {
  status: string;
  rows?: DepartureDistanceMatrixRow[];
}

async function fetchDepartureEtaMinutes(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string
): Promise<number | null> {
  const origin = `${originLat},${originLng}`;
  const destination = `${destLat},${destLng}`;
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=driving&departure_time=now&key=${apiKey}`;
  try {
    const mapsRes = await fetch(url);
    if (!mapsRes.ok) return null;
    const mapsData = await mapsRes.json() as DepartureDistanceMatrixResponse;
    if (mapsData.status !== "OK") return null;
    const element = mapsData.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") return null;
    const dur = element.duration_in_traffic ?? element.duration;
    if (!dur?.value) return null;
    return Math.round(dur.value / 60);
  } catch {
    return null;
  }
}

function departureSameLocation(
  coachLat: number, coachLng: number,
  destLat: number, destLng: number
): boolean {
  const dLat = ((destLat - coachLat) * Math.PI) / 180;
  const dLng = ((destLng - coachLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((coachLat * Math.PI) / 180) *
    Math.cos((destLat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return distKm < 0.3;
}

async function processDepartureAlerts(): Promise<void> {
  try {
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const locationFreshnessMs = 30 * 60 * 1000;
    const locationCutoff = new Date(now.getTime() - locationFreshnessMs);

    const coachRows = await pool.query<{
      coach_id: string;
      last_lat: number;
      last_lng: number;
      last_location_at: Date;
      home_location_id: string | null;
    }>(
      `SELECT c.id AS coach_id, c.last_lat, c.last_lng, c.last_location_at, c.home_location_id
       FROM coaches c
       WHERE c.last_lat IS NOT NULL AND c.last_lng IS NOT NULL
         AND c.last_location_at IS NOT NULL
         AND c.last_location_at >= $1`,
      [locationCutoff]
    );

    const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? null;

    for (const coach of coachRows.rows) {
      try {
        const sessionRows = await pool.query<{
          session_id: string;
          start_time: Date;
          location_id: string;
          loc_name: string;
          loc_lat: number;
          loc_lng: number;
        }>(
          `SELECT s.id AS session_id, s.start_time, s.location_id,
                  l.name AS loc_name, l.lat AS loc_lat, l.lng AS loc_lng
           FROM sessions s
           JOIN locations l ON l.id = s.location_id
           WHERE s.coach_id = $1
             AND s.start_time >= $2
             AND s.start_time <= $3
             AND s.location_id IS NOT NULL
             AND l.lat IS NOT NULL AND l.lng IS NOT NULL
             AND s.status IN ('scheduled', 'upcoming')
           ORDER BY s.start_time ASC
           LIMIT 1`,
          [coach.coach_id, now, todayEnd]
        );

        if (sessionRows.rows.length === 0) continue;

        const session = sessionRows.rows[0];
        if (departureNotifiedSessions.has(session.session_id)) continue;

        const coachLat = coach.last_lat;
        const coachLng = coach.last_lng;
        const destLat = session.loc_lat;
        const destLng = session.loc_lng;

        if (departureSameLocation(coachLat, coachLng, destLat, destLng)) {
          departureNotifiedSessions.add(session.session_id);
          continue;
        }

        let travelTime: number | null = null;
        if (apiKey !== null) {
          travelTime = await fetchDepartureEtaMinutes(coachLat, coachLng, destLat, destLng, apiKey);
        }

        if (travelTime === null) {
          const fromLocId = coach.home_location_id;
          let travelRow: { travel_time_minutes: number } | null = null;

          if (fromLocId !== null) {
            const travelRes = await pool.query<{ travel_time_minutes: number }>(
              `SELECT travel_time_minutes FROM location_travel_times
               WHERE coach_id = $1 AND from_location_id = $2 AND to_location_id = $3
               LIMIT 1`,
              [coach.coach_id, fromLocId, session.location_id]
            );
            travelRow = travelRes.rows[0] ?? null;
          }

          if (travelRow === null) {
            const anyRes = await pool.query<{ travel_time_minutes: number }>(
              `SELECT travel_time_minutes FROM location_travel_times
               WHERE coach_id = $1 AND to_location_id = $2
               LIMIT 1`,
              [coach.coach_id, session.location_id]
            );
            travelRow = anyRes.rows[0] ?? null;
          }

          travelTime = travelRow?.travel_time_minutes ?? 30;
        }

        const sessionStart = new Date(session.start_time);
        const minutesToSession = (sessionStart.getTime() - now.getTime()) / (1000 * 60);

        // Alert when it is time to leave (coach has <= travelTime minutes until session start)
        // The +15 buffer is a query lookahead only; actual push fires at the leave-now threshold
        if (minutesToSession > travelTime || minutesToSession <= 0) continue;

        const sessionTimeStr = sessionStart.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        const minutesToSessionRounded = Math.round(minutesToSession);
        const body = `Leave now for ${session.loc_name} — session at ${sessionTimeStr} (${minutesToSessionRounded} min away)`;

        const tokens = await getCoachPushTokens(coach.coach_id);
        if (tokens.length > 0) {
          await sendPushNotification(
            tokens,
            "Time to Leave",
            body,
            { type: "departure_alert", sessionId: session.session_id, screen: "Dashboard" }
          );
          console.log(`[DepartureAlert] Sent to coach ${coach.coach_id} for session ${session.session_id} at ${session.loc_name}`);
        }

        departureNotifiedSessions.add(session.session_id);
      } catch (coachErr) {
        console.error(`[DepartureAlert] Error processing coach ${coach.coach_id}:`, coachErr);
      }
    }

    if (departureNotifiedSessions.size > 500) {
      const arr = Array.from(departureNotifiedSessions);
      arr.splice(0, arr.length - 500).forEach(id => departureNotifiedSessions.delete(id));
    }
  } catch (err) {
    console.error("[DepartureAlert] processDepartureAlerts error:", err);
  }
}

const AUTO_ATTENDANCE_GRACE_PERIOD = 0; // No grace period - mark attendance immediately after session ends
const AUTO_ATTENDANCE_XP_REWARD = 25; // XP for marking attendance during class

// Auto-complete sessions that have passed their end time
async function processAutoCompleteSession(): Promise<void> {
  try {
    const now = new Date();
    const nowUtcStr = now.toISOString().replace("T", " ").substring(0, 19);
    const completeThreshold = new Date(now.getTime() - 10 * 60 * 1000);
    const completeThresholdStr = completeThreshold.toISOString().replace("T", " ").substring(0, 19);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // NO 24-hour lower bound — process ALL past scheduled sessions regardless of age.
    // Sessions older than 7 days get null attendance (pending coach review) instead of auto-present.
    const result = await pool.query(
      `SELECT id, end_time, start_time, session_type, coach_id
       FROM sessions
       WHERE end_time <= $1::timestamp
         AND status = 'scheduled'`,
      [completeThresholdStr]
    );

    if (result.rows.length === 0) {
      return;
    }

    console.log(`[AutoComplete] Now UTC: ${nowUtcStr}, threshold: ${completeThresholdStr}`);
    console.log(`[AutoComplete] Auto-completing ${result.rows.length} sessions that have ended:`);

    for (const row of result.rows) {
      const endUtc = new Date(row.end_time).toISOString();
      const isOldSession = new Date(row.end_time) < sevenDaysAgo;
      console.log(`[AutoComplete]   Session ${row.id.substring(0,8)} | end_time(UTC): ${endUtc} | type: ${row.session_type} | old: ${isOldSession}`);
      await pool.query(
        `UPDATE sessions SET status = 'completed' WHERE id = $1 AND end_time <= $2::timestamp`,
        [row.id, completeThresholdStr]
      );

      const unmarkedPlayers = await pool.query(
        `SELECT sp.id, sp.player_id FROM session_players sp
         WHERE sp.session_id = $1 AND (sp.attendance_status IS NULL OR sp.attendance_status = 'pending')`,
        [row.id]
      );

      if (unmarkedPlayers.rows.length > 0) {
        if (isOldSession) {
          // Sessions older than 7 days: leave attendance as NULL for coach review.
          // Do NOT auto-mark as present or process credits.
          console.log(`[AutoComplete]   Session ${row.id.substring(0,8)} is older than 7 days — skipping auto-attendance, needs coach review`);
        } else {
          console.log(`[AutoComplete]   Setting attendance for ${unmarkedPlayers.rows.length} players in session ${row.id.substring(0,8)}`);
          for (const sp of unmarkedPlayers.rows) {
            await pool.query(
              `UPDATE session_players SET attendance_status = 'present', late_minutes = 0 WHERE id = $1`,
              [sp.id]
            );
            try {
              const creditResult = await ensureCreditProcessed(sp.id);
              if (creditResult.action === "consumed") {
                console.log(`[AutoComplete]   Consumed credit for player ${sp.player_id}`);
              } else if (creditResult.action === "debt_created") {
                console.log(`[AutoComplete]   Created debt for player ${sp.player_id}`);
              }
            } catch (creditError) {
              console.error(`[AutoComplete]   Failed credit processing for player ${sp.player_id}:`, creditError);
            }
          }
        }
      }
    }

    console.log("[AutoComplete] Processing complete");
  } catch (error) {
    console.error("[AutoComplete] Error:", error);
  }
}

async function processAutoAttendance(): Promise<void> {
  try {
    // Only auto-process sessions that ended within the last 7 days.
    // Sessions older than 7 days are left with null attendance for coach review.
    const sevenDaysAgoAutoAttendance = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace("T", " ").substring(0, 19);
    const completedSessionsWithNullAttendance = await pool.query(
      `SELECT DISTINCT s.id, s.coach_id, s.end_time, s.series_id, s.session_type, s.academy_id
       FROM sessions s
       LEFT JOIN session_players sp ON sp.session_id = s.id
       WHERE s.status = 'completed'
         AND s.end_time >= $1::timestamp
         AND (sp.attendance_status IS NULL OR sp.attendance_status = 'pending' OR sp.id IS NULL)
       ORDER BY s.end_time`,
      [sevenDaysAgoAutoAttendance]
    );

    const completedSessions = completedSessionsWithNullAttendance.rows.map((r: any) => ({
      id: r.id,
      coachId: r.coach_id,
      endTime: r.end_time,
      seriesId: r.series_id,
      sessionType: r.session_type,
      academyId: r.academy_id,
    }));

    if (completedSessions.length === 0) {
      return;
    }

    console.log(`[AutoAttendance] Processing ${completedSessions.length} completed sessions with unmarked attendance`);

    for (const session of completedSessions) {
      // First, check if there are existing session_players with unmarked attendance
      const existingPlayers = await db.select({
        id: sessionPlayers.id,
        playerId: sessionPlayers.playerId,
        attendanceStatus: sessionPlayers.attendanceStatus,
        creditDeductedAt: sessionPlayers.creditDeductedAt,
      })
        .from(sessionPlayers)
        .where(eq(sessionPlayers.sessionId, session.id));

      // For recurring sessions without any session_players, create them from series_players
      if (existingPlayers.length === 0 && session.seriesId) {
        console.log(`[AutoAttendance] Session ${session.id}: No session_players found, checking series_players`);
        
        const seriesPlayersList = await db.select({
          playerId: seriesPlayers.playerId,
          status: seriesPlayers.status,
        })
          .from(seriesPlayers)
          .where(and(
            eq(seriesPlayers.seriesId, session.seriesId),
            eq(seriesPlayers.status, "active")
          ));

        if (seriesPlayersList.length > 0) {
          console.log(`[AutoAttendance] Session ${session.id}: Creating ${seriesPlayersList.length} session_players from series_players`);
          
          for (const sp of seriesPlayersList) {
            // Create session_player record with "present" attendance
            const newSessionPlayerId = crypto.randomUUID();
            await db.insert(sessionPlayers).values({
              id: newSessionPlayerId,
              sessionId: session.id,
              playerId: sp.playerId,
              attendanceStatus: "present",
              lateMinutes: 0,
              isGuest: false,
              xpAwarded: 0,
            });

            // REFACTORED: Use ensureCreditProcessed instead of direct deduction
            try {
              const result = await ensureCreditProcessed(newSessionPlayerId);
              if (result.action === "consumed") {
                console.log(`[AutoAttendance] Consumed credit for player ${sp.playerId} in session ${session.id}`);
              } else if (result.action === "debt_created") {
                console.log(`[AutoAttendance] Created debt for player ${sp.playerId} in session ${session.id}`);
              }
            } catch (creditError) {
              console.error(`[AutoAttendance] Failed to process credit for player ${sp.playerId}:`, creditError);
            }
          }
        }
      } else {
        // Mark existing unmarked players as present
        const unmarkedPlayers = existingPlayers.filter(p => 
          p.attendanceStatus === null || p.attendanceStatus === "pending"
        );
        
        if (unmarkedPlayers.length === 0) continue;

        console.log(`[AutoAttendance] Session ${session.id}: Marking ${unmarkedPlayers.length} players as attended (auto-mark after session end)`);

        for (const player of unmarkedPlayers) {
          // First update attendance status
          await db.update(sessionPlayers)
            .set({ 
              attendanceStatus: "present",
              lateMinutes: 0
            })
            .where(eq(sessionPlayers.id, player.id));

          // REFACTORED: Use ensureCreditProcessed instead of direct deduction
          try {
            const result = await ensureCreditProcessed(player.id);
            if (result.action === "consumed") {
              console.log(`[AutoAttendance] Consumed credit for player ${player.playerId} in session ${session.id}`);
            } else if (result.action === "debt_created") {
              console.log(`[AutoAttendance] Created debt for player ${player.playerId} in session ${session.id}`);
            } else if (result.action === "already_processed") {
              console.log(`[AutoAttendance] Credit already processed for player ${player.playerId}`);
            }
          } catch (creditError) {
            console.error(`[AutoAttendance] Failed to process credit for player ${player.playerId}:`, creditError);
          }
        }
      }
    }

    console.log("[AutoAttendance] Processing complete");
  } catch (error) {
    console.error("[AutoAttendance] Error:", error);
  }
}

export async function rewardCoachForTimelyAttendance(
  coachId: string,
  sessionId: string,
  sessionEndTime: Date
): Promise<boolean> {
  try {
    const now = new Date();
    
    // Only reward if attendance was marked before or during session (within 10 min after end)
    const graceTime = new Date(sessionEndTime.getTime() + 10 * 60 * 1000);
    
    if (now > graceTime) {
      console.log(`[AutoAttendance] Attendance marked too late for XP reward (session ${sessionId})`);
      return false;
    }

    // Check if XP was already awarded for this session
    const existing = await db.select()
      .from(coachXpTransactions)
      .where(and(
        eq(coachXpTransactions.coachId, coachId),
        eq(coachXpTransactions.source, "timely_attendance"),
        eq(coachXpTransactions.sessionId, sessionId)
      ));

    if (existing.length > 0) {
      console.log(`[AutoAttendance] XP already awarded for session ${sessionId}`);
      return false;
    }

    // Award XP
    await db.insert(coachXpTransactions).values({
      coachId,
      xpAmount: AUTO_ATTENDANCE_XP_REWARD,
      source: "timely_attendance",
      sessionId,
      description: "Marked attendance during class time",
    });

    // Update coach XP total
    const coach = await db.select().from(coaches).where(eq(coaches.id, coachId));
    if (coach[0]) {
      await db.update(coaches)
        .set({ totalXp: (coach[0].totalXp || 0) + AUTO_ATTENDANCE_XP_REWARD })
        .where(eq(coaches.id, coachId));
    }

    console.log(`[AutoAttendance] Awarded ${AUTO_ATTENDANCE_XP_REWARD} XP to coach ${coachId} for timely attendance`);
    return true;
  } catch (error) {
    console.error("[AutoAttendance] Error rewarding coach:", error);
    return false;
  }
}

async function catchUpMissedReminders(): Promise<void> {
  try {
    const now = new Date();
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const fourHoursAgoStr = fourHoursAgo.toISOString().replace("T", " ").substring(0, 19);
    const twoHoursStr = twoHoursFromNow.toISOString().replace("T", " ").substring(0, 19);
    console.log(`[SessionReminders] Catch-up window: ${fourHoursAgoStr} to ${twoHoursStr} (4h lookback)`);

    const rawMissed = await pool.query(
      `SELECT * FROM sessions WHERE start_time >= $1::timestamp AND start_time <= $2::timestamp AND status = 'scheduled' AND (reminder_1h_sent = false OR reminder_30m_sent = false)`,
      [fourHoursAgoStr, twoHoursStr]
    );
    const missedSessions = rawMissed.rows;

    if (missedSessions.length === 0) {
      console.log("[SessionReminders] Startup catch-up: no missed reminders");
      return;
    }

    console.log(`[SessionReminders] Startup catch-up: found ${missedSessions.length} sessions with unsent reminders`);

    for (const raw of missedSessions) {
      const session = {
        id: raw.id,
        startTime: new Date(raw.start_time),
        endTime: new Date(raw.end_time),
        sessionType: raw.session_type,
        coachId: raw.coach_id,
        academyId: raw.academy_id,
        ballLevel: raw.ball_level,
        reminder1hSent: raw.reminder_1h_sent,
        reminder30mSent: raw.reminder_30m_sent,
        seriesId: raw.series_id,
        maxPlayers: raw.max_players,
        status: raw.status,
      };
      const minutesUntil = (session.startTime.getTime() - now.getTime()) / (60 * 1000);

      if (minutesUntil < -15) {
        console.log(`[SessionReminders] Catch-up: skipping session ${session.id} (started ${Math.round(-minutesUntil)}m ago — too late)`);
        continue;
      }

      if (!session.reminder1hSent) {
        console.log(`[SessionReminders] Catch-up: sending 1h reminder for session ${session.id} (${minutesUntil > 0 ? `starts in ${Math.round(minutesUntil)}m` : `started ${Math.round(-minutesUntil)}m ago`})`);
        await sendRemindersForSession(session, "1h");
      }

      if (!session.reminder30mSent) {
        console.log(`[SessionReminders] Catch-up: sending 30m reminder for session ${session.id} (${minutesUntil > 0 ? `starts in ${Math.round(minutesUntil)}m` : `started ${Math.round(-minutesUntil)}m ago`})`);
        await sendRemindersForSession(session, "30m");
      }
    }

    console.log("[SessionReminders] Startup catch-up complete");
  } catch (error) {
    console.error("[SessionReminders] Error in startup catch-up:", error);
  }
}

async function repairMissingSessionPlayers(): Promise<void> {
  try {
    const result = await pool.query(`
      SELECT s.id as session_id, s.start_time, s.session_type, s.academy_id,
             sp2.player_id, sp2.joined_at
      FROM sessions s
      JOIN series_players sp2 ON sp2.series_id = s.series_id
      LEFT JOIN session_players sp ON sp.session_id = s.id AND sp.player_id = sp2.player_id
      LEFT JOIN player_holidays ph ON ph.player_id = sp2.player_id
        AND s.start_time::date BETWEEN ph.start_date AND ph.end_date
      WHERE s.status = 'completed' 
        AND s.end_time > NOW() - INTERVAL '7 days'
        AND sp.id IS NULL
        AND ph.id IS NULL
        AND sp2.joined_at <= s.start_time
        AND (sp2.left_at IS NULL OR sp2.left_at > s.start_time)
        AND sp2.status IN ('active', 'left')
        AND NOT (
          sp2.pause_from IS NOT NULL 
          AND sp2.pause_until IS NOT NULL 
          AND s.start_time::date >= sp2.pause_from 
          AND s.start_time::date <= sp2.pause_until
        )
        AND NOT (
          sp2.is_guest = true
          AND sp2.guest_until IS NOT NULL
          AND s.start_time::date > sp2.guest_until
        )
      ORDER BY s.start_time ASC
    `);

    if (result.rows.length === 0) {
      console.log("[SessionPlayerRepair] No missing session_player records found");
      return;
    }

    console.log(`[SessionPlayerRepair] Found ${result.rows.length} missing session_player records — repairing...`);
    
    let healed = 0;
    let creditProcessed = 0;
    let errors = 0;
    const sessionIds = new Set<string>();

    for (const row of result.rows) {
      try {
        const newId = crypto.randomUUID();
        await db.insert(sessionPlayers).values({
          id: newId,
          sessionId: row.session_id,
          playerId: row.player_id,
          attendanceStatus: "present",
          lateMinutes: 0,
          isGuest: false,
          xpAwarded: 0,
        });
        healed++;
        sessionIds.add(row.session_id);

        try {
          const creditResult = await ensureCreditProcessed(newId);
          if (creditResult.action === "consumed" || creditResult.action === "debt_created") {
            creditProcessed++;
          }
        } catch (creditErr) {
          console.error(`[SessionPlayerRepair] Credit processing failed for player ${row.player_id}:`, creditErr);
        }
      } catch (insertErr: any) {
        if (insertErr?.code === '23505') continue;
        errors++;
        console.error(`[SessionPlayerRepair] Failed to heal player ${row.player_id} in session ${row.session_id}:`, insertErr);
      }
    }

    console.log(`[SessionPlayerRepair] Complete: ${healed} records healed across ${sessionIds.size} sessions, ${creditProcessed} credits processed, ${errors} errors`);
  } catch (error) {
    console.error("[SessionPlayerRepair] Error:", error);
  }
}

async function cleanupStaleSessionPlayers(): Promise<void> {
  try {
    const result = await pool.query(`
      DELETE FROM session_players sp
      USING sessions s, series_players srp
      WHERE sp.session_id = s.id
        AND s.series_id = srp.series_id
        AND sp.player_id = srp.player_id
        AND srp.status = 'left'
        AND s.status IN ('scheduled', 'upcoming')
        AND s.start_time > NOW()
        AND sp.is_guest = false
        AND (srp.left_at IS NULL OR srp.left_at <= s.start_time)
    `);
    if (result.rowCount && result.rowCount > 0) {
      console.log(`[StalePlayerCleanup] Removed ${result.rowCount} stale session_player records for players who left their series`);
    } else {
      console.log("[StalePlayerCleanup] No stale session_player records found");
    }
  } catch (error) {
    console.error("[StalePlayerCleanup] Error:", error);
  }
}

export async function repairNullAttendance(): Promise<void> {
  try {
    const nullAttendance = await pool.query(`
      SELECT sp.id, sp.player_id, sp.session_id, s.start_time, s.session_type, p.name as player_name
      FROM session_players sp
      JOIN sessions s ON s.id = sp.session_id
      JOIN players p ON p.id = sp.player_id
      LEFT JOIN player_holidays ph ON ph.player_id = sp.player_id
        AND s.start_time::date BETWEEN ph.start_date AND ph.end_date
      WHERE s.status = 'completed'
        AND sp.attendance_status IS NULL
        AND ph.id IS NULL
      ORDER BY s.start_time
    `);

    if (nullAttendance.rows.length === 0) {
      console.log("[NullAttendanceRepair] No completed sessions with NULL attendance found");
      return;
    }

    console.log(`[NullAttendanceRepair] Found ${nullAttendance.rows.length} completed session_player records with NULL attendance — fixing now`);

    let fixed = 0;
    let creditsProcessed = 0;
    let debtsCreated = 0;

    for (const row of nullAttendance.rows) {
      await pool.query(
        `UPDATE session_players SET attendance_status = 'present', late_minutes = 0 WHERE id = $1`,
        [row.id]
      );

      try {
        const result = await ensureCreditProcessed(row.id);
        if (result.action === "consumed") {
          creditsProcessed++;
          console.log(`[NullAttendanceRepair] ${row.player_name} | session ${row.session_id.substring(0,8)} (${new Date(row.start_time).toISOString().substring(0,10)}) | credit consumed`);
        } else if (result.action === "debt_created") {
          debtsCreated++;
          console.log(`[NullAttendanceRepair] ${row.player_name} | session ${row.session_id.substring(0,8)} (${new Date(row.start_time).toISOString().substring(0,10)}) | debt created`);
        } else if (result.action === "already_processed") {
          console.log(`[NullAttendanceRepair] ${row.player_name} | session ${row.session_id.substring(0,8)} | already processed`);
        }
      } catch (creditError) {
        console.error(`[NullAttendanceRepair] Failed credit processing for ${row.player_name}:`, creditError);
      }
      fixed++;
    }

    console.log(`[NullAttendanceRepair] Complete: ${fixed} attendance records fixed, ${creditsProcessed} credits consumed, ${debtsCreated} debts created`);
  } catch (error) {
    console.error("[NullAttendanceRepair] Error:", error);
  }
}

export async function fixHolidayOvercharges(): Promise<void> {
  try {
    // --- Pass 1: session_players wrongly charged while player was on holiday ---
    // Finds sessions where attendance='present' and a credit was deducted, but the session
    // date falls within a recorded player holiday.
    const overcharged = await pool.query(`
      SELECT DISTINCT ON (sp.id) sp.id, sp.player_id, sp.session_id, sp.attendance_status, sp.credit_deducted_at,
             sp.credit_transaction_id, p.name as player_name, s.start_time, s.academy_id
      FROM session_players sp
      JOIN sessions s ON s.id = sp.session_id
      JOIN players p ON p.id = sp.player_id
      JOIN player_holidays ph ON ph.player_id = sp.player_id
        AND s.start_time::date BETWEEN ph.start_date AND ph.end_date
      WHERE sp.attendance_status = 'present'
        AND sp.credit_deducted_at IS NOT NULL
      ORDER BY sp.id, s.start_time
    `);

    if (overcharged.rows.length === 0) {
      console.log("[HolidayOverchargeFix] No holiday overcharges found");
    } else {
      console.log(`[HolidayOverchargeFix] Found ${overcharged.rows.length} session_player records wrongly charged during player holidays`);

      let fixed = 0;
      let debtsRefunded = 0;
      let packageRefunded = 0;
      let errors = 0;
      const processedIds = new Set<string>();

      for (const row of overcharged.rows) {
        if (processedIds.has(row.id)) continue;
        processedIds.add(row.id);

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          const guard = await client.query(
            `SELECT id FROM session_players WHERE id = $1 AND attendance_status = 'present' AND credit_deducted_at IS NOT NULL FOR UPDATE`,
            [row.id]
          );
          if (guard.rows.length === 0) {
            await client.query("ROLLBACK");
            continue;
          }

          const existingRefund = await client.query(
            `SELECT id FROM credit_transactions WHERE session_id = $1 AND player_id = $2 AND reason = 'session_removal_refund'
               AND metadata->>'refundedBy' = 'holiday_overcharge_fix' LIMIT 1`,
            [row.session_id, row.player_id]
          );
          if (existingRefund.rows.length > 0) {
            await client.query("ROLLBACK");
            continue;
          }

          const debtTxns = await client.query(
            `SELECT id, amount, metadata, reason, package_id FROM credit_transactions
             WHERE player_id = $1 AND session_id = $2 AND amount < 0
               AND reason IN ('session_debt', 'session_join_debt', 'session_unpaid', 'session_booking')`,
            [row.player_id, row.session_id]
          );

          let debtsCancelled = 0;
          for (const debt of debtTxns.rows) {
            const meta = typeof debt.metadata === "string" ? JSON.parse(debt.metadata) : (debt.metadata || {});
            if (meta.settled === true || meta.cancelled === true) continue;
            const isDebt = debt.reason === "session_debt" || debt.reason === "session_join_debt" || debt.reason === "session_unpaid"
              || (debt.reason === "session_booking" && (meta.isDebt === true || !debt.package_id));
            if (!isDebt) continue;

            await client.query(
              `UPDATE credit_transactions SET metadata = jsonb_set(COALESCE(metadata, '{}')::jsonb, '{cancelled}', 'true') || jsonb_build_object('cancelledAt', $2::text, 'cancelReason', 'player_was_on_holiday')
               WHERE id = $1`,
              [debt.id, new Date().toISOString()]
            );
            debtsCancelled++;
          }

          if (debtsCancelled > 0) {
            debtsRefunded++;
            console.log(`[HolidayOverchargeFix] Cancelled ${debtsCancelled} debt(s) for ${row.player_name} | session ${new Date(row.start_time).toISOString().substring(0, 10)}`);
          }

          const debitTxQuery = row.credit_transaction_id
            ? `SELECT ct.id, ct.package_id, ct.amount, ct.credit_type
               FROM credit_transactions ct
               WHERE ct.id = $1 AND ct.amount < 0 AND ct.package_id IS NOT NULL`
            : `SELECT ct.id, ct.package_id, ct.amount, ct.credit_type
               FROM credit_transactions ct
               WHERE ct.player_id = $1 AND ct.session_id = $2 AND ct.amount < 0 AND ct.package_id IS NOT NULL
                 AND ct.reason IN ('session_booking', 'session_debt', 'session_join_debt', 'session_unpaid')
               ORDER BY ct.created_at DESC LIMIT 1`;
          const debitTxParams = row.credit_transaction_id
            ? [row.credit_transaction_id]
            : [row.player_id, row.session_id];

          const txResult = await client.query(debitTxQuery, debitTxParams);

          if (txResult.rows.length > 0) {
            const origTx = txResult.rows[0];
            const refundAmount = Math.abs(Number(origTx.amount));

            const pkgResult = await client.query(
              `SELECT remaining_credits, status FROM packages WHERE id = $1 FOR UPDATE`,
              [origTx.package_id]
            );

            if (pkgResult.rows.length > 0) {
              const currentBalance = Number(pkgResult.rows[0].remaining_credits);
              const newBalance = currentBalance + refundAmount;
              const pkgStatus = pkgResult.rows[0].status;

              const updateFields: string[] = [`remaining_credits = $1`];
              const updateParams: (number | string)[] = [newBalance, origTx.package_id];
              if (pkgStatus === "depleted" && newBalance > 0) {
                updateFields.push(`status = 'active'`);
              }
              await client.query(
                `UPDATE packages SET ${updateFields.join(", ")} WHERE id = $2`,
                updateParams
              );

              await client.query(
                `INSERT INTO credit_transactions (id, player_id, academy_id, package_id, type, credit_type, amount, reason, session_id, balance_before, balance_after, metadata)
                 VALUES (gen_random_uuid(), $1, $2, $3, 'credit', $4, $5, 'session_removal_refund', $6, $7, $8, $9)`,
                [
                  row.player_id,
                  row.academy_id,
                  origTx.package_id,
                  origTx.credit_type || "group",
                  refundAmount,
                  row.session_id,
                  currentBalance,
                  newBalance,
                  JSON.stringify({
                    originalTransactionId: origTx.id,
                    refundedBy: "holiday_overcharge_fix",
                    reason: "player_was_on_holiday",
                  }),
                ]
              );

              packageRefunded++;
              if (pkgStatus === "depleted" && newBalance > 0) {
                console.log(`[HolidayOverchargeFix] Reactivated depleted package ${origTx.package_id} for ${row.player_name}`);
              }
              console.log(`[HolidayOverchargeFix] Refunded ${refundAmount} credits to package ${origTx.package_id} for ${row.player_name}`);
            }
          }

          await client.query(
            `UPDATE session_players SET attendance_status = 'vacation', credit_deducted_at = NULL, credit_transaction_id = NULL WHERE id = $1`,
            [row.id]
          );

          await client.query("COMMIT");
          fixed++;
          console.log(`[HolidayOverchargeFix] Fixed ${row.player_name} | session ${new Date(row.start_time).toISOString().substring(0, 10)} | was '${row.attendance_status}' -> 'vacation'`);
        } catch (fixErr) {
          await client.query("ROLLBACK");
          errors++;
          console.error(`[HolidayOverchargeFix] Failed to fix ${row.player_name} session ${row.session_id}:`, fixErr);
        } finally {
          client.release();
        }
      }

      console.log(`[HolidayOverchargeFix] Complete: ${fixed} fixed, ${debtsRefunded} debts cancelled, ${packageRefunded} package credits refunded, ${errors} errors`);
    }

    // --- Pass 2: unsettled debt-only credit transactions for sessions during player holidays ---
    // These are debit credit_transactions (isDebt=true) that were created when no package was
    // available. The first pass misses them because credit_deducted_at IS NULL on session_player.
    // This pass always runs, regardless of whether Pass 1 found anything.
    try {
      const debtOnlyRows = await pool.query(`
        SELECT DISTINCT ON (ct.id)
          ct.id as tx_id, ct.player_id, ct.session_id, ct.amount, ct.credit_type,
          ct.reason, ct.metadata, p.name as player_name, s.start_time,
          sp.id as session_player_id, sp.attendance_status
        FROM credit_transactions ct
        JOIN sessions s ON s.id = ct.session_id
        JOIN players p ON p.id = ct.player_id
        JOIN player_holidays ph ON ph.player_id = ct.player_id
          AND s.start_time::date BETWEEN ph.start_date AND ph.end_date
        LEFT JOIN session_players sp ON sp.session_id = ct.session_id AND sp.player_id = ct.player_id
        WHERE ct.type = 'debit'
          AND ct.reason IN ('session_debt', 'session_join_debt', 'session_unpaid')
          AND COALESCE(ct.metadata->>'isDebt', 'false') = 'true'
          AND COALESCE(ct.metadata->>'settled', 'false') != 'true'
          AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
          -- Skip ambiguous cases: debt was created well after the session ended,
          -- which may indicate the holiday was entered retroactively. Only cancel
          -- debts created within 21 days of the session start time.
          AND ct.created_at BETWEEN s.start_time - INTERVAL '1 day' AND s.start_time + INTERVAL '21 days'
        ORDER BY ct.id, s.start_time
      `);

      if (debtOnlyRows.rows.length === 0) {
        console.log("[HolidayDebtFix] No unsettled holiday debt transactions found");
      } else {
        console.log(`[HolidayDebtFix] Found ${debtOnlyRows.rows.length} unsettled debt transaction(s) for sessions during player holidays`);
        let debtFixed = 0;
        let debtErrors = 0;
        const processedTxIds = new Set<string>();

        for (const row of debtOnlyRows.rows) {
          if (processedTxIds.has(row.tx_id)) continue;
          processedTxIds.add(row.tx_id);

          const client = await pool.connect();
          try {
            await client.query("BEGIN");

            const guard = await client.query(
              `SELECT id FROM credit_transactions
               WHERE id = $1
                 AND COALESCE(metadata->>'settled', 'false') != 'true'
                 AND COALESCE(metadata->>'cancelled', 'false') != 'true'
               FOR UPDATE`,
              [row.tx_id]
            );
            if (guard.rows.length === 0) {
              await client.query("ROLLBACK");
              continue;
            }

            await client.query(
              `UPDATE credit_transactions
               SET metadata = jsonb_set(COALESCE(metadata, '{}')::jsonb, '{cancelled}', 'true')
                 || jsonb_build_object('cancelledAt', $2::text, 'cancelReason', 'player_was_on_holiday')
               WHERE id = $1`,
              [row.tx_id, new Date().toISOString()]
            );

            if (row.session_player_id && row.attendance_status !== 'vacation') {
              await client.query(
                `UPDATE session_players SET attendance_status = 'vacation' WHERE id = $1`,
                [row.session_player_id]
              );
            }

            await client.query("COMMIT");
            debtFixed++;
            console.log(`[HolidayDebtFix] Cancelled debt tx for ${row.player_name} | session ${new Date(row.start_time).toISOString().substring(0, 10)} | type: ${row.credit_type}`);
          } catch (err) {
            await client.query("ROLLBACK");
            debtErrors++;
            console.error(`[HolidayDebtFix] Failed to cancel debt tx ${row.tx_id}:`, err);
          } finally {
            client.release();
          }
        }

        console.log(`[HolidayDebtFix] Complete: ${debtFixed} cancelled, ${debtErrors} errors`);
      }
    } catch (debtPassErr) {
      console.error("[HolidayDebtFix] Error in debt pass:", debtPassErr);
    }

    // --- Post-fix verification: confirm 0 remaining holiday overcharges ---
    try {
      const remainingOvercharges = await pool.query(`
        SELECT COUNT(*) as count
        FROM session_players sp
        JOIN sessions s ON s.id = sp.session_id
        JOIN player_holidays ph ON ph.player_id = sp.player_id
          AND s.start_time::date BETWEEN ph.start_date AND ph.end_date
        WHERE sp.attendance_status = 'present'
          AND sp.credit_deducted_at IS NOT NULL
      `);
      const remainingDebts = await pool.query(`
        SELECT COUNT(*) as count
        FROM credit_transactions ct
        JOIN sessions s ON s.id = ct.session_id
        JOIN player_holidays ph ON ph.player_id = ct.player_id
          AND s.start_time::date BETWEEN ph.start_date AND ph.end_date
        WHERE ct.type = 'debit'
          AND ct.reason IN ('session_debt', 'session_join_debt', 'session_unpaid')
          AND COALESCE(ct.metadata->>'isDebt', 'false') = 'true'
          AND COALESCE(ct.metadata->>'settled', 'false') != 'true'
          AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
          AND ct.created_at BETWEEN s.start_time - INTERVAL '1 day' AND s.start_time + INTERVAL '21 days'
      `);
      const overchargeCount = Number(remainingOvercharges.rows[0]?.count ?? 0);
      const debtCount = Number(remainingDebts.rows[0]?.count ?? 0);
      console.log(`[HolidayOverchargeFix] Verification: ${overchargeCount} remaining overcharges, ${debtCount} remaining unsettled holiday debts`);
    } catch (verifyErr) {
      console.error("[HolidayOverchargeFix] Verification query failed:", verifyErr);
    }
  } catch (error) {
    console.error("[HolidayOverchargeFix] Error:", error);
  }
}

// One-shot data correction for Alma Zalesski:
// +1 credit to her active group package (3 → 4) and cancel any remaining unsettled group debts.
// Guards:
//   1. Idempotency marker — skips if 'holiday_debt_fix' refund transaction already exists
//   2. Balance cap — only applies +1 if remaining_credits < 4 to prevent over-crediting
export async function fixAlmaZaleskiCredits(): Promise<void> {
  try {
    // Find Alma by name
    const playerRes = await pool.query(
      `SELECT id FROM players WHERE name ILIKE 'Alma Zalesski' LIMIT 1`
    );
    if (playerRes.rows.length === 0) {
      console.log("[AlmaFix] Player 'Alma Zalesski' not found — skipping");
      return;
    }
    const playerId = playerRes.rows[0].id;

    // Check idempotency for the credit top-up only (separate from debt cancellation)
    const alreadyFixed = await pool.query(
      `SELECT id FROM credit_transactions
       WHERE player_id = $1 AND reason = 'session_removal_refund'
         AND metadata->>'refundedBy' = 'holiday_debt_fix'
       LIMIT 1`,
      [playerId]
    );
    const creditAlreadyApplied = alreadyFixed.rows.length > 0;

    if (creditAlreadyApplied) {
      console.log("[AlmaFix] Credit already applied — skipping credit top-up");
    } else {
      // Find her active group package for the credit top-up
      const pkgRes = await pool.query(
        `SELECT id, remaining_credits, total_credits, academy_id
         FROM packages
         WHERE player_id = $1 AND credit_type = 'group' AND status = 'active'
         ORDER BY expiry_date DESC NULLS LAST, remaining_credits DESC
         LIMIT 1`,
        [playerId]
      );

      if (pkgRes.rows.length === 0) {
        console.log("[AlmaFix] No active group package found for Alma — skipping credit top-up");
      } else {
        const pkg = pkgRes.rows[0];
        const currentRemaining = Number(pkg.remaining_credits);

        // Balance cap guard: only apply +1 if remaining_credits < 4 (target post-fix value).
        // Prevents over-crediting if data was partially repaired outside this function.
        if (currentRemaining >= 4) {
          console.log(`[AlmaFix] Package already at ${currentRemaining} credits (>= 4) — skipping credit top-up`);
        } else {
          const newRemaining = currentRemaining + 1;
          const client = await pool.connect();
          try {
            await client.query("BEGIN");

            await client.query(
              `UPDATE packages SET remaining_credits = $1 WHERE id = $2`,
              [newRemaining, pkg.id]
            );

            // Transactionally insert the idempotency marker alongside the balance update
            await client.query(
              `INSERT INTO credit_transactions
                 (id, player_id, academy_id, package_id, type, credit_type, amount, reason, balance_before, balance_after, metadata)
               VALUES
                 (gen_random_uuid(), $1, $2, $3, 'credit', 'group', 1, 'session_removal_refund', $4, $5, $6)`,
              [
                playerId,
                pkg.academy_id,
                pkg.id,
                currentRemaining,
                newRemaining,
                JSON.stringify({ refundedBy: "holiday_debt_fix", reason: "manual_correction_alma_zalesski" }),
              ]
            );

            await client.query("COMMIT");
            console.log(`[AlmaFix] Refunded 1 group credit to package ${pkg.id} | ${currentRemaining} -> ${newRemaining}`);
          } catch (creditErr) {
            await client.query("ROLLBACK");
            console.error("[AlmaFix] Failed to add credit:", creditErr);
          } finally {
            client.release();
          }
        }
      }
    }

    // One-shot debt cancellation for Alma's historical group debts.
    // Idempotency: skip if any debt was already cancelled with our reason tag.
    // Scope: only debts created before 2026-04-01 (the fix deployment window) to
    //         ensure future legitimate group debts are never auto-cancelled.
    const debtAlreadyCancelled = await pool.query(
      `SELECT id FROM credit_transactions
       WHERE player_id = $1
         AND credit_type = 'group'
         AND COALESCE(metadata->>'cancelReason', '') = 'manual_correction_alma_zalesski'
       LIMIT 1`,
      [playerId]
    );

    if (debtAlreadyCancelled.rows.length > 0) {
      console.log("[AlmaFix] Debt cancellation already applied — skipping");
    } else {
      const cancelRes = await pool.query(
        `UPDATE credit_transactions
         SET metadata = jsonb_set(COALESCE(metadata, '{}')::jsonb, '{cancelled}', 'true')
           || jsonb_build_object('cancelledAt', $2::text, 'cancelReason', 'manual_correction_alma_zalesski')
         WHERE player_id = $1
           AND type = 'debit'
           AND credit_type = 'group'
           AND reason IN ('session_debt', 'session_join_debt', 'session_unpaid')
           AND COALESCE(metadata->>'isDebt', 'false') = 'true'
           AND COALESCE(metadata->>'settled', 'false') != 'true'
           AND COALESCE(metadata->>'cancelled', 'false') != 'true'
           AND created_at < '2026-04-01T00:00:00Z'::timestamptz`,
        [playerId, new Date().toISOString()]
      );
      const cancelledCount = cancelRes.rowCount ?? 0;
      if (cancelledCount > 0) {
        console.log(`[AlmaFix] Cancelled ${cancelledCount} historical group debt transaction(s) for Alma`);
      } else {
        console.log("[AlmaFix] No historical group debts to cancel");
      }
    }

    console.log("[AlmaFix] Done");
  } catch (err) {
    console.error("[AlmaFix] Error:", err);
  }
}

/**
 * One-time targeted repair for Task #390: Rouzbeh Fazlinejad ghost private credit.
 * His active private package (player ID: 2c6f6347-0978-45d3-9fbe-fe17ff6466fb) has
 * remaining_credits=4 but the correct value is 3 — one ghost credit was added when
 * refundCreditsForSession incorrectly restored a package credit after a session
 * cancellation despite the player having attended (via the settled debt path).
 *
 * Idempotency: a sentinel credit_transactions record with reason='ghost_credit_correction'
 * and metadata.task='390_rouzbeh_private_ghost' is inserted on correction. On subsequent
 * boots, if the sentinel exists, the repair is skipped entirely. This ensures the correction
 * runs exactly once regardless of remaining_credits value, preventing interference with
 * legitimate future package usage.
 */
export async function fixRouzbehGhostCredit(): Promise<void> {
  const PLAYER_ID = '2c6f6347-0978-45d3-9fbe-fe17ff6466fb';
  const SENTINEL_TASK = '390_rouzbeh_private_ghost';

  try {
    const sentinelRes = await pool.query(
      `SELECT id FROM credit_transactions
       WHERE player_id = $1
         AND reason = 'ghost_credit_correction'
         AND metadata->>'task' = $2
       LIMIT 1`,
      [PLAYER_ID, SENTINEL_TASK]
    );
    if (sentinelRes.rows.length > 0) {
      console.log("[RouzbehCreditFix] Correction already applied — skipping");
      return;
    }

    const pkgRes = await pool.query(
      `SELECT id, remaining_credits, total_credits, academy_id
       FROM packages
       WHERE player_id = $1 AND credit_type = 'private' AND status = 'active'
       ORDER BY remaining_credits DESC
       LIMIT 1`,
      [PLAYER_ID]
    );

    if (pkgRes.rows.length === 0) {
      console.log("[RouzbehCreditFix] No active private package found — skipping");
      return;
    }

    const pkg = pkgRes.rows[0] as {
      id: string;
      remaining_credits: string;
      total_credits: string;
      academy_id: string;
    };
    const currentRemaining = Number(pkg.remaining_credits);

    // Guard: only apply if remaining is demonstrably inflated (>= 4).
    // The ghost credit inflated the package from the correct value of 3 to 4.
    // If remaining is already <= 3, a prior correction may have run without leaving
    // a sentinel — skip to avoid over-deducting legitimate credits.
    if (currentRemaining < 4) {
      console.log(`[RouzbehCreditFix] Package ${pkg.id} remaining ${currentRemaining} is already <= 3; inserting sentinel and skipping deduction`);
      const sentinelMeta = JSON.stringify({
        task: SENTINEL_TASK,
        correctedAt: new Date().toISOString(),
        originalRemaining: currentRemaining,
        skipped: true,
      });
      await pool.query(
        `INSERT INTO credit_transactions
           (id, player_id, type, amount, credit_type, reason, package_id, academy_id, metadata, created_at)
         VALUES
           (gen_random_uuid(), $1, 'debit', 0, 'private', 'ghost_credit_correction', $2, $3,
            $4::jsonb,
            NOW())`,
        [PLAYER_ID, pkg.id, pkg.academy_id, sentinelMeta]
      );
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Deduct the ghost credit from the package
      await client.query(
        `UPDATE packages SET remaining_credits = remaining_credits - 1 WHERE id = $1`,
        [pkg.id]
      );

      // Insert sentinel to mark this correction as applied (idempotency for future boots)
      const sentinelMeta = JSON.stringify({
        task: SENTINEL_TASK,
        correctedAt: new Date().toISOString(),
        originalRemaining: currentRemaining,
      });
      await client.query(
        `INSERT INTO credit_transactions
           (id, player_id, type, amount, credit_type, reason, package_id, academy_id, metadata, created_at)
         VALUES
           (gen_random_uuid(), $1, 'debit', -1, 'private', 'ghost_credit_correction', $2, $3,
            $4::jsonb,
            NOW())`,
        [PLAYER_ID, pkg.id, pkg.academy_id, sentinelMeta]
      );

      await client.query("COMMIT");
      console.log(`[RouzbehCreditFix] Corrected ghost credit on package ${pkg.id}: ${currentRemaining} -> ${currentRemaining - 1}`);
    } catch (txErr: unknown) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    console.error("[RouzbehCreditFix] Error:", err instanceof Error ? err.message : String(err));
  }
}

export function startReminderScheduler(): void {
  if (reminderInterval) {
    console.log("[SessionReminders] Scheduler already running");
    return;
  }

  console.log("[SessionReminders] Starting reminder scheduler (every 5 minutes)");
  
  catchUpMissedReminders().catch(console.error);
  (async () => {
    try {
      await processScheduledReminders();
      await processAutoCompleteSession();
      await processAutoAttendance();
      await processExpiredWaitlistSpots();
    } catch (e) { console.error("[Scheduler] Startup sequence error:", e); }
  })();
  repairMissingSessionPlayers().catch(console.error);
  cleanupStaleSessionPlayers().catch(console.error);

  reminderInterval = setInterval(async () => {
    try {
      await processScheduledReminders();
      await processAutoCompleteSession();
      await processAutoAttendance();
      await processExpiredWaitlistSpots();
      await processDepartureAlerts();
      await processPostSessionReflectionReminders();
      await processSessionAiBriefs();
    } catch (e) { console.error("[Scheduler] Interval error:", e); }
  }, 5 * 60 * 1000);
}

async function processSessionAiBriefs(): Promise<void> {
  const now = new Date();
  // Window: sessions starting in 25–35 minutes from now
  const windowStart = new Date(now.getTime() + 25 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 35 * 60 * 1000);

  try {
    const { sessionAiBriefs } = await import("@shared/schema");
    const { generateSessionBrief } = await import("./services/ai-progress-engine");

    const nowUtc = now.toISOString();
    const startUtc = windowStart.toISOString();
    const endUtc = windowEnd.toISOString();

    const rawResult = await pool.query(
      `SELECT s.id, s.coach_id, s.session_type, s.start_time
       FROM sessions s
       WHERE (s.start_time AT TIME ZONE 'UTC') >= $1::timestamptz
         AND (s.start_time AT TIME ZONE 'UTC') <= $2::timestamptz
         AND s.status = 'scheduled'
         AND s.coach_id IS NOT NULL`,
      [startUtc, endUtc]
    );

    const upcomingSessions = rawResult.rows;
    if (upcomingSessions.length === 0) return;

    console.log(`[SessionBrief] Found ${upcomingSessions.length} sessions in 25-35 min window`);

    for (const raw of upcomingSessions) {
      const sessionId = raw.id;
      const coachId = raw.coach_id;

      // Check if brief already exists
      const existing = await db
        .select({ id: sessionAiBriefs.id })
        .from(sessionAiBriefs)
        .where(eq(sessionAiBriefs.sessionId, sessionId))
        .limit(1);

      if (existing.length > 0) {
        console.log(`[SessionBrief] Brief already exists for session ${sessionId}, skipping`);
        continue;
      }

      console.log(`[SessionBrief] Generating brief for session ${sessionId}`);

      const result = await generateSessionBrief(sessionId);
      if (!result) {
        console.log(`[SessionBrief] No brief generated for session ${sessionId} (no players or data)`);
        continue;
      }

      await db.insert(sessionAiBriefs).values({
        sessionId,
        coachId,
        briefText: result.briefText,
        playerSummaries: result.playerSummaries,
      }).onConflictDoNothing();

      console.log(`[SessionBrief] Brief stored for session ${sessionId}`);

      // Send push notification to coach
      const sessionTime = new Date(raw.start_time);
      const timeStr = sessionTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      const tokens = await getCoachPushTokens(coachId);
      if (tokens.length > 0) {
        await sendPushNotification(
          tokens,
          "Pre-Session Brief Ready",
          `Your ${timeStr} session brief is ready. Tap to review player insights.`,
          { type: "session_brief_ready", sessionId, coachId }
        );
      }

      // Store in-app coach notification
      try {
        await db.insert(coachNotifications).values({
          coachId,
          type: "session_brief",
          title: "Pre-Session Brief Ready",
          message: `Your ${timeStr} session brief is ready. Tap to review player insights.`,
          priority: "high",
          metadata: { sessionId },
        });
      } catch (err) {
        console.error("[SessionBrief] Failed to create in-app notification:", err);
      }
    }
  } catch (error) {
    console.error("[SessionBrief] Error processing session AI briefs:", error);
  }
}

export function stopReminderScheduler(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log("[SessionReminders] Scheduler stopped");
  }
}

// ==================== ADDITIONAL NOTIFICATION TYPES ====================

export async function sendSessionConfirmedNotification(
  playerId: string,
  sessionType: string,
  startTime: Date | string,
  coachName: string,
  academyId?: string | null
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  const timezone = await getAcademyTimezone(academyId);
  const { date, time } = formatSessionDateTime(startTime, timezone);
  const typeLabel = formatSessionType(sessionType);

  await sendPushNotification(
    tokens,
    "Session Confirmed",
    `Your ${typeLabel} session with ${coachName} is booked for ${date} at ${time}.`,
    { type: "session_confirmed", playerId, screen: "Schedule" },
    playerId
  );
}

export async function sendSessionCancelledNotification(
  playerId: string,
  sessionType: string,
  startTime: Date | string,
  reason?: string,
  academyId?: string | null
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  const timezone = await getAcademyTimezone(academyId);
  const { date, time } = formatSessionDateTime(startTime, timezone);
  const typeLabel = formatSessionType(sessionType);

  const body = reason 
    ? `Your ${typeLabel} session on ${date} at ${time} has been cancelled. Reason: ${reason}`
    : `Your ${typeLabel} session on ${date} at ${time} has been cancelled.`;

  await sendPushNotification(
    tokens,
    "Session Cancelled",
    body,
    { type: "session_cancelled", playerId, screen: "Schedule" },
    playerId
  );
}

// New session available - when coach opens new slots
export async function sendNewSessionAvailableNotification(
  playerId: string,
  coachName: string,
  sessionType: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "New Session Available",
    `${coachName} has opened new ${sessionType} slots. Book now!`,
    { type: "new_session_available", playerId, screen: "LessonBooking" }
  );
}

export async function sendBookingRequestNotification(
  coachId: string,
  playerName: string,
  sessionType: string,
  requestedDate: Date | string,
  academyId?: string | null
): Promise<void> {
  const tokens = await getCoachPushTokens(coachId);
  if (tokens.length === 0) return;

  const timezone = await getAcademyTimezone(academyId);
  const { date, time } = formatSessionDateTime(requestedDate, timezone);
  const typeLabel = formatSessionType(sessionType);

  await sendPushNotification(
    tokens,
    "New Booking Request",
    `${playerName} has requested a ${typeLabel} session on ${date} at ${time}.`,
    { type: "booking_request", coachId, screen: "Calendar" }
  );
}

// New message notification
export async function sendNewMessageNotification(
  playerId: string,
  senderName: string,
  messagePreview: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    senderName,
    messagePreview.substring(0, 100),
    { type: "new_message", playerId, screen: "PlayerMessages" }
  );
}

// Squad invite notification
export async function sendSquadInviteNotification(
  playerId: string,
  squadName: string,
  inviterName: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "Squad Invite",
    `${inviterName} invited you to join "${squadName}"`,
    { type: "squad_invite", playerId, screen: "Groups" }
  );
}

// Friend request notification
export async function sendFriendRequestNotification(
  playerId: string,
  requesterName: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "Friend Request",
    `${requesterName} wants to connect with you`,
    { type: "friend_request", playerId, screen: "FriendsList" }
  );
}

// Match result posted notification
export async function sendMatchResultNotification(
  playerId: string,
  opponentName: string,
  result: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "Match Result Posted",
    `Match vs ${opponentName}: ${result}`,
    { type: "match_result", playerId, screen: "Progress" }
  );
}

// Streak alert notification
export async function sendStreakAlertNotification(
  playerId: string,
  currentStreak: number
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "Don't Break Your Streak!",
    `You have a ${currentStreak}-day streak. Log in today to keep it going!`,
    { type: "streak_alert", playerId, screen: "PlayerHome" }
  );
}

// Glow rank update notification
export async function sendGlowRankUpdateNotification(
  playerId: string,
  newRank: number,
  change: number
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  const direction = change > 0 ? "up" : "down";
  const emoji = change > 0 ? "+" : "";

  await sendPushNotification(
    tokens,
    "Glow Rank Updated",
    `You moved ${direction} to rank #${newRank} (${emoji}${change})`,
    { type: "glow_rank_update", playerId, screen: "GlowLeaderboard" }
  );
}

// Credits low notification
export async function sendCreditsLowNotification(
  playerId: string,
  creditType: string,
  remainingCredits: number
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "Credits Running Low",
    `You have ${remainingCredits} ${creditType} credits left. Top up to keep training!`,
    { type: "credits_low", playerId, screen: "ParentCreditStore" }
  );
}

// Credits expiring notification
export async function sendCreditsExpiringNotification(
  playerId: string,
  creditType: string,
  expiringCredits: number,
  daysUntilExpiry: number
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "Credits Expiring Soon",
    `${expiringCredits} ${creditType} credits expire in ${daysUntilExpiry} days. Use them before they're gone!`,
    { type: "credits_expiring", playerId, screen: "ParentCreditStore" }
  );
}

// Payment received notification
export async function sendPaymentReceivedNotification(
  playerId: string,
  amount: string,
  packageName: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "Payment Received",
    `Thank you! ${packageName} (${amount}) has been added to your account.`,
    { type: "payment_received", playerId, screen: "ParentCreditStore" }
  );
}

// Weekly progress summary notification
export async function sendWeeklyProgressNotification(
  playerId: string,
  sessionsAttended: number,
  xpEarned: number
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "Your Weekly Tennis Recap",
    `This week: ${sessionsAttended} sessions, +${xpEarned} XP earned. Keep up the great work!`,
    { type: "weekly_progress", playerId, screen: "Progress" }
  );
}

// Comeback reminder notification
export async function sendComebackReminderNotification(
  playerId: string,
  daysSinceLastSession: number
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "We Miss You!",
    `It's been ${daysSinceLastSession} days since your last session. Ready to get back on the court?`,
    { type: "comeback_reminder", playerId, screen: "LessonBooking" }
  );
}

// ==================== DAILY TENNIS TIP ====================

const TENNIS_TIPS = [
  "Focus on your footwork today. Small steps lead to big improvements!",
  "Keep your eye on the ball until contact - it's the secret to consistency.",
  "Practice your serve toss 10 times before your next match. Consistency starts here!",
  "Remember: Tennis is 80% mental. Stay positive on court!",
  "Tip: Follow through completely on every shot for more power and control.",
  "Work on your split step today - it's the foundation of great movement.",
  "Hit through the ball, not at it. Think extension, not contact.",
  "Breathe! Exhale on contact for more relaxed, powerful shots.",
  "Practice your return of serve - it's the most underrated shot in tennis.",
  "Stay low and bend your knees. Power comes from the ground up!",
  "Focus on placement over power today. Accuracy wins matches!",
  "Try the 21-ball drill: Rally 21 balls without an error to build consistency.",
  "Hit with topspin for margin over the net. Safety first!",
  "Visualize your shots before you hit them. Mental rehearsal works!",
  "Practice your volleys close to the net first, then move back gradually.",
  "Always recover to the center after each shot. Good habits win games.",
  "Watch the ball's spin as it approaches - it tells you what's coming.",
  "Keep your head still through contact for cleaner hits.",
  "Target the corners in practice, but play percentages in matches.",
  "Warm up properly before every session - injury prevention is key!",
  "Work on your second serve today. A reliable second serve = confidence.",
  "Practice changing direction under pressure - it's a game-changer.",
  "Focus on the first 4 shots of each point - they determine most outcomes.",
  "Hit your forehand with an open stance for more hip rotation.",
  "Remember: The best players are the best movers. Footwork first!",
  "Try the 50-50 drill: 50 forehands, 50 backhands without missing.",
  "Practice serving at 70% power for accuracy before adding speed.",
  "Stay calm on break points - both ways. Pressure is a privilege!",
  "Hit high over the net on clay, lower on hard courts. Adapt your game!",
  "End every practice with something fun. Love the game!",
];

export async function sendDailyTennisTip(playerId: string): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  // Pick a random tip based on the day
  const tipIndex = new Date().getDate() % TENNIS_TIPS.length;
  const tip = TENNIS_TIPS[tipIndex];

  await sendPushNotification(
    tokens,
    "Daily Tennis Tip",
    tip,
    { type: "daily_tip", playerId, screen: "PlayerHome" }
  );
}

// Send daily tips to all active players
export async function processDailyTipsScheduler(): Promise<void> {
  try {
    // Get all players who have been active in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activePlayers = await db
      .select({ id: players.id })
      .from(players)
      .where(gte(players.lastActive, thirtyDaysAgo));

    console.log(`[DailyTips] Sending tips to ${activePlayers.length} active players`);

    for (const player of activePlayers) {
      await sendDailyTennisTip(player.id);
    }

    console.log(`[DailyTips] Completed sending daily tips`);
  } catch (error) {
    console.error("[DailyTips] Error processing daily tips:", error);
  }
}

// Schedule daily tips at 8 AM Dubai time
let dailyTipInterval: ReturnType<typeof setInterval> | null = null;

export function startDailyTipScheduler(): void {
  if (dailyTipInterval) {
    console.log("[DailyTips] Scheduler already running");
    return;
  }

  console.log("[DailyTips] Starting daily tip scheduler");

  // Check every hour if it's 8 AM Dubai time
  dailyTipInterval = setInterval(() => {
    const now = new Date();
    const dubaiHour = parseInt(now.toLocaleString("en-US", { hour: "2-digit", hour12: false, timeZone: "Asia/Dubai" }));
    
    // Send tips at 8 AM Dubai time
    if (dubaiHour === 8) {
      processDailyTipsScheduler().catch(console.error);
    }
  }, 60 * 60 * 1000); // Check every hour
}

export function stopDailyTipScheduler(): void {
  if (dailyTipInterval) {
    clearInterval(dailyTipInterval);
    dailyTipInterval = null;
    console.log("[DailyTips] Scheduler stopped");
  }
}

// ==================== AUTO SESSION COMPLETION SCHEDULER ====================
// Automatically marks sessions as completed and deducts credits when session endTime has passed

let autoSessionInterval: ReturnType<typeof setInterval> | null = null;

async function processAutoSessionCompletion(): Promise<void> {
  try {
    const { db } = await import("./db");
    const { sessions, sessionPlayers, players, packages } = await import("@shared/schema");
    const { eq, and, lt, isNull, inArray } = await import("drizzle-orm");
    const { storage } = await import("./storage");
    
    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const tenMinAgoStr = tenMinAgo.toISOString().replace("T", " ").substring(0, 19);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    console.log(`[AutoComplete] Running auto session completion check at ${now.toISOString()} (UTC), threshold: ${tenMinAgoStr}`);
    
    // NO 24-hour lower bound — process ALL past scheduled sessions regardless of age.
    const result = await pool.query(
      `SELECT id, session_type, academy_id, start_time, end_time
       FROM sessions
       WHERE end_time <= $1::timestamp
         AND status = 'scheduled'`,
      [tenMinAgoStr]
    );
    
    const incompleteSessions = result.rows.map((row: any) => ({
      id: row.id,
      sessionType: row.session_type,
      academyId: row.academy_id,
      startTime: new Date(row.start_time),
      endTime: new Date(row.end_time),
    }));
    
    if (incompleteSessions.length === 0) {
      console.log("[AutoComplete] No sessions to auto-complete");
      return;
    }
    
    console.log(`[AutoComplete] Found ${incompleteSessions.length} sessions to auto-complete`);
    
    let totalPlayersMarked = 0;
    let totalCreditsDeducted = 0;
    
    for (const session of incompleteSessions) {
      try {
        // Get all enrolled players for this session who haven't been marked yet
        const enrolledPlayers = await db.select({
          id: sessionPlayers.id,
          playerId: sessionPlayers.playerId,
          attendanceStatus: sessionPlayers.attendanceStatus,
          creditDeductedAt: sessionPlayers.creditDeductedAt,
        })
        .from(sessionPlayers)
        .where(eq(sessionPlayers.sessionId, session.id));
        
        // Mark each player as present and deduct credits (skip for sessions > 7 days old)
        const isOldSession = session.endTime < sevenDaysAgo;
        for (const sp of enrolledPlayers) {
          // Skip if already marked as present/absent or credit already deducted
          if (sp.attendanceStatus === "present" || sp.attendanceStatus === "absent" || sp.creditDeductedAt) {
            continue;
          }

          if (isOldSession) {
            // Sessions older than 7 days: leave attendance as NULL for coach review.
            // Do NOT auto-mark as present or process credits.
            console.log(`[AutoComplete] Session ${session.id} is older than 7 days — skipping auto-attendance for player ${sp.playerId}, needs coach review`);
            continue;
          }
          
          // Mark as present
          await db.update(sessionPlayers)
            .set({ 
              attendanceStatus: "present",
              attended: true,
            })
            .where(eq(sessionPlayers.id, sp.id));
          
          totalPlayersMarked++;
          
          // Deduct credits
          const creditResult = await storage.deductTypedCreditsForSession(
            sp.playerId,
            session.sessionType,
            session.id,
            session.academyId || undefined,
            sp.id
          );
          
          if (creditResult.success) {
            totalCreditsDeducted++;
            console.log(`[AutoComplete] Deducted credit for player ${sp.playerId} in session ${session.id}`);
          } else {
            // Record as debt when no credits available
            const { creditTransactions } = await import("@shared/schema");
            const debtId = `debt-auto-${session.id}-${sp.playerId}`;
            
            // Check if debt already recorded
            const existingDebt = await db.select().from(creditTransactions)
              .where(eq(creditTransactions.id, debtId))
              .limit(1);
            
            if (existingDebt.length === 0) {
              // Map session type to credit type
              const creditType = session.sessionType.includes("semi") ? "semi_private" : 
                                 session.sessionType.includes("group") ? "group" : 
                                 session.sessionType === "private_adjusted" ? "private" : "private";
              
              await db.insert(creditTransactions).values({
                id: debtId,
                playerId: sp.playerId,
                packageId: null,
                type: "debit",
                amount: -1,
                reason: "session_debt",
                creditType: creditType,
                sessionId: session.id,
                metadata: { 
                  isDebt: true, 
                  autoCompleted: true,
                  sessionType: session.sessionType,
                  reason: creditResult.reason 
                },
              });
              
              // Mark creditDeductedAt to prevent re-processing
              await db.update(sessionPlayers)
                .set({ creditDeductedAt: new Date() })
                .where(eq(sessionPlayers.id, sp.id));
              
              totalCreditsDeducted++;
              console.log(`[AutoComplete] Recorded debt for player ${sp.playerId} in session ${session.id}`);
            }
          }
        }
        
        // Mark session as completed
        await db.update(sessions)
          .set({ status: "completed" })
          .where(eq(sessions.id, session.id));
        
        console.log(`[AutoComplete] Completed session ${session.id} (${session.sessionType})`);
        
      } catch (sessionError) {
        console.error(`[AutoComplete] Error processing session ${session.id}:`, sessionError);
      }
    }
    
    console.log(`[AutoComplete] Finished: ${incompleteSessions.length} sessions completed, ${totalPlayersMarked} players marked, ${totalCreditsDeducted} credits deducted`);
    
  } catch (error) {
    console.error("[AutoComplete] Error in auto session completion:", error);
  }
}

export function startAutoSessionCompletionScheduler(): void {
  if (autoSessionInterval) {
    console.log("[AutoComplete] Scheduler already running");
    return;
  }

  console.log("[AutoComplete] Starting auto session completion scheduler (runs hourly)");
  
  // Run immediately on startup to catch any missed sessions
  setTimeout(() => {
    processAutoSessionCompletion().catch(console.error);
  }, 10000); // Wait 10 seconds after startup
  
  // Then run every hour at :05 past the hour
  autoSessionInterval = setInterval(() => {
    const now = new Date();
    const minutes = now.getMinutes();
    
    // Run at 5 minutes past each hour (to ensure sessions have fully ended)
    if (minutes >= 5 && minutes < 10) {
      processAutoSessionCompletion().catch(console.error);
    }
  }, 5 * 60 * 1000); // Check every 5 minutes, but only execute at :05-:09
}

export function stopAutoSessionCompletionScheduler(): void {
  if (autoSessionInterval) {
    clearInterval(autoSessionInterval);
    autoSessionInterval = null;
    console.log("[AutoComplete] Scheduler stopped");
  }
}

// ==================== MONTHLY REPORT SCHEDULER ====================
let monthlyReportInterval: ReturnType<typeof setInterval> | null = null;

async function processMonthlyReports(): Promise<void> {
  console.log("[MonthlyReports] Running monthly report check at", new Date().toISOString());
  
  try {
    const { players, users, playerCreditPackages } = await import("@shared/schema");
    
    // Get all active players with emails
    const activePlayers = await db
      .select({
        playerId: players.id,
        userId: players.userId,
        displayName: players.displayName,
        email: users.email,
      })
      .from(players)
      .innerJoin(users, eq(players.userId, users.id))
      .where(
        and(
          isNotNull(users.email),
          eq(players.isActive, true)
        )
      );
    
    console.log(`[MonthlyReports] Found ${activePlayers.length} active players with emails`);
    
    // Get the previous month
    const now = new Date();
    const previousMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const previousYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    
    let reportsSent = 0;
    let reportsSkipped = 0;
    
    for (const player of activePlayers) {
      try {
        // Make API call to send report
        const response = await fetch(`http://localhost:5000/api/player/${player.playerId}/monthly-report`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Use internal service auth header
            'X-Internal-Service': 'monthly-report-scheduler',
          },
          body: JSON.stringify({
            month: previousMonth,
            year: previousYear,
          }),
        });
        
        if (response.ok) {
          reportsSent++;
          console.log(`[MonthlyReports] Sent report to ${player.displayName}`);
        } else {
          reportsSkipped++;
          const error = await response.text();
          console.log(`[MonthlyReports] Skipped ${player.displayName}: ${error}`);
        }
      } catch (err) {
        reportsSkipped++;
        console.error(`[MonthlyReports] Error sending report:`, err);
      }
      
      // Add a small delay between emails to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`[MonthlyReports] Completed: ${reportsSent} sent, ${reportsSkipped} skipped`);

    // ---- Parent Progress Letters ----
    await processParentProgressLetters();

  } catch (error) {
    console.error("[MonthlyReports] Error processing monthly reports:", error);
  }
}

async function processParentProgressLetters(): Promise<void> {
  console.log("[ParentLetters] Starting parent letter generation...");
  try {
    const { players } = await import("@shared/schema");
    const { isNotNull } = await import("drizzle-orm");

    const now = new Date();
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthLabel = prevMonthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // Find eligible junior players: age < 18, parentReporting = true, parentEmail set
    const eligiblePlayers = await db
      .select({
        id: players.id,
        name: players.name,
        age: players.age,
        parentEmail: players.parentEmail,
      })
      .from(players)
      .where(
        and(
          eq(players.parentReporting, true),
          isNotNull(players.parentEmail),
          lt(players.age, 18)
        )
      );

    console.log(`[ParentLetters] Found ${eligiblePlayers.length} eligible junior players`);

    const { generateParentProgressLetter } = await import("./services/ai-progress-engine");
    const { sendEmail } = await import("./emailService");

    let lettersSent = 0;
    let lettersSkipped = 0;

    for (const player of eligiblePlayers) {
      if (!player.parentEmail) {
        lettersSkipped++;
        continue;
      }
      try {
        const letter = await generateParentProgressLetter(player.id, prevMonthLabel);
        if (!letter) {
          lettersSkipped++;
          console.log(`[ParentLetters] Skipped ${player.name}: no letter generated`);
          continue;
        }

        const firstName = player.name.split(" ")[0];
        const subject = `${firstName}'s Tennis Progress — ${prevMonthLabel}`;

        const paragraphs = letter
          .split(/\n\n+/)
          .filter(Boolean)
          .map((p: string) => `<p style="color:#cccccc;line-height:1.7;margin-bottom:16px;">${p.replace(/\n/g, "<br>")}</p>`)
          .join("");

        const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 16px; padding: 40px; }
    .header { text-align: center; margin-bottom: 32px; border-bottom: 1px solid #333; padding-bottom: 24px; }
    .header h1 { color: #2ECC40; margin: 0 0 8px; font-size: 24px; }
    .header p { color: #666; margin: 0; font-size: 14px; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #333; text-align: center; color: #555; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Glow Up Sports</h1>
      <p>${firstName}'s Monthly Progress Update &mdash; ${prevMonthLabel}</p>
    </div>
    ${paragraphs}
    <div class="footer">
      <p>This letter was generated by the Glow Up Sports coaching platform.</p>
    </div>
  </div>
</body>
</html>`;

        const result = await sendEmail({
          to: player.parentEmail,
          subject,
          html,
          text: letter,
        });

        if (result.success) {
          lettersSent++;
          console.log(`[ParentLetters] Sent letter for ${player.name}`);
        } else {
          lettersSkipped++;
          console.error(`[ParentLetters] Failed to send for ${player.name}: ${result.error}`);
        }
      } catch (err) {
        lettersSkipped++;
        console.error(`[ParentLetters] Error processing ${player.name}:`, err);
      }

      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[ParentLetters] Completed: ${lettersSent} sent, ${lettersSkipped} skipped`);
  } catch (error) {
    console.error("[ParentLetters] Error processing parent letters:", error);
  }
}

export function startMonthlyReportScheduler(): void {
  if (monthlyReportInterval) {
    console.log("[MonthlyReports] Scheduler already running");
    return;
  }

  console.log("[MonthlyReports] Starting monthly report scheduler (runs on 1st of each month)");
  
  // Check every hour if it's the 1st of the month
  monthlyReportInterval = setInterval(() => {
    const now = new Date();
    const day = now.getDate();
    const hour = now.getHours();
    
    // Run on the 1st of each month at 9 AM (local time)
    if (day === 1 && hour === 9) {
      processMonthlyReports().catch(console.error);
    }
  }, 60 * 60 * 1000); // Check every hour
}

export function stopMonthlyReportScheduler(): void {
  if (monthlyReportInterval) {
    clearInterval(monthlyReportInterval);
    monthlyReportInterval = null;
    console.log("[MonthlyReports] Scheduler stopped");
  }
}

// Export for manual triggering
export { processMonthlyReports };

// ==================== ONBOARDING EMAIL SEQUENCE ====================

let onboardingEmailInterval: ReturnType<typeof setInterval> | null = null;

const onboardingEmailsSent = new Set<string>();

async function processOnboardingEmails(): Promise<void> {
  try {
    const now = new Date();

    const allUsers = await db.select({
      id: users.id,
      email: users.email,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
    }).from(users);

    let day3Count = 0;
    let day7Count = 0;

    for (const user of allUsers) {
      if (!user.email || !user.createdAt) continue;

      const createdAt = new Date(user.createdAt);
      const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);

      const day3Key = `day3_${user.id}`;
      if (!onboardingEmailsSent.has(day3Key) && daysSinceCreation >= 3 && daysSinceCreation < 5) {
        try {
          const result = await sendOnboardingDay3Email({
            to: user.email,
            userName: user.username || 'there',
            role: user.role || 'player',
          });
          if (result.success) {
            onboardingEmailsSent.add(day3Key);
            day3Count++;
          }
        } catch (err) {
          console.error(`[OnboardingEmails] Day 3 email failed for ${user.email}:`, err);
        }
      }

      const day7Key = `day7_${user.id}`;
      if (!onboardingEmailsSent.has(day7Key) && daysSinceCreation >= 7 && daysSinceCreation < 9) {
        try {
          const result = await sendOnboardingDay7Email({
            to: user.email,
            userName: user.username || 'there',
            role: user.role || 'player',
          });
          if (result.success) {
            onboardingEmailsSent.add(day7Key);
            day7Count++;
          }
        } catch (err) {
          console.error(`[OnboardingEmails] Day 7 email failed for ${user.email}:`, err);
        }
      }
    }

    if (day3Count > 0 || day7Count > 0) {
      console.log(`[OnboardingEmails] Sent ${day3Count} day-3 emails, ${day7Count} day-7 emails`);
    }
  } catch (error) {
    console.error("[OnboardingEmails] Scheduler error:", error);
  }
}

export function startOnboardingEmailScheduler(): void {
  console.log("[OnboardingEmails] Starting onboarding email scheduler (runs every 6 hours)");

  setTimeout(() => {
    processOnboardingEmails().catch(console.error);
  }, 60 * 1000);

  onboardingEmailInterval = setInterval(() => {
    processOnboardingEmails().catch(console.error);
  }, 6 * 60 * 60 * 1000);
}

export function stopOnboardingEmailScheduler(): void {
  if (onboardingEmailInterval) {
    clearInterval(onboardingEmailInterval);
    onboardingEmailInterval = null;
    console.log("[OnboardingEmails] Scheduler stopped");
  }
}

// ==================== DAILY SCHEDULE NOTIFICATION ====================

let dailyScheduleInterval: ReturnType<typeof setInterval> | null = null;
const dailyScheduleSentToday = new Set<string>();

async function processDailyScheduleNotifications(): Promise<void> {
  try {
    const coachRows = await pool.query(`
      SELECT c.id as coach_id, a.id as academy_id, a.timezone
      FROM coaches c
      JOIN academies a ON c.academy_id = a.id
    `);

    for (const coach of coachRows.rows) {
      const tz = coach.timezone || "UTC";
      const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
      const localHour = localNow.getHours();
      const localMinute = localNow.getMinutes();

      if (localHour < 7 || localHour >= 12) continue;

      const todayStr = localNow.toISOString().split("T")[0];
      const todayKey = `${coach.coach_id}-${todayStr}`;
      if (dailyScheduleSentToday.has(todayKey)) continue;

      const alreadySent = await pool.query(
        `SELECT id FROM coach_notifications 
         WHERE coach_id = $1 AND type = 'session_reminder' AND title LIKE '%Today%'
         AND created_at >= $2::date AND created_at < ($2::date + interval '1 day')`,
        [coach.coach_id, todayStr]
      );
      if (alreadySent.rows.length > 0) {
        dailyScheduleSentToday.add(todayKey);
        continue;
      }

      const todayStart = new Date(localNow);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(localNow);
      todayEnd.setHours(23, 59, 59, 999);

      const sessionsResult = await pool.query(`
        SELECT s.id, s.session_type, s.start_time,
               (SELECT COUNT(*) FROM session_players sp WHERE sp.session_id = s.id) as player_count
        FROM sessions s
        WHERE s.coach_id = $1
          AND s.status = 'scheduled'
          AND s.start_time AT TIME ZONE 'UTC' AT TIME ZONE $2 >= $3::date
          AND s.start_time AT TIME ZONE 'UTC' AT TIME ZONE $2 < ($3::date + interval '1 day')
        ORDER BY s.start_time ASC
      `, [coach.coach_id, tz, todayStart.toISOString().split("T")[0]]);

      const sessionsList = sessionsResult.rows;
      const tokens = await getCoachPushTokens(coach.coach_id);

      let title: string;
      let body: string;

      if (sessionsList.length === 0) {
        title = "No Sessions Today";
        body = "No sessions scheduled today — enjoy your day off!";
      } else {
        title = `${sessionsList.length} Session${sessionsList.length > 1 ? "s" : ""} Today`;
        const summaries = sessionsList.slice(0, 3).map((s: any) => {
          const startTime = new Date(s.start_time);
          const timeStr = startTime.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: tz,
          });
          const typeLabel = formatSessionType(s.session_type);
          return `${timeStr} ${typeLabel}`;
        });
        const extra = sessionsList.length > 3 ? ` +${sessionsList.length - 3} more` : "";
        body = summaries.join(", ") + extra;
      }

      if (tokens.length > 0) {
        await sendPushNotification(tokens, title, body, { type: "daily_schedule", coachId: coach.coach_id });
      }

      try {
        await db.insert(coachNotifications).values({
          coachId: coach.coach_id,
          type: "session_reminder",
          title,
          message: body,
          priority: "medium",
        });
      } catch (err) {
        console.error(`[DailySchedule] Failed to create in-app notification for ${coach.coach_id}:`, err);
      }

      dailyScheduleSentToday.add(todayKey);
      console.log(`[DailySchedule] Sent daily summary to coach ${coach.coach_id}: ${title} - ${body}`);
    }

    const today = new Date().toISOString().split("T")[0];
    for (const key of dailyScheduleSentToday) {
      if (!key.endsWith(today)) {
        dailyScheduleSentToday.delete(key);
      }
    }
  } catch (error) {
    console.error("[DailySchedule] Error processing daily schedule notifications:", error);
  }
}

export function startDailyScheduleNotifier(): void {
  console.log("[DailySchedule] Starting daily schedule notifier (checks every 5 minutes)");
  processDailyScheduleNotifications().catch(console.error);
  dailyScheduleInterval = setInterval(() => {
    processDailyScheduleNotifications().catch(console.error);
  }, 5 * 60 * 1000);
}

export function stopDailyScheduleNotifier(): void {
  if (dailyScheduleInterval) {
    clearInterval(dailyScheduleInterval);
    dailyScheduleInterval = null;
    console.log("[DailySchedule] Notifier stopped");
  }
}

export async function sendLowCreditNotificationsAfterSession(
  playerIds: string[],
  sessionType: string,
  academyId?: string | null
): Promise<void> {
  if (playerIds.length === 0) return;

  try {
    const { packages: packagesTable, parentPlayerRelations } = await import("@shared/schema");

    const creditType = sessionType === "private" || sessionType === "private_adjusted"
      ? "private"
      : sessionType === "semi_private"
        ? "semi_private"
        : "group";

    const creditTypeLabel = creditType === "private"
      ? "private"
      : creditType === "semi_private"
        ? "semi-private"
        : "group";

    for (const playerId of playerIds) {
      try {
        const conditions = [
          eq(packagesTable.playerId, playerId),
          eq(packagesTable.status, "active"),
          eq(packagesTable.creditType, creditType),
        ];
        if (academyId) {
          conditions.push(eq(packagesTable.academyId, academyId));
        }

        const activePackages = await db
          .select({
            remainingCredits: packagesTable.remainingCredits,
            expiryDate: packagesTable.expiryDate,
          })
          .from(packagesTable)
          .where(and(...conditions));

        const totalRemaining = activePackages.reduce(
          (sum, pkg) => sum + (pkg.remainingCredits || 0),
          0
        );

        if (totalRemaining > 2) continue;

        const playerTokens = await getPlayerPushTokens(playerId);

        const parentTokens: string[] = [];
        try {
          const parentRelations = await db
            .select({ parentUserId: parentPlayerRelations.parentUserId })
            .from(parentPlayerRelations)
            .where(
              and(
                eq(parentPlayerRelations.playerId, playerId),
                eq(parentPlayerRelations.canReceiveNotifications, true)
              )
            );

          for (const rel of parentRelations) {
            const tokens = await getUserPushTokens(rel.parentUserId);
            parentTokens.push(...tokens);
          }
        } catch (parentErr) {
          console.error(`[LowCredit] Error getting parent tokens for player ${playerId}:`, parentErr);
        }

        const allTokens = [...new Set([...playerTokens, ...parentTokens])];
        if (allTokens.length === 0) continue;

        let title: string;
        let body: string;

        if (totalRemaining <= 0) {
          title = "Out of Credits";
          body = `You're out of ${creditTypeLabel} credits! Buy a new package to continue training.`;
        } else {
          title = "Credits Running Low";
          body = `You have ${totalRemaining} ${creditTypeLabel} credit${totalRemaining === 1 ? "" : "s"} remaining. Top up to keep booking sessions!`;
        }

        await sendPushNotification(
          allTokens,
          title,
          body,
          { type: "credits_low", playerId, screen: "ParentCreditStore", creditType, remainingCredits: totalRemaining },
          playerId
        );

        console.log(`[LowCredit] Sent low credit notification for player ${playerId}: ${totalRemaining} ${creditTypeLabel} credits remaining`);
      } catch (playerErr) {
        console.error(`[LowCredit] Error processing player ${playerId}:`, playerErr);
      }
    }
  } catch (error) {
    console.error("[LowCredit] Error sending low credit notifications:", error);
  }
}

// ==================== CREDIT EXPIRY REMINDER (7-DAY WARNING) ====================

let creditExpiryInterval: ReturnType<typeof setInterval> | null = null;
const creditExpiryRemindedToday = new Set<string>();

async function processCreditExpiryReminders(timezone: string): Promise<void> {
  try {
    const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
    const todayStr = localNow.toISOString().split("T")[0];
    const sevenDaysFromNow = new Date(localNow.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sevenDaysStr = sevenDaysFromNow.toISOString().split("T")[0];

    const expiringPackages = await pool.query(`
      SELECT p.id, p.player_id, p.credit_type, p.remaining_credits, p.expiry_date, p.academy_id
      FROM packages p
      JOIN academies a ON p.academy_id = a.id
      WHERE p.status = 'active'
        AND p.remaining_credits > 0
        AND p.expiry_date IS NOT NULL
        AND p.expiry_date > $1
        AND p.expiry_date <= $2
        AND a.timezone = $3
    `, [todayStr, sevenDaysStr, timezone]);

    if (expiringPackages.rows.length === 0) {
      console.log("[CreditExpiry] No packages expiring in the next 7 days");
      return;
    }

    console.log(`[CreditExpiry] Found ${expiringPackages.rows.length} packages expiring within 7 days`);

    let notificationsSent = 0;

    for (const pkg of expiringPackages.rows) {
      const reminderKey = `${pkg.id}-${todayStr}`;
      if (creditExpiryRemindedToday.has(reminderKey)) continue;

      const playerId = pkg.player_id;
      if (!playerId) continue;

      const expiryDate = new Date(pkg.expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const creditType = pkg.credit_type || "group";
      const remaining = pkg.remaining_credits;

      const formattedDate = expiryDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      const typeLabel = creditType === "semi_private" ? "Semi-Private" :
                        creditType.charAt(0).toUpperCase() + creditType.slice(1);

      await sendCreditsExpiringNotification(playerId, typeLabel, remaining, daysUntilExpiry);

      try {
        const parentRows = await pool.query(`
          SELECT ppr.parent_user_id
          FROM parent_player_relations ppr
          WHERE ppr.player_id = $1
        `, [playerId]);

        for (const parent of parentRows.rows) {
          const parentTokens = await getUserPushTokens(parent.parent_user_id);
          if (parentTokens.length > 0) {
            const playerRow = await pool.query(`SELECT name, display_name FROM players WHERE id = $1 LIMIT 1`, [playerId]);
            const playerName = playerRow.rows[0]?.display_name || playerRow.rows[0]?.name || "Your child";

            await sendPushNotification(
              parentTokens,
              "Credits Expiring Soon",
              `${playerName}'s ${typeLabel} credits (${remaining} remaining) expire on ${formattedDate}. Use them or buy a new package!`,
              { type: "credits_expiring", playerId, screen: "ParentCreditStore" }
            );
          }
        }
      } catch (parentErr) {
        console.error(`[CreditExpiry] Error notifying parents for player ${playerId}:`, parentErr);
      }

      creditExpiryRemindedToday.add(reminderKey);
      notificationsSent++;
    }

    const today = new Date().toISOString().split("T")[0];
    for (const key of creditExpiryRemindedToday) {
      if (!key.includes(today)) {
        creditExpiryRemindedToday.delete(key);
      }
    }

    console.log(`[CreditExpiry] Sent ${notificationsSent} credit expiry reminders for timezone ${timezone}`);
  } catch (error) {
    console.error("[CreditExpiry] Error processing credit expiry reminders:", error);
  }
}

const creditExpiryProcessedTimezones = new Set<string>();

export function startCreditExpiryReminderScheduler(): void {
  if (creditExpiryInterval) {
    console.log("[CreditExpiry] Scheduler already running");
    return;
  }

  console.log("[CreditExpiry] Starting credit expiry reminder scheduler (checks every 15 minutes)");

  creditExpiryInterval = setInterval(async () => {
    try {
      const result = await pool.query(`SELECT DISTINCT timezone FROM academies WHERE timezone IS NOT NULL`);
      const today = new Date().toISOString().split("T")[0];

      for (const row of result.rows) {
        const tz = row.timezone || "UTC";
        const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
        const localHour = localNow.getHours();
        const localMinute = localNow.getMinutes();
        const tzDayKey = `${tz}-${today}`;

        if (localHour === 9 && localMinute < 15 && !creditExpiryProcessedTimezones.has(tzDayKey)) {
          creditExpiryProcessedTimezones.add(tzDayKey);
          await processCreditExpiryReminders(tz);
        }
      }

      for (const key of creditExpiryProcessedTimezones) {
        if (!key.includes(today)) {
          creditExpiryProcessedTimezones.delete(key);
        }
      }
    } catch (err) {
      console.error("[CreditExpiry] Scheduler check error:", err);
    }
  }, 15 * 60 * 1000);
}

export function stopCreditExpiryReminderScheduler(): void {
  if (creditExpiryInterval) {
    clearInterval(creditExpiryInterval);
    creditExpiryInterval = null;
    console.log("[CreditExpiry] Scheduler stopped");
  }
}

// Video feedback notification
export async function sendVideoFeedbackNotification(
  playerId: string,
  coachName: string,
  feedbackTitle: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "New Video Feedback",
    `${coachName} sent you video feedback: "${feedbackTitle}"`,
    { type: "video_feedback", playerId, screen: "CoachFeedbackHistory" },
    playerId
  );
}

// ==================== WEEKLY AI DIGEST SCHEDULER ====================
// Every Monday at 8:00 AM academy-local time, generate and send a personalised AI focus digest

let weeklyAIDigestInterval: ReturnType<typeof setInterval> | null = null;
const weeklyAIDigestProcessedTimezones = new Set<string>();

async function processWeeklyAIDigest(timezone: string): Promise<void> {
  try {
    const { buildPlayerSelfAIContext } = await import("./services/ai-progress-engine");
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    // Monday of current week (used for idempotency check)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() + daysToMonday);
    thisMonday.setHours(0, 0, 0, 0);

    const activePlayers = await pool.query(`
      SELECT DISTINCT p.id, p.name, p.academy_id
      FROM players p
      JOIN academies a ON a.id = p.academy_id
      JOIN users u ON u.player_id = p.id
      WHERE a.timezone = $1
        AND u.deleted = false
        AND u.status = 'active'
    `, [timezone]);

    if (activePlayers.rows.length === 0) {
      console.log(`[WeeklyDigest] No active players found for timezone ${timezone}`);
      return;
    }

    console.log(`[WeeklyDigest] Generating digests for ${activePlayers.rows.length} active players in ${timezone}`);

    for (const row of activePlayers.rows) {
      const playerId: string = row.id;
      try {
        // Idempotency: skip if a digest was already sent this week for this player
        const existingDigest = await pool.query(`
          SELECT id FROM player_notifications
          WHERE player_id = $1
            AND type = 'ai_weekly_digest'
            AND created_at >= $2
          LIMIT 1
        `, [playerId, thisMonday.toISOString()]);
        if (existingDigest.rows.length > 0) {
          continue;
        }

        const ctx = await buildPlayerSelfAIContext(playerId);
        if (!ctx) continue;

        const digestsText = ctx.sessionDigests.length > 0
          ? ctx.sessionDigests.slice(0, 3).join(" | ")
          : "No recent session summaries yet.";

        const skillsText = ctx.skillScores.length > 0
          ? ctx.skillScores.slice(0, 5).map(s => `${s.skillName}: ${s.movingAverage !== null ? s.movingAverage.toFixed(1) : s.score}/2`).join(", ")
          : "no skill data";

        const coachNotesText = ctx.coachNotes.length > 0
          ? ctx.coachNotes.slice(0, 3).map(n => n.content).join(". ")
          : "none";

        const goalsText = [
          ctx.shortTermGoal ? `Short-term goal: ${ctx.shortTermGoal}` : "",
          ctx.longTermDream ? `Long-term dream: ${ctx.longTermDream}` : "",
        ].filter(Boolean).join(". ") || "none set";

        const hasData = ctx.sessionDigests.length > 0 || ctx.skillScores.length > 0 || ctx.coachNotes.length > 0;

        let digestData: { focusArea: string; keepDoing: string; improve: string; pushTitle: string; pushBody: string };

        if (!hasData) {
          digestData = {
            focusArea: "Show up this week and give your best effort in every session.",
            keepDoing: "Stay consistent with your training schedule.",
            improve: "Ask your coach for feedback to identify your top development area.",
            pushTitle: "Your weekly focus is ready",
            pushBody: "Start the week strong. Open the app to see your focus for this week.",
          };
        } else {
          const userPrompt = `Player: ${ctx.playerName}, level ${ctx.ballLevel}, XP level ${ctx.xpLevel}
Recent session digests: ${digestsText}
Skill scores: ${skillsText}
Coach notes: ${coachNotesText}
Goals: ${goalsText}
Attendance: ${ctx.attendanceRate !== null ? ctx.attendanceRate + "% over " + ctx.totalSessions + " sessions" : "unknown"}
${ctx.avgEffort !== null ? `Avg effort: ${ctx.avgEffort}/2, execution: ${ctx.avgExecution}/2` : ""}
${ctx.recentStrokes.length > 0 ? `Recently trained strokes: ${ctx.recentStrokes.join(", ")}` : ""}

Generate a Monday morning AI weekly digest with exactly 3 bullet points plus a push notification:
1. focusArea: The single most important area to focus on this week (1 short sentence, specific skill or tactic)
2. keepDoing: One thing the player should keep doing because it is working well (1 sentence, draw from positive coach notes or strong skill scores)
3. improve: One specific thing to improve this week (1 sentence, draw from coach notes or weaker skill areas)
4. pushTitle: A short, punchy push notification title (max 10 words, no emojis)
5. pushBody: Push notification body that teases the focus area (max 20 words, no emojis)

Return ONLY valid JSON, no markdown:
{"focusArea":"...","keepDoing":"...","improve":"...","pushTitle":"...","pushBody":"..."}`;

          const systemPrompt = "You are an expert tennis/sports AI coach generating concise, personalised weekly focus digests for players. Be specific, data-driven, and encouraging. Never use emojis. Return only valid JSON.";

          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: 400,
            temperature: 0.7,
          });

          const { logAiCall } = await import("./middleware/aiQuotaMiddleware");
          logAiCall({
            userId: null,
            featureType: "notification",
            model: "gpt-4o-mini",
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            totalTokens: response.usage?.total_tokens ?? 0,
          }).catch(() => {});

          const rawContent = response.choices?.[0]?.message?.content || null;
          if (!rawContent) continue;

          let parsed: { focusArea: string; keepDoing: string; improve: string; pushTitle: string; pushBody: string } | null = null;
          try {
            const cleaned = rawContent.trim().replace(/^```json\s*/, "").replace(/```$/, "").trim();
            parsed = JSON.parse(cleaned);
          } catch {
            console.error(`[WeeklyDigest] Failed to parse AI response for player ${playerId}`);
            continue;
          }

          if (!parsed?.focusArea || !parsed?.pushTitle || !parsed?.pushBody) continue;

          digestData = {
            focusArea: parsed.focusArea,
            keepDoing: parsed.keepDoing || "Keep showing up and giving your best effort.",
            improve: parsed.improve || "Focus on your weakest skill area this week.",
            pushTitle: parsed.pushTitle,
            pushBody: parsed.pushBody,
          };
        }

        await db.insert(playerNotifications).values({
          playerId,
          title: digestData.pushTitle,
          body: digestData.pushBody,
          type: "ai_weekly_digest",
          data: { focusArea: digestData.focusArea, keepDoing: digestData.keepDoing, improve: digestData.improve },
        });

        const tokens = await getPlayerPushTokens(playerId);
        if (tokens.length > 0) {
          await sendPushNotification(
            tokens,
            digestData.pushTitle,
            digestData.pushBody,
            { type: "ai_weekly_digest", playerId, screen: "PlayerHome" },
          );
        }

        console.log(`[WeeklyDigest] Sent weekly digest to player ${playerId}`);
      } catch (playerErr) {
        console.error(`[WeeklyDigest] Error processing player ${playerId}:`, playerErr);
      }
    }

    console.log(`[WeeklyDigest] Completed for timezone ${timezone}`);
  } catch (error) {
    console.error(`[WeeklyDigest] Error processing timezone ${timezone}:`, error);
  }
}

export function startWeeklyAIDigestScheduler(): void {
  if (weeklyAIDigestInterval) {
    console.log("[WeeklyDigest] Scheduler already running");
    return;
  }

  console.log("[WeeklyDigest] Starting weekly AI digest scheduler (checks every 15 minutes, fires Monday 8:00-8:15 AM academy-local time)");

  weeklyAIDigestInterval = setInterval(async () => {
    try {
      const now = new Date();
      const todayKey = now.toISOString().split("T")[0];

      const result = await pool.query(`SELECT DISTINCT timezone FROM academies WHERE timezone IS NOT NULL`);

      for (const row of result.rows) {
        const tz = row.timezone || "UTC";
        const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
        const localDay = localNow.getDay(); // 0=Sun, 1=Mon
        const localHour = localNow.getHours();
        const tzWeekKey = `${tz}-${todayKey}`;

        const localMinute = localNow.getMinutes();
        if (localDay === 1 && localHour === 8 && localMinute < 15 && !weeklyAIDigestProcessedTimezones.has(tzWeekKey)) {
          weeklyAIDigestProcessedTimezones.add(tzWeekKey);
          processWeeklyAIDigest(tz).catch(err => console.error("[WeeklyDigest] Async error:", err));
        }
      }

      for (const key of weeklyAIDigestProcessedTimezones) {
        if (!key.includes(todayKey)) {
          weeklyAIDigestProcessedTimezones.delete(key);
        }
      }
    } catch (err) {
      console.error("[WeeklyDigest] Scheduler check error:", err);
    }
  }, 15 * 60 * 1000);
}

export function stopWeeklyAIDigestScheduler(): void {
  if (weeklyAIDigestInterval) {
    clearInterval(weeklyAIDigestInterval);
    weeklyAIDigestInterval = null;
    console.log("[WeeklyDigest] Scheduler stopped");
  }
}

// ==================== MATCH PREP NOTIFICATION SCHEDULER ====================

async function processMatchPrepNotifications(): Promise<void> {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStart = new Date(tomorrow);
    tomorrowStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    // Find tournament matches scheduled for tomorrow
    const matchesTomorrow = await db
      .select({
        matchId: tournamentMatches.id,
        tournamentId: tournamentMatches.tournamentId,
        player1Id: tournamentMatches.player1Id,
        player2Id: tournamentMatches.player2Id,
        scheduledTime: tournamentMatches.scheduledTime,
      })
      .from(tournamentMatches)
      .where(
        and(
          eq(tournamentMatches.status, "scheduled"),
          gte(tournamentMatches.scheduledTime, tomorrowStart),
          lte(tournamentMatches.scheduledTime, tomorrowEnd)
        )
      );

    if (matchesTomorrow.length === 0) {
      console.log("[MatchPrep] No matches scheduled for tomorrow");
      return;
    }

    const tournamentIds = [...new Set(matchesTomorrow.map((m) => m.tournamentId))];
    const tournamentMap = new Map<string, string>();

    const tournamentRows = await db
      .select({ id: tournaments.id, name: tournaments.name })
      .from(tournaments)
      .where(inArray(tournaments.id, tournamentIds));

    for (const t of tournamentRows) {
      tournamentMap.set(t.id, t.name);
    }

    const notifiedPlayers = new Set<string>();

    for (const match of matchesTomorrow) {
      const tournamentName = tournamentMap.get(match.tournamentId) || "tournament";
      const playerIds = [match.player1Id, match.player2Id].filter(Boolean) as string[];

      for (const playerId of playerIds) {
        if (notifiedPlayers.has(playerId)) continue;
        notifiedPlayers.add(playerId);

        const tokens = await getPlayerPushTokens(playerId);
        if (tokens.length === 0) continue;

        await sendPushNotification(
          tokens,
          "Your match is tomorrow",
          `See your AI match prep for ${tournamentName}. Check your readiness score and tactical tips.`,
          {
            type: "match_prep_ready",
            tournamentId: match.tournamentId,
            screen: "TournamentDetail",
          },
          playerId
        );

        console.log(`[MatchPrep] Notified player ${playerId} for tomorrow's match in tournament ${match.tournamentId}`);
      }
    }

    console.log(`[MatchPrep] Sent notifications to ${notifiedPlayers.size} player(s) for ${matchesTomorrow.length} match(es) tomorrow`);
  } catch (error) {
    console.error("[MatchPrep] Error processing match prep notifications:", error);
  }
}

let matchPrepSchedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startMatchPrepNotificationScheduler(): void {
  if (matchPrepSchedulerInterval) {
    console.log("[MatchPrep] Scheduler already running");
    return;
  }

  console.log("[MatchPrep] Starting match prep notification scheduler");

  matchPrepSchedulerInterval = setInterval(() => {
    const now = new Date();
    const hour = parseInt(
      now.toLocaleString("en-US", { hour: "2-digit", hour12: false, timeZone: "Asia/Dubai" })
    );

    // Send notifications at 6 PM Dubai time (day before match)
    if (hour === 18) {
      processMatchPrepNotifications().catch(console.error);
    }
  }, 60 * 60 * 1000);
}

// ==================== POST-SESSION REFLECTION REMINDER ====================

/**
 * Runs every 5 min with the main scheduler.
 * Finds sessions that ended 25–65 min ago where:
 *  - Player hasn't submitted a session reflection
 *  - The reflection_reminder_sent flag is false
 * Sends one push notification per eligible player, then marks the flag.
 */
export async function processPostSessionReflectionReminders(): Promise<void> {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 65 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() - 25 * 60 * 1000);

    // Find recently-ended sessions that haven't had their reflection reminder sent
    const recentSessions = await pool.query(
      `SELECT s.id, s.end_time, s.academy_id, s.coach_id
       FROM sessions s
       WHERE s.status = 'completed'
         AND s.end_time IS NOT NULL
         AND (s.end_time AT TIME ZONE 'UTC') >= $1::timestamptz
         AND (s.end_time AT TIME ZONE 'UTC') <= $2::timestamptz
         AND COALESCE(s.reflection_reminder_sent, false) = false`,
      [windowStart.toISOString(), windowEnd.toISOString()]
    );

    if (recentSessions.rows.length === 0) return;

    console.log(`[ReflectionReminder] Found ${recentSessions.rows.length} session(s) in 25–65 min post-window`);

    for (const session of recentSessions.rows) {
      // Get enrolled players for this session
      const enrolled = await db
        .select({ playerId: sessionPlayers.playerId })
        .from(sessionPlayers)
        .where(
          and(
            eq(sessionPlayers.sessionId, session.id),
            ne(sessionPlayers.attendanceStatus, "absent")
          )
        );

      let notifiedCount = 0;

      for (const sp of enrolled) {
        if (!sp.playerId) continue;

        // Skip if player already submitted a reflection for this session
        const existing = await db
          .select({ id: playerSessionReflections.id })
          .from(playerSessionReflections)
          .where(
            and(
              eq(playerSessionReflections.playerId, sp.playerId),
              eq(playerSessionReflections.sessionId, session.id)
            )
          )
          .limit(1);

        if (existing.length > 0) continue;

        const tokens = await getPlayerPushTokens(sp.playerId);
        if (tokens.length === 0) continue;

        await sendPushNotification(
          tokens,
          "How did training go?",
          "Take 30 seconds to log your session reflection in Glow Mirror.",
          {
            type: "session_reflection_reminder",
            sessionId: session.id,
            screen: "TrainingDetail",
          },
          sp.playerId
        );

        notifiedCount++;
      }

      // Mark reminder as sent for this session
      await pool.query(
        `UPDATE sessions SET reflection_reminder_sent = true WHERE id = $1`,
        [session.id]
      );

      if (notifiedCount > 0) {
        console.log(`[ReflectionReminder] Session ${session.id}: notified ${notifiedCount} player(s)`);
      }
    }
  } catch (error) {
    console.error("[ReflectionReminder] Error processing post-session reflection reminders:", error);
  }
}
