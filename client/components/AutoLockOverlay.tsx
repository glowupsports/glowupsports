import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, BackHandler } from "react-native";
import { Colors, Spacing, FontSizes } from "@/constants/theme";
import { PinPadModal } from "./PinPadModal";
import { PinRecoveryModal } from "./PinRecoveryModal";
import {
  isLocked,
  subscribe,
  unlock,
  startAutoLock,
  evaluateForegroundIdle,
  AUTO_LOCK_MS,
} from "@/lib/autoLock";
import { getActiveRouteName, subscribeActiveRoute } from "@/lib/activeRoute";
import { getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth";

// Routes where the lock overlay is suppressed entirely.
// FamilyLobby is its own switching surface; Login means we have no auth yet.
const LOCK_SUPPRESSED_ROUTES = new Set([
  "FamilyLobby",
  "Login",
  "ClaimInvite",
  "Signup",
  "PinReset",
]);

/**
 * True iff the given route name is in the suppression set. Wrapped in
 * try/catch so any throw degrades to `false` — overlay-not-suppressed is
 * the safe default for a lock UI. Accepts `unknown` so the type system
 * can't lull a future caller into removing the guard. See Task #1249.
 */
export function isLockSuppressedRoute(routeName: unknown): boolean {
  try {
    return typeof routeName === "string" && LOCK_SUPPRESSED_ROUTES.has(routeName);
  } catch {
    return false;
  }
}

interface AutoLockOverlayProps {
  enabled: boolean;
  /** Player ID currently active — required to verify the unlock PIN. */
  playerId?: string | null;
  playerEmail?: string | null;
  playerName?: string | null;
}

export function AutoLockOverlay({
  enabled,
  playerId,
  playerEmail,
  playerName,
}: AutoLockOverlayProps) {
  const [locked, setLocked] = useState<boolean>(isLocked());
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Listen for lock-state changes.
  useEffect(() => {
    return subscribe((next) => setLocked(next));
  }, []);

  // Boot auto-lock listener when enabled.
  useEffect(() => {
    if (!enabled) return;
    startAutoLock();
    // Poll every 30s for foreground inactivity.
    intervalRef.current = setInterval(() => {
      if (evaluateForegroundIdle()) setLocked(true);
    }, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled]);

  // Block hardware back while locked (Android).
  useEffect(() => {
    if (!locked) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [locked]);

  // Read the active route via the imperative getter (not a hook) so the
  // entire route-resolution path can sit inside a try/catch. React
  // Navigation hooks (`useNavigationState`, `useRoute`, `useNavigation`)
  // MUST NOT be used here — this component is mounted as a sibling of
  // `NavigationContainer` and they throw on cold start. See Task #1237
  // and Task #1249. The effect below subscribes to route changes and
  // triggers a re-render via local state.
  const [, bumpRoute] = useState(0);
  useEffect(() => subscribeActiveRoute(() => bumpRoute((n) => n + 1)), []);
  let routeName: string | undefined;
  try {
    routeName = getActiveRouteName();
  } catch {
    routeName = undefined;
  }
  const suppressed = isLockSuppressedRoute(routeName);

  const visible = enabled && locked && !suppressed && !!playerId;

  const handleSubmit = async (pin: string): Promise<string | null> => {
    if (!playerId) return "No active account";
    setErrorMessage(null);
    try {
      const token = getAuthToken();
      if (!token) return "Not authenticated";
      const url = new URL("/api/family/elevate-pin", getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.elevationToken) {
        unlock();
        return null;
      }
      if (res.status === 429) {
        return data?.error || "Too many attempts. Try again later.";
      }
      return data?.error || "Incorrect PIN";
    } catch (e) {
      return e instanceof Error ? e.message : "Network error";
    }
  };

  if (!enabled) return null;

  return (
    <>
      <PinPadModal
        visible={visible && !recoveryOpen}
        title={playerName ? `Unlock ${playerName}` : "Unlock account"}
        subtitle={`Locked after ${Math.round(AUTO_LOCK_MS / 60000)} minutes of inactivity`}
        onSubmit={handleSubmit}
        onClose={() => {
          /* not cancellable */
        }}
        cancellable={false}
        onForgotPin={() => setRecoveryOpen(true)}
        errorMessage={errorMessage}
      />
      <PinRecoveryModal
        visible={visible && recoveryOpen}
        targetPlayerId={playerId || undefined}
        defaultEmail={playerEmail || undefined}
        onClose={() => setRecoveryOpen(false)}
      />
    </>
  );
}
