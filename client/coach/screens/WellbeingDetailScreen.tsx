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
import { Colors, Typography, Spacing } from "@/constants/theme";
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

const WELLBEING_TIPS = [
  {
    icon: "bed-outline" as const,
    title: "Prioritize Rest Days",
    description: "Schedule at least 1-2 complete rest days per week to allow physical and mental recovery.",
  },
  {
    icon: "water-outline" as const,
    title: "Stay Hydrated",
    description: "Drink water throughout your coaching sessions. Dehydration affects energy and focus.",
  },
  {
    icon: "moon-outline" as const,
    title: "Quality Sleep",
    description: "Aim for 7-8 hours of sleep. Good rest improves decision-making and patience.",
  },
  {
    icon: "walk-outline" as const,
    title: "Active Recovery",
    description: "Light movement on rest days helps circulation without adding strain.",
  },
  {
    icon: "happy-outline" as const,
    title: "Mental Breaks",
    description: "Take short breaks between sessions to reset mentally and maintain enthusiasm.",
  },
];

export default function WellbeingDetailScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { coach } = useCoach();

  const { data, isLoading } = useQuery<BurnoutRiskData>({
    queryKey: ["/api/coaches", coach?.id, "burnout-risk"],
    enabled: !!coach?.id,
    staleTime: 5 * 60 * 1000,
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

  const getRiskGradient = (level: string): [string, string] => {
    switch (level) {
      case "critical":
        return [Colors.dark.error + "30", Colors.dark.error + "05"];
      case "high":
        return [Colors.dark.orange + "30", Colors.dark.orange + "05"];
      case "moderate":
        return [Colors.dark.gold + "30", Colors.dark.gold + "05"];
      default:
        return [Colors.dark.primary + "30", Colors.dark.primary + "05"];
    }
  };

  const getRiskDescription = (level: string) => {
    switch (level) {
      case "critical":
        return "Your workload is at a critical level. Immediate action recommended to prevent burnout.";
      case "high":
        return "Your workload is high. Consider reducing sessions or taking more breaks.";
      case "moderate":
        return "Your workload is moderate. Monitor your energy levels and schedule rest days.";
      default:
        return "Your workload is healthy. Keep maintaining this balance!";
    }
  };

  const formatMinutesToHours = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  if (isLoading || !data) {
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
          <Text style={styles.headerTitle}>Wellbeing</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Analyzing your wellbeing...</Text>
        </View>
      </View>
    );
  }

  const riskColor = getRiskColor(data.riskLevel);

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
        <Text style={styles.headerTitle}>Wellbeing</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={getRiskGradient(data.riskLevel)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.riskCard}
        >
          <View style={styles.riskHeader}>
            <View style={styles.riskScoreContainer}>
              <Text style={[styles.riskScore, { color: riskColor }]}>{data.riskScore}</Text>
              <Text style={styles.riskLabel}>Risk Score</Text>
            </View>
            <View style={[styles.riskBadge, { backgroundColor: riskColor + "20" }]}>
              <Ionicons
                name={data.riskLevel === "critical" ? "warning" : data.riskLevel === "high" ? "alert-circle" : "information-circle"}
                size={18}
                color={riskColor}
              />
              <Text style={[styles.riskBadgeText, { color: riskColor }]}>
                {data.riskLevel.charAt(0).toUpperCase() + data.riskLevel.slice(1)}
              </Text>
            </View>
          </View>
          <Text style={styles.riskDescription}>{getRiskDescription(data.riskLevel)}</Text>
        </LinearGradient>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Workload Metrics</Text>
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Ionicons name="time-outline" size={24} color={Colors.dark.primary} />
              <Text style={styles.metricValue}>
                {formatMinutesToHours(data.metrics.avgDailyMinutesPast)}
              </Text>
              <Text style={styles.metricLabel}>Avg Daily (Past 14d)</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="calendar-outline" size={24} color={Colors.dark.cyan} />
              <Text style={styles.metricValue}>
                {formatMinutesToHours(data.metrics.avgDailyMinutesFuture)}
              </Text>
              <Text style={styles.metricLabel}>Avg Daily (Next 7d)</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="bed-outline" size={24} color={Colors.dark.gold} />
              <Text style={styles.metricValue}>{data.metrics.restDaysLastWeek}/7</Text>
              <Text style={styles.metricLabel}>Rest Days</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="flame-outline" size={24} color={Colors.dark.orange} />
              <Text style={styles.metricValue}>{data.metrics.consecutiveHeavyDays}d</Text>
              <Text style={styles.metricLabel}>Heavy Streak</Text>
            </View>
          </View>

          <View style={styles.totalRow}>
            <View style={styles.totalItem}>
              <Text style={styles.totalLabel}>Total Past 14 Days</Text>
              <Text style={styles.totalValue}>
                {formatMinutesToHours(data.metrics.totalMinutesPast14Days)}
              </Text>
            </View>
            <View style={styles.totalDivider} />
            <View style={styles.totalItem}>
              <Text style={styles.totalLabel}>Scheduled Next 7 Days</Text>
              <Text style={styles.totalValue}>
                {formatMinutesToHours(data.metrics.scheduledMinutesNext7Days)}
              </Text>
            </View>
          </View>
        </View>

        {data.recommendations.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recommendations</Text>
            {data.recommendations.map((rec, index) => (
              <View key={index} style={styles.recommendationCard}>
                <View style={[styles.recommendationIcon, { backgroundColor: riskColor + "20" }]}>
                  <Ionicons name="bulb" size={18} color={riskColor} />
                </View>
                <Text style={styles.recommendationText}>{rec}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wellbeing Tips</Text>
          {WELLBEING_TIPS.map((tip, index) => (
            <View key={index} style={styles.tipCard}>
              <View style={styles.tipIcon}>
                <Ionicons name={tip.icon} size={22} color={Colors.dark.primary} />
              </View>
              <View style={styles.tipContent}>
                <Text style={styles.tipTitle}>{tip.title}</Text>
                <Text style={styles.tipDescription}>{tip.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...Typography.heading,
    color: Colors.dark.text,
    fontSize: 18,
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.lg,
  },
  riskCard: {
    borderRadius: 16,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  riskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  riskScoreContainer: {
    alignItems: "center",
  },
  riskScore: {
    fontSize: 48,
    fontWeight: "700",
  },
  riskLabel: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    marginTop: -4,
  },
  riskBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 12,
  },
  riskBadgeText: {
    ...Typography.body,
    fontWeight: "600",
  },
  riskDescription: {
    ...Typography.body,
    color: Colors.dark.text,
    lineHeight: 22,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  metricCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.xs,
  },
  metricValue: {
    ...Typography.heading,
    color: Colors.dark.text,
    fontSize: 20,
  },
  metricLabel: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
  },
  totalRow: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    padding: Spacing.md,
  },
  totalItem: {
    flex: 1,
    alignItems: "center",
  },
  totalDivider: {
    width: 1,
    backgroundColor: Colors.dark.backgroundTertiary,
    marginHorizontal: Spacing.md,
  },
  totalLabel: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    marginBottom: 4,
  },
  totalValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  recommendationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  recommendationIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  recommendationText: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
    lineHeight: 22,
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  tipContent: {
    flex: 1,
    gap: 4,
  },
  tipTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  tipDescription: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    lineHeight: 18,
  },
});
