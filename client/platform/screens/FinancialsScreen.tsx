import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

interface TransactionRowProps {
  academy: string;
  amount: number;
  type: "payment" | "refund" | "pending";
  date: string;
}

function TransactionRow({ academy, amount, type, date }: TransactionRowProps) {
  const typeConfig = {
    payment: { color: Colors.dark.primary, icon: "checkmark-circle" as const, prefix: "+" },
    refund: { color: Colors.dark.error, icon: "close-circle" as const, prefix: "-" },
    pending: { color: Colors.dark.orange, icon: "time" as const, prefix: "" },
  };

  const config = typeConfig[type];

  return (
    <View style={styles.transactionRow}>
      <View style={[styles.transactionIcon, { backgroundColor: `${config.color}20` }]}>
        <Ionicons name={config.icon} size={20} color={config.color} />
      </View>
      <View style={styles.transactionInfo}>
        <Text style={styles.transactionAcademy}>{academy}</Text>
        <Text style={styles.transactionDate}>{date}</Text>
      </View>
      <Text style={[styles.transactionAmount, { color: config.color }]}>
        {config.prefix}${Math.abs(amount).toLocaleString()}
      </Text>
    </View>
  );
}

interface RevenueBarProps {
  month: string;
  amount: number;
  maxAmount: number;
  isCurrent?: boolean;
}

function RevenueBar({ month, amount, maxAmount, isCurrent }: RevenueBarProps) {
  const height = (amount / maxAmount) * 100;

  return (
    <View style={styles.revenueBarContainer}>
      <View 
        style={[
          styles.revenueBar, 
          { 
            height: `${height}%`,
            backgroundColor: isCurrent ? Colors.dark.gold : `${Colors.dark.gold}60`,
          }
        ]} 
      />
      <Text style={styles.revenueBarLabel}>{month}</Text>
    </View>
  );
}

export default function FinancialsScreen() {
  const insets = useSafeAreaInsets();

  const financialStats = {
    mrr: 28500,
    arr: 342000,
    pendingPayments: 3200,
    failedPayments: 2,
    avgRevenuePerAcademy: 2375,
    churnValue: 1500,
  };

  const revenueData = [
    { month: "Jul", amount: 22000 },
    { month: "Aug", amount: 24500 },
    { month: "Sep", amount: 23800 },
    { month: "Oct", amount: 26200 },
    { month: "Nov", amount: 27800 },
    { month: "Dec", amount: 28500 },
  ];

  const maxRevenue = Math.max(...revenueData.map(r => r.amount));

  const transactions: TransactionRowProps[] = [
    { academy: "Tennis Academy Pro", amount: 2850, type: "payment", date: "Dec 28, 2025" },
    { academy: "Elite Tennis Club", amount: 2200, type: "payment", date: "Dec 28, 2025" },
    { academy: "City Tennis Center", amount: 3500, type: "pending", date: "Dec 27, 2025" },
    { academy: "Junior Elite Sports", amount: 2000, type: "pending", date: "Dec 26, 2025" },
    { academy: "Sunset Tennis Academy", amount: 500, type: "refund", date: "Dec 25, 2025" },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Financials</Text>
          <Text style={styles.subtitle}>Platform revenue and payments</Text>
        </View>

        <View style={[styles.mrrCard, CardStyles.elevated]}>
          <View style={styles.mrrMain}>
            <Text style={styles.mrrLabel}>Monthly Recurring Revenue</Text>
            <Text style={styles.mrrValue}>${financialStats.mrr.toLocaleString()}</Text>
          </View>
          <View style={styles.mrrSecondary}>
            <View style={styles.mrrItem}>
              <Text style={styles.mrrItemLabel}>ARR</Text>
              <Text style={styles.mrrItemValue}>${(financialStats.arr / 1000).toFixed(0)}k</Text>
            </View>
            <View style={styles.mrrItem}>
              <Text style={styles.mrrItemLabel}>Avg/Academy</Text>
              <Text style={styles.mrrItemValue}>${financialStats.avgRevenuePerAcademy}</Text>
            </View>
          </View>
        </View>

        <View style={styles.alertCards}>
          <View style={[styles.alertCard, CardStyles.elevated, { borderLeftColor: Colors.dark.orange }]}>
            <Ionicons name="time" size={24} color={Colors.dark.orange} />
            <View style={styles.alertInfo}>
              <Text style={styles.alertValue}>${financialStats.pendingPayments.toLocaleString()}</Text>
              <Text style={styles.alertLabel}>Pending</Text>
            </View>
          </View>
          <View style={[styles.alertCard, CardStyles.elevated, { borderLeftColor: Colors.dark.error }]}>
            <Ionicons name="alert-circle" size={24} color={Colors.dark.error} />
            <View style={styles.alertInfo}>
              <Text style={[styles.alertValue, { color: Colors.dark.error }]}>{financialStats.failedPayments}</Text>
              <Text style={styles.alertLabel}>Failed</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Revenue Trend</Text>
          <View style={[styles.chartCard, CardStyles.elevated]}>
            <View style={styles.revenueBars}>
              {revenueData.map((item, index) => (
                <RevenueBar 
                  key={index} 
                  month={item.month} 
                  amount={item.amount} 
                  maxAmount={maxRevenue}
                  isCurrent={index === revenueData.length - 1}
                />
              ))}
            </View>
            <View style={styles.chartFooter}>
              <View style={styles.chartLegend}>
                <View style={[styles.legendDot, { backgroundColor: Colors.dark.gold }]} />
                <Text style={styles.legendText}>Current</Text>
              </View>
              <View style={styles.chartLegend}>
                <View style={[styles.legendDot, { backgroundColor: `${Colors.dark.gold}60` }]} />
                <Text style={styles.legendText}>Previous</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <View style={[styles.transactionsCard, CardStyles.elevated]}>
            {transactions.map((transaction, index) => (
              <TransactionRow key={index} {...transaction} />
            ))}
          </View>
        </View>

        <View style={[styles.churnCard, CardStyles.elevated]}>
          <View style={styles.churnHeader}>
            <Ionicons name="trending-down" size={24} color={Colors.dark.error} />
            <Text style={styles.churnTitle}>Monthly Churn</Text>
          </View>
          <Text style={styles.churnValue}>${financialStats.churnValue.toLocaleString()}</Text>
          <Text style={styles.churnSubtext}>Lost revenue from 1 cancelled subscription</Text>
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
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
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
    color: PLATFORM_COLOR,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  mrrCard: {
    padding: Spacing.xl,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  mrrMain: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  mrrLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  mrrValue: {
    fontSize: 40,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  mrrSecondary: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  mrrItem: {
    alignItems: "center",
  },
  mrrItemLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  mrrItemValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  alertCards: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  alertCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderLeftWidth: 3,
  },
  alertInfo: {
    flex: 1,
  },
  alertValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  alertLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  chartCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  revenueBars: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    height: 120,
    marginBottom: Spacing.md,
  },
  revenueBarContainer: {
    alignItems: "center",
    height: "100%",
    justifyContent: "flex-end",
  },
  revenueBar: {
    width: 32,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
    minHeight: 4,
  },
  revenueBarLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  chartFooter: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  chartLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  transactionsCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionAcademy: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  transactionDate: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  transactionAmount: {
    ...Typography.h3,
  },
  churnCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  churnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  churnTitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  churnValue: {
    ...Typography.h1,
    color: Colors.dark.error,
  },
  churnSubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
});
