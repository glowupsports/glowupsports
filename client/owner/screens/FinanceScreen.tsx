import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import Svg, { Rect, Text as SvgText, G } from "react-native-svg";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import type { OwnerStackParamList } from "@/owner/navigation/OwnerNavigator";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import { useTabNavigation } from "@/components/TabNavigationContext";

const DROP_IN_GREEN = "#2ECC71";
const NEON_GREEN = Colors.dark.primary;
const AMBER = Colors.dark.orange;
const RED = Colors.dark.error;

function DropInRevenueCard({ currency }: { currency: string }) {
  const { data } = useQuery<{
    summary: {
      totalPublic: number;
      dropInBookingsThisMonth: number;
      dropInRevenueThisMonth: number;
    };
  }>({
    queryKey: ["/api/owner/public-listings"],
  });

  const summary = data?.summary;
  if (!summary) return null;

  return (
    <View style={dropInStyles.card}>
      <View style={dropInStyles.header}>
        <Ionicons name="storefront-outline" size={18} color={DROP_IN_GREEN} />
        <Text style={dropInStyles.title}>Drop-in Revenue</Text>
        <Text style={dropInStyles.period}>this month</Text>
      </View>
      <Text style={dropInStyles.amount}>
        {currency} {summary.dropInRevenueThisMonth.toLocaleString()}
      </Text>
      <View style={dropInStyles.subRow}>
        <Ionicons name="arrow-up" size={12} color={DROP_IN_GREEN} />
        <Text style={dropInStyles.subText}>
          {summary.dropInBookingsThisMonth} new drop-in bookings
          {" "}&bull;{" "}
          {summary.totalPublic} public {summary.totalPublic === 1 ? "group" : "groups"}
        </Text>
      </View>
    </View>
  );
}

const dropInStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.cardElevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: `${DROP_IN_GREEN}22`,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    flex: 1,
  },
  period: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  amount: {
    ...Typography.h2,
    color: DROP_IN_GREEN,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  subText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
});

interface SixMonthBar {
  month: string;
  collected: number;
  pending: number;
}

