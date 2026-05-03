import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, type DimensionValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
interface DashboardData {
  player: { id: string; name: string };
  academy: { id: string; name: string } | null;
  invoiceSummary: { pending: number; overdue: number; totalPending: number };
  sessionBilling?: { unpaidCount: number; unpaidTotal: number; paidCount: number; paidTotal: number };
  lessonSummary: { scheduled: number; attended: number; missed: number; cancelled: number; makeUps: number };
}

interface SpendingLimitData {
  limit: number | null;
  spent: number;
  remaining: number | null;
  unit: string;
}

const SPENDING_PRESETS: { label: string; cents: number | null }[] = [
  { label: "£5", cents: 500 },
  { label: "£10", cents: 1000 },
  { label: "£25", cents: 2500 },
  { label: "Unlimited", cents: null },
];

function formatPounds(cents: number): string {
  return `£${(cents / 100).toFixed(2)}`;
}

export default function ParentDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const playerId = user?.playerId || "";

  const { data: dashboardData, isLoading, error } = useQuery<DashboardData>({
    queryKey: [`/api/parent/dashboard/${playerId}`],
    enabled: !!playerId,
  });

  const { data: spendingData } = useQuery<SpendingLimitData>({
    queryKey: ["/api/arena/monetisation/spending-limit", playerId],
    enabled: !!playerId,
  });

  const spendingMutation = useMutation({
    mutationFn: ({ targetPlayerId, limitCents }: { targetPlayerId: string; limitCents: number | null }) =>
      apiRequest("POST", "/api/arena/monetisation/spending-limit", { targetPlayerId, limitCents }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/arena/monetisation/spending-limit", playerId] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to update spending limit. Please try again.");
    },
  });

  const handleSelectPreset = (cents: number | null) => {
    const childId = dashboardData?.player?.id || playerId;
    if (!childId) return;
    spendingMutation.mutate({ targetPlayerId: childId, limitCents: cents });
  };

  interface SessionRatingItem {
    id: string;
    sessionId: string;
    rating: number;
    comment: string | null;
    createdAt: string | null;
  }
  const { data: ratingsData } = useQuery<{ ratings: SessionRatingItem[] }>({
    queryKey: [`/api/parent/children/${playerId}/session-ratings`],
    enabled: !!playerId,
  });
  const recentRatings = ratingsData?.ratings?.slice(0, 5) ?? [];

  const navigateToLessons = () => {
    if (playerId) {
      (navigation as any).navigate("ParentLessons", { playerId });
    }
  };

  const navigateToSettings = () => {
    (navigation as any).navigate("ParentSettings");
  };

  const navigateToCreditStore = () => {
    if (playerId) {
      (navigation as any).navigate("ParentCreditStore", { playerId });
    }
  };

  const navigateToReports = () => {
    if (playerId) {
      (navigation as any).navigate("ParentReports", { playerId, childName: dashboardData?.player?.name });
    }
  };

  if (!playerId) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.textMuted} />
        <Text style={styles.emptyText}>Player profile not found</Text>
        <Pressable 
          style={({ pressed }) => [styles.backButtonLarge, pressed && styles.buttonPressed]} 
          onPress={() => navigation.goBack()}
          android_ripple={{ color: 'rgba(255, 255, 255, 0.2)' }}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <TennisBallSpinner size="large" color={Colors.dark.text} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable 
            onPress={() => navigation.goBack()} 
            style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
            android_ripple={{ color: 'rgba(255, 255, 255, 0.2)' }}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Parent Dashboard</Text>
          <View style={styles.settingsButton} />
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
          <Text style={styles.emptyText}>Unable to load dashboard</Text>
          <Text style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>Please try again later</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable 
          onPress={() => navigation.goBack()} 
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
          android_ripple={{ color: 'rgba(255, 255, 255, 0.2)' }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Parent Dashboard</Text>
        <Pressable 
          onPress={navigateToSettings} 
          style={({ pressed }) => [styles.settingsButton, pressed && styles.buttonPressed]}
          android_ripple={{ color: 'rgba(255, 255, 255, 0.2)' }}
        >
          <Ionicons name="settings-outline" size={24} color={Colors.dark.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {dashboardData ? (
          <>
            <View style={styles.playerCard}>
              <View style={styles.playerAvatar}>
                <Ionicons name="person" size={32} color={Colors.dark.text} />
              </View>
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{dashboardData.player.name}</Text>
                {dashboardData.academy ? (
                  <Text style={styles.academyName}>{dashboardData.academy.name}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.summarySection}>
              <Text style={styles.sectionTitle}>This Month&apos;s Lessons</Text>
              <View style={styles.lessonSummaryCard}>
                <View style={styles.lessonRow}>
                  <View style={styles.lessonStat}>
                    <Text style={styles.lessonStatValue}>{dashboardData.lessonSummary.scheduled}</Text>
                    <Text style={styles.lessonStatLabel}>Scheduled</Text>
                  </View>
                  <View style={styles.lessonStat}>
                    <Text style={[styles.lessonStatValue, { color: "#22C55E" }]}>
                      {dashboardData.lessonSummary.attended}
                    </Text>
                    <Text style={styles.lessonStatLabel}>Attended</Text>
                  </View>
                  <View style={styles.lessonStat}>
                    <Text style={[styles.lessonStatValue, { color: "#EF4444" }]}>
                      {dashboardData.lessonSummary.missed}
                    </Text>
                    <Text style={styles.lessonStatLabel}>Missed</Text>
                  </View>
                  <View style={styles.lessonStat}>
                    <Text style={[styles.lessonStatValue, { color: "#F59E0B" }]}>
                      {dashboardData.lessonSummary.cancelled}
                    </Text>
                    <Text style={styles.lessonStatLabel}>Cancelled</Text>
                  </View>
                </View>
                <Pressable 
                  style={({ pressed }) => [styles.viewDetailsButton, pressed && styles.buttonPressed]} 
                  onPress={navigateToLessons}
                  android_ripple={{ color: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <Text style={styles.viewDetailsText}>View Full History</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
                </Pressable>
              </View>
            </View>

            {recentRatings.length > 0 && (
              <View style={styles.summarySection}>
                <Text style={styles.sectionTitle}>Recent Lesson Ratings</Text>
                <View style={styles.lessonSummaryCard}>
                  {recentRatings.map((item) => (
                    <View key={item.id} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: Colors.dark.border }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, minWidth: 52 }}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Feather key={s} name="star" size={12} color={s <= item.rating ? "#FFD700" : Colors.dark.disabled} />
                        ))}
                      </View>
                      {item.comment ? (
                        <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, flex: 1, marginLeft: 8, fontStyle: "italic" }} numberOfLines={2}>
                          {item.comment}
                        </Text>
                      ) : (
                        <Text style={{ color: Colors.dark.textMuted, fontSize: 12, marginLeft: 8 }}>
                          {item.rating}/5
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.summarySection}>
              <Text style={styles.sectionTitle}>Arena Spending Limit</Text>
              <View style={styles.lessonSummaryCard}>
                <View style={styles.spendingHeader}>
                  <View style={styles.spendingIconContainer}>
                    <Ionicons name="shield-checkmark-outline" size={20} color="#a855f7" />
                  </View>
                  <View style={styles.spendingHeaderText}>
                    <Text style={styles.spendingTitle}>Monthly Arena Cap</Text>
                    <Text style={styles.spendingSubtitle}>
                      Limit how much your child can spend in the Arena each month
                    </Text>
                  </View>
                </View>

                {spendingData ? (
                  <>
                    <View style={styles.spendingStatus}>
                      <View style={styles.spendingStatRow}>
                        <Text style={styles.spendingStatLabel}>Spent this month</Text>
                        <Text style={styles.spendingStatValue}>{formatPounds(spendingData.spent)}</Text>
                      </View>
                      {spendingData.limit !== null ? (
                        <>
                          <View style={styles.spendingStatRow}>
                            <Text style={styles.spendingStatLabel}>Monthly cap</Text>
                            <Text style={[styles.spendingStatValue, { color: "#a855f7" }]}>
                              {formatPounds(spendingData.limit)}
                            </Text>
                          </View>
                          <View style={styles.spendingProgressBg}>
                            {(() => {
                              const limitVal = spendingData.limit ?? 0;
                              const spentVal = spendingData.spent;
                              const pct = limitVal > 0
                                ? Math.min(100, Math.round((spentVal / limitVal) * 100))
                                : 0;
                              const fillWidth: DimensionValue = `${pct}%`;
                              const fillColor =
                                limitVal > 0 && spentVal >= limitVal
                                  ? "#EF4444"
                                  : limitVal > 0 && spentVal / limitVal >= 0.8
                                  ? "#F59E0B"
                                  : "#a855f7";
                              return (
                                <View
                                  style={[
                                    styles.spendingProgressFill,
                                    { width: fillWidth, backgroundColor: fillColor },
                                  ]}
                                />
                              );
                            })()}
                          </View>
                          {spendingData.remaining !== null ? (
                            <Text style={styles.spendingRemaining}>
                              {formatPounds(spendingData.remaining)} remaining
                            </Text>
                          ) : null}
                        </>
                      ) : (
                        <View style={styles.spendingStatRow}>
                          <Text style={styles.spendingStatLabel}>Monthly cap</Text>
                          <Text style={[styles.spendingStatValue, { color: Colors.dark.textMuted }]}>Unlimited</Text>
                        </View>
                      )}
                    </View>
                  </>
                ) : null}

                <View style={styles.spendingDivider} />
                <Text style={styles.spendingPresetLabel}>Set monthly cap:</Text>
                <View style={styles.spendingPresets}>
                  {SPENDING_PRESETS.map((preset) => {
                    const isActive = spendingData
                      ? preset.cents === spendingData.limit
                      : false;
                    const isSaving = spendingMutation.isPending;
                    return (
                      <Pressable
                        key={preset.label}
                        style={({ pressed }) => [
                          styles.presetChip,
                          isActive && styles.presetChipActive,
                          pressed && styles.presetChipPressed,
                          isSaving && styles.presetChipDisabled,
                        ]}
                        onPress={() => handleSelectPreset(preset.cents)}
                        disabled={isSaving}
                        android_ripple={{ color: "rgba(168, 85, 247, 0.2)" }}
                      >
                        {isSaving && isActive ? (
                          <ActivityIndicator size="small" color="#a855f7" />
                        ) : (
                          <Text style={[styles.presetChipText, isActive && styles.presetChipTextActive]}>
                            {preset.label}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={styles.quickActions}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <View style={styles.actionButtons}>
                <Pressable 
                  style={({ pressed }) => [styles.actionButton, pressed && styles.cardPressed]} 
                  onPress={navigateToLessons}
                  android_ripple={{ color: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <Ionicons name="calendar-outline" size={24} color={Colors.dark.text} />
                  <Text style={styles.actionButtonText}>Lessons</Text>
                </Pressable>
                <Pressable 
                  style={({ pressed }) => [styles.actionButton, styles.creditStoreButton, pressed && styles.cardPressed]} 
                  onPress={navigateToCreditStore}
                  android_ripple={{ color: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <Ionicons name="cart-outline" size={24} color={Colors.dark.gold} />
                  <Text style={[styles.actionButtonText, { color: Colors.dark.gold }]}>Buy Credits</Text>
                </Pressable>
                <Pressable 
                  style={({ pressed }) => [styles.actionButton, pressed && styles.cardPressed]} 
                  onPress={navigateToReports}
                  android_ripple={{ color: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <Ionicons name="mail-unread-outline" size={24} color="#a855f7" />
                  <Text style={[styles.actionButtonText, { color: "#a855f7" }]}>Reports</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No data available</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.7,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  cardPressed: {
    opacity: 0.8,
  },
  backButtonLarge: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.lg,
  },
  backButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
  },
  playerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  academyName: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  summarySection: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  summaryCards: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
  },
  summaryIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(251, 191, 36, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  summaryValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  summaryLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  lessonSummaryCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  lessonRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: Spacing.lg,
  },
  lessonStat: {
    alignItems: "center",
  },
  lessonStatValue: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  lessonStatLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  viewDetailsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  viewDetailsText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginRight: Spacing.xs,
  },
  quickActions: {
    marginBottom: Spacing.xl,
  },
  actionButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionButton: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionButtonText: {
    ...Typography.caption,
    color: Colors.dark.text,
  },
  creditStoreButton: {
    borderWidth: 1,
    borderColor: Colors.dark.gold,
    backgroundColor: "rgba(250, 204, 21, 0.1)",
  },
  emptyState: {
    paddingVertical: Spacing["2xl"] * 2,
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  spendingHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  spendingIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(168, 85, 247, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  spendingHeaderText: {
    flex: 1,
  },
  spendingTitle: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  spendingSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  spendingStatus: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  spendingStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  spendingStatLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  spendingStatValue: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  spendingProgressBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.backgroundTertiary,
    marginTop: Spacing.xs,
    overflow: "hidden",
  },
  spendingProgressFill: {
    height: 6,
    borderRadius: 3,
  },
  spendingRemaining: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "right",
    marginTop: 2,
  },
  spendingDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: Spacing.md,
  },
  spendingPresetLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  spendingPresets: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  presetChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full ?? 999,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minWidth: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  presetChipActive: {
    backgroundColor: "rgba(168, 85, 247, 0.15)",
    borderColor: "#a855f7",
  },
  presetChipPressed: {
    opacity: 0.75,
  },
  presetChipDisabled: {
    opacity: 0.6,
  },
  presetChipText: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  presetChipTextActive: {
    color: "#a855f7",
  },
}));
