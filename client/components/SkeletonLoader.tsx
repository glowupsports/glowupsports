import React, { useEffect } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";
import { Colors, Backgrounds, BorderRadius, Spacing } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ 
  width = "100%", 
  height = 20, 
  borderRadius = BorderRadius.sm,
  style 
}: SkeletonProps) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
  }));

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width: width as any, height, borderRadius },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function SkeletonCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardHeader}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <View style={styles.cardHeaderText}>
          <Skeleton width="60%" height={16} />
          <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
        </View>
      </View>
      <Skeleton width="100%" height={60} style={{ marginTop: 12 }} />
      <View style={styles.cardFooter}>
        <Skeleton width="30%" height={14} />
        <Skeleton width="20%" height={14} />
      </View>
    </View>
  );
}

export function SkeletonListItem({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.listItem, style]}>
      <Skeleton width={48} height={48} borderRadius={24} />
      <View style={styles.listItemContent}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="50%" height={12} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={24} height={24} borderRadius={12} />
    </View>
  );
}

export function SkeletonSessionCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.sessionCard, style]}>
      <View style={styles.sessionHeader}>
        <Skeleton width={60} height={60} borderRadius={8} />
        <View style={styles.sessionInfo}>
          <Skeleton width="80%" height={18} />
          <Skeleton width="60%" height={14} style={{ marginTop: 6 }} />
          <Skeleton width="40%" height={12} style={{ marginTop: 4 }} />
        </View>
      </View>
      <View style={styles.sessionFooter}>
        <Skeleton width="45%" height={32} borderRadius={16} />
        <Skeleton width="45%" height={32} borderRadius={16} />
      </View>
    </View>
  );
}

export function SkeletonPlayerCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.playerCard, style]}>
      <Skeleton width={56} height={56} borderRadius={28} />
      <View style={styles.playerInfo}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="50%" height={12} style={{ marginTop: 6 }} />
        <View style={styles.playerStats}>
          <Skeleton width={40} height={20} borderRadius={10} />
          <Skeleton width={40} height={20} borderRadius={10} />
          <Skeleton width={40} height={20} borderRadius={10} />
        </View>
      </View>
    </View>
  );
}

export function SkeletonDashboard() {
  return (
    <View style={styles.dashboard}>
      <View style={styles.dashboardHeader}>
        <Skeleton width="50%" height={28} />
        <Skeleton width={32} height={32} borderRadius={16} />
      </View>
      <View style={styles.dashboardStats}>
        <Skeleton width="30%" height={80} borderRadius={12} />
        <Skeleton width="30%" height={80} borderRadius={12} />
        <Skeleton width="30%" height={80} borderRadius={12} />
      </View>
      <Skeleton width="40%" height={20} style={{ marginTop: 20 }} />
      <SkeletonSessionCard style={{ marginTop: 12 }} />
      <SkeletonSessionCard style={{ marginTop: 12 }} />
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  skeleton: {
    backgroundColor: Backgrounds.elevated,
  },
  card: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.md,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  listItemContent: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  sessionCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  sessionHeader: {
    flexDirection: "row",
  },
  sessionInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  sessionFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.md,
  },
  playerCard: {
    flexDirection: "row",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  playerInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  playerStats: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  dashboard: {
    padding: Spacing.lg,
  },
  dashboardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dashboardStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
  },
}));
