// ============================================
// Academy Theme — shared types, defaults & helpers
// (Task #791)
// ============================================
//
// One academy = one structured `AcademyTheme`. The client merges this on top of
// the built-in design tokens so every academy can ship its own brand colours
// without code changes.
//
// Conventions:
// - All colours are 6-digit hex strings ("#RRGGBB"); rgba is allowed for
//   `panelBorder` only (translucent overlay border).
// - System colours (success/warning/error) are NOT themable — they stay fixed
//   for legibility / accessibility.
// - `dark` is an optional override block applied when the active mode is dark.
//   When omitted, the base values are used in both light and dark.

import { z } from "zod";

export interface AcademyThemeColors {
  /** Primary CTA / accent colour (buttons, focus, active state). */
  primary?: string;
  /** Secondary accent — used for hover/soft states and chips. */
  secondary?: string;
  /** Tertiary highlight (badges, info pills). */
  accent?: string;
  /** App root background. */
  surface?: string;
  /** Default panel / card background. */
  panel?: string;
  /** Elevated panel (modals, sheets). */
  panelElevated?: string;
  /** Border colour used by panels. */
  panelBorder?: string;
  /** Primary text colour on top of `panel` / `surface`. */
  text?: string;
  /** Muted / secondary text. */
  textMuted?: string;
}

export interface AcademyTheme extends AcademyThemeColors {
  /** Optional dark-mode override applied on top of the base values. */
  dark?: AcademyThemeColors;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const RGBA_RE = /^rgba?\([0-9.,\s]+\)$/i;

const colorSchema = z
  .string()
  .refine((v) => HEX_RE.test(v) || RGBA_RE.test(v), {
    message: "Color must be a 6-digit hex (#RRGGBB) or rgba(...)",
  });

const colorsSchema = z
  .object({
    primary: colorSchema.optional(),
    secondary: colorSchema.optional(),
    accent: colorSchema.optional(),
    surface: colorSchema.optional(),
    panel: colorSchema.optional(),
    panelElevated: colorSchema.optional(),
    panelBorder: colorSchema.optional(),
    text: colorSchema.optional(),
    textMuted: colorSchema.optional(),
  })
  .strict();

export const academyThemeSchema = colorsSchema
  .extend({ dark: colorsSchema.optional() })
  .strict();

export type AcademyThemeInput = z.infer<typeof academyThemeSchema>;

// ---------- Defaults: reproduce the current Glow Green look ----------

export const defaultAcademyTheme: AcademyTheme = {
  primary: "#C8FF3D",
  secondary: "#A6E92A",
  accent: "#00D4FF",
  surface: "#F5F6F8",
  panel: "#FFFFFF",
  panelElevated: "#FFFFFF",
  panelBorder: "rgba(11, 13, 16, 0.06)",
  text: "#0B0D10",
  textMuted: "#3D434E",
  dark: {
    primary: "#C8FF3D",
    secondary: "#A6E92A",
    accent: "#00D4FF",
    surface: "#0B0D10",
    panel: "#11141A",
    panelElevated: "#171B22",
    panelBorder: "rgba(255, 255, 255, 0.06)",
    text: "#FFFFFF",
    textMuted: "#B8BCC6",
  },
};

// ---------- Presets ----------

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  theme: AcademyTheme;
}

