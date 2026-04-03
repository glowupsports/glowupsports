import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { apiRequest } from "@/lib/query-client";

interface RosterInsight {
  text: string;
  playerIds: string[];
}

interface RosterInsightsResponse {
  insights: RosterInsight[];
  generatedAt: string;
  fromCache: boolean;
  message?: string;
}

export function RosterInsightsCard() {
  const [collapsed, setCollapsed] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { navigateToTab } = useTabNavigation();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<RosterInsightsResponse>({
    queryKey: ["/api/coach/roster-insights"],
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const handleRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRefreshing(true);
    try {
      await apiRequest("GET", "/api/coach/roster-insights?refresh=true");
      await queryClient.invalidateQueries({ queryKey: ["/api/coach/roster-insights"] });
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const handleViewPlayers = useCallback(
    (playerIds: string[]) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigateToTab("Players", { screen: "players", params: { playerIds } });
    },
    [navigateToTab]
  );

  const hasInsights = data && data.insights && data.insights.length > 0;

  return (
    <View style={styles.card}>
      <Pressable style={styles.cardHeader} onPress={() => setCollapsed((c) => !c)}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.iconBadge}>
            <Ionicons name="sparkles" size={16} color={Colors.dark.primary} />
          </View>
          <Text style={styles.cardTitle}>Roster Insights</Text>
          {data?.fromCache ? (
            <View style={styles.cachedBadge}>
              <Text style={styles.cachedBadgeText}>cached</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.cardHeaderRight}>
          {!collapsed ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                handleRefresh();
              }}
              style={styles.refreshButton}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={Colors.dark.primary} />
              ) : (
                <Ionicons name="refresh-outline" size={16} color={Colors.dark.primary} />
              )}
            </Pressable>
          ) : null}
          <Ionicons
            name={collapsed ? "chevron-down" : "chevron-up"}
            size={18}
            color={Colors.dark.text}
            style={{ opacity: 0.5 }}
          />
        </View>
      </Pressable>

      {!collapsed ? (
        <View style={styles.cardBody}>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.dark.primary} />
              <Text style={styles.loadingText}>Analyzing your roster...</Text>
            </View>
          ) : error ? (
            <Text style={styles.emptyText}>
              Unable to load insights. Tap refresh to try again.
            </Text>
          ) : !hasInsights ? (
            <Text style={styles.emptyText}>
              {data?.message ||
                "No insights available yet. Add session data to generate insights."}
            </Text>
          ) : (
            data.insights.map((insight, index) => (
              <View key={index} style={styles.insightRow}>
                <View style={styles.insightBullet}>
                  <Text style={styles.insightBulletText}>{index + 1}</Text>
                </View>
                <View style={styles.insightContent}>
                  <Text style={styles.insightText}>{insight.text}</Text>
                  {insight.playerIds && insight.playerIds.length > 0 ? (
                    <Pressable
                      style={styles.viewPlayersButton}
                      onPress={() => handleViewPlayers(insight.playerIds)}
                    >
                      <Ionicons
                        name="people-outline"
                        size={12}
                        color={Colors.dark.primary}
                      />
                      <Text style={styles.viewPlayersText}>
                        View {insight.playerIds.length} affected{" "}
                        {insight.playerIds.length === 1 ? "player" : "players"}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={12}
                        color={Colors.dark.primary}
                      />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))
          )}
          {hasInsights && data.generatedAt ? (
            <Text style={styles.generatedAtText}>
              Generated{" "}
              {new Date(data.generatedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.lg,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  cachedBadge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cachedBadgeText: {
    fontSize: 10,
    color: Colors.dark.disabled,
    fontWeight: "500",
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  refreshButton: {
    padding: 4,
  },
  cardBody: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.5,
    textAlign: "center",
    paddingVertical: Spacing.lg,
  },
  insightRow: {
    flexDirection: "row",
    gap: Spacing.md,
    alignItems: "flex-start",
  },
  insightBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.dark.primary + "25",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  insightBulletText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  insightContent: {
    flex: 1,
    gap: 4,
  },
  insightText: {
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 20,
  },
  viewPlayersButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  viewPlayersText: {
    fontSize: 12,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  generatedAtText: {
    fontSize: 11,
    color: Colors.dark.text,
    opacity: 0.35,
    textAlign: "right",
    marginTop: Spacing.xs,
  },
});
