/**
 * scripts/push-update-prompt-android.ts
 *
 * Android-side companion to push-update-prompt.ts. Sends one "Update available"
 * push to ALL active Android tokens. Same rationale as the iOS script: the
 * server-side `minSupportedVersion: "1.3.6"` only blocks installs whose binary
 * already contains the ForceUpdateGate, which the older Play Store builds
 * don't have. So the gate cannot reach them — we nudge them via push instead.
 *
 * Android tokens are FCM tokens; sendPushNotification() already routes those
 * through Firebase Admin SDK, so this just works without the APNs detour the
 * iOS script needed.
 *
 * Default-safe: without `--send` the script runs in dry-run mode and only
 * prints what it WOULD do. To actually deliver, pass `--send` explicitly.
 *
 * Usage:
 *   npx tsx scripts/push-update-prompt-android.ts            # dry-run
 *   npx tsx scripts/push-update-prompt-android.ts --send     # actually deliver
 */

import { pool } from "../server/db";
import { sendPushNotification } from "../server/pushNotifications";
import { getAppVersionConfigForPlatform } from "../server/config/appVersion";

const TITLE = "Update available";
const BODY =
  "A new version of Glow Up Sports is ready. Open the Play Store to update.";
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 250;

function maskToken(token: string): string {
  return token.slice(0, 8);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const wantsSend = args.includes("--send");
  const isDryRun = !wantsSend;
  const mode = isDryRun ? "DRY-RUN" : "SEND";
  console.log(`[push-update-prompt-android] starting (mode=${mode})`);

  const androidCfg = getAppVersionConfigForPlatform("android");
  const data: Record<string, unknown> = {
    type: "app_update_prompt",
    url: androidCfg.storeUrl,
  };

  // All active Android tokens. No 180-day cutoff — the Android pool is small
  // (single digits) and the user explicitly asked to nudge anyone who hasn't
  // updated yet, so we don't want to silently drop borderline-stale tokens.
  const tokensResult = await pool.query<{ token: string; user_id: string }>(`
    SELECT token, user_id
      FROM push_device_tokens
     WHERE platform = 'android'
       AND COALESCE(is_active, true) = true
       AND token IS NOT NULL
       AND token <> ''
  `);

  const tokens = tokensResult.rows.map((r) => r.token);
  console.log(
    `[push-update-prompt-android] found ${tokens.length} active Android token(s)`,
  );
  for (const r of tokensResult.rows) {
    console.log(
      `[push-update-prompt-android]   user=${r.user_id} token=${maskToken(r.token)}...`,
    );
  }
  console.log(`[push-update-prompt-android] title: "${TITLE}"`);
  console.log(`[push-update-prompt-android] body : "${BODY}"`);
  console.log(
    `[push-update-prompt-android] data : ${JSON.stringify(data)}`,
  );

  if (tokens.length === 0) {
    console.log("[push-update-prompt-android] no tokens — exiting.");
    process.exit(0);
  }

  if (isDryRun) {
    console.log(
      `[push-update-prompt-android] dry-run: would send to ${tokens.length} Android device(s). Re-run with --send to actually deliver.`,
    );
    process.exit(0);
  }

  let sentOk = 0;
  let sentFail = 0;
  const failedPrefixes: string[] = [];

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tokens.length / BATCH_SIZE);

    console.log(
      `[push-update-prompt-android] sending batch ${batchNum}/${totalBatches} (${batch.length})`,
    );

    try {
      const tickets = await sendPushNotification(batch, TITLE, BODY, data);
      let okThisBatch = 0;
      let failThisBatch = 0;
      for (let j = 0; j < batch.length; j++) {
        const ticket = tickets[j];
        if (ticket?.status === "ok") {
          okThisBatch++;
        } else {
          failThisBatch++;
          failedPrefixes.push(maskToken(batch[j]));
        }
      }
      sentOk += okThisBatch;
      sentFail += failThisBatch;
      console.log(
        `[push-update-prompt-android]   batch ${batchNum} done: ok=${okThisBatch} fail=${failThisBatch}`,
      );
    } catch (err) {
      console.error(
        `[push-update-prompt-android]   batch ${batchNum} threw:`,
        err,
      );
      sentFail += batch.length;
      for (const t of batch) failedPrefixes.push(maskToken(t));
    }

    if (i + BATCH_SIZE < tokens.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(
    `[push-update-prompt-android] DONE: ${tokens.length} attempted, ${sentOk} ok, ${sentFail} failed`,
  );
  if (failedPrefixes.length > 0) {
    console.log(
      `[push-update-prompt-android] failed prefixes: ${failedPrefixes.join(", ")}`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[push-update-prompt-android] FAILED:", err);
  process.exit(1);
});
