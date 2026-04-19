import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView, type VideoPlayerStatus } from "expo-video";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  type FeedFilter,
  type MainTab,
  type Post,
  CONTEXT_BADGE_STYLES,
  CHEER_REACTIONS,
  formatTimeAgo,
} from "./CommunityTypes";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
function MediaUnavailable() {
  return (
    <View style={styles.mediaUnavailable}>
      <Ionicons name="videocam-off" size={28} color={Colors.dark.textSecondary} />
      <ThemedText style={styles.mediaUnavailableText}>Media no longer available</ThemedText>
    </View>
  );
}

export function VideoPostMedia({ uri }: { uri: string }) {
  const [hasError, setHasError] = useState(false);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = false;
  });

  useEffect(() => {
    const subscription = player.addListener("statusChange", ({ status }: { status: VideoPlayerStatus }) => {
      if (status === "error") {
        setHasError(true);
      }
    });
    return () => subscription.remove();
  }, [player]);

  if (hasError) {
    return <MediaUnavailable />;
  }

  return (
    <View style={styles.videoContainer}>
      <VideoView
        player={player}
        style={styles.momentImage}
        contentFit="contain"
        nativeControls
      />
      <View style={styles.videoIndicator}>
        <Ionicons name="videocam" size={16} color={Colors.dark.text} />
      </View>
    </View>
  );
}

