import { db } from "./db";
import { eq, and, gte, lte, inArray, isNull, lt, ne } from "drizzle-orm";
import { pushDeviceTokens, notificationPreferences, users, players, coaches, sessions, sessionPlayers, seriesPlayers, coachXpTransactions, creditTransactions } from "@shared/schema";
import { storage } from "./storage";
import { sendSessionReminderEmail } from "./emailService";
import { initializeFirebase, isFirebaseInitialized, isFCMToken, sendFCMNotification } from "./fcm";

// Initialize Firebase on module load
initializeFirebase();

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
    console.error("Failed to send Expo push notification:", error);
    return [];
  }
}

// Unified push notification function - routes to Expo or FCM based on token type
export async function sendPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
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
    const fcmResults = await sendFCMNotification(fcmTokens, title, body, data);
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
  location?: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  const timeStr = startTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });

  // Format session type nicely
  const typeLabel = sessionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Build location string
  const locationStr = location ? ` @ ${location}` : "";

  await sendPushNotification(
    tokens,
    `${typeLabel}${locationStr}`,
    `With ${coachName} - ${timeStr}`,
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

      let sessionPlayersList = await db
        .select()
        .from(sessionPlayers)
        .where(eq(sessionPlayers.sessionId, session.id));

      // For recurring sessions, fallback to seriesPlayers if no session-specific players
      if (sessionPlayersList.length === 0 && session.seriesId) {
        const seriesPlayersList = await db
          .select()
          .from(seriesPlayers)
          .where(eq(seriesPlayers.seriesId, session.seriesId));
        
        // Map seriesPlayers to same format as sessionPlayers
        sessionPlayersList = seriesPlayersList.map(sp => ({
          id: sp.id,
          sessionId: session.id,
          playerId: sp.playerId,
          status: 'enrolled' as const,
          bookingSource: 'series' as const,
          createdAt: sp.enrolledAt,
        }));
      }

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
              session.sessionType,
              session.startTime,
              coachName,
              session.location || undefined
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

// ==================== ADDITIONAL NOTIFICATION TYPES ====================

// Session confirmed - when coach accepts booking
export async function sendSessionConfirmedNotification(
  playerId: string,
  coachName: string,
  sessionDate: string,
  sessionTime: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "Booking Confirmed!",
    `${coachName} confirmed your session for ${sessionDate} at ${sessionTime}`,
    { type: "session_confirmed", playerId, screen: "Schedule" }
  );
}

// Session cancelled notification
export async function sendSessionCancelledNotification(
  playerId: string,
  sessionType: string,
  sessionDate: string,
  reason?: string
): Promise<void> {
  const tokens = await getPlayerPushTokens(playerId);
  if (tokens.length === 0) return;

  const body = reason 
    ? `Your ${sessionType} on ${sessionDate} has been cancelled: ${reason}`
    : `Your ${sessionType} on ${sessionDate} has been cancelled`;

  await sendPushNotification(
    tokens,
    "Session Cancelled",
    body,
    { type: "session_cancelled", playerId, screen: "Schedule" }
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

// Booking request notification for coach
export async function sendBookingRequestNotification(
  coachId: string,
  playerName: string,
  sessionType: string,
  requestedDate: string
): Promise<void> {
  const tokens = await getCoachPushTokens(coachId);
  if (tokens.length === 0) return;

  await sendPushNotification(
    tokens,
    "New Booking Request",
    `${playerName} wants to book a ${sessionType} on ${requestedDate}`,
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
