import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing } from "@/constants/theme";
import { useWebSocket } from "@/lib/useWebSocket";
import { useChatStickyBottom } from "@/lib/useChatStickyBottom";

interface Message {
  id: string;
  body: string;
  senderType: string | null;
  senderProviderId: string | null;
  senderPlayerId: string | null;
  messageType: string | null;
  createdAt: string | null;
}

interface ConversationInfo {
  id: string;
  providerName?: string | null;
  providerPhoto?: string | null;
  orderNumber?: string | null;
  orderId?: string | null;
}

export default function PlayerBookingChatScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const orderId: string = route.params?.orderId;
  const conversationId: string | undefined = route.params?.conversationId;
  const [inputText, setInputText] = useState("");

  // If conversationId is passed directly, skip the get/create step
  const { data: conversation, isLoading: convLoading } = useQuery<ConversationInfo>({
    queryKey: ["/api/player/me/bookings", orderId ?? conversationId, "conversation"],
    queryFn: async () => {
      if (conversationId) {
        return { id: conversationId } as ConversationInfo;
      }
      const res = await apiRequest("GET", `/api/player/me/bookings/${orderId}/conversation`);
      return res.json();
    },
    enabled: !!(orderId || conversationId),
    retry: 2,
  });

  const activeConvId = conversation?.id;

  const { data: messages = [], isLoading: msgsLoading } = useQuery<Message[]>({
    queryKey: ["/api/player/me/conversations", activeConvId, "messages"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/player/me/conversations/${activeConvId}/messages`);
      return res.json();
    },
    enabled: !!activeConvId,
    refetchInterval: 8000,
  });

  const stick = useChatStickyBottom<Message>({
    itemCount: messages.length,
    resetKey: activeConvId ?? null,
  });

  // Real-time WebSocket: invalidate on new messages for this conversation
  useWebSocket({
    onNewMessage: useCallback((payload) => {
      if (activeConvId && payload.conversationId === activeConvId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/player/me/conversations", activeConvId, "messages"],
        });
        apiRequest("POST", `/api/player/me/conversations/${activeConvId}/read`).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations"] });
      }
    }, [activeConvId, queryClient]),
  });

  // Mark as read
  useEffect(() => {
    if (!activeConvId) return;
    apiRequest("POST", `/api/player/me/conversations/${activeConvId}/read`).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations"] });
  }, [activeConvId, messages.length]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", `/api/player/me/conversations/${activeConvId}/messages`, { body });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/player/me/conversations", activeConvId, "messages"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations"] });
      setInputText("");
      setTimeout(() => stick.scrollToBottom(true), 100);
    },
  });

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !activeConvId || sendMutation.isPending) return;
    sendMutation.mutate(text);
  }, [inputText, activeConvId, sendMutation]);


  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isSystem = item.senderType === "system" || item.messageType === "system";
    const isMe = item.senderType === "player";
    const time = item.createdAt
      ? new Date(item.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
      : "";

    if (isSystem) {
      return (
        <View style={styles.systemRow}>
          <Text style={styles.systemText}>{item.body}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]}>
            {item.body}
          </Text>
          <Text style={[styles.timeText, isMe ? styles.timeTextMe : styles.timeTextOther]}>
            {time}
          </Text>
        </View>
      </View>
    );
  }, []);

  if (convLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={Colors.dark.primary} />
      </View>
    );
  }

  const providerName = conversation?.providerName ?? "Service Provider";
  const orderNum = conversation?.orderNumber ? `Booking #${conversation.orderNumber}` : "Booking Chat";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{providerName}</Text>
          <Text style={styles.headerSub}>{orderNum}</Text>
        </View>
      </View>

      {msgsLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.dark.primary} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={stick.ref}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={stick.onContentSizeChange}
            onScroll={stick.onScroll}
            scrollEventThrottle={stick.scrollEventThrottle}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={48} color={Colors.dark.textSecondary} />
                <Text style={styles.emptyText}>No messages yet</Text>
                <Text style={styles.emptySubText}>Send a message to your service provider</Text>
              </View>
            }
          />
          {stick.hasNewBelow ? (
            <Pressable style={styles.jumpUnreadPill} onPress={() => stick.scrollToBottom(true)}>
              <Ionicons name="arrow-down" size={14} color="#000" />
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#000" }}>New message</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor={Colors.dark.textTertiary}
          multiline
          maxLength={500}
          returnKeyType="default"
        />
        <Pressable
          style={[styles.sendBtn, (!inputText.trim() || sendMutation.isPending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || sendMutation.isPending}
        >
          {sendMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.dark.backgroundDefault} />
          ) : (
            <Ionicons name="send" size={18} color={Colors.dark.backgroundDefault} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  backBtn: {
    padding: Spacing.xs,
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: 1,
  },
  messageList: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  systemRow: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  systemText: {
    fontSize: 12,
    color: Colors.dark.textTertiary,
    textAlign: "center",
    fontStyle: "italic",
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: 10,
  },
  msgRow: {
    marginVertical: 2,
  },
  msgRowRight: {
    alignItems: "flex-end",
  },
  msgRowLeft: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 16,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  bubbleMe: {
    backgroundColor: Colors.dark.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextMe: {
    color: Colors.dark.backgroundDefault,
  },
  bubbleTextOther: {
    color: Colors.dark.text,
  },
  timeText: {
    fontSize: 10,
    marginTop: 3,
  },
  timeTextMe: {
    color: Colors.dark.backgroundDefault + "AA",
    textAlign: "right",
  },
  timeTextOther: {
    color: Colors.dark.textTertiary,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  emptySubText: {
    fontSize: 13,
    color: Colors.dark.textTertiary,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    color: Colors.dark.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
