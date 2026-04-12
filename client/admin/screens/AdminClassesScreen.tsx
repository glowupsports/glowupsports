import React, { useState, useMemo, useEffect } from "react";
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
import { RouteProp } from "@react-navigation/native";

type AdminClassesScreenProps = {
  route?: RouteProp<{ ClassesManagement: { focusSeriesId?: string } | undefined }, "ClassesManagement">;
};

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
    height.value = withTiming(isExpanded ? 1 : 0, { duration: 300 });
  }, [isExpanded]);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [0, 180])}deg` }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: height.value,
    maxHeight: interpolate(height.value, [0, 1], [0, 2000]),
    overflow: 'hidden' as const,
  }));

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const label = isFlexible ? 'Flexible Schedule' : dayNames[dayOfWeek] || `Day ${dayOfWeek}`;

  return (
    <View style={{ marginBottom: Spacing.sm }}>
      <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BorderRadius.md }}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{label} ({series.length})</Text>
        <Animated.View style={arrowStyle}>
          <Ionicons name="chevron-down" size={20} color="#fff" />
        </Animated.View>
      </Pressable>
      <Animated.View style={contentStyle}>
        {series.map((s) => (
          <Pressable key={s.id} onPress={() => onSeriesPress(s)} style={{ padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>{s.title}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>{s.coachName} - {s.playerCount} players</Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

export default function AdminClassesScreen({ route }: AdminClassesScreenProps) {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState('all');
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [wizardCoachId, setWizardCoachId] = useState<string | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);

  useEffect(() => {
    const focusSeriesId = route?.params?.focusSeriesId;
    if (focusSeriesId) {
      setSelectedSeriesId(focusSeriesId);
      setShowDetailDrawer(true);
    }
  }, [route?.params?.focusSeriesId]);

  const { data: seriesData = [], isLoading } = useQuery<CoachingSeries[]>({
    queryKey: ['/api/admin/series'],
  });

  const { data: coaches = [] } = useQuery<Coach[]>({
    queryKey: ['/api/admin/coaches'],
  });

  const filteredByCoach = useMemo(() => {
    let filtered = seriesData;
    if (selectedCoachId) {
      filtered = filtered.filter(s => s.coachId === selectedCoachId);
    }
    if (filter !== 'all') {
      filtered = filtered.filter(s => s.status === filter);
    }
    return filtered;
  }, [seriesData, selectedCoachId, filter]);

  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());

  const { groupedByDay, sortedDays, flexibleSeries } = useMemo(() => {
    const grouped: Record<number, CoachingSeries[]> = {};
    const flexible: CoachingSeries[] = [];

    for (const s of filteredByCoach) {
      if (s.dayOfWeek === FLEXIBLE_DAY || s.dayOfWeek == null) {
        flexible.push(s);
      } else {
        if (!grouped[s.dayOfWeek]) grouped[s.dayOfWeek] = [];
        grouped[s.dayOfWeek].push(s);
      }
    }

    const days = Object.keys(grouped).map(Number).sort((a, b) => a - b);

    return { groupedByDay: grouped, sortedDays: days, flexibleSeries: flexible };
  }, [filteredByCoach]);

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

  const handleCreatePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCreateWizard(true);
  };

  const handleCloseWizard = () => {
    setShowCreateWizard(false);
    setWizardCoachId(null);
  };

  const handleSeriesPress = (series: CoachingSeries) => {
    setSelectedSeriesId(series.id);
    setShowDetailDrawer(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleCloseDrawer = () => {
    setShowDetailDrawer(false);
    setTimeout(() => setSelectedSeriesId(null), 350);
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
