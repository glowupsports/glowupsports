import { Colors } from "@/constants/theme";
import { getActivePlayerScheme, getThemeRevision } from "@/constants/theme";

/**
 * Returns the BlurView `tint` value matching the active player scheme.
 * BlurView's `tint` prop cannot live inside a StyleSheet, so consumers read
 * this at render time. The hook depends on `getThemeRevision()` so screens
 * that already re-render on scheme toggle (via `key={resolvedScheme}` in
 * PlayerNavigator) automatically receive the new tint.
 */
export function useGlassTint(): "light" | "dark" {
  // Read the revision to keep this hook honest under React strict mode and
  // future theme switches that don't remount.
  void getThemeRevision();
  const scheme = getActivePlayerScheme();
  if (scheme === "light") return "light";
  // Fall back to the persisted glass mode token in case an academy overlay
  // ever overrides it.
  return (Colors.dark.glassTintMode as "light" | "dark") || "dark";
}
