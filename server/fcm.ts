import admin from "firebase-admin";

// Initialize Firebase Admin SDK
let firebaseApp: admin.app.App | null = null;

export function initializeFirebase(): boolean {
  // Check if already initialized
  if (firebaseApp) {
    return true;
  }

  // Get Firebase service account from environment
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  
  if (!serviceAccountJson) {
    console.log("[FCM] FIREBASE_SERVICE_ACCOUNT_KEY not found - FCM disabled");
    return false;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    
    console.log("[FCM] Firebase Admin SDK initialized successfully");
    return true;
  } catch (error) {
    console.error("[FCM] Failed to initialize Firebase:", error);
    return false;
  }
}

export function isFirebaseInitialized(): boolean {
  return firebaseApp !== null;
}

// Check if a token is an FCM token (not Expo Push token, not raw APNs hex).
//
// FCM registration tokens are long alphanumeric strings (typically 150+ chars)
// that contain a colon delimiter (e.g. "fxxx:APA91b..."). Raw APNs device
// tokens are pure hex (no ":") and must NEVER be routed to FCM — Firebase
// rejects them with "registration-token-not-registered" which would then
// deactivate a perfectly valid iOS token.
export function isFCMToken(token: string): boolean {
  if (token.startsWith("ExponentPushToken[")) return false;
  if (token.length <= 100) return false;
  // Pure hex of any length is an APNs token, not FCM.
  if (/^[0-9a-fA-F]+$/.test(token)) return false;
  return true;
}

interface FCMMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  channelId?: string;
}

interface FCMSendResult {
  token: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

export function getChannelIdForNotificationType(type?: string): string {
  if (!type) return "default";
  switch (type) {
    case "session_confirmed":
    case "session_cancelled":
    case "session_reminder":
    case "session_reminder_coach":
    case "new_session_available":
    case "booking_request":
      return "sessions";
    case "feedback_received":
      return "feedback";
    case "badge_earned":
    case "level_up":
    case "xp_gained":
    case "glow_rank_update":
    case "streak_alert":
      return "xp";
    default:
      return "default";
  }
}

function getServerBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}`;
  return `http://localhost:${process.env.PORT || 5000}`;
}

export async function sendFCMNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId: string = "default"
): Promise<FCMSendResult[]> {
  if (!firebaseApp) {
    console.log("[FCM] Firebase not initialized, skipping FCM notifications");
    return tokens.map((token) => ({
      token,
      success: false,
      error: "Firebase not initialized",
    }));
  }

  if (tokens.length === 0) {
    return [];
  }

  const messaging = admin.messaging();
  const results: FCMSendResult[] = [];

  // Convert data to string values (FCM requires string values)
  const stringData: Record<string, string> = {};
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      stringData[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
  }

  // Send to each token individually (for better error tracking)
  for (const token of tokens) {
    try {
      const notificationLogoUrl = `${getServerBaseUrl()}/images/notification-logo.png`;
      const message: admin.messaging.Message = {
        token,
        notification: {
          title,
          body,
          imageUrl: notificationLogoUrl,
        },
        data: stringData,
        android: {
          priority: "high",
          notification: {
            channelId,
            sound: "default",
            priority: "high",
            defaultVibrateTimings: true,
            defaultSound: true,
            color: "#0A1628",
            vibrateTimingsMillis: [0, 250, 250, 250],
            imageUrl: notificationLogoUrl,
          },
        },
      };

      const messageId = await messaging.send(message);
      results.push({
        token,
        success: true,
        messageId,
      });
      console.log(`[FCM] Sent notification to ${token.substring(0, 20)}...`);
    } catch (error: any) {
      console.error(`[FCM] Failed to send to ${token.substring(0, 20)}...`, error.message);
      results.push({
        token,
        success: false,
        error: error.message || "Unknown error",
      });

      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        console.log(`[FCM] Deactivating invalid token: ${token.substring(0, 20)}...`);
        try {
          const { db } = await import("./db");
          const { pushDeviceTokens } = await import("@shared/schema");
          const { eq } = await import("drizzle-orm");
          await db.update(pushDeviceTokens)
            .set({ isActive: false })
            .where(eq(pushDeviceTokens.token, token));
        } catch (deactivateErr) {
          console.error("[FCM] Failed to deactivate invalid token:", deactivateErr);
        }
      }
    }
  }

  return results;
}

// Send notification using multicast for efficiency (up to 500 tokens at once)
export async function sendFCMNotificationBatch(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId: string = "default"
): Promise<{ successCount: number; failureCount: number; invalidTokens: string[] }> {
  if (!firebaseApp) {
    return { successCount: 0, failureCount: tokens.length, invalidTokens: [] };
  }

  if (tokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  const messaging = admin.messaging();
  const invalidTokens: string[] = [];

  // Convert data to string values
  const stringData: Record<string, string> = {};
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      stringData[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
  }

  try {
    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title,
        body,
      },
      data: stringData,
      android: {
        priority: "high",
        notification: {
          channelId,
          sound: "default",
          priority: "high",
          color: "#000000",
          vibrateTimingsMillis: [0, 250, 250, 250],
          defaultVibrateTimings: true,
          defaultSound: true,
        },
      },
    };

    const response = await messaging.sendEachForMulticast(message);
    
    // Check for invalid tokens
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const error = resp.error;
        if (
          error?.code === "messaging/invalid-registration-token" ||
          error?.code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    console.log(`[FCM Batch] Success: ${response.successCount}, Failure: ${response.failureCount}`);

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    };
  } catch (error) {
    console.error("[FCM Batch] Failed:", error);
    return { successCount: 0, failureCount: tokens.length, invalidTokens: [] };
  }
}
