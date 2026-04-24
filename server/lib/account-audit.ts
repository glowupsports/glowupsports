// Family F — Audit log + lock helpers shared across routers and middleware.
//
// Tiny module so the auth middleware, family-switch endpoint, login route,
// and lock endpoints can all write/read audit + lock state without circular
// imports back into account-audit.ts (which imports from auth.ts itself).

import { db } from "../db";
import { accountAuditLog, accountLocks } from "@shared/schema";
import { eq } from "drizzle-orm";

export type AuditAction =
  | "login"
  | "profile_switch_in"
  | "pin_change"
  | "pin_recover"
  | "spend_limit_change"
  | "lock"
  | "unlock";

/**
 * Append-only audit writer. Best-effort: never throws — failures are logged
 * but the calling endpoint always succeeds. The audit log is for visibility,
 * not authorization, so a failed write must not block the user action.
 */
export async function writeAuditLog(args: {
  playerId: string;
  actorPlayerId?: string | null;
  action: AuditAction;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    if (!args.playerId) return;
    await db.insert(accountAuditLog).values({
      playerId: args.playerId,
      actorPlayerId: args.actorPlayerId ?? null,
      action: args.action,
      metadata: args.metadata ?? {},
    });
  } catch (err) {
    console.warn("[audit] writeAuditLog failed:", err);
  }
}

export interface AccountLockState {
  locked: boolean;
  lockedUntil: Date | null;
  lockedByPlayerId: string | null;
  reason: string | null;
}

/**
 * Returns the current lock state for a player. Auto-clears expired rows so the
 * caller never sees a stale "locked" flag. Safe to call from request middleware.
 */
export async function getAccountLockState(playerId: string): Promise<AccountLockState> {
  if (!playerId) return { locked: false, lockedUntil: null, lockedByPlayerId: null, reason: null };
  try {
    const [row] = await db
      .select()
      .from(accountLocks)
      .where(eq(accountLocks.playerId, playerId))
      .limit(1);
    if (!row) return { locked: false, lockedUntil: null, lockedByPlayerId: null, reason: null };

    if (row.lockedUntil && row.lockedUntil > new Date()) {
      return {
        locked: true,
        lockedUntil: row.lockedUntil,
        lockedByPlayerId: row.lockedByPlayerId ?? null,
        reason: row.reason ?? null,
      };
    }

    // Expired — clean up so the row doesn't grow forever, and write an
    // unlock audit row attributed to the system.
    await db.delete(accountLocks).where(eq(accountLocks.playerId, playerId));
    await writeAuditLog({
      playerId,
      actorPlayerId: null,
      action: "unlock",
      metadata: { auto: true, expiredAt: row.lockedUntil?.toISOString() ?? null },
    });
    return { locked: false, lockedUntil: null, lockedByPlayerId: null, reason: null };
  } catch (err) {
    console.warn("[audit] getAccountLockState failed:", err);
    return { locked: false, lockedUntil: null, lockedByPlayerId: null, reason: null };
  }
}

export async function isAccountLocked(playerId: string): Promise<boolean> {
  const state = await getAccountLockState(playerId);
  return state.locked;
}
