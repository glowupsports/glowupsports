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
  useWindowDimensions,
  Modal,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Backgrounds, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useWebSocket, type NewMessagePayload, type TypingPayload, type OnlineStatusPayload } from "@/lib/useWebSocket";
import { useChatState } from "@/coach/context/ChatStateContext";
import { useChatStickyBottom } from "@/lib/useChatStickyBottom";

interface ChatFooterProps {
  mode?: "coach" | "player";
  onChallenge?: (opponentId: string, opponentName: string, opponentPhoto?: string) => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const FOOTER_COLLAPSED = 44;
const FOOTER_FULLSCREEN = SCREEN_HEIGHT;
const LEFT_PANEL_WIDTH = 94;

interface Message {
  id: string;
  conversationId: string;
  senderType: string | null;
  senderCoachId: string | null;
  senderPlayerId: string | null;
  senderName?: string | null;
  senderPhotoUrl?: string | null;
  senderBallLevel?: string | null;
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
  _optimistic?: true;
  _failed?: true;
  isDeleted?: boolean | null;
}

interface Conversation {
  id: string;
  type: string;
  title: string | null;
  playerId: string | null;
  coachId: string | null;
  providerId?: string | null;
  orderId?: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  playerName?: string | null;
  playerFirstName?: string | null;
  playerPhoto?: string | null;
  coachName?: string | null;
  coachPhoto?: string | null;
  providerName?: string | null;
  providerPhoto?: string | null;
  otherPlayerId?: string | null;
  otherPlayerUserId?: string | null;
  receiverPlayerId?: string | null;
  senderPlayerId?: string | null;
  isBlockedByMe?: boolean;
}

const REACTION_EMOJIS = ["🔥", "❤️", "👍", "😂"];
const DEFAULT_QUICK_PHRASES_PLAYER = ["GG 🏆", "On my way", "Nice play!", "Let's go 🔥"];
const DEFAULT_QUICK_PHRASES_COACH = ["Great job!", "Keep it up", "Let's review", "On my way"];
const MAX_QUICK_REPLIES = 8;
const QUICK_REPLY_TOOLTIP_KEY = "@glow_quick_reply_tooltip_seen";
const NEON_GREEN = "#C8FF3D";
const DARK_BUBBLE = "#1A2535";

type ChatTab = "players" | "coaches" | "academy" | "squad" | "activity" | "admin" | "world" | "providers" | "series_group";

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
  { id: "world", name: "World", icon: "globe-outline", types: ["world"] },
  { id: "academy", name: "Academy", icon: "home-outline", types: ["academy"] },
  { id: "squad", name: "Squad", icon: "fitness-outline", types: ["squad", "group", "series_group"] },
  { id: "players", name: "Players", icon: "people-outline", types: ["player_player"] },
  { id: "coaches", name: "Coaches", icon: "ribbon-outline", types: ["coach_player", "direct_message"] },
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
  senderUserId: string | null;
  body: string;
  messageType: string | null;
  createdAt: string;
  senderName: string;
  academyName: string;
  senderPhotoUrl: string | null;
  reactions: Array<{
    id: string;
    emoji: string;
    reactorType: string;
    reactorCoachId: string | null;
    reactorPlayerId: string | null;
  }>;
}

interface SenderProfile {
  senderName: string;
  senderPhotoUrl: string | null;
  senderType: string | null;
  senderCoachId: string | null;
  senderPlayerId: string | null;
  senderUserId?: string | null;
}

const TAB_BAR_HEIGHT = 85;
const CENTER_BUTTON_PROTRUSION = 8;
const CHAT_PILL_LIFT = 22;

