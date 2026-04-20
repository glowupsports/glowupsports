/**
 * scripts/ops/nudge-photo-upload-retry.ts
 *
 * Task #836 — One-shot in-app + push nudge for the 7 students who silently
 * failed their profile-photo upload during onboarding before Task #832
 * fixed the broken expo-file-system File-as-Blob path in
 * `client/lib/uploads.ts`.
 *
 * What it does, per player:
 *   1. Inserts a `player_notifications` row (idempotent — skipped if a
 *      previous row with `data->>source = 'task-832-photo-retry'`
 *      already exists for that player).
 *   2. Best-effort push fan-out to every active push token registered
 *      for the player via `sendPushNotification` from
 *      `server/pushNotifications.ts` (handles both Expo and FCM tokens).
 *
 * Prints a summary table at the end:
 *   name | notif_inserted | push_sent | photo_url_now
 *
 * Pre-flight: the production OTA carrying #832 must already be live
 * before running — otherwise the players will retry on the still-broken
 * bundle and fail again.
 *
 * Usage:
 *   tsx scripts/ops/nudge-photo-upload-retry.ts                # nudges the 7 hard-coded IDs
 *   tsx scripts/ops/nudge-photo-upload-retry.ts <id> <id> ...  # nudges only the supplied IDs
 *   tsx scripts/ops/nudge-photo-upload-retry.ts --dry-run      # no writes, just preview
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { players, playerNotifications } from "../../shared/schema";
import {
  getPlayerPushTokens,
  sendPushNotification,
} from "../../server/pushNotifications";

const DEFAULT_PLAYER_IDS = [
  "9114367a-2606-46a7-b325-9c48f7e0a312", // Eesa Khan
  "930d9a85-f6dc-4d24-99a2-22ae39a75a66", // Robert Tikhonenko
  "568157c8-b95d-4218-acc3-bb50ae9cb91f", // Dalvin
  "4efefa74-eaf6-4a9f-ba5f-c145c31d193a", // Dhika
  "2e87774d-b334-4210-96c8-966bfe7efad8", // Abdulla Khoory
  "0d032685-f8c4-455d-bd72-ddd383db4731", // Khalifa BinHendi
  "08134bc5-f430-4064-bcea-ee00603857d9", // Karim Deghaili
];

const SOURCE_TAG = "task-832-photo-retry";
const TITLE = "Add your profile photo";
const BODY =
  "Your photo upload didn't go through last time. Tap to try again — it works now.";
const DATA = {
  type: "system",
  source: SOURCE_TAG,
  deeplink: "player/edit-profile",
  screen: "EditProfile",
} as const;

type RowSummary = {
  playerId: string;
  name: string;
  notifInserted: "yes" | "skipped" | "error";
  pushSent: "yes" | "no_tokens" | "error" | "skipped";
  pushTicketCount: number;
  photoUrlNow: string;
};

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const explicitIds = argv.filter(
    (arg) => !arg.startsWith("--") && /^[0-9a-f-]{36}$/i.test(arg),
  );
  const playerIds = explicitIds.length > 0 ? explicitIds : DEFAULT_PLAYER_IDS;

  console.log(
    `[nudge-photo-upload-retry]${dryRun ? " [dry-run]" : ""} starting — ${playerIds.length} player(s)`,
  );

  const playerRows = await db
    .select({
      id: players.id,
      name: players.name,
      profilePhotoUrl: players.profilePhotoUrl,
    })
    .from(players)
    .where(inArray(players.id, playerIds));

  const byId = new Map(playerRows.map((p) => [p.id, p]));

  const summary: RowSummary[] = [];

  for (const playerId of playerIds) {
    const player = byId.get(playerId);
    const name = player?.name ?? "(missing)";
    const photoUrlNow = player?.profilePhotoUrl ? "set" : "null";

    if (!player) {
      console.warn(`[${playerId}] player row not found — skipping`);
      summary.push({
        playerId,
        name,
        notifInserted: "error",
        pushSent: "skipped",
        pushTicketCount: 0,
        photoUrlNow: "missing",
      });
      continue;
    }

    let notifInserted: RowSummary["notifInserted"] = "error";
    try {
      const existing = await db
        .select({ id: playerNotifications.id })
        .from(playerNotifications)
        .where(
          and(
            eq(playerNotifications.playerId, playerId),
            sql`${playerNotifications.data}->>'source' = ${SOURCE_TAG}`,
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        notifInserted = "skipped";
        console.log(
          `[${playerId}] ${name} — existing nudge row found, skipping insert`,
        );
      } else if (dryRun) {
        notifInserted = "yes";
        console.log(`[${playerId}] ${name} — would insert notification`);
      } else {
        await db.insert(playerNotifications).values({
          playerId,
          title: TITLE,
          body: BODY,
          type: "system",
          data: DATA,
        });
        notifInserted = "yes";
        console.log(`[${playerId}] ${name} — notification inserted`);
      }
    } catch (err) {
      console.error(
        `[${playerId}] ${name} — failed to insert notification:`,
        err,
      );
      notifInserted = "error";
    }

    let pushSent: RowSummary["pushSent"] = "skipped";
    let pushTicketCount = 0;
    try {
      const tokens = await getPlayerPushTokens(playerId);
      if (tokens.length === 0) {
        pushSent = "no_tokens";
        console.log(`[${playerId}] ${name} — 0 push tokens, skipping push`);
      } else if (dryRun) {
        pushSent = "yes";
        pushTicketCount = tokens.length;
        console.log(
          `[${playerId}] ${name} — would push to ${tokens.length} token(s)`,
        );
      } else {
        // Pass undefined for playerId so sendPushNotification doesn't double-insert
        // a player_notifications row — we already inserted it above with the
        // proper source-tagged data payload.
        const tickets = await sendPushNotification(
          tokens,
          TITLE,
          BODY,
          DATA,
          undefined,
        );
        const okCount = tickets.filter((t) => t.status === "ok").length;
        pushTicketCount = okCount;
        pushSent = okCount > 0 ? "yes" : "error";
        console.log(
          `[${playerId}] ${name} — push fan-out: ${okCount}/${tickets.length} ok across ${tokens.length} token(s)`,
        );
      }
    } catch (err) {
      console.error(`[${playerId}] ${name} — push fan-out failed:`, err);
      pushSent = "error";
    }

    summary.push({
      playerId,
      name,
      notifInserted,
      pushSent,
      pushTicketCount,
      photoUrlNow,
    });
  }

  console.log("\n=== Summary ===");
  console.log(
    "name".padEnd(24),
    "notif_inserted".padEnd(16),
    "push_sent".padEnd(12),
    "tickets".padEnd(8),
    "photo_url_now",
  );
  console.log("-".repeat(80));
  for (const row of summary) {
    console.log(
      (row.name || "").padEnd(24),
      row.notifInserted.padEnd(16),
      row.pushSent.padEnd(12),
      String(row.pushTicketCount).padEnd(8),
      row.photoUrlNow,
    );
  }

  const inserted = summary.filter((r) => r.notifInserted === "yes").length;
  const skipped = summary.filter((r) => r.notifInserted === "skipped").length;
  const pushed = summary.filter((r) => r.pushSent === "yes").length;
  const noTokens = summary.filter((r) => r.pushSent === "no_tokens").length;
  console.log(
    `\nTotals: ${inserted} inserted, ${skipped} skipped, ${pushed} pushed, ${noTokens} without tokens`,
  );

  await pool.end();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[nudge-photo-upload-retry] fatal:", err);
    process.exit(1);
  });
