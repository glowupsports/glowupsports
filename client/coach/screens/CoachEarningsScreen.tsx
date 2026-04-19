import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface EarningsSummary {
  realized: { amount: string; currency: string; sessionsCount: number; status: string };
  projected: { amount: string; currency: string; sessionsCount: number; status: string };
  total: { amount: string; currency: string };
  paymentRule: { type: string; hourlyRate?: string | null; percentageRate?: string | null; currency: string; isDefault?: boolean };
  period: { month: number; year: number; monthName: string };
}

interface BreakdownItem {
  id: string; date: string; sessionType: string; duration: number; amount: string; currency: string; status: string;
}

interface BreakdownData {
  breakdown: BreakdownItem[];
  summary: { totalEarned: string; totalSessions: number; avgPerLesson: string; currency: string };
  period: { month: number; year: number };
}

interface HistoryItem {
  month: number; year: number; monthName: string; totalEarned: string; totalSessions: number; avgPerLesson: string; currency: string;
}

interface Analytics {
  weekdayBreakdown: Array<{ day: string; dayFull: string; earnings: number; sessions: number; hours: number }>;
  sessionTypeBreakdown: Array<{ type: string; label: string; earnings: number; sessions: number; percentage: number }>;
  peakHours: { morning: { earnings: number; sessions: number; label: string }; afternoon: { earnings: number; sessions: number; label: string }; evening: { earnings: number; sessions: number; label: string } };
  topPlayers: Array<{ playerId: string; playerName: string; earnings: number; sessions: number }>;
  weeklyBreakdown: Array<{ week: number; label: string; startDate: string; endDate: string; earnings: number; sessions: number }>;
  monthComparison: { currentMonth: { earnings: number; sessions: number }; previousMonth: { earnings: number; sessions: number }; changePercent: number; trend: string };
  yearlyTotal: { earnings: number; sessions: number; monthsTracked: number };
  cancellationImpact: { cancelledSessions: number; estimatedLoss: number; cancellationRate: number };
  workPatterns: { totalHoursWorked: number; avgHoursPerDay: number; activeDays: number; restDays: number; busiestDay: string; avgPerHour: number };
  streaks: { currentStreak: number; bestStreak: number; consecutiveMonthsAboveAvg: number };
  milestones: Array<{ id: string; title: string; description: string; achieved: boolean; progress?: number; icon: string }>;
  personalRecords: { bestMonth: { month: string; year: number; earnings: number }; bestDay: { date: string; earnings: number }; bestWeek: { weekStart: string; earnings: number }; isCurrentMonthRecord: boolean };
  currency: string;
  period: { month: number; year: number };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function SectionCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.glassCard, style]}>{children}</View>;
}

function SectionHeader({ icon, title, color, rightElement }: { icon: string; title: string; color?: string; rightElement?: React.ReactNode }) {
  const c = color || Colors.dark.primary;
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <View style={[styles.sectionIconContainer, { backgroundColor: `${c}15` }]}>
          <Ionicons name={icon as any} size={16} color={c} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {rightElement}
    </View>
  );
}

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

