import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  criteria: string;
  category?: string;
  tier?: string;
  isActive: boolean;
  order?: number;
}

const BADGE_TIER_COLORS: Record<string, string> = {
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#FFD700",
  platinum: "#E5E4E2",
  diamond: "#B9F2FF",
};

export default function BadgeDefinitionsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const { data: badges = [], isLoading } = useQuery<Badge[]>({
    queryKey: ["/api/badges"],
  });

  const groupedBadges = badges.reduce((acc, badge) => {
    const category = badge.category || "General";
    if (!acc[category]) acc[category] = [];
    acc[category].push(badge);
    return acc;
  }, {} as Record<string, Badge[]>);

  const categories = Object.keys(groupedBadges).sort();

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={styles.loadingText}>Loading badges...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.topBar}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Badge Definitions</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>View all achievement badges and their rewards</Text>

        {badges.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="ribbon-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyTitle}>No Badges Configured</Text>
            <Text style={styles.emptyDescription}>
              Badges will be seeded when the system initializes.
            </Text>
          </View>
        ) : null}

        {categories.map((category) => (
          <View key={category} style={styles.categorySection}>
            <Text style={styles.categoryTitle}>{category}</Text>
            <View style={styles.badgeGrid}>
              {groupedBadges[category].map((badge) => (
                <View key={badge.id} style={[styles.badgeCard, CardStyles.elevated]}>
                  <View style={[
                    styles.tierIndicator,
                    { backgroundColor: BADGE_TIER_COLORS[badge.tier || "bronze"] || Colors.dark.gold }
                  ]} />
                  <View style={styles.badgeIcon}>
                    <Ionicons 
                      name={(badge.icon as any) || "ribbon-outline"} 
                      size={28} 
                      color={Colors.dark.gold} 
                    />
                  </View>
                  <Text style={styles.badgeName}>{badge.name}</Text>
                  <Text style={styles.badgeDescription} numberOfLines={2}>{badge.description}</Text>
                  <View style={styles.badgeReward}>
                    <Ionicons name="flash" size={14} color={Colors.dark.xpCyan} />
                    <Text style={styles.rewardText}>+{badge.xpReward} XP</Text>
                  </View>
                  {badge.criteria ? (
                    <View style={styles.criteriaContainer}>
                      <Text style={styles.criteriaLabel}>Trigger:</Text>
                      <Text style={styles.criteriaValue}>{badge.criteria.replace(/_/g, " ")}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={Colors.dark.textMuted} />
          <Text style={styles.infoText}>
            Badges are automatically awarded when players complete specific achievements. Configuration is managed through database seeding.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  topBarTitle: {
    ...Typography.h2,
    color: PLATFORM_COLOR,
    flex: 1,
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginTop: Spacing.md,
  },
  emptyDescription: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  categorySection: {
    marginBottom: Spacing.xl,
  },
  categoryTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
    marginBottom: Spacing.md,
  },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  badgeCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    width: "47%",
    alignItems: "center",
    overflow: "hidden",
  },
  tierIndicator: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  badgeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.gold + "20",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  badgeName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    textAlign: "center",
  },
  badgeDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.xs,
    minHeight: 32,
  },
  badgeReward: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
  },
  rewardText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  criteriaContainer: {
    marginTop: Spacing.sm,
    alignItems: "center",
  },
  criteriaLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  criteriaValue: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
    textTransform: "capitalize",
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  infoText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    flex: 1,
  },
});
