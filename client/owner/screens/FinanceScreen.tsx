import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import type { OwnerStackParamList } from "@/owner/navigation/OwnerNavigator";

const DROP_IN_GREEN = "#2ECC71";

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
interface FinanceData {
  currency: string;
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
    breakdown: Array<{
      planName: string;
      count: number;
      monthlyTotal: number;
    }>;
    tooltip: string;
  };
  recentPayments: Array<{
    id: string;
    playerName: string;
    package: string;
    amount: number;
    status: string;
    paymentMethod?: string;
    date?: string;
  }>;
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
    paid: { color: Colors.dark.primary, label: "Confirmed", icon: "checkmark-circle" },
    confirmed: { color: Colors.dark.primary, label: "Confirmed", icon: "checkmark-circle" },
    pending: { color: Colors.dark.orange, label: "Pending", icon: "time" },
    overdue: { color: Colors.dark.error, label: "Overdue", icon: "alert-circle" },
    rejected: { color: Colors.dark.error, label: "Rejected", icon: "close-circle" },
  };
  const config = statusConfig[status] || { color: Colors.dark.orange, label: "Pending", icon: "time" };

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
  const { data: financeData, isLoading, isError, refetch } = useQuery<FinanceData>({
    queryKey: ["/api/owner/finance"],
  });

  const currency = financeData?.currency || "AED";
  const collected = financeData?.collected || {
    thisWeek: 0,
    thisMonth: 0,
    lastMonth: 0,
    monthChange: 0,
    cashTotal: 0,
    bankTotal: 0,
    tooltip: "",
  };
  const pending = financeData?.pending || { amount: 0, count: 0, tooltip: "" };
  const estimated = financeData?.estimated || {
    monthlyForecast: 0,
    activeSubscriptions: 0,
    breakdown: [],
    tooltip: "",
  };
  const recentPayments = financeData?.recentPayments || [];

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
        <Text style={styles.loadingText}>Loading finance data...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Failed to load finance data</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  const isPositiveChange = collected.monthChange >= 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Finance</Text>
          <Text style={styles.subtitle}>Revenue tracking in 3 clear sections</Text>
        </View>

        
        <FinanceSectionCard
          icon="checkmark-circle"
          iconColor={Colors.dark.primary}
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
                  color={isPositiveChange ? Colors.dark.primary : Colors.dark.error}
                />
                <Text style={[styles.changeText, { color: isPositiveChange ? Colors.dark.primary : Colors.dark.error }]}>
                  {isPositiveChange ? "+" : ""}{collected.monthChange}% vs last month
                </Text>
              </View>
            ) : null}
          </View>
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
        </FinanceSectionCard>
        

        
        <FinanceSectionCard
          icon="time"
          iconColor={Colors.dark.orange}
          title="Pending"
          tooltip={pending.tooltip}
        >
          <View style={styles.pendingContent}>
            <View style={styles.pendingMain}>
              <Text style={[styles.bigNumber, { color: Colors.dark.orange }]}>
                {pending.amount.toLocaleString()} {currency}
              </Text>
              <Text style={styles.bigLabel}>Awaiting Confirmation</Text>
            </View>
            <View style={styles.pendingCount}>
              <Text style={styles.pendingCountValue}>{pending.count}</Text>
              <Text style={styles.pendingCountLabel}>payments</Text>
            </View>
          </View>
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
              <Ionicons name="open-outline" size={14} color={Colors.dark.primary} />
              <Text style={styles.manageButtonText}>Manage</Text>
            </Pressable>
          </View>
          {recentPayments.length > 0 ? (
            <View style={[styles.paymentsContainer, CardStyles.elevated]}>
              {recentPayments.map((payment) => (
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
              <Text style={styles.emptyPaymentsText}>No payments recorded yet</Text>
            </View>
          )}
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
    color: Colors.dark.error,
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
  collectedMain: {
    alignItems: "center",
    marginBottom: Spacing.lg,
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
  pendingContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pendingMain: {
    flex: 1,
  },
  pendingCount: {
    alignItems: "center",
    backgroundColor: `${Colors.dark.orange}20`,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  pendingCountValue: {
    ...Typography.h2,
    color: Colors.dark.orange,
  },
  pendingCountLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
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
  section: {
    marginTop: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
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
    backgroundColor: `${Colors.dark.primary}15`,
    borderRadius: BorderRadius.sm,
  },
  manageButtonText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
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
