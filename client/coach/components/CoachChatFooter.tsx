import React, { useState, useRef, useEffect } from "react";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const FOOTER_COLLAPSED = 60;
const FOOTER_EXPANDED = Math.min(SCREEN_HEIGHT * 0.6, 450);

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
  playerName?: string;
}

const REACTION_EMOJIS = ["thumbsup", "heart", "fire", "trophy", "star"];

type ChatTab = "players" | "coaches" | "academy" | "squad" | "admin";

const CHAT_TABS: { id: ChatTab; name: string; icon: keyof typeof Ionicons.glyphMap; types: string[] }[] = [
  { id: "players", name: "Players", icon: "people-outline", types: ["direct_message", "coach_player"] },
  { id: "coaches", name: "Coaches", icon: "ribbon-outline", types: ["coach_coach"] },
  { id: "academy", name: "Academy", icon: "home-outline", types: ["academy"] },
  { id: "squad", name: "Squad", icon: "fitness-outline", types: ["squad", "group"] },
  { id: "admin", name: "Admin", icon: "shield-outline", types: ["admin"] },
];

export function CoachChatFooter() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { coach } = useCoach();
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputText, setInputText] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<ChatTab>("players");
  const flatListRef = useRef<FlatList>(null);

  const height = useSharedValue(FOOTER_COLLAPSED + insets.bottom);

  const { data: conversations = [], isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/coaches", coach?.id, "conversations"],
    enabled: !!coach?.id && isExpanded,
  });

  const { data: messages = [], isLoading: loadingMessages } = useQuery<Message[]>({
    queryKey: ["/api/conversations", selectedConversation?.id, "messages"],
    enabled: !!selectedConversation?.id,
    refetchInterval: 5000,
  });

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/coaches", coach?.id, "unread-count"],
    enabled: !!coach?.id,
    refetchInterval: 30000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!selectedConversation || !coach) return;
      const url = new URL(`/api/conversations/${selectedConversation.id}/messages`, getApiUrl());
      return apiRequest(url.toString(), "POST", {
        senderType: "coach",
        senderCoachId: coach.id,
        body,
        messageType: "text",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversation?.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coaches", coach?.id, "conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coaches", coach?.id, "unread-count"] });
    },
  });

  const addReactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!coach) return;
      const url = new URL(`/api/messages/${messageId}/reactions`, getApiUrl());
      return apiRequest(url.toString(), "POST", {
        reactorType: "coach",
        reactorCoachId: coach.id,
        emoji,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversation?.id, "messages"] });
    },
  });

  useEffect(() => {
    height.value = withSpring(
      isExpanded ? FOOTER_EXPANDED + insets.bottom : FOOTER_COLLAPSED + insets.bottom,
      { damping: 20, stiffness: 200 }
    );
  }, [isExpanded, insets.bottom]);

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

  const currentTabConfig = CHAT_TABS.find(t => t.id === currentTab);
  const filteredConversations = conversations.filter(conv => {
    if (currentTab === "players") {
      return conv.playerId !== null || currentTabConfig?.types.includes(conv.type);
    }
    return currentTabConfig?.types.includes(conv.type) ?? false;
  });
  const displayConversations = filteredConversations.length > 0 ? filteredConversations : 
    (currentTab === "players" ? conversations : []);
  const latestConversation = conversations[0];
  const unreadCount = unreadData?.unreadCount || 0;

  const handleTabChange = (tab: ChatTab) => {
    setCurrentTab(tab);
    if (selectedConversation && !CHAT_TABS.find(t => t.id === tab)?.types.includes(selectedConversation.type)) {
      setSelectedConversation(null);
    }
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

    return (
      <Pressable
        onLongPress={() => setShowReactions(showReactions === item.id ? null : item.id)}
        style={[styles.messageBubble, isOwn ? styles.ownMessage : styles.otherMessage]}
      >
        {!isOwn ? (
          <View style={styles.senderInfo}>
            <View style={styles.playerAvatar}>
              <Ionicons name="person" size={12} color={Colors.dark.text} />
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

  const renderTabBar = () => (
    <View style={styles.tabBar}>
      {CHAT_TABS.map((tab) => (
        <Pressable
          key={tab.id}
          onPress={() => handleTabChange(tab.id)}
          style={[
            styles.tab,
            currentTab === tab.id && styles.tabActive,
          ]}
        >
          <Ionicons
            name={tab.icon}
            size={16}
            color={currentTab === tab.id ? Colors.dark.primary : Colors.dark.text}
          />
          <ThemedText
            style={[
              styles.tabName,
              currentTab === tab.id && styles.tabNameActive,
            ]}
          >
            {tab.name}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );

  const renderConversationList = () => (
    <>
      {renderTabBar()}
      <FlatList
        data={displayConversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedConversation(item)}
            style={styles.conversationItem}
          >
            <View style={styles.conversationAvatar}>
              <Ionicons name="person" size={20} color={Colors.dark.text} />
            </View>
            <View style={styles.conversationInfo}>
              <ThemedText style={styles.conversationName}>
                {item.playerName || item.title || "Chat"}
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
            <ThemedText style={styles.emptyText}>No {currentTabConfig?.name.toLowerCase()} chats yet</ThemedText>
          </View>
        }
      />
    </>
  );

  return (
    <Animated.View style={[styles.container, { paddingBottom: insets.bottom }, animatedStyle]}>
      <Pressable
        onPress={() => setIsExpanded(!isExpanded)}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <View style={styles.chatIconContainer}>
            <Ionicons name="chatbubble-outline" size={20} color={Colors.dark.primary} />
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <ThemedText style={styles.unreadText}>{unreadCount}</ThemedText>
              </View>
            ) : null}
          </View>
          {latestConversation && !isExpanded ? (
            <ThemedText numberOfLines={1} style={styles.previewText}>
              <ThemedText style={styles.previewSender}>
                {latestConversation.playerName || "Chat"}:{" "}
              </ThemedText>
              {latestConversation.lastMessagePreview || "No messages"}
            </ThemedText>
          ) : (
            <ThemedText style={styles.headerTitle}>Glow Chat</ThemedText>
          )}
        </View>
        <Ionicons
          name={isExpanded ? "chevron-down-outline" : "chevron-up-outline"}
          size={20}
          color={Colors.dark.text}
        />
      </Pressable>

      {isExpanded ? (
        <View style={styles.expandedContent}>
          {selectedConversation ? (
            <>
              <View style={styles.conversationHeader}>
                <Pressable onPress={() => setSelectedConversation(null)} style={styles.backButton}>
                  <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
                </Pressable>
                <ThemedText style={styles.conversationTitle}>
                  {selectedConversation.playerName || "Chat"}
                </ThemedText>
              </View>

              {loadingMessages ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={Colors.dark.primary} />
                </View>
              ) : (
                <FlatList
                  ref={flatListRef}
                  data={messages}
                  keyExtractor={(item) => item.id}
                  renderItem={renderMessage}
                  style={styles.messageList}
                  contentContainerStyle={styles.messageListContent}
                  onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                />
              )}

              <View style={styles.inputContainer}>
                <TextInput
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Type a message..."
                  placeholderTextColor={Colors.dark.disabled}
                  style={styles.input}
                  onSubmitEditing={handleSend}
                  returnKeyType="send"
                />
                <Pressable
                  onPress={handleSend}
                  disabled={sendMessageMutation.isPending}
                  style={({ pressed }) => [
                    styles.sendButton,
                    { opacity: pressed || sendMessageMutation.isPending ? 0.7 : 1 },
                  ]}
                >
                  <Ionicons name="send-outline" size={20} color={Colors.dark.buttonText} />
                </Pressable>
              </View>
            </>
          ) : loadingConversations ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={Colors.dark.primary} />
            </View>
          ) : (
            renderConversationList()
          )}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.headerBorder,
    zIndex: 100,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    height: FOOTER_COLLAPSED,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  chatIconContainer: {
    position: "relative",
  },
  unreadBadge: {
    position: "absolute",
    top: -6,
    right: -8,
    backgroundColor: Colors.dark.error,
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  previewText: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.7,
    flex: 1,
  },
  previewSender: {
    fontWeight: "600",
    color: Colors.dark.text,
  },
  expandedContent: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
    paddingBottom: Spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  tabActive: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  tabName: {
    fontSize: 11,
    color: Colors.dark.text,
    opacity: 0.7,
  },
  tabNameActive: {
    color: Colors.dark.primary,
    opacity: 1,
    fontWeight: "600",
  },
  conversationHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  backButton: {
    padding: Spacing.xs,
  },
  conversationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginLeft: Spacing.xs,
  },
  conversationItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  conversationAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
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
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
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
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: Spacing.sm,
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderBottomLeftRadius: 4,
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
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  senderName: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
    opacity: 0.8,
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
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  reactionCount: {
    fontSize: 10,
    color: Colors.dark.text,
  },
  reactionPicker: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  reactionOption: {
    padding: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Platform.OS === "ios" ? Spacing.md : Spacing.sm,
    color: Colors.dark.text,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
