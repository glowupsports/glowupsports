import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Spacing, Colors, BorderRadius, GlowColors } from "@/constants/theme";

const STREAK_MILESTONES = [7, 14, 30, 60, 100];
const STORAGE_KEY = "@glow_streak_celebrated_milestones_v1";
const AUTO_DISMISS_MS = 4000;

interface StreakMilestoneBannerProps {
  streak: number;
}

function getMilestoneLabel(milestone: number): string {
  if (milestone >= 100) return "Century streak — legendary!";
  if (milestone >= 60) return "60 days — you're unstoppable!";
  if (milestone >= 30) return "30 days — true dedication!";
  if (milestone >= 14) return "Two weeks strong!";
  return "One week — great start!";
}

export function StreakMilestoneBanner({ streak }: StreakMilestoneBannerProps) {
  const [visibleMilestone, setVisibleMilestone] = React.useState<number | null>(null);
  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const seen: number[] = raw ? JSON.parse(raw) : [];
        const hit = STREAK_MILESTONES.slice().reverse().find(
          (m) => streak >= m && !seen.includes(m)
        );
        if (hit && !cancelled) {
          setVisibleMilestone(hit);
          const updated = [...seen, hit];
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        }
      } catch {
        // best-effort
      }
    })();
    return () => { cancelled = true; };
  }, [streak]);

  useEffect(() => {
    if (visibleMilestone !== null) {
      translateY.value = withSpring(0, { damping: 16, stiffness: 200 });
      opacity.value = withTiming(1, { duration: 300 });
      scale.value = withSpring(1, { damping: 14, stiffness: 220 });

      dismissTimer.current = setTimeout(() => {
        translateY.value = withTiming(-80, { duration: 400 });
        opacity.value = withTiming(0, { duration: 400 });
        setTimeout(() => setVisibleMilestone(null), 420);
      }, AUTO_DISMISS_MS);
    }
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [visibleMilestone]);

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  if (visibleMilestone === null) return null;

  return (
    <Animated.View style={[s.wrapper, bannerStyle]}>
      <View style={s.banner}>
        <View style={s.fireRow}>
          <Ionicons name="flame" size={22} color="#F59E0B" />
          <Text style={s.streakNum}>{visibleMilestone}</Text>
          <Ionicons name="flame" size={22} color="#F59E0B" />
        </View>
        <View style={s.textWrap}>
          <Text style={s.title}>{visibleMilestone}-Day Streak</Text>
          <Text style={s.subtitle}>{getMilestoneLabel(visibleMilestone)}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: "rgba(245,158,11,0.14)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.35)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  fireRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  streakNum: {
    fontSize: 20,
    fontWeight: "900",
    color: "#F59E0B",
    marginHorizontal: 2,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
});
