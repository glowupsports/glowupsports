import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { DrawerNavigationProp } from "@react-navigation/drawer";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

type DrawerParamList = {
  AdultRanksList: undefined;
  RecordAdultMatch: undefined;
};

interface RankInfo {
  rank: number;
  name: string;
  mmrRange: { min: number; max: number };
}

interface PlayerRankData {
  playerId: string;
  name: string;
  mmr: number;
  rank: number;
  rankName: string;
  rankDescription: string;
  mmrRange: { min: number; max: number };
  totalMatches: number;
  isAdult: boolean;
}

interface RanksResponse {
  ranks: RankInfo[];
  totalRanks: number;
  mmrConfig: { minMmr: number; maxMmr: number; startingMmr: number };
}

const RANK_COLORS: Record<number, string> = {
  9: "#6B7280",
  8: "#9CA3AF",
  7: "#3B82F6",
  6: "#10B981",
  5: "#F59E0B",
  4: "#EF4444",
  3: "#8B5CF6",
  2: "#EC4899",
  1: "#FFD700",
};

export default function AdultGlowRankScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<DrawerNavigationProp<DrawerParamList>>();

  const { data: ranksData, isLoading: ranksLoading } = useQuery<RanksResponse>({
    queryKey: ["/api/adult-glow/ranks"],
  });

  const playerMmr = 1000;
  const playerRank = 7;
  const playerRankName = "Club Player";
  const totalMatches = 12;

  const currentRankInfo = ranksData?.ranks.find((r) => r.rank === playerRank);
  const nextRankInfo = ranksData?.ranks.find((r) => r.rank === playerRank - 1);

  const mmrProgress = currentRankInfo
    ? ((playerMmr - currentRankInfo.mmrRange.min) /
        (currentRankInfo.mmrRange.max - currentRankInfo.mmrRange.min)) *
      100
    : 0;

  const mmrToNextRank = nextRankInfo ? nextRankInfo.mmrRange.min - playerMmr : 0;

  if (ranksLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <ThemedText style={styles.loadingText}>Loading rank data...</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <Card elevation={2} style={styles.rankCard}>
          <View style={styles.rankHeader}>
            <View
              style={[
                styles.rankBadge,
                { backgroundColor: RANK_COLORS[playerRank] || Colors.dark.primary },
              ]}
            >
              <ThemedText style={styles.rankNumber}>{playerRank}</ThemedText>
            </View>
            <View style={styles.rankInfo}>
              <ThemedText style={styles.rankName}>{playerRankName}</ThemedText>
              <ThemedText style={styles.mmrValue}>{playerMmr} MMR</ThemedText>
            </View>
            <Ionicons name="trophy-outline" size={32} color={Colors.dark.gold} />
          </View>

          <View style={styles.progressSection}>
            <View style={styles.progressLabels}>
              <ThemedText style={styles.progressLabel}>
                {currentRankInfo?.mmrRange.min || 0}
              </ThemedText>
              <ThemedText style={styles.progressLabel}>
                {currentRankInfo?.mmrRange.max || 0}
              </ThemedText>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.min(100, Math.max(0, mmrProgress))}%`,
                    backgroundColor: RANK_COLORS[playerRank] || Colors.dark.primary,
                  },
                ]}
              />
            </View>
            {nextRankInfo && mmrToNextRank > 0 && (
              <ThemedText style={styles.nextRankText}>
                {mmrToNextRank} MMR to {nextRankInfo.name}
              </ThemedText>
            )}
          </View>
        </Card>

        <View style={styles.statsRow}>
          <Card elevation={1} style={styles.statCard}>
            <Ionicons name="tennisball-outline" size={24} color={Colors.dark.xpCyan} />
            <ThemedText style={styles.statValue}>{totalMatches}</ThemedText>
            <ThemedText style={styles.statLabel}>Matches</ThemedText>
          </Card>
          <Card elevation={1} style={styles.statCard}>
            <Ionicons name="trending-up-outline" size={24} color={Colors.dark.successNeon} />
            <ThemedText style={styles.statValue}>65%</ThemedText>
            <ThemedText style={styles.statLabel}>Win Rate</ThemedText>
          </Card>
          <Card elevation={1} style={styles.statCard}>
            <Ionicons name="flame-outline" size={24} color={Colors.dark.orange} />
            <ThemedText style={styles.statValue}>3</ThemedText>
            <ThemedText style={styles.statLabel}>Win Streak</ThemedText>
          </Card>
        </View>

        <ThemedText style={styles.sectionTitle}>Quick Actions</ThemedText>

        <Pressable
          style={styles.actionButton}
          onPress={() => navigation.navigate("RecordAdultMatch" as any)}
        >
          <View style={styles.actionContent}>
            <View style={[styles.actionIcon, { backgroundColor: Colors.dark.primary }]}>
              <Feather name="plus" size={24} color={Colors.dark.buttonText} />
            </View>
            <View style={styles.actionText}>
              <ThemedText style={styles.actionTitle}>Record Match</ThemedText>
              <ThemedText style={styles.actionDesc}>
                Log a match result to update your MMR
              </ThemedText>
            </View>
          </View>
          <Feather name="chevron-right" size={24} color={Colors.dark.text} />
        </Pressable>

        <Pressable
          style={styles.actionButton}
          onPress={() => navigation.navigate("AdultRanksList" as any)}
        >
          <View style={styles.actionContent}>
            <View style={[styles.actionIcon, { backgroundColor: Colors.dark.gold }]}>
              <Ionicons name="list-outline" size={24} color={Colors.dark.backgroundRoot} />
            </View>
            <View style={styles.actionText}>
              <ThemedText style={styles.actionTitle}>View All Ranks</ThemedText>
              <ThemedText style={styles.actionDesc}>
                See requirements for each rank level
              </ThemedText>
            </View>
          </View>
          <Feather name="chevron-right" size={24} color={Colors.dark.text} />
        </Pressable>

        <ThemedText style={styles.sectionTitle}>Skill Gates</ThemedText>
        <ThemedText style={styles.sectionSubtitle}>
          Complete these to unlock promotion to the next rank
        </ThemedText>

        <Card elevation={1} style={styles.gatesCard}>
          <View style={styles.gateItem}>
            <View style={[styles.gateStatus, styles.gateCompleted]}>
              <Feather name="check" size={16} color={Colors.dark.buttonText} />
            </View>
            <View style={styles.gateInfo}>
              <ThemedText style={styles.gateName}>Rally Ability</ThemedText>
              <ThemedText style={styles.gateDesc}>Maintain 8+ ball rallies</ThemedText>
            </View>
          </View>
          <View style={styles.gateDivider} />
          <View style={styles.gateItem}>
            <View style={[styles.gateStatus, styles.gateCompleted]}>
              <Feather name="check" size={16} color={Colors.dark.buttonText} />
            </View>
            <View style={styles.gateInfo}>
              <ThemedText style={styles.gateName}>Overhead Serve</ThemedText>
              <ThemedText style={styles.gateDesc}>6+/10 serves in with proper motion</ThemedText>
            </View>
          </View>
          <View style={styles.gateDivider} />
          <View style={styles.gateItem}>
            <View style={[styles.gateStatus, styles.gatePending]}>
              <Feather name="clock" size={16} color={Colors.dark.text} />
            </View>
            <View style={styles.gateInfo}>
              <ThemedText style={styles.gateName}>Depth Control</ThemedText>
              <ThemedText style={styles.gateDesc}>7+/10 balls past service line</ThemedText>
            </View>
          </View>
        </Card>

        <ThemedText style={styles.sectionTitle}>Recent Matches</ThemedText>

        <Card elevation={1} style={styles.matchCard}>
          <View style={styles.matchRow}>
            <View style={[styles.matchResult, styles.matchWin]}>
              <ThemedText style={styles.matchResultText}>W</ThemedText>
            </View>
            <View style={styles.matchInfo}>
              <ThemedText style={styles.matchOpponent}>vs. Alex Johnson</ThemedText>
              <ThemedText style={styles.matchScore}>6-4, 6-3</ThemedText>
            </View>
            <View style={styles.matchMmr}>
              <ThemedText style={styles.mmrGain}>+24</ThemedText>
            </View>
          </View>
        </Card>

        <Card elevation={1} style={styles.matchCard}>
          <View style={styles.matchRow}>
            <View style={[styles.matchResult, styles.matchLoss]}>
              <ThemedText style={styles.matchResultText}>L</ThemedText>
            </View>
            <View style={styles.matchInfo}>
              <ThemedText style={styles.matchOpponent}>vs. Sarah Miller</ThemedText>
              <ThemedText style={styles.matchScore}>4-6, 5-7</ThemedText>
            </View>
            <View style={styles.matchMmr}>
              <ThemedText style={styles.mmrLoss}>-18</ThemedText>
            </View>
          </View>
        </Card>

        <Card elevation={1} style={styles.matchCard}>
          <View style={styles.matchRow}>
            <View style={[styles.matchResult, styles.matchWin]}>
              <ThemedText style={styles.matchResultText}>W</ThemedText>
            </View>
            <View style={styles.matchInfo}>
              <ThemedText style={styles.matchOpponent}>vs. Mike Chen</ThemedText>
              <ThemedText style={styles.matchScore}>6-2, 6-1</ThemedText>
            </View>
            <View style={styles.matchMmr}>
              <ThemedText style={styles.mmrGain}>+28</ThemedText>
            </View>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    opacity: 0.7,
  },
  rankCard: {
    marginBottom: Spacing.lg,
  },
  rankHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  rankBadge: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  rankNumber: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  rankInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  rankName: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  mmrValue: {
    fontSize: 16,
    color: Colors.dark.text,
    opacity: 0.8,
    marginTop: 2,
  },
  progressSection: {
    marginTop: Spacing.sm,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  progressLabel: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  nextRankText: {
    fontSize: 13,
    color: Colors.dark.xpCyan,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.6,
    marginBottom: Spacing.md,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  actionContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  actionText: {
    marginLeft: Spacing.md,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  actionDesc: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  gatesCard: {
    marginBottom: Spacing.xl,
  },
  gateItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  gateStatus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  gateCompleted: {
    backgroundColor: Colors.dark.primary,
  },
  gatePending: {
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  gateInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  gateName: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  gateDesc: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  gateDivider: {
    height: 1,
    backgroundColor: Colors.dark.backgroundTertiary,
    marginVertical: Spacing.xs,
  },
  matchCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  matchResult: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  matchWin: {
    backgroundColor: Colors.dark.primary,
  },
  matchLoss: {
    backgroundColor: Colors.dark.error,
  },
  matchResultText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  matchInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  matchOpponent: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  matchScore: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  matchMmr: {
    alignItems: "flex-end",
  },
  mmrGain: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.successNeon,
  },
  mmrLoss: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.error,
  },
});
