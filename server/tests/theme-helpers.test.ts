import { describe, it, expect } from 'vitest';
import {
  parseHex,
  relativeLuminance,
  contrastRatio,
  safeTextOn,
  isReadable,
  academyThemeSchema,
  defaultAcademyTheme,
  themePresets,
  type AcademyTheme,
  type AcademyThemeColors,
} from '../../shared/theme';

describe('shared/theme — color helpers', () => {
  describe('parseHex', () => {
    it('parses a 6-digit hex colour into rgb', () => {
      expect(parseHex('#000000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(parseHex('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
      expect(parseHex('#C8FF3D')).toEqual({ r: 200, g: 255, b: 61 });
    });

    it('is case-insensitive on hex letters', () => {
      expect(parseHex('#abcdef')).toEqual(parseHex('#ABCDEF'));
    });

    it('returns null for invalid input', () => {
      expect(parseHex('')).toBeNull();
      expect(parseHex('#FFF')).toBeNull(); // 3-digit shorthand not supported
      expect(parseHex('123456')).toBeNull(); // missing leading #
      expect(parseHex('#GGGGGG')).toBeNull();
      expect(parseHex('rgba(0,0,0,1)')).toBeNull();
    });
  });

  describe('relativeLuminance', () => {
    it('returns 0 for pure black and 1 for pure white', () => {
      expect(relativeLuminance('#000000')).toBe(0);
      expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    });

    it('returns 0 for invalid colours', () => {
      expect(relativeLuminance('not-a-colour')).toBe(0);
    });
  });

  describe('contrastRatio', () => {
    it('returns 21 for black on white (the maximum)', () => {
      expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
      expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    });

    it('returns 1 for identical colours', () => {
      expect(contrastRatio('#7F7F7F', '#7F7F7F')).toBeCloseTo(1, 5);
    });

    it('is symmetric (ratio(a,b) === ratio(b,a))', () => {
      const a = '#1E62D0';
      const b = '#FFFFFF';
      expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 5);
    });
  });

  describe('safeTextOn', () => {
    it('returns black for light backgrounds', () => {
      expect(safeTextOn('#FFFFFF')).toBe('#000000');
      expect(safeTextOn('#F5F6F8')).toBe('#000000');
      expect(safeTextOn('#FFD700')).toBe('#000000');
    });

    it('returns white for dark backgrounds', () => {
      expect(safeTextOn('#000000')).toBe('#FFFFFF');
      expect(safeTextOn('#0B0D10')).toBe('#FFFFFF');
      expect(safeTextOn('#11141A')).toBe('#FFFFFF');
    });

    it('splits on luminance > 0.5 (the documented behaviour)', () => {
      // The current implementation uses a single luminance threshold rather
      // than picking the higher-contrast option per background. Lock the
      // behaviour in so any future change is intentional.
      for (const bg of ['#FFFFFF', '#000000', '#C8FF3D', '#1E62D0', '#E2613B', '#0EA5A5', '#FFD700']) {
        const fg = safeTextOn(bg);
        const expected = relativeLuminance(bg) > 0.5 ? '#000000' : '#FFFFFF';
        expect(fg).toBe(expected);
      }
    });

    it('produces a readable colour for the high-contrast extremes', () => {
      // Pure black/white backgrounds — and the Glow Green dark surface — must
      // always satisfy WCAG AA with the safeTextOn fallback.
      for (const bg of ['#FFFFFF', '#000000', '#0B0D10', '#11141A']) {
        expect(isReadable(safeTextOn(bg), bg)).toBe(true);
      }
    });
  });

  describe('isReadable', () => {
    it('passes WCAG AA for high-contrast pairs', () => {
      expect(isReadable('#000000', '#FFFFFF')).toBe(true);
      expect(isReadable('#FFFFFF', '#0B0D10')).toBe(true);
    });

    it('rejects low-contrast pairs', () => {
      expect(isReadable('#C8FF3D', '#FFFFFF')).toBe(false); // neon lime on white
      expect(isReadable('#777777', '#888888')).toBe(false);
    });

    it('uses 4.5:1 as the AA threshold', () => {
      // contrast ratio of #767676 on #FFFFFF is ~4.54 (just above)
      expect(isReadable('#767676', '#FFFFFF')).toBe(true);
      // contrast ratio of #777777 on #FFFFFF is ~4.48 (just below)
      expect(isReadable('#777777', '#FFFFFF')).toBe(false);
    });
  });
});

describe('shared/theme — academyThemeSchema', () => {
  it('accepts the built-in defaultAcademyTheme', () => {
    expect(() => academyThemeSchema.parse(defaultAcademyTheme)).not.toThrow();
  });

  it('accepts every shipped preset', () => {
    for (const preset of themePresets) {
      expect(() => academyThemeSchema.parse(preset.theme), preset.id).not.toThrow();
    }
  });

  it('accepts an empty object (all fields optional)', () => {
    expect(() => academyThemeSchema.parse({})).not.toThrow();
  });

  it('accepts rgba() for panelBorder', () => {
    expect(() =>
      academyThemeSchema.parse({ panelBorder: 'rgba(255, 255, 255, 0.06)' }),
    ).not.toThrow();
  });

  it('rejects 3-digit hex shorthand', () => {
    expect(() => academyThemeSchema.parse({ primary: '#FFF' })).toThrow();
  });

  it('rejects non-hex / non-rgba strings', () => {
    expect(() => academyThemeSchema.parse({ primary: 'red' })).toThrow();
    expect(() => academyThemeSchema.parse({ primary: '#ZZZZZZ' })).toThrow();
    expect(() => academyThemeSchema.parse({ primary: '' })).toThrow();
  });

  it('rejects unknown top-level keys (strict mode)', () => {
    expect(() =>
      academyThemeSchema.parse({ primary: '#C8FF3D', extraneous: '#000000' }),
    ).toThrow();
  });

  it('rejects unknown keys inside the dark override (strict mode)', () => {
    expect(() =>
      academyThemeSchema.parse({ dark: { primary: '#C8FF3D', evil: '#000000' } }),
    ).toThrow();
  });

  it('rejects non-string colour values', () => {
    expect(() => academyThemeSchema.parse({ primary: 123 as any })).toThrow();
    expect(() => academyThemeSchema.parse({ primary: null as any })).toThrow();
  });

  it('accepts a fully populated dark override', () => {
    expect(() => academyThemeSchema.parse(defaultAcademyTheme)).not.toThrow();
    expect(() =>
      academyThemeSchema.parse({
        primary: '#C8FF3D',
        dark: { primary: '#C8FF3D', surface: '#0B0D10' },
      }),
    ).not.toThrow();
  });
});

// ---------- Resolved theme overlay snapshot ----------
//
// The client merges `defaultAcademyTheme` on top of the built-in design
// tokens through `setActiveAcademyTheme()` in `client/constants/theme.ts`.
// For the snapshot we compute the *flat per-mode* overlay the client
// actually applies — base colours for light, base + dark override for dark.
// A regression here means the Glow Green default has shifted and every
// academy that hasn't customised will look different.
function resolveOverlay(
  theme: AcademyTheme,
  mode: 'light' | 'dark',
): AcademyThemeColors {
  const { dark, ...base } = theme;
  if (mode === 'light') return { ...base };
  return { ...base, ...(dark ?? {}) };
}

describe('shared/theme — resolved Glow Green overlay snapshot', () => {
  it('light overlay matches the locked Glow Green defaults', () => {
    expect(resolveOverlay(defaultAcademyTheme, 'light')).toMatchInlineSnapshot(`
      {
        "accent": "#00D4FF",
        "panel": "#FFFFFF",
        "panelBorder": "rgba(11, 13, 16, 0.06)",
        "panelElevated": "#FFFFFF",
        "primary": "#C8FF3D",
        "secondary": "#A6E92A",
        "surface": "#F5F6F8",
        "text": "#0B0D10",
        "textMuted": "#3D434E",
      }
    `);
  });

  it('dark overlay matches the locked Glow Green defaults', () => {
    expect(resolveOverlay(defaultAcademyTheme, 'dark')).toMatchInlineSnapshot(`
      {
        "accent": "#00D4FF",
        "panel": "#11141A",
        "panelBorder": "rgba(255, 255, 255, 0.06)",
        "panelElevated": "#171B22",
        "primary": "#C8FF3D",
        "secondary": "#A6E92A",
        "surface": "#0B0D10",
        "text": "#FFFFFF",
        "textMuted": "#B8BCC6",
      }
    `);
  });

  it('Glow Green primary is readable on its dark surface', () => {
    const dark = resolveOverlay(defaultAcademyTheme, 'dark');
    expect(isReadable(dark.text!, dark.surface!)).toBe(true);
    expect(isReadable(dark.text!, dark.panel!)).toBe(true);
  });

  it('Glow Green text is readable on its light surface', () => {
    const light = resolveOverlay(defaultAcademyTheme, 'light');
    expect(isReadable(light.text!, light.surface!)).toBe(true);
    expect(isReadable(light.text!, light.panel!)).toBe(true);
  });
});
