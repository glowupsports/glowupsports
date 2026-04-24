// Family B — Auto-lock state machine.
//
// Rules:
// 1. Lock fires after 15 minutes of background+inactivity.
// 2. Lock fires immediately when the screen is locked / app backgrounded for
//    >= AUTO_LOCK_MS.
// 3. Once locked, the user must re-enter their PIN to unlock; "Forgot PIN?"
//    pivots to email magic-link recovery.
// 4. The lock is suppressed on the FamilyLobby & Login screens (the host
//    overlay decides this based on route name).
//
// This module owns the *state* (locked/unlocked, last activity timestamp)
// and an AppState listener; the visual overlay lives in
// `client/components/AutoLockOverlay.tsx`.

import { AppState, AppStateStatus } from "react-native";
import { getLastSwitchAt } from "./familySwitch";

export const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes

type Listener = (locked: boolean) => void;

let locked = false;
let lastActiveAt = Date.now();
let lastBackgroundAt: number | null = null;
let appStateSub: { remove: () => void } | null = null;
const listeners = new Set<Listener>();

function setLocked(value: boolean) {
  if (locked === value) return;
  locked = value;
  for (const l of listeners) l(locked);
}

export function isLocked(): boolean {
  return locked;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Manually unlock — e.g. after the user enters the correct PIN. */
export function unlock(): void {
  lastActiveAt = Date.now();
  lastBackgroundAt = null;
  setLocked(false);
}

/** Manually lock — e.g. on logout-cleanup or "lock now" button. */
export function lockNow(): void {
  setLocked(true);
}

/** Reset both timer + lock state. Used when a fresh login completes. */
export function resetActivity(): void {
  lastActiveAt = Date.now();
  lastBackgroundAt = null;
  setLocked(false);
}

/** Bump the inactivity timer — called from the overlay's interaction handler. */
export function touchActivity(): void {
  lastActiveAt = Date.now();
}

function evaluateOnForeground() {
  // If we were just switched into a fresh account, treat that as activity to
  // avoid an immediate lock prompt landing on top of the welcome banner.
  const lastSwitch = getLastSwitchAt();
  if (lastSwitch && Date.now() - lastSwitch < 5_000) {
    lastActiveAt = Date.now();
    lastBackgroundAt = null;
    return;
  }
  const now = Date.now();
  const idleMs = lastBackgroundAt ? now - lastBackgroundAt : now - lastActiveAt;
  if (idleMs >= AUTO_LOCK_MS) setLocked(true);
  lastBackgroundAt = null;
  lastActiveAt = now;
}

function handleAppStateChange(state: AppStateStatus) {
  if (state === "active") {
    evaluateOnForeground();
  } else if (state === "background" || state === "inactive") {
    lastBackgroundAt = Date.now();
  }
}

/** Wire up the AppState listener. Idempotent — safe to call multiple times. */
export function startAutoLock(): void {
  if (appStateSub) return;
  appStateSub = AppState.addEventListener("change", handleAppStateChange);
}

export function stopAutoLock(): void {
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
}

/**
 * Used by the overlay to drive a wall-clock check while the app is foregrounded
 * but idle. Returns whether the user should be locked based on inactivity.
 */
export function evaluateForegroundIdle(): boolean {
  if (locked) return true;
  if (Date.now() - lastActiveAt >= AUTO_LOCK_MS) {
    setLocked(true);
    return true;
  }
  return false;
}
