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
    description: "Schedule at least 1-2 complete rest days per week for recovery.",
  },
  {
    icon: "water-outline" as const,
    title: "Stay Hydrated",
    description: "Drink water throughout sessions. Dehydration affects energy and focus.",
  },
  {
    icon: "moon-outline" as const,
    title: "Quality Sleep",
    description: "Aim for 7-8 hours of sleep for better decision-making.",
  },
  {
    icon: "walk-outline" as const,
    title: "Active Recovery",
    description: "Light movement on rest days helps circulation without strain.",
  },
  {
    icon: "happy-outline" as const,
    title: "Mental Breaks",
    description: "Take short breaks between sessions to reset mentally.",
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
          <Text style={styles.headerTitle}>WELLBEING</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>ANALYZING WORKLOAD...</Text>
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
        <Text style={styles.headerTitle}>WELLBEING</Text>
        <View style={styles.headerSpacer} />
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
                <Text style={[styles.riskScore, { color: riskColor }]}>{data.riskScore}</Text>
                <Text style={styles.riskLabel}>RISK</Text>
              </View>
              
              <View style={styles.riskInfoContainer}>
                <View style={[styles.riskBadge, { backgroundColor: riskColor + "20", borderColor: riskColor + "40" }]}>
                  <View style={[styles.riskDot, { backgroundColor: riskColor }]} />
                  <Text style={[styles.riskBadgeText, { color: riskColor }]}>
                    {data.riskLevel.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.riskDescription}>{getRiskDescription(data.riskLevel)}</Text>
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
            <Ionicons name="stats-chart" size={14} color={Colors.dark.xpCyan} />
            <Text style={styles.sectionTitle}>WORKLOAD METRICS</Text>
          </View>
          
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Ionicons name="time-outline" size={20} color={Colors.dark.primary} />
              <Text style={[styles.metricValue, { color: Colors.dark.primary }]}>
                {formatMinutesToHours(data.metrics.avgDailyMinutesPast)}
              </Text>
              <Text style={styles.metricLabel}>AVG DAILY</Text>
              <Text style={styles.metricSub}>Past 14 Days</Text>
            </View>
            
            <View style={styles.metricCard}>
              <Ionicons name="calendar-outline" size={20} color={Colors.dark.xpCyan} />
              <Text style={[styles.metricValue, { color: Colors.dark.xpCyan }]}>
                {formatMinutesToHours(data.metrics.avgDailyMinutesFuture)}
              </Text>
              <Text style={styles.metricLabel}>AVG DAILY</Text>
              <Text style={styles.metricSub}>Next 7 Days</Text>
            </View>
            
            <View style={styles.metricCard}>
              <Ionicons name="bed-outline" size={20} color={Colors.dark.gold} />
              <Text style={[styles.metricValue, { color: Colors.dark.gold }]}>
                {data.metrics.restDaysLastWeek}/7
              </Text>
              <Text style={styles.metricLabel}>REST DAYS</Text>
              <Text style={styles.metricSub}>Last Week</Text>
            </View>
            
            <View style={styles.metricCard}>
              <Ionicons name="flame-outline" size={20} color={Colors.dark.orange} />
              <Text style={[styles.metricValue, { color: Colors.dark.orange }]}>
                {data.metrics.consecutiveHeavyDays}d
              </Text>
              <Text style={styles.metricLabel}>HEAVY STREAK</Text>
              <Text style={styles.metricSub}>Consecutive</Text>
            </View>
          </View>

          <View style={styles.totalRow}>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>TOTAL PAST 14 DAYS</Text>
              <Text style={styles.totalValue}>
                {formatMinutesToHours(data.metrics.totalMinutesPast14Days)}
              </Text>
            </View>
            <View style={styles.totalDivider} />
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>SCHEDULED NEXT 7 DAYS</Text>
              <Text style={styles.totalValue}>
                {formatMinutesToHours(data.metrics.scheduledMinutesNext7Days)}
              </Text>
            </View>
          </View>
        </View>

        {data.recommendations.length > 0 ? (
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
            
            {data.recommendations.map((rec, index) => (
              <View key={index} style={styles.recommendationCard}>
                <View style={[styles.recommendationIcon, { backgroundColor: riskColor + "15" }]}>
                  <Ionicons name="alert-circle" size={16} color={riskColor} />
                </View>
                <Text style={styles.recommendationText}>{rec}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <LinearGradient
              colors={[Colors.dark.primary + "40", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sectionAccent}
            />
            <Ionicons name="fitness" size={14} color={Colors.dark.primary} />
            <Text style={styles.sectionTitle}>WELLBEING TIPS</Text>
          </View>
          
          {WELLBEING_TIPS.map((tip, index) => (
            <View key={index} style={styles.tipCard}>
              <View style={styles.tipIcon}>
                <Ionicons name={tip.icon} size={18} color={Colors.dark.primary} />
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
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 1.5,
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
    backgroundColor: Colors.dark.backgroundSecondary,
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
    backgroundColor: Colors.dark.background,
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
  totalRow: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  totalCard: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "center",
  },
  totalDivider: {
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  totalLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  recommendationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.dark.backgroundSecondary,
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
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  tipContent: {
    flex: 1,
    gap: 2,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  tipDescription: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    lineHeight: 18,
  },
});