function BarChart({ data, maxValue, color }: { data: Array<{ label: string; value: number; subLabel?: string }>; maxValue: number; color: string }) {
  return (
    <View style={styles.barChartContainer}>
      {data.map((item, i) => {
        const barHeight = maxValue > 0 ? Math.max((item.value / maxValue) * 100, item.value > 0 ? 4 : 0) : 0;
        return (
          <View key={i} style={styles.barColumn}>
            <Text style={styles.barValue}>{item.value > 0 ? Math.round(item.value).toLocaleString() : "-"}</Text>
            <View style={styles.barTrack}>
              <LinearGradient
                colors={[color, `${color}60`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[styles.barFill, { height: `${barHeight}%` }]}
              />
            </View>
            <Text style={styles.barLabel}>{item.label}</Text>
            {item.subLabel ? <Text style={styles.barSubLabel}>{item.subLabel}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  const clampedProgress = Math.min(Math.max(progress, 0), 100);
  return (
    <View style={styles.progressTrack}>
      <LinearGradient
        colors={[color, `${color}80`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.progressFill, { width: `${clampedProgress}%` }]}
      />
    </View>
  );
}

export default function CoachEarningsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  });
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    weekday: true,
    sessionType: true,
    peakHours: false,
    topPlayers: false,
    weekly: false,
    workPatterns: false,
    cancellation: false,
    milestones: false,
  });

  const toggleSection = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const { data: summary, isLoading: loadingSummary } = useQuery<EarningsSummary>({
    queryKey: ["/api/coach/earnings/summary"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: breakdown, isLoading: loadingBreakdown } = useQuery<BreakdownData>({
    queryKey: [`/api/coach/earnings/breakdown?month=${selectedMonth.month}&year=${selectedMonth.year}`],
    enabled: showBreakdown,
  });

  const { data: history } = useQuery<{ history: HistoryItem[] }>({
    queryKey: ["/api/coach/earnings/history"],
  });

  const { data: analytics, isLoading: loadingAnalytics } = useQuery<Analytics>({
    queryKey: ["/api/coach/earnings/analytics"],
    staleTime: 5 * 60 * 1000,
  });

  const paymentRule = summary?.paymentRule;
  const realizedAmount = summary ? parseFloat(summary.realized.amount) : 0;
  const projectedAmount = summary ? parseFloat(summary.projected.amount) : 0;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  };
  const getSessionTypeLabel = (type: string) => {
    switch (type) {
      case "private": return "Private";
      case "semi": case "semi_private": return "Semi-Private";
      case "group": return "Group";
      default: return type;
    }
  };
  const sessionTypeColors: Record<string, string> = {
    private: Colors.dark.xpCyan,
    semi_private: Colors.dark.gold,
    group: Colors.dark.primary,
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={[styles.headerContainer, { paddingTop: insets.top }]}
      >
        <LinearGradient colors={[Colors.dark.primary, Colors.dark.xpCyan]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.headerTopLine} />
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>COACH EARNINGS</Text>
          <View style={styles.headerRight} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        {loadingSummary ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
          </View>
        ) : summary ? (
          <>
            {/* MAIN SUMMARY CARD */}
            <SectionCard>
              <LinearGradient colors={[`${Colors.dark.primary}20`, `${Colors.dark.xpCyan}10`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardGradientOverlay} />
              <View style={styles.summaryHeaderRow}>
                <Text style={styles.summaryTitle}>{summary.period.monthName} {summary.period.year}</Text>
                <View style={styles.periodBadge}>
                  <Ionicons name="calendar" size={12} color={Colors.dark.xpCyan} />
                  <Text style={styles.periodBadgeText}>CURRENT</Text>
                </View>
              </View>
              <View style={styles.mainAmounts}>
                <View style={styles.amountBlock}>
                  <View style={styles.amountHeader}>
                    <View style={styles.neonDot} />
                    <Text style={styles.amountLabel}>EARNED</Text>
                  </View>
                  <Text style={styles.neonAmount}>{summary.realized.currency} {realizedAmount.toLocaleString()}</Text>
                  <Text style={styles.amountSubtext}>{summary.realized.sessionsCount} completed</Text>
                </View>
                <View style={styles.amountDivider} />
                <View style={styles.amountBlock}>
                  <View style={styles.amountHeader}>
                    <View style={[styles.neonDot, { backgroundColor: Colors.dark.gold }]} />
                    <Text style={styles.amountLabel}>PROJECTED</Text>
                  </View>
                  <Text style={[styles.neonAmount, styles.projectedColor]}>{summary.projected.currency} {projectedAmount.toLocaleString()}</Text>
                  <Text style={styles.amountSubtext}>{summary.projected.sessionsCount} upcoming</Text>
                </View>
              </View>
            </SectionCard>

            {/* MONTH-OVER-MONTH COMPARISON */}
            {analytics?.monthComparison ? (
              <SectionCard>
                <View style={styles.comparisonRow}>
                  <View style={styles.comparisonLeft}>
                    <View style={[styles.trendBadge, { backgroundColor: analytics.monthComparison.trend === "up" ? `${Colors.dark.successNeon}15` : analytics.monthComparison.trend === "down" ? `${Colors.dark.error}15` : `${Colors.dark.textMuted}15` }]}>
                      <Ionicons 
                        name={analytics.monthComparison.trend === "up" ? "trending-up" : analytics.monthComparison.trend === "down" ? "trending-down" : "remove"} 
                        size={20} 
                        color={analytics.monthComparison.trend === "up" ? Colors.dark.successNeon : analytics.monthComparison.trend === "down" ? Colors.dark.error : Colors.dark.textMuted} 
                      />
                    </View>
                    <View>
                      <Text style={[styles.trendPercent, { color: analytics.monthComparison.trend === "up" ? Colors.dark.successNeon : analytics.monthComparison.trend === "down" ? Colors.dark.error : Colors.dark.textMuted }]}>
                        {analytics.monthComparison.changePercent > 0 ? "+" : ""}{analytics.monthComparison.changePercent.toFixed(1)}%
                      </Text>
                      <Text style={styles.trendLabel}>vs last month</Text>
                    </View>
                  </View>
                  <View style={styles.comparisonRight}>
                    <Text style={styles.comparisonPrev}>
                      Last: {analytics.currency} {analytics.monthComparison.previousMonth.earnings.toLocaleString()}
                    </Text>
                    <Text style={styles.comparisonPrevSub}>{analytics.monthComparison.previousMonth.sessions} lessons</Text>
                  </View>
                </View>
                {analytics.personalRecords?.isCurrentMonthRecord ? (
                  <View style={styles.recordBanner}>
                    <Ionicons name="star" size={14} color={Colors.dark.gold} />
                    <Text style={styles.recordText}>New Personal Record Month!</Text>
                  </View>
                ) : null}
              </SectionCard>
            ) : null}

            {/* YEARLY TOTAL */}
            {analytics?.yearlyTotal ? (
              <SectionCard>
                <View style={styles.yearlyRow}>
                  <View style={[styles.sectionIconContainer, { backgroundColor: `${Colors.dark.gold}15` }]}>
                    <Ionicons name="trophy" size={16} color={Colors.dark.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.yearlyLabel}>{new Date().getFullYear()} Total</Text>
                    <Text style={styles.yearlyAmount}>{analytics.currency} {analytics.yearlyTotal.earnings.toLocaleString()}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.yearlySessionCount}>{analytics.yearlyTotal.sessions} lessons</Text>
                    <Text style={styles.yearlySub}>{analytics.yearlyTotal.monthsTracked} months</Text>
                  </View>
                </View>
              </SectionCard>
            ) : null}

            {/* PAYMENT RULE */}
            <SectionCard>
              <View style={styles.ruleHeader}>
                <View style={[styles.sectionIconContainer, { backgroundColor: `${Colors.dark.xpCyan}15` }]}>
                  <Ionicons name="card" size={16} color={Colors.dark.xpCyan} />
                </View>
                <Text style={styles.ruleTitle}>PAYMENT RULE</Text>
                {paymentRule?.isDefault ? (
                  <View style={styles.defaultBadge}><Text style={styles.defaultBadgeText}>DEFAULT</Text></View>
                ) : null}
              </View>
              <View style={styles.ruleContent}>
                <Text style={styles.ruleType}>
                  {paymentRule?.type === "hourly" ? "Hourly Rate" : paymentRule?.type === "percentage" ? "Revenue Share" : paymentRule?.type === "per_session" ? "Per Session" : "Hybrid"}
                </Text>
                {paymentRule?.type === "hourly" && paymentRule?.hourlyRate ? (
                  <Text style={styles.ruleValue}>{paymentRule.currency} {paymentRule.hourlyRate}/hour</Text>
                ) : paymentRule?.type === "percentage" && paymentRule?.percentageRate ? (
                  <Text style={styles.ruleValue}>{paymentRule.percentageRate}% of session revenue</Text>
                ) : null}
              </View>
              <Text style={styles.ruleNote}>Set by academy owner</Text>
            </SectionCard>

            {/* WEEKDAY BREAKDOWN */}
            {analytics ? (
              <SectionCard>
                <Pressable onPress={() => toggleSection("weekday")}>
                  <SectionHeader icon="bar-chart" title="EARNINGS BY DAY" color={Colors.dark.primary} rightElement={
                    <Ionicons name={expandedSections.weekday ? "chevron-up" : "chevron-down"} size={18} color={Colors.dark.xpCyan} />
                  } />
                </Pressable>
                {expandedSections.weekday ? (
                  <View style={{ marginTop: Spacing.md }}>
                    <BarChart
                      data={analytics.weekdayBreakdown.map(d => ({ label: d.day, value: d.earnings, subLabel: `${d.sessions}` }))}
                      maxValue={Math.max(...analytics.weekdayBreakdown.map(d => d.earnings))}
                      color={Colors.dark.primary}
                    />
                    {analytics.workPatterns?.busiestDay ? (
                      <View style={styles.bestDayBanner}>
                        <Ionicons name="flash" size={14} color={Colors.dark.gold} />
                        <Text style={styles.bestDayText}>Best day: <Text style={{ color: Colors.dark.gold, fontWeight: "700" }}>{analytics.workPatterns.busiestDay}</Text></Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </SectionCard>
            ) : null}

            {/* SESSION TYPE BREAKDOWN */}
            {analytics?.sessionTypeBreakdown?.length ? (
              <SectionCard>
                <Pressable onPress={() => toggleSection("sessionType")}>
                  <SectionHeader icon="pie-chart" title="BY SESSION TYPE" color={Colors.dark.xpCyan} rightElement={
                    <Ionicons name={expandedSections.sessionType ? "chevron-up" : "chevron-down"} size={18} color={Colors.dark.xpCyan} />
                  } />
                </Pressable>
                {expandedSections.sessionType ? (
                  <View style={{ marginTop: Spacing.md }}>
                    {analytics.sessionTypeBreakdown.map(item => {
                      const barColor = sessionTypeColors[item.type] || Colors.dark.primary;
                      return (
                        <View key={item.type} style={styles.typeRow}>
                          <View style={styles.typeLeft}>
                            <View style={[styles.typeDot, { backgroundColor: barColor }]} />
                            <Text style={styles.typeLabel}>{item.label}</Text>
                          </View>
                          <View style={styles.typeBarContainer}>
                            <View style={styles.typeBarTrack}>
                              <LinearGradient
                                colors={[barColor, `${barColor}40`]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={[styles.typeBarFill, { width: `${item.percentage}%` }]}
                              />
                            </View>
                          </View>
                          <View style={styles.typeRight}>
                            <Text style={styles.typeAmount}>{analytics.currency} {item.earnings.toLocaleString()}</Text>
                            <Text style={styles.typeSessions}>{item.sessions} / {item.percentage}%</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </SectionCard>
            ) : null}

            {/* PEAK HOURS */}
            {analytics?.peakHours ? (
              <SectionCard>
                <Pressable onPress={() => toggleSection("peakHours")}>
                  <SectionHeader icon="sunny" title="PEAK HOURS" color={Colors.dark.gold} rightElement={
                    <Ionicons name={expandedSections.peakHours ? "chevron-up" : "chevron-down"} size={18} color={Colors.dark.xpCyan} />
                  } />
                </Pressable>
                {expandedSections.peakHours ? (
                  <View style={{ marginTop: Spacing.md }}>
                    {(["morning", "afternoon", "evening"] as const).map(period => {
                      const data = analytics.peakHours[period];
                      const icons = { morning: "sunny-outline", afternoon: "partly-sunny", evening: "moon" } as const;
                      const colors = { morning: Colors.dark.gold, afternoon: Colors.dark.primary, evening: Colors.dark.xpCyan };
                      const maxEarnings = Math.max(analytics.peakHours.morning.earnings, analytics.peakHours.afternoon.earnings, analytics.peakHours.evening.earnings);
                      const pct = maxEarnings > 0 ? (data.earnings / maxEarnings) * 100 : 0;
                      return (
                        <View key={period} style={styles.peakRow}>
                          <View style={styles.peakLeft}>
                            <Ionicons name={icons[period] as any} size={18} color={colors[period]} />
                            <View>
                              <Text style={styles.peakLabel}>{period.charAt(0).toUpperCase() + period.slice(1)}</Text>
                              <Text style={styles.peakTime}>{data.label}</Text>
                            </View>
                          </View>
                          <View style={styles.peakBarContainer}>
                            <View style={styles.typeBarTrack}>
                              <LinearGradient
                                colors={[colors[period], `${colors[period]}40`]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={[styles.typeBarFill, { width: `${pct}%` }]}
                              />
                            </View>
                          </View>
                          <View style={{ alignItems: "flex-end", minWidth: 70 }}>
                            <Text style={styles.peakAmount}>{analytics.currency} {data.earnings.toLocaleString()}</Text>
                            <Text style={styles.peakSessions}>{data.sessions} lessons</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </SectionCard>
            ) : null}

            {/* TOP PLAYERS */}
            {analytics?.topPlayers?.length ? (
              <SectionCard>
                <Pressable onPress={() => toggleSection("topPlayers")}>
                  <SectionHeader icon="people" title="TOP PLAYERS" color={Colors.dark.successNeon} rightElement={
                    <Ionicons name={expandedSections.topPlayers ? "chevron-up" : "chevron-down"} size={18} color={Colors.dark.xpCyan} />
                  } />
                </Pressable>
                {expandedSections.topPlayers ? (
                  <View style={{ marginTop: Spacing.md }}>
                    {analytics.topPlayers.map((player, i) => (
                      <View key={player.playerId} style={styles.playerRow}>
                        <View style={[styles.rankBadge, i === 0 && styles.rankGold, i === 1 && styles.rankSilver, i === 2 && styles.rankBronze]}>
                          <Text style={styles.rankText}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.playerName}>{player.playerName}</Text>
                          <Text style={styles.playerSessions}>{player.sessions} lessons</Text>
                        </View>
                        <Text style={styles.playerEarnings}>{analytics.currency} {player.earnings.toLocaleString()}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </SectionCard>
            ) : null}

            {/* WEEKLY BREAKDOWN */}
            {analytics?.weeklyBreakdown?.length ? (
              <SectionCard>
                <Pressable onPress={() => toggleSection("weekly")}>
                  <SectionHeader icon="calendar" title="WEEKLY BREAKDOWN" color={Colors.dark.xpCyan} rightElement={
                    <Ionicons name={expandedSections.weekly ? "chevron-up" : "chevron-down"} size={18} color={Colors.dark.xpCyan} />
                  } />
                </Pressable>
                {expandedSections.weekly ? (
                  <View style={{ marginTop: Spacing.md }}>
                    <BarChart
                      data={analytics.weeklyBreakdown.map(w => ({ label: w.label, value: w.earnings, subLabel: `${w.sessions} lessons` }))}
                      maxValue={Math.max(...analytics.weeklyBreakdown.map(w => w.earnings))}
                      color={Colors.dark.xpCyan}
                    />
                  </View>
                ) : null}
              </SectionCard>
            ) : null}

            {/* WORK PATTERNS */}
            {analytics?.workPatterns ? (
              <SectionCard>
                <Pressable onPress={() => toggleSection("workPatterns")}>
                  <SectionHeader icon="fitness" title="WORK PATTERNS" color={Colors.dark.primary} rightElement={
                    <Ionicons name={expandedSections.workPatterns ? "chevron-up" : "chevron-down"} size={18} color={Colors.dark.xpCyan} />
                  } />
                </Pressable>
                {expandedSections.workPatterns ? (
                  <View style={{ marginTop: Spacing.md }}>
                    <View style={styles.workGrid}>
                      <View style={styles.workStatBox}>
                        <Ionicons name="time-outline" size={20} color={Colors.dark.xpCyan} />
                        <Text style={styles.workStatValue}>{analytics.workPatterns.totalHoursWorked}h</Text>
                        <Text style={styles.workStatLabel}>Total Hours</Text>
                      </View>
                      <View style={styles.workStatBox}>
                        <Ionicons name="speedometer-outline" size={20} color={Colors.dark.primary} />
                        <Text style={styles.workStatValue}>{analytics.workPatterns.avgHoursPerDay.toFixed(1)}h</Text>
                        <Text style={styles.workStatLabel}>Avg/Day</Text>
                      </View>
                      <View style={styles.workStatBox}>
                        <Ionicons name="flash-outline" size={20} color={Colors.dark.gold} />
                        <Text style={styles.workStatValue}>{analytics.currency} {analytics.workPatterns.avgPerHour}</Text>
                        <Text style={styles.workStatLabel}>Per Hour</Text>
                      </View>
                    </View>
                    <View style={styles.workBalanceRow}>
                      <View style={styles.workBalanceItem}>
                        <Text style={styles.workBalanceValue}>{analytics.workPatterns.activeDays}</Text>
                        <Text style={styles.workBalanceLabel}>Active Days</Text>
                      </View>
                      <View style={[styles.workBalanceBar]}>
                        <View style={[styles.workActiveBar, { flex: analytics.workPatterns.activeDays || 1 }]}>
                          <LinearGradient colors={[Colors.dark.primary, Colors.dark.successNeon]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.workBarFill} />
                        </View>
                        <View style={[styles.workRestBar, { flex: analytics.workPatterns.restDays || 1 }]} />
                      </View>
                      <View style={styles.workBalanceItem}>
                        <Text style={styles.workBalanceValue}>{analytics.workPatterns.restDays}</Text>
                        <Text style={styles.workBalanceLabel}>Rest Days</Text>
                      </View>
                    </View>
                  </View>
                ) : null}
              </SectionCard>
            ) : null}

            {/* CANCELLATION IMPACT */}
            {analytics?.cancellationImpact && analytics.cancellationImpact.cancelledSessions > 0 ? (
              <SectionCard>
                <Pressable onPress={() => toggleSection("cancellation")}>
                  <SectionHeader icon="close-circle" title="CANCELLATION IMPACT" color={Colors.dark.error} rightElement={
                    <Ionicons name={expandedSections.cancellation ? "chevron-up" : "chevron-down"} size={18} color={Colors.dark.xpCyan} />
                  } />
                </Pressable>
                {expandedSections.cancellation ? (
                  <View style={{ marginTop: Spacing.md }}>
                    <View style={styles.cancelGrid}>
                      <View style={styles.cancelStatBox}>
                        <Text style={[styles.cancelStatValue, { color: Colors.dark.error }]}>{analytics.cancellationImpact.cancelledSessions}</Text>
                        <Text style={styles.cancelStatLabel}>Cancelled</Text>
                      </View>
                      <View style={styles.cancelStatBox}>
                        <Text style={[styles.cancelStatValue, { color: Colors.dark.error }]}>{analytics.currency} {analytics.cancellationImpact.estimatedLoss.toLocaleString()}</Text>
                        <Text style={styles.cancelStatLabel}>Est. Loss</Text>
                      </View>
                      <View style={styles.cancelStatBox}>
                        <Text style={[styles.cancelStatValue, { color: Colors.dark.gold }]}>{analytics.cancellationImpact.cancellationRate}%</Text>
                        <Text style={styles.cancelStatLabel}>Cancel Rate</Text>
                      </View>
                    </View>
                  </View>
                ) : null}
              </SectionCard>
            ) : null}

            {/* STREAKS & MILESTONES */}
            {analytics?.milestones?.length ? (
              <SectionCard>
                <Pressable onPress={() => toggleSection("milestones")}>
                  <SectionHeader icon="ribbon" title="ACHIEVEMENTS" color={Colors.dark.gold} rightElement={
                    <Ionicons name={expandedSections.milestones ? "chevron-up" : "chevron-down"} size={18} color={Colors.dark.xpCyan} />
                  } />
                </Pressable>
                {expandedSections.milestones ? (
                  <View style={{ marginTop: Spacing.md }}>
                    {analytics.streaks ? (
                      <View style={styles.streakRow}>
                        <View style={styles.streakItem}>
                          <Ionicons name="flame" size={20} color={Colors.dark.gold} />
                          <Text style={styles.streakValue}>{analytics.streaks.currentStreak}</Text>
                          <Text style={styles.streakLabel}>Day Streak</Text>
                        </View>
                        <View style={styles.streakItem}>
                          <Ionicons name="star" size={20} color={Colors.dark.primary} />
                          <Text style={styles.streakValue}>{analytics.streaks.bestStreak}</Text>
                          <Text style={styles.streakLabel}>Best Streak</Text>
                        </View>
                        <View style={styles.streakItem}>
                          <Ionicons name="trending-up" size={20} color={Colors.dark.successNeon} />
                          <Text style={styles.streakValue}>{analytics.streaks.consecutiveMonthsAboveAvg}</Text>
                          <Text style={styles.streakLabel}>Months Above Avg</Text>
                        </View>
                      </View>
                    ) : null}
                    {analytics.milestones.map(milestone => (
                      <View key={milestone.id} style={[styles.milestoneRow, milestone.achieved && styles.milestoneAchieved]}>
                        <View style={[styles.milestoneIcon, { backgroundColor: milestone.achieved ? `${Colors.dark.gold}20` : `${Colors.dark.textMuted}10` }]}>
                          <Ionicons
                            name={(milestone.icon === "trophy" ? "trophy" : milestone.icon === "cash" ? "cash" : milestone.icon === "diamond" ? "diamond" : milestone.icon === "medal" ? "medal" : "star") as any}
                            size={20}
                            color={milestone.achieved ? Colors.dark.gold : Colors.dark.textMuted}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.milestoneTitle, milestone.achieved && { color: Colors.dark.gold }]}>{milestone.title}</Text>
                          <Text style={styles.milestoneDesc}>{milestone.description}</Text>
                          {!milestone.achieved && milestone.progress != null ? (
                            <View style={{ marginTop: 4 }}>
                              <ProgressBar progress={milestone.progress} color={Colors.dark.primary} />
                              <Text style={styles.milestoneProgress}>{milestone.progress}%</Text>
                            </View>
                          ) : null}
                        </View>
                        {milestone.achieved ? (
                          <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}
              </SectionCard>
            ) : null}

            {/* PERSONAL RECORDS */}
            {analytics?.personalRecords ? (
              <SectionCard>
                <SectionHeader icon="podium" title="PERSONAL RECORDS" color={Colors.dark.gold} />
                <View style={{ marginTop: Spacing.md }}>
                  {analytics.personalRecords.bestMonth?.earnings > 0 ? (
                    <StatRow label="Best Month" value={`${analytics.personalRecords.bestMonth.month} ${analytics.personalRecords.bestMonth.year} - ${analytics.currency} ${analytics.personalRecords.bestMonth.earnings.toLocaleString()}`} valueColor={Colors.dark.gold} />
                  ) : null}
                  {analytics.personalRecords.bestDay?.earnings > 0 ? (
                    <StatRow label="Best Day" value={`${analytics.currency} ${analytics.personalRecords.bestDay.earnings.toLocaleString()}`} valueColor={Colors.dark.successNeon} />
                  ) : null}
                  {analytics.personalRecords.bestWeek?.earnings > 0 ? (
                    <StatRow label="Best Week" value={`${analytics.currency} ${analytics.personalRecords.bestWeek.earnings.toLocaleString()}`} valueColor={Colors.dark.xpCyan} />
                  ) : null}
                </View>
              </SectionCard>
            ) : null}

            {/* SESSION BREAKDOWN */}
            <SectionCard>
              <Pressable
                style={styles.sectionHeader}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowBreakdown(!showBreakdown); }}
              >
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionIconContainer}><Ionicons name="list" size={16} color={Colors.dark.primary} /></View>
                  <Text style={styles.sectionTitle}>SESSION BREAKDOWN</Text>
                </View>
                <Ionicons name={showBreakdown ? "chevron-up" : "chevron-down"} size={18} color={Colors.dark.xpCyan} />
              </Pressable>
              {showBreakdown ? (
                loadingBreakdown ? (
                  <View style={styles.breakdownLoading}><ActivityIndicator size="small" color={Colors.dark.primary} /></View>
                ) : breakdown?.breakdown.length === 0 ? (
                  <View style={styles.emptyBreakdown}>
                    <Ionicons name="calendar-outline" size={32} color={Colors.dark.textMuted} />
                    <Text style={styles.emptyText}>No completed sessions this month</Text>
                  </View>
                ) : (
                  <View style={styles.breakdownList}>
                    {breakdown?.breakdown.map((item) => (
                      <View key={item.id} style={styles.breakdownItem}>
                        <View style={styles.breakdownLeft}>
                          <Text style={styles.breakdownDate}>{formatDate(item.date)}</Text>
                          <Text style={styles.breakdownTime}>{formatTime(item.date)}</Text>
                        </View>
                        <View style={styles.breakdownMiddle}>
                          <Text style={styles.breakdownType}>{getSessionTypeLabel(item.sessionType)}</Text>
                          <Text style={styles.breakdownDuration}>{item.duration} min</Text>
                        </View>
                        <View style={styles.breakdownRight}>
                          <Text style={styles.breakdownAmount}>{item.currency} {parseFloat(item.amount).toLocaleString()}</Text>
                        </View>
                      </View>
                    ))}
                    {breakdown?.summary ? (
                      <View style={styles.breakdownSummary}>
                        <StatRow label="Total Earned" value={`${breakdown.summary.currency} ${parseFloat(breakdown.summary.totalEarned).toLocaleString()}`} valueColor={Colors.dark.xpCyan} />
                        <StatRow label="Avg per Lesson" value={`${breakdown.summary.currency} ${parseFloat(breakdown.summary.avgPerLesson).toLocaleString()}`} valueColor={Colors.dark.xpCyan} />
                      </View>
                    ) : null}
                  </View>
                )
              ) : null}
            </SectionCard>

            {/* HISTORY */}
            <SectionCard>
              <SectionHeader icon="time" title="HISTORY" color={Colors.dark.gold} />
              <View style={styles.historyList}>
                {history?.history.map((item, index) => (
                  <Pressable
                    key={`${item.month}-${item.year}`}
                    style={[styles.historyItem, index === 0 && styles.historyItemCurrent]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedMonth({ month: item.month, year: item.year });
                      setShowBreakdown(true);
                    }}
                  >
                    <View style={styles.historyLeft}>
                      <Text style={[styles.historyMonth, index === 0 && styles.historyCurrentText]}>{item.monthName}</Text>
                      <Text style={styles.historyYear}>{item.year}</Text>
                    </View>
                    <View style={styles.historyMiddle}>
                      <Text style={styles.historySessions}>{item.totalSessions} lessons</Text>
                    </View>
                    <View style={styles.historyRight}>
                      <Text style={[styles.historyAmount, index === 0 && styles.historyCurrentAmount]}>
                        {item.currency} {parseFloat(item.totalEarned).toLocaleString()}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </SectionCard>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  headerContainer: { paddingBottom: Spacing.md },
  headerTopLine: { height: 3, width: "100%" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${Colors.dark.primary}30` },
  headerTitle: { ...Typography.h3, color: Colors.dark.text, letterSpacing: 2, textTransform: "uppercase" },
  headerRight: { width: 40 },
  content: { flex: 1 },
  contentContainer: { padding: Spacing.lg },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  glassCard: { backgroundColor: "rgba(18,18,22,0.9)", borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: `${Colors.dark.primary}20`, overflow: "hidden" },
  cardGradientOverlay: { position: "absolute", top: 0, left: 0, right: 0, height: 100 },
  summaryHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.lg },
  summaryTitle: { ...Typography.h3, color: Colors.dark.text },
  periodBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${Colors.dark.xpCyan}15`, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.sm },
  periodBadgeText: { ...Typography.caption, color: Colors.dark.xpCyan, fontWeight: "700", letterSpacing: 1 },
  mainAmounts: { flexDirection: "row" },
  amountBlock: { flex: 1 },
  amountHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: Spacing.xs },
  neonDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.dark.successNeon },
  amountLabel: { ...Typography.caption, color: Colors.dark.textMuted, letterSpacing: 1 },
  neonAmount: { fontSize: 28, fontWeight: "800", color: Colors.dark.successNeon, marginBottom: 4, textShadowColor: Colors.dark.successNeon, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
  projectedColor: { color: Colors.dark.gold, textShadowColor: Colors.dark.gold },
  amountSubtext: { ...Typography.caption, color: Colors.dark.textMuted },
  amountDivider: { width: 1, backgroundColor: `${Colors.dark.primary}30`, marginHorizontal: Spacing.lg },

  comparisonRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  comparisonLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  trendBadge: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  trendPercent: { fontSize: 18, fontWeight: "800" },
  trendLabel: { ...Typography.caption, color: Colors.dark.textMuted },
  comparisonRight: { alignItems: "flex-end" },
  comparisonPrev: { ...Typography.small, color: Colors.dark.textMuted },
  comparisonPrevSub: { ...Typography.caption, color: Colors.dark.textMuted },
  recordBanner: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: Spacing.sm, backgroundColor: `${Colors.dark.gold}15`, padding: Spacing.sm, borderRadius: BorderRadius.sm },
  recordText: { ...Typography.small, color: Colors.dark.gold, fontWeight: "600" },

  yearlyRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  yearlyLabel: { ...Typography.caption, color: Colors.dark.textMuted, letterSpacing: 1 },
  yearlyAmount: { fontSize: 20, fontWeight: "800", color: Colors.dark.primary },
  yearlySessionCount: { ...Typography.small, color: Colors.dark.text, fontWeight: "600" },
  yearlySub: { ...Typography.caption, color: Colors.dark.textMuted },

  ruleHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.sm },
  ruleTitle: { ...Typography.body, fontWeight: "600", color: Colors.dark.text, flex: 1, letterSpacing: 1 },
  defaultBadge: { backgroundColor: `${Colors.dark.textMuted}20`, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  defaultBadgeText: { ...Typography.caption, color: Colors.dark.textMuted, fontSize: 10, letterSpacing: 0.5 },
  ruleContent: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.sm },
  ruleType: { ...Typography.small, color: Colors.dark.text },
  ruleValue: { ...Typography.body, fontWeight: "700", color: Colors.dark.xpCyan },
  ruleNote: { ...Typography.caption, color: Colors.dark.textMuted, fontStyle: "italic" },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: Spacing.sm },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  sectionIconContainer: { width: 28, height: 28, borderRadius: 6, backgroundColor: `${Colors.dark.primary}15`, alignItems: "center", justifyContent: "center" },
  sectionTitle: { ...Typography.small, fontWeight: "700", color: Colors.dark.text, letterSpacing: 1, textTransform: "uppercase" },

  barChartContainer: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 160, gap: 4 },
  barColumn: { flex: 1, alignItems: "center", height: "100%", justifyContent: "flex-end" },
  barValue: { ...Typography.caption, color: Colors.dark.textMuted, fontSize: 9, marginBottom: 4, textAlign: "center" },
  barTrack: { width: "70%", flex: 1, backgroundColor: `${Colors.dark.text}08`, borderRadius: 4, overflow: "hidden", justifyContent: "flex-end" },
  barFill: { width: "100%", borderRadius: 4, minHeight: 0 },
  barLabel: { ...Typography.caption, color: Colors.dark.text, fontWeight: "600", marginTop: 4, fontSize: 10 },
  barSubLabel: { ...Typography.caption, color: Colors.dark.textMuted, fontSize: 9 },

  bestDayBanner: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: Spacing.md, padding: Spacing.sm, backgroundColor: `${Colors.dark.gold}10`, borderRadius: BorderRadius.sm },
  bestDayText: { ...Typography.small, color: Colors.dark.textMuted },

  typeRow: { flexDirection: "row", alignItems: "center", marginBottom: Spacing.md, gap: Spacing.sm },
  typeLeft: { flexDirection: "row", alignItems: "center", gap: 6, width: 90 },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  typeLabel: { ...Typography.small, color: Colors.dark.text },
  typeBarContainer: { flex: 1 },
  typeBarTrack: { height: 8, backgroundColor: `${Colors.dark.text}10`, borderRadius: 4, overflow: "hidden" },
  typeBarFill: { height: "100%", borderRadius: 4 },
  typeRight: { alignItems: "flex-end", minWidth: 80 },
  typeAmount: { ...Typography.small, fontWeight: "700", color: Colors.dark.text },
  typeSessions: { ...Typography.caption, color: Colors.dark.textMuted },

  peakRow: { flexDirection: "row", alignItems: "center", marginBottom: Spacing.md, gap: Spacing.sm },
  peakLeft: { flexDirection: "row", alignItems: "center", gap: 8, width: 90 },
  peakLabel: { ...Typography.small, color: Colors.dark.text, fontWeight: "500" },
  peakTime: { ...Typography.caption, color: Colors.dark.textMuted, fontSize: 9 },
  peakBarContainer: { flex: 1 },
  peakAmount: { ...Typography.small, fontWeight: "700", color: Colors.dark.text },
  peakSessions: { ...Typography.caption, color: Colors.dark.textMuted },

  playerRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.md },
  rankBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: `${Colors.dark.textMuted}20`, alignItems: "center", justifyContent: "center" },
  rankGold: { backgroundColor: `${Colors.dark.gold}25`, borderWidth: 1, borderColor: `${Colors.dark.gold}50` },
  rankSilver: { backgroundColor: "rgba(192,192,192,0.15)", borderWidth: 1, borderColor: "rgba(192,192,192,0.3)" },
  rankBronze: { backgroundColor: "rgba(205,127,50,0.15)", borderWidth: 1, borderColor: "rgba(205,127,50,0.3)" },
  rankText: { ...Typography.caption, fontWeight: "800", color: Colors.dark.text },
  playerName: { ...Typography.small, fontWeight: "600", color: Colors.dark.text },
  playerSessions: { ...Typography.caption, color: Colors.dark.textMuted },
  playerEarnings: { ...Typography.body, fontWeight: "700", color: Colors.dark.successNeon },

  workGrid: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.md },
  workStatBox: { flex: 1, backgroundColor: `${Colors.dark.text}06`, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: "center", gap: 4 },
  workStatValue: { ...Typography.body, fontWeight: "800", color: Colors.dark.text },
  workStatLabel: { ...Typography.caption, color: Colors.dark.textMuted, fontSize: 10 },
  workBalanceRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  workBalanceItem: { alignItems: "center", minWidth: 40 },
  workBalanceValue: { ...Typography.body, fontWeight: "700", color: Colors.dark.text },
  workBalanceLabel: { ...Typography.caption, color: Colors.dark.textMuted, fontSize: 9 },
  workBalanceBar: { flex: 1, flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", gap: 2 },
  workActiveBar: { borderRadius: 6, overflow: "hidden" },
  workBarFill: { flex: 1, borderRadius: 6 },
  workRestBar: { backgroundColor: `${Colors.dark.textMuted}20`, borderRadius: 6 },

  cancelGrid: { flexDirection: "row", gap: Spacing.sm },
  cancelStatBox: { flex: 1, backgroundColor: `${Colors.dark.error}08`, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: "center", gap: 4 },
  cancelStatValue: { ...Typography.body, fontWeight: "800" },
  cancelStatLabel: { ...Typography.caption, color: Colors.dark.textMuted, fontSize: 10 },

  streakRow: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.lg },
  streakItem: { flex: 1, alignItems: "center", gap: 4, backgroundColor: `${Colors.dark.text}06`, borderRadius: BorderRadius.md, padding: Spacing.md },
  streakValue: { fontSize: 22, fontWeight: "800", color: Colors.dark.text },
  streakLabel: { ...Typography.caption, color: Colors.dark.textMuted, fontSize: 9, textAlign: "center" },

  milestoneRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.sm, padding: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: `${Colors.dark.text}04` },
  milestoneAchieved: { backgroundColor: `${Colors.dark.gold}08`, borderWidth: 1, borderColor: `${Colors.dark.gold}20` },
  milestoneIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  milestoneTitle: { ...Typography.small, fontWeight: "700", color: Colors.dark.text },
  milestoneDesc: { ...Typography.caption, color: Colors.dark.textMuted },
  milestoneProgress: { ...Typography.caption, color: Colors.dark.textMuted, fontSize: 9, marginTop: 2 },

  progressTrack: { height: 4, backgroundColor: `${Colors.dark.text}10`, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },

  statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.sm },
  statLabel: { ...Typography.small, color: Colors.dark.textMuted },
  statValue: { ...Typography.small, fontWeight: "600", color: Colors.dark.text, flexShrink: 1, textAlign: "right", maxWidth: "60%" },

  breakdownLoading: { padding: Spacing.xl, alignItems: "center" },
  emptyBreakdown: { padding: Spacing.xl, alignItems: "center", gap: Spacing.sm },
  emptyText: { ...Typography.small, color: Colors.dark.textMuted },
  breakdownList: { paddingTop: Spacing.md },
  breakdownItem: { flexDirection: "row", alignItems: "center", paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: `${Colors.dark.text}10` },
  breakdownLeft: { width: 80 },
  breakdownDate: { ...Typography.small, fontWeight: "500", color: Colors.dark.text },
  breakdownTime: { ...Typography.caption, color: Colors.dark.textMuted },
  breakdownMiddle: { flex: 1, paddingHorizontal: Spacing.sm },
  breakdownType: { ...Typography.small, color: Colors.dark.text },
  breakdownDuration: { ...Typography.caption, color: Colors.dark.textMuted },
  breakdownRight: { alignItems: "flex-end" },
  breakdownAmount: { ...Typography.body, fontWeight: "600", color: Colors.dark.successNeon },
  breakdownSummary: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: `${Colors.dark.primary}20` },

  historyList: { paddingTop: Spacing.md },
  historyItem: { flexDirection: "row", alignItems: "center", paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: `${Colors.dark.text}10` },
  historyItemCurrent: { backgroundColor: `${Colors.dark.primary}10`, marginHorizontal: -Spacing.lg, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: `${Colors.dark.primary}30` },
  historyLeft: { width: 100 },
  historyMonth: { ...Typography.small, fontWeight: "500", color: Colors.dark.text },
  historyCurrentText: { color: Colors.dark.primary, fontWeight: "700" },
  historyYear: { ...Typography.caption, color: Colors.dark.textMuted },
  historyMiddle: { flex: 1 },
  historySessions: { ...Typography.small, color: Colors.dark.textMuted },
  historyRight: { alignItems: "flex-end" },
  historyAmount: { ...Typography.body, fontWeight: "600", color: Colors.dark.text },
  historyCurrentAmount: { color: Colors.dark.successNeon },
});
