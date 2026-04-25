import { Platform } from "react-native";
import {
  type AcademyTheme,
  type AcademyThemeResolved as SharedAcademyThemeResolved,
  resolveTheme as resolveAcademyTheme,
} from "@shared/theme";

// ============================================
// GLOW UP SPORTS - MASTER DESIGN TOKENS v2.0
// ============================================
//
// PLAYER APP PALETTE POLICY (2026-04-19)
// --------------------------------------
// The Player app must read as premium and minimal. Strict rules:
//
// 1. ONE accent only: GlowColors.primary (#C8FF3D) — CTAs, active state,
//    focus rings, XP icons, level badges, link text. Not used decoratively.
// 2. Neutrals only otherwise: TextColors + Backgrounds + borderSubtle.
// 3. Status colours (FunctionColors.error / success) only when conveying
//    actual status — never as decoration.
// 4. Sport colours (tennis/padel/pickleball) only inside sport-specific UI:
//    sport filter chips, sport badge on a session, ball-level dot.
// 5. Gold (RoleColors.owner) only for: Glow Market discount/spotlight,
//    owner-tier-only badges. Nowhere else in the Player app.
// 6. xpCyan / accentCyan / accentNeon / cyan aliases are DEPRECATED for new
//    Player-app code. Existing Player references are being migrated to
//    primary. They remain in the theme only for non-Player apps.
// 7. Cards use Backgrounds.card + borderSubtle for depth — NOT gradients.
//    Gradients are allowed on at most ONE hero/feature element per screen.
//
// This policy applies to client/player/** only. Coach, Owner, Admin,
// Platform, and Service-Provider apps are unaffected.
// ============================================

// Premium Background System (mutable: switched between dark and light palettes by
// applyPlayerScheme so existing inline `Backgrounds.*` references flip at render time).
export const Backgrounds = {
  root: "#0B0D10",        // Main app background - deepest
  card: "#11141A",        // Cards, panels
  elevated: "#171B22",    // Modals, sheets, drawers
  surface: "#1F2430",     // Borders, dividers, subtle surfaces
  overlay: "rgba(0, 0, 0, 0.6)", // Modal overlays
  glass: "rgba(17, 20, 26, 0.85)", // Glass effect base
};

// Premium Text Hierarchy (mutable for the same reason as Backgrounds).
export const TextColors = {
  primary: "#FFFFFF",     // Titles, important values
  secondary: "#B8BCC6",   // Labels, descriptions
  muted: "#7C8290",       // Helper text, meta
  disabled: "#4A4F5C",    // Inactive elements
};

// Snapshot of the original dark tokens so we can restore them when switching back.
const DarkBackgrounds = { ...Backgrounds };
const DarkTextColors = { ...TextColors };

// Light palette tokens — premium minimal, paired with the existing GlowColors.primary
// accent which is darkened slightly via GlowColors.dark for sufficient contrast on
// light surfaces.
const LightBackgrounds = {
  root: "#F5F6F8",
  card: "#FFFFFF",
  elevated: "#FFFFFF",
  surface: "#EEF0F4",
  overlay: "rgba(15, 18, 24, 0.45)",
  glass: "rgba(255, 255, 255, 0.78)",
};

const LightTextColors = {
  primary: "#0B0D10",
  secondary: "#3D434E",
  muted: "#6B7280",
  disabled: "#B5B9C2",
};

// Glow Primary - The DNA of Glow Up
export const GlowColors = {
  primary: "#C8FF3D",     // XP, Level, Active, Primary CTA
  soft: "#A6E92A",        // Subtle accents, hover
  dark: "#7FB300",        // Pressed, muted glow
  shadow: "rgba(200, 255, 61, 0.12)",
  shadowSubtle: "rgba(200, 255, 61, 0.06)",
  // Legacy aliases (kept to maintain backwards compat with older Player screens)
  secondary: "#A6E92A",   // alias of soft
  tertiary: "#7FB300",    // alias of dark
  orange: "#FF851B",      // RoleColors.admin
};

// Function Colors (1 meaning = 1 color)
export const FunctionColors = {
  planning: "#4DA3FF",      // Calendar, scheduling
  planningMuted: "#2E6FB8",
  social: "#FFB020",        // Messages, community
  socialMuted: "#C8891A",
  error: "#FF4D4D",         // Errors, destructive
  errorMuted: "#C83838",
  success: "#00E676",       // Completed, confirmed
  successMuted: "#00B85C",
  info: "#00D4FF",          // Neutral stats
  infoMuted: "#00A8CC",
};

