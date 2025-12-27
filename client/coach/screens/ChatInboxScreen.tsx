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
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";

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

export default function ChatInboxScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { coach } = useCoach();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [inputText, setInputText] = useState("");
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const flatListRef = React.useRef<FlatList>(null);

  const { data: conversations = [], isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/coaches", coach?.id, "conversations"],
    enabled: !!coach?.id,
  });

  const { data: messages = [], isLoading: loadingMessages } = useQuery<Message[]>({
    queryKey: ["/api/conversations", selectedConversation?.id, "messages"],
    enabled: !!selectedConversation?.id,
    refetchInterval: 5000,
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

  const renderConversation = ({ item }: { item: Conversation }) => (
    <Pressable
      onPress={() => setSelectedConversation(item)}
      style={styles.conversationItem}
    >
      <View style={styles.conversationAvatar}>
        <Ionicons name="person" size={24} color={Colors.dark.text} />
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
    </Pressable>
  );

  if (selectedConversation) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => setSelectedConversation(null)} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <View style={styles.headerAvatar}>
              <Ionicons name="person" size={20} color={Colors.dark.text} />
            </View>
            <ThemedText style={styles.headerTitle}>
              {selectedConversation.playerName || "Chat"}
            </ThemedText>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        {loadingMessages ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={Colors.dark.primary} size="large" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            style={styles.messageList}
            contentContainerStyle={[styles.messageListContent, { paddingBottom: 100 }]}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        <View style={[styles.inputContainer, { paddingBottom: insets.bottom + Spacing.sm }]}>
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
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Glow Chat</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      {loadingConversations ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.primary} size="large" />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles-outline" size={60} color={Colors.dark.primary} />
          </View>
          <ThemedText style={styles.emptyTitle}>No conversations yet</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            Start chatting with your players from their profile
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          contentContainerStyle={styles.conversationList}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.headerBorder,
    backgroundColor: Colors.dark.backgroundDefault,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  headerSpacer: {
    width: 40,
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
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
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
  },
  conversationItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  conversationAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.dark.backgroundSecondary,
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
    color: Colors.dark.tabIconDefault,
  },
  conversationPreview: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
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
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.headerBorder,
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
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
