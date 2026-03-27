import React, { useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText as Text } from "@/components/ThemedText";
import { apiRequest } from "@/lib/query-client";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

interface GroupDetail {
  group: {
    id: string;
    name: string;
    description?: string;
    type: string;
    memberCount: number;
    avatarUrl?: string;
    accentColor?: string;
    isPrivate: boolean;
    allowChat: boolean;
    allowPosts: boolean;
  };
  isMember: boolean;
  myRole: string | null;
  members: {
    id: string;
    userId: string;
    name: string;
    role: string;
    joinedAt: string;
  }[];
  memberCount: number;
}

interface Post {
  id: string;
  authorId: string;
  caption?: string;
  mediaUrls: string[];
  createdAt: string;
  authorName: string;
}

type Tab = "feed" | "members";
type Props = NativeStackScreenProps<any, "GroupDetail">;

const GROUP_TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  level: { icon: "tennisball", color: "#9AE66E", label: "Level" },
  team: { icon: "shield", color: "#4ECDC4", label: "Team" },
  academy: { icon: "business", color: "#FFD700", label: "Academy" },
  event: { icon: "calendar", color: "#FF6B35", label: "Event" },
  friends: { icon: "people", color: "#E040FB", label: "Friends" },
  skill_level: { icon: "trophy", color: "#9AE66E", label: "Skill Level" },
  age_group: { icon: "people", color: "#4ECDC4", label: "Age Group" },
  tournament: { icon: "ribbon", color: "#FF6B35", label: "Tournament" },
  social: { icon: "tennisball", color: "#E040FB", label: "Social" },
  training: { icon: "barbell", color: "#9AE66E", label: "Training" },
};

