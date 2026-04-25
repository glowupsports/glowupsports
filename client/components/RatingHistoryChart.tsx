import React from "react";
import { View, Text, StyleSheet, Dimensions, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Circle, Line, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { Colors, Spacing, BorderRadius, FontSizes, GlowColors } from "@/constants/theme";
import { useQuery } from "@tanstack/react-query";

interface RatingHistoryChartProps {
  playerId: string;
  height?: number;
  showLabels?: boolean;
}

interface RatingHistoryData {
  currentMmr: number;
  currentDssRating: string;
  stats: {
    totalMatches: number;
    startMmr: number;
    highestMmr: number;
    lowestMmr: number;
    netChange: number;
    highestDssRating: string;
    lowestDssRating: string;
  };
  history: {
    matchNumber: number;
    matchId: string;
    mmrBefore: number;
    mmrAfter: number;
    mmrDelta: number;
    dssRatingBefore: string;
    dssRatingAfter: string;
    didWin: boolean;
    matchType: string;
    matchDate: string;
  }[];
}

function formatDssForDisplay(dss: string): string {
  return parseFloat(dss).toFixed(2);
}

export function RatingHistoryChart({
  playerId,
  height = 200,
  showLabels = true,
}: RatingHistoryChartProps) {
  const { data, isLoading, error } = useQuery<RatingHistoryData>({
    queryKey: ["/api/adult-glow/player", playerId, "rating-history"],
    enabled: !!playerId,
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { height }]}>
        <ActivityIndicator color={GlowColors.primary} />
      </View>
    );
  }

  if (error || !data || data.history.length < 2) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>
          {data?.history.length === 0 
            ? "Play matches to see your rating history" 
            : data?.history.length === 1
            ? "Play more matches to see your progress"
            : "Unable to load rating history"}
        </Text>
      </View>
    );
  }

  const width = Dimensions.get("window").width - 32;
  const chartWidth = width - 60;
  const chartHeight = height - 60;
  const padding = { left: 50, right: 10, top: 20, bottom: 30 };

  const mmrValues = data.history.map(h => h.mmrAfter);
  const minMmr = Math.min(...mmrValues) - 20;
  const maxMmr = Math.max(...mmrValues) + 20;
  const mmrRange = maxMmr - minMmr;

  const getX = (index: number) => {
    return padding.left + (index / (data.history.length - 1)) * chartWidth;
  };

  const getY = (mmr: number) => {
    return padding.top + chartHeight - ((mmr - minMmr) / mmrRange) * chartHeight;
  };

  const pathData = data.history
    .map((point, i) => {
      const x = getX(i);
      const y = getY(point.mmrAfter);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  const areaPathData = `${pathData} L ${getX(data.history.length - 1)} ${padding.top + chartHeight} L ${getX(0)} ${padding.top + chartHeight} Z`;

  const isImproving = data.stats.netChange > 0;
  const lineColor = isImproving ? GlowColors.primary : "#EF4444";

  const yAxisLabels = [];
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const mmr = minMmr + (mmrRange / steps) * i;
    yAxisLabels.push({
      mmr: Math.round(mmr),
      y: getY(mmr),
    });
  }

  return (
    <LinearGradient
      colors={["rgba(255, 255, 255, 0.06)", "rgba(255, 255, 255, 0.08)"]}
      style={[styles.container, { height }]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Rating History</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBadge}>
            <Text style={styles.statLabel}>Current</Text>
            <Text style={styles.statValue}>{formatDssForDisplay(data.currentDssRating)}</Text>
          </View>
          <View style={[styles.changeBadge, { backgroundColor: isImproving ? GlowColors.primary + "20" : "#EF444420" }]}>
            <Text style={[styles.changeText, { color: isImproving ? GlowColors.primary : "#EF4444" }]}>
              {isImproving ? "+" : ""}{data.stats.netChange} MMR
            </Text>
          </View>
        </View>
      </View>

      <Svg width={width} height={chartHeight + padding.top + padding.bottom}>
        <Defs>
          <SvgGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lineColor} stopOpacity="0.3" />
            <Stop offset="1" stopColor={lineColor} stopOpacity="0" />
          </SvgGradient>
        </Defs>

        {yAxisLabels.map((label, i) => (
          <React.Fragment key={i}>
            <Line
              x1={padding.left}
              y1={label.y}
              x2={padding.left + chartWidth}
              y2={label.y}
              stroke={Colors.border}
              strokeWidth={1}
              strokeDasharray="4,4"
            />
            {showLabels && (
              <Text
                style={[styles.yAxisLabel, { position: "absolute", left: 4, top: label.y - 8 }]}
              >
                {label.mmr}
              </Text>
            )}
          </React.Fragment>
        ))}

        <Path
          d={areaPathData}
          fill="url(#areaGradient)"
        />

        <Path
          d={pathData}
          stroke={lineColor}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {data.history.map((point, i) => (
          <Circle
            key={point.matchId}
            cx={getX(i)}
            cy={getY(point.mmrAfter)}
            r={point.didWin ? 4 : 3}
            fill={point.didWin ? GlowColors.primary : "#EF4444"}
            stroke={"rgba(255, 255, 255, 0.06)"}
            strokeWidth={2}
          />
        ))}

        <Circle
          cx={getX(data.history.length - 1)}
          cy={getY(data.history[data.history.length - 1].mmrAfter)}
          r={6}
          fill={lineColor}
          stroke={"rgba(255, 255, 255, 0.06)"}
          strokeWidth={2}
        />
      </Svg>

      {showLabels && (
        <View style={styles.yAxisLabelsContainer}>
          {yAxisLabels.map((label, i) => (
            <Text 
              key={i} 
              style={[styles.yAxisLabel, { position: "absolute", left: 4, top: label.y - 8 }]}
            >
              {label.mmr}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: GlowColors.primary }]} />
          <Text style={styles.legendText}>Win</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
          <Text style={styles.legendText}>Loss</Text>
        </View>
        <Text style={styles.matchCount}>{data.stats.totalMatches} matches</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: Spacing.sm,
  },
  title: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statBadge: {
    alignItems: "flex-end",
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
  },
  statValue: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: "700",
  },
  changeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  changeText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    textAlign: "center",
  },
  yAxisLabelsContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 45,
  },
  yAxisLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  matchCount: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginLeft: "auto",
  },
});
