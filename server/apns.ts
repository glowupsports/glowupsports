/**
 * server/apns.ts
 *
 * Direct APNs HTTP/2 sender for iOS push notifications.
 *
 * Why this exists: the iOS native build of Glow Up Sports calls
 * Notifications.getDevicePushTokenAsync(), which on a non-Expo-Go iOS
 * build returns the raw 64-char hex APNs device token. Expo Push API
 * cannot deliver to those tokens unless an APNs auth key is uploaded
 * to the EAS account (which is not currently the case), and Firebase
 * Admin SDK only accepts FCM registration tokens. So we talk to Apple
 * directly using a token-based JWT (.p8) auth flow.
 *
 * Required env:
 *   APNS_AUTH_KEY_P8  — full contents of the .p8 file (incl. headers)
 *   APNS_KEY_ID       — 10-char Key ID from Apple Developer
 *   APNS_TEAM_ID      — Apple Team ID (defaults to known team)
 *   APNS_BUNDLE_ID    — iOS bundle id (defaults to com.glowupsports.app)
 *   APNS_USE_SANDBOX  — "true" to target sandbox host (TestFlight/dev)
 *
 * Apple docs:
 *   https://developer.apple.com/documentation/usernotifications/
 *   sending_notification_requests_to_apns
 */

import http2 from "node:http2";
import jwt from "jsonwebtoken";

const APNS_PROD_HOST = "api.push.apple.com";
const APNS_SANDBOX_HOST = "api.sandbox.push.apple.com";
const APNS_PORT = 443;

// Provider JWT lifetime per Apple: max 1h. We refresh well inside that.
const JWT_TTL_MS = 50 * 60 * 1000;

interface ProviderToken {
  jwt: string;
  expiresAt: number;
}

let cachedProviderToken: ProviderToken | null = null;

function getConfig() {
  const p8 = process.env.APNS_AUTH_KEY_P8;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID || "49V4936A73";
  const bundleId = process.env.APNS_BUNDLE_ID || "com.glowupsports.app";
  const useSandbox = process.env.APNS_USE_SANDBOX === "true";
  return { p8, keyId, teamId, bundleId, useSandbox };
}

export function isAPNsConfigured(): boolean {
  const { p8, keyId } = getConfig();
  return Boolean(p8 && keyId);
}

/**
 * Heuristic: APNs device tokens are 64 hex characters (older format) or
 * up to 200 hex chars (newer per Apple docs). Either way, lowercase hex
 * only. This distinguishes them from Expo tokens (start with
 * "ExponentPushToken[") and FCM tokens (contain ":APA91" pattern).
 */
export function isAPNsToken(token: string): boolean {
  if (token.startsWith("ExponentPushToken[")) return false;
  if (token.includes(":")) return false; // FCM tokens contain ":"
  // APNs tokens are pure hex. Length 64 (old) up to 200 (new).
  return /^[0-9a-fA-F]{64,200}$/.test(token);
}

/**
 * Re-format a possibly-flattened PEM string back into the strict PEM
 * shape that Node's crypto layer requires:
 *
 *     -----BEGIN PRIVATE KEY-----\n
 *     <base64 in 64-char lines>\n
 *     -----END PRIVATE KEY-----\n
 *
 * Replit secrets (and many other secret stores) tend to strip newlines
 * when a multi-line value is pasted into a single-line input, which
 * leaves the BEGIN/END markers glued onto the base64 body with spaces.
 * jsonwebtoken / Node will then reject the value with the unhelpful
 * "secretOrPrivateKey must be an asymmetric key" error.
 */
function normalizePemPrivateKey(raw: string): string {
  const beginMarker = "-----BEGIN PRIVATE KEY-----";
  const endMarker = "-----END PRIVATE KEY-----";
  const beginIdx = raw.indexOf(beginMarker);
  const endIdx = raw.indexOf(endMarker);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    // Not a recognizable PKCS#8 PEM — return as-is and let Node decide.
    return raw;
  }
  const body = raw
    .slice(beginIdx + beginMarker.length, endIdx)
    // Strip every byte that isn't valid base64. This kills spaces,
    // tabs, CR, LF, and any stray characters introduced by copy/paste.
    .replace(/[^A-Za-z0-9+/=]/g, "");
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `${beginMarker}\n${wrapped}\n${endMarker}\n`;
}