// Role-specific Accents
export const RoleColors = {
  player: "#C8FF3D",        // Glow primary
  coach: "#C8FF3D",         // Glow primary + blue accents
  coachSecondary: "#4DA3FF",
  admin: "#FF851B",         // Orange professional
  adminSecondary: "#E67700",
  owner: "#FFD700",         // Gold exclusive
  ownerSecondary: "#FFC000",
};

// Ball Level Colors
export const BallLevelColors = {
  blue: "#4FC3F7",
  red: "#FF4D4D",
  orange: "#FF851B",
  green: "#C8FF3D",
  yellow: "#FFD700",
  glow: "#E040FB",
};

// Session Type Colors
export const SessionColors = {
  private: "#C8FF3D",
  semiPrivate: "#00D4FF",
  group: "#FFB020",
  camp: "#9B59B6",
  activity: "#7C8290",
};

// Pro Tennis "Midnight Grand Slam" palette for Player App
export const ProTennisColors = {
  // Backgrounds - Deep midnight blue
  midnightBlue: Backgrounds.root,
  surfaceDark: Backgrounds.card,
  surfaceCard: "#1A2235",
  surfaceElevated: Backgrounds.elevated,
  surfaceLight: Backgrounds.elevated,
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  
  // Primary Accent - Electric Tennis Yellow/Green
  electricGreen: GlowColors.primary,
  electricGreenLight: "#DFFF40",
  electricGreenMuted: GlowColors.dark,
  // Legacy alias for older screens that still reference `neonGreen`.
  neonGreen: GlowColors.primary,
  
  // Secondary Accent - Neon Cyan for social/cold actions
  neonCyan: FunctionColors.info,
  neonCyanMuted: FunctionColors.infoMuted,
  
  // Text
  white: TextColors.primary,
  textPrimary: TextColors.primary,
  textSecondary: TextColors.secondary,
  textMuted: TextColors.muted,
  
  // Status Colors
  success: FunctionColors.success,
  danger: FunctionColors.error,
  warning: FunctionColors.social,
  live: FunctionColors.error,
  
  // Form/XP Bar
  formBarFill: GlowColors.primary,
  formBarBackground: Backgrounds.card,
  
  // Gradients
  gradientElectric: [GlowColors.primary, "#DFFF40"],
  gradientMidnight: [Backgrounds.root, Backgrounds.card],
  gradientCard: ["rgba(26, 34, 53, 0.95)", "rgba(21, 27, 41, 0.98)"],
  gradientGlow: ["rgba(200, 255, 61, 0.15)", "rgba(200, 255, 61, 0.02)"],
};

// Frosted Daylight accent — darker moss-green variant of the brand neon, used
// only in light mode for any text/icon/border that would otherwise put neon
// directly on a white surface (where #C8FF3D fails contrast). Picked to clear
// WCAG AA (≥4.5:1) on the LightBackgrounds.card / .root surfaces.
const LightAccentMoss = "#3F6B0F";
const LightAccentMossSoft = "rgba(63, 107, 15, 0.10)";
const LightAccentMossBorder = "rgba(63, 107, 15, 0.28)";

