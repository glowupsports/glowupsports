import { useTheme } from "@/contexts/ThemeContext";

/**
 * Returns the BlurView `tint` value matching the active player scheme.
 * BlurView's `tint` prop cannot live inside a StyleSheet, so consumers read
 * this at render time. Reads from the central ThemeContext (Task #823) so
 * scheme/academy changes propagate via React's normal data flow.
 */
export function useGlassTint(): "light" | "dark" {
  const { scheme, theme } = useTheme();
  if (scheme === "light") return "light";
  // Fall back to the persisted glass mode token in case an academy overlay
  // ever overrides it.
  return ((theme as Record<string, string>).glassTintMode as
    | "light"
    | "dark") || "dark";
}
