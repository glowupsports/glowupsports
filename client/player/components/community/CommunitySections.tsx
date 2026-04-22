import logger from "@/lib/logger";
import React, { useState, useMemo } from "react";
import GroupPreviewSheet, { type SheetGroup } from "./GroupPreviewSheet";
import {
  View,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  Share,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { apiRequest, apiFetch, getApiUrl } from "@/lib/query-client";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/coach/context/AuthContext";
import {
  type Achievement,
  type NewsItem,
  type Friend,
  type FriendActivity,
  type Group,
  type GroupFilter,
  type Post,
  TAB_BAR_HEIGHT,
  CONTEXT_BADGE_STYLES,
  CONTEXT_OPTIONS,
  GROUP_FILTERS,
  formatTimeAgo,
} from "./CommunityTypes";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
export function AchievementShowcase({ onSelectAchievement }: { onSelectAchievement: (achievement: Achievement) => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT;
  const { user } = useAuth();

  const { data: achievementsData, isLoading, refetch } = useQuery<{ achievements: Achievement[] }>({
    queryKey: ["/api/player/me/achievements"],
  });

  const achievements = achievementsData?.achievements || [];

  const handleShare = async (achievement: Achievement) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const shareMessage = `${achievement.title}\n${achievement.description}\n\nAchieved on Glow Up Tennis`;

    try {
      await Share.share({
        message: shareMessage,
        title: achievement.title,
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  const getAchievementGradient = (type: string): [string, string] => {
    switch (type) {
      case "match_won": return ["#FFD700", "#FF8C00"];
      case "level_up": return [GlowColors.primary, "#7CFC00"];
      case "streak": return ["#FF6B35", "#FF4500"];
      case "badge": return ["#E040FB", "#9C27B0"];
      case "rating_up": return ["#00E5FF", "#00BFFF"];
      default: return [GlowColors.primary, "#7CFC00"];
    }
  };

  const renderAchievementCard = ({ item }: { item: Achievement }) => {
    const gradient = getAchievementGradient(item.type);

    return (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onSelectAchievement(item);
        }}
      >
        <Animated.View entering={FadeInDown.delay(100)} style={achievementStyles.cardContainer}>
          <LinearGradient
            colors={[gradient[0] + "15", gradient[1] + "08"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={achievementStyles.card}
          >
            <View style={achievementStyles.cardHeader}>
              <LinearGradient
                colors={gradient}
                style={achievementStyles.iconContainer}
              >
                <Ionicons name={item.icon as any} size={24} color={Colors.dark.buttonText} />
              </LinearGradient>
              <View style={achievementStyles.headerText}>
                <ThemedText style={[achievementStyles.title, { color: gradient[0] }]}>
                  {item.title}
                </ThemedText>
                <ThemedText style={achievementStyles.date}>
                  {formatTimeAgo(item.date)}
                </ThemedText>
              </View>
              {item.value ? (
                <View style={[achievementStyles.valueBadge, { backgroundColor: gradient[0] }]}>
                  <ThemedText style={achievementStyles.valueText}>{item.value}</ThemedText>
                </View>
              ) : null}
            </View>

            <ThemedText style={achievementStyles.description}>
              {item.description}
            </ThemedText>

            <View style={achievementStyles.shareButton}>
              <LinearGradient
                colors={gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={achievementStyles.shareGradient}
              >
                <Ionicons name="share-social" size={16} color={Colors.dark.buttonText} />
                <ThemedText style={achievementStyles.shareText}>Share to Story</ThemedText>
              </LinearGradient>
            </View>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <FlatList
      data={achievements}
      keyExtractor={(item) => item.id}
      renderItem={renderAchievementCard}
      contentContainerStyle={[
        achievementStyles.list,
        { paddingBottom: tabBarHeight + 80 + Spacing.xl }
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={refetch}
          tintColor={Colors.dark.primary}
        />
      }
      ListHeaderComponent={
        achievements.length > 0 ? (
          <View style={achievementStyles.header}>
            <LinearGradient
              colors={[GlowColors.primary, "#7CFC00"]}
              style={achievementStyles.headerIconBg}
            >
              <Ionicons name="trophy" size={28} color={Colors.dark.buttonText} />
            </LinearGradient>
            <ThemedText style={achievementStyles.headerTitle}>{t('player.profile.achievements')}</ThemedText>
            <ThemedText style={achievementStyles.headerSubtitle}>
              Share your victories with friends
            </ThemedText>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={achievementStyles.empty}>
          <Ionicons name="trophy-outline" size={48} color={Colors.dark.textMuted} />
          <ThemedText style={achievementStyles.emptyTitle}>No Achievements Yet</ThemedText>
          <ThemedText style={achievementStyles.emptyText}>
            Complete sessions and earn achievements to see them here
          </ThemedText>
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

export function NewsSection() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT;

  const { data: newsData, isLoading, refetch } = useQuery<{ articles: NewsItem[] }>({
    queryKey: ["/api/player/news"],
  });

  const news = newsData?.articles || [];

  const getCategoryFromSource = (source: string): string => {
    const lowerSource = source.toLowerCase();
    if (lowerSource.includes("atp") || lowerSource.includes("espn")) return "atp";
    if (lowerSource.includes("wta")) return "wta";
    return "general";
  };

  const getCategoryColor = (source: string) => {
    const category = getCategoryFromSource(source);
    switch (category) {
      case "atp": return "#00A8E8";
      case "wta": return "#E040FB";
      default: return Colors.dark.primary;
    }
  };

  const handleOpenArticle = async (link: string) => {
    if (link && link !== "#") {
      try {
        await WebBrowser.openBrowserAsync(link);
      } catch (error) {
        console.error("Failed to open article:", error);
      }
    }
  };

  const renderNewsCard = ({ item }: { item: NewsItem }) => (
    <Animated.View entering={FadeInDown.delay(50)}>
      <Pressable style={newsStyles.card} onPress={() => handleOpenArticle(item.link)}>
        <View style={newsStyles.cardContent}>
          <View style={newsStyles.categoryRow}>
            <View style={[newsStyles.categoryBadge, { backgroundColor: getCategoryColor(item.source) + "20" }]}>
              <ThemedText style={[newsStyles.categoryText, { color: getCategoryColor(item.source) }]}>
                {getCategoryFromSource(item.source).toUpperCase()}
              </ThemedText>
            </View>
            <ThemedText style={newsStyles.source}>{item.source}</ThemedText>
          </View>

          <ThemedText style={newsStyles.title} numberOfLines={2}>
            {item.title}
          </ThemedText>

          <View style={newsStyles.footer}>
            <ThemedText style={newsStyles.time}>
              {formatTimeAgo(item.publishedAt)}
            </ThemedText>
            <View style={newsStyles.readMore}>
              <ThemedText style={newsStyles.readMoreText}>Read More</ThemedText>
              <Ionicons name="chevron-forward" size={14} color={Colors.dark.primary} />
            </View>
          </View>
        </View>

        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={newsStyles.image} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={[getCategoryColor(item.source), getCategoryColor(item.source) + "80"]}
            style={newsStyles.imagePlaceholder}
          >
            <Ionicons name="tennisball" size={32} color="#FFF" />
          </LinearGradient>
        )}
      </Pressable>
    </Animated.View>
  );

  return (
    <FlatList
      data={news}
      keyExtractor={(item) => item.id}
      renderItem={renderNewsCard}
      contentContainerStyle={[
        newsStyles.list,
        { paddingBottom: tabBarHeight + 80 + Spacing.xl }
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={refetch}
          tintColor={Colors.dark.primary}
        />
      }
      ListHeaderComponent={
        <View style={newsStyles.header}>
          <View style={newsStyles.headerRow}>
            <Ionicons name="newspaper" size={24} color={Colors.dark.primary} />
            <ThemedText style={newsStyles.headerTitle}>{t('player.community.news')}</ThemedText>
          </View>
          <ThemedText style={newsStyles.headerSubtitle}>
            Latest from ATP, WTA & Tennis World
          </ThemedText>
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

export function FriendsSection({ onChallenge, onSelectActivity }: { onChallenge?: (friend: Friend) => void; onSelectActivity?: (activity: FriendActivity) => void }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT;
  const [activeTab, setActiveTab] = useState<"activity" | "friends" | "requests">("activity");

  const { data: friendsData, isLoading, refetch } = useQuery<{ friends: Friend[]; pendingRequests: Friend[] }>({
    queryKey: ["/api/player/me/friends"],
  });

  const { data: friendsActivityData, isLoading: activityLoading } = useQuery<Post[]>({
    queryKey: ["/api/social/feed", { filter: "friends" }],
    queryFn: async () => {
      const response = await apiFetch("/api/social/feed?filter=friends");
      if (response.status === 403) return [];
      if (!response.ok) throw new Error("Failed to load activity");
      return response.json();
    },
  });

  const friendsActivity = Array.isArray(friendsActivityData) ? friendsActivityData : [];

  const friends = friendsData?.friends || [];
  const requests = friendsData?.pendingRequests || [];

  logger.log("[DEBUG FRIENDS] friendsData raw:", JSON.stringify({
    hasFriendsData: !!friendsData,
    friendsArray: Array.isArray(friendsData?.friends),
    friendsCount: friends.length,
    rawData: friendsData
  }, null, 2).slice(0, 500));

  const cheerMutation = useMutation({
    mutationFn: async (postId: string) => {
      const response = await apiFetch(`/api/social/posts/${postId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactionType: "fire" }),
      });
      if (!response.ok) throw new Error("Failed to cheer");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
    },
  });

  const handleCheerPost = (postId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cheerMutation.mutate(postId);
  };

  const getBallColor = (level?: string) => {
    const colors: Record<string, string> = {
      blue: "#3B82F6", red: "#EF4444", orange: "#F97316",
      green: "#22C55E", yellow: "#EAB308", glow: Colors.dark.primary,
    };
    return colors[level?.toLowerCase() || ""] || Colors.dark.textSecondary;
  };

  const handleChallenge = (friend: Friend) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    navigation.navigate("PlayStack", {
      screen: "ChallengePlayer",
      params: { opponentId: friend.id, opponentName: friend.name, opponentBallLevel: friend.ballLevel, opponentLevel: friend.skillLevel }
    });
  };

  const handleMessage = (friend: Friend) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PlayerMessages" as never);
  };

  const extractServerError = (e: unknown): string | null => {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    // apiRequest throws errors of the form "<status>: <body>" — try to parse the JSON body.
    const match = msg.match(/^\d+:\s*(.*)$/s);
    const body = match ? match[1] : msg;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.error === "string" && parsed.error.length > 0) return parsed.error;
      if (parsed && typeof parsed.message === "string" && parsed.message.length > 0) return parsed.message;
    } catch {
      // not JSON
    }
    return null;
  };

  const handleAcceptRequest = async (connectionId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await apiRequest(
        "POST",
        `/api/player/connections/${connectionId}/respond`,
        { action: "accept" },
      );
      await queryClient.invalidateQueries({ queryKey: ["/api/player/me/friends"] });
    } catch (e) {
      logger.log("Accept error", e);
      const serverMsg = extractServerError(e);
      Alert.alert(
        "Couldn't accept request",
        serverMsg || "Please check your connection and try again.",
      );
    }
  };

  const handleRejectRequest = async (connectionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest(
        "POST",
        `/api/player/connections/${connectionId}/respond`,
        { action: "decline" },
      );
      await queryClient.invalidateQueries({ queryKey: ["/api/player/me/friends"] });
    } catch (e) {
      logger.log("Reject error", e);
      const serverMsg = extractServerError(e);
      Alert.alert(
        "Couldn't reject request",
        serverMsg || "Please check your connection and try again.",
      );
    }
  };

  const handleInviteFriends = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await apiFetch("/api/player/me/invite-link");
      const data = res.ok ? await res.json() : null;
      const link = data?.link || "https://glowuptennis.app";
      await Share.share({
        message: `Play tennis with me on Glow Up Tennis! Download the app and add me as a friend: ${link}`,
        title: "Invite tennis friends",
      });
    } catch (e) {
      logger.log("Invite error", e);
    }
  };

  const renderFriendCard = (friend: Friend) => (
    <Animated.View key={friend.id} entering={FadeInDown.delay(100).springify()}>
      <Pressable
        style={friendStyles.friendCard}
        onPress={() => navigation.navigate("PublicProfile", { playerId: friend.id })}
      >
        <View style={friendStyles.friendAvatarSection}>
          <View style={[friendStyles.friendAvatarRing, { borderColor: getBallColor(friend.ballLevel) }]}>
            {friend.photoUrl ? (
              <Image source={{ uri: friend.photoUrl }} style={friendStyles.friendAvatar} contentFit="cover" />
            ) : (
              <View style={[friendStyles.friendAvatarPlaceholder, { backgroundColor: getBallColor(friend.ballLevel) + "30" }]}>
                <ThemedText style={[friendStyles.friendAvatarLetter, { color: getBallColor(friend.ballLevel) }]}>
                  {friend.name.charAt(0).toUpperCase()}
                </ThemedText>
              </View>
            )}
          </View>
          {friend.openToPlay ? (
            <View style={friendStyles.onlineIndicator}>
              <View style={friendStyles.onlineDot} />
            </View>
          ) : null}
        </View>

        <View style={friendStyles.friendInfo}>
          <ThemedText style={friendStyles.friendName} numberOfLines={1}>{friend.name}</ThemedText>
          <View style={friendStyles.friendMeta}>
            <View style={[friendStyles.friendLevelBadge, { backgroundColor: getBallColor(friend.ballLevel) }]}>
              <ThemedText style={friendStyles.friendLevelText}>
                {friend.ballLevel?.toUpperCase() || "NEW"} {friend.skillLevel || ""}
              </ThemedText>
            </View>
            {friend.openToPlay ? (
              <ThemedText style={friendStyles.friendStatus}>Open to Play</ThemedText>
            ) : null}
          </View>
        </View>

        <View style={friendStyles.friendActions}>
          <Pressable
            style={friendStyles.friendActionBtn}
            onPress={(e) => { e.stopPropagation(); handleMessage(friend); }}
          >
            <Ionicons name="chatbubble" size={18} color={Colors.dark.textSecondary} />
          </Pressable>
          <Pressable
            style={friendStyles.friendChallengeBtn}
            onPress={(e) => { e.stopPropagation(); handleChallenge(friend); }}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primaryGlow || "#9AE66E"]}
              style={friendStyles.friendChallengeBtnGradient}
            >
              <Ionicons name="flash" size={14} color={Colors.dark.buttonText} />
              <ThemedText style={friendStyles.friendChallengeText}>Challenge</ThemedText>
            </LinearGradient>
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );

  const renderRequestCard = (request: Friend) => (
    <Animated.View key={request.id} entering={FadeInDown.delay(100).springify()}>
      <View style={friendStyles.requestCard}>
        <View style={friendStyles.friendAvatarSection}>
          {request.photoUrl ? (
            <Image source={{ uri: request.photoUrl }} style={friendStyles.friendAvatar} contentFit="cover" />
          ) : (
            <View style={[friendStyles.friendAvatarPlaceholder, { backgroundColor: Colors.dark.primary + "30" }]}>
              <ThemedText style={[friendStyles.friendAvatarLetter, { color: Colors.dark.primary }]}>
                {request.name.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
          )}
        </View>

        <View style={friendStyles.friendInfo}>
          <ThemedText style={friendStyles.friendName}>{request.name}</ThemedText>
          <ThemedText style={friendStyles.requestSubtext}>Wants to be your tennis buddy</ThemedText>
        </View>

        <View style={friendStyles.requestActions}>
          <Pressable style={friendStyles.rejectBtn} onPress={() => handleRejectRequest(request.connectionId ?? request.id)}>
            <Ionicons name="close" size={20} color={Colors.dark.error} />
          </Pressable>
          <Pressable style={friendStyles.acceptBtn} onPress={() => handleAcceptRequest(request.connectionId ?? request.id)}>
            <Ionicons name="checkmark" size={20} color={Colors.dark.buttonText} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );

  const renderActivityCard = (post: Post) => {
    const badgeStyle = CONTEXT_BADGE_STYLES[post.contextType] || CONTEXT_BADGE_STYLES.training;

    const handleOpenDetail = () => {
      if (onSelectActivity) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSelectActivity({
          id: post.id,
          playerId: post.authorId,
          playerName: post.author.name || "Unknown",
          level: post.author.level || 1,
          type: post.contextType,
          caption: post.caption || "",
          time: formatTimeAgo(post.createdAt),
          cheers: post.cheerCount,
          photoUrl: post.author.photoUrl,
        });
      }
    };

    return (
      <Animated.View key={post.id} entering={FadeInDown.delay(100).springify()}>
        <Pressable style={friendStyles.activityCard} onPress={handleOpenDetail}>
          <View style={friendStyles.activityHeader}>
            <View style={friendStyles.activityAvatarContainer}>
              {post.author.photoUrl ? (
                <Image
                  source={{ uri: post.author.photoUrl.startsWith("http") ? post.author.photoUrl : `${getApiUrl()}${post.author.photoUrl}` }}
                  style={friendStyles.activityAvatar}
                  contentFit="cover"
                />
              ) : (
                <LinearGradient
                  colors={[getBallColor(post.author.ballLevel) + "50", getBallColor(post.author.ballLevel) + "20"]}
                  style={friendStyles.activityAvatarPlaceholder}
                >
                  <ThemedText style={[friendStyles.activityAvatarLetter, { color: getBallColor(post.author.ballLevel) }]}>
                    {post.author.name?.charAt(0).toUpperCase() || "?"}
                  </ThemedText>
                </LinearGradient>
              )}
              <View style={[friendStyles.activityTypeDot, { backgroundColor: badgeStyle.text }]} />
            </View>

            <View style={friendStyles.activityInfo}>
              <View style={friendStyles.activityNameRow}>
                <ThemedText style={friendStyles.activityName}>{post.author.name}</ThemedText>
                <View style={[friendStyles.activityLevelBadge, { backgroundColor: getBallColor(post.author.ballLevel) }]}>
                  <ThemedText style={friendStyles.activityLevelText}>Lvl {post.author.level || 1}</ThemedText>
                </View>
              </View>
              <View style={friendStyles.activityMetaRow}>
                <View style={[friendStyles.activityContextBadge, { backgroundColor: badgeStyle.bg }]}>
                  <Ionicons name={badgeStyle.icon as any} size={10} color={badgeStyle.text} />
                  <ThemedText style={[friendStyles.activityContextText, { color: badgeStyle.text }]}>
                    {post.contextType.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                  </ThemedText>
                </View>
                <ThemedText style={friendStyles.activityTime}>{formatTimeAgo(post.createdAt)}</ThemedText>
              </View>
            </View>
          </View>

          {post.caption ? (
            <ThemedText style={friendStyles.activityCaption}>{post.caption}</ThemedText>
          ) : null}

          <View style={friendStyles.activityActions}>
            <View style={friendStyles.activityReactions}>
              <Ionicons name="flame" size={14} color={post.userReaction ? Colors.dark.error : Colors.dark.primary} />
              <ThemedText style={friendStyles.activityReactionCount}>{post.cheerCount}</ThemedText>
            </View>
            <Pressable
              style={[friendStyles.activityCheerBtn, post.userReaction && friendStyles.activityCheerBtnActive]}
              onPress={(e) => { e.stopPropagation(); handleCheerPost(post.id); }}
            >
              <ThemedText style={[friendStyles.activityCheerText, post.userReaction && friendStyles.activityCheerTextActive]}>
                {post.userReaction ? "Cheered!" : "Cheer"}
              </ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={friendStyles.sectionContainer}>
      <View style={friendStyles.sectionTabs}>
        <Pressable
          style={[friendStyles.sectionTab, activeTab === "activity" && friendStyles.sectionTabActive]}
          onPress={() => setActiveTab("activity")}
        >
          <Ionicons name="pulse" size={16} color={activeTab === "activity" ? Colors.dark.primary : Colors.dark.textSecondary} />
          <ThemedText style={[friendStyles.sectionTabText, activeTab === "activity" && friendStyles.sectionTabTextActive]}>
            {t('player.community.feed')}
          </ThemedText>
        </Pressable>
        <Pressable
          style={[friendStyles.sectionTab, activeTab === "friends" && friendStyles.sectionTabActive]}
          onPress={() => setActiveTab("friends")}
        >
          <Ionicons name="people" size={16} color={activeTab === "friends" ? Colors.dark.primary : Colors.dark.textSecondary} />
          <ThemedText style={[friendStyles.sectionTabText, activeTab === "friends" && friendStyles.sectionTabTextActive]}>
            {t('player.community.friends')} ({friends.length})
          </ThemedText>
        </Pressable>
        <Pressable
          style={[friendStyles.sectionTab, activeTab === "requests" && friendStyles.sectionTabActive]}
          onPress={() => setActiveTab("requests")}
        >
          <Ionicons name="mail" size={16} color={activeTab === "requests" ? Colors.dark.primary : Colors.dark.textSecondary} />
          <ThemedText style={[friendStyles.sectionTabText, activeTab === "requests" && friendStyles.sectionTabTextActive]}>
            {t('player.community.friendRequests')} {requests.length > 0 ? `(${requests.length})` : ""}
          </ThemedText>
          {requests.length > 0 ? <View style={friendStyles.requestDot} /> : null}
        </Pressable>
      </View>

      {isLoading ? (
        <View style={friendStyles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : activeTab === "activity" ? (
        <FlatList
          data={friendsActivity}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderActivityCard(item)}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 100, paddingHorizontal: Spacing.md }}
          ListEmptyComponent={
            <View style={friendStyles.emptyState}>
              <View style={friendStyles.emptyIcon}>
                <Ionicons name="pulse" size={48} color={Colors.dark.textSecondary} />
              </View>
              <ThemedText style={friendStyles.emptyTitle}>No friend activity</ThemedText>
              <ThemedText style={friendStyles.emptySubtitle}>Add friends to see their updates here</ThemedText>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      ) : activeTab === "friends" ? (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderFriendCard(item)}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 100, paddingHorizontal: Spacing.md }}
          ListEmptyComponent={
            <View style={friendStyles.emptyState}>
              <View style={friendStyles.emptyIcon}>
                <Ionicons name="people" size={48} color={Colors.dark.primary} />
              </View>
              <ThemedText style={friendStyles.emptyTitle}>{t('player.community.noFriends')}</ThemedText>
              <ThemedText style={friendStyles.emptySubtitle}>Invite your tennis friends and connect with other players</ThemedText>
              <Pressable
                style={friendStyles.inviteBtn}
                onPress={handleInviteFriends}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.primaryGlow || "#9AE66E"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={friendStyles.inviteBtnGradient}
                >
                  <Ionicons name="share-social" size={18} color={Colors.dark.buttonText} />
                  <ThemedText style={friendStyles.inviteBtnText}>Invite tennis friends</ThemedText>
                </LinearGradient>
              </Pressable>
              <Pressable
                style={friendStyles.findPlayersBtn}
                onPress={() => navigation.navigate("PlayerFinder" as never)}
              >
                <ThemedText style={friendStyles.findPlayersBtnText}>{t('player.community.findPlayers')}</ThemedText>
                <Ionicons name="arrow-forward" size={16} color={Colors.dark.buttonText} />
              </Pressable>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderRequestCard(item)}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 100, paddingHorizontal: Spacing.md }}
          ListEmptyComponent={
            <View style={friendStyles.emptyState}>
              <View style={friendStyles.emptyIcon}>
                <Ionicons name="mail-open" size={48} color={Colors.dark.textSecondary} />
              </View>
              <ThemedText style={friendStyles.emptyTitle}>No pending requests</ThemedText>
              <ThemedText style={friendStyles.emptySubtitle}>Friend requests will appear here</ThemedText>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

export function GroupsSection() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT;
  const queryClient = useQueryClient();
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupType, setNewGroupType] = useState<"social" | "friends">("social");
  const [previewGroup, setPreviewGroup] = useState<SheetGroup | null>(null);
  const [joiningGroupIds, setJoiningGroupIds] = useState<Set<string>>(new Set());

  const { data: groupsResponse, isLoading, refetch } = useQuery<{ myGroups: Group[]; discover: Group[] }>({
    queryKey: ["/api/player/groups"],
  });

  const createGroupMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; type: string }) => {
      return apiRequest("POST", "/api/player/groups", data);
    },
    onSuccess: async (_result: unknown) => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/groups"] });
      setShowCreateModal(false);
      const groupName = newGroupName.trim();
      setNewGroupName("");
      setNewGroupDescription("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      try {
        await Share.share({
          message: `I created a tennis group: "${groupName}". Join and train with me on Glow Up Tennis!`,
          title: groupName,
        });
      } catch {}
    },
  });

  const joinGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      setJoiningGroupIds(prev => new Set(prev).add(groupId));
      return apiRequest("POST", `/api/player/groups/${groupId}/join`, {});
    },
    onMutate: async (groupId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/player/groups"] });
      const previous = queryClient.getQueryData<{ myGroups: Group[]; discover: Group[] }>(["/api/player/groups"]);
      queryClient.setQueryData<{ myGroups: Group[]; discover: Group[] }>(
        ["/api/player/groups"],
        (old) => {
          if (!old) return old;
          const joining = old.discover.find(g => g.id === groupId);
          if (!joining) return old;
          return {
            myGroups: [...old.myGroups, { ...joining, isMember: true }],
            discover: old.discover.filter(g => g.id !== groupId),
          };
        }
      );
      return { previous };
    },
    onSuccess: (_result: unknown, groupId: string) => {
      setJoiningGroupIds(prev => { const s = new Set(prev); s.delete(groupId); return s; });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (_err: unknown, groupId: string, context: any) => {
      setJoiningGroupIds(prev => { const s = new Set(prev); s.delete(groupId); return s; });
      if (context?.previous) {
        queryClient.setQueryData(["/api/player/groups"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/groups"] });
    },
  });

  const handleCreateGroup = () => {
    if (!newGroupName.trim() || newGroupName.length < 2) return;
    createGroupMutation.mutate({
      name: newGroupName.trim(),
      description: newGroupDescription.trim(),
      type: newGroupType,
    });
  };

  const applyGroupFilter = (groups: Group[]) => {
    if (groupFilter === "all") return groups;
    if (groupFilter === "training") {
      return groups.filter(g => g.type === "training" || g.type === "skill_level" || g.type === "tournament");
    }
    return groups.filter(g => g.type === "social" || g.type === "age_group" || g.type === "friends");
  };

  const allMyGroups = groupsResponse?.myGroups || [];
  const allDiscoverGroups = groupsResponse?.discover || [];

  const myGroups = useMemo(() => applyGroupFilter(allMyGroups), [allMyGroups, groupFilter]);
  const discoverGroups = useMemo(() => applyGroupFilter(allDiscoverGroups), [allDiscoverGroups, groupFilter]);

  const getGroupIcon = (type: string) => {
    switch (type) {
      case "skill_level": return "trophy";
      case "age_group": return "people";
      case "tournament": return "ribbon";
      case "social": return "tennisball";
      case "friends": return "heart";
      default: return "grid";
    }
  };

  const handleGroupPress = (group: Group) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPreviewGroup({
      id: group.id,
      name: group.name,
      description: group.description,
      type: group.type,
      memberCount: group.memberCount,
      isJoined: group.isMember ?? group.isJoined,
    });
  };

  const renderGroupCard = (group: Group, isDiscoverable = false) => {
    const isJoining = joiningGroupIds.has(group.id);
    const isMember = group.isMember ?? (group.isJoined !== false);

    return (
      <Animated.View key={group.id} entering={FadeInDown.delay(100).springify()}>
        <Pressable style={groupStyles.groupCard} onPress={() => !isDiscoverable && handleGroupPress(group)}>
          <View style={groupStyles.groupIconContainer}>
            <LinearGradient
              colors={isDiscoverable
                ? ["#A78BFA30", Colors.dark.backgroundSecondary]
                : [Colors.dark.primary + "30", Colors.dark.backgroundSecondary]}
              style={groupStyles.groupSectionIconBg}
            >
              <Ionicons
                name={getGroupIcon(group.type) as any}
                size={28}
                color={isDiscoverable ? "#A78BFA" : Colors.dark.primary}
              />
            </LinearGradient>
          </View>

          <View style={groupStyles.groupSectionInfo}>
            <ThemedText style={groupStyles.groupSectionName}>{group.name}</ThemedText>
            <ThemedText style={groupStyles.groupSectionMeta}>
              <Ionicons name="people" size={12} color={Colors.dark.textSecondary} /> {group.memberCount} members
            </ThemedText>
            {group.description ? (
              <ThemedText style={groupStyles.groupSectionDescription} numberOfLines={2}>{group.description}</ThemedText>
            ) : null}
          </View>

          {isDiscoverable ? (
            <Pressable
              style={[groupStyles.joinBtn, isJoining && { opacity: 0.6 }]}
              onPress={(e) => {
                e.stopPropagation();
                if (!isJoining) joinGroupMutation.mutate(group.id);
              }}
              disabled={isJoining}
            >
              {isJoining ? (
                <ActivityIndicator size="small" color={Colors.dark.primary} />
              ) : (
                <ThemedText style={groupStyles.joinBtnText}>Join</ThemedText>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[groupStyles.joinBtn, groupStyles.joinedBtn]}
              onPress={(e) => { e.stopPropagation(); handleGroupPress(group); }}
            >
              <ThemedText style={[groupStyles.joinBtnText, groupStyles.joinedBtnText]}>Joined</ThemedText>
            </Pressable>
          )}
        </Pressable>
      </Animated.View>
    );
  };

  const renderFilterTabs = () => (
    <View style={groupStyles.groupFilterContainer}>
      {GROUP_FILTERS.map((filter) => (
        <Pressable
          key={filter.key}
          style={[
            groupStyles.groupFilterTab,
            groupFilter === filter.key && groupStyles.groupFilterTabActive,
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setGroupFilter(filter.key);
          }}
        >
          <Ionicons
            name={filter.icon as any}
            size={16}
            color={groupFilter === filter.key ? Colors.dark.buttonText : Colors.dark.textSecondary}
          />
          <ThemedText
            style={[
              groupStyles.groupFilterText,
              groupFilter === filter.key && groupStyles.groupFilterTextActive,
            ]}
          >
            {filter.label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={groupStyles.sectionContainer}>
      {renderFilterTabs()}
      {isLoading ? (
        <View style={groupStyles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: tabBarHeight + 100, paddingHorizontal: Spacing.md }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.dark.primary} />
          }
        >
          {myGroups.length === 0 && discoverGroups.length === 0 ? (
            <View style={groupStyles.emptyState}>
              <View style={groupStyles.emptyIcon}>
                <Ionicons name="people-circle" size={56} color={Colors.dark.primary} />
              </View>
              <ThemedText style={groupStyles.emptyTitle}>
                {groupFilter === "training" ? "No training groups yet" : "No groups yet"}
              </ThemedText>
              <ThemedText style={groupStyles.emptySubtitle}>
                {groupFilter === "training"
                  ? "Join training groups created by your coach"
                  : "Create a squad and invite your tennis friends"}
              </ThemedText>
              {groupFilter !== "training" ? (
                <Pressable
                  style={groupStyles.squadBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setNewGroupType("friends");
                    setShowCreateModal(true);
                  }}
                >
                  <LinearGradient
                    colors={[Colors.dark.primary, Colors.dark.primaryGlow || "#9AE66E"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={groupStyles.squadBtnGradient}
                  >
                    <Ionicons name="people" size={20} color={Colors.dark.buttonText} />
                    <ThemedText style={groupStyles.squadBtnText}>Create Squad</ThemedText>
                  </LinearGradient>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {myGroups.length > 0 ? (
            <>
              <View style={groupStyles.discoverSectionHeader}>
                <Ionicons name="people" size={15} color={Colors.dark.primary} />
                <ThemedText style={groupStyles.discoverSectionTitle}>My Groups</ThemedText>
                <ThemedText style={groupStyles.discoverSectionCount}>{myGroups.length}</ThemedText>
              </View>
              {myGroups.map(g => renderGroupCard(g, false))}
            </>
          ) : null}

          {discoverGroups.length > 0 ? (
            <>
              <View style={[groupStyles.discoverSectionHeader, myGroups.length > 0 && { marginTop: Spacing.lg }]}>
                <Ionicons name="compass" size={15} color="#A78BFA" />
                <ThemedText style={[groupStyles.discoverSectionTitle, { color: "#A78BFA" }]}>Discover Groups</ThemedText>
                <ThemedText style={groupStyles.discoverSectionCount}>{discoverGroups.length}</ThemedText>
              </View>
              <ThemedText style={groupStyles.discoverSectionSubtitle}>
                Public groups you can join
              </ThemedText>
              {discoverGroups.map(g => renderGroupCard(g, true))}
            </>
          ) : null}
        </ScrollView>
      )}

      {groupFilter !== "training" ? (
        <Pressable
          style={[groupStyles.createGroupFab, { bottom: tabBarHeight + 20 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowCreateModal(true);
          }}
        >
          <Ionicons name="add" size={28} color={Colors.dark.buttonText} />
        </Pressable>
      ) : null}

      <Modal visible={showCreateModal} transparent animationType="fade">
        <View style={groupStyles.createGroupModalOverlay}>
          <Animated.View entering={FadeInDown.springify()} style={groupStyles.createGroupModalContent}>
            <View style={groupStyles.createGroupModalHeader}>
              <ThemedText style={groupStyles.createGroupModalTitle}>{t('player.community.createGroup')}</ThemedText>
              <Pressable onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.textSecondary} />
              </Pressable>
            </View>

            <View style={groupStyles.createGroupForm}>
              <View style={groupStyles.createGroupInputGroup}>
                <ThemedText style={groupStyles.createGroupLabel}>Group Name</ThemedText>
                <TextInput
                  style={groupStyles.createGroupInput}
                  placeholder="Enter group name..."
                  placeholderTextColor={Colors.dark.textMuted}
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  maxLength={50}
                />
              </View>

              <View style={groupStyles.createGroupInputGroup}>
                <ThemedText style={groupStyles.createGroupLabel}>Description (optional)</ThemedText>
                <TextInput
                  style={[groupStyles.createGroupInput, groupStyles.createGroupTextArea]}
                  placeholder="What's this group about?"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={newGroupDescription}
                  onChangeText={setNewGroupDescription}
                  multiline
                  numberOfLines={3}
                  maxLength={200}
                />
              </View>

              <View style={groupStyles.createGroupInputGroup}>
                <ThemedText style={groupStyles.createGroupLabel}>Group Type</ThemedText>
                <View style={groupStyles.createGroupTypeRow}>
                  <Pressable
                    style={[groupStyles.createGroupTypeBtn, newGroupType === "social" && groupStyles.createGroupTypeBtnActive]}
                    onPress={() => setNewGroupType("social")}
                  >
                    <Ionicons name="people" size={18} color={newGroupType === "social" ? Colors.dark.buttonText : Colors.dark.textSecondary} />
                    <ThemedText style={[groupStyles.createGroupTypeText, newGroupType === "social" && groupStyles.createGroupTypeTextActive]}>{t('player.community.social')}</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[groupStyles.createGroupTypeBtn, newGroupType === "friends" && groupStyles.createGroupTypeBtnActive]}
                    onPress={() => setNewGroupType("friends")}
                  >
                    <Ionicons name="heart" size={18} color={newGroupType === "friends" ? Colors.dark.buttonText : Colors.dark.textSecondary} />
                    <ThemedText style={[groupStyles.createGroupTypeText, newGroupType === "friends" && groupStyles.createGroupTypeTextActive]}>{t('player.community.friends')}</ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>

            <Pressable
              style={[groupStyles.createGroupSubmitBtn, (!newGroupName.trim() || createGroupMutation.isPending) && groupStyles.createGroupSubmitBtnDisabled]}
              onPress={handleCreateGroup}
              disabled={!newGroupName.trim() || createGroupMutation.isPending}
            >
              {createGroupMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <ThemedText style={groupStyles.createGroupSubmitText}>{t('player.community.createGroup')}</ThemedText>
              )}
            </Pressable>
          </Animated.View>
        </View>
      </Modal>

      <GroupPreviewSheet
        visible={!!previewGroup}
        group={previewGroup}
        onClose={() => setPreviewGroup(null)}
        onOpenGroup={(g) => {
          setPreviewGroup(null);
          navigation.navigate("GroupDetail", { groupId: g.id, groupName: g.name });
        }}
      />
    </View>
  );
}

const achievementStyles = makeReactiveStyles(() => StyleSheet.create({
  list: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  headerIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  cardContainer: {
    marginBottom: Spacing.md,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  date: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  valueBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  valueText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  description: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  shareButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  shareGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.sm,
  },
  shareText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  empty: {
    alignItems: "center",
    padding: Spacing.xl * 2,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
}));

const newsStyles = makeReactiveStyles(() => StyleSheet.create({
  list: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  header: {
    marginBottom: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  card: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.md,
  },
  cardContent: {
    flex: 1,
    padding: Spacing.md,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  categoryBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: "700",
  },
  source: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
    lineHeight: 22,
  },
  summary: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  time: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  readMore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  readMoreText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.dark.primary,
  },
  image: {
    width: 100,
    height: "100%",
    minHeight: 120,
  },
  imagePlaceholder: {
    width: 100,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
}));

const friendStyles = makeReactiveStyles(() => StyleSheet.create({
  sectionContainer: {
    flex: 1,
  },
  sectionTabs: {
    flexDirection: "row",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  sectionTabActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
  },
  sectionTabText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  sectionTabTextActive: {
    color: Colors.dark.primary,
  },
  requestDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.error,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
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
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  friendAvatarSection: {
    position: "relative",
  },
  friendAvatarRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    padding: 2,
    overflow: "hidden",
  },
  friendAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
  },
  friendAvatarPlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  friendAvatarLetter: {
    fontSize: 20,
    fontWeight: "700",
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22C55E",
  },
  friendInfo: {
    flex: 1,
    gap: 4,
  },
  friendName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  friendMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  friendLevelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  friendLevelText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  friendStatus: {
    fontSize: 11,
    color: "#22C55E",
    fontWeight: "500",
  },
  friendActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  friendActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  friendChallengeBtn: {
    borderRadius: 20,
    overflow: "hidden",
  },
  friendChallengeBtnGradient: {
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  friendChallengeText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.dark.buttonText,
    letterSpacing: 0.3,
  },
  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  requestSubtext: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  requestActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.error + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteBtn: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    width: "100%",
  },
  inviteBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
  },
  inviteBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  findPlayersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "transparent",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  findPlayersBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  activityCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  activityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  activityAvatarContainer: {
    position: "relative",
  },
  activityAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  activityAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  activityAvatarLetter: {
    fontSize: 20,
    fontWeight: "700",
  },
  activityTypeDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  activityInfo: {
    flex: 1,
    gap: 4,
  },
  activityNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  activityName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  activityLevelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activityLevelText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  activityMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  activityContextBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activityContextText: {
    fontSize: 10,
    fontWeight: "600",
  },
  activityTime: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  activityCaption: {
    fontSize: 14,
    color: Colors.dark.text,
    marginTop: Spacing.md,
    lineHeight: 20,
  },
  activityActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  activityReactions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  activityReactionCount: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  activityCheerBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: BorderRadius.md,
  },
  activityCheerBtnActive: {
    backgroundColor: Colors.dark.error + "20",
  },
  activityCheerText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  activityCheerTextActive: {
    color: Colors.dark.error,
  },
}));

const groupStyles = makeReactiveStyles(() => StyleSheet.create({
  sectionContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
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
  groupCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  groupIconContainer: {},
  groupSectionIconBg: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  groupSectionInfo: {
    flex: 1,
    gap: 2,
  },
  groupSectionName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  groupSectionMeta: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  groupSectionDescription: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  joinBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.primary,
  },
  joinedBtn: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  joinBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  joinedBtnText: {
    color: Colors.dark.textSecondary,
  },
  groupFilterContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  groupFilterTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  groupFilterTabActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  groupFilterText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  groupFilterTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  createGroupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.dark.primary,
    marginTop: Spacing.lg,
  },
  createGroupBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  squadBtn: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  squadBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  squadBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  createGroupFab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  createGroupModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  createGroupModalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  createGroupModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  createGroupModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  createGroupForm: {
    gap: Spacing.md,
  },
  createGroupInputGroup: {
    gap: 6,
  },
  createGroupLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  createGroupInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  createGroupTextArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  createGroupTypeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  createGroupTypeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  createGroupTypeBtnActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  createGroupTypeText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  createGroupTypeTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  createGroupSubmitBtn: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  createGroupSubmitBtnDisabled: {
    opacity: 0.5,
  },
  createGroupSubmitText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  discoverSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    marginTop: Spacing.sm,
    paddingHorizontal: 2,
  },
  discoverSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.primary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    flex: 1,
  },
  discoverSectionCount: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    backgroundColor: Colors.dark.backgroundTertiary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  discoverSectionSubtitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    paddingHorizontal: 2,
  },
}));