export const Colors = {
  light: {
    text: LightTextColors.primary,
    textMuted: LightTextColors.secondary,
    textSubtle: LightTextColors.muted,
    textSecondary: LightTextColors.secondary,
    buttonText: "#000000",
    border: "rgba(11, 13, 16, 0.12)",
    tabIconDefault: LightTextColors.muted,
    tabIconSelected: LightAccentMoss,
    link: LightAccentMoss,
    backgroundRoot: LightBackgrounds.root,
    backgroundDefault: LightBackgrounds.card,
    backgroundSecondary: LightBackgrounds.elevated,
    backgroundTertiary: LightBackgrounds.surface,
    // Light-mode `primary` resolves to the moss accent so legacy code
    // that uses `Colors.dark.primary` for text/icons/borders stays
    // readable on white surfaces. Neon (#C8FF3D) is reserved for
    // FILLS only — use `accentText` directly when in doubt.
    primary: LightAccentMoss,
    gold: RoleColors.owner,
    orange: RoleColors.admin,
    /** @deprecated Player palette policy: new Player code must use primary. Kept as cyan-info for backwards-compatibility in non-Player apps; all Player references have been migrated. */
    xpCyan: FunctionColors.info,
    diamondSilver: "#E0E0E0",
    bronzeCoin: "#CD7F32",
    successNeon: FunctionColors.success,
    error: FunctionColors.error,
    disabled: LightTextColors.disabled,
    headerBorder: "rgba(11, 13, 16, 0.08)",
    // Ball level colors
    ballBlue: BallLevelColors.blue,
    ballRed: BallLevelColors.red,
    ballOrange: BallLevelColors.orange,
    ballGreen: BallLevelColors.green,
    ballYellow: BallLevelColors.yellow,
    ballGlow: BallLevelColors.glow,
    // Glow hierarchy
    primaryGlow: GlowColors.primary,
    primaryGlowLight: GlowColors.soft,
    glowSoft: GlowColors.soft,
    glowDark: GlowColors.dark,
    // Status colors
    softStatus: FunctionColors.success,
    softStatusMuted: FunctionColors.successMuted,
    accentWarning: FunctionColors.social,
    accentError: FunctionColors.error,
    accentInfo: FunctionColors.info,
    // Planning
    planning: FunctionColors.planning,
    planningMuted: FunctionColors.planningMuted,
    // Social
    social: FunctionColors.social,
    socialMuted: FunctionColors.socialMuted,
    // Session types
    sessionPrivate: SessionColors.private,
    sessionSemiPrivate: SessionColors.semiPrivate,
    sessionGroup: SessionColors.group,
    sessionPhysical: SessionColors.camp,
    sessionActivity: SessionColors.activity,
    // Role colors
    rolePlayer: RoleColors.player,
    roleCoach: RoleColors.coach,
    roleAdmin: RoleColors.admin,
    roleOwner: RoleColors.owner,
    // Glass effect
    glass: LightBackgrounds.glass,
    overlay: LightBackgrounds.overlay,
    // Warning
    warning: FunctionColors.social,
    // Subtle border for cards (replaces decorative gradients)
    borderSubtle: "rgba(11, 13, 16, 0.06)",
    // Frosted Daylight tokens — themed equivalents of the dark hardcoded
    // rgba(255,255,255,...) overlays so consumers wrapped in
    // makeReactiveStyles flip cleanly when the player switches schemes.
    accentText: LightAccentMoss,            // Use instead of GlowColors.primary for any TEXT/ICON/BORDER on light surfaces.
    accentTextSoft: LightAccentMossSoft,    // Soft moss fill (e.g. selected row tint).
    accentTextBorder: LightAccentMossBorder,
    onAccent: "#000000",                    // Text/icon colour to place on top of a neon-filled button or pill.
    chipBackground: "rgba(11, 13, 16, 0.05)",
    chipBackgroundStrong: "rgba(11, 13, 16, 0.08)",
    chipBorder: "rgba(11, 13, 16, 0.10)",
    divider: "rgba(11, 13, 16, 0.08)",
    iconMuted: LightTextColors.muted,
    glassTintMode: "light",
    glassHighlight: "rgba(11, 13, 16, 0.04)",
    glassGradientStart: "rgba(255, 255, 255, 0.78)",
    glassGradientEnd: "rgba(245, 246, 248, 0.92)",
    glassGradientStartWeb: "rgba(255, 255, 255, 0.92)",
    glassGradientEndWeb: "rgba(245, 246, 248, 0.96)",
    heroGradientStart: "rgba(200, 255, 61, 0.18)",
    heroGradientEnd: "rgba(245, 246, 248, 0.0)",
    // Modal scrim — used behind modals/sheets/walkthrough overlays.
    // Lighter on light mode so backdrops don't crush the new clean palette.
    modalScrim: "rgba(15, 18, 24, 0.45)",
    // Chrome surface tokens — translucent backdrop + border used by floating
    // chrome (FAB pill labels, header on Android, custom toasts) so they stay
    // legible on either palette without hardcoded rgba(10,15,30,*) literals.
    chromeBackground: "rgba(255, 255, 255, 0.92)",
    chromeBackgroundStrong: "rgba(255, 255, 255, 0.96)",
    chromeBorder: "rgba(11, 13, 16, 0.10)",
    chromeText: "#0B0D10",
    // Legacy compatibility
    green: FunctionColors.success,
    red: FunctionColors.error,
    cyan: FunctionColors.info,
    surface: LightBackgrounds.surface,
    accentOrange: RoleColors.adminSecondary,
    // Missing color aliases
    accentCyan: FunctionColors.info,
    accentNeon: FunctionColors.info,
    accentGreen: FunctionColors.success,
    accent: FunctionColors.info,
    // Legacy aliases — older screens still reference these tokens.
    card: LightBackgrounds.card,
    cardLight: LightBackgrounds.elevated,
    cardElevated: LightBackgrounds.elevated,
    cardBackground: LightBackgrounds.card,
    background: LightBackgrounds.root,
    backgroundElevated: LightBackgrounds.elevated,
    tint: LightAccentMoss,
    textTertiary: LightTextColors.muted,
    textPrimary: LightTextColors.primary,
    danger: FunctionColors.error,
    success: FunctionColors.success,
    surfaceAlt: LightBackgrounds.surface,
    surfaceElevated: LightBackgrounds.elevated,
    panel: LightBackgrounds.card,
    panelBorder: "rgba(11, 13, 16, 0.10)",
    errorNeon: FunctionColors.error,
  },
  dark: {
    text: TextColors.primary,
    textMuted: TextColors.secondary,
    textSubtle: TextColors.muted,
    textSecondary: TextColors.secondary,
    buttonText: "#000000",
    border: "rgba(255, 255, 255, 0.15)",
    tabIconDefault: TextColors.muted,
    tabIconSelected: GlowColors.primary,
    link: GlowColors.primary,
    backgroundRoot: Backgrounds.root,
    backgroundDefault: Backgrounds.card,
    backgroundSecondary: Backgrounds.elevated,
    backgroundTertiary: Backgrounds.surface,
    primary: GlowColors.primary,
    gold: RoleColors.owner,
    orange: RoleColors.admin,
    /** @deprecated Player palette policy: new Player code must use primary. Kept as cyan-info for backwards-compatibility in non-Player apps; all Player references have been migrated. */
    xpCyan: FunctionColors.info,
    diamondSilver: "#E0E0E0",
    bronzeCoin: "#CD7F32",
    successNeon: FunctionColors.success,
    error: FunctionColors.error,
    disabled: TextColors.disabled,
    headerBorder: "rgba(200, 255, 61, 0.2)",
    // Ball level colors
    ballBlue: BallLevelColors.blue,
    ballRed: BallLevelColors.red,
    ballOrange: BallLevelColors.orange,
    ballGreen: BallLevelColors.green,
    ballYellow: BallLevelColors.yellow,
    ballGlow: BallLevelColors.glow,
    // Glow hierarchy
    primaryGlow: GlowColors.primary,
    primaryGlowLight: GlowColors.soft,
    glowSoft: GlowColors.soft,
    glowDark: GlowColors.dark,
    // Status colors
    softStatus: FunctionColors.success,
    softStatusMuted: FunctionColors.successMuted,
    accentWarning: FunctionColors.social,
    accentError: FunctionColors.error,
    accentInfo: FunctionColors.info,
    // Planning
    planning: FunctionColors.planning,
    planningMuted: FunctionColors.planningMuted,
    // Social
    social: FunctionColors.social,
    socialMuted: FunctionColors.socialMuted,
    // Session types
    sessionPrivate: SessionColors.private,
    sessionSemiPrivate: SessionColors.semiPrivate,
    sessionGroup: SessionColors.group,
    sessionPhysical: SessionColors.camp,
    sessionActivity: SessionColors.activity,
    // Role colors
    rolePlayer: RoleColors.player,
    roleCoach: RoleColors.coach,
    roleAdmin: RoleColors.admin,
    roleOwner: RoleColors.owner,
    // Glass effect
    glass: Backgrounds.glass,
    overlay: Backgrounds.overlay,
    // Warning
    warning: FunctionColors.social,
    // Subtle border for cards (replaces decorative gradients)
    borderSubtle: "rgba(255, 255, 255, 0.06)",
    // Frosted Daylight tokens — in dark mode these resolve to the existing
    // neon/white-overlay values so nothing visibly changes for dark consumers.
    accentText: GlowColors.primary,
    accentTextSoft: "rgba(200, 255, 61, 0.10)",
    accentTextBorder: "rgba(200, 255, 61, 0.25)",
    onAccent: "#000000",
    chipBackground: "rgba(255, 255, 255, 0.04)",
    chipBackgroundStrong: "rgba(255, 255, 255, 0.08)",
    chipBorder: "rgba(255, 255, 255, 0.08)",
    divider: "rgba(255, 255, 255, 0.08)",
    iconMuted: "rgba(255, 255, 255, 0.5)",
    glassTintMode: "dark",
    glassHighlight: "rgba(255, 255, 255, 0.15)",
    glassGradientStart: "rgba(26, 34, 53, 0.6)",
    glassGradientEnd: "rgba(21, 27, 41, 0.8)",
    glassGradientStartWeb: "rgba(26, 34, 53, 0.85)",
    glassGradientEndWeb: "rgba(21, 27, 41, 0.95)",
    heroGradientStart: "rgba(200, 255, 61, 0.20)",
    heroGradientEnd: "rgba(11, 13, 16, 0.0)",
    // Modal scrim — heavier on dark mode for premium contrast.
    modalScrim: "rgba(0, 0, 0, 0.7)",
    // Chrome surface tokens — translucent dark backdrop + faint white border
    // for floating chrome (FAB pill labels, header on Android, custom toasts).
    chromeBackground: "rgba(10, 15, 30, 0.88)",
    chromeBackgroundStrong: "rgba(26, 26, 26, 0.95)",
    chromeBorder: "rgba(255, 255, 255, 0.10)",
    chromeText: "#FFFFFF",
    // Legacy compatibility
    green: FunctionColors.success,
    red: FunctionColors.error,
    cyan: FunctionColors.info,
    surface: Backgrounds.surface,
    accentOrange: RoleColors.adminSecondary,
    // Missing color aliases
    accentCyan: FunctionColors.info,
    accentNeon: FunctionColors.info,
    accentGreen: FunctionColors.success,
    accent: FunctionColors.info,
    // Legacy aliases — older screens still reference these tokens.
    card: Backgrounds.card,
    cardLight: Backgrounds.elevated,
    cardElevated: Backgrounds.elevated,
    cardBackground: Backgrounds.card,
    background: Backgrounds.root,
    backgroundElevated: Backgrounds.elevated,
    tint: GlowColors.primary,
    textTertiary: TextColors.muted,
    textPrimary: TextColors.primary,
    danger: FunctionColors.error,
    success: FunctionColors.success,
    surfaceAlt: Backgrounds.surface,
    panel: Backgrounds.card,
    panelBorder: "rgba(255, 255, 255, 0.06)",
    errorNeon: FunctionColors.error,
  },
  // Top-level legacy aliases — older screens still reference Colors.warning,
  // Colors.text, Colors.textSecondary, Colors.primary, etc. directly without
  // a scheme prefix. Keep them pointing at the dark scheme tokens so existing
  // visuals stay identical until those screens are migrated.
  warning: FunctionColors.social,
  text: TextColors.primary,
  textMuted: TextColors.secondary,
  textSubtle: TextColors.muted,
  textSecondary: TextColors.secondary,
  textTertiary: TextColors.muted,
  primary: GlowColors.primary,
  secondary: GlowColors.soft,
  background: Backgrounds.root,
  card: Backgrounds.card,
  cardLight: Backgrounds.elevated,
  cardBackground: Backgrounds.card,
  surface: Backgrounds.surface,
  border: "rgba(255, 255, 255, 0.15)",
  error: FunctionColors.error,
  danger: FunctionColors.error,
  success: FunctionColors.success,
  info: FunctionColors.info,
  tint: GlowColors.primary,
  accent: FunctionColors.info,
  accentError: FunctionColors.error,
  accentWarning: FunctionColors.social,
  accentInfo: FunctionColors.info,
  gold: RoleColors.owner,
  orange: RoleColors.admin,
};

