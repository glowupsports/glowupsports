import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useWebSocket } from "@/lib/useWebSocket";
import { useTabNavigation } from "@/components/TabNavigationContext";

interface Notification {
  id: string;
  coachId: string | null;
  type: string;
  title: string;
  message: string;
  priority: string | null;
  isRead: boolean | null;
  actionUrl: string | null;
  metadata: unknown;
  createdAt: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function NotificationCard({
  notification,
  onPress,
  onLongPress,
}: {
  notification: Notification;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "auto_renew":
        return "refresh-outline";
      case "payment":
        return "card-outline";
      case "feedback":
        return "chatbubble-outline";
      case "holiday":
        return "airplane-outline";
      case "absence":
        return "person-remove-outline";
      case "reminder":
        return "alarm-outline";
      case "player_running_late":
        return "time-outline";
      case "session_reminder":
        return "calendar-outline";
      case "booking_request":
        return "person-add-outline";
      default:
        return "notifications-outline";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "payment":
        return Colors.dark.gold;
      case "feedback":
        return Colors.dark.xpCyan;
      case "auto_renew":
        return Colors.dark.primary;
      case "reminder":
        return Colors.dark.orange;
      case "player_running_late":
        return Colors.dark.orange;
      case "session_reminder":
        return Colors.dark.xpCyan;
      case "booking_request":
        return Colors.dark.primary;
      case "absence":
        return Colors.dark.error;
      case "holiday":
        return Colors.dark.xpCyan;
      default:
        return Colors.dark.primary;
    }
  };

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case "high":
        return Colors.dark.error;
      case "medium":
        return Colors.dark.orange;
      default:
        return Colors.dark.primary;
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const typeColor = getTypeColor(notification.type);

  return (
    <AnimatedPressable
      style={animatedStyle}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <View style={[styles.notificationCard, !notification.isRead && styles.unreadCard]}>
        <View style={styles.notificationCardInner}>
          <View style={[styles.iconContainer, { backgroundColor: typeColor + "20" }]}>
            <Ionicons
              name={getIcon(notification.type) as any}
              size={20}
              color={typeColor}
            />
          </View>
          <View style={styles.notificationContent}>
            <View style={styles.notificationHeader}>
              <Text style={styles.notificationTitle}>{notification.title}</Text>
              <Text style={styles.notificationTime}>{formatTime(notification.createdAt)}</Text>
            </View>
            <Text style={styles.notificationMessage} numberOfLines={2}>
              {notification.message}
            </Text>
          </View>
          {!notification.isRead ? (
            <View style={[styles.unreadDot, { backgroundColor: typeColor }]} />
          ) : null}
        </View>
        {notification.priority === "high" ? (
          <View style={[styles.priorityIndicator, { backgroundColor: getPriorityColor(notification.priority) }]} />
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { coach } = useCoach();
  const { navigateToTab } = useTabNavigation();

  // WebSocket for real-time notification updates
  useWebSocket({
    onNewMessage: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/notifications"] });
    }, [queryClient]),
    onNewSession: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/notifications"] });
    }, [queryClient]),
    onFeedbackReceived: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/notifications"] });
    }, [queryClient]),
    onSessionUpdate: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/notifications"] });
    }, [queryClient]),
    onConnected: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/notifications"] });
    }, [queryClient]),
  });

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/coach/notifications"],
    enabled: !!coach?.id,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/coach/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/notifications"] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/coach/notifications"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/notifications"] });
    },
    onError: () => {
      Alert.alert("Error", "Could not clear notifications. Please try again.");
    },
  });

  const handleClearAll = () => {
    const count = notifications.length;
    Alert.alert(
      "Clear All Notifications",
      `Remove all ${count} notification${count !== 1 ? "s" : ""}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            clearAllMutation.mutate();
          },
        },
      ]
    );
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/coach/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/notifications"] });
    },
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <LinearGradient
      colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerGradientLine}
        />
        <View style={styles.headerContent}>
          <Pressable
            style={styles.backButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.goBack();
            }}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>NOTIFICATIONS</Text>
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            ) : null}
          </View>
          {notifications.length > 0 ? (
            <Pressable
              style={styles.markAllButton}
              onPress={handleClearAll}
              disabled={clearAllMutation.isPending}
            >
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.markAllGradient, clearAllMutation.isPending && { opacity: 0.5 }]}
              >
                <Text style={styles.markAllText}>Clear</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="notifications-off-outline" size={48} color={Colors.dark.xpCyan} />
          </View>
          <Text style={styles.emptyText}>No notifications</Text>
          <Text style={styles.emptySubtext}>You are all caught up</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (!notification.isRead) {
                  markReadMutation.mutate(notification.id);
                }
                const meta = (notification.metadata ?? {}) as {
                  playerId?: string;
                  impactedSessionIds?: string[];
                  impactedSessions?: Array<{
                    id: string;
                    startTime: string;
                    sessionType?: string | null;
                    title?: string | null;
                  }>;
                };
                if (meta.playerId) {
                  // Close the notifications screen so the deep-link target
                  // is visible immediately rather than hidden behind it.
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  }
                  navigateToTab("Players", {
                    screen: "PlayerProfile",
                    params: {
                      playerId: meta.playerId,
                      impactedSessionIds: meta.impactedSessionIds ?? [],
                      impactedSessions: meta.impactedSessions ?? [],
                    },
                  });
                }
              }}
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                deleteMutation.mutate(notification.id);
              }}
            />
          ))}
        </ScrollView>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: Spacing.sm,
  },
  headerGradientLine: {
    height: 3,
    width: "100%",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  unreadBadge: {
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: "center",
  },
  unreadBadgeText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  markAllButton: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  markAllGradient: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  markAllText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
    marginBottom: Spacing.lg,
  },
  emptyText: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  emptySubtext: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginTop: Spacing.xs,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  notificationCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "20",
    overflow: "hidden",
  },
  notificationCardInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  unreadCard: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.xpCyan,
  },
  priorityIndicator: {
    height: 2,
    width: "100%",
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationContent: {
    flex: 1,
    gap: 4,
  },
  notificationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  notificationTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  notificationTime: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.xpCyan,
  },
  notificationMessage: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    lineHeight: 18,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
