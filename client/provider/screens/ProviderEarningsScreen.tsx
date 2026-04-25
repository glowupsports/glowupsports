import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { Colors, Spacing } from "@/constants/theme";
import { getStaticAssetsUrl, apiRequest } from "@/lib/query-client";

interface Booking {
  id: string;
  orderNumber: string;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  totalAmount: string;
  items: { id: string; name: string; service?: { name: string } }[];
  player?: { id: string; name: string; profilePhotoUrl: string | null } | null;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatCurrency(amount: number): string {
  return `AED ${amount.toFixed(0)}`;
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function getLast6Months(): { label: string; key: string }[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      label: MONTH_LABELS[d.getMonth()],
      key: `${d.getFullYear()}-${d.getMonth()}`,
    };
  });
}

export default function ProviderEarningsScreen() {
  const insets = useSafeAreaInsets();

  const { data: bookings = [], isLoading, refetch } = useQuery<Booking[]>({
    queryKey: ["/api/provider/me/bookings"],
  });

  const completedBookings = useMemo(
    () => bookings.filter((b) => b.status === "completed"),
    [bookings]
  );

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const todayEarnings = useMemo(() =>
    completedBookings
      .filter((b) => {
        const d = new Date((b.completedAt ?? b.scheduledAt) ?? "");
        return d >= todayStart;
      })
      .reduce((sum, b) => sum + Number(b.totalAmount), 0),
    [completedBookings]
  );

  const weekEarnings = useMemo(() =>
    completedBookings
      .filter((b) => {
        const d = new Date((b.completedAt ?? b.scheduledAt) ?? "");
        return d >= weekStart;
      })
      .reduce((sum, b) => sum + Number(b.totalAmount), 0),
    [completedBookings]
  );

  const monthEarnings = useMemo(() =>
    completedBookings
      .filter((b) => {
        const d = new Date((b.completedAt ?? b.scheduledAt) ?? "");
        return d >= monthStart;
      })
      .reduce((sum, b) => sum + Number(b.totalAmount), 0),
    [completedBookings]
  );

  const last6Months = getLast6Months();
  const monthlyData = useMemo(() => {
    return last6Months.map(({ label, key }) => {
      const total = completedBookings
        .filter((b) => {
          const d = new Date((b.completedAt ?? b.scheduledAt) ?? "");
          return getMonthKey(d) === key;
        })
        .reduce((sum, b) => sum + Number(b.totalAmount), 0);
      return { label, total };
    });
  }, [completedBookings, last6Months]);

  const maxMonth = Math.max(...monthlyData.map((m) => m.total), 1);

  const recentTransactions = useMemo(
    () =>
      [...completedBookings]
        .sort((a, b) => {
          const da = new Date((a.completedAt ?? a.scheduledAt) ?? "").getTime();
          const db2 = new Date((b.completedAt ?? b.scheduledAt) ?? "").getTime();
          return db2 - da;
        })
        .slice(0, 20),
    [completedBookings]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Earnings</Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.dark.primary} />
        }
      >
        <Animated.View entering={FadeInUp.delay(50).duration(300)}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>This Month</Text>
            <Text style={styles.heroAmount}>{formatCurrency(monthEarnings)}</Text>
            <View style={styles.heroSubRow}>
              <View style={styles.subStat}>
                <Ionicons name="today-outline" size={14} color={Colors.dark.textSecondary} />
                <Text style={styles.subStatLabel}>Today</Text>
                <Text style={styles.subStatValue}>{formatCurrency(todayEarnings)}</Text>
              </View>
              <View style={styles.subStatDivider} />
              <View style={styles.subStat}>
                <Ionicons name="calendar-outline" size={14} color={Colors.dark.textSecondary} />
                <Text style={styles.subStatLabel}>This Week</Text>
                <Text style={styles.subStatValue}>{formatCurrency(weekEarnings)}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(120).duration(300)}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="bar-chart-outline" size={14} color={Colors.dark.primary} />
              <Text style={styles.sectionTitle}>6-MONTH HISTORY</Text>
            </View>
            <View style={styles.chartContainer}>
              <View style={styles.barsRow}>
                {monthlyData.map(({ label, total }, idx) => {
                  const heightPct = maxMonth > 0 ? total / maxMonth : 0;
                  const isCurrentMonth = idx === 5;
                  return (
                    <View key={label} style={styles.barCol}>
                      <Text style={styles.barAmount}>
                        {total > 0 ? `${Math.round(total)}` : ""}
                      </Text>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              height: `${Math.max(heightPct * 100, total > 0 ? 4 : 0)}%`,
                              backgroundColor: isCurrentMonth
                                ? Colors.dark.primary
                                : Colors.dark.primary + "40",
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.barLabel, isCurrentMonth && styles.barLabelActive]}>
                        {label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200).duration(300)}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="receipt-outline" size={14} color={Colors.dark.primary} />
              <Text style={styles.sectionTitle}>RECENT TRANSACTIONS</Text>
            </View>
            {recentTransactions.length === 0 ? (
              <View style={styles.emptyTx}>
                <Ionicons name="wallet-outline" size={32} color={Colors.dark.textSecondary} />
                <Text style={styles.emptyTxText}>No completed bookings yet</Text>
              </View>
            ) : (
              recentTransactions.map((b, idx) => {
                const serviceName = b.items?.[0]?.service?.name ?? b.items?.[0]?.name ?? "Service";
                const date = new Date((b.completedAt ?? b.scheduledAt) ?? "");
                const dateLabel = `${MONTH_LABELS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                return (
                  <Animated.View key={b.id} entering={FadeInUp.delay(idx * 30).duration(200)}>
                    <View style={styles.txRow}>
                      <View style={styles.txIcon}>
                        <Ionicons name="checkmark-circle" size={18} color={Colors.dark.primary} />
                      </View>
                      <View style={styles.txBody}>
                        <Text style={styles.txService} numberOfLines={1}>{serviceName}</Text>
                        <View style={styles.txMeta}>
                          {b.player ? (
                            <Text style={styles.txPlayer} numberOfLines={1}>{b.player.name}</Text>
                          ) : null}
                          <Text style={styles.txDate}>{dateLabel}</Text>
                        </View>
                      </View>
                      <Text style={styles.txAmount}>
                        {formatCurrency(Number(b.totalAmount))}
                      </Text>
                    </View>
                  </Animated.View>
                );
              })
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  heroCard: {
    backgroundColor: "#0F141B",
    borderRadius: 20,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
    gap: Spacing.sm,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  heroAmount: {
    fontSize: 40,
    fontWeight: "800",
    color: Colors.dark.primary,
    lineHeight: 48,
  },
  heroSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  subStat: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  subStatLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  subStatValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  subStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.dark.border,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  chartContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 16,
    padding: Spacing.md,
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 120,
    gap: 4,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    height: "100%",
    gap: 4,
    justifyContent: "flex-end",
  },
  barAmount: {
    fontSize: 9,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  barTrack: {
    width: "60%",
    height: 80,
    justifyContent: "flex-end",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    borderRadius: 4,
  },
  barLabel: {
    fontSize: 10,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  barLabelActive: {
    color: Colors.dark.primary,
  },
  emptyTx: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTxText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  txBody: { flex: 1, gap: 2 },
  txService: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  txMeta: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  txPlayer: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  txDate: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
});
