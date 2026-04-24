// Pickup-notification cron — Family C (Smart Family Lobby).
//
// Every PICKUP_INTERVAL_MS the job scans for sessions ending in the next
// ~10 minutes that have at least one enrolled family-member player. For each
// such session we push a short "pickup soon" notification to every device
// belonging to any member of the same family group, so whichever phone is
// currently logged in (the parent's, a sibling's, etc.) gets the heads-up.
//
// Spam control: a session is reminded at most once (sessions.reminder30mSent
// is reused as the dedupe flag — repurposed here as "pickup reminder sent").
// In addition, a per-device 30-minute window prevents the same device from
// receiving two pickup pushes in quick succession, which keeps a 5-session
// afternoon from machine-gunning a phone with notifications.

import { db } from "./db";
import {
  sessions,
  sessionPlayers,
  familyMembers,
  pushDeviceTokens,
  players,
} from "@shared/schema";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { sendPushNotification } from "./pushNotifications";

const PICKUP_INTERVAL_MS = 60 * 1000; // run every minute
const PICKUP_LEAD_MIN = 10; // notify ~10 min before session end
const PICKUP_WINDOW_MS = 5 * 60 * 1000; // tolerate 5 min jitter so we don't miss a tick
const DEVICE_DEDUPE_MS = 30 * 60 * 1000; // 30 min per-device backoff

const recentDevicePush = new Map<string, number>();

interface PickupCandidate {
  sessionId: string;
  playerId: string;
  playerName: string;
  endTime: Date;
}

