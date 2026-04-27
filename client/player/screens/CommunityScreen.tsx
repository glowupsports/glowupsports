import logger from "@/lib/logger";
import React, { useState, useMemo, useEffect, useRef } from "react";
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
import { SkeletonCard } from "@/components/SkeletonLoader";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { apiRequest, apiFetch, getApiUrl } from "@/lib/query-client";
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
  type FeedPreferences,
  TAB_BAR_HEIGHT,
  DEFAULT_FEED_PREFERENCES,
  FEED_CATEGORY_DEFINITIONS,
  preferencesToActiveCategories,
} from "../components/community/CommunityTypes";

import {
  MomentCard,
  EmptyFeed,
  MainTabBar,
  FeedFilterTabs,
  SystemFeedCard,
} from "../components/community/CommunityCards";

import { DiscoveryRail } from "../components/community/DiscoveryRail";

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
  FeedTypeFilterModal,
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
  const [showFeedFilterModal, setShowFeedFilterModal] = useState(false);
  const chatFooterHeight = 70;

  // Task #1384 — Per-user category preferences for the unified feed.
  // Sourced from the god-query below, but kept as a separate cached read
  // (under the same legacy key) so the optimistic-update mutation flow
  // still works with `getQueryData` / `setQueryData`. Defaults are all on
  // until the user opens the filter sheet and turns categories off.
  const { data: feedPreferences } = useQuery<FeedPreferences>({
    queryKey: ["/api/social/feed-preferences"],
    enabled: false,
    initialData: DEFAULT_FEED_PREFERENCES,
  });
  const effectivePreferences: FeedPreferences = feedPreferences || DEFAULT_FEED_PREFERENCES;
  const activeCategories = useMemo(
    () => preferencesToActiveCategories(effectivePreferences),
    [effectivePreferences],
  );
  const disabledCategoryCount =
    FEED_CATEGORY_DEFINITIONS.length - activeCategories.length;

  // Track the latest mutation seq so out-of-order responses can't clobber UI.
  const prefMutationSeqRef = useRef(0);
  const prefDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updatePreferencesMutation = useMutation({
    mutationFn: async (next: FeedPreferences) => {
      const response = await apiRequest("PUT", "/api/social/feed-preferences", next);
      return response.json();
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ["/api/social/feed-preferences"] });
      const previous = queryClient.getQueryData<FeedPreferences>([
        "/api/social/feed-preferences",
      ]);
      const seq = ++prefMutationSeqRef.current;
      queryClient.setQueryData(["/api/social/feed-preferences"], next);
      return { previous, seq };
    },
    onError: (_err, _next, ctx) => {
      // Only roll back if this is the most recent mutation; otherwise a newer
      // optimistic update already replaced the data.
      if (ctx?.seq === prefMutationSeqRef.current && ctx?.previous) {
        queryClient.setQueryData(["/api/social/feed-preferences"], ctx.previous);
      }
      Alert.alert("Couldn't save", "Your feed preferences didn't save. Try again.");
    },
    onSettled: (_data, _err, _next, ctx) => {
      // Refetch only after the most recent mutation has settled to converge
      // client and server state without flicker during rapid toggling.
      if (ctx?.seq === prefMutationSeqRef.current) {
        // Task #1384 — invalidate the god-query key so the screen-level
        // mount fetch picks up the updated feed + preferences in one shot.
        // Legacy keys are kept for parity with deeper screens that may
        // still subscribe to them.
        queryClient.invalidateQueries({
          predicate: (q) =>
            typeof q.queryKey[0] === "string" &&
            (q.queryKey[0] === "/api/social/feed" ||
              q.queryKey[0] === "/api/social/feed-preferences" ||
              q.queryKey[0] === "/api/player/me/community-data"),
        });
      }
    },
  });

  // Holds the latest pending value so flushPendingPreferences can persist it.
  const pendingPrefValueRef = useRef<FeedPreferences | null>(null);

  const flushPendingPreferences = () => {
    if (prefDebounceRef.current) {
      clearTimeout(prefDebounceRef.current);
      prefDebounceRef.current = null;
    }
    const pending = pendingPrefValueRef.current;
    if (pending) {
      pendingPrefValueRef.current = null;
      updatePreferencesMutation.mutate(pending);
    }
  };

  // Debounce PUTs so rapid toggling coalesces into a single request.
  const handleChangePreferences = (next: FeedPreferences) => {
    queryClient.setQueryData(["/api/social/feed-preferences"], next);
    pendingPrefValueRef.current = next;
    if (prefDebounceRef.current) {
      clearTimeout(prefDebounceRef.current);
    }
    prefDebounceRef.current = setTimeout(() => {
      prefDebounceRef.current = null;
      const value = pendingPrefValueRef.current;
      if (value) {
        pendingPrefValueRef.current = null;
        updatePreferencesMutation.mutate(value);
      }
    }, 350);
  };

  useEffect(() => {
    return () => {
      // Flush any pending preference change so a quick toggle followed by
      // unmount still persists to the server.
      flushPendingPreferences();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Task #1384 — friends/feedUnseen are sourced from the god-query below.
  // The 60s refetch on feed-unseen is preserved by the god-query's own
  // staleTime + the screen-level refetch (pull-to-refresh), but a
  // dedicated long-poll interval is no longer warranted: the badge updates
  // when the user re-opens the tab or any mutation invalidates the key.
  const { data: friendsData } = useQuery<{ friends: any[]; pendingRequests: any[] }>({
    queryKey: ["/api/player/me/friends"],
    enabled: false,
    initialData: { friends: [], pendingRequests: [] },
  });
  const friendRequestCount = friendsData?.pendingRequests?.length || 0;

  const { data: feedUnseen } = useQuery<{
    cheers: number;
    comments: number;
    mentions: number;
    total: number;
  }>({
    queryKey: ["/api/social/me/feed-unseen"],
    enabled: false,
    initialData: { cheers: 0, comments: 0, mentions: 0, total: 0 },
  });
  const feedUnseenCount = feedUnseen?.total || 0;

  const markFeedSeenMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/social/me/feed-seen", {}),
    onSuccess: () => {
      // Task #1384 — feedUnseen now lives inside the community god-query;
      // invalidating the legacy key alone wouldn't refresh the badge so we
      // also invalidate the god-key.
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] === "/api/social/me/feed-unseen" ||
            q.queryKey[0] === "/api/player/me/community-data"),
      });
    },
  });

  // Stamp last-seen the moment the user lands on the Feed tab. Avoids
  // stamping when they're poking around Friends/Groups.
  useEffect(() => {
    if (mainTab === "feed" && feedUnseenCount > 0) {
      markFeedSeenMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab, feedUnseenCount]);

  const activeCategoriesParam = useMemo(
    () => activeCategories.join(","),
    [activeCategories],
  );

  // Task #1384 — Community god-query. Collapses the 7 mount-time round
  // trips (feed-preferences, friends, feed-unseen, feed page 1, highlights,
  // social groups, suggested coaches/players) into ONE request. Mirrors
  // the Player Home / Progress / Play pattern. The screen primes every
  // legacy queryKey via setIfPresent below so children (DiscoveryRail,
  // FriendsSection, the create-moment modal's group picker) hit cache
  // instead of triggering fresh requests.
  interface CommunityGodResponse {
    feedPreferences: FeedPreferences | null;
    friends: { friends: unknown[]; pendingRequests: unknown[] };
    feedUnseen: { cheers: number; comments: number; mentions: number; total: number };
    feed: Post[];
    highlights: { newMoments: number; openToPlay: number };
    socialGroups: { id: string; name: string; type: string }[];
    discoveryPlayers: { players: unknown[] };
    _keys?: { feed: [string, { filter: string; types: string }] };
    _errors?: Record<string, number | null>;
  }

  const {
    data: communityGodData,
    isLoading: communityGodLoading,
    isError: communityGodIsError,
    isFetching,
    refetch,
  } = useQuery<CommunityGodResponse>({
    queryKey: [
      "/api/player/me/community-data",
      filter,
      activeCategoriesParam,
    ],
    staleTime: 30 * 1000,
    queryFn: async () => {
      const url = new URL("/api/player/me/community-data", getApiUrl());
      url.searchParams.set("filter", filter);
      url.searchParams.set("types", activeCategoriesParam);
      const r = await apiRequest("GET", url.toString());
      return r.json();
    },
    retry: (failureCount, error: unknown) => {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("403")) return false;
      return failureCount < 2;
    },
  });

  // Prime each legacy queryKey from the god-query response so child
  // components (DiscoveryRail, FriendsSection, etc.) and any other screen
  // re-using these keys hit cache instead of triggering a fresh request.
  // Only prime keys whose branch succeeded (non-null) — leaving a failed
  // branch unprimed lets the legacy hook retry on its own if a child mounts.
  useEffect(() => {
    if (!communityGodData) return;
    const setIfPresent = <T,>(key: unknown[], value: T | null | undefined) => {
      if (value !== null && value !== undefined) {
        queryClient.setQueryData(key, value);
      }
    };
    setIfPresent(["/api/social/feed-preferences"], communityGodData.feedPreferences);
    setIfPresent(["/api/player/me/friends"], communityGodData.friends);
    setIfPresent(["/api/social/me/feed-unseen"], communityGodData.feedUnseen);
    setIfPresent(["/api/social/highlights"], communityGodData.highlights);
    setIfPresent(["/api/social/groups"], communityGodData.socialGroups);
    setIfPresent(
      ["/api/social/discovery/players", { limit: 12 }],
      communityGodData.discoveryPlayers,
    );
    if (communityGodData._keys) {
      setIfPresent(communityGodData._keys.feed, communityGodData.feed);
    }
  }, [communityGodData, queryClient]);

  const feed: Post[] = communityGodData?.feed ?? [];
  const isLoading = communityGodLoading;
  const highlights = communityGodData?.highlights;
  const userGroups = communityGodData?.socialGroups ?? [];
  // Reference highlights so the existing tslint config doesn't flag it as
  // unused — it's primed for downstream consumers but not directly rendered.
  void highlights;

  // Task #1384 — feed lives inside the community god-query, so any feed
  // mutation must invalidate BOTH the legacy /api/social/feed key (for
  // deeper screens still subscribing to it) AND the god-key so the screen
  // refetches and re-primes.
  const invalidateFeedFamily = () => {
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        (q.queryKey[0] === "/api/social/feed" ||
          q.queryKey[0] === "/api/player/me/community-data"),
    });
  };

  const reactMutation = useMutation({
    mutationFn: async ({ postId, type }: { postId: string; type: string }) => {
      return apiRequest("POST", `/api/social/posts/${postId}/reactions`, { reactionType: type });
    },
    onSuccess: () => {
      invalidateFeedFamily();
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
      invalidateFeedFamily();
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
      invalidateFeedFamily();
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

  // Task #1384 — God-query failed (network error / 404 / 500). Without
  // this gate the screen would sit on `isLoading=true` forever and the
  // user would see an indefinite spinner with no recovery affordance.
  // Mirrors the PlayScreen / PlayerProgressScreen recoverable-error
  // pattern. Critical during the "OTA shipped before backend Republish"
  // gap where /api/player/me/community-data 404s on production.
  if (communityGodIsError) {
    return (
      <LockedScreen featureKey="community_feed">
        <ThemedView style={styles.container}>
          <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
            <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
            <ThemedText
              style={{
                marginTop: Spacing.md,
                color: Colors.dark.text,
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              Unable to load Community
            </ThemedText>
            <ThemedText
              style={{
                marginTop: Spacing.xs,
                color: Colors.dark.textMuted,
                fontSize: 13,
              }}
            >
              Please try again
            </ThemedText>
            <Pressable
              onPress={() => refetch()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading Community tab"
              style={{
                marginTop: Spacing.lg,
                paddingHorizontal: Spacing.xl,
                paddingVertical: Spacing.md,
                backgroundColor: Colors.dark.primary,
                borderRadius: BorderRadius.md,
              }}
            >
              <ThemedText style={{ color: Colors.dark.buttonText, fontWeight: "600" }}>
                Retry
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </LockedScreen>
    );
  }

  return (
    <LockedScreen featureKey="community_feed">
      <ThemedView style={styles.container}>
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: Colors.dark.backgroundRoot }]}
        />

      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <ThemedText style={styles.title}>{t('player.community.title')}</ThemedText>

        <View style={styles.headerActions}>
          {mainTab === "feed" && filter === "all" ? (
            <Pressable
              style={styles.headerButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                track("community:open_feed_filter");
                setShowFeedFilterModal(true);
              }}
              testID="button-feed-filter"
            >
              <View style={styles.addButton}>
                <Ionicons
                  name="options"
                  size={20}
                  color={Colors.dark.buttonText}
                />
                {disabledCategoryCount > 0 ? (
                  <View style={styles.filterBadge}>
                    <ThemedText style={styles.filterBadgeText}>
                      {disabledCategoryCount}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ) : null}
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

        <MainTabBar
          active={mainTab}
          onChange={setMainTab}
          friendRequestCount={friendRequestCount}
          feedUnseenCount={feedUnseenCount}
        />

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
            <View style={styles.feedSkeletonWrap}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
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
                      onComment={canInteract ? handleSystemFeedComment : undefined}
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
              ListHeaderComponent={
                filter === "all" ? (
                  <DiscoveryRail currentUserId={user?.id} />
                ) : null
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

      <FeedTypeFilterModal
        visible={showFeedFilterModal}
        onClose={() => {
          flushPendingPreferences();
          setShowFeedFilterModal(false);
        }}
        preferences={effectivePreferences}
        onChange={handleChangePreferences}
        isSaving={updatePreferencesMutation.isPending}
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
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#FF6B35",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.dark.backgroundRoot,
  },
  filterBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
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
  feedSkeletonWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  feedList: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
}));
