import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { getSportConfig, getSportColor, SPORTS, type Sport, type SportOrMulti } from "@shared/sportConfig";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface SportBadgeProps {
  sport?: string | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function SportBadge({ sport, size = "md", showLabel = true }: SportBadgeProps) {
  const config = getSportConfig(sport);
  const color = getSportColor(sport);
  const iconSize = size === "sm" ? 12 : size === "lg" ? 20 : 16;
  const fontSize = size === "sm" ? 11 : size === "lg" ? 14 : 12;

  return (
    <View style={[styles.badge, { backgroundColor: `${color}20`, borderColor: `${color}40` }]}>
      <Ionicons name={config.icon as "tennisball" | "grid" | "disc" | "apps"} size={iconSize} color={color} />
      {showLabel ? (
        <Text style={[styles.label, { color, fontSize }]}>{config.displayName}</Text>
      ) : null}
    </View>
  );
}

interface SportSelectorProps {
  selectedSports: string[];
  onToggle: (sport: Sport) => void;
  label?: string;
}

export function SportMultiSelector({ selectedSports, onToggle, label }: SportSelectorProps) {
  return (
    <View style={styles.selectorContainer}>
      {label ? <Text style={styles.selectorLabel}>{label}</Text> : null}
      <View style={styles.sportRow}>
        {SPORTS.map((sport) => {
          const config = getSportConfig(sport);
          const selected = selectedSports.includes(sport);
          const color = getSportColor(sport);
          return (
            <Pressable
              key={sport}
              style={[
                styles.sportOption,
                selected && { backgroundColor: `${color}20`, borderColor: color },
              ]}
              onPress={() => onToggle(sport)}
            >
              <Ionicons
                name={config.icon as "tennisball" | "grid" | "disc" | "apps"}
                size={20}
                color={selected ? color : Colors.dark.textMuted}
              />
              <Text style={[styles.sportOptionText, selected && { color }]}>
                {config.displayName}
              </Text>
              {selected ? (
                <Ionicons name="checkmark-circle" size={16} color={color} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

interface SportSingleSelectorProps {
  selectedSport: string;
  onSelect: (sport: SportOrMulti) => void;
  label?: string;
  includeMulti?: boolean;
}

export function SportSingleSelector({ selectedSport, onSelect, label, includeMulti }: SportSingleSelectorProps) {
  const options: SportOrMulti[] = includeMulti ? [...SPORTS, "multi"] : [...SPORTS];
  return (
    <View style={styles.selectorContainer}>
      {label ? <Text style={styles.selectorLabel}>{label}</Text> : null}
      <View style={styles.sportRow}>
        {options.map((sport) => {
          const config = getSportConfig(sport);
          const selected = selectedSport === sport;
          const color = getSportColor(sport);
          return (
            <Pressable
              key={sport}
              style={[
                styles.sportOption,
                selected && { backgroundColor: `${color}20`, borderColor: color },
              ]}
              onPress={() => onSelect(sport)}
            >
              <Ionicons
                name={config.icon as "tennisball" | "grid" | "disc" | "apps"}
                size={20}
                color={selected ? color : Colors.dark.textMuted}
              />
              <Text style={[styles.sportOptionText, selected && { color }]}>
                {config.displayName}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  label: {
    ...Typography.caption,
    fontWeight: "600",
  },
  selectorContainer: {
    gap: Spacing.sm,
  },
  selectorLabel: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  sportRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  sportOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
    flex: 1,
    minWidth: 100,
  },
  sportOptionText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    flex: 1,
  },
}));
