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
import { SportBadge } from "@/components/SportBadge";
import { getSportSkillLevelColor, formatSportSkillLevel } from "@shared/sportConfig";

interface PlayerPreview {
  id: string;
  name: string;
  ballLevel?: string | null;
}

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
  playerPreview?: PlayerPreview[];
  primaryBallLevel?: string | null;
  nextSessionDate?: string | null;
  sport?: string | null;
  isPublic?: boolean | null;
}

interface Props {
  series: CoachingSeries;
  onPress: (series: CoachingSeries) => void;
  onEditPress?: (series: CoachingSeries) => void;
  onLongPress?: (series: CoachingSeries) => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SESSION_TYPE_CONFIG: Record<string, { color: string; icon: string }> = {
  private: { color: Colors.dark.sessionPrivate, icon: "person" },
  semi: { color: Colors.dark.sessionSemiPrivate, icon: "people" },
  group: { color: Colors.dark.sessionGroup, icon: "people-circle" },
  physical: { color: Colors.dark.sessionPhysical, icon: "fitness" },
  activity: { color: Colors.dark.sessionActivity, icon: "game-controller" },
};

export function CoachingSeriesCard({ series, onPress, onEditPress, onLongPress }: Props) {
  const { academy } = useCoach();
  
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(series);
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onLongPress?.(series);
  };

  const handleEditPress = (e: any) => {
    e.stopPropagation();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onEditPress?.(series);
  };

  const typeConfig = SESSION_TYPE_CONFIG[series.sessionType] || SESSION_TYPE_CONFIG.private;
  const isFlexible = series.dayOfWeek === -1;
  const dayName = isFlexible ? "Flexible" : DAY_NAMES[series.dayOfWeek];
  const totalWeeks = series.weekCount || "Open";
  
  const localStartTime = useMemo(() => {
    const timezone = academy?.timezone || "Asia/Dubai";
    return convertUTCTimeToLocal(series.startTime, timezone);
  }, [series.startTime, academy?.timezone]);
  
  const displayTitle = useMemo(() => {
    if (isFlexible) {
      return series.title || "Flexible Session";
    }
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
  }, [series.sessionType, dayName, localStartTime, isFlexible, series.title]);
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
  
  const getBallLevelColor = (level?: string | null, sport?: string | null) => {
    if (sport && sport !== "tennis") {
      return getSportSkillLevelColor(sport, level);
    }
    switch (level?.toUpperCase()) {
      case "BLUE": return "#3B82F6";
      case "RED": return "#EF4444";
      case "ORANGE": return "#F97316";
      case "GREEN": return "#22C55E";
      case "YELLOW": return "#EAB308";
      case "ADULT":
      case "GLOW": return "#00E5FF";
      default: return Colors.dark.textMuted;
    }
  };
  
  const ballLevelColor = getBallLevelColor(series.primaryBallLevel, series.sport);
  const ballLevelLabel = series.sport && series.sport !== "tennis"
    ? formatSportSkillLevel(series.sport, series.primaryBallLevel)
    : series.primaryBallLevel;
  const playerPreview = series.playerPreview || [];
  
  const formatNextSession = () => {
    if (!series.nextSessionDate) return null;
    const nextDate = new Date(series.nextSessionDate);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const isToday = nextDate.toDateString() === today.toDateString();
    const isTomorrow = nextDate.toDateString() === tomorrow.toDateString();
    
    if (isToday) return "Today";
    if (isTomorrow) return "Tomorrow";
    return nextDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: academy?.timezone || "Asia/Dubai" });
  };
  
  const nextSessionLabel = formatNextSession();

  return (
    <Pressable onPress={handlePress} onLongPress={onLongPress ? handleLongPress : undefined} style={styles.cardContainer}>
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
            {series.sport && series.sport !== "tennis" ? (
              <SportBadge sport={series.sport} size="sm" />
            ) : null}
            {series.primaryBallLevel ? (
              <View style={[styles.ballLevelBadge, { backgroundColor: ballLevelColor + '20', borderColor: ballLevelColor }]}>
                <View style={[styles.ballLevelDot, { backgroundColor: ballLevelColor }]} />
                <Text style={[styles.ballLevelText, { color: ballLevelColor }]}>
                  {ballLevelLabel}
                </Text>
              </View>
            ) : null}
            {series.isPublic ? (
              <View style={styles.publicBadge}>
                <Ionicons name="globe-outline" size={11} color="#39FF14" />
                <Text style={styles.publicBadgeText}>PUBLIC</Text>
              </View>
            ) : null}
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
            {nextSessionLabel ? (
              <View style={styles.nextSessionBadge}>
                <Ionicons name="calendar" size={10} color={Colors.dark.gold} />
                <Text style={styles.nextSessionText}>{nextSessionLabel}</Text>
              </View>
            ) : null}
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

          <View style={styles.playersRow}>
            <View style={styles.avatarStack}>
              {playerPreview.slice(0, 3).map((player, idx) => (
                <View 
                  key={player.id} 
                  style={[
                    styles.avatarCircle,
                    { marginLeft: idx > 0 ? -10 : 0, zIndex: 3 - idx }
                  ]}
                >
                  <Text style={styles.avatarText}>
                    {player.name?.charAt(0)?.toUpperCase() || "?"}
                  </Text>
                </View>
              ))}
              {series.playerCount > 3 ? (
                <View style={[styles.avatarCircle, styles.avatarMore, { marginLeft: -10 }]}>
                  <Text style={styles.avatarMoreText}>+{series.playerCount - 3}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.playerNames} numberOfLines={1}>
              {playerPreview.length === 0 
                ? "No players yet" 
                : playerPreview.length <= 2 
                  ? playerPreview.map(p => p.name?.split(' ')[0]).join(', ')
                  : `${playerPreview.slice(0, 2).map(p => p.name?.split(' ')[0]).join(', ')} +${series.playerCount - 2}`
              }
            </Text>
          </View>

          <View style={styles.statsRow}>
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
                  <Text style={styles.statLabel}>need feedback</Text>
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
  publicBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#39FF1420",
    borderColor: "#39FF14",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  publicBadgeText: {
    color: "#39FF14",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
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
  ballLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginLeft: Spacing.sm,
  },
  ballLevelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ballLevelText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  nextSessionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: "auto",
  },
  nextSessionText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  playersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  avatarMore: {
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  avatarMoreText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  playerNames: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
});
