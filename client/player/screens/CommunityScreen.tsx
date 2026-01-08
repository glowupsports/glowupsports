import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Colors, Spacing } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { apiRequest } from "@/lib/query-client";

type FeedFilter = "for_you" | "friends" | "groups";

interface Post {
  id: string;
  authorId: string;
  academyId: string;
  contextType: string;
  contextId?: string;
  caption?: string;
  mediaUrls: string[];
  mediaTypes: string[];
  visibility: string;
  cheerCount: number;
  commentCount: number;
  createdAt: string;
  author: {
    id: string;
    username?: string;
    name?: string;
    photoUrl?: string;
    ballLevel?: string;
    isCoach?: boolean;
  };
  userReaction: string | null;
}

const REACTION_ICONS: Record<string, { name: string; color: string }> = {
  clap: { name: "hand-left", color: "#FFD700" },
  fire: { name: "flame", color: "#FF6B35" },
  tennis: { name: "tennisball", color: "#9AE66E" },
  muscle: { name: "fitness", color: "#4ECDC4" },
  star: { name: "star", color: "#FFD700" },
};

function formatTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return date.toLocaleDateString();
}

function getBallLevelColor(level?: string): string {
  const colors: Record<string, string> = {
    red: "#FF4444",
    orange: "#FF8C00",
    green: "#32CD32",
    yellow: "#FFD700",
  };
  return colors[level || ""] || Colors.dark.textSecondary;
}

