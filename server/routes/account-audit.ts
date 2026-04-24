// Family F — Audit log + screen-time lock per account.
//
// Endpoints:
//   GET    /api/account/audit-log?playerId=…&limit=…&actorId=…
//                                          — list audit rows (last 90 days)
//   GET    /api/family/locks               — bulk lock state for caller's family
//   POST   /api/family/lock/:playerId      — lock an account; body { until, reason? }
//                                            requires PIN-elevation header (Family B)
//   DELETE /api/family/lock/:playerId      — unlock; body { pin } from EITHER the
//                                            locker OR the locked account's PIN
//
// Audit-log access: visible to the account owner AND every other member of the
// same family group. There is no role distinction between siblings, so the
// transparency-by-default rule from the task applies (Steps §1).
//
// Lock semantics:
//   - One row per locked player; absent row OR locked_until past = unlocked.
//   - The 60-second forced-disconnect SLA is satisfied by:
//       (a) immediate WebSocket close from this endpoint via
//           `disconnectPlayerSockets`, AND
//       (b) the auth middleware short-circuiting any subsequent HTTP request
//           from the locked player with 401 LOCKED.
//   - Push notifications fire on lock + unlock so other family members see it.

import { Router, Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import {
  accountAuditLog,
  accountLocks,
  accountPins,
  familyMembers,
  familyGroups,
  players,
} from "@shared/schema";
import { and, desc, eq, gte, inArray, sql as dsql } from "drizzle-orm";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type AuthenticatedRequest,
} from "../auth";
import { verifyAccountPin, verifyElevationToken } from "./account-pin";
import {
  writeAuditLog,
  getAccountLockState,
} from "../lib/account-audit";
import {
  disconnectPlayerSockets,
} from "../websocket";
import {
  sendPushNotification,
  getPlayerPushTokens,
} from "../pushNotifications";

const router = Router();

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const AUDIT_DEFAULT_LIMIT = 100;
const AUDIT_MAX_LIMIT = 500;
const MAX_LOCK_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // hard ceiling: 14 days

/**
 * Returns the set of playerIds the caller is allowed to read audit/lock state
 * for: themselves + every member of every family group they belong to + every
 * sibling reachable via the legacy email/parentEmail edges.
 *
 * Mirrors the visibility model used by /api/family/switch — same family = same
 * trust boundary.
 */
async function resolveCallerFamilyPlayerIds(callerPlayerId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  ids.add(callerPlayerId);

  // Symmetric family-groups model
  const groupRows = await db
    .select({ familyGroupId: familyMembers.familyGroupId })
    .from(familyMembers)
    .where(eq(familyMembers.playerId, callerPlayerId));
  const groupIds = groupRows.map((g) => g.familyGroupId);
  if (groupIds.length > 0) {
    const peers = await db
      .select({ playerId: familyMembers.playerId })
      .from(familyMembers)
      .where(inArray(familyMembers.familyGroupId, groupIds));
    for (const p of peers) ids.add(p.playerId);
  }

  // Legacy email/parentEmail fallbacks (covers accounts that haven't migrated)
  const callerPlayer = await storage.getPlayer(callerPlayerId);
  if (callerPlayer?.email) {
    const byEmail = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.email, callerPlayer.email));
    const byParentEmail = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.parentEmail, callerPlayer.email));
    for (const p of byEmail) ids.add(p.id);
    for (const p of byParentEmail) ids.add(p.id);
  }
  if (callerPlayer?.parentEmail) {
    const siblings = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.parentEmail, callerPlayer.parentEmail));
    for (const s of siblings) ids.add(s.id);
    const parents = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.email, callerPlayer.parentEmail));
    for (const p of parents) ids.add(p.id);
  }

  return ids;
}

