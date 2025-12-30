import { db } from "./db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { pushDeviceTokens, notificationPreferences, users, players, coaches } from "@shared/schema";

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

export async function processScheduledReminders(): Promise<void> {
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  const fiftyFiveMinutesFromNow = new Date(now.getTime() + 55 * 60 * 1000);

  console.log(`[PushNotifications] Checking for sessions between ${fiftyFiveMinutesFromNow.toISOString()} and ${oneHourFromNow.toISOString()}`);
}
