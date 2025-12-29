import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Dimensions,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest } from "@/lib/query-client";
import { useWebSocket, type NewMessagePayload, type TypingPayload } from "@/lib/useWebSocket";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const FOOTER_COLLAPSED = 60;
const FOOTER_EXPANDED = Math.min(SCREEN_HEIGHT * 0.5, 350);
const FOOTER_FULLSCREEN = SCREEN_HEIGHT;

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
    reactorCoachId: string | null;
    reactorPlayerId: string | null;
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
  coachName?: string;
}

const REACTION_EMOJIS = ["thumbsup", "heart", "fire", "trophy", "star"];

export function PlayerChatFooter() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const playerId = user?.playerId;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map());
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const height = useSharedValue(FOOTER_COLLAPSED + insets.bottom);

  const handleNewMessage = useCallback((payload: NewMessagePayload) => {
    queryClient.invalidateQueries({ queryKey: ["/api/conversations", payload.conversationId, "messages"] });
    queryClient.invalidateQueries({ queryKey: ["/api/players", playerId, "conversations"] });
    if (selectedConversation?.id === payload.conversationId) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [queryClient, playerId, selectedConversation?.id]);

  const handleTyping = useCallback((payload: TypingPayload) => {
    setTypingUsers(prev => {
      const next = new Map(prev);
      const conversationTypers = next.get(payload.conversationId) || new Set();
      const userId = payload.coachId || payload.playerId;
      if (userId && userId !== playerId) {
        if (payload.isTyping) {
          conversationTypers.add(userId);
        } else {
          conversationTypers.delete(userId);
        }
        next.set(payload.conversationId, conversationTypers);
      }
      return next;
    });
  }, [playerId]);

  const { isConnected, sendTyping } = useWebSocket({
    onNewMessage: handleNewMessage,
    onTyping: handleTyping,
  });

  const handleInputChange = useCallback((text: string) => {
    setInputText(text);
    if (selectedConversation && isConnected) {
      sendTyping(selectedConversation.id, text.length > 0);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(selectedConversation.id, false);
      }, 3000);
    }
  }, [selectedConversation, isConnected, sendTyping]);

  const currentTypingUsers = selectedConversation 
    ? typingUsers.get(selectedConversation.id) 
    : undefined;
  const isOtherTyping = currentTypingUsers && currentTypingUsers.size > 0;

  const { data: conversations = [], isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/players", playerId, "conversations"],
    enabled: !!playerId,
  });

  const { data: messages = [], isLoading: loadingMessages } = useQuery<Message[]>({
    queryKey: ["/api/conversations", selectedConversation?.id, "messages"],
    enabled: !!selectedConversation?.id,
    refetchInterval: isConnected ? 30000 : 5000,
  });

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/players", playerId, "unread-count"],
    enabled: !!playerId,
    refetchInterval: 30000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!selectedConversation || !playerId) return;
      return apiRequest("POST", `/api/conversations/${selectedConversation.id}/messages`, {
        senderType: "player",
        senderPlayerId: playerId,
        body,
        messageType: "text",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversation?.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players", playerId, "conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players", playerId, "unread-count"] });
    },
  });

  const addReactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!playerId) return;
      return apiRequest("POST", `/api/messages/${messageId}/reactions`, {
        reactorType: "player",
        reactorPlayerId: playerId,
        emoji,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversation?.id, "messages"] });
    },
  });

  useEffect(() => {
    const targetHeight = isFullscreen 
      ? FOOTER_FULLSCREEN 
      : isExpanded 
        ? FOOTER_EXPANDED + insets.bottom 
        : FOOTER_COLLAPSED + insets.bottom;
    height.value = withSpring(targetHeight, { damping: 20, stiffness: 200 });
  }, [isExpanded, isFullscreen, insets.bottom]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  const handleSend = async () => {
    if (inputText.trim() && selectedConversation) {
      sendMessageMutation.mutate(inputText.trim());
      setInputText("");
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

  const unreadCount = unreadData?.unreadCount || 0;
  const latestConversation = conversations[0];

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = item.senderType === "player" && item.senderPlayerId === playerId;
    const isSystem = item.messageType === "system";

    if (isSystem) {
      return (
        <View style={styles.systemMessage}>
          <Ionicons name="notifications-outline" size={14} color={Colors.dark.xpCyan} />
          <ThemedText style={styles.systemText}>{item.body}</ThemedText>
        </View>
      );
    }

    return (
      <Pressable
        onLongPress={() => setShowReactions(showReactions === item.id ? null : item.id)}
        style={[styles.messageBubble, isOwn ? styles.ownMessage : styles.otherMessage]}
      >
        {!isOwn ? (
          <View style={styles.senderInfo}>
            <View style={styles.coachAvatar}>
              <Ionicons name="ribbon" size={12} color={Colors.dark.primary} />
            </View>
            <ThemedText style={styles.senderName}>Coach</ThemedText>
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
                <Ionicons name={getReactionIcon(emoji)} size={12} color={Colors.dark.text} />
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
                <Ionicons name={getReactionIcon(emoji)} size={18} color={Colors.dark.text} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </Pressable>
    );
  };

  if (!playerId) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { bottom: tabBarHeight - insets.bottom }, animatedStyle]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (isFullscreen) {
              setIsFullscreen(false);
            } else {
              setIsExpanded(!isExpanded);
            }
          }}
          style={styles.headerTouchable}
        >
          <View style={styles.headerLeft}>
            <View style={styles.chatIconContainer}>
              <Ionicons name="chatbubble-outline" size={20} color={Colors.dark.xpCyan} />
              {unreadCount > 0 ? (
                <View style={styles.unreadBadge}>
                  <ThemedText style={styles.unreadText}>{unreadCount}</ThemedText>
                </View>
              ) : null}
            </View>
            <View>
              <ThemedText style={styles.headerTitle}>
                {selectedConversation ? (selectedConversation.coachName || "Coach") : "Messages"}
              </ThemedText>
              {latestConversation?.lastMessagePreview && !isExpanded ? (
                <ThemedText numberOfLines={1} style={styles.headerPreview}>
                  {latestConversation.lastMessagePreview}
                </ThemedText>
              ) : null}
            </View>
          </View>
          <View style={styles.headerRight}>
            {isConnected ? (
              <View style={styles.connectionStatus}>
                <View style={styles.connectionDot} />
              </View>
            ) : null}
            <Ionicons
              name={isFullscreen ? "chevron-down" : isExpanded ? "chevron-down" : "chevron-up"}
              size={20}
              color={Colors.dark.text}
            />
          </View>
        </Pressable>
        {(isExpanded || isFullscreen) ? (
          <View style={styles.headerActions}>
            <Pressable 
              onPress={() => {
                setIsFullscreen(!isFullscreen);
              }}
              style={styles.expandButton}
            >
              <Ionicons 
                name={isFullscreen ? "contract-outline" : "expand-outline"} 
                size={18} 
                color={Colors.dark.text} 
              />
            </Pressable>
          </View>
        ) : null}
      </View>

      {(isExpanded || isFullscreen) ? (
        <View style={styles.content}>
          {selectedConversation ? (
            <View style={styles.chatView}>
              <View style={styles.chatHeader}>
                <Pressable 
                  onPress={() => setSelectedConversation(null)} 
                  style={styles.backButton}
                >
                  <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
                </Pressable>
                <ThemedText style={styles.chatTitle}>
                  {selectedConversation.coachName || selectedConversation.title || "Coach"}
                </ThemedText>
              </View>
              {loadingMessages ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
                </View>
              ) : (
                <FlatList
                  ref={flatListRef}
                  data={messages}
                  keyExtractor={(item) => item.id}
                  renderItem={renderMessage}
                  contentContainerStyle={styles.messageList}
                  onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <Ionicons name="chatbubble-outline" size={40} color={Colors.dark.tabIconDefault} />
                      <ThemedText style={styles.emptyText}>No messages yet</ThemedText>
                      <ThemedText style={styles.emptySubtext}>Send a message to your coach</ThemedText>
                    </View>
                  }
                />
              )}
              {isOtherTyping ? (
                <View style={styles.typingIndicator}>
                  <ThemedText style={styles.typingText}>Coach is typing...</ThemedText>
                </View>
              ) : null}
              <View style={styles.inputContainer}>
                <TextInput
                  value={inputText}
                  onChangeText={handleInputChange}
                  placeholder="Type a message..."
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  style={styles.input}
                  multiline
                  maxLength={1000}
                />
                <Pressable
                  onPress={handleSend}
                  disabled={!inputText.trim() || sendMessageMutation.isPending}
                  style={[styles.sendButton, (!inputText.trim() || sendMessageMutation.isPending) && styles.sendButtonDisabled]}
                >
                  {sendMessageMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                  ) : (
                    <Ionicons name="send" size={18} color={Colors.dark.backgroundRoot} />
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.conversationList}>
              {loadingConversations ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
                </View>
              ) : (
                <FlatList
                  data={conversations}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => setSelectedConversation(item)}
                      style={styles.conversationItem}
                    >
                      <View style={styles.conversationAvatar}>
                        <Ionicons name="ribbon" size={20} color={Colors.dark.primary} />
                      </View>
                      <View style={styles.conversationInfo}>
                        <ThemedText style={styles.conversationName}>
                          {item.coachName || item.title || "Coach"}
                        </ThemedText>
                        {item.lastMessagePreview ? (
                          <ThemedText numberOfLines={1} style={styles.conversationPreview}>
                            {item.lastMessagePreview}
                          </ThemedText>
                        ) : null}
                      </View>
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <Ionicons name="chatbubbles-outline" size={40} color={Colors.dark.tabIconDefault} />
                      <ThemedText style={styles.emptyText}>No conversations</ThemedText>
                      <ThemedText style={styles.emptySubtext}>Your coach will start a conversation with you</ThemedText>
                    </View>
                  }
                />
              )}
            </View>
          )}
        </View>
      ) : null}

      <View style={{ height: insets.bottom, backgroundColor: Colors.dark.backgroundDefault }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    overflow: "hidden",
    borderTopWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    height: FOOTER_COLLAPSED,
  },
  headerTouchable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  chatIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.xpCyan + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  unreadBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  unreadText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  headerPreview: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    maxWidth: 200,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  connectionStatus: {
    padding: 4,
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.xpCyan,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  expandButton: {
    padding: Spacing.sm,
  },
  content: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  conversationList: {
    flex: 1,
  },
  conversationItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  conversationAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  conversationInfo: {
    flex: 1,
  },
  conversationName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  conversationPreview: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  chatView: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  backButton: {
    padding: Spacing.sm,
    marginRight: Spacing.sm,
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  messageList: {
    padding: Spacing.md,
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: "80%",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  ownMessage: {
    backgroundColor: Colors.dark.xpCyan + "20",
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    backgroundColor: Colors.dark.backgroundDefault,
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  senderInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  coachAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary + "30",
    justifyContent: "center",
    alignItems: "center",
  },
  senderName: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  messageText: {
    fontSize: 14,
    color: Colors.dark.text,
  },
  timestamp: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    alignSelf: "flex-end",
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
    backgroundColor: Colors.dark.backgroundDefault,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  reactionCount: {
    fontSize: 10,
    color: Colors.dark.text,
  },
  reactionPicker: {
    flexDirection: "row",
    position: "absolute",
    bottom: -30,
    left: 0,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.xs,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    zIndex: 10,
  },
  reactionOption: {
    padding: 4,
  },
  systemMessage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    padding: Spacing.sm,
    marginVertical: Spacing.sm,
  },
  systemText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  typingIndicator: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  typingText: {
    fontSize: 12,
    color: Colors.dark.xpCyan,
    fontStyle: "italic",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    color: Colors.dark.text,
    maxHeight: 100,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.xpCyan,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
    minHeight: 200,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
});
