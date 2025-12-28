import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

interface RevenueCardProps {
  period: string;
  amount: number;
  change: number;
  sessions: number;
}

function RevenueCard({ period, amount, change, sessions }: RevenueCardProps) {
  const isPositive = change >= 0;

  return (
    <View style={[styles.revenueCard, CardStyles.elevated]}>
      <Text style={styles.revenuePeriod}>{period}</Text>
      <Text style={styles.revenueAmount}>${amount.toLocaleString()}</Text>
      <View style={styles.revenueDetails}>
        <View style={styles.revenueChange}>
          <Ionicons
            name={isPositive ? "arrow-up" : "arrow-down"}
            size={14}
            color={isPositive ? Colors.dark.primary : Colors.dark.error}
          />
          <Text style={[styles.revenueChangeText, { color: isPositive ? Colors.dark.primary : Colors.dark.error }]}>
            {isPositive ? "+" : ""}{change}%
          </Text>
        </View>
        <Text style={styles.revenueSessions}>{sessions} sessions</Text>
      </View>
    </View>
  );
}

interface PaymentRowProps {
  playerName: string;
  package: string;
  amount: number;
  status: "paid" | "pending" | "overdue";
  dueDate?: string;
}

function PaymentRow({ playerName, package: pkg, amount, status, dueDate }: PaymentRowProps) {
  const statusConfig = {
    paid: { color: Colors.dark.primary, label: "Paid", icon: "checkmark-circle" as const },
    pending: { color: Colors.dark.orange, label: "Pending", icon: "time" as const },
    overdue: { color: Colors.dark.error, label: "Overdue", icon: "alert-circle" as const },
  };

  const config = statusConfig[status];

  return (
    <Pressable style={styles.paymentRow}>
      <View style={styles.paymentInfo}>
        <Text style={styles.paymentPlayerName}>{playerName}</Text>
        <Text style={styles.paymentPackage}>{pkg}</Text>
      </View>
      <View style={styles.paymentRight}>
        <Text style={styles.paymentAmount}>${amount}</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${config.color}20` }]}>
          <Ionicons name={config.icon} size={12} color={config.color} />
          <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
        </View>
        {dueDate ? <Text style={styles.paymentDue}>Due: {dueDate}</Text> : null}
      </View>
    </Pressable>
  );
}

interface SummaryStatProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
}

function SummaryStat({ icon, label, value, color }: SummaryStatProps) {
  return (
    <View style={styles.summaryStat}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

export default function FinanceScreen() {
  const insets = useSafeAreaInsets();

  const payments: PaymentRowProps[] = [
    { playerName: "Tommy Wilson", package: "Monthly Unlimited", amount: 299, status: "paid" },
    { playerName: "Sarah Chen", package: "8-Session Pack", amount: 200, status: "pending", dueDate: "Jan 5" },
    { playerName: "Emma Davis", package: "Monthly Unlimited", amount: 299, status: "overdue", dueDate: "Dec 20" },
    { playerName: "Jake Brown", package: "4-Session Pack", amount: 120, status: "paid" },
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
          <Text style={styles.subtitle}>Revenue and payment tracking</Text>
        </View>

        <View style={styles.revenueCards}>
          <RevenueCard period="This Week" amount={2450} change={12} sessions={28} />
          <RevenueCard period="This Month" amount={8750} change={8} sessions={112} />
        </View>

        <View style={[styles.summaryCard, CardStyles.elevated]}>
          <SummaryStat icon="checkmark-circle" label="Collected" value="$7,850" color={Colors.dark.primary} />
          <View style={styles.summaryDivider} />
          <SummaryStat icon="time" label="Pending" value="$499" color={Colors.dark.orange} />
          <View style={styles.summaryDivider} />
          <SummaryStat icon="alert-circle" label="Overdue" value="$299" color={Colors.dark.error} />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Payments</Text>
            <Pressable style={styles.viewAllButton}>
              <Text style={styles.viewAllText}>View All</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.gold} />
            </Pressable>
          </View>
          <View style={[styles.paymentsContainer, CardStyles.elevated]}>
            {payments.map((payment, index) => (
              <PaymentRow key={index} {...payment} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Subscriptions</Text>
          <View style={[styles.subscriptionCard, CardStyles.elevated]}>
            <View style={styles.subscriptionHeader}>
              <Ionicons name="repeat" size={24} color={Colors.dark.gold} />
              <View style={styles.subscriptionInfo}>
                <Text style={styles.subscriptionCount}>18 Active</Text>
                <Text style={styles.subscriptionRevenue}>$5,382/month recurring</Text>
              </View>
            </View>
            <View style={styles.subscriptionBreakdown}>
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Monthly Unlimited</Text>
                <Text style={styles.breakdownValue}>12 players</Text>
              </View>
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Session Packs</Text>
                <Text style={styles.breakdownValue}>6 players</Text>
              </View>
            </View>
          </View>
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
  revenueCards: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  revenueCard: {
    flex: 1,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  revenuePeriod: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  revenueAmount: {
    ...Typography.h1,
    color: Colors.dark.gold,
    marginBottom: Spacing.sm,
  },
  revenueDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  revenueChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  revenueChangeText: {
    ...Typography.small,
    fontWeight: "600",
  },
  revenueSessions: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  summaryCard: {
    flexDirection: "row",
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
  },
  summaryStat: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.xs,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  summaryValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  summaryLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  section: {
    marginBottom: Spacing.xl,
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
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontWeight: "500",
  },
  paymentsContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  paymentRow: {
    flexDirection: "row",
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
  },
  paymentPackage: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  paymentRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  paymentAmount: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  statusText: {
    ...Typography.small,
    fontSize: 10,
    fontWeight: "600",
  },
  paymentDue: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  subscriptionCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  subscriptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  subscriptionInfo: {
    flex: 1,
  },
  subscriptionCount: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  subscriptionRevenue: {
    ...Typography.small,
    color: Colors.dark.gold,
  },
  subscriptionBreakdown: {
    gap: Spacing.sm,
  },
  breakdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  breakdownLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  breakdownValue: {
    ...Typography.body,
    color: Colors.dark.text,
  },
});
