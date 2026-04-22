import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SectionList,
  ActivityIndicator,
} from "react-native";
import SwipeableBottomSheet from "@/components/SwipeableBottomSheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import {
  Colors,
  Backgrounds,
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  getPlayerLevelColor,
  getPlayerLevelTextColor,
} from "@/constants/theme";

interface FeedbackItem {
  id: string;
  feedbackType: string;
  message: string;
  xpAwarded: number | null;
  visibility: string;
  createdAt: string;
  sessionId: string;
  sessionDate: string | null;
  sessionTitle: string | null;
}

interface FeedbackHistoryResponse {
  feedback: FeedbackItem[];
}

interface PlayerInfo {
  id: string;
  name: string;
  photoUrl?: string | null;
  level?: string | null;
  ballLevel?: string | null;
}

interface Props {
  visible: boolean;
  player: PlayerInfo;
  sessionId: string;
  onClose: () => void;
  onGiveFeedback: (playerId: string) => void;
}

type FeedbackType = "praise" | "effort" | "technique" | "improvement" | "focus" | "attitude" | "note";

const FEEDBACK_TYPE_CONFIG: Record<FeedbackType, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  praise: { icon: "star", color: GlowColors.primary, label: "Praise" },
  effort: { icon: "flame", color: Colors.dark.orange, label: "Great Effort" },
  technique: { icon: "bulb", color: Colors.dark.planning, label: "Technique Tip" },
  focus: { icon: "eye", color: Colors.dark.xpCyan, label: "Focus Needed" },
  attitude: { icon: "alert-circle", color: Colors.dark.error, label: "Attitude Note" },
  improvement: { icon: "trending-up", color: Colors.dark.gold, label: "Improvement" },
  note: { icon: "create", color: Colors.dark.textSecondary, label: "Private Note" },
};

function getFeedbackConfig(type: string) {
  return FEEDBACK_TYPE_CONFIG[type as FeedbackType] ?? {
    icon: "chatbubble-outline" as keyof typeof Ionicons.glyphMap,
    color: Colors.dark.tabIconDefault,
    label: type,
  };
}

function formatSectionDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function groupByDate(feedback: FeedbackItem[]): { title: string; data: FeedbackItem[] }[] {
  const groups: Map<string, FeedbackItem[]> = new Map();
  for (const item of feedback) {
    const dateStr = item.sessionDate ?? item.createdAt;
    const dayKey = new Date(dateStr).toDateString();
    if (!groups.has(dayKey)) {
      groups.set(dayKey, []);
    }
    groups.get(dayKey)!.push(item);
  }
  return Array.from(groups.entries()).map(([_key, items]) => ({
    title: formatSectionDate(items[0].sessionDate ?? items[0].createdAt),
    data: items,
  }));
}

