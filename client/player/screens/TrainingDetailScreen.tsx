import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";

type RouteParams = {
  TrainingDetail: {
    sessionId: string;
  };
};

interface DomainImpact {
  domain: string;
  xp: number;
  skillsAffected: { name: string; change: number }[];
}

interface TrainingDetail {
  id: string;
  date: string;
  type: string;
  duration: number;
  coachName: string;
  coachAvatar?: string;
  xpEarned: number;
  feedback: {
    focus: number;
    effort: number;
    message?: string;
  };
  domainImpacts: DomainImpact[];
  focusArea?: string;
}

const DOMAIN_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  technical: { icon: "construct", color: Colors.dark.primary, label: "Technical" },
  mental: { icon: "brain", color: "#9B59B6", label: "Mental" },
  physical: { icon: "fitness", color: Colors.dark.orange, label: "Physical" },
  tactical: { icon: "compass", color: Colors.dark.gold, label: "Tactical" },
  social: { icon: "people", color: Colors.dark.xpCyan, label: "Social" },
};

export default function TrainingDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, "TrainingDetail">>();
  const sessionId = route.params?.sessionId;

  const { data: training, isLoading } = useQuery<TrainingDetail>({
    queryKey: ["/api/player/training", sessionId],
    enabled: !!sessionId,
  });

  const mockTraining: TrainingDetail = {
    id: sessionId || "1",
    date: new Date(Date.now() - 86400000).toISOString(),
    type: "private",
    duration: 60,
    coachName: "Coach Mike",
    xpEarned: 80,
    feedback: {
      focus: 4,
      effort: 5,
      message: "Excellent footwork improvement today. Your split-step timing is getting much better. Focus on recovery speed after wide balls.",
    },
    focusArea: "Court Positioning",
    domainImpacts: [
      {
        domain: "technical",
        xp: 40,
        skillsAffected: [
          { name: "Forehand Consistency", change: 3 },
          { name: "Footwork", change: 2 },
        ],
      },
      {
        domain: "physical",
        xp: 30,
        skillsAffected: [
          { name: "Court Coverage", change: 2 },
          { name: "Recovery Speed", change: 1 },
        ],
      },
      {
        domain: "mental",
        xp: 10,
        skillsAffected: [
          { name: "Focus", change: 1 },
        ],
      },
    ],
  };

  const data = training || mockTraining;
  const date = new Date(data.date);
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Training Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sessionHeader}>
          <View style={styles.sessionInfo}>
            <Text style={styles.sessionDate}>{dateStr}</Text>
            <Text style={styles.sessionType}>
              {data.type === "private" ? "Private Session" : 
               data.type === "group" ? "Group Training" : "Training Session"}
            </Text>
          </View>
          <View style={styles.totalXpBadge}>
            <Ionicons name="flash" size={20} color={Colors.dark.xpCyan} />
            <Text style={styles.totalXpText}>+{data.xpEarned} XP</Text>
          </View>
        </View>

        <View style={styles.coachCard}>
          <View style={styles.coachAvatar}>
            <Ionicons name="person" size={24} color={Colors.dark.text} />
          </View>
          <View style={styles.coachInfo}>
            <Text style={styles.coachName}>{data.coachName}</Text>
            <Text style={styles.coachRole}>Your Coach</Text>
          </View>
          <View style={styles.durationBadge}>
            <Ionicons name="time-outline" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.durationText}>{data.duration} min</Text>
          </View>
        </View>

        {data.focusArea ? (
          <View style={styles.focusCard}>
            <View style={styles.focusHeader}>
              <Ionicons name="flag" size={18} color={Colors.dark.primary} />
              <Text style={styles.focusLabel}>Session Focus</Text>
            </View>
            <Text style={styles.focusValue}>{data.focusArea}</Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="chatbubble-ellipses" size={18} color={Colors.dark.xpCyan} />
            <Text style={styles.sectionTitle}>Coach Feedback</Text>
          </View>
          <Text style={styles.feedbackText}>
            "{data.feedback.message || "No written feedback for this session."}"
          </Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Focus</Text>
              <View style={styles.metricDots}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.metricDot,
                      i <= data.feedback.focus && styles.metricDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Effort</Text>
              <View style={styles.metricDots}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.metricDot,
                      i <= data.feedback.effort && styles.metricDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trending-up" size={18} color={Colors.dark.primary} />
            <Text style={styles.sectionTitle}>Skill Impact</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Skills affected by this training session
          </Text>
          {data.domainImpacts.map((impact) => {
            const config = DOMAIN_CONFIG[impact.domain] || DOMAIN_CONFIG.technical;
            return (
              <View key={impact.domain} style={styles.domainImpactCard}>
                <View style={styles.domainHeader}>
                  <View style={[styles.domainIcon, { backgroundColor: `${config.color}20` }]}>
                    <Ionicons name={config.icon as any} size={18} color={config.color} />
                  </View>
                  <Text style={styles.domainLabel}>{config.label}</Text>
                  <View style={styles.domainXpBadge}>
                    <Text style={[styles.domainXpText, { color: config.color }]}>+{impact.xp} XP</Text>
                  </View>
                </View>
                <View style={styles.skillsList}>
                  {impact.skillsAffected.map((skill, idx) => (
                    <View key={idx} style={styles.skillRow}>
                      <Text style={styles.skillName}>{skill.name}</Text>
                      <Text style={styles.skillChange}>+{skill.change}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flash" size={18} color={Colors.dark.gold} />
            <Text style={styles.sectionTitle}>XP Breakdown</Text>
          </View>
          <View style={styles.xpBreakdown}>
            {data.domainImpacts.map((impact) => {
              const config = DOMAIN_CONFIG[impact.domain] || DOMAIN_CONFIG.technical;
              const percentage = Math.round((impact.xp / data.xpEarned) * 100);
              return (
                <View key={impact.domain} style={styles.xpBreakdownRow}>
                  <View style={styles.xpBreakdownLabel}>
                    <View style={[styles.xpDot, { backgroundColor: config.color }]} />
                    <Text style={styles.xpBreakdownDomain}>{config.label}</Text>
                  </View>
                  <View style={styles.xpBreakdownBar}>
                    <View 
                      style={[
                        styles.xpBreakdownFill, 
                        { width: `${percentage}%`, backgroundColor: config.color }
                      ]} 
                    />
                  </View>
                  <Text style={styles.xpBreakdownValue}>+{impact.xp}</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total XP Earned</Text>
            <Text style={styles.totalValue}>+{data.xpEarned} XP</Text>
          </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  sessionInfo: {
    flex: 1,
  },
  sessionDate: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  sessionType: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  totalXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  totalXpText: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
  },
  coachCard: {
    ...CardStyles.elevated,
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
  },
  coachAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  coachInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  coachRole: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  durationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  durationText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  focusCard: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.primary,
  },
  focusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  focusLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  focusValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  sectionCard: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sectionSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  feedbackText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontStyle: "italic",
    lineHeight: 24,
    marginBottom: Spacing.lg,
  },
  metricsRow: {
    flexDirection: "row",
    gap: Spacing["2xl"],
  },
  metricItem: {
    gap: 6,
  },
  metricLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  metricDots: {
    flexDirection: "row",
    gap: 4,
  },
  metricDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  metricDotActive: {
    backgroundColor: Colors.dark.primary,
  },
  domainImpactCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  domainHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  domainIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  domainLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginLeft: Spacing.sm,
    flex: 1,
  },
  domainXpBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  domainXpText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  skillsList: {
    marginLeft: 40,
  },
  skillRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  skillName: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  skillChange: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  xpBreakdown: {
    gap: Spacing.md,
  },
  xpBreakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  xpBreakdownLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    width: 90,
  },
  xpDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  xpBreakdownDomain: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  xpBreakdownBar: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 4,
    overflow: "hidden",
  },
  xpBreakdownFill: {
    height: "100%",
    borderRadius: 4,
  },
  xpBreakdownValue: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
    width: 40,
    textAlign: "right",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  totalLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  totalValue: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
  },
});
