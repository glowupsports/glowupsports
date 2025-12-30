import { db } from "./db";
import { eq, and, gte, lte, inArray, isNull } from "drizzle-orm";
import { pushDeviceTokens, notificationPreferences, users, players, coaches, sessions, sessionPlayers } from "@shared/schema";

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
  sessionName: string,
  startTime: Date,
  playerCount: number
): Promise<void> {
  const tokens = await getCoachPushTokens(coachId);
  if (tokens.length === 0) return;

  const timeStr = startTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  await sendPushNotification(
    tokens,
    "Session Starting Soon",
    `Your session "${sessionName}" with ${playerCount} player(s) starts at ${timeStr}`,
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
            continue;
          }
          sendSessionReminder(
            sp.playerId,
            sessionName,
            session.startTime,
            coachName
          ).catch(err => console.error("[SessionReminders] Failed to send player reminder:", err));
          playerNotificationsSent++;
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
          sendSessionReminderToCoach(
            session.coachId,
            sessionName,
            session.startTime,
            sessionPlayersList.length
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

export function startReminderScheduler(): void {
  if (reminderInterval) {
    console.log("[SessionReminders] Scheduler already running");
    return;
  }

  console.log("[SessionReminders] Starting reminder scheduler (every 5 minutes)");
  
  processScheduledReminders().catch(console.error);

  reminderInterval = setInterval(() => {
    processScheduledReminders().catch(console.error);
  }, 5 * 60 * 1000);
}

export function stopReminderScheduler(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log("[SessionReminders] Scheduler stopped");
  }
}