// ---------------------------------------------------------------------------
// GET /api/account/audit-log
// Query: playerId? (defaults to self), limit?, actorId? (filter by actor)
// Returns rows from the last 90 days only, newest-first, with actor/target
// player names hydrated for the UI.
// ---------------------------------------------------------------------------
router.get(
  "/api/account/audit-log",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser?.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }
      const callerPlayerId = freshUser.playerId;

      const targetPlayerId =
        typeof req.query.playerId === "string" && req.query.playerId
          ? req.query.playerId
          : callerPlayerId;

      const allowed = await resolveCallerFamilyPlayerIds(callerPlayerId);
      if (!allowed.has(targetPlayerId)) {
        return res.status(403).json({ error: "Not in your family" });
      }

      const limitRaw = parseInt(String(req.query.limit ?? AUDIT_DEFAULT_LIMIT), 10);
      const limit = Math.max(1, Math.min(AUDIT_MAX_LIMIT, isNaN(limitRaw) ? AUDIT_DEFAULT_LIMIT : limitRaw));
      const actorFilter = typeof req.query.actorId === "string" ? req.query.actorId : null;

      const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
      const whereParts = [
        eq(accountAuditLog.playerId, targetPlayerId),
        gte(accountAuditLog.occurredAt, cutoff),
      ];
      if (actorFilter) whereParts.push(eq(accountAuditLog.actorPlayerId, actorFilter));

      const rows = await db
        .select()
        .from(accountAuditLog)
        .where(and(...whereParts))
        .orderBy(desc(accountAuditLog.occurredAt))
        .limit(limit);

      // Hydrate names for the UI in one round-trip.
      const playerIds = new Set<string>();
      for (const r of rows) {
        playerIds.add(r.playerId);
        if (r.actorPlayerId) playerIds.add(r.actorPlayerId);
      }
      const nameMap = new Map<string, string>();
      if (playerIds.size > 0) {
        const ps = await db
          .select({ id: players.id, name: players.name })
          .from(players)
          .where(inArray(players.id, Array.from(playerIds)));
        for (const p of ps) nameMap.set(p.id, p.name ?? "");
      }

      res.json({
        playerId: targetPlayerId,
        rows: rows.map((r) => ({
          id: r.id,
          playerId: r.playerId,
          playerName: nameMap.get(r.playerId) ?? null,
          actorPlayerId: r.actorPlayerId,
          actorName: r.actorPlayerId ? nameMap.get(r.actorPlayerId) ?? null : null,
          action: r.action,
          metadata: r.metadata ?? {},
          occurredAt: r.occurredAt.toISOString(),
        })),
      });
    } catch (err) {
      console.error("[audit-log] error:", err);
      res.status(500).json({ error: "Failed to load audit log" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/family/locks — bulk lock state for everyone in the caller's family.
// Used by FamilyLobby to render lock badges + countdowns without N+1 fetches.
// ---------------------------------------------------------------------------
router.get(
  "/api/family/locks",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser?.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const allowed = await resolveCallerFamilyPlayerIds(freshUser.playerId);
      if (allowed.size === 0) return res.json({ locks: [] });

      const ids = Array.from(allowed);
      const rows = await db
        .select()
        .from(accountLocks)
        .where(inArray(accountLocks.playerId, ids));

      const now = new Date();
      const active = rows.filter((r) => r.lockedUntil && r.lockedUntil > now);

      // Hydrate locker names.
      const lockerIds = Array.from(
        new Set(active.map((r) => r.lockedByPlayerId).filter((id): id is string => !!id))
      );
      const nameMap = new Map<string, string>();
      if (lockerIds.length > 0) {
        const ps = await db
          .select({ id: players.id, name: players.name })
          .from(players)
          .where(inArray(players.id, lockerIds));
        for (const p of ps) nameMap.set(p.id, p.name ?? "");
      }

      res.json({
        locks: active.map((r) => ({
          playerId: r.playerId,
          lockedUntil: r.lockedUntil.toISOString(),
          lockedByPlayerId: r.lockedByPlayerId,
          lockedByName: r.lockedByPlayerId ? nameMap.get(r.lockedByPlayerId) ?? null : null,
          reason: r.reason ?? null,
        })),
      });
    } catch (err) {
      console.error("[family/locks] error:", err);
      res.status(500).json({ error: "Failed to load locks" });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/family/lock/:playerId
// Body: { until: ISO string, reason?: string }
// Auth: requires the caller's PIN-elevation token (X-PIN-Elevation header
// OR body.elevationToken). Mirrors Family A's "elevate before sensitive
// action" pattern and serves as the light defense described in §Risks.
// ---------------------------------------------------------------------------
router.post(
  "/api/family/lock/:playerId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const targetPlayerId = req.params.playerId;
      const { until, reason } = req.body || {};

      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser?.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }
      const callerPlayerId = freshUser.playerId;

      if (callerPlayerId === targetPlayerId) {
        return res.status(400).json({ error: "You can't lock yourself out." });
      }

      const allowed = await resolveCallerFamilyPlayerIds(callerPlayerId);
      if (!allowed.has(targetPlayerId)) {
        return res.status(403).json({ error: "Not in your family" });
      }

      // Elevation gate (Family B): if the caller has a PIN, require a fresh
      // elevation token. Callers without a PIN are accepted as-is to match
      // the `family/members/invite` pattern.
      const callerPinRow = await db
        .select({ playerId: accountPins.playerId })
        .from(accountPins)
        .where(eq(accountPins.playerId, callerPlayerId))
        .limit(1);
      if (callerPinRow.length > 0) {
        const elevationHeader =
          (req.headers["x-pin-elevation"] as string | undefined) ||
          (typeof req.body?.elevationToken === "string" ? req.body.elevationToken : undefined);
        if (!elevationHeader) {
          return res.status(401).json({
            error: "Confirm your PIN to lock this account.",
            pinRequired: true,
          });
        }
        const verified = verifyElevationToken(elevationHeader);
        if (!verified || verified.playerId !== callerPlayerId) {
          return res.status(401).json({
            error: "PIN elevation expired. Please confirm your PIN again.",
            pinRequired: true,
          });
        }
      }

      const untilDate = until ? new Date(until) : null;
      if (!untilDate || isNaN(untilDate.getTime())) {
        return res.status(400).json({ error: "Lock end time is required (ISO timestamp)" });
      }
      if (untilDate.getTime() <= Date.now() + 60 * 1000) {
        return res
          .status(400)
          .json({ error: "Lock must end at least a minute from now." });
      }
      if (untilDate.getTime() - Date.now() > MAX_LOCK_DURATION_MS) {
        return res.status(400).json({ error: "Locks can be at most 14 days long." });
      }

      const reasonText =
        typeof reason === "string" && reason.trim().length > 0
          ? reason.trim().slice(0, 200)
          : null;

      // Upsert. Drizzle's onConflictDoUpdate keeps it atomic.
      await db
        .insert(accountLocks)
        .values({
          playerId: targetPlayerId,
          lockedUntil: untilDate,
          lockedByPlayerId: callerPlayerId,
          reason: reasonText,
        })
        .onConflictDoUpdate({
          target: accountLocks.playerId,
          set: {
            lockedUntil: untilDate,
            lockedByPlayerId: callerPlayerId,
            reason: reasonText,
            updatedAt: new Date(),
          },
        });

      // Audit row on BOTH sides — locker's log shows "I locked X", target's
      // log shows "I was locked by Y".
      const target = await storage.getPlayer(targetPlayerId);
      const caller = await storage.getPlayer(callerPlayerId);
      await writeAuditLog({
        playerId: targetPlayerId,
        actorPlayerId: callerPlayerId,
        action: "lock",
        metadata: {
          until: untilDate.toISOString(),
          reason: reasonText,
          lockerName: caller?.name ?? null,
        },
      });

      // Force-disconnect any active sockets for the locked account so the SLA
      // in Steps §3 is met.
      try {
        disconnectPlayerSockets(targetPlayerId, "locked");
      } catch (err) {
        console.warn("[family/lock] disconnectPlayerSockets failed:", err);
      }

      // Push notification — best-effort. Notify both the locked account AND
      // the caller's other devices ("you locked X until Y") so silent locks
      // never confuse the family.
      try {
        const friendly = formatLockEnd(untilDate);
        const targetTokens = await getPlayerPushTokens(targetPlayerId);
        if (targetTokens.length > 0) {
          await sendPushNotification(
            targetTokens,
            `${target?.name ?? "Your account"} is taking a break`,
            `${caller?.name ?? "A family member"} set a screen-time lock until ${friendly}.`,
            { type: "account_locked", playerId: targetPlayerId, lockedUntil: untilDate.toISOString() },
            targetPlayerId,
          );
        }
      } catch (err) {
        console.warn("[family/lock] push notification failed:", err);
      }

      res.json({
        success: true,
        playerId: targetPlayerId,
        lockedUntil: untilDate.toISOString(),
        reason: reasonText,
      });
    } catch (err) {
      console.error("[family/lock] error:", err);
      res.status(500).json({ error: "Failed to lock account" });
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/family/lock/:playerId
// Body: { pin: string } — verified against EITHER the locker's PIN OR the
// locked account's PIN (per task spec — both can lift the lock).
// ---------------------------------------------------------------------------
router.delete(
  "/api/family/lock/:playerId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const targetPlayerId = req.params.playerId;
      const { pin } = req.body || {};

      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser?.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }
      const callerPlayerId = freshUser.playerId;

      const allowed = await resolveCallerFamilyPlayerIds(callerPlayerId);
      if (!allowed.has(targetPlayerId)) {
        return res.status(403).json({ error: "Not in your family" });
      }

      const [lockRow] = await db
        .select()
        .from(accountLocks)
        .where(eq(accountLocks.playerId, targetPlayerId))
        .limit(1);
      if (!lockRow) {
        return res.json({ success: true, alreadyUnlocked: true });
      }

      if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: "PIN required to unlock", pinRequired: true });
      }

      // Try the locker's PIN first (if they set one), else the target's PIN.
      // Either is sufficient. We avoid double-counting failed attempts: only
      // increment the second account if the first verify said "missing".
      let unlocked = false;
      const tryers: string[] = [];
      if (lockRow.lockedByPlayerId) tryers.push(lockRow.lockedByPlayerId);
      tryers.push(targetPlayerId);

      for (const candidatePlayerId of tryers) {
        const verify = await verifyAccountPin(candidatePlayerId, pin);
        if (verify.ok) {
          unlocked = true;
          break;
        }
        // Locked account / non-missing failure → stop trying further accounts
        // (we don't want to drain another account's attempt counter on the
        // same wrong PIN).
        if ("locked" in verify && verify.locked) {
          return res.status(429).json({
            error: "Too many wrong attempts. Try again later.",
            retryAfter: verify.retryAfter,
          });
        }
        if (!("missing" in verify) || !verify.missing) {
          // wrong PIN, not missing — break with attemptsLeft for the relevant account
          if ("attemptsLeft" in verify) {
            return res.status(401).json({
              error: "Incorrect PIN",
              pinRequired: true,
              attemptsLeft: verify.attemptsLeft,
            });
          }
        }
      }

      if (!unlocked) {
        // None of the candidate accounts had a matching PIN.
        return res.status(401).json({ error: "Incorrect PIN", pinRequired: true });
      }

      await db.delete(accountLocks).where(eq(accountLocks.playerId, targetPlayerId));

      const caller = await storage.getPlayer(callerPlayerId);
      const target = await storage.getPlayer(targetPlayerId);
      await writeAuditLog({
        playerId: targetPlayerId,
        actorPlayerId: callerPlayerId,
        action: "unlock",
        metadata: {
          unlockerName: caller?.name ?? null,
          previousLockUntil: lockRow.lockedUntil?.toISOString() ?? null,
        },
      });

      try {
        const targetTokens = await getPlayerPushTokens(targetPlayerId);
        if (targetTokens.length > 0) {
          await sendPushNotification(
            targetTokens,
            `${target?.name ?? "Your account"} is back online`,
            `${caller?.name ?? "A family member"} lifted the screen-time lock.`,
            { type: "account_unlocked", playerId: targetPlayerId },
            targetPlayerId,
          );
        }
      } catch (err) {
        console.warn("[family/unlock] push notification failed:", err);
      }

      res.json({ success: true, playerId: targetPlayerId });
    } catch (err) {
      console.error("[family/unlock] error:", err);
      res.status(500).json({ error: "Failed to unlock account" });
    }
  }
);

// ---------------------------------------------------------------------------
// Helper: human-readable lock-end formatter for push notification bodies.
// Keeps the timezone simple — the client will localize the timestamp shown
// in the in-app screens via lockedUntil ISO string.
// ---------------------------------------------------------------------------
function formatLockEnd(until: Date): string {
  const now = new Date();
  const sameDay =
    until.getFullYear() === now.getFullYear() &&
    until.getMonth() === now.getMonth() &&
    until.getDate() === now.getDate();
  const hh = String(until.getHours()).padStart(2, "0");
  const mm = String(until.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  const day = until.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${day} at ${hh}:${mm}`;
}

// Re-export the lock-state helper so callers (auth middleware) can import it
// from this module instead of poking at the lib path directly.
export { getAccountLockState, isAccountLocked, writeAuditLog } from "../lib/account-audit";

export default router;
