import React, { useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import { useChatStickyBottom } from "@/lib/useChatStickyBottom";

interface Message {
  id: string;
  conversationId: string;
  senderType: string | null;
  senderCoachId: string | null;
  senderPlayerId: string | null;
  body: string;
  messageType: string | null;
  createdAt: string;
  reactions: Array<{
    id: string;
    emoji: string;
    reactorType: string;
  }>;
}

interface Conversation {
  id: string;
  type: string;
  title: string | null;
  playerId: string | null;
  coachId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  playerName?: string;
}

const REACTION_EMOJIS = ["thumbsup", "heart", "fire", "trophy", "star"];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ConversationCard({
  item,
  onPress,
  formatTime,
}: {
  item: Conversation;
  onPress: () => void;
  formatTime: (dateStr: string) => string;
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

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={animatedStyle}
    >
      <View style={styles.conversationItem}>
        <View style={styles.conversationItemInner}>
          <View style={styles.conversationAvatar}>
            <LinearGradient
              colors={[Colors.dark.primary + "40", Colors.dark.xpCyan + "40"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarGradient}
            >
              <Ionicons name="person" size={24} color={Colors.dark.xpCyan} />
            </LinearGradient>
          </View>
          <View style={styles.conversationInfo}>
            <View style={styles.conversationHeader}>
              <ThemedText style={styles.conversationName}>
                {item.playerName || item.title || "Chat"}
              </ThemedText>
              {item.lastMessageAt ? (
                <ThemedText style={styles.conversationTime}>
                  {formatTime(item.lastMessageAt)}
                </ThemedText>
              ) : null}
            </View>
            {item.lastMessagePreview ? (
              <ThemedText numberOfLines={1} style={styles.conversationPreview}>
                {item.lastMessagePreview}
              </ThemedText>
            ) : (
              <ThemedText style={styles.conversationPreview}>No messages yet</ThemedText>
            )}
          </View>
          <View style={styles.chevronContainer}>
            <Ionicons name="chevron-forward" size={16} color={Colors.dark.xpCyan} />
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
}

type ChatFilter = "all" | "players" | "parents";

const CHAT_FILTERS: { value: ChatFilter; label: string; icon: any }[] = [
  { value: "all", label: "All", icon: "chatbubbles" },
  { value: "players", label: "Players", icon: "tennisball" },
  { value: "parents", label: "Parents", icon: "people" },
];

export default function ChatInboxScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { coach } = useCoach();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [inputText, setInputText] = useState("");
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");

  const sendScale = useSharedValue(1);

  const sendAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
  }));

  const { data: conversations = [], isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/coaches", coach?.id, "conversations"],
    enabled: !!coach?.id,
  });

  // Filter conversations based on selected chat filter
  const filteredConversations = React.useMemo(() => {
    if (chatFilter === "all") return conversations;
    if (chatFilter === "players") {
      return conversations.filter(c => c.type === "coach_player");
    }
    if (chatFilter === "parents") {
      return conversations.filter(c => c.type === "coach_parent");
    }
    return conversations;
  }, [conversations, chatFilter]);

  const { data: messages = [], isLoading: loadingMessages } = useQuery<Message[]>({
    queryKey: ["/api/conversations", selectedConversation?.id, "messages"],
    enabled: !!selectedConversation?.id,
    refetchInterval: 5000,
  });

  const stick = useChatStickyBottom<Message>({
    itemCount: messages.length,
    resetKey: selectedConversation?.id ?? null,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!selectedConversation || !coach) return;
      return apiRequest("POST", `/api/conversations/${selectedConversation.id}/messages`, {
        senderType: "coach",
        senderCoachId: coach.id,
        body,
        messageType: "text",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversation?.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coaches", coach?.id, "conversations"] });
    },
  });

  const addReactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!coach) return;
      return apiRequest("POST", `/api/messages/${messageId}/reactions`, {
        reactorType: "coach",
        reactorCoachId: coach.id,
        emoji,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversation?.id, "messages"] });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!coach?.id) return;
      return apiRequest("POST", `/api/conversations/${conversationId}/read`, {
        participantType: "coach",
        participantId: coach.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaches", coach?.id, "unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coaches", coach?.id, "conversations"] });
    },
  });

  const handleSelectConversation = (item: Conversation) => {
    setSelectedConversation(item);
    markAsReadMutation.mutate(item.id);
  };

  const handleSend = async () => {
    if (inputText.trim() && selectedConversation) {
      sendScale.value = withSpring(0.9, { damping: 15 });
      setTimeout(() => {
        sendScale.value = withSpring(1, { damping: 15 });
      }, 100);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendMessageMutation.mutate(inputText.trim());
      setInputText("");
      setTimeout(() => stick.scrollToBottom(true), 100);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
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

  const getReactionIcon = (emoji: string): keyof typeof Ionicons.glyphMap => {
    const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
      thumbsup: "thumbs-up-outline",
      heart: "heart-outline",
      fire: "flash-outline",
      trophy: "ribbon-outline",
      star: "star-outline",
    };
    return icons[emoji] || "happy-outline";
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = item.senderType === "coach" && item.senderCoachId === coach?.id;
    const isSystem = item.messageType === "system";

    if (isSystem) {
      return (
        <View style={styles.systemMessage}>
          <Ionicons name="notifications-outline" size={14} color={Colors.dark.successNeon} />
          <ThemedText style={styles.systemText}>{item.body}</ThemedText>
        </View>
      );
    }

    if (item.messageType === "video_feedback") {
      let parsed: { feedbackId?: string; title?: string; annotations?: any[] } = {};
      try { parsed = JSON.parse(item.body); } catch {}
      const annotationCount = parsed.annotations?.length ?? 0;
      return (
        <Pressable
          style={[styles.messageBubble, isOwn ? styles.ownMessage : styles.otherMessage]}
          onPress={() => navigation.navigate("VideoFeedback")}
        >
          {!isOwn ? (
            <View style={styles.senderInfo}>
              <View style={styles.playerAvatar}>
                <Ionicons name="person" size={12} color={Colors.dark.xpCyan} />
              </View>
              <ThemedText style={styles.senderName}>
                {selectedConversation?.playerName || "Player"}
              </ThemedText>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
            <View style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: "#1a3a5c", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="videocam" size={16} color="#4DA3FF" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.messageText, { fontWeight: "600" }]} numberOfLines={1}>
                {parsed.title || "Video Feedback"}
              </ThemedText>
              {annotationCount > 0 ? (
                <ThemedText style={{ fontSize: 11, color: GlowColors.primary, marginTop: 2 }}>
                  {annotationCount} coach note{annotationCount !== 1 ? "s" : ""}
                </ThemedText>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={14} color={Colors.dark.tabIconDefault} />
          </View>
          <ThemedText style={styles.timestamp}>{formatTime(item.createdAt)}</ThemedText>
        </Pressable>
      );
    }

    return (
      <Pressable
        onLongPress={() => setShowReactions(showReactions === item.id ? null : item.id)}
        style={[styles.messageBubble, isOwn ? styles.ownMessage : styles.otherMessage]}
      >
        {!isOwn ? (
          <View style={styles.senderInfo}>
            <View style={styles.playerAvatar}>
              <Ionicons name="person" size={12} color={Colors.dark.xpCyan} />
            </View>
            <ThemedText style={styles.senderName}>
              {selectedConversation?.playerName || "Player"}
            </ThemedText>
          </View>
        ) : null}
        <ThemedText style={styles.messageText}>{item.body}</ThemedText>
        <ThemedText style={styles.timestamp}>{formatTime(item.createdAt)}</ThemedText>
        {item.reactions.length > 0 ? (
          <View style={styles.reactions}>
            {Object.entries(
              item.reactions.reduce((acc, r) => {
                acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([emoji, count]) => (
              <View key={emoji} style={styles.reactionBadge}>
                <Ionicons name={getReactionIcon(emoji)} size={12} color={Colors.dark.xpCyan} />
                <ThemedText style={styles.reactionCount}>{count}</ThemedText>
              </View>
            ))}
          </View>
        ) : null}
        {showReactions === item.id ? (
          <View style={styles.reactionPicker}>
            {REACTION_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => {
                  addReactionMutation.mutate({ messageId: item.id, emoji });
                  setShowReactions(null);
                }}
                style={styles.reactionOption}
              >
                <Ionicons name={getReactionIcon(emoji)} size={18} color={Colors.dark.xpCyan} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </Pressable>
    );
  };

  if (selectedConversation) {
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
            <Pressable onPress={() => setSelectedConversation(null)} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
            </Pressable>
            <View style={styles.headerCenter}>
              <View style={styles.headerAvatar}>
                <Ionicons name="person" size={18} color={Colors.dark.xpCyan} />
              </View>
              <ThemedText style={styles.headerTitle}>
                {selectedConversation.playerName || "Chat"}
              </ThemedText>
            </View>
            <View style={styles.headerSpacer} />
          </View>
        </View>

        {loadingMessages ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={Colors.dark.primary} size="large" />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList
              ref={stick.ref}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              style={styles.messageList}
              contentContainerStyle={[styles.messageListContent, { paddingBottom: insets.bottom + 100 }]}
              onContentSizeChange={stick.onContentSizeChange}
              onLayout={stick.onLayout}
              onScroll={stick.onScroll}
              scrollEventThrottle={stick.scrollEventThrottle}
            />
            {stick.hasNewBelow ? (
              <Pressable style={styles.jumpUnreadPill} onPress={() => stick.scrollToBottom(true)}>
                <Ionicons name="arrow-down" size={14} color="#000" />
                <ThemedText style={{ fontSize: 12, fontWeight: "700", color: "#000" }}>{t("chat.newMessage")}</ThemedText>
              </Pressable>
            ) : null}
          </View>
        )}

        <View style={[styles.inputContainer, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <View style={styles.inputWrapper}>
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type a message..."
              placeholderTextColor={Colors.dark.textMuted}
              style={styles.input}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
          </View>
          <AnimatedPressable
            onPress={handleSend}
            disabled={sendMessageMutation.isPending}
            style={sendAnimatedStyle}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendButton}
            >
              <Ionicons name="send-outline" size={20} color={Colors.dark.buttonText} />
            </LinearGradient>
          </AnimatedPressable>
        </View>
      </LinearGradient>
    );
  }

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
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>GLOW CHAT</ThemedText>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      {/* Chat Filter Tabs */}
      <View style={styles.filterTabsContainer}>
        {CHAT_FILTERS.map((filter) => (
          <Pressable
            key={filter.value}
            style={[
              styles.filterTab,
              chatFilter === filter.value && styles.filterTabActive,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setChatFilter(filter.value);
            }}
          >
            <Ionicons
              name={filter.icon as any}
              size={16}
              color={chatFilter === filter.value ? Colors.dark.xpCyan : Colors.dark.textSecondary}
            />
            <ThemedText
              style={[
                styles.filterTabText,
                chatFilter === filter.value && styles.filterTabTextActive,
              ]}
            >
              {filter.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {loadingConversations ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.primary} size="large" />
        </View>
      ) : filteredConversations.length === 0 ? (
        <View style={styles.emptyState}>
          <EmptyStateCard
            icon="message-circle"
            title="No messages yet"
            description="Start a conversation with your coach or teammates"
            ctaText="New Message"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              navigation.navigate("CoachTabs", { screen: "Players" });
            }}
          />
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationCard
              item={item}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleSelectConversation(item);
              }}
              formatTime={formatTime}
            />
          )}
          contentContainerStyle={[styles.conversationList, { paddingBottom: insets.bottom + Spacing.xl }]}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  jumpUnreadPill: {
    position: "absolute",
    bottom: Spacing.md,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.dark.primary,
  },
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
    width: 40,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.xpCyan + "20",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  headerTitle: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  headerSpacer: {
    width: 40,
  },
  filterTabsContainer: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterTabActive: {
    backgroundColor: Colors.dark.xpCyan + "15",
    borderColor: Colors.dark.xpCyan + "50",
  },
  filterTabText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  filterTabTextActive: {
    color: Colors.dark.xpCyan,
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
    padding: Spacing.xl,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  emptyTitle: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
  },
  conversationList: {
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  conversationItem: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "20",
    overflow: "hidden",
  },
  conversationItemInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  conversationAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: "hidden",
  },
  avatarGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  conversationInfo: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  conversationName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  conversationTime: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.xpCyan,
  },
  conversationPreview: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  chevronContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  messageBubble: {
    maxWidth: "75%",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  ownMessage: {
    alignSelf: "flex-end",
    backgroundColor: Colors.dark.primary,
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(18, 18, 22, 0.95)",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  senderInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  playerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.xpCyan + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  senderName: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  messageText: {
    fontSize: 14,
    color: Colors.dark.text,
  },
  timestamp: {
    fontSize: 10,
    color: Colors.dark.text,
    opacity: 0.5,
    marginTop: Spacing.xs,
    alignSelf: "flex-end",
  },
  systemMessage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    padding: Spacing.sm,
  },
  systemText: {
    fontSize: 12,
    color: Colors.dark.successNeon,
    fontWeight: "600",
  },
  reactions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: Spacing.xs,
  },
  reactionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  reactionCount: {
    fontSize: 10,
    color: Colors.dark.xpCyan,
  },
  reactionPicker: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    backgroundColor: "rgba(18, 18, 22, 0.95)",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  reactionOption: {
    padding: 4,
  },
  inputContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: "rgba(18, 18, 22, 0.98)",
    borderTopWidth: 1,
    borderTopColor: Colors.dark.primary + "30",
  },
  inputWrapper: {
    flex: 1,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
    overflow: "hidden",
  },
  input: {
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Platform.OS === "ios" ? Spacing.md : Spacing.sm,
    color: Colors.dark.text,
    fontSize: 14,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
