import React, { useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { useAuth } from "@/coach/context/AuthContext";
import { Spacing, Colors, BorderRadius, GlowColors } from "@/constants/theme";

interface TrainingLoadDay {
  day: string;
  date: string;
  status: "done" | "upcoming" | "empty";
}

interface TrainingLoadData {
  weekDays: TrainingLoadDay[];
  sessionsDone: number;
  sessionsUpcoming: number;
  weeklyGoal: number;
  status: "on_track" | "behind" | "rest_week" | "no_goal_set";
  statusText: string;
  isFreePlayer: boolean;
}

const DOT_COLORS: Record<TrainingLoadDay["status"], string> = {
  done: "#4ADE80",
  upcoming: "#FACC15",
  empty: "rgba(255,255,255,0.12)",
};

const STATUS_COLORS: Record<TrainingLoadData["status"], string> = {
  rest_week: "#4ADE80",
  on_track: GlowColors.primary,
  behind: "#F97316",
  no_goal_set: Colors.dark.textMuted,
};

const STATUS_ICONS: Record<TrainingLoadData["status"], string> = {
  rest_week: "checkmark-circle",
  on_track: "trending-up",
  behind: "alert-circle-outline",
  no_goal_set: "information-circle-outline",
};

export function TrainingLoadCard() {
  const { user, isGuest } = useAuth();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();

  const { data, isLoading } = useQuery<TrainingLoadData>({
    queryKey: ["/api/player/me/training-load"] as const,
    enabled: !!user?.playerId && !isGuest,
    staleTime: 60_000,
  });

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      navigateToTab("Growth", { screen: "ScheduleMain" } as any);
    } catch {
      try {
        navigation.navigate("ScheduleMain");
      } catch {}
    }
  }, [navigateToTab, navigation]);

  const handleBook = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      navigateToTab("Growth", { screen: "ScheduleMain" } as any);
    } catch {
      try {
        navigation.navigate("ScheduleMain");
      } catch {}
    }
  }, [navigateToTab, navigation]);

  if (isGuest || !user?.playerId) return null;

  if (isLoading || !data) {
    return (
      <View style={s.card}>
        <ActivityIndicator size="small" color={GlowColors.primary} />
      </View>
    );
  }

  if (data.isFreePlayer) {
    return (
      <Pressable
        style={({ pressed }) => [s.card, s.freeCard, pressed && s.pressed]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="Training load — upgrade to track"
      >
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Ionicons name="fitness-outline" size={13} color={GlowColors.primary} />
            <Text style={s.sectionLabel}>TRAINING LOAD</Text>
          </View>
          <Ionicons name="lock-closed-outline" size={14} color={Colors.dark.textMuted} />
        </View>
        <Text style={s.freeTitle}>Track your weekly sessions</Text>
        <Text style={s.freeSub}>Join an academy to unlock your training load tracker and weekly goals.</Text>
      </Pressable>
    );
  }

  const statusColor = STATUS_COLORS[data.status] ?? GlowColors.primary;
  const statusIcon = STATUS_ICONS[data.status] ?? "trending-up";
  const done = data.sessionsDone;
  const goal = data.weeklyGoal;

  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && s.pressed]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Training load: ${data.statusText}`}
    >
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="fitness-outline" size={13} color={GlowColors.primary} />
          <Text style={s.sectionLabel}>TRAINING LOAD</Text>
        </View>
        <Ionicons name="chevron-forward" size={15} color={Colors.dark.textMuted} />
      </View>

      <View style={s.ringRow}>
        <View style={s.dotsWrap}>
          {data.weekDays.map((day) => (
            <View key={day.day} style={s.dotCol}>
              <View
                style={[
                  s.dot,
                  { backgroundColor: DOT_COLORS[day.status] },
                  day.status === "done" && s.dotDone,
                ]}
              />
              <Text style={s.dayLabel}>{day.day[0]}</Text>
            </View>
          ))}
        </View>

        <View style={s.centerLabel}>
          <Text style={[s.countText, { color: statusColor }]}>{done}/{goal}</Text>
          <Text style={s.countSub}>sessions</Text>
        </View>
      </View>

      <View style={s.statusRow}>
        <Ionicons name={statusIcon as any} size={13} color={statusColor} />
        <Text style={[s.statusText, { color: statusColor }]} numberOfLines={2}>
          {data.statusText}
        </Text>
      </View>

      {data.status === "behind" ? (
        <Pressable
          style={s.bookBtn}
          onPress={handleBook}
          accessibilityRole="button"
          accessibilityLabel="Book a session"
        >
          <Ionicons name="add" size={13} color={Colors.dark.backgroundRoot} />
          <Text style={s.bookBtnText}>Book a Session</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    backgroundColor: "rgba(200,255,61,0.05)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.15)",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  freeCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  pressed: { opacity: 0.82 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: GlowColors.primary,
    letterSpacing: 1.2,
  },
  ringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  dotsWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dotCol: {
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  dotDone: {
    borderColor: "rgba(74,222,128,0.4)",
  },
  dayLabel: {
    fontSize: 9,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  centerLabel: {
    alignItems: "center",
    minWidth: 48,
  },
  countText: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  countSub: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    marginTop: -2,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  bookBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
  },
  bookBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.backgroundRoot,
  },
  freeTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  freeSub: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 17,
  },
});
