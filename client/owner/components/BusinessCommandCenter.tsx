import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Image as RNImage } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAcademyTheme } from "@/contexts/AcademyThemeContext";
import { buildPhotoUrl } from "@/lib/query-client";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface BusinessCommandCenterProps {
  academyName: string;
  monthlyRevenue: number;
  revenueTarget: number;
  healthScore: number;
  currency: string;
  onNotificationPress?: () => void;
  notificationCount?: number;
}

export function BusinessCommandCenter({
  academyName,
  monthlyRevenue,
  revenueTarget,
  healthScore,
  currency,
  onNotificationPress,
  notificationCount = 0,
}: BusinessCommandCenterProps) {
  const { logoUrl } = useAcademyTheme();
  const academyLogo = buildPhotoUrl(logoUrl);
  const pulseScale = useSharedValue(1);
  const shimmerX = useSharedValue(-1);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    shimmerX.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: 0.3 + (pulseScale.value - 1) * 2,
  }));

  const revenueProgress = Math.min((monthlyRevenue / revenueTarget) * 100, 100);
  
  const getHealthColor = () => {
    if (healthScore >= 80) return Colors.dark.primary;
    if (healthScore >= 60) return Colors.dark.gold;
    return Colors.dark.orange;
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
    return amount.toLocaleString();
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.gold + "30", Colors.dark.gold + "10", "transparent"]}
        style={styles.gradientBg}
      />
      
      <View style={styles.borderContainer}>
        <LinearGradient
          colors={[Colors.dark.gold, "#B8860B", Colors.dark.gold]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBorder}
        />
        
        <View style={styles.innerContainer}>
          <View style={styles.header}>
            <View style={styles.logoSection}>
              <View style={styles.logoContainer}>
                {academyLogo ? (
                  <RNImage
                    source={{ uri: academyLogo }}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                ) : (
                  <Ionicons name="business" size={26} color={Colors.dark.gold} />
                )}
              </View>
              <View>
                <Text style={styles.label}>BUSINESS CENTER</Text>
                <Text style={styles.academyName} numberOfLines={1}>{academyName}</Text>
              </View>
            </View>
            
            <Pressable style={styles.notificationBtn} onPress={onNotificationPress}>
              <Ionicons name="notifications" size={22} color={Colors.dark.gold} />
              {notificationCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{notificationCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.revenueBox}>
              <Text style={styles.metricLabel}>Monthly Revenue</Text>
              <View style={styles.revenueValueRow}>
                <Text style={styles.currencySymbol}>{currency}</Text>
                <Text style={styles.revenueValue}>{formatCurrency(monthlyRevenue)}</Text>
              </View>
              <View style={styles.progressBar}>
                <LinearGradient
                  colors={[Colors.dark.gold, Colors.dark.orange]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.progressFill, { width: `${revenueProgress}%` }]}
                />
              </View>
              <Text style={styles.progressText}>
                {Math.round(revenueProgress)}% of {currency} {formatCurrency(revenueTarget)} target
              </Text>
            </View>

            <View style={styles.healthBox}>
              <Text style={styles.metricLabel}>Health Score</Text>
              <View style={styles.healthCircle}>
                <Animated.View style={[styles.healthPulse, pulseStyle, { backgroundColor: getHealthColor() }]} />
                <View style={[styles.healthInner, { borderColor: getHealthColor() }]}>
                  <Text style={[styles.healthValue, { color: getHealthColor() }]}>{healthScore}</Text>
                </View>
              </View>
              <Text style={[styles.healthLabel, { color: getHealthColor() }]}>
                {healthScore >= 80 ? "Excellent" : healthScore >= 60 ? "Good" : "Needs Work"}
              </Text>
            </View>
          </View>
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
    top: -60,
    left: -30,
    right: -30,
    height: 220,
    borderRadius: 110,
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
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  logoSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  logoContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.dark.gold + "20",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
    overflow: "hidden",
  },
  logoImage: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  label: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 2,
  },
  academyName: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontSize: 18,
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.dark.gold + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontSize: 10,
    fontWeight: "700",
  },
  metricsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  revenueBox: {
    flex: 2,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  metricLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  revenueValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: Spacing.sm,
  },
  currencySymbol: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "600",
    marginRight: 4,
  },
  revenueValue: {
    ...Typography.h1,
    color: Colors.dark.text,
    fontSize: 28,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.dark.border,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: Spacing.xs,
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  healthBox: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
  },
  healthCircle: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: Spacing.xs,
  },
  healthPulse: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  healthInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  healthValue: {
    ...Typography.h2,
    fontWeight: "700",
  },
  healthLabel: {
    ...Typography.small,
    fontWeight: "600",
    fontSize: 11,
  },
});
