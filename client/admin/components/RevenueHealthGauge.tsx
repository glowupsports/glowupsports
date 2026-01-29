import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface RevenueHealthGaugeProps {
  monthlyRevenue: number;
  revenueTarget: number;
  outstandingPayments: number;
  attendanceRate: number;
  currency: string;
}

function GaugeBar({ 
  value, 
  maxValue, 
  label, 
  color, 
  formatValue,
  showWarning = false,
}: { 
  value: number; 
  maxValue: number; 
  label: string; 
  color: string;
  formatValue: (v: number) => string;
  showWarning?: boolean;
}) {
  const animatedWidth = useSharedValue(0);
  const percent = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;

  useEffect(() => {
    animatedWidth.value = withSpring(percent, { damping: 15, stiffness: 100 });
  }, [percent]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value}%`,
  }));

  return (
    <View style={styles.gaugeItem}>
      <View style={styles.gaugeHeader}>
        <View style={styles.gaugeLabelRow}>
          <View style={[styles.gaugeDot, { backgroundColor: color }]} />
          <Text style={styles.gaugeLabel}>{label}</Text>
          {showWarning && (
            <Ionicons name="warning" size={14} color={Colors.dark.orange} style={{ marginLeft: 4 }} />
          )}
        </View>
        <Text style={[styles.gaugeValue, { color }]}>{formatValue(value)}</Text>
      </View>
      <View style={styles.gaugeBarBg}>
        <Animated.View style={[styles.gaugeBarFill, animatedStyle, { backgroundColor: color }]} />
      </View>
      <View style={styles.gaugeFooter}>
        <Text style={styles.gaugePercent}>{Math.round(percent)}%</Text>
        <Text style={styles.gaugeMax}>of {formatValue(maxValue)}</Text>
      </View>
    </View>
  );
}

function CircularGauge({ value, label, color }: { value: number; label: string; color: string }) {
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    animatedValue.value = withTiming(value, { duration: 1000, easing: Easing.out(Easing.cubic) });
  }, [value]);

  const getStatusLabel = () => {
    if (value >= 90) return "Excellent";
    if (value >= 75) return "Good";
    if (value >= 60) return "Fair";
    return "Needs Work";
  };

  return (
    <View style={styles.circularGauge}>
      <View style={[styles.circularOuter, { borderColor: color + "30" }]}>
        <View style={[styles.circularInner, { borderColor: color }]}>
          <Text style={[styles.circularValue, { color }]}>{value}%</Text>
        </View>
      </View>
      <Text style={styles.circularLabel}>{label}</Text>
      <Text style={[styles.circularStatus, { color }]}>{getStatusLabel()}</Text>
    </View>
  );
}

export function RevenueHealthGauge({
  monthlyRevenue,
  revenueTarget,
  outstandingPayments,
  attendanceRate,
  currency,
}: RevenueHealthGaugeProps) {
  const formatCurrency = (amount: number) => `${currency} ${amount.toLocaleString()}`;
  
  const getHealthStatus = () => {
    let score = 0;
    if (monthlyRevenue >= revenueTarget * 0.8) score += 1;
    if (outstandingPayments < monthlyRevenue * 0.2) score += 1;
    if (attendanceRate >= 80) score += 1;
    
    if (score === 3) return { label: "HEALTHY", color: Colors.dark.primary };
    if (score === 2) return { label: "STABLE", color: Colors.dark.orange };
    return { label: "ATTENTION", color: Colors.dark.error };
  };

  const health = getHealthStatus();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
        style={styles.card}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Ionicons name="pulse" size={18} color={Colors.dark.gold} />
            <Text style={styles.title}>FINANCIAL HEALTH</Text>
          </View>
          <View style={[styles.healthBadge, { backgroundColor: health.color + "20" }]}>
            <Text style={[styles.healthText, { color: health.color }]}>{health.label}</Text>
          </View>
        </View>

        <View style={styles.gaugesContainer}>
          <GaugeBar
            value={monthlyRevenue}
            maxValue={revenueTarget}
            label="Monthly Revenue"
            color={Colors.dark.gold}
            formatValue={formatCurrency}
          />
          
          <GaugeBar
            value={outstandingPayments}
            maxValue={monthlyRevenue || 1}
            label="Outstanding"
            color={Colors.dark.error}
            formatValue={formatCurrency}
            showWarning={outstandingPayments > monthlyRevenue * 0.3}
          />
        </View>

        <View style={styles.attendanceSection}>
          <CircularGauge
            value={attendanceRate}
            label="Attendance Rate"
            color={attendanceRate >= 80 ? Colors.dark.primary : Colors.dark.orange}
          />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.gold,
    letterSpacing: 1.5,
  },
  healthBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  healthText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  gaugesContainer: {
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  gaugeItem: {
    gap: Spacing.xs,
  },
  gaugeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gaugeLabelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  gaugeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.xs,
  },
  gaugeLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  gaugeValue: {
    ...Typography.body,
    fontWeight: "700",
  },
  gaugeBarBg: {
    height: 10,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 5,
    overflow: "hidden",
  },
  gaugeBarFill: {
    height: "100%",
    borderRadius: 5,
  },
  gaugeFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  gaugePercent: {
    fontSize: 11,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  gaugeMax: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  attendanceSection: {
    alignItems: "center",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  circularGauge: {
    alignItems: "center",
  },
  circularOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  circularInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  circularValue: {
    ...Typography.h2,
    fontSize: 22,
  },
  circularLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  circularStatus: {
    ...Typography.body,
    fontWeight: "700",
    marginTop: 2,
  },
});
