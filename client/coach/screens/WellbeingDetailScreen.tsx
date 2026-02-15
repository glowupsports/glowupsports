import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Spacing } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";

interface BurnoutRiskData {
  riskScore: number;
  riskLevel: "low" | "moderate" | "high" | "critical";
  metrics: {
    avgDailyMinutesPast: number;
    avgDailyMinutesFuture: number;
    consecutiveHeavyDays: number;
    restDaysLastWeek: number;
    totalMinutesPast14Days: number;
    scheduledMinutesNext7Days: number;
  };
  recommendations: string[];
}

interface WellnessLog {
  id: string;
  date: string;
  sleepHours: string | null;
  sleepQuality: string | null;
  nutritionScore: number | null;
  energyLevel: number | null;
  moodLevel: number | null;
  stressLevel: number | null;
  hydrationLevel: string | null;
}

interface WellnessData {
  logs: WellnessLog[];
  summary: {
    totalEntries: number;
    avgSleep: number | null;
    avgEnergy: number | null;
    avgMood: number | null;
  };
}

export default function WellbeingDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const { coach } = useCoach();

  const { data: burnoutData, isLoading: burnoutLoading } = useQuery<BurnoutRiskData>({
    queryKey: ["/api/coaches", coach?.id, "burnout-risk"],
    enabled: !!coach?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: wellnessData, isLoading: wellnessLoading } = useQuery<WellnessData>({
    queryKey: ["/api/coaches", coach?.id, "wellness"],
    enabled: !!coach?.id,
    staleTime: 2 * 60 * 1000,
  });

  const getRiskColor = (level: string) => {
    switch (level) {
      case "critical":
        return Colors.dark.error;
      case "high":
        return Colors.dark.orange;
      case "moderate":
        return Colors.dark.gold;
      default:
        return Colors.dark.primary;
    }
  };

  const getRiskDescription = (level: string) => {
    switch (level) {
      case "critical":
        return "CRITICAL WORKLOAD - Immediate action recommended";
      case "high":
        return "HIGH WORKLOAD - Consider reducing sessions";
      case "moderate":
        return "MODERATE WORKLOAD - Monitor energy levels";
      default:
        return "HEALTHY WORKLOAD - Keep this balance";
    }
  };

  const formatMinutesToHours = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const getWellnessColor = (value: number | null, max: number = 5) => {
    if (!value) return Colors.dark.tabIconDefault;
    const ratio = value / max;
    if (ratio >= 0.8) return Colors.dark.primary;
    if (ratio >= 0.6) return Colors.dark.xpCyan;
    if (ratio >= 0.4) return Colors.dark.gold;
    return Colors.dark.orange;
  };

  const getLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split("T")[0]);
    }
    return days;
  };

  const getLogForDate = (date: string) => {
    return wellnessData?.logs.find(log => log.date === date);
  };

  const isLoading = burnoutLoading || wellnessLoading;

  if (isLoading || !burnoutData) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.goBack();
            }}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>WELLBEING</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>ANALYZING WELLBEING...</Text>
        </View>
      </View>
    );
  }

  const riskColor = getRiskColor(burnoutData.riskLevel);
  const last7Days = getLast7Days();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>WELLBEING</Text>
        <Pressable
          style={styles.logButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            navigation.navigate("WellnessLog");
          }}
        >
          <Ionicons name="add" size={18} color={Colors.dark.buttonText} />
          <Text style={styles.logButtonText}>LOG</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.riskCard}>
          <LinearGradient
            colors={[riskColor + "30", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.riskGradient}
          />
          <View style={[styles.riskAccent, { backgroundColor: riskColor }]} />
          
          <View style={styles.riskContent}>
            <View style={styles.riskScoreRow}>
              <View style={styles.riskScoreContainer}>
                <Text style={[styles.riskScore, { color: riskColor }]}>{burnoutData.riskScore}</Text>
                <Text style={styles.riskLabel}>RISK</Text>
              </View>
              
              <View style={styles.riskInfoContainer}>
                <View style={[styles.riskBadge, { backgroundColor: riskColor + "20", borderColor: riskColor + "40" }]}>
                  <View style={[styles.riskDot, { backgroundColor: riskColor }]} />
                  <Text style={[styles.riskBadgeText, { color: riskColor }]}>
                    {burnoutData.riskLevel.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.riskDescription}>{getRiskDescription(burnoutData.riskLevel)}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <LinearGradient
              colors={[Colors.dark.xpCyan + "40", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sectionAccent}
            />
            <Ionicons name="calendar" size={14} color={Colors.dark.xpCyan} />
            <Text style={styles.sectionTitle}>LAST 7 DAYS</Text>
          </View>
          
          <View style={styles.weekGrid}>
            {last7Days.map((date) => {
              const log = getLogForDate(date);
              const dayName = new Date(date).toLocaleDateString("en-US", { weekday: "short" });
              const dayNum = new Date(date).getDate();
              const hasLog = !!log;
              
              return (
                <Pressable
                  key={date}
                  style={[styles.dayCard, hasLog && styles.dayCardLogged]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    navigation.navigate("WellnessLog");
                  }}
                >
                  <Text style={styles.dayName}>{dayName.toUpperCase()}</Text>
                  <Text style={[styles.dayNum, hasLog && { color: Colors.dark.primary }]}>{dayNum}</Text>
                  {hasLog ? (
                    <View style={styles.dayMetrics}>
                      {log.sleepHours && (
                        <View style={styles.dayMetric}>
                          <Ionicons name="moon" size={10} color={Colors.dark.xpCyan} />
                          <Text style={styles.dayMetricText}>{parseFloat(log.sleepHours)}h</Text>
                        </View>
                      )}
                      {log.energyLevel && (
                        <View style={styles.dayMetric}>
                          <Ionicons name="flash" size={10} color={getWellnessColor(log.energyLevel)} />
                          <Text style={styles.dayMetricText}>{log.energyLevel}/5</Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.dayEmpty}>
                      <Ionicons name="add-circle-outline" size={16} color={Colors.dark.tabIconDefault} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {wellnessData && wellnessData.summary.totalEntries > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <LinearGradient
                colors={[Colors.dark.primary + "40", "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sectionAccent}
              />
              <Ionicons name="trending-up" size={14} color={Colors.dark.primary} />
              <Text style={styles.sectionTitle}>30-DAY AVERAGES</Text>
            </View>
            
            <View style={styles.averagesRow}>
              <View style={styles.averageCard}>
                <Ionicons name="moon" size={20} color={Colors.dark.xpCyan} />
                <Text style={[styles.averageValue, { color: Colors.dark.xpCyan }]}>
                  {wellnessData.summary.avgSleep || "-"}h
                </Text>
                <Text style={styles.averageLabel}>AVG SLEEP</Text>
              </View>
              
              <View style={styles.averageCard}>
                <Ionicons name="flash" size={20} color={Colors.dark.primary} />
                <Text style={[styles.averageValue, { color: Colors.dark.primary }]}>
                  {wellnessData.summary.avgEnergy || "-"}/5
                </Text>
                <Text style={styles.averageLabel}>AVG ENERGY</Text>
              </View>
              
              <View style={styles.averageCard}>
                <Ionicons name="happy" size={20} color={Colors.dark.gold} />
                <Text style={[styles.averageValue, { color: Colors.dark.gold }]}>
                  {wellnessData.summary.avgMood || "-"}/5
                </Text>
                <Text style={styles.averageLabel}>AVG MOOD</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <LinearGradient
              colors={[Colors.dark.gold + "40", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sectionAccent}
            />
            <Ionicons name="stats-chart" size={14} color={Colors.dark.gold} />
            <Text style={styles.sectionTitle}>WORKLOAD METRICS</Text>
          </View>
          
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Ionicons name="time-outline" size={20} color={Colors.dark.primary} />
              <Text style={[styles.metricValue, { color: Colors.dark.primary }]}>
                {formatMinutesToHours(burnoutData.metrics.avgDailyMinutesPast)}
              </Text>
              <Text style={styles.metricLabel}>AVG DAILY</Text>
              <Text style={styles.metricSub}>Past 14 Days</Text>
            </View>
            
            <View style={styles.metricCard}>
              <Ionicons name="calendar-outline" size={20} color={Colors.dark.xpCyan} />
              <Text style={[styles.metricValue, { color: Colors.dark.xpCyan }]}>
                {formatMinutesToHours(burnoutData.metrics.avgDailyMinutesFuture)}
              </Text>
              <Text style={styles.metricLabel}>AVG DAILY</Text>
              <Text style={styles.metricSub}>Next 7 Days</Text>
            </View>
            
            <View style={styles.metricCard}>
              <Ionicons name="bed-outline" size={20} color={Colors.dark.gold} />
              <Text style={[styles.metricValue, { color: Colors.dark.gold }]}>
                {burnoutData.metrics.restDaysLastWeek}/7
              </Text>
              <Text style={styles.metricLabel}>REST DAYS</Text>
              <Text style={styles.metricSub}>Last Week</Text>
            </View>
            
            <View style={styles.metricCard}>
              <Ionicons name="flame-outline" size={20} color={Colors.dark.orange} />
              <Text style={[styles.metricValue, { color: Colors.dark.orange }]}>
                {burnoutData.metrics.consecutiveHeavyDays}d
              </Text>
              <Text style={styles.metricLabel}>HEAVY STREAK</Text>
              <Text style={styles.metricSub}>Consecutive</Text>
            </View>
          </View>
        </View>

        {burnoutData.recommendations.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <LinearGradient
                colors={[riskColor + "40", "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sectionAccent}
              />
              <Ionicons name="bulb" size={14} color={riskColor} />
              <Text style={styles.sectionTitle}>RECOMMENDATIONS</Text>
            </View>
            
            {burnoutData.recommendations.map((rec, index) => (
              <View key={index} style={styles.recommendationCard}>
                <View style={[styles.recommendationIcon, { backgroundColor: riskColor + "15" }]}>
                  <Ionicons name="alert-circle" size={16} color={riskColor} />
                </View>
                <Text style={styles.recommendationText}>{rec}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 1.5,
  },
  headerSpacer: {
    width: 70,
  },
  logButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.buttonText,
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.lg,
  },
  riskCard: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  riskGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  riskAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  riskContent: {
    padding: Spacing.lg,
  },
  riskScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  riskScoreContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  riskScore: {
    fontSize: 32,
    fontWeight: "800",
  },
  riskLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 1,
    marginTop: -2,
  },
  riskInfoContainer: {
    flex: 1,
    gap: Spacing.xs,
  },
  riskBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  riskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  riskBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  riskDescription: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    lineHeight: 18,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
    overflow: "hidden",
  },
  sectionAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 60,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 1.5,
  },
  weekGrid: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  dayCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 10,
    padding: Spacing.sm,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  dayCardLogged: {
    borderColor: Colors.dark.primary + "40",
  },
  dayName: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 0.5,
  },
  dayNum: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  dayMetrics: {
    gap: 2,
    alignItems: "center",
  },
  dayMetric: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  dayMetricText: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
  },
  dayEmpty: {
    paddingTop: 4,
  },
  averagesRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  averageCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    padding: Spacing.md,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  averageValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  averageLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 0.5,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  metricCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    padding: Spacing.md,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "800",
    marginTop: 4,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 1,
  },
  metricSub: {
    fontSize: 9,
    color: Colors.dark.tabIconDefault,
    opacity: 0.7,
  },
  recommendationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  recommendationIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  recommendationText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.text,
    lineHeight: 20,
  },
});
