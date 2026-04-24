import logger from "@/lib/logger";
import React, { useState, useMemo, useEffect } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { apiRequest, apiFetch } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import { LockedScreen } from "../components/LockedScreen";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import { usePlayer } from "@/player/context/PlayerContext";
import OnlineSafetyModal, { hasShownSafetyReminder } from "@/player/components/OnlineSafetyModal";

import {
  type FeedFilter,
  type MainTab,
  type Post,
  type Achievement,
  type FriendActivity,
  TAB_BAR_HEIGHT,
} from "../components/community/CommunityTypes";

import {
  MomentCard,
  EmptyFeed,
  MainTabBar,
  FeedFilterTabs,
  SystemFeedCard,
} from "../components/community/CommunityCards";

import {
  AchievementShowcase,
  NewsSection,
  FriendsSection,
  GroupsSection,
} from "../components/community/CommunitySections";

import {
  CommentsModal,
  SharePreviewModal,
  PostDetailModal,
  CreateMomentModal,
} from "../components/community/CommunityModals";

import { makeReactiveStyles, useThemeReactivity } from "@/hooks/useThemedStyles";
export default function CommunityScreen() {
  useThemeReactivity();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const tabBarHeight = TAB_BAR_HEIGHT;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isMinor, communityEnabled } = usePlayer();
  const [showSafetyModal, setShowSafetyModal] = useState(isMinor && !hasShownSafetyReminder());
  const canInteract = !isMinor || communityEnabled;
  const track = useTrackFeature();
  const [mainTab, setMainTab] = useState<MainTab>("feed");
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [showPostDetailModal, setShowPostDetailModal] = useState(false);
  const [selectedFriendActivity, setSelectedFriendActivity] = useState<FriendActivity | null>(null);
  const chatFooterHeight = 70;

  const { data: friendsData } = useQuery<{ friends: any[]; pendingRequests: any[] }>({
    queryKey: ["/api/player/me/friends"],
  });
  const friendRequestCount = friendsData?.pendingRequests?.length || 0;

  const { data: rawFeed = [], isLoading, refetch, isFetching } = useQuery<Post[]>({
    queryKey: ["/api/social/feed", { filter }],
    queryFn: async () => {
      const response = await apiFetch(`/api/social/feed?filter=${filter}`);
      if (response.status === 403) return [];
      if (!response.ok) throw new Error("Failed to fetch feed");
      return response.json();
    },
    retry: (failureCount, error) => {
      if (error?.message?.includes("403")) return false;
      return failureCount < 2;
    },
  });

  const feed = rawFeed;

  const { data: highlights } = useQuery<{ newMoments: number; openToPlay: number }>({
    queryKey: ["/api/social/highlights"],
  });

  const { data: userGroups = [] } = useQuery<{ id: string; name: string; type: string }[]>({
    queryKey: ["/api/social/groups"],
  });

  const reactMutation = useMutation({
    mutationFn: async ({ postId, type }: { postId: string; type: string }) => {
      return apiRequest("POST", `/api/social/posts/${postId}/reactions`, { reactionType: type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
    },
  });

  const createPostMutation = useMutation({
    mutationFn: async (data: { contextType: string; caption: string; mediaUrls: string[]; mediaTypes: string[]; visibility: string; groupId?: string }) => {
      return apiRequest("POST", "/api/social/posts", {
        contextType: data.contextType,
        caption: data.caption,
        mediaUrls: data.mediaUrls,
        mediaTypes: data.mediaTypes.length > 0 ? data.mediaTypes : data.mediaUrls.map(() => "image"),
        visibility: data.visibility,
        groupId: data.groupId,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
      setShowCreateModal(false);
    },
    onError: () => {
      Alert.alert("Error", "Failed to create moment. Please try again.");
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      return apiRequest("DELETE", `/api/social/posts/${postId}`);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to delete post. Please try again.");
    },
  });

  const handleReact = (postId: string, type: string) => {
    reactMutation.mutate({ postId, type });
  };

  const [selectedCommentPostId, setSelectedCommentPostId] = useState<string | null>(null);
  const [selectedCommentFeedItemId, setSelectedCommentFeedItemId] = useState<string | null>(null);
  const [showCommentModal, setShowCommentModal] = useState(false);

  const handleComment = (postId: string) => {
    setSelectedCommentPostId(postId);
    setSelectedCommentFeedItemId(null);
    setShowCommentModal(true);
  };

  const handleSystemFeedComment = (feedItemId: string) => {
    setSelectedCommentFeedItemId(feedItemId);
    setSelectedCommentPostId(null);
    setShowCommentModal(true);
  };

  const handleShare = async (post: Post) => {
    try {
      const message = post.caption
        ? `Check out this moment from ${post.author.name || post.author.username}: "${post.caption}"`
        : `Check out this moment from ${post.author.name || post.author.username}!`;

      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(message);
        if (typeof window !== "undefined") {
          window.alert("Copied to clipboard!");
        }
      } else {
        await Share.share({
          message,
          title: "Share Moment",
        });
      }
    } catch (error) {
      logger.log("Share error:", error);
      try {
        await Clipboard.setStringAsync(post.caption || "Check out this moment!");
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.alert("Copied to clipboard!");
        }
      } catch (e) {
        logger.log("Clipboard error:", e);
      }
    }
  };

  const handleDelete = (postId: string) => {
    Alert.alert(
      "Delete Post",
      "Are you sure you want to delete this post?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deletePostMutation.mutate(postId) }
      ]
    );
  };

  const handleCreateMoment = () => {
    track("community:create_post");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCreateModal(true);
  };

  return (
    <LockedScreen featureKey="community_feed">
      <ThemedView style={styles.container}>
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: Colors.dark.backgroundRoot }]}
        />

      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <ThemedText style={styles.title}>{t('player.community.title')}</ThemedText>

        <View style={styles.headerActions}>
          <Pressable
            style={styles.headerButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("DiscoveryMap");
            }}
            testID="button-discovery-map"
          >
            <View style={styles.addButton}>
              <Ionicons name="map" size={20} color={Colors.dark.buttonText} />
            </View>
          </Pressable>
          {mainTab === "feed" && canInteract ? (
              <Pressable
                style={styles.headerButton}
                onPress={handleCreateMoment}
                testID="button-create-moment"
              >
                <View style={styles.addButton}>
                  <Ionicons name="add" size={22} color={Colors.dark.buttonText} />
                </View>
              </Pressable>
          ) : null}
        </View>
      </View>

        <MainTabBar active={mainTab} onChange={setMainTab} friendRequestCount={friendRequestCount} />

      {!canInteract ? (
        <View style={styles.restrictedBanner}>
          <Ionicons name="shield-checkmark" size={18} color="#00BCD4" />
          <ThemedText style={styles.restrictedText}>
            You can browse the community. Ask a parent to enable posting and commenting.
          </ThemedText>
        </View>
      ) : null}

      {mainTab === "feed" ? (
        <>
            <FeedFilterTabs active={filter} onChange={(f) => { track(`community:feed_${f}`); setFilter(f); }} />


          {filter === "news" ? (
            <NewsSection />
          ) : isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.dark.primary} />
            </View>
          ) : (
            <FlatList
              data={feed}
              keyExtractor={(item: any) => `${item.feedType || "post"}:${item.id}`}
              renderItem={({ item }: { item: any }) => {
                const t = item?.feedType;
                // Phase 3: coach_spotlight items are coach/academy-authored
                // moment posts (with template + author info hydrated). They
                // must render through MomentCard so the role headline,
                // template pill, and pinned styling are applied — NOT the
                // generic SystemFeedCard which only handles event-style rows.
                if (t && t !== "manual_moment" && t !== "coach_spotlight") {
                  return (
                    <SystemFeedCard
                      item={item}
                      onComment={handleSystemFeedComment}
                      currentPlayerId={user?.id}
                      onOpenCreateMatch={() => navigation.navigate("CreateMatch")}
                    />
                  );
                }
                const post = item?.postId
                  ? { ...item, id: item.postId }
                  : item;
                return (
                  <MomentCard
                    post={post}
                    onReact={handleReact}
                    onComment={handleComment}
                    onShare={handleShare}
                    onDelete={handleDelete}
                    currentUserId={user?.id}
                  />
                );
              }}
              contentContainerStyle={[
                styles.feedList,
                { paddingBottom: tabBarHeight + chatFooterHeight + Spacing.xl }
              ]}
              refreshControl={
                <RefreshControl
                  refreshing={isFetching && !isLoading}
                  onRefresh={refetch}
                  tintColor={Colors.dark.primary}
                />
              }
              ListEmptyComponent={<EmptyFeed filter={filter} />}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      ) : mainTab === "friends" ? (
        <FriendsSection
          onSelectActivity={(activity) => {
            setSelectedFriendActivity(activity);
            setShowPostDetailModal(true);
          }}
        />
      ) : (
        <GroupsSection />
      )}

      <CreateMomentModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={(data) => createPostMutation.mutate(data)}
        isSubmitting={createPostMutation.isPending}
        userRole={user?.role}
        userGroups={userGroups}
      />

      <CommentsModal
        visible={showCommentModal}
        postId={selectedCommentPostId}
        feedItemId={selectedCommentFeedItemId}
        onClose={() => {
          setShowCommentModal(false);
          setSelectedCommentPostId(null);
          setSelectedCommentFeedItemId(null);
        }}
      />

      <SharePreviewModal
        visible={showShareModal}
        achievement={selectedAchievement}
        onClose={() => {
          setShowShareModal(false);
          setSelectedAchievement(null);
        }}
      />

      <PostDetailModal
        visible={showPostDetailModal}
        post={selectedFriendActivity}
        onClose={() => {
          setShowPostDetailModal(false);
          setSelectedFriendActivity(null);
        }}
        onCheer={(postId) => {
          logger.log("Cheer post:", postId);
        }}
      />

      <OnlineSafetyModal
        visible={showSafetyModal}
        onAccept={() => setShowSafetyModal(false)}
      />
      </ThemedView>
    </LockedScreen>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  restrictedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#00BCD4" + "15",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "#00BCD4" + "30",
  },
  restrictedText: {
    flex: 1,
    fontSize: 13,
    color: "#00BCD4",
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  feedList: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
}));
