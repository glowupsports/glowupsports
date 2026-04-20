import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import {
  Colors,
  type ResolvedScheme,
  _applyThemeMutation,
  _resolveActiveColors,
  _themeRevision,
} from "@/constants/theme";
import {
  resolveTheme as resolveAcademyTheme,
  type AcademyTheme,
  type AcademyThemeResolved,
} from "@shared/theme";

/**
 * Single source of truth for the active light/dark scheme + active academy
 * theme overlay (Task #823).
 *
 * Why this exists: previously both pieces of state lived in a mutable
 * module-level singleton in `client/constants/theme.ts` and were poked by
 * imperative `applyPlayerScheme()` / `setActiveAcademyTheme()` calls. A
 * single render-time call from anywhere in the codebase could re-trigger
 * the white-screen / "Cannot update a component while rendering a
 * different component" hang fixed in Task #822. Moving ownership into a
 * proper React context makes that bug class structurally impossible —
 * the only path to mutate the shared design tokens is this provider's
 * `useLayoutEffect`, which runs AFTER render commits.
 *
 * Back-compat: ~470 legacy screens still read `Colors.dark.*` /
 * `Colors.light.*` directly inside `StyleSheet.create({...})`. Until
 * those are migrated to `useTheme()`, the provider's `useLayoutEffect`
 * also calls `_applyThemeMutation()` so the legacy reads keep flipping
 * with the active scheme. New code should ALWAYS read colors via the
 * `useTheme()` hook below.
 */
interface ThemeContextValue {
  scheme: ResolvedScheme;
  isDark: boolean;
  /** Raw academy theme (with optional `dark` overlay), or null. */
  academyTheme: AcademyTheme | null;
  /** Resolved academy theme for the current scheme, or null. */
  resolvedAcademyTheme: AcademyThemeResolved | null;
  /** Resolved active colour palette — academy overlay + scheme baseline. */
  theme: Record<string, string>;
  setScheme: (next: ResolvedScheme) => void;
  setAcademyTheme: (next: AcademyTheme | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<ResolvedScheme>("dark");
  const [academyTheme, setAcademyThemeState] = useState<AcademyTheme | null>(
    null,
  );

  const resolvedAcademyTheme = useMemo<AcademyThemeResolved | null>(
    () => (academyTheme ? resolveAcademyTheme(academyTheme, scheme) : null),
    [academyTheme, scheme],
  );

  const theme = useMemo(
    () => _resolveActiveColors(scheme, academyTheme),
    [scheme, academyTheme],
  );

  // Back-compat shim: mutate the legacy module-level Colors/Backgrounds/
  // TextColors objects so the ~470 unmigrated screens that still read
  // `Colors.dark.*` inside StyleSheet.create keep flipping with the
  // active scheme/academy. Runs AFTER commit (useLayoutEffect), so no
  // render-time mutation can trigger the Task #822 bug class.
  useLayoutEffect(() => {
    _applyThemeMutation(scheme, academyTheme);
  }, [scheme, academyTheme]);

  const setScheme = useCallback((next: ResolvedScheme) => {
    setSchemeState((prev) => (prev === next ? prev : next));
  }, []);

  const setAcademyTheme = useCallback((next: AcademyTheme | null) => {
    setAcademyThemeState((prev) => {
      if (prev === next) return prev;
      if (prev && next) {
        try {
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
        } catch {
          /* fall through */
        }
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      scheme,
      isDark: scheme === "dark",
      academyTheme,
      resolvedAcademyTheme,
      theme,
      setScheme,
      setAcademyTheme,
    }),
    [
      scheme,
      academyTheme,
      resolvedAcademyTheme,
      theme,
      setScheme,
      setAcademyTheme,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Read the currently active theme. Always prefer this over `Colors.dark.*`
 * or `Colors.light.*` so light/dark/academy changes propagate cleanly via
 * the React tree instead of via mutated module globals.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Sensible no-op default for tests / mockup sandbox / any consumer
    // mounted outside <ThemeProvider>.
    return {
      scheme: "dark",
      isDark: true,
      academyTheme: null,
      resolvedAcademyTheme: null,
      theme: Colors.dark as unknown as Record<string, string>,
      setScheme: () => {},
      setAcademyTheme: () => {},
    };
  }
  return ctx;
}

export function useThemeOptional(): ThemeContextValue | null {
  return useContext(ThemeContext) ?? null;
}

// Re-exported only for the legacy `makeReactiveStyles` proxy in
// `@/hooks/useThemedStyles` so it can keep flipping cached factories on
// scheme change without needing a public subscribeTheme API. Not for
// general use — migrate to `useTheme()`.
export function _getThemeRevisionInternal(): number {
  return _themeRevision;
}
