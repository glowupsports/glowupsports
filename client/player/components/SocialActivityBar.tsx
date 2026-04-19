import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Backgrounds, Spacing, BorderRadius, GlowColors, FunctionColors, TextColors, Colors } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
export function SocialActivityBar() {
  const { state } = usePlayerState();

  const activePlayers = state.nearbyPlayers?.length ?? 0;
  const matchesToday = state.openSessions?.filter(s => s.type === "open_match")?.length ?? 0;

  if (activePlayers === 0 && matchesToday === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {activePlayers > 0 ? (
        <View style={styles.stat}>
          <Feather name="radio" size={12} color={FunctionColors.success} />
          <Text style={styles.statValue}>{activePlayers}</Text>
          <Text style={styles.statLabel}>active</Text>
        </View>
      ) : null}

      {matchesToday > 0 ? (
        <>
          <View style={styles.dot} />
          <View style={styles.stat}>
            <Feather name="zap" size={12} color={FunctionColors.social} />
            <Text style={styles.statValue}>{matchesToday}</Text>
            <Text style={styles.statLabel}>matches today</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
    gap: 6,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 13,
    fontWeight: "700",
    color: TextColors.primary,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: TextColors.muted,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#4A4F5C",
    marginHorizontal: 4,
  },
}));
