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
  ScrollView,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { usePlayer } from "@/player/context/PlayerContext";
import { apiRequest, buildPhotoUrl } from "@/lib/query-client";
import { useWebSocket, type NewMessagePayload, type TypingPayload } from "@/lib/useWebSocket";
import { useChatStickyBottom } from "@/lib/useChatStickyBottom";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const FOOTER_COLLAPSED = 60;
const CHAT_PILL_LIFT = 22;
const FOOTER_EXPANDED = Math.min(SCREEN_HEIGHT * 0.55, 420);

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
  coachPhoto?: string | null;
  playerName?: string | null;
  playerPhoto?: string | null;
  seriesDayOfWeek?: number | null;
  seriesStartTime?: string | null;
}

const REACTION_EMOJIS = ["thumbsup", "heart", "fire", "trophy", "star"];

const TAB_BAR_HEIGHT = 85;

type ChatTab = "players" | "coaches" | "academy" | "groups";

const CHAT_TABS: { id: ChatTab; name: string; icon: keyof typeof Ionicons.glyphMap; types: string[] }[] = [
  { id: "players", name: "Players", icon: "people-outline", types: ["player_player"] },
  { id: "coaches", name: "Coaches", icon: "ribbon-outline", types: ["coach_player", "direct_message"] },
  { id: "academy", name: "Academy", icon: "home-outline", types: ["academy"] },
  { id: "groups", name: "Groups", icon: "people-circle-outline", types: ["squad", "group", "series_group", "lesson_group"] },
];

const SERIES_GROUP_TYPES = new Set(["series_group", "squad", "lesson_group"]);

function formatGroupSubtitle(
  conv: { type: string; seriesDayOfWeek?: number | null; seriesStartTime?: string | null },
  locale?: string,
): string | null {
  if (!SERIES_GROUP_TYPES.has(conv.type)) return null;
  const day = conv.seriesDayOfWeek;
  const time = conv.seriesStartTime;
  if (day == null && !time) return null;
  let dayLabel: string | null = null;
  if (day != null && day >= 0 && day <= 6) {
    try {
      // Use a fixed reference Sunday (2024-01-07) and add `day` days to get a weekday for formatting.
      const ref = new Date(Date.UTC(2024, 0, 7 + day));
      dayLabel = new Intl.DateTimeFormat(locale || undefined, { weekday: "short", timeZone: "UTC" }).format(ref);
    } catch {
      const fallback = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      dayLabel = fallback[day];
    }
  }
  if (dayLabel && time) return `${dayLabel} ${time}`;
  return dayLabel || time || null;
}

interface OtherPlayer {
  id: string;
  firstName: string;
  lastName: string;
  profilePhotoUrl?: string | null;
}