export const themePresets: ThemePreset[] = [
  {
    id: "glow-green",
    name: "Glow Green",
    description: "Default Glow Up energy — neon lime on midnight.",
    theme: defaultAcademyTheme,
  },
  {
    id: "classic-blue",
    name: "Classic Blue",
    description: "Traditional academy — calm royal blue on white.",
    theme: {
      primary: "#1E62D0",
      secondary: "#4DA3FF",
      accent: "#FFB020",
      surface: "#F4F6FB",
      panel: "#FFFFFF",
      panelElevated: "#FFFFFF",
      panelBorder: "rgba(11, 13, 16, 0.08)",
      text: "#0B1A33",
      textMuted: "#475569",
      dark: {
        primary: "#4DA3FF",
        secondary: "#1E62D0",
        accent: "#FFB020",
        surface: "#0A1428",
        panel: "#102040",
        panelElevated: "#16294F",
        panelBorder: "rgba(255, 255, 255, 0.08)",
        text: "#FFFFFF",
        textMuted: "#9DB4D8",
      },
    },
  },
  {
    id: "clay-orange",
    name: "Clay Orange",
    description: "Warm clay-court terracotta with cream surfaces.",
    theme: {
      primary: "#E2613B",
      secondary: "#F39C12",
      accent: "#2ECC71",
      surface: "#FFF8F2",
      panel: "#FFFFFF",
      panelElevated: "#FFFFFF",
      panelBorder: "rgba(94, 41, 21, 0.10)",
      text: "#3B1B0E",
      textMuted: "#8A5A45",
      dark: {
        primary: "#FF7A4D",
        secondary: "#F39C12",
        accent: "#2ECC71",
        surface: "#1F120C",
        panel: "#2A1A12",
        panelElevated: "#352016",
        panelBorder: "rgba(255, 200, 170, 0.12)",
        text: "#FFFFFF",
        textMuted: "#D9B7A4",
      },
    },
  },
  {
    id: "midnight-gold",
    name: "Midnight Gold",
    description: "Premium black & gold — exclusive academy vibe.",
    theme: {
      primary: "#FFD700",
      secondary: "#FFC000",
      accent: "#E040FB",
      surface: "#FAF7EC",
      panel: "#FFFFFF",
      panelElevated: "#FFFFFF",
      panelBorder: "rgba(11, 13, 16, 0.08)",
      text: "#1A1300",
      textMuted: "#5A4A1A",
      dark: {
        primary: "#FFD700",
        secondary: "#FFC000",
        accent: "#E040FB",
        surface: "#0A0A0F",
        panel: "#15151F",
        panelElevated: "#1F1F2D",
        panelBorder: "rgba(255, 215, 0, 0.15)",
        text: "#FFFFFF",
        textMuted: "#C4BFAC",
      },
    },
  },
  {
    id: "ocean-teal",
    name: "Ocean Teal",
    description: "Cool teal & coral, modern and friendly.",
    theme: {
      primary: "#0EA5A5",
      secondary: "#14B8A6",
      accent: "#FB7185",
      surface: "#F1FAF9",
      panel: "#FFFFFF",
      panelElevated: "#FFFFFF",
      panelBorder: "rgba(11, 13, 16, 0.06)",
      text: "#0F2A2A",
      textMuted: "#476767",
      dark: {
        primary: "#2DD4BF",
        secondary: "#14B8A6",
        accent: "#FB7185",
        surface: "#06181A",
        panel: "#0E2528",
        panelElevated: "#143337",
        panelBorder: "rgba(255, 255, 255, 0.08)",
        text: "#FFFFFF",
        textMuted: "#9CC8C5",
      },
    },
  },
  {
    id: "sunset-coral",
    name: "Sunset Coral",
    description: "Warm coral & peach with a sunset glow.",
    theme: {
      primary: "#FF6B6B",
      secondary: "#FFB084",
      accent: "#7C3AED",
      surface: "#FFF5F2",
      panel: "#FFFFFF",
      panelElevated: "#FFFFFF",
      panelBorder: "rgba(94, 28, 28, 0.10)",
      text: "#3B0F0F",
      textMuted: "#7A4E4E",
      dark: {
        primary: "#FF8A8A",
        secondary: "#FFB084",
        accent: "#A78BFA",
        surface: "#1A0F10",
        panel: "#27181A",
        panelElevated: "#321F22",
        panelBorder: "rgba(255, 200, 200, 0.12)",
        text: "#FFFFFF",
        textMuted: "#E5BEBE",
      },
    },
  },
  {
    id: "forest-pine",
    name: "Forest Pine",
    description: "Deep pine green with mossy undertones.",
    theme: {
      primary: "#2F6B3A",
      secondary: "#4F8C5B",
      accent: "#D9A74A",
      surface: "#F2F6F1",
      panel: "#FFFFFF",
      panelElevated: "#FFFFFF",
      panelBorder: "rgba(20, 40, 25, 0.08)",
      text: "#0F1E12",
      textMuted: "#3D5A45",
      dark: {
        primary: "#6BC084",
        secondary: "#4F8C5B",
        accent: "#D9A74A",
        surface: "#0A140C",
        panel: "#13231A",
        panelElevated: "#1A2E22",
        panelBorder: "rgba(180, 220, 190, 0.10)",
        text: "#FFFFFF",
        textMuted: "#B6CFB9",
      },
    },
  },
  {
    id: "ice-lavender",
    name: "Ice Lavender",
    description: "Cool lavender with icy white surfaces.",
    theme: {
      primary: "#7C6BFF",
      secondary: "#A89CFF",
      accent: "#22D3EE",
      surface: "#F7F6FE",
      panel: "#FFFFFF",
      panelElevated: "#FFFFFF",
      panelBorder: "rgba(60, 50, 110, 0.08)",
      text: "#1A1340",
      textMuted: "#5A5280",
      dark: {
        primary: "#A89CFF",
        secondary: "#7C6BFF",
        accent: "#22D3EE",
        surface: "#0E0A22",
        panel: "#1A1538",
        panelElevated: "#231D48",
        panelBorder: "rgba(200, 195, 255, 0.10)",
        text: "#FFFFFF",
        textMuted: "#C5BFE8",
      },
    },
  },
  {
    id: "royal-plum",
    name: "Royal Plum",
    description: "Rich plum & magenta with deep contrast.",
    theme: {
      primary: "#7E1F86",
      secondary: "#B83AC0",
      accent: "#F59E0B",
      surface: "#FAF3FA",
      panel: "#FFFFFF",
      panelElevated: "#FFFFFF",
      panelBorder: "rgba(80, 20, 90, 0.10)",
      text: "#2A0830",
      textMuted: "#6E4477",
      dark: {
        primary: "#D87BDF",
        secondary: "#B83AC0",
        accent: "#F59E0B",
        surface: "#150518",
        panel: "#22082A",
        panelElevated: "#2D0F38",
        panelBorder: "rgba(220, 170, 230, 0.12)",
        text: "#FFFFFF",
        textMuted: "#D8B6DD",
      },
    },
  },
  {
    id: "carbon-cream",
    name: "Carbon Cream",
    description: "Charcoal greys with warm cream highlights.",
    theme: {
      primary: "#1F2937",
      secondary: "#4B5563",
      accent: "#E8C07D",
      surface: "#FAF7F0",
      panel: "#FFFFFF",
      panelElevated: "#FFFFFF",
      panelBorder: "rgba(20, 20, 20, 0.10)",
      text: "#111418",
      textMuted: "#4B5563",
      dark: {
        primary: "#E8C07D",
        secondary: "#A3825A",
        accent: "#FAFAFA",
        surface: "#0A0A0B",
        panel: "#15151A",
        panelElevated: "#1F1F25",
        panelBorder: "rgba(232, 192, 125, 0.14)",
        text: "#FAFAFA",
        textMuted: "#B9B5AC",
      },
    },
  },
];

