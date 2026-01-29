import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface OperationsHubHeroProps {
  nextSessionIn?: number;
  activeSessions: number;
  waitingCheckIns: number;
  activeCoaches: number;
  onViewSchedule?: () => void;
}

export function OperationsHubHero({
  nextSessionIn = 0,
  activeSessions,
  waitingCheckIns,
  activeCoaches,
  onViewSchedule,
}: OperationsHubHeroProps) {
  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: glowOpacity.value,
  }));

  const formatCountdown = (minutes: number) => {
    if (minutes <= 0) return "NOW";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.orange + "25", Colors.dark.orange + "08", "transparent"]}
        style={styles.gradientBg}
      />
      
      <View style={styles.borderContainer}>
        <LinearGradient
          colors={[Colors.dark.orange, Colors.dark.gold, Colors.dark.orange]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBorder}
        />
        
        <View style={styles.innerContainer}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.iconContainer}>
                <Ionicons name="flash" size={24} color={Colors.dark.orange} />
              </View>
              <View>
                <Text style={styles.label}>OPERATIONS HUB</Text>
                <Text style={styles.title}>Live Control Center</Text>
              </View>
            </View>
            
            <View style={styles.liveIndicator}>
              <Animated.View style={[styles.livePulse, pulseStyle]} />
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <View style={[styles.statIconBg, { backgroundColor: Colors.dark.primary + "20" }]}>
                <Ionicons name="play-circle" size={20} color={Colors.dark.primary} />
              </View>
              <Text style={styles.statValue}>{activeSessions}</Text>
              <Text style={styles.statLabel}>Active Now</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.statBox}>
              <View style={[styles.statIconBg, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                <Ionicons name="log-in" size={20} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.statValue}>{waitingCheckIns}</Text>
              <Text style={styles.statLabel}>Check-ins</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.statBox}>
              <View style={[styles.statIconBg, { backgroundColor: Colors.dark.gold + "20" }]}>
                <Ionicons name="people" size={20} color={Colors.dark.gold} />
              </View>
              <Text style={styles.statValue}>{activeCoaches}</Text>
              <Text style={styles.statLabel}>Coaches</Text>
            </View>
          </View>

          {nextSessionIn > 0 && (
            <Pressable style={styles.countdownBanner} onPress={onViewSchedule}>
              <Ionicons name="time-outline" size={16} color={Colors.dark.orange} />
              <Text style={styles.countdownText}>
                Next session starts in <Text style={styles.countdownHighlight}>{formatCountdown(nextSessionIn)}</Text>
              </Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.orange} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  gradientBg: {
    position: "absolute",
    top: -50,
    left: -20,
    right: -20,
    height: 200,
    borderRadius: 100,
  },
  borderContainer: {
    borderRadius: BorderRadius.xl,
    padding: 2,
    overflow: "hidden",
  },
  gradientBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  innerContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl - 2,
    padding: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.dark.orange + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...Typography.small,
    color: Colors.dark.orange,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 2,
  },
  title: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.dark.primary + "15",
    borderRadius: BorderRadius.full,
  },
  livePulse: {
    position: "absolute",
    left: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.primary,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
  },
  liveText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "700",
    fontSize: 10,
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  statIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  statValue: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: 2,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  divider: {
    width: 1,
    height: 50,
    backgroundColor: Colors.dark.border,
  },
  countdownBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.orange + "10",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.orange + "30",
  },
  countdownText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
  },
  countdownHighlight: {
    color: Colors.dark.orange,
    fontWeight: "700",
  },
});
