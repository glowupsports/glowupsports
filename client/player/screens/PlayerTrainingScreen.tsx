import React from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";

interface TrainingSession {
  id: string;
  date: string;
  type: string;
  duration: number;
  coachName: string;
  attended: boolean;
  xpEarned: number;
  feedback?: {
    focus: number;
    effort: number;
    message?: string;
  };
}

function SessionCard({ session }: { session: TrainingSession }) {
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
      default: return Colors.dark.xpCyan;
    }
  };

  return (
    <View style={styles.sessionCard}>
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
          <Ionicons name="flash" size={14} color={Colors.dark.xpCyan} />
          <Text style={styles.xpText}>+{session.xpEarned} XP</Text>
        </View>
      </View>

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
      </View>
    </View>
  );
}

export default function PlayerTrainingScreen() {
  const insets = useSafeAreaInsets();

  const { data: sessions, isLoading } = useQuery<TrainingSession[]>({
    queryKey: ["/api/player/training-history"],
    enabled: false,
  });

  const mockSessions: TrainingSession[] = [
    {
      id: "1",
      date: new Date(Date.now() - 86400000).toISOString(),
      type: "private",
      duration: 60,
      coachName: "Coach Mike",
      attended: true,
      xpEarned: 45,
      feedback: {
        focus: 4,
        effort: 5,
        message: "Excellent footwork improvement. Keep up the momentum!",
      },
    },
    {
      id: "2",
      date: new Date(Date.now() - 86400000 * 3).toISOString(),
      type: "group",
      duration: 90,
      coachName: "Coach Mike",
      attended: true,
      xpEarned: 35,
      feedback: {
        focus: 3,
        effort: 4,
      },
    },
    {
      id: "3",
      date: new Date(Date.now() - 86400000 * 5).toISOString(),
      type: "physical",
      duration: 45,
      coachName: "Coach Sarah",
      attended: true,
      xpEarned: 30,
      feedback: {
        focus: 5,
        effort: 5,
        message: "Great stamina work. Core strength is improving.",
      },
    },
    {
      id: "4",
      date: new Date(Date.now() - 86400000 * 7).toISOString(),
      type: "private",
      duration: 60,
      coachName: "Coach Mike",
      attended: true,
      xpEarned: 40,
      feedback: {
        focus: 4,
        effort: 4,
      },
    },
  ];

  const data = sessions || mockSessions;

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
        <Text style={styles.title}>Training History</Text>
        <Text style={styles.subtitle}>Sessions validated by your coach</Text>
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SessionCard session={item} />}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    padding: Spacing.xl,
    paddingBottom: Spacing.lg,
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
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  feedbackSection: {
    backgroundColor: Colors.dark.backgroundSecondary,
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
    backgroundColor: Colors.dark.primary,
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
});
