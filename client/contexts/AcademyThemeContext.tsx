import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";

import { getQueryFn } from "@/lib/query-client";
import { useSyncExternalStore } from "react";
import {
  getActivePlayerScheme,
  getThemeRevision,
  setActiveAcademyTheme,
  subscribeTheme,
} from "@/constants/theme";
import { usePlayerAppearanceOptional } from "@/player/context/PlayerAppearanceContext";
import { useAuth } from "@/coach/context/AuthContext";
import { useAppMode } from "@/context/AppModeContext";
import {
  AcademyTheme,
  AcademyThemeResolved,
  resolveTheme,
} from "@shared/theme";

const CACHE_KEY = "@academy_theme_cache_v1";
const PLAYER_OVERRIDE_KEY_PREFIX = "@player_theme_override_v1";

function buildOverrideKey(userId: string | null | undefined): string {
  // Scope per-user so switching accounts on one device doesn't bleed themes.
  return userId ? `${PLAYER_OVERRIDE_KEY_PREFIX}:${userId}` : PLAYER_OVERRIDE_KEY_PREFIX;
}

interface AcademyThemeContextValue {
  theme: AcademyTheme | null;
  resolved: AcademyThemeResolved;
  logoUrl: string | null;
  isLoading: boolean;
  /**
   * Player-side personal theme override. When set, this fully replaces the
   * academy theme on this device only (never sent to the server). Use null
   * to "follow my academy" again.
   */
  playerOverride: AcademyTheme | null;
  setPlayerOverride: (next: AcademyTheme | null) => Promise<void>;
}

const AcademyThemeContext = createContext<AcademyThemeContextValue | undefined>(undefined);

interface ProviderProps {
  children: ReactNode;
  /**
   * Explicit current scheme — when omitted we follow the player appearance
   * context (when mounted) and otherwise default to dark for coach/admin/owner.
   */
  scheme?: "light" | "dark";
  /** Optional theme override (for owner editor preview). */
  override?: AcademyTheme | null;
}

/**
 * AcademyThemeProvider fetches the active academy's theme from the API and
 * applies it on top of the design tokens via setActiveAcademyTheme(). The
 * theme is also cached in AsyncStorage so cold-starts paint with brand colours
 * before the network responds.
 */
export function AcademyThemeProvider({ children, scheme, override }: ProviderProps) {
  const player = usePlayerAppearanceOptional();
  const effectiveScheme: "light" | "dark" =
    scheme ?? player?.resolvedScheme ?? getActivePlayerScheme();
  const { user } = useAuth();
  const { mode } = useAppMode();
  const userId = user?.id ?? null;
  // Player override only applies in player mode. When the same user switches
  // to coach/admin/owner/platform/service_provider, they always see the
  // academy's branding so staff tools stay on-brand.
  const playerOverrideActive = mode === "player";
  const overrideKey = buildOverrideKey(userId);
  const [cached, setCached] = useState<AcademyTheme | null>(null);
  const [playerOverride, setPlayerOverrideState] = useState<AcademyTheme | null>(null);

  // Serialize override writes so rapid toggles always persist last intent.
  const overrideWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Hydrate the global cache (logo / fallback theme) once on mount.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const parsed = JSON.parse(raw) as AcademyTheme;
          if (parsed && typeof parsed === "object") setCached(parsed);
        } catch {
          /* ignore corrupt cache */
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate the player override whenever the active user changes (account
  // switch, login, logout). When userId is null we clear the override so
  // logged-out screens don't apply a previous user's theme.
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setPlayerOverrideState(null);
      return () => {
        cancelled = true;
      };
    }
    AsyncStorage.getItem(overrideKey)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setPlayerOverrideState(null);
          return;
        }
        try {
          const parsed = JSON.parse(raw) as AcademyTheme;
          setPlayerOverrideState(
            parsed && typeof parsed === "object" ? parsed : null,
          );
        } catch {
          setPlayerOverrideState(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [overrideKey, userId]);

  const setPlayerOverride = useCallback(
    async (next: AcademyTheme | null) => {
      setPlayerOverrideState(next);
      // Chain on the previous write so AsyncStorage operations stay ordered.
      const key = overrideKey;
      const run = overrideWriteQueueRef.current.then(async () => {
        try {
          if (!userId) return; // Don't persist for logged-out users.
          if (next) {
            await AsyncStorage.setItem(key, JSON.stringify(next));
          } else {
            await AsyncStorage.removeItem(key);
          }
        } catch {
          /* persistence failure is non-fatal */
        }
      });
      overrideWriteQueueRef.current = run;
      await run;
    },
    [overrideKey, userId],
  );

  // Fetch live theme from the public endpoint. We deliberately use the public
  // endpoint so the player app (which has no owner perms) can still read it.
  const { data, isLoading } = useQuery<{
    theme: AcademyTheme | null;
    logoUrl?: string | null;
  } | null>({
    queryKey: ["/api/academy/theme"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const apiTheme = data?.theme ?? null;
  const logoUrl = data?.logoUrl ?? null;

  // Persist whatever the API returned (or null) to local cache.
  useEffect(() => {
    if (data === undefined) return;
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(apiTheme)).catch(() => {});
  }, [data, apiTheme]);

  const effective: AcademyTheme | null =
    override
    ?? (playerOverrideActive ? playerOverride : null)
    ?? apiTheme
    ?? cached
    ?? null;
  // Subscribe to the global theme revision so this provider re-renders
  // whenever `applyPlayerScheme` flips the active scheme — without this,
  // `effectiveScheme` falls back to a stale `getActivePlayerScheme()`
  // snapshot (Task #811 Phase G).
  const themeRevision = useSyncExternalStore(
    subscribeTheme,
    getThemeRevision,
    getThemeRevision,
  );
  const resolved = useMemo(
    () => resolveTheme(effective, effectiveScheme),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effective, effectiveScheme, themeRevision],
  );

  // Apply in a layout effect — calling `setActiveAcademyTheme` during render
  // mutates the global theme module and notifies `useSyncExternalStore`
  // subscribers, which can trigger a "Cannot update a component while
  // rendering a different component" warning and an aborted update that
  // hangs the app on the splash (Task #822). useLayoutEffect runs before
  // paint so there is no visible flash.
  useLayoutEffect(() => {
    setActiveAcademyTheme(effective);
  }, [effective]);

  // Clear on unmount so other contexts revert to defaults.
  useEffect(() => {
    return () => setActiveAcademyTheme(null);
  }, []);

  const value = useMemo<AcademyThemeContextValue>(
    () => ({
      theme: effective,
      resolved,
      logoUrl,
      isLoading,
      playerOverride,
      setPlayerOverride,
    }),
    [effective, resolved, logoUrl, isLoading, playerOverride, setPlayerOverride],
  );

  return (
    <AcademyThemeContext.Provider value={value}>{children}</AcademyThemeContext.Provider>
  );
}

export function useAcademyTheme(): AcademyThemeContextValue {
  const ctx = useContext(AcademyThemeContext);
  if (!ctx) {
    return {
      theme: null,
      resolved: resolveTheme(null, "dark"),
      logoUrl: null,
      isLoading: false,
      playerOverride: null,
      setPlayerOverride: async () => {},
    };
  }
  return ctx;
}

export { resolveTheme };
