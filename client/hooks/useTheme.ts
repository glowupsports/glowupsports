import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/useColorScheme";

export function useTheme() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  // Player code historically reads from Colors.dark; we mirror that contract.
  // When the player switches to light, applyPlayerScheme() copies Colors.light
  // into Colors.dark so existing references still produce correct values.
  const theme = isDark ? Colors.dark : Colors.light;

  return {
    theme,
    isDark,
  };
}