export function MomentCard({
  post,
  onReact,
  onComment,
  onShare,
  onDelete,
  currentUserId,
}: {
  post: Post;
  onReact: (postId: string, type: string) => void;
  onComment: (postId: string) => void;
  onShare: (post: Post) => void;
  onDelete: (postId: string) => void;
  currentUserId?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showCheerPicker, setShowCheerPicker] = useState(false);
  const [imageError, setImageError] = useState(false);
  const isOwnPost = currentUserId && String(post.authorId) === String(currentUserId);

  const handleMoreOptions = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const authorName = post.author.name || post.author.username || "this user";
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
                      await apiRequest("POST", `/api/social/users/${post.authorId}/block`, {});
                      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
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

  const contextLabel = useMemo(() => {
    switch (post.contextType) {
      case "training": return t('player.community.training');
      case "match": return "Match";
      case "event": return t('player.community.events');
      case "group": return t('player.community.groups');
      case "achievement": return "Achievement";
      case "free_play": return "Free Play";
      case "session_completed": return "Session";
      case "level_up": return "Level Up!";
      case "badge_earned": return "Badge";
      case "streak": return "Streak";
      case "milestone": return "Milestone";
      default: return "";
    }
  }, [post.contextType, t]);

  const contextStyle = CONTEXT_BADGE_STYLES[post.contextType] || CONTEXT_BADGE_STYLES.training;
  const hasMedia = post.mediaUrls && post.mediaUrls.length > 0 && !!post.mediaUrls[0];
  const isVideo = hasMedia && post.mediaTypes && post.mediaTypes[0] === "video";
  const rawMediaUrl = hasMedia ? post.mediaUrls[0] : "";
  const mediaUrl = rawMediaUrl
    ? rawMediaUrl.startsWith("http")
      ? rawMediaUrl
      : `${getApiUrl()}${rawMediaUrl.startsWith("/") ? rawMediaUrl : `/${rawMediaUrl}`}`
    : "";

  return (
    <Animated.View entering={FadeInDown.delay(100).springify()}>
      <View style={styles.momentCard}>
        {hasMedia ? (
          <View style={styles.mediaSection}>
            {isVideo ? (
              <VideoPostMedia uri={mediaUrl} />
            ) : imageError ? (
              <MediaUnavailable />
            ) : (
              <View style={styles.momentImageContainer}>
                <Image
                  source={{ uri: mediaUrl }}
                  style={styles.momentImage}
                  contentFit="cover"
                  placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
                  transition={200}
                  onError={() => setImageError(true)}
                />
              </View>
            )}
            <View style={[styles.contextBadgeOverlay, { backgroundColor: contextStyle.bg }]}>
              <Ionicons name={contextStyle.icon as any} size={12} color={contextStyle.text} />
              <ThemedText style={[styles.contextBadgeText, { color: contextStyle.text }]}>
                {contextLabel}
              </ThemedText>
            </View>
            {post.mediaUrls.length > 1 ? (
              <View style={styles.mediaCountBadge}>
                <ThemedText style={styles.mediaCountText}>+{post.mediaUrls.length - 1}</ThemedText>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.noMediaHeader}>
            <View style={[styles.contextBadgeLarge, { backgroundColor: contextStyle.bg }]}>
              <Ionicons name={contextStyle.icon as any} size={24} color={contextStyle.text} />
              <ThemedText style={[styles.contextBadgeLargeText, { color: contextStyle.text }]}>
                {contextLabel}
              </ThemedText>
            </View>
          </View>
        )}

        <View style={styles.momentContent}>
          <View style={styles.momentHeader}>
            <View style={styles.avatarGlow}>
              {post.author.photoUrl ? (
                <Image source={{ uri: post.author.photoUrl.startsWith("http") ? post.author.photoUrl : `${getApiUrl()}${post.author.photoUrl.startsWith("/") ? post.author.photoUrl : `/${post.author.photoUrl}`}` }} style={styles.momentAvatar} />
              ) : (
                <View style={[styles.momentAvatar, styles.avatarPlaceholder]}>
                  <ThemedText style={styles.avatarInitial}>
                    {(post.author.name || post.author.username || "?").charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
              )}
            </View>
            <View style={styles.authorMeta}>
              <View style={styles.nameAndTitle}>
                <ThemedText style={styles.momentAuthorName}>
                  {post.author.name || post.author.username}
                </ThemedText>
                {post.author.isCoach ? (
                  <View style={styles.coachTag}>
                    <ThemedText style={styles.coachTagText}>Coach</ThemedText>
                  </View>
                ) : null}
              </View>
              {post.author.title ? (
                <View style={styles.titleBadge}>
                  <ThemedText style={styles.titleBadgeText}>{post.author.title}</ThemedText>
                </View>
              ) : post.author.level ? (
                <View style={styles.titleBadge}>
                  <ThemedText style={styles.titleBadgeText}>Level {post.author.level}</ThemedText>
                </View>
              ) : null}
            </View>
            <ThemedText style={styles.momentTime}>{formatTimeAgo(post.createdAt)}</ThemedText>
          </View>

          {post.caption ? (
            <ThemedText style={styles.momentCaption}>{post.caption}</ThemedText>
          ) : null}

          <View style={styles.momentActions}>
            <Pressable
              style={[styles.cheerButton, post.userReaction && styles.cheerButtonActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowCheerPicker(!showCheerPicker);
              }}
            >
              <ThemedText style={styles.cheerEmoji}>
                {post.userReaction ? "\u{1F525}" : "\u{1F44F}"}
              </ThemedText>
              <ThemedText style={[styles.cheerCount, post.userReaction && styles.cheerCountActive]}>
                {post.cheerCount || 0}
              </ThemedText>
              <View style={styles.xpBadge}>
                <ThemedText style={styles.xpBadgeText}>+5 XP</ThemedText>
              </View>
            </Pressable>

            <Pressable
              style={styles.commentButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onComment(post.id);
              }}
            >
              <Ionicons name="chatbubble-outline" size={18} color={Colors.dark.textMuted} />
              <ThemedText style={styles.commentCount}>{post.commentCount || 0}</ThemedText>
            </Pressable>

            <Pressable
              style={styles.shareButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onShare(post);
              }}
            >
              <Ionicons name="share-outline" size={18} color={Colors.dark.textMuted} />
            </Pressable>

            {isOwnPost ? (
              <Pressable
                style={styles.deleteButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onDelete(post.id);
                }}
              >
                <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
              </Pressable>
            ) : (
              <Pressable
                style={styles.moreButton}
                onPress={handleMoreOptions}
                accessibilityLabel="More options"
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={Colors.dark.textMuted} />
              </Pressable>
            )}
          </View>

          {showCheerPicker ? (
            <Animated.View entering={FadeIn.duration(150)} style={styles.cheerPicker}>
              {CHEER_REACTIONS.map((reaction, index) => (
                <Pressable
                  key={index}
                  style={styles.cheerOption}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onReact(post.id, reaction.type);
                    setShowCheerPicker(false);
                  }}
                >
                  <ThemedText style={styles.cheerOptionEmoji}>{reaction.emoji}</ThemedText>
                </Pressable>
              ))}
            </Animated.View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

export function EmptyFeed({ filter }: { filter: FeedFilter }) {
  const { t } = useTranslation();
  const getMessage = () => {
    switch (filter) {
      case "academy":
        return "No academy moments yet. Be the first to share!";
      case "events":
        return "No event updates yet. Check back during events!";
      default:
        return t('player.community.beFirst');
    }
  };

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="sparkles" size={48} color={Colors.dark.primary} />
      </View>
      <ThemedText style={styles.emptyTitle}>{t('player.community.noPostsYet')}</ThemedText>
      <ThemedText style={styles.emptySubtitle}>{getMessage()}</ThemedText>
    </View>
  );
}

