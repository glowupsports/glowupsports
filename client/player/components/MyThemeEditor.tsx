import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Platform,
  StyleSheet,
  ScrollView,
} from "react-native";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import {
  themePresets,
  defaultAcademyTheme,
  contrastRatio,
  safeTextOn,
  type AcademyTheme,
  type AcademyThemeColors,
} from "@shared/theme";
import ColorPickerModal from "./ColorPickerModal";
import { usePlayerAppearanceOptional } from "@/player/context/PlayerAppearanceContext";
import { makeReactiveStyles, useThemeReactivity } from "@/hooks/useThemedStyles";

const HEX6_RE = /^#[0-9a-fA-F]{6}$/;

type Mode = "light" | "dark";

const FIELDS: ReadonlyArray<{ key: keyof AcademyThemeColors; label: string }> = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "surface", label: "Surface" },
  { key: "panel", label: "Panel" },
  { key: "panelElevated", label: "Panel Elevated" },
  { key: "panelBorder", label: "Panel Border" },
  { key: "text", label: "Text" },
  { key: "textMuted", label: "Text Muted" },
];

interface Props {
  override: AcademyTheme | null;
  setOverride: (next: AcademyTheme | null) => void | Promise<void>;
  /**
   * Which Light/Dark tab the editor should default to. Pass the player's
   * currently active appearance scheme so the tab matches what they see in
   * the rest of the app.
   */
  initialMode?: Mode;
}

function readField(
  theme: AcademyTheme | null,
  mode: Mode,
  field: keyof AcademyThemeColors,
): string {
  const base = theme ?? defaultAcademyTheme;
  if (mode === "dark") {
    return (base.dark?.[field] ?? base[field] ?? "") as string;
  }
  return (base[field] ?? "") as string;
}

function writeField(
  theme: AcademyTheme | null,
  mode: Mode,
  field: keyof AcademyThemeColors,
  value: string,
): AcademyTheme {
  const source = theme ?? defaultAcademyTheme;
  if (mode === "light") {
    const lightPatch: Partial<AcademyThemeColors> = { [field]: value };
    return {
      ...source,
      ...lightPatch,
      dark: { ...(source.dark ?? {}) },
    };
  }
  const darkPatch: Partial<AcademyThemeColors> = {
    ...(source.dark ?? {}),
    [field]: value,
  };
  return { ...source, dark: darkPatch };
}

// Strict validation. We mirror shared/theme.ts: full #RRGGBB everywhere,
// and only accept a fully-formed rgba(...) on the `panelBorder` field.
const RGBA_FULL_RE = /^rgba?\(\s*\d+(?:\.\d+)?\s*(?:,\s*\d+(?:\.\d+)?\s*){2,3}\)$/i;

function isValidColor(field: keyof AcademyThemeColors, v: string): boolean {
  if (!v) return false;
  if (HEX6_RE.test(v)) return true;
  if (field === "panelBorder" && RGBA_FULL_RE.test(v)) return true;
  return false;
}

