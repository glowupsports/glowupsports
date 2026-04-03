import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";

interface FeatureBreakdown {
  featureType: string;
  total: number;
  tokens?: string | null;
}

interface TopUser {
  userId: string | null;
  name: string;
  role: string;
  callCount: number;
  totalTokens: number;
}

interface AiUsageData {
  today: {
    totalCalls: number;
    notificationCalls: number;
    byFeature: FeatureBreakdown[];
  };
  month: {
    totalCalls: number;
    totalTokens: number;
    estimatedCostEur: number;
    byFeature: FeatureBreakdown[];
  };
  topUsers: TopUser[];
}

const FEATURE_LABELS: Record<string, string> = {
  chat: "Coaching Chat",
  "session-plan": "Session Planning",
  report: "Progress Reports",
  quest: "Quest Generation",
  notification: "Notifications",
  other: "Other",
};

const FEATURE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  chat: "chatbubble-outline",
  "session-plan": "clipboard-outline",
  report: "document-text-outline",
  quest: "trophy-outline",
  notification: "notifications-outline",
  other: "ellipsis-horizontal-outline",
};

function StatCard({ label, value, sub, color = Colors.dark.xpCyan }: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

export default function AiUsageScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const { data, isLoading, refetch, isRefetching } = useQuery<AiUsageData>({
    queryKey: ["/api/admin/ai-usage"],
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.dark.xpCyan} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No usage data available</Text>
      </View>
    );
  }

  const { today, month, topUsers } = data;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={Colors.dark.xpCyan}
        />
      }
    >
      <SectionTitle title="Today" />
      <View style={styles.statRow}>
        <StatCard
          label="Total AI Calls"
          value={today.totalCalls}
          color={Colors.dark.xpCyan}
        />
        <StatCard
          label="Notification AI"
          value={today.notificationCalls}
          sub="system quota"
          color={Colors.dark.orange}
        />
      </View>

      {today.byFeature.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>By Feature (Today)</Text>
          {today.byFeature.map((f) => (
            <View key={f.featureType} style={styles.featureRow}>
              <View style={styles.featureLeft}>
                <Ionicons
                  name={FEATURE_ICONS[f.featureType] ?? "ellipsis-horizontal-outline"}
                  size={18}
                  color={Colors.dark.xpCyan}
                  style={{ marginRight: Spacing.sm }}
                />
                <Text style={styles.featureLabel}>
                  {FEATURE_LABELS[f.featureType] ?? f.featureType}
                </Text>
              </View>
              <Text style={styles.featureCount}>{f.total}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <SectionTitle title="This Month" />
      <View style={styles.statRow}>
        <StatCard
          label="Total Calls"
          value={month.totalCalls}
          color={Colors.dark.primary}
        />
        <StatCard
          label="Est. Cost"
          value={`€${month.estimatedCostEur.toFixed(2)}`}
          sub="gpt-4o-mini rate"
          color={Colors.dark.gold}
        />
      </View>
      <View style={styles.statRow}>
        <StatCard
          label="Tokens Used"
          value={month.totalTokens.toLocaleString()}
          sub="all features"
          color={Colors.dark.ballGlow}
        />
      </View>

      {month.byFeature.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>By Feature (Month)</Text>
          {month.byFeature.map((f) => (
            <View key={f.featureType} style={styles.featureRow}>
              <View style={styles.featureLeft}>
                <Ionicons
                  name={FEATURE_ICONS[f.featureType] ?? "ellipsis-horizontal-outline"}
                  size={18}
                  color={Colors.dark.primary}
                  style={{ marginRight: Spacing.sm }}
                />
                <Text style={styles.featureLabel}>
                  {FEATURE_LABELS[f.featureType] ?? f.featureType}
                </Text>
              </View>
              <View style={styles.featureRight}>
                <Text style={styles.featureCount}>{f.total}</Text>
                {f.tokens ? (
                  <Text style={styles.featureTokens}>
                    {Number(f.tokens).toLocaleString()} tok
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {topUsers.length > 0 ? (
        <>
          <SectionTitle title="Top Users This Month" />
          <View style={styles.card}>
            {topUsers.map((user, i) => (
              <View key={user.userId ?? i} style={styles.userRow}>
                <View style={styles.userRank}>
                  <Text style={styles.userRankText}>{i + 1}</Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.name}</Text>
                  <Text style={styles.userRole}>{user.role}</Text>
                </View>
                <View style={styles.userStats}>
                  <Text style={styles.userCallCount}>{user.callCount} calls</Text>
                  <Text style={styles.userTokens}>
                    {user.totalTokens.toLocaleString()} tok
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.noticeCard}>
        <Ionicons name="information-circle-outline" size={18} color={Colors.dark.tabIconDefault} />
        <Text style={styles.noticeText}>
          Daily quota: Players 10 calls, Coaches 30 calls, Admins unlimited. Notification AI runs on a separate system quota and is not counted toward individual limits.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  emptyText: {
    color: Colors.dark.tabIconDefault,
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  statRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundCard,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  statSub: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
    opacity: 0.7,
  },
  card: {
    backgroundColor: Colors.dark.backgroundCard,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  featureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border ?? "rgba(255,255,255,0.06)",
  },
  featureLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  featureLabel: {
    fontSize: 14,
    color: Colors.dark.text,
  },
  featureRight: {
    alignItems: "flex-end",
  },
  featureCount: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  featureTokens: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border ?? "rgba(255,255,255,0.06)",
  },
  userRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.xpCyan + "20",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  userRankText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  userRole: {
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
  },
  userStats: {
    alignItems: "flex-end",
  },
  userCallCount: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  userTokens: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
  },
  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.dark.backgroundCard,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  noticeText: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    flex: 1,
    lineHeight: 18,
  },
});
