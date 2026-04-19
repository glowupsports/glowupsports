import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface LessonSummary {
  scheduled: number;
  attended: number;
  missed: number;
  cancelled: number;
  makeUps: number;
}

type RouteParams = {
  ParentLessons: { playerId: string };
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function ParentLessonsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, "ParentLessons">>();
  const { playerId } = route.params;

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = React.useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = React.useState(now.getFullYear());

  const { data, isLoading } = useQuery<{ summary: LessonSummary }>({
    queryKey: ["/api/parent/lessons", playerId, selectedMonth, selectedYear],
    queryFn: async () => {
      const url = new URL(`/api/parent/lessons/${playerId}`, getApiUrl());
      url.searchParams.set("month", String(selectedMonth));
      url.searchParams.set("year", String(selectedYear));
      const response = await fetch(url.toString(), { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch lessons");
      return response.json();
    },
    enabled: !!playerId,
  });

  const summary = data?.summary || { scheduled: 0, attended: 0, missed: 0, cancelled: 0, makeUps: 0 };

  const goToPreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear();

  const attendanceRate = summary.scheduled > 0 
    ? Math.round((summary.attended / summary.scheduled) * 100) 
    : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable 
          onPress={() => navigation.goBack()} 
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
          android_ripple={{ color: 'rgba(255, 255, 255, 0.2)' }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Lesson Overview</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.monthSelector}>
        <Pressable 
          onPress={goToPreviousMonth} 
          style={({ pressed }) => [styles.monthButton, pressed && styles.buttonPressed]}
          android_ripple={{ color: 'rgba(255, 255, 255, 0.2)' }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.monthDisplay}>
          <Text style={styles.monthText}>{MONTHS[selectedMonth - 1]}</Text>
          <Text style={styles.yearText}>{selectedYear}</Text>
        </View>
        <Pressable 
          onPress={goToNextMonth} 
          style={({ pressed }) => [styles.monthButton, isCurrentMonth && styles.monthButtonDisabled, pressed && !isCurrentMonth && styles.buttonPressed]}
          disabled={isCurrentMonth}
          android_ripple={{ color: 'rgba(255, 255, 255, 0.2)' }}
        >
          <Ionicons 
            name="chevron-forward" 
            size={24} 
            color={isCurrentMonth ? Colors.dark.textMuted : Colors.dark.text} 
          />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.text} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.attendanceCard}>
            <Text style={styles.cardTitle}>Attendance Rate</Text>
            <View style={styles.rateContainer}>
              <Text style={[styles.rateValue, { color: attendanceRate >= 80 ? "#22C55E" : attendanceRate >= 50 ? "#FBBF24" : "#EF4444" }]}>
                {attendanceRate}%
              </Text>
              <View style={styles.rateBarContainer}>
                <View 
                  style={[
                    styles.rateBar, 
                    { 
                      width: `${attendanceRate}%`,
                      backgroundColor: attendanceRate >= 80 ? "#22C55E" : attendanceRate >= 50 ? "#FBBF24" : "#EF4444"
                    }
                  ]} 
                />
              </View>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: "rgba(59, 130, 246, 0.15)" }]}>
                <Ionicons name="calendar-outline" size={24} color="#3B82F6" />
              </View>
              <Text style={styles.statValue}>{summary.scheduled}</Text>
              <Text style={styles.statLabel}>Scheduled</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: "rgba(34, 197, 94, 0.15)" }]}>
                <Ionicons name="checkmark-circle-outline" size={24} color="#22C55E" />
              </View>
              <Text style={[styles.statValue, { color: "#22C55E" }]}>{summary.attended}</Text>
              <Text style={styles.statLabel}>Attended</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: "rgba(239, 68, 68, 0.15)" }]}>
                <Ionicons name="close-circle-outline" size={24} color="#EF4444" />
              </View>
              <Text style={[styles.statValue, { color: "#EF4444" }]}>{summary.missed}</Text>
              <Text style={styles.statLabel}>Missed</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                <Ionicons name="ban-outline" size={24} color="#F59E0B" />
              </View>
              <Text style={[styles.statValue, { color: "#F59E0B" }]}>{summary.cancelled}</Text>
              <Text style={styles.statLabel}>Cancelled</Text>
            </View>
          </View>

          {summary.makeUps > 0 ? (
            <View style={styles.makeUpCard}>
              <Ionicons name="refresh-outline" size={20} color="#8B5CF6" />
              <Text style={styles.makeUpText}>
                {summary.makeUps} make-up {summary.makeUps === 1 ? "lesson" : "lessons"} available
              </Text>
            </View>
          ) : null}

          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.dark.textMuted} />
            <Text style={styles.infoText}>
              This overview shows lesson attendance for the selected month. 
              Cancelled lessons by the coach do not count against your attendance rate.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  monthButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Backgrounds.card,
    justifyContent: "center",
    alignItems: "center",
  },
  monthButtonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.7,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  monthDisplay: {
    alignItems: "center",
  },
  monthText: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  yearText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  attendanceCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    ...Typography.subtitle,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  rateContainer: {
    gap: Spacing.sm,
  },
  rateValue: {
    ...Typography.h1,
    textAlign: "center",
  },
  rateBarContainer: {
    height: 8,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 4,
    overflow: "hidden",
  },
  rateBar: {
    height: "100%",
    borderRadius: 4,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    width: "48%",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: "center",
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  statValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  makeUpCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  makeUpText: {
    ...Typography.body,
    color: "#8B5CF6",
    flex: 1,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  infoText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    flex: 1,
    lineHeight: 18,
  },
}));