export default function MyThemeEditor({
  override,
  setOverride,
  initialMode = "dark",
}: Props) {
  useThemeReactivity();
  const navigation = useNavigation<any>();
  const appearance = usePlayerAppearanceOptional();
  const [mode, setMode] = useState<Mode>(
    appearance?.resolvedScheme ?? initialMode,
  );

  // Phase H (Task #811): keep the editor's local LIGHT/DARK sub-toggle
  // in sync with the actual app appearance, so the two controls feel
  // like one. If the user flips Appearance higher up, the editor tab
  // follows along (and vice-versa via the onPress handler).
  useEffect(() => {
    if (appearance && appearance.resolvedScheme !== mode) {
      setMode(appearance.resolvedScheme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance?.resolvedScheme]);
  const [pickerField, setPickerField] = useState<
    keyof AcademyThemeColors | null
  >(null);
  const [hexDrafts, setHexDrafts] = useState<
    Partial<Record<`${Mode}.${keyof AcademyThemeColors}`, string>>
  >({});

  const matchedPresetId = useMemo(() => {
    if (!override) return null;
    // Match across multiple identifying fields so "primary collision" doesn't
    // misidentify a custom theme as a preset. We compare both light and dark
    // variants of the most visually distinctive fields.
    const KEYS: (keyof AcademyThemeColors)[] = [
      "primary",
      "secondary",
      "surface",
      "panel",
      "text",
    ];
    const eqColors = (
      a: AcademyThemeColors | undefined,
      b: AcademyThemeColors | undefined,
    ): boolean => {
      const aa = a ?? {};
      const bb = b ?? {};
      return KEYS.every(
        (k) => (aa[k] ?? "").toLowerCase() === (bb[k] ?? "").toLowerCase(),
      );
    };
    const match = themePresets.find(
      (p) =>
        eqColors(p.theme, override) && eqColors(p.theme.dark, override.dark),
    );
    return match?.id ?? "custom";
  }, [override]);

  const commitField = (field: keyof AcademyThemeColors, value: string) => {
    const next = writeField(override, mode, field, value);
    setOverride(next);
    const k = `${mode}.${field}` as const;
    setHexDrafts((prev) => {
      const { [k]: _drop, ...rest } = prev;
      return rest;
    });
  };

  const onPick = (hex: string) => {
    if (!pickerField) return;
    commitField(pickerField, hex);
  };

  const buildPreview = (m: Mode) => {
    const primary = readField(override, m, "primary");
    return {
      panel: readField(override, m, "panel"),
      surface: readField(override, m, "surface"),
      text: readField(override, m, "text"),
      textMuted: readField(override, m, "textMuted"),
      primary,
      accent: readField(override, m, "accent"),
      border: readField(override, m, "panelBorder"),
      onPrimary: HEX6_RE.test(primary) ? safeTextOn(primary) : "#000",
    };
  };
  const lightPreview = buildPreview("light");
  const darkPreview = buildPreview("dark");
  const activePreview = mode === "light" ? lightPreview : darkPreview;
  const panelHex = activePreview.panel;
  const surfaceHex = activePreview.surface;
  const textHex = activePreview.text;
  const primaryHex = activePreview.primary;
  // Show both previews side-by-side once the player has actually configured a
  // dark variant. Otherwise just show the active mode's preview.
  const hasDarkOverride = !!override?.dark && Object.keys(override.dark).length > 0;

  const textPanelRatio =
    HEX6_RE.test(textHex) && HEX6_RE.test(panelHex)
      ? contrastRatio(textHex, panelHex)
      : null;
  const textSurfaceRatio =
    HEX6_RE.test(textHex) && HEX6_RE.test(surfaceHex)
      ? contrastRatio(textHex, surfaceHex)
      : null;

  const textPanelBad = textPanelRatio !== null && textPanelRatio < 4.5;
  const textSurfaceBad = textSurfaceRatio !== null && textSurfaceRatio < 4.5;

  return (
    <View style={{ gap: Spacing.md }}>
      <Text style={styles.help}>
        Pick a preset or fully customise every colour. This only affects your
        account on this device — your academy's branding stays as-is for everyone
        else.
      </Text>

      {/* Browse all themes */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("ThemePreview");
        }}
        style={styles.browseBtn}
        accessibilityRole="button"
        accessibilityLabel="Browse all themes in a gallery"
      >
        <Ionicons
          name="grid-outline"
          size={16}
          color={Colors.dark.text}
        />
        <Text style={{ color: Colors.dark.text, fontWeight: "600", flex: 1 }}>
          Browse all {themePresets.length} themes
        </Text>
        <Ionicons
          name="chevron-forward"
          size={16}
          color={Colors.dark.textMuted}
        />
      </Pressable>

      {/* Preset chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: Spacing.sm, paddingRight: Spacing.md }}
      >
        {themePresets.map((p) => {
          const selected = matchedPresetId === p.id;
          const swatch = p.theme.dark?.primary ?? p.theme.primary ?? "#000";
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setOverride({
                  ...p.theme,
                  dark: { ...(p.theme.dark ?? {}) },
                });
              }}
              style={[
                styles.chip,
                {
                  borderColor: selected
                    ? Colors.dark.primary
                    : Colors.dark.borderSubtle,
                  backgroundColor: selected
                    ? Colors.dark.accentTextSoft
                    : Colors.dark.backgroundSecondary,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: swatch,
                }}
              />
              <Text style={{ color: Colors.dark.text, fontWeight: "500" }}>
                {p.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Light/Dark tabs */}
      <View style={styles.tabs}>
        {(["light", "dark"] as const).map((m) => {
          const active = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setMode(m);
                // Phase H (Task #811): also flip the actual app appearance
                // so tapping LIGHT/DARK in the editor visibly changes the
                // whole app, not just which palette block we're editing.
                appearance?.setPreference(m);
              }}
              style={[
                styles.tab,
                active && {
                  backgroundColor: Colors.dark.primary,
                  borderColor: Colors.dark.primary,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Edit ${m} mode colours`}
            >
              <Ionicons
                name={m === "light" ? "sunny-outline" : "moon-outline"}
                size={16}
                color={active ? "#0B0B0B" : Colors.dark.textMuted}
              />
              <Text
                style={{
                  color: active ? "#0B0B0B" : Colors.dark.text,
                  fontWeight: "600",
                  textTransform: "capitalize",
                }}
              >
                {m}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Realistic preview card(s). When the player has configured both
          modes we render them side-by-side so they can compare the two at a
          glance; otherwise we just render the active mode. */}
      {hasDarkOverride ? (
        <View style={styles.previewRow}>
          <View style={styles.previewCol}>
            <Text style={styles.previewLabel}>Light</Text>
            <PreviewCard {...lightPreview} />
          </View>
          <View style={styles.previewCol}>
            <Text style={styles.previewLabel}>Dark</Text>
            <PreviewCard {...darkPreview} />
          </View>
        </View>
      ) : (
        <PreviewCard {...activePreview} />
      )}

      {/* Field rows */}
      <View style={{ gap: Spacing.sm }}>
        {FIELDS.map(({ key, label }) => {
          const committed = readField(override, mode, key);
          const draftKey = `${mode}.${key}` as const;
          const draft = hexDrafts[draftKey];
          const display = draft !== undefined ? draft : committed;
          const valid = !display || isValidColor(key, display);
          const showWarning =
            (key === "text" && (textPanelBad || textSurfaceBad)) ||
            (key === "panel" && textPanelBad) ||
            (key === "surface" && textSurfaceBad);
          // For the text-row warning we may need to fix contrast against
          // either the panel or the surface — pick whichever is failing.
          // (When both fail we prefer the panel since it's the more
          // visually prominent surface for body content.)
          const warningTargetBg =
            key === "surface"
              ? surfaceHex
              : key === "panel"
                ? panelHex
                : textPanelBad
                  ? panelHex
                  : surfaceHex;
          return (
            <View key={`${mode}-${key}`} style={{ gap: 4 }}>
              <View style={styles.row}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setPickerField(key);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Open colour picker for ${label}`}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: HEX6_RE.test(committed)
                        ? committed
                        : "transparent",
                      borderColor: Colors.dark.borderSubtle,
                    },
                  ]}
                />
                <Text style={styles.fieldLabel}>{label}</Text>
                <TextInput
                  value={display}
                  onChangeText={(raw) => {
                    const trimmed = raw.length === 0
                      ? ""
                      : raw.startsWith("#") || raw.startsWith("rgb")
                        ? raw
                        : `#${raw}`;
                    setHexDrafts((prev) => ({
                      ...prev,
                      [draftKey]: trimmed.toUpperCase(),
                    }));
                    // Only push to global theme when value is fully valid
                    // for this field. Partial input like "rgba(" must NOT
                    // commit — that triggers global rebuilds with broken
                    // colour strings.
                    if (isValidColor(key, trimmed)) {
                      commitField(key, trimmed);
                    } else if (trimmed === "") {
                      // Clearing restores the default from the SAME mode so
                      // dark-mode edits don't get reseeded with light values.
                      const fallback =
                        mode === "dark"
                          ? (defaultAcademyTheme.dark?.[key]
                              ?? defaultAcademyTheme[key]
                              ?? "#000000")
                          : (defaultAcademyTheme[key] ?? "#000000");
                      commitField(key, fallback);
                    }
                  }}
                  onBlur={() => {
                    setHexDrafts((prev) => {
                      if (prev[draftKey] === undefined) return prev;
                      if (isValidColor(key, prev[draftKey] ?? "")) return prev;
                      const { [draftKey]: _drop, ...rest } = prev;
                      return rest;
                    });
                  }}
                  placeholder="#RRGGBB"
                  placeholderTextColor={Colors.dark.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={28}
                  style={[
                    styles.hexInput,
                    {
                      color: valid ? Colors.dark.text : "#FF6B6B",
                      borderColor: valid ? Colors.dark.borderSubtle : "#FF6B6B",
                    },
                  ]}
                  accessibilityLabel={`${label} colour value`}
                />
              </View>
              {showWarning ? (
                <View style={styles.warning}>
                  <Ionicons
                    name="warning-outline"
                    size={14}
                    color="#FFB020"
                  />
                  <Text style={styles.warningText}>
                    Low contrast (text vs{" "}
                    {key === "surface"
                      ? "surface"
                      : key === "panel"
                        ? "panel"
                        : textPanelBad && textSurfaceBad
                          ? "panel & surface"
                          : textPanelBad
                            ? "panel"
                            : "surface"}
                    ).
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (!HEX6_RE.test(warningTargetBg)) return;
                      const safe = safeTextOn(warningTargetBg);
                      commitField("text", safe);
                    }}
                    style={styles.warningBtn}
                    accessibilityRole="button"
                  >
                    <Text style={styles.warningBtnText}>Use safe text colour</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Reset */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setOverride(null);
        }}
        style={styles.resetBtn}
        accessibilityRole="button"
        accessibilityLabel="Reset to academy default theme"
      >
        <Text style={{ color: Colors.dark.text, fontWeight: "600" }}>
          Reset to academy default
        </Text>
      </Pressable>

      <ColorPickerModal
        visible={pickerField !== null}
        initial={
          pickerField
            ? (() => {
                const v = readField(override, mode, pickerField);
                return HEX6_RE.test(v) ? v : "#FFFFFF";
              })()
            : "#FFFFFF"
        }
        title={
          pickerField
            ? `${mode === "light" ? "Light" : "Dark"} — ${
                FIELDS.find((f) => f.key === pickerField)?.label ?? ""
              }`
            : ""
        }
        onClose={() => setPickerField(null)}
        onSelect={onPick}
      />
    </View>
  );
}

