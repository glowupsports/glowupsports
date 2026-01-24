import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  interpolate,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import AdminSeriesDetailDrawer from "../components/AdminSeriesDetailDrawer";
import CreateSessionWizard from "@/coach/components/CreateSessionWizard";

const ADMIN_COLOR = Colors.dark.orange;

interface CoachingSeries {
  id: string;
  title: string;
  coachId: string;
  coachName: string;
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
  playerNames?: string[];
  sessionsCompleted: number;
  pendingFeedback: number;
}

interface Coach {
  id: string;
  name: string;
}

type FilterType = "all" | "active" | "paused" | "ended";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_ABBREV = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FLEXIBLE_DAY = -1;

const SESSION_TYPE_COLORS: Record<string, string> = {
  private: Colors.dark.sessionPrivate,
  semi_private: Colors.dark.sessionSemiPrivate,
  group: Colors.dark.sessionGroup,
  camp: Colors.dark.sessionPhysical,
};

interface CollapsibleDaySectionProps {
  dayOfWeek: number;
  series: CoachingSeries[];
  isExpanded: boolean;
  onToggle: () => void;
  onSeriesPress: (series: CoachingSeries) => void;
  isFlexible?: boolean;
}

function CollapsibleDaySection({
  dayOfWeek,
  series,
  isExpanded,
  onToggle,
  onSeriesPress,
  isFlexible = false,
}: CollapsibleDaySectionProps) {
  const rotation = useSharedValue(isExpanded ? 1 : 0);
  const height = useSharedValue(isExpanded ? 1 : 0);

  React.useEffect(() => {
    rotation.value = withTiming(isExpanded ? 1 : 0, { duration: 200 });
    height.value = withTiming(isExpanded ? 1 : 0, { duration: 250 });
  }, [isExpanded]);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [-90, 0])}deg` }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: height.value,
    maxHeight: interpolate(height.value, [0, 1], [0, 5000]),
    overflow: "hidden" as const,
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  };

  const sortedSeries = [...series].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const sectionTitle = isFlexible ? "Flexible Schedule" : DAY_NAMES[dayOfWeek];
  const accentColor = isFlexible ? Colors.dark.cyan : ADMIN_COLOR;

  return (
    <View style={dayStyles.container}>
      <Pressable onPress={handlePress} style={[dayStyles.header, isFlexible && { borderColor: `${accentColor}30` }]}>
        <View style={dayStyles.headerLeft}>
          <Animated.View style={arrowStyle}>
            <Ionicons name="chevron-down" size={20} color={accentColor} />
          </Animated.View>
          <Text style={[dayStyles.dayTitle, isFlexible && { color: accentColor }]}>{sectionTitle}</Text>
        </View>
        <View style={dayStyles.headerRight}>
          <Text style={dayStyles.classCount}>{series.length}</Text>
          <Text style={dayStyles.classLabel}>
            {series.length === 1 ? "class" : "classes"}
          </Text>
        </View>
      </Pressable>

      <Animated.View style={contentStyle}>
        <View style={dayStyles.content}>
          {sortedSeries.map((s) => (
            <SeriesCard key={s.id} series={s} onPress={onSeriesPress} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const dayStyles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${ADMIN_COLOR}30`,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  dayTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  classCount: {
    ...Typography.body,
    fontWeight: "700",
    color: ADMIN_COLOR,
  },
  classLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  content: {
    paddingTop: Spacing.sm,
    paddingLeft: Spacing.md,
  },
});

interface SeriesCardProps {
  series: CoachingSeries;
  onPress: (series: CoachingSeries) => void;
}

