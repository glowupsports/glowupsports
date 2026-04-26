/**
 * One-shot push to thelaw's iOS devices (iPad + any other Apple installs).
 * Bypasses is_active filter — thelaw's tokens were flagged inactive by an
 * earlier FCM/Expo failure but the device is verifiably still in use
 * (last_used_at within the last 24h).
 */

import { pool } from "../server/db";
import { sendPushNotification } from "../server/pushNotifications";
import { getAppVersionConfigForPlatform } from "../server/config/appVersion";

const THELAW_USER_ID = "3750b8a8-f35b-49c6-ac87-7fd3e6d56db1";
const TITLE = "Update available";
const BODY =
  "A new version of Glow Up Sports is ready. Open the App Store to update.";

async function main(): Promise<void> {
  const wantsSend = process.argv.includes("--send");

  const iosCfg = getAppVersionConfigForPlatform("ios");
  const data: Record<string, unknown> = {
    type: "app_update_prompt",
    url: iosCfg.storeUrl,
  };

  const result = await pool.query<{ token: string; last_used_at: Date }>(
    `SELECT token, last_used_at
       FROM push_device_tokens
      WHERE user_id = $1
        AND platform = 'ios'
        AND last_used_at > NOW() - INTERVAL '90 days'
      ORDER BY last_used_at DESC`,
    [THELAW_USER_ID],
  );

  const tokens = result.rows.map((r) => r.token);
  console.log(
    `[push-thelaw] found ${tokens.length} iOS token(s) for thelaw (last 90d)`,
  );
  for (const row of result.rows) {
    console.log(
      `[push-thelaw]   - ${row.token.slice(0, 8)}... last_used=${row.last_used_at.toISOString()}`,
    );
  }

  if (tokens.length === 0) {
    console.log("[push-thelaw] no tokens — exiting.");
    process.exit(0);
  }

  if (!wantsSend) {
    console.log("[push-thelaw] dry-run. Re-run with --send to deliver.");
    process.exit(0);
  }

  const tickets = await sendPushNotification(tokens, TITLE, BODY, data);
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tickets[i];
    if (t?.status === "ok") {
      ok++;
      console.log(`[push-thelaw] ok    ${tokens[i].slice(0, 8)}...`);
    } else {
      fail++;
      console.log(
        `[push-thelaw] FAIL  ${tokens[i].slice(0, 8)}... reason=${t?.message ?? "(no message)"}`,
      );
    }
  }
  console.log(`[push-thelaw] done: ok=${ok} fail=${fail}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[push-thelaw] FAILED:", err);
  process.exit(1);
});
