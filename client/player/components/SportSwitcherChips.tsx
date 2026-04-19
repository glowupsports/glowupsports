import React from "react";
import { Text, StyleSheet, Pressable, ScrollView, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useSport, SPORT_DEFINITIONS } from "@/player/context/SportContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface SportSwitcherChipsProps {
  style?: StyleProp<ViewStyle>;
}

export function SportSwitcherChips({ style }: SportSwitcherChipsProps) {
  const { activeSports, activeSport, setActiveSport, isMultiSport } = useSport();

  if (!isMultiSport) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.container, style]}
      contentContainerStyle={styles.content}
    >
      {SPORT_DEFINITIONS.filter(s => activeSports.includes(s.key)).map(sport => {
        const isActive = activeSport === sport.key;
        return (
          <Pressable
            key={sport.key}
            style={[styles.chip, isActive && { backgroundColor: sport.color, borderColor: sport.color }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveSport(sport.key);
            }}
          >
            <Ionicons
              name={sport.icon as keyof typeof Ionicons.glyphMap}
              size={14}
              color={isActive ? Colors.dark.buttonText : sport.color}
            />
            <Text style={[styles.chipText, isActive && { color: Colors.dark.buttonText }]}>
              {sport.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
    flexDirection: "row",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
}));
