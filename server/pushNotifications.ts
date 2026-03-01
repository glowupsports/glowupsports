import { db, pool } from "./db";
import { eq, and, gte, lte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { pushDeviceTokens, notificationPreferences, users, players, coaches, sessions, sessionPlayers, seriesPlayers, coachXpTransactions, creditTransactions, coachNotifications } from "@shared/schema";
import { storage } from "./storage";
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

export async function processScheduledReminders(): Promise<void> {
  const now = new Date();
  const sixtyFiveMinutesFromNow = new Date(now.getTime() + 65 * 60 * 1000);
  const thirtyFiveMinutesFromNow = new Date(now.getTime() + 35 * 60 * 1000);

  try {
    const nowStr = now.toISOString().replace("T", " ").substring(0, 19);
    const futureStr = sixtyFiveMinutesFromNow.toISOString().replace("T", " ").substring(0, 19);
    console.log(`[SessionReminders] Checking window: ${nowStr} to ${futureStr}`);

    const rawResult = await pool.query(
      `SELECT * FROM sessions WHERE start_time >= $1::timestamp AND start_time <= $2::timestamp AND status = 'scheduled'`,
      [nowStr, futureStr]
    );
    const upcomingSessions = rawResult.rows;

    console.log(`[SessionReminders] Found ${upcomingSessions.length} sessions in window (params: ${nowStr}, ${futureStr})`);
    for (const s of upcomingSessions) {
      const startTime = s.start_time ? new Date(s.start_time) : s.startTime;
      console.log(`[SessionReminders]   - ${s.id} starts ${startTime} type=${s.session_type || s.sessionType} level=${s.ball_level || s.ballLevel}`);
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

const AUTO_ATTENDANCE_GRACE_PERIOD = 0; // No grace period - mark attendance immediately after session ends
const AUTO_ATTENDANCE_XP_REWARD = 25; // XP for marking attendance during class

// Auto-complete sessions that have passed their end time
async function processAutoCompleteSession(): Promise<void> {
  try {
    const now = new Date();
    // Only auto-complete sessions that ended at least 10 minutes ago (to give coach time to mark manually)
    const completeThreshold = new Date(now.getTime() - 10 * 60 * 1000);
    // Don't auto-complete sessions older than 24 hours
    const lookbackWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const sessionsToComplete = await db.select({
      id: sessions.id,
      endTime: sessions.endTime,
      status: sessions.status,
    })
      .from(sessions)
      .where(and(
        lte(sessions.endTime, completeThreshold),
        gte(sessions.endTime, lookbackWindow),
        eq(sessions.status, "scheduled")
      ));

    if (sessionsToComplete.length === 0) {
      return;
    }

    console.log(`[AutoComplete] Auto-completing ${sessionsToComplete.length} sessions that have ended`);

    for (const session of sessionsToComplete) {
      await db.update(sessions)
        .set({ status: "completed" })
        .where(eq(sessions.id, session.id));
    }

    console.log("[AutoComplete] Processing complete");
  } catch (error) {
    console.error("[AutoComplete] Error:", error);
  }
}

async function processAutoAttendance(): Promise<void> {
  try {
    const now = new Date();
    const gracePeriodAgo = new Date(now.getTime() - AUTO_ATTENDANCE_GRACE_PERIOD);
    const lookbackWindow = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours back

    const completedSessions = await db.select({
      id: sessions.id,
      coachId: sessions.coachId,
      endTime: sessions.endTime,
      seriesId: sessions.seriesId,
      sessionType: sessions.sessionType,
      academyId: sessions.academyId,
    })
      .from(sessions)
      .where(and(
        lte(sessions.endTime, gracePeriodAgo),
        gte(sessions.endTime, lookbackWindow),
        eq(sessions.status, "completed")
      ));

    if (completedSessions.length === 0) {
      console.log("[AutoAttendance] No completed sessions to process");
      return;
    }

    console.log(`[AutoAttendance] Processing ${completedSessions.length} completed sessions`);

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
              const result = await storage.ensureCreditProcessed(newSessionPlayerId);
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
            const result = await storage.ensureCreditProcessed(player.id);
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

export function startReminderScheduler(): void {
  if (reminderInterval) {
    console.log("[SessionReminders] Scheduler already running");
    return;
  }

  console.log("[SessionReminders] Starting reminder scheduler (every 5 minutes)");
  
  catchUpMissedReminders().catch(console.error);
  processScheduledReminders().catch(console.error);
  processAutoCompleteSession().catch(console.error);
  processAutoAttendance().catch(console.error);

  reminderInterval = setInterval(() => {
    processScheduledReminders().catch(console.error);
    processAutoCompleteSession().catch(console.error);
    processAutoAttendance().catch(console.error);
  }, 5 * 60 * 1000);
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
    
    const dubaiNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" }));
    console.log(`[AutoComplete] Running auto session completion check at ${dubaiNow.toISOString()}`);
    
    // Find all sessions where:
    // 1. endTime has passed (session is over)
    // 2. status is still "scheduled" (not yet completed)
    const incompleteSessions = await db.select({
      id: sessions.id,
      sessionType: sessions.sessionType,
      academyId: sessions.academyId,
      startTime: sessions.startTime,
      endTime: sessions.endTime,
    })
    .from(sessions)
    .where(and(
      lt(sessions.endTime, dubaiNow),
      eq(sessions.status, "scheduled")
    ));
    
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
        
        // Mark each player as present and deduct credits
        for (const sp of enrolledPlayers) {
          // Skip if already marked as present/absent or credit already deducted
          if (sp.attendanceStatus === "present" || sp.attendanceStatus === "absent" || sp.creditDeductedAt) {
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
          console.log(`[MonthlyReports] Sent report to ${player.displayName} (${player.email})`);
        } else {
          reportsSkipped++;
          const error = await response.text();
          console.log(`[MonthlyReports] Skipped ${player.displayName}: ${error}`);
        }
      } catch (err) {
        reportsSkipped++;
        console.error(`[MonthlyReports] Error sending report to ${player.playerId}:`, err);
      }
      
      // Add a small delay between emails to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`[MonthlyReports] Completed: ${reportsSent} sent, ${reportsSkipped} skipped`);
  } catch (error) {
    console.error("[MonthlyReports] Error processing monthly reports:", error);
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
        SELECT s.id, s.session_type, s.start_time, s.court_name,
               (SELECT COUNT(*) FROM session_players sp WHERE sp.session_id = s.id AND sp.status != 'cancelled') as player_count
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
