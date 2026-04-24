// Family G — Graduation pre-notification cron (Task #1138).
//
// Runs once a day. For every family member whose 18th birthday is exactly
// 30 days away (UTC), we send a `playerNotifications` row to every member
// of the same family group with type `family_graduation_pending`.
//
// The same data row is consumed by Family Lobby to render an inline banner
// on Lawrence's card ("Becomes 18 in N days — start graduation"). We don't
// store an extra "banner shown" flag — Lobby derives the banner directly
// from `players.dateOfBirth` (via daysUntilEighteen) so it's always live.
//
// Idempotency: we tag the notification row with `data.graduationKey =
// "<playerId>:<isoDate>"` and skip insert if a matching row exists for this
// recipient. That makes restarts safe (the cron runs at boot too).

import { db } from "./db";
import {
  players,
  familyMembers,
  playerNotifications,
  accountGraduation,
} from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { daysUntilEighteen } from "./lib/account-graduation";

const DAY_MS = 24 * 60 * 60 * 1000;
const TICK_INTERVAL_MS = 60 * 60 * 1000; // re-check hourly so a missed UTC window catches up
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lastRunDateKey: string | null = null;

const THIRTY_DAY_WINDOW = 30;

function todayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function existingNotification(recipientPlayerId: string, key: string): Promise<boolean> {
  // The `data` column is JSON; postgres' ->> operator gives us the text value
  // for the `graduationKey` field.
  const rows = await db.execute(sql`
    SELECT 1
    FROM player_notifications
    WHERE player_id = ${recipientPlayerId}
      AND type = 'family_graduation_pending'
      AND (data ->> 'graduationKey') = ${key}
    LIMIT 1
  `);
  // drizzle's execute returns a `pg.QueryResult`-like shape; rows live on .rows.
  // @ts-expect-error untyped result
  return Array.isArray(rows?.rows) ? rows.rows.length > 0 : false;
}

async function notifyForGraduate(graduatePlayerId: string, dateKey: string, daysUntil: number): Promise<void> {
  const [graduate] = await db
    .select({ id: players.id, name: players.name })
    .from(players)
    .where(eq(players.id, graduatePlayerId))
    .limit(1);
  if (!graduate) return;

  // Skip if this account is already graduated.
  const [grad] = await db
    .select({ playerId: accountGraduation.playerId })
    .from(accountGraduation)
    .where(eq(accountGraduation.playerId, graduatePlayerId))
    .limit(1);
  if (grad) return;

  // Find every family group the graduate belongs to, then every member of
  // those groups. Notification fans out to all of them (including the
  // graduate themselves so they see the action in their inbox).
  const groupRows = await db
    .select({ familyGroupId: familyMembers.familyGroupId })
    .from(familyMembers)
    .where(eq(familyMembers.playerId, graduatePlayerId));
  if (groupRows.length === 0) return;
  const groupIds = groupRows.map((r) => r.familyGroupId);

  const memberRows = await db
    .select({ playerId: familyMembers.playerId })
    .from(familyMembers)
    .where(inArray(familyMembers.familyGroupId, groupIds));
  const recipientIds = Array.from(new Set(memberRows.map((m) => m.playerId)));

  const key = `${graduatePlayerId}:${dateKey}`;
  for (const recipientId of recipientIds) {
    if (await existingNotification(recipientId, key)) continue;
    await db.insert(playerNotifications).values({
      playerId: recipientId,
      title: `${graduate.name} becomes 18 in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
      body: `Would you like to graduate ${graduate.name}'s account into a fully independent one? Open Family Lobby to start.`,
      type: "family_graduation_pending",
      data: {
        graduationKey: key,
        graduatePlayerId,
        graduateName: graduate.name,
        daysUntil,
      },
    });
  }
}

export async function processGraduationPreNotifications(): Promise<{ processed: number; sent: number }> {
  const dateKey = todayUtcKey();
  let processed = 0;
  let sent = 0;

  // Pull all members with a DOB. The set is small enough (one row per family
  // member) that we can scan in JS — keeps the SQL trivial across DOB formats.
  const candidates = await db
    .select({ id: players.id, dateOfBirth: players.dateOfBirth })
    .from(players);

  for (const c of candidates) {
    if (!c.dateOfBirth) continue;
    const days = daysUntilEighteen(c.dateOfBirth);
    if (days === null) continue;
    if (days !== THIRTY_DAY_WINDOW) continue;
    processed++;
    try {
      await notifyForGraduate(c.id, dateKey, days);
      sent++;
    } catch (err) {
      console.error(`[FamilyGraduation] notify failed for ${c.id}:`, err);
    }
  }

  return { processed, sent };
}

export function startFamilyGraduationJob(): void {
  if (intervalHandle) {
    console.log("[FamilyGraduation] Scheduler already running");
    return;
  }
  console.log("[FamilyGraduation] Starting graduation pre-notification job (hourly tick, runs once per UTC day)");

  const runIfNewDay = async () => {
    const today = todayUtcKey();
    if (lastRunDateKey === today) return;
    lastRunDateKey = today;
    try {
      const result = await processGraduationPreNotifications();
      console.log(
        `[FamilyGraduation] daily pass for ${today}: processed=${result.processed} sent=${result.sent}`,
      );
    } catch (err) {
      console.error("[FamilyGraduation] daily pass failed:", err);
      // Re-allow retry if the run blew up.
      lastRunDateKey = null;
    }
  };

  // Boot run after 90s so we don't fight the rest of the startup.
  setTimeout(() => {
    void runIfNewDay();
  }, 90 * 1000);

  intervalHandle = setInterval(() => {
    void runIfNewDay();
  }, TICK_INTERVAL_MS);
}

export function stopFamilyGraduationJob(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[FamilyGraduation] Scheduler stopped");
  }
}

// Re-export a clear handle for unit testing.
export const __testing = {
  daysUntilEighteen,
  notifyForGraduate,
  processGraduationPreNotifications,
};
