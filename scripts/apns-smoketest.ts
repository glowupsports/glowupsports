/**
 * APNs smoke test — sends one push to a known-fake device token.
 *
 * Usage:  npx tsx scripts/apns-smoketest.ts
 *
 * Healthy outcome: Apple replies HTTP 400 with reason "BadDeviceToken"
 * AND a real apns-id header. That proves the JWT (Team ID + Key ID +
 * .p8 signing), the bundle id, and the HTTP/2 transport to
 * api.push.apple.com all work end-to-end. Any other reason ("Invalid
 * ProviderToken", "MissingProviderToken", "TopicDisallowed", network
 * errors) points to a real config problem, not the fake token.
 *
 * Use this whenever APNs credentials change or you suspect Apple has
 * stopped accepting our provider auth. Safe to re-run any time — the
 * fake token cannot deliver to a real device.
 */
import { sendAPNsNotification, isAPNsConfigured } from "../server/apns";

async function main() {
  console.log("[smoketest] APNs configured:", isAPNsConfigured());
  if (!isAPNsConfigured()) {
    console.error("[smoketest] missing APNS_AUTH_KEY_P8 / APNS_KEY_ID");
    process.exit(1);
  }
  const fakeToken = "0000000000000000000000000000000000000000000000000000000000000000";
  console.log("[smoketest] sending to a known-fake token to verify auth+transport...");
  const res = await sendAPNsNotification(
    [fakeToken],
    "Smoke test",
    "If Apple replies BadDeviceToken, auth works.",
    { type: "smoketest" }
  );
  console.log("[smoketest] result:", JSON.stringify(res, null, 2));
  // BadDeviceToken (400) = auth/transport are good
  // InvalidProviderToken (403) = JWT is wrong
  // MissingProviderToken (403) = no auth header
  // ExpiredProviderToken (403) = JWT past iat+1h
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
