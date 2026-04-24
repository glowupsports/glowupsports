// Family B — Real auth-swap profile switching.
//
// Orchestrates: clear cached state → POST /api/family/switch → on success,
// stash the new token + user → caller decides how to reboot the UI.
//
// PIN flow: when the server returns 401 with `pinRequired: true`, the caller
// is expected to show a PIN-pad and retry by passing { pin } in opts.
//
// Grace + auto-lock: this module also exposes lightweight in-memory state
// the auto-lock overlay reads to suppress itself on the FamilyLobby and to
// know which player the user just switched into.

import { getApiUrl } from "./query-client";
import {
  getAuthToken,
  saveAuthState,
  clearAuthState,
  setAuthToken,
  AuthUser,
} from "./auth";
import { clearElevationToken } from "./pinElevation";

let lastSwitchAt = 0;
export function getLastSwitchAt(): number {
  return lastSwitchAt;
}
export function markSwitchActivity(): void {
  lastSwitchAt = Date.now();
}

export interface SwitchResult {
  ok: true;
  token: string;
  refreshToken?: string;
  user: AuthUser;
  playerName: string;
  usedGrace: boolean;
}

export interface SwitchPinRequired {
  ok: false;
  pinRequired: true;
  attemptsLeft?: number;
  message?: string;
}

export interface SwitchLocked {
  ok: false;
  pinRequired: true;
  locked: true;
  retryAfter?: number;
  message: string;
}

export interface SwitchError {
  ok: false;
  pinRequired?: false;
  message: string;
}

export type SwitchOutcome =
  | SwitchResult
  | SwitchPinRequired
  | SwitchLocked
  | SwitchError;

interface SwitchOpts {
  pin?: string;
}

/**
 * Calls POST /api/family/switch/:playerId with the optional PIN. Returns a
 * tagged outcome so the caller can branch on `pinRequired` / `locked` / `ok`.
 *
 * IMPORTANT: This function does NOT persist the new auth state — that's the
 * caller's job (so the caller can show the "Hi {Name} 👋" transition first
 * and reboot only when ready).
 */
export async function callFamilySwitch(
  targetPlayerId: string,
  opts: SwitchOpts = {}
): Promise<SwitchOutcome> {
  try {
    const token = getAuthToken();
    if (!token) return { ok: false, message: "Not authenticated" };
    const url = new URL(`/api/family/switch/${targetPlayerId}`, getApiUrl()).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(opts.pin ? { pin: opts.pin } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.token) {
      return {
        ok: true,
        token: data.token,
        refreshToken: data.refreshToken,
        user: data.user,
        playerName: data.playerName,
        usedGrace: !!data.usedGrace,
      };
    }
    if (res.status === 429 && data?.locked) {
      return {
        ok: false,
        pinRequired: true,
        locked: true,
        retryAfter: data.retryAfter,
        message: data.error || "Too many wrong attempts. Try again later.",
      };
    }
    if (res.status === 401 && data?.pinRequired) {
      return {
        ok: false,
        pinRequired: true,
        attemptsLeft: data.attemptsLeft,
        message: data.error,
      };
    }
    return { ok: false, message: data?.error || "Switch failed" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Network error" };
  }
}

/**
 * Fully apply a successful switch: clear current auth state + cache, persist
 * the new token, mark switch activity. The caller then reboots via
 * `reloadAppAsync` or by re-driving AuthContext.
 */
export async function applySwitchResult(
  result: SwitchResult,
  queryClient?: { clear: () => void }
): Promise<void> {
  // Clear sensitive state from the OUTGOING account before persisting the new
  // one. We do NOT call AuthContext.logout — that flashes the LoginScreen.
  await clearAuthState();
  clearElevationToken();
  if (queryClient) queryClient.clear();
  await saveAuthState(result.token, result.user, result.refreshToken);
  setAuthToken(result.token);
  markSwitchActivity();
}