// Snapshot Colors.dark / Colors.light so we can restore them when switching
// schemes or clearing an academy override.
const DarkColorsSnapshot: Record<string, string> = { ...Colors.dark };
const LightColorsSnapshot: Record<string, string> = { ...Colors.light };

export type ResolvedScheme = "light" | "dark";

// Academy theme override (Task #791) — re-export the shared resolved type so
// existing callers keep working.
export type AcademyThemeResolved = SharedAcademyThemeResolved;

let activeScheme: ResolvedScheme = "dark";
// Store the RAW academy theme (with both base + dark overlay) so we can
// re-resolve it for the current scheme on every rebuild. Storing a
// pre-resolved overlay was the bug that made Light mode keep painting dark
// surfaces (Task #811).
let activeAcademyTheme: AcademyTheme | null = null;

function resetSchemeTokens(scheme: ResolvedScheme): void {
  if (scheme === "light") {
    Object.assign(Backgrounds, LightBackgrounds);
    Object.assign(TextColors, LightTextColors);
    Object.assign(Colors.dark, LightColorsSnapshot);
    Object.assign(Colors.light, LightColorsSnapshot);
  } else {
    Object.assign(Backgrounds, DarkBackgrounds);
    Object.assign(TextColors, DarkTextColors);
    Object.assign(Colors.dark, DarkColorsSnapshot);
    Object.assign(Colors.light, LightColorsSnapshot);
  }
}