// ---------- Theme resolution ----------

/**
 * A flat colour set already resolved for one specific scheme. The client
 * mutates the design tokens with these values. Mirrors `AcademyThemeColors`
 * (no nested overlays).
 */
export interface AcademyThemeResolved {
  primary?: string;
  secondary?: string;
  accent?: string;
  surface?: string;
  panel?: string;
  panelElevated?: string;
  panelBorder?: string;
  text?: string;
  textMuted?: string;
}

/**
 * Resolve an `AcademyTheme` for a specific scheme. The base of every
 * built-in preset stores **light** values; an optional `dark` overlay holds
 * the dark variant. When the saved theme has no light values for a given
 * key, fall back to `defaultAcademyTheme` so light mode never inherits a
 * dark surface accidentally.
 */
export function resolveTheme(
  theme: AcademyTheme | null | undefined,
  scheme: "light" | "dark",
): AcademyThemeResolved {
  // Step 1: start from the safe light defaults so neutrals always have a
  // valid light value before we overlay anything.
  const out: AcademyThemeResolved = {
    primary: defaultAcademyTheme.primary,
    secondary: defaultAcademyTheme.secondary,
    accent: defaultAcademyTheme.accent,
    surface: defaultAcademyTheme.surface,
    panel: defaultAcademyTheme.panel,
    panelElevated: defaultAcademyTheme.panelElevated,
    panelBorder: defaultAcademyTheme.panelBorder,
    text: defaultAcademyTheme.text,
    textMuted: defaultAcademyTheme.textMuted,
  };

  // Step 2: in dark mode, swap in the default dark overlay so we don't
  // start from light defaults.
  if (scheme === "dark" && defaultAcademyTheme.dark) {
    Object.assign(out, defaultAcademyTheme.dark);
  }

  if (!theme) return out;

  // Step 3: overlay the saved theme's base. The base is treated as the
  // light palette for that academy (matching the convention used in every
  // built-in preset).
  for (const k of Object.keys(theme) as (keyof AcademyTheme)[]) {
    if (k === "dark") continue;
    const v = theme[k];
    if (typeof v === "string") (out as any)[k] = v;
  }

  // Step 4: in dark mode, overlay the saved theme's dark variant on top
  // of its base so dark wins where it's defined.
  if (scheme === "dark" && theme.dark) {
    for (const k of Object.keys(theme.dark) as (keyof typeof theme.dark)[]) {
      const v = theme.dark[k];
      if (typeof v === "string") (out as any)[k] = v;
    }
  }

  return out;
}

