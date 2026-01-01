import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface EarningsSummary {
  realized: {
    amount: string;
    currency: string;
    sessionsCount: number;
    status: string;
  };
  projected: {
    amount: string;
    currency: string;
    sessionsCount: number;
    status: string;
  };
  total: {
    amount: string;
    currency: string;
  };
  paymentRule: {
    type: string;
    hourlyRate: string | null;
    currency: string;
  };
  period: {
    month: number;
    year: number;
    monthName: string;
  };
}

interface BreakdownItem {
  id: string;
  date: string;
  sessionType: string;
  duration: number;
  amount: string;
  currency: string;
  status: string;
}

interface BreakdownData {
  breakdown: BreakdownItem[];
  summary: {
    totalEarned: string;
    totalSessions: number;
    avgPerLesson: string;
    currency: string;
  };
  period: {
    month: number;
    year: number;
  };
}

interface HistoryItem {
  month: number;
  year: number;
  monthName: string;
  totalEarned: string;
  totalSessions: number;
  avgPerLesson: string;
  currency: string;
}

interface PaymentRuleData {
  type: string;
  hourlyRate: string | null;
  privateSessionRate: string | null;
  groupSessionRate: string | null;
  commissionPercentage: string | null;
  hybridBaseRate: string | null;
  hybridCommissionPercentage: string | null;
  currency: string;
  isDefault: boolean;
}

