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
import { useCoach } from "@/coach/context/CoachContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useWebSocket, type NewMessagePayload, type TypingPayload } from "@/lib/useWebSocket";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const FOOTER_COLLAPSED = 60;
const FOOTER_EXPANDED = Math.min(SCREEN_HEIGHT * 0.6, 450);
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

export function CoachChatFooter() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const queryClient = useQueryClient();
  const { coach } = useCoach();
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
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const height = useSharedValue(FOOTER_COLLAPSED);

  const handleNewMessage = useCallback((payload: NewMessagePayload) => {
    queryClient.invalidateQueries({ queryKey: ["/api/conversations", payload.conversationId, "messages"] });
    queryClient.invalidateQueries({ queryKey: ["/api/coaches", coach?.id, "conversations"] });
    if (selectedConversation?.id === payload.conversationId) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [queryClient, coach?.id, selectedConversation?.id]);

  const handleTyping = useCallback((payload: TypingPayload) => {
    setTypingUsers(prev => {
      const next = new Map(prev);
      const conversationTypers = next.get(payload.conversationId) || new Set();
      const userId = payload.coachId || payload.playerId;
      if (userId && userId !== coach?.id) {
        if (payload.isTyping) {
          conversationTypers.add(userId);
        } else {
          conversationTypers.delete(userId);
        }
        next.set(payload.conversationId, conversationTypers);
      }
      return next;
    });
  }, [coach?.id]);

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

  const { data: conversations = [], isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ["/api/coaches", coach?.id, "conversations"],
    enabled: !!coach?.id,
  });

  const { data: messages = [], isLoading: loadingMessages } = useQuery<Message[]>({
    queryKey: ["/api/conversations", selectedConversation?.id, "messages"],
    enabled: !!selectedConversation?.id,
    refetchInterval: isConnected ? 30000 : 5000,
  });

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/coaches", coach?.id, "unread-count"],
    enabled: !!coach?.id,
    refetchInterval: 30000,
  });

  const { data: playersData } = useQuery<Player[]>({
    queryKey: ["/api/players"],
    enabled: !!coach?.id && showNewMessage,
  });
  const players = Array.isArray(playersData) ? playersData : [];

  const { data: allCoaches = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/coaches"],
    enabled: !!coach?.id && currentTab === "coaches",
  });
  
  const otherCoaches = allCoaches.filter(c => c.id !== coach?.id);

  const { data: squads = [] } = useQuery<Squad[]>({
    queryKey: ["/api/squads"],
    enabled: !!coach?.id && (currentTab === "squad" || showSquadSelector),
  });

  const createConversationMutation = useMutation({
    mutationFn: async ({ type, playerId, title }: { type: string; playerId?: string; title?: string }): Promise<Conversation> => {
      if (!coach) throw new Error("No coach");
      const response = await apiRequest("POST", "/api/conversations", {
        type,
        playerId,
        coachId: coach.id,
        title,
      });
      return response.json();
    },
    onSuccess: (data: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaches", coach?.id, "conversations"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/coaches", coach?.id, "unread-count"] });
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

  useEffect(() => {
    const targetHeight = isFullscreen 
      ? FOOTER_FULLSCREEN 
      : isExpanded 
        ? FOOTER_EXPANDED 
        : FOOTER_COLLAPSED;
    height.value = withSpring(targetHeight, { damping: 20, stiffness: 200 });
  }, [isExpanded, isFullscreen]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  const isSampleConversation = selectedConversation?.id?.startsWith("sample-") || false;
  
  const handleSend = async () => {
    if (inputText.trim() && selectedConversation && !isSampleConversation) {
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
    
    // Reset all selector states when changing tabs
    setShowNewMessage(false);
    setShowSquadSelector(false);
    setShowCoachSelector(false);
    
    if (selectedConversation && !CHAT_TABS.find(t => t.id === tab)?.types.includes(selectedConversation.type)) {
      setSelectedConversation(null);
    }
    
    if (tab === "academy") {
      const academyConv = conversations.find(c => c.type === "academy");
      if (academyConv) {
        setSelectedConversation(academyConv);
      }
    } else {
      // Clear selection when switching to other tabs (unless staying within same type)
      if (selectedConversation?.type === "academy") {
        setSelectedConversation(null);
      }
    }
  };
  
  // Auto-select or create Academy conversation when Academy tab is active
  useEffect(() => {
    if (currentTab === "academy" && !createConversationMutation.isPending) {
      // First check if we have an academy conversation from the server
      const academyConv = conversations.find(c => c.type === "academy");
      if (academyConv) {
        if (!selectedConversation || selectedConversation.id !== academyConv.id) {
          setSelectedConversation(academyConv);
        }
      } else if (academyConvCreated) {
        // Use locally created academy conversation if backend hasn't returned it yet
        if (!selectedConversation || selectedConversation.id !== academyConvCreated.id) {
          setSelectedConversation(academyConvCreated);
        }
      } else {
        // Create academy chat if it doesn't exist
        createConversationMutation.mutate({
          type: "academy",
          title: "Academy Chat",
        });
      }
    }
  }, [currentTab, conversations, selectedConversation, createConversationMutation.isPending, academyConvCreated]);

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

  const handleStartNewPlayerChat = (player: Player) => {
    const existingConv = conversations.find(c => c.playerId === player.id);
    if (existingConv) {
      setSelectedConversation(existingConv);
      setShowNewMessage(false);
    } else {
      createConversationMutation.mutate({
        type: "coach_player",
        playerId: player.id,
        title: `${player.firstName} ${player.lastName}`,
      });
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
            <View style={[styles.conversationAvatar, { backgroundColor: "#00D4FF30" }]}>
              <Ionicons name="ribbon" size={20} color="#00D4FF" />
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

  const renderTabBar = () => (
    <View style={styles.tabBarContainer}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
      >
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
      </ScrollView>
      {currentTab === "players" || currentTab === "coaches" || currentTab === "squad" ? (
        <Pressable 
          onPress={() => {
            if (currentTab === "players") setShowNewMessage(true);
            else if (currentTab === "coaches") setShowCoachSelector(true);
            else if (currentTab === "squad") setShowSquadSelector(true);
          }} 
          style={styles.addButton}
        >
          <Ionicons name="add" size={20} color={Colors.dark.backgroundRoot} />
        </Pressable>
      ) : null}
    </View>
  );

  const handleCreateAcademyChat = () => {
    createConversationMutation.mutate({
      type: "academy",
      title: "Academy Chat",
    });
  };

  const renderConversationListContent = () => (
    <>
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

  return (
    <Animated.View style={[styles.container, { bottom: tabBarHeight + insets.bottom }, animatedStyle]}>
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
          {renderTabBar()}
          
          {showNewMessage ? (
            renderNewMessageSelector()
          ) : showSquadSelector ? (
            renderSquadSelector()
          ) : showCoachSelector ? (
            renderCoachSelector()
          ) : selectedConversation ? (
            <>
              {currentTab !== "academy" ? (
                <View style={styles.conversationHeader}>
                  <Pressable onPress={() => setSelectedConversation(null)} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
                  </Pressable>
                  <ThemedText style={styles.conversationTitle}>
                    {selectedConversation.playerName || selectedConversation.title || "Chat"}
                  </ThemedText>
                </View>
              ) : null}

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
                  <View style={styles.connectionIndicator}>
                    <View style={styles.connectionDot} />
                  </View>
                ) : null}
                <TextInput
                  value={inputText}
                  onChangeText={handleInputChange}
                  placeholder={isSampleConversation ? "Demo chat - read only" : "Type a message..."}
                  placeholderTextColor={Colors.dark.disabled}
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
                  <Ionicons name="send-outline" size={20} color={Colors.dark.buttonText} />
                </Pressable>
              </View>
            </>
          ) : loadingConversations ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={Colors.dark.primary} />
            </View>
          ) : (
            renderConversationListContent()
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
    borderTopColor: `${Colors.dark.primary}40`,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    zIndex: 100,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
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
    backgroundColor: `${Colors.dark.primary}08`,
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
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  chatIconContainer: {
    position: "relative",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: Colors.dark.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundDefault,
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
  tabBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.dark.primary}20`,
    paddingBottom: Spacing.sm,
    paddingTop: Spacing.xs,
    backgroundColor: `${Colors.dark.backgroundSecondary}80`,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
    flex: 1,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: "transparent",
  },
  tabActive: {
    backgroundColor: `${Colors.dark.primary}25`,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}40`,
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
    marginHorizontal: Spacing.sm,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.dark.primary}08`,
    gap: Spacing.md,
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
    maxWidth: "80%",
    padding: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginVertical: Spacing.xs,
  },
  ownMessage: {
    alignSelf: "flex-end",
    backgroundColor: Colors.dark.primary,
    borderBottomRightRadius: 4,
    marginLeft: Spacing.xl,
  },
  otherMessage: {
    alignSelf: "flex-start",
    backgroundColor: `${Colors.dark.xpCyan}15`,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: `${Colors.dark.xpCyan}30`,
    marginRight: Spacing.xl,
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
    fontSize: 12,
    color: Colors.dark.disabled,
    fontStyle: "italic",
  },
  connectionIndicator: {
    width: 8,
    height: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.successNeon,
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
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginLeft: Spacing.xs,
  },
  addButton: {
    marginRight: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.full,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  startChatButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
  },
  startChatButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
});
