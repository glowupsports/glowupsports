import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface DashboardData {
  player: { id: string; name: string };
  academy: { id: string; name: string } | null;
  invoiceSummary: { pending: number; overdue: number; totalPending: number };
  sessionBilling?: { unpaidCount: number; unpaidTotal: number; paidCount: number; paidTotal: number };
  lessonSummary: { scheduled: number; attended: number; missed: number; cancelled: number; makeUps: number };
}

export default function ParentDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  
  const playerId = user?.playerId || "";

  const { data: dashboardData, isLoading, error } = useQuery<DashboardData>({
    queryKey: [`/api/parent/dashboard/${playerId}`],
    enabled: !!playerId,
  });

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
        <ActivityIndicator size="large" color={Colors.dark.text} />
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
              <Text style={styles.sectionTitle}>This Month's Lessons</Text>
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
    backgroundColor: "rgba(255, 255, 255, 0.1)",
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
}));
