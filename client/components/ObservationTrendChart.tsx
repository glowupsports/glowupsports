import React from "react";
import { View, StyleSheet, Text } from "react-native";
import Svg, { Path, Circle, Line, Text as SvgText } from "react-native-svg";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface TrendDataPoint {
  date: string;
  delta: number;
  direction: string;
}

interface ObservationTrend {
  domainId: string;
  history: TrendDataPoint[];
  streakUp: number;
  streakDown: number;
  hasSpeedrunWarning: boolean;
  improvementRate: number;
  hasData: boolean;
  domain?: {
    displayName: string;
    icon: string | null;
  } | null;
}

interface ObservationTrendChartProps {
  trend: ObservationTrend;
  width?: number;
  height?: number;
}

export function ObservationTrendChart({ trend, width = 280, height = 80 }: ObservationTrendChartProps) {
  const padding = { top: 10, right: 10, bottom: 20, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const history = trend.history.slice(-10);
  if (!trend.hasData || history.length < 2) {
    return (
      <View style={[styles.chartContainer, { width }]}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>{trend.domain?.displayName || "Domain"}</Text>
        </View>
        <View style={styles.noDataContainer}>
          <Ionicons name="analytics-outline" size={24} color={Colors.dark.tabIconDefault} />
          <Text style={styles.noDataText}>No observations yet</Text>
        </View>
      </View>
    );
  }
  
  const cumulativeValues = history.reduce((acc: number[], point, index) => {
    const prev = index > 0 ? acc[index - 1] : 0;
    acc.push(prev + point.delta);
    return acc;
  }, []);
  
  const minVal = Math.min(0, ...cumulativeValues);
  const maxVal = Math.max(0, ...cumulativeValues);
  const range = maxVal - minVal || 1;
  
  const getX = (index: number) => padding.left + (index / (history.length - 1)) * chartWidth;
  const getY = (value: number) => padding.top + chartHeight - ((value - minVal) / range) * chartHeight;
  
  const pathData = cumulativeValues
    .map((value, index) => `${index === 0 ? "M" : "L"} ${getX(index)} ${getY(value)}`)
    .join(" ");
  
  const zeroY = getY(0);
  const lineColor = trend.improvementRate >= 50 ? Colors.dark.primary : Colors.dark.orange;

  return (
    <View style={[styles.chartContainer, { width }]}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>{trend.domain?.displayName || "Domain"}</Text>
        {trend.hasSpeedrunWarning ? (
          <View style={styles.warningBadge}>
            <Ionicons name="warning" size={12} color={Colors.dark.orange} />
            <Text style={styles.warningText}>Fast</Text>
          </View>
        ) : null}
        {trend.streakUp >= 3 ? (
          <View style={styles.streakBadge}>
            <Ionicons name="flame" size={12} color={Colors.dark.primary} />
            <Text style={[styles.streakText, { color: Colors.dark.primary }]}>{trend.streakUp}</Text>
          </View>
        ) : null}
        {trend.streakDown >= 2 ? (
          <View style={styles.streakBadge}>
            <Ionicons name="trending-down" size={12} color={Colors.dark.error} />
            <Text style={[styles.streakText, { color: Colors.dark.error }]}>{trend.streakDown}</Text>
          </View>
        ) : null}
      </View>
      
      <Svg width={width} height={height}>
        <Line
          x1={padding.left}
          y1={zeroY}
          x2={width - padding.right}
          y2={zeroY}
          stroke={Colors.dark.backgroundTertiary}
          strokeWidth={1}
          strokeDasharray="4,4"
        />
        
        <Path
          d={pathData}
          stroke={lineColor}
          strokeWidth={2}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        
        {cumulativeValues.map((value, index) => (
          <Circle
            key={index}
            cx={getX(index)}
            cy={getY(value)}
            r={3}
            fill={history[index].direction === "up" ? Colors.dark.primary : history[index].direction === "down" ? Colors.dark.error : Colors.dark.tabIconDefault}
          />
        ))}
        
        <SvgText
          x={width - padding.right}
          y={height - 4}
          textAnchor="end"
          fontSize={10}
          fill={Colors.dark.tabIconDefault}
        >
          {trend.improvementRate}% up
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  chartContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  chartTitle: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  noDataContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  noDataText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  warningBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: Colors.dark.orange + "20",
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  warningText: {
    fontSize: 10,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  streakText: {
    fontSize: 10,
    fontWeight: "600",
  },
}));
