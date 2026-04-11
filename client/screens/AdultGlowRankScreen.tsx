import React from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { DrawerNavigationProp } from "@react-navigation/drawer";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { usePlayer } from "@/player/context/PlayerContext";

type DrawerParamList = {
  AdultRanksList: undefined;
  RecordAdultMatch: undefined;
};

interface SkillGate {
  id: string;
  description: string;
}

interface RecentMatch {
  id: string;
  opponentName: string;
  didWin: boolean;
  setScore: string | null;
  matchType: string;
  mmrDelta: number | null;
  matchDate: string;
}

interface FullProfileResponse {
  playerId: string;
  name: string;
  mmr: number;
  rank: number;
  rankName: string;
  rankDescription: string;
  mmrRange: { min: number; max: number };
  nextRank: { rank: number; name: string; mmrMin: number } | null;
  isAdult: boolean;
  dssEquivalent: number | null;
  dssRating: string | null;
  stats: {
    totalMatches: number;
    wins: number;
    winRate: number;
    streak: number;
  };
  behaviorFlags: {
    rageQuits: number;
    noShows: number;
  };
  skillGates: {
    unlocked: string[];
    required: SkillGate[];
  };
  recentMatches: RecentMatch[];
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
  const { playerId, isLoading: playerLoading } = usePlayer();

  const { data: profileData, isLoading } = useQuery<FullProfileResponse>({
    queryKey: [`/api/adult-glow/player/${playerId}/full-profile`],
    enabled: !!playerId,
  });