export default function PlayerFeedbackHistorySheet({
  visible,
  player,
  sessionId,
  onClose,
  onGiveFeedback,
}: Props) {
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery<FeedbackHistoryResponse>({
    queryKey: [`/api/coach/players/${player?.id}/feedback-history`],
    enabled: visible && !!player?.id,
  });

  const sections = useMemo(() => {
    if (!data?.feedback?.length) return [];
    return groupByDate(data.feedback);
  }, [data]);

  const levelColor = getPlayerLevelColor(player?.ballLevel);
  const levelTextColor = getPlayerLevelTextColor(player?.ballLevel);

  const handleGiveFeedback = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onGiveFeedback(player.id);
    onClose();
  };

  if (!player) return null;

  return (
    <SwipeableBottomSheet
      visible={visible}
      onClose={onClose}
      bottomInset={insets.bottom + Spacing.md}
      sheetStyle={styles.sheet}
    >
      {(scrollProps) => (
        <>
          <View style={styles.header}>
            <View style={styles.playerInfo}>
              <View style={[styles.avatar, { backgroundColor: levelColor + "30", borderColor: levelColor }]}>
                <Text style={[styles.avatarInitial, { color: levelTextColor }]}>
                  {player.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.playerMeta}>
                <Text style={styles.playerName}>{player.name}</Text>
                {player.ballLevel ? (
                  <View style={[styles.levelChip, { backgroundColor: levelColor + "20" }]}>
                    <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
                    <Text style={[styles.levelText, { color: levelTextColor }]}>
                      {player.ballLevel.charAt(0).toUpperCase() + player.ballLevel.slice(1)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.dark.text} />
            </Pressable>
          </View>

          <Text style={styles.sheetTitle}>Feedback History</Text>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={GlowColors.primary} />
            </View>
          ) : sections.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubble-outline" size={48} color={Colors.dark.tabIconDefault} />
              <Text style={styles.emptyTitle}>No feedback given yet</Text>
              <Text style={styles.emptySubtitle}>Be the first to give feedback!</Text>
              <Pressable style={styles.emptyFeedbackBtn} onPress={handleGiveFeedback}>
                <Ionicons name="add-circle" size={18} color={Colors.dark.buttonText} />
                <Text style={styles.emptyFeedbackBtnText}>Give Feedback</Text>
              </Pressable>
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              stickySectionHeadersEnabled={false}
              {...scrollProps}
              renderSectionHeader={({ section }) => (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeaderText}>{section.title}</Text>
                </View>
              )}
              renderItem={({ item }) => {
                const config = getFeedbackConfig(item.feedbackType);
                return (
                  <View style={styles.feedbackRow}>
                    <View style={[styles.feedbackIconContainer, { backgroundColor: config.color + "20" }]}>
                      <Ionicons name={config.icon} size={16} color={config.color} />
                    </View>
                    <View style={styles.feedbackContent}>
                      <Text style={styles.feedbackMessage}>{item.message}</Text>
                      <Text style={styles.feedbackTypeMeta}>{config.label}</Text>
                    </View>
                    <View style={styles.feedbackBadges}>
                      {item.xpAwarded ? (
                        <View style={styles.xpBadge}>
                          <Text style={styles.xpBadgeText}>+{item.xpAwarded} XP</Text>
                        </View>
                      ) : null}
                      <View style={[styles.visibilityBadge, item.visibility === "public" ? styles.publicBadge : styles.privateBadge]}>
                        <Ionicons
                          name={item.visibility === "public" ? "globe-outline" : "lock-closed-outline"}
                          size={10}
                          color={item.visibility === "public" ? GlowColors.primary : Colors.dark.tabIconDefault}
                        />
                      </View>
                      <Text style={styles.feedbackTime}>{formatTime(item.createdAt)}</Text>
                    </View>
                  </View>
                );
              }}
            />
          )}

          {sections.length > 0 ? (
            <Pressable style={styles.giveFeedbackBtn} onPress={handleGiveFeedback}>
              <Ionicons name="add-circle" size={18} color={Colors.dark.buttonText} />
              <Text style={styles.giveFeedbackBtnText}>Give Feedback</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </SwipeableBottomSheet>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.overlay,
  },
  sheet: {
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.sm,
    maxHeight: "85%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.dark.tabIconDefault,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    ...Typography.bodyLarge,
    fontWeight: "700",
  },
  playerMeta: {
    gap: 4,
  },
  playerName: {
    ...Typography.bodyLarge,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  levelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
  },
  levelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  levelText: {
    ...Typography.caption,
    fontWeight: "600",
    fontSize: 11,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  sheetTitle: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "600",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  loadingContainer: {
    paddingVertical: 48,
    alignItems: "center",
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
    marginTop: Spacing.sm,
  },
  emptySubtitle: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  emptyFeedbackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
  },
  emptyFeedbackBtnText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: Spacing.md,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  sectionHeaderText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  feedbackRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  feedbackIconContainer: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  feedbackContent: {
    flex: 1,
    gap: 2,
  },
  feedbackMessage: {
    ...Typography.body,
    color: Colors.dark.text,
    fontSize: 13,
    lineHeight: 18,
  },
  feedbackTypeMeta: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    fontSize: 11,
  },
  feedbackBadges: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  xpBadge: {
    backgroundColor: "#10B98120",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "#10B98140",
  },
  xpBadgeText: {
    ...Typography.caption,
    color: "#10B981",
    fontWeight: "700",
    fontSize: 10,
  },
  visibilityBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  publicBadge: {
    backgroundColor: GlowColors.primary + "20",
  },
  privateBadge: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  feedbackTime: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    fontSize: 10,
  },
  giveFeedbackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: GlowColors.primary,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  giveFeedbackBtnText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
});