interface PreviewProps {
  panel: string;
  surface: string;
  text: string;
  textMuted: string;
  primary: string;
  accent: string;
  border: string;
  onPrimary: string;
}

function PreviewCard({
  panel,
  surface,
  text,
  textMuted,
  primary,
  accent,
  border,
  onPrimary,
}: PreviewProps) {
  const safe = (v: string, fallback: string) =>
    HEX6_RE.test(v) || /^rgba?\(/i.test(v) ? v : fallback;
  const sPanel = safe(panel, "#11141A");
  const sSurface = safe(surface, "#0B0D10");
  const sText = safe(text, "#FFFFFF");
  const sMuted = safe(textMuted, "#B8BCC6");
  const sPrimary = safe(primary, "#C8FF3D");
  const sAccent = safe(accent, "#00D4FF");
  const sBorder = safe(border, "rgba(255,255,255,0.06)");

  return (
    <View
      style={{
        backgroundColor: sSurface,
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        gap: Spacing.sm,
        borderWidth: 1,
        borderColor: sBorder,
      }}
      accessibilityLabel="Theme preview card"
    >
      {/* Header row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: sPanel,
          padding: Spacing.sm,
          borderRadius: BorderRadius.sm,
        }}
      >
        <Text style={{ color: sText, fontWeight: "700" }}>Glow Up Tennis</Text>
        <View
          style={{
            backgroundColor: sAccent,
            paddingVertical: 2,
            paddingHorizontal: 8,
            borderRadius: 999,
          }}
        >
          <Text style={{ color: "#0B0B0B", fontWeight: "700", fontSize: 11 }}>
            PRO
          </Text>
        </View>
      </View>

      {/* Body */}
      <View
        style={{
          backgroundColor: sPanel,
          padding: Spacing.sm,
          borderRadius: BorderRadius.sm,
          gap: 4,
        }}
      >
        <Text style={{ color: sText, fontWeight: "600" }}>Next session</Text>
        <Text style={{ color: sMuted, fontSize: 12 }}>
          Tomorrow at 16:00 · Court 3 · Coach Mike
        </Text>
        <View
          style={{
            height: 1,
            backgroundColor: sBorder,
            marginVertical: 4,
          }}
        />
        <View style={{ flexDirection: "row", gap: Spacing.sm }}>
          <View
            style={{
              backgroundColor: sPrimary,
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: BorderRadius.sm,
            }}
          >
            <Text style={{ color: onPrimary, fontWeight: "700", fontSize: 12 }}>
              Confirm
            </Text>
          </View>
          <View
            style={{
              borderWidth: 1,
              borderColor: sBorder,
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: BorderRadius.sm,
            }}
          >
            <Text style={{ color: sMuted, fontWeight: "600", fontSize: 12 }}>
              Skip
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  help: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  browseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  tabs: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  previewRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  previewCol: {
    flex: 1,
    gap: 4,
  },
  previewLabel: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
  },
  fieldLabel: {
    color: Colors.dark.text,
    width: 110,
    fontWeight: "500",
  },
  hexInput: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    fontSize: 12,
  },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 36,
    flexWrap: "wrap",
  },
  warningText: {
    color: "#FFB020",
    fontSize: 12,
  },
  warningBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#FFB020",
    borderRadius: BorderRadius.sm,
  },
  warningBtnText: {
    color: "#FFB020",
    fontSize: 11,
    fontWeight: "600",
  },
  resetBtn: {
    alignSelf: "flex-start",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: "transparent",
  },
}));
