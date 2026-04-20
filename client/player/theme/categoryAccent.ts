// ============================================================================
// Tonal category accents (Task #858)
// ============================================================================
//
// Player-app cards historically had hardcoded accent colours (gold for
// Tournaments, cyan for Open Matches, purple for Glow Lessons, etc.). When a
// player picked a custom theme preset (e.g. Classic Blue), only the chrome
// re-tinted while the cards stayed a bonte mix.
//
// This helper derives a *tonal family* from `theme.primary`: it converts the
// primary to HSL and fans out 6 deterministic tints (lightness ±, optional
// hue rotation) that every card category maps to. Pure function, memoized
// per (theme.primary × category × mode) — same input → same output.
//
// Gold (`AWARD_GOLD`) stays reserved for true award/win semantics:
//   - Trophy icons (Ionicons name="trophy")
//   - Star ratings (name="star" used as a rating, not a bookmark)
//   - "Player of the Week" / "Champion" winner ribbons
//   - Olympic-medal-style winner ribbons
//
// Mapping table (category → tint):
//   heroPrimary      → base
//   tournaments      → deep        (regal / heavy)
//   openMatches      → coolRotate  (cooler hue swing — fresh / sport)
//   glowLessons      → warmRotate  (warmer hue swing — playful / premium)
//   spotlight        → lighter     (soft halo)
//   heroSecondary    → light       (chrome highlight)
//   lessonProgress   → warmRotate
//   socialActivity   → light
//   friendStrip      → base
//   eventsHero       → deep
//   discovery        → lighter
//   training         → base
// ============================================================================

import {
  defaultAcademyTheme,
  resolveTheme,
  type AcademyTheme,
} from "@shared/theme";

export type CardCategory =
  | "tournaments"
  | "openMatches"
  | "glowLessons"
  | "spotlight"
  | "heroPrimary"
  | "heroSecondary"
  | "lessonProgress"
  | "socialActivity"
  | "friendStrip"
  | "eventsHero"
  | "discovery"
  | "training";

/** Canonical "award gold" — reserved for trophies, star ratings, winner ribbons. */
export const AWARD_GOLD = "#FFD700";
/** Warm award gradient companion (used alongside AWARD_GOLD for ribbons). */
export const AWARD_GOLD_WARM = "#FFA500";

export type AwardContext =
  | "trophy"
  | "starRating"
  | "winnerRibbon"
  | "championBadge";

/** Tiny clarity helper — true for the explicit award allow-list. */
export function isAwardContext(context: AwardContext): boolean {
  return (
    context === "trophy" ||
    context === "starRating" ||
    context === "winnerRibbon" ||
    context === "championBadge"
  );
}

// ---------- HSL math (pure) ----------

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToHsl(hex: string): Hsl | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex({ h, s, l }: Hsl): string {
  const sN = Math.max(0, Math.min(100, s)) / 100;
  const lN = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = lN - c / 2;
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

// ---------- Tint table ----------

interface Tint {
  /** Hue rotation in degrees (deterministic, no randomness). */
  dh?: number;
  /** Saturation delta in % points. */
  ds?: number;
  /** Lightness delta in % points. */
  dl: number;
}

const TINTS = {
  base: { dl: 0 },
  deep: { dl: -14, ds: +4 },
  light: { dl: +12 },
  lighter: { dl: +22, ds: -6 },
  warmRotate: { dh: +30, dl: +6 },
  coolRotate: { dh: -32, dl: +4 },
} as const satisfies Record<string, Tint>;

type TintName = keyof typeof TINTS;

const CATEGORY_TINT: Record<CardCategory, TintName> = {
  heroPrimary: "base",
  heroSecondary: "light",
  tournaments: "deep",
  openMatches: "coolRotate",
  glowLessons: "warmRotate",
  spotlight: "lighter",
  lessonProgress: "warmRotate",
  socialActivity: "light",
  friendStrip: "base",
  eventsHero: "deep",
  discovery: "lighter",
  training: "base",
};

// Stable index per category — used to pull low-saturation themes apart so
// Court Carbon (s≈10) doesn't collapse into one indistinguishable grey.
const CATEGORY_ORDER: CardCategory[] = [
  "heroPrimary",
  "heroSecondary",
  "tournaments",
  "openMatches",
  "glowLessons",
  "spotlight",
  "lessonProgress",
  "socialActivity",
  "friendStrip",
  "eventsHero",
  "discovery",
  "training",
];

// ---------- Memoization ----------

type Mode = "light" | "dark";

const memo = new Map<string, string>();
const MAX_MEMO = 256;

function memoKey(primary: string, category: CardCategory, mode: Mode): string {
  return `${primary.toLowerCase()}|${category}|${mode}`;
}

function compute(primary: string, category: CardCategory, mode: Mode): string {
  const hsl = hexToHsl(primary);
  if (!hsl) return primary;
  const tint = TINTS[CATEGORY_TINT[category]];
  let dh = tint.dh ?? 0;
  let ds = tint.ds ?? 0;
  let dl = tint.dl;

  // Low-saturation guard: a near-grey primary (Court Carbon) would produce
  // 6 indistinguishable greys if we only shifted lightness. Bump saturation
  // and stagger hue per category so tints stay visually distinct.
  if (hsl.s < 18) {
    const idx = CATEGORY_ORDER.indexOf(category);
    dh = (dh || 0) + idx * 28;
    ds = Math.max(ds, 0) + 28;
  }

  // Dark-mode bias: cards live on a dark surface, so push tints slightly
  // brighter so they pop. Light mode does the opposite for legibility on
  // pale panels.
  if (mode === "dark") dl += 4;
  else dl -= 2;

  const h = ((hsl.h + dh) % 360 + 360) % 360;
  const s = Math.max(8, Math.min(96, hsl.s + ds));
  const l = Math.max(18, Math.min(82, hsl.l + dl));
  return hslToHex({ h, s, l });
}

/**
 * Resolve the tonal accent for a given card category.
 *
 * Pure & memoized — safe to call inline in render. Falls back to the default
 * Glow Green palette when the supplied theme has no primary set.
 */
export function getCategoryAccent(
  category: CardCategory,
  theme: AcademyTheme | null | undefined,
  mode: Mode,
): string {
  const resolved = resolveTheme(theme, mode);
  const primary =
    resolved.primary ?? defaultAcademyTheme.primary ?? "#C8FF3D";
  const key = memoKey(primary, category, mode);
  const cached = memo.get(key);
  if (cached) return cached;
  const value = compute(primary, category, mode);
  if (memo.size >= MAX_MEMO) {
    // Drop oldest insertion to keep the cache bounded.
    const firstKey = memo.keys().next().value;
    if (firstKey) memo.delete(firstKey);
  }
  memo.set(key, value);
  return value;
}

/**
 * Convenience: returns the full set of category accents for a theme/mode.
 * Useful for components that render multiple tinted children at once.
 */
export function getCategoryAccents(
  theme: AcademyTheme | null | undefined,
  mode: Mode,
): Record<CardCategory, string> {
  const out = {} as Record<CardCategory, string>;
  for (const c of CATEGORY_ORDER) out[c] = getCategoryAccent(c, theme, mode);
  return out;
}