export function PlayerChatFooter() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isMinor } = usePlayer();
  const playerId = user?.playerId;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map());
  const [currentTab, setCurrentTab] = useState<ChatTab>("players");
  const [showNewPlayerChat, setShowNewPlayerChat] = useState(false);
  const [academyConvCreated, setAcademyConvCreated] = useState<Conversation | null>(null);
  const [failedAvatarIds, setFailedAvatarIds] = useState<Set<string>>(new Set());
  const markAvatarFailed = useCallback((id: string) => {
    setFailedAvatarIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const height = useSharedValue(FOOTER_COLLAPSED);

  const handleNewMessage = useCallback((payload: NewMessagePayload) => {
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations", payload.conversationId, "messages"] });
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/unread-count"] });
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
    queryKey: ["/api/player/me/conversations"],
    enabled: !!playerId,
  });

  const { data: messages = [], isLoading: loadingMessages } = useQuery<Message[]>({
    queryKey: ["/api/player/me/conversations", selectedConversation?.id, "messages"],
    enabled: !!selectedConversation?.id,
    refetchInterval: isConnected ? 30000 : 5000,
  });

  const stick = useChatStickyBottom<Message>({
    itemCount: messages.length,
    resetKey: selectedConversation?.id ?? null,
  });

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/player/me/unread-count"],
    enabled: !!playerId,
    refetchInterval: 30000,
  });

  const { data: otherPlayers = [] } = useQuery<OtherPlayer[]>({
    queryKey: ["/api/players/squad-members"],
    enabled: !!playerId && (currentTab === "players" || showNewPlayerChat),
  });

  const createConversationMutation = useMutation({
    mutationFn: async ({ type, otherPlayerId, title }: { type: string; otherPlayerId?: string; title?: string }): Promise<Conversation> => {
      if (!playerId) throw new Error("No player");
      const response = await apiRequest("POST", "/api/player/me/conversations", {
        type,
        otherPlayerId,
        title,
      });
      return response.json();
    },
    onSuccess: (data: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations"] });
      setSelectedConversation(data);
      setShowNewPlayerChat(false);
      if (data.type === "academy") {
        setAcademyConvCreated(data);
      }
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!selectedConversation || !playerId) return;
      return apiRequest("POST", `/api/player/me/conversations/${selectedConversation.id}/messages`, {
        body,
        messageType: "text",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations", selectedConversation?.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/unread-count"] });
    },
  });

  const addReactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!playerId) return;
      return apiRequest("POST", `/api/player/me/messages/${messageId}/reactions`, {
        emoji,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations", selectedConversation?.id, "messages"] });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      return apiRequest("POST", `/api/player/me/conversations/${conversationId}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations"] });
    },
  });

  const handleSelectConversation = useCallback((conv: Conversation) => {
    setSelectedConversation(conv);
  }, []);

  useEffect(() => {
    const safeFullscreenHeight = SCREEN_HEIGHT - insets.top - tabBarHeight;
    const targetHeight = isFullscreen 
      ? safeFullscreenHeight 
      : isExpanded 
        ? FOOTER_EXPANDED 
        : FOOTER_COLLAPSED;
    height.value = withSpring(targetHeight, { damping: 20, stiffness: 200 });
  }, [isExpanded, isFullscreen, insets.top, tabBarHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  useEffect(() => {
    if (selectedConversation?.id) {
      markAsReadMutation.mutate(selectedConversation.id);
    }
  }, [selectedConversation?.id]);

  const handleSend = async () => {
    if (inputText.trim() && selectedConversation) {
      sendMessageMutation.mutate(inputText.trim());
      setInputText("");
      setTimeout(() => stick.scrollToBottom(true), 100);
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

  const currentTabConfig = CHAT_TABS.find(t => t.id === currentTab);
  const filteredConversations = conversations.filter(conv => {
    return currentTabConfig?.types.includes(conv.type) ?? false;
  });

  const handleTabChange = (tab: ChatTab) => {
    setCurrentTab(tab);
    setShowNewPlayerChat(false);
    if (selectedConversation && !CHAT_TABS.find(t => t.id === tab)?.types.includes(selectedConversation.type)) {
      setSelectedConversation(null);
    }
  };

  // Auto-select or create Academy conversation when Academy tab is active
  useEffect(() => {
    if (currentTab === "academy" && !createConversationMutation.isPending) {
      const academyConv = conversations.find(c => c.type === "academy");
      if (academyConv) {
        if (!selectedConversation || selectedConversation.id !== academyConv.id) {
          setSelectedConversation(academyConv);
        }
      } else if (academyConvCreated) {
        if (!selectedConversation || selectedConversation.id !== academyConvCreated.id) {
          setSelectedConversation(academyConvCreated);
        }
      } else {
        createConversationMutation.mutate({
          type: "academy",
          title: "Academy Chat",
        });
      }
    }
  }, [currentTab, conversations, selectedConversation, createConversationMutation.isPending, academyConvCreated]);

  const handleStartPlayerChat = (player: OtherPlayer) => {
    const existingConv = conversations.find(c => 
      c.type === "player_player" && c.title?.includes(player.firstName)
    );
    if (existingConv) {
      setSelectedConversation(existingConv);
      setShowNewPlayerChat(false);
    } else {
      createConversationMutation.mutate({
        type: "player_player",
        otherPlayerId: player.id,
        title: `${player.firstName} ${player.lastName}`,
      });
    }
  };

  const renderTabBar = () => (
    <View style={styles.tabBarContainer}>
      {CHAT_TABS.map((tab) => (
        <Pressable
          key={tab.id}
          onPress={() => handleTabChange(tab.id)}
          style={[styles.tab, currentTab === tab.id && styles.tabActive]}
        >
          <Ionicons
            name={tab.icon}
            size={16}
            color={currentTab === tab.id ? Colors.dark.primary : Colors.dark.text}
          />
          <ThemedText style={[styles.tabName, currentTab === tab.id && styles.tabNameActive]}>
            {tab.id === "groups" ? t("chat.tabs.groups") : tab.name}
          </ThemedText>
        </Pressable>
      ))}
      {currentTab === "players" ? (
        <Pressable onPress={() => setShowNewPlayerChat(true)} style={styles.addButton}>
          <Ionicons name="add" size={18} color={Colors.dark.buttonText} />
        </Pressable>
      ) : null}
    </View>
  );

  const renderPlayerSelector = () => (
    <View style={styles.selectorContainer}>
      <View style={styles.selectorHeader}>
        <Pressable onPress={() => setShowNewPlayerChat(false)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.selectorTitle}>New Chat</ThemedText>
      </View>
      <FlatList
        data={otherPlayers.filter(p => p.id !== playerId)}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => handleStartPlayerChat(item)} style={styles.playerSelectItem}>
            {(() => {
              const avatarKey = `picker:${item.id}`;
              const photoUrl = buildPhotoUrl(item.profilePhotoUrl);
              if (photoUrl && !failedAvatarIds.has(avatarKey)) {
                return (
                  <Image
                    source={{ uri: photoUrl }}
                    style={styles.playerSelectAvatarImage}
                    onError={() => markAvatarFailed(avatarKey)}
                  />
                );
              }
              const initial = (item.firstName || "?").charAt(0).toUpperCase();
              return (
                <View style={styles.playerSelectAvatar}>
                  <ThemedText style={styles.avatarInitial}>{initial}</ThemedText>
                </View>
              );
            })()}
            <ThemedText style={styles.playerSelectName}>
              {item.firstName} {item.lastName}
            </ThemedText>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color={Colors.dark.tabIconDefault} />
            <ThemedText style={styles.emptyText}>No teammates found</ThemedText>
          </View>
        }
      />
    </View>
  );

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = item.senderType === "player" && item.senderPlayerId === playerId;
    const isSystem = item.messageType === "system";

    if (isSystem) {
      return (
        <View style={styles.systemMessage}>
          <Ionicons name="notifications-outline" size={14} color={Colors.dark.primary} />
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
    <Animated.View
      style={[
        styles.container,
        (!isExpanded && !isFullscreen) && styles.containerCollapsed,
        {
          bottom: isExpanded || isFullscreen ? tabBarHeight : tabBarHeight + CHAT_PILL_LIFT,
          paddingTop: isFullscreen ? insets.top : 0,
        },
        animatedStyle,
      ]}
    >
      {(!isExpanded && !isFullscreen) ? (
        // ── COLLAPSED: two pills flanking the center Play button ──
        <>
        <View style={styles.pillRow}>
          <Pressable
            style={styles.leftPill}
            onPress={() => setIsExpanded(true)}
          >
            <View style={styles.chatIconContainer}>
              <Ionicons name="chatbubble-outline" size={18} color={Colors.dark.primary} />
              {unreadCount > 0 ? (
                <View style={styles.unreadBadge}>
                  <ThemedText style={styles.unreadText}>{unreadCount}</ThemedText>
                </View>
              ) : null}
            </View>
            <ThemedText numberOfLines={1} style={styles.headerPreview}>
              {latestConversation?.lastMessagePreview ?? "Messages"}
            </ThemedText>
          </Pressable>

          <View style={styles.pillGap} />

          <Pressable
            style={styles.rightPill}
            onPress={() => setIsExpanded(true)}
          >
            <Ionicons name="chevron-up" size={20} color={Colors.dark.text} />
            {unreadCount > 0 ? (
              <View style={styles.rightPillBadge}>
                <ThemedText style={styles.rightPillBadgeText}>{unreadCount}</ThemedText>
              </View>
            ) : null}
          </Pressable>
        </View>
        </>
      ) : (
        // ── EXPANDED / FULLSCREEN: original header ──
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
                <Ionicons name="chatbubble-outline" size={20} color={Colors.dark.primary} />
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
      )}

      {(isExpanded || isFullscreen) ? (
        <View style={styles.content}>
          {renderTabBar()}
          {showNewPlayerChat ? (
            renderPlayerSelector()
          ) : selectedConversation ? (
            <View style={styles.chatView}>
              <View style={styles.chatHeader}>
                <Pressable 
                  onPress={() => setSelectedConversation(null)} 
                  style={styles.backButton}
                >
                  <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
                </Pressable>
                {(() => {
                  const isPlayerChat = selectedConversation.type === "player_player";
                  const isCoachChat =
                    selectedConversation.type === "coach_player" ||
                    selectedConversation.type === "direct_message";
                  const headerPhoto = isPlayerChat
                    ? buildPhotoUrl(selectedConversation.playerPhoto)
                    : isCoachChat
                      ? buildPhotoUrl(selectedConversation.coachPhoto)
                      : null;
                  const headerAvatarKey = `chat-header:${selectedConversation.id}`;
                  if (isPlayerChat || isCoachChat) {
                    if (headerPhoto && !failedAvatarIds.has(headerAvatarKey)) {
                      return (
                        <Image
                          source={{ uri: headerPhoto }}
                          style={styles.chatHeaderAvatarImage}
                          onError={() => markAvatarFailed(headerAvatarKey)}
                        />
                      );
                    }
                    return (
                      <View style={styles.chatHeaderAvatar}>
                        <Ionicons
                          name={isCoachChat ? "ribbon" : "person"}
                          size={18}
                          color={Colors.dark.primary}
                        />
                      </View>
                    );
                  }
                  return null;
                })()}
                <ThemedText style={styles.chatTitle}>
                  {(selectedConversation.type === "player_player"
                    ? selectedConversation.playerName
                    : null) ||
                    selectedConversation.coachName ||
                    selectedConversation.title ||
                    (currentTab === "coaches"
                      ? "Coach"
                      : currentTab === "academy"
                        ? "Academy"
                        : "Chat")}
                </ThemedText>
              </View>
              <View style={styles.safetyBanner}>
                <Ionicons name="shield-checkmark" size={14} color="#4FC3F7" />
                <ThemedText style={styles.safetyBannerText}>
                  {isMinor
                    ? "This conversation is monitored for child safety"
                    : "Chats are monitored. Never share personal or financial info. Beware of scams."}
                </ThemedText>
              </View>
              {loadingMessages ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={Colors.dark.primary} />
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
                    onLayout={stick.onLayout}
                    onScroll={stick.onScroll}
                    scrollEventThrottle={stick.scrollEventThrottle}
                    ListEmptyComponent={
                      <View style={styles.emptyState}>
                        <Ionicons name="chatbubble-outline" size={40} color={Colors.dark.tabIconDefault} />
                        <ThemedText style={styles.emptyText}>No messages yet</ThemedText>
                        <ThemedText style={styles.emptySubtext}>Send a message to your coach</ThemedText>
                      </View>
                    }
                  />
                  {stick.hasNewBelow ? (
                    <Pressable
                      style={styles.jumpUnreadPill}
                      onPress={() => stick.scrollToBottom(true)}
                    >
                      <Ionicons name="arrow-down" size={14} color="#000" />
                      <ThemedText style={{ fontSize: 12, fontWeight: "700", color: "#000" }}>{t("chat.newMessage")}</ThemedText>
                    </Pressable>
                  ) : null}
                </View>
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
                    <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                  ) : (
                    <Ionicons name="send" size={18} color={Colors.dark.buttonText} />
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.conversationList}>
              {loadingConversations ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={Colors.dark.primary} />
                </View>
              ) : (
                <FlatList
                  data={filteredConversations.length > 0 ? filteredConversations : (currentTab === "coaches" || currentTab === "academy" ? conversations : [])}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => {
                    const groupSubtitle = currentTab === "groups" ? formatGroupSubtitle(item, i18n.language) : null;
                    return (
                    <Pressable
                      onPress={() => handleSelectConversation(item)}
                      style={styles.conversationItem}
                    >
                      {(() => {
                        const avatarKey = `conv:${item.id}`;
                        const photoUrl =
                          currentTab === "players"
                            ? buildPhotoUrl(item.playerPhoto)
                            : currentTab === "coaches"
                              ? buildPhotoUrl(item.coachPhoto)
                              : null;
                        if (photoUrl && !failedAvatarIds.has(avatarKey)) {
                          return (
                            <Image
                              source={{ uri: photoUrl }}
                              style={styles.conversationAvatarImage}
                              onError={() => markAvatarFailed(avatarKey)}
                            />
                          );
                        }
                        return (
                          <View style={[styles.conversationAvatar, currentTab === "players" && styles.playerAvatar]}>
                            <Ionicons
                              name={currentTab === "coaches" ? "ribbon" : currentTab === "players" ? "person" : currentTab === "academy" ? "home" : "people-circle"}
                              size={20}
                              color={Colors.dark.primary}
                            />
                          </View>
                        );
                      })()}
                      <View style={styles.conversationInfo}>
                        <ThemedText style={styles.conversationName}>
                          {(currentTab === "players" ? item.playerName : null) || item.coachName || item.title || (currentTab === "coaches" ? "Coach" : currentTab === "academy" ? "Academy" : "Chat")}
                        </ThemedText>
                        {groupSubtitle ? (
                          <ThemedText numberOfLines={1} style={styles.conversationPreview}>
                            {groupSubtitle}
                          </ThemedText>
                        ) : item.lastMessagePreview ? (
                          <ThemedText numberOfLines={1} style={styles.conversationPreview}>
                            {item.lastMessagePreview}
                          </ThemedText>
                        ) : null}
                      </View>
                    </Pressable>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <Ionicons 
                        name={currentTab === "coaches" ? "ribbon-outline" : currentTab === "players" ? "people-outline" : currentTab === "academy" ? "home-outline" : "people-circle-outline"} 
                        size={40} 
                        color={Colors.dark.tabIconDefault} 
                      />
                      <ThemedText style={styles.emptyText}>
                        {currentTab === "coaches" ? t("chat.empty.coachesTitle") : currentTab === "players" ? t("chat.empty.playersTitle") : currentTab === "academy" ? t("chat.empty.academyTitle") : t("chat.empty.groupsTitle")}
                      </ThemedText>
                      <ThemedText style={styles.emptySubtext}>
                        {currentTab === "coaches" ? t("chat.empty.coachesSubtitle") : currentTab === "players" ? t("chat.empty.playersSubtitle") : currentTab === "academy" ? t("chat.empty.academySubtitle") : t("chat.empty.groupsSubtitle")}
                      </ThemedText>
                    </View>
                  }
                />
              )}
            </View>
          )}
        </View>
      ) : null}

    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
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
    left: 0,
    right: 0,
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    overflow: "hidden",
    borderTopWidth: 1,
    borderColor: Colors.dark.border,
  },
  containerCollapsed: {
    backgroundColor: "transparent",
    borderTopWidth: 0,
    overflow: "visible",
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    height: FOOTER_COLLAPSED,
  },
  leftPill: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 0,
    paddingHorizontal: Spacing.md,
    height: FOOTER_COLLAPSED,
    borderWidth: 0,
    borderTopWidth: 1,
    borderColor: Colors.dark.border,
  },
  pillGap: {
    width: 82,
  },
  rightPill: {
    flex: 1,
    height: FOOTER_COLLAPSED,
    borderRadius: 0,
    backgroundColor: Colors.dark.backgroundDefault,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 0,
    borderTopWidth: 1,
    borderColor: Colors.dark.border,
  },
  rightPillBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: Colors.dark.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  rightPillBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.background,
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
    backgroundColor: Colors.dark.primary + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  unreadBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: Colors.dark.primary,
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
    color: Colors.dark.buttonText,
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
    backgroundColor: Colors.dark.primary,
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
  safetyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    backgroundColor: "rgba(79, 195, 247, 0.1)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(79, 195, 247, 0.15)",
  },
  safetyBannerText: {
    fontSize: 11,
    color: "#4FC3F7",
    fontWeight: "500",
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
  chatHeaderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.primary + "20",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  chatHeaderAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
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
    backgroundColor: Colors.dark.primary + "20",
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
    color: Colors.dark.primary,
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
    backgroundColor: Colors.dark.primary,
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
  tabBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
    gap: Spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  tabActive: {
    backgroundColor: `${Colors.dark.primary}20`,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}40`,
  },
  tabName: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  tabNameActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  addButton: {
    marginLeft: "auto",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  selectorContainer: {
    flex: 1,
  },
  selectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  selectorTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playerSelectItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  playerSelectAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.dark.primary}20`,
    justifyContent: "center",
    alignItems: "center",
  },
  playerSelectName: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  playerAvatar: {
    backgroundColor: `${Colors.dark.primary}20`,
  },
  conversationAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${Colors.dark.primary}20`,
  },
  playerSelectAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.dark.primary}20`,
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
}));
