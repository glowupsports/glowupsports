import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import CreateSessionWizard from "@/coach/components/CreateSessionWizard";
interface Coach {
  id: string;
  name: string;
  profilePhotoUrl?: string | null;
  color?: string | null;
}

type ViewType = "day" | "week" | "month";

interface CourtSession {
  time: string;
  coach: string;
  status: "booked" | "available" | "conflict";
}

interface CourtSchedule {
  name: string;
  sessions: CourtSession[];
}

interface OperationsData {
  courts: CourtSchedule[];
  insights: {
    peakHours: string;
    utilization: number;
    conflicts: number;
  };
}

interface CourtRowProps {
  name: string;
  sessions: CourtSession[];
}

function CourtRow({ name, sessions }: CourtRowProps) {
  return (
    <View style={styles.courtRow}>
      <View style={styles.courtName}>
        <Text style={styles.courtNameText}>{name}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sessionsScroll}>
        <View style={styles.sessionsRow}>
          {sessions.map((session, index) => (
            <View
              key={index}
              style={[
                styles.sessionSlot,
                session.status === "booked" && styles.sessionBooked,
                session.status === "conflict" && styles.sessionConflict,
              ]}
            >
              <Text style={styles.sessionTime}>{session.time}</Text>
              {session.status === "booked" ? (
                <Text style={styles.sessionCoach}>{session.coach}</Text>
              ) : session.status === "conflict" ? (
                <Ionicons name="warning" size={14} color={Colors.dark.error} />
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

interface InsightCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  color: string;
  trend?: "up" | "down" | "neutral";
}

function InsightCard({ icon, title, value, color, trend }: InsightCardProps) {
  return (
    <View style={[styles.insightCard, CardStyles.elevated]}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={styles.insightValue}>{value}</Text>
      <Text style={styles.insightTitle}>{title}</Text>
      {trend ? (
        <Ionicons
          name={trend === "up" ? "trending-up" : trend === "down" ? "trending-down" : "remove"}
          size={16}
          color={trend === "up" ? Colors.dark.primary : trend === "down" ? Colors.dark.error : Colors.dark.textMuted}
        />
      ) : null}
    </View>
  );
}

export default function OperationsScreen() {
  const insets = useSafeAreaInsets();
  const [viewType, setViewType] = useState<ViewType>("day");
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [selectedCoachId, setSelectedCoachId] = useState<string | undefined>();
  const { data: operationsData, isLoading, isError, refetch } = useQuery<OperationsData>({
    queryKey: [`/api/owner/operations?period=${viewType}`],
  });
  
  const { data: coachesData = [] } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
  });

  const courts = operationsData?.courts || [];
  const insights = operationsData?.insights || {
    peakHours: "N/A",
    utilization: 0,
    conflicts: 0,
  };

  const handleViewChange = (view: ViewType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewType(view);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
        <Text style={styles.loadingText}>Loading operations...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Failed to load operations data</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Operations</Text>
        <Text style={styles.subtitle}>Court usage and scheduling overview</Text>
      </View>

      
        <View style={styles.viewToggle}>
          {(["day", "week", "month"] as ViewType[]).map((view) => (
            <Pressable
              key={view}
              style={[styles.viewButton, viewType === view && styles.viewButtonActive]}
              onPress={() => handleViewChange(view)}
            >
              <Text style={[styles.viewButtonText, viewType === view && styles.viewButtonTextActive]}>
                {view.charAt(0).toUpperCase() + view.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        
          <View style={styles.insightsRow}>
            <InsightCard icon="time" title="Peak Hours" value={insights.peakHours} color={Colors.dark.gold} />
            <InsightCard 
              icon="analytics" 
              title="Utilization" 
              value={`${insights.utilization}%`} 
              color={Colors.dark.primary} 
              trend={insights.utilization > 70 ? "up" : "down"} 
            />
            <InsightCard 
              icon="warning" 
              title="Conflicts" 
              value={String(insights.conflicts)} 
              color={insights.conflicts > 0 ? Colors.dark.error : Colors.dark.primary} 
            />
          </View>
        

        
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Court Allocation</Text>
            <View style={[styles.courtsContainer, CardStyles.elevated]}>
              {courts.map((court, index) => (
                <CourtRow key={index} {...court} />
              ))}
            </View>
          </View>
        

        {courts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No court data available</Text>
          </View>
        ) : null}
      </ScrollView>
      
      
        <Pressable 
          style={[styles.fab, { bottom: insets.bottom + 24 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowCreateSession(true);
          }}
        >
          <LinearGradient
            colors={[Colors.dark.gold, Colors.dark.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <Ionicons name="add" size={28} color={Colors.dark.buttonText} />
          </LinearGradient>
        </Pressable>
      
      
      <CreateSessionWizard
        visible={showCreateSession}
        onClose={() => {
          setShowCreateSession(false);
          setSelectedCoachId(undefined);
        }}
        adminMode={true}
        coaches={coachesData}
        selectedCoachId={selectedCoachId}
        onCoachIdChange={setSelectedCoachId}
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
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.h3,
    color: Colors.dark.error,
    marginTop: Spacing.md,
  },
  retryButton: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.gold,
    borderRadius: BorderRadius.md,
  },
  retryButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  header: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.gold,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  viewToggle: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: 4,
  },
  viewButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    borderRadius: BorderRadius.sm,
  },
  viewButtonActive: {
    backgroundColor: Colors.dark.gold,
  },
  viewButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  viewButtonTextActive: {
    color: Colors.dark.buttonText,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  insightsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  insightCard: {
    flex: 1,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    gap: Spacing.xs,
  },
  insightValue: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  insightTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  courtsContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  courtRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  courtName: {
    width: 80,
    padding: Spacing.md,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: Colors.dark.backgroundRoot,
  },
  courtNameText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sessionsScroll: {
    flex: 1,
  },
  sessionsRow: {
    flexDirection: "row",
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  sessionSlot: {
    width: 60,
    height: 50,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionBooked: {
    backgroundColor: `${Colors.dark.primary}30`,
  },
  sessionConflict: {
    backgroundColor: `${Colors.dark.error}30`,
    borderWidth: 1,
    borderColor: Colors.dark.error,
  },
  sessionTime: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  sessionCoach: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
    fontSize: 11,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
    shadowColor: Colors.dark.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