function getProviderToken(): string {
  const now = Date.now();
  if (cachedProviderToken && cachedProviderToken.expiresAt > now) {
    return cachedProviderToken.jwt;
  }

  const { p8, keyId, teamId } = getConfig();
  if (!p8 || !keyId) {
    throw new Error(
      "APNs not configured: APNS_AUTH_KEY_P8 and APNS_KEY_ID required",
    );
  }

  const pem = normalizePemPrivateKey(p8);
  const issuedAt = Math.floor(now / 1000);
  const token = jwt.sign({ iss: teamId, iat: issuedAt }, pem, {
    algorithm: "ES256",
    header: { alg: "ES256", kid: keyId },
  });

  cachedProviderToken = { jwt: token, expiresAt: now + JWT_TTL_MS };
  return token;
}

export interface APNsSendResult {
  token: string;
  success: boolean;
  apnsId?: string;
  reason?: string;
  status?: number;
}

interface SingleSendOutcome {
  status: number;
  apnsId?: string;
  reason?: string;
}

/**
 * Send to a single device token over an existing http2 session.
 * Returns the HTTP status + any APNs reason string from the body.
 */
function sendOne(
  client: http2.ClientHttp2Session,
  deviceToken: string,
  payload: object,
  bundleId: string,
  providerJwt: string,
): Promise<SingleSendOutcome> {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      authorization: `bearer ${providerJwt}`,
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });

    let status = 0;
    let apnsId: string | undefined;
    let raw = "";

    req.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
      const id = headers["apns-id"];
      apnsId = Array.isArray(id) ? id[0] : (id as string | undefined);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let reason: string | undefined;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.reason === "string") {
            reason = parsed.reason;
          }
        } catch {
          // ignore non-JSON body (Apple usually returns JSON on error)
        }
      }
      resolve({ status, apnsId, reason });
    });
    req.on("error", (err) => {
      resolve({ status: 0, reason: `request_error: ${err.message}` });
    });

    req.end(body);
  });
}

/**
 * Send a single notification to many APNs device tokens.
 * Reuses one HTTP/2 session for the whole batch (Apple recommends this).
 */
export async function sendAPNsNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<APNsSendResult[]> {
  if (tokens.length === 0) return [];
  if (!isAPNsConfigured()) {
    console.warn(
      "[APNs] sendAPNsNotification called but APNs not configured — failing all",
    );
    return tokens.map((token) => ({
      token,
      success: false,
      reason: "APNs not configured",
    }));
  }

  const { bundleId, useSandbox } = getConfig();
  const host = useSandbox ? APNS_SANDBOX_HOST : APNS_PROD_HOST;
  const providerJwt = getProviderToken();

  // Build APNs payload. Custom data goes alongside (NOT inside) "aps".
  const payload: Record<string, unknown> = {
    aps: {
      alert: { title, body },
      sound: "default",
    },
  };
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      if (k === "aps") continue; // never let caller overwrite aps
      payload[k] = v;
    }
  }

  const client = http2.connect(`https://${host}:${APNS_PORT}`);
  const sessionErrors: Error[] = [];
  client.on("error", (err) => sessionErrors.push(err));

  const results: APNsSendResult[] = [];
  try {
    // Send sequentially over the single connection. Apple is happy with
    // concurrent streams too, but for 5–500 tokens sequential is plenty
    // and avoids overwhelming a single h2 session.
    for (const token of tokens) {
      try {
        const outcome = await sendOne(
          client,
          token,
          payload,
          bundleId,
          providerJwt,
        );
        const success = outcome.status === 200;
        results.push({
          token,
          success,
          apnsId: outcome.apnsId,
          reason: outcome.reason,
          status: outcome.status,
        });
      } catch (err: any) {
        results.push({
          token,
          success: false,
          reason: `send_error: ${err?.message || String(err)}`,
        });
      }
    }
  } finally {
    client.close();
  }

  if (sessionErrors.length > 0) {
    console.error(
      `[APNs] HTTP/2 session reported ${sessionErrors.length} error(s); first:`,
      sessionErrors[0]?.message,
    );
  }

  return results;
}
