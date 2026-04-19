import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { 
  FadeInUp, 
  FadeInRight,
  FadeIn,
  LinearTransition,
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withSequence, 
  withTiming,
  withSpring,
  cancelAnimation 
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProTennisColors, Backgrounds, Spacing, BorderRadius, GlowColors, Colors, TextColors } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";
import { apiFetch, getStaticAssetsUrl, buildPhotoUrl, apiRequest } from "@/lib/query-client";
import { useTabNavigation } from "@/components/TabNavigationContext";
import * as Haptics from "expo-haptics";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface Post {
  id: string;
  caption: string | null;
  mediaUrls: string[];
  createdAt: string;
  author: {
    id: string;
    username: string;
  } | null;
  player: {
    name: string;
    photoUrl: string | null;
  } | null;
  cheerCount: number;
  commentCount: number;
}

const eventTypeConfig: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  new_member: { icon: "person-add-outline", color: ProTennisColors.electricGreen },
  new_group: { icon: "people-outline", color: ProTennisColors.electricGreen },
  tournament: { icon: "trophy-outline", color: "#FFD93D" },
  challenge: { icon: "flash-outline", color: "#FF6B6B" },
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function LatestPostCard({ post, onPress, queryClient }: { post: Post; onPress: () => void; queryClient: ReturnType<typeof useQueryClient> }) {
  const authorName = post.player?.name || post.author?.username || "Player";
  const avatarUrl = buildPhotoUrl(post.player?.photoUrl) || null;
  const hasMedia = post.mediaUrls && post.mediaUrls.length > 0 && !!post.mediaUrls[0];
  const rawFirstMediaUrl = hasMedia ? post.mediaUrls[0] : "";
  const firstMediaUrl = rawFirstMediaUrl
    ? rawFirstMediaUrl.startsWith("http")
      ? rawFirstMediaUrl
      : `${getStaticAssetsUrl()}${rawFirstMediaUrl.startsWith("/") ? rawFirstMediaUrl : `/${rawFirstMediaUrl}`}`
    : null;

  const handleMoreOptions = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      "Post Options",
      undefined,
      [
        {
          text: "Report Post",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Report Post",
              "Why are you reporting this post?",
              [
                { text: "Inappropriate", onPress: () => submitReport("Inappropriate") },
                { text: "Spam", onPress: () => submitReport("Spam") },
                { text: "Harassment", onPress: () => submitReport("Harassment") },
                { text: "Other", onPress: () => submitReport("Other") },
                { text: "Cancel", style: "cancel" },
              ]
            );
          },
        },
        {
          text: `Block ${authorName}`,
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Block User",
              `Block ${authorName}? Their posts will no longer appear in your feed.`,
              [
                {
                  text: "Block",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      const userId = post.author?.id;
                      if (userId) {
                        await apiRequest("POST", `/api/social/users/${userId}/block`, {});
                        queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
                      }
                    } catch {
                      Alert.alert("Error", "Failed to block user. Please try again.");
                    }
                  },
                },
                { text: "Cancel", style: "cancel" },
              ]
            );
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const submitReport = async (reason: string) => {
    try {
      await apiRequest("POST", `/api/social/posts/${post.id}/report`, { reason });
      Alert.alert("Report Submitted", "Thank you for helping keep the community safe.");
    } catch {
      Alert.alert("Error", "Failed to submit report. Please try again.");
    }
  };

  return (
    <Pressable onPress={onPress} style={styles.latestPostCard}>
      <View
        style={[styles.latestPostGradient, { backgroundColor: Backgrounds.root }]}
      >
        <View style={styles.latestPostHeader}>
          <View style={styles.latestPostAvatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <Ionicons name="person" size={14} color={Colors.dark.textMuted} />
            )}
          </View>
          <View style={styles.latestPostMeta}>
            <Text style={styles.latestPostAuthor} numberOfLines={1}>{authorName}</Text>
            <Text style={styles.latestPostTime}>{formatTimeAgo(post.createdAt)}</Text>
          </View>
          <View style={styles.latestPostHeaderRight}>
            <View style={styles.latestPostBadge}>
              <Ionicons name="chatbubble-ellipses" size={12} color={ProTennisColors.electricGreen} />
              <Text style={styles.latestPostBadgeText}>NEW</Text>
            </View>
            <Pressable
              onPress={(e) => { e.stopPropagation(); handleMoreOptions(); }}
              style={styles.miniMoreButton}
              accessibilityLabel="More options"
            >
              <Ionicons name="ellipsis-horizontal" size={16} color={Colors.dark.textMuted} />
            </Pressable>
          </View>
        </View>

        {post.caption && (
          <Text style={styles.latestPostCaption} numberOfLines={2}>
            {post.caption}
          </Text>
        )}

        {(post.mediaUrls?.length ?? 0) > 0 && firstMediaUrl ? (
          <View style={styles.latestPostMediaPreview}>
            <Image source={{ uri: firstMediaUrl }} style={styles.mediaThumb} contentFit="cover" />
            {(post.mediaUrls?.length ?? 0) > 1 ? (
              <View style={styles.mediaCountBadge}>
                <Text style={styles.mediaCountText}>+{(post.mediaUrls?.length ?? 1) - 1}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.latestPostStats}>
          <View style={styles.statItem}>
            <Ionicons name="heart" size={12} color={ProTennisColors.textMuted} />
            <Text style={styles.statText}>{post.cheerCount}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="chatbubble" size={12} color={ProTennisColors.textMuted} />
            <Text style={styles.statText}>{post.commentCount}</Text>
          </View>
          <View style={styles.tapToView}>
            <Text style={styles.tapToViewText}>Tap to view</Text>
            <Ionicons name="chevron-forward" size={12} color={Colors.dark.textMuted} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function AnimatedEventCard({ 
  event, 
  config, 
  onPress, 
  delay 
}: { 
  event: { id: string; title: string; time: string; type: string }; 
  config: { icon: keyof typeof Ionicons.glyphMap; color: string }; 
  onPress: () => void; 
  delay: number 
}) {
  const glowPulse = useSharedValue(0.2);
  const scaleValue = useSharedValue(1);
  
  useEffect(() => {
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 2000 }),
        withTiming(0.2, { duration: 2000 })
      ),
      -1,
      true
    );
    return () => cancelAnimation(glowPulse);
  }, [glowPulse]);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glowPulse.value,
  }));

  const handlePressIn = () => {
    scaleValue.value = withSpring(0.98, { damping: 15, stiffness: 150 });
  };

  const handlePressOut = () => {
    scaleValue.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  return (
    <Animated.View 
      entering={FadeInRight.delay(delay).duration(350)} 
      style={[scaleStyle]}
    >
      <Pressable 
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View style={[styles.eventCard, { shadowColor: config.color }, glowStyle]}>
          <LinearGradient
            colors={[`${config.color}12`, "rgba(21, 27, 41, 0.9)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.eventCardGradient}
          >
            <View style={[styles.eventIconGaming, { backgroundColor: `${config.color}25`, borderColor: `${config.color}40` }]}>
              <Ionicons name={config.icon} size={16} color={config.color} />
            </View>
            <View style={styles.eventContent}>
              <Text style={styles.eventTitleGaming} numberOfLines={1}>{event.title}</Text>
              <Text style={[styles.eventTimeGaming, { color: config.color }]}>{event.time}</Text>
            </View>
            <View style={[styles.eventArrow, { backgroundColor: `${config.color}15` }]}>
              <Ionicons name="chevron-forward" size={14} color={config.color} />
            </View>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export function MiniFeed() {
  const { state } = usePlayerState();
  const { navigateToTab } = useTabNavigation();
  const queryClient = useQueryClient();

  const { data: feedData } = useQuery<Post[]>({
    queryKey: ["/api/social/feed", "dashboard-preview"],
    queryFn: async () => {
      const response = await apiFetch("/api/social/feed?filter=for_you");
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60000,
  });

  const latestPost = feedData?.[0] ?? null;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigateToTab("Community");
  };

  const handleSeeAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigateToTab("Community");
  };

  const events = state.communityEvents.slice(0, 2);

  if (!latestPost) {
    return (
      <Animated.View entering={FadeIn.duration(300)} layout={LinearTransition.springify()} style={collapsedStyles.pill}>
        <View style={[collapsedStyles.iconWrap, { backgroundColor: "rgba(200, 255, 61, 0.1)" }]}>
          <Ionicons name="people-outline" size={18} color={Colors.dark.accentText} />
        </View>
        <View style={collapsedStyles.textGroup}>
          <Text style={collapsedStyles.label}>Community</Text>
          <Text style={collapsedStyles.hint}>Nothing new yet</Text>
        </View>
        <Pressable
          style={collapsedStyles.ctaButton}
          onPress={() => {
            handleSeeAll();
          }}
        >
          <Text style={collapsedStyles.ctaText}>Open</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInUp.delay(150).duration(400)} layout={LinearTransition.springify()} style={styles.outerCard}>
      <View style={styles.accentLine} />
      <View
        style={[styles.container, { backgroundColor: Backgrounds.root }]}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="people" size={13} color={Colors.dark.accentText} />
            </View>
            <Text style={styles.titleGaming}>COMMUNITY</Text>
          </View>
          <Pressable onPress={handleSeeAll} style={styles.seeAllButton}>
            <Text style={styles.seeAllGaming}>See all</Text>
            <Ionicons name="chevron-forward" size={12} color={Colors.dark.textMuted} />
          </Pressable>
        </View>

        {latestPost && (
          <LatestPostCard post={latestPost} onPress={handlePress} queryClient={queryClient} />
        )}

      </View>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  outerCard: {
    marginHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
    backgroundColor: Backgrounds.root,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  accentLine: {
    height: 2,
    backgroundColor: GlowColors.primary,
    opacity: 0.2,
  },
  container: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: Spacing.sm,
    marginRight: Spacing.md,
  },
  headerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.dark.accentTextSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  titleGaming: {
    fontSize: 12,
    fontWeight: "800",
    color: TextColors.primary,
    letterSpacing: 2,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(204, 255, 0, 0.08)",
  },
  seeAllGaming: {
    fontSize: 11,
    fontWeight: "700",
    color: ProTennisColors.electricGreen,
    letterSpacing: 0.5,
  },
  eventsContainer: {
    gap: Spacing.sm,
  },
  eventCard: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    elevation: 4,
  },
  eventCardGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  eventIconGaming: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  eventContent: {
    flex: 1,
    gap: 2,
  },
  eventTitleGaming: {
    fontSize: 13,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  eventTimeGaming: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  eventArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  latestPostCard: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
  },
  latestPostGradient: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  latestPostHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  latestPostAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  latestPostMeta: {
    flex: 1,
    gap: 1,
  },
  latestPostAuthor: {
    fontSize: 13,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  latestPostTime: {
    fontSize: 11,
    color: ProTennisColors.textMuted,
  },
  latestPostHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  latestPostBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${ProTennisColors.electricGreen}15`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  miniMoreButton: {
    padding: 4,
  },
  latestPostBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: ProTennisColors.electricGreen,
    letterSpacing: 0.5,
  },
  latestPostCaption: {
    fontSize: 13,
    color: ProTennisColors.textSecondary,
    lineHeight: 18,
  },
  latestPostMediaPreview: {
    height: 120,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    position: "relative",
    backgroundColor: Backgrounds.card,
  },
  mediaThumb: {
    width: "100%",
    height: "100%",
  },
  mediaCountBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: Backgrounds.card,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  mediaCountText: {
    fontSize: 10,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  latestPostStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 11,
    color: ProTennisColors.textMuted,
  },
  tapToView: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
  },
  tapToViewText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
}));

const collapsedStyles = makeReactiveStyles(() => StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  textGroup: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  hint: {
    fontSize: 11,
    color: ProTennisColors.textMuted,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.chipBackground,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
  },
}));