function RevenueBarChart({ data, currency }: { data: SixMonthBar[]; currency: string }) {
  const maxValue = Math.max(...data.map((d) => d.collected), 1);
  const CHART_H = 100;
  const BAR_W = 36;
  const LABEL_H = 20;
  const totalWidth = BAR_W * data.length + 8 * (data.length + 1);
  const currentIdx = data.length - 1;

  return (
    <View style={chartStyles.container}>
      <Svg width={totalWidth} height={CHART_H + LABEL_H} viewBox={`0 0 ${totalWidth} ${CHART_H + LABEL_H}`}>
        {data.map((item, index) => {
          const barH = Math.max((item.collected / maxValue) * CHART_H, 3);
          const x = 8 + index * (BAR_W + 8);
          const y = CHART_H - barH;
          const isCurrent = index === currentIdx;
          return (
            <G key={index}>
              <Rect
                x={x}
                y={y}
                width={BAR_W}
                height={barH}
                rx={5}
                fill={isCurrent ? NEON_GREEN : Colors.dark.gold + "60"}
              />
              <SvgText
                x={x + BAR_W / 2}
                y={CHART_H + LABEL_H - 2}
                textAnchor="middle"
                fill={isCurrent ? Colors.dark.text : Colors.dark.textMuted}
                fontSize={10}
                fontWeight={isCurrent ? "700" : "400"}
              >
                {item.month}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      <Text style={chartStyles.hint}>
        {currency} {data[currentIdx]?.collected.toLocaleString() ?? "0"} collected this month
      </Text>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  hint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
});

interface FinanceData {
  currency: string;
  ytdTotal: number;
  sixMonthHistory: SixMonthBar[];
  debtAgeing: {
    bucket30: { amount: number; playerCount: number };
    bucket60: { amount: number; playerCount: number };
    bucket60plus: { amount: number; playerCount: number };
  };
  coachPayables: {
    totalOwed: number;
    coachCount: number;
  };
  refundsTotal: number;
  collected: {
    thisWeek: number;
    thisMonth: number;
    lastMonth: number;
    monthChange: number;
    cashTotal: number;
    bankTotal: number;
    tooltip: string;
  };
  pending: {
    amount: number;
    count: number;
    tooltip: string;
  };
  estimated: {
    monthlyForecast: number;
    activeSubscriptions: number;
    breakdown: {
      planName: string;
      count: number;
      monthlyTotal: number;
    }[];
    tooltip: string;
  };
  recentPayments: {
    id: string;
    playerName: string;
    package: string;
    amount: number;
    status: string;
    paymentMethod?: string;
    date?: string;
  }[];
}

interface FinanceSectionCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  tooltip?: string;
  children: React.ReactNode;
}

function FinanceSectionCard({ icon, iconColor, title, tooltip, children }: FinanceSectionCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <View style={[styles.sectionCard, CardStyles.elevated]}>
      <View style={styles.sectionCardHeader}>
        <View style={styles.sectionCardTitleRow}>
          <Ionicons name={icon} size={20} color={iconColor} />
          <Text style={styles.sectionCardTitle}>{title}</Text>
        </View>
        {tooltip ? (
          <Pressable onPress={() => setShowTooltip(true)} hitSlop={8}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.dark.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {children}

      <Modal visible={showTooltip} animationType="fade" transparent>
        <Pressable style={styles.tooltipOverlay} onPress={() => setShowTooltip(false)}>
          <View style={styles.tooltipContent}>
            <Text style={styles.tooltipText}>{tooltip}</Text>
            <Pressable style={styles.tooltipClose} onPress={() => setShowTooltip(false)}>
              <Text style={styles.tooltipCloseText}>Got it</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

type PaymentFilter = "all" | "cash" | "bank" | "overdue";

interface PaymentRowProps {
  playerName: string;
  amount: number;
  status: string;
  paymentMethod?: string;
  date?: string;
  currency: string;
}

function PaymentRow({ playerName, amount, status, paymentMethod, date, currency }: PaymentRowProps) {
  const statusConfig: Record<string, { color: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
    paid: { color: NEON_GREEN, label: "Confirmed", icon: "checkmark-circle" },
    confirmed: { color: NEON_GREEN, label: "Confirmed", icon: "checkmark-circle" },
    pending: { color: AMBER, label: "Pending", icon: "time" },
    overdue: { color: RED, label: "Overdue", icon: "alert-circle" },
    rejected: { color: RED, label: "Rejected", icon: "close-circle" },
  };
  const config = statusConfig[status] ?? { color: AMBER, label: "Pending", icon: "time" };

  return (
    <View style={styles.paymentRow}>
      <View style={styles.paymentInfo}>
        <Text style={styles.paymentPlayerName}>{playerName}</Text>
        <View style={styles.paymentMeta}>
          {paymentMethod ? (
            <View style={styles.paymentMethodBadge}>
              <Ionicons
                name={paymentMethod === "cash" ? "cash-outline" : "card-outline"}
                size={10}
                color={Colors.dark.textMuted}
              />
              <Text style={styles.paymentMethodText}>
                {paymentMethod === "cash" ? "Cash" : "Bank"}
              </Text>
            </View>
          ) : null}
          {date ? <Text style={styles.paymentDate}>{new Date(date).toLocaleDateString()}</Text> : null}
        </View>
      </View>
      <View style={styles.paymentRight}>
        <Text style={styles.paymentAmount}>{amount.toLocaleString()} {currency}</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${config.color}20` }]}>
          <Ionicons name={config.icon} size={10} color={config.color} />
          <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
        </View>
      </View>
    </View>
  );
}

export default function FinanceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<OwnerStackParamList>>();
  const { navigateToTab } = useTabNavigation();
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");

  const { data: financeData, isLoading, isError, refetch } = useQuery<FinanceData>({
    queryKey: ["/api/owner/finance"],
  });

  const currency = financeData?.currency ?? "AED";
  const collected = financeData?.collected ?? {
    thisWeek: 0,
    thisMonth: 0,
    lastMonth: 0,
    monthChange: 0,
    cashTotal: 0,
    bankTotal: 0,
    tooltip: "",
  };
  const _pending = financeData?.pending ?? { amount: 0, count: 0, tooltip: "" };
  const estimated = financeData?.estimated ?? {
    monthlyForecast: 0,
    activeSubscriptions: 0,
    breakdown: [],
    tooltip: "",
  };
  const rawPayments = financeData?.recentPayments ?? [];
  const ytdTotal = financeData?.ytdTotal ?? 0;
  const sixMonthHistory = financeData?.sixMonthHistory ?? [];
  const debtAgeing = financeData?.debtAgeing ?? {
    bucket30: { amount: 0, playerCount: 0 },
    bucket60: { amount: 0, playerCount: 0 },
    bucket60plus: { amount: 0, playerCount: 0 },
  };
  const coachPayables = financeData?.coachPayables ?? { totalOwed: 0, coachCount: 0 };
  const refundsTotal = financeData?.refundsTotal ?? 0;

  const filteredPayments = rawPayments.filter((p) => {
    if (paymentFilter === "all") return true;
    if (paymentFilter === "cash") return p.paymentMethod === "cash";
    if (paymentFilter === "bank") return p.paymentMethod === "bank_transfer";
    if (paymentFilter === "overdue") return p.status === "overdue" || p.status === "rejected";
    return true;
  });

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <TennisBallSpinner size="large" color={Colors.dark.gold} />
        <Text style={styles.loadingText}>Loading finance data...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={48} color={RED} />
        <Text style={styles.errorText}>Failed to load finance data</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  const isPositiveChange = collected.monthChange >= 0;
  const debtTotal =
    debtAgeing.bucket30.amount +
    debtAgeing.bucket60.amount +
    debtAgeing.bucket60plus.amount;

  const FILTERS: { key: PaymentFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "cash", label: "Cash" },
    { key: "bank", label: "Bank" },
    { key: "overdue", label: "Overdue" },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Finance</Text>
          <Text style={styles.subtitle}>Revenue tracking at a glance</Text>
        </View>

        {sixMonthHistory.length > 0 ? (
          <View style={[styles.sectionCard, CardStyles.elevated]}>
            <View style={styles.sectionCardHeader}>
              <View style={styles.sectionCardTitleRow}>
                <Ionicons name="bar-chart" size={20} color={Colors.dark.gold} />
                <Text style={styles.sectionCardTitle}>6-Month Revenue</Text>
              </View>
            </View>
            <RevenueBarChart data={sixMonthHistory} currency={currency} />
            <View style={styles.ytdBanner}>
              <Text style={styles.ytdLabel}>Year to Date</Text>
              <Text style={styles.ytdValue}>{currency} {ytdTotal.toLocaleString()}</Text>
            </View>
          </View>
        ) : null}

        <FinanceSectionCard
          icon="checkmark-circle"
          iconColor={NEON_GREEN}
          title="Collected Revenue"
          tooltip={collected.tooltip}
        >
          <View style={styles.collectedMain}>
            <Text style={styles.bigNumber}>{collected.thisMonth.toLocaleString()} {currency}</Text>
            <Text style={styles.bigLabel}>This Month</Text>
            {collected.monthChange !== 0 ? (
              <View style={styles.changeRow}>
                <Ionicons
                  name={isPositiveChange ? "arrow-up" : "arrow-down"}
                  size={14}
                  color={isPositiveChange ? NEON_GREEN : RED}
                />
                <Text style={[styles.changeText, { color: isPositiveChange ? NEON_GREEN : RED }]}>
                  {isPositiveChange ? "+" : ""}{collected.monthChange}% vs last month
                </Text>
              </View>
            ) : null}
          </View>

          {refundsTotal > 0 ? (
            <View style={styles.refundsRow}>
              <Ionicons name="return-down-back-outline" size={14} color={RED} />
              <Text style={styles.refundsLabel}>Refunds / Rejected</Text>
              <Text style={[styles.refundsAmount, { color: RED }]}>
                -{refundsTotal.toLocaleString()} {currency}
              </Text>
            </View>
          ) : null}

          <View style={styles.collectedBreakdown}>
            <View style={styles.breakdownColumn}>
              <Ionicons name="calendar-outline" size={16} color={Colors.dark.textMuted} />
              <Text style={styles.breakdownValue}>{collected.thisWeek.toLocaleString()} {currency}</Text>
              <Text style={styles.breakdownLabel}>This Week</Text>
            </View>
            <View style={styles.breakdownDivider} />
            <View style={styles.breakdownColumn}>
              <Ionicons name="cash-outline" size={16} color={Colors.dark.textMuted} />
              <Text style={styles.breakdownValue}>{collected.cashTotal.toLocaleString()} {currency}</Text>
              <Text style={styles.breakdownLabel}>Cash</Text>
            </View>
            <View style={styles.breakdownDivider} />
            <View style={styles.breakdownColumn}>
              <Ionicons name="card-outline" size={16} color={Colors.dark.textMuted} />
              <Text style={styles.breakdownValue}>{collected.bankTotal.toLocaleString()} {currency}</Text>
              <Text style={styles.breakdownLabel}>Bank</Text>
            </View>
          </View>

          <Pressable
            style={styles.viewAllLink}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("PaymentsManagement");
            }}
          >
            <Ionicons name="open-outline" size={13} color={NEON_GREEN} />
            <Text style={styles.viewAllLinkText}>View all payments</Text>
          </Pressable>
        </FinanceSectionCard>

        <FinanceSectionCard
          icon="alert-circle"
          iconColor={AMBER}
          title="Debt Ageing"
          tooltip="Pending payments bucketed by how long they have been outstanding."
        >
          {debtTotal === 0 ? (
            <View style={styles.debtEmptyState}>
              <Ionicons name="checkmark-circle" size={28} color={NEON_GREEN} />
              <Text style={[styles.bigLabel, { color: NEON_GREEN, marginTop: 6 }]}>No outstanding debt</Text>
            </View>
          ) : (
            <>
              {[
                {
                  label: "0 – 30 days",
                  data: debtAgeing.bucket30,
                  color: NEON_GREEN,
                },
                {
                  label: "31 – 60 days",
                  data: debtAgeing.bucket60,
                  color: AMBER,
                },
                {
                  label: "60+ days",
                  data: debtAgeing.bucket60plus,
                  color: RED,
                },
              ].map((bucket) => (
                <Pressable
                  key={bucket.label}
                  style={[styles.debtBucketRow, { borderLeftColor: bucket.color }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    navigation.navigate("PaymentsManagement", { initialTab: "overdue" });
                  }}
                >
                  <View style={styles.debtBucketLeft}>
                    <View style={[styles.debtDot, { backgroundColor: bucket.color }]} />
                    <View>
                      <Text style={styles.debtBucketLabel}>{bucket.label}</Text>
                      <Text style={styles.debtBucketPlayers}>
                        {bucket.data.playerCount} {bucket.data.playerCount === 1 ? "payer" : "payers"}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.debtBucketAmount, { color: bucket.color }]}>
                    {bucket.data.amount > 0 ? `${bucket.data.amount.toLocaleString()} ${currency}` : "—"}
                  </Text>
                </Pressable>
              ))}
              <View style={styles.debtTotalRow}>
                <Text style={styles.debtTotalLabel}>Total Outstanding</Text>
                <Text style={[styles.debtTotalAmount, { color: AMBER }]}>
                  {debtTotal.toLocaleString()} {currency}
                </Text>
              </View>
            </>
          )}
        </FinanceSectionCard>

        <FinanceSectionCard
          icon="trending-up"
          iconColor={Colors.dark.xpCyan}
          title="Estimated Monthly Revenue"
          tooltip={estimated.tooltip}
        >
          <View style={styles.estimatedMain}>
            <Text style={[styles.bigNumber, { color: Colors.dark.xpCyan }]}>
              {estimated.monthlyForecast.toLocaleString()} {currency}
            </Text>
            <Text style={styles.bigLabel}>Based on {estimated.activeSubscriptions} active subscriptions</Text>
          </View>
          {estimated.breakdown.length > 0 ? (
            <View style={styles.estimatedBreakdown}>
              <Text style={styles.estimatedBreakdownTitle}>Subscription Breakdown</Text>
              {estimated.breakdown.map((item, index) => (
                <View key={index} style={styles.estimatedBreakdownRow}>
                  <View style={styles.estimatedBreakdownInfo}>
                    <Text style={styles.estimatedBreakdownPlan}>{item.planName}</Text>
                    <Text style={styles.estimatedBreakdownCount}>{item.count} players</Text>
                  </View>
                  <Text style={styles.estimatedBreakdownAmount}>
                    {item.monthlyTotal.toLocaleString()} {currency}/mo
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptySubscriptions}>
              <Ionicons name="receipt-outline" size={24} color={Colors.dark.textMuted} />
              <Text style={styles.emptySubscriptionsText}>No active subscriptions yet</Text>
            </View>
          )}
        </FinanceSectionCard>

        <DropInRevenueCard currency={currency} />

        {coachPayables.coachCount > 0 ? (
          <View style={[styles.sectionCard, CardStyles.elevated, styles.coachPayCard]}>
            <View style={styles.sectionCardHeader}>
              <View style={styles.sectionCardTitleRow}>
                <Ionicons name="people" size={20} color={Colors.dark.xpCyan} />
                <Text style={styles.sectionCardTitle}>Coach Payout Overview</Text>
              </View>
            </View>
            <View style={styles.coachPayRow}>
              <View style={styles.coachPayStat}>
                <Text style={styles.coachPayAmount}>
                  {currency} {coachPayables.totalOwed.toLocaleString()}
                </Text>
                <Text style={styles.coachPayLabel}>estimated owed to coaches</Text>
              </View>
              <View style={styles.coachPayBadge}>
                <Text style={styles.coachPayBadgeCount}>{coachPayables.coachCount}</Text>
                <Text style={styles.coachPayBadgeLabel}>coaches</Text>
              </View>
            </View>
            <Pressable
              style={styles.coachPayButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigateToTab("People", { screen: "coaches" });
              }}
            >
              <Ionicons name="send-outline" size={14} color={Colors.dark.buttonText} />
              <Text style={styles.coachPayButtonText}>View Coaches</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Payments</Text>
            <Pressable
              style={styles.manageButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("PaymentsManagement");
              }}
            >
              <Ionicons name="open-outline" size={14} color={NEON_GREEN} />
              <Text style={styles.manageButtonText}>Manage</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
            contentContainerStyle={styles.filterRowContent}
          >
            {FILTERS.map((f) => (
              <Pressable
                key={f.key}
                style={[styles.filterPill, paymentFilter === f.key && styles.filterPillActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPaymentFilter(f.key);
                }}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    paymentFilter === f.key && styles.filterPillTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {filteredPayments.length > 0 ? (
            <View style={[styles.paymentsContainer, CardStyles.elevated]}>
              {filteredPayments.map((payment) => (
                <PaymentRow
                  key={payment.id}
                  playerName={payment.playerName}
                  amount={payment.amount}
                  status={payment.status}
                  paymentMethod={payment.paymentMethod}
                  date={payment.date}
                  currency={currency}
                />
              ))}
            </View>
          ) : (
            <View style={[styles.emptyPayments, CardStyles.elevated]}>
              <Ionicons name="cash-outline" size={32} color={Colors.dark.textMuted} />
              <Text style={styles.emptyPaymentsText}>
                {paymentFilter === "all"
                  ? "No payments recorded yet"
                  : `No ${paymentFilter} payments found`}
              </Text>
            </View>
          )}

          <Pressable
            style={styles.viewAllPaymentsButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("PaymentsManagement");
            }}
          >
            <Text style={styles.viewAllPaymentsButtonText}>View all payments</Text>
            <Ionicons name="arrow-forward" size={14} color={NEON_GREEN} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.h3,
    color: RED,
    marginTop: Spacing.md,
  },
  retryButton: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.gold,
    borderRadius: BorderRadius.md,
  },
  retryButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    flexGrow: 1,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.gold,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  sectionCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sectionCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sectionCardTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  ytdBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  ytdLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ytdValue: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  collectedMain: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  bigNumber: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  bigLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.xs,
  },
  changeText: {
    ...Typography.small,
    fontWeight: "500",
  },
  refundsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: `${RED}12`,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.md,
  },
  refundsLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  refundsAmount: {
    ...Typography.small,
    fontWeight: "600",
  },
  collectedBreakdown: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  breakdownColumn: {
    flex: 1,
    alignItems: "center",
  },
  breakdownDivider: {
    width: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  breakdownValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginTop: Spacing.xs,
  },
  breakdownLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  viewAllLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.md,
    justifyContent: "center",
  },
  viewAllLinkText: {
    ...Typography.small,
    color: NEON_GREEN,
    fontWeight: "600",
  },
  debtEmptyState: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  debtBucketRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingLeft: Spacing.md,
    marginBottom: Spacing.xs,
    borderLeftWidth: 3,
    borderRadius: 2,
  },
  debtBucketLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  debtDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  debtBucketLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  debtBucketPlayers: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  debtBucketAmount: {
    ...Typography.body,
    fontWeight: "700",
  },
  debtTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
  },
  debtTotalLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  debtTotalAmount: {
    ...Typography.body,
    fontWeight: "700",
  },
  estimatedMain: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  estimatedBreakdown: {
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  estimatedBreakdownTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  estimatedBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  estimatedBreakdownInfo: {
    flex: 1,
  },
  estimatedBreakdownPlan: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  estimatedBreakdownCount: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  estimatedBreakdownAmount: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  emptySubscriptions: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  emptySubscriptionsText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  coachPayCard: {
    borderWidth: 1,
    borderColor: `${Colors.dark.xpCyan}22`,
  },
  coachPayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  coachPayStat: {
    flex: 1,
  },
  coachPayAmount: {
    ...Typography.h2,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
  },
  coachPayLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  coachPayBadge: {
    backgroundColor: `${Colors.dark.xpCyan}20`,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  coachPayBadgeCount: {
    ...Typography.h2,
    color: Colors.dark.xpCyan,
  },
  coachPayBadgeLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  coachPayButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
  },
  coachPayButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  section: {
    marginTop: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    backgroundColor: `${NEON_GREEN}15`,
    borderRadius: BorderRadius.sm,
  },
  manageButtonText: {
    ...Typography.small,
    color: NEON_GREEN,
    fontWeight: "600",
  },
  filterRow: {
    marginBottom: Spacing.md,
  },
  filterRowContent: {
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  filterPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full ?? 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterPillActive: {
    backgroundColor: `${NEON_GREEN}20`,
    borderColor: NEON_GREEN,
  },
  filterPillText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  filterPillTextActive: {
    color: NEON_GREEN,
    fontWeight: "700",
  },
  paymentsContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentPlayerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  paymentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 2,
  },
  paymentMethodBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  paymentMethodText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  paymentDate: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  paymentRight: {
    alignItems: "flex-end",
  },
  paymentAmount: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginTop: 4,
  },
  statusText: {
    ...Typography.small,
    fontWeight: "500",
    fontSize: 10,
  },
  emptyPayments: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
  },
  emptyPaymentsText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  viewAllPaymentsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  viewAllPaymentsButtonText: {
    ...Typography.body,
    color: NEON_GREEN,
    fontWeight: "600",
  },
  tooltipOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  tooltipContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    maxWidth: 300,
  },
  tooltipText: {
    ...Typography.body,
    color: Colors.dark.text,
    textAlign: "center",
    lineHeight: 22,
  },
  tooltipClose: {
    marginTop: Spacing.md,
    alignItems: "center",
  },
  tooltipCloseText: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
});