function MemberGridCell({ member, typeColor }: { member: GroupDetail["members"][0]; typeColor: string }) {
  return (
    <Animated.View entering={FadeInDown.duration(200)} style={styles.memberCell}>
      <View style={styles.memberCellAvatarWrap}>
        <View style={[styles.memberCellAvatar, { backgroundColor: typeColor + "30" }]}>
          <Text style={[styles.memberCellInitial, { color: typeColor }]}>
            {member.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        {member.role === "admin" ? (
          <View style={styles.adminStarBadge}>
            <Ionicons name="star" size={9} color={Colors.dark.gold} />
          </View>
        ) : null}
      </View>
      <Text style={styles.memberCellName} numberOfLines={1}>{member.name.split(" ")[0]}</Text>
    </Animated.View>
  );
}

function PostCard({ post, typeColor }: { post: Post; typeColor: string }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (liked) {
      setLiked(false);
      setLikeCount(c => c - 1);
    } else {
      setLiked(true);
      setLikeCount(c => c + 1);
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <Animated.View entering={FadeInDown.duration(250)} style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={[styles.postAvatar, { backgroundColor: typeColor + "25" }]}>
          <Text style={[styles.postAvatarInitial, { color: typeColor }]}>
            {post.authorName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.postMeta}>
          <Text style={styles.postAuthor}>{post.authorName}</Text>
          <Text style={styles.postTime}>{timeAgo(post.createdAt)}</Text>
        </View>
      </View>

      {post.caption ? (
        <Text style={styles.postCaption}>{post.caption}</Text>
      ) : null}

      <View style={styles.postActions}>
        <Pressable style={styles.likeButton} onPress={handleLike}>
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={18}
            color={liked ? "#FF4D6D" : Colors.dark.textMuted}
          />
          <Text style={[styles.likeCount, liked ? { color: "#FF4D6D" } : {}]}>
            {likeCount}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

export default function GroupDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { groupId, groupName } = route.params as { groupId: string; groupName: string };
  const [activeTab, setActiveTab] = useState<Tab>("feed");

  const { data, isLoading, refetch, isRefetching } = useQuery<GroupDetail>({
    queryKey: [`/api/player/groups/${groupId}`],
  });

  const { data: feedData, isLoading: feedLoading } = useQuery<{ posts: Post[] }>({
    queryKey: [`/api/player/groups/${groupId}/feed`],
    enabled: activeTab === "feed",
  });

  const leaveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/player/groups/${groupId}/leave`),
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ["/api/player/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/groups"] });
      navigation.goBack();
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to leave group");
    },
  });

  const handleLeave = () => {
    Alert.alert("Leave Group", `Leave "${groupName}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => leaveMutation.mutate() },
    ]);
  };

  const typeConfig = GROUP_TYPE_CONFIG[data?.group.type || "friends"] || GROUP_TYPE_CONFIG.friends;
  const typeColor = typeConfig.color;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  const posts = feedData?.posts || [];
  const members = data?.members || [];

  return (
    <View style={styles.container}>
      {/* ---- HERO HEADER ---- */}
      <View style={styles.heroWrapper}>
        <LinearGradient
          colors={[typeColor + "CC", typeColor + "44", "#0a0f1a"]}
          locations={[0, 0.55, 1]}
          style={[styles.hero, { paddingTop: insets.top + 12 }]}
        >
          {/* Back + Menu */}
          <View style={styles.heroTopRow}>
            <Pressable style={styles.heroBackBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <Pressable
              style={styles.heroMenuBtn}
              onPress={() => {
                const options: string[] = [];
                if (data?.myRole !== "admin" && data?.isMember) options.push("Leave Group");
                options.push("Cancel");
                Alert.alert(
                  data?.group.name || groupName,
                  undefined,
                  [
                    ...(data?.myRole !== "admin" && data?.isMember
                      ? [{ text: "Leave Group", style: "destructive" as const, onPress: handleLeave }]
                      : []),
                    { text: "Cancel", style: "cancel" as const },
                  ]
                );
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </View>

          {/* Icon */}
          <View style={[styles.heroIcon, { backgroundColor: typeColor + "35", borderColor: typeColor + "60" }]}>
            <Ionicons name={typeConfig.icon as any} size={36} color={typeColor} />
          </View>

          <Text style={styles.heroName}>{data?.group.name || groupName}</Text>

          <View style={[styles.heroBadge, { backgroundColor: typeColor + "25" }]}>
            <Text style={[styles.heroBadgeText, { color: typeColor }]}>
              {typeConfig.label}
            </Text>
          </View>
        </LinearGradient>
      </View>

      {/* ---- STATS PILLS ---- */}
      <Animated.View entering={FadeIn.duration(400)}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statsScroll}
          contentContainerStyle={styles.statsContent}
        >
          <View style={styles.statPill}>
            <Ionicons name="people" size={13} color={typeColor} />
            <Text style={styles.statPillText}>{data?.memberCount ?? 0} Members</Text>
          </View>
          <View style={styles.statPill}>
            <Ionicons name="document-text" size={13} color="#7A8EA0" />
            <Text style={styles.statPillText}>{posts.length} Posts</Text>
          </View>
          {data?.group.isPrivate ? (
            <View style={styles.statPill}>
              <Ionicons name="lock-closed" size={13} color="#7A8EA0" />
              <Text style={styles.statPillText}>Private</Text>
            </View>
          ) : null}
          {data?.group.allowChat ? (
            <View style={[styles.statPill, { borderColor: Colors.dark.primary + "30" }]}>
              <Ionicons name="chatbubble" size={13} color={Colors.dark.primary} />
              <Text style={[styles.statPillText, { color: Colors.dark.primary }]}>Chat On</Text>
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>

      {/* ---- TABS ---- */}
      <View style={styles.tabRow}>
        <Pressable style={styles.tabItem} onPress={() => setActiveTab("feed")}>
          <Text style={[styles.tabLabel, activeTab === "feed" && styles.tabLabelActive]}>Feed</Text>
          {activeTab === "feed" ? <View style={[styles.tabUnderline, { backgroundColor: Colors.dark.primary }]} /> : null}
        </Pressable>
        <Pressable style={styles.tabItem} onPress={() => setActiveTab("members")}>
          <Text style={[styles.tabLabel, activeTab === "members" && styles.tabLabelActive]}>Members</Text>
          {activeTab === "members" ? <View style={[styles.tabUnderline, { backgroundColor: Colors.dark.primary }]} /> : null}
        </Pressable>
      </View>

      {/* ---- CONTENT ---- */}
      {activeTab === "feed" ? (
        feedLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.dark.primary} />
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <PostCard post={item} typeColor={typeColor} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={Colors.dark.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: typeColor + "15" }]}>
                  <Ionicons name="tennisball" size={36} color={typeColor} />
                </View>
                <Text style={styles.emptyTitle}>No Posts Yet</Text>
                <Text style={styles.emptySubtitle}>
                  {data?.isMember ? "Be the first to share something!" : "Join the group to see posts"}
                </Text>
              </View>
            }
          />
        )
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          numColumns={4}
          renderItem={({ item }) => <MemberGridCell member={item} typeColor={typeColor} />}
          contentContainerStyle={styles.memberGrid}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.dark.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: typeColor + "15" }]}>
                <Ionicons name="people" size={36} color={typeColor} />
              </View>
              <Text style={styles.emptyTitle}>No Members Yet</Text>
              <Text style={styles.emptySubtitle}>Be the first to join!</Text>
            </View>
          }
        />
      )}

      {/* ---- POST FAB (only if member + allowPosts) ---- */}
      {data?.isMember && data?.group.allowPosts ? (
        <Pressable
          style={[styles.fab, { bottom: insets.bottom + 20 }]}
          onPress={() => Alert.alert("Post", "Post creation coming soon!")}
        >
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.primary + "CC"]}
            style={styles.fabGradient}
          >
            <Ionicons name="add" size={26} color="#000" />
          </LinearGradient>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0f1a",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Hero
  heroWrapper: {
    overflow: "hidden",
  },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    alignItems: "center",
  },
  heroTopRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  heroBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  heroMenuBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    marginBottom: 14,
  },
  heroName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  heroBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  // Stats
  statsScroll: {
    backgroundColor: "#0a0f1a",
  },
  statsContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginRight: 8,
  },
  statPillText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#7A8EA0",
  },

  // Tabs
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#0a0f1a",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 13,
    position: "relative",
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#445566",
  },
  tabLabelActive: {
    color: "#FFFFFF",
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: "20%",
    right: "20%",
    height: 2.5,
    borderRadius: 2,
  },

  // Content
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 100,
  },

  // Post card
  postCard: {
    backgroundColor: "#0F141B",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  postAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  postAvatarInitial: {
    fontSize: 15,
    fontWeight: "700",
  },
  postMeta: {
    flex: 1,
    marginLeft: 10,
  },
  postAuthor: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  postTime: {
    fontSize: 12,
    color: "#445566",
    marginTop: 1,
  },
  postCaption: {
    fontSize: 14,
    color: "#8899AA",
    lineHeight: 21,
    marginBottom: 12,
  },
  postActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingTop: 10,
    marginTop: 2,
  },
  likeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  likeCount: {
    fontSize: 13,
    fontWeight: "500",
    color: "#445566",
  },

  // Members grid
  memberGrid: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 100,
  },
  memberCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    maxWidth: "25%",
  },
  memberCellAvatarWrap: {
    position: "relative",
    marginBottom: 7,
  },
  memberCellAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: "center",
    alignItems: "center",
  },
  memberCellInitial: {
    fontSize: 20,
    fontWeight: "700",
  },
  adminStarBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.gold + "25",
    borderWidth: 1.5,
    borderColor: "#0a0f1a",
    justifyContent: "center",
    alignItems: "center",
  },
  memberCellName: {
    fontSize: 11,
    fontWeight: "500",
    color: "#7A8EA0",
    textAlign: "center",
    maxWidth: 70,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#445566",
    textAlign: "center",
  },

  // FAB
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    elevation: 8,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