function applyAcademyOverlay(t: AcademyThemeResolved | null): void {
  if (!t) return;
  if (t.surface) {
    Backgrounds.root = t.surface;
    Colors.dark.backgroundRoot = t.surface;
    Colors.light.backgroundRoot = t.surface;
  }
  if (t.panel) {
    Backgrounds.card = t.panel;
    Colors.dark.backgroundDefault = t.panel;
    Colors.light.backgroundDefault = t.panel;
  }
  if (t.panelElevated) {
    Backgrounds.elevated = t.panelElevated;
    Colors.dark.backgroundSecondary = t.panelElevated;
    Colors.light.backgroundSecondary = t.panelElevated;
  }
  if (t.panelBorder) {
    Colors.dark.borderSubtle = t.panelBorder;
    Colors.light.borderSubtle = t.panelBorder;
    Colors.dark.headerBorder = t.panelBorder;
    Colors.light.headerBorder = t.panelBorder;
  }
  if (t.text) {
    TextColors.primary = t.text;
    Colors.dark.text = t.text;
    Colors.light.text = t.text;
  }
  if (t.textMuted) {
    TextColors.secondary = t.textMuted;
    Colors.dark.textMuted = t.textMuted;
    Colors.dark.textSecondary = t.textMuted;
    Colors.light.textMuted = t.textMuted;
    Colors.light.textSecondary = t.textMuted;
  }
  if (t.primary) {
    Colors.dark.primary = t.primary;
    Colors.dark.primaryGlow = t.primary;
    Colors.dark.glowSoft = t.primary;
    Colors.dark.glowDark = t.primary;
    Colors.dark.tabIconSelected = t.primary;
    Colors.dark.link = t.primary;
    Colors.light.primary = t.primary;
    Colors.light.primaryGlow = t.primary;
    Colors.light.glowSoft = t.primary;
    Colors.light.glowDark = t.primary;
    Colors.light.tabIconSelected = t.primary;
    Colors.light.link = t.primary;
  }
  if (t.secondary) {
    Colors.dark.primaryGlowLight = t.secondary;
    Colors.light.primaryGlowLight = t.secondary;
  }
  if (t.accent) {
    Colors.dark.accent = t.accent;
    Colors.dark.accentInfo = t.accent;
    Colors.light.accent = t.accent;
    Colors.light.accentInfo = t.accent;
  }
}

