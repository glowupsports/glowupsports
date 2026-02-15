import React, { useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { ThemedText as Text } from "@/components/ThemedText";
import { Card } from "@/components/Card";
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

const GROUP_TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  level: { icon: "tennisball", color: "#9AE66E" },
  team: { icon: "shield", color: "#4ECDC4" },
  academy: { icon: "business", color: "#FFD700" },
  event: { icon: "calendar", color: "#FF6B35" },
  friends: { icon: "people", color: "#E040FB" },
};

function MemberCard({ member, isAdmin }: { member: GroupDetail["members"][0]; isAdmin: boolean }) {
  return (
    <Animated.View entering={FadeInDown.duration(200)}>
      <Card style={styles.memberCard}>
        <View style={styles.memberAvatar}>
          <Text style={styles.memberAvatarText}>{member.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{member.name}</Text>
          <Text style={styles.memberJoined}>
            Joined {new Date(member.joinedAt).toLocaleDateString()}
          </Text>
        </View>
        {member.role === "admin" && (
          <View style={styles.adminBadge}>
            <Ionicons name="star" size={12} color={Colors.dark.gold} />
            <Text style={styles.adminBadgeText}>Admin</Text>
          </View>
        )}
      </Card>
    </Animated.View>
  );
}

function PostCard({ post }: { post: Post }) {
  return (
    <Animated.View entering={FadeInDown.duration(200)}>
      <Card style={styles.postCard}>
        <View style={styles.postHeader}>
          <View style={styles.postAvatar}>
            <Text style={styles.postAvatarText}>{post.authorName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.postInfo}>
            <Text style={styles.postAuthor}>{post.authorName}</Text>
            <Text style={styles.postTime}>
              {new Date(post.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
        {post.caption && (
          <Text style={styles.postCaption}>{post.caption}</Text>
        )}
      </Card>
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
    enabled: activeTab === "feed" && !!data?.isMember,
  });

  const leaveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/player/groups/${groupId}/leave`),
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ["/api/player/groups"] });
      navigation.goBack();
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to leave group");
    },
  });

  const handleLeave = () => {
    Alert.alert("Leave Group", `Are you sure you want to leave "${groupName}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => leaveMutation.mutate() },
    ]);
  };

  const typeConfig = GROUP_TYPE_ICONS[data?.group.type || "friends"] || GROUP_TYPE_ICONS.friends;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{groupName}</Text>
        {data?.myRole !== "admin" && data?.isMember && (
          <Pressable style={styles.leaveButton} onPress={handleLeave}>
            <Ionicons name="exit-outline" size={20} color={Colors.dark.error} />
          </Pressable>
        )}
      </View>

      <Animated.View entering={FadeIn.duration(300)}>
        <Card style={styles.groupInfoCard}>
          <View style={styles.groupHeader}>
            <View style={[styles.groupAvatar, { backgroundColor: typeConfig.color + "30" }]}>
              <Ionicons name={typeConfig.icon as any} size={32} color={typeConfig.color} />
            </View>
            <View style={styles.groupStats}>
              <View style={styles.groupStat}>
                <Text style={styles.groupStatValue}>{data?.memberCount || 0}</Text>
                <Text style={styles.groupStatLabel}>Members</Text>
              </View>
              <View style={styles.groupStat}>
                <Text style={styles.groupStatValue}>{feedData?.posts?.length || 0}</Text>
                <Text style={styles.groupStatLabel}>Posts</Text>
              </View>
            </View>
          </View>
          {data?.group.description && (
            <Text style={styles.groupDescription}>{data.group.description}</Text>
          )}
          <View style={styles.groupTags}>
            {data?.group.isPrivate && (
              <View style={styles.groupTag}>
                <Ionicons name="lock-closed" size={12} color={Colors.dark.textMuted} />
                <Text style={styles.groupTagText}>Private</Text>
              </View>
            )}
            <View style={styles.groupTag}>
              <Ionicons name={typeConfig.icon as any} size={12} color={typeConfig.color} />
              <Text style={[styles.groupTagText, { color: typeConfig.color }]}>
                {data?.group.type.charAt(0).toUpperCase()}{data?.group.type.slice(1)}
              </Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      <View style={styles.tabs}>
        <Pressable 
          style={[styles.tab, activeTab === "feed" && styles.tabActive]}
          onPress={() => setActiveTab("feed")}
        >
          <Ionicons 
            name="chatbubbles-outline" 
            size={18} 
            color={activeTab === "feed" ? Colors.dark.primary : Colors.dark.textMuted} 
          />
          <Text style={[styles.tabText, activeTab === "feed" && styles.tabTextActive]}>Feed</Text>
        </Pressable>
        <Pressable 
          style={[styles.tab, activeTab === "members" && styles.tabActive]}
          onPress={() => setActiveTab("members")}
        >
          <Ionicons 
            name="people-outline" 
            size={18} 
            color={activeTab === "members" ? Colors.dark.primary : Colors.dark.textMuted} 
          />
          <Text style={[styles.tabText, activeTab === "members" && styles.tabTextActive]}>Members</Text>
        </Pressable>
      </View>

      {activeTab === "feed" ? (
        feedLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.dark.primary} />
          </View>
        ) : (
          <FlatList
            data={feedData?.posts || []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <PostCard post={item} />}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={Colors.dark.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTitle}>No Posts Yet</Text>
                <Text style={styles.emptySubtitle}>Be the first to share something!</Text>
              </View>
            }
          />
        )
      ) : (
        <FlatList
          data={data?.members || []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MemberCard member={item} isAdmin={data?.myRole === "admin"} />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.dark.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    marginLeft: Spacing.sm,
  },
  leaveButton: {
    padding: Spacing.xs,
  },
  groupInfoCard: {
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  groupAvatar: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  groupStats: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    marginLeft: Spacing.lg,
  },
  groupStat: {
    alignItems: "center",
  },
  groupStatValue: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  groupStatLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  groupDescription: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.md,
    lineHeight: 20,
  },
  groupTags: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  groupTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  groupTagText: {
    fontSize: 11,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    gap: Spacing.xs,
  },
  tabActive: {
    backgroundColor: Colors.dark.primary + "20",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: Colors.dark.primary,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  memberAvatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  memberInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  memberJoined: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  postCard: {
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  postAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.xpCyan + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  postAvatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  postInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  postAuthor: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  postTime: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  postCaption: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: Spacing.md,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
});
