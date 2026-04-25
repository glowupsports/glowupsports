import React, { useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import BallLevelBadge from "@/components/BallLevelBadge";

interface ChildProgress {
  id: string;
  name: string;
  levelId: string;
  levelStatus: "active" | "trial";
  trialEndsAt?: string;
  lastSessionDate?: string;
  totalSessions: number;
  completedSkills: number;
  totalSkillsForLevel: number;
  recentHighlights: string[];
  nextSession?: {
    date: string;
    time: string;
    coach: string;
  };
}

interface ParentMessage {
  id: string;
  date: string;
  coachName: string;
  childName: string;
  message: string;
  type: "feedback" | "progress" | "celebration";
}

export default function ParentDashboardScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: children = [], refetch: refetchChildren } = useQuery<ChildProgress[]>({
    queryKey: ["/api/parent/children"],
  });

  const { data: messages = [], refetch: refetchMessages } = useQuery<ParentMessage[]>({
    queryKey: ["/api/parent/messages"],
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchChildren(), refetchMessages()]);
    setRefreshing(false);
  }, [refetchChildren, refetchMessages]);

  const getProgressPercentage = (child: ChildProgress) => {
    if (child.totalSkillsForLevel === 0) return 0;
    return Math.round((child.completedSkills / child.totalSkillsForLevel) * 100);
  };

  const getMessageIcon = (type: ParentMessage["type"]): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case "celebration": return "trophy";
      case "progress": return "trending-up";
      default: return "chatbubble";
    }
  };

  const getMessageColor = (type: ParentMessage["type"]) => {
    switch (type) {
      case "celebration": return Colors.dark.gold;
      case "progress": return Colors.dark.primary;
      default: return Colors.dark.xpCyan;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.dark.primary}
        />
      }
    >
      <View style={styles.header}>
        <ThemedText style={styles.greeting}>Parent Dashboard</ThemedText>
        <ThemedText style={styles.subtitle}>Track your child&apos;s tennis journey</ThemedText>
      </View>

      <ThemedText style={styles.sectionTitle}>Your Children</ThemedText>

      {children.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="people-outline" size={48} color={Colors.dark.disabled} />
          <ThemedText style={styles.emptyText}>No children linked to your account</ThemedText>
        </Card>
      ) : (
        children.map((child) => {
          const progress = getProgressPercentage(child);

          return (
            <Card 
              key={child.id} 
              style={styles.childCard}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("ChildProgress", { childId: child.id });
              }}
            >
              <View style={styles.childHeader}>
                <BallLevelBadge 
                  levelId={child.levelId} 
                  status={child.levelStatus}
                  size="medium"
                  trialEndsAt={child.trialEndsAt}
                />
                <View style={styles.childInfo}>
                  <ThemedText style={styles.childName}>{child.name}</ThemedText>
                  <ThemedText style={styles.sessionsCount}>
                    {child.totalSessions} sessions completed
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.text} />
              </View>

              <View style={styles.progressSection}>
                <View style={styles.progressHeader}>
                  <ThemedText style={styles.progressLabel}>Level Progress</ThemedText>
                  <ThemedText style={styles.progressPercent}>{progress}%</ThemedText>
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <ThemedText style={styles.progressDetail}>
                  {child.completedSkills} of {child.totalSkillsForLevel} skills achieved
                </ThemedText>
              </View>

              {child.nextSession ? (
                <View style={styles.nextSession}>
                  <Ionicons name="calendar-outline" size={16} color={Colors.dark.xpCyan} />
                  <ThemedText style={styles.nextSessionText}>
                    Next: {formatDate(child.nextSession.date)} at {child.nextSession.time} with {child.nextSession.coach}
                  </ThemedText>
                </View>
              ) : null}

              {child.recentHighlights.length > 0 ? (
                <View style={styles.highlights}>
                  {child.recentHighlights.slice(0, 2).map((highlight, index) => (
                    <View key={index} style={styles.highlightItem}>
                      <Ionicons name="star" size={12} color={Colors.dark.gold} />
                      <ThemedText style={styles.highlightText}>{highlight}</ThemedText>
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          );
        })
      )}

      <View style={styles.messagesSection}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Recent Updates</ThemedText>
          <Pressable onPress={() => navigation.navigate("AllMessages")}>
            <ThemedText style={styles.viewAllText}>View All</ThemedText>
          </Pressable>
        </View>

        {messages.length === 0 ? (
          <Card style={styles.emptyMessageCard}>
            <Ionicons name="mail-outline" size={32} color={Colors.dark.disabled} />
            <ThemedText style={styles.emptyMessageText}>No recent updates from coaches</ThemedText>
          </Card>
        ) : (
          messages.slice(0, 3).map((msg) => (
            <Card key={msg.id} style={styles.messageCard}>
              <View style={styles.messageHeader}>
                <View style={[styles.messageIcon, { backgroundColor: getMessageColor(msg.type) + "20" }]}>
                  <Ionicons name={getMessageIcon(msg.type)} size={16} color={getMessageColor(msg.type)} />
                </View>
                <View style={styles.messageInfo}>
                  <ThemedText style={styles.messageChildName}>{msg.childName}</ThemedText>
                  <ThemedText style={styles.messageDate}>{formatDate(msg.date)}</ThemedText>
                </View>
              </View>
              <ThemedText style={styles.messageText}>{msg.message}</ThemedText>
              <ThemedText style={styles.messageCoach}>- {msg.coachName}</ThemedText>
            </Card>
          ))
        )}
      </View>

      <View style={styles.quickLinks}>
        <ThemedText style={styles.sectionTitle}>Quick Access</ThemedText>
        <View style={styles.linksRow}>
          <Pressable 
            style={styles.linkCard}
            onPress={() => navigation.navigate("ScheduleSessions")}
          >
            <View style={[styles.linkIcon, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
              <Ionicons name="calendar" size={24} color={Colors.dark.xpCyan} />
            </View>
            <ThemedText style={styles.linkLabel}>Book Session</ThemedText>
          </Pressable>

          <Pressable 
            style={styles.linkCard}
            onPress={() => navigation.navigate("ProgressReports")}
          >
            <View style={[styles.linkIcon, { backgroundColor: Colors.dark.primary + "20" }]}>
              <Ionicons name="bar-chart" size={24} color={Colors.dark.primary} />
            </View>
            <ThemedText style={styles.linkLabel}>Progress Reports</ThemedText>
          </Pressable>

          <Pressable 
            style={styles.linkCard}
            onPress={() => navigation.navigate("ContactCoach")}
          >
            <View style={[styles.linkIcon, { backgroundColor: Colors.dark.gold + "20" }]}>
              <Ionicons name="chatbubbles" size={24} color={Colors.dark.gold} />
            </View>
            <ThemedText style={styles.linkLabel}>Message Coach</ThemedText>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  viewAllText: {
    fontSize: 14,
    color: Colors.dark.primary,
  },
  emptyCard: {
    alignItems: "center",
    padding: Spacing["2xl"],
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  childCard: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  childHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  childInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  childName: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  sessionsCount: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  progressSection: {
    marginBottom: Spacing.md,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  progressLabel: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: Spacing.xs,
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 4,
  },
  progressDetail: {
    fontSize: 11,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  nextSession: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.xpCyan + "15",
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  nextSessionText: {
    fontSize: 12,
    color: Colors.dark.xpCyan,
    flex: 1,
  },
  highlights: {
    gap: Spacing.xs,
  },
  highlightItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  highlightText: {
    fontSize: 12,
    color: Colors.dark.gold,
  },
  messagesSection: {
    marginTop: Spacing.xl,
  },
  emptyMessageCard: {
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyMessageText: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  messageCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.lg,
  },
  messageHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  messageIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  messageInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  messageChildName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  messageDate: {
    fontSize: 11,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  messageText: {
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  messageCoach: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    fontStyle: "italic",
  },
  quickLinks: {
    marginTop: Spacing.xl,
  },
  linksRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  linkCard: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    gap: Spacing.sm,
  },
  linkIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  linkLabel: {
    fontSize: 11,
    color: Colors.dark.text,
    textAlign: "center",
  },
});
