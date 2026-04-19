import { useEffect, useState } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";

import { usePlayerAppearanceOptional } from "@/player/context/PlayerAppearanceContext";

/**
 * Player-aware web color scheme hook.
 *
 * - Inside the Player app the resolved player scheme wins (works for both
 *   SSR/static export and post-hydration runtime).
 * - Outside the Player app we keep all other modes locked to "dark" so the
 *   Player light toggle has no side effects on Coach / Admin / Owner / Parent
 *   surfaces. Without this, an OS-light device would have caused Themed
 *   primitives in those apps to silently start using the light palette.
 */
export function useColorScheme(): "light" | "dark" {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const player = usePlayerAppearanceOptional();
  // Keep the OS-scheme subscription so System mode triggers re-renders.
  useRNColorScheme();

  if (player) {
    return player.resolvedScheme;
  }

  // Pre-hydration default and post-hydration default for non-player surfaces.
  if (!hasHydrated) return "dark";
  return "dark";
}
