import React, { useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface CoachSession {
  coachName: string;
  status: "upcoming" | "in_progress" | "completed";
}

interface CoachLoad {
  name: string;
  initials: string;
  todayCount: number;
  inProgressCount: number;
  capacity: number;
  loadPercent: number;
  loadLevel: "healthy" | "busy" | "overloaded";
}

interface CoachLoadStripProps {
  sessions: CoachSession[];
  maxCapacity?: number;
  onCoachPress?: (coachName: string) => void;
}

const LOAD_COLORS = {
  healthy:    { bar: "#22c55e", bg: "#22c55e15", text: "#22c55e",   label: "Good" },
  busy:       { bar: Colors.dark.gold, bg: Colors.dark.gold + "15", text: Colors.dark.gold, label: "Busy" },
  overloaded: { bar: Colors.dark.error, bg: Colors.dark.error + "15", text: Colors.dark.error, label: "Max" },
};

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function CoachChip({ coach, index, onPress }: { coach: CoachLoad; index: number; onPress?: (name: string) => void }) {
  const config = LOAD_COLORS[coach.loadLevel];
  const barWidth = useSharedValue(0);
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(20);

  useEffect(() => {
    const delay = index * 80;
    barWidth.value = withDelay(delay + 200, withSpring(coach.loadPercent, { damping: 20, stiffness: 120 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 250 }));
    translateX.value = withDelay(delay, withSpring(0, { damping: 18, stiffness: 180 }));
  }, [coach.loadPercent]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%`,
  }));

  return (
    <Animated.View style={[styles.chipWrapper, containerStyle]}>
      <Pressable
        style={[styles.chip, { borderColor: config.bar + "40" }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.(coach.name);
        }}
      >
        <View style={[styles.avatar, { backgroundColor: config.bg, borderColor: config.bar + "60" }]}>
          <Text style={[styles.avatarText, { color: config.bar }]}>{coach.initials}</Text>
          {coach.inProgressCount > 0 && (
            <View style={[styles.activeDot, { backgroundColor: "#22c55e" }]} />
          )}
        </View>

        <Text style={styles.coachName} numberOfLines={1}>{coach.name.split(" ")[0]}</Text>

        <View style={styles.barContainer}>
          <View style={styles.barBg}>
            <Animated.View style={[styles.barFill, barStyle, { backgroundColor: config.bar }]} />
          </View>
        </View>

        <View style={styles.countRow}>
          <Text style={[styles.countText, { color: config.text }]}>{coach.todayCount}</Text>
          <Text style={styles.countSep}>/</Text>
          <Text style={styles.capacityText}>{coach.capacity}</Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
          <Text style={[styles.statusText, { color: config.text }]}>{config.label}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function deriveCoachLoads(sessions: CoachSession[], maxCapacity: number): CoachLoad[] {
  const map: Record<string, { total: number; inProgress: number }> = {};

  for (const s of sessions) {
    if (!s.coachName || s.coachName === "Unassigned") continue;
    if (!map[s.coachName]) map[s.coachName] = { total: 0, inProgress: 0 };
    map[s.coachName].total++;
    if (s.status === "in_progress") map[s.coachName].inProgress++;
  }

  return Object.entries(map).map(([name, counts]) => {
    const loadPercent = Math.min(100, Math.round((counts.total / maxCapacity) * 100));
    const loadLevel: CoachLoad["loadLevel"] =
      loadPercent >= 100 ? "overloaded" : loadPercent >= 70 ? "busy" : "healthy";

    return {
      name,
      initials: getInitials(name),
      todayCount: counts.total,
      inProgressCount: counts.inProgress,
      capacity: maxCapacity,
      loadPercent,
      loadLevel,
    };
  }).sort((a, b) => b.todayCount - a.todayCount);
}

export function CoachLoadStrip({
  sessions,
  maxCapacity = 5,
  onCoachPress,
}: CoachLoadStripProps) {
  const coaches = deriveCoachLoads(sessions, maxCapacity);

  if (coaches.length === 0) return null;

  const overloaded = coaches.filter(c => c.loadLevel === "overloaded").length;
  const active = coaches.filter(c => c.inProgressCount > 0).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.iconBg, { backgroundColor: Colors.dark.gold + "20" }]}>
            <Ionicons name="people" size={15} color={Colors.dark.gold} />
          </View>
          <Text style={styles.title}>Coach Load</Text>
        </View>
        <View style={styles.stats}>
          {active > 0 && (
            <View style={[styles.statPill, { backgroundColor: "#22c55e15" }]}>
              <View style={[styles.statDot, { backgroundColor: "#22c55e" }]} />
              <Text style={[styles.statPillText, { color: "#22c55e" }]}>{active} on court</Text>
            </View>
          )}
          {overloaded > 0 && (
            <View style={[styles.statPill, { backgroundColor: Colors.dark.error + "15" }]}>
              <Ionicons name="warning" size={10} color={Colors.dark.error} />
              <Text style={[styles.statPillText, { color: Colors.dark.error }]}>{overloaded} overloaded</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {coaches.map((coach, i) => (
          <CoachChip key={coach.name} coach={coach} index={i} onPress={onCoachPress} />
        ))}
      </ScrollView>
    </View>
  );
}

const CHIP_WIDTH = 90;

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  stats: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statPillText: {
    fontSize: 10,
    fontWeight: "600",
  },
  scrollContent: {
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  chipWrapper: {
    width: CHIP_WIDTH,
  },
  chip: {
    width: CHIP_WIDTH,
    alignItems: "center",
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: 5,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    position: "relative",
  },
  avatarText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  activeDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.dark.backgroundSecondary,
  },
  coachName: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.text,
    textAlign: "center",
  },
  barContainer: {
    width: "100%",
    paddingHorizontal: 4,
  },
  barBg: {
    height: 4,
    backgroundColor: Colors.dark.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 2,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  countText: {
    fontSize: 14,
    fontWeight: "800",
  },
  countSep: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  capacityText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
