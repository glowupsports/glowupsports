import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { convertUTCTimeToLocal } from "@/lib/dateUtils";

interface CoachingSeries {
  id: string;
  title: string;
  dayOfWeek: number;
  startTime: string;
  duration: number;
  sessionType: string;
  status: string;
  seriesStartDate: string;
  seriesEndDate?: string | null;
  weekCount?: number | null;
  maxPlayers?: number | null;
  locationName?: string | null;
  courtName?: string | null;
  playerCount: number;
  sessionsCompleted: number;
  pendingFeedback: number;
}

interface Props {
  series: CoachingSeries;
  onPress: (series: CoachingSeries) => void;
  onEditPress?: (series: CoachingSeries) => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SESSION_TYPE_CONFIG: Record<string, { color: string; icon: string }> = {
  private: { color: Colors.dark.sessionPrivate, icon: "person" },
  semi: { color: Colors.dark.sessionSemiPrivate, icon: "people" },
  group: { color: Colors.dark.sessionGroup, icon: "people-circle" },
  physical: { color: Colors.dark.sessionPhysical, icon: "fitness" },
  activity: { color: Colors.dark.sessionActivity, icon: "game-controller" },
};

export function CoachingSeriesCard({ series, onPress, onEditPress }: Props) {
  const { academy } = useCoach();
  
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(series);
  };

  const handleEditPress = (e: any) => {
    e.stopPropagation();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onEditPress?.(series);
  };

  const typeConfig = SESSION_TYPE_CONFIG[series.sessionType] || SESSION_TYPE_CONFIG.private;
  const dayName = DAY_NAMES[series.dayOfWeek];
  const totalWeeks = series.weekCount || "Open";
  
  // startTime is stored as UTC (HH:MM) in database, convert to local academy time for display
  const localStartTime = useMemo(() => {
    const timezone = academy?.timezone || "Asia/Dubai";
    return convertUTCTimeToLocal(series.startTime, timezone);
  }, [series.startTime, academy?.timezone]);
  
  // Build display title with correct local time (title in DB may have hardcoded UTC time)
  const displayTitle = useMemo(() => {
    const sessionTypeLabels: Record<string, string> = {
      private: "Private Lesson",
      semi: "Semi-Private",
      semi_private: "Semi-Private",
      group: "Group Session",
      physical: "Physical Training",
      activity: "Activity",
      squad: "Squad Training",
      clinic: "Clinic",
      camp: "Camp",
    };
    const typeLabel = sessionTypeLabels[series.sessionType] || series.sessionType || "Training";
    return `${typeLabel} - ${dayName} ${localStartTime}`;
  }, [series.sessionType, dayName, localStartTime]);
  const completedProgress = series.weekCount 
    ? Math.round((series.sessionsCompleted / series.weekCount) * 100) 
    : null;

  const getStatusColor = () => {
    switch (series.status) {
      case "active": return Colors.dark.successNeon;
      case "paused": return Colors.dark.accentWarning;
      case "ended": return Colors.dark.disabled;
      default: return Colors.dark.primary;
    }
  };

  const getStatusIcon = () => {
    switch (series.status) {
      case "active": return "play";
      case "paused": return "pause";
      case "ended": return "checkmark-done";
      default: return "play";
    }
  };

  return (
    <Pressable onPress={handlePress} style={styles.cardContainer}>
      <LinearGradient
        colors={[`${typeConfig.color}15`, `${typeConfig.color}05`, "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardGradient}
      >
        <View style={[styles.topAccent, { backgroundColor: typeConfig.color }]} />
        
        <View style={styles.cardContent}>
          <View style={styles.headerRow}>
            <View style={styles.titleSection}>
              <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor()}20` }]}>
                <Ionicons name={getStatusIcon() as any} size={12} color={getStatusColor()} />
              </View>
              <Text style={styles.seriesTitle} numberOfLines={1}>{displayTitle}</Text>
            </View>
            {onEditPress ? (
              <Pressable onPress={handleEditPress} style={styles.editButton}>
                <Ionicons name="pencil" size={16} color={Colors.dark.disabled} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.scheduleRow}>
            <Ionicons name="time-outline" size={14} color={typeConfig.color} />
            <Text style={styles.scheduleText}>
              {dayName} {localStartTime} - {series.duration}min
            </Text>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="calendar-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={styles.infoText}>
                {new Date(series.seriesStartDate).toLocaleDateString("en-US", { month: "short" })}
                {series.seriesEndDate ? ` → ${new Date(series.seriesEndDate).toLocaleDateString("en-US", { month: "short" })}` : " (ongoing)"}
              </Text>
            </View>
          </View>

          {series.locationName ? (
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Ionicons name="location-outline" size={14} color={Colors.dark.gold} />
                <Text style={styles.infoText}>{series.locationName}</Text>
              </View>
              {series.courtName ? (
                <View style={styles.infoItem}>
                  <Ionicons name="tennisball-outline" size={14} color={Colors.dark.primary} />
                  <Text style={styles.infoText}>{series.courtName}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="people-outline" size={16} color={Colors.dark.primary} />
              <Text style={styles.statValue}>{series.playerCount}</Text>
              <Text style={styles.statLabel}>players</Text>
            </View>
            
            <View style={styles.statDivider} />
            
            <View style={styles.statItem}>
              <Ionicons name="checkmark-circle-outline" size={16} color={Colors.dark.successNeon} />
              <Text style={styles.statValue}>{series.sessionsCompleted}</Text>
              <Text style={styles.statLabel}>/ {totalWeeks}</Text>
            </View>
            
            {series.pendingFeedback > 0 ? (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Ionicons name="alert-circle-outline" size={16} color={Colors.dark.accentWarning} />
                  <Text style={[styles.statValue, { color: Colors.dark.accentWarning }]}>{series.pendingFeedback}</Text>
                  <Text style={styles.statLabel}>pending</Text>
                </View>
              </>
            ) : null}
          </View>

          {completedProgress !== null ? (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${completedProgress}%`, backgroundColor: typeConfig.color }]} />
              </View>
              <Text style={styles.progressText}>{completedProgress}%</Text>
            </View>
          ) : null}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardGradient: {
    borderRadius: BorderRadius.lg,
  },
  topAccent: {
    height: 3,
    width: "100%",
  },
  cardContent: {
    padding: Spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  titleSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: Spacing.sm,
  },
  statusBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  seriesTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    flex: 1,
  },
  editButton: {
    padding: Spacing.xs,
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  scheduleText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  infoText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    marginTop: Spacing.sm,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statDivider: {
    width: 1,
    height: 16,
    backgroundColor: Colors.dark.border,
    marginHorizontal: Spacing.md,
  },
  statValue: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    width: 35,
    textAlign: "right",
  },
});
