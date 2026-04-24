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
  Image,
  RefreshControl,
  Modal,
  Alert,
  Text,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { usePlayer } from "@/player/context/PlayerContext";
import { useChatState } from "@/coach/context/ChatStateContext";
import { apiRequest, buildPhotoUrl } from "@/lib/query-client";
import { useWebSocket, type NewMessagePayload, type TypingPayload } from "@/lib/useWebSocket";
import { useChatStickyBottom } from "@/lib/useChatStickyBottom";
import OnlineSafetyModal, { hasShownSafetyReminder } from "@/player/components/OnlineSafetyModal";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const FOOTER_COLLAPSED = 60;
const CHAT_PILL_LIFT = 22;
const FOOTER_EXPANDED = Math.min(SCREEN_HEIGHT * 0.55, 420);

const ONBOARDING_KEY = "@glow_chat_onboarding_seen_v1";

interface Message {
  id: string;
  conversationId: string;
  senderType: string | null;
  senderCoachId: string | null;
  senderPlayerId: string | null;
  senderName?: string | null;
  senderPhotoUrl?: string | null;
  body: string;
  messageType: string | null;
  createdAt: string;
  mentions?: MessageMention[];
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
  providerId?: string | null;
  providerName?: string | null;
  providerPhoto?: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  coachName?: string;
  coachPhoto?: string | null;
  playerName?: string | null;
  playerPhoto?: string | null;
  otherPlayerId?: string | null;
  otherPlayerUserId?: string | null;
  unreadCount?: number;
  seriesDayOfWeek?: number | null;
  seriesStartTime?: string | null;
}

interface ChatRoom {
  id: string;
  scope: string;
  countryCode: string | null;
  title: string;
  flag: string | null;
  mutedAt?: string | null;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
}

interface MessageMention {
  handle: string;
  playerId: string;
  name: string;
}

interface RoomMessage {
  id: string;
  body: string;
  messageType: string | null;
  createdAt: string;
  senderType: string | null;
  senderCoachId: string | null;
  senderPlayerId: string | null;
  senderName?: string;
  senderPhotoUrl?: string | null;
  senderCountry?: string | null;
  senderFlag?: string | null;
  academyName?: string;
  reactions?: Array<{
    id: string;
    emoji: string;
    reactorPlayerId: string | null;
    reactorCoachId: string | null;
  }>;
  isPinned?: boolean;
  mentions?: MessageMention[];
}

interface PinAllowance {
  canPin: boolean;
  remaining: number;
  alreadyPinnedMessageId: string | null;
  weekStart: string;
  reason: string | null;
}

const REACTION_EMOJIS = ["👍", "❤️", "🔥", "🎾", "🏆"];
const TAB_BAR_HEIGHT = 85;

type ChatTab = "world" | "players" | "coaches" | "academy" | "groups";

