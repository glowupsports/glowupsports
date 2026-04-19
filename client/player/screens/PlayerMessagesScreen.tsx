import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { getStaticAssetsUrl } from "@/lib/query-client";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import { usePlayer } from "@/player/context/PlayerContext";
import OnlineSafetyModal, { hasShownSafetyReminder } from "@/player/components/OnlineSafetyModal";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface Conversation {
  id: string;
  type: string;
  title?: string | null;
  coachId?: string | null;
  coachName?: string | null;
  playerId?: string | null;
  providerId?: string | null;
  providerName?: string | null;
  providerPhoto?: string | null;
  orderId?: string | null;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  unreadCount?: number;
}

export default function PlayerMessagesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { isMinor, chatEnabled } = usePlayer();
  const [showSafetyModal, setShowSafetyModal] = useState(isMinor && !hasShownSafetyReminder());

  const { data: conversations = [], isLoading, isError, refetch } = useQuery<Conversation[]>({
    queryKey: ["/api/player/me/conversations"],
  });

  const filteredConversations = isMinor && !chatEnabled
    ? conversations.filter((c: Conversation) => c.type === "coach_player" || c.type === "academy")
    : conversations;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const formatTime = (dateString: string | null | undefined) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const getConversationTitle = (conv: Conversation) => {
    if (conv.type === "provider_player") {
      return conv.providerName ?? conv.title ?? "Service Provider";
    }
    if (conv.title) return conv.title;
    if (conv.coachName) return conv.coachName;
    if (conv.type === "academy") return "Academy Chat";
    return "Conversation";
  };

  const getConversationIcon = (conv: Conversation) => {
    if (conv.type === "coach_player") return "person";
    if (conv.type === "player_player") return "people";
    if (conv.type === "academy") return "business";
    if (conv.type === "provider_player") return "build";
    return "chatbubble";
  };

  const handleConversationPress = (item: Conversation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.type === "provider_player") {
      navigation.navigate("PlayerBookingChat", { conversationId: item.id });
    } else {
      navigation.navigate("PlayerChat", { conversationId: item.id });
    }
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const hasUnread = (item.unreadCount ?? 0) > 0;
    
    return (
      <Pressable
        style={[styles.conversationCard, hasUnread && styles.unreadCard]}
        onPress={() => handleConversationPress(item)}
      >
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: Colors.dark.primary + "30" }]}>
            <Ionicons 
              name={getConversationIcon(item)} 
              size={24} 
              color={Colors.dark.primary} 
            />
          </View>
          {hasUnread && <View style={styles.unreadDot} />}
        </View>
        
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={[styles.conversationTitle, hasUnread && styles.unreadText]} numberOfLines={1}>
              {getConversationTitle(item)}
            </Text>
            <Text style={styles.conversationTime}>
              {formatTime(item.lastMessageAt)}
            </Text>
          </View>
          <Text style={[styles.conversationPreview, hasUnread && styles.unreadPreview]} numberOfLines={2}>
            {item.lastMessagePreview || "No messages yet"}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <EmptyStateCard
        icon="message-circle"
        title="No messages yet"
        description="Start a conversation with your coach or teammates"
        ctaText="New Message"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          navigation.navigate("Community");
        }}
      />
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
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={styles.headerRight}>
          {conversations.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{conversations.length}</Text>
            </View>
          )}
        </View>
      </View>

      {isMinor && !chatEnabled ? (
        <View style={styles.restrictedBanner}>
          <Ionicons name="shield-checkmark" size={18} color="#00BCD4" />
          <Text style={styles.restrictedText}>
            You can chat with your coach. Ask a parent to enable player-to-player chat.
          </Text>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : isError ? (
        <View style={styles.errorState}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
          <Text style={styles.errorTitle}>Failed to load messages</Text>
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Tap to retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + Spacing.xl },
            filteredConversations.length === 0 && styles.emptyListContent,
          ]}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.dark.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <OnlineSafetyModal
        visible={showSafetyModal}
        onAccept={() => setShowSafetyModal(false)}
      />
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
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
  headerRight: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  countBadge: {
    backgroundColor: Colors.dark.primary + "30",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  countText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  emptyListContent: {
    flex: 1,
  },
  conversationCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  unreadCard: {
    backgroundColor: Colors.dark.chipBackground,
  },
  avatarContainer: {
    position: "relative",
    marginRight: Spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.dark.primary,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  conversationTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
    flex: 1,
    marginRight: Spacing.sm,
  },
  unreadText: {
    fontWeight: "700",
  },
  conversationTime: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  conversationPreview: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  unreadPreview: {
    color: Colors.dark.text,
  },
  separator: {
    height: 1,
    backgroundColor: Backgrounds.surface,
    marginLeft: 68,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  iconContainer: {
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
    color: Colors.dark.textMuted,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  emptyHint: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  errorState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  errorTitle: {
    ...Typography.body,
    color: Colors.dark.error,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  retryButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: BorderRadius.md,
  },
  retryText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  restrictedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,188,212,0.1)",
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  restrictedText: {
    flex: 1,
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
  },
}));
