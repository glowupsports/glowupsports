import { useMemo } from "react";

import { useAcademyTheme } from "@/contexts/AcademyThemeContext";
import { usePlayerAppearanceOptional } from "@/player/context/PlayerAppearanceContext";
import { useTheme as useThemeContext } from "@/contexts/ThemeContext";

import {
  getCategoryAccent,
  getCategoryAccents,
  type CardCategory,
} from "./categoryAccent";

/**
 * Task #858 — tonal accent gating.
 *
 * Tonal recoloring is ONLY active when the player has set their own
 * theme override (`playerOverride !== null`). When the player is in
 * "Follow Academy" mode (no override), every consumer falls back to
 * its legacy hard-coded accent so academy-branded styling is preserved.
 *
 * Each hook accepts a `fallback` color that is returned verbatim when
 * the player has no override applied.
 */

export function useCategoryAccent(
  category: CardCategory,
  fallback: string,
): string {
  const { theme, playerOverride } = useAcademyTheme();
  const player = usePlayerAppearanceOptional();
  const themeCtx = useThemeContext();
  const mode = player?.resolvedScheme ?? themeCtx.scheme;
  return useMemo(() => {
    if (!playerOverride) return fallback;
    return getCategoryAccent(category, theme, mode);
  }, [category, fallback, playerOverride, theme, mode]);
}

/**
 * Resolve every category accent at once. Pass a `fallbacks` map giving
 * the legacy color per category — those are returned when the player
 * has not picked an override theme.
 */
export function useCategoryAccents(
  fallbacks: Partial<Record<CardCategory, string>> = {},
) {
  const { theme, playerOverride } = useAcademyTheme();
  const player = usePlayerAppearanceOptional();
  const themeCtx = useThemeContext();
  const mode = player?.resolvedScheme ?? themeCtx.scheme;
  return useMemo(() => {
    const tonal = getCategoryAccents(theme, mode);
    if (!playerOverride) {
      // Merge fallbacks over the tonal map so callers get their legacy
      // colors when no override is active. Categories not present in
      // `fallbacks` still receive a tonal value (safe default).
      return { ...tonal, ...fallbacks } as Record<CardCategory, string>;
    }
    return tonal;
  }, [fallbacks, playerOverride, theme, mode]);
}
