import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#ECEDEE",
    buttonText: "#FFFFFF",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: "#2ECC40",
    link: "#2ECC40",
    backgroundRoot: "#1A1A1A",
    backgroundDefault: "#2D2D2D",
    backgroundSecondary: "#353739",
    backgroundTertiary: "#404244",
    primary: "#2ECC40",
    gold: "#FFD700",
    orange: "#FF851B",
    xpCyan: "#00D4FF",
    diamondSilver: "#E0E0E0",
    bronzeCoin: "#CD7F32",
    successNeon: "#39FF14",
    error: "#FF4444",
    disabled: "#666666",
    headerBorder: "rgba(46, 204, 64, 0.3)",
    // Player ball level colors
    ballRed: "#FF4444",
    ballOrange: "#FF851B",
    ballGreen: "#2ECC40",
    ballYellow: "#FFD700",
    ballGlow: "#E040FB", // Purple/Magenta for adults
  },
  dark: {
    text: "#ECEDEE",
    buttonText: "#FFFFFF",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: "#2ECC40",
    link: "#2ECC40",
    backgroundRoot: "#1A1A1A",
    backgroundDefault: "#2D2D2D",
    backgroundSecondary: "#353739",
    backgroundTertiary: "#404244",
    primary: "#2ECC40",
    gold: "#FFD700",
    orange: "#FF851B",
    xpCyan: "#00D4FF",
    diamondSilver: "#E0E0E0",
    bronzeCoin: "#CD7F32",
    successNeon: "#39FF14",
    error: "#FF4444",
    disabled: "#666666",
    headerBorder: "rgba(46, 204, 64, 0.3)",
    // Player ball level colors
    ballRed: "#FF4444",
    ballOrange: "#FF851B",
    ballGreen: "#2ECC40",
    ballYellow: "#FFD700",
    ballGlow: "#E040FB", // Purple/Magenta for adults
  },
};

// Get avatar color based on player ball level
export function getPlayerLevelColor(ballLevel?: string | null): string {
  switch (ballLevel?.toLowerCase()) {
    case "red":
      return Colors.dark.ballRed;
    case "orange":
      return Colors.dark.ballOrange;
    case "green":
      return Colors.dark.ballGreen;
    case "yellow":
      return Colors.dark.ballYellow;
    case "glow":
      return Colors.dark.ballGlow;
    default:
      return Colors.dark.primary; // Default green
  }
}

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  "4xl": 48,
  "5xl": 56,
  inputHeight: 48,
  buttonHeight: 48,
  headerHeight: 140,
  footerCollapsed: 60,
  footerExpanded: 400,
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 30,
  "2xl": 40,
  "3xl": 50,
  full: 9999,
};

export const Typography = {
  h1: {
    fontSize: 28,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 20,
    fontWeight: "600" as const,
  },
  h3: {
    fontSize: 18,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 14,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: "500" as const,
  },
  link: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
