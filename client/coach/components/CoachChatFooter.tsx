import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
import { Colors, Spacing, BorderRadius, Backgrounds, GlowColors } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useWebSocket, type NewMessagePayload, type TypingPayload } from "@/lib/useWebSocket";
import { useChatState } from "@/coach/context/ChatStateContext";

interface ChatFooterProps {
  mode?: "coach" | "player";
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const FOOTER_COLLAPSED = 60;
const FOOTER_EXPANDED = SCREEN_HEIGHT - 120;
const FOOTER_FULLSCREEN = SCREEN_HEIGHT;
const LEFT_PANEL_WIDTH = 94;

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

type ChatTab = "players" | "coaches" | "academy" | "squad" | "activity" | "admin" | "world";

const COACH_CHAT_TABS: { id: ChatTab; name: string; icon: keyof typeof Ionicons.glyphMap; types: string[] }[] = [
  { id: "players", name: "Players", icon: "people-outline", types: ["direct_message", "coach_player"] },
  { id: "coaches", name: "Coaches", icon: "ribbon-outline", types: ["coach_coach"] },
  { id: "academy", name: "Academy", icon: "home-outline", types: ["academy"] },
  { id: "squad", name: "Squad", icon: "fitness-outline", types: ["squad", "group"] },
  { id: "activity", name: "Activity", icon: "newspaper-outline", types: [] },
  { id: "world", name: "World", icon: "globe-outline", types: ["world"] },
  { id: "admin", name: "Admin", icon: "shield-outline", types: ["admin"] },
];

const PLAYER_CHAT_TABS: { id: ChatTab; name: string; icon: keyof typeof Ionicons.glyphMap; types: string[] }[] = [
  { id: "players", name: "Players", icon: "people-outline", types: ["player_player"] },
  { id: "coaches", name: "Coaches", icon: "ribbon-outline", types: ["coach_player", "direct_message"] },
  { id: "academy", name: "Academy", icon: "home-outline", types: ["academy"] },
  { id: "squad", name: "Squad", icon: "fitness-outline", types: ["squad", "group"] },
  { id: "world", name: "World", icon: "globe-outline", types: ["world"] },
];

interface Player {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
}

interface Squad {
  id: string;
  name: string;
}

interface ActivityEvent {
  id: string;
  type: string;
  icon: string;
  title: string;
  description: string;
  playerName?: string;
  timestamp: string;
  xp?: number;
  level?: number;
}

interface WorldMessage {
  id: string;
  conversationId: string;
  senderType: string | null;
  senderCoachId: string | null;
  senderPlayerId: string | null;
  body: string;
  messageType: string | null;
  createdAt: string;
  senderName: string;
  academyName: string;
  reactions: Array<{
    id: string;
    emoji: string;
    reactorType: string;
    reactorCoachId: string | null;
    reactorPlayerId: string | null;
  }>;
}

const TAB_BAR_HEIGHT = 85;

export function CoachChatFooter({ mode = "coach" }: ChatFooterProps) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT;
  const queryClient = useQueryClient();
  const { coach } = useCoach();
  const { user } = useAuth();
  const { setChatExpanded } = useChatState();

