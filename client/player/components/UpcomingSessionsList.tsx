import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { useScheduleFocus } from "@/player/context/ScheduleFocusContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface UpcomingSessionItem {
  id: string;
  date: string;
  endTime?: string;
  type: string;
  courtName?: string | null;
  coachName?: string | null;
  duration?: number | null;
  isLive?: boolean;
}

interface DashboardShape {
  upcomingSessions?: UpcomingSessionItem[];
  nextSession?: { id: string } | null;
}

function getTypeColor(type: string): string {
  if (type === "private") return Colors.dark.primary;
  if (type === "semi_private") return Colors.dark.primary;
  if (type === "group") return Colors.dark.orange;
  return Colors.dark.primary;
}

function formatTypeLabel(type: string): string {
  if (type === "private") return "Private";
  if (type === "semi_private") return "Semi-Private";
  if (type === "group") return "Group";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatRow(item: UpcomingSessionItem): { weekday: string; time: string; meta: string } {
  const d = new Date(item.date);
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  let weekday: string;
  if (sameDay) weekday = "Today";
  else if (isTomorrow) weekday = "Tomorrow";
  else if (diffDays < 7) weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  else weekday = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const metaParts: string[] = [];
  if (item.coachName) metaParts.push(item.coachName);
  else metaParts.push(formatTypeLabel(item.type));
  if (item.courtName) metaParts.push(item.courtName);
  const meta = metaParts.join(" · ");

  return { weekday, time, meta };
}

export function UpcomingSessionsList() {
  const { navigateToTab } = useTabNavigation();
  const { setFocusSession } = useScheduleFocus();
  const { data } = useQuery<DashboardShape>({
    queryKey: ["/api/player/me/dashboard"],
  });

  const all = data?.upcomingSessions ?? [];
  const featuredId = data?.nextSession?.id;
  // Drop the featured session (already shown in the hero card) and limit to 3
  const rows = all.filter((s) => s.id !== featuredId).slice(0, 3);

  if (rows.length === 0) return null;

  const handlePress = (id: string) => {
    Haptics.selectionAsync();
    setFocusSession(id);
    navigateToTab("Growth", { screen: "ScheduleMain", params: { focusSessionId: id } });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>This Week</Text>
        <Text style={styles.headerCount}>{rows.length} more</Text>
      </View>
      <View style={styles.list}>
        {rows.map((item) => {
          const { weekday, time, meta } = formatRow(item);
          const color = getTypeColor(item.type);
          return (
            <Pressable
              key={item.id}
              onPress={() => handlePress(item.id)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={[styles.accent, { backgroundColor: color }]} />
              <View style={styles.rowMain}>
                <View style={styles.rowTopLine}>
                  <Text style={styles.rowWeekday} numberOfLines={1}>{weekday}</Text>
                  <Text style={styles.rowTime} numberOfLines={1}>{time}</Text>
                </View>
                <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={Colors.dark.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  headerCount: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  list: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm + 2,
    paddingRight: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.chipBackground,
  },
  rowPressed: {
    backgroundColor: Colors.dark.chipBackground,
  },
  accent: {
    width: 3,
    alignSelf: "stretch",
    marginRight: Spacing.sm,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTopLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rowWeekday: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
    flexShrink: 1,
  },
  rowTime: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
    fontVariant: ["tabular-nums"],
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
}));