function rebuild(): void {
  resetSchemeTokens(activeScheme);
  // Player-app legacy contract: many screens read from `Colors.dark` even in
  // light mode because `applyPlayerScheme('light')` historically overwrote
  // Colors.dark with Colors.light. Preserve that contract here.
  if (activeScheme === "light") {
    Object.assign(Colors.dark, LightColorsSnapshot);
  }
  // Re-resolve the academy theme for the CURRENT scheme on every rebuild.
  // This is the fix for Task #811: previously a pre-resolved overlay was
  // cached at the time the user's academy theme last changed, so toggling
  // Light mode kept stamping the dark `surface`/`panel`/`text` from the
  // cached overlay over the freshly-reset light tokens.
  const resolved = activeAcademyTheme
    ? resolveAcademyTheme(activeAcademyTheme, activeScheme)
    : null;
  applyAcademyOverlay(resolved);
}

// =====================================================================
// THEME MUTATION — internal-only API (Task #823)
// ---------------------------------------------------------------------
// Source of truth for the active scheme + academy theme is the React
// `ThemeContext` (`client/contexts/ThemeContext.tsx`). The mutators below
// are intentionally NOT exported via the public surface — they are
// invoked exclusively by the ThemeProvider's `useLayoutEffect` as a
// back-compat shim so the ~470 legacy screens that still read
// `Colors.dark.*` inside `StyleSheet.create({...})` keep flipping with
// the active scheme/academy.
//
// Because no render-time code path can call these mutators anymore, the
// "Cannot update a component while rendering a different component"
// hang fixed in Task #822 is now structurally impossible.
// =====================================================================