const CHAT_TABS: { id: ChatTab; name: string; icon: keyof typeof Ionicons.glyphMap; types: string[] }[] = [
  { id: "world", name: "World", icon: "globe-outline", types: [] },
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

function renderWithMentions(
  body: string,
  baseStyle: any,
  mentionStyle: any,
  mentions: MessageMention[] | undefined,
  onMentionPress: (playerId: string) => void,
) {
  const map = new Map<string, MessageMention>();
  for (const m of mentions || []) map.set(m.handle.toLowerCase(), m);
  const parts = body.split(/(@[\w][\w._-]{1,30})/g);
  return parts.map((part, i) => {
    if (part.startsWith("@") && part.length > 1) {
      const handle = part.slice(1);
      const match = map.get(handle.toLowerCase());
      if (match) {
        return (
          <Text
            key={i}
            style={mentionStyle}
            onPress={() => onMentionPress(match.playerId)}
            suppressHighlighting
          >
            {part}
          </Text>
        );
      }
      return (
        <Text key={i} style={mentionStyle}>
          {part}
        </Text>
      );
    }
    return (
      <Text key={i} style={baseStyle}>
        {part}
      </Text>
    );
  });
}

function parseMatchInvite(body: string): null | {
  title: string;
  date: string;
  time?: string;
  location?: string;
  sport?: string;
  level?: string;
} {
  if (!body.startsWith("[match_invite]")) return null;
  try {
    return JSON.parse(body.slice("[match_invite]".length));
  } catch {
    return null;
  }
}

export function PlayerChatFooter() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT;
  const queryClient = useQueryClient();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { isMinor, chatEnabled } = usePlayer();
  const { setChatExpanded, chatTarget, consumeChatTarget } = useChatState();
  const playerId = user?.playerId;
  const isCoachUser = !!user?.coachId;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map());
  const [currentTab, setCurrentTab] = useState<ChatTab>("world");
  const [showNewPlayerChat, setShowNewPlayerChat] = useState(false);
  const [academyConvCreated, setAcademyConvCreated] = useState<Conversation | null>(null);
  const [failedAvatarIds, setFailedAvatarIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [pinPromo, setPinPromo] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const roomListRef = useRef<FlatList>(null);
  const didScrollToTargetRef = useRef<string | null>(null);
  const didScrollToConvTargetRef = useRef<string | null>(null);
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
  }, [queryClient]);

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

  const handleWorldMessage = useCallback((payload: unknown) => {
    const p = payload as { kind?: string; roomId?: string } | null;
    if (!p) return;
    if (p.kind === "chat_room_message" || p.kind === "chat_room_reaction") {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-rooms"] });
      if (p.roomId) {
        queryClient.invalidateQueries({ queryKey: ["/api/chat-rooms", p.roomId, "messages"] });
      }
    }
  }, [queryClient]);

  const { isConnected, sendTyping } = useWebSocket({
    onNewMessage: handleNewMessage,
    onTyping: handleTyping,
    onWorldMessage: handleWorldMessage,
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
    const isMentionableSurface =
      !!selectedRoom || selectedConversation?.type === "player_player";
    if (isMentionableSurface) {
      const match = text.match(/(?:^|\s)@(\w*)$/);
      setMentionQuery(match ? match[1].toLowerCase() : null);
    } else {
      setMentionQuery(null);
    }
  }, [selectedConversation, selectedRoom, isConnected, sendTyping]);

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

  // ── World/chat-rooms queries ──
  const { data: chatRooms = [] } = useQuery<ChatRoom[]>({
    queryKey: ["/api/chat-rooms"],
    enabled: !!playerId && currentTab === "world",
  });

  const { data: roomDetails } = useQuery<ChatRoom>({
    queryKey: ["/api/chat-rooms", selectedRoom?.id],
    enabled: !!selectedRoom?.id,
  });

  const { data: roomMessages = [], isLoading: loadingRoomMessages } = useQuery<RoomMessage[]>({
    queryKey: ["/api/chat-rooms", selectedRoom?.id, "messages"],
    enabled: !!selectedRoom?.id,
    refetchInterval: isConnected ? 30000 : 8000,
  });

  const isCountryRoom = (selectedRoom?.scope ?? roomDetails?.scope) === "country";
  const showPinAllowanceQuery = isCoachUser && isCountryRoom;
  const { data: pinAllowance } = useQuery<PinAllowance>({
    queryKey: ["/api/chat-rooms", selectedRoom?.id, "pin-allowance"],
    enabled: !!selectedRoom?.id && showPinAllowanceQuery,
  });

  const isPlayerDm = selectedConversation?.type === "player_player";
  const { data: friendsData } = useQuery<{ friends?: Array<{ id: string; name: string }> }>({
    queryKey: ["/api/player/me/friends"],
    staleTime: 60_000,
    enabled: !!selectedRoom?.id || isPlayerDm,
  });

  const mentionCandidates = useMemo(() => {
    const map = new Map<string, { name: string; source: "friend" | "recent" }>();
    for (const f of friendsData?.friends || []) {
      if (!f?.name) continue;
      const handle = f.name.replace(/\s+/g, "");
      if (handle.length > 0 && !map.has(handle)) {
        map.set(handle, { name: f.name, source: "friend" });
      }
    }
    const recentSource: Array<{ senderName?: string | null }> = selectedRoom
      ? roomMessages
      : messages;
    for (let i = recentSource.length - 1; i >= 0 && map.size < 24; i--) {
      const m = recentSource[i];
      if (m.senderName) {
        const handle = m.senderName.replace(/\s+/g, "");
        if (handle.length > 0 && !map.has(handle)) {
          map.set(handle, { name: m.senderName, source: "recent" });
        }
      }
    }
    return Array.from(map.entries()).map(([handle, v]) => ({
      handle,
      name: v.name,
      source: v.source,
    }));
  }, [friendsData, roomMessages, messages, selectedRoom]);

  const showPinAffordance =
    isCoachUser &&
    isCountryRoom &&
    !!pinAllowance &&
    (pinAllowance.canPin || !!pinAllowance.alreadyPinnedMessageId);

  useEffect(() => {
    if (pinAllowance && !pinAllowance.canPin && pinPromo) setPinPromo(false);
  }, [pinAllowance, pinPromo]);

  // ── Mutations ──
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

  // ── Room mutations ──
  const roomSendMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!selectedRoom?.id) throw new Error("No room");
      const res = await apiRequest("POST", `/api/chat-rooms/${selectedRoom.id}/messages`, payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      setInputText("");
      setMentionQuery(null);
      queryClient.invalidateQueries({ queryKey: ["/api/chat-rooms", selectedRoom?.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat-rooms", selectedRoom?.id, "pin-allowance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat-rooms"] });
      setTimeout(() => roomListRef.current?.scrollToEnd({ animated: true }), 50);
      if (data?.pinDenied) {
        Alert.alert("Promo not pinned", String(data.pinDenied));
      }
    },
    onError: (e: any) => {
      Alert.alert("Could not send", e?.message || "Try again");
    },
  });

  const roomReactMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const res = await apiRequest("POST", `/api/chat-rooms/messages/${messageId}/reactions`, { emoji });
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/chat-rooms", selectedRoom?.id, "messages"] }),
  });

  const muteMutation = useMutation({
    mutationFn: async (hours: number | null) => {
      if (!selectedRoom?.id) return;
      if (hours === null) {
        await apiRequest("DELETE", `/api/chat-rooms/${selectedRoom.id}/mute`);
      } else {
        await apiRequest("POST", `/api/chat-rooms/${selectedRoom.id}/mute`, { hours });
      }
    },
  });

  const reportMutation = useMutation({
    mutationFn: async ({ messageId, reason }: { messageId: string; reason: string }) => {
      await apiRequest("POST", `/api/chat-rooms/messages/${messageId}/report`, { reason });
    },
    onSuccess: () => Alert.alert("Reported", "Thanks — our team will review."),
  });

  const handleSelectConversation = useCallback((conv: Conversation) => {
    if (conv.type === "provider_player") {
      setIsExpanded(false);
      setIsFullscreen(false);
      navigation.navigate("PlayerBookingChat", { conversationId: conv.id });
      return;
    }
    setSelectedRoom(null);
    setSelectedConversation(conv);
  }, [navigation]);

  const handleSelectRoom = useCallback((room: ChatRoom) => {
    setSelectedConversation(null);
    setSelectedRoom(room);
    setInputText("");
    setMentionQuery(null);
    didScrollToTargetRef.current = null;
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["/api/player/me/conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/chat-rooms"] });
      if (selectedConversation?.id) {
        await queryClient.invalidateQueries({
          queryKey: ["/api/player/me/conversations", selectedConversation.id, "messages"],
        });
      }
      if (selectedRoom?.id) {
        await queryClient.invalidateQueries({
          queryKey: ["/api/chat-rooms", selectedRoom.id, "messages"],
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, selectedConversation?.id, selectedRoom?.id]);

  useEffect(() => {
    const safeFullscreenHeight = SCREEN_HEIGHT - insets.top - tabBarHeight;
    const targetHeight = isFullscreen
      ? safeFullscreenHeight
      : isExpanded
        ? FOOTER_EXPANDED
        : FOOTER_COLLAPSED;
    height.value = withSpring(targetHeight, { damping: 20, stiffness: 200 });
  }, [isExpanded, isFullscreen, insets.top, tabBarHeight, height]);

  useEffect(() => {
    setChatExpanded(isExpanded || isFullscreen);
  }, [isExpanded, isFullscreen, setChatExpanded]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  useEffect(() => {
    if (selectedConversation?.id) {
      markAsReadMutation.mutate(selectedConversation.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.id]);

  useEffect(() => {
    if (isMinor && (isExpanded || isFullscreen) && !hasShownSafetyReminder()) {
      setShowSafetyModal(true);
    }
  }, [isMinor, isExpanded, isFullscreen]);

  // One-time onboarding tooltip
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((v) => {
        setOnboardingChecked(true);
        if (v !== "true") {
          // Show only when the user actually opens the chat
        }
      })
      .catch(() => setOnboardingChecked(true));
  }, []);

  useEffect(() => {
    if (onboardingChecked && (isExpanded || isFullscreen) && !showOnboarding) {
      AsyncStorage.getItem(ONBOARDING_KEY).then((v) => {
        if (v !== "true") setShowOnboarding(true);
      }).catch(() => {});
    }
  }, [onboardingChecked, isExpanded, isFullscreen, showOnboarding]);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    AsyncStorage.setItem(ONBOARDING_KEY, "true").catch(() => {});
  }, []);

  // Apply external chat target requests.
  // For conversation targets we DEFER consumption until the conversation list
  // has loaded (and the requested conversation is present). For room targets
  // we can apply immediately because we synthesize a placeholder room.
  useEffect(() => {
    if (!chatTarget) return;
    if (chatTarget.conversationId) {
      const conv = conversations.find((c) => c.id === chatTarget.conversationId);
      if (!conv) {
        // Wait for conversations query to populate before consuming.
        return;
      }
    }
    const target = consumeChatTarget();
    if (!target) return;
    setIsExpanded(true);
    if (target.fullscreen) setIsFullscreen(true);
    if (target.tab) {
      const requested = target.tab === "auto" ? "world" : (target.tab as ChatTab);
      setCurrentTab(restrictChat && requested === "world" ? "coaches" : requested);
    }
    if (target.roomId) {
      if (restrictChat) {
        // Minor with chat disabled — never enter world rooms.
        setCurrentTab("coaches");
        return;
      }
      setCurrentTab("world");
      setSelectedConversation(null);
      const room = chatRooms.find((r) => r.id === target.roomId);
      if (room) {
        setSelectedRoom(room);
      } else {
        setSelectedRoom({
          id: target.roomId,
          scope: "world",
          countryCode: null,
          title: "Room",
          flag: null,
        });
      }
      didScrollToTargetRef.current = target.scrollToMessageId ?? null;
    } else if (target.conversationId) {
      const conv = conversations.find((c) => c.id === target.conversationId);
      if (conv) {
        setSelectedRoom(null);
        const matchTab = CHAT_TABS.find((tab) => tab.types.includes(conv.type));
        if (matchTab) setCurrentTab(matchTab.id);
        setSelectedConversation(conv);
        didScrollToConvTargetRef.current = target.scrollToMessageId ?? null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatTarget, conversations]);

  // Scroll to a target message id when room messages arrive
  useEffect(() => {
    const targetId = didScrollToTargetRef.current;
    if (!targetId || !selectedRoom?.id || roomMessages.length === 0) return;
    const idx = roomMessages.findIndex((m) => m.id === targetId);
    if (idx >= 0) {
      didScrollToTargetRef.current = null;
      try {
        setTimeout(() => {
          roomListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
        }, 200);
      } catch {
        roomListRef.current?.scrollToEnd({ animated: false });
      }
    }
  }, [roomMessages, selectedRoom?.id]);

  // Scroll to a target message id when conversation messages arrive (deep links)
  useEffect(() => {
    const targetId = didScrollToConvTargetRef.current;
    if (!targetId || !selectedConversation?.id || messages.length === 0) return;
    const idx = messages.findIndex((m) => m.id === targetId);
    if (idx >= 0) {
      didScrollToConvTargetRef.current = null;
      try {
        setTimeout(() => {
          stick.ref.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
        }, 200);
      } catch {
        stick.scrollToBottom(false);
      }
    }
  }, [messages, selectedConversation?.id, stick]);

  const handleSend = useCallback(() => {
    if (!inputText.trim()) return;
    if (selectedRoom) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const mentions = Array.from(inputText.matchAll(/@([\w][\w._-]{1,30})/g)).map((m) => m[1]);
      roomSendMutation.mutate({
        body: inputText.trim(),
        messageType: "text",
        mentions,
        pinPromo: pinPromo || undefined,
      });
      setPinPromo(false);
      return;
    }
    if (selectedConversation) {
      sendMessageMutation.mutate(inputText.trim());
      setInputText("");
      setTimeout(() => stick.scrollToBottom(true), 100);
    }
  }, [inputText, selectedRoom, selectedConversation, pinPromo, roomSendMutation, sendMessageMutation, stick]);

  const insertMention = useCallback(
    (handle: string) => {
      const replaced = inputText.replace(/(?:^|\s)@(\w*)$/, (m) => {
        const lead = m.startsWith(" ") ? " " : "";
        return `${lead}@${handle} `;
      });
      setInputText(replaced);
      setMentionQuery(null);
    },
    [inputText],
  );

  const handleMuteRoom = useCallback(() => {
    Alert.alert("Mute this room", "How long?", [
      { text: "1 hour", onPress: () => muteMutation.mutate(1) },
      { text: "24 hours", onPress: () => muteMutation.mutate(24) },
      { text: "Forever", onPress: () => muteMutation.mutate(0) },
      { text: "Unmute", onPress: () => muteMutation.mutate(null) },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [muteMutation]);

  const handleRoomLongPress = useCallback(
    (msg: RoomMessage) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const buttons: any[] = REACTION_EMOJIS.map((emoji) => ({
        text: emoji,
        onPress: () => roomReactMutation.mutate({ messageId: msg.id, emoji }),
      }));
      buttons.push({
        text: "Report message",
        style: "destructive",
        onPress: () =>
          reportMutation.mutate({ messageId: msg.id, reason: "Inappropriate content" }),
      });
      buttons.push({ text: "Cancel", style: "cancel" });
      Alert.alert("Message", msg.senderName || "", buttons);
    },
    [roomReactMutation, reportMutation],
  );

  const handleSubmitInvite = useCallback((payload: { title: string; date: string; time?: string; location?: string; level?: string }) => {
    setShowInvite(false);
    if (!selectedRoom) return;
    roomSendMutation.mutate({
      body: `[match_invite]${JSON.stringify(payload)}`,
      messageType: "match_invite",
      matchInvite: payload,
    });
  }, [selectedRoom, roomSendMutation]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatRelativeTime = (dateString: string | null | undefined) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: "short" });
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const getSenderDisplayName = (item: Message): string => {
    if (item.senderName) return item.senderName;
    if (item.senderType === "coach") return selectedConversation?.coachName ?? "Coach";
    if (item.senderType === "player") return selectedConversation?.playerName ?? "Player";
    return "User";
  };

  const getSenderPhotoUrl = (item: Message): string | null => {
    if (item.senderPhotoUrl) return buildPhotoUrl(item.senderPhotoUrl);
    if (item.senderType === "coach") return buildPhotoUrl(selectedConversation?.coachPhoto);
    if (item.senderType === "player") return buildPhotoUrl(selectedConversation?.playerPhoto);
    return null;
  };

  const typingDisplayName = (() => {
    if (!selectedConversation) return null;
    if (selectedConversation.type === "coach_player") {
      return selectedConversation.coachName || "Coach";
    }
    if (selectedConversation.type === "player_player") {
      return selectedConversation.playerName || "Player";
    }
    return "Someone";
  })();

  const unreadCount = unreadData?.unreadCount || 0;
  const latestConversation = conversations[0];

  const currentTabConfig = CHAT_TABS.find(c => c.id === currentTab);
  const restrictChat = isMinor && !chatEnabled;
  const filteredConversations = conversations.filter(conv => {
    if (!(currentTabConfig?.types.includes(conv.type) ?? false)) return false;
    if (restrictChat && conv.type !== "coach_player" && conv.type !== "academy") return false;
    return true;
  });

  const handleTabChange = (tab: ChatTab) => {
    setCurrentTab(tab);
    setShowNewPlayerChat(false);
    if (tab !== "world") {
      setSelectedRoom(null);
    }
    if (selectedConversation && tab !== "world" && !CHAT_TABS.find(c => c.id === tab)?.types.includes(selectedConversation.type)) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab, conversations, selectedConversation, createConversationMutation.isPending, academyConvCreated]);

  const handleStartPlayerChat = (player: OtherPlayer) => {
    const existingConv = conversations.find(c =>
      c.type === "player_player" &&
      (c.otherPlayerId === player.id || c.playerId === player.id)
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

  const visibleTabs = useMemo(
    () => (restrictChat ? CHAT_TABS.filter((t) => t.id !== "world") : CHAT_TABS),
    [restrictChat],
  );

  // If a minor with chat disabled lands on world (e.g. from initial state or
  // a stale deep link), bounce them to the first allowed tab.
  useEffect(() => {
    if (restrictChat && currentTab === "world") {
      setCurrentTab(visibleTabs[0]?.id ?? "coaches");
      setSelectedRoom(null);
    }
  }, [restrictChat, currentTab, visibleTabs]);

  const renderTabBar = () => (
    <View style={styles.tabBarContainer}>
      {visibleTabs.map((tab) => (
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

    const senderPhoto = !isOwn ? getSenderPhotoUrl(item) : null;
    const senderAvatarKey = `msg-avatar:${item.id}`;
    const senderShowImage = senderPhoto && !failedAvatarIds.has(senderAvatarKey);

    return (
      <Pressable
        onLongPress={() => setShowReactions(showReactions === item.id ? null : item.id)}
        style={[styles.messageBubble, isOwn ? styles.ownMessage : styles.otherMessage]}
      >
        {!isOwn ? (
          <View style={styles.senderInfo}>
            {senderShowImage ? (
              <Image
                source={{ uri: senderPhoto! }}
                style={styles.senderAvatarImage}
                onError={() => markAvatarFailed(senderAvatarKey)}
              />
            ) : (
              <View style={styles.coachAvatar}>
                <Ionicons
                  name={item.senderType === "coach" ? "ribbon" : "person"}
                  size={12}
                  color={Colors.dark.primary}
                />
              </View>
            )}
            <ThemedText style={styles.senderName}>{getSenderDisplayName(item)}</ThemedText>
          </View>
        ) : null}
        <Text style={styles.messageText}>
          {renderWithMentions(
            item.body,
            styles.messageText,
            styles.mentionText,
            item.mentions,
            (mentionPlayerId) => {
              Haptics.selectionAsync();
              navigation.navigate("PublicProfile", { playerId: mentionPlayerId });
            },
          )}
        </Text>
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
                <ThemedText style={styles.reactionEmoji}>{emoji}</ThemedText>
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
                <ThemedText style={styles.reactionPickerEmoji}>{emoji}</ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Pressable>
    );
  };

  const renderRoomMessage = ({ item }: { item: RoomMessage }) => {
    const invite = item.messageType === "match_invite" ? parseMatchInvite(item.body) : null;
    const isCoach = item.senderType === "coach";
    return (
      <Pressable onLongPress={() => handleRoomLongPress(item)} style={styles.roomMessageRow}>
        <View style={styles.roomAvatar}>
          <Text style={styles.roomAvatarTxt}>
            {item.senderFlag || (isCoach ? "🎾" : "👤")}
          </Text>
        </View>
        <View style={styles.roomMessageBody}>
          <View style={styles.roomMessageHeader}>
            <Text style={styles.roomSenderName} numberOfLines={1}>
              {item.senderName || "Player"}
              {isCoach ? " · Coach" : ""}
            </Text>
            {item.academyName ? (
              <Text style={styles.roomAcademyName} numberOfLines={1}>
                {item.academyName}
              </Text>
            ) : null}
          </View>
          {item.isPinned ? (
            <View style={styles.pinnedBadge}>
              <Ionicons name="pin" size={11} color="#FBBF24" />
              <Text style={styles.pinnedText}>Pinned this week</Text>
            </View>
          ) : null}
          {invite ? (
            <View style={styles.inviteCard}>
              <View style={styles.inviteHeader}>
                <Ionicons name="tennisball" size={14} color={Colors.dark.primary} />
                <Text style={styles.inviteTitle}>{invite.title}</Text>
              </View>
              <Text style={styles.inviteMeta}>
                {invite.date}
                {invite.time ? ` · ${invite.time}` : ""}
                {invite.location ? ` · ${invite.location}` : ""}
              </Text>
              {invite.level ? <Text style={styles.inviteMeta}>Level: {invite.level}</Text> : null}
              <Pressable
                style={styles.inviteBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("PlayerTabs", {
                    screen: "PlayStack",
                    params: { screen: "CreateMatch" },
                  });
                }}
              >
                <Text style={styles.inviteBtnTxt}>I&apos;m in</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.roomMessageText}>
              {renderWithMentions(
                item.body,
                styles.roomMessageText,
                styles.mentionText,
                item.mentions,
                (mentionPlayerId) => {
                  Haptics.selectionAsync();
                  navigation.navigate("PublicProfile", { playerId: mentionPlayerId });
                },
              )}
            </Text>
          )}
          {item.reactions && item.reactions.length > 0 ? (
            <View style={styles.roomReactionsRow}>
              {Object.entries(
                item.reactions.reduce<Record<string, number>>((acc, r) => {
                  acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                  return acc;
                }, {}),
              ).map(([emoji, count]) => (
                <View key={emoji} style={styles.roomReactionChip}>
                  <Text style={styles.roomReactionEmoji}>{emoji}</Text>
                  <Text style={styles.roomReactionCount}>{count}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const renderRoomList = () => (
    <View style={styles.worldListContainer}>
      <Pressable
        style={styles.browseRoomsRow}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("BrowseChatRooms");
        }}
      >
        <View style={styles.browseIcon}>
          <Ionicons name="search" size={18} color={Colors.dark.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.browseTitle}>Browse rooms</Text>
          <Text style={styles.browseSub}>Find chat rooms by country</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
      </Pressable>
      <FlatList
        data={chatRooms}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.worldRoomRow}
            onPress={() => handleSelectRoom(item)}
          >
            <View style={styles.worldFlagBox}>
              <Text style={styles.worldFlagTxt}>{item.flag || "🌍"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.worldRoomTitle}>{item.title}</Text>
              <Text style={styles.worldRoomPreview} numberOfLines={1}>
                {item.lastMessagePreview ||
                  (item.scope === "world" ? "Global chat" : "Country chat")}
              </Text>
            </View>
            {item.lastMessageAt ? (
              <Text style={styles.worldRoomTime}>{formatRelativeTime(item.lastMessageAt)}</Text>
            ) : null}
          </Pressable>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.dark.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="globe-outline" size={40} color={Colors.dark.tabIconDefault} />
            <ThemedText style={styles.emptyText}>Join the global tennis chat</ThemedText>
            <Pressable
              style={styles.browseEmptyBtn}
              onPress={() => navigation.navigate("BrowseChatRooms")}
            >
              <Text style={styles.browseEmptyBtnTxt}>Browse rooms</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );

  const renderRoomView = () => {
    if (!selectedRoom) return null;
    const room = roomDetails || selectedRoom;
    return (
      <View style={styles.chatView}>
        <View style={styles.roomHeader}>
          <Pressable
            onPress={() => setSelectedRoom(null)}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.roomHeaderCenter}>
            <Text style={styles.roomHeaderTitle} numberOfLines={1}>
              {room.flag ? `${room.flag} ` : ""}
              {room.title}
            </Text>
            <Text style={styles.roomHeaderSub}>
              {room.scope === "world" ? "Global chat · all players" : "Country chat"}
            </Text>
          </View>
          <Pressable onPress={handleMuteRoom} style={styles.iconBtn}>
            <Ionicons name="notifications-off-outline" size={20} color={Colors.dark.text} />
          </Pressable>
        </View>

        {room.mutedAt ? (
          <View style={styles.mutedBanner}>
            <Ionicons name="lock-closed" size={14} color="#fff" />
            <Text style={styles.mutedBannerText}>
              This room is muted by a moderator.
            </Text>
          </View>
        ) : null}

        {loadingRoomMessages ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={Colors.dark.primary} />
          </View>
        ) : (
          <FlatList
            ref={roomListRef}
            data={roomMessages}
            keyExtractor={(m) => m.id}
            renderItem={renderRoomMessage}
            contentContainerStyle={[styles.roomListContent, { paddingBottom: 12 }]}
            onContentSizeChange={() => {
              if (!didScrollToTargetRef.current) {
                roomListRef.current?.scrollToEnd({ animated: false });
              }
            }}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                try {
                  roomListRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0.5 });
                } catch {
                  roomListRef.current?.scrollToEnd({ animated: false });
                }
              }, 200);
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={36} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTxt}>Be the first to say hi!</Text>
              </View>
            }
          />
        )}

        {mentionQuery !== null && mentionCandidates.length > 0 ? (
          <View style={styles.mentionDropdown}>
            <FlatList
              data={mentionCandidates.filter((c) => c.handle.toLowerCase().includes(mentionQuery))}
              keyExtractor={(c) => c.handle}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable style={styles.mentionItem} onPress={() => insertMention(item.handle)}>
                  <Ionicons name="at" size={14} color={Colors.dark.primary} />
                  <Text style={styles.mentionItemTxt}>{item.name}</Text>
                  {item.source === "friend" ? (
                    <View style={styles.mentionFriendBadge}>
                      <Text style={styles.mentionFriendBadgeTxt}>Friend</Text>
                    </View>
                  ) : null}
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.mentionItem}>
                  <Text style={styles.mentionItemTxt}>No matches</Text>
                </View>
              }
            />
          </View>
        ) : null}

        {showPinAffordance && pinAllowance ? (
          <View style={styles.pinRow}>
            <Pressable
              onPress={() => {
                if (!pinAllowance.canPin) return;
                setPinPromo((v) => !v);
                Haptics.selectionAsync();
              }}
              disabled={!pinAllowance.canPin}
              style={[
                styles.pinToggle,
                pinPromo && pinAllowance.canPin && styles.pinToggleActive,
                !pinAllowance.canPin && styles.pinToggleDisabled,
              ]}
            >
              <Ionicons
                name="pin"
                size={12}
                color={pinPromo && pinAllowance.canPin ? "#FBBF24" : Colors.dark.textSecondary}
              />
              <Text
                style={[
                  styles.pinToggleTxt,
                  pinPromo && pinAllowance.canPin && styles.pinToggleTxtActive,
                ]}
              >
                {pinAllowance.canPin
                  ? `Pin promo · ${pinAllowance.remaining} left this week`
                  : pinAllowance.reason === "already_pinned_this_week"
                    ? "Pinned this week · 0 left"
                    : "Pin promo unavailable"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.roomComposer}>
          <Pressable
            style={styles.roomActionBtn}
            onPress={() => setShowInvite(true)}
            accessibilityLabel="Invite to match"
          >
            <Ionicons name="add-circle" size={26} color={Colors.dark.primary} />
          </Pressable>
          <TextInput
            style={styles.roomInput}
            placeholder="Send a message…  Type @ to mention"
            placeholderTextColor={Colors.dark.textMuted}
            value={inputText}
            onChangeText={handleInputChange}
            multiline
            maxLength={2000}
          />
          <Pressable
            style={[styles.roomSendBtn, !inputText.trim() && styles.roomSendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || roomSendMutation.isPending}
          >
            <Ionicons name="send" size={18} color="#000" />
          </Pressable>
        </View>

        <MatchInviteModal
          visible={showInvite}
          onClose={() => setShowInvite(false)}
          onSubmit={handleSubmitInvite}
        />
      </View>
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
      ) : (
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
                  {selectedRoom
                    ? (selectedRoom.title || "Room")
                    : selectedConversation
                      ? (selectedConversation.coachName || "Coach")
                      : "GLOW Chat"}
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
          {showOnboarding ? (
            <Pressable style={styles.onboardingTooltip} onPress={dismissOnboarding}>
              <Ionicons name="sparkles-outline" size={16} color={Colors.dark.primary} />
              <Text style={styles.onboardingText}>
                Tap World for global chat, swipe up for fullscreen.
              </Text>
              <Ionicons name="close" size={16} color={Colors.dark.textMuted} />
            </Pressable>
          ) : null}
          {currentTab === "world" ? (
            selectedRoom ? renderRoomView() : renderRoomList()
          ) : showNewPlayerChat ? (
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
              {isOtherTyping && typingDisplayName ? (
                <View style={styles.typingIndicator}>
                  <ThemedText style={styles.typingText}>{typingDisplayName} is typing...</ThemedText>
                </View>
              ) : null}
              {isPlayerDm && mentionQuery !== null && mentionCandidates.length > 0 ? (
                <View style={styles.mentionDropdown}>
                  <FlatList
                    data={mentionCandidates.filter((c) => c.handle.toLowerCase().includes(mentionQuery))}
                    keyExtractor={(c) => c.handle}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <Pressable style={styles.mentionItem} onPress={() => insertMention(item.handle)}>
                        <Ionicons name="at" size={14} color={Colors.dark.primary} />
                        <Text style={styles.mentionItemTxt}>{item.name}</Text>
                        {item.source === "friend" ? (
                          <View style={styles.mentionFriendBadge}>
                            <Text style={styles.mentionFriendBadgeTxt}>Friend</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    )}
                    ListEmptyComponent={
                      <View style={styles.mentionItem}>
                        <Text style={styles.mentionItemTxt}>No matches</Text>
                      </View>
                    }
                  />
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
              {restrictChat ? (
                <View style={styles.restrictedBanner}>
                  <Ionicons name="shield-checkmark" size={16} color="#00BCD4" />
                  <ThemedText style={styles.restrictedText}>
                    You can chat with your coach. Ask a parent to enable player-to-player chat.
                  </ThemedText>
                </View>
              ) : null}
              {loadingConversations ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={Colors.dark.primary} />
                </View>
              ) : (
                <FlatList
                  data={filteredConversations.length > 0 ? filteredConversations : (currentTab === "coaches" || currentTab === "academy" ? conversations.filter(c => !restrictChat || c.type === "coach_player" || c.type === "academy") : [])}
                  keyExtractor={(item) => item.id}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={handleRefresh}
                      tintColor={Colors.dark.primary}
                    />
                  }
                  renderItem={({ item }) => {
                    const groupSubtitle = currentTab === "groups" ? formatGroupSubtitle(item, i18n.language) : null;
                    const hasUnread = (item.unreadCount ?? 0) > 0;
                    return (
                      <Pressable
                        onPress={() => handleSelectConversation(item)}
                        style={styles.conversationItem}
                      >
                        <View style={styles.conversationAvatarWrap}>
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
                          {hasUnread ? <View style={styles.conversationUnreadDot} /> : null}
                        </View>
                        <View style={styles.conversationInfo}>
                          <View style={styles.conversationHeaderRow}>
                            <ThemedText style={[styles.conversationName, hasUnread && styles.conversationNameUnread]} numberOfLines={1}>
                              {(currentTab === "players" ? item.playerName : null) || item.coachName || item.title || (currentTab === "coaches" ? "Coach" : currentTab === "academy" ? "Academy" : "Chat")}
                            </ThemedText>
                            {item.lastMessageAt ? (
                              <ThemedText style={styles.conversationTime}>
                                {formatRelativeTime(item.lastMessageAt)}
                              </ThemedText>
                            ) : null}
                          </View>
                          {groupSubtitle ? (
                            <ThemedText numberOfLines={1} style={styles.conversationPreview}>
                              {groupSubtitle}
                            </ThemedText>
                          ) : item.lastMessagePreview ? (
                            <ThemedText numberOfLines={1} style={[styles.conversationPreview, hasUnread && styles.conversationPreviewUnread]}>
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

      <OnlineSafetyModal
        visible={showSafetyModal}
        onAccept={() => setShowSafetyModal(false)}
      />
    </Animated.View>
  );
}

function MatchInviteModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (p: { title: string; date: string; time?: string; location?: string; level?: string }) => void;
}) {
  const [title, setTitle] = useState("Looking for a match");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [level, setLevel] = useState("");
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Invite to a match</Text>
          <Text style={styles.modalLabel}>What kind?</Text>
          <TextInput style={styles.modalInput} value={title} onChangeText={setTitle} placeholder="Friendly singles" placeholderTextColor={Colors.dark.textMuted} />
          <Text style={styles.modalLabel}>When</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput style={[styles.modalInput, { flex: 1 }]} value={date} onChangeText={setDate} placeholder="Sat May 3" placeholderTextColor={Colors.dark.textMuted} />
            <TextInput style={[styles.modalInput, { flex: 1 }]} value={time} onChangeText={setTime} placeholder="18:00" placeholderTextColor={Colors.dark.textMuted} />
          </View>
          <Text style={styles.modalLabel}>Where</Text>
          <TextInput style={styles.modalInput} value={location} onChangeText={setLocation} placeholder="Court / area" placeholderTextColor={Colors.dark.textMuted} />
          <Text style={styles.modalLabel}>Level (optional)</Text>
          <TextInput style={styles.modalInput} value={level} onChangeText={setLevel} placeholder="Green / Yellow / 4.0" placeholderTextColor={Colors.dark.textMuted} />
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={[styles.modalBtn, styles.modalCancel]}>
              <Text style={styles.modalCancelTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!date.trim()) {
                  Alert.alert("Date required");
                  return;
                }
                onSubmit({
                  title: title || "Looking for a match",
                  date,
                  time: time || undefined,
                  location: location || undefined,
                  level: level || undefined,
                });
              }}
              style={[styles.modalBtn, styles.modalPost]}
            >
              <Text style={styles.modalPostTxt}>Post invite</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  pillGap: { width: 82 },
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
  rightPillBadgeText: { fontSize: 10, fontWeight: "700", color: Colors.dark.backgroundRoot },
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
  headerLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
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
  unreadText: { fontSize: 10, fontWeight: "700", color: Colors.dark.buttonText },
  headerTitle: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  headerPreview: { fontSize: 12, color: Colors.dark.textMuted, maxWidth: 200 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  connectionStatus: { padding: 4 },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  expandButton: { padding: Spacing.sm },
  content: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  conversationList: { flex: 1 },
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
  conversationInfo: { flex: 1 },
  conversationName: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  conversationPreview: { fontSize: 12, color: Colors.dark.textMuted, marginTop: 2 },
  chatView: { flex: 1 },
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
  safetyBannerText: { fontSize: 11, color: "#4FC3F7", fontWeight: "500" },
  backButton: { padding: Spacing.sm, marginRight: Spacing.sm },
  chatTitle: { fontSize: 16, fontWeight: "600", color: Colors.dark.text },
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
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  messageList: { padding: Spacing.md, flexGrow: 1 },
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
  senderName: { fontSize: 11, fontWeight: "600", color: Colors.dark.primary },
  messageText: { fontSize: 14, color: Colors.dark.text },
  timestamp: { fontSize: 10, color: Colors.dark.textMuted, marginTop: Spacing.xs, alignSelf: "flex-end" },
  reactions: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: Spacing.xs },
  reactionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: Colors.dark.backgroundDefault,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  reactionCount: { fontSize: 10, color: Colors.dark.text },
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
  reactionOption: { padding: 4 },
  systemMessage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    padding: Spacing.sm,
    marginVertical: Spacing.sm,
  },
  systemText: { fontSize: 12, color: Colors.dark.textMuted, fontStyle: "italic" },
  typingIndicator: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs },
  typingText: { fontSize: 12, color: Colors.dark.primary, fontStyle: "italic" },
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
  sendButtonDisabled: { opacity: 0.5 },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
    minHeight: 200,
  },
  emptyText: { fontSize: 14, color: Colors.dark.textMuted, marginTop: Spacing.md },
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
  tabName: { fontSize: 12, color: Colors.dark.textMuted },
  tabNameActive: { color: Colors.dark.primary, fontWeight: "600" },
  addButton: {
    marginLeft: "auto",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  selectorContainer: { flex: 1 },
  selectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  selectorTitle: { fontSize: 16, fontWeight: "600", color: Colors.dark.text },
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
  playerSelectName: { fontSize: 14, fontWeight: "500", color: Colors.dark.text },
  playerAvatar: { backgroundColor: `${Colors.dark.primary}20` },
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
  avatarInitial: { fontSize: 16, fontWeight: "700", color: Colors.dark.primary },
  senderAvatarImage: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  reactionEmoji: { fontSize: 12 },
  reactionPickerEmoji: { fontSize: 18 },
  conversationAvatarWrap: { position: "relative" },
  conversationUnreadDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.dark.primary,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  conversationHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  conversationNameUnread: { fontWeight: "700" },
  conversationPreviewUnread: { color: Colors.dark.text },
  conversationTime: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginLeft: Spacing.sm,
  },
  restrictedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,188,212,0.10)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  restrictedText: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  // ── World tab + room view ──
  worldListContainer: { flex: 1 },
  browseRoomsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  browseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  browseTitle: { ...Typography.body, color: Colors.dark.text, fontWeight: "600" },
  browseSub: { ...Typography.caption, color: Colors.dark.textMuted, marginTop: 2 },
  worldRoomRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    gap: 12,
  },
  worldFlagBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.chipBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  worldFlagTxt: { fontSize: 22 },
  worldRoomTitle: { ...Typography.body, color: Colors.dark.text, fontWeight: "600" },
  worldRoomPreview: { ...Typography.caption, color: Colors.dark.textMuted, marginTop: 2 },
  worldRoomTime: { ...Typography.caption, color: Colors.dark.textMuted, marginLeft: 8 },
  browseEmptyBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
  },
  browseEmptyBtnTxt: { color: "#000", fontWeight: "700" },
  roomHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
    gap: Spacing.sm,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  roomHeaderCenter: { flex: 1, alignItems: "center" },
  roomHeaderTitle: { ...Typography.h3, color: Colors.dark.text },
  roomHeaderSub: { ...Typography.caption, color: Colors.dark.textMuted, marginTop: 2 },
  mutedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: "#7F1D1D",
  },
  mutedBannerText: { color: "#fff", fontSize: 12 },
  roomListContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTxt: { color: Colors.dark.textMuted, ...Typography.body },
  roomMessageRow: { flexDirection: "row", marginBottom: Spacing.md, gap: Spacing.sm },
  roomAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.chipBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  roomAvatarTxt: { fontSize: 18 },
  roomMessageBody: { flex: 1 },
  roomMessageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  roomSenderName: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
    maxWidth: "55%",
  },
  roomAcademyName: { ...Typography.caption, color: Colors.dark.textMuted, flex: 1 },
  pinnedBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  pinnedText: { fontSize: 11, color: "#FBBF24", fontWeight: "600" },
  roomMessageText: { ...Typography.body, color: Colors.dark.text },
  mentionText: { ...Typography.body, color: Colors.dark.primary, fontWeight: "600" },
  mentionDropdown: {
    position: "absolute",
    bottom: 60,
    left: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.md,
    maxHeight: 180,
    paddingVertical: 4,
  },
  mentionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mentionItemTxt: { color: Colors.dark.text, ...Typography.body, flex: 1 },
  mentionFriendBadge: {
    backgroundColor: Colors.dark.primary + "33",
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  mentionFriendBadgeTxt: { color: Colors.dark.primary, fontSize: 10, fontWeight: "700" },
  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingTop: 4,
  },
  pinToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.full,
    marginRight: 6,
  },
  pinToggleActive: { backgroundColor: "#FBBF2433", borderWidth: 1, borderColor: "#FBBF24" },
  pinToggleDisabled: { opacity: 0.55 },
  pinToggleTxt: { color: Colors.dark.textSecondary, fontSize: 12, fontWeight: "600" },
  pinToggleTxtActive: { color: "#FBBF24" },
  roomReactionsRow: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  roomReactionChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.chipBackground,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  roomReactionEmoji: { fontSize: 13 },
  roomReactionCount: { fontSize: 11, color: Colors.dark.text, fontWeight: "600" },
  inviteCard: {
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "55",
  },
  inviteHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  inviteTitle: { ...Typography.body, color: Colors.dark.text, fontWeight: "600" },
  inviteMeta: { ...Typography.caption, color: Colors.dark.textSecondary, marginTop: 2 },
  inviteBtn: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    marginTop: 10,
    alignItems: "center",
  },
  inviteBtnTxt: { ...Typography.body, color: "#000", fontWeight: "700" as const },
  roomComposer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.sm,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.chipBackground,
    gap: 6,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  roomActionBtn: { paddingHorizontal: 4, paddingVertical: 6 },
  roomInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    color: Colors.dark.text,
    ...Typography.body,
  },
  roomSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  roomSendBtnDisabled: { opacity: 0.4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.lg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 6,
  },
  modalTitle: { ...Typography.h3, color: Colors.dark.text, marginBottom: 8 },
  modalLabel: { ...Typography.caption, color: Colors.dark.textMuted, marginTop: 8 },
  modalInput: {
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.dark.text,
    ...Typography.body,
  },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  modalBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: BorderRadius.md },
  modalCancel: { backgroundColor: Colors.dark.chipBackground },
  modalCancelTxt: { color: Colors.dark.text, fontWeight: "600" },
  modalPost: { backgroundColor: Colors.dark.primary },
  modalPostTxt: { color: "#000", fontWeight: "700" },
  // Browse rooms modal
  browseContainer: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  browseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
  },
  browseHeaderTitle: { ...Typography.h3, color: Colors.dark.text },
  browseSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.chipBackground,
    margin: Spacing.lg,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
    gap: 8,
  },
  browseSearchInput: { flex: 1, color: Colors.dark.text, paddingVertical: 10, ...Typography.body },
  browseRoomRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    gap: Spacing.md,
  },
  browseSep: { height: 1, backgroundColor: Colors.dark.chipBackground, marginLeft: 72 },
  // Onboarding tooltip
  onboardingTooltip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.primary + "1A",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "44",
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
  },
  onboardingText: { flex: 1, color: Colors.dark.text, fontSize: 12, fontWeight: "500" },
}));
