import { useTheme as useThemeFromContext } from "@/contexts/ThemeContext";

/**
 * Read the active resolved theme palette + scheme from the React
 * ThemeContext (Task #823). This replaced the previous module-snapshot
 * approach (which read the mutated `Colors.dark` / `Colors.light` globals)
 * so light/dark/academy changes propagate via React's normal data flow.
 *
 * New code should always use this hook; reading `Colors.dark.*` /
 * `Colors.light.*` directly inside `StyleSheet.create({...})` is a legacy
 * pattern that is being migrated out.
 */
export function useTheme() {
  const { theme, isDark, scheme } = useThemeFromContext();
  return { theme, isDark, scheme };
}
