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
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  type FeedFilter,
  type MainTab,
  type Post,
  CONTEXT_BADGE_STYLES,
  CHEER_REACTIONS,
  formatTimeAgo,
  POST_TEMPLATE_META,
  type PostTemplate,
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
  const templateMeta = post.postTemplate
    ? POST_TEMPLATE_META[post.postTemplate as PostTemplate]
    : null;
  const isCoachOrAcademyPost = !!templateMeta || !!post.author?.isCoach;
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

          {post.isPinned || templateMeta ? (
            <View style={styles.podiumBadgeRow}>
              {post.isPinned ? (
                <View style={styles.pinnedPill}>
                  <Ionicons name="pin" size={11} color={Colors.dark.warning} />
                  <ThemedText style={styles.pinnedPillText}>Pinned</ThemedText>
                </View>
              ) : null}
              {templateMeta ? (
                <View
                  style={[
                    styles.templatePill,
                    { backgroundColor: templateMeta.accent + "22", borderColor: templateMeta.accent + "55" },
                  ]}
                >
                  <Ionicons name={templateMeta.icon as any} size={11} color={templateMeta.accent} />
                  <ThemedText style={[styles.templatePillText, { color: templateMeta.accent }]}>
                    {templateMeta.label}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Phase 3 podium headline: "Coach NAME — Tip of the Day" so the
              role/template attribution is unmistakable above the caption. */}
          {templateMeta ? (
            <ThemedText style={[styles.podiumHeadline, { color: templateMeta.accent }]}>
              {(post.author?.isCoach ? "Coach " : "") +
                (post.author?.name || post.author?.username || "")}
              {" — "}
              {templateMeta.label}
            </ThemedText>
          ) : null}

          {post.caption ? (
            <ThemedText
              style={[
                styles.momentCaption,
                isCoachOrAcademyPost && templateMeta
                  ? { borderLeftWidth: 3, borderLeftColor: templateMeta.accent, paddingLeft: 10 }
                  : null,
              ]}
            >
              {post.caption}
            </ThemedText>
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

export function SystemFeedCard({
  item,
  onComment,
  currentPlayerId,
  onOpenCreateMatch,
}: {
  item: any;
  onComment?: (feedItemId: string) => void;
  currentPlayerId?: string | null;
  onOpenCreateMatch?: (opponentId?: string, opponentName?: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showCheerPicker, setShowCheerPicker] = useState(false);
  const [optimisticReaction, setOptimisticReaction] = useState<string | null | undefined>(undefined);
  const [optimisticDelta, setOptimisticDelta] = useState(0);
  const feedType: string = String(item?.feedType || "");
  const payload = item?.payload || {};
  const author = item?.author;
  const occurredAt = item?.occurredAt || item?.createdAt;

  const currentReaction = optimisticReaction !== undefined ? optimisticReaction : item?.userReaction || null;
  const cheerCount = Math.max(0, (item?.cheerCount || 0) + optimisticDelta);
  const commentCount = item?.commentCount || 0;
  const sourceId: string | undefined = item?.sourceId || item?.id;

  // Local optimistic state for the Join button.
  const [joinedLocal, setJoinedLocal] = useState(false);

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!sourceId) throw new Error("Missing match id");
      return apiRequest("POST", `/api/open-matches/${sourceId}/join`);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setJoinedLocal(true);
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/open-matches"] });
    },
    onError: (err: any) => {
      const msg = String(err?.message || "");
      // Already joined → flip the chip locally without an alert.
      if (/already joined/i.test(msg)) {
        setJoinedLocal(true);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Couldn't Join", msg || "Something went wrong. Try again.");
    },
  });

  const handleReact = async (type: string) => {
    setShowCheerPicker(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const prev = currentReaction;
    if (prev === type) {
      // toggle off
      setOptimisticReaction(null);
      setOptimisticDelta((d) => d - 1);
      try {
        await apiRequest("DELETE", `/api/social/feed-items/${item.id}/reactions`);
      } catch {
        setOptimisticReaction(prev);
        setOptimisticDelta((d) => d + 1);
        Alert.alert("Error", "Could not remove your cheer. Please try again.");
        return;
      }
    } else {
      const isNew = !prev;
      setOptimisticReaction(type);
      if (isNew) setOptimisticDelta((d) => d + 1);
      try {
        await apiRequest("POST", `/api/social/feed-items/${item.id}/reactions`, { reactionType: type });
      } catch {
        setOptimisticReaction(prev);
        if (isNew) setOptimisticDelta((d) => d - 1);
        Alert.alert("Error", "Could not save your cheer. Please try again.");
        return;
      }
    }
    queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
  };

  const config = useMemo(() => {
    switch (feedType) {
      case "match_result": {
        const won = payload.result === "won";
        return {
          icon: won ? "trophy" : "tennisball",
          tint: won ? Colors.dark.primary : Colors.dark.textSecondary,
          title: won
            ? `${author?.name || "A player"} won a ${payload.matchType || "match"}!`
            : `${author?.name || "A player"} played a ${payload.matchType || "match"}`,
          subtitle: payload.opponentName
            ? `vs ${payload.opponentName}${payload.playerScore && payload.opponentScore ? `  ·  ${payload.playerScore}–${payload.opponentScore}` : ""}`
            : payload.playerScore && payload.opponentScore
              ? `${payload.playerScore}–${payload.opponentScore}`
              : null,
        };
      }
      case "level_up":
        return {
          icon: "rocket",
          tint: Colors.dark.primary,
          title: `${author?.name || "A player"} leveled up!`,
          subtitle: payload.toLevelDisplay || payload.toLevelName
            ? `Now ${payload.toLevelDisplay || payload.toLevelName}`
            : null,
        };
      case "quest_complete":
        return {
          icon: payload.iconName || "checkmark-done-circle",
          tint: "#FFD166",
          title: `${author?.name || "A player"} completed a quest`,
          subtitle: payload.name
            ? `"${payload.name}"${payload.xpReward ? `  ·  +${payload.xpReward} XP` : ""}`
            : null,
        };
      case "tournament_result":
        return {
          icon: "trophy",
          tint: "#FFB347",
          title: payload.tournamentName
            ? `${payload.tournamentName} – winner crowned!`
            : "Tournament winner crowned!",
          subtitle: payload.winnerName ? `Champion: ${payload.winnerName}` : null,
        };
      case "open_match":
        return {
          icon: "people",
          tint: Colors.dark.primary,
          title: payload.title || `${author?.name || "A player"} is looking for a match`,
          subtitle: [
            payload.matchType,
            payload.courtName,
            payload.costPerPlayer ? `${payload.costPerPlayer} ${payload.currency || ""}` : null,
          ]
            .filter(Boolean)
            .join("  ·  "),
        };
      case "coach_practice_pair":
        return {
          icon: "people-circle",
          tint: Colors.dark.primary,
          title: payload.coachName
            ? `${payload.coachName} suggests a practice match`
            : "Coach suggests a practice match",
          subtitle: [
            payload.partnerName ? `with ${payload.partnerName}` : null,
            payload.note ? `"${payload.note}"` : null,
          ]
            .filter(Boolean)
            .join("  ·  "),
        };
      case "coach_spotlight":
        return {
          icon: "megaphone",
          tint: Colors.dark.primary,
          title: payload.title || `${author?.name || "A coach"} shared an update`,
          subtitle: payload.summary || null,
        };
      default:
        return {
          icon: "sparkles",
          tint: Colors.dark.primary,
          title: "New activity",
          subtitle: null,
        };
    }
  }, [feedType, payload, author]);

  // Inline action area (Join, coach pair CTA, etc.) — rendered to the right
  // of the body. Keeps the card compact on small screens.
  const action = useMemo(() => {
    if (feedType === "open_match") {
      const status: string = String(payload.status || "open");
      const cur = Number(payload.currentPlayers || 0);
      const max = Number(payload.maxPlayers || 0);
      const isOwner =
        !!currentPlayerId && !!item?.authorPlayerId && currentPlayerId === item.authorPlayerId;
      const isFull = max > 0 && cur >= max;
      const isPast = status !== "open";

      if (isOwner) {
        return { label: "Yours", disabled: true, tone: "muted" as const };
      }
      if (joinedLocal) {
        return { label: "Joined", disabled: true, tone: "success" as const };
      }
      if (isPast) {
        return { label: "Closed", disabled: true, tone: "muted" as const };
      }
      if (isFull) {
        return { label: "Full", disabled: true, tone: "muted" as const };
      }
      return {
        label: joinMutation.isPending ? "Joining…" : "Join",
        disabled: joinMutation.isPending,
        tone: "primary" as const,
        onPress: () => {
          if (!sourceId) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          joinMutation.mutate();
        },
      };
    }
    if (feedType === "coach_practice_pair") {
      return {
        label: "Set up",
        disabled: false,
        tone: "primary" as const,
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onOpenCreateMatch?.(payload.partnerId, payload.partnerName);
        },
      };
    }
    return null;
  }, [
    feedType,
    payload,
    currentPlayerId,
    item?.authorPlayerId,
    sourceId,
    joinedLocal,
    joinMutation,
    onOpenCreateMatch,
  ]);

  return (
    <Animated.View entering={FadeInDown.delay(50).springify()}>
      <View style={styles.systemCard}>
        <View style={styles.systemTopRow}>
          <View style={[styles.systemIconWrap, { backgroundColor: `${config.tint}20` }]}>
            <Ionicons name={config.icon as any} size={20} color={config.tint as string} />
          </View>
          <View style={styles.systemBody}>
            <ThemedText style={styles.systemTitle}>{config.title}</ThemedText>
            {config.subtitle ? (
              <ThemedText style={styles.systemSubtitle}>{config.subtitle}</ThemedText>
            ) : null}
            <ThemedText style={styles.systemTime}>{formatTimeAgo(occurredAt)}</ThemedText>
          </View>
          {action ? (
            <Pressable
              disabled={action.disabled}
              onPress={action.onPress}
              style={[
                styles.systemActionBtn,
                action.tone === "primary" && styles.systemActionBtnPrimary,
                action.tone === "success" && styles.systemActionBtnSuccess,
                action.tone === "muted" && styles.systemActionBtnMuted,
                action.disabled && styles.systemActionBtnDisabled,
              ]}
            >
              <ThemedText
                style={[
                  styles.systemActionText,
                  action.tone === "primary" && styles.systemActionTextPrimary,
                  action.tone === "success" && styles.systemActionTextSuccess,
                  action.tone === "muted" && styles.systemActionTextMuted,
                ]}
              >
                {action.label}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.systemEngagementRow}>
          <Pressable
            style={[styles.cheerButton, currentReaction && styles.cheerButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowCheerPicker((v) => !v);
            }}
          >
            <ThemedText style={styles.cheerEmoji}>
              {currentReaction
                ? (CHEER_REACTIONS.find((r) => r.type === currentReaction)?.emoji || "\u{1F525}")
                : "\u{1F44F}"}
            </ThemedText>
            <ThemedText style={[styles.cheerCount, currentReaction && styles.cheerCountActive]}>
              {cheerCount}
            </ThemedText>
          </Pressable>

          <Pressable
            style={styles.commentButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onComment?.(item.id);
            }}
          >
            <Ionicons name="chatbubble-outline" size={18} color={Colors.dark.textMuted} />
            <ThemedText style={styles.commentCount}>{commentCount}</ThemedText>
          </Pressable>
        </View>

        {showCheerPicker ? (
          <Animated.View entering={FadeIn.duration(150)} style={styles.cheerPicker}>
            {CHEER_REACTIONS.map((reaction, index) => (
              <Pressable
                key={index}
                style={styles.cheerOption}
                onPress={() => handleReact(reaction.type)}
              >
                <ThemedText style={styles.cheerOptionEmoji}>{reaction.emoji}</ThemedText>
              </Pressable>
            ))}
          </Animated.View>
        ) : null}
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

export function MainTabBar({
  active,
  onChange,
  friendRequestCount = 0,
  feedUnseenCount = 0,
}: {
  active: MainTab;
  onChange: (tab: MainTab) => void;
  friendRequestCount?: number;
  feedUnseenCount?: number;
}) {
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
        const badgeCount =
          tab.key === "friends"
            ? friendRequestCount
            : tab.key === "feed"
              ? feedUnseenCount
              : 0;
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
            {badgeCount > 0 ? (
              <View style={styles.requestBadge}>
                <ThemedText style={styles.requestBadgeText}>
                  {badgeCount > 99 ? "99+" : badgeCount}
                </ThemedText>
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
    { key: "all", label: t('player.community.all', 'All'), icon: "sparkles" },
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
  podiumBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    marginBottom: Spacing.sm,
  },
  pinnedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: (Colors.dark.warning || "#F59E0B") + "22",
    borderColor: (Colors.dark.warning || "#F59E0B") + "55",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pinnedPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.warning || "#F59E0B",
    letterSpacing: 0.4,
  },
  templatePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  templatePillText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  podiumHeadline: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: Spacing.xs,
    letterSpacing: 0.2,
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
  systemCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  systemTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  systemEngagementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
  },
  systemIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  systemBody: {
    flex: 1,
    gap: 2,
  },
  systemTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  systemSubtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  systemTime: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  systemActionBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  systemActionBtnPrimary: {
    backgroundColor: Colors.dark.primary,
  },
  systemActionBtnSuccess: {
    backgroundColor: Colors.dark.primary + "26",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "55",
  },
  systemActionBtnMuted: {
    backgroundColor: Colors.dark.chipBackground,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  systemActionBtnDisabled: {
    opacity: 0.7,
  },
  systemActionText: {
    fontSize: 13,
    fontWeight: "700",
  },
  systemActionTextPrimary: {
    color: Colors.dark.buttonText,
  },
  systemActionTextSuccess: {
    color: Colors.dark.primary,
  },
  systemActionTextMuted: {
    color: Colors.dark.textSecondary,
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
