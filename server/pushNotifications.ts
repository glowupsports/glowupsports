import { db } from "./db";
import { eq, and, gte, lte, inArray, isNull, lt, ne } from "drizzle-orm";
import { pushDeviceTokens, notificationPreferences, users, players, coaches, sessions, sessionPlayers, coachXpTransactions } from "@shared/schema";
import { sendSessionReminderEmail } from "./emailService";

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

export async function sendPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<ExpoPushTicket[]> {
  if (tokens.length === 0) return [];

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token,
    title,
    body,
    data,
    sound: "default",
    priority: "high",
    channelId: "default",
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
    return result.data || [];
  } catch (error) {
    console.error("Failed to send push notification:", error);
    return [];
  }
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
  sessionName: string,
  startTime: Date,
  coachName: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  const timeStr = startTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });

  await sendPushNotification(
    tokens,
    "Session Reminder",
    `Your session "${sessionName}" with ${coachName} starts at ${timeStr}`,
    { type: "session_reminder", playerId }
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
    { type: "feedback_received", playerId }
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
    { type: "badge_earned", playerId, badgeName }
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
    { type: "level_up", playerId, newLevel }
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
    { type: "xp_gain", playerId, xpAmount }
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
  location?: string
): Promise<void> {
  const tokens = await getCoachPushTokens(coachId);
  if (tokens.length === 0) return;

  const timeStr = startTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });

  // Format session type nicely
  const typeLabel = sessionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Build player names string (max 3 names shown)
  const displayNames = playerNames.slice(0, 3).join(", ");
  const extraCount = playerNames.length > 3 ? ` +${playerNames.length - 3}` : "";
  const playersStr = playerNames.length > 0 ? `${displayNames}${extraCount}` : "No players";
  
  // Build location string
  const locationStr = location ? ` @ ${location}` : "";

  await sendPushNotification(
    tokens,
    `${typeLabel}${locationStr}`,
    `${playersStr} - ${timeStr}`,
    { type: "session_reminder_coach", coachId }
  );
}

const sentReminders = new Set<string>();

export async function processScheduledReminders(): Promise<void> {
  const now = new Date();
  const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
  const twentyFiveMinutesFromNow = new Date(now.getTime() + 25 * 60 * 1000);

  try {
    const upcomingSessions = await db
      .select()
      .from(sessions)
      .where(
        and(
          gte(sessions.startTime, twentyFiveMinutesFromNow),
          lte(sessions.startTime, thirtyMinutesFromNow),
          eq(sessions.status, "scheduled")
        )
      );

    console.log(`[SessionReminders] Found ${upcomingSessions.length} sessions starting in ~30 minutes`);

    for (const session of upcomingSessions) {
      const reminderKey = `${session.id}-${session.startTime?.toISOString()}`;
      
      if (sentReminders.has(reminderKey)) {
        continue;
      }

      const sessionPlayersList = await db
        .select()
        .from(sessionPlayers)
        .where(eq(sessionPlayers.sessionId, session.id));

      const coach = session.coachId ? await db
        .select()
        .from(coaches)
        .where(eq(coaches.id, session.coachId))
        .limit(1) : [];

      const coachName = coach[0]?.name || "Your coach";

      const sessionName = `${session.sessionType.replace(/_/g, ' ')} session`;

      let playerNotificationsSent = 0;
      let playersWithNoTokens = 0;

      for (const sp of sessionPlayersList) {
        if (sp.playerId) {
          const tokens = await getPlayerPushTokens(sp.playerId);
          if (tokens.length === 0) {
            playersWithNoTokens++;
          } else {
            sendSessionReminder(
              sp.playerId,
              sessionName,
              session.startTime,
              coachName
            ).catch(err => console.error("[SessionReminders] Failed to send player reminder:", err));
            playerNotificationsSent++;
          }
          
          // Always try to send email reminder regardless of push tokens
          const player = await db.select().from(players).where(eq(players.id, sp.playerId)).limit(1);
          if (player[0]?.email) {
            const sessionDate = session.startTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Dubai" });
            const sessionTime = session.startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });
            sendSessionReminderEmail({
              to: player[0].email,
              playerName: player[0].name,
              sessionDate,
              sessionTime,
              coachName,
            }).catch(err => console.error("[SessionReminders] Failed to send player email reminder:", err));
          }
        }
      }

      if (playersWithNoTokens > 0) {
        console.log(`[SessionReminders] ${playersWithNoTokens} player(s) have no push tokens for session "${sessionName}"`);
      }

      if (session.coachId) {
        const coachTokens = await getCoachPushTokens(session.coachId);
        if (coachTokens.length === 0) {
          console.log(`[SessionReminders] Coach has no push tokens for session "${sessionName}"`);
        } else {
          // Get player names for coach notification
          const playerNames: string[] = [];
          for (const sp of sessionPlayersList) {
            if (sp.playerId) {
              const playerData = await db.select().from(players).where(eq(players.id, sp.playerId)).limit(1);
              if (playerData[0]?.name) {
                playerNames.push(playerData[0].name.split(' ')[0]); // First name only
              }
            }
          }
          
          sendSessionReminderToCoach(
            session.coachId,
            session.sessionType,
            session.startTime,
            playerNames,
            session.location || undefined
          ).catch(err => console.error("[SessionReminders] Failed to send coach reminder:", err));
        }
      }

      sentReminders.add(reminderKey);

      if (sentReminders.size > 1000) {
        const oldKeys = Array.from(sentReminders).slice(0, 500);
        oldKeys.forEach(key => sentReminders.delete(key));
      }

      console.log(`[SessionReminders] Processed session "${sessionName}" - ${playerNotificationsSent} notifications sent, ${playersWithNoTokens} players without tokens`);
    }
  } catch (error) {
    console.error("[SessionReminders] Error processing reminders:", error);
  }
}

let reminderInterval: ReturnType<typeof setInterval> | null = null;

const AUTO_ATTENDANCE_GRACE_PERIOD = 30 * 60 * 1000; // 30 minutes after session ends
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
      const unmarkedPlayers = await db.select({
        id: sessionPlayers.id,
        playerId: sessionPlayers.playerId,
        attendanceStatus: sessionPlayers.attendanceStatus,
      })
        .from(sessionPlayers)
        .where(and(
          eq(sessionPlayers.sessionId, session.id),
          isNull(sessionPlayers.attendanceStatus)
        ));

      if (unmarkedPlayers.length === 0) continue;

      console.log(`[AutoAttendance] Session ${session.id}: Marking ${unmarkedPlayers.length} players as attended (auto-mark after session end)`);

      for (const player of unmarkedPlayers) {
        await db.update(sessionPlayers)
          .set({ 
            attendanceStatus: "present",
            lateMinutes: 0
          })
          .where(eq(sessionPlayers.id, player.id));
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

export function startReminderScheduler(): void {
  if (reminderInterval) {
    console.log("[SessionReminders] Scheduler already running");
    return;
  }

  console.log("[SessionReminders] Starting reminder scheduler (every 5 minutes)");
  
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
