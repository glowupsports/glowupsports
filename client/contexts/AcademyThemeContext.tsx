import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";

import { getQueryFn } from "@/lib/query-client";
import {
  AcademyThemeResolved,
  getActivePlayerScheme,
  setActiveAcademyTheme,
} from "@/constants/theme";
import { usePlayerAppearanceOptional } from "@/player/context/PlayerAppearanceContext";
import {
  AcademyTheme,
  defaultAcademyTheme,
} from "@shared/theme";

const CACHE_KEY = "@academy_theme_cache_v1";

function resolveTheme(theme: AcademyTheme | null | undefined, scheme: "light" | "dark"): AcademyThemeResolved {
  const base: AcademyThemeResolved = {
    primary: defaultAcademyTheme.primary,
    secondary: defaultAcademyTheme.secondary,
    accent: defaultAcademyTheme.accent,
    surface: defaultAcademyTheme.surface,
    panel: defaultAcademyTheme.panel,
    panelElevated: defaultAcademyTheme.panelElevated,
    panelBorder: defaultAcademyTheme.panelBorder,
    text: defaultAcademyTheme.text,
    textMuted: defaultAcademyTheme.textMuted,
    ...(defaultAcademyTheme.dark ?? {}),
  };
  if (scheme === "light") {
    Object.assign(base, {
      primary: defaultAcademyTheme.primary,
      secondary: defaultAcademyTheme.secondary,
      accent: defaultAcademyTheme.accent,
      surface: defaultAcademyTheme.surface,
      panel: defaultAcademyTheme.panel,
      panelElevated: defaultAcademyTheme.panelElevated,
      panelBorder: defaultAcademyTheme.panelBorder,
      text: defaultAcademyTheme.text,
      textMuted: defaultAcademyTheme.textMuted,
    });
  }
  if (!theme) return base;
  // Apply academy base
  const out: AcademyThemeResolved = { ...base };
  for (const k of Object.keys(theme) as (keyof AcademyTheme)[]) {
    if (k === "dark") continue;
    const v = theme[k];
    if (typeof v === "string") (out as any)[k] = v;
  }
  // Overlay dark variant when in dark mode
  if (scheme === "dark" && theme.dark) {
    for (const k of Object.keys(theme.dark) as (keyof typeof theme.dark)[]) {
      const v = theme.dark[k];
      if (typeof v === "string") (out as any)[k] = v;
    }
  }
  return out;
}

interface AcademyThemeContextValue {
  theme: AcademyTheme | null;
  resolved: AcademyThemeResolved;
  logoUrl: string | null;
  isLoading: boolean;
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
  const [cached, setCached] = useState<AcademyTheme | null>(null);

  // Hydrate cache once on mount.
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

  const effective: AcademyTheme | null = override ?? apiTheme ?? cached ?? null;
  const resolved = useMemo(
    () => resolveTheme(effective, effectiveScheme),
    [effective, effectiveScheme],
  );

  // Apply during render so descendants see the post-mutation tokens immediately.
  setActiveAcademyTheme(resolved);

  // Clear on unmount so other contexts revert to defaults.
  useEffect(() => {
    return () => setActiveAcademyTheme(null);
  }, []);

  const value = useMemo<AcademyThemeContextValue>(
    () => ({ theme: effective, resolved, logoUrl, isLoading }),
    [effective, resolved, logoUrl, isLoading],
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
    };
  }
  return ctx;
}

export { resolveTheme };
