/**
 * scripts/push-update-prompt.ts
 *
 * Task #1359 — One-shot push notification to all active iOS installs
 * inviting them to update via the App Store.
 *
 * Background:
 *   The server-side `minSupportedVersion: "1.3.6"` (Task #1358) only blocks
 *   iOS installs whose binary contains the `ForceUpdateGate` code from
 *   Task #1321 (merged 2026-04-25). The iOS 1.3.4 binary was built on
 *   2026-04-19 — six days before the gate existed — so those installs
 *   never call `/api/app-version` and never see the blocking screen.
 *
 *   We also do NOT store the installed app version in `push_device_tokens`,
 *   so we can only filter on `platform`, not on version. This script
 *   therefore sends one push to ALL active iOS tokens. Recipients already
 *   on 1.3.6 who tap through will land on the App Store and see no update
 *   button — harmless. Recipients on 1.3.4 / 1.3.5 get the nudge the
 *   force-gate cannot give them.
 *
 *   NOTE (Task #1360): in this codebase the iOS rows in `push_device_tokens`
 *   are raw 64-char APNs device tokens. Neither Expo Push API nor Firebase
 *   Admin SDK accepts those as-is, so a `--send` run will currently report
 *   every iOS token as failed until #1360 fixes the iOS push pipeline.
 *   This script is intentionally complete and ready to deliver the moment
 *   #1360 lands and stored iOS tokens become routable.
 *
 * Default-safe: without `--send` the script runs in dry-run mode and only
 * prints what it WOULD do. To actually deliver, pass `--send` explicitly.
 *
 * Usage:
 *   npx tsx scripts/push-update-prompt.ts              # dry-run (default)
 *   npx tsx scripts/push-update-prompt.ts --dry-run    # explicit dry-run
 *   npx tsx scripts/push-update-prompt.ts --send       # actually deliver
 */

import { pool } from "../server/db";
import { sendPushNotification } from "../server/pushNotifications";
import { getAppVersionConfigForPlatform } from "../server/config/appVersion";

const TITLE = "Update available";
const BODY =
  "A new version of Glow Up Sports is ready. Open the App Store to update.";
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 250;
const MAX_FAILED_PREFIXES_LOGGED = 20;

function maskToken(token: string): string {
  return token.slice(0, 8);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const wantsSend = args.includes("--send");
  const wantsDryRun = args.includes("--dry-run");

  if (wantsSend && wantsDryRun) {
    console.error(
      "[push-update-prompt] cannot pass both --dry-run and --send. pick one.",
    );
    process.exit(1);
  }

  // Default-safe: anything that isn't an explicit --send is a dry-run.
  const isDryRun = !wantsSend;
  const mode = isDryRun ? "DRY-RUN" : "SEND";
  console.log(`[push-update-prompt] starting (mode=${mode})`);

  const iosCfg = getAppVersionConfigForPlatform("ios");
  const data: Record<string, unknown> = {
    type: "app_update_prompt",
    url: iosCfg.storeUrl,
  };

  // Strict cutoff per task spec: tokens with a recent last_used_at only.
  // Tokens with last_used_at IS NULL are treated as inactive.
  const tokensResult = await pool.query<{ token: string }>(`
    SELECT token
      FROM push_device_tokens
     WHERE platform = 'ios'
       AND COALESCE(is_active, true) = true
       AND last_used_at > NOW() - INTERVAL '180 days'
  `);

  const skippedAndroidResult = await pool.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count
      FROM push_device_tokens
     WHERE platform = 'android'
       AND COALESCE(is_active, true) = true
  `);

  const tokens = tokensResult.rows.map((r) => r.token).filter(Boolean);
  const samplePrefixes = tokens.slice(0, 3).map(maskToken);

  console.log(
    `[push-update-prompt] found ${tokens.length} active iOS token(s)`,
  );
  console.log(
    `[push-update-prompt] (skipping ${skippedAndroidResult.rows[0]?.count ?? 0} Android tokens — Android force-gate already covers them)`,
  );
  // Dry-run only: surface a few token prefixes so an operator can sanity-check
  // which devices are about to be hit. In a real --send run we keep the log
  // surface minimal and only emit prefixes for failures (handled below).
  if (!wantsSend) {
    console.log(
      `[push-update-prompt] sample iOS token prefixes: ${samplePrefixes.join(", ") || "(none)"}`,
    );
  }
  console.log(`[push-update-prompt] notification title: "${TITLE}"`);
  console.log(`[push-update-prompt] notification body:  "${BODY}"`);
  console.log(
    `[push-update-prompt] notification data:  ${JSON.stringify(data)}`,
  );

  if (tokens.length === 0) {
    console.log("[push-update-prompt] no tokens to send to — exiting.");
    process.exit(0);
  }

  if (isDryRun) {
    console.log(
      `[push-update-prompt] dry-run: would send to ${tokens.length} iOS device(s). Re-run with --send to actually deliver.`,
    );
    process.exit(0);
  }

  let sentOk = 0;
  let sentFail = 0;
  const failedPrefixes: string[] = [];
  const totalBatches = Math.ceil(tokens.length / BATCH_SIZE);

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    console.log(
      `[push-update-prompt] sending batch ${batchNum}/${totalBatches} (${batch.length} tokens)`,
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
        `[push-update-prompt]   batch ${batchNum} done: ok=${okThisBatch} fail=${failThisBatch}`,
      );
    } catch (err) {
      console.error(`[push-update-prompt]   batch ${batchNum} threw:`, err);
      sentFail += batch.length;
      for (const t of batch) failedPrefixes.push(maskToken(t));
    }

    if (i + BATCH_SIZE < tokens.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(
    `[push-update-prompt] iOS push update prompt: ${tokens.length} attempted, ${sentOk} ok, ${sentFail} failed`,
  );
  if (failedPrefixes.length > 0) {
    console.log(
      `[push-update-prompt] failed token prefixes (first ${MAX_FAILED_PREFIXES_LOGGED}): ${failedPrefixes.slice(0, MAX_FAILED_PREFIXES_LOGGED).join(", ")}`,
    );
  }

  // Hard-exit: server/db.ts kicks off a long chain of background ALTER TABLE
  // migrations on import. pool.end() would wait for that chain to drain and
  // make this script appear to hang for a minute or more. We are done.
  process.exit(0);
}

main().catch((err) => {
  console.error("[push-update-prompt] FAILED:", err);
  process.exit(1);
});