export default function CoachEarningsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  });
  const [showBreakdown, setShowBreakdown] = useState(false);

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

  const { data: paymentRule } = useQuery<PaymentRuleData>({
    queryKey: ["/api/coach/payment-rule"],
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { 
      weekday: "short",
      month: "short", 
      day: "numeric" 
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", { 
      hour: "2-digit", 
      minute: "2-digit",
      hour12: false 
    });
  };

  const getSessionTypeLabel = (type: string) => {
    switch (type) {
      case "private": return "Private";
      case "semi": return "Semi-Private";
      case "group": return "Group";
      case "physical": return "Physical";
      default: return type;
    }
  };

  const realizedAmount = summary ? parseFloat(summary.realized.amount) : 0;
  const projectedAmount = summary ? parseFloat(summary.projected.amount) : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Coach Earnings</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {loadingSummary ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
          </View>
        ) : summary ? (
          <>
            <LinearGradient
              colors={[`${Colors.dark.primary}30`, `${Colors.dark.primary}10`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.summaryCard}
            >
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryTitle}>{summary.period.monthName} {summary.period.year}</Text>
              </View>

              <View style={styles.mainAmounts}>
                <View style={styles.amountBlock}>
                  <View style={styles.amountHeader}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.dark.successNeon} />
                    <Text style={styles.amountLabel}>This month earned</Text>
                  </View>
                  <Text style={styles.mainAmount}>
                    {summary.realized.currency} {realizedAmount.toLocaleString()}
                  </Text>
                  <Text style={styles.amountSubtext}>
                    {summary.realized.sessionsCount} completed lessons
                  </Text>
                </View>

                <View style={styles.amountDivider} />

                <View style={styles.amountBlock}>
                  <View style={styles.amountHeader}>
                    <Ionicons name="time-outline" size={16} color={Colors.dark.gold} />
                    <Text style={styles.amountLabel}>Expected this month</Text>
                  </View>
                  <Text style={[styles.mainAmount, styles.projectedColor]}>
                    {summary.projected.currency} {projectedAmount.toLocaleString()}
                  </Text>
                  <Text style={styles.amountSubtext}>
                    {summary.projected.sessionsCount} upcoming lessons
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.paymentRuleCard}>
              <View style={styles.ruleHeader}>
                <Ionicons name="card-outline" size={18} color={Colors.dark.primary} />
                <Text style={styles.ruleTitle}>Payment Rule</Text>
                {paymentRule?.isDefault ? (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.ruleContent}>
                <Text style={styles.ruleType}>
                  {paymentRule?.type === "hourly" ? "Hourly Rate" : 
                   paymentRule?.type === "commission" ? "Commission Based" : 
                   "Hybrid"}
                </Text>
                {paymentRule?.hourlyRate ? (
                  <Text style={styles.ruleValue}>
                    {paymentRule.currency} {paymentRule.hourlyRate}/hour
                  </Text>
                ) : null}
              </View>
              <Text style={styles.ruleNote}>
                Payment rules are set by your academy owner
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <Pressable 
                style={styles.sectionHeader}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowBreakdown(!showBreakdown);
                }}
              >
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="list-outline" size={18} color={Colors.dark.text} />
                  <Text style={styles.sectionTitle}>Session Breakdown</Text>
                </View>
                <Ionicons 
                  name={showBreakdown ? "chevron-up" : "chevron-down"} 
                  size={20} 
                  color={Colors.dark.textMuted} 
                />
              </Pressable>

              {showBreakdown ? (
                loadingBreakdown ? (
                  <View style={styles.breakdownLoading}>
                    <ActivityIndicator size="small" color={Colors.dark.primary} />
                  </View>
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
                          <Text style={styles.breakdownAmount}>
                            {item.currency} {parseFloat(item.amount).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                    ))}
                    {breakdown?.summary ? (
                      <View style={styles.breakdownSummary}>
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Total Earned</Text>
                          <Text style={styles.summaryValue}>
                            {breakdown.summary.currency} {parseFloat(breakdown.summary.totalEarned).toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Avg per Lesson</Text>
                          <Text style={styles.summaryValue}>
                            {breakdown.summary.currency} {parseFloat(breakdown.summary.avgPerLesson).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                )
              ) : null}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.dark.text} />
                  <Text style={styles.sectionTitle}>History</Text>
                </View>
              </View>
              
              <View style={styles.historyList}>
                {history?.history.map((item, index) => (
                  <Pressable 
                    key={`${item.month}-${item.year}`} 
                    style={[
                      styles.historyItem,
                      index === 0 && styles.historyItemCurrent
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedMonth({ month: item.month, year: item.year });
                      setShowBreakdown(true);
                    }}
                  >
                    <View style={styles.historyLeft}>
                      <Text style={[
                        styles.historyMonth,
                        index === 0 && styles.historyCurrentText
                      ]}>
                        {item.monthName}
                      </Text>
                      <Text style={styles.historyYear}>{item.year}</Text>
                    </View>
                    <View style={styles.historyMiddle}>
                      <Text style={styles.historySessions}>
                        {item.totalSessions} lessons
                      </Text>
                    </View>
                    <View style={styles.historyRight}>
                      <Text style={[
                        styles.historyAmount,
                        index === 0 && styles.historyCurrentAmount
                      ]}>
                        {item.currency} {parseFloat(item.totalEarned).toLocaleString()}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.headerBorder,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  summaryCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
  },
  summaryHeader: {
    marginBottom: Spacing.lg,
  },
  summaryTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  mainAmounts: {
    flexDirection: "row",
  },
  amountBlock: {
    flex: 1,
  },
  amountHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.xs,
  },
  amountLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  mainAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  projectedColor: {
    color: Colors.dark.gold,
  },
  amountSubtext: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  amountDivider: {
    width: 1,
    backgroundColor: `${Colors.dark.text}20`,
    marginHorizontal: Spacing.lg,
  },
  paymentRuleCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  ruleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  ruleTitle: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  defaultBadge: {
    backgroundColor: `${Colors.dark.textMuted}30`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  defaultBadgeText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  ruleContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  ruleType: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  ruleValue: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  ruleNote: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  sectionCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  breakdownLoading: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  emptyBreakdown: {
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  emptyText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  breakdownList: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  breakdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.dark.text}10`,
  },
  breakdownLeft: {
    width: 80,
  },
  breakdownDate: {
    ...Typography.small,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  breakdownTime: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  breakdownMiddle: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
  },
  breakdownType: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  breakdownDuration: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  breakdownRight: {
    alignItems: "flex-end",
  },
  breakdownAmount: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.successNeon,
  },
  breakdownSummary: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: `${Colors.dark.text}20`,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  summaryLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  summaryValue: {
    ...Typography.small,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  historyList: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.dark.text}10`,
  },
  historyItemCurrent: {
    backgroundColor: `${Colors.dark.primary}10`,
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  historyLeft: {
    width: 100,
  },
  historyMonth: {
    ...Typography.small,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  historyCurrentText: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  historyYear: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  historyMiddle: {
    flex: 1,
  },
  historySessions: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  historyRight: {
    alignItems: "flex-end",
  },
  historyAmount: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  historyCurrentAmount: {
    color: Colors.dark.primary,
  },
});
