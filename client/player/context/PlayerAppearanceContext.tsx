import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, ReactNode } from "react";
import { Appearance, ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { type ResolvedScheme } from "@/constants/theme";
import { useTheme as useThemeContext } from "@/contexts/ThemeContext";

export type PlayerAppearancePreference = "light" | "dark" | "system";

interface PlayerAppearanceContextValue {
  preference: PlayerAppearancePreference;
  resolvedScheme: ResolvedScheme;
  setPreference: (next: PlayerAppearancePreference) => Promise<void>;
}

const STORAGE_KEY = "@player_appearance";

const PlayerAppearanceContext = createContext<PlayerAppearanceContextValue | undefined>(undefined);

function resolveScheme(pref: PlayerAppearancePreference, osScheme: ColorSchemeName): ResolvedScheme {
  if (pref === "light") return "light";
  if (pref === "dark") return "dark";
  return osScheme === "light" ? "light" : "dark";
}

export function PlayerAppearanceProvider({ children }: { children: ReactNode }) {
  const { setScheme } = useThemeContext();
  const [preference, setPreferenceState] = useState<PlayerAppearancePreference>("dark");
  const [osScheme, setOsScheme] = useState<ColorSchemeName>(Appearance.getColorScheme());

  // Load persisted preference once on mount.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === "light" || stored === "dark" || stored === "system") {
          setPreferenceState(stored);
        }
      })
      .catch(() => {
        /* ignore — fall back to dark default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen to OS scheme changes (matters for "system" mode).
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setOsScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  const resolvedScheme = useMemo(
    () => resolveScheme(preference, osScheme),
    [preference, osScheme],
  );

  // Push the resolved scheme into the central ThemeContext (Task #823).
  // ThemeContext owns the active scheme and triggers the back-compat
  // mutation of the legacy `Colors.*` globals from its own
  // `useLayoutEffect`, so the call here is a plain state update — no
  // render-time mutation, no external store, no Task #822 footgun.
  useLayoutEffect(() => {
    setScheme(resolvedScheme);
  }, [resolvedScheme, setScheme]);

  // Restore dark when this provider unmounts (e.g. switching to coach mode).
  useEffect(() => {
    return () => {
      setScheme("dark");
    };
  }, [setScheme]);

  const setPreference = useCallback(async (next: PlayerAppearancePreference) => {
    setPreferenceState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* persistence failure is non-fatal */
    }
  }, []);

  const value = useMemo<PlayerAppearanceContextValue>(
    () => ({ preference, resolvedScheme, setPreference }),
    [preference, resolvedScheme, setPreference],
  );

  return (
    <PlayerAppearanceContext.Provider value={value}>{children}</PlayerAppearanceContext.Provider>
  );
}

export function usePlayerAppearance(): PlayerAppearanceContextValue {
  const ctx = useContext(PlayerAppearanceContext);
  if (!ctx) {
    // Outside the player app the context isn't mounted; behave like a dark, no-op consumer.
    return {
      preference: "dark",
      resolvedScheme: "dark",
      setPreference: async () => {},
    };
  }
  return ctx;
}

/** Optional consumer that returns null when no provider is mounted (used by useTheme). */
export function usePlayerAppearanceOptional(): PlayerAppearanceContextValue | null {
  return useContext(PlayerAppearanceContext) ?? null;
}