function academyThemesEqual(
  a: AcademyTheme | null,
  b: AcademyTheme | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Internal: apply scheme + academy theme by mutating the exported
 * `Colors.*`, `Backgrounds`, `TextColors` objects. Only ever called from
 * the ThemeProvider's `useLayoutEffect`. Bumps `_themeRevision` so the
 * legacy `makeReactiveStyles` proxy re-runs its factory.
 */
export function _applyThemeMutation(
  scheme: ResolvedScheme,
  academyTheme: AcademyTheme | null,
): void {
  const sameScheme = scheme === activeScheme;
  const sameAcademy = academyThemesEqual(activeAcademyTheme, academyTheme);
  if (sameScheme && sameAcademy) return;
  activeScheme = scheme;
  activeAcademyTheme = academyTheme;
  rebuild();
  _themeRevision++;
}

/**
 * Internal: pure resolver used by `useTheme()` to produce a fresh colors
 * object for the given scheme + academy overlay WITHOUT mutating any
 * shared state. New consumers should always read colors via `useTheme()`
 * — `Colors.dark.*` / `Colors.light.*` references in `StyleSheet.create`
 * are legacy and should be migrated incrementally.
 */
export function _resolveActiveColors(
  scheme: ResolvedScheme,
  academyTheme: AcademyTheme | null,
): Record<string, string> {
  const base =
    scheme === "light"
      ? { ...LightColorsSnapshot }
      : { ...DarkColorsSnapshot };
  if (!academyTheme) return base;
  const t = resolveAcademyTheme(academyTheme, scheme);
  if (t.surface) base.backgroundRoot = t.surface;
  if (t.panel) base.backgroundDefault = t.panel;
  if (t.panelElevated) base.backgroundSecondary = t.panelElevated;
  if (t.panelBorder) {
    base.borderSubtle = t.panelBorder;
    base.headerBorder = t.panelBorder;
  }
  if (t.text) base.text = t.text;
  if (t.textMuted) {
    base.textMuted = t.textMuted;
    base.textSecondary = t.textMuted;
  }
  if (t.primary) {
    base.primary = t.primary;
    base.primaryGlow = t.primary;
    base.glowSoft = t.primary;
    base.glowDark = t.primary;
    base.tabIconSelected = t.primary;
    base.link = t.primary;
  }
  if (t.secondary) base.primaryGlowLight = t.secondary;
  if (t.accent) {
    base.accent = t.accent;
    base.accentInfo = t.accent;
  }
  return base;
}

// Monotonic counter bumped whenever `_applyThemeMutation` runs. Internal
// to the legacy `makeReactiveStyles` proxy — new code must NOT read this
// directly. Public `useSyncExternalStore`/`subscribeTheme`/`getThemeRevision`
// API has been removed (Task #823).
export let _themeRevision = 0;

/**
 * Internal: synchronous read of the last-applied scheme for the few
 * legacy `makeReactiveStyles(() => ...)` factories that need to branch
 * on light vs dark inside a module-scope StyleSheet (e.g. DrawerContent).
 * New code must use `useTheme().scheme` from the React ThemeContext.
 */
export function _getActiveSchemeInternal(): ResolvedScheme {
  return activeScheme;
}

// Get avatar color based on player ball level
export function getPlayerLevelColor(ballLevel?: string | null): string {
  switch (ballLevel?.toLowerCase()) {
    case "blue":
      return BallLevelColors.blue;
    case "red":
      return BallLevelColors.red;
    case "orange":
      return BallLevelColors.orange;
    case "green":
      return BallLevelColors.green;
    case "yellow":
      return BallLevelColors.yellow;
    case "glow":
      return BallLevelColors.glow;
    default:
      return GlowColors.primary;
  }
}

export function getPlayerLevelTextColor(ballLevel?: string | null): string {
  return getPlayerLevelColor(ballLevel);
}

// Get role accent color
export function getRoleColor(role?: string | null): string {
  switch (role?.toLowerCase()) {
    case "player":
      return RoleColors.player;
    case "coach":
      return RoleColors.coach;
    case "admin":
    case "academy_owner":
      return RoleColors.admin;
    case "platform_owner":
      return RoleColors.owner;
    default:
      return GlowColors.primary;
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
  // Legacy aliases — older screens still reference xxl/xxxl which used to map to "2xl"/"3xl".
  xxl: 32,
  xxxl: 40,
  inputHeight: 48,
  buttonHeight: 48,
  headerHeight: 140,
  footerCollapsed: 60,
  footerExpanded: 400,
};

const webFontBump = Platform.OS === "web" ? 1 : 0;

export const FontSizes = {
  xs: 10 + webFontBump,
  sm: 12 + webFontBump,
  md: 14 + webFontBump,
  lg: 16 + webFontBump,
  xl: 18 + webFontBump,
  "2xl": 20 + webFontBump,
  "3xl": 24,
  "4xl": 28,
  "5xl": 32,
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
  // Number Emphasis - for metrics, XP, time, stats (dominant)
  numberLarge: {
    fontSize: 32,
    fontWeight: "700" as const,
    letterSpacing: -0.5,
  },
  numberMedium: {
    fontSize: 24,
    fontWeight: "600" as const,
    letterSpacing: -0.3,
  },
  numberSmall: {
    fontSize: 18,
    fontWeight: "600" as const,
  },
  // Labels - smaller, more subtle (supporting text)
  labelLarge: {
    fontSize: 13,
    fontWeight: "500" as const,
    letterSpacing: 0.3,
  },
  labelSmall: {
    fontSize: 11,
    fontWeight: "500" as const,
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
  },
  // Section titles with better spacing
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
  },
  // Legacy aliases (kept for older screens)
  bodySmall: {
    fontSize: 14,
    fontWeight: "400" as const,
  },
  bodyLarge: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  heading1: {
    fontSize: 28,
    fontWeight: "700" as const,
  },
  heading2: {
    fontSize: 20,
    fontWeight: "600" as const,
  },
  heading3: {
    fontSize: 18,
    fontWeight: "600" as const,
  },
  heading4: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "600" as const,
  },
};

