import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

const NEON_YELLOW = "#FFE600";

interface FeedbackItem {
  id: string;
  playerName: string;
  category: string;
  message: string;
  createdAt: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  bug: { label: "Bug", icon: "bug-outline", color: "#E74C3C" },
  idea: { label: "Idea", icon: "bulb-outline", color: "#3498DB" },
  compliment: { label: "Compliment", icon: "star-outline", color: "#2ECC40" },
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function BetaFeedbackPanel() {
  const { data, isLoading, isError } = useQuery<{ items: FeedbackItem[]; total: number }>({
    queryKey: ["/api/beta-feedback?limit=5"],
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const items = data?.items || [];
  const total = data?.total || 0;

  if (isLoading) return null;
  if (isError) return null;
  if (items.length === 0) return null;

  const bugCount = items.filter(i => i.category === "bug").length;
  const ideaCount = items.filter(i => i.category === "idea").length;
  const complimentCount = items.filter(i => i.category === "compliment").length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.betaBadge}>
            <Ionicons name="flask-outline" size={12} color={NEON_YELLOW} />
            <Text style={styles.betaBadgeText}>BETA</Text>
          </View>
          <Text style={styles.title}>Tester Feedback</Text>
        </View>
        <Text style={styles.totalCount}>{total} total</Text>
      </View>

      <View style={styles.statsRow}>
        {bugCount > 0 ? (
          <View style={[styles.statPill, { backgroundColor: "#E74C3C18" }]}>
            <Ionicons name="bug-outline" size={12} color="#E74C3C" />
            <Text style={[styles.statText, { color: "#E74C3C" }]}>{bugCount}</Text>
          </View>
        ) : null}
        {ideaCount > 0 ? (
          <View style={[styles.statPill, { backgroundColor: "#3498DB18" }]}>
            <Ionicons name="bulb-outline" size={12} color="#3498DB" />
            <Text style={[styles.statText, { color: "#3498DB" }]}>{ideaCount}</Text>
          </View>
        ) : null}
        {complimentCount > 0 ? (
          <View style={[styles.statPill, { backgroundColor: "#2ECC4018" }]}>
            <Ionicons name="star-outline" size={12} color="#2ECC40" />
            <Text style={[styles.statText, { color: "#2ECC40" }]}>{complimentCount}</Text>
          </View>
        ) : null}
      </View>

      {items.map((item) => {
        const cat = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.bug;
        return (
          <View key={item.id} style={styles.feedbackCard}>
            <View style={styles.feedbackHeader}>
              <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
              <Text style={styles.feedbackCategory}>{cat.label}</Text>
              <Text style={styles.feedbackTime}>{timeAgo(item.createdAt)}</Text>
            </View>
            <Text style={styles.feedbackMessage} numberOfLines={3}>{item.message}</Text>
            <View style={styles.feedbackFooter}>
              <Ionicons name="person-circle-outline" size={13} color={Colors.dark.textSubtle} />
              <Text style={styles.feedbackPlayer}>{item.playerName}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  betaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: NEON_YELLOW + "1A",
    borderColor: NEON_YELLOW + "44",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  betaBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: NEON_YELLOW,
    letterSpacing: 1,
  },
  title: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  totalCount: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statText: {
    fontSize: 12,
    fontWeight: "700",
  },
  feedbackCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  feedbackHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  feedbackCategory: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.text,
    flex: 1,
  },
  feedbackTime: {
    fontSize: 11,
    color: Colors.dark.textSubtle,
  },
  feedbackMessage: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    lineHeight: 20,
    marginBottom: 8,
  },
  feedbackFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  feedbackPlayer: {
    fontSize: 12,
    color: Colors.dark.textSubtle,
    fontWeight: "500",
  },
});