  if (playerLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <ThemedText style={styles.loadingText}>Loading...</ThemedText>
      </View>
    );
  }

  if (!playerId) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.orange} />
        <ThemedText style={styles.errorTitle}>Not Available</ThemedText>
        <ThemedText style={styles.errorText}>
          You need to be logged in as a player to view your Glow Rank.
        </ThemedText>
      </View>
    );
  }

  if (isLoading || !profileData) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <ThemedText style={styles.loadingText}>Loading rank data...</ThemedText>
      </View>
    );
  }

  const {
    mmr,
    rank,
    rankName,
    mmrRange,
    nextRank,
    stats,
    skillGates,
    recentMatches,
    dssEquivalent,
    dssRating,
  } = profileData;

  const mmrProgress =
    mmrRange.max > mmrRange.min
      ? ((mmr - mmrRange.min) / (mmrRange.max - mmrRange.min)) * 100
      : 0;

  const mmrToNextRank = nextRank ? nextRank.mmrMin - mmr : 0;

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
                { backgroundColor: RANK_COLORS[rank] || Colors.dark.primary },
              ]}
            >
              <ThemedText style={styles.rankNumber}>{rank}</ThemedText>
            </View>
            <View style={styles.rankInfo}>
              <ThemedText style={styles.rankName}>{rankName}</ThemedText>
              <ThemedText style={styles.mmrValue}>{mmr} MMR</ThemedText>
            </View>
            <Ionicons name="trophy-outline" size={32} color={Colors.dark.gold} />
          </View>

          <View style={styles.progressSection}>
            <View style={styles.progressLabels}>
              <ThemedText style={styles.progressLabel}>{mmrRange.min}</ThemedText>
              <ThemedText style={styles.progressLabel}>{mmrRange.max}</ThemedText>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.min(100, Math.max(0, mmrProgress))}%`,
                    backgroundColor: RANK_COLORS[rank] || Colors.dark.primary,
                  },
                ]}
              />
            </View>
            {nextRank && mmrToNextRank > 0 && (
              <ThemedText style={styles.nextRankText}>
                {mmrToNextRank} MMR to {nextRank.name}
              </ThemedText>
            )}
          </View>

          {dssEquivalent !== null && (
            <View style={styles.dssChipRow}>
              <View style={styles.dssChip}>
                <Ionicons name="flag-outline" size={12} color="#C8FF3D" />
                <ThemedText style={styles.dssChipText}>
                  KNLTB scale: DSS {dssEquivalent}
                </ThemedText>
              </View>
              <ThemedText style={styles.dssSubText}>
                {dssRating ? `Rating ${dssRating}` : ""}
              </ThemedText>
            </View>
          )}
        </Card>

        <View style={styles.statsRow}>
          <Card elevation={1} style={styles.statCard}>
            <Ionicons name="tennisball-outline" size={24} color={Colors.dark.xpCyan} />
            <ThemedText style={styles.statValue}>{stats.totalMatches}</ThemedText>
            <ThemedText style={styles.statLabel}>Matches</ThemedText>
          </Card>
          <Card elevation={1} style={styles.statCard}>
            <Ionicons name="trending-up-outline" size={24} color={Colors.dark.successNeon} />
            <ThemedText style={styles.statValue}>{stats.winRate}%</ThemedText>
            <ThemedText style={styles.statLabel}>Win Rate</ThemedText>
          </Card>
          <Card elevation={1} style={styles.statCard}>
            <Ionicons name="flame-outline" size={24} color={Colors.dark.orange} />
            <ThemedText style={styles.statValue}>{stats.streak}</ThemedText>
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
              <Ionicons name="list-outline" size={24} color={Colors.dark.buttonText} />
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
          {skillGates.required.length === 0 ? (
            <ThemedText style={styles.noGatesText}>
              No skill gates required at this rank
            </ThemedText>
          ) : (
            skillGates.required.map((gate, index) => {
              const isUnlocked = skillGates.unlocked.includes(gate.id);
              return (
                <React.Fragment key={gate.id}>
                  {index > 0 && <View style={styles.gateDivider} />}
                  <View style={styles.gateItem}>
                    <View
                      style={[
                        styles.gateStatus,
                        isUnlocked ? styles.gateCompleted : styles.gatePending,
                      ]}
                    >
                      {isUnlocked ? (
                        <Feather name="check" size={16} color={Colors.dark.buttonText} />
                      ) : (
                        <Feather name="clock" size={16} color={Colors.dark.text} />
                      )}
                    </View>
                    <View style={styles.gateInfo}>
                      <ThemedText style={styles.gateName}>{gate.id}</ThemedText>
                      <ThemedText style={styles.gateDesc}>{gate.description}</ThemedText>
                    </View>
                  </View>
                </React.Fragment>
              );
            })
          )}
        </Card>

        <ThemedText style={styles.sectionTitle}>Recent Matches</ThemedText>

        {recentMatches.length === 0 ? (
          <Card elevation={1} style={styles.matchCard}>
            <ThemedText style={styles.noMatchesText}>
              No matches recorded yet. Play your first match!
            </ThemedText>
          </Card>
        ) : (
          recentMatches.map((match) => (
            <Card key={match.id} elevation={1} style={styles.matchCard}>
              <View style={styles.matchRow}>
                <View style={[styles.matchResult, match.didWin ? styles.matchWin : styles.matchLoss]}>
                  <ThemedText style={styles.matchResultText}>{match.didWin ? "W" : "L"}</ThemedText>
                </View>
                <View style={styles.matchInfo}>
                  <ThemedText style={styles.matchOpponent}>vs. {match.opponentName}</ThemedText>
                  <ThemedText style={styles.matchScore}>{match.setScore || match.matchType}</ThemedText>
                </View>
                <View style={styles.matchMmr}>
                  {match.mmrDelta !== null && (
                    <ThemedText style={match.mmrDelta >= 0 ? styles.mmrGain : styles.mmrLoss}>
                      {match.mmrDelta >= 0 ? "+" : ""}{match.mmrDelta}
                    </ThemedText>
                  )}
                </View>
              </View>
            </Card>
          ))
        )}
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
  errorTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  errorText: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.7,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
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
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
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
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  actionDesc: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  gatesCard: {
    marginBottom: Spacing.lg,
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
    marginRight: Spacing.md,
  },
  gateCompleted: {
    backgroundColor: Colors.dark.successNeon,
  },
  gatePending: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 2,
    borderColor: Colors.dark.border,
  },
  gateInfo: {
    flex: 1,
  },
  gateName: {
    fontSize: 14,
    fontWeight: "600",
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
    backgroundColor: Colors.dark.border,
  },
  noGatesText: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
    textAlign: "center",
    paddingVertical: Spacing.md,
  },
  dssChipRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
  },
  dssChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "#C8FF3D18",
    borderWidth: 1,
    borderColor: "#C8FF3D40",
    borderRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  dssChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#C8FF3D",
  },
  dssSubText: {
    fontSize: 11,
    color: Colors.dark.text,
    opacity: 0.5,
  },
  matchCard: {
    marginBottom: Spacing.sm,
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
    marginRight: Spacing.md,
  },
  matchWin: {
    backgroundColor: Colors.dark.successNeon,
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
    marginLeft: Spacing.md,
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
  noMatchesText: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
    textAlign: "center",
    paddingVertical: Spacing.md,
  },
});
