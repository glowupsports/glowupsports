import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";

import { Spacing, BorderRadius, Colors, GlowColors } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

export interface PrimaryActionsRowProps {
  firstName?: string | null;
  onBook: () => void;
  onTrain: () => void;
  onCompete: () => void;
  onFindMatch: () => void;
}

type FeatherName = React.ComponentProps<typeof Feather>["name"];

interface Tile {
  key: "book" | "train" | "compete" | "find";
  label: string;
  icon: FeatherName;
  onPress: () => void;
  accessibilityLabel: string;
}

export function PrimaryActionsRow({
  firstName,
  onBook,
  onTrain,
  onCompete,
  onFindMatch,
}: PrimaryActionsRowProps) {
  const { t } = useTranslation();

  const trimmedName = firstName?.trim().split(/\s+/)[0] || "";
  const greeting = trimmedName
    ? t("player.home.greetingWithName", { name: trimmedName })
    : t("player.home.greetingNoName");

  const tiles: Tile[] = [
    {
      key: "book",
      label: t("player.home.primaryActionBook"),
      icon: "calendar",
      onPress: onBook,
      accessibilityLabel: t("player.home.primaryActionBook"),
    },
    {
      key: "train",
      label: t("player.home.primaryActionTrain"),
      icon: "target",
      onPress: onTrain,
      accessibilityLabel: t("player.home.primaryActionTrain"),
    },
    {
      key: "compete",
      label: t("player.home.primaryActionCompete"),
      icon: "zap",
      onPress: onCompete,
      accessibilityLabel: t("player.home.primaryActionCompete"),
    },
    {
      key: "find",
      label: t("player.home.primaryActionFindMatch"),
      icon: "users",
      onPress: onFindMatch,
      accessibilityLabel: t("player.home.primaryActionFindMatch"),
    },
  ];

  const handlePress = (fn: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    fn();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.greeting} numberOfLines={1}>
        {greeting}
      </Text>
      <View style={styles.row}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.key}
            onPress={() => handlePress(tile.onPress)}
            accessibilityRole="button"
            accessibilityLabel={tile.accessibilityLabel}
            style={({ pressed }) => [styles.tileWrap, pressed && styles.tilePressed]}
          >
            <LinearGradient
              colors={[
                "rgba(200,255,61,0.18)",
                "rgba(200,255,61,0.04)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.tile}
            >
              <View style={styles.iconWrap}>
                <Feather name={tile.icon} size={20} color={GlowColors.primary} />
              </View>
              <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {tile.label}
              </Text>
            </LinearGradient>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: -0.3,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  tileWrap: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  tilePressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  tile: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.32)",
    minHeight: 76,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.40)",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 0.3,
    textAlign: "center",
  },
}));