function MomentCard({ post, onReact }: { post: Post; onReact: (postId: string, type: string) => void }) {
  const [showReactions, setShowReactions] = useState(false);
  
  const contextLabel = useMemo(() => {
    switch (post.contextType) {
      case "session_completed": return "Completed a Session";
      case "level_up": return "Level Up!";
      case "badge_earned": return "Earned a Badge";
      case "streak": return "On a Streak";
      case "milestone": return "Milestone Reached";
      case "story": return "";
      default: return post.contextType.replace(/_/g, " ");
    }
  }, [post.contextType]);
  
  return (
    <Card style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.authorInfo}>
          {post.author.photoUrl ? (
            <Image source={{ uri: post.author.photoUrl }} style={styles.authorAvatar} />
          ) : (
            <View style={[styles.authorAvatar, styles.avatarPlaceholder]}>
              <Ionicons 
                name={post.author.isCoach ? "school" : "person"} 
                size={20} 
                color={Colors.dark.textSecondary} 
              />
            </View>
          )}
          <View style={styles.authorDetails}>
            <View style={styles.nameRow}>
              <ThemedText style={styles.authorName}>
                {post.author.name || post.author.username}
              </ThemedText>
              {post.author.ballLevel ? (
                <View style={[styles.ballBadge, { backgroundColor: getBallLevelColor(post.author.ballLevel) }]}>
                  <Ionicons name="tennisball" size={10} color="#fff" />
                </View>
              ) : null}
              {post.author.isCoach ? (
                <View style={styles.coachBadge}>
                  <ThemedText style={styles.coachBadgeText}>Coach</ThemedText>
                </View>
              ) : null}
            </View>
            <View style={styles.timeRow}>
              <ThemedText style={styles.timeText}>{formatTimeAgo(post.createdAt)}</ThemedText>
              {contextLabel ? (
                <>
                  <View style={styles.dot} />
                  <ThemedText style={styles.contextLabel}>{contextLabel}</ThemedText>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </View>
      
      {post.caption ? (
        <ThemedText style={styles.caption}>{post.caption}</ThemedText>
      ) : null}
      
      {post.mediaUrls.length > 0 ? (
        <View style={styles.mediaContainer}>
          <Image 
            source={{ uri: post.mediaUrls[0] }} 
            style={styles.mediaImage}
            resizeMode="cover"
          />
          {post.mediaUrls.length > 1 ? (
            <View style={styles.moreMedia}>
              <ThemedText style={styles.moreMediaText}>+{post.mediaUrls.length - 1}</ThemedText>
            </View>
          ) : null}
        </View>
      ) : null}
      
      <View style={styles.postActions}>
        <Pressable 
          style={styles.actionButton}
          onPress={() => setShowReactions(!showReactions)}
          onLongPress={() => setShowReactions(true)}
        >
          <Ionicons 
            name={post.userReaction ? "heart" : "heart-outline"} 
            size={22} 
            color={post.userReaction ? Colors.dark.primary : Colors.dark.textSecondary} 
          />
          <ThemedText style={styles.actionCount}>{post.cheerCount || ""}</ThemedText>
        </Pressable>
        
        <Pressable style={styles.actionButton}>
          <Ionicons name="chatbubble-outline" size={20} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.actionCount}>{post.commentCount || ""}</ThemedText>
        </Pressable>
        
        <Pressable style={styles.actionButton}>
          <Ionicons name="share-outline" size={20} color={Colors.dark.textSecondary} />
        </Pressable>
      </View>
      
      {showReactions ? (
        <View style={styles.reactionPicker}>
          {Object.entries(REACTION_ICONS).map(([type, icon]) => (
            <Pressable 
              key={type}
              style={[
                styles.reactionOption,
                post.userReaction === type && styles.reactionSelected
              ]}
              onPress={() => {
                onReact(post.id, type);
                setShowReactions(false);
              }}
            >
              <Ionicons 
                name={icon.name as any} 
                size={24} 
                color={icon.color} 
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function EmptyFeed() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="sparkles" size={48} color={Colors.dark.primary} />
      </View>
      <ThemedText style={styles.emptyTitle}>No Moments Yet</ThemedText>
      <ThemedText style={styles.emptySubtitle}>
        Complete a session or achieve something cool to share your first Moment!
      </ThemedText>
    </View>
  );
}

function FilterTabs({ active, onChange }: { active: FeedFilter; onChange: (f: FeedFilter) => void }) {
  return (
    <View style={styles.filterTabs}>
      {(["for_you", "friends", "groups"] as FeedFilter[]).map((filter) => (
        <Pressable
          key={filter}
          style={[styles.filterTab, active === filter && styles.filterTabActive]}
          onPress={() => onChange(filter)}
        >
          <ThemedText style={[styles.filterTabText, active === filter && styles.filterTabTextActive]}>
            {filter === "for_you" ? "For You" : filter === "friends" ? "Friends" : "Groups"}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FeedFilter>("for_you");
  
  const { data: feed = [], isLoading, refetch, isFetching } = useQuery<Post[]>({
    queryKey: ["/api/social/feed", filter],
  });
  
  const { data: highlights } = useQuery<{ newMoments: number; openToPlay: number }>({
    queryKey: ["/api/social/highlights"],
  });
  
  const reactMutation = useMutation({
    mutationFn: async ({ postId, type }: { postId: string; type: string }) => {
      return apiRequest("POST", `/api/social/posts/${postId}/reactions`, { reactionType: type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
    },
  });
  
  const handleReact = (postId: string, type: string) => {
    reactMutation.mutate({ postId, type });
  };
  
  return (
    <ThemedView style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.background, "#0a1a2e", Colors.dark.background]}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <ThemedText style={styles.title}>Community</ThemedText>
        
        <View style={styles.headerActions}>
          {highlights?.openToPlay && highlights.openToPlay > 0 ? (
            <Pressable style={styles.openToPlayBadge}>
              <Ionicons name="tennisball" size={16} color={Colors.dark.primary} />
              <ThemedText style={styles.openToPlayText}>{highlights.openToPlay} Open to Play</ThemedText>
            </Pressable>
          ) : null}
          <Pressable style={styles.headerButton}>
            <Ionicons name="add-circle-outline" size={26} color={Colors.dark.text} />
          </Pressable>
        </View>
      </View>
      
      <FilterTabs active={filter} onChange={setFilter} />
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MomentCard post={item} onReact={handleReact} />
          )}
          contentContainerStyle={[
            styles.feedList,
            { paddingBottom: tabBarHeight + Spacing.xl }
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={Colors.dark.primary}
            />
          }
          ListEmptyComponent={<EmptyFeed />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
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
  openToPlayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  openToPlayText: {
    fontSize: 12,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  filterTabs: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 16,
    backgroundColor: Colors.dark.cardLight,
  },
  filterTabActive: {
    backgroundColor: Colors.dark.primary,
  },
  filterTabText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  filterTabTextActive: {
    color: Colors.dark.background,
    fontWeight: "600",
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
  postCard: {
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  postHeader: {
    marginBottom: Spacing.sm,
  },
  authorInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  authorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.dark.cardLight,
    justifyContent: "center",
    alignItems: "center",
  },
  authorDetails: {
    marginLeft: Spacing.sm,
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  authorName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  ballBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  coachBadge: {
    backgroundColor: Colors.dark.primary + "30",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  coachBadgeText: {
    fontSize: 10,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  timeText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.dark.textSecondary,
    marginHorizontal: 6,
  },
  contextLabel: {
    fontSize: 12,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  caption: {
    fontSize: 15,
    color: Colors.dark.text,
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  mediaContainer: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  mediaImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: Colors.dark.cardLight,
  },
  moreMedia: {
    position: "absolute",
    right: Spacing.sm,
    bottom: Spacing.sm,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  moreMediaText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: Spacing.xs,
  },
  actionCount: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  reactionPicker: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    marginTop: Spacing.sm,
  },
  reactionOption: {
    padding: Spacing.sm,
    borderRadius: 20,
  },
  reactionSelected: {
    backgroundColor: Colors.dark.primary + "30",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});