// Premium Card Styles
export const CardStyles = {
  // Base card - subtle elevation
  base: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  // Elevated card (modals, sheets)
  elevated: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  glow: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.15)",
  },
  // Glass effect card
  glass: {
    backgroundColor: Backgrounds.glass,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  // Interactive card (pressable)
  interactive: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  glowCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.12)",
    borderTopColor: "rgba(200, 255, 61, 0.15)",
  },
  statusCard: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
};

// Premium Shadow Presets (cross-platform: iOS shadow*, Android elevation, Web boxShadow)
function createShadow(color: string, offsetY: number, opacity: number, radius: number, elevation: number) {
  const base: any = {
    shadowColor: color,
    shadowOffset: { width: 0, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation,
  };
  if (Platform.OS === "web") {
    const r = parseInt(color.slice(1, 3), 16) || 0;
    const g = parseInt(color.slice(3, 5), 16) || 0;
    const b = parseInt(color.slice(5, 7), 16) || 0;
    base.boxShadow = `0px ${offsetY}px ${radius * 2}px rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return base;
}

export const Shadows = {
  none: createShadow("#000000", 0, 0, 0, 0),
  subtle: createShadow("#000000", 2, 0.15, 4, 2),
  medium: createShadow("#000000", 4, 0.2, 8, 4),
  glow: createShadow(GlowColors.primary, 2, 0.15, 6, 4),
  glowSubtle: createShadow(GlowColors.primary, 1, 0.08, 4, 2),
  glowAdmin: createShadow(RoleColors.admin, 2, 0.15, 6, 4),
  glowError: createShadow(FunctionColors.error, 2, 0.12, 6, 3),
};

// Gradient presets for premium UI
export const Gradients = {
  // Subtle card gradient (top to bottom)
  cardSubtle: ["rgba(255, 255, 255, 0.03)", "rgba(0, 0, 0, 0.02)"],
  // Primary glow gradient
  primaryGlow: ["rgba(200, 255, 61, 0.15)", "rgba(200, 255, 61, 0.02)"],
  // Admin glow gradient
  adminGlow: ["rgba(255, 133, 27, 0.15)", "rgba(255, 133, 27, 0.02)"],
  // Status gradient (muted green)
  statusMuted: ["rgba(0, 230, 118, 0.12)", "rgba(0, 230, 118, 0.04)"],
  // Dark fade
  darkFade: [Backgrounds.root, "rgba(11, 13, 16, 0)"],
  // Glass overlay
  glassOverlay: ["rgba(17, 20, 26, 0.9)", "rgba(17, 20, 26, 0.7)"],
  // Hero glow (for epic screens)
  heroGlow: ["rgba(200, 255, 61, 0.2)", "rgba(200, 255, 61, 0.05)", "transparent"],
};

// Button Style Presets
export const ButtonStyles = {
  // Primary CTA - Glow
  primary: {
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    ...Shadows.glow,
  },
  // Secondary - Outline
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  // Ghost - Subtle
  ghost: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  // Danger
  danger: {
    backgroundColor: FunctionColors.error,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    ...Shadows.glowError,
  },
  // Admin primary
  admin: {
    backgroundColor: RoleColors.admin,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    ...Shadows.glowAdmin,
  },
};

export const CardElevation = {
  base: {
    backgroundColor: '#151A22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  shadow: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.4,
      shadowRadius: 15,
    },
    android: {
      elevation: 8,
    },
    web: {
      boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.4)',
    },
    default: {},
  }),
};

export const SectionAccents = {
  session: 'rgba(200, 255, 61, 0.04)',
  feedback: 'rgba(255, 176, 32, 0.04)',
  spotlight: 'rgba(255, 215, 0, 0.04)',
  discovery: 'rgba(77, 163, 255, 0.04)',
  community: 'rgba(155, 89, 182, 0.04)',
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
