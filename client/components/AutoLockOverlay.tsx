import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, BackHandler } from "react-native";
import { useNavigationState } from "@react-navigation/native";
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

  // Determine the active route so we can suppress the overlay.
  const routeName = useNavigationState((state) => {
    if (!state) return undefined;
    let s: any = state;
    while (s?.routes && s.index != null) {
      const r = s.routes[s.index];
      if (!r?.state) return r?.name as string | undefined;
      s = r.state;
    }
    return undefined;
  });
  const suppressed = routeName ? LOCK_SUPPRESSED_ROUTES.has(routeName) : false;

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
