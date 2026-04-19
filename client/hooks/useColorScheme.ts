import { useColorScheme as useRNColorScheme } from "react-native";

import { usePlayerAppearanceOptional } from "@/player/context/PlayerAppearanceContext";

/**
 * Player-aware color scheme hook.
 *
 * - Inside the Player app (PlayerAppearanceProvider mounted) the player's
 *   resolved scheme wins (Light / Dark / System preference).
 * - Outside the Player app (Coach, Admin, Owner, Parent) we return "dark"
 *   so those modes keep their existing dark-only look regardless of the
 *   device OS scheme. Those apps were never themed for light mode and the
 *   Player toggle must not bleed into them.
 */
export function useColorScheme(): "light" | "dark" {
  const player = usePlayerAppearanceOptional();
  // Subscribe to OS changes anyway so System mode updates re-render consumers.
  useRNColorScheme();
  if (player) return player.resolvedScheme;
  return "dark";
}
