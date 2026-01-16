import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Spacing, Backgrounds, GlowColors } from "@/constants/theme";
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
          <Text style={styles.loadingText}>LOADING FORECAST...</Text>
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
    
    if (diff === 0) return "TODAY";
    if (diff === 1) return "TMRW";
    
    return date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
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
      <LinearGradient
        colors={[Colors.dark.xpCyan + "40", "transparent", Colors.dark.primary + "40"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topAccent}
      />
      
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconWrapper}>
            <Ionicons name="pulse" size={14} color={Colors.dark.xpCyan} />
          </View>
          <Text style={styles.title}>LOAD FORECAST</Text>
        </View>
        <View style={styles.subtitleBadge}>
          <Text style={styles.subtitle}>14 DAY</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {data.forecast.map((day, idx) => {
          const barHeight = day.scheduledMinutes > 0 
            ? Math.max(12, (day.scheduledMinutes / maxMinutes) * 56)
            : 6;
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
                  <Ionicons name="alert" size={8} color={Colors.dark.error} />
                </View>
              ) : null}
              
              <View style={styles.barContainer}>
                <View style={styles.barTrack}>
                  <LinearGradient
                    colors={
                      day.scheduledMinutes > 0 
                        ? [loadColor, loadColor + "80"]
                        : [Colors.dark.backgroundTertiary, Colors.dark.backgroundTertiary]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[
                      styles.bar,
                      { height: barHeight },
                      isHeavyOrOverload && styles.barGlow,
                    ]}
                  />
                </View>
              </View>
              
              <Text style={[styles.hoursText, { color: loadColor }]}>
                {formatHours(day.scheduledMinutes)}
              </Text>
              
              <Text style={[styles.dayName, isToday && styles.dayNameToday, isWeekend && styles.weekendText]}>
                {getDayName(day.date)}
              </Text>
              
              <Text style={styles.dayDate}>{new Date(day.date).getDate()}</Text>
              
              {day.scheduledSessions > 0 ? (
                <View style={[styles.sessionDot, { backgroundColor: loadColor + "30", borderColor: loadColor }]}>
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
          <View style={[styles.legendDot, { backgroundColor: Colors.dark.primary }]}>
            <View style={[styles.legendDotInner, { backgroundColor: Colors.dark.primary }]} />
          </View>
          <Text style={styles.legendText}>LIGHT</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.dark.gold + "40" }]}>
            <View style={[styles.legendDotInner, { backgroundColor: Colors.dark.gold }]} />
          </View>
          <Text style={styles.legendText}>MOD</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.dark.orange + "40" }]}>
            <View style={[styles.legendDotInner, { backgroundColor: Colors.dark.orange }]} />
          </View>
          <Text style={styles.legendText}>HEAVY</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.dark.error + "40" }]}>
            <View style={[styles.legendDotInner, { backgroundColor: Colors.dark.error }]} />
          </View>
          <Text style={styles.legendText}>MAX</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Backgrounds.card,
    borderRadius: 12,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    position: "relative",
    overflow: "hidden",
  },
  topAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  loadingCard: {
    alignItems: "center",
    padding: Spacing.lg,
  },
  loadingText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: Colors.dark.xpCyan,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
    paddingTop: Spacing.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  iconWrapper: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: Colors.dark.xpCyan + "20",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  title: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: Colors.dark.text,
    textTransform: "uppercase",
  },
  subtitleBadge: {
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  subtitle: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    color: Colors.dark.primary,
  },
  scrollView: {
    marginHorizontal: -Spacing.xs,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xs,
    gap: 4,
  },
  dayColumn: {
    width: 46,
    alignItems: "center",
    paddingVertical: Spacing.xs,
    paddingHorizontal: 2,
    borderRadius: 8,
    position: "relative",
    backgroundColor: Backgrounds.elevated + "99",
    borderWidth: 1,
    borderColor: "transparent",
  },
  dayColumnToday: {
    backgroundColor: Colors.dark.primary + "15",
    borderColor: Colors.dark.primary + "40",
  },
  dayColumnRisk: {
    backgroundColor: Colors.dark.error + "15",
    borderColor: Colors.dark.error + "50",
  },
  riskBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.dark.error + "30",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.error + "60",
  },
  barContainer: {
    height: 60,
    width: 20,
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  barTrack: {
    width: 16,
    height: "100%",
    backgroundColor: Backgrounds.surface + "CC",
    borderRadius: 4,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  bar: {
    width: "100%",
    borderRadius: 4,
    minHeight: 6,
  },
  barGlow: {
    shadowColor: Colors.dark.orange,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  hoursText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dayName: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: Colors.dark.textSecondary,
  },
  dayNameToday: {
    color: Colors.dark.primary,
    fontWeight: "800",
  },
  weekendText: {
    color: Colors.dark.tabIconDefault,
  },
  dayDate: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: 1,
  },
  sessionDot: {
    marginTop: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  sessionCount: {
    fontSize: 9,
    fontWeight: "800",
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.xpCyan + "20",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
  },
  legendDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: Colors.dark.textSecondary,
  },
});
