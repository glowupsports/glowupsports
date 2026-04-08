import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  interpolate,
  Easing,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface AcademyCommandCenterProps {
  academyName: string;
  todaySessions: number;
  activeCoaches: number;
  playersCheckedIn: number;
  isLive?: boolean;
  onNotificationPress?: () => void;
  notificationCount?: number;
}

export function AcademyCommandCenter({
  academyName,
  todaySessions,
  activeCoaches,
  playersCheckedIn,
  isLive = true,
  onNotificationPress,
  notificationCount = 0,
}: AcademyCommandCenterProps) {
  const pulseAnim = useSharedValue(0);
  const glowAnim = useSharedValue(0);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    glowAnim.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseAnim.value, [0, 1], [0.4, 1]),
    transform: [{ scale: interpolate(pulseAnim.value, [0, 1], [1, 1.5]) }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowAnim.value, [0, 1], [0.3, 0.6]),
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.glowOverlay, glowStyle]}>
        <LinearGradient
          colors={[Colors.dark.orange + "40", "transparent", Colors.dark.gold + "30"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <LinearGradient
        colors={[Colors.dark.orange + "20", Colors.dark.backgroundSecondary]}
        style={styles.cardGradient}
      >
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={[Colors.dark.orange, Colors.dark.gold]}
              style={styles.logoGradient}
            >
              <Ionicons name="tennisball" size={28} color={Colors.dark.buttonText} />
            </LinearGradient>
          </View>

          <View style={styles.titleSection}>
            <View style={styles.statusRow}>
              {isLive && (
                <View style={styles.liveContainer}>
                  <Animated.View style={[styles.livePulse, pulseStyle]} />
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              )}
              <Text style={styles.roleLabel}>COMMAND CENTER</Text>
            </View>
            <Text style={styles.academyName} numberOfLines={1}>{academyName}</Text>
          </View>

          <Pressable style={styles.notificationButton} onPress={onNotificationPress}>
            <Ionicons name="notifications" size={22} color={Colors.dark.orange} />
            {notificationCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {notificationCount > 9 ? "9+" : notificationCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: Colors.dark.orange + "20" }]}>
              <Ionicons name="calendar" size={16} color={Colors.dark.orange} />
            </View>
            <View>
              <Text style={styles.statValue}>{todaySessions}</Text>
              <Text style={styles.statLabel}>Sessions Today</Text>
            </View>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: Colors.dark.primary + "20" }]}>
              <Ionicons name="people" size={16} color={Colors.dark.primary} />
            </View>
            <View>
              <Text style={styles.statValue}>{activeCoaches}</Text>
              <Text style={styles.statLabel}>Coaches Active</Text>
            </View>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.dark.xpCyan} />
            </View>
            <View>
              <Text style={styles.statValue}>{playersCheckedIn}</Text>
              <Text style={styles.statLabel}>Checked In</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.borderGlow}>
        <LinearGradient
          colors={[Colors.dark.orange, Colors.dark.gold, Colors.dark.orange]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.borderGradient}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    marginBottom: Spacing.lg,
  },
  glowOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  cardGradient: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.orange + "30",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  logoContainer: {
    marginRight: Spacing.md,
  },
  logoGradient: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  titleSection: {
    flex: 1,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 4,
  },
  liveContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  livePulse: {
    position: "absolute",
    left: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
  },
  liveText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  roleLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.orange,
    letterSpacing: 1.5,
  },
  academyName: {
    ...Typography.h2,
    color: Colors.dark.text,
    fontSize: 20,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.orange + "30",
  },
  notificationBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundRoot + "80",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  statItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontSize: 18,
    lineHeight: 22,
  },
  statLabel: {
    fontSize: 9,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.dark.border,
    marginHorizontal: Spacing.sm,
  },
  borderGlow: {
    position: "absolute",
    bottom: 0,
    left: Spacing.xl,
    right: Spacing.xl,
    height: 2,
    overflow: "hidden",
    borderRadius: 1,
  },
  borderGradient: {
    flex: 1,
  },
});
