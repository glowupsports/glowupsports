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
 * Default-safe: without `--send` the script runs in dry-run mode and only
 * prints what it WOULD do. To actually deliver, pass `--send` explicitly.
 *
 * Lean by design: this script does NOT import `server/db` or
 * `server/pushNotifications`. Both pull in the entire storage / migrations
 * / AI / email dependency tree, which makes a one-shot CLI take 60+s to
 * boot. We open our own dedicated `pg.Pool` and talk to Expo Push + FCM
 * directly (FCM via the small `server/fcm.ts` helper).
 *
 * Usage:
 *   npx tsx scripts/push-update-prompt.ts              # dry-run (default)
 *   npx tsx scripts/push-update-prompt.ts --dry-run    # explicit dry-run
 *   npx tsx scripts/push-update-prompt.ts --send       # actually deliver
 */

import pkg from "pg";
import {
  initializeFirebase,
  isFCMToken,
  sendFCMNotification,
} from "../server/fcm";
import { getAppVersionConfigForPlatform } from "../server/config/appVersion";

const { Pool } = pkg;

const TITLE = "Update available";
const BODY =
  "A new version of Glow Up Sports is ready. Open the App Store to update.";
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 250;
const MAX_FAILED_PREFIXES_LOGGED = 20;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoTicket {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data?: ExpoTicket[];
}

function maskToken(token: string): string {
  return token.slice(0, 8);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendViaExpo(
  tokens: string[],
  data: Record<string, unknown>,
): Promise<{ ok: number; fail: number; failedPrefixes: string[] }> {
  if (tokens.length === 0) return { ok: 0, fail: 0, failedPrefixes: [] };

  const messages = tokens.map((token) => ({
    to: token,
    title: TITLE,
    body: BODY,
    data,
    sound: "default" as const,
    priority: "high" as const,
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  const json = (await res.json()) as ExpoPushResponse;
  const tickets = json.data ?? [];

  let ok = 0;
  let fail = 0;
  const failedPrefixes: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const ticket = tickets[i];
    if (ticket?.status === "ok") {
      ok++;
    } else {
      fail++;
      failedPrefixes.push(maskToken(tokens[i]));
    }
  }

  return { ok, fail, failedPrefixes };
}

async function sendViaFCM(
  tokens: string[],
  data: Record<string, unknown>,
): Promise<{ ok: number; fail: number; failedPrefixes: string[] }> {
  if (tokens.length === 0) return { ok: 0, fail: 0, failedPrefixes: [] };

  const results = await sendFCMNotification(tokens, TITLE, BODY, data, "default");

  let ok = 0;
  let fail = 0;
  const failedPrefixes: string[] = [];

  for (const r of results) {
    if (r.success) {
      ok++;
    } else {
      fail++;
      failedPrefixes.push(maskToken(r.token));
    }
  }

  return { ok, fail, failedPrefixes };
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

  const isDryRun = !wantsSend;
  const mode = isDryRun ? "DRY-RUN" : "SEND";
  console.log(`[push-update-prompt] starting (mode=${mode})`);

  const databaseUrl = process.env.SUPABASE_DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "[push-update-prompt] SUPABASE_DATABASE_URL is not set. aborting.",
    );
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 4,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 5_000,
  });

  try {
    if (!isDryRun) {
      const fbReady = initializeFirebase();
      if (!fbReady) {
        console.warn(
          "[push-update-prompt] Firebase NOT initialized — FCM tokens (likely 0 for iOS) will be skipped. Expo iOS tokens will still send.",
        );
      }
    }

    const iosCfg = getAppVersionConfigForPlatform("ios");
    const data: Record<string, unknown> = {
      type: "app_update_prompt",
      url: iosCfg.storeUrl,
    };

    const tokensResult = await pool.query<{ token: string }>(`
      SELECT token
        FROM push_device_tokens
       WHERE platform = 'ios'
         AND COALESCE(is_active, true) = true
         AND (last_used_at IS NULL OR last_used_at > NOW() - INTERVAL '180 days')
    `);

    const skippedAndroidResult = await pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
        FROM push_device_tokens
       WHERE platform = 'android'
         AND COALESCE(is_active, true) = true
    `);

    const tokens = tokensResult.rows.map((r) => r.token).filter(Boolean);

    let expoCount = 0;
    let fcmCount = 0;
    for (const t of tokens) {
      if (isFCMToken(t)) fcmCount++;
      else expoCount++;
    }

    console.log(
      `[push-update-prompt] found ${tokens.length} active iOS token(s) (${expoCount} Expo, ${fcmCount} FCM)`,
    );
    console.log(
      `[push-update-prompt] (skipping ${skippedAndroidResult.rows[0]?.count ?? 0} Android tokens — Android force-gate already covers them)`,
    );
    console.log(
      `[push-update-prompt] sample iOS token prefixes: ${tokens.slice(0, 3).map(maskToken).join(", ") || "(none)"}`,
    );
    console.log(`[push-update-prompt] notification title: "${TITLE}"`);
    console.log(`[push-update-prompt] notification body:  "${BODY}"`);
    console.log(
      `[push-update-prompt] notification data:  ${JSON.stringify(data)}`,
    );

    if (tokens.length === 0) {
      console.log("[push-update-prompt] no tokens to send to — exiting.");
      return;
    }

    if (isDryRun) {
      console.log(
        `[push-update-prompt] dry-run: would send to ${tokens.length} iOS device(s). Re-run with --send to actually deliver.`,
      );
      return;
    }

    let totalOk = 0;
    let totalFail = 0;
    const failedPrefixes: string[] = [];
    const totalBatches = Math.ceil(tokens.length / BATCH_SIZE);

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      const expoBatch: string[] = [];
      const fcmBatch: string[] = [];
      for (const t of batch) {
        if (isFCMToken(t)) fcmBatch.push(t);
        else expoBatch.push(t);
      }

      console.log(
        `[push-update-prompt] sending batch ${batchNum}/${totalBatches} (${batch.length} tokens: ${expoBatch.length} Expo, ${fcmBatch.length} FCM)`,
      );

      try {
        const [expoRes, fcmRes] = await Promise.all([
          sendViaExpo(expoBatch, data),
          sendViaFCM(fcmBatch, data),
        ]);

        const ok = expoRes.ok + fcmRes.ok;
        const fail = expoRes.fail + fcmRes.fail;
        totalOk += ok;
        totalFail += fail;
        failedPrefixes.push(...expoRes.failedPrefixes, ...fcmRes.failedPrefixes);

        console.log(
          `[push-update-prompt]   batch ${batchNum} done: ok=${ok} fail=${fail}`,
        );
      } catch (err) {
        console.error(`[push-update-prompt]   batch ${batchNum} threw:`, err);
        totalFail += batch.length;
        for (const t of batch) failedPrefixes.push(maskToken(t));
      }

      if (i + BATCH_SIZE < tokens.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    console.log(
      `[push-update-prompt] iOS push update prompt: ${tokens.length} attempted, ${totalOk} ok, ${totalFail} failed`,
    );
    if (failedPrefixes.length > 0) {
      console.log(
        `[push-update-prompt] failed token prefixes (first ${MAX_FAILED_PREFIXES_LOGGED}): ${failedPrefixes.slice(0, MAX_FAILED_PREFIXES_LOGGED).join(", ")}`,
      );
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error("[push-update-prompt] FAILED:", err);
  process.exit(1);
});