  const isPlayerMode = mode === "player";
  const userId = isPlayerMode ? user?.playerId : coach?.id;
  const userType = isPlayerMode ? "player" : "coach";
  const CHAT_TABS = isPlayerMode ? PLAYER_CHAT_TABS : COACH_CHAT_TABS;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<ChatTab>("players");
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [showSquadSelector, setShowSquadSelector] = useState(false);
  const [showCoachSelector, setShowCoachSelector] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map());
  const [academyConvCreated, setAcademyConvCreated] = useState<Conversation | null>(null);
  const [squadAutoCreated, setSquadAutoCreated] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const height = useSharedValue(FOOTER_COLLAPSED);

  const handleNewMessage = useCallback((payload: NewMessagePayload) => {
    if (isPlayerMode) {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations", payload.conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/unread-count"] });
    } else {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", payload.conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coaches", userId, "conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coaches", userId, "unread-count"] });
    }
    if (selectedConversation?.id === payload.conversationId) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [queryClient, userId, selectedConversation?.id, isPlayerMode]);

  const handleTyping = useCallback((payload: TypingPayload) => {
    setTypingUsers(prev => {
      const next = new Map(prev);
      const conversationTypers = next.get(payload.conversationId) || new Set();
      const typingUserId = payload.coachId || payload.playerId;
      if (typingUserId && typingUserId !== userId) {
        if (payload.isTyping) {
          conversationTypers.add(typingUserId);
        } else {
          conversationTypers.delete(typingUserId);
        }
        next.set(payload.conversationId, conversationTypers);
      }
      return next;
    });
  }, [userId]);

  const { isConnected, sendTyping, sendReadReceipt } = useWebSocket({
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

  const toggleFullscreen = () => {
    if (isFullscreen) {
      setIsFullscreen(false);
    } else {
      setIsExpanded(true);
      setIsFullscreen(true);
    }
  };

  const conversationsQueryKey = isPlayerMode
    ? ["/api/player/me/conversations"]
    : ["/api/coaches", userId, "conversations"];

  const { data: conversations = [], isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: conversationsQueryKey,
    enabled: !!userId,
  });

  const messagesQueryKey = isPlayerMode
    ? ["/api/player/me/conversations", selectedConversation?.id, "messages"]
    : ["/api/conversations", selectedConversation?.id, "messages"];

  const { data: messages = [], isLoading: loadingMessages } = useQuery<Message[]>({
    queryKey: messagesQueryKey,
    enabled: !!selectedConversation?.id,
    refetchInterval: isConnected ? 30000 : 5000,
  });

  const unreadQueryKey = isPlayerMode
    ? ["/api/player/me/unread-count"]
    : ["/api/coaches", userId, "unread-count"];

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: unreadQueryKey,
    enabled: !!userId,
    refetchInterval: 30000,
  });

  const { data: playersData } = useQuery<Player[]>({
    queryKey: isPlayerMode ? ["/api/players/squad-members"] : ["/api/players"],
    enabled: !!userId && (showNewMessage || (isPlayerMode && currentTab === "players")),
  });
  const players = Array.isArray(playersData) ? playersData : [];

  const { data: allCoaches = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/coaches"],
    enabled: !!userId && currentTab === "coaches",
  });

  const otherCoaches = isPlayerMode ? allCoaches : allCoaches.filter(c => c.id !== coach?.id);

  const { data: squads = [] } = useQuery<Squad[]>({
    queryKey: ["/api/squads"],
    enabled: !!userId && (currentTab === "squad" || showSquadSelector),
  });

  const createConversationMutation = useMutation({
    mutationFn: async ({ type, playerId, otherPlayerId, title }: { type: string; playerId?: string; otherPlayerId?: string; title?: string }): Promise<Conversation> => {
      if (!userId) throw new Error("No user");
      if (isPlayerMode) {
        const payload: Record<string, string | undefined> = { type, title, otherPlayerId };
        const response = await apiRequest("POST", "/api/player/me/conversations", payload);
        return response.json();
      } else {
        const payload: Record<string, string | undefined> = { type, title, coachId: userId, playerId };
        const response = await apiRequest("POST", "/api/conversations", payload);
        return response.json();
      }
    },
    onSuccess: (data: Conversation) => {
      queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
      setSelectedConversation(data);
      if (data.type === "academy") {
        setAcademyConvCreated(data);
      }
      setShowNewMessage(false);
      setShowSquadSelector(false);
      setShowCoachSelector(false);
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!selectedConversation || !userId) return;
      if (isPlayerMode) {
        return apiRequest("POST", `/api/player/me/conversations/${selectedConversation.id}/messages`, {
          body,
          messageType: "text",
        });
      } else {
        return apiRequest("POST", `/api/conversations/${selectedConversation.id}/messages`, {
          senderType: userType,
          senderCoachId: userId,
          body,
          messageType: "text",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
      queryClient.invalidateQueries({ queryKey: unreadQueryKey });
    },
  });

  const addReactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!userId) return;
      if (isPlayerMode) {
        return apiRequest("POST", `/api/player/me/messages/${messageId}/reactions`, { emoji });
      } else {
        return apiRequest("POST", `/api/messages/${messageId}/reactions`, {
          reactorType: userType,
          reactorCoachId: userId,
          emoji,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    },
  });

  useEffect(() => {
    const targetHeight = isFullscreen
      ? FOOTER_FULLSCREEN
      : isExpanded
        ? FOOTER_EXPANDED
        : FOOTER_COLLAPSED;
    height.value = withSpring(targetHeight, { damping: 20, stiffness: 200 });
  }, [isExpanded, isFullscreen]);

  useEffect(() => {
    setChatExpanded(isExpanded || isFullscreen);
  }, [isExpanded, isFullscreen, setChatExpanded]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  const isSampleConversation = selectedConversation?.id?.startsWith("sample-") || false;

  const handleSend = async () => {
    if (!inputText.trim()) return;
    if (currentTab === "world") {
      sendWorldMessageMutation.mutate(inputText.trim());
      setInputText("");
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return;
    }
    if (selectedConversation && !isSampleConversation) {
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

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d`;
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
      return currentTabConfig?.types.includes(conv.type);
    }
    return currentTabConfig?.types.includes(conv.type) ?? false;
  });
  const displayConversations = filteredConversations;
  const latestConversation = conversations[0];
  const unreadCount = unreadData?.unreadCount || 0;

  const recentContacts = useMemo(() => {
    const sorted = [...conversations]
      .filter(c => {
        if (c.type === "academy") return false;
        if (currentTab === "players") {
          const tabCfg = CHAT_TABS.find(t => t.id === "players");
          return c.playerId !== null || tabCfg?.types.includes(c.type);
        }
        if (currentTab === "coaches") {
          const tabCfg = CHAT_TABS.find(t => t.id === "coaches");
          return tabCfg?.types.includes(c.type);
        }
        return false;
      })
      .sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 10);
    return sorted;
  }, [conversations, currentTab, CHAT_TABS]);

  const { data: activityFeedData, isLoading: loadingActivity } = useQuery<{ events: ActivityEvent[] }>({
    queryKey: ["/api/academy/activity-feed"],
    enabled: !!userId && currentTab === "activity",
    refetchInterval: 60000,
  });
  const activityEvents = activityFeedData?.events || [];

  const { data: worldMessages = [], isLoading: loadingWorldMessages } = useQuery<WorldMessage[]>({
    queryKey: ["/api/world-chat/messages"],
    enabled: !!userId && currentTab === "world",
    refetchInterval: isConnected ? 15000 : 5000,
  });

  const sendWorldMessageMutation = useMutation({
    mutationFn: async (body: string) => {
      return apiRequest("POST", "/api/world-chat/messages", {
        body,
        messageType: "text",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world-chat/messages"] });
    },
  });

  const handleTabChange = (tab: ChatTab) => {
    setCurrentTab(tab);

    setShowNewMessage(false);
    setShowSquadSelector(false);
    setShowCoachSelector(false);

    if (tab === "activity" || tab === "world") {
      setSelectedConversation(null);
      return;
    }

    if (selectedConversation && !CHAT_TABS.find(t => t.id === tab)?.types.includes(selectedConversation.type)) {
      setSelectedConversation(null);
    }

    if (tab === "academy") {
      const academyConv = conversations.find(c => c.type === "academy");
      if (academyConv) {
        setSelectedConversation(academyConv);
      }
    } else {
      if (selectedConversation?.type === "academy") {
        setSelectedConversation(null);
      }
    }
  };

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

  useEffect(() => {
    if (currentTab === "squad" && isPlayerMode && !createConversationMutation.isPending && !squadAutoCreated) {
      const squadConv = conversations.find(c => c.type === "squad" || c.type === "group");
      if (squadConv) {
        if (!selectedConversation || selectedConversation.id !== squadConv.id) {
          setSelectedConversation(squadConv);
        }
      } else {
        setSquadAutoCreated(true);
        createConversationMutation.mutate({
          type: "squad",
          title: "My Training Group",
        });
      }
    }
  }, [currentTab, conversations, selectedConversation, createConversationMutation.isPending, isPlayerMode, squadAutoCreated]);

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = isPlayerMode
      ? (item.senderType === "player" && item.senderPlayerId === userId)
      : (item.senderType === "coach" && item.senderCoachId === userId);
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
              <Ionicons name="person" size={10} color={Colors.dark.text} />
            </View>
            <ThemedText style={styles.senderName}>
              {selectedConversation?.playerName || "Player"}
            </ThemedText>
          </View>
        ) : null}
        <View style={styles.messageRow}>
          <ThemedText style={[styles.messageText, isOwn && styles.ownMessageText]}>{item.body}</ThemedText>
          <ThemedText style={[styles.timestamp, isOwn && styles.ownTimestamp]}>{formatTime(item.createdAt)}</ThemedText>
        </View>
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

  const handleStartNewPlayerChat = (player: Player) => {
    const playerName = player.name || `${player.firstName || ''} ${player.lastName || ''}`.trim() || 'Player';
    if (isPlayerMode) {
      const existingConv = conversations.find(c =>
        c.type === "player_player" && c.title?.includes(playerName)
      );
      if (existingConv) {
        setSelectedConversation(existingConv);
        setShowNewMessage(false);
      } else {
        createConversationMutation.mutate({
          type: "player_player",
          otherPlayerId: player.id,
          title: playerName,
        });
      }
    } else {
      const existingConv = conversations.find(c => c.playerId === player.id);
      if (existingConv) {
        setSelectedConversation(existingConv);
        setShowNewMessage(false);
      } else {
        createConversationMutation.mutate({
          type: "coach_player",
          playerId: player.id,
          title: playerName,
        });
      }
    }
  };

  const handleStartSquadChat = (squad: Squad) => {
    const existingConv = conversations.find(c => c.title === squad.name && c.type === "squad");
    if (existingConv) {
      setSelectedConversation(existingConv);
      setShowSquadSelector(false);
    } else {
      createConversationMutation.mutate({
        type: "squad",
        title: squad.name,
      });
    }
  };

  const handleStartCoachChat = (otherCoach: { id: string; name: string }) => {
    const existingConv = conversations.find(c => c.title === otherCoach.name && c.type === "coach_coach");
    if (existingConv) {
      setSelectedConversation(existingConv);
      setShowCoachSelector(false);
    } else {
      createConversationMutation.mutate({
        type: "coach_coach",
        title: otherCoach.name,
      });
    }
  };

  const handleCreateAcademyChat = () => {
    createConversationMutation.mutate({
      type: "academy",
      title: "Academy Chat",
    });
  };

  const getConvDisplayName = (conv: Conversation) => {
    if (conv.type === "academy") return "Academy Chat";
    if (conv.type === "squad" || conv.type === "group") return conv.title || "Squad Chat";
    if (conv.type === "coach_coach") return conv.title || "Coach Chat";
    if (conv.playerName && conv.playerName !== "Chat") return conv.playerName;
    if (conv.title && conv.title !== "Chat") return conv.title;
    return "Conversation";
  };
  const getConvName = (conv: Conversation) => getConvDisplayName(conv);
  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  const getConvIcon = (conv: Conversation): keyof typeof Ionicons.glyphMap => {
    switch (conv.type) {
      case "coach_coach": return "ribbon";
      case "academy": return "home";
      case "squad":
      case "group": return "fitness";
      default: return "person";
    }
  };

  const getActivityIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case "level_up": return "arrow-up-circle";
      case "xp_level_up": return "star";
      case "xp_earned": return "flash";
      case "session_completed": return "checkmark-circle";
      case "academy": return "trophy-outline";
      case "squad":
      case "group": return "fitness-outline";
      case "coach_coach": return "ribbon-outline";
      default: return "chatbubble-outline";
    }
  };

  const getActivityColor = (type: string): string => {
    switch (type) {
      case "level_up": return Colors.dark.successNeon;
      case "xp_level_up": return "#FFD700";
      case "xp_earned": return Colors.dark.xpCyan;
      case "session_completed": return Colors.dark.primary;
      default: return Colors.dark.textSecondary;
    }
  };

  const renderVerticalTabs = () => (
    <View style={styles.verticalTabPanel}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.verticalTabScroll}
      >
        {CHAT_TABS.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => handleTabChange(tab.id)}
              style={[styles.verticalTab, isActive && styles.verticalTabActive]}
            >
              <Ionicons
                name={tab.icon}
                size={20}
                color={isActive ? Colors.dark.primary : Colors.dark.textMuted}
              />
              <ThemedText
                style={[styles.verticalTabLabel, isActive && styles.verticalTabLabelActive]}
                numberOfLines={1}
              >
                {tab.name}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderQuickContacts = () => {
    return null;
  };

  const renderActivityFeed = () => (
    <View style={styles.activityFeedContainer}>
      <View style={styles.activityHeader}>
        <Ionicons name="pulse" size={16} color={Colors.dark.primary} />
        <ThemedText style={styles.activityHeaderText}>Academy Feed</ThemedText>
      </View>
      {loadingActivity ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.primary} />
        </View>
      ) : (
        <FlatList
          data={activityEvents}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const color = getActivityColor(item.type);
            const isLevelUp = item.type === "level_up" || item.type === "xp_level_up";
            return (
              <View style={[styles.activityItem, isLevelUp && styles.activityItemHighlight]}>
                <View style={[styles.activityIconWrap, { backgroundColor: color + "18", borderColor: color + "30" }]}>
                  <Ionicons name={getActivityIcon(item.type)} size={18} color={color} />
                </View>
                <View style={styles.activityContent}>
                  <View style={styles.activityTopRow}>
                    <ThemedText style={[styles.activitySender, isLevelUp && { color }]} numberOfLines={1}>
                      {item.title}
                    </ThemedText>
                    <ThemedText style={styles.activityTime}>
                      {formatRelativeTime(item.timestamp)}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.activityPreview} numberOfLines={2}>
                    {item.description}
                  </ThemedText>
                  {item.xp ? (
                    <View style={styles.activityXpBadge}>
                      <Ionicons name="flash" size={10} color={Colors.dark.xpCyan} />
                      <ThemedText style={styles.activityXpText}>+{item.xp} XP</ThemedText>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="pulse" size={36} color={Colors.dark.tabIconDefault} />
              <ThemedText style={styles.emptyText}>No recent academy activity</ThemedText>
              <ThemedText style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>
                Level ups, XP gains, and sessions will show here
              </ThemedText>
            </View>
          }
        />
      )}
    </View>
  );

  const renderWorldMessage = ({ item }: { item: WorldMessage }) => {
    const isOwn = isPlayerMode
      ? (item.senderType === "player" && item.senderPlayerId === userId)
      : (item.senderType === "coach" && item.senderCoachId === userId);

    return (
      <View style={[styles.messageBubble, isOwn ? styles.ownMessage : styles.otherMessage]}>
        {!isOwn ? (
          <View style={styles.senderInfo}>
            <View style={[styles.playerAvatar, { backgroundColor: Colors.dark.primary + "30" }]}>
              <Ionicons name="person" size={10} color={Colors.dark.primary} />
            </View>
            <ThemedText style={[styles.senderName, { color: Colors.dark.primary }]}>
              {item.senderName}
            </ThemedText>
            {item.academyName ? (
              <View style={styles.worldAcademyBadge}>
                <Ionicons name="shield-outline" size={9} color={Colors.dark.xpCyan} />
                <ThemedText style={styles.worldAcademyText}>{item.academyName}</ThemedText>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={styles.messageRow}>
          <ThemedText style={[styles.messageText, isOwn && styles.ownMessageText]}>{item.body}</ThemedText>
          <ThemedText style={[styles.timestamp, isOwn && styles.ownTimestamp]}>{formatTime(item.createdAt)}</ThemedText>
        </View>
      </View>
    );
  };

  const renderWorldChat = () => (
    <>
      <View style={styles.activityFeedContainer}>
        <View style={styles.activityHeader}>
          <Ionicons name="globe-outline" size={16} color={Colors.dark.xpCyan} />
          <ThemedText style={[styles.activityHeaderText, { color: Colors.dark.xpCyan }]}>World Chat</ThemedText>
          <View style={styles.worldOnlineBadge}>
            <View style={styles.worldOnlineDot} />
            <ThemedText style={styles.worldOnlineText}>Live</ThemedText>
          </View>
        </View>
        {loadingWorldMessages && worldMessages.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={Colors.dark.xpCyan} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={worldMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderWorldMessage}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="globe-outline" size={36} color={Colors.dark.tabIconDefault} />
                <ThemedText style={styles.emptyText}>No messages in World Chat yet</ThemedText>
                <ThemedText style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>
                  Be the first to say hello to the world!
                </ThemedText>
              </View>
            }
          />
        )}
      </View>
      <View style={styles.inputContainer}>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="Message the world..."
          placeholderTextColor={Colors.dark.textMuted}
          style={styles.input}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <Pressable
          onPress={handleSend}
          disabled={sendWorldMessageMutation.isPending}
          style={({ pressed }) => [
            styles.sendButton,
            { opacity: pressed || sendWorldMessageMutation.isPending ? 0.5 : 1 },
          ]}
        >
          <Ionicons name="send-outline" size={18} color={Colors.dark.buttonText} />
        </Pressable>
      </View>
    </>
  );

  const renderNewMessageSelector = () => (
    <View style={styles.selectorContainer}>
      <View style={styles.selectorHeader}>
        <Pressable onPress={() => setShowNewMessage(false)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.selectorTitle}>New Message</ThemedText>
      </View>
      <FlatList
        data={players}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleStartNewPlayerChat(item)}
            style={styles.conversationItem}
          >
            <View style={styles.conversationAvatar}>
              <Ionicons name="person" size={20} color={Colors.dark.text} />
            </View>
            <ThemedText style={styles.conversationName}>
              {item.name || `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Unknown Player'}
            </ThemedText>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyText}>No players found</ThemedText>
          </View>
        }
      />
    </View>
  );

  const renderSquadSelector = () => (
    <View style={styles.selectorContainer}>
      <View style={styles.selectorHeader}>
        <Pressable onPress={() => setShowSquadSelector(false)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.selectorTitle}>Select Squad</ThemedText>
      </View>
      <FlatList
        data={squads}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleStartSquadChat(item)}
            style={styles.conversationItem}
          >
            <View style={[styles.conversationAvatar, { backgroundColor: Colors.dark.primary + "30" }]}>
              <Ionicons name="fitness" size={20} color={Colors.dark.primary} />
            </View>
            <ThemedText style={styles.conversationName}>{item.name}</ThemedText>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyText}>No squads found</ThemedText>
          </View>
        }
      />
    </View>
  );

  const renderCoachSelector = () => (
    <View style={styles.selectorContainer}>
      <View style={styles.selectorHeader}>
        <Pressable onPress={() => setShowCoachSelector(false)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.selectorTitle}>Chat with Coach</ThemedText>
      </View>
      <FlatList
        data={otherCoaches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleStartCoachChat(item)}
            style={styles.conversationItem}
          >
            <View style={[styles.conversationAvatar, { backgroundColor: Colors.dark.xpCyan + "30" }]}>
              <Ionicons name="ribbon" size={20} color={Colors.dark.xpCyan} />
            </View>
            <ThemedText style={styles.conversationName}>{item.name}</ThemedText>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyText}>No other coaches found</ThemedText>
          </View>
        }
      />
    </View>
  );

  const renderConversationListContent = () => (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}>
        <ThemedText style={{ fontSize: 13, fontWeight: '700', color: Colors.dark.textSecondary }}>
          {currentTabConfig?.name || ''}
        </ThemedText>
        {(currentTab === "players" || currentTab === "coaches" || currentTab === "squad") ? (
          <Pressable
            onPress={() => {
              if (currentTab === "players") setShowNewMessage(true);
              else if (currentTab === "coaches") setShowCoachSelector(true);
              else if (currentTab === "squad") setShowSquadSelector(true);
            }}
            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.dark.primary, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="add" size={18} color={Colors.dark.buttonText} />
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={displayConversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedConversation(item)}
            style={styles.conversationItem}
          >
            <View style={styles.conversationAvatar}>
              <Ionicons name={getConvIcon(item)} size={20} color={Colors.dark.text} />
            </View>
            <View style={styles.conversationInfo}>
              <ThemedText style={styles.conversationName}>
                {getConvDisplayName(item)}
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
            <ThemedText style={styles.emptyText}>
              {currentTab === "academy" && createConversationMutation.isPending
                ? "Setting up Academy Chat..."
                : `No ${currentTabConfig?.name.toLowerCase()} chats yet`}
            </ThemedText>
            {currentTab === "academy" ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginTop: Spacing.md }} />
            ) : currentTab === "players" ? (
              <Pressable
                onPress={() => setShowNewMessage(true)}
                style={styles.startChatButton}
              >
                <Ionicons name="add" size={16} color={Colors.dark.buttonText} />
                <ThemedText style={styles.startChatButtonText}>Message a Player</ThemedText>
              </Pressable>
            ) : currentTab === "coaches" ? (
              <Pressable
                onPress={() => setShowCoachSelector(true)}
                style={styles.startChatButton}
              >
                <Ionicons name="add" size={16} color={Colors.dark.buttonText} />
                <ThemedText style={styles.startChatButtonText}>Message a Coach</ThemedText>
              </Pressable>
            ) : currentTab === "squad" ? (
              <Pressable
                onPress={() => setShowSquadSelector(true)}
                style={styles.startChatButton}
              >
                <Ionicons name="add" size={16} color={Colors.dark.buttonText} />
                <ThemedText style={styles.startChatButtonText}>Select a Squad</ThemedText>
              </Pressable>
            ) : null}
          </View>
        }
      />
    </>
  );

  const renderRightPanel = () => {
    const safetyBanner = (
      <View style={styles.safetyBanner}>
        <Ionicons name="shield-checkmark" size={14} color="#4FC3F7" />
        <ThemedText style={styles.safetyBannerText}>
          Chats are monitored. Never share personal or financial info. Beware of scams.
        </ThemedText>
      </View>
    );

    if (currentTab === "activity") {
      return <>{safetyBanner}{renderActivityFeed()}</>;
    }

    if (currentTab === "world") {
      return <>{safetyBanner}{renderWorldChat()}</>;
    }

    if (showNewMessage) return <>{safetyBanner}{renderNewMessageSelector()}</>;
    if (showSquadSelector) return <>{safetyBanner}{renderSquadSelector()}</>;
    if (showCoachSelector) return <>{safetyBanner}{renderCoachSelector()}</>;

    if (selectedConversation) {
      return (
        <>
          {currentTab !== "academy" ? (
            <View style={styles.conversationHeader}>
              <Pressable onPress={() => setSelectedConversation(null)} style={styles.backButton}>
                <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
              </Pressable>
              <ThemedText style={styles.conversationTitle}>
                {getConvDisplayName(selectedConversation)}
              </ThemedText>
            </View>
          ) : null}

          {safetyBanner}

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

          {isOtherTyping ? (
            <View style={styles.typingIndicator}>
              <View style={styles.typingDots}>
                <View style={styles.typingDot} />
                <View style={[styles.typingDot, { opacity: 0.7 }]} />
                <View style={[styles.typingDot, { opacity: 0.5 }]} />
              </View>
              <ThemedText style={styles.typingText}>typing...</ThemedText>
            </View>
          ) : null}

          <View style={styles.inputContainer}>
            {isConnected ? (
              <View style={styles.inputConnectionIndicator}>
                <View style={styles.connectionDot} />
              </View>
            ) : null}
            <TextInput
              value={inputText}
              onChangeText={handleInputChange}
              placeholder={isSampleConversation ? "Demo chat - read only" : "Type a message..."}
              placeholderTextColor={Colors.dark.textMuted}
              style={styles.input}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              editable={!isSampleConversation}
            />
            <Pressable
              onPress={handleSend}
              disabled={sendMessageMutation.isPending || isSampleConversation}
              style={({ pressed }) => [
                styles.sendButton,
                { opacity: pressed || sendMessageMutation.isPending || isSampleConversation ? 0.5 : 1 },
              ]}
            >
              <Ionicons name="send-outline" size={18} color={Colors.dark.buttonText} />
            </Pressable>
          </View>
        </>
      );
    }

    if (loadingConversations) {
      return (
        <>{safetyBanner}
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.primary} />
        </View>
        </>
      );
    }

    return (
      <>
        {safetyBanner}
        {renderConversationListContent()}
      </>
    );
  };

  return (
    <Animated.View style={[styles.container, { bottom: tabBarHeight, paddingTop: isFullscreen ? insets.top : 0 }, animatedStyle]}>
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
              <Ionicons name="chatbubble" size={18} color={Colors.dark.primary} />
              <View style={styles.connectionIndicator}>
                <View style={[styles.connectionDot, !isConnected && { backgroundColor: Colors.dark.disabled }]} />
              </View>
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
        </Pressable>
        <View style={styles.headerButtons}>
          {isExpanded ? (
            <Pressable onPress={toggleFullscreen} style={styles.fullscreenButton}>
              <Ionicons
                name={isFullscreen ? "contract-outline" : "expand-outline"}
                size={20}
                color={Colors.dark.text}
              />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              if (isFullscreen) {
                setIsFullscreen(false);
              } else {
                setIsExpanded(!isExpanded);
              }
            }}
            style={styles.chevronButton}
          >
            <Ionicons
              name={isExpanded || isFullscreen ? "chevron-down-outline" : "chevron-up-outline"}
              size={20}
              color={Colors.dark.text}
            />
          </Pressable>
        </View>
      </View>

      {isExpanded ? (
        <View style={styles.expandedContent}>
          {renderVerticalTabs()}
          <View style={styles.rightPanel}>
            {renderRightPanel()}
          </View>
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
    backgroundColor: Backgrounds.root,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    zIndex: 100,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    height: FOOTER_COLLAPSED,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    backgroundColor: Backgrounds.card,
    borderTopWidth: 2,
    borderTopColor: Colors.dark.primary + "50",
  },
  headerTouchable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  fullscreenButton: {
    padding: Spacing.xs,
  },
  chevronButton: {
    padding: Spacing.xs,
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  chatIconContainer: {
    position: "relative",
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
  },
  unreadBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: Colors.dark.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Backgrounds.root,
  },
  unreadText: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  previewText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    flex: 1,
    fontWeight: "500",
  },
  previewSender: {
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 0.5,
  },
  expandedContent: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: Backgrounds.root,
  },
  verticalTabPanel: {
    width: LEFT_PANEL_WIDTH,
    backgroundColor: Backgrounds.card,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.primary + "20",
  },
  verticalTabScroll: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  verticalTab: {
    width: LEFT_PANEL_WIDTH - 8,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  verticalTabActive: {
    backgroundColor: Colors.dark.primary + "25",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  verticalTabLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    textAlign: "center",
    fontWeight: "500",
  },
  verticalTabLabelActive: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  verticalAddButton: {
    marginTop: "auto",
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  rightPanel: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  quickContactsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.primary + "15",
    paddingVertical: Spacing.sm,
    backgroundColor: Backgrounds.card + "80",
  },
  quickContactsScroll: {
    paddingHorizontal: Spacing.sm,
    gap: Spacing.md,
  },
  quickContactItem: {
    alignItems: "center",
    width: 56,
  },
  quickContactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.primary + "30",
  },
  quickContactAvatarActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "20",
  },
  quickContactInitial: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  quickContactName: {
    fontSize: 9,
    color: Colors.dark.textSecondary,
    marginTop: 3,
    textAlign: "center",
    width: 56,
  },
  activityFeedContainer: {
    flex: 1,
  },
  activityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.primary + "20",
    backgroundColor: Backgrounds.card + "60",
  },
  activityHeaderText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.primary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  activityItem: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Backgrounds.surface + "40",
  },
  activityItemHighlight: {
    backgroundColor: Colors.dark.primary + "08",
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.primary + "60",
  },
  activityIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "25",
  },
  activityContent: {
    flex: 1,
  },
  activityTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  activitySender: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
    flex: 1,
    marginRight: Spacing.sm,
  },
  activityTime: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  activityPreview: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 16,
  },
  activityXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.xpCyan + "15",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "25",
  },
  activityXpText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
    letterSpacing: 0.5,
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
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
    marginLeft: Spacing.xs,
  },
  conversationItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    marginHorizontal: Spacing.sm,
    marginVertical: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.primary + "08",
    gap: Spacing.sm,
  },
  conversationAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  conversationInfo: {
    flex: 1,
  },
  conversationName: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  conversationPreview: {
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
    marginTop: 1,
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
    fontSize: 13,
    color: Colors.dark.tabIconDefault,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  messageBubble: {
    maxWidth: "80%",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginVertical: 2,
  },
  ownMessage: {
    alignSelf: "flex-end",
    backgroundColor: Colors.dark.primary,
    borderBottomRightRadius: 4,
    marginLeft: Spacing.xl,
  },
  otherMessage: {
    alignSelf: "flex-start",
    backgroundColor: Colors.dark.xpCyan + "12",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "25",
    marginRight: Spacing.xl,
  },
  senderInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: 3,
  },
  playerAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  senderName: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.dark.xpCyan,
    letterSpacing: 0.3,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
  },
  messageText: {
    fontSize: 13,
    color: Colors.dark.text,
    flex: 1,
    lineHeight: 18,
  },
  ownMessageText: {
    color: Colors.dark.buttonText,
  },
  timestamp: {
    fontSize: 9,
    color: Colors.dark.text,
    opacity: 0.45,
  },
  ownTimestamp: {
    color: Colors.dark.buttonText,
    opacity: 0.6,
  },
  systemMessage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    padding: Spacing.xs,
  },
  systemText: {
    fontSize: 11,
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
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  typingDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.disabled,
  },
  typingText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  connectionIndicator: {
    width: 12,
    height: 12,
    justifyContent: "center",
    alignItems: "center",
    position: "absolute",
    bottom: 0,
    right: 0,
    borderRadius: 6,
    backgroundColor: Backgrounds.root,
  },
  inputConnectionIndicator: {
    width: 12,
    height: 12,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 6,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.successNeon,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.successNeon,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
      },
    }),
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
    paddingVertical: Platform.OS === "ios" ? Spacing.sm : Spacing.xs,
    color: Colors.dark.text,
    fontSize: 13,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  selectorContainer: {
    flex: 1,
  },
  selectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  selectorTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
    marginLeft: Spacing.xs,
  },
  startChatButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  startChatButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  worldAcademyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.xpCyan + "15",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 4,
  },
  worldAcademyText: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
    letterSpacing: 0.3,
  },
  worldOnlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    backgroundColor: Colors.dark.successNeon + "15",
    borderWidth: 1,
    borderColor: Colors.dark.successNeon + "30",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  worldOnlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.successNeon,
  },
  worldOnlineText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.successNeon,
  },
  safetyBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(79, 195, 247, 0.08)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(79, 195, 247, 0.15)",
  },
  safetyBannerText: {
    fontSize: 11,
    color: "#4FC3F7",
    flex: 1,
  },
});
