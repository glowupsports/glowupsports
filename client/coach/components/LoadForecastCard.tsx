import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Spacing } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";

interface ForecastDay {
  date: string;
  scheduledMinutes: number;
  scheduledSessions: number;
  predictedLoad: "light" | "moderate" | "heavy" | "overload";
  burnoutRisk: number;
}

interface ForecastData {
  forecast: ForecastDay[];
}

interface Props {
  onDayPress?: (date: string) => void;
}

export function LoadForecastCard({ onDayPress }: Props) {
  const { coach } = useCoach();

  const { data, isLoading } = useQuery<ForecastData>({
    queryKey: ["/api/coaches", coach?.id, "load-forecast"],
    enabled: !!coach?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingCard}>
          <Text style={styles.loadingText}>Loading forecast...</Text>
        </View>
      </View>
    );
  }

  const getLoadColor = (load: string) => {
    switch (load) {
      case "overload":
        return Colors.dark.error;
      case "heavy":
        return Colors.dark.orange;
      case "moderate":
        return Colors.dark.gold;
      default:
        return Colors.dark.primary;
    }
  };

  const getDayName = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diff = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diff === 0) return "Today";
    if (diff === 1) return "Tmrw";
    
    return date.toLocaleDateString("en-US", { weekday: "short" });
  };

  const formatHours = (minutes: number) => {
    if (minutes === 0) return "-";
    const hours = minutes / 60;
    if (hours < 1) return `${minutes}m`;
    return `${Math.round(hours * 10) / 10}h`;
  };

  const maxMinutes = Math.max(...data.forecast.map(d => d.scheduledMinutes), 480);
  
  const firstRiskDayIndex = data.forecast.findIndex(
    d => d.predictedLoad === "heavy" || d.predictedLoad === "overload"
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="trending-up-outline" size={18} color={Colors.dark.xpCyan} />
          <Text style={styles.title}>Load Forecast</Text>
        </View>
        <Text style={styles.subtitle}>Next 14 days</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {data.forecast.map((day, idx) => {
          const barHeight = day.scheduledMinutes > 0 
            ? Math.max(8, (day.scheduledMinutes / maxMinutes) * 60)
            : 4;
          const loadColor = getLoadColor(day.predictedLoad);
          const isToday = idx === 0;
          const isWeekend = [0, 6].includes(new Date(day.date).getDay());
          const isFirstRiskDay = idx === firstRiskDayIndex && firstRiskDayIndex >= 0;
          const isHeavyOrOverload = day.predictedLoad === "heavy" || day.predictedLoad === "overload";

          return (
            <Pressable
              key={day.date}
              style={[
                styles.dayColumn, 
                isToday && styles.dayColumnToday,
                isFirstRiskDay && styles.dayColumnRisk,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onDayPress?.(day.date);
              }}
            >
              {isFirstRiskDay ? (
                <View style={styles.riskBadge}>
                  <Ionicons name="warning" size={10} color={Colors.dark.error} />
                </View>
              ) : null}
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: barHeight,
                      backgroundColor: day.scheduledMinutes > 0 ? loadColor : Colors.dark.backgroundTertiary,
                      opacity: isHeavyOrOverload ? 1 : 0.7,
                    },
                    isHeavyOrOverload && {
                      shadowColor: loadColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.5,
                      shadowRadius: 4,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.hoursText, { color: loadColor, fontWeight: isHeavyOrOverload ? "700" : "500" }]}>
                {formatHours(day.scheduledMinutes)}
              </Text>
              <Text style={[styles.dayName, isWeekend && styles.weekendText]}>
                {getDayName(day.date)}
              </Text>
              <Text style={styles.dayDate}>{new Date(day.date).getDate()}</Text>
              {day.scheduledSessions > 0 ? (
                <View style={[styles.sessionDot, { backgroundColor: loadColor + "40" }]}>
                  <Text style={[styles.sessionCount, { color: loadColor }]}>
                    {day.scheduledSessions}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.dark.primary }]} />
          <Text style={styles.legendText}>Light</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.dark.gold }]} />
          <Text style={styles.legendText}>Moderate</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.dark.orange }]} />
          <Text style={styles.legendText}>Heavy</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.dark.error }]} />
          <Text style={styles.legendText}>Overload</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 16,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  loadingCard: {
    alignItems: "center",
    padding: Spacing.lg,
  },
  loadingText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  subtitle: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  scrollView: {
    marginHorizontal: -Spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: Spacing.sm,
    gap: 2,
  },
  dayColumn: {
    width: 44,
    alignItems: "center",
    paddingVertical: Spacing.xs,
    borderRadius: 8,
    position: "relative",
  },
  dayColumnToday: {
    backgroundColor: Colors.dark.primary + "15",
  },
  dayColumnRisk: {
    backgroundColor: Colors.dark.error + "15",
    borderWidth: 1,
    borderColor: Colors.dark.error + "30",
  },
  riskBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.dark.error + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  barContainer: {
    height: 64,
    width: 16,
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  bar: {
    width: 12,
    borderRadius: 4,
    minHeight: 4,
  },
  hoursText: {
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 2,
  },
  dayName: {
    ...Typography.small,
    color: Colors.dark.text,
    fontSize: 10,
    fontWeight: "500",
  },
  weekendText: {
    color: Colors.dark.tabIconDefault,
  },
  dayDate: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    fontSize: 10,
  },
  sessionDot: {
    marginTop: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  sessionCount: {
    fontSize: 10,
    fontWeight: "700",
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.lg,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    fontSize: 10,
  },
});
