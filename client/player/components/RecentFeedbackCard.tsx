import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Colors, Backgrounds, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { useTabNavigation } from "@/components/TabNavigationContext";
import * as Haptics from "expo-haptics";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface FeedbackItem {
  id: string;
  feedbackType: string;
  message: string;
  xpAwarded: number;
  createdAt: string;
  sessionId: string;
  coachName?: string;
  sessionType?: string;
}

const FEEDBACK_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  praise: { icon: "trophy", color: "#FFD700", label: "Praise" },
  effort: { icon: "flame", color: "#FF6B35", label: "Great Effort" },
  technique: { icon: "fitness", color: "#00E5FF", label: "Technique" },
  improvement: { icon: "trending-up", color: "#00E676", label: "Improvement" },
  observation: { icon: "eye", color: "#AB47BC", label: "Observation" },
  custom: { icon: "chatbox", color: "#78909C", label: "Note" },
};

function getConfig(type: string) {
  return FEEDBACK_ICONS[type?.toLowerCase()] || FEEDBACK_ICONS.custom;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-AE", { day: "numeric", month: "short" });
}

export function RecentFeedbackCard() {
  const { user } = useAuth();
  const { navigateToTab } = useTabNavigation();

  const { data: feedbackList } = useQuery<FeedbackItem[]>({
    queryKey: ["/api/player/me/session-feedback"],
    enabled: !!user?.playerId,
  });

  const recentFeedback = feedbackList?.slice(0, 3);

  if (!recentFeedback || recentFeedback.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.wrapper}>
      <View style={styles.accentLine} />
      <View
        style={[styles.gradientInner, { backgroundColor: Backgrounds.root }]}
      >
        <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigateToTab("Growth", { screen: "CoachFeedbackHistory" }); }} style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="chatbubbles" size={13} color={GlowColors.primary} />
            </View>
            <Text style={styles.sectionTitle}>COACH FEEDBACK</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.viewAll}>View All</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
          </View>
        </Pressable>

        {recentFeedback.map((item, index) => {
          const config = getConfig(item.feedbackType);
          return (
            <View key={item.id} style={[styles.feedbackItem, index < recentFeedback.length - 1 && styles.itemBorder]}>
              <View style={[styles.iconCircle, { backgroundColor: config.color + "20" }]}>
                <Ionicons name={config.icon as any} size={16} color={config.color} />
              </View>
              <View style={styles.feedbackContent}>
                <View style={styles.feedbackTop}>
                  <Text style={styles.feedbackLabel}>{config.label}</Text>
                  <Text style={styles.timeText}>{timeAgo(item.createdAt)}</Text>
                </View>
                <Text style={styles.feedbackMessage} numberOfLines={2}>{item.message}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    backgroundColor: Backgrounds.root,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  accentLine: {
    height: 2,
    backgroundColor: GlowColors.primary,
    opacity: 0.2,
  },
  gradientInner: {
    padding: Spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(200, 255, 61, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: GlowColors.primary,
    letterSpacing: 2,
  },
  viewAll: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  feedbackItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  feedbackContent: {
    flex: 1,
  },
  feedbackTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  feedbackLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  timeText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  feedbackMessage: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  xpText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFD700",
  },
}));