export function MainTabBar({ active, onChange, friendRequestCount = 0 }: { active: MainTab; onChange: (tab: MainTab) => void; friendRequestCount?: number }) {
  const { t } = useTranslation();
  const tabs: { key: MainTab; label: string; icon: string }[] = [
    { key: "feed", label: t('player.community.feed'), icon: "newspaper" },
    { key: "friends", label: t('player.community.friends'), icon: "people" },
    { key: "groups", label: t('player.community.groups'), icon: "grid" },
  ];

  return (
    <View style={styles.mainTabContainer}>
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={[styles.mainTab, isActive && styles.mainTabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(tab.key);
            }}
          >
            <Ionicons
              name={tab.icon as any}
              size={20}
              color={isActive ? Colors.dark.primary : Colors.dark.textSecondary}
            />
            <ThemedText style={[styles.mainTabText, isActive && styles.mainTabTextActive]}>
              {tab.label}
            </ThemedText>
            {tab.key === "friends" && friendRequestCount > 0 ? (
              <View style={styles.requestBadge}>
                <ThemedText style={styles.requestBadgeText}>{friendRequestCount}</ThemedText>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function FeedFilterTabs({ active, onChange }: { active: FeedFilter; onChange: (f: FeedFilter) => void }) {
  const { t } = useTranslation();
  const filters: { key: FeedFilter; label: string; icon: string }[] = [
    { key: "for_you", label: t('player.community.forYou'), icon: "trophy" },
    { key: "news", label: t('player.community.news'), icon: "newspaper" },
    { key: "academy", label: t('player.community.academy'), icon: "tennisball" },
    { key: "moments", label: t('player.community.moments'), icon: "camera" },
    { key: "events", label: t('player.community.events'), icon: "calendar" },
  ];

  return (
    <View style={styles.filterContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterPills}
      >
        {filters.map((filter) => {
          const isActive = active === filter.key;
          return (
            <Pressable
              key={filter.key}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onChange(filter.key);
              }}
            >
              <Ionicons
                name={filter.icon as any}
                size={14}
                color={isActive ? Colors.dark.backgroundRoot : Colors.dark.textSecondary}
              />
              <ThemedText style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                {filter.label}
              </ThemedText>
              {isActive ? (
                <View style={styles.xpSpark}>
                  <ThemedText style={styles.xpSparkText}>{"\u2728"}</ThemedText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  mediaUnavailable: {
    width: "100%",
    height: 200,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  mediaUnavailableText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  videoContainer: {
    position: "relative",
  },
  videoIndicator: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 6,
    borderRadius: 12,
  },
  momentImage: {
    width: "100%",
    height: "100%",
  },
  momentCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  mediaSection: {
    position: "relative",
  },
  momentImageContainer: {
    width: "100%",
    height: 200,
    backgroundColor: "rgba(0,0,0,0.3)",
    overflow: "hidden",
  },
  contextBadgeOverlay: {
    position: "absolute",
    top: Spacing.sm,
    left: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  contextBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  mediaCountBadge: {
    position: "absolute",
    bottom: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  mediaCountText: {
    fontSize: 12,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  noMediaHeader: {
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  contextBadgeLarge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 20,
  },
  contextBadgeLargeText: {
    fontSize: 16,
    fontWeight: "700",
  },
  momentContent: {
    padding: Spacing.md,
  },
  momentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  avatarGlow: {
    borderRadius: 22,
    padding: 2,
    borderWidth: 2,
    borderColor: Colors.dark.primary + "50",
  },
  momentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  authorMeta: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  nameAndTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  momentAuthorName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  coachTag: {
    backgroundColor: "#FFD700" + "25",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  coachTagText: {
    fontSize: 10,
    color: "#FFD700",
    fontWeight: "700",
  },
  titleBadge: {
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: Colors.dark.primary + "15",
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  titleBadgeText: {
    fontSize: 10,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  momentTime: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  momentCaption: {
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  momentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  cheerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cheerButtonActive: {
    backgroundColor: "#FF6B3520",
    borderColor: "#FF6B35",
  },
  cheerEmoji: {
    fontSize: 18,
  },
  cheerCount: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  cheerCountActive: {
    color: "#FF6B35",
  },
  xpBadge: {
    backgroundColor: Colors.dark.primary + "30",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 4,
  },
  xpBadgeText: {
    fontSize: 10,
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  commentButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
  },
  commentCount: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  shareButton: {
    padding: 8,
  },
  deleteButton: {
    padding: 8,
    marginLeft: "auto",
  },
  moreButton: {
    padding: 8,
    marginLeft: "auto",
  },
  cheerPicker: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
  },
  cheerOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cheerOptionEmoji: {
    fontSize: 22,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  mainTabContainer: {
    flexDirection: "row",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: 4,
  },
  mainTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
  },
  mainTabActive: {
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  mainTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  mainTabTextActive: {
    color: Colors.dark.primary,
  },
  requestBadge: {
    backgroundColor: Colors.dark.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  requestBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  filterContainer: {
    paddingBottom: Spacing.sm,
  },
  filterPills: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
    alignItems: "center",
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterPillActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  filterPillTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  xpSpark: {
    marginLeft: 2,
  },
  xpSparkText: {
    fontSize: 12,
  },
}));
