import React, { useCallback } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  data: any;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

const NOTIFICATION_CONFIG: Record<string, { icon: string; color: string; iconSet: "ionicons" | "feather" }> = {
  feedback: { icon: "chatbubbles", color: "#00E5FF", iconSet: "ionicons" },
  xp: { icon: "flash", color: "#FFD700", iconSet: "ionicons" },
  session_reminder: { icon: "calendar", color: "#00E676", iconSet: "ionicons" },
  session_update: { icon: "time", color: "#FF9800", iconSet: "ionicons" },
  level_up: { icon: "trending-up", color: "#E040FB", iconSet: "ionicons" },
  achievement: { icon: "trophy", color: "#FF6B35", iconSet: "ionicons" },
  praise: { icon: "star", color: "#FFD700", iconSet: "ionicons" },
  general: { icon: "notifications", color: "#78909C", iconSet: "ionicons" },
  welcome: { icon: "heart", color: "#FF4081", iconSet: "ionicons" },
  friend_request: { icon: "person-add", color: "#00E5FF", iconSet: "ionicons" },
  friend_request_accepted: { icon: "people", color: Colors.dark.accentText, iconSet: "ionicons" },
};

function getNotificationConfig(type: string) {
  return NOTIFICATION_CONFIG[type] || NOTIFICATION_CONFIG.general;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-AE", { day: "numeric", month: "short" });
}

export default function PlayerNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<PlayerStackParamList>>();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: notifications, isLoading, refetch, isRefetching } = useQuery<Notification[]>({
    queryKey: ["/api/player/me/notifications"],
    enabled: !!user?.playerId,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/player/me/notifications/mark-read", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/notifications/unread-count"] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (notificationIds: string[]) =>
      apiRequest("POST", "/api/player/me/notifications/mark-read", { notificationIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/notifications/unread-count"] });
    },
  });

  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  const handleMarkAllRead = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markAllReadMutation.mutate();
  };

  const renderNotification = useCallback(({ item, index }: { item: Notification; index: number }) => {
    const config = getNotificationConfig(item.type);

    const handlePress = () => {
      if (!item.read) {
        markReadMutation.mutate([item.id]);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (item.type === "friend_request") {
        navigation.navigate("FriendsList", { initialTab: "requests" });
      } else if (item.type === "friend_request_accepted") {
        navigation.navigate("FriendsList", { initialTab: "friends" });
      }
    };

    return (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
        <Pressable
          style={[styles.notificationItem, !item.read && styles.unreadItem]}
          onPress={handlePress}
        >
          <View style={[styles.iconCircle, { backgroundColor: config.color + "20" }]}>
            <Ionicons name={config.icon as any} size={20} color={config.color} />
          </View>
          <View style={styles.notificationContent}>
            <View style={styles.notificationTop}>
              <Text style={[styles.notificationTitle, !item.read && styles.unreadTitle]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.timeText}>{timeAgo(item.createdAt)}</Text>
            </View>
            <Text style={styles.notificationBody} numberOfLines={2}>{item.body}</Text>
          </View>
          {!item.read ? (
            <View style={styles.unreadDot} />
          ) : null}
        </Pressable>
      </Animated.View>
    );
  }, [markReadMutation]);

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="notifications-outline" size={48} color={Colors.dark.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>No Notifications Yet</Text>
      <Text style={styles.emptyText}>
        Session reminders, coach feedback, and level-up celebrations will appear here.
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 ? (
          <Pressable style={styles.markAllButton} onPress={handleMarkAllRead}>
            <Feather name="check-circle" size={18} color={Colors.dark.accentText} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <FlatList
        data={notifications || []}
        keyExtractor={(item) => item.id}
        renderItem={renderNotification}
        ListEmptyComponent={isLoading ? null : renderEmpty}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + Spacing.xl },
          (!notifications || notifications.length === 0) && styles.emptyListContent,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.dark.accentText}
            colors={[GlowColors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  markAllButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: "center",
  },
  notificationItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
  },
  unreadItem: {
    borderColor: Colors.dark.accentTextBorder,
    backgroundColor: GlowColors.primary + "08",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  unreadTitle: {
    color: Colors.dark.text,
    fontWeight: "700",
  },
  timeText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  notificationBody: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GlowColors.primary,
    marginLeft: Spacing.sm,
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Backgrounds.card,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
}));