function SeriesCard({ series, onPress }: SeriesCardProps) {
  const typeColor = SESSION_TYPE_COLORS[series.sessionType] || Colors.dark.textMuted;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(series);
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayHour = h % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <Pressable
      style={[cardStyles.container, CardStyles.elevated]}
      onPress={handlePress}
    >
      <View style={[cardStyles.typeIndicator, { backgroundColor: typeColor }]} />
      <View style={cardStyles.content}>
        <View style={cardStyles.header}>
          <Text style={cardStyles.title} numberOfLines={1}>
            {series.title}
          </Text>
          <View style={[cardStyles.statusBadge, { backgroundColor: series.status === "active" ? `${Colors.dark.green}30` : `${Colors.dark.textMuted}30` }]}>
            <Text style={[cardStyles.statusText, { color: series.status === "active" ? Colors.dark.green : Colors.dark.textMuted }]}>
              {series.status}
            </Text>
          </View>
        </View>

        <View style={cardStyles.coachRow}>
          <Ionicons name="person-outline" size={14} color={ADMIN_COLOR} />
          <Text style={cardStyles.coachName}>{series.coachName}</Text>
        </View>

        <View style={cardStyles.metaRow}>
          <View style={cardStyles.metaItem}>
            <Ionicons name="time-outline" size={14} color={Colors.dark.textMuted} />
            <Text style={cardStyles.metaText}>
              {DAY_ABBREV[series.dayOfWeek]} {formatTime(series.startTime)}
            </Text>
          </View>
          <View style={cardStyles.metaItem}>
            <Ionicons name="hourglass-outline" size={14} color={Colors.dark.textMuted} />
            <Text style={cardStyles.metaText}>{series.duration}min</Text>
          </View>
          <View style={cardStyles.metaItem}>
            <Ionicons name="people-outline" size={14} color={Colors.dark.textMuted} />
            <Text style={cardStyles.metaText}>{series.playerCount}</Text>
          </View>
        </View>

        {series.playerNames && series.playerNames.length > 0 ? (
          <View style={cardStyles.playerNamesRow}>
            <Text style={cardStyles.playerNamesText} numberOfLines={1}>
              {series.playerNames.join(", ")}{series.playerCount > 4 ? ` +${series.playerCount - 4}` : ""}
            </Text>
          </View>
        ) : null}

        {series.pendingFeedback > 0 ? (
          <View style={cardStyles.feedbackBadge}>
            <Ionicons name="chatbubble-outline" size={12} color={ADMIN_COLOR} />
            <Text style={cardStyles.feedbackText}>{series.pendingFeedback} pending feedback</Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  typeIndicator: {
    width: 4,
    height: "100%",
    borderRadius: 2,
    marginRight: Spacing.md,
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  content: {
    flex: 1,
    paddingLeft: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  title: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginLeft: Spacing.sm,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  coachName: {
    ...Typography.small,
    color: ADMIN_COLOR,
    fontWeight: "500",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  playerNamesRow: {
    marginTop: Spacing.xs,
  },
  playerNamesText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
  },
  feedbackBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.xs,
  },
  feedbackText: {
    ...Typography.caption,
    color: ADMIN_COLOR,
  },
});

export default function AdminClassesScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FilterType>("active");
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [wizardCoachId, setWizardCoachId] = useState<string | null>(null);

  // When a coach is selected, pass coachId to server to include their orphan/transferred sessions
  const seriesEndpoint = selectedCoachId 
    ? `/api/admin/series?coachId=${selectedCoachId}`
    : "/api/admin/series";
    
  const { data: seriesList = [], isLoading } = useQuery<CoachingSeries[]>({
    queryKey: [seriesEndpoint],
  });

  const { data: coaches = [] } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
  });

  // When coachId is passed to server, result is already filtered (including orphan sessions)
  const filteredByCoach = useMemo(() => {
    return seriesList;
  }, [seriesList]);

  const filteredSeries = useMemo(() => {
    if (filter === "all") return filteredByCoach;
    return filteredByCoach.filter((s) => s.status === filter);
  }, [filteredByCoach, filter]);

  const flexibleSeries = useMemo(() => {
    return filteredSeries.filter(s => s.dayOfWeek === FLEXIBLE_DAY);
  }, [filteredSeries]);

  const regularSeries = useMemo(() => {
    return filteredSeries.filter(s => s.dayOfWeek !== FLEXIBLE_DAY);
  }, [filteredSeries]);

  const groupedByDay = useMemo(() => {
    return regularSeries.reduce((acc, series) => {
      const day = series.dayOfWeek;
      if (!acc[day]) acc[day] = [];
      acc[day].push(series);
      return acc;
    }, {} as Record<number, CoachingSeries[]>);
  }, [regularSeries]);

  const sortedDays = Object.keys(groupedByDay).map(Number).sort((a, b) => a - b);

  const toggleDay = (day: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  };

  const handleSeriesPress = (series: CoachingSeries) => {
    setSelectedSeriesId(series.id);
    setShowDetailDrawer(true);
  };

  const handleCloseDrawer = () => {
    setShowDetailDrawer(false);
    setSelectedSeriesId(null);
  };

  const handleCreatePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCreateWizard(true);
  };

  const handleCloseWizard = () => {
    setShowCreateWizard(false);
    setWizardCoachId(null);
  };

  const stats = useMemo(() => {
    const total = filteredByCoach.length;
    const active = filteredByCoach.filter((s) => s.status === "active").length;
    const paused = filteredByCoach.filter((s) => s.status === "paused").length;
    const ended = filteredByCoach.filter((s) => s.status === "ended").length;
    return { total, active, paused, ended };
  }, [filteredByCoach]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={ADMIN_COLOR} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[`${ADMIN_COLOR}15`, "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.header}>
        <Text style={styles.title}>Classes</Text>
        <Pressable style={styles.createButton} onPress={handleCreatePress}>
          <Ionicons name="add" size={24} color={Colors.dark.text} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.coachFilterContainer}
        contentContainerStyle={styles.coachFilterContent}
      >
        <Pressable
          style={[styles.coachChip, !selectedCoachId && styles.coachChipActive]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedCoachId(null);
          }}
        >
          <Text style={[styles.coachChipText, !selectedCoachId && styles.coachChipTextActive]}>
            All Coaches
          </Text>
        </Pressable>
        {coaches.map((coach) => (
          <Pressable
            key={coach.id}
            style={[styles.coachChip, selectedCoachId === coach.id && styles.coachChipActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedCoachId(coach.id);
            }}
          >
            <View style={[styles.coachDot, { backgroundColor: Colors.dark.green }]} />
            <Text style={[styles.coachChipText, selectedCoachId === coach.id && styles.coachChipTextActive]}>
              {coach.name.split(" ")[0]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, CardStyles.elevated]}>
          <Text style={styles.statValue}>{stats.active}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={[styles.statCard, CardStyles.elevated]}>
          <Text style={styles.statValue}>{stats.paused}</Text>
          <Text style={styles.statLabel}>Paused</Text>
        </View>
        <View style={[styles.statCard, CardStyles.elevated]}>
          <Text style={styles.statValue}>{stats.ended}</Text>
          <Text style={styles.statLabel}>Ended</Text>
        </View>
        <View style={[styles.statCard, CardStyles.elevated]}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        {(["active", "paused", "ended", "all"] as FilterType[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFilter(f);
            }}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {sortedDays.length === 0 && flexibleSeries.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="albums-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No classes found</Text>
            <Text style={styles.emptySubtext}>
              {selectedCoachId ? "This coach has no classes yet" : "Create your first class to get started"}
            </Text>
          </View>
        ) : (
          <>
            {flexibleSeries.length > 0 && (
              <CollapsibleDaySection
                key="flexible"
                dayOfWeek={FLEXIBLE_DAY}
                series={flexibleSeries}
                isExpanded={expandedDays.has(FLEXIBLE_DAY)}
                onToggle={() => toggleDay(FLEXIBLE_DAY)}
                onSeriesPress={handleSeriesPress}
                isFlexible
              />
            )}
            {sortedDays.map((day) => (
              <CollapsibleDaySection
                key={day}
                dayOfWeek={day}
                series={groupedByDay[day]}
                isExpanded={expandedDays.has(day)}
                onToggle={() => toggleDay(day)}
                onSeriesPress={handleSeriesPress}
              />
            ))}
          </>
        )}
      </ScrollView>

      <AdminSeriesDetailDrawer
        visible={showDetailDrawer}
        seriesId={selectedSeriesId}
        onClose={handleCloseDrawer}
      />

      {showCreateWizard ? (
        <CreateSessionWizard
          visible={showCreateWizard}
          onClose={handleCloseWizard}
          adminMode={true}
          coaches={coaches}
          selectedCoachId={wizardCoachId || undefined}
          onCoachIdChange={setWizardCoachId}
          createSeriesMode={true}
        />
      ) : null}
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
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  createButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: ADMIN_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  coachFilterContainer: {
    maxHeight: 50,
    marginBottom: Spacing.md,
  },
  coachFilterContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  coachChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "transparent",
    gap: Spacing.xs,
  },
  coachChipActive: {
    borderColor: ADMIN_COLOR,
    backgroundColor: `${ADMIN_COLOR}20`,
  },
  coachDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  coachChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  coachChipTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.md,
  },
  statValue: {
    ...Typography.h2,
    color: ADMIN_COLOR,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  filterChipActive: {
    backgroundColor: ADMIN_COLOR,
  },
  filterText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  filterTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
});
