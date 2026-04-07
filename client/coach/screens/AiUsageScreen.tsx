import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest } from "@/lib/query-client";

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

interface AcademyUsage {
  academyId: string;
  academyName: string;
  monthlyTokenBudget: number | null;
  tokensUsed: number;
  totalCalls: number;
  budgetRemaining: number | null;
  percentUsed: number | null;
  costEstimate: number;
  budgetStatus: "ok" | "warning" | "exhausted" | "unlimited";
  features: { featureType: string; callCount: number; tokens: number }[];
}

interface AcademyBreakdownData {
  academies: AcademyUsage[];
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

const STATUS_COLORS: Record<string, string> = {
  ok: Colors.dark.ballGlow,
  warning: Colors.dark.orange,
  exhausted: "#e05555",
  unlimited: Colors.dark.tabIconDefault,
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

function BudgetBar({ percent, status }: { percent: number | null; status: string }) {
  if (percent === null) return null;
  const color = STATUS_COLORS[status] ?? Colors.dark.tabIconDefault;
  return (
    <View style={styles.budgetBarContainer}>
      <View style={[styles.budgetBarFill, { width: (`${Math.min(100, percent)}%` as `${number}%`), backgroundColor: color }]} />
    </View>
  );
}

function BudgetEditModal({
  academy,
  visible,
  onClose,
  onSave,
}: {
  academy: AcademyUsage;
  visible: boolean;
  onClose: () => void;
  onSave: (academyId: string, budget: number | null) => void;
}) {
  const [value, setValue] = useState(
    academy.monthlyTokenBudget !== null ? String(academy.monthlyTokenBudget) : ""
  );

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed === "") {
      onSave(academy.academyId, null);
    } else {
      const parsed = parseInt(trimmed, 10);
      if (isNaN(parsed) || parsed <= 0) {
        Alert.alert("Invalid Budget", "Please enter a positive number or leave empty for unlimited.");
        return;
      }
      onSave(academy.academyId, parsed);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Set Token Budget</Text>
          <Text style={styles.modalSubtitle}>{academy.academyName}</Text>
          <Text style={styles.modalHint}>
            Set the monthly token limit for this academy. Leave empty for unlimited.
          </Text>
          <TextInput
            style={styles.modalInput}
            placeholder="e.g. 500000"
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={value}
            onChangeText={setValue}
            keyboardType="numeric"
            autoFocus
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSave}>
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AcademyCard({
  academy,
  onEditBudget,
}: {
  academy: AcademyUsage;
  onEditBudget: (a: AcademyUsage) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = STATUS_COLORS[academy.budgetStatus];

  return (
    <View style={styles.academyCard}>
      <TouchableOpacity onPress={() => setExpanded((v) => !v)} activeOpacity={0.8}>
        <View style={styles.academyHeader}>
          <View style={styles.academyHeaderLeft}>
            <Text style={styles.academyName}>{academy.academyName}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + "22", borderColor: statusColor }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {academy.budgetStatus === "unlimited"
                  ? "Unlimited"
                  : academy.budgetStatus === "ok"
                  ? "OK"
                  : academy.budgetStatus === "warning"
                  ? "80%+ Used"
                  : "Budget Exhausted"}
              </Text>
            </View>
          </View>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={Colors.dark.tabIconDefault}
          />
        </View>

        <View style={styles.academyStats}>
          <View style={styles.academyStatItem}>
            <Text style={styles.academyStatValue}>{academy.tokensUsed.toLocaleString()}</Text>
            <Text style={styles.academyStatLabel}>tokens used</Text>
          </View>
          <View style={styles.academyStatItem}>
            <Text style={styles.academyStatValue}>
              {academy.monthlyTokenBudget !== null
                ? academy.monthlyTokenBudget.toLocaleString()
                : "No limit"}
            </Text>
            <Text style={styles.academyStatLabel}>budget</Text>
          </View>
          <View style={styles.academyStatItem}>
            <Text style={styles.academyStatValue}>{`€${academy.costEstimate.toFixed(2)}`}</Text>
            <Text style={styles.academyStatLabel}>est. cost</Text>
          </View>
        </View>

        {academy.percentUsed !== null ? (
          <View style={styles.budgetBarWrapper}>
            <BudgetBar percent={academy.percentUsed} status={academy.budgetStatus} />
            <Text style={styles.budgetPercent}>{academy.percentUsed}% used</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.academyExpanded}>
          {academy.features.length > 0 ? (
            <>
              <Text style={styles.featuresTitle}>Top Features This Month</Text>
              {academy.features.slice(0, 5).map((f) => (
                <View key={f.featureType} style={styles.featureRow}>
                  <View style={styles.featureLeft}>
                    <Ionicons
                      name={FEATURE_ICONS[f.featureType] ?? "ellipsis-horizontal-outline"}
                      size={14}
                      color={Colors.dark.xpCyan}
                      style={{ marginRight: Spacing.xs }}
                    />
                    <Text style={styles.featureLabel}>
                      {FEATURE_LABELS[f.featureType] ?? f.featureType}
                    </Text>
                  </View>
                  <View style={styles.featureRight}>
                    <Text style={styles.featureCount}>{f.callCount} calls</Text>
                    <Text style={styles.featureTokens}>{f.tokens.toLocaleString()} tok</Text>
                  </View>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.noActivity}>No AI activity this month</Text>
          )}
          <TouchableOpacity
            style={styles.editBudgetBtn}
            onPress={() => onEditBudget(academy)}
          >
            <Ionicons name="settings-outline" size={14} color={Colors.dark.xpCyan} />
            <Text style={styles.editBudgetText}>Set Token Budget</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

export default function AiUsageScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isPlatformOwner = user?.role === "platform_owner";
  const [editingAcademy, setEditingAcademy] = useState<AcademyUsage | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery<AiUsageData>({
    queryKey: ["/api/admin/ai-usage"],
  });

  const { data: academyData, isLoading: academyLoading, refetch: refetchAcademies } = useQuery<AcademyBreakdownData>({
    queryKey: ["/api/admin/ai-usage/academies"],
    enabled: isPlatformOwner,
  });

  const budgetMutation = useMutation({
    mutationFn: async ({ academyId, budget }: { academyId: string; budget: number | null }) => {
      return apiRequest("PUT", `/api/admin/ai-budget/${academyId}`, { monthlyTokenBudget: budget });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-usage/academies"] });
      setEditingAcademy(null);
    },
    onError: () => {
      Alert.alert("Error", "Failed to update budget. Please try again.");
    },
  });

  const handleSaveBudget = (academyId: string, budget: number | null) => {
    budgetMutation.mutate({ academyId, budget });
  };

  const handleRefresh = () => {
    refetch();
    if (isPlatformOwner) refetchAcademies();
  };

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
    <>
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
            onRefresh={handleRefresh}
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

        {isPlatformOwner ? (
          <>
            <SectionTitle title="Academy Budgets" />
            {academyLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
              </View>
            ) : academyData?.academies && academyData.academies.length > 0 ? (
              academyData.academies.map((academy) => (
                <AcademyCard
                  key={academy.academyId}
                  academy={academy}
                  onEditBudget={setEditingAcademy}
                />
              ))
            ) : (
              <View style={styles.card}>
                <Text style={styles.emptyText}>No academies found</Text>
              </View>
            )}
          </>
        ) : null}

        <View style={styles.noticeCard}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.dark.tabIconDefault} />
          <Text style={styles.noticeText}>
            Daily quota: Players 10 calls, Coaches 30 calls, Admins unlimited. Notification AI runs on a separate system quota and is not counted toward individual limits.
          </Text>
        </View>
      </ScrollView>

      {editingAcademy ? (
        <BudgetEditModal
          academy={editingAcademy}
          visible={true}
          onClose={() => setEditingAcademy(null)}
          onSave={handleSaveBudget}
        />
      ) : null}
    </>
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
    backgroundColor: Colors.dark.backgroundDefault,
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
    backgroundColor: Colors.dark.backgroundDefault,
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
    backgroundColor: Colors.dark.backgroundDefault,
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
  loadingRow: {
    padding: Spacing.md,
    alignItems: "center",
  },
  academyCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  academyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  academyHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  academyName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
    flexShrink: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  academyStats: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  academyStatItem: {
    flex: 1,
  },
  academyStatValue: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  academyStatLabel: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
    marginTop: 1,
  },
  budgetBarWrapper: {
    marginTop: Spacing.xs,
  },
  budgetBarContainer: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  budgetBarFill: {
    height: 4,
    borderRadius: 2,
  },
  budgetPercent: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
    marginTop: 4,
  },
  academyExpanded: {
    marginTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border ?? "rgba(255,255,255,0.06)",
    paddingTop: Spacing.sm,
  },
  featuresTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  noActivity: {
    fontSize: 13,
    color: Colors.dark.tabIconDefault,
    fontStyle: "italic",
    marginBottom: Spacing.sm,
  },
  editBudgetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
  },
  editBudgetText: {
    fontSize: 13,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 380,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.sm,
  },
  modalHint: {
    fontSize: 13,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 16,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border ?? "rgba(255,255,255,0.1)",
    marginBottom: Spacing.md,
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  modalCancelBtn: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalCancelText: {
    fontSize: 15,
    color: Colors.dark.tabIconDefault,
    fontWeight: "600",
  },
  modalSaveBtn: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    backgroundColor: Colors.dark.xpCyan,
  },
  modalSaveText: {
    fontSize: 15,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
});
