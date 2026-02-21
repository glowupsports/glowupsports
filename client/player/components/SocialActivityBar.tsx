import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Backgrounds, Spacing, BorderRadius, GlowColors, FunctionColors } from "@/constants/theme";
import { useQuery } from "@tanstack/react-query";

interface CommunityStats {
  activePlayers: number;
  matchesToday: number;
  communityStreak: number;
}

export function SocialActivityBar() {
  const { data } = useQuery<CommunityStats>({
    queryKey: ["/api/player/community-stats"],
    staleTime: 60000,
    retry: false,
  });

  const activePlayers = data?.activePlayers ?? 0;
  const matchesToday = data?.matchesToday ?? 0;
  const communityStreak = data?.communityStreak ?? 0;

  if (activePlayers === 0 && matchesToday === 0 && communityStreak === 0) {
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

      {communityStreak > 0 ? (
        <>
          <View style={styles.dot} />
          <View style={styles.stat}>
            <Feather name="trending-up" size={12} color={GlowColors.primary} />
            <Text style={styles.statValue}>{communityStreak}d</Text>
            <Text style={styles.statLabel}>streak</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    color: "#FFFFFF",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#7C8290",
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#4A4F5C",
    marginHorizontal: 4,
  },
});
