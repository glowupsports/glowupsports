import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";
import { ChatMessage, CHAT_CHANNELS, REACTION_EMOJIS, ChatChannel } from "@/constants/playerData";
import { useChatStickyBottom } from "@/lib/useChatStickyBottom";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const FOOTER_COLLAPSED = 60;
const FOOTER_EXPANDED = Math.min(SCREEN_HEIGHT * 0.6, 450);
const TAB_BAR_HEIGHT = 85;

export function ChatFooter() {
  const {
    messages,
    currentChannel,
    setCurrentChannel,
    sendMessage,
    toggleReaction,
    player,
  } = usePlayer();
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputText, setInputText] = useState("");
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const height = useSharedValue(FOOTER_COLLAPSED);

  const filteredMessages = messages.filter((m) => m.channel === currentChannel);
  const latestMessage = filteredMessages[filteredMessages.length - 1];

  const stick = useChatStickyBottom<ChatMessage>({
    itemCount: filteredMessages.length,
    resetKey: currentChannel,
  });

  useEffect(() => {
    height.value = withSpring(
      isExpanded ? FOOTER_EXPANDED : FOOTER_COLLAPSED,
      { damping: 20, stiffness: 200 }
    );
  }, [isExpanded]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  const handleSend = async () => {
    if (inputText.trim()) {
      await sendMessage(inputText.trim());
      setInputText("");
      setTimeout(() => stick.scrollToBottom(true), 100);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getReactionIcon = (emoji: string): keyof typeof Ionicons.glyphMap => {
    const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
      thumbsup: "thumbs-up-outline",
      heart: "heart-outline",
      fire: "flash-outline",
      trophy: "ribbon-outline",
      star: "star-outline",
      zap: "flash-outline",
    };
    return icons[emoji] || "happy-outline";
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isOwn = item.senderId === player.id;
    const isSystem = item.isSystemMessage;

    if (isSystem) {
      return (
        <View style={styles.systemMessage}>
          <Ionicons name="notifications-outline" size={14} color={Colors.dark.successNeon} />
          <ThemedText style={styles.systemText}>{item.message}</ThemedText>
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
            <PlayerAvatar avatar={item.senderAvatar} size={24} />
            <ThemedText style={styles.senderName}>{item.senderName}</ThemedText>
          </View>
        ) : null}
        <ThemedText style={styles.messageText}>{item.message}</ThemedText>
        <ThemedText style={styles.timestamp}>{formatTime(item.timestamp)}</ThemedText>
        {item.reactions.length > 0 ? (
          <View style={styles.reactions}>
            {item.reactions.map((reaction) => (
              <Pressable
                key={reaction.emoji}
                onPress={() => toggleReaction(item.id, reaction.emoji)}
                style={[
                  styles.reactionBadge,
                  reaction.userReacted && styles.reactionBadgeActive,
                ]}
              >
                <Ionicons
                  name={getReactionIcon(reaction.emoji)}
                  size={12}
                  color={reaction.userReacted ? Colors.dark.primary : Colors.dark.text}
                />
                <ThemedText style={styles.reactionCount}>{reaction.count}</ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
        {showReactions === item.id ? (
          <View style={styles.reactionPicker}>
            {REACTION_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => {
                  toggleReaction(item.id, emoji);
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

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Pressable
        onPress={() => setIsExpanded(!isExpanded)}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <Ionicons
            name="chatbubble-outline"
            size={20}
            color={Colors.dark.primary}
          />
          {latestMessage && !isExpanded ? (
            <ThemedText numberOfLines={1} style={styles.previewText}>
              <ThemedText style={styles.previewSender}>
                {latestMessage.senderName}:{" "}
              </ThemedText>
              {latestMessage.message}
            </ThemedText>
          ) : (
            <ThemedText style={styles.headerTitle}>Chat</ThemedText>
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
          <View style={styles.channelTabs}>
            {CHAT_CHANNELS.map((channel) => (
              <Pressable
                key={channel.id}
                onPress={() => setCurrentChannel(channel.id as ChatChannel)}
                style={[
                  styles.channelTab,
                  currentChannel === channel.id && styles.channelTabActive,
                ]}
              >
                <Ionicons
                  name={channel.icon as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={currentChannel === channel.id ? Colors.dark.primary : Colors.dark.text}
                />
                <ThemedText
                  style={[
                    styles.channelName,
                    currentChannel === channel.id && styles.channelNameActive,
                  ]}
                >
                  {channel.name}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <View style={{ flex: 1 }}>
            <FlatList
              ref={stick.ref}
              data={filteredMessages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              style={styles.messageList}
              contentContainerStyle={styles.messageListContent}
              onContentSizeChange={stick.onContentSizeChange}
              onLayout={stick.onLayout}
              onScroll={stick.onScroll}
              scrollEventThrottle={stick.scrollEventThrottle}
            />
            {stick.hasNewBelow ? (
              <Pressable style={styles.jumpUnreadPill} onPress={() => stick.scrollToBottom(true)}>
                <Ionicons name="arrow-down" size={14} color="#000" />
                <ThemedText style={{ fontSize: 12, fontWeight: "700", color: "#000" }}>New message</ThemedText>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type a message..."
              placeholderTextColor={Colors.dark.textMuted}
              style={styles.input}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <Pressable
              onPress={handleSend}
              style={({ pressed }) => [
                styles.sendButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="send-outline" size={20} color={Colors.dark.buttonText} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </Animated.View>
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
    position: "absolute",
    bottom: TAB_BAR_HEIGHT,
    left: 0,
    right: 0,
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.headerBorder,
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
  channelTabs: {
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
    paddingBottom: Spacing.sm,
  },
  channelTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  channelTabActive: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  channelName: {
    fontSize: 11,
    color: Colors.dark.text,
    opacity: 0.7,
  },
  channelNameActive: {
    color: Colors.dark.primary,
    opacity: 1,
    fontWeight: "600",
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
  reactionBadgeActive: {
    borderWidth: 1,
    borderColor: Colors.dark.primary,
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
