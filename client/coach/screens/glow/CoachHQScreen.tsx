import React, { useState, useCallback, useMemo } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import BallLevelBadge from "@/components/BallLevelBadge";
import { RosterInsightsCard } from "@/coach/components/RosterInsightsCard";

interface TodaySession {
  id: string;
  playerId: string;
  playerName: string;
  playerLevel: string;
  sport?: string | null;
  startTime: string;
  endTime: string;
  type: string;
  status: "scheduled" | "in_progress" | "completed";
  sessionPlanId?: string;
  locationId?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
}

interface QuickStat {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}


export default function CoachHQScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string | null>(null);

  const { data: todaySessions = [], refetch } = useQuery<TodaySession[]>({
    queryKey: ["/api/coach/sessions/today"],
  });

  const sessionLocations = useMemo(() => {
    const seen = new Set<string>();
    const locs: { id: string; name: string }[] = [];
    for (const s of todaySessions) {
      const name = s.locationName || s.locationAddress;
      const id = s.locationId || name;
      if (name && id && !seen.has(id)) {
        seen.add(id);
        locs.push({ id, name });
      }
    }
    return locs;
  }, [todaySessions]);

  const filteredSessions = useMemo(() => {
    if (!selectedLocationFilter) return todaySessions;
    return todaySessions.filter(s => {
      const id = s.locationId || s.locationName || s.locationAddress;
      return id === selectedLocationFilter;
    });
  }, [todaySessions, selectedLocationFilter]);

  const quickStats: QuickStat[] = [
    { label: "Sessions Today", value: todaySessions.length, icon: "calendar-outline", color: Colors.dark.xpCyan },
    { label: "Players", value: new Set(todaySessions.map(s => s.playerId)).size, icon: "people-outline", color: Colors.dark.primary },
    { label: "Completed", value: todaySessions.filter(s => s.status === "completed").length, icon: "checkmark-circle-outline", color: Colors.dark.successNeon },
    { label: "In Progress", value: todaySessions.filter(s => s.status === "in_progress").length, icon: "play-circle-outline", color: Colors.dark.orange },
  ];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleSessionPress = (session: TodaySession) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (session.status === "in_progress" || session.sessionPlanId) {
      navigation.navigate("ActiveSession", { 
        sessionId: session.id, 
        planId: session.sessionPlanId 
      });
    } else {
      navigation.navigate("SessionPlan", { sessionId: session.id, playerId: session.playerId });
    }
  };

  const getStatusColor = (status: TodaySession["status"]) => {
    switch (status) {
      case "completed": return Colors.dark.successNeon;
      case "in_progress": return Colors.dark.orange;
      default: return Colors.dark.xpCyan;
    }
  };

  const getStatusIcon = (status: TodaySession["status"]): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case "completed": return "checkmark-circle";
      case "in_progress": return "play-circle";
      default: return "time-outline";
    }
  };

  const formatTime = (time: string) => {
    return time.substring(0, 5);
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
        <ThemedText style={styles.greeting}>Good Morning, Coach</ThemedText>
        <ThemedText style={styles.date}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</ThemedText>
      </View>

      <View style={styles.statsGrid}>
        {quickStats.map((stat, index) => (
          <Card key={index} style={styles.statCard}>
            <Ionicons name={stat.icon} size={24} color={stat.color} />
            <ThemedText style={[styles.statValue, { color: stat.color }]}>{stat.value}</ThemedText>
            <ThemedText style={styles.statLabel}>{stat.label}</ThemedText>
          </Card>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>Today's Sessions</ThemedText>
        <Pressable 
          onPress={() => navigation.navigate("AllSessions")}
          style={styles.viewAllButton}
        >
          <ThemedText style={styles.viewAllText}>View All</ThemedText>
          <Ionicons name="chevron-forward" size={16} color={Colors.dark.primary} />
        </Pressable>
      </View>

      {sessionLocations.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.locationFilterScroll}
        >
          <Pressable
            style={[styles.locationFilterChip, selectedLocationFilter === null && styles.locationFilterChipActive]}
            onPress={() => setSelectedLocationFilter(null)}
          >
            <ThemedText style={[styles.locationFilterChipText, selectedLocationFilter === null && styles.locationFilterChipTextActive]}>All</ThemedText>
          </Pressable>
          {sessionLocations.map((loc) => (
            <Pressable
              key={loc.id}
              style={[styles.locationFilterChip, selectedLocationFilter === loc.id && styles.locationFilterChipActive]}
              onPress={() => setSelectedLocationFilter(selectedLocationFilter === loc.id ? null : loc.id)}
            >
              <Ionicons name="location-outline" size={12} color={selectedLocationFilter === loc.id ? Colors.dark.primary : Colors.dark.disabled} />
              <ThemedText style={[styles.locationFilterChipText, selectedLocationFilter === loc.id && styles.locationFilterChipTextActive]} numberOfLines={1}>{loc.name}</ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {filteredSessions.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={48} color={Colors.dark.disabled} />
          <ThemedText style={styles.emptyText}>{selectedLocationFilter ? "No sessions at this location today" : "No sessions scheduled for today"}</ThemedText>
          {selectedLocationFilter ? null : (
            <Pressable style={styles.addButton}>
              <Ionicons name="add" size={20} color={Colors.dark.text} />
              <ThemedText style={styles.addButtonText}>Schedule Session</ThemedText>
            </Pressable>
          )}
        </Card>
      ) : (
        filteredSessions.map((session) => (
          <Card 
            key={session.id} 
            style={styles.sessionCard}
            onPress={() => handleSessionPress(session)}
          >
            <View style={styles.sessionHeader}>
              <View style={styles.sessionInfo}>
                <View style={styles.playerRow}>
                  <BallLevelBadge levelId={session.playerLevel} sport={session.sport} size="small" showLabel={false} />
                  <View style={styles.playerInfo}>
                    <ThemedText style={styles.playerName}>{session.playerName}</ThemedText>
                    <ThemedText style={styles.sessionType}>{session.type}</ThemedText>
                  </View>
                </View>
              </View>
              <View style={styles.sessionStatus}>
                <Ionicons name={getStatusIcon(session.status)} size={24} color={getStatusColor(session.status)} />
              </View>
            </View>

            <View style={styles.sessionMeta}>
              <View style={styles.timeBlock}>
                <Ionicons name="time-outline" size={14} color={Colors.dark.text} style={{ opacity: 0.6 }} />
                <ThemedText style={styles.timeText}>
                  {formatTime(session.startTime)} - {formatTime(session.endTime)}
                </ThemedText>
              </View>
              {(session.locationName || session.locationAddress) ? (
                <View style={styles.timeBlock}>
                  <Ionicons name="location-outline" size={14} color={Colors.dark.text} style={{ opacity: 0.6 }} />
                  <ThemedText style={[styles.timeText, { opacity: 0.8 }]}>
                    {session.locationAddress || session.locationName}
                  </ThemedText>
                </View>
              ) : null}
              
              {session.status === "scheduled" ? (
                <View style={[styles.actionButton, { backgroundColor: Colors.dark.primary + "20" }]}>
                  <Ionicons name="flash-outline" size={14} color={Colors.dark.primary} />
                  <ThemedText style={[styles.actionText, { color: Colors.dark.primary }]}>Generate Plan</ThemedText>
                </View>
              ) : session.status === "in_progress" ? (
                <View style={[styles.actionButton, { backgroundColor: Colors.dark.orange + "20" }]}>
                  <Ionicons name="play" size={14} color={Colors.dark.orange} />
                  <ThemedText style={[styles.actionText, { color: Colors.dark.orange }]}>Continue</ThemedText>
                </View>
              ) : (
                <View style={[styles.actionButton, { backgroundColor: Colors.dark.successNeon + "20" }]}>
                  <Ionicons name="document-text-outline" size={14} color={Colors.dark.successNeon} />
                  <ThemedText style={[styles.actionText, { color: Colors.dark.successNeon }]}>View Report</ThemedText>
                </View>
              )}
            </View>
          </Card>
        ))
      )}

      <RosterInsightsCard />

      <View style={styles.quickActions}>
        <ThemedText style={styles.sectionTitle}>Quick Actions</ThemedText>
        <View style={styles.actionsRow}>
          <Pressable 
            style={styles.quickActionCard}
            onPress={() => navigation.navigate("LevelCards")}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.dark.ballRed + "20" }]}>
              <Ionicons name="layers-outline" size={24} color={Colors.dark.ballRed} />
            </View>
            <ThemedText style={styles.actionLabel}>Level Cards</ThemedText>
          </Pressable>

          <Pressable 
            style={styles.quickActionCard}
            onPress={() => navigation.navigate("MatchLogging")}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
              <Ionicons name="trophy-outline" size={24} color={Colors.dark.xpCyan} />
            </View>
            <ThemedText style={styles.actionLabel}>Log Match</ThemedText>
          </Pressable>

          <Pressable 
            style={styles.quickActionCard}
            onPress={() => navigation.navigate("EvidenceCapture")}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.dark.primary + "20" }]}>
              <Ionicons name="videocam-outline" size={24} color={Colors.dark.primary} />
            </View>
            <ThemedText style={styles.actionLabel}>Capture Evidence</ThemedText>
          </Pressable>

          <Pressable 
            style={styles.quickActionCard}
            onPress={() => navigation.navigate("LessonTemplateLibrary")}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.dark.orange + "20" }]}>
              <Ionicons name="book-outline" size={24} color={Colors.dark.orange} />
            </View>
            <ThemedText style={styles.actionLabel}>Lesson Templates</ThemedText>
          </Pressable>

          <Pressable 
            style={styles.quickActionCard}
            onPress={() => navigation.navigate("PlayerProgress")}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.dark.gold + "20" }]}>
              <Ionicons name="trending-up-outline" size={24} color={Colors.dark.gold} />
            </View>
            <ThemedText style={styles.actionLabel}>Progress</ThemedText>
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
  locationFilterScroll: {
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
    flexDirection: "row",
  },
  locationFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: "transparent",
  },
  locationFilterChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "20",
  },
  locationFilterChipText: {
    fontSize: 12,
    color: Colors.dark.disabled,
  },
  locationFilterChipTextActive: {
    color: Colors.dark.primary,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  date: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: Spacing.xs,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
    color: Colors.dark.text,
    opacity: 0.6,
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  viewAllText: {
    fontSize: 14,
    color: Colors.dark.primary,
  },
  sessionCard: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  sessionInfo: {
    flex: 1,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  sessionType: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  sessionStatus: {
    marginLeft: Spacing.md,
  },
  sessionMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timeBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  timeText: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "600",
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
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  quickActions: {
    marginTop: Spacing.xl,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  quickActionCard: {
    flex: 1,
    minWidth: "45%",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    gap: Spacing.sm,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 12,
    color: Colors.dark.text,
    textAlign: "center",
  },
});