async function runPickupReminders(): Promise<void> {
  try {
    const now = new Date();
    const earliest = new Date(now.getTime() + (PICKUP_LEAD_MIN * 60 * 1000) - PICKUP_WINDOW_MS);
    const latest = new Date(now.getTime() + (PICKUP_LEAD_MIN * 60 * 1000) + PICKUP_WINDOW_MS);

    // Find sessions ending in the lead window that haven't been reminded yet.
    // We piggy-back on `reminder30mSent` as the dedupe flag — once flipped
    // true, the row will never be picked up again.
    const candidateSessions = await db
      .select({
        id: sessions.id,
        endTime: sessions.endTime,
        status: sessions.status,
      })
      .from(sessions)
      .where(
        and(
          gte(sessions.endTime, earliest),
          lte(sessions.endTime, latest),
          eq(sessions.reminder30mSent, false),
        ),
      );

    if (candidateSessions.length === 0) return;

    const sessionIds = candidateSessions
      .filter((s) => s.status !== "cancelled")
      .map((s) => s.id);
    if (sessionIds.length === 0) return;

    // Pull enrolment + player info for each candidate session.
    const enrolments = await db
      .select({
        sessionId: sessionPlayers.sessionId,
        playerId: sessionPlayers.playerId,
        playerName: players.name,
        endTime: sessions.endTime,
      })
      .from(sessionPlayers)
      .innerJoin(players, eq(sessionPlayers.playerId, players.id))
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(inArray(sessionPlayers.sessionId, sessionIds));

    if (enrolments.length === 0) return;

    // Restrict to players that belong to a family group (single-member groups
    // count — solo players still get their own pickup nudge to whichever
    // device they're signed in on).
    const enrolledPlayerIds = Array.from(new Set(enrolments.map((e) => e.playerId)));
    const familyRows = await db
      .select({
        playerId: familyMembers.playerId,
        familyGroupId: familyMembers.familyGroupId,
      })
      .from(familyMembers)
      .where(inArray(familyMembers.playerId, enrolledPlayerIds));

    if (familyRows.length === 0) {
      // No enrolled player is in a family yet → nothing to push, but still
      // mark the sessions as reminded so the next tick doesn't re-evaluate.
      await db
        .update(sessions)
        .set({ reminder30mSent: true })
        .where(inArray(sessions.id, sessionIds));
      return;
    }

    const familyGroupByPlayer = new Map<string, string>();
    for (const row of familyRows) {
      familyGroupByPlayer.set(row.playerId, row.familyGroupId);
    }

    // Group push targets: for each family group, accumulate the candidates
    // (one notification per candidate so the message is specific) and the
    // set of recipient playerIds (= every member of that family group).
    const allFamilyGroupIds = Array.from(new Set(familyRows.map((r) => r.familyGroupId)));
    const allFamilyMemberRows = await db
      .select({
        familyGroupId: familyMembers.familyGroupId,
        playerId: familyMembers.playerId,
      })
      .from(familyMembers)
      .where(inArray(familyMembers.familyGroupId, allFamilyGroupIds));

    const recipientsByGroup = new Map<string, string[]>();
    for (const row of allFamilyMemberRows) {
      const list = recipientsByGroup.get(row.familyGroupId) ?? [];
      list.push(row.playerId);
      recipientsByGroup.set(row.familyGroupId, list);
    }

    // Pre-fetch tokens for every recipient in one batch.
    const recipientPlayerIds = Array.from(
      new Set(Array.from(recipientsByGroup.values()).flat()),
    );
    const tokenRows = recipientPlayerIds.length
      ? await db
          .select({
            playerId: pushDeviceTokens.playerId,
            token: pushDeviceTokens.token,
          })
          .from(pushDeviceTokens)
          .where(
            and(
              inArray(pushDeviceTokens.playerId, recipientPlayerIds),
              eq(pushDeviceTokens.isActive, true),
            ),
          )
      : [];
    const tokensByPlayer = new Map<string, string[]>();
    for (const t of tokenRows) {
      if (!t.playerId || !t.token) continue;
      const list = tokensByPlayer.get(t.playerId) ?? [];
      list.push(t.token);
      tokensByPlayer.set(t.playerId, list);
    }

    const candidates: PickupCandidate[] = enrolments
      .filter((e) => familyGroupByPlayer.has(e.playerId) && e.endTime)
      .map((e) => ({
        sessionId: e.sessionId,
        playerId: e.playerId,
        playerName: e.playerName,
        endTime: e.endTime!,
      }));

    const nowMs = Date.now();
    const remindedSessionIds = new Set<string>();

    for (const c of candidates) {
      const groupId = familyGroupByPlayer.get(c.playerId);
      if (!groupId) continue;
      const recipientIds = recipientsByGroup.get(groupId) ?? [];
      const tokens = new Set<string>();
      for (const recipient of recipientIds) {
        for (const t of tokensByPlayer.get(recipient) ?? []) {
          // Per-device dedupe: skip tokens that received a pickup push in
          // the last 30 minutes regardless of which session triggered it.
          const lastPushAt = recentDevicePush.get(t);
          if (lastPushAt && nowMs - lastPushAt < DEVICE_DEDUPE_MS) continue;
          tokens.add(t);
        }
      }

      if (tokens.size === 0) {
        remindedSessionIds.add(c.sessionId);
        continue;
      }

      const tokenList = Array.from(tokens);
      try {
        await sendPushNotification(
          tokenList,
          "Pickup soon",
          `${c.playerName}'s lesson ends in 10 min.`,
          { type: "family_pickup", sessionId: c.sessionId, playerId: c.playerId },
        );
        for (const t of tokenList) recentDevicePush.set(t, nowMs);
      } catch (err) {
        console.error("[FamilyPickup] sendPushNotification failed:", err);
      }
      remindedSessionIds.add(c.sessionId);
    }

    // Mark every candidate session as reminded — including those for which
    // we suppressed the push (no tokens / dedupe). This avoids re-scanning
    // the same row every tick.
    const allCandidateIds = Array.from(new Set(sessionIds));
    if (allCandidateIds.length > 0) {
      await db
        .update(sessions)
        .set({ reminder30mSent: true })
        .where(inArray(sessions.id, allCandidateIds));
    }
  } catch (err) {
    console.error("[FamilyPickup] Job failed:", err);
  }
}

// Periodically prune the device-dedupe map so it doesn't grow forever on a
// long-lived process. Anything older than DEVICE_DEDUPE_MS is no longer
// blocking a push and can be dropped.
function pruneDeviceDedupe(): void {
  const cutoff = Date.now() - DEVICE_DEDUPE_MS;
  for (const [token, ts] of recentDevicePush) {
    if (ts < cutoff) recentDevicePush.delete(token);
  }
}

export function startFamilyPickupNotificationsJob(): void {
  console.log("[FamilyPickup] Starting pickup-notification job (every 1 min)");
  // Delay first run by 45s so it doesn't pile on top of the booking expiry
  // job's 30s startup delay.
  setTimeout(() => {
    runPickupReminders();
    setInterval(runPickupReminders, PICKUP_INTERVAL_MS);
    setInterval(pruneDeviceDedupe, DEVICE_DEDUPE_MS);
  }, 45_000);
}

// Internal export used only by the lobby smoke test, not part of the public
// surface. Lets a test trigger one pass of the job synchronously.
export const __runPickupRemindersForTest = runPickupReminders;
