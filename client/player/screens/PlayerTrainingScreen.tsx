import React, { useMemo, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, CardStyles, GlowColors } from "@/constants/theme";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface TrainingSession {
  id: string;
  date: string;
  type: string;
  duration: number;
  coachName: string;
  attended: boolean;
  xpEarned: number;
  domains?: { domain: string; xp: number }[];
  feedback?: {
    focus: number;
    effort: number;
    message?: string;
  };
}

interface FocusArea {
  name: string;
  setBy: string;
  setDate: string;
}

const DOMAIN_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  technical: { icon: "construct", color: Colors.dark.primary, label: "TEC" },
  mental: { icon: "brain", color: "#9B59B6", label: "MEN" },
  physical: { icon: "fitness", color: Colors.dark.orange, label: "PHY" },
  tactical: { icon: "compass", color: Colors.dark.gold, label: "TAC" },
  social: { icon: "people", color: Colors.dark.primary, label: "SOC" },
};

function SessionCard({ session, onPress }: { session: TrainingSession; onPress: () => void }) {
  const date = new Date(session.date);
  const dateStr = date.toLocaleDateString("en-US", { 
    weekday: "short", 
    month: "short", 
    day: "numeric" 
  });
  
  const getTypeIcon = () => {
    switch (session.type) {
      case "private": return "person";
      case "group": return "people";
      case "physical": return "fitness";
      default: return "tennisball";
    }
  };

  const getTypeColor = () => {
    switch (session.type) {
      case "private": return Colors.dark.primary;
      case "group": return Colors.dark.gold;
      case "physical": return Colors.dark.orange;
      default: return Colors.dark.primary;
    }
  };

  return (
    <Pressable style={styles.sessionCard} onPress={onPress}>
      <View style={styles.sessionHeader}>
        <View style={styles.sessionDateContainer}>
          <View style={[styles.typeIcon, { backgroundColor: `${getTypeColor()}20` }]}>
            <Ionicons name={getTypeIcon() as any} size={18} color={getTypeColor()} />
          </View>
          <View>
            <Text style={styles.sessionDate}>{dateStr}</Text>
            <Text style={styles.sessionType}>
              {session.type === "private" ? "Private" : 
               session.type === "group" ? "Group" : 
               session.type === "physical" ? "Physical" : "Training"}
            </Text>
          </View>
        </View>
        <View style={styles.xpBadge}>
          <Ionicons name="flash" size={14} color={Colors.dark.primary} />
          <Text style={styles.xpText}>+{session.xpEarned} XP</Text>
        </View>
      </View>

      {session.domains && session.domains.length > 0 ? (
        <View style={styles.domainsRow}>
          {session.domains.map((d, idx) => {
            const config = DOMAIN_CONFIG[d.domain] || DOMAIN_CONFIG.technical;
            return (
              <View key={idx} style={[styles.domainBadge, { backgroundColor: `${config.color}15` }]}>
                <Ionicons name={config.icon as any} size={12} color={config.color} />
                <Text style={[styles.domainBadgeText, { color: config.color }]}>+{d.xp}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {session.feedback ? (
        <View style={styles.feedbackSection}>
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Focus</Text>
              <View style={styles.metricDots}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.metricDot,
                      i <= session.feedback!.focus && styles.metricDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Effort</Text>
              <View style={styles.metricDots}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.metricDot,
                      i <= session.feedback!.effort && styles.metricDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>
          {session.feedback.message ? (
            <Text style={styles.feedbackMessage}>"{session.feedback.message}"</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.sessionFooter}>
        <Ionicons name="person-circle-outline" size={16} color={Colors.dark.textMuted} />
        <Text style={styles.coachName}>{session.coachName}</Text>
        <Text style={styles.duration}>{session.duration} min</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
      </View>
    </Pressable>
  );
}

function ActiveFocusBlock({ focus }: { focus: FocusArea }) {
  return (
    <View style={styles.focusCard}>
      <View style={styles.focusHeader}>
        <Ionicons name="flag" size={18} color={Colors.dark.primary} />
        <Text style={styles.focusLabel}>CURRENT FOCUS</Text>
      </View>
      <Text style={styles.focusValue}>{focus.name}</Text>
      <Text style={styles.focusSetBy}>Set by {focus.setBy}</Text>
    </View>
  );
}

export default function PlayerTrainingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();


  const { data: sessions, isLoading } = useQuery<TrainingSession[]>({
    queryKey: ["/api/player/training-history"],
  });

  const activeFocus: FocusArea | null = null;

  const data = sessions || [];

  const handleSessionPress = (sessionId: string) => {
    navigation.navigate("TrainingDetail", { sessionId });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.title}>Training History</Text>
        <Text style={styles.subtitle}>Your progress is based on coach sessions</Text>
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SessionCard 
            session={item} 
            onPress={() => handleSessionPress(item.id)} 
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          activeFocus ? <ActiveFocusBlock focus={activeFocus} /> : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="fitness-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No training sessions yet</Text>
            <Text style={styles.emptySubtext}>
              Complete sessions with your coach to see them here
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    padding: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  closeBtn: {
    alignSelf: "flex-start",
    marginBottom: Spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.chipBackground,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  subtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  sessionCard: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  sessionDateContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  sessionDate: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sessionType: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  xpText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  feedbackSection: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  metricsRow: {
    flexDirection: "row",
    gap: Spacing.xl,
  },
  metric: {
    gap: 4,
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
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  metricDotActive: {
    backgroundColor: GlowColors.primary,
  },
  feedbackMessage: {
    ...Typography.small,
    color: Colors.dark.text,
    fontStyle: "italic",
    marginTop: Spacing.sm,
  },
  sessionFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  coachName: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  duration: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginRight: Spacing.xs,
  },
  domainsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  domainBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  domainBadgeText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  focusCard: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: GlowColors.primary,
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
    letterSpacing: 0.5,
  },
  focusValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  focusSetBy: {
    ...Typography.caption,
    color: Colors.dark.primary,
    marginTop: 4,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["4xl"],
    gap: Spacing.md,
  },
  emptyText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
}));
