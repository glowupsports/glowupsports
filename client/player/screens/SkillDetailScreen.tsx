import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";

type RouteParams = {
  SkillDetail: {
    domain: string;
  };
};

interface Skill {
  id: string;
  name: string;
  progress: number;
  status: "needs_work" | "stable" | "strong" | "improving";
  recentImpact?: { session: string; change: number; date: string }[];
  suggestions?: string[];
}

interface DomainDetail {
  domain: string;
  overallProgress: number;
  skills: Skill[];
}

const DOMAIN_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  technical: { icon: "construct", color: Colors.dark.primary, label: "Technical" },
  mental: { icon: "bulb", color: "#9B59B6", label: "Mental" },
  physical: { icon: "fitness", color: Colors.dark.orange, label: "Physical" },
  tactical: { icon: "compass", color: Colors.dark.gold, label: "Tactical" },
  social: { icon: "people", color: Colors.dark.xpCyan, label: "Social" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  needs_work: { label: "Needs Work", color: Colors.dark.orange },
  stable: { label: "Stable", color: Colors.dark.textMuted },
  strong: { label: "Strong", color: Colors.dark.primary },
  improving: { label: "Improving", color: Colors.dark.xpCyan },
};

export default function SkillDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, "SkillDetail">>();
  const domain = route.params?.domain || "technical";

  const { data: domainData, isLoading } = useQuery<DomainDetail>({
    queryKey: ["/api/player/skills", domain],
    enabled: !!domain,
  });

  const config = DOMAIN_CONFIG[domain] || DOMAIN_CONFIG.technical;

  const mockData: DomainDetail = {
    domain,
    overallProgress: 68,
    skills: [
      {
        id: "1",
        name: "Forehand Consistency",
        progress: 72,
        status: "improving",
        recentImpact: [
          { session: "Forehand + Movement", change: 3, date: "Yesterday" },
          { session: "Private Training", change: 2, date: "3 days ago" },
        ],
        suggestions: [
          "2 more coach sessions tagged 'Technical'",
          "No negative consistency drops",
        ],
      },
      {
        id: "2",
        name: "Backhand Control",
        progress: 55,
        status: "needs_work",
        recentImpact: [
          { session: "Group Training", change: 1, date: "Last week" },
        ],
        suggestions: [
          "Focus on follow-through motion",
          "Practice cross-court shots",
        ],
      },
      {
        id: "3",
        name: "Serve Rhythm",
        progress: 61,
        status: "stable",
        recentImpact: [
          { session: "Serve Practice", change: 2, date: "4 days ago" },
        ],
      },
      {
        id: "4",
        name: "Volley Touch",
        progress: 48,
        status: "needs_work",
        suggestions: [
          "More net approach drills needed",
          "Work on soft hands at the net",
        ],
      },
      {
        id: "5",
        name: "Footwork",
        progress: 65,
        status: "improving",
        recentImpact: [
          { session: "Footwork Drills", change: 4, date: "Yesterday" },
        ],
      },
    ],
  };

  const data = domainData || mockData;
  const overallProgress = data?.overallProgress ?? 0;
  const skills = data?.skills || [];
  const [expandedSkill, setExpandedSkill] = React.useState<string | null>(null);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{config.label} Skills</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.domainHeader}>
          <View style={[styles.domainIcon, { backgroundColor: `${config.color}20` }]}>
            <Ionicons name={config.icon as any} size={28} color={config.color} />
          </View>
          <View style={styles.domainInfo}>
            <Text style={styles.domainTitle}>{config.label}</Text>
            <Text style={styles.domainSubtitle}>Overall Progress</Text>
          </View>
          <View style={styles.progressCircle}>
            <Text style={[styles.progressValue, { color: config.color }]}>{overallProgress}%</Text>
          </View>
        </View>

        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBg}>
            <View 
              style={[
                styles.progressBarFill, 
                { width: `${overallProgress}%`, backgroundColor: config.color }
              ]} 
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Individual Skills</Text>
        <Text style={styles.sectionSubtitle}>Tap a skill to see details and suggestions</Text>

        {skills.map((skill) => {
          const statusConfig = STATUS_CONFIG[skill.status] || STATUS_CONFIG.stable;
          const isExpanded = expandedSkill === skill.id;

          return (
            <Pressable
              key={skill.id}
              style={styles.skillCard}
              onPress={() => setExpandedSkill(isExpanded ? null : skill.id)}
            >
              <View style={styles.skillHeader}>
                <View style={styles.skillInfo}>
                  <Text style={styles.skillName}>{skill.name}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: `${statusConfig.color}20` }]}>
                    <Text style={[styles.statusText, { color: statusConfig.color }]}>
                      {statusConfig.label}
                    </Text>
                  </View>
                </View>
                <View style={styles.skillProgress}>
                  <Text style={styles.skillProgressValue}>{skill.progress}%</Text>
                  <Ionicons 
                    name={isExpanded ? "chevron-up" : "chevron-down"} 
                    size={16} 
                    color={Colors.dark.textMuted} 
                  />
                </View>
              </View>

              <View style={styles.skillProgressBar}>
                <View 
                  style={[
                    styles.skillProgressFill, 
                    { 
                      width: `${skill.progress}%`, 
                      backgroundColor: statusConfig.color 
                    }
                  ]} 
                />
              </View>

              {isExpanded ? (
                <View style={styles.expandedContent}>
                  {skill.recentImpact && skill.recentImpact.length > 0 ? (
                    <View style={styles.impactSection}>
                      <Text style={styles.impactTitle}>Recent Training Impact</Text>
                      {skill.recentImpact.map((impact, idx) => (
                        <View key={idx} style={styles.impactRow}>
                          <Text style={styles.impactSession}>{impact.session}</Text>
                          <Text style={styles.impactChange}>+{impact.change}%</Text>
                          <Text style={styles.impactDate}>{impact.date}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {skill.suggestions && skill.suggestions.length > 0 ? (
                    <View style={styles.suggestionsSection}>
                      <Text style={styles.suggestionsTitle}>To Improve This Skill</Text>
                      {skill.suggestions.map((suggestion, idx) => (
                        <View key={idx} style={styles.suggestionRow}>
                          <Ionicons name="checkmark-circle-outline" size={16} color={Colors.dark.textMuted} />
                          <Text style={styles.suggestionText}>{suggestion}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        })}
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
  domainHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  domainIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  domainInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  domainTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  domainSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  progressCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  progressValue: {
    ...Typography.h3,
    fontWeight: "700",
  },
  progressBarContainer: {
    marginBottom: Spacing.lg,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  sectionSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: -Spacing.sm,
  },
  skillCard: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
  },
  skillHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  skillInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  skillName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  skillProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  skillProgressValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  skillProgressBar: {
    height: 6,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 3,
    overflow: "hidden",
  },
  skillProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  expandedContent: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
    gap: Spacing.lg,
  },
  impactSection: {
    gap: Spacing.sm,
  },
  impactTitle: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  impactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  impactSession: {
    ...Typography.small,
    color: Colors.dark.text,
    flex: 1,
  },
  impactChange: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
    marginRight: Spacing.md,
  },
  impactDate: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    width: 80,
    textAlign: "right",
  },
  suggestionsSection: {
    gap: Spacing.sm,
  },
  suggestionsTitle: {
    ...Typography.caption,
    color: Colors.dark.gold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  suggestionText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    flex: 1,
  },
});
