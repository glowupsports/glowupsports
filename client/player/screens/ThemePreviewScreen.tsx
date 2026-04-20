import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";

import { Spacing, BorderRadius } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useAcademyTheme } from "@/contexts/AcademyThemeContext";
import { usePlayerAppearance } from "@/player/context/PlayerAppearanceContext";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";
import {
  themePresets,
  resolveTheme,
  safeTextOn,
  type AcademyThemeColors,
} from "@shared/theme";
import { getCategoryAccent } from "@/player/theme/categoryAccent";

type Mode = "light" | "dark";

const HEX6_RE = /^#[0-9a-fA-F]{6}$/;

const PRESET_KEYS: (keyof AcademyThemeColors)[] = [
  "primary",
  "secondary",
  "surface",
  "panel",
  "text",
];

function eqColors(
  a: AcademyThemeColors | undefined,
  b: AcademyThemeColors | undefined,
): boolean {
  const aa = a ?? {};
  const bb = b ?? {};
  return PRESET_KEYS.every(
    (k) => (aa[k] ?? "").toLowerCase() === (bb[k] ?? "").toLowerCase(),
  );
}

type ThemePreviewNav = NativeStackNavigationProp<
  PlayerStackParamList,
  "ThemePreview"
>;

export default function ThemePreviewScreen() {
  const navigation = useNavigation<ThemePreviewNav>();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();

  const { playerOverride, setPlayerOverride } = useAcademyTheme();
  const appearance = usePlayerAppearance();

  const [mode, setMode] = useState<Mode>(
    appearance?.resolvedScheme === "light" ? "light" : "dark",
  );

  const matchedPresetId = useMemo(() => {
    if (!playerOverride) return null;
    const match = themePresets.find(
      (p) =>
        eqColors(p.theme, playerOverride) &&
        eqColors(p.theme.dark, playerOverride.dark),
    );
    return match?.id ?? null;
  }, [playerOverride]);

  const onPick = (preset: (typeof themePresets)[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPlayerOverride({
      ...preset.theme,
      dark: { ...(preset.theme.dark ?? {}) },
    });
    navigation.goBack();
  };

  // 2-column grid on phones, 3 on wider tablets/web.
  const numColumns = width >= 720 ? 3 : 2;
  const horizontalPadding = Spacing.md * 2;
  const gap = Spacing.sm;
  const cardWidth =
    (width - horizontalPadding - gap * (numColumns - 1)) / numColumns;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.md,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.md,
        gap: Spacing.md,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <Text style={[styles.help, { color: theme.textMuted }]}>
        Browse all {themePresets.length} themes side by side. Tap any preview to
        apply it to your account.
      </Text>

      {/* Light/Dark toggle */}
      <View style={styles.tabs}>
        {(["light", "dark"] as const).map((m) => {
          const active = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setMode(m);
              }}
              style={[
                styles.tab,
                {
                  borderColor: active ? theme.primary : theme.borderSubtle,
                  backgroundColor: active
                    ? theme.primary
                    : theme.backgroundSecondary,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Preview themes in ${m} mode`}
            >
              <Ionicons
                name={m === "light" ? "sunny-outline" : "moon-outline"}
                size={16}
                color={active ? safeTextOn(theme.primary) : theme.textMuted}
              />
              <Text
                style={{
                  color: active ? safeTextOn(theme.primary) : theme.text,
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

      {/* Grid */}
      <View style={[styles.grid, { gap }]}>
        {themePresets.map((preset) => (
          <PresetTile
            key={preset.id}
            preset={preset}
            mode={mode}
            width={cardWidth}
            selected={matchedPresetId === preset.id}
            onPress={() => onPick(preset)}
            outlineColor={theme.primary}
            mutedTextColor={theme.textMuted}
            defaultTextColor={theme.text}
          />
        ))}
      </View>
    </ScrollView>
  );
}

interface PresetTileProps {
  preset: (typeof themePresets)[number];
  mode: Mode;
  width: number;
  selected: boolean;
  onPress: () => void;
  outlineColor: string;
  mutedTextColor: string;
  defaultTextColor: string;
}

function PresetTile({
  preset,
  mode,
  width,
  selected,
  onPress,
  outlineColor,
  mutedTextColor,
  defaultTextColor,
}: PresetTileProps) {
  const resolved = resolveTheme(preset.theme, mode);
  const safe = (v: string | undefined, fallback: string) =>
    v && (HEX6_RE.test(v) || /^rgba?\(/i.test(v)) ? v : fallback;

  const sSurface = safe(resolved.surface, "#0B0D10");
  const sPanel = safe(resolved.panel, "#11141A");
  const sText = safe(resolved.text, "#FFFFFF");
  const sMuted = safe(resolved.textMuted, "#B8BCC6");
  const sPrimary = safe(resolved.primary, "#C8FF3D");
  const sSecondary = safe(resolved.secondary, "#00D4FF");
  const sBorder = safe(resolved.panelBorder, "rgba(255,255,255,0.06)");
  const onPrimary = HEX6_RE.test(sPrimary) ? safeTextOn(sPrimary) : "#000";

  // Three sample category tints derived from the preset's primary so players
  // see how their cards (Tournaments / Open Matches / Glow Lessons) will pop.
  const tournamentsTint = getCategoryAccent("tournaments", preset.theme, mode);
  const openMatchesTint = getCategoryAccent("openMatches", preset.theme, mode);
  const glowTint = getCategoryAccent("glowLessons", preset.theme, mode);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tile,
        {
          width,
          backgroundColor: sSurface,
          borderColor: selected ? outlineColor : sBorder,
          borderWidth: selected ? 2 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Apply ${preset.name} theme`}
    >
      {/* Mini "home tile" */}
      <View
        style={{
          backgroundColor: sPanel,
          borderRadius: BorderRadius.sm,
          padding: Spacing.sm,
          gap: 6,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            numberOfLines={1}
            style={{ color: sText, fontWeight: "700", fontSize: 12, flex: 1 }}
          >
            {preset.name}
          </Text>
          <View
            style={{
              backgroundColor: sPrimary,
              paddingVertical: 2,
              paddingHorizontal: 6,
              borderRadius: 999,
            }}
          >
            <Text
              style={{ color: onPrimary, fontWeight: "700", fontSize: 9 }}
            >
              PRO
            </Text>
          </View>
        </View>
        <Text
          numberOfLines={1}
          style={{ color: sMuted, fontSize: 10 }}
        >
          Next session · 16:00
        </Text>
        <View style={{ flexDirection: "row", gap: 4, marginTop: 2 }}>
          <View
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: sPrimary,
            }}
          />
          <View
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: sSecondary,
            }}
          />
        </View>
        {/* Sample category tints */}
        <View style={{ flexDirection: "row", gap: 4, marginTop: 2 }}>
          {[tournamentsTint, openMatchesTint, glowTint].map((c, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 14,
                borderRadius: 4,
                backgroundColor: c,
              }}
            />
          ))}
        </View>
      </View>

      {/* Footer: name + selected check */}
      <View style={styles.tileFooter}>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{ color: defaultTextColor, fontWeight: "600", fontSize: 13 }}
          >
            {preset.name}
          </Text>
          <Text
            numberOfLines={2}
            style={{ color: mutedTextColor, fontSize: 11, lineHeight: 14 }}
          >
            {preset.description}
          </Text>
        </View>
        {selected ? (
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={outlineColor}
            style={{ marginLeft: 4 }}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  help: {
    fontSize: 13,
    lineHeight: 18,
  },
  tabs: {
    flexDirection: "row",
    gap: Spacing.sm,
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
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tile: {
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  tileFooter: {
    flexDirection: "row",
    alignItems: "center",
  },
});