// ---------- Helpers ----------

/** Parse a hex string to {r,g,b} in 0..255. Returns null when invalid. */
export function parseHex(input: string): { r: number; g: number; b: number } | null {
  if (!input || !HEX_RE.test(input)) return null;
  return {
    r: parseInt(input.slice(1, 3), 16),
    g: parseInt(input.slice(3, 5), 16),
    b: parseInt(input.slice(5, 7), 16),
  };
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance for a hex color. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  return (
    0.2126 * srgbToLinear(rgb.r) +
    0.7152 * srgbToLinear(rgb.g) +
    0.0722 * srgbToLinear(rgb.b)
  );
}

/** WCAG contrast ratio between two hex colors (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Pick a safe text colour ("#000000" or "#FFFFFF") for a given background hex.
 * Use this as a fallback when the user-chosen text colour is unreadable.
 */
export function safeTextOn(bg: string): "#000000" | "#FFFFFF" {
  return relativeLuminance(bg) > 0.5 ? "#000000" : "#FFFFFF";
}

/** True when contrast is at or above WCAG AA for normal text. */
export function isReadable(text: string, background: string): boolean {
  return contrastRatio(text, background) >= 4.5;
}

// ---------- Outbound branding (PDFs / emails) ----------

/**
 * A small bundle of resolved colours ready to drop into HTML/CSS strings for
 * outbound assets (invoice PDFs, transactional emails). Falls back to the
 * built-in Glow Green theme when the academy has no theme configured or only
 * supplies a partial palette.
 */
export interface BrandingColors {
  primary: string;
  secondary: string;
  /** Black or white — whichever is readable on top of `primary`. */
  primaryText: "#000000" | "#FFFFFF";
  /** Black or white — whichever is readable on top of `secondary`. */
  secondaryText: "#000000" | "#FFFFFF";
}

/**
 * Resolve a defensive set of brand colours for outbound content. Always
 * returns valid hex strings: missing or invalid fields fall back to
 * `defaultAcademyTheme` (Glow Green).
 */
export function getBrandingColors(
  theme?: Partial<AcademyThemeColors> | null,
): BrandingColors {
  const primary =
    theme?.primary && HEX_RE.test(theme.primary)
      ? theme.primary
      : (defaultAcademyTheme.primary as string);
  const secondary =
    theme?.secondary && HEX_RE.test(theme.secondary)
      ? theme.secondary
      : (defaultAcademyTheme.secondary as string);
  return {
    primary,
    secondary,
    primaryText: safeTextOn(primary),
    secondaryText: safeTextOn(secondary),
  };
}
