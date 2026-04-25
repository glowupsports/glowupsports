import React, { } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
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

  const config = typeConfig[type] || typeConfig.pending;

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
        {config.prefix}AED {Math.abs(amount).toLocaleString()}
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
  const height = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;

  return (
    <View style={styles.revenueBarContainer}>
      <View 
        style={[
          styles.revenueBar, 
          { 
            height: `${Math.max(height, 5)}%`,
            backgroundColor: isCurrent ? Colors.dark.gold : `${Colors.dark.gold}60`,
          }
        ]} 
      />
      <Text style={styles.revenueBarLabel}>{month}</Text>
    </View>
  );
}

interface FinancialsData {
  currency: string;
  financialStats: {
    mrr: number;
    arr: number;
    pendingPayments: number;
    failedPayments: number;
    avgRevenuePerAcademy: number;
    churnValue: number;
  };
  revenueData: { month: string; amount: number }[];
  transactions: {
    academy: string;
    amount: number;
    type: "payment" | "refund" | "pending";
    date: string;
  }[];
}

export default function FinancialsScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, error } = useQuery<FinancialsData>({
    queryKey: ["/api/platform/financials"],
  });
  const financialStats = data?.financialStats || {
    mrr: 0,
    arr: 0,
    pendingPayments: 0,
    failedPayments: 0,
    avgRevenuePerAcademy: 0,
    churnValue: 0,
  };

  const revenueData = data?.revenueData || [];
  const maxRevenue = Math.max(...revenueData.map(r => r.amount), 1);
  const transactions = data?.transactions || [];

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={styles.loadingText}>Loading financial data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Failed to load financial data</Text>
      </View>
    );
  }

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
            <Text style={styles.subtitle}>Platform revenue and payments (AED)</Text>
          </View>
        

        
          <View style={[styles.mrrCard, CardStyles.elevated]}>
            <View style={styles.mrrMain}>
              <Text style={styles.mrrLabel}>Monthly Recurring Revenue</Text>
              <Text style={styles.mrrValue}>AED {financialStats.mrr.toLocaleString()}</Text>
            </View>
            <View style={styles.mrrSecondary}>
              <View style={styles.mrrItem}>
                <Text style={styles.mrrItemLabel}>ARR</Text>
                <Text style={styles.mrrItemValue}>AED {(financialStats.arr / 1000).toFixed(0)}k</Text>
              </View>
              <View style={styles.mrrItem}>
                <Text style={styles.mrrItemLabel}>Avg/Academy</Text>
                <Text style={styles.mrrItemValue}>AED {financialStats.avgRevenuePerAcademy.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        

        
          <View style={styles.alertCards}>
            <View style={[styles.alertCard, CardStyles.elevated, { borderLeftColor: Colors.dark.orange }]}>
              <Ionicons name="time" size={24} color={Colors.dark.orange} />
              <View style={styles.alertInfo}>
                <Text style={styles.alertValue}>AED {financialStats.pendingPayments.toLocaleString()}</Text>
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
            {revenueData.length > 0 ? (
              <>
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
              </>
            ) : (
              <Text style={styles.emptyText}>No revenue data available</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <View style={[styles.transactionsCard, CardStyles.elevated]}>
            {transactions.length > 0 ? (
              transactions.map((transaction, index) => (
                <TransactionRow key={index} {...transaction} />
              ))
            ) : (
              <Text style={styles.emptyText}>No recent transactions</Text>
            )}
          </View>
        </View>

        <View style={[styles.churnCard, CardStyles.elevated]}>
          <View style={styles.churnHeader}>
            <Ionicons name="trending-down" size={24} color={Colors.dark.error} />
            <Text style={styles.churnTitle}>Monthly Churn</Text>
          </View>
          <Text style={styles.churnValue}>AED {financialStats.churnValue.toLocaleString()}</Text>
          <Text style={styles.churnSubtext}>Lost revenue from inactive academies</Text>
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
    ...Typography.body,
    color: Colors.dark.error,
    marginTop: Spacing.md,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    padding: Spacing.lg,
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
    marginTop: Spacing.xs,
  },
  mrrCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  mrrMain: {
    marginBottom: Spacing.md,
  },
  mrrLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  mrrValue: {
    ...Typography.h1,
    color: Colors.dark.gold,
  },
  mrrSecondary: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: Spacing.md,
  },
  mrrItem: {
    flex: 1,
  },
  mrrItemLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  mrrItemValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  alertCards: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  alertCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
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
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  chartCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  revenueBars: {
    flexDirection: "row",
    height: 120,
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  revenueBarContainer: {
    flex: 1,
    alignItems: "center",
    height: "100%",
    justifyContent: "flex-end",
  },
  revenueBar: {
    width: "60%",
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  revenueBarLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  chartFooter: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: Spacing.sm,
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
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  transactionsCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionAcademy: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  transactionDate: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  transactionAmount: {
    ...Typography.h3,
  },
  churnCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  churnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  churnTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  churnValue: {
    ...Typography.h1,
    color: Colors.dark.error,
    marginBottom: Spacing.xs,
  },
  churnSubtext: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
});