export function CoachChatFooter({ mode = "coach", onChallenge }: ChatFooterProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && screenWidth >= 1024;
  const isSmallScreen = screenWidth < 360 || SCREEN_HEIGHT < 700;
  const footerExpandedHeight = useMemo(
    () => SCREEN_HEIGHT - TAB_BAR_HEIGHT - CENTER_BUTTON_PROTRUSION - insets.bottom - insets.top - 8,
    [insets.top, insets.bottom]
  );
  const queryClient = useQueryClient();
  const { coach } = useCoach();
  const { user } = useAuth();
  const { setChatExpanded } = useChatState();
  const navigation = useNavigation<any>();

  const isPlayerMode = mode === "player";
  const userId = isPlayerMode ? user?.playerId : coach?.id;
  const userType = isPlayerMode ? "player" : "coach";
  const CHAT_TABS = isPlayerMode ? PLAYER_CHAT_TABS : COACH_CHAT_TABS;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<ChatTab>(isPlayerMode ? "world" : "players");
  const [replyTo, setReplyTo] = useState<{ id: string; body: string; senderName: string } | null>(null);
  const [onlinePlayerIds, setOnlinePlayerIds] = useState<Set<string>>(new Set());
  const [playerLastSeenMap, setPlayerLastSeenMap] = useState<Record<string, string>>({});
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [showSquadSelector, setShowSquadSelector] = useState(false);
  const [showCoachSelector, setShowCoachSelector] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map());
  const [academyConvCreated, setAcademyConvCreated] = useState<Conversation | null>(null);
  const [safetyBannerDismissed, setSafetyBannerDismissed] = useState(false);
  const [selectedSender, setSelectedSender] = useState<SenderProfile | null>(null);
  const [blockedUserId, setBlockedUserId] = useState<string | null>(null);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [inviteState, setInviteState] = useState<"idle" | "pending" | "sent" | "error">("idle");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const pendingChallengeRef = useRef<{ opponentId: string; opponentName: string; opponentPhoto?: string } | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // P3–P7: mute map, mark-unread set, world-hype counts, quick-phrase bar, jump-to-unread, ticker rotation
  const [mutedConvMap, setMutedConvMap] = useState<Record<string, number>>({});
  const [markedUnreadSet, setMarkedUnreadSet] = useState<Set<string>>(new Set());
  const [worldHypeMap, setWorldHypeMap] = useState<Record<string, { mine: boolean; count: number }>>({});
  const [tickerIndex, setTickerIndex] = useState(0);
  const tickerFade = useSharedValue(1);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [showQuickReplyTooltip, setShowQuickReplyTooltip] = useState(false);
  const [showAddQuickReply, setShowAddQuickReply] = useState(false);
  const [editingQuickReply, setEditingQuickReply] = useState<{ id: string; body: string } | null>(null);
  const [newQuickReplyText, setNewQuickReplyText] = useState("");
  const userBackedFromConvRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem("@glow_muted_conv").then(v => {
      if (!v) return;
      try { setMutedConvMap(JSON.parse(v) || {}); } catch {}
    });
    AsyncStorage.getItem("@glow_marked_unread").then(v => {
      if (!v) return;
      try {
        const arr: string[] = JSON.parse(v) || [];
        setMarkedUnreadSet(new Set(arr));
      } catch {}
    });
    AsyncStorage.getItem("@glow_world_hype").then(v => {
      if (!v) return;
      try { setWorldHypeMap(JSON.parse(v) || {}); } catch {}
    });
  }, []);

  const persistMuted = useCallback((m: Record<string, number>) => {
    AsyncStorage.setItem("@glow_muted_conv", JSON.stringify(m)).catch(() => {});
  }, []);
  const persistMarkedUnread = useCallback((s: Set<string>) => {
    AsyncStorage.setItem("@glow_marked_unread", JSON.stringify(Array.from(s))).catch(() => {});
  }, []);
  const persistWorldHype = useCallback((m: Record<string, { mine: boolean; count: number }>) => {
    AsyncStorage.setItem("@glow_world_hype", JSON.stringify(m)).catch(() => {});
  }, []);

  const isConvMuted = useCallback((convId: string) => {
    const until = mutedConvMap[convId];
    if (!until) return false;
    if (until < Date.now()) return false;
    return true;
  }, [mutedConvMap]);

  const height = useSharedValue(FOOTER_COLLAPSED);
  const tickerOffset = useSharedValue(0);
  const leftPillWidthSV = useSharedValue(0);

  useEffect(() => {
    AsyncStorage.getItem("@glow_safety_banner_dismissed").then(val => {
      if (val === "true") setSafetyBannerDismissed(true);
    });
  }, []);

  useEffect(() => {
    if (!selectedSender) {
      setBlockedUserId(null);
      setShowBlockConfirm(false);
      setInviteState("idle");
      setInviteError(null);
      if (pendingChallengeRef.current && onChallenge) {
        const { opponentId, opponentName, opponentPhoto } = pendingChallengeRef.current;
        pendingChallengeRef.current = null;
        const timer = setTimeout(() => {
          onChallenge(opponentId, opponentName, opponentPhoto);
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [selectedSender, onChallenge]);

  const dismissSafetyBanner = useCallback(() => {
    setSafetyBannerDismissed(true);
    AsyncStorage.setItem("@glow_safety_banner_dismissed", "true");
  }, []);

  const handleNewMessage = useCallback((payload: NewMessagePayload) => {
    const msgKey = isPlayerMode
      ? ["/api/player/me/conversations", payload.conversationId, "messages"]
      : ["/api/conversations", payload.conversationId, "messages"];

    // Directly inject the incoming WS message into the cache for zero-latency display
    queryClient.setQueryData<Message[]>(msgKey, (prev = []) => {
      const already = prev.find(m => m.id === payload.message.id);
      if (already) return prev;
      const newMsg: Message = {
        id: payload.message.id,
        body: payload.message.content,
        conversationId: payload.conversationId,
        messageType: payload.message.messageType ?? "text",
        senderType: payload.message.senderType,
        senderCoachId: payload.message.senderType === "coach" ? (payload.message.senderId ?? null) : null,
        senderPlayerId: payload.message.senderType === "player" ? (payload.message.senderId ?? null) : null,
        senderName: payload.message.senderName ?? null,
        senderPhotoUrl: payload.message.senderPhotoUrl ?? null,
        senderBallLevel: payload.message.senderBallLevel ?? null,
        createdAt: payload.message.createdAt,
        reactions: [],
      };
      // Append the real message; optimistic messages for this user's sends
      // are removed individually in onSuccess by optimisticId — don't touch them here
      return [...prev, newMsg];
    });

    if (isPlayerMode) {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/unread-count"] });
    } else {
      queryClient.invalidateQueries({ queryKey: ["/api/coaches", userId, "conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coaches", userId, "unread-count"] });
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

  const handleWorldMessage = useCallback((payload: unknown) => {
    const wm = payload as WorldMessage;
    if (!wm?.id) return;
    queryClient.setQueryData<WorldMessage[]>(["/api/world-chat/messages"], (prev = []) => {
      const already = prev.find(m => m.id === wm.id);
      if (already) return prev;
      return [...prev, wm];
    });
  }, [queryClient]);

  const handleOnlineStatus = useCallback((payload: OnlineStatusPayload) => {
    if (!isPlayerMode || !payload.playerId) return;
    setOnlinePlayerIds(prev => {
      const next = new Set(prev);
      if (payload.isOnline) {
        next.add(payload.playerId!);
      } else {
        next.delete(payload.playerId!);
      }
      return next;
    });
    if (!payload.isOnline && payload.lastSeenAt) {
      setPlayerLastSeenMap(prev => ({ ...prev, [payload.playerId!]: payload.lastSeenAt! }));
    }
  }, [isPlayerMode]);

  const handleMessageDeleted = useCallback((payload: unknown) => {
    const p = payload as { conversationId: string; messageId: string };
    if (!p?.conversationId || !p?.messageId) return;
    const msgKey = isPlayerMode
      ? ["/api/player/me/conversations", p.conversationId, "messages"]
      : ["/api/conversations", p.conversationId, "messages"];
    queryClient.setQueryData<Message[]>(msgKey, (prev = []) => prev.filter(m => m.id !== p.messageId));
  }, [queryClient, isPlayerMode]);

  const handleReactionUpdated = useCallback((payload: { conversationId: string; messageId: string; reactions: unknown[] }) => {
    if (!payload?.conversationId || !payload?.messageId) return;
    const msgKey = isPlayerMode
      ? ["/api/player/me/conversations", payload.conversationId, "messages"]
      : ["/api/conversations", payload.conversationId, "messages"];
    queryClient.setQueryData<Message[]>(msgKey, (prev = []) =>
      prev.map(m => m.id === payload.messageId ? { ...m, reactions: payload.reactions as Message["reactions"] } : m)
    );
  }, [queryClient, isPlayerMode]);

  const handleNewConversation = useCallback((_payload: { conversationId: string; type: string }) => {
    // Refresh conversation list when a new DM is created (e.g. someone DMed the current user)
    const qk = isPlayerMode
      ? ["/api/player/me/conversations"]
      : ["/api/coaches", userId, "conversations"];
    queryClient.invalidateQueries({ queryKey: qk });
  }, [isPlayerMode, userId]);

  const { isConnected, sendTyping, sendReadReceipt } = useWebSocket({
    onNewMessage: handleNewMessage,
    onTyping: handleTyping,
    onOnlineStatus: handleOnlineStatus,
    onWorldMessage: handleWorldMessage,
    onNewConversation: handleNewConversation,
    onMessageDeleted: handleMessageDeleted,
    onReactionUpdated: handleReactionUpdated,
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

  const { data: rawConversations, isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: conversationsQueryKey,
    enabled: !!userId,
    // WS events invalidate on new messages; only poll as fallback when disconnected
    refetchInterval: isConnected ? false : 30000,
  });
  const conversations = Array.isArray(rawConversations) ? rawConversations : [];

  const messagesQueryKey = isPlayerMode
    ? ["/api/player/me/conversations", selectedConversation?.id, "messages"]
    : ["/api/conversations", selectedConversation?.id, "messages"];

  const CACHE_KEY = selectedConversation?.id ? `chat_messages_${selectedConversation.id}` : null;

  // Load cached messages from AsyncStorage when conversation changes, pre-populating query cache
  useEffect(() => {
    if (!CACHE_KEY || !selectedConversation?.id) return;
    AsyncStorage.getItem(CACHE_KEY).then(raw => {
      if (!raw) return;
      try {
        const cached: Message[] = JSON.parse(raw);
        if (Array.isArray(cached) && cached.length > 0) {
          queryClient.setQueryData<Message[]>(messagesQueryKey, (prev) => {
            if (prev && prev.length > 0) return prev;
            return cached;
          });
        }
      } catch {}
    });
  }, [selectedConversation?.id]);

  const { data: messages = [], isLoading: loadingMessages } = useQuery<Message[]>({
    queryKey: messagesQueryKey,
    enabled: !!selectedConversation?.id,
    refetchInterval: isConnected ? false : 30000,
  });

  // Persist last 50 messages to AsyncStorage whenever data updates
  useEffect(() => {
    if (!CACHE_KEY || messages.length === 0) return;
    const toCache = messages.slice(-50);
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(toCache)).catch(() => {});
  }, [messages, CACHE_KEY]);

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
    queryKey: ["/api/coaches?scope=academy"],
    enabled: !!userId && currentTab === "coaches",
  });

  const otherCoaches = isPlayerMode ? allCoaches : allCoaches.filter(c => c.id !== coach?.id);

  const { data: squads = [] } = useQuery<Squad[]>({
    queryKey: ["/api/squads"],
    enabled: !!userId && (currentTab === "squad" || showSquadSelector),
  });

  const createConversationMutation = useMutation({
    mutationFn: async ({ type, playerId, otherPlayerId, title, otherCoachId, coachId, squadId }: { type: string; playerId?: string; otherPlayerId?: string; title?: string; otherCoachId?: string; coachId?: string; squadId?: string }): Promise<Conversation> => {
      if (!userId) throw new Error("No user");
      if (isPlayerMode) {
        const payload: Record<string, string | undefined> = { type, title, otherPlayerId, coachId, squadId };
        const response = await apiRequest("POST", "/api/player/me/conversations", payload);
        return response.json();
      } else {
        const payload: Record<string, string | undefined> = { type, title, coachId: userId, playerId, otherCoachId };
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
    mutationFn: async ({ body, optimisticId }: { body: string; optimisticId: string }) => {
      if (!selectedConversation || !userId) return;
      if (isPlayerMode) {
        const res = await apiRequest("POST", `/api/player/me/conversations/${selectedConversation.id}/messages`, {
          body,
          messageType: "text",
        });
        return res.json();
      } else {
        const res = await apiRequest("POST", `/api/conversations/${selectedConversation.id}/messages`, {
          senderType: userType,
          senderCoachId: userId,
          body,
          messageType: "text",
        });
        return res.json();
      }
    },
    onMutate: async ({ body, optimisticId }) => {
      await queryClient.cancelQueries({ queryKey: messagesQueryKey });
      const prev = queryClient.getQueryData<Message[]>(messagesQueryKey) ?? [];
      const now = new Date().toISOString();
      const optimistic: Message = {
        id: optimisticId,
        body,
        conversationId: selectedConversation?.id ?? "",
        messageType: "text",
        senderType: isPlayerMode ? "player" : "coach",
        senderCoachId: isPlayerMode ? null : userId ?? null,
        senderPlayerId: isPlayerMode ? userId ?? null : null,
        senderName: null,
        createdAt: now,
        reactions: [],
        _optimistic: true,
      };
      queryClient.setQueryData<Message[]>(messagesQueryKey, [...prev, optimistic]);
      return { prev };
    },
    onSuccess: (_data, { optimisticId }) => {
      // Remove the specific optimistic placeholder; real message arrives via WS inject
      queryClient.setQueryData<Message[]>(messagesQueryKey, (prev = []) =>
        prev.filter(m => m.id !== optimisticId)
      );
      // Only refetch messages when WS is offline (WS injects confirmed message when connected)
      if (!isConnected) {
        queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      }
      queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
      queryClient.invalidateQueries({ queryKey: unreadQueryKey });
    },
    onError: (_err, { optimisticId }) => {
      // Mark the specific optimistic message as failed so user can see and retry
      queryClient.setQueryData<Message[]>(messagesQueryKey, (prev = []) =>
        prev.map(m => m.id === optimisticId ? { ...m, _optimistic: undefined, _failed: true as const } : m)
      );
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

  const removeReactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!userId) return;
      if (isPlayerMode) {
        return apiRequest("DELETE", `/api/player/me/messages/${messageId}/reactions`, { emoji });
      } else {
        return apiRequest("DELETE", `/api/messages/${messageId}/reactions`, {
          reactorType: userType,
          reactorId: userId,
          emoji,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return apiRequest("DELETE", `/api/me/messages/${messageId}`);
    },
    onMutate: async (messageId: string) => {
      await queryClient.cancelQueries({ queryKey: messagesQueryKey });
      const prev = queryClient.getQueryData<Message[]>(messagesQueryKey) ?? [];
      queryClient.setQueryData<Message[]>(messagesQueryKey, prev.filter(m => m.id !== messageId));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(messagesQueryKey, ctx.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    },
  });

  type QuickReply = { id: string; body: string; sortOrder: number };
  const { data: customQuickReplies = [] } = useQuery<QuickReply[]>({
    queryKey: ["/api/me/quick-replies"],
    enabled: !!userId,
  });

  type ChatOnboardingStatus = { seen: boolean; seenAt: string | null };
  const { data: onboardingStatus } = useQuery<ChatOnboardingStatus>({
    queryKey: ["/api/me/chat-onboarding"],
    enabled: !!userId,
  });
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingDismissedLocal, setOnboardingDismissedLocal] = useState(false);
  const markOnboardingSeenMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/me/chat-onboarding/seen", {});
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me/chat-onboarding"] }),
  });
  const showOnboardingOverlay =
    !!userId &&
    (isExpanded || isFullscreen) &&
    onboardingStatus?.seen === false &&
    !onboardingDismissedLocal;
  const dismissOnboarding = useCallback(() => {
    setOnboardingDismissedLocal(true);
    markOnboardingSeenMutation.mutate();
  }, [markOnboardingSeenMutation]);

  const createQuickReplyMutation = useMutation({
    mutationFn: async (body: string) => {
      const r = await apiRequest("POST", "/api/me/quick-replies", { body });
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me/quick-replies"] }),
  });

  const updateQuickReplyMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const r = await apiRequest("PUT", `/api/me/quick-replies/${id}`, { body });
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me/quick-replies"] }),
  });

  const deleteQuickReplyMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/me/quick-replies/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me/quick-replies"] }),
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      return apiRequest("DELETE", `/api/player/me/conversations/${conversationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
      setSelectedConversation(null);
    },
  });

  const blockMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      return apiRequest("POST", `/api/social/users/${targetUserId}/block`, {});
    },
    onSuccess: (_data, targetUserId) => {
      setBlockedUserId(targetUserId);
      queryClient.invalidateQueries({ queryKey: ["/api/social/users", targetUserId, "block"] });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      return apiRequest("DELETE", `/api/social/users/${targetUserId}/block`);
    },
    onSuccess: (_data, targetUserId) => {
      setBlockedUserId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/social/users", targetUserId, "block"] });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (conversation: Conversation) => {
      if (!userId || conversation.id?.startsWith("sample-")) return;
      if (isPlayerMode) {
        return apiRequest("POST", `/api/player/me/conversations/${conversation.id}/read`, {});
      } else {
        return apiRequest("POST", `/api/conversations/${conversation.id}/read`, {
          participantType: "coach",
          participantId: userId,
        });
      }
    },
    onSuccess: () => {
      if (isPlayerMode) {
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/unread-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/coaches", userId, "unread-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/coaches", userId, "conversations"] });
      }
    },
    onError: (error) => {
      console.error("Failed to mark conversation as read:", error);
    },
  });

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    setSelectedConversation(conversation);
    markAsReadMutation.mutate(conversation);
  }, [markAsReadMutation]);

  const senderUserIdForBlockCheck = selectedSender?.senderUserId ?? null;
  const { data: blockStatusData } = useQuery<{ isBlocked: boolean }>({
    queryKey: ["/api/social/users", senderUserIdForBlockCheck, "block"],
    enabled: !!senderUserIdForBlockCheck && isPlayerMode,
  });

  useEffect(() => {
    if (senderUserIdForBlockCheck && blockStatusData?.isBlocked) {
      setBlockedUserId(senderUserIdForBlockCheck);
    } else if (senderUserIdForBlockCheck && blockStatusData?.isBlocked === false) {
      setBlockedUserId(prev => prev === senderUserIdForBlockCheck ? null : prev);
    }
  }, [blockStatusData, senderUserIdForBlockCheck]);

  useEffect(() => {
    const safeFullscreenHeight = isDesktopWeb
      ? FOOTER_FULLSCREEN
      : SCREEN_HEIGHT - TAB_BAR_HEIGHT - insets.top;
    const targetHeight = isFullscreen
      ? safeFullscreenHeight
      : isExpanded
        ? footerExpandedHeight
        : FOOTER_COLLAPSED;
    height.value = withSpring(targetHeight, { damping: 20, stiffness: 200 });
  }, [isExpanded, isFullscreen, isDesktopWeb, insets.top, footerExpandedHeight]);

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
      setTimeout(() => worldStick.scrollToBottom(true), 100);
      return;
    }
    if (selectedConversation && !isSampleConversation) {
      const body = replyTo
        ? `↩ ${replyTo.senderName}: "${replyTo.body}"\n\n${inputText.trim()}`
        : inputText.trim();
      const optimisticId = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      sendMessageMutation.mutate({ body, optimisticId });
      setInputText("");
      setReplyTo(null);
      setTimeout(() => convStick.scrollToBottom(true), 100);
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
  // Note: lessonGroupChats is merged into displayConversations below (defined after hook calls)
  const latestConversation = conversations.find(c => c.lastMessagePreview) || conversations[0];
  const unreadCount = unreadData?.unreadCount || 0;

  const tickerContent = useMemo(() => {
    const items = conversations
      .filter(c => c.lastMessagePreview)
      .slice(0, 6)
      .map(c => {
        const name = c.title || c.playerName || c.coachName || (c.playerId ? "Player" : c.coachId ? "Coach" : "Chat");
        return `${name}: ${c.lastMessagePreview}`;
      });
    if (items.length === 0) return "Glow Chat — tap to open";
    return items.join("   •   ");
  }, [conversations]);

  // Player-mode ticker items (one discrete message preview at a time, rotates every 3.5s)
  const tickerItems = useMemo(() => {
    return conversations
      .filter(c => c.lastMessagePreview)
      .slice(0, 8)
      .map(c => ({
        id: c.id,
        name: c.title || c.playerName || c.coachName || (c.playerId ? "Player" : c.coachId ? "Coach" : "Chat"),
        preview: c.lastMessagePreview || "",
        photo: c.playerPhoto || c.coachPhoto || c.providerPhoto || null,
      }));
  }, [conversations]);

  // Rotate ticker in player mode every ~3.5s with a fade-swap
  useEffect(() => {
    if (!isPlayerMode || isExpanded || isFullscreen) return;
    if (tickerItems.length <= 1) return;
    const interval = setInterval(() => {
      tickerFade.value = withTiming(0, { duration: 220 }, () => {});
      setTimeout(() => {
        setTickerIndex(i => (i + 1) % Math.max(1, tickerItems.length));
        tickerFade.value = withTiming(1, { duration: 220 });
      }, 230);
    }, 3500);
    return () => clearInterval(interval);
  }, [isPlayerMode, isExpanded, isFullscreen, tickerItems.length]);

  // Keep tickerIndex in range when items change
  useEffect(() => {
    if (tickerIndex >= tickerItems.length && tickerItems.length > 0) {
      setTickerIndex(0);
    }
  }, [tickerItems.length, tickerIndex]);

  const tickerFadeStyle = useAnimatedStyle(() => ({ opacity: tickerFade.value }));

  const TICKER_SEP = "               •               ";

  const repeatedContent = useMemo(() => {
    return tickerContent + TICKER_SEP + tickerContent;
  }, [tickerContent]);

  useEffect(() => {
    if (!tickerContent || isExpanded || isFullscreen) {
      tickerOffset.value = 0;
      return;
    }
    const charWidth = 7.8;
    const singleWidth = (tickerContent.length + TICKER_SEP.length) * charWidth;
    tickerOffset.value = -singleWidth;
    tickerOffset.value = withDelay(
      1500,
      withRepeat(
        withTiming(0, { duration: singleWidth * 55, easing: Easing.linear }),
        -1,
        false
      )
    );
  }, [tickerContent, isExpanded, isFullscreen]);

  const rightTickerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tickerOffset.value }],
  }));

  const leftTickerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tickerOffset.value }],
  }));

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
    // WS push provides real-time updates; only poll when disconnected as fallback
    refetchInterval: isConnected ? false : 30000,
  });

  const addWorldReactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (isPlayerMode) {
        return apiRequest("POST", `/api/player/me/messages/${messageId}/reactions`, { emoji });
      }
      return apiRequest("POST", `/api/messages/${messageId}/reactions`, {
        reactorType: userType,
        reactorCoachId: userId,
        emoji,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world-chat/messages"] });
    },
  });

  const removeWorldReactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (isPlayerMode) {
        return apiRequest("DELETE", `/api/player/me/messages/${messageId}/reactions`, { emoji });
      }
      return apiRequest("DELETE", `/api/messages/${messageId}/reactions`, {
        reactorType: userType,
        reactorId: userId,
        emoji,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/world-chat/messages"] });
    },
  });

  const { data: lessonGroupChats = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/player/me/lesson-group-chats"],
    enabled: isPlayerMode && currentTab === "squad",
    refetchInterval: false,
  });

  const displayConversations = currentTab === "squad" && isPlayerMode
    ? [...filteredConversations, ...lessonGroupChats.filter(lgc => !filteredConversations.find(c => c.id === lgc.id))]
    : filteredConversations;

  // Initial fetch of online players on mount; WS events keep this up to date in real-time
  useEffect(() => {
    if (!isPlayerMode) return;
    apiRequest("GET", "/api/player/me/online-players")
      .then(res => res.json())
      .then(data => {
        if (data?.onlinePlayerIds) setOnlinePlayerIds(new Set(data.onlinePlayerIds));
        // Seed lastSeenAt for recently offline players from presence map
        if (data?.presence && typeof data.presence === "object") {
          const seen: Record<string, string> = {};
          Object.entries(data.presence as Record<string, { isOnline: boolean; lastSeenAt?: string }>).forEach(([pid, info]) => {
            if (!info.isOnline && info.lastSeenAt) seen[pid] = info.lastSeenAt;
          });
          if (Object.keys(seen).length > 0) setPlayerLastSeenMap(prev => ({ ...prev, ...seen }));
        }
      })
      .catch(() => {});
  }, [isPlayerMode]);

  const sendWorldMessageMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", "/api/world-chat/messages", {
        body,
        messageType: "text",
      });
      return res.json();
    },
    onSuccess: (newMessage: WorldMessage) => {
      // Deduplication: WS world_message event may have already injected this message
      queryClient.setQueryData<WorldMessage[]>(["/api/world-chat/messages"], (prev = []) => {
        if (prev.find(m => m.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
      // Only refetch as fallback when WS is not connected
      if (!isConnected) {
        queryClient.invalidateQueries({ queryKey: ["/api/world-chat/messages"] });
      }
    },
  });

  const handleTabChange = (tab: ChatTab) => {
    Keyboard.dismiss();
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
        handleSelectConversation(academyConv);
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
          handleSelectConversation(academyConv);
        }
      } else if (academyConvCreated) {
        if (!selectedConversation || selectedConversation.id !== academyConvCreated.id) {
          handleSelectConversation(academyConvCreated);
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
    if (currentTab === "squad" && isPlayerMode) {
      if (userBackedFromConvRef.current) return;
      const squadConv = conversations.find(c => c.type === "squad" || c.type === "group");
      if (squadConv && (!selectedConversation || selectedConversation.id !== squadConv.id)) {
        handleSelectConversation(squadConv);
      }
    }
  }, [currentTab, conversations, selectedConversation, isPlayerMode]);

  useEffect(() => {
    userBackedFromConvRef.current = false;
  }, [currentTab]);

  const renderMessage = ({ item }: { item: Message & { _showAvatar?: boolean; _showTimestamp?: boolean } }) => {
    const showAvatar = item._showAvatar !== false;
    const showTimestamp = item._showTimestamp !== false;
    const isProviderConv = selectedConversation?.type === "provider_player";
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

    if (item.messageType === "video_feedback") {
      let parsed: { feedbackId?: string; title?: string; annotations?: any[] } = {};
      try { parsed = JSON.parse(item.body); } catch {}
      const annotationCount = parsed.annotations?.length ?? 0;
      return (
        <Pressable
          style={[styles.messageBubble, isOwn ? styles.ownMessage : styles.otherMessage]}
          onPress={() => {
            if (parsed.feedbackId) {
              if (isPlayerMode) {
                navigation.navigate("VideoFeedbackPlayer", { feedbackId: parsed.feedbackId });
              } else {
                navigation.navigate("VideoFeedback");
              }
            }
          }}
        >
          {!isOwn ? (
            <View style={styles.senderInfo}>
              <View style={styles.playerAvatar}>
                <Ionicons name="person" size={10} color={Colors.dark.text} />
              </View>
              <ThemedText style={styles.senderName}>
                {isProviderConv
                  ? (selectedConversation?.providerName || "Provider")
                  : (selectedConversation?.playerName || "Player")}
              </ThemedText>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
            <View style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: "#1a3a5c", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="videocam" size={16} color="#4DA3FF" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.messageText, isOwn && styles.ownMessageText, { fontWeight: "600" }]} numberOfLines={1}>
                {parsed.title || "Video Feedback"}
              </ThemedText>
              {annotationCount > 0 ? (
                <ThemedText style={{ fontSize: 11, color: GlowColors.primary, marginTop: 2 }}>
                  {annotationCount} coach note{annotationCount !== 1 ? "s" : ""}
                </ThemedText>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={14} color={Colors.dark.textSecondary} />
          </View>
          <ThemedText style={[styles.timestamp, isOwn && styles.ownTimestamp]}>{formatTime(item.createdAt)}</ThemedText>
        </Pressable>
      );
    }

    const senderName = isOwn ? "You" : (
      isProviderConv
        ? (selectedConversation?.providerName || "Provider")
        : (selectedConversation?.playerName || selectedConversation?.playerFirstName || item.senderName || "Player")
    );
    const senderPhoto = !isOwn ? (selectedConversation?.playerPhoto || null) : null;

    const reactionGroups = item.reactions.reduce((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const isPending = item._optimistic === true;
    const isFailed = item._failed === true;

    // Pending and failed message indicators
    if (isFailed) {
      return (
        <View style={[styles.messageBubble, isOwn ? styles.ownMessage : styles.otherMessage, { borderWidth: 1, borderColor: "#FF4444", opacity: 0.9, flexDirection: "row", alignItems: "center", gap: 8 }]}>
          <ThemedText style={[styles.messageText, isOwn && styles.ownMessageText]}>{item.body}</ThemedText>
          <Pressable
            onPress={() => {
              const body = item.body;
              const optimisticId = `retry_${item.id}_${Date.now()}`;
              // Remove the failed message first, then re-send
              queryClient.setQueryData<Message[]>(messagesQueryKey, (prev = []) => prev.filter(m => m.id !== item.id));
              sendMessageMutation.mutate({ body, optimisticId });
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FF444422", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 }}
          >
            <Ionicons name="refresh-outline" size={12} color="#FF4444" />
            <ThemedText style={{ fontSize: 10, color: "#FF4444" }}>Retry</ThemedText>
          </Pressable>
        </View>
      );
    }

    return (
      <Pressable
        onLongPress={() => {
          if (!isPending) setShowReactions(showReactions === item.id ? null : item.id);
        }}
        onPress={() => {
          if (showReactions) setShowReactions(null);
        }}
        style={[
          styles.messageBubble,
          isOwn ? styles.ownMessage : styles.otherMessage,
          isPlayerMode && {
            backgroundColor: isOwn ? NEON_GREEN : DARK_BUBBLE,
            borderRadius: 18,
            paddingHorizontal: 14,
            paddingVertical: 10,
            marginVertical: 2,
            maxWidth: "78%",
          },
          !showAvatar && { marginTop: 1 },
          item.reactions.length >= 5 && styles.viralGlow,
          isPending && { opacity: 0.6 },
        ]}
      >
        {showAvatar && !isOwn && isPlayerMode ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            {senderPhoto ? (
              <Image
                source={{ uri: senderPhoto }}
                style={{ width: 24, height: 24, borderRadius: 12, marginRight: 6 }}
              />
            ) : (
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#2A3550", alignItems: "center", justifyContent: "center", marginRight: 6 }}>
                <Ionicons name="person" size={12} color={Colors.dark.textMuted} />
              </View>
            )}
            <ThemedText style={[styles.senderName, { color: NEON_GREEN + "CC", fontSize: 11 }]}>{senderName}</ThemedText>
          </View>
        ) : showAvatar && !isOwn ? (
          <View style={styles.senderInfo}>
            <View style={styles.playerAvatar}>
              <Ionicons name="person" size={10} color={Colors.dark.text} />
            </View>
            <ThemedText style={styles.senderName}>{senderName}</ThemedText>
          </View>
        ) : null}

        <View style={styles.messageRow}>
          <ThemedText style={[
            styles.messageText,
            isOwn && styles.ownMessageText,
            isPlayerMode && isOwn && { color: "#000000" },
            isPlayerMode && !isOwn && { color: "#FFFFFF" },
          ]}>
            {item.body}
          </ThemedText>
          {isPending ? (
            <Ionicons name="time-outline" size={11} color={isPlayerMode ? "#00000055" : Colors.dark.textMuted} style={{ marginLeft: 4 }} />
          ) : showTimestamp ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <ThemedText style={[styles.timestamp, isOwn && styles.ownTimestamp, isPlayerMode && { color: isOwn ? "#00000066" : "#FFFFFF66" }]}>
                {formatTime(item.createdAt)}
              </ThemedText>
              {isOwn && (
                <Ionicons name="checkmark-done-outline" size={11} color={isPlayerMode ? "#00000055" : Colors.dark.textMuted} />
              )}
            </View>
          ) : null}
        </View>

        {Object.keys(reactionGroups).length > 0 ? (
          <View style={styles.reactions}>
            {Object.entries(reactionGroups).map(([emoji, count]) => {
              const myReaction = isPlayerMode
                ? item.reactions.find(r => r.emoji === emoji && r.reactorPlayerId === userId)
                : item.reactions.find(r => r.emoji === emoji && r.reactorCoachId === userId);
              return (
                <Pressable
                  key={emoji}
                  style={[styles.reactionBadge, myReaction ? { backgroundColor: NEON_GREEN + "30", borderColor: NEON_GREEN + "60" } : undefined]}
                  onPress={() => {
                    if (myReaction) {
                      removeReactionMutation.mutate({ messageId: item.id, emoji });
                    } else {
                      addReactionMutation.mutate({ messageId: item.id, emoji });
                    }
                  }}
                >
                  <ThemedText style={{ fontSize: 13 }}>{emoji}</ThemedText>
                  <ThemedText style={[styles.reactionCount, myReaction ? { color: NEON_GREEN } : undefined]}>{count}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {showReactions === item.id ? (
          <View style={[styles.reactionPicker, { flexDirection: "row", flexWrap: "wrap" }]}>
            {REACTION_EMOJIS.map((emoji) => {
              const myReaction = isPlayerMode
                ? item.reactions.find(r => r.emoji === emoji && r.reactorPlayerId === userId)
                : item.reactions.find(r => r.emoji === emoji && r.reactorCoachId === userId);
              return (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    if (myReaction) {
                      removeReactionMutation.mutate({ messageId: item.id, emoji });
                    } else {
                      addReactionMutation.mutate({ messageId: item.id, emoji });
                    }
                    setShowReactions(null);
                  }}
                  style={[styles.reactionOption, myReaction ? { backgroundColor: NEON_GREEN + "30" } : undefined]}
                >
                  <ThemedText style={{ fontSize: 20 }}>{emoji}</ThemedText>
                </Pressable>
              );
            })}
            <Pressable
              style={[styles.reactionOption]}
              onPress={() => {
                setReplyTo({ id: item.id, body: item.body.slice(0, 80), senderName: senderName });
                setShowReactions(null);
              }}
            >
              <Ionicons name="arrow-undo-outline" size={18} color={Colors.dark.textMuted} />
            </Pressable>
            {isOwn ? (
              <Pressable
                style={[styles.reactionOption]}
                onPress={() => {
                  Alert.alert(
                    "Delete message",
                    "This will delete the message for everyone. Continue?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => {
                          deleteMessageMutation.mutate(item.id);
                          setShowReactions(null);
                        },
                      },
                    ],
                  );
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    );
  };

  const formatDateSeparator = (d: Date): string => {
    const now = new Date();
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: now.getFullYear() === d.getFullYear() ? undefined : "numeric" });
  };

  type MessageRow =
    | { _rowType: "date"; id: string; label: string }
    | ({ _rowType: "msg"; _showAvatar: boolean; _showTimestamp: boolean } & Message);

  const visibleMessages = useMemo(() => messages.filter(m => !m.isDeleted), [messages]);

  const messageRows = useMemo<MessageRow[]>(() => {
    const rows: MessageRow[] = [];
    let lastDayKey = "";
    const sameSender = (a: Message, b: Message) =>
      a.senderType === b.senderType &&
      (a.senderCoachId ?? null) === (b.senderCoachId ?? null) &&
      (a.senderPlayerId ?? null) === (b.senderPlayerId ?? null);
    for (let i = 0; i < visibleMessages.length; i++) {
      const m = visibleMessages[i];
      const d = new Date(m.createdAt);
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (dayKey !== lastDayKey) {
        rows.push({ _rowType: "date", id: `sep-${dayKey}-${m.id}`, label: formatDateSeparator(d) });
        lastDayKey = dayKey;
      }
      const prev = i > 0 ? visibleMessages[i - 1] : null;
      const next = i < visibleMessages.length - 1 ? visibleMessages[i + 1] : null;
      const prevSameDay = prev ? (() => {
        const pd = new Date(prev.createdAt);
        return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth() && pd.getDate() === d.getDate();
      })() : false;
      const nextSameDay = next ? (() => {
        const nd = new Date(next.createdAt);
        return nd.getFullYear() === d.getFullYear() && nd.getMonth() === d.getMonth() && nd.getDate() === d.getDate();
      })() : false;
      const showAvatar = !prev || !prevSameDay || !sameSender(prev, m);
      const showTimestamp = !next || !nextSameDay || !sameSender(next, m) ||
        (new Date(next.createdAt).getTime() - d.getTime()) > 5 * 60 * 1000;
      rows.push({ ...m, _rowType: "msg", _showAvatar: showAvatar, _showTimestamp: showTimestamp });
    }
    return rows;
  }, [messages]);

  const convStick = useChatStickyBottom<MessageRow>({
    itemCount: messageRows.length,
    resetKey: selectedConversation?.id ?? null,
  });
  const worldStick = useChatStickyBottom<WorldMessage>({
    itemCount: worldMessages.length,
    resetKey: currentTab === "world" ? "world" : null,
  });

  const renderMessageRow = ({ item }: { item: MessageRow }) => {
    if (item._rowType === "date") {
      return (
        <View style={styles.dateSeparator}>
          <ThemedText style={styles.dateSeparatorText}>{item.label}</ThemedText>
        </View>
      );
    }
    return renderMessage({ item });
  };

  const DEFAULT_QUICK_PHRASES = isPlayerMode ? DEFAULT_QUICK_PHRASES_PLAYER : DEFAULT_QUICK_PHRASES_COACH;
  const quickPhraseList: Array<{ id?: string; body: string; isCustom: boolean }> = [
    ...DEFAULT_QUICK_PHRASES.map(p => ({ body: p, isCustom: false })),
    ...customQuickReplies.map(q => ({ id: q.id, body: q.body, isCustom: true })),
  ].slice(0, MAX_QUICK_REPLIES);
  const totalChips = DEFAULT_QUICK_PHRASES.length + customQuickReplies.length;
  const canAddMoreQuickReplies = totalChips < MAX_QUICK_REPLIES;

  useEffect(() => {
    AsyncStorage.getItem(QUICK_REPLY_TOOLTIP_KEY).then(v => {
      if (v !== "true" && customQuickReplies.length === 0) {
        setShowQuickReplyTooltip(true);
      }
    });
  }, [customQuickReplies.length]);

  const dismissQuickReplyTooltip = useCallback(() => {
    setShowQuickReplyTooltip(prev => {
      if (prev) {
        AsyncStorage.setItem(QUICK_REPLY_TOOLTIP_KEY, "true");
      }
      return false;
    });
  }, []);

  const handleConvLongPress = (conv: Conversation) => {
    const name = getConvDisplayName(conv);
    const muteOpt = (hours: number) => ({
      text: `Mute ${hours}h`,
      onPress: () => {
        setMutedConvMap(prev => {
          const next = { ...prev, [conv.id]: Date.now() + hours * 3600 * 1000 };
          persistMuted(next);
          return next;
        });
      },
    });
    const unmuteOpt = {
      text: "Unmute",
      onPress: () => {
        setMutedConvMap(prev => {
          const next = { ...prev };
          delete next[conv.id];
          persistMuted(next);
          return next;
        });
      },
    };
    const markUnreadOpt = {
      text: markedUnreadSet.has(conv.id) ? "Mark read" : "Mark unread",
      onPress: () => {
        setMarkedUnreadSet(prev => {
          const next = new Set(prev);
          if (next.has(conv.id)) next.delete(conv.id); else next.add(conv.id);
          persistMarkedUnread(next);
          return next;
        });
      },
    };
    type AlertOpt = { text: string; style?: "default" | "cancel" | "destructive"; onPress?: () => void };
    const opts: AlertOpt[] = [];
    if (isConvMuted(conv.id)) {
      opts.push(unmuteOpt);
    } else {
      opts.push(muteOpt(1), muteOpt(8), muteOpt(24));
    }
    opts.push(markUnreadOpt);
    if (isPlayerMode && conv.type === "player_player") {
      opts.push({
        text: "Delete",
        style: "destructive",
        onPress: () => deleteConversationMutation.mutate(conv.id),
      });
    }
    opts.push({ text: "Cancel", style: "cancel" });
    Alert.alert(name, "Conversation options", opts);
  };

  const handleStartNewPlayerChat = (player: Player) => {
    const playerName = player.name || `${player.firstName || ''} ${player.lastName || ''}`.trim() || 'Player';
    if (isPlayerMode) {
      const existingConv = conversations.find(c =>
        c.type === "player_player" && c.title?.includes(playerName)
      );
      if (existingConv) {
        handleSelectConversation(existingConv);
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
        handleSelectConversation(existingConv);
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
    const existingConv = conversations.find(
      c => c.type === "squad" && (c.title === squad.id || c.title === squad.name)
    );
    if (existingConv) {
      handleSelectConversation(existingConv);
      setShowSquadSelector(false);
    } else {
      createConversationMutation.mutate({
        type: "squad",
        title: squad.name,
        squadId: squad.id,
      });
    }
  };

  const handleStartCoachChat = (otherCoach: { id: string; name: string }) => {
    if (isPlayerMode) {
      const existingConv = conversations.find(c => c.type === "coach_player" && c.coachId === otherCoach.id);
      if (existingConv) {
        handleSelectConversation(existingConv);
        setShowCoachSelector(false);
      } else {
        createConversationMutation.mutate({
          type: "coach_player",
          coachId: otherCoach.id,
        });
      }
    } else {
      const existingConv = conversations.find(c => c.title === otherCoach.name && c.type === "coach_coach");
      if (existingConv) {
        handleSelectConversation(existingConv);
        setShowCoachSelector(false);
      } else {
        createConversationMutation.mutate({
          type: "coach_coach",
          title: otherCoach.name,
          otherCoachId: otherCoach.id,
        });
      }
    }
  };

  const handleCreateAcademyChat = () => {
    createConversationMutation.mutate({
      type: "academy",
      title: "Academy Chat",
    });
  };

  const isUuidLike = (v: string | null | undefined): boolean =>
    !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
  const cleanTitle = (v: string | null | undefined) =>
    v && !isUuidLike(v) && v !== "Chat" ? v : null;
  const getConvDisplayName = (conv: Conversation) => {
    if (conv.type === "academy") return "Academy Chat";
    if (conv.type === "series_group" || conv.type === "lesson_group") {
      const cAny = conv as Conversation & { seriesTitle?: string | null };
      return cleanTitle(cAny.seriesTitle) || cleanTitle(conv.title) || "Lesson Group";
    }
    if (conv.type === "squad" || conv.type === "group") {
      return cleanTitle(conv.title) || "Squad Chat";
    }
    if (conv.type === "coach_coach") return cleanTitle(conv.title) || "Coach Chat";
    if (conv.type === "provider_player") return conv.providerName || "Service Provider";
    if (conv.type === "coach_player" || conv.type === "direct_message") {
      if (conv.coachName) return conv.coachName;
      if (cleanTitle(conv.title)) return cleanTitle(conv.title)!;
      return "Coach";
    }
    if (conv.type === "player_player") {
      if (conv.playerName) return conv.playerName;
      if (cleanTitle(conv.title)) return cleanTitle(conv.title)!;
      return "Player";
    }
    if (conv.playerName && conv.playerName !== "Chat") return conv.playerName;
    if (cleanTitle(conv.title)) return cleanTitle(conv.title)!;
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

  const renderVerticalTabs = () => {
    const playerCollapsedW = 52;
    const playerExpandedW = 132;
    const playerWidth = isSidebarExpanded ? playerExpandedW : playerCollapsedW;
    return (
      <View
        style={[styles.verticalTabPanel, isPlayerMode && { width: playerWidth, paddingHorizontal: 4 }]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.verticalTabScroll, isPlayerMode && { alignItems: isSidebarExpanded ? "stretch" : "center" }]}
        >
          {CHAT_TABS.map((tab) => {
            const isActive = currentTab === tab.id;
            if (isPlayerMode) {
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => {
                    if (!isSidebarExpanded) {
                      setIsSidebarExpanded(true);
                      return;
                    }
                    handleTabChange(tab.id);
                    setIsSidebarExpanded(false);
                  }}
                  onLongPress={() => setIsSidebarExpanded((v) => !v)}
                  style={[
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: isSidebarExpanded ? "flex-start" : "center",
                      paddingHorizontal: isSidebarExpanded ? 10 : 0,
                      width: isSidebarExpanded ? "100%" : 42,
                      height: 42,
                      borderRadius: isSidebarExpanded ? 12 : 21,
                      marginBottom: 8,
                      backgroundColor: isActive ? NEON_GREEN + "22" : "transparent",
                      borderWidth: isActive ? 1.5 : 0,
                      borderColor: isActive ? NEON_GREEN : "transparent",
                    }
                  ]}
                >
                  <Ionicons
                    name={tab.icon}
                    size={20}
                    color={isActive ? NEON_GREEN : Colors.dark.textMuted}
                  />
                  {isSidebarExpanded ? (
                    <ThemedText
                      numberOfLines={1}
                      style={{ marginLeft: 10, fontSize: 12, color: isActive ? NEON_GREEN : Colors.dark.textMuted, fontWeight: "600" }}
                    >
                      {tab.name}
                    </ThemedText>
                  ) : null}
                </Pressable>
              );
            }
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
  };

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
    const isOwn =
      (coach?.id != null && item.senderCoachId === coach.id) ||
      (user?.playerId != null && item.senderPlayerId === user.playerId);

    const initials = (item.senderName || "?")
      .split(" ")
      .slice(0, 2)
      .map((w: string) => w[0])
      .join("")
      .toUpperCase();

    const reactions = (item as any).reactions as Array<{ emoji: string; reactorCoachId: string | null; reactorPlayerId: string | null }> | undefined;
    const groupedReactions: Record<string, { count: number; reactedByMe: boolean }> = {};
    if (Array.isArray(reactions)) {
      for (const r of reactions) {
        const key = r.emoji;
        if (!groupedReactions[key]) groupedReactions[key] = { count: 0, reactedByMe: false };
        groupedReactions[key].count += 1;
        if (isPlayerMode ? r.reactorPlayerId === userId : r.reactorCoachId === userId) {
          groupedReactions[key].reactedByMe = true;
        }
      }
    }

    return (
      <Pressable
        style={styles.worldMessageRow}
        onLongPress={() => setShowReactions(showReactions === item.id ? null : item.id)}
        delayLongPress={250}
      >
        <View style={[styles.messageBubble, isOwn ? styles.ownMessage : styles.otherMessage]}>
          {isOwn ? null : (
            <Pressable
              style={styles.senderInfo}
              onPress={() =>
                setSelectedSender({
                  senderName: item.senderName,
                  senderPhotoUrl: item.senderPhotoUrl,
                  senderType: item.senderType,
                  senderCoachId: item.senderCoachId,
                  senderPlayerId: item.senderPlayerId,
                  senderUserId: item.senderUserId,
                })
              }
            >
              <View style={styles.playerAvatar}>
                {item.senderPhotoUrl ? (
                  <Image
                    source={{ uri: item.senderPhotoUrl }}
                    style={styles.playerAvatarImg}
                    contentFit="cover"
                  />
                ) : (
                  <ThemedText style={styles.playerAvatarInitials}>{initials}</ThemedText>
                )}
              </View>
              <ThemedText style={[styles.senderName, { color: Colors.dark.primary }]} numberOfLines={1}>
                {item.senderName}
              </ThemedText>
            </Pressable>
          )}
          <View style={styles.messageRow}>
            <ThemedText style={[styles.messageText, isOwn && styles.ownMessageText]}>{item.body}</ThemedText>
            <ThemedText style={[styles.timestamp, isOwn && styles.ownTimestamp]}>{formatTime(item.createdAt)}</ThemedText>
          </View>
          {Object.keys(groupedReactions).length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {Object.entries(groupedReactions).map(([emoji, info]) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    if (info.reactedByMe) {
                      removeWorldReactionMutation.mutate({ messageId: item.id, emoji });
                    } else {
                      addWorldReactionMutation.mutate({ messageId: item.id, emoji });
                    }
                  }}
                  style={[
                    styles.reactionChip,
                    info.reactedByMe ? { backgroundColor: NEON_GREEN + "30", borderColor: NEON_GREEN } : undefined,
                  ]}
                >
                  <ThemedText style={{ fontSize: 12 }}>{emoji} {info.count}</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
          {showReactions === item.id ? (
            <View style={[styles.reactionPicker, { flexDirection: "row", flexWrap: "wrap", marginTop: 6 }]}>
              {REACTION_EMOJIS.map((emoji) => {
                const mine = groupedReactions[emoji]?.reactedByMe;
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => {
                      if (mine) {
                        removeWorldReactionMutation.mutate({ messageId: item.id, emoji });
                      } else {
                        addWorldReactionMutation.mutate({ messageId: item.id, emoji });
                      }
                      setShowReactions(null);
                    }}
                    style={[styles.reactionOption, mine ? { backgroundColor: NEON_GREEN + "30" } : undefined]}
                  >
                    <ThemedText style={{ fontSize: 20 }}>{emoji}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const renderWorldChat = () => (
    <>
      <View style={styles.activityFeedContainer}>
        <View style={styles.activityHeader}>
          <Ionicons name="globe-outline" size={16} color={Colors.dark.xpCyan} />
          <ThemedText style={[styles.activityHeaderText, { color: Colors.dark.xpCyan }]}>World Chat</ThemedText>
        </View>
        <FlatList
            ref={worldStick.ref}
            data={worldMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderWorldMessage}
            extraData={userId}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: Spacing.sm, gap: 4 }}
            onContentSizeChange={worldStick.onContentSizeChange}
            onScroll={worldStick.onScroll}
            scrollEventThrottle={worldStick.scrollEventThrottle}
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
          {worldStick.hasNewBelow ? (
            <Pressable
              style={styles.jumpUnreadPill}
              onPress={() => worldStick.scrollToBottom(true)}
            >
              <Ionicons name="arrow-down" size={14} color="#000" />
              <ThemedText style={{ fontSize: 12, fontWeight: "700", color: "#000" }}>New message</ThemedText>
            </Pressable>
          ) : null}
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
            onPress={() => {
              if (markedUnreadSet.has(item.id)) {
                setMarkedUnreadSet(prev => {
                  const next = new Set(prev);
                  next.delete(item.id);
                  persistMarkedUnread(next);
                  return next;
                });
              }
              handleSelectConversation(item);
            }}
            onLongPress={() => handleConvLongPress(item)}
            style={styles.conversationItem}
          >
            <View style={styles.conversationAvatar}>
              <Ionicons name={getConvIcon(item)} size={20} color={Colors.dark.text} />
              {/* Online dot for player-to-player DMs in player mode */}
              {isPlayerMode && item.type === "player_player" && (() => {
                const pid = item.otherPlayerId ?? null;
                if (!pid) return null;
                const isOnline = onlinePlayerIds.has(pid);
                const lastSeen = playerLastSeenMap[pid];
                if (!isOnline && !lastSeen) return null;
                return (
                  <View style={[styles.onlineDot, { backgroundColor: isOnline ? NEON_GREEN : "#555" }]} />
                );
              })()}
            </View>
            <View style={styles.conversationInfo}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <ThemedText style={[styles.conversationName, { flexShrink: 1 }]} numberOfLines={1}>
                  {getConvDisplayName(item)}
                </ThemedText>
                {isConvMuted(item.id) ? (
                  <Ionicons name="notifications-off-outline" size={12} color={Colors.dark.textMuted} />
                ) : null}
                {markedUnreadSet.has(item.id) ? (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: NEON_GREEN }} />
                ) : null}
              </View>
              {item.lastMessagePreview ? (
                <ThemedText numberOfLines={1} style={styles.conversationPreview}>
                  {item.lastMessagePreview}
                </ThemedText>
              ) : null}
              {isPlayerMode && item.type === "player_player" && item.otherPlayerId && (() => {
                const pid = item.otherPlayerId!;
                const isOnline = onlinePlayerIds.has(pid);
                const lastSeen = playerLastSeenMap[pid];
                if (isOnline) return (
                  <ThemedText style={{ fontSize: 10, color: NEON_GREEN }}>Online</ThemedText>
                );
                if (lastSeen) {
                  const diff = Date.now() - new Date(lastSeen).getTime();
                  const mins = Math.floor(diff / 60000);
                  const hrs = Math.floor(mins / 60);
                  const days = Math.floor(hrs / 24);
                  const label = days > 0 ? `Seen ${days}d ago` : hrs > 0 ? `Seen ${hrs}h ago` : mins > 1 ? `Seen ${mins}m ago` : "Seen just now";
                  return <ThemedText style={{ fontSize: 10, color: Colors.dark.textMuted }}>{label}</ThemedText>;
                }
                return null;
              })()}
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
            ) : currentTab === "providers" ? (
              <ThemedText style={{ fontSize: 12, color: Colors.dark.textTertiary, marginTop: 8, textAlign: "center", paddingHorizontal: Spacing.lg }}>
                Chats appear automatically when a booking is confirmed
              </ThemedText>
            ) : null}
          </View>
        }
      />
    </>
  );

  const renderRightPanel = () => {
    const safetyBanner = safetyBannerDismissed ? null : (
      <View style={styles.safetyBanner}>
        <Ionicons name="shield-checkmark" size={14} color="#4FC3F7" />
        <ThemedText style={styles.safetyBannerText}>
          Chats are monitored. Never share personal or financial info. Beware of scams.
        </ThemedText>
        <Pressable onPress={dismissSafetyBanner} hitSlop={8} style={{ padding: 2 }}>
          <Ionicons name="close" size={14} color={Colors.dark.textMuted} />
        </Pressable>
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
              <Pressable onPress={() => { userBackedFromConvRef.current = true; setSelectedConversation(null); }} style={styles.backButton}>
                <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
              </Pressable>
              <Pressable
                onPress={() => {
                  if (isPlayerMode && selectedConversation.type === "player_player" && selectedConversation.otherPlayerId) {
                    const otherUserId = selectedConversation.otherPlayerUserId ?? null;
                    setSelectedSender({
                      senderName: selectedConversation.playerName || "Player",
                      senderPhotoUrl: null,
                      senderType: "player",
                      senderCoachId: null,
                      senderPlayerId: selectedConversation.otherPlayerId,
                      senderUserId: otherUserId,
                    });
                    if (selectedConversation.isBlockedByMe && otherUserId) {
                      setBlockedUserId(otherUserId);
                    }
                  }
                }}
                style={{ flex: 1 }}
              >
                <ThemedText style={styles.conversationTitle}>
                  {getConvDisplayName(selectedConversation)}
                </ThemedText>
              </Pressable>
              {isPlayerMode && selectedConversation.type === "player_player" && selectedConversation.otherPlayerId && onChallenge ? (
                <Pressable
                  onPress={() => {
                    const opponentId = selectedConversation.otherPlayerId!;
                    const opponentName = selectedConversation.playerName || "Player";
                    pendingChallengeRef.current = { opponentId, opponentName, opponentPhoto: undefined };
                    setSelectedConversation(null);
                    setIsFullscreen(false);
                    setIsExpanded(false);
                    setTimeout(() => {
                      if (pendingChallengeRef.current && onChallenge) {
                        const p = pendingChallengeRef.current;
                        pendingChallengeRef.current = null;
                        onChallenge(p.opponentId, p.opponentName, p.opponentPhoto);
                      }
                    }, 250);
                  }}
                  style={styles.dmChallengeBtn}
                >
                  <Ionicons name="flash" size={14} color="#000" />
                  <ThemedText style={{ fontSize: 11, fontWeight: "700", color: "#000" }}>Challenge</ThemedText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {safetyBanner}

          {loadingMessages ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={Colors.dark.primary} />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <FlatList
                ref={convStick.ref}
                data={messageRows}
                keyExtractor={(item) => item.id}
                renderItem={renderMessageRow}
                style={styles.messageList}
                contentContainerStyle={styles.messageListContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Ionicons name="chatbubbles-outline" size={32} color={Colors.dark.tabIconDefault} />
                    <ThemedText style={[styles.emptyText, { fontSize: 13, marginTop: 8 }]}>
                      No messages yet — be the first to say hi!
                    </ThemedText>
                  </View>
                }
                onContentSizeChange={convStick.onContentSizeChange}
                onScroll={convStick.onScroll}
                scrollEventThrottle={convStick.scrollEventThrottle}
              />
              {convStick.hasNewBelow ? (
                <Pressable
                  style={styles.jumpUnreadPill}
                  onPress={() => convStick.scrollToBottom(true)}
                >
                  <Ionicons name="arrow-down" size={14} color="#000" />
                  <ThemedText style={{ fontSize: 12, fontWeight: "700", color: "#000" }}>New message</ThemedText>
                </Pressable>
              ) : null}
            </View>
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

          {replyTo ? (
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: DARK_BUBBLE, borderRadius: 10, marginHorizontal: 8, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Ionicons name="arrow-undo-outline" size={14} color={NEON_GREEN} style={{ marginRight: 6 }} />
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 11, color: NEON_GREEN, fontWeight: "600" }}>{replyTo.senderName}</ThemedText>
                <ThemedText style={{ fontSize: 11, color: Colors.dark.textMuted }} numberOfLines={1}>{replyTo.body}</ThemedText>
              </View>
              <Pressable onPress={() => setReplyTo(null)} style={{ padding: 4 }}>
                <Ionicons name="close-outline" size={16} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
          ) : null}
          {!isSampleConversation ? (
            <View>
              {showQuickReplyTooltip ? (
                <View style={{ marginHorizontal: 12, marginBottom: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: NEON_GREEN + "15", borderRadius: 8, borderWidth: 1, borderColor: NEON_GREEN + "40" }}>
                  <ThemedText style={{ fontSize: 11, color: NEON_GREEN }}>
                    Tap + to add your own quick replies. Long-press a chip to edit.
                  </ThemedText>
                </View>
              ) : null}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.quickPhrasesStrip}
                contentContainerStyle={{ paddingHorizontal: 8, gap: 6 }}
              >
                {quickPhraseList.map((p, idx) => (
                  <Pressable
                    key={p.id ?? `default-${idx}`}
                    onPress={() => {
                      setInputText(inputText ? `${inputText} ${p.body}` : p.body);
                      dismissQuickReplyTooltip();
                    }}
                    onLongPress={() => {
                      dismissQuickReplyTooltip();
                      if (p.isCustom && p.id) {
                        setEditingQuickReply({ id: p.id, body: p.body });
                        setNewQuickReplyText(p.body);
                        setShowAddQuickReply(true);
                      }
                    }}
                    style={styles.quickPhraseChip}
                  >
                    <ThemedText style={{ fontSize: 12, color: isPlayerMode ? NEON_GREEN : Colors.dark.text }}>{p.body}</ThemedText>
                  </Pressable>
                ))}
                {canAddMoreQuickReplies ? (
                  <Pressable
                    onPress={() => {
                      setEditingQuickReply(null);
                      setNewQuickReplyText("");
                      setShowAddQuickReply(true);
                      dismissQuickReplyTooltip();
                    }}
                    style={[styles.quickPhraseChip, { flexDirection: "row", alignItems: "center", gap: 3 }]}
                  >
                    <Ionicons name="add" size={14} color={isPlayerMode ? NEON_GREEN : Colors.dark.text} />
                    <ThemedText style={{ fontSize: 12, color: isPlayerMode ? NEON_GREEN : Colors.dark.text }}>Add</ThemedText>
                  </Pressable>
                ) : null}
              </ScrollView>
            </View>
          ) : null}
          <View style={[styles.inputContainer, isPlayerMode && { backgroundColor: "#0D1525CC", borderWidth: 1, borderColor: NEON_GREEN + "22" }]}>
            {isConnected ? (
              <View style={styles.inputConnectionIndicator}>
                <View style={[styles.connectionDot, isPlayerMode && { backgroundColor: NEON_GREEN }]} />
              </View>
            ) : null}
            <TextInput
              value={inputText}
              onChangeText={handleInputChange}
              placeholder={isSampleConversation ? "Demo chat - read only" : "Message..."}
              placeholderTextColor={Colors.dark.textMuted}
              style={[styles.input, isPlayerMode && { color: Colors.dark.text }]}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              blurOnSubmit={false}
              editable={!isSampleConversation}
            />
            <Pressable
              onPress={handleSend}
              disabled={sendMessageMutation.isPending || isSampleConversation}
              style={({ pressed }) => [
                styles.sendButton,
                isPlayerMode && { backgroundColor: NEON_GREEN, borderRadius: 20, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
                { opacity: pressed || sendMessageMutation.isPending || isSampleConversation ? 0.5 : 1 },
              ]}
            >
              <Ionicons name="send-outline" size={18} color={isPlayerMode ? "#000000" : Colors.dark.buttonText} />
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

  const desktopWebStyle = isDesktopWeb
    ? { position: "fixed" as any, left: 220, right: 0, bottom: 0 }
    : {};

  return (
    <Animated.View
      pointerEvents={(!isExpanded && !isFullscreen) ? "box-none" : "auto"}
      style={[
        styles.container,
        (!isExpanded && !isFullscreen) && styles.containerCollapsed,
        {
          bottom: isExpanded || isFullscreen
            ? insets.bottom
            : TAB_BAR_HEIGHT + insets.bottom + CHAT_PILL_LIFT,
          paddingTop: isFullscreen ? insets.top : 0,
        },
        desktopWebStyle,
        animatedStyle,
      ]}
    >
      {(!isExpanded && !isFullscreen) ? (
        // ── COLLAPSED: player mode → neon ticker pill; coach mode → existing ticker ──
        <>
          {isPlayerMode ? (
            <View style={styles.playerPillRow} pointerEvents="box-none">
              <Pressable
                style={styles.playerTickerPill}
                onPress={() => { setIsExpanded(true); setIsFullscreen(true); }}
                hitSlop={6}
              >
                <Animated.View style={[styles.playerTickerInner, tickerFadeStyle]}>
                  {tickerItems.length > 0 ? (() => {
                    const t = tickerItems[Math.min(tickerIndex, tickerItems.length - 1)];
                    return (
                      <>
                        <View style={styles.playerTickerAvatar}>
                          {t.photo ? (
                            <Image source={{ uri: t.photo }} style={styles.playerTickerAvatarImg} contentFit="cover" />
                          ) : (
                            <Ionicons name="person" size={14} color={NEON_GREEN} />
                          )}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <ThemedText numberOfLines={1} style={styles.playerTickerName}>{t.name}</ThemedText>
                          <ThemedText numberOfLines={1} style={styles.playerTickerPreview}>{t.preview}</ThemedText>
                        </View>
                      </>
                    );
                  })() : (
                    <>
                      <View style={styles.playerTickerAvatar}>
                        <Ionicons name="chatbubbles-outline" size={14} color={NEON_GREEN} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.playerTickerName}>Glow Chat</ThemedText>
                        <ThemedText style={styles.playerTickerPreview}>Tap to open</ThemedText>
                      </View>
                    </>
                  )}
                </Animated.View>
                <View style={styles.playerTickerRight}>
                  {unreadCount > 0 ? (
                    <View style={styles.playerTickerBadge}>
                      <ThemedText style={styles.playerTickerBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</ThemedText>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-up" size={18} color={NEON_GREEN} />
                </View>
              </Pressable>
            </View>
          ) : (
            <View style={styles.pillRow} pointerEvents="box-none">
              <View style={{ flex: 1 }} pointerEvents="none" />
              <View style={styles.pillGap} pointerEvents="none" />
              <Pressable
                style={styles.rightPill}
                onPress={() => setIsExpanded(true)}
              >
                <Animated.View style={[styles.tickerTrack, rightTickerStyle]}>
                  <ThemedText style={styles.tickerText} numberOfLines={1}>
                    {repeatedContent}
                  </ThemedText>
                </Animated.View>
                <View style={styles.tickerDotOverlay}>
                  <View style={[styles.connectionDot, !isConnected && { backgroundColor: Colors.dark.disabled }]} />
                </View>
                <Pressable
                  style={styles.collapseBtn}
                  onPress={() => setIsExpanded(true)}
                >
                  <Ionicons name="chevron-up-outline" size={18} color={Colors.dark.text} />
                  {unreadCount > 0 ? (
                    <View style={styles.collapseBadge}>
                      <ThemedText style={styles.collapseBadgeText}>{unreadCount}</ThemedText>
                    </View>
                  ) : null}
                </Pressable>
              </Pressable>
            </View>
          )}
        </>
      ) : (
        // ── EXPANDED / FULLSCREEN: original header ──
        <>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
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
                </View>
                {latestConversation && latestConversation.lastMessagePreview && !isExpanded ? (
                  <ThemedText numberOfLines={1} style={styles.previewText}>
                    <ThemedText style={styles.previewSender}>
                      {getConvDisplayName(latestConversation)}:{" "}
                    </ThemedText>
                    {latestConversation.lastMessagePreview}
                  </ThemedText>
                ) : (
                  <ThemedText style={styles.headerTitle}>Glow Chat</ThemedText>
                )}
              </View>
            </Pressable>
            <View style={styles.headerButtons}>
              <Pressable
                onPress={() => {
                  if (isFullscreen) {
                    setIsFullscreen(false);
                    setIsExpanded(false);
                  } else if (isExpanded) {
                    setIsExpanded(false);
                  } else {
                    setIsExpanded(true);
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
        </>
      )}

      {(isExpanded || isFullscreen) ? (
        <TouchableWithoutFeedback
          onPress={() => {
            Keyboard.dismiss();
            if (isSidebarExpanded) setIsSidebarExpanded(false);
          }}
          accessible={false}
        >
        <View style={styles.expandedContent}>
          {!isSmallScreen && renderVerticalTabs()}
          <View style={[styles.rightPanel, isSmallScreen && { flex: 1 }]}>
            {isSmallScreen && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.horizontalTabStrip}
                contentContainerStyle={styles.horizontalTabStripContent}
              >
                {CHAT_TABS.map((tab) => {
                  const isActive = currentTab === tab.id;
                  return (
                    <Pressable
                      key={tab.id}
                      onPress={() => handleTabChange(tab.id)}
                      style={[styles.horizontalTabChip, isActive && styles.horizontalTabChipActive]}
                    >
                      <Ionicons
                        name={tab.icon}
                        size={13}
                        color={isActive ? Colors.dark.primary : Colors.dark.textMuted}
                      />
                      <ThemedText style={[styles.horizontalTabChipText, isActive && styles.horizontalTabChipTextActive]}>
                        {tab.name}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {renderRightPanel()}
          </View>
        </View>
        </TouchableWithoutFeedback>
      ) : null}

      <Modal
        visible={selectedSender !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedSender(null)}
        onDismiss={() => {
          if (pendingChallengeRef.current && onChallenge) {
            const { opponentId, opponentName, opponentPhoto } = pendingChallengeRef.current;
            pendingChallengeRef.current = null;
            onChallenge(opponentId, opponentName, opponentPhoto);
          }
        }}
      >
        <Pressable style={styles.profileModalOverlay} onPress={() => setSelectedSender(null)}>
          <Pressable style={styles.profileModalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.profileModalHandle} />
            {selectedSender ? (
              <>
                <View style={styles.profileModalAvatar}>
                  {selectedSender.senderPhotoUrl ? (
                    <Image
                      source={{ uri: selectedSender.senderPhotoUrl }}
                      style={styles.profileModalAvatarImg}
                      contentFit="cover"
                    />
                  ) : (
                    <ThemedText style={styles.profileModalAvatarInitials}>
                      {(selectedSender.senderName || "?")
                        .split(" ")
                        .slice(0, 2)
                        .map((w: string) => w[0])
                        .join("")
                        .toUpperCase()}
                    </ThemedText>
                  )}
                </View>
                <ThemedText style={styles.profileModalName}>{selectedSender.senderName}</ThemedText>
                <View style={styles.profileModalRoleBadge}>
                  <Ionicons
                    name={selectedSender.senderType === "coach" ? "tennisball-outline" : "person-outline"}
                    size={11}
                    color={Colors.dark.primary}
                  />
                  <ThemedText style={styles.profileModalRoleText}>
                    {selectedSender.senderType === "coach" ? "Coach" : "Player"}
                  </ThemedText>
                </View>
                <View style={styles.profileModalActions}>
                  {(() => {
                    const { senderType, senderPlayerId, senderCoachId, senderName } = selectedSender;
                    if (senderType === "player" && senderPlayerId) {
                      return (
                        <Pressable
                          style={styles.profileModalBtn}
                          onPress={() => {
                            setSelectedSender(null);
                            setTimeout(() => {
                              if (isPlayerMode) {
                                createConversationMutation.mutate({ type: "player_player", otherPlayerId: senderPlayerId });
                              } else {
                                createConversationMutation.mutate({ type: "coach_player", playerId: senderPlayerId });
                              }
                              setIsExpanded(true);
                              setCurrentTab("players");
                            }, 350);
                          }}
                        >
                          <Ionicons name="chatbubble-outline" size={16} color={Colors.dark.primary} />
                          <ThemedText style={styles.profileModalBtnText}>Message</ThemedText>
                        </Pressable>
                      );
                    }
                    if (senderType === "coach" && senderCoachId && !isPlayerMode) {
                      return (
                        <Pressable
                          style={styles.profileModalBtn}
                          onPress={() => {
                            setSelectedSender(null);
                            setTimeout(() => {
                              const existing = conversations.find(
                                (c) => c.type === "coach_coach" && c.title === senderName,
                              );
                              if (existing) {
                                handleSelectConversation(existing);
                              } else {
                                createConversationMutation.mutate({
                                  type: "coach_coach",
                                  title: senderName,
                                  otherCoachId: senderCoachId,
                                });
                              }
                              setIsExpanded(true);
                              setCurrentTab("coaches");
                            }, 350);
                          }}
                        >
                          <Ionicons name="chatbubble-outline" size={16} color={Colors.dark.primary} />
                          <ThemedText style={styles.profileModalBtnText}>Message</ThemedText>
                        </Pressable>
                      );
                    }
                    if (senderType === "coach" && senderCoachId && isPlayerMode) {
                      const existing = conversations.find(
                        (c) => (c.type === "coach_player" || c.type === "direct_message") && c.coachId === senderCoachId,
                      );
                      if (!existing) return null;
                      return (
                        <Pressable
                          style={styles.profileModalBtn}
                          onPress={() => {
                            setSelectedSender(null);
                            setTimeout(() => {
                              handleSelectConversation(existing);
                              setIsExpanded(true);
                              setCurrentTab("coaches");
                            }, 350);
                          }}
                        >
                          <Ionicons name="chatbubble-outline" size={16} color={Colors.dark.primary} />
                          <ThemedText style={styles.profileModalBtnText}>Message</ThemedText>
                        </Pressable>
                      );
                    }
                    return null;
                  })()}
                  {selectedSender.senderType === "player" && selectedSender.senderPlayerId && isPlayerMode && onChallenge ? (
                    <Pressable
                      style={[styles.profileModalBtn, { backgroundColor: Colors.dark.xpCyan + "15", borderColor: Colors.dark.xpCyan + "50" }]}
                      onPress={() => {
                        const opponentId = selectedSender.senderPlayerId!;
                        const opponentName = selectedSender.senderName;
                        const opponentPhoto = selectedSender.senderPhotoUrl ?? undefined;
                        pendingChallengeRef.current = { opponentId, opponentName, opponentPhoto };
                        setIsFullscreen(false);
                        setIsExpanded(false);
                        setSelectedSender(null);
                      }}
                    >
                      <Ionicons name="tennisball-outline" size={16} color={Colors.dark.xpCyan} />
                      <ThemedText style={[styles.profileModalBtnText, { color: Colors.dark.xpCyan }]}>Challenge to Match</ThemedText>
                    </Pressable>
                  ) : null}
                  {selectedSender.senderType === "player" && selectedSender.senderPlayerId && isPlayerMode ? (
                    <Pressable
                      style={[styles.profileModalBtn, { backgroundColor: Colors.dark.primary + "15", borderColor: Colors.dark.primary + "50" }]}
                      onPress={() => {
                        const playerId = selectedSender.senderPlayerId!;
                        setSelectedSender(null);
                        setIsFullscreen(false);
                        setIsExpanded(false);
                        setTimeout(() => {
                          try {
                            navigation.navigate("PublicProfile", { playerId });
                          } catch (err) {
                            console.warn("[ChatFooter] PublicProfile navigation failed", err);
                          }
                        }, 250);
                      }}
                    >
                      <Ionicons name="person-circle-outline" size={16} color={Colors.dark.primary} />
                      <ThemedText style={styles.profileModalBtnText}>View Profile</ThemedText>
                    </Pressable>
                  ) : null}
                  {selectedSender.senderType === "player" && selectedSender.senderUserId && isPlayerMode ? (
                    (() => {
                      const sent = inviteState === "sent";
                      const pending = inviteState === "pending";
                      const errored = inviteState === "error";
                      const disabled = sent || pending;
                      const label = sent
                        ? "Invite sent"
                        : pending
                        ? "Sending…"
                        : errored && inviteError
                        ? inviteError
                        : "Invite as Friend";
                      const tint = sent ? Colors.dark.primary : errored ? "#FF9F0A" : NEON_GREEN;
                      return (
                        <Pressable
                          disabled={disabled}
                          style={[
                            styles.profileModalBtn,
                            { backgroundColor: tint + "15", borderColor: tint + "50", opacity: disabled ? 0.85 : 1 },
                          ]}
                          onPress={() => {
                            if (!selectedSender?.senderPlayerId) return;
                            const targetName = selectedSender.senderName;
                            setInviteState("pending");
                            setInviteError(null);
                            apiRequest("POST", "/api/player/connections/request", {
                              targetPlayerId: selectedSender.senderPlayerId,
                            })
                              .then(() => {
                                setInviteState("sent");
                                console.log(`[ChatFooter] Friend invite sent to ${targetName}`);
                              })
                              .catch((err: unknown) => {
                                let msg = "Try again later";
                                const raw = err instanceof Error ? err.message : String(err ?? "");
                                if (/Already connected/i.test(raw)) msg = "Already friends";
                                else if (/already pending/i.test(raw)) msg = "Invite already sent";
                                else if (/yourself/i.test(raw)) msg = "Can’t invite yourself";
                                else if (/Player access required/i.test(raw)) msg = "Player account required";
                                setInviteError(msg);
                                setInviteState("error");
                              });
                          }}
                        >
                          <Ionicons
                            name={sent ? "checkmark-circle-outline" : errored ? "alert-circle-outline" : "person-add-outline"}
                            size={16}
                            color={tint}
                          />
                          <ThemedText style={[styles.profileModalBtnText, { color: tint }]}>{label}</ThemedText>
                        </Pressable>
                      );
                    })()
                  ) : null}
                  {selectedSender.senderType === "player" && selectedSender.senderUserId && isPlayerMode ? (
                    blockedUserId === selectedSender.senderUserId ? (
                      <Pressable
                        style={[styles.profileModalBtn, { backgroundColor: Colors.dark.textSecondary + "15", borderColor: Colors.dark.textSecondary + "50" }]}
                        onPress={() => {
                          unblockMutation.mutate(selectedSender.senderUserId!);
                        }}
                      >
                        <Ionicons name="close-circle-outline" size={16} color={Colors.dark.textSecondary} />
                        <ThemedText style={[styles.profileModalBtnText, { color: Colors.dark.textSecondary }]}>Unblock</ThemedText>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={[styles.profileModalBtn, { backgroundColor: "#FF3B3010", borderColor: "#FF3B3040" }]}
                        onPress={() => setShowBlockConfirm(true)}
                      >
                        <Ionicons name="ban-outline" size={16} color="#FF3B30" />
                        <ThemedText style={[styles.profileModalBtnText, { color: "#FF3B30" }]}>Block</ThemedText>
                      </Pressable>
                    )
                  ) : null}
                </View>
                <Pressable style={styles.profileModalClose} onPress={() => setSelectedSender(null)}>
                  <ThemedText style={styles.profileModalCloseText}>Close</ThemedText>
                </Pressable>
                {showBlockConfirm && selectedSender?.senderUserId ? (
                  <View style={styles.blockConfirmOverlay} pointerEvents="auto">
                    <Pressable
                      style={StyleSheet.absoluteFill}
                      onPress={() => setShowBlockConfirm(false)}
                    />
                    <View style={styles.blockConfirmCard}>
                      <Ionicons name="ban-outline" size={28} color="#FF3B30" style={{ alignSelf: "center", marginBottom: 8 }} />
                      <ThemedText style={styles.blockConfirmTitle}>Block {selectedSender.senderName}?</ThemedText>
                      <ThemedText style={styles.blockConfirmBody}>
                        You won’t see their messages anywhere in the app.
                      </ThemedText>
                      <View style={styles.blockConfirmActions}>
                        <Pressable
                          style={[styles.blockConfirmBtn, { backgroundColor: Colors.dark.backgroundSecondary }]}
                          onPress={() => setShowBlockConfirm(false)}
                        >
                          <ThemedText style={[styles.blockConfirmBtnText, { color: Colors.dark.text }]}>Cancel</ThemedText>
                        </Pressable>
                        <Pressable
                          style={[styles.blockConfirmBtn, { backgroundColor: "#FF3B30" }]}
                          onPress={() => {
                            const targetUserId = selectedSender.senderUserId!;
                            const targetPlayerId = selectedSender.senderPlayerId;
                            blockMutation.mutate(targetUserId);
                            const convToDelete = conversations.find(
                              (c) => c.type === "player_player" && c.otherPlayerId === targetPlayerId,
                            );
                            if (convToDelete) {
                              deleteConversationMutation.mutate(convToDelete.id);
                            }
                            setShowBlockConfirm(false);
                            setSelectedSender(null);
                          }}
                        >
                          <ThemedText style={[styles.blockConfirmBtnText, { color: "#fff" }]}>Block</ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ) : null}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showAddQuickReply}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddQuickReply(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "#00000088", justifyContent: "center", padding: 24 }}
          onPress={() => setShowAddQuickReply(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{ backgroundColor: "#1A2535", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: NEON_GREEN + "30" }}
          >
            <ThemedText style={{ fontSize: 15, fontWeight: "700", color: Colors.dark.text, marginBottom: 10 }}>
              {editingQuickReply ? "Edit quick reply" : "New quick reply"}
            </ThemedText>
            <TextInput
              value={newQuickReplyText}
              onChangeText={setNewQuickReplyText}
              placeholder="Type a phrase..."
              placeholderTextColor={Colors.dark.textMuted}
              maxLength={60}
              autoFocus
              style={{ backgroundColor: "#0D1525", color: Colors.dark.text, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: NEON_GREEN + "20" }}
            />
            <ThemedText style={{ fontSize: 10, color: Colors.dark.textMuted, marginTop: 4 }}>
              {newQuickReplyText.length}/60
            </ThemedText>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              {editingQuickReply ? (
                <Pressable
                  onPress={() => {
                    deleteQuickReplyMutation.mutate(editingQuickReply.id);
                    setShowAddQuickReply(false);
                    setEditingQuickReply(null);
                  }}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, marginRight: "auto" }}
                >
                  <ThemedText style={{ color: "#FF6B6B", fontSize: 13 }}>Delete</ThemedText>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  setShowAddQuickReply(false);
                  setEditingQuickReply(null);
                }}
                style={{ paddingHorizontal: 12, paddingVertical: 8 }}
              >
                <ThemedText style={{ color: Colors.dark.textMuted, fontSize: 13 }}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => {
                  const body = newQuickReplyText.trim();
                  if (!body) return;
                  if (editingQuickReply) {
                    updateQuickReplyMutation.mutate({ id: editingQuickReply.id, body });
                  } else {
                    createQuickReplyMutation.mutate(body);
                  }
                  setShowAddQuickReply(false);
                  setEditingQuickReply(null);
                  setNewQuickReplyText("");
                }}
                style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: NEON_GREEN, borderRadius: 8 }}
              >
                <ThemedText style={{ color: "#000", fontSize: 13, fontWeight: "700" }}>Save</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showOnboardingOverlay}
        transparent
        animationType="fade"
        onRequestClose={dismissOnboarding}
      >
        <View style={styles.onboardingBackdrop}>
          <View style={styles.onboardingCard}>
            <View style={styles.onboardingHeader}>
              <View style={styles.onboardingIconBadge}>
                <Ionicons
                  name={CHAT_ONBOARDING_STEPS[onboardingStep].icon}
                  size={26}
                  color={NEON_GREEN}
                />
              </View>
              <Pressable onPress={dismissOnboarding} style={styles.onboardingCloseBtn} hitSlop={10}>
                <Ionicons name="close" size={20} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
            <ThemedText style={styles.onboardingTitle}>
              {CHAT_ONBOARDING_STEPS[onboardingStep].title}
            </ThemedText>
            <ThemedText style={styles.onboardingBody}>
              {CHAT_ONBOARDING_STEPS[onboardingStep].body}
            </ThemedText>
            <View style={styles.onboardingDots}>
              {CHAT_ONBOARDING_STEPS.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.onboardingDot,
                    i === onboardingStep && styles.onboardingDotActive,
                  ]}
                />
              ))}
            </View>
            <View style={styles.onboardingActions}>
              <Pressable onPress={dismissOnboarding} style={styles.onboardingSkipBtn}>
                <ThemedText style={styles.onboardingSkipText}>Skip</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (onboardingStep < CHAT_ONBOARDING_STEPS.length - 1) {
                    setOnboardingStep(onboardingStep + 1);
                  } else {
                    dismissOnboarding();
                  }
                }}
                style={styles.onboardingNextBtn}
              >
                <ThemedText style={styles.onboardingNextText}>
                  {onboardingStep < CHAT_ONBOARDING_STEPS.length - 1 ? "Next" : "Let's go"}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

const CHAT_ONBOARDING_STEPS: Array<{
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string;
}> = [
  {
    icon: "chatbubbles-outline",
    title: "Welcome to Glow Chat",
    body: "Your home for coach DMs, squad talk and the World Chat. Tap a chat to open it, or pull this panel up to go fullscreen.",
  },
  {
    icon: "menu-outline",
    title: "Smart sidebar",
    body: "Tap the icons on the left once to expand the sidebar with labels. Tap again to switch tab and collapse it back.",
  },
  {
    icon: "flash-outline",
    title: "Quick replies your way",
    body: "Tap the lightning chip to send a saved reply. Hit + to add your own (up to 8). Long-press a chip to edit or delete.",
  },
  {
    icon: "happy-outline",
    title: "React with one touch",
    body: "Long-press any message to drop a reaction. Reactions appear under the bubble and update live for everyone.",
  },
  {
    icon: "trash-outline",
    title: "Delete your own messages",
    body: "Made a typo? Long-press your own message and choose Delete to remove it for everyone in the chat.",
  },
  {
    icon: "rocket-outline",
    title: "You're all set",
    body: "That's the tour! You can always come back here through Settings if you want a refresher.",
  },
];

type WebScrollHideStyle = {
  scrollbarWidth?: "auto" | "thin" | "none";
  msOverflowStyle?: "auto" | "none";
};
const webHideScrollbar: WebScrollHideStyle =
  Platform.OS === "web" ? { scrollbarWidth: "none", msOverflowStyle: "none" } : {};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "rgba(17, 20, 26, 0.90)",
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    overflow: "hidden",
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
  containerCollapsed: {
    borderTopWidth: 0,
    overflow: "visible",
    backgroundColor: "transparent",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    height: FOOTER_COLLAPSED,
  },
  playerPillRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    height: 60,
  },
  playerTickerPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0D1525EE",
    borderWidth: 1.5,
    borderColor: NEON_GREEN + "99",
    paddingLeft: 8,
    paddingRight: 14,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: NEON_GREEN,
        shadowOpacity: 0.35,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 6 },
    }),
  },
  playerTickerInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  playerTickerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1A2535",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: NEON_GREEN + "44",
  },
  playerTickerAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  playerTickerName: {
    fontSize: 12,
    fontWeight: "700",
    color: NEON_GREEN,
  },
  playerTickerPreview: {
    fontSize: 13,
    color: "#E7ECF5",
    marginTop: 1,
  },
  playerTickerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 8,
  },
  playerTickerBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: NEON_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  playerTickerBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#000",
  },
  dateSeparator: {
    alignItems: "center",
    paddingVertical: 10,
  },
  dateSeparatorText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  viralGlow: {
    borderWidth: 2,
    borderColor: NEON_GREEN,
    shadowColor: NEON_GREEN,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  jumpUnreadPill: {
    position: "absolute",
    right: 16,
    bottom: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: NEON_GREEN,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    zIndex: 50,
    ...Platform.select({
      ios: {
        shadowColor: NEON_GREEN,
        shadowOpacity: 0.5,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 6 },
    }),
  },
  jumpUnreadText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#000",
  },
  quickPhrasesStrip: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  quickPhraseChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "#1A2535",
    borderWidth: 1,
    borderColor: NEON_GREEN + "40",
  },
  quickPhraseChipText: {
    fontSize: 12,
    color: NEON_GREEN,
    fontWeight: "600",
  },
  worldHypeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: "#1A2535",
    borderWidth: 1,
    borderColor: "#FF6B3540",
  },
  worldHypeBtnActive: {
    backgroundColor: "#FF6B3522",
    borderColor: "#FF6B35",
  },
  worldHypeCount: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FF6B35",
  },
  dmChallengeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: NEON_GREEN,
    marginLeft: 8,
  },
  leftPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#11141A",
    borderRadius: 10,
    height: FOOTER_COLLAPSED,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
    paddingLeft: 12,
  },
  pillGap: {
    width: 120,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  rightPill: {
    flex: 1,
    height: FOOTER_COLLAPSED,
    borderRadius: 10,
    backgroundColor: "#11141A",
    justifyContent: "center",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
    paddingLeft: 12,
    paddingRight: 50,
  },
  tickerWindow: {
    flex: 1,
    overflow: "hidden",
    alignSelf: "stretch",
    justifyContent: "center",
  },
  tickerDotOverlay: {
    position: "absolute",
    left: 10,
    top: 0,
    bottom: 0,
    width: 20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  tickerTrack: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    top: 0,
    bottom: 0,
    left: 0,
    width: 9999,
  },
  tickerText: {
    fontSize: 13,
    color: Colors.dark.text,
  },
  collapseBtn: {
    position: "absolute",
    right: 8,
    top: 0,
    bottom: 0,
    width: 46,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  playerFab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: NEON_GREEN,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    shadowColor: NEON_GREEN,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  collapseBadge: {
    position: "absolute",
    top: 8,
    right: 4,
    backgroundColor: Colors.dark.primary,
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  collapseBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    height: FOOTER_COLLAPSED,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    backgroundColor: "transparent",
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
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    backgroundColor: Backgrounds.card,
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
    backgroundColor: Backgrounds.card,
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
    borderBottomColor: "rgba(255, 255, 255, 0.04)" + "40",
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
    position: "relative",
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.dark.background,
    position: "absolute",
    bottom: 0,
    right: 0,
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
    ...webHideScrollbar,
  },
  onboardingBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  onboardingCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#0E1417",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: NEON_GREEN + "55",
    padding: 22,
  },
  onboardingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  onboardingIconBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: NEON_GREEN + "1F",
    borderWidth: 1.5,
    borderColor: NEON_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  onboardingCloseBtn: {
    padding: 6,
    borderRadius: 14,
  },
  onboardingTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 8,
  },
  onboardingBody: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.dark.textSecondary,
    marginBottom: 18,
  },
  onboardingDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: 18,
  },
  onboardingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.textMuted + "55",
  },
  onboardingDotActive: {
    backgroundColor: NEON_GREEN,
    width: 18,
  },
  onboardingActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  onboardingSkipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  onboardingSkipText: {
    color: Colors.dark.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  onboardingNextBtn: {
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: NEON_GREEN,
  },
  onboardingNextText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "700",
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
    backgroundColor: Colors.dark.primary + "25",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
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
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
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
    backgroundColor: Backgrounds.card,
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
  worldMessageRow: {
    width: "100%",
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
    maxWidth: 80,
    flexShrink: 1,
  },
  worldAcademyText: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
    letterSpacing: 0.3,
    flexShrink: 1,
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
  playerAvatarImg: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  playerAvatarInitials: {
    fontSize: 8,
    fontWeight: "800",
    color: Colors.dark.primary,
  },
  profileModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  profileModalSheet: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingBottom: 36,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  profileModalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.primary + "40",
    marginBottom: 20,
  },
  profileModalAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.dark.primary + "25",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: Colors.dark.primary + "60",
    overflow: "hidden",
  },
  profileModalAvatarImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  profileModalAvatarInitials: {
    fontSize: 26,
    fontWeight: "800",
    color: Colors.dark.primary,
  },
  profileModalName: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 0.5,
    marginBottom: 6,
    textAlign: "center",
  },
  profileModalRoleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.dark.primary + "15",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "35",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 24,
  },
  profileModalRoleText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  profileModalActions: {
    width: "100%",
    gap: 10,
    marginBottom: 16,
  },
  blockConfirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    zIndex: 9999,
  },
  blockConfirmCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#FF3B3030",
  },
  blockConfirmTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: 6,
  },
  blockConfirmBody: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 18,
  },
  blockConfirmActions: {
    flexDirection: "row",
    gap: 10,
  },
  blockConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  blockConfirmBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  profileModalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  profileModalBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  profileModalClose: {
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  profileModalCloseText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  horizontalTabStrip: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.primary + "20",
    backgroundColor: Backgrounds.card + "60",
    flexShrink: 0,
  },
  horizontalTabStripContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    gap: 6,
  },
  horizontalTabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  horizontalTabChipActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary + "60",
  },
  horizontalTabChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  horizontalTabChipTextActive: {
    color: Colors.dark.primary,
  },
});
