import React from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";

interface RankInfo {
  rank: number;
  name: string;
  mmrRange: { min: number; max: number };
}

interface RankDetailResponse {
  rank: number;
  name: string;
  abilitySnapshot: string;
  mmrRange: { min: number; max: number };
  skillGates: {
    id: string;
    metric: string;
    min?: number;
    outOf?: number;
    required?: boolean;
    description: string;
  }[];
  matchRequirements?: {
    minMatches8Weeks?: number;
    format?: string;
    winrateRange?: { min: number; max: number };
  };
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

const RANK_ICONS: Record<number, keyof typeof Ionicons.glyphMap> = {
  9: "leaf-outline",
  8: "walk-outline",
  7: "people-outline",
  6: "fitness-outline",
  5: "ribbon-outline",
  4: "medal-outline",
  3: "star-outline",
  2: "star",
  1: "trophy",
};

export default function AdultRanksListScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [expandedRank, setExpandedRank] = React.useState<number | null>(null);

  const { data: ranksData, isLoading } = useQuery<RanksResponse>({
    queryKey: ["/api/adult-glow/ranks"],
  });

  const { data: expandedRankData } = useQuery<RankDetailResponse>({
    queryKey: ["/api/adult-glow/ranks", expandedRank],
    enabled: expandedRank !== null,
  });

  const currentPlayerRank = 7;

  const toggleRank = (rank: number) => {
    setExpandedRank(expandedRank === rank ? null : rank);
  };

  const renderRankItem = ({ item }: { item: RankInfo }) => {
    const isExpanded = expandedRank === item.rank;
    const isCurrent = item.rank === currentPlayerRank;
    const isHigher = item.rank < currentPlayerRank;

    return (
      <Card
        elevation={isCurrent ? 2 : 1}
        style={[styles.rankCard, isCurrent && styles.currentRankCard]}
        onPress={() => toggleRank(item.rank)}
      >
        <View style={styles.rankHeader}>
          <View
            style={[
              styles.rankBadge,
              { backgroundColor: RANK_COLORS[item.rank] || Colors.dark.primary },
            ]}
          >
            <Ionicons
              name={RANK_ICONS[item.rank] || "star-outline"}
              size={24}
              color={Colors.dark.buttonText}
            />
          </View>
          <View style={styles.rankInfo}>
            <View style={styles.rankTitleRow}>
              <ThemedText style={styles.rankName}>{item.name}</ThemedText>
              {isCurrent && (
                <View style={styles.currentBadge}>
                  <ThemedText style={styles.currentBadgeText}>You</ThemedText>
                </View>
              )}
              {isHigher && (
                <Ionicons name="lock-closed" size={14} color={Colors.dark.disabled} />
              )}
            </View>
            <ThemedText style={styles.mmrRange}>
              {item.mmrRange.min} - {item.mmrRange.max} MMR
            </ThemedText>
          </View>
          <View style={styles.rankNumberContainer}>
            <ThemedText style={styles.rankNumberLabel}>Rank</ThemedText>
            <ThemedText
              style={[styles.rankNumber, { color: RANK_COLORS[item.rank] || Colors.dark.text }]}
            >
              {item.rank}
            </ThemedText>
          </View>
        </View>

        {isExpanded && expandedRankData && expandedRankData.rank === item.rank && (
          <View style={styles.expandedContent}>
            <View style={styles.divider} />
            <ThemedText style={styles.abilitySnapshot}>
              {expandedRankData.abilitySnapshot}
            </ThemedText>

            {expandedRankData.skillGates && expandedRankData.skillGates.length > 0 && (
              <>
                <ThemedText style={styles.subsectionTitle}>Skill Gates</ThemedText>
                {expandedRankData.skillGates.map((gate) => (
                  <View key={gate.id} style={styles.gateRow}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={16}
                      color={Colors.dark.primary}
                    />
                    <ThemedText style={styles.gateText}>{gate.description}</ThemedText>
                  </View>
                ))}
              </>
            )}

            {expandedRankData.matchRequirements && (
              <>
                <ThemedText style={styles.subsectionTitle}>Match Requirements</ThemedText>
                {expandedRankData.matchRequirements.minMatches8Weeks && (
                  <View style={styles.gateRow}>
                    <Ionicons
                      name="tennisball-outline"
                      size={16}
                      color={Colors.dark.xpCyan}
                    />
                    <ThemedText style={styles.gateText}>
                      {expandedRankData.matchRequirements.minMatches8Weeks} matches in 8 weeks
                    </ThemedText>
                  </View>
                )}
                {expandedRankData.matchRequirements.winrateRange && (
                  <View style={styles.gateRow}>
                    <Ionicons
                      name="trending-up-outline"
                      size={16}
                      color={Colors.dark.successNeon}
                    />
                    <ThemedText style={styles.gateText}>
                      {expandedRankData.matchRequirements.winrateRange.min}% -{" "}
                      {expandedRankData.matchRequirements.winrateRange.max}% win rate
                    </ThemedText>
                  </View>
                )}
                {expandedRankData.matchRequirements.format && (
                  <View style={styles.gateRow}>
                    <Ionicons name="document-outline" size={16} color={Colors.dark.orange} />
                    <ThemedText style={styles.gateText}>
                      Format: {expandedRankData.matchRequirements.format}
                    </ThemedText>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        <View style={styles.expandIndicator}>
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={Colors.dark.text}
          />
        </View>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <ThemedText style={styles.loadingText}>Loading ranks...</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={ranksData?.ranks || []}
        keyExtractor={(item) => item.rank.toString()}
        renderItem={renderRankItem}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            <ThemedText style={styles.headerTitle}>Glow Rank System</ThemedText>
            <ThemedText style={styles.headerSubtitle}>
              9 ranks from Beginner to International level. Progress is based on match results
              (MMR) and skill assessments.
            </ThemedText>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
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
  headerSection: {
    marginBottom: Spacing.xl,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.7,
    lineHeight: 20,
  },
  rankCard: {
    padding: Spacing.md,
  },
  currentRankCard: {
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  rankHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  rankBadge: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  rankInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  rankTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rankName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  currentBadge: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  mmrRange: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  rankNumberContainer: {
    alignItems: "center",
  },
  rankNumberLabel: {
    fontSize: 10,
    color: Colors.dark.text,
    opacity: 0.5,
    textTransform: "uppercase",
  },
  rankNumber: {
    fontSize: 28,
    fontWeight: "700",
  },
  expandIndicator: {
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  expandedContent: {
    marginTop: Spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.backgroundTertiary,
    marginBottom: Spacing.md,
  },
  abilitySnapshot: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.8,
    fontStyle: "italic",
    marginBottom: Spacing.md,
  },
  subsectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  gateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  gateText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.8,
  },
  separator: {
    height: Spacing.sm,
  },
});
